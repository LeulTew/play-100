import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getIdToken,
  inMemoryPersistence,
  initializeAuth,
  reload,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import type { Firestore, Transaction, TransactionOptions } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialStore } from '../src/cloud/social-store';
import { CloudStore } from '../src/cloud/cloud-store';
import { ensureAccountActivity } from '../src/cloud/account-lifecycle';
import type { AvatarValue, PublicEntry } from '../src/lib/community';
import { reportDocumentId } from '../src/lib/community';
import type { RunTransaction } from './fixtures/modular-firestore';

type Registry = Record<string, unknown> & { ids: string[]; revision: number };

// Only the deleting-unpublish cases below replace a transaction; every other call runs the SDK's own.
vi.mock('firebase/firestore', async (original) => {
  const actual = await original<typeof import('firebase/firestore')>();
  return { ...actual, runTransaction: vi.fn(actual.runTransaction) };
});

let environment: RulesTestEnvironment;
const apps: FirebaseApp[] = [];
const avatar: AvatarValue = { version: 1, seed: 'b'.repeat(32), palette: 'moss' };
const entry: PublicEntry = {
  position: 1,
  id: 'wikidata:Q123',
  title: 'Published example',
  year: 2020,
  source: 'wikidata',
  sourceId: 'Q123',
  sourceUrl: 'https://www.wikidata.org/wiki/Q123',
  score: 9.5,
};
const control = { epoch: 0, hidden: false, deleted: false };
beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-play100',
    firestore: {
      host: '127.0.0.1',
      port: 8188,
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});
beforeEach(async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  vi.mocked<RunTransaction>(runTransaction).mockReset().mockImplementation(actual.runTransaction);
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc('_owner/config').set({ uid: 'creator-uid', email: 'owner@example.test' });
    await context.firestore().doc('ownerAccess/status').set({ enabled: true });
    await context
      .firestore()
      .doc('catalog/author')
      .set({ records: { 'trusted-game': { title: 'Trusted original game', year: 2020 } } });
  });
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => deleteApp(app)));
});
afterAll(async () => {
  await environment.cleanup();
});

async function client(anonymous = false) {
  const app = initializeApp({ apiKey: 'demo-play100-key', projectId: 'demo-play100' }, crypto.randomUUID());
  apps.push(app);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8188);
  if (anonymous) return { uid: '', email: '', db, social: new SocialStore(db) };
  const user = (
    await createUserWithEmailAndPassword(
      auth,
      `social-${crypto.randomUUID()}@example.test`,
      'Emulator-only-passphrase-4382',
    )
  ).user;
  const response = await fetch(
    'http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-play100-key',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ localId: user.uid, emailVerified: true }),
    },
  );
  if (!response.ok) throw new Error('The isolated Auth fixture could not be verified.');
  await reload(user);
  await getIdToken(user, true);
  await ensureAccountActivity(db, user.uid);
  return { uid: user.uid, email: user.email ?? '', db, social: new SocialStore(db) };
}
function publication(handle: string, listed = false, entries = [entry]) {
  return { handle, displayName: 'A chosen nickname', avatar, title: 'My favorites', listed, creator: false, entries };
}
// The stored owner of a handle, read with rules disabled: clients cannot read a missing handle at all.
async function handleOwner(handle: string): Promise<string | undefined> {
  let owner: string | undefined;
  await environment.withSecurityRulesDisabled(async (context) => {
    owner = ((await context.firestore().doc(`handles/${handle}`).get()).data() as { uid?: string } | undefined)?.uid;
  });
  return owner;
}
async function stageGeneration(owner: Awaited<ReturnType<typeof client>>, ref: ReturnType<typeof doc>) {
  const registryRef = doc(owner.db, 'publicProfiles', owner.uid, 'metadata', 'registry');
  const registry = await getDocFromServer(registryRef);
  const batch = writeBatch(owner.db);
  batch.set(ref, { epoch: 0, count: 1, uploaded: 0, status: 'staging', createdAt: serverTimestamp() });
  batch.set(registryRef, {
    ids: [...(registry.exists() ? (registry.data() as Registry).ids : []), ref.id],
    revision: registry.exists() ? (registry.data() as Registry).revision + 1 : 1,
  });
  await batch.commit();
}

describe('consented public snapshots, handle claims and moderation', () => {
  it('heals an absent public generation ID before deleting the empty registry', async () => {
    const owner = await client();
    const id = crypto.randomUUID();
    await owner.social.unpublish(owner.uid, control, true);
    await environment.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc(`publicProfiles/${owner.uid}/metadata/registry`)
        .set({ ids: [id], revision: 1 });
    });
    await owner.social.deleteProfile(owner.uid);
    expect((await getDocFromServer(doc(owner.db, 'publicProfiles', owner.uid, 'metadata', 'registry'))).exists()).toBe(
      false,
    );
  });
  it('does not delete a profile or handle while a present generation is excluded by its missing createdAt', async () => {
    const owner = await client();
    const profile = await owner.social.publish(owner.uid, publication('retained_public'), control);
    await owner.social.unpublish(owner.uid, await owner.social.control(owner.uid), true);
    const before = await owner.social.ownProfile(owner.uid);
    await environment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`publicProfiles/${owner.uid}/generations/${profile.generation}`).set({
        epoch: 0,
        count: 1,
        uploaded: 1,
        status: 'ready',
      });
    });
    await expect(owner.social.deleteProfile(owner.uid)).rejects.toThrow(
      'Some public copies still need cleanup. Choose Finish deleting to continue.',
    );
    expect(await owner.social.ownProfile(owner.uid)).toEqual(before);
    expect((await getDocFromServer(doc(owner.db, 'handles', profile.handle))).exists()).toBe(true);
  });
  it('requires releasing the current handle on profile deletion and removes the empty publication registry', async () => {
    const owner = await client();
    await owner.social.saveMember(owner.uid, 'Handle cleanup fixture', avatar);
    await new CloudStore(owner.db, owner.uid).enable(null);
    const first = await owner.social.publish(owner.uid, publication('bounded_handle'), control);
    await owner.social.unpublish(owner.uid, await owner.social.control(owner.uid), true);
    const profile = doc(owner.db, 'publicProfiles', owner.uid);
    const orphan = writeBatch(owner.db);
    orphan.delete(profile);
    await assertFails(orphan.commit());
    expect((await getDocFromServer(doc(owner.db, 'handles', first.handle))).exists()).toBe(true);
    await owner.social.deleteProfile(owner.uid);
    expect((await getDocFromServer(profile)).exists()).toBe(false);
    expect(await handleOwner(first.handle)).toBeUndefined();
    expect((await getDocFromServer(doc(owner.db, 'publicProfiles', owner.uid, 'metadata', 'registry'))).exists()).toBe(
      false,
    );
    await owner.social.deleteProfile(owner.uid);
    await owner.social.restorePublicationPermission(owner.uid);
    const second = await owner.social.publish(
      owner.uid,
      publication('next_bounded_handle'),
      await owner.social.control(owner.uid),
    );
    expect(await handleOwner(first.handle)).toBeUndefined();
    expect((await getDocFromServer(doc(owner.db, 'handles', second.handle))).exists()).toBe(true);
  });
  it('keeps link-only publication out of the directory and never publishes private state', async () => {
    const owner = await client();
    const guest = await client(true);
    const published = await owner.social.publish(owner.uid, publication('my_games'), control);
    expect((await guest.social.directory('')).profiles).toEqual([]);
    expect((await guest.social.profile('my_games'))?.uid).toBe(owner.uid);
    const entries = await guest.social.entries(published);
    expect(entries).toEqual([entry]);
    await assertFails(getDocFromServer(doc(guest.db, 'members', owner.uid)));
    await assertFails(getDocFromServer(doc(guest.db, 'syncHeads', owner.uid)));
  });
  it('requires a manual update, atomically changes snapshots and revokes public reads on unpublish', async () => {
    const owner = await client();
    const guest = await client(true);
    const first = await owner.social.publish(owner.uid, publication('listed_games', true), control);
    expect((await guest.social.directory('listed')).profiles).toHaveLength(1);
    const next = await owner.social.publish(
      owner.uid,
      publication('listed_games', true, [{ ...entry, score: 7 }]),
      await owner.social.control(owner.uid),
    );
    expect((await guest.social.entries(next))[0]?.score).toBe(7);
    await assertFails(
      getDocFromServer(doc(guest.db, 'publicProfiles', owner.uid, 'generations', first.generation, 'entries', '1')),
    );
    await owner.social.unpublish(owner.uid, await owner.social.control(owner.uid));
    expect(await guest.social.profile('listed_games')).toBeNull();
    expect((await guest.social.directory('')).profiles).toEqual([]);
    await assertFails(
      getDocFromServer(doc(guest.db, 'publicProfiles', owner.uid, 'generations', next.generation, 'entries', '1')),
    );
    await expect(
      owner.social.publish(owner.uid, publication('listed_games'), { epoch: 1, hidden: false, deleted: false }),
    ).rejects.toThrow(/changed/);
  });
  it('races two handle claims without granting the same handle to two accounts', async () => {
    const a = await client();
    const b = await client();
    const result = await Promise.allSettled([
      a.social.publish(a.uid, publication('unique_handle'), control),
      b.social.publish(b.uid, publication('unique_handle'), control),
    ]);
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    // The loser's write-based claim is refused by the rules and reported as a taken handle, not as a raw denial.
    const lost = result.find((item): item is PromiseRejectedResult => item.status === 'rejected');
    expect(lost?.reason).toMatchObject({ message: 'That handle is already taken. Choose another one.' });
    const guest = await client(true);
    const winner = (await guest.social.profile('unique_handle'))?.uid;
    expect([a.uid, b.uid]).toContain(winner);
    expect(await handleOwner('unique_handle')).toBe(winner);
  });
  it('reports a handle another account holds as taken, whether published, unpublished or hidden', async () => {
    const shown = await client();
    const kept = await client();
    const hidden = await client();
    const moderator = await client();
    const claimant = await client();
    await shown.social.publish(shown.uid, publication('shown_handle'), control);
    await kept.social.publish(kept.uid, publication('kept_handle'), control);
    await kept.social.unpublish(kept.uid, await kept.social.control(kept.uid));
    await hidden.social.publish(hidden.uid, publication('hidden_handle'), control);
    await environment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('_owner/config').set({ uid: moderator.uid, email: moderator.email });
    });
    await moderator.social.moderate(hidden.uid, true);
    // No handle is read first: each claim is a write that the rules refuse because another account holds the handle.
    for (const handle of ['shown_handle', 'kept_handle', 'hidden_handle'])
      await expect(
        claimant.social.publish(claimant.uid, publication(handle), await claimant.social.control(claimant.uid)),
      ).rejects.toThrow('That handle is already taken. Choose another one.');
    // A published account renaming onto a held handle is refused the same way and keeps its current handle.
    await expect(
      shown.social.publish(shown.uid, publication('kept_handle'), await shown.social.control(shown.uid)),
    ).rejects.toThrow('That handle is already taken. Choose another one.');
    expect((await shown.social.ownProfile(shown.uid))?.handle).toBe('shown_handle');
    expect(await handleOwner('shown_handle')).toBe(shown.uid);
    expect(await handleOwner('kept_handle')).toBe(kept.uid);
    expect(await handleOwner('hidden_handle')).toBe(hidden.uid);
    expect(await claimant.social.ownProfile(claimant.uid)).toBeNull();
    // The refused claims changed nothing else: a free handle still publishes under the same publication control.
    const before = await claimant.social.control(claimant.uid);
    expect(before).toEqual(control);
    const free = await claimant.social.publish(claimant.uid, publication('free_handle'), before);
    expect(free).toMatchObject({ uid: claimant.uid, handle: 'free_handle', published: true });
    expect(await handleOwner('free_handle')).toBe(claimant.uid);
  }, 60000);
  it('rejects forged ranks, private fields, role flags and incomplete generations through direct SDK writes', async () => {
    const owner = await client();
    await setDoc(doc(owner.db, 'publicControls', owner.uid), control);
    const generation = crypto.randomUUID();
    const ref = doc(owner.db, 'publicProfiles', owner.uid, 'generations', generation);
    await stageGeneration(owner, ref);
    for (const invalid of [
      { ...entry, note: 'Secret' },
      { ...entry, collectionRank: 1 },
      { ...entry, source: 'collection', sourceId: 'forged-game', id: 'forged-game', sourceUrl: null },
      { ...entry, sourceUrl: 'https://evil.invalid/' },
    ]) {
      const batch = writeBatch(owner.db);
      batch.set(doc(ref, 'entries', '1'), invalid);
      batch.update(ref, { uploaded: 1, status: 'ready' });
      await assertFails(batch.commit());
    }
    await assertFails(setDoc(ref, { epoch: 0, count: 1, uploaded: 1, status: 'ready', createdAt: serverTimestamp() }));
    expect((await getDocFromServer(ref)).data()?.uploaded).toBe(0);
    const accepted = writeBatch(owner.db);
    accepted.set(doc(ref, 'entries', '1'), entry);
    accepted.update(ref, { uploaded: 1, status: 'ready' });
    await assertSucceeds(accepted.commit());
    await assertFails(owner.social.publish(owner.uid, { ...publication('fake_owner'), creator: true }, control));
    await expect(owner.social.publish(owner.uid, publication('real_owner'), control)).resolves.toMatchObject({
      creator: false,
      published: true,
    });
  });
  it.each([2048, 2049])('enforces new public source URL boundary%s through a direct SDK write', async (length) => {
    const owner = await client();
    const prefix = 'https://www.freetogame.com/';
    const row: PublicEntry = {
      ...entry,
      id: 'freetogame:10',
      source: 'freetogame',
      sourceId: '10',
      sourceUrl: prefix + 'a'.repeat(length - prefix.length),
    };
    await setDoc(doc(owner.db, 'publicControls', owner.uid), control);
    const ref = doc(owner.db, 'publicProfiles', owner.uid, 'generations', crypto.randomUUID());
    await stageGeneration(owner, ref);
    const batch = writeBatch(owner.db);
    batch.set(doc(ref, 'entries', '1'), row);
    batch.update(ref, { uploaded: 1, status: 'ready' });
    if (length === 2048) await assertSucceeds(batch.commit());
    else await assertFails(batch.commit());
    expect((await getDocFromServer(ref)).data()?.uploaded).toBe(length === 2048 ? 1 : 0);
  });
  it('keeps historical oversized public source links readable but rejects a new publication without changing stored rows', async () => {
    const owner = await client();
    const guest = await client(true);
    const prefix = 'https://www.freetogame.com/';
    const allowed: PublicEntry = {
      ...entry,
      id: 'freetogame:10',
      source: 'freetogame',
      sourceId: '10',
      sourceUrl: prefix + 'a'.repeat(2048 - prefix.length),
    };
    const old = { ...allowed, sourceUrl: prefix + 'a'.repeat(2049 - prefix.length) };
    const profile = await owner.social.publish(owner.uid, publication('historical_link', false, [allowed]), control);
    const path = `publicProfiles/${owner.uid}/generations/${profile.generation}/entries/1`;
    await environment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(path).set(old);
    });
    expect(await guest.social.entries(profile)).toEqual([old]);
    const before = await owner.social.control(owner.uid);
    await expect(owner.social.publish(owner.uid, publication('historical_link', false, [old]), before)).rejects.toThrow(
      /source link.*2048.*private/i,
    );
    expect(await owner.social.control(owner.uid)).toEqual(before);
    expect(await guest.social.entries(profile)).toEqual([old]);
    await assertFails(setDoc(doc(owner.db, path), allowed));
  });
  it('publishes 200 entries in bounded validated batches and refuses 201', async () => {
    const owner = await client();
    const entries = Array.from({ length: 200 }, (_, index) => ({
      ...entry,
      position: index + 1,
      id: `wikidata:Q${index + 1}`,
      sourceId: `Q${index + 1}`,
      sourceUrl: `https://www.wikidata.org/wiki/Q${index + 1}`,
    }));
    const profile = await owner.social.publish(owner.uid, publication('two_hundred', false, entries), control);
    const guest = await client(true);
    expect(await guest.social.entries(profile)).toHaveLength(200);
    await expect(
      owner.social.publish(
        owner.uid,
        publication('too_many', false, [...entries, { ...entry, position: 201 }]),
        await owner.social.control(owner.uid),
      ),
    ).rejects.toThrow(/200/);
    await owner.social.unpublish(owner.uid, await owner.social.control(owner.uid));
    expect(await owner.social.cleanup(owner.uid, true)).toBe(1);
    expect(
      (
        await getDocs(
          query(
            collection(owner.db, 'publicProfiles', owner.uid, 'generations', profile.generation, 'entries'),
            limit(200),
          ),
        )
      ).empty,
    ).toBe(true);
    expect(
      (await getDocFromServer(doc(owner.db, 'publicProfiles', owner.uid, 'metadata', 'registry'))).data()?.ids,
    ).toEqual([]);
  }, 60000);
  it('keeps the heaviest publication, rename, unpublish and moderation writes within the rules evaluation limit', async () => {
    const owner = await client();
    const moderator = await client();
    // A saved online copy makes every publication check read the account's sync head too.
    await owner.social.saveMember(owner.uid, 'Budget fixture', avatar);
    await new CloudStore(owner.db, owner.uid).enable(null);
    const rows = [1, 2, 3].map((position) => ({
      ...entry,
      position,
      id: `wikidata:Q${position}`,
      title: `Budget game ${position}`,
      sourceId: `Q${position}`,
      sourceUrl: `https://www.wikidata.org/wiki/Q${position}`,
    }));
    await owner.social.publish(owner.uid, publication('budget_first', true, rows), control);
    // A rename that also changes the name, the title and all three previews runs every pattern on the update path.
    const reversed = [...rows].reverse().map((row, index) => ({ ...row, position: index + 1 }));
    const renamed = {
      ...publication('budget_second', true, reversed),
      displayName: 'Another nickname',
      title: 'Renamed favorites',
    };
    await owner.social.publish(owner.uid, renamed, await owner.social.control(owner.uid));
    await owner.social.unpublish(owner.uid, await owner.social.control(owner.uid));
    await environment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('_owner/config').set({ uid: moderator.uid, email: moderator.email });
    });
    await moderator.social.moderate(owner.uid, true);
    await moderator.social.moderate(owner.uid, false);
    expect(await owner.social.ownProfile(owner.uid)).toMatchObject({
      handle: 'budget_second',
      displayName: 'Another nickname',
      title: 'Renamed favorites',
      preview: ['Budget game 3', 'Budget game 2', 'Budget game 1'],
      published: false,
      hidden: false,
    });
  }, 60000);
  it('protects moderation markers from publisher deletion/recreation and limits reports to the reporter/creator', async () => {
    const owner = await client();
    const reporter = await client();
    await owner.social.publish(owner.uid, publication('reported_list', true), control);
    await reporter.social.report(reporter.uid, owner.uid, 'This profile needs review.');
    await expect(reporter.social.report(reporter.uid, owner.uid, 'Again')).rejects.toThrow(/already reported/);
    await assertFails(getDocs(query(collection(owner.db, 'reports'), limit(20))));
    const moderator = await client();
    await environment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('_owner/config').set({ uid: moderator.uid, email: moderator.email });
    });
    const epoch = (await owner.social.control(owner.uid)).epoch;
    await moderator.social.moderate(owner.uid, true);
    expect((await moderator.social.reports()).reports).toHaveLength(1);
    await expect(
      owner.social.publish(owner.uid, publication('new_name'), await owner.social.control(owner.uid)),
    ).rejects.toThrow(/hidden/);
    await assertFails(
      setDoc(doc(owner.db, 'publicProfiles', owner.uid, 'generations', crypto.randomUUID()), {
        epoch: epoch + 1,
        count: 1,
        uploaded: 0,
        status: 'staging',
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(owner.db, 'publicControls', owner.uid), { epoch: epoch + 2, hidden: false, deleted: false }),
    );
    expect(await reporter.social.profile('reported_list')).toBeNull();
    await assertSucceeds(
      setDoc(doc(moderator.db, 'publicControls', owner.uid), { epoch: epoch + 2, hidden: false, deleted: false }),
    );
  });

  // G9-SEC2 F1: the owner may advance its publication control alone, which left a live profile's epoch behind the
  // control's. A moderation or unpublish step then had to move the profile both to the control's new epoch and to its
  // own epoch + 1, which no request could, so the profile stayed public until an Admin SDK edit.
  it.each([1, 2])(
    'lets the creator hide a live profile after %i standalone owner control bumps, which the owner cannot undo',
    async (bumps) => {
      const owner = await client();
      const guest = await client(true);
      const handle = `bumped_${bumps}_list`;
      await owner.social.publish(owner.uid, publication(handle, true), control);
      const published = (await owner.social.control(owner.uid)).epoch;
      for (let bump = 1; bump <= bumps; bump += 1)
        await assertSucceeds(
          setDoc(doc(owner.db, 'publicControls', owner.uid), {
            epoch: published + bump,
            hidden: false,
            deleted: false,
          }),
        );
      expect(await guest.social.profile(handle)).toMatchObject({ uid: owner.uid, epoch: published });
      const moderator = await client();
      await environment.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc('_owner/config').set({ uid: moderator.uid, email: moderator.email });
      });
      await moderator.social.moderate(owner.uid, true);
      const hidden = published + bumps + 1;
      expect(await guest.social.profile(handle)).toBeNull();
      await environment.withSecurityRulesDisabled(async (context) => {
        expect((await context.firestore().doc(`publicProfiles/${owner.uid}`).get()).data()).toMatchObject({
          published: false,
          listed: false,
          hidden: true,
          epoch: hidden,
        });
        expect((await context.firestore().doc(`publicControls/${owner.uid}`).get()).data()).toEqual({
          epoch: hidden,
          hidden: true,
          deleted: false,
        });
      });
      const profileRef = doc(owner.db, 'publicProfiles', owner.uid);
      const unhide = { published: false, listed: false, hidden: false, updatedAt: serverTimestamp() };
      // The owner cannot clear the control's hidden flag, and its profile's flag must follow the control's.
      await assertFails(
        setDoc(doc(owner.db, 'publicControls', owner.uid), { epoch: hidden + 1, hidden: false, deleted: false }),
      );
      await assertFails(setDoc(profileRef, { ...unhide, epoch: hidden + 1 }, { merge: true }));
      await expect(
        owner.social.publish(owner.uid, publication(handle, true), await owner.social.control(owner.uid)),
      ).rejects.toThrow(/hidden/);
      // Advancing the control alone again does not help: the profile may follow it, but stays hidden and unpublished.
      await assertSucceeds(
        setDoc(doc(owner.db, 'publicControls', owner.uid), { epoch: hidden + 1, hidden: true, deleted: false }),
      );
      const batch = writeBatch(owner.db);
      batch.set(doc(owner.db, 'publicControls', owner.uid), { epoch: hidden + 2, hidden: false, deleted: false });
      batch.set(profileRef, { ...unhide, epoch: hidden + 2 }, { merge: true });
      await assertFails(batch.commit());
      await assertFails(setDoc(profileRef, { ...unhide, epoch: hidden + 1 }, { merge: true }));
      // The profile's epoch never moves back and never passes the control's.
      await assertFails(setDoc(profileRef, { ...unhide, hidden: true, epoch: published }, { merge: true }));
      await assertFails(setDoc(profileRef, { ...unhide, hidden: true, epoch: hidden + 2 }, { merge: true }));
      await assertSucceeds(setDoc(profileRef, { ...unhide, hidden: true, epoch: hidden + 1 }, { merge: true }));
      expect(await guest.social.profile(handle)).toBeNull();
      // The creator can still reverse its own decision.
      await moderator.social.moderate(owner.uid, false);
      expect(await owner.social.control(owner.uid)).toEqual({ epoch: hidden + 2, hidden: false, deleted: false });
    },
    60000,
  );

  it('lets the owner unpublish its live profile after a standalone control bump', async () => {
    const owner = await client();
    const guest = await client(true);
    await owner.social.publish(owner.uid, publication('owner_bumped_list', true), control);
    const published = (await owner.social.control(owner.uid)).epoch;
    await assertSucceeds(
      setDoc(doc(owner.db, 'publicControls', owner.uid), { epoch: published + 1, hidden: false, deleted: false }),
    );
    await owner.social.unpublish(owner.uid, await owner.social.control(owner.uid));
    expect(await guest.social.profile('owner_bumped_list')).toBeNull();
    await environment.withSecurityRulesDisabled(async (context) => {
      expect((await context.firestore().doc(`publicProfiles/${owner.uid}`).get()).data()).toMatchObject({
        published: false,
        hidden: false,
        epoch: published + 2,
      });
    });
  });

  it.each(['has no uid', 'is missing'] as const)(
    'keeps ordinary publishing and withholds creator powers while the owner config %s, then restores them with its uid',
    async (state) => {
      const owner = await client();
      const moderator = await client();
      const guest = await client(true);
      await environment.withSecurityRulesDisabled(async (context) => {
        const ref = context.firestore().doc('_owner/config');
        // Even the owner's own email grants nothing: creator authority is the provisioned uid alone.
        if (state === 'is missing') await ref.delete();
        else await ref.set({ email: moderator.email });
      });
      expect(await owner.social.publish(owner.uid, publication('ordinary_list', true), control)).toMatchObject({
        creator: false,
        published: true,
      });
      expect(await guest.social.profile('ordinary_list')).toMatchObject({ uid: owner.uid, creator: false });
      await assertFails(getDocFromServer(doc(moderator.db, 'ownerAccess', 'status')));
      await assertFails(moderator.social.members());
      await assertFails(moderator.social.reports());
      await assertFails(moderator.social.moderate(owner.uid, true));
      await assertFails(
        owner.social.publish(
          owner.uid,
          { ...publication('ordinary_list', true), creator: true },
          await owner.social.control(owner.uid),
        ),
      );
      expect(await guest.social.profile('ordinary_list')).toMatchObject({
        uid: owner.uid,
        creator: false,
        hidden: false,
      });
      await environment.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc('_owner/config').set({ uid: moderator.uid, email: moderator.email });
      });
      await assertSucceeds(getDocFromServer(doc(moderator.db, 'ownerAccess', 'status')));
      await assertSucceeds(moderator.social.members());
      expect(
        await owner.social.publish(
          owner.uid,
          publication('ordinary_list', true),
          await owner.social.control(owner.uid),
        ),
      ).toMatchObject({ creator: false, published: true });
      await assertFails(
        owner.social.publish(
          owner.uid,
          { ...publication('ordinary_list', true), creator: true },
          await owner.social.control(owner.uid),
        ),
      );
      await moderator.social.moderate(owner.uid, true);
      expect(await guest.social.profile('ordinary_list')).toBeNull();
    },
    60000,
  );

  it('preserves untouched server fields during avatar-only and name-only updates', async () => {
    const owner = await client();
    await owner.social.saveMember(owner.uid, 'My chosen nickname', avatar);
    const newer = { ...avatar, seed: 'c'.repeat(32), palette: 'clay' as const };
    await owner.social.saveMemberAvatar(owner.uid, newer, 'Player');
    expect((await owner.social.member(owner.uid))?.displayName).toBe('My chosen nickname');
    await owner.social.saveMemberName(owner.uid, 'New nickname', avatar);
    expect((await owner.social.member(owner.uid))?.avatar).toEqual(newer);
    await owner.social.saveMember(owner.uid, 'Stale initialization', avatar);
    expect((await owner.social.member(owner.uid))?.displayName).toBe('New nickname');
    expect((await owner.social.member(owner.uid))?.avatar).toEqual(newer);
  });

  it('keeps an unchanged legacy blank-looking member name through publication and icon changes, not renames', async () => {
    const owner = await client();
    await owner.social.saveMember(owner.uid, 'My chosen nickname', avatar);
    await environment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`members/${owner.uid}`).update({ displayName: '\u3164' });
    });
    // Publishing re-saves the stored member name; it writes nothing for an existing member, so it must not refuse.
    await expect(owner.social.saveMember(owner.uid, '\u3164', avatar)).resolves.toBeUndefined();
    const newer = { ...avatar, palette: 'sky' as const };
    await owner.social.saveMemberAvatar(owner.uid, newer, '\u3164');
    await expect(owner.social.saveMemberName(owner.uid, '\u2800', avatar)).rejects.toThrow(/visible letter/);
    expect(await owner.social.member(owner.uid)).toMatchObject({ displayName: '\u3164', avatar: newer });
  });

  it('marks public generations non-publishable before deleting the first batch of entries', async () => {
    const owner = await client();
    const rows = Array.from({ length: 30 }, (_, index) => ({
      ...entry,
      position: index + 1,
      id: `wikidata:Q${index + 1}`,
      sourceId: `Q${index + 1}`,
      sourceUrl: `https://www.wikidata.org/wiki/Q${index + 1}`,
    }));
    let resume: (() => void) | undefined;
    let firstDeletion: (() => void) | undefined;
    const firstBatch = new Promise<void>((resolve) => {
      firstDeletion = resolve;
    });
    let cleaning: Promise<number> | undefined;
    let held = false;
    try {
      await expect(
        owner.social.publish(owner.uid, publication('cleanup_race', false, rows), control, async () => {
          cleaning = owner.social.cleanup(owner.uid, true, async () => {
            if (!held) {
              held = true;
              firstDeletion?.();
              await new Promise<void>((resolve) => {
                resume = resolve;
              });
            }
          });
          await firstBatch;
        }),
      ).rejects.toThrow(/changed elsewhere/);
      expect(await owner.social.ownProfile(owner.uid)).toBeNull();
    } finally {
      resume?.();
      if (cleaning) await cleaning;
    }
  });
});

// REL-13 (docs/intermittents.md): the emulator applied a deleting unpublish's commit but answered ALREADY_EXISTS, which
// the SDK retries, so the transaction ran again and read its own withdrawal. Any client told that an applied commit
// failed with a retryable code runs the transaction again the same way.
describe('a deleting unpublish run again after its commit applied', () => {
  async function runAgainAfterCommit() {
    const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
    const runs = { count: 0 };
    vi.mocked<RunTransaction>(runTransaction).mockImplementationOnce(
      async <T>(db: Firestore, operation: (tx: Transaction) => Promise<T>, options?: TransactionOptions) => {
        const counted = (tx: Transaction) => {
          runs.count += 1;
          return operation(tx);
        };
        await actual.runTransaction(db, counted, options);
        return actual.runTransaction(db, counted, options);
      },
    );
    return runs;
  }
  it('withdraws an account that never published once and finishes', async () => {
    const owner = await client();
    const before = await owner.social.control(owner.uid);
    const runs = await runAgainAfterCommit();
    await owner.social.unpublish(owner.uid, before, true);
    expect(runs.count).toBe(2);
    expect(await owner.social.control(owner.uid)).toEqual({ epoch: before.epoch + 1, hidden: false, deleted: true });
    expect(await owner.social.ownProfile(owner.uid)).toBeNull();
  });
  it('withdraws a live publication once and finishes', async () => {
    const owner = await client();
    await owner.social.publish(owner.uid, publication('withdrawn_once'), control);
    const before = await owner.social.control(owner.uid);
    const runs = await runAgainAfterCommit();
    await owner.social.unpublish(owner.uid, before, true);
    expect(runs.count).toBe(2);
    expect(await owner.social.control(owner.uid)).toEqual({ epoch: before.epoch + 1, hidden: false, deleted: true });
    expect(await owner.social.ownProfile(owner.uid)).toMatchObject({
      published: false,
      listed: false,
      epoch: before.epoch + 1,
    });
  });
  it('still refuses a publication that changed after it was read', async () => {
    const owner = await client();
    const stale = await owner.social.control(owner.uid);
    await owner.social.publish(owner.uid, publication('changed_since'), stale);
    await expect(owner.social.unpublish(owner.uid, stale, true)).rejects.toThrow(
      'This publication changed. Reload before unpublishing.',
    );
    expect(await owner.social.ownProfile(owner.uid)).toMatchObject({ published: true, epoch: stale.epoch + 1 });
  });
});

// REL-13 (docs/intermittents.md): every step of a profile deletion commits and then runs again, as the SDK runs a
// transaction whose applied commit it was told failed.
describe('a profile deletion run again after its commits applied', () => {
  async function runEachAgainAfterCommit() {
    const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
    const replay: RunTransaction = async (db, operation, options) => {
      await actual.runTransaction(db, operation, options);
      return actual.runTransaction(db, operation, options);
    };
    vi.mocked<RunTransaction>(runTransaction).mockImplementation(replay);
  }
  async function reportExists(id: string): Promise<boolean> {
    let exists = false;
    await environment.withSecurityRulesDisabled(async (context) => {
      exists = (await context.firestore().doc(`reports/${id}`).get()).exists;
    });
    return exists;
  }
  async function reported() {
    const owner = await client();
    const target = await client();
    await target.social.publish(target.uid, publication('reported_target'), control);
    await owner.social.report(owner.uid, target.uid, 'This profile needs review.');
    return { owner, id: reportDocumentId(target.uid, owner.uid) };
  }
  it('deletes a withdrawn public copy once and finishes', async () => {
    const owner = await client();
    const profile = await owner.social.publish(owner.uid, publication('deleted_once'), control);
    await owner.social.unpublish(owner.uid, await owner.social.control(owner.uid), true);
    await runEachAgainAfterCommit();
    await owner.social.deleteProfile(owner.uid);
    expect(await owner.social.ownProfile(owner.uid)).toBeNull();
    expect(await handleOwner(profile.handle)).toBeUndefined();
  });
  it("withdraws the account's own report once and finishes", async () => {
    const { owner, id } = await reported();
    // As in online-copy deletion: saving is on, the public copy is withdrawn, then the online copy is deleted.
    await owner.social.saveMember(owner.uid, 'Report deletion fixture', avatar);
    const cloud = new CloudStore(owner.db, owner.uid);
    const head = await cloud.enable(null);
    await owner.social.unpublish(owner.uid, await owner.social.control(owner.uid), true);
    await cloud.revoke(head, true);
    await runEachAgainAfterCommit();
    await owner.social.deleteProfile(owner.uid);
    expect(await reportExists(id)).toBe(false);
  });
  it('still reports a report that is no longer available outside a deletion', async () => {
    const { owner, id } = await reported();
    const moderator = await client();
    await environment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('_owner/config').set({ uid: moderator.uid, email: moderator.email });
    });
    expect(await moderator.social.resolveReport(id)).toBe(true);
    // Only the reporter may read its own missing report (firestore.rules, reports get), so only it reaches this refusal.
    await expect(owner.social.withdrawReport(id)).rejects.toThrow('This report is no longer available.');
  });
  it('still keeps the generation of a live public profile when every cleanup step runs again', async () => {
    const owner = await client();
    const profile = await owner.social.publish(owner.uid, publication('kept_live'), control);
    await runEachAgainAfterCommit();
    expect(await owner.social.cleanup(owner.uid, true)).toBe(0);
    const live = await owner.social.ownProfile(owner.uid);
    expect(live).toMatchObject({ published: true, generation: profile.generation });
  });
});
