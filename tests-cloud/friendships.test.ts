import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getIdToken, inMemoryPersistence, initializeAuth, reload } from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, disableNetwork, doc, enableNetwork, getDocFromServer, getDocsFromServer, getFirestore, limit, orderBy, query, runTransaction,
  serverTimestamp, setDoc, setLogLevel, Timestamp, where, writeBatch,
} from 'firebase/firestore';
import type { Firestore, Transaction, TransactionOptions } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FriendStore } from '../src/cloud/friend-store';
import { ensureAccountActivity } from '../src/cloud/account-lifecycle';
import { parseCollection } from '../src/lib/collection';
import { friendPairId } from '../src/lib/friend-types';
import type { FriendPair, FriendSettings } from '../src/lib/friend-types';
import type { AvatarValue, PublicEntry } from '../src/lib/community';

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return { ...actual, runTransaction: vi.fn(actual.runTransaction), getDocFromServer: vi.fn(actual.getDocFromServer),
    getDocsFromServer: vi.fn(actual.getDocsFromServer) };
});

const [firestoreHost, firestorePort] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8188').split(':');
const authAddress = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9199';
const projectId = 'demo-play100';
const avatar: AvatarValue = { version: 1, seed: 'b'.repeat(32), palette: 'moss' };
const source = { syncEpoch: 1, remoteRevision: 0 };
const entry: PublicEntry = { position: 1, id: 'wikidata:Q123', title: 'Shared example', year: 2020, source: 'wikidata', sourceId: 'Q123', sourceUrl: 'https://www.wikidata.org/wiki/Q123', score: 0 };
let environment: RulesTestEnvironment;
const apps: FirebaseApp[] = [];

beforeAll(async () => {
  if (!['127.0.0.1', 'localhost'].includes(firestoreHost ?? '') || !/^(127[.]0[.]0[.]1|localhost):[0-9]+$/.test(authAddress)) throw new Error('Friendship tests require explicitly local emulator endpoints.');
  setLogLevel('silent');
  environment = await initializeTestEnvironment({ projectId, firestore: { host: firestoreHost, port: Number(firestorePort), rules: readFileSync('firestore.rules', 'utf8') } });
});
beforeEach(async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  vi.mocked(runTransaction).mockReset().mockImplementation(actual.runTransaction);
  vi.mocked(getDocFromServer).mockReset().mockImplementation(actual.getDocFromServer);
  vi.mocked(getDocsFromServer).mockReset().mockImplementation(actual.getDocsFromServer);
  await environment.clearFirestore();
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await Promise.all(apps.splice(0).map((app) => deleteApp(app))); });
afterAll(async () => { await environment.cleanup(); });

async function seed(path: string, value: Record<string, unknown>) {
  await environment.withSecurityRulesDisabled(async (context) => { await context.firestore().doc(path).set(value); });
}
async function client(anonymous = false, prepareFriends = true) {
  const app = initializeApp({ apiKey: 'demo-play100-key', projectId }, crypto.randomUUID()); apps.push(app);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, `http://${authAddress}`, { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, firestoreHost, Number(firestorePort));
  const store = new FriendStore(db);
  if (anonymous) return { uid: '', db, store };
  const user = (await createUserWithEmailAndPassword(auth, `friend-${crypto.randomUUID()}@example.test`, 'Emulator-only-passphrase-4382')).user;
  const response = await fetch(`http://${authAddress}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-play100-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ localId: user.uid, emailVerified: true }),
  });
  if (!response.ok) throw new Error('Could not verify the isolated friendship Auth fixture.');
  await reload(user); await getIdToken(user, true);
  await ensureAccountActivity(db, user.uid);
  if (prepareFriends) {
    await store.initialize(user.uid);
    await store.saveIdentity(user.uid, { displayName: 'Chosen nickname', avatar }, 0);
  }
  await seed(`publicProfiles/${user.uid}`, { uid: user.uid, published: true, hidden: false });
  await seed(`syncHeads/${user.uid}`, { format: 1, epoch: 1, revision: 0, enabled: true, deleted: false, current: null, previous: null, updatedAt: Timestamp.now() });
  return { uid: user.uid, db, store };
}
type Client = Awaited<ReturnType<typeof client>>;
async function failNextReadback(cause: Error): Promise<void> {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  vi.mocked(runTransaction).mockImplementationOnce(actual.runTransaction).mockRejectedValueOnce(cause);
}
async function settings(owner: Client): Promise<FriendSettings> {
  const current = await owner.store.settings(owner.uid);
  if (!current) throw new Error('Missing isolated friend settings.');
  return current;
}
async function connect(a: Client, b: Client) {
  const request = await a.store.sendRequest(a.uid, b.uid);
  return b.store.respond(b.uid, a.uid, 'accept', request.epoch);
}
async function share(owner: Client, entries = [entry]) {
  const control = await owner.store.saveSettings(owner.uid, { enabled: true, selectedIds: entries.map((item) => item.id) }, await settings(owner));
  const head = await owner.store.shareHead(owner.uid);
  return owner.store.publishRanking(owner.uid, entries, control, source, head?.revision ?? 0);
}
function pairData(a: string, b: string, from: string, state = 'accepted') {
  const participants = [a, b].sort();
  return { format: 1, a: participants[0], b: participants[1], participants, from, state, epoch: 1, inviteSlot: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
}

describe('canonical friendship requests and private relationship metadata', () => {
  it('uses plain index-building copy only at the pair cap and leaves ordinary requests unaffected', async () => {
    const a = await client(); const b = await client();
    const quotaPath = `accountQuotas/${a.uid}/limits/pairs`;
    await seed(quotaPath, { count: 1000, revision: 1, lastPair: friendPairId(a.uid, b.uid) });
    vi.mocked(getDocsFromServer).mockRejectedValueOnce(Object.assign(new Error('Index still building'), { code: 'failed-precondition' }));
    await expect(a.store.sendRequest(a.uid, b.uid)).rejects.toThrow('Connection cleanup is not ready yet. Try again later.');
    expect(vi.mocked(getDocsFromServer)).toHaveBeenCalledTimes(1);
    expect(await a.store.pair(a.uid, b.uid)).toBeNull();
    await seed(quotaPath, { count: 0, revision: 1, lastPair: friendPairId(a.uid, b.uid) });
    expect((await a.store.sendRequest(a.uid, b.uid)).state).toBe('pending');
    expect(vi.mocked(getDocsFromServer)).toHaveBeenCalledTimes(1);
  });

  it.each(['revoked', 'consumed', 'replaced', 'recipient-retired'] as const)('does not accept a token %s after preview and leaves no partial pair or quota write', async change => {
    const owner = await client(); const recipient = await client();
    const invite = await owner.store.createInvite(owner.uid);
    const other = change === 'consumed' ? await client() : null;
    const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
    const readsBefore = vi.mocked(getDocFromServer).mock.calls.length;
    vi.mocked(runTransaction).mockImplementationOnce(async <T>(db: Firestore, operation: (tx: Transaction) => Promise<T>, options?: TransactionOptions) => {
      if (change === 'recipient-retired') await recipient.store.revokeForDeletion(recipient.uid);
      else if (other) await other.store.acceptInvite(other.uid, invite.token);
      else {
        await owner.store.revokeInvite(owner.uid, invite.token);
        if (change === 'replaced') {
          const next = await owner.store.createInvite(owner.uid);
          expect(next.slot).toBe(invite.slot);
          expect(next.token).not.toBe(invite.token);
        }
      }
      return actual.runTransaction(db, operation, options);
    });
    await expect(recipient.store.acceptInvite(recipient.uid, invite.token)).rejects.toMatchObject({
      code: change === 'recipient-retired' ? 'unavailable' : 'invite-unavailable',
    });
    expect(vi.mocked(getDocFromServer).mock.calls.slice(readsBefore)
      .filter(([ref]) => ref.firestore === recipient.db && ref.path === `friendInvites/${invite.token}`)).toHaveLength(2);
    expect(await recipient.store.pair(recipient.uid, owner.uid)).toBeNull();
    expect((await getDocFromServer(doc(recipient.db, 'accountQuotas', recipient.uid, 'limits', 'pairs'))).exists()).toBe(false);
    if (other) expect((await other.store.pair(other.uid, owner.uid))?.state).toBe('accepted');
  });

  it('returns authoritative initialized settings while a prior missing-document watch remains active', async () => {
    const a = await client(false, false);
    let stop: (() => void) | undefined;
    const missing = new Promise<void>((resolve, reject) => {
      stop = a.store.watchSettings(a.uid, (value) => { if (value === null) resolve(); }, reject);
    });
    try {
      await missing;
      const initialized = await a.store.initialize(a.uid);
      expect(initialized).toMatchObject({ format: 1, enabled: false, deleted: false, epoch: 1, revision: 1 });
      expect(initialized.updatedAt).toBeGreaterThan(0);
      expect(await a.store.initialize(a.uid)).toEqual(initialized);
    } finally { stop?.(); }
  });
  it('starts sharing off and rejects stranger identities, private data, forged edges and half-edges', async () => {
    const a = await client(); const b = await client(); const stranger = await client();
    expect((await settings(a)).enabled).toBe(false);
    await assertFails(b.store.identity(a.uid));
    await assertFails(getDocFromServer(doc(b.db, 'members', a.uid)));
    await assertFails(getDocFromServer(doc(b.db, 'syncHeads', a.uid)));
    await assertFails(setDoc(doc(a.db, 'friendPairs', friendPairId(a.uid, b.uid)), pairData(a.uid, b.uid, a.uid)));
    await assertFails(setDoc(doc(a.db, 'friendEdges', a.uid, 'items', b.uid), { isFriend: true }));
    await assertFails(stranger.store.pair(a.uid, b.uid));
    const request = await a.store.sendRequest(a.uid, b.uid);
    expect((await b.store.identity(a.uid))?.displayName).toBe('Chosen nickname');
    await assertFails(stranger.store.pair(a.uid, b.uid));
    await expect(a.store.respond(a.uid, b.uid, 'accept', request.epoch)).rejects.toThrow(/recipient/);
    await connectAfterRequest(b, a, request.epoch);
    await assertFails(setDoc(doc(stranger.db, 'friendPairs', friendPairId(a.uid, b.uid)), pairData(a.uid, b.uid, stranger.uid)));
  });
  it('makes duplicate and opposite-direction requests explicit and accepts once under contention', async () => {
    const a = await client(); const b = await client();
    const requests = await Promise.allSettled([a.store.sendRequest(a.uid, b.uid), b.store.sendRequest(b.uid, a.uid)]);
    expect(requests.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const pending = await a.store.pair(a.uid, b.uid);
    if (!pending) throw new Error('Missing raced request.');
    const sender = pending.from === a.uid ? a : b; const recipient = pending.from === a.uid ? b : a;
    await expect(sender.store.sendRequest(sender.uid, recipient.uid)).rejects.toThrow(/already/);
    const responses = await Promise.allSettled([
      recipient.store.respond(recipient.uid, sender.uid, 'accept', pending.epoch),
      recipient.store.respond(recipient.uid, sender.uid, 'decline', pending.epoch),
    ]);
    expect(responses.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });
  it('can request a published legacy target before they initialize Friends, without writing their private settings', async () => {
    const sender = await client(); const recipient = await client(false, false);
    expect(await recipient.store.settings(recipient.uid)).toBeNull();
    const request = await sender.store.sendRequest(sender.uid, recipient.uid);
    expect((await recipient.store.listRelations(recipient.uid, 'pending')).items).toHaveLength(1);
    expect((await recipient.store.identity(sender.uid))?.displayName).toBe('Chosen nickname');
    expect(await recipient.store.settings(recipient.uid)).toBeNull();
    await assertFails(recipient.store.respond(recipient.uid, sender.uid, 'accept', request.epoch));
    await recipient.store.initialize(recipient.uid);
    await recipient.store.saveIdentity(recipient.uid, { displayName: 'Recipient', avatar }, 0);
    expect((await recipient.store.respond(recipient.uid, sender.uid, 'accept', request.epoch)).state).toBe('accepted');
    expect((await settings(recipient)).enabled).toBe(false);
  });
  it('implements decline, cancel, remove, re-request and stale-epoch rejection', async () => {
    const a = await client(); const b = await client();
    let pair = await a.store.sendRequest(a.uid, b.uid);
    pair = await b.store.respond(b.uid, a.uid, 'decline', pair.epoch);
    await expect(a.store.respond(a.uid, b.uid, 'cancel', pair.epoch - 1)).rejects.toThrow(/changed/);
    await expect(a.store.sendRequest(a.uid, b.uid)).rejects.toThrow("You can't send this person a request right now.");
    pair = await b.store.sendRequest(b.uid, a.uid);
    pair = await b.store.respond(b.uid, a.uid, 'cancel', pair.epoch);
    expect(pair.state).toBe('cancelled');
    pair = await connect(a, b);
    pair = await b.store.respond(b.uid, a.uid, 'remove', pair.epoch);
    expect(pair.state).toBe('removed');
    await assertFails(b.store.identity(a.uid));
    expect((await a.store.sendRequest(a.uid, b.uid)).epoch).toBe(pair.epoch + 1);
  });
  it('requires participant-constrained, capped queries and supports a 20-row actual page', async () => {
    const a = await client(); const b = await client();
    await connect(a, b);
    await assertFails(getDocsFromServer(query(collection(a.db, 'friendPairs'), limit(20))));
    await assertFails(getDocsFromServer(query(collection(a.db, 'friendPairs'), where('participants', 'array-contains', a.uid), limit(21))));
    const now = Timestamp.now();
    await environment.withSecurityRulesDisabled(async (context) => {
      const batch = context.firestore().batch();
      for (let i = 0; i < 22; i += 1) {
        const other = `synthetic-${i}`; const data = pairData(a.uid, other, a.uid);
        batch.set(context.firestore().doc(`friendPairs/${friendPairId(a.uid, other)}`), { ...data, createdAt: now, updatedAt: now });
      }
      await batch.commit();
    });
    const first = await a.store.listRelations(a.uid, 'accepted');
    expect(first.items).toHaveLength(20);
    expect((await a.store.listRelations(a.uid, 'accepted', first.cursor)).items).toHaveLength(3);
  });
  it('atomically blocks/removes in either direction, keeps blocks private, and does not refriend on unblock', async () => {
    const a = await client(); const b = await client();
    await connect(a, b); await share(a);
    await a.store.block(a.uid, b.uid);
    expect((await a.store.pair(a.uid, b.uid))?.state).toBe('removed');
    await assertFails(b.store.ranking(a.uid)); await assertFails(b.store.identity(a.uid));
    await assertFails(getDocFromServer(doc(b.db, 'friendBlocks', a.uid, 'items', b.uid)));
    await assertFails(b.store.sendRequest(b.uid, a.uid));
    await a.store.unblock(a.uid, b.uid);
    expect((await a.store.pair(a.uid, b.uid))?.state).toBe('removed');
    await assertFails(b.store.ranking(a.uid));
  });
  it('fails offline graph changes rather than reporting a locally accepted request', async () => {
    const a = await client(); const b = await client();
    await disableNetwork(a.db);
    try {
      await expect(a.store.sendRequest(a.uid, b.uid)).rejects.toThrow();
      await expect(a.store.createInvite(a.uid)).rejects.toThrow();
    }
    finally { await enableNetwork(a.db); }
    expect(await b.store.pair(b.uid, a.uid)).toBeNull();
    expect((await a.store.listInvites(a.uid)).items).toHaveLength(0);
  });
  it('also prevents graph writes when the browser explicitly reports offline', async () => {
    const a = await client(); const b = await client();
    vi.stubGlobal('navigator', { onLine: false });
    try {
      await expect(a.store.sendRequest(a.uid, b.uid)).rejects.toMatchObject({ code: 'offline' });
      await expect(a.store.createInvite(a.uid)).rejects.toMatchObject({ code: 'offline' });
    }
    finally { vi.unstubAllGlobals(); }
    expect(await b.store.pair(b.uid, a.uid)).toBeNull();
    expect((await a.store.listInvites(a.uid)).items).toHaveLength(0);
  });
  it('reports acknowledged request, acceptance and removal separately from post-commit readback failure', async () => {
    const a = await client(); const b = await client();
    const fresh = new FriendStore(b.db);
    const disconnected = new Error('Readback disconnected after commit acknowledgement.');
    await failNextReadback(disconnected);
    await expect(a.store.sendRequest(a.uid, b.uid)).rejects.toMatchObject({
      code: 'committed-refresh-failed', committed: true, receipt: { operation: 'send-request', epoch: 1 },
    });
    expect((await fresh.pair(b.uid, a.uid))?.state).toBe('pending');
    await failNextReadback(disconnected);
    await expect(b.store.respond(b.uid, a.uid, 'accept', 1)).rejects.toMatchObject({
      committed: true, receipt: { operation: 'respond', epoch: 2 },
    });
    expect((await fresh.pair(b.uid, a.uid))?.state).toBe('accepted');
    await failNextReadback(disconnected);
    await expect(a.store.respond(a.uid, b.uid, 'remove', 2)).rejects.toMatchObject({
      committed: true, receipt: { operation: 'respond', epoch: 3 },
    });
    expect((await fresh.pair(b.uid, a.uid))?.state).toBe('removed');
  });
  it('preserves a successful sharing-stop acknowledgement when its settings readback fails', async () => {
    const a = await client(); const control = await settings(a);
    const disconnected = new Error('Read-only settings transaction disconnected after commit.');
    await failNextReadback(disconnected);
    await expect(a.store.saveSettings(a.uid, { enabled: true, selectedIds: [entry.id] }, control)).rejects.toMatchObject({
      committed: true, receipt: { operation: 'save-settings', uid: a.uid },
    });
    const saved = await new FriendStore(a.db).settings(a.uid);
    expect(saved).toMatchObject({ enabled: true, selectedIds: [entry.id], revision: control.revision + 1 });
    if (!saved) throw new Error('The acknowledged sharing settings are missing.');
    await failNextReadback(disconnected);
    await expect(a.store.saveSettings(a.uid, { enabled: false, selectedIds: [] }, saved)).rejects.toMatchObject({
      committed: true, receipt: { operation: 'save-settings', uid: a.uid },
    });
    expect(await new FriendStore(a.db).settings(a.uid)).toMatchObject({ enabled: false, selectedIds: [], revision: saved.revision + 1 });
  });
  it('watches only the selected pair and returns an explicit unsubscribe', async () => {
    const a = await client(); const b = await client();
    let unsubscribe: (() => void) | undefined;
    const observed = new Promise<FriendPair>((resolve, reject) => {
      unsubscribe = b.store.watchPair(b.uid, a.uid, (value) => { if (value?.state === 'pending') resolve(value); }, reject);
    });
    try {
      await a.store.sendRequest(a.uid, b.uid);
      expect((await observed).from).toBe(a.uid);
      expect(typeof unsubscribe).toBe('function');
    } finally { unsubscribe?.(); }
  });
});

async function connectAfterRequest(recipient: Client, sender: Client, epoch: number) {
  const result = await recipient.store.respond(recipient.uid, sender.uid, 'accept', epoch);
  expect(result.state).toBe('accepted');
}

describe('single-use, fixed-slot invitation capabilities', () => {
  it('offers minimal anonymous exact-token preview, forbids listing, self-use and standalone consumption', async () => {
    const a = await client(); const b = await client(); const guest = await client(true);
    const invite = await a.store.createInvite(a.uid);
    const preview = await guest.store.previewInvite(invite.token);
    expect(Object.keys(preview).sort()).toEqual(['avatar', 'createdAt', 'displayName', 'expiresAt', 'lifetimeDays', 'ownerUid', 'singleUse'].sort());
    expect(preview.expiresAt - preview.createdAt).toBe(7 * 86400000);
    await assertFails(getDocsFromServer(query(collection(guest.db, 'friendInvites'), limit(20))));
    await assertFails(getDocsFromServer(query(collection(b.db, 'friendInviteSlots', a.uid, 'slots'), limit(20))));
    await expect(a.store.acceptInvite(a.uid, invite.token)).rejects.toThrow(/own invitation/);
    const batch = writeBatch(b.db); batch.update(doc(b.db, 'friendInvites', invite.token), { state: 'consumed', acceptedBy: b.uid });
    await assertFails(batch.commit());
  });
  it('allows exactly one concurrent recipient, rejects replay, and never reveals who consumed the link', async () => {
    const a = await client(); const b = await client(); const c = await client(); const guest = await client(true);
    const invite = await a.store.createInvite(a.uid);
    const results = await Promise.allSettled([b.store.acceptInvite(b.uid, invite.token), c.store.acceptInvite(c.uid, invite.token)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await expect(guest.store.previewInvite(invite.token)).rejects.toMatchObject({ code: 'invite-unavailable' });
    await expect(b.store.acceptInvite(b.uid, invite.token)).rejects.toMatchObject({ code: 'invite-unavailable' });
    expect((await a.store.listRelations(a.uid, 'accepted')).items).toHaveLength(1);
  });
  it('allocates distinct vacant slots under concurrent invitation creators', async () => {
    const a = await client();
    const invites = await Promise.all([a.store.createInvite(a.uid), a.store.createInvite(a.uid)]);
    expect(new Set(invites.map((invite) => invite.token)).size).toBe(2);
    expect(new Set(invites.map((invite) => invite.slot)).size).toBe(2);
    expect((await a.store.listInvites(a.uid)).items).toHaveLength(2);
    for (const invite of invites) expect(await a.store.previewInvite(invite.token)).toMatchObject({ ownerUid: a.uid, singleUse: true });
  });
  it('retains one actual invitation when its committed timestamp readback fails', async () => {
    const a = await client();
    await failNextReadback(new Error('Synthetic invitation readback failure'));
    await expect(a.store.createInvite(a.uid)).rejects.toMatchObject({ code: 'committed-refresh-failed', committed: true, receipt: { operation: 'create-invite', uid: a.uid } });
    const links = await a.store.listInvites(a.uid);
    expect(links.items).toHaveLength(1);
    expect(links.items[0]?.state).toBe('active');
    expect(links.items[0]!.expiresAt - links.items[0]!.createdAt).toBe(7 * 86400000);
  });
  it('enforces server expiry, revoke, blocked acceptance and lifecycle revocation', async () => {
    const a = await client(); const b = await client(); const guest = await client(true);
    const invite = await a.store.createInvite(a.uid);
    await a.store.revokeInvite(a.uid, invite.token);
    await expect(b.store.acceptInvite(b.uid, invite.token)).rejects.toMatchObject({ code: 'invite-unavailable' });
    const expired = await a.store.createInvite(a.uid);
    await environment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`friendInvites/${expired.token}`).update({ createdAt: Timestamp.fromMillis(Date.now() - 8 * 86400000) });
    });
    await expect(guest.store.previewInvite(expired.token)).rejects.toMatchObject({ code: 'invite-unavailable' });
    const blocked = await a.store.createInvite(a.uid);
    await b.store.block(b.uid, a.uid);
    await expect(b.store.acceptInvite(b.uid, blocked.token)).rejects.toMatchObject({ code: 'invite-unavailable' });
    await b.store.unblock(b.uid, a.uid);
    await a.store.revokeForDeletion(a.uid);
    await expect(guest.store.previewInvite(blocked.token)).rejects.toMatchObject({ code: 'invite-unavailable' });
    await expect(b.store.acceptInvite(b.uid, blocked.token)).rejects.toMatchObject({ code: 'invite-unavailable' });
  });
  it('caps allocation at 20 slots and deletes a prior token before reusing its slot', async () => {
    const a = await client();
    let firstToken = '';
    let expiredToken = '';
    for (let index = 0; index < 20; index += 1) {
      const invite = await a.store.createInvite(a.uid);
      if (index === 0) firstToken = invite.token;
      if (index === 1) expiredToken = invite.token;
    }
    await expect(a.store.createInvite(a.uid)).rejects.toMatchObject({ code: 'limit' });
    const unregistered = 'd'.repeat(64);
    const identity = await a.store.identity(a.uid);
    if (!identity) throw new Error('The invitation identity is missing.');
    const candidate = { format: 1, ownerUid: a.uid, slot: 0, displayName: identity.displayName, avatar: identity.avatar,
      createdAt: serverTimestamp(), state: 'active', acceptedBy: null };
    await assertFails(setDoc(doc(a.db, 'friendInvites', unregistered), candidate));
    const noRelease = writeBatch(a.db);
    noRelease.set(doc(a.db, 'friendInvites', unregistered), candidate);
    noRelease.set(doc(a.db, 'friendInviteSlots', a.uid, 'slots', '0'), { token: unregistered });
    await assertFails(noRelease.commit());
    const unauthorizedSlot = writeBatch(a.db);
    unauthorizedSlot.set(doc(a.db, 'friendInviteSlots', a.uid, 'slots', '20'), { token: firstToken });
    await assertFails(unauthorizedSlot.commit());
    await a.store.revokeInvite(a.uid, firstToken);
    await a.store.createInvite(a.uid);
    const closedRef = doc(a.db, 'friendInvites', firstToken);
    await assertFails(getDocFromServer(closedRef));
    await environment.withSecurityRulesDisabled(async context => {
      expect((await context.firestore().doc(`friendInvites/${firstToken}`).get()).exists).toBe(false);
    });
    await assertFails(setDoc(closedRef, { ownerUid: a.uid, state: 'active' }));
    await environment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`friendInvites/${expiredToken}`).update({ createdAt: Timestamp.fromMillis(Date.now() - 8 * 86400000) });
    });
    const replacement = await a.store.createInvite(a.uid);
    expect(replacement.slot).toBe(1);
    await environment.withSecurityRulesDisabled(async context => {
      expect((await context.firestore().doc(`friendInvites/${expiredToken}`).get()).exists).toBe(false);
    });
    await expect(a.store.createInvite(a.uid)).rejects.toMatchObject({ code: 'limit' });
  }, 60000);
});

describe('bounded strict friends-only ranking generations', () => {
  it('publishes 200 games as 100 immutable two-entry chunks within rule budgets and preserves zero/null', async () => {
    const a = await client(); const b = await client(); const outsider = await client();
    await connect(a, b);
    const entries = Array.from({ length: 200 }, (_, i): PublicEntry => ({
      ...entry, position: i + 1, id: `wikidata:Q${i + 1}`, sourceId: `Q${i + 1}`, sourceUrl: `https://www.wikidata.org/wiki/Q${i + 1}`, score: i === 0 ? 0 : null,
    }));
    const result = await share(a, entries);
    expect((await b.store.ranking(a.uid)).entries).toEqual(entries);
    await assertFails(outsider.store.ranking(a.uid));
    await assertFails(getDocsFromServer(query(collection(b.db, 'friendShares', a.uid, 'generations', result.head.current!.generation, 'chunks'), limit(101))));
    await assertFails(getDocsFromServer(collection(b.db, 'friendShares', a.uid, 'generations', result.head.current!.generation, 'chunks')));
    await expect(a.store.publishRanking(a.uid, entries, await settings(a), source, result.head.revision)).resolves.toMatchObject({ changed: false });
    const rewrite = writeBatch(a.db);
    rewrite.update(doc(a.db, 'friendShares', a.uid, 'generations', result.head.current!.generation, 'chunks', '99'), { entries: entries.slice(198).map((row) => ({ ...row, score: 7 })) });
    await assertFails(rewrite.commit());
    await a.store.saveSettings(a.uid, { enabled: false, selectedIds: [] }, await settings(a));
    expect(await a.store.cleanupSharing(a.uid)).toBe(1);
    expect((await getDocsFromServer(query(collection(a.db, 'friendShares', a.uid, 'generations', result.head.current!.generation, 'chunks'), limit(100)))).size).toBe(0);
    const odd = entries.slice(0, 199);
    const oddShare = await share(a, odd);
    expect((await b.store.ranking(a.uid)).entries).toEqual(odd);
    const tail = await getDocFromServer(doc(a.db, 'friendShares', a.uid, 'generations', oddShare.head.current!.generation, 'chunks', '99'));
    expect(tail.data()?.entries).toEqual(odd.slice(198));
  }, 60000);
  it('publishes 100 canonical plus 100 Wikidata games through catalog-checked chunks and a bounded friend query', async () => {
    const { games } = parseCollection(JSON.parse(readFileSync(new URL('../public/data/collection.json', import.meta.url), 'utf8')));
    // Seed the trusted catalog fixture; connect(), share(), and friend reads remain rules-enforced SDK operations.
    await seed('catalog/author', { records: Object.fromEntries(games.map((game) => [game.slug, { title: game.title, year: game.year }])) });
    const a = await client(); const b = await client();
    await connect(a, b);
    const entries: PublicEntry[] = [
      ...games.map((game, index): PublicEntry => ({ position: index + 1, id: game.slug, title: game.title, year: game.year, source: 'collection', sourceId: game.slug, sourceUrl: null, score: index === 0 ? 0 : null })),
      ...games.map((_, index): PublicEntry => ({ ...entry, position: games.length + index + 1, id: `wikidata:Q${index + 1}`, sourceId: `Q${index + 1}`, sourceUrl: `https://www.wikidata.org/wiki/Q${index + 1}`, score: null })),
    ];
    expect(entries.filter((row) => row.source === 'collection')).toHaveLength(100);
    expect(entries.filter((row) => row.source === 'wikidata')).toHaveLength(100);
    expect(entries.slice(0, 2).map((row) => row.source)).toEqual(['collection', 'collection']);
    // Catalog-dependent chunk/progress writes must fit 10 calls per operation / 20 per atomic commit; this is not a billing assertion.
    const published = await share(a, entries);
    const manifest = published.head.current;
    if (!manifest) throw new Error('The mixed-source publication did not create a current generation.');
    expect(manifest.count).toBe(200);
    const generation = await getDocFromServer(doc(a.db, 'friendShares', a.uid, 'generations', manifest.generation));
    expect(generation.data()).toMatchObject({ count: 200, uploaded: 100, status: 'published', ids: entries.map((row) => row.id) });
    const chunks = await getDocsFromServer(query(collection(b.db, 'friendShares', a.uid, 'generations', manifest.generation, 'chunks'), orderBy('index'), limit(100)));
    expect(chunks.size).toBe(100);
    chunks.docs.forEach((chunk, index) => {
      expect(chunk.id).toBe(String(index));
      expect(chunk.data()).toEqual({ index, entries: entries.slice(index * 2, index * 2 + 2), ids: entries.slice(index * 2, index * 2 + 2).map((row) => row.id) });
    });
    expect((await b.store.ranking(a.uid)).entries).toEqual(entries);
  }, 60000);
  it('supports empty/removal projections and promptly retires beyond current/previous without waiting five minutes', async () => {
    const a = await client(); const b = await client(); await connect(a, b);
    let head = (await share(a)).head;
    for (let score = 1; score <= 4; score += 1) {
      head = (await a.store.publishRanking(a.uid, [{ ...entry, score }], await settings(a), source, head.revision)).head;
    }
    const registry = await getDocFromServer(doc(a.db, 'friendShareRegistry', a.uid));
    expect(registry.data()?.ids).toHaveLength(2);
    const control = await a.store.saveSettings(a.uid, { enabled: true, selectedIds: [] }, await settings(a));
    await assertFails(b.store.ranking(a.uid));
    head = (await a.store.publishRanking(a.uid, [], control, source, head.revision)).head;
    expect(head.current?.count).toBe(0);
    expect((await b.store.ranking(a.uid)).entries).toEqual([]);
    for (const count of [1, 2, 3]) {
      const rows = Array.from({ length: count }, (_, index): PublicEntry => ({
        ...entry, position: index + 1, id: `wikidata:Q${index + 1}`, sourceId: `Q${index + 1}`, sourceUrl: `https://www.wikidata.org/wiki/Q${index + 1}`,
      }));
      await share(a, rows);
      expect((await b.store.ranking(a.uid)).entries).toEqual(rows);
    }
  });
  it('retries cleanup alone after a published ACK and preserves both head generations even after consent stops', async () => {
    const a = await client();
    let head = (await share(a)).head;
    head = (await a.store.publishRanking(a.uid, [{ ...entry, score: 1 }], await settings(a), source, head.revision)).head;
    const originalCleanup = a.store.cleanupSharing.bind(a.store);
    vi.spyOn(a.store, 'cleanupSharing').mockImplementationOnce(originalCleanup).mockRejectedValueOnce(new Error('Cleanup interrupted after publication.'));
    await expect(a.store.publishRanking(a.uid, [{ ...entry, score: 2 }], await settings(a), source, head.revision)).rejects.toMatchObject({
      committed: true, phase: 'cleanup', receipt: { operation: 'publish-ranking', revision: head.revision + 1 },
    });
    const published = await a.store.shareHead(a.uid);
    if (!published?.current || !published.previous) throw new Error('Published head pointers are missing.');
    await a.store.saveSettings(a.uid, { enabled: false, selectedIds: [] }, await settings(a));
    const stopped = await settings(a);
    expect(await a.store.pruneSharing(a.uid)).toBe(1);
    expect(await a.store.pruneSharing(a.uid)).toBe(0);
    expect(await a.store.shareHead(a.uid)).toEqual(published);
    expect(await settings(a)).toEqual(stopped);
    for (const id of [published.current.generation, published.previous.generation]) {
      expect((await getDocFromServer(doc(a.db, 'friendShares', a.uid, 'generations', id))).data()?.status).toBe('published');
    }
    const registry = await getDocFromServer(doc(a.db, 'friendShareRegistry', a.uid));
    expect(new Set(registry.data()?.ids)).toEqual(new Set([published.current.generation, published.previous.generation]));
  });
  it('serializes a racing head publication versus pruning an old staging generation without deleting the winning head', async () => {
    const a = await client(); const b = await client(); await connect(a, b);
    const first = await share(a);
    const control = await settings(a);
    const candidate = crypto.randomUUID();
    const candidateRef = doc(a.db, 'friendShares', a.uid, 'generations', candidate);
    const registryRef = doc(a.db, 'friendShareRegistry', a.uid);
    const registry = await getDocFromServer(registryRef);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('[]'))), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const stage = writeBatch(a.db);
    stage.update(registryRef, { ids: [...registry.data()!.ids, candidate], revision: registry.data()!.revision + 1 });
    stage.set(candidateRef, { epoch: control.epoch, settingsRevision: control.revision, source, count: 0, digest, uploaded: 0, ids: [], status: 'ready', createdAt: serverTimestamp() });
    await stage.commit();
    // Advance only the grace-period fixture; both competing retirement/publication writes still use normal rules.
    await environment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(candidateRef.path).update({ createdAt: Timestamp.fromMillis(Date.now() - 360000) });
    });
    const headRef = doc(a.db, 'friendShareHeads', a.uid);
    const publish = runTransaction(a.db, async (tx) => {
      const [current, generation] = await Promise.all([tx.get(headRef), tx.get(candidateRef)]);
      if (!generation.exists() || generation.data().status !== 'ready') throw new Error('Pruning won the generation race.');
      tx.update(candidateRef, { status: 'published' });
      tx.set(headRef, { format: 1, epoch: control.epoch, settingsRevision: control.revision, source, revision: current.data()!.revision + 1,
        current: { generation: candidate, digest, count: 0 }, previous: current.data()!.current, updatedAt: serverTimestamp() });
    });
    const [pruned, published] = await Promise.allSettled([a.store.pruneSharing(a.uid), publish]);
    expect(pruned.status).toBe('fulfilled');
    const winner = await a.store.shareHead(a.uid);
    if (!winner?.current) throw new Error('The head was lost during cleanup.');
    expect(winner.current.generation).toBe(published.status === 'fulfilled' ? candidate : first.head.current!.generation);
    expect((await getDocFromServer(doc(a.db, 'friendShares', a.uid, 'generations', winner.current.generation))).data()?.status).toBe('published');
    expect((await b.store.ranking(a.uid)).entries).toEqual(published.status === 'fulfilled' ? [] : [entry]);
  });
  it('strictly validates all five source branches, private fields, numeric bounds and forged progress', async () => {
    const { games } = parseCollection(JSON.parse(readFileSync(new URL('../public/data/collection.json', import.meta.url), 'utf8')));
    const canonical = games[0];
    if (!canonical) throw new Error('The canonical collection fixture is missing.');
    await seed('catalog/author', { records: { [canonical.slug]: { title: canonical.title, year: canonical.year } } });
    const rows: PublicEntry[] = [
      { position: 1, id: canonical.slug, title: canonical.title, year: canonical.year, source: 'collection', sourceId: canonical.slug, sourceUrl: null, score: 0 },
      { ...entry, position: 2, score: null },
      { position: 3, id: 'steam:10', title: 'Steam fixture', year: 2000, source: 'steam', sourceId: '10', sourceUrl: 'https://store.steampowered.com/app/10/', score: 10 },
      { position: 4, id: 'freetogame:10', title: 'FreeToGame fixture', year: null, source: 'freetogame', sourceId: '10', sourceUrl: 'https://www.freetogame.com/example-game', score: null },
      { position: 5, id: 'manual:exact-fixture', title: 'Manual fixture', year: 2020, source: 'manual', sourceId: 'exact-fixture', sourceUrl: null, score: 0 },
    ];
    const a = await client(); const control = await a.store.saveSettings(a.uid, { enabled: true, selectedIds: rows.map((row) => row.id) }, await settings(a));
    const generation = crypto.randomUUID(); const ref = doc(a.db, 'friendShares', a.uid, 'generations', generation);
    const registry = doc(a.db, 'friendShareRegistry', a.uid);
    const digest = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const stage = writeBatch(a.db);
    stage.set(registry, { ids: [generation], revision: 1 });
    stage.set(ref, { epoch: control.epoch, settingsRevision: control.revision, source, count: 5, digest, uploaded: 0, ids: [], status: 'staging', createdAt: serverTimestamp() });
    await assertSucceeds(stage.commit());
    const invalidChanges: Array<{ index: number; change: Record<string, unknown> }> = [
      { index: 0, change: { title: 'Forged canonical title' } }, { index: 0, change: { year: canonical.year + 1 } },
      { index: 0, change: { sourceUrl: 'https://example.test/' } }, { index: 1, change: { sourceUrl: 'https://example.test/' } },
      { index: 1, change: { sourceId: 'Q0' } }, { index: 2, change: { sourceUrl: 'https://example.test/' } },
      { index: 3, change: { sourceUrl: 'https://www.freetogame.com.evil.invalid/game' } },
      { index: 4, change: { source: 'unknown' } }, { index: 4, change: { sourceUrl: 'https://example.test/' } },
      { index: 4, change: { sourceId: 'different-identity' } }, { index: 4, change: { position: '5' } },
      { index: 4, change: { position: 5.5 } }, { index: 4, change: { id: 'manual:bad/id' } },
      { index: 4, change: { title: '' } }, { index: 4, change: { title: 'x'.repeat(201) } },
      { index: 4, change: { year: 1899 } }, { index: 4, change: { score: -1 } },
      { index: 4, change: { score: 11 } }, { index: 4, change: { score: '0' } },
      { index: 4, change: { notes: 'private' } }, { index: 4, change: { email: 'private@example.test' } },
    ];
    for (let chunkIndex = 0; chunkIndex < 3; chunkIndex += 1) {
      const start = chunkIndex * 2;
      const chunkRows = rows.slice(start, start + 2);
      const progressData = { uploaded: chunkIndex + 1, ids: rows.slice(0, start + 2).map((row) => row.id), status: chunkIndex === 2 ? 'ready' : 'staging' };
      for (const { index, change } of invalidChanges.filter((item) => item.index >= start && item.index < start + 2)) {
        const batch = writeBatch(a.db);
        batch.set(doc(ref, 'chunks', String(chunkIndex)), { index: chunkIndex, entries: chunkRows.map((row, i) => i + start === index ? { ...row, ...change } : row), ids: chunkRows.map((row) => row.id) });
        batch.update(ref, progressData);
        await assertFails(batch.commit());
      }
      const progress = writeBatch(a.db); progress.update(ref, progressData);
      await assertFails(progress.commit());
      expect((await getDocFromServer(ref)).data()?.uploaded).toBe(chunkIndex);
      const valid = writeBatch(a.db);
      valid.set(doc(ref, 'chunks', String(chunkIndex)), { index: chunkIndex, entries: chunkRows, ids: chunkRows.map((row) => row.id) });
      valid.update(ref, progressData);
      await assertSucceeds(valid.commit());
      expect((await getDocFromServer(ref)).data()?.uploaded).toBe(chunkIndex + 1);
    }
  }, 60000);
  it.each([0, 1])('enforces new selected-ranking source URL boundaries in packed position%s through direct SDK writes', async offset => {
    const owner = await client();
    const prefix = 'https://www.freetogame.com/';
    const rows: PublicEntry[] = [
      { ...entry, position: 1 },
      { ...entry, position: 2, id: 'wikidata:Q124', sourceId: 'Q124', sourceUrl: 'https://www.wikidata.org/wiki/Q124' },
    ];
    const accepted: PublicEntry = { ...entry, position: offset + 1, id: 'freetogame:10', source: 'freetogame', sourceId: '10', sourceUrl: prefix + 'a'.repeat(2048 - prefix.length) };
    rows[offset] = accepted;
    const control = await owner.store.saveSettings(owner.uid, { enabled: true, selectedIds: rows.map(row => row.id) }, await settings(owner));
    const generation = crypto.randomUUID(), ref = doc(owner.db, 'friendShares', owner.uid, 'generations', generation);
    const stage = writeBatch(owner.db);
    stage.set(doc(owner.db, 'friendShareRegistry', owner.uid), { ids: [generation], revision: 1 });
    stage.set(ref, { epoch: control.epoch, settingsRevision: control.revision, source, count: 2, digest: 'a'.repeat(64),
      uploaded: 0, ids: [], status: 'staging', createdAt: serverTimestamp() });
    await assertSucceeds(stage.commit());
    const put = (entries: PublicEntry[]) => {
      const batch = writeBatch(owner.db);
      batch.set(doc(ref, 'chunks', '0'), { index: 0, entries, ids: rows.map(row => row.id) });
      batch.update(ref, { uploaded: 1, ids: rows.map(row => row.id), status: 'ready' });
      return batch.commit();
    };
    await assertFails(put(rows.map((row, index) => index === offset ? { ...row, sourceUrl: prefix + 'a'.repeat(2049 - prefix.length) } : row)));
    expect((await getDocFromServer(ref)).data()?.uploaded).toBe(0);
    await assertSucceeds(put(rows));
    expect((await getDocFromServer(ref)).data()?.uploaded).toBe(1);
  });
  it('keeps historical oversized selected-ranking links readable by an accepted friend without allowing republishing', async () => {
    const owner = await client(), friend = await client();
    await connect(owner, friend);
    const prefix = 'https://www.freetogame.com/';
    const allowed: PublicEntry = { ...entry, id: 'freetogame:10', source: 'freetogame', sourceId: '10', sourceUrl: prefix + 'a'.repeat(2048 - prefix.length) };
    const old = { ...allowed, sourceUrl: prefix + 'a'.repeat(2049 - prefix.length) };
    const published = await share(owner, [allowed]);
    if (!published.head.current) throw new Error('The selected-ranking fixture did not publish.');
    const generation = published.head.current.generation;
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([old])))),
      value => value.toString(16).padStart(2, '0')).join('');
    await environment.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(`friendShares/${owner.uid}/generations/${generation}/chunks/0`).set({ index: 0, entries: [old], ids: [old.id] });
      await context.firestore().doc(`friendShares/${owner.uid}/generations/${generation}`).update({ digest });
      await context.firestore().doc(`friendShareHeads/${owner.uid}`).update({ 'current.digest': digest });
    });
    expect((await friend.store.ranking(owner.uid)).entries).toEqual([old]);
    const before = await owner.store.shareHead(owner.uid);
    await expect(owner.store.publishRanking(owner.uid, [old], await settings(owner), source, published.head.revision)).rejects.toThrow(/source link.*2048.*private/i);
    expect(await owner.store.shareHead(owner.uid)).toEqual(before);
    expect((await friend.store.ranking(owner.uid)).entries).toEqual([old]);
    await assertFails(setDoc(doc(owner.db, 'friendShares', owner.uid, 'generations', generation, 'chunks', '0'), { index: 0, entries: [allowed], ids: [allowed.id] }));
  });
  it('rejects duplicate/unselected IDs across chunks and source/settings stale publication', async () => {
    const a = await client();
    const published = await share(a);
    const control = await settings(a);
    await expect(a.store.publishRanking(a.uid, [{ ...entry, score: 1 }], { ...control, revision: control.revision - 1 }, source, published.head.revision)).rejects.toThrow(/settings changed/);
    await seed(`syncHeads/${a.uid}`, { format: 1, epoch: 1, revision: 1, enabled: true, deleted: false, current: null, previous: null, updatedAt: Timestamp.now() });
    await expect(a.store.publishRanking(a.uid, [{ ...entry, score: 1 }], control, source, published.head.revision)).rejects.toThrow(/copy changed/);
    await expect(a.store.publishRanking(a.uid, [{ ...entry, position: 2 }], control, source, published.head.revision)).rejects.toThrow(/ranking changed/);
  });
  it('validates both packed entries, rejects incomplete or mutable chunks and prevents cross-chunk duplicate IDs', async () => {
    const a = await client();
    const entries = Array.from({ length: 2 }, (_, i): PublicEntry => ({
      ...entry, position: i + 1, id: `wikidata:Q${i + 1}`, sourceId: `Q${i + 1}`, sourceUrl: `https://www.wikidata.org/wiki/Q${i + 1}`,
    }));
    const control = await a.store.saveSettings(a.uid, { enabled: true, selectedIds: entries.map((row) => row.id) }, await settings(a));
    const generation = crypto.randomUUID(); const ref = doc(a.db, 'friendShares', a.uid, 'generations', generation);
    const digest = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const stage = writeBatch(a.db);
    stage.set(doc(a.db, 'friendShareRegistry', a.uid), { ids: [generation], revision: 1 });
    stage.set(ref, { epoch: control.epoch, settingsRevision: control.revision, source, count: 3, digest, uploaded: 0, ids: [], status: 'staging', createdAt: serverTimestamp() });
    await assertSucceeds(stage.commit());
    const invalid = writeBatch(a.db);
    invalid.set(doc(ref, 'chunks', '0'), { index: 0, entries: entries.map((row, i) => i === 1 ? { ...row, notes: 'private second entry' } : row), ids: entries.map((row) => row.id) });
    invalid.update(ref, { uploaded: 1, ids: entries.map((row) => row.id), status: 'staging' });
    await assertFails(invalid.commit());
    const incomplete = writeBatch(a.db);
    incomplete.set(doc(ref, 'chunks', '0'), { index: 0, entries: entries.slice(0, 1), ids: entries.slice(0, 1).map((row) => row.id) });
    incomplete.update(ref, { uploaded: 1, ids: entries.slice(0, 1).map((row) => row.id), status: 'staging' });
    await assertFails(incomplete.commit());
    const legacy = writeBatch(a.db);
    const legacyEntries = Array.from({ length: 10 }, (_, i) => ({ ...entry, position: i + 1, id: `wikidata:Q${i + 1}`, sourceId: `Q${i + 1}`, sourceUrl: `https://www.wikidata.org/wiki/Q${i + 1}` }));
    legacy.set(doc(ref, 'chunks', '0'), { index: 0, entries: legacyEntries, ids: legacyEntries.map((row) => row.id) });
    legacy.update(ref, { uploaded: 1, ids: legacyEntries.map((row) => row.id), status: 'ready' });
    await assertFails(legacy.commit());
    const first = writeBatch(a.db);
    first.set(doc(ref, 'chunks', '0'), { index: 0, entries, ids: entries.map((row) => row.id) });
    first.update(ref, { uploaded: 1, ids: entries.map((row) => row.id), status: 'staging' });
    await assertSucceeds(first.commit());
    const mutate = writeBatch(a.db);
    mutate.update(doc(ref, 'chunks', '0'), { entries: entries.map((row, i) => i === 0 ? { ...row, score: 7 } : row) });
    await assertFails(mutate.commit());
    const prematureHead = writeBatch(a.db);
    prematureHead.update(ref, { status: 'published' });
    prematureHead.set(doc(a.db, 'friendShareHeads', a.uid), { format: 1, epoch: control.epoch, settingsRevision: control.revision, source, revision: 1,
      current: { generation, digest, count: 3 }, previous: null, updatedAt: serverTimestamp() });
    await assertFails(prematureHead.commit());
    const duplicate: PublicEntry = { ...entries[0]!, position: 3 };
    const unselected: PublicEntry = { ...entry, position: 3, id: 'wikidata:Q999', sourceId: 'Q999', sourceUrl: 'https://www.wikidata.org/wiki/Q999' };
    for (const row of [duplicate, unselected]) {
      const second = writeBatch(a.db);
      second.set(doc(ref, 'chunks', '1'), { index: 1, entries: [row], ids: [row.id] });
      second.update(ref, { uploaded: 2, ids: [...entries.map((item) => item.id), row.id], status: 'ready' });
      await assertFails(second.commit());
    }
  });
  it('denies a direct SDK chunk commit captured before the authoritative private source revision changed', async () => {
    const a = await client();
    const control = await a.store.saveSettings(a.uid, { enabled: true, selectedIds: [entry.id] }, await settings(a));
    const generation = crypto.randomUUID(); const ref = doc(a.db, 'friendShares', a.uid, 'generations', generation);
    const digest = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const stage = writeBatch(a.db);
    stage.set(doc(a.db, 'friendShareRegistry', a.uid), { ids: [generation], revision: 1 });
    stage.set(ref, { epoch: control.epoch, settingsRevision: control.revision, source, count: 1, digest, uploaded: 0, ids: [], status: 'staging', createdAt: serverTimestamp() });
    await stage.commit();
    await seed(`syncHeads/${a.uid}`, { format: 1, epoch: 1, revision: 1, enabled: true, deleted: false, current: null, previous: null, updatedAt: Timestamp.now() });
    const upload = writeBatch(a.db);
    upload.set(doc(ref, 'chunks', '0'), { index: 0, entries: [entry], ids: [entry.id] });
    upload.update(ref, { uploaded: 1, ids: [entry.id], status: 'ready' });
    await assertFails(upload.commit());
  });
  it('revokes reads on remove/unshare/full deletion but not merely on private-saving pause', async () => {
    const a = await client(); const b = await client(); const pair = await connect(a, b);
    const published = await share(a);
    await seed(`syncHeads/${a.uid}`, { format: 1, epoch: 2, revision: 1, enabled: false, deleted: false, current: null, previous: null, updatedAt: Timestamp.now() });
    expect((await b.store.ranking(a.uid)).entries).toHaveLength(1);
    await a.store.respond(a.uid, b.uid, 'remove', pair.epoch);
    await assertFails(b.store.ranking(a.uid));
    await connect(a, b);
    await a.store.saveSettings(a.uid, { enabled: false, selectedIds: [] }, await settings(a));
    await assertFails(b.store.ranking(a.uid));
    await assertFails(getDocFromServer(doc(b.db, 'friendShares', a.uid, 'generations', published.head.current!.generation, 'chunks', '0')));
    await a.store.revokeForDeletion(a.uid);
    await assertFails(b.store.identity(a.uid));
    await expect(b.store.sendRequest(b.uid, a.uid)).rejects.toThrow(/already friends/);
    const retained = await b.store.pair(b.uid, a.uid);
    if (!retained) throw new Error('The retained relationship fixture is missing.');
    await b.store.respond(b.uid, a.uid, 'remove', retained.epoch);
    const pairRef = doc(b.db, 'friendPairs', friendPairId(b.uid, a.uid));
    const removed = await getDocFromServer(pairRef);
    if (!removed.exists()) throw new Error('The removed relationship fixture is missing.');
    await assertFails(setDoc(pairRef, { ...removed.data(), from: b.uid, state: 'pending', epoch: removed.data().epoch + 1, inviteSlot: null, updatedAt: serverTimestamp() }));
  });
});

describe('private groups, export and resumable account deletion', () => {
  it('reconciles a repeated create intent at its retained UUID without duplicating or rewriting the server group', async () => {
    const a = await client(); const b = await client();
    const input = { id: crypto.randomUUID(), name: 'Retained create intent', participantUids: [a.uid, b.uid] };
    const first = await a.store.saveGroup(a.uid, input, 0);
    const recovered = await a.store.getGroup(a.uid, input.id);
    expect(recovered).toEqual(first);
    expect(await a.store.saveGroup(a.uid, input, 0)).toEqual(first);
    expect((await a.store.listGroups(a.uid)).items).toEqual([first]);
    await expect(a.store.saveGroup(a.uid, { ...input, name: 'Different intent' }, 0)).rejects.toThrow(/changed/);
    await expect(a.store.saveGroup(a.uid, { ...input, participantUids: [...input.participantUids].reverse() }, 0)).rejects.toThrow(/changed/);
    expect(await a.store.getGroup(a.uid, input.id)).toEqual(first);
  });
  it('enforces owner-only groups, 2-6 unique members, pagination and edit/delete conflicts', async () => {
    const a = await client(); const b = await client();
    let group = await a.store.saveGroup(a.uid, { name: 'Group', participantUids: [a.uid, b.uid] }, 0);
    await assertFails(b.store.getGroup(a.uid, group.id));
    await assertFails(b.store.listGroups(a.uid));
    await expect(a.store.saveGroup(a.uid, { id: group.id, name: 'Stale', participantUids: [a.uid, b.uid] }, 0)).rejects.toThrow(/changed/);
    const invalid = { format: 1, name: 'Invalid', participantUids: [a.uid, a.uid], revision: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    await assertFails(setDoc(doc(a.db, 'friendGroups', a.uid, 'items', crypto.randomUUID()), invalid));
    await assertFails(setDoc(doc(a.db, 'friendGroups', a.uid, 'items', crypto.randomUUID()), { ...invalid, participantUids: [a.uid] }));
    await assertFails(setDoc(doc(a.db, 'friendGroups', a.uid, 'items', 'a'.repeat(36)), { ...invalid, participantUids: [a.uid, b.uid] }));
    await assertFails(setDoc(doc(a.db, 'friendGroups', a.uid, 'items', crypto.randomUUID()), { ...invalid, participantUids: Array.from({ length: 7 }, (_, i) => `person${i}`) }));
    await assertFails(setDoc(doc(a.db, 'friendGroups', a.uid, 'items', crypto.randomUUID()), { ...invalid, participantUids: [a.uid, b.uid], scores: [0, 10] }));
    group = await a.store.saveGroup(a.uid, { id: group.id, name: 'Renamed', participantUids: ['different-person', b.uid] }, group.revision);
    await expect(a.store.deleteGroup(a.uid, group.id, group.revision - 1)).rejects.toThrow(/changed/);
    await a.store.deleteGroup(a.uid, group.id, group.revision);
    expect(await a.store.getGroup(a.uid, group.id)).toBeNull();
    await assertFails(b.store.ranking(a.uid));
  });
  it('exports no active capabilities or copied friend scores and clears all owned content after a first irreversible reservation', async () => {
    const a = await client(); const b = await client(); await connect(a, b); await share(a);
    await a.store.saveGroup(a.uid, { name: 'Private saved group', participantUids: [a.uid, b.uid] }, 0);
    const invite = await a.store.createInvite(a.uid); const oldSettings = await settings(a);
    const exported = await a.store.exportPage(a.uid);
    expect(Object.keys(exported).sort()).toEqual(['blocks', 'format', 'groups', 'identity', 'relations', 'settings']);
    expect(exported.groups.items).toHaveLength(1);
    await a.store.revokeForDeletion(a.uid);
    await assertFails(b.store.ranking(a.uid));
    await expect(a.store.saveSettings(a.uid, { enabled: true, selectedIds: [entry.id] }, oldSettings)).rejects.toMatchObject({ code: 'deleted' });
    await expect(a.store.initialize(a.uid)).rejects.toMatchObject({ code: 'deleted' });
    const result = await a.store.cleanupDeleted(a.uid);
    expect(result.done).toBe(true);
    expect(await a.store.identity(a.uid)).toBeNull();
    expect((await a.store.listGroups(a.uid)).items).toHaveLength(0);
    expect((await a.store.listRelations(a.uid)).items).toHaveLength(0);
    await environment.withSecurityRulesDisabled(async context => {
      expect((await context.firestore().doc(`friendInvites/${invite.token}`).get()).exists).toBe(false);
    });
    await expect(a.store.cleanupDeleted(a.uid)).resolves.toMatchObject({ done: true });
    await assertFails(setDoc(doc(a.db, 'friendSettings', a.uid), { format: 1, enabled: false, deleted: false, selection: '', epoch: oldSettings.epoch + 2, revision: oldSettings.revision + 2, updatedAt: serverTimestamp() }));
  });
  it('lets a surviving participant remove a relationship when the deleted account never finishes cleanup', async () => {
    const a = await client(); const b = await client();
    const pair = await connect(a, b);
    await a.store.revokeForDeletion(a.uid);
    await assertFails(b.store.identity(a.uid));
    expect((await b.store.respond(b.uid, a.uid, 'remove', pair.epoch)).state).toBe('removed');
  });
});
