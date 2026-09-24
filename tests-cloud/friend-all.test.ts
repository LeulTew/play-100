import { readFileSync } from 'node:fs';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getIdToken, initializeAuth, inMemoryPersistence, reload } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, disableNetwork, doc, enableNetwork, getDocFromServer, getDocsFromServer,
  deleteDoc, getFirestore, limit, onSnapshot, query, runTransaction, serverTimestamp, setDoc, setLogLevel, Timestamp, where, writeBatch,
} from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FriendAllStore } from '../src/cloud/friend-all-store';
import { FriendStore } from '../src/cloud/friend-store';
import { FriendShelfStore } from '../src/cloud/friend-shelf-store';
import { ensureAccountActivity } from '../src/cloud/account-lifecycle';
import { CloudStore } from '../src/cloud/cloud-store';
import type { FriendAllPolicy } from '../src/lib/friend-all';
import type { FriendShelfEntry } from '../src/lib/friend-shelf-types';
import type { PublicEntry } from '../src/lib/community';
import { emptyPersonalLibrary } from '../src/lib/personal-library';

vi.mock('firebase/firestore', async original => {
  const actual = await original<typeof import('firebase/firestore')>();
  return { ...actual, runTransaction: vi.fn(actual.runTransaction), writeBatch: vi.fn(actual.writeBatch), getDocsFromServer: vi.fn(actual.getDocsFromServer) };
});
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8188').split(':');
const authAddress = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9199';
const projectId = 'demo-play100';
const source = { syncEpoch: 1, remoteRevision: 0 };
const avatar = { version: 1 as const, seed: 'b'.repeat(32), palette: 'moss' as const };
const apps: FirebaseApp[] = [];
let environment: RulesTestEnvironment;
beforeAll(async () => {
  if (!['127.0.0.1', 'localhost'].includes(host ?? '') || !/^(127[.]0[.]0[.]1|localhost):[0-9]+$/.test(authAddress)) throw new Error('All-sharing SDK fixtures require local emulator endpoints.');
  setLogLevel('silent');
  environment = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
});
beforeEach(async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  vi.mocked(runTransaction).mockReset().mockImplementation(actual.runTransaction);
  vi.mocked(writeBatch).mockReset().mockImplementation(actual.writeBatch);
  vi.mocked(getDocsFromServer).mockReset().mockImplementation(actual.getDocsFromServer);
  await environment.clearFirestore();
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await Promise.all(apps.splice(0).map(app => deleteApp(app))); });
afterAll(async () => { await environment.cleanup(); });
async function seed(path: string, data: Record<string, unknown>) {
  await environment.withSecurityRulesDisabled(async context => { await context.firestore().doc(path).set(data); });
}
async function client() {
  const app = initializeApp({ apiKey: 'demo-play100-key', projectId }, crypto.randomUUID()); apps.push(app);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence }); connectAuthEmulator(auth, `http://${authAddress}`, { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, host, Number(port));
  const user = (await createUserWithEmailAndPassword(auth, `all-${crypto.randomUUID()}@example.test`, 'Emulator-only-passphrase-4382')).user;
  const response = await fetch(`http://${authAddress}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-play100-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId: user.uid, emailVerified: true }),
  });
  if (!response.ok) throw new Error('Could not verify isolated All-sharing account.');
  await reload(user); await getIdToken(user, true); await ensureAccountActivity(db, user.uid);
  await seed(`syncHeads/${user.uid}`, { format: 1, epoch: 1, revision: 0, enabled: true, deleted: false, current: null, previous: null, updatedAt: Timestamp.now() });
  await seed(`publicProfiles/${user.uid}`, { uid: user.uid, published: true, hidden: false });
  await seed(`members/${user.uid}`, { uid: user.uid, displayName: 'All sharing fixture', avatar, consentVersion: 1, gameCount: 0, rankCount: 0, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  return { uid: user.uid, db, auth, all: new FriendAllStore(db), friends: new FriendStore(db), shelf: new FriendShelfStore(db), cloud: new CloudStore(db, user.uid) };
}
type Client = Awaited<ReturnType<typeof client>>;
async function enable(a: Client, origin: 'default' | 'explicit' = 'default'): Promise<FriendAllPolicy> {
  const policy = await a.all.setPolicy(a.uid, true, origin, await a.all.controls(a.uid), () => true);
  if (!policy) throw new Error('Expected a confirmed All-sharing policy.');
  await a.friends.saveIdentity(a.uid, { displayName: 'All sharing fixture', avatar }, (await a.friends.identity(a.uid))?.revision ?? 0);
  return policy;
}
async function connect(a: Client, b: Client) {
  const request = await a.friends.sendRequest(a.uid, b.uid);
  await b.friends.respond(b.uid, a.uid, 'accept', request.epoch);
}
const games = (count: number): FriendShelfEntry[] => Array.from({ length: count }, (_, index) => ({
  id: `wikidata:Q${index + 1}`, title: `Fixture ${String(index + 1).padStart(5, '0')}`, year: 2020, source: 'wikidata',
  sourceId: `Q${index + 1}`, sourceUrl: `https://www.wikidata.org/wiki/Q${index + 1}`,
}));
const ranks = (count: number): PublicEntry[] => games(count).map((entry, index) => ({ ...entry, position: index + 1, score: index === 0 ? 0 : null }));

describe('All-sharing bounded SDK transport', () => {
  it('batch-deletes known legacy rows without per-row transactions and denies an uncounted concurrent format3 deletion', async () => {
    const a = await client(); const policy = await enable(a);
    await a.all.setPolicy(a.uid, false, 'explicit', await a.all.controls(a.uid), () => true);
    const ids = Array.from({ length: 5 }, (_, index) => `manual:legacy-${index}`);
    for (const [index, id] of ids.entries()) await seed(`friendAllGames/${a.uid}/entries/${id}`, {
      format: 2, epoch: policy.epoch, token: crypto.randomUUID(), step: index + 1, active: false, entry: null,
    });
    const transactions = vi.mocked(runTransaction).mock.calls.length;
    const batches = vi.mocked(writeBatch).mock.calls.length;
    expect(await a.all.cleanupPage(a.uid, 'games')).toEqual({ deleted: 5, done: false });
    expect(vi.mocked(runTransaction).mock.calls.length).toBe(transactions);
    expect(vi.mocked(writeBatch).mock.calls.length - batches).toBe(2);
    const ref = doc(a.db, 'friendAllGames', a.uid, 'entries', games(1)[0]!.id);
    const token = crypto.randomUUID();
    await seed(ref.path, { format: 2, epoch: policy.epoch, token, step: 1, active: true, entry: games(1)[0] });
    const observed = await getDocsFromServer(query(collection(a.db, 'friendAllGames', a.uid, 'entries'), limit(100)));
    await seed(ref.path, { format: 3, epoch: policy.epoch, token, step: 1, active: true, entry: games(1)[0] });
    await seed(`friendAllJobs/${a.uid}/views/games`, {
      format: 3, epoch: policy.epoch, policyRevision: policy.revision, source, token, digest: 'a'.repeat(64),
      targetCount: 1, count: 1, total: 1, applied: 1, last: [ref.id], headRevision: 1, updatedAt: Timestamp.now(),
    });
    const staleBatch = writeBatch(a.db);
    observed.docs.forEach(row => staleBatch.delete(row.ref));
    await assertFails(staleBatch.commit());
    expect((await getDocFromServer(ref)).data()?.format).toBe(3);
    expect((await getDocFromServer(doc(a.db, 'friendAllJobs', a.uid, 'views', 'games'))).data()?.count).toBe(1);
  });

  it('migrates an old head automatically and rejects same-epoch frozen rows or an unfiltered peer query on the new head', async () => {
    const a = await client(); const b = await client();
    const policy = await enable(a); await enable(b); await connect(a, b);
    const token = crypto.randomUUID(); const value = games(1)[0]!;
    const base = { epoch: policy.epoch, policyRevision: policy.revision, source };
    await seed(`friendAllHeads/${a.uid}/views/games`, {
      ...base, format: 2, revision: 2, status: 'ready', count: 1, digest: 'a'.repeat(64), updatedAt: Timestamp.now(),
    });
    await seed(`friendAllJobs/${a.uid}/views/games`, {
      ...base, format: 2, token, digest: 'a'.repeat(64), targetCount: 1, count: 1, total: 1, applied: 1, last: [value.id], headRevision: 1, updatedAt: Timestamp.now(),
    });
    await seed(`friendAllGames/${a.uid}/entries/${value.id}`, { format: 2, epoch: policy.epoch, token, step: 1, active: true, entry: value });
    expect((await b.all.page(a.uid, 'games')).entries).toEqual([value]);
    expect((await a.all.publish(a.uid, 'games', [value], policy, source, () => true)).format).toBe(3);
    const legacy = games(2)[1]!;
    await seed(`friendAllGames/${a.uid}/entries/${legacy.id}`, { format: 2, epoch: policy.epoch, token, step: 2, active: true, entry: legacy });
    await assertFails(getDocFromServer(doc(b.db, 'friendAllGames', a.uid, 'entries', legacy.id)));
    await assertFails(getDocsFromServer(query(collection(b.db, 'friendAllGames', a.uid, 'entries'),
      where('epoch', '==', policy.epoch), where('active', '==', true), limit(25))));
    expect((await b.all.page(a.uid, 'games')).entries).toEqual([value]);
    expect((await getDocFromServer(doc(a.db, 'friendAllGames', a.uid, 'entries', legacy.id))).exists()).toBe(true);
    await deleteDoc(doc(a.db, 'friendAllGames', a.uid, 'entries', legacy.id));
    expect((await getDocFromServer(doc(a.db, 'friendAllJobs', a.uid, 'views', 'games'))).data()?.count).toBe(1);
  });

  it('never resets the physical row count on a new policy epoch or frees it without an actual row deletion', async () => {
    const a = await client(); const policy = await enable(a);
    await a.all.publish(a.uid, 'games', games(1), policy, source, () => true);
    const fresh = await a.all.setPolicy(a.uid, true, 'explicit', await a.all.controls(a.uid), () => true);
    if (!fresh) throw new Error('The next policy is missing.');
    const headRef = doc(a.db, 'friendAllHeads', a.uid, 'views', 'games');
    const jobRef = doc(a.db, 'friendAllJobs', a.uid, 'views', 'games');
    const oldHead = (await getDocFromServer(headRef)).data()!;
    const oldJob = (await getDocFromServer(jobRef)).data()!;
    const token = crypto.randomUUID();
    const reset = writeBatch(a.db);
    reset.set(headRef, { ...oldHead, epoch: fresh.epoch, policyRevision: fresh.revision, revision: oldHead.revision + 1, status: 'updating', count: 0, updatedAt: serverTimestamp() });
    reset.set(jobRef, { ...oldJob, epoch: fresh.epoch, policyRevision: fresh.revision, token, count: 0, total: 0, targetCount: 0, applied: 0, last: [], headRevision: oldHead.revision + 1, updatedAt: serverTimestamp() });
    await assertFails(reset.commit());
    expect((await getDocFromServer(jobRef)).data()?.count).toBe(1);
    await assertFails(deleteDoc(doc(a.db, 'friendAllGames', a.uid, 'entries', games(1)[0]!.id)));
    await a.all.publish(a.uid, 'games', games(2), fresh, source, () => true);
    expect((await getDocFromServer(jobRef)).data()?.count).toBe(2);
  });

  it('denies a counted create beyond ten thousand while allowing an in-place replacement at the same counter value', async () => {
    const a = await client(); const policy = await enable(a);
    await a.all.publish(a.uid, 'games', games(1), policy, source, () => true);
    const jobRef = doc(a.db, 'friendAllJobs', a.uid, 'views', 'games');
    const headRef = doc(a.db, 'friendAllHeads', a.uid, 'views', 'games');
    const job = (await getDocFromServer(jobRef)).data()!;
    const head = (await getDocFromServer(headRef)).data()!;
    const token = crypto.randomUUID();
    await seed(jobRef.path, { ...job, token, count: 10000, total: 1, targetCount: 10000, applied: 0, last: [], headRevision: head.revision + 1 });
    await seed(headRef.path, { ...head, status: 'updating', revision: head.revision + 1, count: 0 });
    const write = (value: FriendShelfEntry, count: number) => {
      const batch = writeBatch(a.db);
      batch.set(doc(a.db, 'friendAllGames', a.uid, 'entries', value.id), { format: 3, epoch: policy.epoch, token, step: 1, active: true, entry: value });
      batch.update(jobRef, { count, applied: 1, last: [value.id], updatedAt: serverTimestamp() });
      return batch.commit();
    };
    await assertFails(write(games(2)[1]!, 10001));
    await write({ ...games(1)[0]!, title: 'Same counted slot' }, 10000);
    expect((await getDocFromServer(jobRef)).data()?.count).toBe(10000);
  });

  it('surfaces a rejected counted begin when its one legacy fallback is also denied, without creating a format2 job', async () => {
    const a = await client(); const policy = await enable(a);
    const controls = a.all.controls.bind(a.all);
    vi.spyOn(a.all, 'controls').mockImplementationOnce(async uid => {
      const prior = await controls(uid);
      await a.friends.saveSettings(uid, { enabled: false, selectedIds: [] }, prior.ranking!);
      return prior;
    });
    await expect(a.all.publish(a.uid, 'games', games(1), policy, source, () => true))
      .rejects.toThrow('Sharing could not start. Refresh the page, then try again.');
    expect((await getDocFromServer(doc(a.db, 'friendAllJobs', a.uid, 'views', 'games'))).exists()).toBe(false);
    expect((await getDocFromServer(doc(a.db, 'friendAllHeads', a.uid, 'views', 'games'))).exists()).toBe(false);
  });

  it('creates the new default atomically, publishes both safe paths, and allows bounded accepted-friend reads only', async () => {
    const a = await client(); const b = await client(); const stranger = await client();
    const policy = await enable(a); await enable(b); await connect(a, b);
    expect(policy).toMatchObject({ enabled: true, origin: 'default', syncEpoch: 1 });
    expect(await a.all.controls(a.uid)).toMatchObject({ ranking: { enabled: true, selectedIds: [] }, shelf: { enabled: true, selectedIds: [], consentSyncEpoch: 1 } });
    await a.all.publish(a.uid, 'games', games(3), policy, source, () => true);
    await a.all.publish(a.uid, 'ranking', ranks(3), policy, source, () => true);
    expect((await b.all.page(a.uid, 'games')).entries).toEqual(games(3));
    expect((await b.all.page(a.uid, 'ranking')).entries).toEqual(ranks(3));
    expect((await b.all.exact(a.uid, 'ranking', ['wikidata:Q3', 'wikidata:Q90'])).resolvedIds).toEqual(['wikidata:Q3', 'wikidata:Q90']);
    await assertFails(stranger.all.page(a.uid, 'games'));
    await assertFails(getDocsFromServer(collection(b.db, 'friendAllGames', a.uid, 'entries')));
    await assertFails(getDocsFromServer(query(collection(b.db, 'friendAllGames', a.uid, 'entries'), where('active', '==', true), where('epoch', '==', policy.epoch), limit(26))));
    await assertFails(getDocFromServer(doc(b.db, 'friendAllPolicies', a.uid)));
    await assertFails(getDocFromServer(doc(b.db, 'friendAllJobs', a.uid, 'views', 'games')));
  });
  it('does not default an existing off/custom setup and explicitly transitions both scopes without changing public publication', async () => {
    const a = await client();
    await a.friends.initialize(a.uid);
    expect(await a.all.setPolicy(a.uid, true, 'default', await a.all.controls(a.uid), () => true)).toBeNull();
    expect((await a.friends.settings(a.uid))?.enabled).toBe(false);
    const policy = await enable(a, 'explicit');
    expect(policy.origin).toBe('explicit');
    expect((await getDocFromServer(doc(a.db, 'publicProfiles', a.uid))).data()?.published).toBe(true);
    const stopped = await a.all.setPolicy(a.uid, false, 'explicit', await a.all.controls(a.uid), () => true);
    expect(stopped?.enabled).toBe(false);
    expect(await a.all.setPolicy(a.uid, true, 'default', await a.all.controls(a.uid), () => true)).toMatchObject({ enabled: false });
  });
  it('converges a first friend action and the automatic default on one default policy in either order', async () => {
    const automaticFirst = await client(); const friendFirst = await client(); const racing = await client();
    const automatic = await automaticFirst.all.setPolicy(automaticFirst.uid, true, 'default', await automaticFirst.all.controls(automaticFirst.uid), () => true);
    expect(await automaticFirst.all.startDefault(automaticFirst.uid, () => true)).toEqual(automatic);
    const started = await friendFirst.all.startDefault(friendFirst.uid, () => true);
    expect(started).toMatchObject({ enabled: true, origin: 'default', epoch: 1, revision: 1 });
    expect(await friendFirst.all.setPolicy(friendFirst.uid, true, 'default', await friendFirst.all.controls(friendFirst.uid), () => true)).toEqual(started);
    const controls = await racing.all.controls(racing.uid);
    const [friendAction, automaticDefault] = await Promise.all([
      racing.all.startDefault(racing.uid, () => true), racing.all.setPolicy(racing.uid, true, 'default', controls, () => true),
    ]);
    expect(friendAction).toEqual(automaticDefault);
    for (const actor of [automaticFirst, friendFirst, racing]) {
      expect(await actor.all.controls(actor.uid)).toMatchObject({
        policy: { enabled: true, origin: 'default', epoch: 1, revision: 1 }, ranking: { enabled: true, selectedIds: [] }, shelf: { enabled: true, selectedIds: [] },
      });
      expect(await actor.friends.initialize(actor.uid)).toMatchObject({ enabled: true, epoch: 1, revision: 1 });
    }
    const legacy = await client();
    await legacy.friends.initialize(legacy.uid);
    expect(await legacy.all.startDefault(legacy.uid, () => true)).toBeNull();
    expect(await legacy.all.controls(legacy.uid)).toMatchObject({ policy: null, ranking: { enabled: false } });
  });
  it('exposes all205 entries across pages and updates one score without rewriting other rows', async () => {
    const a = await client(); const b = await client(); const policy = await enable(a); await enable(b); await connect(a, b);
    const entries = ranks(205);
    await a.all.publish(a.uid, 'ranking', entries, policy, source, () => true);
    let page = await b.all.page(a.uid, 'ranking');
    const received = [...page.entries];
    while (page.cursor) { page = await b.all.page(a.uid, 'ranking', page.cursor, page.head.revision); received.push(...page.entries); }
    expect(received).toEqual(entries);
    const unchanged = await getDocFromServer(doc(a.db, 'friendAllRankings', a.uid, 'entries', 'wikidata:Q204'));
    entries[204] = { ...entries[204]!, score: 9.2 };
    const batches = vi.mocked(writeBatch).mock.calls.length;
    const queries = vi.mocked(getDocsFromServer).mock.calls.length;
    await a.all.publish(a.uid, 'ranking', entries, policy, source, () => true);
    expect(vi.mocked(writeBatch).mock.calls.length - batches).toBe(1);
    expect(vi.mocked(getDocsFromServer).mock.calls.length - queries).toBe(1);
    expect((await getDocFromServer(unchanged.ref)).data()).toEqual(unchanged.data());
    expect((await b.all.exact(a.uid, 'ranking', ['wikidata:Q205'])).entries).toEqual([entries[204]]);
  }, 60000);
  it('denies offline writes before transaction RPCs and current-source or old-control changes before publication', async () => {
    const a = await client(); const policy = await enable(a);
    await disableNetwork(a.db);
    await expect(a.all.publish(a.uid, 'games', games(1), policy, source, () => true)).rejects.toThrow();
    await enableNetwork(a.db);
    expect(await a.all.head(a.uid, 'games')).toBeNull();
    await a.friends.saveSettings(a.uid, { enabled: false, selectedIds: [] }, (await a.friends.settings(a.uid))!);
    await expect(a.all.publish(a.uid, 'games', games(1), policy, source, () => true)).rejects.toThrow();
  });
  it('rechecks a cold no-op against both legacy controls inside its authoritative read transaction', async () => {
    const a = await client(); const policy = await enable(a);
    await a.all.publish(a.uid, 'games', games(3), policy, source, () => true);
    const fresh = new FriendAllStore(a.db); const controls = fresh.controls.bind(fresh);
    vi.spyOn(fresh, 'controls').mockImplementationOnce(async uid => {
      const old = await controls(uid);
      await a.friends.saveSettings(uid, { enabled: false, selectedIds: [] }, old.ranking!);
      return old;
    });
    const queries = vi.mocked(getDocsFromServer).mock.calls.length;
    await expect(fresh.publish(a.uid, 'games', games(3), policy, source, () => true)).rejects.toMatchObject({ code: 'conflict' });
    expect(vi.mocked(getDocsFromServer).mock.calls.length).toBe(queries);
  });
  it('revokes an already mounted direct legacy control listener on an unchanged old-client Stop write', async () => {
    const a = await client(); const b = await client(); const policy = await enable(a); await enable(b); await connect(a, b);
    await a.all.publish(a.uid, 'games', games(1), policy, source, () => true);
    let opened = false; let revoked = false;
    const stop = onSnapshot(doc(b.db, 'friendSettings', a.uid), snapshot => { if (!snapshot.metadata.fromCache) opened = snapshot.data()?.enabled === true; }, () => { revoked = true; });
    try {
      await vi.waitFor(() => expect(opened).toBe(true));
      await a.friends.saveSettings(a.uid, { enabled: false, selectedIds: [] }, (await a.friends.settings(a.uid))!);
      await vi.waitFor(() => expect(revoked).toBe(true), { timeout: 3000 });
      await assertFails(b.all.page(a.uid, 'games'));
    } finally { stop(); }
  });
  it('revokes the mounted All head when the existing private saving head is paused', async () => {
    const a = await client(); const b = await client(); const policy = await enable(a); await enable(b); await connect(a, b);
    await a.all.publish(a.uid, 'games', games(1), policy, source, () => true);
    let opened = false; let revoked = false;
    const stop = b.all.watchHead(a.uid, 'games', head => { opened = head?.status === 'ready'; }, () => { revoked = true; });
    try {
      await vi.waitFor(() => expect(opened).toBe(true));
      await a.cloud.revoke(await a.cloud.head());
      await vi.waitFor(() => expect(revoked).toBe(true), { timeout: 3000 });
      await assertFails(b.all.page(a.uid, 'games'));
    } finally { stop(); }
  });
  it.each(['games', 'ranking'] as const)('publishes the full10000 %s with bounded rows and reads its tail without a full friend download', async kind => {
    const a = await client(); const b = await client(); const policy = await enable(a); await enable(b); await connect(a, b);
    const entries = (kind === 'games' ? games(10_000) : ranks(10_000)).map(entry => ({ ...entry, title: 'T'.repeat(200) }));
    const writesBefore = vi.mocked(writeBatch).mock.calls.length;
    const head = await a.all.publish(a.uid, kind, entries, policy, source, () => true);
    expect(head.count).toBe(10_000);
    expect(vi.mocked(writeBatch).mock.calls.length - writesBefore).toBe(10000);
    const first = await b.all.page(a.uid, kind);
    expect(first.entries).toHaveLength(25);
    expect(first.head.count).toBe(10_000);
    const last = await b.all.exact(a.uid, kind, ['wikidata:Q9999', 'wikidata:Q10000']);
    expect(last.entries).toEqual([entries[9998], entries[9999]]);
    const stored = await getDocFromServer(doc(a.db, kind === 'games' ? 'friendAllGames' : 'friendAllRankings', a.uid, 'entries', 'wikidata:Q10000'));
    expect(JSON.stringify(stored.data()).length).toBeLessThan(4000);
    expect(Object.keys((await getDocFromServer(doc(a.db, 'friendAllJobs', a.uid, 'views', kind))).data() ?? {})).not.toContain('ids');
    const cold = new FriendAllStore(a.db);
    const queries = vi.mocked(getDocsFromServer).mock.calls.length; const writes = vi.mocked(writeBatch).mock.calls.length;
    expect(await cold.publish(a.uid, kind, entries, policy, source, () => true)).toEqual(head);
    expect(vi.mocked(getDocsFromServer).mock.calls.length - queries).toBe(0);
    expect(vi.mocked(writeBatch).mock.calls.length - writes).toBe(0);
  }, 180000);
  it('keeps strict create/update field guards, progress counters and source barriers', async () => {
    const a = await client(); const policy = await enable(a);
    await a.all.publish(a.uid, 'games', games(1), policy, source, () => true);
    const row = doc(a.db, 'friendAllGames', a.uid, 'entries', 'wikidata:Q1');
    const original = (await getDocFromServer(row)).data()!;
    const job = doc(a.db, 'friendAllJobs', a.uid, 'views', 'games');
    await assertFails(setDoc(row, { ...original, entry: { ...original.entry, note: 'not allowed' } }));
    await assertFails(setDoc(row, { ...original, entry: { ...original.entry, title: 'x'.repeat(100000) } }));
    const forgedProgress = writeBatch(a.db);
    forgedProgress.update(job, { applied: 2, count: 2, last: ['wikidata:Q2'], updatedAt: serverTimestamp() });
    await assertFails(forgedProgress.commit());
    const replay = writeBatch(a.db); replay.set(row, original);
    await assertFails(replay.commit());
    const noPulse = writeBatch(a.db);
    noPulse.update(doc(a.db, 'syncHeads', a.uid), { enabled: false, epoch: 2, revision: 1, updatedAt: serverTimestamp() });
    await assertFails(noPulse.commit());
    await a.cloud.revoke(await a.cloud.head());
    await expect(a.all.publish(a.uid, 'games', games(1), policy, source, () => true)).rejects.toThrow();
  });
  it('resumes an interrupted publication and lets All membership remove and re-add without a selection journal', async () => {
    const a = await client(); const b = await client(); const policy = await enable(a); await enable(b); await connect(a, b);
    let keepWorking = true;
    const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
    vi.mocked(writeBatch).mockImplementationOnce(db => {
      const batch = actual.writeBatch(db);
      const commit = batch.commit.bind(batch);
      batch.commit = async () => { await commit(); keepWorking = false; };
      return batch;
    });
    await expect(a.all.publish(a.uid, 'games', games(6), policy, source, () => keepWorking)).rejects.toThrow();
    expect((await a.all.head(a.uid, 'games'))?.status).toBe('updating');
    await expect(b.all.page(a.uid, 'games')).rejects.toThrow();
    const fresh = new FriendAllStore(a.db);
    await fresh.publish(a.uid, 'games', games(6), policy, source, () => true);
    expect((await b.all.page(a.uid, 'games')).entries).toEqual(games(6));
    await fresh.publish(a.uid, 'games', games(5), policy, source, () => true);
    expect((await b.all.exact(a.uid, 'games', ['wikidata:Q6'])).entries).toEqual([]);
    await fresh.publish(a.uid, 'games', games(6), policy, source, () => true);
    expect((await b.all.exact(a.uid, 'games', ['wikidata:Q6'])).entries).toEqual([games(6)[5]]);
    await fresh.publish(a.uid, 'games', [], policy, source, () => true);
    expect(await b.all.page(a.uid, 'games')).toMatchObject({ entries: [], head: { count: 0, status: 'ready' } });
  });
  it('retains server progress across resource exhaustion and a fresh store without repeating completed rows', async () => {
    const a = await client(); const b = await client(); const policy = await enable(a); await enable(b); await connect(a, b);
    await a.all.publish(a.uid, 'games', games(6), policy, source, () => true);
    const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
    vi.mocked(writeBatch).mockImplementationOnce(db => {
      const batch = actual.writeBatch(db); const commit = batch.commit.bind(batch);
      batch.commit = async () => { await commit(); throw Object.assign(new Error('Synthetic quota after acknowledged progress'), { code: 'resource-exhausted' }); };
      return batch;
    });
    await expect(a.all.publish(a.uid, 'ranking', ranks(6), policy, source, () => true)).rejects.toMatchObject({ code: 'resource-exhausted' });
    const jobRef = doc(a.db, 'friendAllJobs', a.uid, 'views', 'ranking');
    const pending = (await getDocFromServer(jobRef)).data()!;
    expect(pending).toMatchObject({ applied: 1, total: 6, count: 1 });
    expect(await a.all.progress(a.uid, 'games')).toMatchObject({ ready: true, targetCount: 6 });
    expect(await a.all.progress(a.uid, 'ranking')).toMatchObject({ ready: false, applied: 1, total: 6 });
    const firstRow = doc(a.db, 'friendAllRankings', a.uid, 'entries', 'wikidata:Q1');
    const unchanged = (await getDocFromServer(firstRow)).data();
    const fresh = new FriendAllStore(a.db);
    const writes = vi.mocked(writeBatch).mock.calls.length;
    await fresh.publish(a.uid, 'ranking', ranks(6), policy, source, () => true);
    expect(vi.mocked(writeBatch).mock.calls.length - writes).toBe(5);
    expect((await getDocFromServer(jobRef)).data()).toMatchObject({ token: pending.token, applied: 6, total: 6, count: 6 });
    expect((await getDocFromServer(firstRow)).data()).toEqual(unchanged);
    expect((await b.all.page(a.uid, 'ranking')).entries).toEqual(ranks(6));
  });
  it('atomically pulses both ready paths on a real private commit and never projects its note', async () => {
    const a = await client(); const b = await client(); const policy = await enable(a); await enable(b); await connect(a, b);
    await a.all.publish(a.uid, 'games', games(1), policy, source, () => true);
    await a.all.publish(a.uid, 'ranking', ranks(1), policy, source, () => true);
    const state = emptyPersonalLibrary();
    const game = games(1)[0]!;
    state.records[game.id] = { ...game, collectionRank: null, studio: null, genre: null };
    state.ranking.push({ id: game.id, score: 8.2, manualPosition: null, note: 'Strictly private fixture note' });
    const current = await a.cloud.head();
    const saved = await a.cloud.upload(state, current!);
    expect(await a.all.head(a.uid, 'games')).toMatchObject({ status: 'updating' });
    expect(await a.all.head(a.uid, 'ranking')).toMatchObject({ status: 'updating' });
    await expect(b.all.page(a.uid, 'games')).rejects.toMatchObject({ code: 'unavailable' });
    await expect(b.all.page(a.uid, 'ranking')).rejects.toMatchObject({ code: 'unavailable' });
    await assertFails(getDocFromServer(doc(b.db, 'friendAllRankings', a.uid, 'entries', game.id)));
    const nextSource = { syncEpoch: saved.epoch, remoteRevision: saved.revision };
    await a.all.publish(a.uid, 'games', games(1), policy, nextSource, () => true);
    await a.all.publish(a.uid, 'ranking', [{ ...ranks(1)[0]!, score: 8.2 }], policy, nextSource, () => true);
    const result = await b.all.page(a.uid, 'ranking');
    expect(result.entries).toMatchObject([{ score: 8.2 }]);
    expect(JSON.stringify(result)).not.toContain('Strictly private');
  });
  it.each(['never', 'selected', 'off', 'old-stop'] as const)('does not freeze legacy private Pause when All is %s', async state => {
    const a = await client();
    if (state === 'selected') await a.friends.initialize(a.uid);
    if (state === 'off' || state === 'old-stop') {
      const policy = await enable(a);
      await a.all.publish(a.uid, 'games', games(1), policy, source, () => true);
      if (state === 'off') await a.all.setPolicy(a.uid, false, 'explicit', await a.all.controls(a.uid), () => true);
      else await a.friends.saveSettings(a.uid, { enabled: false, selectedIds: [] }, (await a.friends.settings(a.uid))!);
    }
    const oldPause = writeBatch(a.db);
    oldPause.update(doc(a.db, 'syncHeads', a.uid), { enabled: false, epoch: 2, revision: 1, updatedAt: serverTimestamp() });
    await oldPause.commit();
    expect((await a.cloud.head())?.enabled).toBe(false);
  });
  it('revokes and completely cleans both All paths before full-account deletion', async () => {
    const a = await client(); const b = await client(); const policy = await enable(a); await enable(b); await connect(a, b);
    await a.all.publish(a.uid, 'games', games(27), policy, source, () => true);
    await a.all.publish(a.uid, 'ranking', ranks(27), policy, source, () => true);
    expect((await a.all.exportOwn(a.uid)).policy?.enabled).toBe(true);
    await assertFails(a.friends.revokeForDeletion(a.uid));
    await a.all.revokeForDeletion(a.uid); await a.friends.revokeForDeletion(a.uid); await a.shelf.revokeForDeletion(a.uid);
    await assertFails(b.all.page(a.uid, 'games')); await assertFails(b.all.exact(a.uid, 'ranking', ['wikidata:Q1']));
    for (const kind of ['games', 'ranking'] as const) {
      expect(await a.all.cleanupPage(a.uid, kind)).toEqual({ deleted: 27, done: false });
      expect(await a.all.cleanupPage(a.uid, kind)).toEqual({ deleted: 0, done: true });
      expect(await a.all.head(a.uid, kind)).toBeNull();
    }
    expect(await a.all.policy(a.uid)).toMatchObject({ deleted: true, enabled: false });
    await expect(a.all.setPolicy(a.uid, true, 'explicit', await a.all.controls(a.uid), () => true)).rejects.toMatchObject({ code: 'deleted' });
  });
  it('finishes All cleanup when a view was never published and when an earlier attempt already removed it', async () => {
    const a = await client(); const policy = await enable(a);
    await a.all.publish(a.uid, 'games', games(1), policy, source, () => true);
    await a.all.setPolicy(a.uid, false, 'explicit', await a.all.controls(a.uid), () => true);
    expect(await a.all.head(a.uid, 'ranking')).toBeNull();
    expect(await a.all.cleanupPage(a.uid, 'ranking')).toEqual({ deleted: 0, done: true });
    expect(await a.all.cleanupPage(a.uid, 'games')).toEqual({ deleted: 1, done: false });
    expect(await a.all.cleanupPage(a.uid, 'games')).toEqual({ deleted: 0, done: true });
    expect(await a.all.cleanupPage(a.uid, 'games')).toEqual({ deleted: 0, done: true });
    for (const kind of ['games', 'ranking'] as const) {
      expect(await a.all.head(a.uid, kind)).toBeNull();
      expect((await getDocFromServer(doc(a.db, 'friendAllJobs', a.uid, 'views', kind))).exists()).toBe(false);
    }
  });
  it.each(['collection', 'wikidata', 'steam', 'freetogame', 'manual'] as const)('validates both worst-size %s records within the bounded write budget', async type => {
    const a = await client(); const b = await client(); const policy = await enable(a); await enable(b); await connect(a, b);
    const entries: FriendShelfEntry[] = Array.from({ length: 2 }, (_, index) => {
      const length = type === 'collection' ? 200 : 200 - type.length - 1;
      const sourceId = (type === 'wikidata' ? 'Q' : '') + '8'.repeat(length - 1 - Number(type === 'wikidata')) + String(index + 1);
      return { id: type === 'collection' ? sourceId : `${type}:${sourceId}`, sourceId, source: type, title: 'T'.repeat(200), year: 2100,
        sourceUrl: type === 'wikidata' ? `https://www.wikidata.org/wiki/${sourceId}` : type === 'steam' ? `https://store.steampowered.com/app/${sourceId}/` :
          type === 'freetogame' ? 'https://www.freetogame.com/' + 'a'.repeat(2048 - 'https://www.freetogame.com/'.length) : null };
    });
    if (type === 'collection') await seed('catalog/author', { records: Object.fromEntries(entries.map(entry => [entry.id, { title: entry.title, year: entry.year }])) });
    await a.all.publish(a.uid, 'games', entries, policy, source, () => true);
    const scores = entries.map((entry, index) => ({ ...entry, position: index + 1, score: index === 0 ? 0 : null }));
    await a.all.publish(a.uid, 'ranking', scores, policy, source, () => true);
    expect((await b.all.page(a.uid, 'games')).entries).toEqual(entries);
    expect((await b.all.page(a.uid, 'ranking')).entries).toEqual(scores);
  });
});
