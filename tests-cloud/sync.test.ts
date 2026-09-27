import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
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
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  disableNetwork,
  doc,
  enableNetwork,
  getDocFromServer,
  getFirestore,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import type { DocumentReference, Firestore, Transaction, TransactionOptions } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudStore, RemoteConflict, SyncRevoked } from '../src/cloud/cloud-store';
import { ensureAccountActivity } from '../src/cloud/account-lifecycle';
import { applyPersonalAction, emptyPersonalLibrary } from '../src/lib/personal-library';
import type { LibraryRecord } from '../src/lib/personal-types';

// A pass-through, so one test can hold a transaction between its reads and its commit.
vi.mock('firebase/firestore', async (original) => {
  const actual = await original<typeof import('firebase/firestore')>();
  return { ...actual, runTransaction: vi.fn(actual.runTransaction) };
});

let environment: RulesTestEnvironment;
const apps: FirebaseApp[] = [];
const password = 'Emulator-only-passphrase-4382';
const game: LibraryRecord = {
  id: 'wikidata:Q123',
  source: 'wikidata',
  sourceId: 'Q123',
  sourceUrl: 'https://www.wikidata.org/wiki/Q123',
  title: 'Protocol fixture',
  year: 2020,
  studio: null,
  genre: null,
  collectionRank: null,
};
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
  vi.mocked(runTransaction).mockReset().mockImplementation(actual.runTransaction);
  await environment.clearFirestore();
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => deleteApp(app)));
});
afterAll(async () => {
  await environment.cleanup();
});

async function client(existingEmail?: string) {
  const app = initializeApp({ apiKey: 'demo-play100-key', projectId: 'demo-play100' }, crypto.randomUUID());
  apps.push(app);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8188);
  const email = existingEmail ?? `protocol-${crypto.randomUUID()}@example.test`;
  const result = existingEmail
    ? await signInWithEmailAndPassword(auth, email, password)
    : await createUserWithEmailAndPassword(auth, email, password);
  if (!existingEmail) {
    const verified = await fetch(
      'http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-play100-key',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ localId: result.user.uid, emailVerified: true }),
      },
    );
    if (!verified.ok) throw new Error('The isolated Auth emulator could not verify its synthetic fixture.');
    await reload(result.user);
    await getIdToken(result.user, true);
    await ensureAccountActivity(db, result.user.uid);
    await setDoc(doc(db, 'members', result.user.uid), {
      uid: result.user.uid,
      displayName: 'Protocol fixture',
      avatar: { version: 1, seed: '1'.repeat(32), palette: 'lime' },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      consentVersion: 1,
      gameCount: 0,
      rankCount: 0,
    });
  }
  return { db, user: result.user, email, store: new CloudStore(db, result.user.uid) };
}

describe('real Auth and Firestore snapshot transactions', () => {
  it('heals an absent unretained private generation ID during deletion and removes its registry', async () => {
    const { store, db, user } = await client();
    const head = await store.enable(null);
    await store.revoke(head, true);
    const registry = doc(db, 'accounts', user.uid, 'metadata', 'registry');
    await environment.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc(registry.path)
        .set({ ids: [crypto.randomUUID()], revision: 1 });
    });
    expect(await store.cleanup(true)).toBe(1);
    expect((await getDocFromServer(registry)).exists()).toBe(false);
  });
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

  it.each([
    ['publishes the same library', 'adopted'],
    ['publishes a different library', 'conflict'],
    ['publishes the same library and then stops online saving', 'revoked'],
  ] as const)(
    'resolves a second writer held between its chunk writes and publication after the first writer %s',
    async (_action, outcome) => {
      const first = await client();
      const second = await client(first.email);
      const base = await first.store.enable(null);
      const library = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 8 });
      const other = applyPersonalAction(library, { type: 'edit-ranking', id: game.id, score: 9 });
      let release = () => {};
      let arrive = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const arrived = new Promise<void>((resolve) => {
        arrive = resolve;
      });
      let batches = 0;
      // This one-game library packs into one private and one ranking batch. After both, the second writer has
      // registered and staged its generation and waits just before marking it ready.
      const pending = second.store.upload(library, base, async () => {
        batches += 1;
        if (batches !== 2) return;
        arrive();
        await held;
      });
      const early = pending.then(() => {
        throw new Error('The second writer finished before reaching its barrier.');
      });
      early.catch(() => {});
      await Promise.race([arrived, early]);
      const published = await first.store.upload(outcome === 'conflict' ? other : library, base);
      if (outcome === 'revoked') await first.store.revoke(published);
      release();
      if (outcome === 'adopted') {
        const result = await pending;
        expect(result).toMatchObject({ epoch: base.epoch, revision: published.revision, current: published.current });
        expect(await second.store.download(result)).toEqual({ ...library, revision: 0, motion: 'auto' });
      } else {
        await expect(pending).rejects.toBeInstanceOf(outcome === 'conflict' ? RemoteConflict : SyncRevoked);
      }
      expect(batches).toBe(2);
      expect(await first.store.head()).toMatchObject({
        revision: published.revision + (outcome === 'revoked' ? 1 : 0),
        current: published.current,
      });
    },
  );

  it('settles a head commit refused because the other writer published the same library first', async () => {
    const first = await client();
    const second = await client(first.email);
    const base = await first.store.enable(null);
    const library = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 8 });
    const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
    let staged = () => {};
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      staged = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let holding = true;
    // Holds the second writer's head commit after its transaction read the head and staged its writes, so the first
    // writer publishes in between. The emulator refuses that stale commit instead of retrying it, as it did in the
    // Release 5 two-tab race that ended in "Online saving paused".
    vi.mocked(runTransaction).mockImplementation(
      async <T>(db: Firestore, operation: (tx: Transaction) => Promise<T>, options?: TransactionOptions) =>
        actual.runTransaction(
          db,
          async (tx) => {
            const result = await operation(tx);
            if (holding && db === second.db && result && typeof result === 'object' && 'current' in result) {
              holding = false;
              staged();
              await released;
            }
            return result;
          },
          options,
        ),
    );
    const pending = second.store.upload(library, base);
    await held;
    const published = await first.store.upload(library, base);
    release();
    expect(await pending).toMatchObject({ epoch: base.epoch, revision: published.revision, current: published.current });
    expect(await first.store.head()).toMatchObject({ revision: published.revision, current: published.current });
  });
  it('settles a chunk write refused because the other writer added its own holder first', async () => {
    const first = await client();
    const second = await client(first.email);
    const library = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 8 });
    const saved = await first.store.upload(library, await first.store.enable(null));
    // Only the private library changes, so both writers carry the saved ranking chunk over and add a holder to it.
    const played = applyPersonalAction(library, { type: 'toggle-progress', record: game, key: 'played' });
    const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
    let staged = () => {};
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      staged = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let holding = true;
    // Holds the second writer's ranking chunk write after its transaction read the chunk, so the first writer adds its
    // own holder in between and the second writer's holders are stale.
    vi.mocked(runTransaction).mockImplementation(
      async <T>(db: Firestore, operation: (tx: Transaction) => Promise<T>, options?: TransactionOptions) =>
        actual.runTransaction(
          db,
          async (tx) => {
            let chunk = false;
            const read = tx.get.bind(tx);
            tx.get = ((ref: DocumentReference) => {
              if (ref.path.startsWith(`creatorRanks/${first.user.uid}/chunks/`)) chunk = true;
              return read(ref);
            }) as Transaction['get'];
            const result = await operation(tx);
            if (holding && chunk && db === second.db) {
              holding = false;
              staged();
              await released;
            }
            return result;
          },
          options,
        ),
    );
    const pending = second.store.upload(played, saved);
    await held;
    const published = await first.store.upload(played, saved);
    release();
    expect(await pending).toMatchObject({ epoch: saved.epoch, revision: published.revision, current: published.current });
  });
  it('an interruption between uploaded chunks and the head commit leaves the last complete copy intact', async () => {
    const { store } = await client();
    const empty = await store.enable(null);
    const original = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 6 });
    const before = await store.upload(original, empty);
    const edited = applyPersonalAction(original, { type: 'edit-ranking', id: game.id, score: 10 });
    await expect(
      store.upload(edited, before, async () => {
        throw new Error('Simulated disconnect after chunk acknowledgement');
      }),
    ).rejects.toThrow(/disconnect/);
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
    await expect(
      store.upload(applyPersonalAction(original, { type: 'edit-ranking', id: game.id, score: 9 }), saved),
    ).rejects.toThrow();
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
    const refusal: unknown = await store.enable(deleted).then(() => null, (cause: unknown) => cause);
    // Resuming a deleted online copy needs a fresh sign-in: that check refuses it, within the rules evaluation limit.
    expect(refusal).toMatchObject({ code: 'permission-denied' });
    expect(refusal instanceof Error ? refusal.message : '').not.toContain('maximum of 1000 expressions');
  });

  it('keeps a deleted online copy deleted for a session older than the deletion until a fresh sign-in resumes it', async () => {
    const first = await client();
    const library = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 8 });
    const deleted = await first.store.revoke(await first.store.upload(library, await first.store.enable(null)), true);
    await expect(first.store.revoke(deleted)).rejects.toBeInstanceOf(SyncRevoked);
    // This session signed in before the deletion. Its raw pause would clear the deleted marker, so that a later resume
    // skipped the fresh sign-in; the rules refuse it.
    const headRef = doc(first.db, 'syncHeads', first.user.uid);
    const stored = (await getDocFromServer(headRef)).data();
    if (!stored) throw new Error('The deleted head is missing.');
    await assertFails(
      setDoc(headRef, {
        ...stored,
        enabled: false,
        deleted: false,
        epoch: stored.epoch + 1,
        revision: stored.revision + 1,
        updatedAt: serverTimestamp(),
      }),
    );
    expect(await first.store.head()).toMatchObject({ enabled: false, deleted: true, revision: deleted.revision });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const fresh = await client(first.email);
    expect(await fresh.store.enable(deleted)).toMatchObject({ enabled: true, deleted: false, epoch: deleted.epoch + 1 });
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
