import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getIdToken, initializeAuth, inMemoryPersistence, reload } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, disableNetwork, doc, enableNetwork, getDocFromServer, getDocsFromServer, getFirestore, limit, orderBy, query,
  runTransaction, serverTimestamp, setDoc, setLogLevel, Timestamp, writeBatch,
} from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FriendShelfStore } from '../src/cloud/friend-shelf-store';
import { FriendStore } from '../src/cloud/friend-store';
import { FriendShelfCommittedError } from '../src/lib/friend-shelf-types';
import type { FriendShelfConfig, FriendShelfEntry } from '../src/lib/friend-shelf-types';
import { parseCollection } from '../src/lib/collection';
import { friendPairId } from '../src/lib/friend-types';

vi.mock('firebase/firestore', async (original) => {
  const actual = await original<typeof import('firebase/firestore')>();
  return { ...actual, runTransaction: vi.fn(actual.runTransaction) };
});
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8188').split(':');
const authAddress = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9199';
const projectId = 'demo-play100';
const source = { syncEpoch: 1, remoteRevision: 0 };
const entry: FriendShelfEntry = { id: 'manual:saved', title: 'Saved without a ranking', year: null, source: 'manual', sourceId: 'saved', sourceUrl: null };
const avatar = { version: 1 as const, seed: 'b'.repeat(32), palette: 'moss' as const };
const apps: FirebaseApp[] = [];
let environment: RulesTestEnvironment;
beforeAll(async () => {
  if (!['127.0.0.1', 'localhost'].includes(host ?? '') || !/^(127[.]0[.]0[.]1|localhost):[0-9]+$/.test(authAddress)) throw new Error('Shelf SDK tests only run against explicitly local emulators.');
  setLogLevel('silent');
  environment = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') } });
});
beforeEach(async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  vi.mocked(runTransaction).mockReset().mockImplementation(actual.runTransaction);
  await environment.clearFirestore();
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await Promise.all(apps.splice(0).map((app) => deleteApp(app))); });
afterAll(async () => { await environment.cleanup(); });
async function seed(path: string, value: Record<string, unknown>) {
  await environment.withSecurityRulesDisabled(async (context) => { await context.firestore().doc(path).set(value); });
}
async function client(anonymous = false) {
  const app = initializeApp({ apiKey: 'demo-play100-key', projectId }, crypto.randomUUID()); apps.push(app);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence }); connectAuthEmulator(auth, `http://${authAddress}`, { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, host, Number(port));
  const store = new FriendShelfStore(db); const friends = new FriendStore(db);
  if (anonymous) return { uid: '', db, store, friends };
  const user = (await createUserWithEmailAndPassword(auth, `shelf-${crypto.randomUUID()}@example.test`, 'Emulator-only-passphrase-4382')).user;
  const response = await fetch(`http://${authAddress}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-play100-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId: user.uid, emailVerified: true }),
  });
  if (!response.ok) throw new Error('Could not verify the synthetic shelf account.');
  await reload(user); await getIdToken(user, true);
  await friends.initialize(user.uid); await friends.saveIdentity(user.uid, { displayName: 'Shelf test nickname', avatar }, 0);
  await seed(`publicProfiles/${user.uid}`, { uid: user.uid, published: true, hidden: false });
  await seed(`syncHeads/${user.uid}`, { format: 1, epoch: 1, revision: 0, enabled: true, deleted: false, current: null, previous: null, updatedAt: Timestamp.now() });
  return { uid: user.uid, db, store, friends };
}
type Client = Awaited<ReturnType<typeof client>>;
async function connect(a: Client, b: Client) {
  const request = await a.friends.sendRequest(a.uid, b.uid);
  return b.friends.respond(b.uid, a.uid, 'accept', request.epoch);
}
async function select(a: Client, entries: FriendShelfEntry[]) {
  const config = await a.store.config(a.uid) ?? await a.store.initialize(a.uid);
  return a.store.saveConfig(a.uid, { enabled: true, selectedIds: entries.map((item) => item.id) }, config);
}
async function publish(a: Client, entries = [entry]) {
  const config = await select(a, entries); const head = await a.store.head(a.uid);
  return a.store.publish(a.uid, entries, config, source, head?.revision ?? 0, () => true);
}
async function stage(a: Client, config: FriendShelfConfig, count: number) {
  const id = crypto.randomUUID(); const registry = doc(a.db, 'friendShelfRegistry', a.uid);
  await runTransaction(a.db, async (tx) => {
    const current = await tx.get(registry); const ids: string[] = current.exists() ? current.data().ids : [];
    tx.set(registry, { ids: [...ids, id], revision: current.exists() ? current.data().revision + 1 : 1 });
    tx.set(doc(a.db, 'friendShelves', a.uid, 'generations', id), { epoch: config.epoch, settingsRevision: config.revision, source, count, digest: '0'.repeat(64), uploaded: 0, ids: [], status: count ? 'staging' : 'ready', createdAt: serverTimestamp() });
  });
  return id;
}
async function rawChunk(a: Client, id: string, entries: unknown[], ids: string[], extra: Record<string, unknown> = {}, status = 'ready') {
  const gen = doc(a.db, 'friendShelves', a.uid, 'generations', id); const batch = writeBatch(a.db);
  batch.set(doc(gen, 'chunks', '0'), { index: 0, entries, ids, ...extra });
  batch.update(gen, { uploaded: 1, ids, status });
  return batch.commit();
}
function worstEntries(sourceName: FriendShelfEntry['source']): FriendShelfEntry[] {
  return Array.from({ length: 200 }, (_, i) => {
    const length = sourceName === 'collection' ? 200 : 200 - sourceName.length - 1;
    const suffix = `${'8'.repeat(length - 4 - Number(sourceName === 'wikidata'))}${String(i + 1).padStart(4, '0')}`;
    const sourceId = sourceName === 'wikidata' ? `Q${suffix}` : suffix;
    return {
      id: sourceName === 'collection' ? sourceId : `${sourceName}:${sourceId}`, sourceId, source: sourceName, title: 'T'.repeat(200), year: 2100,
      sourceUrl: sourceName === 'wikidata' ? `https://www.wikidata.org/wiki/${sourceId}` : sourceName === 'steam' ? `https://store.steampowered.com/app/${sourceId}/` : sourceName === 'freetogame' ? `https://www.freetogame.com/${'a'.repeat(2048 - 'https://www.freetogame.com/'.length)}` : null,
    };
  });
}

describe('selected shelf SDK authorization and strict full-size chunks', () => {
  it.each(['collection', 'wikidata', 'steam', 'freetogame', 'manual'] as const)('publishes and reads all 200 worst-case %s entries through 100 immutable chunks', async (sourceName) => {
    const a = await client(); const b = await client(); await connect(a, b);
    const entries = worstEntries(sourceName);
    if (sourceName === 'collection') await seed('catalog/author', { records: Object.fromEntries(entries.map((item) => [item.id, { title: item.title, year: item.year }])) });
    const result = await publish(a, entries);
    expect(result.head.current?.count).toBe(200);
    expect((await b.store.shelf(a.uid)).entries).toEqual(entries);
    const id = result.head.current!.generation;
    const chunks = collection(a.db, 'friendShelves', a.uid, 'generations', id, 'chunks');
    expect((await getDocsFromServer(query(chunks, orderBy('index'), limit(100)))).size).toBe(100);
    expect((await a.store.exportOwn(a.uid)).shelf?.entries).toEqual(entries);
    const peerChunks = collection(b.db, 'friendShelves', a.uid, 'generations', id, 'chunks');
    await assertFails(getDocsFromServer(peerChunks));
    await assertFails(getDocsFromServer(query(peerChunks, limit(101))));
    await assertFails(setDoc(doc(a.db, 'friendShelves', a.uid, 'generations', id, 'chunks', '0'), { index: 0, entries: entries.slice(0, 2), ids: entries.slice(0, 2).map((item) => item.id) }));
  }, 120000);
  it('uses the actual public 100 canonical facts without modifying public/ranking consent', async () => {
    const a = await client();
    const games = parseCollection(JSON.parse(readFileSync('public\\data\\collection.json', 'utf8'))).games;
    await seed('catalog/author', { records: Object.fromEntries(games.map((game) => [game.slug, { title: game.title, year: game.year }])) });
    const entries: FriendShelfEntry[] = games.map((game) => ({ id: game.slug, title: game.title, year: game.year, source: 'collection', sourceId: game.slug, sourceUrl: null }));
    const all = [...entries, ...worstEntries('manual').slice(0, 100)];
    await publish(a, all);
    expect((await a.store.shelf(a.uid)).entries).toEqual(all);
    expect((await a.friends.settings(a.uid))?.enabled).toBe(false);
    expect(await a.friends.shareHead(a.uid)).toBeNull();
  }, 120000);
  it('starts old/new shelf accounts off and denies strangers, anonymous and all private data', async () => {
    const a = await client(); const b = await client(); const stranger = await client(); const anonymous = await client(true);
    expect(await a.store.config(a.uid)).toBeNull();
    const config = await a.store.initialize(a.uid); expect(config.enabled).toBe(false); expect(config.selectedIds).toEqual([]);
    await assertFails(setDoc(doc(b.db, 'friendShelfSettings', b.uid), { format: 1, enabled: true, deleted: false, selection: entry.id, epoch: 1, revision: 1, updatedAt: serverTimestamp() }));
    const result = await publish(a); const id = result.head.current!.generation;
    for (const viewer of [b, stranger, anonymous]) {
      await assertFails(viewer.store.head(a.uid));
      await assertFails(getDocFromServer(doc(viewer.db, 'friendShelves', a.uid, 'generations', id, 'chunks', '0')));
    }
    await connect(a, b);
    expect((await b.store.shelf(a.uid)).entries).toEqual([entry]);
    for (const path of [['members', a.uid], ['syncHeads', a.uid], ['accounts', a.uid, 'chunks', 'private'], ['creatorRanks', a.uid], ['friendShelfSettings', a.uid], ['friendShelfRegistry', a.uid]]) {
      await assertFails(getDocFromServer(doc(b.db, path[0]!, ...path.slice(1))));
    }
    await assertFails(b.store.exportOwn(a.uid));
  });
  it('rejects unknown fields, rank forgeries, invalid sources, canonical mismatches, and arbitrary image URLs on the server', async () => {
    const a = await client(); const config = await select(a, [entry]); const id = await stage(a, config, 1);
    const bad: Record<string, unknown>[] = [
      { position: 1 }, { score: null }, { note: 'private' }, { email: 'private@example.test' }, { played: true }, { completed: false }, { queue: [] },
      { imageUrl: 'https://example.test/art.svg' }, { sourceUrl: 'data:image/svg+xml,<svg/>' }, { title: '' }, { title: '  ' }, { title: 'bad\nname' }, { title: 'T'.repeat(201) }, { year: 1899 }, { year: 2101 },
      { source: 'other' }, { sourceId: 'not-the-id' }, { id: 'manual:unselected' },
    ];
    for (const patch of bad) await assertFails(rawChunk(a, id, [{ ...entry, ...patch }], [entry.id]));
    await assertFails(rawChunk(a, id, [entry], [entry.id], { surprise: true }));
    await assertFails(rawChunk(a, id, [entry, entry], [entry.id, entry.id]));
    await assertSucceeds(rawChunk(a, id, [entry], [entry.id]));
    const canonical: FriendShelfEntry = { ...entry, id: 'known-canonical', source: 'collection', sourceId: 'known-canonical' };
    await seed('catalog/author', { records: { 'known-canonical': { title: 'Real canonical title', year: 2020 } } });
    const next = await select(a, [canonical]); const canonicalId = await stage(a, next, 1);
    await assertFails(rawChunk(a, canonicalId, [canonical], [canonical.id]));
    await assertSucceeds(rawChunk(a, canonicalId, [{ ...canonical, title: 'Real canonical title', year: 2020 }], [canonical.id]));
  });
  it.each([
    { source: 'wikidata', id: 'wikidata:Q0', sourceId: 'Q0', sourceUrl: 'https://www.wikidata.org/wiki/Q0' },
    { source: 'steam', id: 'steam:12', sourceId: '12', sourceUrl: 'https://store.steampowered.com/app/12/?evil=1' },
    { source: 'freetogame', id: 'freetogame:12', sourceId: '12', sourceUrl: 'https://www.freetogame.com.evil.test/game' },
    { source: 'manual', id: 'manual:saved', sourceId: 'saved', sourceUrl: 'https://example.test/image.svg' },
  ])('denies malformed $source source identity through raw SDK writes', async (patch) => {
    const a = await client(); const config = await a.store.saveConfig(a.uid, { enabled: true, selectedIds: [patch.id] }, await a.store.initialize(a.uid)); const id = await stage(a, config, 1);
    await assertFails(rawChunk(a, id, [{ ...entry, ...patch }], [patch.id]));
  });
  it('denies malformed selection/control/generation mutations and incomplete publication', async () => {
    const a = await client(); const config = await a.store.initialize(a.uid);
    const wire = { format: 1, enabled: true, deleted: false, selection: entry.id, epoch: config.epoch + 1, revision: config.revision + 1, updatedAt: serverTimestamp() };
    for (const patch of [{ selection: `${entry.id}|${entry.id}` }, { selection: Array.from({ length: 201 }, (_, i) => `manual:x${i}`).join('|') }, { selectedIds: [entry.id] }, { epoch: 999 }, { email: 'private' }]) {
      await assertFails(setDoc(doc(a.db, 'friendShelfSettings', a.uid), { ...wire, ...patch }));
    }
    const selected = await select(a, [entry]);
    await assertFails(stage(a, selected, 0));
    const id = await stage(a, selected, 1);
    const batch = writeBatch(a.db);
    batch.update(doc(a.db, 'friendShelves', a.uid, 'generations', id), { status: 'published' });
    batch.set(doc(a.db, 'friendShelfHeads', a.uid), { format: 1, epoch: selected.epoch, settingsRevision: selected.revision, source, revision: 1, current: { generation: id, digest: '0'.repeat(64), count: 1 }, previous: null, updatedAt: serverTimestamp() });
    await assertFails(batch.commit());
  });
});
describe('shelf revocation, source CAS and bounded recovery', () => {
  it('revokes disabled/old-generation content but preserves independently authorized identity', async () => {
    const a = await client(); const b = await client(); await connect(a, b);
    const first = await publish(a);
    const second = await publish(a, [{ ...entry, title: 'Updated saved game' }]);
    await assertFails(getDocFromServer(doc(b.db, 'friendShelves', a.uid, 'generations', first.head.current!.generation, 'chunks', '0')));
    expect((await b.store.shelf(a.uid)).head.revision).toBe(second.head.revision);
    const config = (await a.store.config(a.uid))!;
    await a.store.saveConfig(a.uid, { enabled: false, selectedIds: [] }, config);
    await assertFails(b.store.shelf(a.uid));
    expect((await b.friends.identity(a.uid))?.displayName).toBe('Shelf test nickname');
    await assertFails(a.store.publish(a.uid, [entry], config, source, second.head.revision, () => true));
    await a.store.cleanupSharing(a.uid); expect(await a.store.cleanupSharing(a.uid)).toBe(0);
    await publish(a); expect((await b.store.shelf(a.uid)).entries).toEqual([entry]);
  });
  it('revokes an old-client online-copy deletion without shelf API calls, while ordinary pause keeps the last shared shelf', async () => {
    const a = await client(); const b = await client(); await connect(a, b);
    const shared = await publish(a);
    const headRef = doc(a.db, 'syncHeads', a.uid);
    const old = (await getDocFromServer(headRef)).data()!;
    await assertSucceeds(setDoc(headRef, { ...old, enabled: false, epoch: old.epoch + 1, revision: old.revision + 1, updatedAt: serverTimestamp() }));
    expect((await b.store.shelf(a.uid)).entries).toEqual([entry]);
    const paused = (await getDocFromServer(headRef)).data()!;
    await assertSucceeds(setDoc(headRef, { ...paused, enabled: false, deleted: true, current: null, previous: null, epoch: paused.epoch + 1, revision: paused.revision + 1, updatedAt: serverTimestamp() }));
    expect((await a.store.config(a.uid))?.enabled).toBe(true);
    await assertFails(b.store.head(a.uid));
    await assertFails(getDocFromServer(doc(b.db, 'friendShelves', a.uid, 'generations', shared.head.current!.generation, 'chunks', '0')));
    expect((await b.friends.identity(a.uid))?.displayName).toBe('Shelf test nickname');
  });
  it.each(['remove', 'block', 'legacy-delete', 'lifecycle-cancel', 'shelf-delete'] as const)('denies current head/chunk reads after %s', async (action) => {
    const a = await client(); const b = await client(); const pair = await connect(a, b);
    const shared = await publish(a); const path = doc(b.db, 'friendShelves', a.uid, 'generations', shared.head.current!.generation, 'chunks', '0');
    if (action === 'remove') await b.friends.respond(b.uid, a.uid, 'remove', pair.epoch);
    else if (action === 'block') await b.friends.block(b.uid, a.uid);
    else if (action === 'legacy-delete') await a.friends.revokeForDeletion(a.uid);
    else if (action === 'shelf-delete') await a.store.revokeForDeletion(a.uid);
    else await seed(`accountLifecycle/${a.uid}`, { state: 'cancelled' });
    await assertFails(b.store.head(a.uid)); await assertFails(getDocFromServer(path));
    if (action === 'block') {
      await b.friends.unblock(b.uid, a.uid);
      await assertFails(b.store.head(a.uid));
      expect((await b.friends.pair(b.uid, a.uid))?.state).toBe('removed');
    }
  });
  it('denies writes from stale private source/selection revisions and cancels an in-flight generation synchronously', async () => {
    const a = await client(); const entries = worstEntries('manual').slice(0, 4); const config = await select(a, entries);
    const id = await stage(a, config, entries.length);
    await seed(`syncHeads/${a.uid}`, { format: 1, epoch: 1, revision: 1, enabled: true, deleted: false, current: null, previous: null, updatedAt: Timestamp.now() });
    await assertFails(rawChunk(a, id, entries.slice(0, 2), entries.slice(0, 2).map((item) => item.id), {}, 'staging'));
    await expect(a.store.publish(a.uid, entries, config, source, 0, () => true)).rejects.toThrow(/private/);
    let checks = 0;
    await expect(a.store.publish(a.uid, entries, config, { syncEpoch: 1, remoteRevision: 1 }, 0, () => ++checks < 8)).rejects.toThrow(/cancelled/);
    expect(await a.store.head(a.uid)).toBeNull();
    await a.store.saveConfig(a.uid, { enabled: false, selectedIds: [] }, config);
    await a.store.cleanupSharing(a.uid);
    const fresh = await select(a, entries);
    await assertSucceeds(a.store.publish(a.uid, entries, fresh, { syncEpoch: 1, remoteRevision: 1 }, 0, () => true));
  });
  it('bounds the registry to three generations and prunes without replaying a publication', async () => {
    const a = await client(); const one = await publish(a);
    const two = await publish(a, [{ ...entry, title: 'Second' }]);
    await publish(a, [{ ...entry, title: 'Third' }]);
    const registry = await getDocFromServer(doc(a.db, 'friendShelfRegistry', a.uid));
    expect(registry.data()?.ids).toHaveLength(2);
    expect(registry.data()?.ids).not.toContain(one.head.current!.generation);
    expect(registry.data()?.ids).toContain(two.head.current!.generation);
    const config = (await a.store.config(a.uid))!;
    await stage(a, config, 1);
    await assertFails(stage(a, config, 1));
    const before = await a.store.head(a.uid);
    await a.store.prune(a.uid); await a.store.prune(a.uid);
    expect(await a.store.head(a.uid)).toEqual(before);
  });
  it('reserves irreversible deletion even after legacy deletion, then cleans <=3 generations resumably', async () => {
    const a = await client(); const b = await client(); await connect(a, b); await publish(a);
    await a.friends.revokeForDeletion(a.uid);
    await assertSucceeds(a.store.revokeForDeletion(a.uid)); await a.store.revokeForDeletion(a.uid);
    expect(await a.store.cleanupDeleted(a.uid)).toMatchObject({ done: true });
    expect(await a.store.cleanupDeleted(a.uid)).toEqual({ deleted: 0, done: true });
    const tombstone = (await a.store.config(a.uid))!; expect(tombstone.deleted).toBe(true);
    await assertFails(setDoc(doc(a.db, 'friendShelfSettings', a.uid), { format: 1, enabled: true, deleted: false, selection: entry.id, epoch: tombstone.epoch + 1, revision: tombstone.revision + 1, updatedAt: serverTimestamp() }));
    await assertFails(b.store.head(a.uid));
    expect((await b.friends.pair(b.uid, a.uid))?.state).toBe('accepted');
  });
  it('does not claim ACK for rejected commits; actual ACK with failed readback yields a typed receipt and read-only recovery', async () => {
    const a = await client(); const config = await a.store.initialize(a.uid);
    const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
    vi.mocked(runTransaction).mockRejectedValueOnce(new Error('Commit not acknowledged'));
    await expect(a.store.saveConfig(a.uid, { enabled: true, selectedIds: [entry.id] }, config)).rejects.not.toBeInstanceOf(FriendShelfCommittedError);
    vi.mocked(runTransaction).mockImplementationOnce(actual.runTransaction).mockRejectedValueOnce(new Error('Readback unavailable'));
    await expect(a.store.saveConfig(a.uid, { enabled: true, selectedIds: [entry.id] }, config)).rejects.toMatchObject({ committed: true, receipt: { operation: 'save-shelf-config', uid: a.uid }, phase: 'refresh' });
    const recovered = (await a.store.config(a.uid))!;
    expect(recovered).toMatchObject({ enabled: true, revision: config.revision + 1 });
    const prior = await a.store.head(a.uid); expect(prior).toBeNull();
    expect(recovered.updatedAt).toBeGreaterThan(0);
    await disableNetwork(a.db);
    await expect(a.store.saveConfig(a.uid, { enabled: false, selectedIds: [] }, recovered)).rejects.not.toBeInstanceOf(FriendShelfCommittedError);
    await enableNetwork(a.db);
    expect((await a.store.config(a.uid))?.enabled).toBe(true);
  });
  it('invalidates active head listeners on a peer block; identity remains a separate read path', async () => {
    const a = await client(); const b = await client(); await connect(a, b); await publish(a);
    let release: (() => void) | undefined; let allowed!: () => void;
    const ready = new Promise<void>((resolve) => { allowed = resolve; });
    const denied = new Promise<Error>((resolve) => { release = b.store.watchHead(a.uid, (head) => { if (head?.current) allowed(); }, resolve); });
    try {
      await ready; await b.friends.block(b.uid, a.uid);
      expect(await denied).toMatchObject({ code: 'permission-denied' });
      await assertFails(getDocFromServer(doc(b.db, 'friendShelfSettings', a.uid)));
    } finally { release?.(); }
    expect(friendPairId(a.uid, b.uid)).toBe([a.uid, b.uid].sort().join('~'));
  });
});
