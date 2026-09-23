import { createHash } from 'node:crypto';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getIdToken, inMemoryPersistence, initializeAuth, reload, signInWithEmailAndPassword } from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  collection, collectionGroup, connectFirestoreEmulator, deleteDoc, disableNetwork, doc, enableNetwork, getDocFromServer, getDocsFromServer, getFirestore, limit, query,
  increment, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch,
} from 'firebase/firestore';
import { IDBFactory } from 'fake-indexeddb';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelUnusedRegistration, ensureAccountActivity, removeCancelledRegistration } from '../src/cloud/account-lifecycle';
import { CloudStore, DeletionCleanupInterrupted, DeletionListPermissionPending } from '../src/cloud/cloud-store';
import { FriendStore } from '../src/cloud/friend-store';
import { FriendShelfStore } from '../src/cloud/friend-shelf-store';
import { FriendAllStore } from '../src/cloud/friend-all-store';
import { SocialStore } from '../src/cloud/social-store';
import { releaseIndexedPayload } from '../src/cloud/generation-cleanup';
import { ACCOUNT_LIMITS, AccountQuotaFull, quotaRef } from '../src/cloud/account-quota';
import { accountScope, CHUNK_BYTES, creatorRanks, MAX_CHUNKS, MAX_SNAPSHOT_BYTES } from '../src/lib/cloud-types';
import type { AvatarValue, PublicEntry, PublicProfile } from '../src/lib/community';
import { FriendManagerFeed } from '../src/lib/friend-manager-feed';
import { visibleFriendPairs } from '../src/lib/friend-manager';
import { accountStorageTransaction, closePersonalLibrary, commitPersonalAction, loadPersonalLibrary } from '../src/lib/personal-db';
import { applyPersonalAction, emptyPersonalLibrary } from '../src/lib/personal-library';
import type { LibraryRecord } from '../src/lib/personal-types';
import { commitScopedAction, loadScopedLibrary } from '../src/lib/scoped-library';
import { packLibrary, packSnapshot, parseManifest } from '../src/lib/snapshot-transport';
import { candidateRules, live270fRules, migrationEmulators } from './fixtures/migration-rules';

const avatar: AvatarValue = { version: 1, seed: 'b'.repeat(32), palette: 'moss' };
const entry: PublicEntry = {
  position: 1, id: 'wikidata:Q123', title: 'Migration fixture', year: 2020,
  source: 'wikidata', sourceId: 'Q123', sourceUrl: 'https://www.wikidata.org/wiki/Q123', score: 7,
};
const game: LibraryRecord = {
  id: entry.id, title: entry.title, source: entry.source, sourceId: entry.sourceId, sourceUrl: entry.sourceUrl,
  year: entry.year, studio: null, genre: null, collectionRank: null,
};
const password = 'Emulator-only-passphrase-4382';
const initialControl = { epoch: 0, hidden: false, deleted: false };
const aged = () => Timestamp.fromMillis(Date.now() - 10 * 60 * 1000);
const publication = (handle: string) => ({
  handle, displayName: 'Published migration name', avatar, title: 'Migration ranking', listed: false, creator: false, entries: [entry],
});

for (const policy of ['live-270f', 'candidate'] as const) describe(`real-client S3 migration under ${policy} rules`, () => {
  let environment: RulesTestEnvironment;
  const apps: FirebaseApp[] = [];
  const endpoints = migrationEmulators();
  const firestore = (rules: string) => ({ host: endpoints.host, port: endpoints.port, rules });

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: endpoints.projectId, firestore: firestore(policy === 'live-270f' ? live270fRules() : candidateRules()),
    });
  });
  beforeEach(async () => {
    await environment.clearFirestore();
    await seed({ '_owner/config': { uid: 'MigrationOwner', email: 'migration-owner@example.test' } });
  });
  afterEach(async () => {
    closePersonalLibrary();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await Promise.all(apps.splice(0).map(app => deleteApp(app)));
  });
  afterAll(async () => {
    try { await environment?.cleanup(); }
    finally {
      if (policy === 'live-270f') {
        const restored = await initializeTestEnvironment({ projectId: endpoints.projectId, firestore: firestore(candidateRules()) });
        await restored.cleanup();
      }
    }
  });

  function session() {
    const app = initializeApp({ apiKey: 'demo-play100-key', projectId: endpoints.projectId }, crypto.randomUUID());
    apps.push(app);
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    connectAuthEmulator(auth, endpoints.authOrigin, { disableWarnings: true });
    const db = getFirestore(app);
    connectFirestoreEmulator(db, endpoints.host, endpoints.port);
    return { auth, db, social: new SocialStore(db), friends: new FriendStore(db) };
  }
  async function verify(user: User) {
    const response = await fetch(`${endpoints.authOrigin}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-play100-key`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ localId: user.uid, emailVerified: true }),
    });
    if (!response.ok) throw new Error('The local migration Auth actor could not be verified.');
    await reload(user);
    await getIdToken(user, true);
  }
  async function actor(verified = true) {
    const client = session();
    const email = `migration-${crypto.randomUUID()}@example.test`;
    const user = (await createUserWithEmailAndPassword(client.auth, email, password)).user;
    if (verified) {
      await verify(user);
      await client.social.saveMember(user.uid, 'Private migration name', avatar);
    }
    return { ...client, user, uid: user.uid, email, cloud: new CloudStore(client.db, user.uid) };
  }
  async function seed(entries: Record<string, object>) {
    await environment.withSecurityRulesDisabled(async context => {
      const batch = context.firestore().batch();
      for (const [path, value] of Object.entries(entries)) batch.set(context.firestore().doc(path), value);
      await batch.commit();
    });
  }
  async function stored(path: string): Promise<Record<string, unknown> | undefined> {
    let value: Record<string, unknown> | undefined;
    await environment.withSecurityRulesDisabled(async context => {
      value = (await context.firestore().doc(path).get()).data();
    });
    return value;
  }

  it('publishes, renames and reports through the new client, selecting legacy allocation only on registry permission-denied', async () => {
    const owner = await actor(); const reporter = await actor(); const guest = session();
    const registry = doc(owner.db, 'publicProfiles', owner.uid, 'metadata', 'registry');
    if (policy === 'live-270f') await expect(getDocFromServer(registry)).rejects.toMatchObject({ code: 'permission-denied' });
    else expect((await getDocFromServer(registry)).exists()).toBe(false);
    const info = vi.spyOn(console, 'info');
    const first = await owner.social.publish(owner.uid, publication('migration_first'), initialControl);
    expect(await guest.social.entries(first)).toEqual([entry]);
    const next = await owner.social.publish(owner.uid, publication('migration_renamed'), await owner.social.control(owner.uid));
    expect(next.generation).not.toBe(first.generation);
    expect((await getDocFromServer(doc(owner.db, 'handles', first.handle))).exists()).toBe(false);
    expect((await guest.social.profile(next.handle))?.uid).toBe(owner.uid);
    await reporter.social.report(reporter.uid, owner.uid, 'Synthetic migration report');
    expect((await getDocFromServer(doc(reporter.db, 'reports', `${owner.uid}_${reporter.uid}`))).data())
      .toMatchObject({ reporterUid: reporter.uid, targetUid: owner.uid, reason: 'Synthetic migration report', status: 'open' });
    const fallback = info.mock.calls.filter(([message]) =>
      message === 'Publication quota controls are not yet available; using the legacy client-first publication path.');
    if (policy === 'live-270f') {
      expect(fallback).toHaveLength(2);
      expect(await stored(`publicProfiles/${owner.uid}/metadata/registry`)).toBeUndefined();
    } else {
      expect(fallback).toEqual([]);
      expect((await getDocFromServer(registry)).data()?.ids).toEqual([first.generation, next.generation]);
    }
  });

  it('removes an actually verified cancelled Auth identity and only its device copy without calling content cleanup', async () => {
    const owner = await actor(false);
    await cancelUnusedRegistration(owner.db, owner.uid);
    await verify(owner.user);
    await expect(ensureAccountActivity(owner.db, owner.uid)).rejects.toThrow(/cancelled registration.*same email/);
    closePersonalLibrary();
    vi.stubGlobal('indexedDB', new IDBFactory());
    const hints = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => hints.get(key) ?? null,
      setItem: (key: string, value: string) => { hints.set(key, value); },
      removeItem: (key: string) => { hints.delete(key); },
    });
    const scope = accountScope(owner.uid, endpoints.projectId);
    const otherScope = accountScope('untouched-peer', endpoints.projectId);
    await loadPersonalLibrary([game]);
    const guest = await commitPersonalAction({ type: 'rate-game', record: game, score: 9 });
    const other = await commitScopedAction(otherScope, { type: 'rate-game', record: game, score: 8 });
    await commitScopedAction(scope, { type: 'rate-game', record: game, score: 7 });
    const removeIdentity = vi.spyOn(owner.user, 'delete');
    const privateCleanup = vi.spyOn(CloudStore.prototype, 'cleanup');
    const publicCleanup = vi.spyOn(SocialStore.prototype, 'cleanup');
    const friendCleanup = vi.spyOn(FriendStore.prototype, 'cleanupSharing');
    expect(await removeCancelledRegistration(owner.db, owner.user, scope, () => owner.auth.currentUser?.uid === owner.uid)).toBe(true);
    expect(removeIdentity).toHaveBeenCalledOnce();
    expect(privateCleanup).not.toHaveBeenCalled();
    expect(publicCleanup).not.toHaveBeenCalled();
    expect(friendCleanup).not.toHaveBeenCalled();
    expect(owner.auth.currentUser).toBeNull();
    expect(await accountStorageTransaction(scope, value => value)).toBeUndefined();
    expect((await loadPersonalLibrary([game])).state).toEqual(guest);
    expect(await loadScopedLibrary(otherScope)).toEqual(other);
    expect(await stored(`accountLifecycle/${owner.uid}`)).toEqual({ state: 'cancelled' });
    for (const collection of ['members', 'syncHeads', 'publicControls', 'friendSettings']) {
      expect(await stored(`${collection}/${owner.uid}`)).toBeUndefined();
    }
    const replacement = (await createUserWithEmailAndPassword(owner.auth, owner.email, password)).user;
    expect(replacement.uid).not.toBe(owner.uid);
  });

  it('uses a real outgoing manager feed to select the published name, not the separately readable private identity', async () => {
    const sender = await actor(); const recipient = await actor();
    for (const person of [sender, recipient]) {
      await person.friends.initialize(person.uid);
      await person.friends.saveIdentity(person.uid, { displayName: 'Private friend-only name', avatar }, 0);
    }
    await recipient.social.publish(recipient.uid, publication('migration_recipient'), initialControl);
    const pending = await sender.friends.sendRequest(sender.uid, recipient.uid);
    if (policy === 'live-270f') expect((await sender.friends.identity(recipient.uid))?.displayName).toBe('Private friend-only name');
    else await expect(sender.friends.identity(recipient.uid)).rejects.toMatchObject({ code: 'permission-denied' });
    const privateRead = vi.spyOn(sender.friends, 'identity');
    const publicRead = vi.spyOn(sender.friends, 'publicIdentity');
    const feed = new FriendManagerFeed(sender.friends, sender.uid, 'pending', () => true);
    try {
      feed.start();
      await vi.waitFor(() => {
        expect(feed.getSnapshot().error).toBeNull();
        expect(feed.getSnapshot().identities[recipient.uid]).toMatchObject({
          status: 'ready', value: { uid: recipient.uid, displayName: 'Published migration name', avatar },
        });
      }, { timeout: 10000 });
      expect(publicRead).toHaveBeenCalledWith(recipient.uid);
      expect(privateRead).not.toHaveBeenCalled();
      const snapshot = feed.getSnapshot();
      expect(visibleFriendPairs(snapshot.pairs, snapshot.identities, sender.uid, { view: 'sent', name: 'Published migration', order: 'name' }))
        .toEqual([pending]);
    } finally { feed.stop(); }
  });

  it('maps the real denied-or-missing profile get to null through the UI read method, without granting a guest read', async () => {
    const guest = session();
    const uid = `Missing-${crypto.randomUUID()}`;
    const ref = doc(guest.db, 'publicProfiles', uid);
    if (policy === 'live-270f') expect((await getDocFromServer(ref)).exists()).toBe(false);
    else await expect(getDocFromServer(ref)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await guest.social.ownProfile(uid)).toBeNull();
    expect(await guest.friends.publicIdentity(uid)).toBeNull();
  });

  it('cleans all four generation stores with one legacy-order fallback per retired generation only on old rules', async () => {
    const owner = await actor();
    const info = vi.spyOn(console, 'info');
    const head = await owner.cloud.enable(null);
    const state = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 3 });
    await expect(owner.cloud.upload(state, head, async () => {
      throw new Error('Leave a real partial private upload.');
    })).rejects.toThrow('Leave a real partial private upload');
    const privateRegistry = doc(owner.db, 'accounts', owner.uid, 'metadata', 'registry');
    const privateId = (await getDocFromServer(privateRegistry)).data()?.ids[0];
    if (typeof privateId !== 'string') throw new Error('The private staging fixture is missing.');
    await updateDoc(doc(owner.db, 'accounts', owner.uid, 'generations', privateId), { status: 'deleting' });
    expect(await owner.cloud.cleanup()).toBe(1);
    expect((await getDocFromServer(privateRegistry)).data()?.ids).toEqual([]);

    await expect(owner.social.publish(owner.uid, publication('migration_cleanup'), initialControl, async () => {
      throw new Error('Leave a real unpublished public upload.');
    })).rejects.toThrow('Leave a real unpublished public upload');
    expect(await owner.social.cleanup(owner.uid, true)).toBe(1);

    await owner.friends.initialize(owner.uid);
    const initial = await owner.friends.settings(owner.uid);
    if (!initial) throw new Error('Friend settings are missing.');
    const selected = await owner.friends.saveSettings(owner.uid, { enabled: true, selectedIds: [entry.id] }, initial);
    await owner.friends.publishRanking(owner.uid, [entry], selected, { syncEpoch: head.epoch, remoteRevision: head.revision }, 0);
    await owner.friends.saveSettings(owner.uid, { enabled: false, selectedIds: [] }, selected);
    expect(await owner.friends.cleanupSharing(owner.uid)).toBe(1);
    expect((await getDocFromServer(doc(owner.db, 'friendShareRegistry', owner.uid))).data()?.ids).toEqual([]);

    const shelf = new FriendShelfStore(owner.db);
    const selectedShelf = await shelf.saveConfig(owner.uid, {
      enabled: true, selectedIds: [entry.id], consentSyncEpoch: head.epoch,
    }, await shelf.initialize(owner.uid));
    await shelf.publish(owner.uid, [{
      id: entry.id, title: entry.title, year: entry.year, source: entry.source, sourceId: entry.sourceId, sourceUrl: entry.sourceUrl,
    }], selectedShelf, { syncEpoch: head.epoch, remoteRevision: head.revision }, 0, () => true);
    await shelf.saveConfig(owner.uid, { enabled: false, selectedIds: [], consentSyncEpoch: null }, selectedShelf);
    expect(await shelf.cleanupSharing(owner.uid)).toBe(1);
    expect((await getDocFromServer(doc(owner.db, 'friendShelfRegistry', owner.uid))).data()?.ids).toEqual([]);
    expect(info.mock.calls.filter(([message]) =>
      message === 'Payload release counters are not yet available; using the legacy cleanup order once.')).toHaveLength(policy === 'live-270f' ? 4 : 0);
  }, 60000);

  it('requires deletion-mode LIST permission before deleting any private payload, never falling back to registry-only account removal', async () => {
    const owner = await actor();
    const state = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 6 });
    const saved = await owner.cloud.upload(state, await owner.cloud.enable(null));
    const deleting = await owner.cloud.revoke(saved, true);
    const options = { expectedDeletionEpoch: deleting.epoch };
    if (policy === 'live-270f') {
      const pending = owner.cloud.cleanup(true, options);
      await expect(pending).rejects.toBeInstanceOf(DeletionListPermissionPending);
      await expect(pending).rejects.toThrow('Nothing has been deleted yet');
      expect(await owner.cloud.probeDeletedCopy()).toBe('unknown');
      for (const digest of saved.current!.chunks) expect(await stored(`accounts/${owner.uid}/chunks/${digest}`)).toBeDefined();
      expect(await stored(`accounts/${owner.uid}/generations/${saved.current!.generation}`)).toBeDefined();
      expect(owner.auth.currentUser?.uid).toBe(owner.uid);
    } else {
      expect(await owner.cloud.cleanup(true, options)).toBe(1);
      expect((await getDocFromServer(doc(owner.db, 'accounts', owner.uid, 'metadata', 'registry'))).exists()).toBe(false);
      expect(await owner.cloud.probeDeletedCopy()).toBe('unknown');
    }
  });

  it('uses counted All sharing when supported and tries the old begin only once per attempt on old rules', async () => {
    const owner = await actor();
    await owner.cloud.enable(null);
    const all = new FriendAllStore(owner.db);
    const control = await all.setPolicy(owner.uid, true, 'default', await all.controls(owner.uid), () => true);
    if (!control) throw new Error('The sharing policy is missing.');
    const info = vi.spyOn(console, 'info');
    const rows = [{ id: entry.id, title: entry.title, year: entry.year, source: entry.source, sourceId: entry.sourceId, sourceUrl: entry.sourceUrl }];
    const first = await all.publish(owner.uid, 'games', rows, control, { syncEpoch: 1, remoteRevision: 0 }, () => true);
    expect(first.format).toBe(policy === 'candidate' ? 3 : 2);
    await all.publish(owner.uid, 'games', rows.map(row => ({ ...row, title: 'Changed shared title' })), control, { syncEpoch: 1, remoteRevision: 0 }, () => true);
    expect(info.mock.calls.filter(([message]) => message === 'Counted friend sharing is not available yet; trying the legacy begin once.'))
      .toHaveLength(policy === 'live-270f' ? 2 : 0);
    const ref = doc(owner.db, 'friendAllJobs', owner.uid, 'views', 'games');
    expect((await getDocFromServer(ref)).data()).toMatchObject({ format: policy === 'candidate' ? 3 : 2, count: 1 });
  });

  it('revokes invitation links with a bounded legacy fallback and no unavailable-token existence distinction', async () => {
    const owner = await actor();
    await owner.friends.initialize(owner.uid);
    await owner.friends.saveIdentity(owner.uid, { displayName: 'Invitation fixture', avatar }, 0);
    const invite = await owner.friends.createInvite(owner.uid);
    await owner.friends.revokeInvite(owner.uid, invite.token);
    const raw = await stored(`friendInvites/${invite.token}`);
    if (policy === 'candidate') expect(raw).toBeUndefined();
    else expect(raw?.state).toBe('revoked');
    const guest = session();
    for (const token of [invite.token, 'f'.repeat(64)]) {
      await expect(guest.friends.previewInvite(token)).rejects.toMatchObject({ code: 'invite-unavailable', message: 'This invite is no longer available.' });
    }
  });

  it('creates and removes groups and blocks with the declared old-rule compatibility path', async () => {
    const owner = await actor(); const target = await actor();
    await owner.friends.initialize(owner.uid);
    const group = await owner.friends.saveGroup(owner.uid, { name: 'Bounded group', participantUids: [owner.uid, target.uid] }, 0);
    await owner.friends.block(owner.uid, target.uid);
    await owner.friends.unblock(owner.uid, target.uid);
    await owner.friends.deleteGroup(owner.uid, group.id, group.revision);
    if (policy === 'candidate') {
      expect((await getDocFromServer(quotaRef(owner.db, owner.uid, 'groups'))).data()?.ids).toEqual([]);
      expect((await getDocFromServer(quotaRef(owner.db, owner.uid, 'blocks'))).data()?.ids).toEqual([]);
    } else {
      expect(await stored(`accountQuotas/${owner.uid}/limits/groups`)).toBeUndefined();
      expect(await stored(`accountQuotas/${owner.uid}/limits/blocks`)).toBeUndefined();
    }
  });

  it('removes group and block quota records at full social deletion without breaking the old-rule path', async () => {
    const owner = await actor(); const target = await actor();
    await owner.friends.initialize(owner.uid);
    await owner.friends.saveGroup(owner.uid, { name: 'Removed on deletion', participantUids: [owner.uid, target.uid] }, 0);
    await owner.friends.block(owner.uid, target.uid);
    await owner.friends.revokeForDeletion(owner.uid);
    expect((await owner.friends.cleanupDeleted(owner.uid)).done).toBe(true);
    expect(await stored(`accountQuotas/${owner.uid}/limits/groups`)).toBeUndefined();
    expect(await stored(`accountQuotas/${owner.uid}/limits/blocks`)).toBeUndefined();
    expect((await owner.friends.cleanupDeleted(owner.uid)).done).toBe(true);
  });

  if (policy === 'candidate') {
    it('does not declare completion while a group quota record still refers to a missing item', async () => {
      const owner = await actor();
      await owner.friends.initialize(owner.uid);
      await owner.friends.revokeForDeletion(owner.uid);
      await seed({ [`accountQuotas/${owner.uid}/limits/groups`]: { ids: [crypto.randomUUID()], revision: 1 } });
      expect(await owner.friends.cleanupDeleted(owner.uid)).toMatchObject({
        done: false, message: 'Some account settings could not be removed. Try deleting again later.',
      });
    });

    it.each(['groups', 'blocks'] as const)('enforces the %s registry cap and a visible product cap including frozen legacy records', async kind => {
      const owner = await actor();
      await owner.friends.initialize(owner.uid);
      const cap = ACCOUNT_LIMITS[kind];
      const ids = Array.from({ length: cap }, (_, index) => kind === 'groups' ? crypto.randomUUID() : `Blocked-${index}`);
      const path = (id: string) => `${kind === 'groups' ? 'friendGroups' : 'friendBlocks'}/${owner.uid}/items/${id}`;
      const value = (createdAt: Timestamp | ReturnType<typeof serverTimestamp>) => kind === 'groups'
        ? { format: 1, name: 'Saved group', participantUids: [owner.uid, 'KnownPeer'], revision: 1, createdAt, updatedAt: createdAt }
        : { createdAt };
      for (let start = 0; start < ids.length; start += 400) {
        await seed(Object.fromEntries(ids.slice(start, start + 400).map(id => [path(id), value(aged())])));
      }
      const quota = quotaRef(owner.db, owner.uid, kind);
      await seed({ [quota.path]: { ids, revision: 1 } });
      const nextId = kind === 'groups' ? crypto.randomUUID() : 'AnotherBlocked';
      await assertFails(setDoc(doc(owner.db, path(nextId)), value(serverTimestamp())));
      const over = writeBatch(owner.db);
      over.set(doc(owner.db, path(nextId)), value(serverTimestamp()));
      over.update(quota, { ids: [...ids, nextId], revision: 2 });
      await assertFails(over.commit());
      await assertFails(deleteDoc(doc(owner.db, path(ids[0]!))));
      await assertFails(updateDoc(quota, { ids: ids.slice(1), revision: 2 }));
      if (kind === 'groups') await owner.friends.deleteGroup(owner.uid, ids[0]!, 1);
      else await owner.friends.unblock(owner.uid, ids[0]!);
      expect((await getDocFromServer(quota)).data()?.ids).toHaveLength(cap - 1);
      const legacyId = kind === 'groups' ? crypto.randomUUID() : 'LegacyBlocked';
      const legacyRef = doc(owner.db, path(legacyId));
      await seed({ [legacyRef.path]: value(aged()) });
      expect((await getDocFromServer(legacyRef)).exists()).toBe(true);
      if (kind === 'groups') {
        await updateDoc(legacyRef, { name: 'Legacy edit stays unenrolled', revision: 2, updatedAt: serverTimestamp() });
        expect((await getDocFromServer(quota)).data()?.ids).not.toContain(legacyId);
        await expect(owner.friends.saveGroup(owner.uid, { name: 'Beyond product cap', participantUids: [owner.uid, 'KnownPeer'] }, 0)).rejects.toBeInstanceOf(AccountQuotaFull);
        await owner.friends.deleteGroup(owner.uid, legacyId, 2);
        const added = await owner.friends.saveGroup(owner.uid, { name: 'One free slot', participantUids: [owner.uid, 'KnownPeer'] }, 0);
        expect((await owner.friends.saveGroup(owner.uid, { id: added.id, name: 'Enrolled edit', participantUids: added.participantUids }, added.revision)).name).toBe('Enrolled edit');
      } else {
        await assertFails(updateDoc(legacyRef, { createdAt: serverTimestamp() }));
        await expect(owner.friends.block(owner.uid, nextId)).rejects.toBeInstanceOf(AccountQuotaFull);
        await owner.friends.unblock(owner.uid, legacyId);
        await owner.friends.block(owner.uid, nextId);
      }
      expect((await getDocFromServer(quota)).data()?.ids).toHaveLength(cap);
    }, 120000);

    it('bounds reports and releases a creator-resolved slot only with the exact counted report deletion', async () => {
      const owner = await actor(); const moderator = await actor();
      await seed({ '_owner/config': { uid: moderator.uid, email: moderator.email } });
      const reports = Array.from({ length: ACCOUNT_LIMITS.reports }, (_, index) => `Target${index}_${owner.uid}`);
      const quota = quotaRef(owner.db, owner.uid, 'reports');
      await seed({
        ...Object.fromEntries(reports.map((id, index) => [`reports/${id}`, {
          reporterUid: owner.uid, targetUid: `Target${index}`, reason: 'Synthetic registered report', status: 'open', counted: true, createdAt: aged(),
        }])),
        [quota.path]: { count: reports.length, revision: 1, lastReport: reports.at(-1) },
        'publicProfiles/NewReportTarget': { uid: 'NewReportTarget', published: true, hidden: false },
      });
      const id = `NewReportTarget_${owner.uid}`;
      const ref = doc(owner.db, 'reports', id);
      const report = { reporterUid: owner.uid, targetUid: 'NewReportTarget', reason: 'At cap', status: 'open', counted: true, createdAt: serverTimestamp() };
      await assertFails(setDoc(ref, report));
      const over = writeBatch(owner.db);
      over.set(ref, report);
      over.update(quota, { count: 101, revision: 2, lastReport: id });
      await assertFails(over.commit());
      await assertFails(deleteDoc(doc(owner.db, 'reports', reports[0]!)));
      await assertFails(updateDoc(quota, { count: increment(-1), revision: increment(1), lastReport: reports[0] }));
      await assertFails(getDocFromServer(quotaRef(moderator.db, owner.uid, 'reports')));
      expect(await moderator.social.resolveReport(reports[0]!)).toBe(true);
      expect((await getDocFromServer(quota)).data()?.count).toBe(99);
      await assertFails(updateDoc(quota, { count: increment(-1), revision: increment(1), lastReport: reports[0] }));
      const legacyId = `LegacyTarget_${owner.uid}`;
      await seed({ [`reports/${legacyId}`]: { reporterUid: owner.uid, targetUid: 'LegacyTarget', reason: 'Legacy report', status: 'open', createdAt: aged() } });
      await expect(owner.social.report(owner.uid, 'NewReportTarget', 'Wait for review')).rejects.toBeInstanceOf(AccountQuotaFull);
      expect(await moderator.social.resolveReport(legacyId)).toBe(true);
      expect((await getDocFromServer(quota)).data()?.count).toBe(99);
      await owner.social.report(owner.uid, 'NewReportTarget', 'One free report slot');
      expect((await getDocFromServer(quota)).data()?.count).toBe(100);
      await assertFails(owner.social.withdrawReport(id));
      await owner.cloud.revoke(await owner.cloud.head(), true);
      await owner.social.withdrawReport(id);
      expect((await getDocFromServer(quota)).data()?.count).toBe(99);
    });

    it('does not count one hundred resolved legacy reports as open reporting capacity', async () => {
      const owner = await actor();
      await seed({
        ...Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`reports/Resolved${index}_${owner.uid}`, {
          reporterUid: owner.uid, targetUid: `Resolved${index}`, reason: 'Previously reviewed', status: 'resolved', createdAt: aged(),
        }])),
        'publicProfiles/AfterReview': { uid: 'AfterReview', published: true, hidden: false },
      });
      await owner.social.report(owner.uid, 'AfterReview', 'This new report is open.');
      expect((await getDocFromServer(quotaRef(owner.db, owner.uid, 'reports'))).data()?.count).toBe(1);
    });

    it('allows only an owner completion marker on the same deleted epoch and keeps ordinary head writes from changing it', async () => {
      const owner = await actor(); const other = await actor(); const fresh = await actor();
      const ref = doc(owner.db, 'syncHeads', owner.uid);
      const base = await owner.cloud.enable(null);
      await assertFails(updateDoc(ref, { cleanupEpoch: base.epoch }));
      await assertFails(setDoc(doc(fresh.db, 'syncHeads', fresh.uid), {
        format: 1, epoch: 1, revision: 0, enabled: false, deleted: true, current: null, previous: null,
        updatedAt: serverTimestamp(), cleanupEpoch: 1,
      }));
      const deleting = await owner.cloud.revoke(base, true);
      await assertFails(updateDoc(doc(other.db, 'syncHeads', owner.uid), { cleanupEpoch: deleting.epoch }));
      for (const cleanupEpoch of [deleting.epoch - 1, deleting.epoch + 1, String(deleting.epoch)]) {
        await assertFails(updateDoc(ref, { cleanupEpoch }));
      }
      await assertFails(updateDoc(ref, { cleanupEpoch: deleting.epoch, unexpected: true }));
      await assertFails(updateDoc(ref, {
        cleanupEpoch: deleting.epoch, epoch: deleting.epoch + 1, revision: deleting.revision + 1, updatedAt: serverTimestamp(),
      }));
      const marked = await owner.cloud.markCleanupComplete(deleting.epoch, () => true);
      expect(marked.cleanupEpoch).toBe(deleting.epoch);
      expect(await owner.cloud.probeDeletedCopy(marked)).toBe('complete');
      await assertFails(updateDoc(ref, {
        enabled: true, deleted: false, epoch: deleting.epoch + 1, revision: deleting.revision + 1,
        cleanupEpoch: deleting.epoch + 1, updatedAt: serverTimestamp(),
      }));
      await seed({ [ref.path]: { ...marked, updatedAt: Timestamp.fromMillis(1) } });
      const resumed = await owner.cloud.enable(await owner.cloud.head());
      expect(resumed).toMatchObject({ deleted: false, cleanupEpoch: deleting.epoch, epoch: deleting.epoch + 1 });
      await expect(owner.cloud.markCleanupComplete(deleting.epoch, () => true)).rejects.toThrow(/changed/);
      const repeated = await owner.cloud.revoke(resumed, true);
      expect(repeated.cleanupEpoch).toBe(deleting.epoch);
      expect(repeated.epoch).toBe(deleting.epoch + 2);
      expect(await owner.cloud.probeDeletedCopy(repeated)).not.toBe('complete');
      await assertFails(updateDoc(ref, { cleanupEpoch: deleting.epoch }));
    });

    it('keeps legacy All rows readable to their owner but frozen, and counts physical format3 rows across epochs', async () => {
      const owner = await actor();
      await owner.cloud.enable(null);
      const all = new FriendAllStore(owner.db);
      const policy = await all.setPolicy(owner.uid, true, 'default', await all.controls(owner.uid), () => true);
      if (!policy) throw new Error('The sharing policy is missing.');
      const legacyRef = doc(owner.db, 'friendAllGames', owner.uid, 'entries', 'manual:legacy');
      const legacy = { format: 2, epoch: 1, token: crypto.randomUUID(), step: 1, active: false, entry: null };
      await seed({ [legacyRef.path]: legacy });
      expect((await getDocFromServer(legacyRef)).data()).toEqual(legacy);
      await assertFails(setDoc(legacyRef, { ...legacy, step: 2 }));
      await assertFails(setDoc(doc(owner.db, 'friendAllGames', owner.uid, 'entries', 'manual:unregistered'), legacy));
      await deleteDoc(legacyRef);
      const rows = [{ id: entry.id, title: entry.title, year: entry.year, source: entry.source, sourceId: entry.sourceId, sourceUrl: entry.sourceUrl }];
      await all.publish(owner.uid, 'games', rows, policy, { syncEpoch: 1, remoteRevision: 0 }, () => true);
      const jobRef = doc(owner.db, 'friendAllJobs', owner.uid, 'views', 'games');
      const rowRef = doc(owner.db, 'friendAllGames', owner.uid, 'entries', entry.id);
      const stopped = await all.setPolicy(owner.uid, false, 'explicit', await all.controls(owner.uid), () => true);
      expect(stopped?.epoch).toBeGreaterThan(policy.epoch);
      expect((await getDocFromServer(jobRef)).data()?.count).toBe(1);
      await assertFails(deleteDoc(jobRef));
      await assertFails(deleteDoc(rowRef));
      await assertFails(updateDoc(jobRef, { count: 0, last: [entry.id], updatedAt: serverTimestamp() }));
      expect(await all.cleanupPage(owner.uid, 'games')).toMatchObject({ deleted: 1, done: false });
      expect((await getDocFromServer(jobRef)).data()?.count).toBe(0);
      expect((await getDocFromServer(rowRef)).exists()).toBe(false);
      expect(await all.cleanupPage(owner.uid, 'games')).toMatchObject({ done: true });
      const resumed = await all.setPolicy(owner.uid, true, 'explicit', await all.controls(owner.uid), () => true);
      if (!resumed) throw new Error('The resumed policy is missing.');
      expect((await all.publish(owner.uid, 'games', rows, resumed, { syncEpoch: 1, remoteRevision: 0 }, () => true)).count).toBe(1);
    });

    it('cleans ten old public entries in three-position steps while another generation remains live and published', async () => {
      const owner = await actor(); const guest = session();
      await owner.cloud.enable(null);
      const rows = Array.from({ length: 10 }, (_, index): PublicEntry => ({
        ...entry, position: index + 1, id: `wikidata:Q${index + 1}`, sourceId: `Q${index + 1}`, sourceUrl: `https://www.wikidata.org/wiki/Q${index + 1}`,
      }));
      const first = await owner.social.publish(owner.uid, { ...publication('live_cleanup'), entries: rows }, initialControl);
      const current = await owner.social.publish(owner.uid, publication('live_cleanup'), await owner.social.control(owner.uid));
      expect((await owner.social.ownProfile(owner.uid))?.generation).toBe(current.generation);
      const oldRef = doc(owner.db, 'publicProfiles', owner.uid, 'generations', first.generation);
      const countdown: number[] = [];
      expect(await owner.social.cleanup(owner.uid, true, async () => {
        const uploaded: unknown = (await getDocFromServer(oldRef)).data()?.uploaded;
        if (typeof uploaded !== 'number') throw new Error('The old generation lost its countdown before metadata removal.');
        countdown.push(uploaded);
      })).toBe(1);
      expect(countdown).toEqual([7, 4, 1, 0]);
      expect((await getDocFromServer(oldRef)).exists()).toBe(false);
      expect((await getDocsFromServer(query(collection(oldRef, 'entries'), limit(200)))).empty).toBe(true);
      expect((await owner.social.ownProfile(owner.uid))?.published).toBe(true);
      expect((await owner.social.ownProfile(owner.uid))?.generation).toBe(current.generation);
      expect(await guest.social.entries(current)).toEqual([entry]);
      expect((await getDocFromServer(doc(owner.db, 'publicProfiles', owner.uid, 'metadata', 'registry'))).data()?.ids).toEqual([current.generation]);
    });

    it('allows only deletion-mode owner chunk lists of at most twenty, never peers, guests or collection-group scans', async () => {
      const owner = await actor(); const other = await actor(); const guest = session();
      const head = await owner.cloud.enable(null);
      for (const kind of ['accounts', 'creatorRanks']) {
        await expect(getDocsFromServer(query(collection(owner.db, kind, owner.uid, 'chunks'), limit(20))))
          .rejects.toMatchObject({ code: 'permission-denied' });
      }
      const deleting = await owner.cloud.revoke(head, true);
      for (const kind of ['accounts', 'creatorRanks']) {
        expect((await getDocsFromServer(query(collection(owner.db, kind, owner.uid, 'chunks'), limit(20)))).empty).toBe(true);
        for (const client of [other, guest]) {
          await expect(getDocsFromServer(query(collection(client.db, kind, owner.uid, 'chunks'), limit(20))))
            .rejects.toMatchObject({ code: 'permission-denied' });
        }
        await expect(getDocsFromServer(query(collection(owner.db, kind, owner.uid, 'chunks'), limit(21))))
          .rejects.toMatchObject({ code: 'permission-denied' });
        await expect(getDocsFromServer(collection(owner.db, kind, owner.uid, 'chunks')))
          .rejects.toMatchObject({ code: 'permission-denied' });
      }
      await expect(getDocsFromServer(query(collectionGroup(owner.db, 'chunks'), limit(20))))
        .rejects.toMatchObject({ code: 'permission-denied' });
      await seed({ [`syncHeads/${owner.uid}`]: { ...deleting, deleted: false, enabled: true, epoch: deleting.epoch + 1, updatedAt: Timestamp.now() } });
      for (const kind of ['accounts', 'creatorRanks']) {
        await expect(getDocsFromServer(query(collection(owner.db, kind, owner.uid, 'chunks'), limit(20))))
          .rejects.toMatchObject({ code: 'permission-denied' });
      }
    });

    it('pauses on a real network interruption after confirmed deletion and resumes orphan discovery with a fresh signed-in client', async () => {
      const owner = await actor();
      const state = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 6 });
      const saved = await owner.cloud.upload(state, await owner.cloud.enable(null));
      const orphanGeneration = crypto.randomUUID();
      const entries: Record<string, object> = {};
      for (let index = 0; index < 41; index += 1) {
        const chunk = (await packSnapshot({ orphan: index })).chunks[0]!;
        entries[`accounts/${owner.uid}/chunks/${chunk.digest}`] = { ...chunk, holders: [orphanGeneration], holder: orphanGeneration, createdAt: aged() };
        if (index < 3) entries[`creatorRanks/${owner.uid}/chunks/${chunk.digest}`] = { ...chunk, holders: [orphanGeneration], holder: orphanGeneration, createdAt: aged() };
      }
      await seed(entries);
      const deleting = await owner.cloud.revoke(saved, true);
      expect(await owner.cloud.probeDeletedCopy()).toBe('incomplete');
      await expect(owner.cloud.cleanup(true, {
        expectedDeletionEpoch: deleting.epoch,
        onProgress: async ({ confirmed }) => { if (confirmed === 20) await disableNetwork(owner.db); },
      })).rejects.toMatchObject({ name: 'DeletionCleanupInterrupted', confirmed: 20, cause: { code: 'unavailable' } });
      expect(await stored(`accounts/${owner.uid}/generations/${saved.current!.generation}`)).toBeDefined();
      expect(owner.auth.currentUser?.uid).toBe(owner.uid);
      await enableNetwork(owner.db);
      const fresh = session();
      await signInWithEmailAndPassword(fresh.auth, owner.email, password);
      const resumed = new CloudStore(fresh.db, owner.uid);
      expect(await resumed.cleanup(true, { expectedDeletionEpoch: deleting.epoch })).toBe(1);
      expect((await getDocFromServer(doc(fresh.db, 'accounts', owner.uid, 'metadata', 'registry'))).exists()).toBe(false);
      for (const kind of ['accounts', 'creatorRanks']) {
        expect((await getDocsFromServer(query(collection(fresh.db, kind, owner.uid, 'chunks'), limit(20)))).empty).toBe(true);
      }
      expect(fresh.auth.currentUser?.uid).toBe(owner.uid);
      expect(await resumed.probeDeletedCopy()).toBe('unknown');
    }, 60000);

    it('aborts a purge when the deleted epoch changes and retains the remaining payload and Auth account', async () => {
      const owner = await actor();
      const base = await owner.cloud.enable(null);
      const generation = crypto.randomUUID();
      const entries: Record<string, object> = {};
      for (let index = 0; index < 21; index += 1) {
        const chunk = (await packSnapshot({ interrupted: index })).chunks[0]!;
        entries[`accounts/${owner.uid}/chunks/${chunk.digest}`] = { ...chunk, holders: [generation], holder: generation, createdAt: aged() };
      }
      await seed(entries);
      const deleting = await owner.cloud.revoke(base, true);
      await expect(owner.cloud.cleanup(true, {
        expectedDeletionEpoch: deleting.epoch,
        onProgress: async ({ confirmed }) => {
          if (confirmed === 10) await seed({ [`syncHeads/${owner.uid}`]: {
            ...deleting, enabled: true, deleted: false, epoch: deleting.epoch + 1, revision: deleting.revision + 1, updatedAt: Timestamp.now(),
          } });
        },
      })).rejects.toBeInstanceOf(DeletionCleanupInterrupted);
      await environment.withSecurityRulesDisabled(async context => {
        expect((await context.firestore().collection(`accounts/${owner.uid}/chunks`).get()).size).toBe(11);
      });
      expect(owner.auth.currentUser?.uid).toBe(owner.uid);
    });

    it('releases all 107+107 maximum transport chunks with shared holders, then purges the retained copy in account-deletion mode', async () => {
      const owner = await actor();
      const base = await owner.cloud.enable(null);
      const maximum = async (label: string) => {
        const overhead = new TextEncoder().encode(JSON.stringify({ payload: '' })).length;
        const payload = Array.from({ length: MAX_CHUNKS }, (_, index) => {
          const prefix = `${label}${String(index).padStart(4, '0')}`;
          return prefix + label.repeat(CHUNK_BYTES - prefix.length);
        }).join('').slice(0, MAX_SNAPSHOT_BYTES - overhead);
        const value = await packSnapshot({ payload });
        expect(value.manifest.bytes).toBe(MAX_SNAPSHOT_BYTES);
        expect(value.chunks).toHaveLength(107);
        expect(new Set(value.chunks.map(chunk => chunk.digest)).size).toBe(107);
        return value;
      };
      const privateCopy = await maximum('P'); const ranking = await maximum('R');
      const retired = crypto.randomUUID(); const kept = crypto.randomUUID();
      const copyFor = (id: string) => ({
        private: { ...privateCopy.manifest, generation: id }, ranking: { ...ranking.manifest, generation: id },
        epoch: base.epoch, createdAt: aged(),
      });
      await seed({
        [`syncHeads/${owner.uid}`]: { ...base, revision: 2, current: copyFor(kept).private, updatedAt: aged() },
        [`creatorRanks/${owner.uid}`]: {
          format: 1, epoch: base.epoch, revision: 2, current: copyFor(kept).ranking, previous: null, updatedAt: aged(),
        },
        [`accounts/${owner.uid}/metadata/registry`]: { ids: [retired, kept], revision: 2 },
        [`accounts/${owner.uid}/generations/${retired}`]: { ...copyFor(retired), status: 'deleting' },
        [`accounts/${owner.uid}/generations/${kept}`]: { ...copyFor(kept), status: 'ready' },
      });
      for (const [kind, chunks] of [['accounts', privateCopy.chunks], ['creatorRanks', ranking.chunks]] as const) {
        for (let index = 0; index < chunks.length; index += 8) await seed(Object.fromEntries(chunks.slice(index, index + 8).map(chunk => [
          `${kind}/${owner.uid}/chunks/${chunk.digest}`, { ...chunk, holders: [retired, kept], holder: kept, createdAt: aged() },
        ])));
      }
      expect(await owner.cloud.cleanup()).toBe(1);
      const registry = doc(owner.db, 'accounts', owner.uid, 'metadata', 'registry');
      expect((await getDocFromServer(registry)).data()?.ids).toEqual([kept]);
      for (const [kind, chunks] of [['accounts', privateCopy.chunks], ['creatorRanks', ranking.chunks]] as const) {
        for (const chunk of [chunks[0]!, chunks[106]!]) {
          expect((await getDocFromServer(doc(owner.db, kind, owner.uid, 'chunks', chunk.digest))).data()?.holders).toEqual([kept]);
        }
      }
      const head = await owner.cloud.head();
      if (!head) throw new Error('The retained maximum-count head is missing.');
      await owner.cloud.revoke(head, true);
      expect(await owner.cloud.cleanup(true)).toBe(1);
      expect((await getDocFromServer(registry)).exists()).toBe(false);
      await environment.withSecurityRulesDisabled(async context => {
        for (const kind of ['accounts', 'creatorRanks']) {
          expect((await context.firestore().collection(`${kind}/${owner.uid}/chunks`).limit(1).get()).empty).toBe(true);
        }
      });
    }, 180000);

    it.each(['ranking', 'shelf'] as const)('cleans a full 100-chunk %s generation with active retained pointers within the release access budget', async kind => {
      const owner = await actor();
      const base = await owner.cloud.enable(null);
      await owner.friends.initialize(owner.uid);
      const settings = await owner.friends.settings(owner.uid);
      if (!settings) throw new Error('Friend settings are missing.');
      const rows = Array.from({ length: 200 }, (_, index): PublicEntry => ({
        ...entry, position: index + 1, id: `wikidata:Q${index + 1}`, sourceId: `Q${index + 1}`, sourceUrl: `https://www.wikidata.org/wiki/Q${index + 1}`,
      }));
      const shelf = new FriendShelfStore(owner.db);
      const selectedIds = rows.map(row => row.id);
      const control = kind === 'ranking'
        ? await owner.friends.saveSettings(owner.uid, { enabled: true, selectedIds }, settings)
        : await shelf.saveConfig(owner.uid, { enabled: true, selectedIds, consentSyncEpoch: base.epoch }, await shelf.initialize(owner.uid));
      const names = kind === 'ranking'
        ? { collection: 'friendShares', head: 'friendShareHeads', registry: 'friendShareRegistry' }
        : { collection: 'friendShelves', head: 'friendShelfHeads', registry: 'friendShelfRegistry' };
      const [retired, current, previous] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      const common = { epoch: control.epoch, settingsRevision: control.revision, source: { syncEpoch: base.epoch, remoteRevision: base.revision } };
      const sharedRows = kind === 'ranking' ? rows : rows.map(row => ({
        id: row.id, title: row.title, year: row.year, source: row.source, sourceId: row.sourceId, sourceUrl: row.sourceUrl,
      }));
      const digest = createHash('sha256').update(JSON.stringify(sharedRows)).digest('hex');
      const full = { ...common, count: 200, digest, uploaded: 100, ids: selectedIds, status: 'published', createdAt: aged() };
      const entries: Record<string, object> = {
        [`${names.registry}/${owner.uid}`]: { ids: [retired, current, previous], revision: 3 },
        [`${names.head}/${owner.uid}`]: {
          ...common, format: 1, revision: 3,
          current: { generation: current, count: 200, digest },
          previous: { generation: previous, count: 200, digest }, updatedAt: aged(),
        },
        [`${names.collection}/${owner.uid}/generations/${current}`]: full,
        [`${names.collection}/${owner.uid}/generations/${previous}`]: full,
        [`${names.collection}/${owner.uid}/generations/${retired}`]: full,
      };
      for (const id of [retired, current, previous]) for (let index = 0; index < 100; index += 1) {
        const pair = sharedRows.slice(index * 2, index * 2 + 2);
        entries[`${names.collection}/${owner.uid}/generations/${id}/chunks/${index}`] = {
          index, ids: pair.map(row => row.id),
          entries: pair,
        };
      }
      await seed(entries);
      const retiredRef = doc(owner.db, names.collection, owner.uid, 'generations', retired);
      await updateDoc(retiredRef, { status: 'deleting' });
      for (let start = 94; start < 100; start += 3) {
        const stalePayloadOnly = writeBatch(owner.db);
        for (let index = start; index < start + 3; index += 1) stalePayloadOnly.delete(doc(retiredRef, 'chunks', String(index)));
        await stalePayloadOnly.commit();
      }
      expect((await getDocFromServer(retiredRef)).data()?.uploaded).toBe(100);
      expect(kind === 'ranking' ? await owner.friends.cleanupSharing(owner.uid) : await shelf.cleanupSharing(owner.uid)).toBe(1);
      expect((await getDocFromServer(doc(owner.db, names.registry, owner.uid))).data()?.ids).toEqual([current, previous]);
      expect((await getDocsFromServer(query(collection(owner.db, names.collection, owner.uid, 'generations', retired, 'chunks'), limit(100)))).empty).toBe(true);
      for (const id of [current, previous]) {
        expect((await getDocsFromServer(query(collection(owner.db, names.collection, owner.uid, 'generations', id, 'chunks'), limit(100)))).size).toBe(100);
      }
    }, 60000);

    it('locks private manifests and holder membership, including additions to a deleting generation', async () => {
      const owner = await actor();
      const head = await owner.cloud.enable(null);
      const state = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 4 });
      await expect(owner.cloud.upload(state, head, async () => {
        throw new Error('Leave only the first private chunk.');
      })).rejects.toThrow('Leave only the first private chunk');
      const registry = await getDocFromServer(doc(owner.db, 'accounts', owner.uid, 'metadata', 'registry'));
      const id = registry.data()?.ids[0];
      if (typeof id !== 'string') throw new Error('The staged generation is missing.');
      const ref = doc(owner.db, 'accounts', owner.uid, 'generations', id);
      const staged = (await getDocFromServer(ref)).data()!;
      const unrelated = (await packSnapshot('outside this manifest')).chunks[0]!;
      await assertFails(setDoc(doc(owner.db, 'accounts', owner.uid, 'chunks', unrelated.digest), {
        ...unrelated, holders: [id], holder: id, createdAt: serverTimestamp(),
      }));
      await assertFails(updateDoc(ref, { private: { ...staged.private, chunks: [unrelated.digest] } }));
      const ranking = (await packSnapshot(creatorRanks(state))).chunks[0]!;
      expect(staged.ranking.chunks).toEqual([ranking.digest]);
      await updateDoc(ref, { status: 'deleting' });
      await assertFails(setDoc(doc(owner.db, 'creatorRanks', owner.uid, 'chunks', ranking.digest), {
        ...ranking, holders: [id], holder: id, createdAt: serverTimestamp(),
      }));
      await assertFails(updateDoc(ref, { status: 'staging' }));
      expect(await owner.cloud.cleanup()).toBe(1);
    });

    it('recovers all eight slots left deleting by a stale client whose payload deletions completed but parent deletion was denied', async () => {
      const owner = await actor();
      const head = await owner.cloud.enable(null);
      const snapshots = await Promise.all(Array.from({ length: 8 }, (_, index) => packSnapshot({ stale: index })));
      const entries: Record<string, object> = {
        [`accounts/${owner.uid}/metadata/registry`]: { ids: snapshots.map(value => value.manifest.generation), revision: 8 },
      };
      for (const value of snapshots) entries[`accounts/${owner.uid}/generations/${value.manifest.generation}`] = {
        private: value.manifest, ranking: value.manifest, epoch: head.epoch, status: 'deleting', createdAt: aged(),
      };
      await seed(entries);
      const registry = doc(owner.db, 'accounts', owner.uid, 'metadata', 'registry');
      const firstId = snapshots[0]!.manifest.generation;
      const staleFinish = writeBatch(owner.db);
      staleFinish.delete(doc(owner.db, 'accounts', owner.uid, 'generations', firstId));
      staleFinish.update(registry, { ids: snapshots.slice(1).map(value => value.manifest.generation), revision: 9 });
      await expect(staleFinish.commit()).rejects.toMatchObject({ code: 'permission-denied' });
      expect((await getDocFromServer(registry)).data()?.ids).toHaveLength(8);
      expect(await owner.cloud.cleanup()).toBe(4);
      expect(await owner.cloud.cleanup()).toBe(4);
      expect((await getDocFromServer(registry)).data()?.ids).toEqual([]);
      const state = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 6 });
      const saved = await owner.cloud.upload(state, head);
      expect(await owner.cloud.download(saved)).toEqual({ ...state, revision: 0, motion: 'auto' });
    }, 60000);

    it('advances both private release counters during account deletion even when their ranking chunk is deduplicated', async () => {
      const owner = await actor();
      const state = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 5 });
      const first = await owner.cloud.upload(state, await owner.cloud.enable(null));
      const edited = structuredClone(state);
      edited.ranking[0]!.note = 'Only the private note changed.';
      edited.revision += 1;
      const second = await owner.cloud.upload(edited, first);
      const summary = (await packSnapshot(creatorRanks(state))).chunks[0]!;
      expect((await getDocFromServer(doc(owner.db, 'creatorRanks', owner.uid, 'chunks', summary.digest))).data()?.holders).toHaveLength(2);
      await owner.cloud.revoke(second, true);
      expect(await owner.cloud.cleanup(true)).toBe(2);
      expect((await getDocFromServer(doc(owner.db, 'accounts', owner.uid, 'metadata', 'registry'))).exists()).toBe(false);
      expect(await stored(`creatorRanks/${owner.uid}/chunks/${summary.digest}`)).toBeUndefined();
      for (const manifest of [first.current, second.current]) {
        if (!manifest) throw new Error('An uploaded private manifest is missing.');
        for (const digest of manifest.chunks) expect(await stored(`accounts/${owner.uid}/chunks/${digest}`)).toBeUndefined();
      }
    });

    it.each(['ranking', 'shelf'] as const)('blocks %s metadata-only slot reuse and forbids regaining released payload', async kind => {
      const owner = await actor();
      const head = await owner.cloud.enable(null);
      await owner.friends.initialize(owner.uid);
      const settings = await owner.friends.settings(owner.uid);
      if (!settings) throw new Error('Friend settings are missing.');
      const shelf = new FriendShelfStore(owner.db);
      const control = kind === 'ranking'
        ? await owner.friends.saveSettings(owner.uid, { enabled: true, selectedIds: [entry.id] }, settings)
        : await shelf.saveConfig(owner.uid, { enabled: true, selectedIds: [entry.id], consentSyncEpoch: head.epoch }, await shelf.initialize(owner.uid));
      const collection = kind === 'ranking' ? 'friendShares' : 'friendShelves';
      const registry = doc(owner.db, kind === 'ranking' ? 'friendShareRegistry' : 'friendShelfRegistry', owner.uid);
      const id = crypto.randomUUID();
      const ref = doc(owner.db, collection, owner.uid, 'generations', id);
      const generation = {
        epoch: control.epoch, settingsRevision: control.revision, source: { syncEpoch: head.epoch, remoteRevision: head.revision },
        count: 1, digest: 'a'.repeat(64), uploaded: 0, ids: [], status: 'staging', createdAt: serverTimestamp(),
      };
      const begin = writeBatch(owner.db);
      begin.set(registry, { ids: [id], revision: 1 });
      begin.set(ref, generation);
      await begin.commit();
      const row = kind === 'ranking' ? entry : {
        id: entry.id, title: entry.title, year: entry.year, source: entry.source, sourceId: entry.sourceId, sourceUrl: entry.sourceUrl,
      };
      const chunk = { index: 0, entries: [row], ids: [row.id] };
      const upload = writeBatch(owner.db);
      upload.set(doc(ref, 'chunks', '0'), chunk);
      upload.update(ref, { uploaded: 1, ids: [row.id], status: 'ready' });
      await upload.commit();
      await seed({ [`${collection}/${owner.uid}/generations/${id}`]: {
        ...generation, uploaded: 1, ids: [row.id], status: 'ready', createdAt: aged(),
      } });
      await updateDoc(ref, { status: 'deleting' });
      const early = writeBatch(owner.db);
      early.delete(ref);
      early.update(registry, { ids: [], revision: 2 });
      await expect(early.commit()).rejects.toMatchObject({ code: 'permission-denied' });
      await assertFails(updateDoc(ref, { uploaded: 0 }));
      await releaseIndexedPayload(ref, 'chunks', 0, 100);
      expect((await getDocFromServer(ref)).data()?.uploaded).toBe(0);
      const regain = writeBatch(owner.db);
      regain.set(doc(ref, 'chunks', '0'), chunk);
      regain.update(ref, { uploaded: 1, status: 'ready' });
      await expect(regain.commit()).rejects.toMatchObject({ code: 'permission-denied' });
      expect(kind === 'ranking' ? await owner.friends.cleanupSharing(owner.uid) : await shelf.cleanupSharing(owner.uid)).toBe(1);
      expect((await getDocFromServer(registry)).data()?.ids).toEqual([]);
    });

    it('shrinks a valid twelve-generation legacy registry, then really uploads and downloads with retained rollback data', async () => {
      const owner = await actor();
      const base = await owner.cloud.enable(null);
      const oldTime = aged();
      const snapshots = await Promise.all(Array.from({ length: 12 }, async (_, index) => {
        const state = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: (index + 1) / 2 });
        const privateCopy = await packLibrary(state);
        const ranking = await packSnapshot(creatorRanks(state));
        ranking.manifest.generation = privateCopy.manifest.generation;
        return { state, privateCopy, ranking };
      }));
      const first = snapshots[0]!; const previous = snapshots[1]!;
      const entries: Record<string, object> = {
        [`syncHeads/${owner.uid}`]: {
          ...base, revision: 12, current: first.privateCopy.manifest, previous: previous.privateCopy.manifest, updatedAt: oldTime,
        },
        [`creatorRanks/${owner.uid}`]: {
          format: 1, epoch: base.epoch, revision: 12, current: first.ranking.manifest, previous: previous.ranking.manifest, updatedAt: oldTime,
        },
        [`accounts/${owner.uid}/metadata/registry`]: { ids: snapshots.map(value => value.privateCopy.manifest.generation), revision: 12 },
      };
      for (const value of snapshots) {
        const id = value.privateCopy.manifest.generation;
        entries[`accounts/${owner.uid}/generations/${id}`] = {
          private: value.privateCopy.manifest, ranking: value.ranking.manifest, epoch: base.epoch, status: 'ready', createdAt: oldTime,
        };
        for (const [collection, chunks] of [['accounts', value.privateCopy.chunks], ['creatorRanks', value.ranking.chunks]] as const) {
          for (const chunk of chunks) entries[`${collection}/${owner.uid}/chunks/${chunk.digest}`] = {
            ...chunk, holders: [id], holder: id, createdAt: oldTime,
          };
        }
      }
      await seed(entries);
      const head = await owner.cloud.head();
      if (!head) throw new Error('The seeded legacy head is missing.');
      expect(await owner.cloud.cleanup()).toBe(4);
      const registry = doc(owner.db, 'accounts', owner.uid, 'metadata', 'registry');
      expect((await getDocFromServer(registry)).data()?.ids).toHaveLength(8);
      expect(await owner.cloud.download(head)).toEqual({ ...first.state, revision: 0, motion: 'auto' });
      expect(await owner.cloud.download(head, true)).toEqual({ ...previous.state, revision: 0, motion: 'auto' });
      const edited = applyPersonalAction(first.state, { type: 'rate-game', record: game, score: 9.7 });
      const saved = await owner.cloud.upload(edited, head);
      expect(saved.revision).toBe(13);
      expect((await getDocFromServer(registry)).data()?.ids).toHaveLength(5);
      expect(await owner.cloud.download(saved)).toEqual({ ...edited, revision: 0, motion: 'auto' });
      expect(await owner.cloud.download(saved, true)).toEqual({ ...first.state, revision: 0, motion: 'auto' });
    }, 60000);

    it('cleans an unregistered legacy public generation and enrolls the next real publication', async () => {
      const owner = await actor();
      const id = crypto.randomUUID();
      const path = `publicProfiles/${owner.uid}/generations/${id}`;
      const ref = doc(owner.db, path);
      await seed({
        [`publicControls/${owner.uid}`]: initialControl,
        [path]: { epoch: 0, count: 1, uploaded: 1, status: 'ready', createdAt: aged() },
        [`${path}/entries/1`]: entry,
      });
      expect(await stored(`publicProfiles/${owner.uid}/metadata/registry`)).toBeUndefined();
      expect(await owner.social.cleanup(owner.uid, true, async () => {
        expect((await getDocFromServer(ref)).data()?.uploaded).toBe(0);
        const regain = writeBatch(owner.db);
        regain.set(doc(ref, 'entries', '1'), entry);
        regain.update(ref, { uploaded: 1, status: 'ready' });
        await expect(regain.commit()).rejects.toMatchObject({ code: 'permission-denied' });
      })).toBe(1);
      expect(await stored(path)).toBeUndefined();
      expect(await stored(`${path}/entries/1`)).toBeUndefined();
      const published = await owner.social.publish(owner.uid, publication('migration_enrolled'), await owner.social.control(owner.uid));
      expect((await getDocFromServer(doc(owner.db, 'publicProfiles', owner.uid, 'metadata', 'registry'))).data()?.ids)
        .toEqual([published.generation]);
      expect(await session().social.entries(published)).toEqual([entry]);
    });

    it.each(['leul_tew', 'play100_official', 'support_team'])('lets legacy %s unpublish and rename, never republish the reserved handle', async handle => {
      const owner = await actor();
      const generation = crypto.randomUUID();
      const legacy: PublicProfile = {
        uid: owner.uid, handle, displayName: 'Legacy published name', avatar, title: 'Legacy ranking', count: 1, preview: [entry.title],
        generation, epoch: 1, published: true, listed: false, hidden: false, creator: false, updatedAt: 1,
      };
      await seed({
        [`publicProfiles/${owner.uid}`]: { ...legacy, updatedAt: aged() },
        [`publicControls/${owner.uid}`]: { ...initialControl, epoch: 1 },
        [`handles/${handle}`]: { uid: owner.uid },
        [`publicProfiles/${owner.uid}/generations/${generation}`]: { epoch: 0, count: 1, uploaded: 1, status: 'ready', createdAt: aged() },
        [`publicProfiles/${owner.uid}/generations/${generation}/entries/1`]: entry,
      });
      expect((await owner.social.ownProfile(owner.uid))?.handle).toBe(handle);
      await owner.social.unpublish(owner.uid, await owner.social.control(owner.uid));
      const before = await owner.social.control(owner.uid);
      expect((await owner.social.ownProfile(owner.uid))?.published).toBe(false);
      await expect(owner.social.publish(owner.uid, publication(handle), before)).rejects.toThrow(/reserved/);
      expect(await owner.social.control(owner.uid)).toEqual(before);
      const renamed = await owner.social.publish(owner.uid, publication('migration_compliant'), before);
      expect(renamed.handle).toBe('migration_compliant');
      expect((await getDocFromServer(doc(owner.db, 'handles', handle))).exists()).toBe(false);
      expect((await session().social.profile(renamed.handle))?.uid).toBe(owner.uid);
    });

    it('does not use the legacy allocation fallback for an actual offline registry read', async () => {
      const owner = await actor();
      const info = vi.spyOn(console, 'info');
      await disableNetwork(owner.db);
      try {
        await expect(owner.social.publish(owner.uid, publication('migration_offline'), initialControl))
          .rejects.toMatchObject({ code: 'unavailable' });
      } finally { await enableNetwork(owner.db); }
      expect(info.mock.calls.some(([message]) => typeof message === 'string' && message.includes('legacy client-first'))).toBe(false);
      expect(await stored(`publicProfiles/${owner.uid}/metadata/registry`)).toBeUndefined();
      expect(await owner.social.ownProfile(owner.uid)).toBeNull();
    });

    it('blocks the private metadata-only orphan loop and permits slot reuse only after honest chunk release', async () => {
      const owner = await actor();
      const head = await owner.cloud.enable(null);
      const registry = doc(owner.db, 'accounts', owner.uid, 'metadata', 'registry');
      const orphans: Array<{ collection: string; digest: string }> = [];
      for (let index = 0; index < 2; index += 1) {
        const state = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: index + 1 });
        let acknowledged = 0;
        await expect(owner.cloud.upload(state, head, async () => {
          if (++acknowledged === 2) throw new Error('Stop after both real chunk writes, before head commit.');
        })).rejects.toThrow('Stop after both real chunk writes');
        const current = await getDocFromServer(registry);
        const ids: unknown = current.data()?.ids;
        if (!Array.isArray(ids) || ids.length !== 1 || typeof ids[0] !== 'string') throw new Error('Expected one bounded staging generation.');
        const generation = doc(owner.db, 'accounts', owner.uid, 'generations', ids[0]);
        const data = (await getDocFromServer(generation)).data();
        if (!data) throw new Error('The staged generation is missing.');
        for (const [collection, value] of [['accounts', data.private], ['creatorRanks', data.ranking]] as const) {
          const manifest = parseManifest(value);
          expect(manifest.chunks).toHaveLength(1);
          orphans.push({ collection, digest: manifest.chunks[0]! });
        }
        await updateDoc(generation, { status: 'deleting' });
        const discardMetadata = writeBatch(owner.db);
        discardMetadata.delete(generation);
        discardMetadata.update(registry, { ids: [], revision: current.data()!.revision + 1 });
        await expect(discardMetadata.commit()).rejects.toMatchObject({ code: 'permission-denied' });
        await expect(deleteDoc(generation)).rejects.toMatchObject({ code: 'permission-denied' });
        await expect(updateDoc(generation, { released: 2 })).rejects.toMatchObject({ code: 'permission-denied' });
        expect((await getDocFromServer(registry)).data()?.ids).toEqual(ids);
        expect(await owner.cloud.cleanup()).toBe(1);
        expect((await getDocFromServer(generation)).exists()).toBe(false);
        expect((await getDocFromServer(registry)).data()?.ids).toEqual([]);
      }
      expect(await owner.cloud.cleanup(true)).toBe(0);
      expect(new Set(orphans.map(value => `${value.collection}/${value.digest}`)).size).toBe(4);
      for (const orphan of orphans) {
        const ref = doc(owner.db, orphan.collection, owner.uid, 'chunks', orphan.digest);
        expect((await getDocFromServer(ref)).exists()).toBe(false);
      }
    });

    it('blocks the public metadata-only orphan loop and permits slot reuse only after honest entry countdown', async () => {
      const owner = await actor();
      const registry = doc(owner.db, 'publicProfiles', owner.uid, 'metadata', 'registry');
      const generations: string[] = [];
      for (let index = 0; index < 2; index += 1) {
        await expect(owner.social.publish(owner.uid, publication('migration_orphans'), initialControl, async () => {
          throw new Error('Stop after real entry writes, before publishing the pointer.');
        })).rejects.toThrow('Stop after real entry writes');
        const current = await getDocFromServer(registry);
        const ids: unknown = current.data()?.ids;
        if (!Array.isArray(ids) || ids.length !== 1 || typeof ids[0] !== 'string') throw new Error('Expected one bounded public generation.');
        generations.push(ids[0]);
        const ref = doc(owner.db, 'publicProfiles', owner.uid, 'generations', ids[0]);
        await updateDoc(ref, { status: 'deleting' });
        const discardMetadata = writeBatch(owner.db);
        discardMetadata.delete(ref);
        discardMetadata.update(registry, { ids: [], revision: current.data()!.revision + 1 });
        await expect(discardMetadata.commit()).rejects.toMatchObject({ code: 'permission-denied' });
        await expect(deleteDoc(ref)).rejects.toMatchObject({ code: 'permission-denied' });
        await expect(updateDoc(ref, { uploaded: 0 })).rejects.toMatchObject({ code: 'permission-denied' });
        expect((await getDocFromServer(registry)).data()?.ids).toEqual(ids);
        expect(await owner.social.cleanup(owner.uid, true)).toBe(1);
        expect((await getDocFromServer(ref)).exists()).toBe(false);
        expect((await getDocFromServer(registry)).data()?.ids).toEqual([]);
      }
      expect(new Set(generations).size).toBe(2);
      expect(await owner.social.cleanup(owner.uid, true)).toBe(0);
      for (const id of generations) {
        const ref = doc(owner.db, 'publicProfiles', owner.uid, 'generations', id, 'entries', '1');
        expect((await getDocFromServer(ref)).exists()).toBe(false);
      }
    });
  }
});
