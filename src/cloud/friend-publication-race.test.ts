import { deleteApp, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import * as firestore from 'firebase/firestore';
import type { DocumentData, DocumentReference, Transaction } from 'firebase/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FriendStore } from './friend-store';
import { FriendShelfStore } from './friend-shelf-store';
import { FriendStoreError, parseFriendHead, validateFriendEntries } from '../lib/friend-types';
import type { FriendSettings, FriendShareHead } from '../lib/friend-types';
import { friendShelfDigest, validateFriendShelfEntries } from '../lib/friend-shelf-types';
import type { FriendShelfConfig, FriendShelfEntry } from '../lib/friend-shelf-types';
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
const ranked: PublicEntry = {
  position: 1,
  id: 'wikidata:Q123',
  title: 'Shared example',
  year: 2020,
  source: 'wikidata',
  sourceId: 'Q123',
  sourceUrl: 'https://www.wikidata.org/wiki/Q123',
  score: 0,
};
const shelved: FriendShelfEntry = {
  id: ranked.id,
  title: ranked.title,
  year: ranked.year,
  source: 'wikidata',
  sourceId: ranked.sourceId,
  sourceUrl: ranked.sourceUrl,
};
const settings: FriendSettings = {
  format: 1,
  enabled: true,
  deleted: false,
  selectedIds: [ranked.id],
  epoch: 1,
  revision: 1,
  updatedAt: 1000,
};
const shelfConfig: FriendShelfConfig = { ...settings, consentSyncEpoch: 1 };
const settingsDocument = {
  format: 1,
  enabled: true,
  deleted: false,
  selection: ranked.id,
  epoch: 1,
  revision: 1,
  updatedAt: firestore.Timestamp.fromMillis(1000),
};

function client() {
  const app = initializeApp({ projectId: 'demo-play100' }, crypto.randomUUID());
  apps.push(app);
  return firestore.getFirestore(app);
}
async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
// The friends-only ranking and the shared-games shelf publish through the same steps into their own documents.
const publications = [
  {
    name: 'ranking',
    settings: `friendSettings/${uid}`,
    settingsDocument,
    head: `friendShareHeads/${uid}`,
    registry: `friendShareRegistry/${uid}`,
    generation: `friendShares/${uid}/generations/${generation}`,
    digest: () => sha256(validateFriendEntries([ranked], settings.selectedIds)),
    publish: (expectedHeadRevision: number) => {
      const store = new FriendStore(client());
      vi.spyOn(store, 'cleanupSharing').mockResolvedValue(0);
      return store.publishRanking(uid, [ranked], settings, source, expectedHeadRevision);
    },
    changed: { settings: /settings changed/, source: /private online copy changed/, head: /newer shared ranking/ },
  },
  {
    name: 'shelf',
    settings: `friendShelfSettings/${uid}`,
    settingsDocument: { ...settingsDocument, consentSyncEpoch: 1 },
    head: `friendShelfHeads/${uid}`,
    registry: `friendShelfRegistry/${uid}`,
    generation: `friendShelves/${uid}/generations/${generation}`,
    digest: () => friendShelfDigest(validateFriendShelfEntries([shelved], shelfConfig.selectedIds)),
    publish: (expectedHeadRevision: number) => {
      const store = new FriendShelfStore(client());
      vi.spyOn(store, 'config').mockResolvedValue(shelfConfig);
      vi.spyOn(store, 'prune').mockResolvedValue(0);
      return store.publish(uid, [shelved], shelfConfig, source, expectedHeadRevision, () => true);
    },
    changed: { settings: /changed elsewhere/, source: /private online copy/, head: /changed elsewhere/ },
  },
];
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

beforeEach(() => {
  documents.clear();
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
  vi.mocked(firestore.runTransaction).mockImplementation(
    async (_db: firestore.Firestore, update: (tx: Transaction) => Promise<unknown>) => {
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
    },
  );
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

describe.each(publications)('a $name publication that races another device of the same account', (publication) => {
  const publish = (expectedHeadRevision = 0): Promise<{ changed: boolean; head: FriendShareHead }> =>
    publication.publish(expectedHeadRevision);
  const head = () => documents.get(publication.head);
  const ownGeneration = () => documents.get(publication.generation);
  beforeEach(() => {
    documents.set(publication.settings, publication.settingsDocument);
  });

  it('takes the same content another device published as its result when its chunk is refused', async () => {
    const other = headDocument(await publication.digest());
    let refusals = 0;
    refuseBatch = () => {
      refusals += 1;
      documents.set(publication.head, other);
      throw denied();
    };
    await expect(publish()).resolves.toEqual({ changed: false, head: parseFriendHead(other) });
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
    const result = await publish();
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
    await expect(publish()).rejects.toBe(refusal);
    expect(refusals).toBe(2);
    expect(head()).toBeUndefined();
  });
  it.each([
    [
      'the settings changed',
      () => documents.set(publication.settings, { ...publication.settingsDocument, revision: 2 }),
      publication.changed.settings,
    ],
    [
      'the private copy moved',
      () => documents.set(`syncHeads/${uid}`, { ...documents.get(`syncHeads/${uid}`), revision: 1 }),
      publication.changed.source,
    ],
    [
      'another device published different content',
      () => documents.set(publication.head, headDocument('f'.repeat(64))),
      publication.changed.head,
    ],
  ])('reports a refusal after %s as a retryable conflict', async (_, change, message) => {
    let refusals = 0;
    refuseBatch = () => {
      refusals += 1;
      change();
      throw denied();
    };
    const outcome = publish();
    await expect(outcome).rejects.toBeInstanceOf(FriendStoreError);
    await expect(outcome).rejects.toMatchObject({ code: 'conflict', message: expect.stringMatching(message) });
    expect(refusals).toBe(1);
  });
  it('settles a refused registration the same way', async () => {
    let refusals = 0;
    refuseTransaction = (writes) => {
      if (writes.some((write) => write.path === publication.registry) && ++refusals === 1) throw denied();
    };
    await expect(publish()).resolves.toMatchObject({ changed: true, head: { current: { generation } } });
    expect(refusals).toBe(2);
    expect(documents.get(publication.registry)).toEqual({ ids: [generation], revision: 1 });
  });
  it('does not settle other failures', async () => {
    const unavailable = Object.assign(new Error('The service is unavailable.'), { code: 'unavailable' });
    refuseBatch = () => {
      throw unavailable;
    };
    await expect(publish()).rejects.toBe(unavailable);
    // The first check and the registration only: no settling read.
    expect(firestore.runTransaction).toHaveBeenCalledTimes(2);
  });
  it('takes the same content published during its upload as its result instead of a conflict', async () => {
    const other = headDocument(await publication.digest());
    refuseBatch = () => {
      documents.set(publication.head, other);
    };
    await expect(publish()).resolves.toEqual({ changed: false, head: parseFriendHead(other) });
    expect(head()).toBe(other);
    expect(ownGeneration()).toMatchObject({ status: 'ready', uploaded: 1 });
  });
  it('takes the same content published before it started as its result, at any head revision', async () => {
    const other = headDocument(await publication.digest(), 4);
    documents.set(publication.head, other);
    await expect(publish(3)).resolves.toEqual({ changed: false, head: parseFriendHead(other) });
    expect(ownGeneration()).toBeUndefined();
  });
});
