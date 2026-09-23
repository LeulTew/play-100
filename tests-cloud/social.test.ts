import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getIdToken, inMemoryPersistence, initializeAuth, reload } from 'firebase/auth';
import { collection, connectFirestoreEmulator, doc, getDocFromServer, getDocs, getFirestore, limit, query, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SocialStore } from '../src/cloud/social-store';
import { CloudStore } from '../src/cloud/cloud-store';
import { ensureAccountActivity } from '../src/cloud/account-lifecycle';
import type { AvatarValue, PublicEntry } from '../src/lib/community';

let environment: RulesTestEnvironment;
const apps: FirebaseApp[] = [];
const avatar: AvatarValue = { version: 1, seed: 'b'.repeat(32), palette: 'moss' };
const entry: PublicEntry = { position: 1, id: 'wikidata:Q123', title: 'Published example', year: 2020, source: 'wikidata', sourceId: 'Q123', sourceUrl: 'https://www.wikidata.org/wiki/Q123', score: 9.5 };
const control = { epoch: 0, hidden: false, deleted: false };
beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-play100', firestore: { host: '127.0.0.1', port: 8188, rules: readFileSync('firestore.rules', 'utf8') } });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc('_owner/config').set({ uid: 'creator-uid', email: 'owner@example.test' });
    await context.firestore().doc('ownerAccess/status').set({ enabled: true });
    await context.firestore().doc('catalog/author').set({ records: { 'trusted-game': { title: 'Trusted original game', year: 2020 } } });
  });
});
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => deleteApp(app))); });
afterAll(async () => { await environment.cleanup(); });

async function client(anonymous = false) {
  const app = initializeApp({ apiKey: 'demo-play100-key', projectId: 'demo-play100' }, crypto.randomUUID());
  apps.push(app);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8188);
  if (anonymous) return { uid: '', email: '', db, social: new SocialStore(db) };
  const user = (await createUserWithEmailAndPassword(auth, `social-${crypto.randomUUID()}@example.test`, 'Emulator-only-passphrase-4382')).user;
  const response = await fetch('http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-play100-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId: user.uid, emailVerified: true }),
  });
  if (!response.ok) throw new Error('The isolated Auth fixture could not be verified.');
  await reload(user); await getIdToken(user, true);
  await ensureAccountActivity(db, user.uid);
  return { uid: user.uid, email: user.email ?? '', db, social: new SocialStore(db) };
}
function publication(handle: string, listed = false, entries = [entry]) {
  return { handle, displayName: 'A chosen nickname', avatar, title: 'My favorites', listed, creator: false, entries };
}
async function stageGeneration(owner: Awaited<ReturnType<typeof client>>, ref: ReturnType<typeof doc>) {
  const registryRef = doc(owner.db, 'publicProfiles', owner.uid, 'metadata', 'registry');
  const registry = await getDocFromServer(registryRef);
  const batch = writeBatch(owner.db);
  batch.set(ref, { epoch: 0, count: 1, uploaded: 0, status: 'staging', createdAt: serverTimestamp() });
  batch.set(registryRef, { ids: [...(registry.exists() ? registry.data().ids : []), ref.id], revision: registry.exists() ? registry.data().revision + 1 : 1 });
  await batch.commit();
}

describe('consented public snapshots, handle claims and moderation', () => {
  it('heals an absent public generation ID before deleting the empty registry', async () => {
    const owner = await client(); const id = crypto.randomUUID();
    await owner.social.unpublish(owner.uid, control, true);
    await environment.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`publicProfiles/${owner.uid}/metadata/registry`).set({ ids: [id], revision: 1 });
    });
    await owner.social.deleteProfile(owner.uid);
    expect((await getDocFromServer(doc(owner.db, 'publicProfiles', owner.uid, 'metadata', 'registry'))).exists()).toBe(false);
  });
  it('does not delete a profile or handle while a present generation is excluded by its missing createdAt', async () => {
    const owner = await client();
    const profile = await owner.social.publish(owner.uid, publication('retained_public'), control);
    await owner.social.unpublish(owner.uid, await owner.social.control(owner.uid), true);
    const before = await owner.social.ownProfile(owner.uid);
    await environment.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`publicProfiles/${owner.uid}/generations/${profile.generation}`).set({
        epoch: 0, count: 1, uploaded: 1, status: 'ready',
      });
    });
    await expect(owner.social.deleteProfile(owner.uid)).rejects.toThrow('Some public copies still need cleanup. Choose Finish deleting to continue.');
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
    expect((await getDocFromServer(doc(owner.db, 'handles', first.handle))).exists()).toBe(false);
    expect((await getDocFromServer(doc(owner.db, 'publicProfiles', owner.uid, 'metadata', 'registry'))).exists()).toBe(false);
    await owner.social.deleteProfile(owner.uid);
    await owner.social.restorePublicationPermission(owner.uid);
    const second = await owner.social.publish(owner.uid, publication('next_bounded_handle'), await owner.social.control(owner.uid));
    expect((await getDocFromServer(doc(owner.db, 'handles', first.handle))).exists()).toBe(false);
    expect((await getDocFromServer(doc(owner.db, 'handles', second.handle))).exists()).toBe(true);
  });
  it('keeps link-only publication out of the directory and never publishes private state', async () => {
    const owner = await client(); const guest = await client(true);
    const published = await owner.social.publish(owner.uid, publication('my_games'), control);
    expect((await guest.social.directory('')).profiles).toEqual([]);
    expect((await guest.social.profile('my_games'))?.uid).toBe(owner.uid);
    const entries = await guest.social.entries(published);
    expect(entries).toEqual([entry]);
    await assertFails(getDocFromServer(doc(guest.db, 'members', owner.uid)));
    await assertFails(getDocFromServer(doc(guest.db, 'syncHeads', owner.uid)));
  });
  it('requires a manual update, atomically changes snapshots and revokes public reads on unpublish', async () => {
    const owner = await client(); const guest = await client(true);
    const first = await owner.social.publish(owner.uid, publication('listed_games', true), control);
    expect((await guest.social.directory('listed')).profiles).toHaveLength(1);
    const next = await owner.social.publish(owner.uid, publication('listed_games', true, [{ ...entry, score: 7 }]), await owner.social.control(owner.uid));
    expect((await guest.social.entries(next))[0]?.score).toBe(7);
    await assertFails(getDocFromServer(doc(guest.db, 'publicProfiles', owner.uid, 'generations', first.generation, 'entries', '1')));
    await owner.social.unpublish(owner.uid, await owner.social.control(owner.uid));
    expect(await guest.social.profile('listed_games')).toBeNull();
    expect((await guest.social.directory('')).profiles).toEqual([]);
    await assertFails(getDocFromServer(doc(guest.db, 'publicProfiles', owner.uid, 'generations', next.generation, 'entries', '1')));
    await expect(owner.social.publish(owner.uid, publication('listed_games'), { epoch: 1, hidden: false, deleted: false })).rejects.toThrow(/changed/);
  });
  it('races two handle claims without granting the same handle to two accounts', async () => {
    const a = await client(); const b = await client();
    const result = await Promise.allSettled([a.social.publish(a.uid, publication('unique_handle'), control), b.social.publish(b.uid, publication('unique_handle'), control)]);
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const guest = await client(true);
    expect([a.uid, b.uid]).toContain((await guest.social.profile('unique_handle'))?.uid);
  });
  it('rejects forged ranks, private fields, role flags and incomplete generations through direct SDK writes', async () => {
    const owner = await client();
    await setDoc(doc(owner.db, 'publicControls', owner.uid), control);
    const generation = crypto.randomUUID();
    const ref = doc(owner.db, 'publicProfiles', owner.uid, 'generations', generation);
    await stageGeneration(owner, ref);
    for (const invalid of [{ ...entry, note: 'Secret' }, { ...entry, collectionRank: 1 }, { ...entry, source: 'collection', sourceId: 'forged-game', id: 'forged-game', sourceUrl: null }, { ...entry, sourceUrl: 'https://evil.invalid/' }]) {
      const batch = writeBatch(owner.db);
      batch.set(doc(ref, 'entries', '1'), invalid);
      batch.update(ref, { uploaded: 1, status: 'ready' });
      await assertFails(batch.commit());
    }
    await assertFails(setDoc(ref, { epoch: 0, count: 1, uploaded: 1, status: 'ready', createdAt: serverTimestamp() }));
    await assertFails(owner.social.publish(owner.uid, { ...publication('fake_owner'), creator: true }, control));
    expect((await getDocFromServer(ref)).data()?.uploaded).toBe(0);
  });
  it.each([2048, 2049])('enforces new public source URL boundary%s through a direct SDK write', async length => {
    const owner = await client();
    const prefix = 'https://www.freetogame.com/';
    const row: PublicEntry = { ...entry, id: 'freetogame:10', source: 'freetogame', sourceId: '10', sourceUrl: prefix + 'a'.repeat(length - prefix.length) };
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
    const owner = await client(); const guest = await client(true);
    const prefix = 'https://www.freetogame.com/';
    const allowed: PublicEntry = { ...entry, id: 'freetogame:10', source: 'freetogame', sourceId: '10', sourceUrl: prefix + 'a'.repeat(2048 - prefix.length) };
    const old = { ...allowed, sourceUrl: prefix + 'a'.repeat(2049 - prefix.length) };
    const profile = await owner.social.publish(owner.uid, publication('historical_link', false, [allowed]), control);
    const path = `publicProfiles/${owner.uid}/generations/${profile.generation}/entries/1`;
    await environment.withSecurityRulesDisabled(async context => { await context.firestore().doc(path).set(old); });
    expect(await guest.social.entries(profile)).toEqual([old]);
    const before = await owner.social.control(owner.uid);
    await expect(owner.social.publish(owner.uid, publication('historical_link', false, [old]), before)).rejects.toThrow(/source link.*2048.*private/i);
    expect(await owner.social.control(owner.uid)).toEqual(before);
    expect(await guest.social.entries(profile)).toEqual([old]);
    await assertFails(setDoc(doc(owner.db, path), allowed));
  });
  it('publishes 200 entries in bounded validated batches and refuses 201', async () => {
    const owner = await client();
    const entries = Array.from({ length: 200 }, (_, index) => ({ ...entry, position: index + 1, id: `wikidata:Q${index + 1}`, sourceId: `Q${index + 1}`, sourceUrl: `https://www.wikidata.org/wiki/Q${index + 1}` }));
    const profile = await owner.social.publish(owner.uid, publication('two_hundred', false, entries), control);
    const guest = await client(true);
    expect(await guest.social.entries(profile)).toHaveLength(200);
    await expect(owner.social.publish(owner.uid, publication('too_many', false, [...entries, { ...entry, position: 201 }]), await owner.social.control(owner.uid))).rejects.toThrow(/200/);
    await owner.social.unpublish(owner.uid, await owner.social.control(owner.uid));
    expect(await owner.social.cleanup(owner.uid, true)).toBe(1);
    expect((await getDocs(query(collection(owner.db, 'publicProfiles', owner.uid, 'generations', profile.generation, 'entries'), limit(200)))).empty).toBe(true);
    expect((await getDocFromServer(doc(owner.db, 'publicProfiles', owner.uid, 'metadata', 'registry'))).data()?.ids).toEqual([]);
  }, 60000);
  it('protects moderation markers from publisher deletion/recreation and limits reports to the reporter/creator', async () => {
    const owner = await client(); const reporter = await client();
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
    await expect(owner.social.publish(owner.uid, publication('new_name'), await owner.social.control(owner.uid))).rejects.toThrow(/hidden/);
    await assertFails(setDoc(doc(owner.db, 'publicProfiles', owner.uid, 'generations', crypto.randomUUID()), {
      epoch: epoch + 1, count: 1, uploaded: 0, status: 'staging', createdAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(owner.db, 'publicControls', owner.uid), { epoch: epoch + 2, hidden: false, deleted: false }));
    expect(await reporter.social.profile('reported_list')).toBeNull();
  });

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

  it('marks public generations non-publishable before deleting the first batch of entries', async () => {
    const owner = await client();
    const rows = Array.from({ length: 30 }, (_, index) => ({ ...entry, position: index + 1, id: `wikidata:Q${index + 1}`, sourceId: `Q${index + 1}`, sourceUrl: `https://www.wikidata.org/wiki/Q${index + 1}` }));
    let resume: (() => void) | undefined;
    let firstDeletion: (() => void) | undefined;
    const firstBatch = new Promise<void>((resolve) => { firstDeletion = resolve; });
    let cleaning: Promise<number> | undefined;
    let held = false;
    try {
      await expect(owner.social.publish(owner.uid, publication('cleanup_race', false, rows), control, async () => {
        cleaning = owner.social.cleanup(owner.uid, true, async () => {
          if (!held) {
            held = true; firstDeletion?.();
            await new Promise<void>((resolve) => { resume = resolve; });
          }
        });
        await firstBatch;
      })).rejects.toThrow(/changed elsewhere/);
      expect(await owner.social.ownProfile(owner.uid)).toBeNull();
    } finally {
      resume?.();
      if (cleaning) await cleaning;
    }
  });
});
