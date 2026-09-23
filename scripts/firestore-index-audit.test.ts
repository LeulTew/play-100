import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import manifest from '../tests/fixtures/firestore-270f/manifest.json';
import {
  assertQueryIndexes, extractQueries, STORAGE_02_EXEMPTIONS,
  type FieldOverride, type IndexConfiguration, type IndexField, type QueryScope, type QueryShape,
} from './firestore-index-audit';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtureRoot = path.join(root, 'tests', 'fixtures', 'firestore-270f');
const auditFiles = new Set([
  fileURLToPath(import.meta.url),
  fileURLToPath(new URL('./firestore-index-audit.ts', import.meta.url)),
]);
const auditedRoots = ['src', 'api', 'scripts'] as const;
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a query/index object.');
  return value as Record<string, unknown>;
};
const list = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error('Expected a query/index list.');
  return value;
};
const text = (value: unknown): string => {
  if (typeof value !== 'string' || !value) throw new Error('Expected a nonempty query/index string.');
  return value;
};
const scope = (value: unknown): QueryScope => {
  if (value !== 'COLLECTION' && value !== 'COLLECTION_GROUP') throw new Error('Unknown query scope.');
  return value;
};
function indexField(value: unknown): IndexField {
  const row = record(value); const fieldPath = text(row.fieldPath);
  if (row.order !== undefined && row.arrayConfig !== undefined) throw new Error('Index field has two modes.');
  if (row.arrayConfig === 'CONTAINS') return { fieldPath, arrayConfig: 'CONTAINS' };
  if (row.order === 'ASCENDING' || row.order === 'DESCENDING') return { fieldPath, order: row.order };
  throw new Error('Unknown index mode.');
}
function configuration(value: unknown): IndexConfiguration {
  const row = record(value);
  return {
    indexes: list(row.indexes).map(value => {
      const index = record(value);
      const fields = list(index.fields).map(indexField);
      if (new Set(fields.map(field => field.fieldPath)).size !== fields.length) throw new Error('Repeated index field.');
      return { collectionGroup: text(index.collectionGroup), queryScope: scope(index.queryScope), fields };
    }),
    fieldOverrides: list(row.fieldOverrides).map(value => {
      const override = record(value);
      const indexes: FieldOverride['indexes'] = list(override.indexes).map(value => {
        const index = record(value); const mode = indexField({ ...index, fieldPath: '_' });
        return { queryScope: scope(index.queryScope), ...(mode.order ? { order: mode.order } : { arrayConfig: mode.arrayConfig }) };
      });
      return { collectionGroup: text(override.collectionGroup), fieldPath: text(override.fieldPath), indexes };
    }),
  };
}
function queryShape(value: unknown): QueryShape {
  const row = record(value);
  return {
    id: `operator:${text(row.id)}`, collectionGroup: text(row.collectionGroup), scope: scope(row.scope),
    filters: list(row.filters).map(value => {
      const filter = record(value);
      const operator = text(filter.operator);
      if (!['==', '!=', '<', '<=', '>', '>=', 'in', 'not-in', 'array-contains', 'array-contains-any'].includes(operator)) throw new Error('Unknown operator query predicate.');
      return { field: text(filter.field), operator };
    }),
    orders: list(row.orders).map(value => {
      const order = record(value);
      if (order.direction !== 'ASCENDING' && order.direction !== 'DESCENDING') throw new Error('Unknown operator order.');
      return { field: text(order.field), direction: order.direction };
    }),
  };
}
function verifiedFixture(relative: string, expected: string): Buffer {
  const bytes = readFileSync(path.join(fixtureRoot, ...relative.split('/')));
  const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (actual !== expected) throw new Error(`Frozen source changed: ${relative}`);
  return bytes;
}
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error('Unreviewed source symlink in query inventory.');
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.test\.[jt]sx?$|\.d\.ts$/.test(entry.name) ? [target] : [];
  });
}
const config = configuration(JSON.parse(readFileSync(path.join(root, 'firestore.indexes.json'), 'utf8')));
const baseline = configuration(JSON.parse(verifiedFixture(manifest.indexBaseline.path, manifest.indexBaseline.blob).toString('utf8')));
const currentFiles = auditedRoots.flatMap(directory => sourceFiles(path.join(root, directory))).filter(file => !auditFiles.has(file));
const currentQueries = currentFiles.flatMap(file =>
  extractQueries(path.relative(root, file).replaceAll('\\', '/'), readFileSync(file, 'utf8')));
const oldQueries = manifest.files.flatMap(file =>
  extractQueries(file.path, verifiedFixture(`${file.path}.txt`, file.blob).toString('utf8')));
const runbook = readFileSync(path.join(root, 'docs', 'security-release-runbook.md'), 'utf8');
const operatorBlock = /<!-- firestore-operator-queries:start -->\s*```json\s*([\s\S]*?)```\s*<!-- firestore-operator-queries:end -->/g;
const blocks = [...runbook.matchAll(operatorBlock)];
if (blocks.length !== 1) throw new Error('The runbook must contain exactly one authoritative operator-query inventory.');
const operatorQueries = list(JSON.parse(blocks[0]![1]!)).map(queryShape);
const identities = (queries: QueryShape[]) => [...new Set(queries.map(query => query.id))].sort();

describe('STORAGE-02 exact query/index contract', () => {
  it('includes application, shipped API and build-script sources while excluding the audit pair', () => {
    for (const directory of auditedRoots) {
      expect(currentFiles.some(file => path.relative(root, file).split(path.sep)[0] === directory)).toBe(true);
    }
    for (const file of auditFiles) expect(currentFiles).not.toContain(file);
    expect(currentFiles.some(file => /\.test\.[jt]sx?$|\.d\.ts$/.test(file))).toBe(false);
  });

  it('preserves every accepted composite and override and adds only thirteen exact exemptions', () => {
    expect(manifest.commit).toBe('270f4c743d3a9a89d5a64fe612e471ea045ebb47');
    expect(manifest.srcTree).toBe('f9df7578b4935e8f046e12a3f9e33609879777ff');
    expect(config.indexes).toEqual(baseline.indexes);
    expect(config.fieldOverrides.slice(0, baseline.fieldOverrides.length)).toEqual(baseline.fieldOverrides);
    expect(config.fieldOverrides.slice(baseline.fieldOverrides.length)).toEqual(STORAGE_02_EXEMPTIONS.map(value => ({ ...value, indexes: [] })));
    expect(new Set(config.fieldOverrides.map(value => `${value.collectionGroup}.${value.fieldPath}`)).size).toBe(config.fieldOverrides.length);
    expect(config.fieldOverrides.some(value => value.fieldPath.includes('*') || value.collectionGroup.includes('*'))).toBe(false);
  });

  it('enumerates all current and immutable rollback query constructors before checking availability', () => {
    const oldOwners = [
      'src/cloud/cloud-store.ts#listMembers',
      ...['page', 'inventory', 'prepareEpoch', 'pruneInactive', 'cleanupPage'].map(name => `src/cloud/friend-all-store.ts#FriendAllStore.${name}`),
      'src/cloud/friend-shelf-store.ts#FriendShelfStore.shelf',
      ...['relationsQuery', 'listBlocks', 'listInvites', 'ranking', 'listGroups'].map(name => `src/cloud/friend-store.ts#FriendStore.${name}`),
      ...['entries', 'directory', 'members', 'reports', 'cleanup', 'deleteProfile'].map(name => `src/cloud/social-store.ts#SocialStore.${name}`),
    ];
    expect(identities(oldQueries)).toEqual(oldOwners.sort());
    expect(identities(currentQueries)).toEqual([...oldOwners,
      'src/cloud/cloud-store.ts#CloudStore.probeDeletedCopy', 'src/cloud/cloud-store.ts#CloudStore.purgeDeletedPayload',
      'src/cloud/friend-all-store.ts#FriendAllStore.pruneLegacy',
      'src/cloud/friend-store.ts#FriendStore.freePairCapacity', 'src/cloud/friend-store.ts#FriendStore.cleanupDeleted',
      'src/cloud/social-store.ts#SocialStore.report',
    ].sort());
    for (const file of manifest.files) {
      expect(oldQueries.some(query => query.id.startsWith(`${file.path}#`))).toBe(file.querySource);
    }
    expect(() => assertQueryIndexes(config, currentQueries)).not.toThrow();
    expect(() => assertQueryIndexes(config, oldQueries)).not.toThrow();
  });

  it('proves all four shared chunks namespaces retain the only field order they query', () => {
    const namespaces = (rules: string) => [...rules.matchAll(/match\s+(\/[^\s]*\/chunks\/\{[^}]+\})/g)]
      .map(value => value[1]!.replace(/\{[^}]+\}/g, '{}')).sort();
    const expected = ['/accounts/{}/chunks/{}', '/creatorRanks/{}/chunks/{}',
      '/friendShares/{}/generations/{}/chunks/{}', '/friendShelves/{}/generations/{}/chunks/{}'].sort();
    expect(namespaces(readFileSync(path.join(root, 'firestore.rules'), 'utf8'))).toEqual(expected);
    expect(namespaces(readFileSync(path.join(root, 'tests-cloud', 'fixtures', 'live-270f4c7', 'firestore.rules'), 'utf8'))).toEqual(expected);
    const chunks = currentQueries.filter(query => query.collectionGroup === 'chunks');
    expect(identities(chunks)).toEqual([
      'src/cloud/cloud-store.ts#CloudStore.probeDeletedCopy', 'src/cloud/cloud-store.ts#CloudStore.purgeDeletedPayload',
      'src/cloud/friend-shelf-store.ts#FriendShelfStore.shelf', 'src/cloud/friend-store.ts#FriendStore.ranking',
    ]);
    expect(new Set(chunks.flatMap(query => query.orders.map(order => `${order.field}:${order.direction}`)))).toEqual(new Set(['index:ASCENDING']));
  });

  it('audits the complete formal runbook inventory, including creator and participant recounts', () => {
    expect(operatorQueries).toHaveLength(24);
    expect(new Set(operatorQueries.map(query => query.id)).size).toBe(24);
    expect(operatorQueries.find(query => query.id === 'operator:creator-pairs')?.filters).toEqual([{ field: 'creatorUid', operator: '==' }]);
    expect(operatorQueries.find(query => query.id === 'operator:legacy-participant-pairs')?.filters).toEqual([{ field: 'participants', operator: 'array-contains' }]);
    expect(() => assertQueryIndexes(config, operatorQueries)).not.toThrow();
    const outside = runbook.replace(operatorBlock, '');
    expect(outside).not.toMatch(/\b(?:where|orderBy|collectionGroup)\s*\(/);
  });

  it.each(STORAGE_02_EXEMPTIONS)('rejects a query of proposed exemption $collectionGroup.$fieldPath', exemption => {
    const query: QueryShape = { id: 'negative control', collectionGroup: exemption.collectionGroup, scope: 'COLLECTION',
      filters: [{ field: exemption.fieldPath, operator: '==' }], orders: [] };
    expect(() => assertQueryIndexes(config, [query])).toThrow(/proposed exemption is queried/);
    expect(() => assertQueryIndexes(config, [{ ...query, filters: [{ field: `${exemption.fieldPath}.nested`, operator: 'array-contains' }] }]))
      .toThrow(/proposed exemption is queried/);
  });

  it('rejects missing required ASC/DESC/CONTAINS support and required composites', () => {
    for (const [collectionGroup, fieldPath, queries] of [
      ['chunks', 'index', currentQueries], ['generations', 'createdAt', oldQueries],
      ['reports', 'createdAt', currentQueries], ['friendPairs', 'participants', operatorQueries],
      ['friendPairs', 'creatorUid', operatorQueries], ['reports', 'reporterUid', operatorQueries], ['handles', 'uid', operatorQueries],
    ] as const) {
      const changed = structuredClone(config);
      changed.fieldOverrides.push({ collectionGroup, fieldPath, indexes: [] });
      expect(() => assertQueryIndexes(changed, queries)).toThrow(/missing .* index/);
    }
    const changed = structuredClone(config);
    changed.indexes = changed.indexes.filter(index => !(index.collectionGroup === 'entries' && index.fields[0]?.fieldPath === 'format'));
    expect(() => assertQueryIndexes(changed, currentQueries)).toThrow(/missing .* composite/);
    const withoutPairs = structuredClone(config);
    withoutPairs.indexes = withoutPairs.indexes.filter(index => !index.fields.some(field => field.fieldPath === 'creatorUid'));
    expect(() => assertQueryIndexes(withoutPairs, currentQueries)).toThrow(/missing .* composite/);
  });

  it('handles aliases and conditional fields, and fails closed on hidden or dynamic query factories', () => {
    const prelude = "import { collection as c, query as q, where as w, orderBy as o } from 'firebase/firestore';";
    const queries = extractQueries('probe.ts', `${prelude}
      function lookup(db, uid, choice) { return q(c(db, 'root', uid, 'entries'), w('epoch', '==', 1), w('active', '==', true), o(choice ? 'entry.title' : 'entry.position')); }`);
    expect(queries).toHaveLength(2);
    expect(() => assertQueryIndexes(config, queries)).not.toThrow();
    expect(() => extractQueries('probe.ts', `${prelude} const hidden = w; hidden('token', '==', 1);`)).toThrow(/aliased\/passed/);
    expect(() => extractQueries('probe.ts', `${prelude} function f(db, field) { return q(c(db, 'entries'), w(field, '==', 1)); }`)).toThrow(/resolve query binding/);
    expect(() => extractQueries('probe.ts', `${prelude} function f() { return w('token', '==', 1); }`)).toThrow(/not covered/);
  });

  it.each([
    "collection(db, 'accounts/u/chunks')",
    "collection(db, 'accounts', uid, 'generations/g/chunks')",
    "collectionGroup(db, 'accounts/u/chunks')",
  ])('rejects a slash-joined collection path instead of missing an exempt field: %s', reference => {
    expect(() => extractQueries('probe.ts', `
      import { query, collection, collectionGroup, where } from 'firebase/firestore';
      function f(db, uid) { return query(${reference}, where('digest', '==', 1)); }`))
      .toThrow(/slash-joined collection path/);
  });

  it.each(auditedRoots)('rejects direct RPC and structured query syntax in %s until an extractor is reviewed', directory => {
    for (const source of [
      "client.runQuery(request);",
      "fetch('https://firestore.example/v1/projects/demo/databases/(default)/documents:runQuery');",
      "const request = { structuredQuery: { from: [{ collectionId: 'chunks' }] } };",
      'const body = \'{"structuredQuery": {"from": [{"collectionId": "chunks"}]}}\';',
    ]) {
      expect(() => extractQueries(`${directory}/probe.ts`, source)).toThrow(/runQuery\/structuredQuery requires a reviewed extractor/);
    }
  });

  it.each(auditedRoots)('rejects REST ordering in %s without rejecting bound SDK ordering', directory => {
    for (const source of [
      "fetch('https://firestore.example/v1/projects/demo/databases/(default)/documents/chunks?pageSize=5&orderBy=digest');",
      "fetch('https://firestore.example/v1/projects/demo/databases/(default)/documents/chunks?orderBy=digest');",
      "params.set('orderBy', 'digest');",
      'params.set("orderBy", "digest");',
      "params.set(`orderBy`, 'digest');",
      'const body = \'{"orderBy":"digest"}\';',
    ]) {
      expect(() => extractQueries(`${directory}/probe.ts`, source)).toThrow(/REST orderBy requires a reviewed extractor/);
    }
    expect(extractQueries(`${directory}/probe.ts`, `
      import { query, collection, orderBy } from 'firebase/firestore';
      function f(db) { return query(collection(db, 'chunks'), orderBy('index')); }`)).toHaveLength(1);
  });

  it.each([
    "db.collection('x').where('digest', '==', 1);",
    "db.collection('x').orderBy('digest');",
    "db.collectionGroup('chunks');",
  ])('rejects unaudited Admin method chains: %s', source => {
    expect(() => extractQueries('api/probe.ts', source)).toThrow(/Unbound query primitive/);
  });

  it('does not accept source-ordered multi-inequality fields as the SDK implicit order', () => {
    const wrongOrder: IndexConfiguration = { fieldOverrides: [], indexes: [{
      collectionGroup: 'probe', queryScope: 'COLLECTION',
      fields: [{ fieldPath: 'b', order: 'ASCENDING' }, { fieldPath: 'a', order: 'ASCENDING' }],
    }] };
    const queries = extractQueries('probe.ts', `
      import { query, collection, where } from 'firebase/firestore';
      function f(db) { return query(collection(db, 'probe'), where('b', '>', 1), where('a', '<', 9)); }`);
    expect(() => assertQueryIndexes(wrongOrder, queries)).toThrow(/implicit multi-inequality ordering/);
  });

  it('does not drop an explicit document-ID order appearing before a field order', () => {
    const queries = extractQueries('probe.ts', `
      import { query, collection, orderBy, documentId } from 'firebase/firestore';
      function f(db) { return query(collection(db, 'probe'), orderBy(documentId()), orderBy('a')); }`);
    expect(() => assertQueryIndexes({ indexes: [], fieldOverrides: [] }, queries)).toThrow(/last explicit order/);
  });

  it('does not ignore limitToLast target-direction reversal', () => {
    expect(() => extractQueries('probe.ts', `
      import { query, collection, orderBy, limitToLast } from 'firebase/firestore';
      function f(db) { return query(collection(db, 'probe'), orderBy('a', 'desc'), limitToLast(5)); }`))
      .toThrow(/Unknown query constraint factory/);
  });

  it('fails closed when explicit document-ID-only ordering omits an inequality field', () => {
    const queries = extractQueries('probe.ts', `
      import { query, collection, where, orderBy, documentId } from 'firebase/firestore';
      function f(db) { return query(collection(db, 'probe'), where('a', '>', 1), orderBy(documentId())); }`);
    expect(() => assertQueryIndexes({ indexes: [], fieldOverrides: [] }, queries)).toThrow(/implicit inequality ordering/);
  });
});
