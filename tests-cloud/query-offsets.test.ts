import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator, createUserWithEmailAndPassword, getIdToken,
  inMemoryPersistence, initializeAuth, reload,
} from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, documentId, getDocsFromServer, getFirestore,
  limit, orderBy, query, startAfter, where,
} from 'firebase/firestore';
import type { DocumentData, Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { candidateRules, migrationEmulators } from './fixtures/migration-rules';

type Reader = 'owner' | 'peer' | 'creator' | 'public';
type Filter = readonly [field: string, op: '==' | 'array-contains', value: string | number | boolean];
interface ListGrant {
  path: string;
  cap: number;
  peerCap?: number;
  readers: readonly Reader[];
  deleted?: boolean;
  row?: (uid: string, reader: Reader) => DocumentData;
  filters?: (uid: string, reader: Reader) => readonly Filter[];
}
interface ListCase extends ListGrant { reader: Reader; queryLimit: number }

const allFilters = (_uid: string, reader: Reader): readonly Filter[] => reader === 'peer'
  ? [['format', '==', 3], ['epoch', '==', 1], ['active', '==', true]] : [];
const grants: ListGrant[] = [
  { path: 'members', cap: 20, readers: ['creator'] },
  { path: 'accounts/{uid}/generations', cap: 20, readers: ['owner'] },
  { path: 'accounts/{uid}/chunks', cap: 20, readers: ['owner'], deleted: true },
  { path: 'creatorRanks/{uid}/chunks', cap: 20, readers: ['owner'], deleted: true },
  {
    path: 'publicProfiles', cap: 20, readers: ['public', 'creator'],
    row: (_uid, reader) => ({ published: reader === 'public', listed: reader === 'public', hidden: reader !== 'public' }),
    filters: (_uid, reader) => reader === 'public'
      ? [['published', '==', true], ['listed', '==', true], ['hidden', '==', false]] : [],
  },
  { path: 'publicProfiles/{uid}/generations', cap: 20, readers: ['owner'] },
  { path: 'publicProfiles/{uid}/generations/{generation}/entries', cap: 200, readers: ['owner', 'public', 'creator'] },
  {
    path: 'reports', cap: 20, readers: ['owner', 'creator'],
    row: uid => ({ reporterUid: uid }),
    filters: (uid, reader) => reader === 'owner' ? [['reporterUid', '==', uid]] : [],
  },
  {
    path: 'friendPairs', cap: 20, readers: ['owner'],
    row: uid => ({ participants: [uid, 'OffsetPeer'] }),
    filters: uid => [['participants', 'array-contains', uid]],
  },
  { path: 'friendBlocks/{uid}/items', cap: 20, readers: ['owner'] },
  {
    path: 'friendInvites', cap: 20, readers: ['owner'],
    row: uid => ({ ownerUid: uid }),
    filters: uid => [['ownerUid', '==', uid]],
  },
  { path: 'friendInviteSlots/{uid}/slots', cap: 20, readers: ['owner'] },
  { path: 'friendShares/{uid}/generations', cap: 3, readers: ['owner'] },
  { path: 'friendShares/{uid}/generations/{generation}/chunks', cap: 100, readers: ['owner', 'peer'] },
  { path: 'friendGroups/{uid}/items', cap: 20, readers: ['owner'] },
  { path: 'friendShelves/{uid}/generations', cap: 3, readers: ['owner'] },
  { path: 'friendShelves/{uid}/generations/{generation}/chunks', cap: 100, readers: ['owner', 'peer'] },
  {
    path: 'friendAllGames/{uid}/entries', cap: 100, peerCap: 25, readers: ['owner', 'peer'],
    row: () => ({ format: 3, epoch: 1, active: true }), filters: allFilters,
  },
  {
    path: 'friendAllRankings/{uid}/entries', cap: 100, peerCap: 25, readers: ['owner', 'peer'],
    row: () => ({ format: 3, epoch: 1, active: true }), filters: allFilters,
  },
];
const cases: ListCase[] = grants.flatMap(grant => grant.readers.map(reader => ({
  ...grant, reader, queryLimit: reader === 'peer' ? grant.peerCap ?? grant.cap : grant.cap,
})));
const endpoints = migrationEmulators();
const documents = `projects/${endpoints.projectId}/databases/(default)/documents`;
const restOrigin = `http://${endpoints.host}:${endpoints.port}/v1/${documents}`;
const generation = '00000000-0000-4000-8000-000000000001';
const apps: FirebaseApp[] = [];
let environment: RulesTestEnvironment;
let actor: { uid: string; token: string; db: Firestore };
let guest: Firestore;

function session() {
  const app = initializeApp({ apiKey: 'demo-play100-key', projectId: endpoints.projectId }, crypto.randomUUID());
  apps.push(app);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, endpoints.authOrigin, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, endpoints.host, endpoints.port);
  return { auth, db };
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: endpoints.projectId,
    firestore: { host: endpoints.host, port: endpoints.port, rules: candidateRules() },
  });
  const client = session();
  const user = (await createUserWithEmailAndPassword(
    client.auth, `offset-${crypto.randomUUID()}@example.test`, 'Emulator-only-passphrase-4382',
  )).user;
  const verified = await fetch(`${endpoints.authOrigin}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-play100-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: user.uid, emailVerified: true }),
  });
  if (!verified.ok) throw new Error('The local query-offset Auth actor could not be verified.');
  await reload(user);
  actor = { uid: user.uid, token: await getIdToken(user, true), db: client.db };
  guest = session().db;
});
beforeEach(async () => { await environment.clearFirestore(); });
afterAll(async () => {
  try { await environment?.cleanup(); }
  finally { await Promise.all(apps.splice(0).map(app => deleteApp(app))); }
});

async function fixture(testCase: ListCase) {
  const uid = testCase.reader === 'owner' ? actor.uid : 'OffsetOwner';
  const path = testCase.path.replace('{uid}', uid).replace('{generation}', generation);
  const control = { enabled: true, deleted: false, selection: '', epoch: 1, revision: 1 };
  const source = { syncEpoch: 1, remoteRevision: 0 };
  const pointer = { epoch: 1, settingsRevision: 1, source, current: { generation } };
  const allHead = { format: 3, epoch: 1, policyRevision: 1, source, status: 'ready' };
  // Only read-predicate fields are seeded; the existing suites cover write-shape validation.
  const entries: Record<string, DocumentData> = {
    '_owner/config': { uid: testCase.reader === 'creator' ? actor.uid : 'OffsetCreator' },
    [`accountLifecycle/${uid}`]: { state: 'active' },
    [`accountLifecycle/${actor.uid}`]: { state: 'active' },
    [`friendSettings/${uid}`]: control,
    [`friendSettings/${actor.uid}`]: control,
    [`syncHeads/${uid}`]: { epoch: 1, revision: 0, enabled: !testCase.deleted, deleted: testCase.deleted ?? false },
    [`friendShelfSettings/${uid}`]: { ...control, consentSyncEpoch: 1 },
    [`friendShareHeads/${uid}`]: pointer,
    [`friendShelfHeads/${uid}`]: pointer,
    [`friendAllPolicies/${uid}`]: {
      enabled: true, deleted: false, epoch: 1, revision: 1, syncEpoch: 1,
      ranking: { epoch: 1, revision: 1 }, shelf: { epoch: 1, revision: 1 },
    },
    [`friendAllHeads/${uid}/views/games`]: allHead,
    [`friendAllHeads/${uid}/views/ranking`]: allHead,
    [`${path}/a`]: testCase.row?.(uid, testCase.reader) ?? {},
    [`${path}/b`]: testCase.row?.(uid, testCase.reader) ?? {},
  };
  if (testCase.reader === 'peer') {
    entries[`friendPairs/${[uid, actor.uid].sort().join('~')}`] = { state: 'accepted' };
  }
  if (testCase.path === 'publicProfiles/{uid}/generations/{generation}/entries') {
    entries[`publicProfiles/${uid}`] = {
      generation, published: testCase.reader === 'public', hidden: testCase.reader !== 'public',
    };
  }
  await environment.withSecurityRulesDisabled(async context => {
    const batch = context.firestore().batch();
    for (const [entryPath, data] of Object.entries(entries)) batch.set(context.firestore().doc(entryPath), data);
    await batch.commit();
  });
  return { path, filters: testCase.filters?.(uid, testCase.reader) ?? [] };
}

function restValue(value: Filter[2]) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  return { integerValue: String(value) };
}
interface QueryOptions { offset?: number; cursor?: boolean; queryLimit?: number | null }
async function restQuery(testCase: ListCase, path: string, filters: readonly Filter[], options: QueryOptions = {}) {
  const segments = path.split('/');
  const collectionId = segments.pop();
  if (!collectionId) throw new Error('The query fixture must have a collection ID.');
  const parent = segments.join('/');
  const queryLimit = options.queryLimit === undefined ? testCase.queryLimit : options.queryLimit;
  return fetch(`${restOrigin}${parent ? `/${parent}` : ''}:runQuery`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(testCase.reader === 'public' ? {} : { Authorization: `Bearer ${actor.token}` }),
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        ...(filters.length ? {
          where: { compositeFilter: {
            op: 'AND', filters: filters.map(([fieldPath, op, value]) => ({
              fieldFilter: { field: { fieldPath }, op: op === '==' ? 'EQUAL' : 'ARRAY_CONTAINS', value: restValue(value) },
            })),
          } },
        } : {}),
        orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
        ...(queryLimit === null ? {} : { limit: queryLimit }),
        ...(options.offset === undefined ? {} : { offset: options.offset }),
        ...(options.cursor ? {
          startAt: { values: [{ referenceValue: `${documents}/${path}/a` }], before: false },
        } : {}),
      },
    }),
  });
}
async function documentNames(response: Response) {
  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error('Expected a REST query response array.');
  return body.flatMap((row: unknown) => {
    if (!row || typeof row !== 'object') throw new Error('Expected a REST query response object.');
    expect(row).not.toHaveProperty('error');
    if (!('document' in row)) {
      expect(row).toHaveProperty('readTime');
      return [];
    }
    const value = row.document;
    if (!value || typeof value !== 'object' || !('name' in value) || typeof value.name !== 'string') {
      throw new Error('Expected a REST query document name.');
    }
    return [value.name];
  });
}
async function permissionDenied(response: Response) {
  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ error: { status: 'PERMISSION_DENIED' } });
}

describe('capped list grants reject offsets without rejecting cursor pagination', () => {
  it.each(cases)('$path as $reader retains its $queryLimit-row cap and cursor pages', async testCase => {
    const { path, filters } = await fixture(testCase);
    const names = [`${documents}/${path}/a`, `${documents}/${path}/b`];
    for (const offset of [undefined, 0]) {
      expect(await documentNames(await restQuery(testCase, path, filters, { offset }))).toEqual(names);
      expect(await documentNames(await restQuery(testCase, path, filters, { offset, cursor: true }))).toEqual(names.slice(1));
    }
    for (const offset of [1, 10000]) {
      await permissionDenied(await restQuery(testCase, path, filters, { offset }));
      await permissionDenied(await restQuery(testCase, path, filters, { offset, cursor: true }));
    }
    await permissionDenied(await restQuery(testCase, path, filters, { queryLimit: null }));
    await permissionDenied(await restQuery(testCase, path, filters, { queryLimit: testCase.queryLimit + 1 }));

    const db = testCase.reader === 'public' ? guest : actor.db;
    const base = query(collection(db, path), ...filters.map(([field, op, value]) => where(field, op, value)),
      orderBy(documentId()), limit(testCase.queryLimit));
    const first = await getDocsFromServer(query(base, limit(1)));
    expect(first.docs.map(row => row.id)).toEqual(['a']);
    const cursor = first.docs[0];
    if (!cursor) throw new Error('The first cursor page must not be empty.');
    const next = await getDocsFromServer(query(base, startAfter(cursor), limit(1)));
    expect(next.docs.map(row => row.id)).toEqual(['b']);
  });
});
