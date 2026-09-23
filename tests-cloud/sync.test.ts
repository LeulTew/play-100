import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getIdToken, inMemoryPersistence, initializeAuth, reload, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, disableNetwork, doc, enableNetwork, getDocFromServer, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CloudStore, RemoteConflict } from '../src/cloud/cloud-store';
import { ensureAccountActivity } from '../src/cloud/account-lifecycle';
import { applyPersonalAction, emptyPersonalLibrary } from '../src/lib/personal-library';
import type { LibraryRecord } from '../src/lib/personal-types';

let environment: RulesTestEnvironment;
const apps: FirebaseApp[] = [];
const password = 'Emulator-only-passphrase-4382';
const game: LibraryRecord = { id: 'wikidata:Q123', source: 'wikidata', sourceId: 'Q123', sourceUrl: 'https://www.wikidata.org/wiki/Q123', title: 'Protocol fixture', year: 2020, studio: null, genre: null, collectionRank: null };
beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-play100', firestore: { host: '127.0.0.1', port: 8188, rules: readFileSync('firestore.rules', 'utf8') } });
});
beforeEach(async () => { await environment.clearFirestore(); });
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => deleteApp(app))); });
afterAll(async () => { await environment.cleanup(); });

async function client(existingEmail?: string) {
  const app = initializeApp({ apiKey: 'demo-play100-key', projectId: 'demo-play100' }, crypto.randomUUID());
  apps.push(app);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8188);
  const email = existingEmail ?? `protocol-${crypto.randomUUID()}@example.test`;
  const result = existingEmail ? await signInWithEmailAndPassword(auth, email, password) : await createUserWithEmailAndPassword(auth, email, password);
  if (!existingEmail) {
    const verified = await fetch('http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-play100-key', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ localId: result.user.uid, emailVerified: true }),
    });
    if (!verified.ok) throw new Error('The isolated Auth emulator could not verify its synthetic fixture.');
    await reload(result.user);
    await getIdToken(result.user, true);
    await ensureAccountActivity(db, result.user.uid);
    await setDoc(doc(db, 'members', result.user.uid), {
      uid: result.user.uid, displayName: 'Protocol fixture',
      avatar: { version: 1, seed: '1'.repeat(32), palette: 'lime' },
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), consentVersion: 1, gameCount: 0, rankCount: 0,
    });
  }
  return { db, user: result.user, email, store: new CloudStore(db, result.user.uid) };
}

describe('real Auth and Firestore snapshot transactions', () => {
  it('commits private snapshots and a separate sanitized creator summary with no public data', async () => {
    const { store, db, user } = await client();
    const head = await store.enable(null);
    const state = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 8.5 });
    const entry = state.ranking[0];
    if (!entry) throw new Error('Missing fixture ranking.');
    entry.note = 'This private note must not reach the creator summary.';
    const saved = await store.upload(state, head);
    expect(saved.revision).toBe(1);
    const readback = await store.head();
    if (!readback) throw new Error('The saved head is missing.');
    expect(await store.download(readback)).toEqual({ ...state, revision: 0, motion: 'auto' });
    expect(await store.ranking()).toEqual([{ id: game.id, title: game.title, position: 1, score: 8.5 }]);
    expect((await getDocFromServer(doc(db, 'publicProfiles', user.uid))).exists()).toBe(false);
  });

  it('two independent browser identities for one account detect conflicts instead of last-write-wins', async () => {
    const first = await client();
    const second = await client(first.email);
    const base = await first.store.enable(null);
    const a = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 8 });
    const b = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 9 });
    const accepted = await first.store.upload(a, base);
    await expect(second.store.upload(b, base)).rejects.toBeInstanceOf(RemoteConflict);
    expect(await first.store.download(accepted)).toEqual({ ...a, revision: 0, motion: 'auto' });
    const replacement = await second.store.upload(b, accepted);
    expect(replacement.revision).toBe(2);
    expect(replacement.previous?.generation).toBe(accepted.current?.generation);
    expect(await first.store.download(replacement, true)).toEqual({ ...a, revision: 0, motion: 'auto' });
  });

  it('an interruption between uploaded chunks and the head commit leaves the last complete copy intact', async () => {
    const { store } = await client();
    const empty = await store.enable(null);
    const original = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 6 });
    const before = await store.upload(original, empty);
    const edited = applyPersonalAction(original, { type: 'edit-ranking', id: game.id, score: 10 });
    await expect(store.upload(edited, before, async () => { throw new Error('Simulated disconnect after chunk acknowledgement'); })).rejects.toThrow(/disconnect/);
    const after = await store.head();
    expect(after?.revision).toBe(before.revision);
    if (!after) throw new Error('The original complete head disappeared.');
    expect(await store.download(after)).toEqual({ ...original, revision: 0, motion: 'auto' });
  });

  it('revoked epochs reject old writers; deleting online content revokes data reads and supports bounded cleanup', async () => {
    const { store, db, user } = await client();
    const base = await store.enable(null);
    const original = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 8 });
    const saved = await store.upload(original, base);
    const paused = await store.revoke(saved);
    await expect(store.upload(applyPersonalAction(original, { type: 'edit-ranking', id: game.id, score: 9 }), saved)).rejects.toThrow();
    const resumed = await store.enable(paused);
    expect(resumed.epoch).toBe(paused.epoch + 1);
    const deleted = await store.revoke(resumed, true);
    expect(deleted.deleted).toBe(true);
    const digest = saved.current?.chunks[0];
    if (!digest) throw new Error('Missing uploaded chunk.');
    await assertFails(getDocFromServer(doc(db, 'accounts', user.uid, 'chunks', digest)));
    expect(await store.cleanup(true)).toBeGreaterThan(0);
    const registry = await getDocFromServer(doc(db, 'accounts', user.uid, 'metadata', 'registry'));
    expect(registry.exists()).toBe(false);
    await assertFails(store.enable(deleted));
  });

  it('checks current server authority even when the payload matches an earlier head', async () => {
    const { store } = await client();
    const first = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 7 });
    const head = await store.upload(first, await store.enable(null));
    const next = await store.upload(applyPersonalAction(first, { type: 'edit-ranking', id: game.id, score: 8 }), head);
    await expect(store.upload(first, head)).rejects.toBeInstanceOf(RemoteConflict);
    await store.revoke(next);
    await expect(store.upload(first, head)).rejects.toThrow(/stopped or deleted/);
  });

  it('does not acknowledge an unchanged payload as saved online when its fresh read is offline', async () => {
    const { store, db } = await client();
    const state = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 7 });
    const head = await store.upload(state, await store.enable(null));
    await disableNetwork(db);
    await expect(store.upload(state, head)).rejects.toThrow();
    await enableNetwork(db);
    expect((await store.upload(state, head)).revision).toBe(head.revision);
  });
});
