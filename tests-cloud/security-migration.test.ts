import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getIdToken, inMemoryPersistence, initializeAuth, reload } from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  connectFirestoreEmulator, deleteDoc, disableNetwork, doc, enableNetwork, getDocFromServer, getFirestore,
  Timestamp, updateDoc, writeBatch,
} from 'firebase/firestore';
import { IDBFactory } from 'fake-indexeddb';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelUnusedRegistration, ensureAccountActivity, removeCancelledRegistration } from '../src/cloud/account-lifecycle';
import { CloudStore } from '../src/cloud/cloud-store';
import { FriendStore } from '../src/cloud/friend-store';
import { SocialStore } from '../src/cloud/social-store';
import { accountScope, creatorRanks } from '../src/lib/cloud-types';
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

  if (policy === 'candidate') {
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
      await seed({
        [`publicControls/${owner.uid}`]: initialControl,
        [path]: { epoch: 0, count: 1, uploaded: 1, status: 'ready', createdAt: aged() },
        [`${path}/entries/1`]: entry,
      });
      expect(await stored(`publicProfiles/${owner.uid}/metadata/registry`)).toBeUndefined();
      expect(await owner.social.cleanup(owner.uid, true)).toBe(1);
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

    it('characterizes the open private payload-orphan limit: metadata slots can be reused while both chunk kinds survive', async () => {
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
        await discardMetadata.commit();
        expect((await getDocFromServer(generation)).exists()).toBe(false);
        expect((await getDocFromServer(registry)).data()?.ids).toEqual([]);
      }
      expect(await owner.cloud.cleanup(true)).toBe(0);
      expect(new Set(orphans.map(value => `${value.collection}/${value.digest}`)).size).toBe(4);
      for (const orphan of orphans) {
        const ref = doc(owner.db, orphan.collection, owner.uid, 'chunks', orphan.digest);
        expect((await getDocFromServer(ref)).exists()).toBe(true);
        await assertFails(deleteDoc(ref));
      }
    });

    it('characterizes the open public payload-orphan limit: unregistering metadata does not remove its entries', async () => {
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
        await discardMetadata.commit();
        expect((await getDocFromServer(ref)).exists()).toBe(false);
        expect((await getDocFromServer(registry)).data()?.ids).toEqual([]);
      }
      expect(new Set(generations).size).toBe(2);
      expect(await owner.social.cleanup(owner.uid, true)).toBe(0);
      for (const id of generations) {
        const ref = doc(owner.db, 'publicProfiles', owner.uid, 'generations', id, 'entries', '1');
        expect((await getDocFromServer(ref)).data()).toEqual(entry);
        await expect(deleteDoc(ref)).rejects.toMatchObject({ code: 'permission-denied' });
      }
    });
  }
});
