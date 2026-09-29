import { deleteApp, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import * as firestore from 'firebase/firestore';
import type { DocumentData, DocumentReference, Transaction } from 'firebase/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FriendStore } from './friend-store';
import { FriendStoreError, parseFriendHead, validateFriendEntries } from '../lib/friend-types';
import type { FriendSettings } from '../lib/friend-types';
import type { PublicEntry } from '../lib/community';

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return { ...actual, runTransaction: vi.fn(), writeBatch: vi.fn() };
});

// Two devices of one account publish the same selection after the same settings change (docs/intermittents.md,
// REL-08). These tests replace Firestore with an in-memory document map whose commits can be refused, and put the
// other device's writes into that map from the refused commit, as the race does.
type Write = { kind: 'set' | 'update'; path: string; data: DocumentData };
const apps: FirebaseApp[] = [];
const documents = new Map<string, DocumentData>();
let refuseTransaction: (writes: Write[]) => void = () => {};
let refuseBatch: (writes: Write[]) => void = () => {};
const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
const uid = 'alice';
const generation = '11111111-1111-4111-8111-111111111111';
const otherGeneration = '22222222-2222-4222-8222-222222222222';
const source = { syncEpoch: 1, remoteRevision: 0 };
const entry: PublicEntry = {
  position: 1,
  id: 'wikidata:Q123',
  title: 'Shared example',
  year: 2020,
  source: 'wikidata',
  sourceId: 'Q123',
  sourceUrl: 'https://www.wikidata.org/wiki/Q123',
  score: 0,
};
const expected: FriendSettings = {
  format: 1,
  enabled: true,
  deleted: false,
  selectedIds: [entry.id],
  epoch: 1,
  revision: 1,
  updatedAt: 1000,
};

async function digestOf(entries: PublicEntry[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(validateFriendEntries(entries, expected.selectedIds)));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
function headDocument(digest: string, revision = 1): DocumentData {
  return {
    format: 1,
    epoch: 1,
    settingsRevision: 1,
    revision,
    source,
    current: { generation: otherGeneration, digest, count: 1 },
    previous: null,
    updatedAt: firestore.Timestamp.fromMillis(2000),
  };
}
function apply(writes: Write[]) {
  for (const { kind, path, data } of writes) {
    const value = Object.fromEntries(
      Object.entries(data).map(([key, field]) => [
        key,
        field instanceof firestore.FieldValue ? firestore.Timestamp.fromMillis(3000) : field,
      ]),
    );
    documents.set(path, kind === 'set' ? value : { ...documents.get(path), ...value });
  }
}
function recorder(writes: Write[]) {
  const record = (kind: Write['kind']) => (ref: DocumentReference, data: DocumentData) => {
    writes.push({ kind, path: ref.path, data });
    return recorded;
  };
  const recorded = { set: record('set'), update: record('update') };
  return recorded;
}
function client() {
  const app = initializeApp({ projectId: 'demo-play100' }, crypto.randomUUID());
  apps.push(app);
  const store = new FriendStore(firestore.getFirestore(app));
  vi.spyOn(store, 'cleanupSharing').mockResolvedValue(0);
  return store;
}
const publish = (store: FriendStore, expectedHeadRevision = 0) =>
  store.publishRanking(uid, [entry], expected, source, expectedHeadRevision);
const head = () => documents.get(`friendShareHeads/${uid}`);
const ownGeneration = () => documents.get(`friendShares/${uid}/generations/${generation}`);

beforeEach(() => {
  documents.clear();
  documents.set(`friendSettings/${uid}`, {
    format: 1,
    enabled: true,
    deleted: false,
    selection: entry.id,
    epoch: 1,
    revision: 1,
    updatedAt: firestore.Timestamp.fromMillis(1000),
  });
  documents.set(`syncHeads/${uid}`, {
    format: 1,
    epoch: 1,
    revision: 0,
    enabled: true,
    deleted: false,
    current: null,
    previous: null,
    updatedAt: firestore.Timestamp.fromMillis(1000),
  });
  refuseTransaction = () => {};
  refuseBatch = () => {};
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(generation);
  vi.mocked(firestore.runTransaction).mockImplementation((async (
    _db: firestore.Firestore,
    update: (tx: Transaction) => Promise<unknown>,
  ) => {
    const writes: Write[] = [];
    const tx = {
      ...recorder(writes),
      get: async (ref: DocumentReference) => {
        const data = documents.get(ref.path);
        return { exists: () => data !== undefined, data: () => data };
      },
    };
    const result = await update(tx as unknown as Transaction);
    refuseTransaction(writes);
    apply(writes);
    return result;
  }) as unknown as typeof firestore.runTransaction);
  vi.mocked(firestore.writeBatch).mockImplementation((() => {
    const writes: Write[] = [];
    return {
      ...recorder(writes),
      commit: async () => {
        refuseBatch(writes);
        apply(writes);
      },
    };
  }) as unknown as typeof firestore.writeBatch);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  await Promise.all(apps.splice(0).map(deleteApp));
});

describe('a ranking publication that races another device of the same account', () => {
  it('takes the same content another device published as its result when its chunk is refused', async () => {
    const other = headDocument(await digestOf([entry]));
    let refusals = 0;
    refuseBatch = () => {
      refusals += 1;
      documents.set(`friendShareHeads/${uid}`, other);
      throw denied();
    };
    const store = client();
    await expect(publish(store)).resolves.toEqual({ changed: false, head: parseFriendHead(other) });
    expect(refusals).toBe(1);
    expect(head()).toBe(other);
    expect(ownGeneration()).toMatchObject({ status: 'staging', uploaded: 0 });
  });
  it('retries a refused chunk once when nothing changed, then publishes', async () => {
    let refusals = 0;
    refuseBatch = () => {
      refusals += 1;
      if (refusals === 1) throw denied();
    };
    const result = await publish(client());
    expect(refusals).toBe(2);
    expect(result).toMatchObject({ changed: true, head: { revision: 1, current: { generation } } });
    expect(ownGeneration()).toMatchObject({ status: 'published', uploaded: 1 });
  });
  it('reports a second refusal as it came when nothing changed', async () => {
    const refusal = denied();
    let refusals = 0;
    refuseBatch = () => {
      refusals += 1;
      throw refusal;
    };
    await expect(publish(client())).rejects.toBe(refusal);
    expect(refusals).toBe(2);
    expect(head()).toBeUndefined();
  });
  it.each([
    [
      'the settings changed',
      () => documents.set(`friendSettings/${uid}`, { ...documents.get(`friendSettings/${uid}`), revision: 2 }),
      /settings changed/,
    ],
    [
      'the private copy moved',
      () => documents.set(`syncHeads/${uid}`, { ...documents.get(`syncHeads/${uid}`), revision: 1 }),
      /private online copy changed/,
    ],
    [
      'another device published different content',
      () => documents.set(`friendShareHeads/${uid}`, headDocument('f'.repeat(64))),
      /newer shared ranking/,
    ],
  ])('reports a refusal after %s as a retryable conflict', async (_, change, message) => {
    let refusals = 0;
    refuseBatch = () => {
      refusals += 1;
      change();
      throw denied();
    };
    const outcome = publish(client());
    await expect(outcome).rejects.toBeInstanceOf(FriendStoreError);
    await expect(outcome).rejects.toMatchObject({ code: 'conflict', message: expect.stringMatching(message) });
    expect(refusals).toBe(1);
  });
  it('settles a refused registration the same way', async () => {
    let refusals = 0;
    refuseTransaction = (writes) => {
      if (writes.some((write) => write.path === `friendShareRegistry/${uid}`) && ++refusals === 1) throw denied();
    };
    await expect(publish(client())).resolves.toMatchObject({ changed: true, head: { current: { generation } } });
    expect(refusals).toBe(2);
    expect(documents.get(`friendShareRegistry/${uid}`)).toEqual({ ids: [generation], revision: 1 });
  });
  it('does not settle other failures', async () => {
    const unavailable = Object.assign(new Error('The service is unavailable.'), { code: 'unavailable' });
    refuseBatch = () => {
      throw unavailable;
    };
    await expect(publish(client())).rejects.toBe(unavailable);
    // P1 and the registration only: no settling read.
    expect(firestore.runTransaction).toHaveBeenCalledTimes(2);
  });
  it('takes the same content published during its upload as its result instead of a conflict', async () => {
    const other = headDocument(await digestOf([entry]));
    refuseBatch = () => {
      documents.set(`friendShareHeads/${uid}`, other);
    };
    await expect(publish(client())).resolves.toEqual({ changed: false, head: parseFriendHead(other) });
    expect(head()).toBe(other);
    expect(ownGeneration()).toMatchObject({ status: 'ready', uploaded: 1 });
  });
  it('takes the same content published before it started as its result, at any head revision', async () => {
    const other = headDocument(await digestOf([entry]), 4);
    documents.set(`friendShareHeads/${uid}`, other);
    await expect(publish(client(), 3)).resolves.toEqual({ changed: false, head: parseFriendHead(other) });
    expect(ownGeneration()).toBeUndefined();
  });
});
