import { describe, expect, it } from 'vitest';
import {
  applyPersonalAction,
  applyPersonalActionWithin,
  backupFileSizeError,
  createLibraryBackup,
  describeLibraryBackup,
  emptyPersonalLibrary,
  exportLibraryBackup,
  formatBackupLimit,
  libraryBackupBytes,
  migrateLegacyLibrary,
  parseLibraryBackup,
  parsePersonalLibrary,
  readLibraryBackup,
  utf8Length,
} from './personal-library';
import { MAX_BACKUP_FILE_BYTES, MAX_LIBRARY_BACKUP_BYTES } from './personal-types';
import type { GameSource, LibraryRecord, PersonalAction, PersonalLibraryState } from './personal-types';

function game(id: string, source: GameSource = 'collection', rank = 1): LibraryRecord {
  return {
    id,
    title: `Game ${id}`,
    year: 2007,
    studio: 'A studio',
    genre: 'Adventure',
    source,
    sourceId: id.split(':').at(-1) ?? id,
    sourceUrl: null,
    collectionRank: source === 'collection' ? rank : null,
  };
}

const a = game('collection-a', 'collection', 12);
const b = game('collection-b', 'collection', 3);
const c = game('steam:620', 'steam');
const canonical = [a, b];

function apply(state: PersonalLibraryState, ...actions: PersonalAction[]): PersonalLibraryState {
  return actions.reduce(applyPersonalAction, state);
}

function fixture(): PersonalLibraryState {
  return apply(
    emptyPersonalLibrary(),
    { type: 'set-progress', records: [a, b], key: 'later', value: true },
    { type: 'add-ranking', records: [c] },
  );
}

describe('personal library actions', () => {
  it('starts empty, with no inferred personal rankings or played games', () => {
    expect(emptyPersonalLibrary()).toEqual({
      version: 3,
      revision: 0,
      records: {},
      progress: {},
      queueOrder: [],
      ranking: [],
      motion: 'auto',
    });
  });

  it('accepts records from every actual source and preserves author metadata', () => {
    const records = [
      a,
      c,
      game('wikidata:Q123', 'wikidata'),
      game('freetogame:452', 'freetogame'),
      game('manual:123e4567-e89b-12d3-a456-426614174000', 'manual'),
    ];
    const state = apply(emptyPersonalLibrary(), { type: 'add-records', records });
    expect(Object.values(state.records)).toEqual(records);
    expect(state.revision).toBe(1);
    expect(state.progress).toEqual({});
    expect(parsePersonalLibrary(state)).toEqual(state);
    const addedAgain = apply(state, { type: 'add-records', records: [{ ...a, collectionRank: 99 }] });
    expect(addedAgain.records[a.id]?.collectionRank).toBe(12);
  });

  it('bulk queues games once, in selection order, without marking them played', () => {
    const state = apply(emptyPersonalLibrary(), {
      type: 'set-progress',
      records: [b, a, b],
      key: 'later',
      value: true,
    });
    expect(state.queueOrder).toEqual([b.id, a.id]);
    expect(state.progress[a.id]).toEqual({ later: true, played: false, completed: false });
    expect(state.revision).toBe(1);
  });

  it('supports bulk completion and independent replay queues', () => {
    const state = apply(
      fixture(),
      { type: 'set-progress', records: [a, b], key: 'completed', value: true },
      { type: 'set-progress', records: [b], key: 'later', value: false },
      { type: 'set-progress', records: [b], key: 'later', value: true },
    );
    expect(state.progress[a.id]).toEqual({ later: true, played: true, completed: true });
    expect(state.progress[b.id]).toEqual({ later: true, played: true, completed: true });
    expect(state.queueOrder).toEqual([a.id, b.id]);
    expect(state.ranking).toEqual([{ id: c.id, score: null, note: '', manualPosition: null }]);
  });

  it('unmarking completion preserves played; unmarking played clears completion only', () => {
    const completed = apply(fixture(), { type: 'set-progress', records: [a, b], key: 'completed', value: true });
    const state = apply(
      completed,
      { type: 'toggle-progress', record: a, key: 'completed' },
      { type: 'toggle-progress', record: b, key: 'played' },
    );
    expect(state.progress[a.id]).toEqual({ later: true, played: true, completed: false });
    expect(state.progress[b.id]).toEqual({ later: true, played: false, completed: false });
    expect(state.queueOrder).toEqual([a.id, b.id]);
  });

  it('can rank an unplayed game, with independent scores and notes', () => {
    const state = apply(
      emptyPersonalLibrary(),
      { type: 'add-ranking', records: [a, c, a] },
      { type: 'edit-ranking', id: c.id, score: 8.5, note: 'Want to try this first.' },
    );
    expect(state.ranking).toEqual([
      { id: c.id, score: 8.5, note: 'Want to try this first.', manualPosition: null },
      { id: a.id, score: null, note: '', manualPosition: null },
    ]);
    expect(state.progress).toEqual({});
    expect(state.queueOrder).toEqual([]);
    expect(state.records[a.id]?.collectionRank).toBe(a.collectionRank);
  });

  it('atomically imports and rates an external game without inventing progress or author scores', () => {
    const initial = emptyPersonalLibrary();
    const state = apply(initial, { type: 'rate-game', record: c, score: 9.25 });
    expect(state.revision).toBe(1);
    expect(state.records).toEqual({ [c.id]: c });
    expect(state.ranking).toEqual([{ id: c.id, score: 9.25, note: '', manualPosition: null }]);
    expect(state.progress).toEqual({});
    expect(state.queueOrder).toEqual([]);
    expect(initial).toEqual(emptyPersonalLibrary());
  });

  it('rating from another surface preserves existing metadata, notes, manual slots and replay progress', () => {
    const state = apply(
      emptyPersonalLibrary(),
      { type: 'rate-game', record: a, score: 8 },
      { type: 'rate-game', record: c, score: 5 },
      { type: 'edit-ranking', id: c.id, note: 'My own order' },
      { type: 'move-item', list: 'ranking', id: c.id, overId: a.id },
      { type: 'set-progress', records: [c], key: 'completed', value: true },
      { type: 'set-progress', records: [c], key: 'later', value: true },
    );
    const changed = apply(
      state,
      { type: 'rate-game', record: { ...c, title: 'Changed provider metadata' }, score: 0 },
      { type: 'rate-game', record: a, score: 10 },
    );
    expect(changed.ranking.map((entry) => entry.id)).toEqual([c.id, a.id]);
    expect(changed.ranking[0]).toEqual({ id: c.id, score: 0, note: 'My own order', manualPosition: 1 });
    expect(changed.records[c.id]).toEqual(c);
    expect(changed.progress).toEqual(state.progress);
    expect(changed.queueOrder).toEqual([c.id]);
  });

  it('repeated catalog ratings create one record and ranking; clearing a rating retains the game', () => {
    const state = apply(
      emptyPersonalLibrary(),
      { type: 'rate-game', record: c, score: 8 },
      { type: 'rate-game', record: c, score: 10 },
      { type: 'rate-game', record: c, score: null },
    );
    expect(Object.keys(state.records)).toEqual([c.id]);
    expect(state.ranking).toEqual([{ id: c.id, score: null, note: '', manualPosition: null }]);
    expect(state.progress).toEqual({});
  });

  it.each([-1, 10.1, NaN, Infinity])('invalid catalog rating %s cannot leave a partly imported game', (score) => {
    const initial = emptyPersonalLibrary();
    expect(() => apply(initial, { type: 'rate-game', record: c, score })).toThrow(/rating/);
    expect(initial).toEqual(emptyPersonalLibrary());
  });

  it('removes ranking membership without deleting progress or record metadata', () => {
    const state = apply(
      fixture(),
      { type: 'add-ranking', records: [a] },
      { type: 'remove-ranking', ids: [a.id, a.id] },
    );
    expect(state.ranking.map((item) => item.id)).toEqual([c.id]);
    expect(state.progress[a.id]?.later).toBe(true);
    expect(state.records[a.id]).toEqual(a);
  });

  it('removes only the exact saved opinion and re-adds it empty without affecting a provider copy', () => {
    const provider = { ...game('wikidata:Q123', 'wikidata'), title: a.title };
    const before = apply(
      emptyPersonalLibrary(),
      { type: 'add-ranking', records: [a, b, provider] },
      { type: 'edit-ranking', id: a.id, score: 8.5, note: 'Only remove after confirmation.' },
      { type: 'edit-ranking', id: provider.id, score: 9, note: 'Independent provider opinion.' },
      { type: 'move-item', list: 'ranking', id: a.id, overId: provider.id },
      { type: 'set-progress', records: [a, provider], key: 'completed', value: true },
      { type: 'set-progress', records: [b, a, provider], key: 'later', value: true },
    );
    expect(before.ranking[0]).toEqual({
      id: a.id,
      score: 8.5,
      note: 'Only remove after confirmation.',
      manualPosition: 1,
    });
    const after = apply(before, { type: 'remove-ranking', ids: [a.id] });
    expect(after).toEqual({
      ...before,
      revision: before.revision + 1,
      ranking: before.ranking.filter((entry) => entry.id !== a.id),
    });
    const readded = apply(parsePersonalLibrary(after), { type: 'add-ranking', records: [a] });
    expect(readded.ranking.find((entry) => entry.id === a.id)).toEqual({
      id: a.id,
      score: null,
      note: '',
      manualPosition: null,
    });
    expect(readded.ranking.find((entry) => entry.id === provider.id)).toEqual(
      before.ranking.find((entry) => entry.id === provider.id),
    );
    expect(readded.records).toEqual(before.records);
    expect(readded.progress).toEqual(before.progress);
    expect(readded.queueOrder).toEqual(before.queueOrder);
    expect(readded.version).toBe(3);
  });

  it('removes only selected private records and their memberships while retaining remaining manual order', () => {
    const before = apply(
      emptyPersonalLibrary(),
      { type: 'set-progress', records: [a, b, c], key: 'later', value: true },
      { type: 'set-progress', records: [b], key: 'completed', value: true },
      { type: 'add-ranking', records: [a, b, c] },
      { type: 'edit-ranking', id: b.id, score: 10, note: 'Remove this private note too' },
      { type: 'edit-ranking', id: a.id, score: 8, note: 'Keep this note' },
      { type: 'move-item', list: 'ranking', id: c.id, overId: b.id },
    );
    const original = JSON.stringify(before);
    const after = apply(before, { type: 'remove-records', ids: [b.id] });
    expect(Object.keys(after.records)).toEqual([a.id, c.id]);
    expect(after.records[b.id]).toBeUndefined();
    expect(after.progress[b.id]).toBeUndefined();
    expect(after.queueOrder).toEqual([a.id, c.id]);
    expect(after.ranking.map((entry) => entry.id)).toEqual([c.id, a.id]);
    expect(after.ranking[0]?.manualPosition).toBe(1);
    expect(after.ranking[1]?.note).toBe('Keep this note');
    expect(after.records[a.id]).toEqual(a);
    expect(JSON.stringify(before)).toBe(original);
    expect(canonical).toEqual([a, b]);
    expect(parsePersonalLibrary(after)).toEqual(after);
  });

  it('bulk removal is idempotent and preserves preferences even when all private games are removed', () => {
    const before = apply(fixture(), { type: 'set-motion', motion: 'lite' });
    const removed = apply(before, { type: 'remove-records', ids: [a.id, a.id, b.id, c.id, 'already-removed'] });
    expect(removed.records).toEqual({});
    expect(removed.progress).toEqual({});
    expect(removed.queueOrder).toEqual([]);
    expect(removed.ranking).toEqual([]);
    expect(removed.motion).toBe('lite');
    expect(removed.revision).toBe(before.revision + 1);
    const again = apply(removed, { type: 'remove-records', ids: [a.id] });
    expect(again.records).toEqual({});
  });

  it.each([null, [null], [5], [''], ['x'.repeat(201)]])(
    'rejects malformed private removal IDs (%s) without partial changes',
    (ids) => {
      const before = fixture();
      const original = JSON.stringify(before);
      expect(() => applyPersonalAction(before, { type: 'remove-records', ids } as unknown as PersonalAction)).toThrow();
      expect(JSON.stringify(before)).toBe(original);
    },
  );

  it('clears a score with null, preserves omitted edits, and supports exact limits', () => {
    const state = apply(
      fixture(),
      { type: 'edit-ranking', id: c.id, score: 0, note: 'n'.repeat(2_000) },
      { type: 'edit-ranking', id: c.id, score: 10 },
      { type: 'edit-ranking', id: c.id, score: null },
    );
    expect(state.ranking[0]).toEqual({ id: c.id, score: null, note: 'n'.repeat(2_000), manualPosition: null });
  });

  it.each(['queue', 'ranking'] as const)('moves against the latest %s order without losing appended games', (list) => {
    const initial = apply(
      emptyPersonalLibrary(),
      list === 'queue'
        ? { type: 'set-progress', records: [a, b], key: 'later', value: true }
        : { type: 'add-ranking', records: [a, b] },
    );
    const staleIntent: PersonalAction = { type: 'move-item', list, id: a.id, overId: b.id };
    const latest = apply(
      initial,
      list === 'queue'
        ? { type: 'set-progress', records: [c], key: 'later', value: true }
        : { type: 'add-ranking', records: [c] },
    );
    const moved = apply(latest, staleIntent);
    const ids = list === 'queue' ? moved.queueOrder : moved.ranking.map((item) => item.id);
    expect(ids).toEqual([b.id, a.id, c.id]);
    const movedBack = apply(moved, { type: 'move-item', list, id: c.id, overId: b.id });
    expect(list === 'queue' ? movedBack.queueOrder : movedBack.ranking.map((item) => item.id)).toEqual([
      c.id,
      b.id,
      a.id,
    ]);
  });

  it('appends returning Play later games, preserving other manually ordered entries', () => {
    const state = apply(
      fixture(),
      { type: 'move-item', list: 'queue', id: a.id, overId: b.id },
      { type: 'set-progress', records: [b], key: 'later', value: false },
      { type: 'set-progress', records: [c, b], key: 'later', value: true },
    );
    expect(state.queueOrder).toEqual([a.id, c.id, b.id]);
  });

  it('does not mutate the previous state, nested objects, or action metadata', () => {
    const original = fixture();
    const serialized = JSON.stringify(original);
    const action: PersonalAction = { type: 'set-progress', records: [a], key: 'completed', value: true };
    const serializedAction = JSON.stringify(action);
    const result = applyPersonalAction(original, action);
    expect(JSON.stringify(original)).toBe(serialized);
    expect(JSON.stringify(action)).toBe(serializedAction);
    expect(result.records[a.id]).not.toBe(original.records[a.id]);
    expect(result.progress[a.id]).not.toBe(original.progress[a.id]);
    expect(result.ranking[0]).not.toBe(original.ranking[0]);
    expect(result.revision).toBe(original.revision + 1);
  });

  it('increments once for each valid action, including valid no-ops', () => {
    const state = apply(
      fixture(),
      { type: 'set-motion', motion: 'lite' },
      { type: 'add-ranking', records: [c] },
      { type: 'move-item', list: 'queue', id: a.id, overId: a.id },
    );
    expect(state.motion).toBe('lite');
    expect(state.revision).toBe(5);
  });

  it.each([-1, 10.1, NaN, Infinity, -Infinity, '8', undefined])(
    'rejects an invalid rating (%s) without coercion',
    (value) => {
      expect(() =>
        applyPersonalAction(fixture(), {
          type: 'edit-ranking',
          id: c.id,
          score: value,
        } as unknown as PersonalAction),
      ).toThrow(/rating/);
    },
  );

  it.each([
    { type: 'move-item', list: 'queue', id: a.id, overId: 'missing' },
    { type: 'move-item', list: 'ranking', id: 'missing', overId: c.id },
    { type: 'edit-ranking', id: a.id, score: 5 },
    { type: 'edit-ranking', id: c.id, note: 'n'.repeat(2_001) },
    { type: 'edit-ranking', id: c.id, note: null },
    { type: 'set-progress', records: [a], key: 'played', value: 'true' },
    { type: 'set-progress', records: [a], key: 'unknown', value: true },
    { type: 'set-motion', motion: 'unknown' },
    { type: 'unknown' },
  ])('rejects an invalid action $type without mutating state', (action) => {
    const state = fixture();
    const before = JSON.stringify(state);
    expect(() => applyPersonalAction(state, action as unknown as PersonalAction)).toThrow();
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('strict personal library parsing', () => {
  it.each([
    ['title', ''],
    ['title', ' '.repeat(4)],
    ['title', 't'.repeat(201)],
    ['title', 3],
    ['year', 1899],
    ['year', 2101],
    ['year', 2000.5],
    ['year', '2007'],
    ['year', NaN],
    ['studio', 's'.repeat(201)],
    ['genre', 'g'.repeat(201)],
    ['source', 'unknown'],
    ['sourceId', null],
    ['sourceUrl', 'http://example.com'],
    ['sourceUrl', 'https://'],
    ['sourceUrl', 'https://user:password@example.com'],
    ['sourceUrl', 'javascript:alert(1)'],
    ['sourceUrl', 'https://exam\nple.com'],
    ['collectionRank', 0],
    ['collectionRank', 101],
    ['collectionRank', 1.5],
    ['collectionRank', null],
    ['collectionRank', '1'],
  ])('rejects invalid game metadata: %s (%s)', (field, value) => {
    expect(() =>
      parsePersonalLibrary({
        ...emptyPersonalLibrary(),
        records: { [a.id]: { ...a, [String(field)]: value } },
      }),
    ).toThrow();
  });

  it('allows nullable metadata, boundary years, and valid HTTPS sources', () => {
    const records = [
      { ...a, title: 't'.repeat(200), year: 1900, studio: null, genre: null },
      { ...b, year: 2100, sourceUrl: 'https://example.com/game?source=collection' },
      { ...c, year: null, studio: 's'.repeat(200), genre: 'g'.repeat(200) },
    ];
    expect(Object.values(apply(emptyPersonalLibrary(), { type: 'add-records', records }).records)).toEqual(records);
  });

  type Corrupt = (state: PersonalLibraryState) => unknown;
  const corruptions: Array<[string, Corrupt]> = [
    ['version', (s) => ({ ...s, version: 1 })],
    ['fractional revision', (s) => ({ ...s, revision: 0.5 })],
    ['negative revision', (s) => ({ ...s, revision: -1 })],
    ['non-finite revision', (s) => ({ ...s, revision: Infinity })],
    ['unsafe revision', (s) => ({ ...s, revision: Number.MAX_SAFE_INTEGER + 1 })],
    ['records array', (s) => ({ ...s, records: [a] })],
    ['mismatched record ID', (s) => ({ ...s, records: { ...s.records, [a.id]: b } })],
    ['external author rank', (s) => ({ ...s, records: { ...s.records, [c.id]: { ...c, collectionRank: 4 } } })],
    [
      'orphan progress',
      (s) => ({ ...s, progress: { ...s.progress, missing: { later: false, completed: false, played: false } } }),
    ],
    [
      'unplayed completion',
      (s) => ({ ...s, progress: { ...s.progress, [a.id]: { later: true, completed: true, played: false } } }),
    ],
    [
      'nonboolean progress',
      (s) => ({ ...s, progress: { ...s.progress, [a.id]: { later: 1, completed: false, played: false } } }),
    ],
    ['duplicate queue IDs', (s) => ({ ...s, queueOrder: [a.id, b.id, a.id] })],
    ['missing queued game', (s) => ({ ...s, queueOrder: [a.id] })],
    ['orphan queue ID', (s) => ({ ...s, queueOrder: [a.id, b.id, 'missing'] })],
    ['queue without later', (s) => ({ ...s, queueOrder: [a.id, b.id, c.id] })],
    ['duplicate rankings', (s) => ({ ...s, ranking: [...s.ranking, ...s.ranking] })],
    ['orphan ranking', (s) => ({ ...s, ranking: [{ id: 'missing', score: null, note: '', manualPosition: null }] })],
    ['bad backup score', (s) => ({ ...s, ranking: [{ id: c.id, score: NaN, note: '', manualPosition: null }] })],
    [
      'oversized note',
      (s) => ({ ...s, ranking: [{ id: c.id, score: null, note: 'n'.repeat(2_001), manualPosition: null }] }),
    ],
    ['unknown motion', (s) => ({ ...s, motion: 'unknown' })],
    ['unsupported extra fields', (s) => ({ ...s, surprise: true })],
  ];
  it.each(corruptions)('rejects %s', (_name, corrupt) => {
    expect(() => parsePersonalLibrary(corrupt(fixture()))).toThrow();
  });

  it.each(['__proto__', 'constructor', 'prototype', 'bad/id', 'bad.id', 'has space'])('rejects unsafe ID %s', (id) => {
    const records = Object.fromEntries([[id, { ...a, id }]]);
    expect(() => parsePersonalLibrary({ ...emptyPersonalLibrary(), records })).toThrow();
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });

  it('rejects inherited fields and accessor properties', () => {
    const inherited: unknown = Object.create(fixture());
    expect(() => parsePersonalLibrary(inherited)).toThrow();
    const value = fixture();
    Object.defineProperty(value, 'motion', { get: () => 'auto', enumerable: true });
    expect(() => parsePersonalLibrary(value)).toThrow(/accessors/);
  });

  it.each(['queueOrder', 'ranking'])('rejects sparse %s arrays', (field) => {
    expect(() => parsePersonalLibrary({ ...emptyPersonalLibrary(), [field]: new Array<unknown>(1) })).toThrow();
  });

  it('accepts 10,000 private records but refuses to exceed the limit', () => {
    const records = Array.from({ length: 10_000 }, (_, index) => game(`manual:${index}`, 'manual'));
    const state = apply(emptyPersonalLibrary(), { type: 'add-records', records });
    expect(Object.keys(state.records)).toHaveLength(10_000);
    expect(() => apply(state, { type: 'add-records', records: [c] })).toThrow(/10000/);
  });

  it('does not overflow the revision counter', () => {
    expect(() =>
      apply(
        { ...fixture(), revision: Number.MAX_SAFE_INTEGER },
        {
          type: 'set-motion',
          motion: 'auto',
        },
      ),
    ).toThrow(/revision limit/);
  });
});

describe('legacy migration and portable backups', () => {
  it('uses known canonical metadata, migrates author-order queues, and never infers rankings', () => {
    const raw = JSON.stringify({
      version: 1,
      motion: 'lite',
      progress: { [a.id]: { later: true, completed: true }, [b.id]: { later: true, completed: false } },
    });
    const state = migrateLegacyLibrary(raw, canonical);
    expect(state.queueOrder).toEqual([b.id, a.id]);
    expect(state.records).toEqual({ [a.id]: a, [b.id]: b });
    expect(state.progress[a.id]).toEqual({ later: true, completed: true, played: true });
    expect(state.progress[b.id]).toEqual({ later: true, completed: false, played: false });
    expect(state.motion).toBe('lite');
    expect(state.ranking).toEqual([]);
    expect(state.revision).toBe(0);
  });

  it.each([
    'not json',
    JSON.stringify({ version: 9, progress: {}, motion: 'auto' }),
    JSON.stringify({ version: 1, progress: { unknown: { later: true, completed: false } }, motion: 'auto' }),
    JSON.stringify({ version: 1, progress: { [a.id]: { later: 'yes', completed: false } }, motion: 'auto' }),
  ])('explicitly rejects migration it cannot preserve (%s)', (raw) => {
    expect(() => migrateLegacyLibrary(raw, canonical)).toThrow(
      expect.objectContaining({
        name: 'PersonalLibraryMigrationError',
        message: expect.stringContaining('original data has not been changed'),
      }),
    );
  });

  it('cannot migrate an existing legacy game without canonical data', () => {
    const raw = JSON.stringify({ version: 1, progress: { [a.id]: { later: true, completed: false } }, motion: 'auto' });
    expect(() => migrateLegacyLibrary(raw, [])).toThrow(/unknown game ID/);
  });

  it('exports a detached, strict version-three backup and round-trips all private data', () => {
    const state = apply(fixture(), { type: 'edit-ranking', id: c.id, score: 9.25, note: 'Private\nnotes 🎮' });
    const backup = createLibraryBackup(state);
    expect(backup.app).toBe('Play 100');
    expect(backup.formatVersion).toBe(3);
    expect(new Date(backup.exportedAt).toISOString()).toBe(backup.exportedAt);
    expect(backup.library).not.toBe(state);
    expect(parseLibraryBackup(JSON.parse(JSON.stringify(backup)) as unknown)).toEqual(state);
  });

  it.each([
    { app: 'Play100' },
    { formatVersion: 1 },
    { exportedAt: 'yesterday' },
    { exportedAt: Infinity },
    { exportedAt: '2026-02-30T12:00:00.000Z' },
    { library: null },
    { library: { version: 2 } },
    { extra: true },
  ])('rejects corrupt backup envelopes (%j)', (change) => {
    expect(() => parseLibraryBackup({ ...createLibraryBackup(fixture()), ...change })).toThrow();
  });
});
describe('single reducer validation boundary', () => {
  it('parses a raw state exactly once, into a copy, and keeps rejecting invalid raw input', () => {
    const counted = (value: PersonalLibraryState) => {
      let reads = 0;
      const proxy = new Proxy(value, {
        get(target, key, receiver) {
          if (key === 'records') reads += 1;
          return Reflect.get(target, key, receiver);
        },
      });
      return { proxy, reads: () => reads };
    };
    const raw = fixture();
    const baseline = counted(raw);
    parsePersonalLibrary(baseline.proxy);
    const reduced = counted(raw);
    const next = applyPersonalAction(reduced.proxy, { type: 'set-progress', records: [a], key: 'played', value: true });
    // One parse reads the raw records exactly as often as a standalone parse does.
    expect(reduced.reads()).toBe(baseline.reads());
    expect(baseline.reads()).toBeGreaterThan(0);
    expect(next.progress[a.id]?.played).toBe(true);
    expect(raw.progress[a.id]?.played).not.toBe(true);
    expect(next.records).not.toBe(raw.records);
    let failure: unknown;
    try {
      applyPersonalAction({ ...raw, records: 'not a record map' }, { type: 'use-rating-order' });
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toMatchObject({ name: 'PersonalLibraryValidationError' });
  });
});
describe('restore preview counts', () => {
  it('names one saved game in the singular and every other count unchanged', () => {
    const one = apply(emptyPersonalLibrary(), { type: 'set-progress', records: [a], key: 'later', value: true });
    expect(describeLibraryBackup(one)).toBe('1 game, 1 queued, 0 ranked.');
    expect(describeLibraryBackup(fixture())).toBe('3 games, 2 queued, 1 ranked.');
    expect(describeLibraryBackup(emptyPersonalLibrary())).toBe('0 games, 0 queued, 0 ranked.');
  });
});

describe('library backup byte budget', () => {
  const encoded = (text: string) => new TextEncoder().encode(text).length;
  const exactBytes = (state: PersonalLibraryState) => encoded(JSON.stringify(createLibraryBackup(state)));
  const noted = (state: PersonalLibraryState, note: string) =>
    applyPersonalAction(state, { type: 'edit-ranking', id: c.id, note });

  it('is one 20 MiB contract shared by writes, export and import copy', () => {
    expect(MAX_LIBRARY_BACKUP_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_BACKUP_FILE_BYTES).toBe(24 * 1024 * 1024);
    expect(formatBackupLimit(MAX_LIBRARY_BACKUP_BYTES)).toBe('20 MB');
    expect(backupFileSizeError(MAX_BACKUP_FILE_BYTES)).toBeNull();
    expect(backupFileSizeError(MAX_BACKUP_FILE_BYTES + 1)).toBe(
      'This backup file exceeds the 24 MB import limit. No data was changed.',
    );
  });

  it('measures exactly what TextEncoder counts for the compact backup, without allocating it', () => {
    for (const sample of [
      'plain',
      'é',
      '€ and ✓',
      '😀 astral',
      '\ud800 lone high',
      'lone low \udc00',
      'end high \ud83d',
      '\u0000\u001f',
    ]) {
      expect(utf8Length(sample)).toBe(encoded(sample));
      expect(utf8Length(JSON.stringify(sample))).toBe(encoded(JSON.stringify(sample)));
    }
    const state = noted(fixture(), 'Ünïcödé 😀 \u0007 note');
    expect(libraryBackupBytes(state)).toBe(exactBytes(state));
    const exported = exportLibraryBackup(state);
    expect(exported.ok && exported.bytes).toBe(exactBytes(state));
  });

  it('refuses a growing change past the budget and leaves the prior state intact', () => {
    const before = fixture();
    const budget = libraryBackupBytes(before) + 20;
    expect(
      applyPersonalActionWithin(before, { type: 'edit-ranking', id: c.id, note: 'short' }, budget).ranking[0]?.note,
    ).toBe('short');
    const snapshot = structuredClone(before);
    let failure: unknown;
    try {
      applyPersonalActionWithin(before, { type: 'edit-ranking', id: c.id, note: 'x'.repeat(100) }, budget);
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toMatchObject({
      name: 'PersonalLibraryBudgetError',
      message: `This change would take your library past its ${formatBackupLimit(budget)} backup limit. Remove games or shorten notes, then try again. Nothing was changed.`,
    });
    expect(before).toEqual(snapshot);
    expect(() =>
      applyPersonalActionWithin(before, { type: 'add-records', records: [game('steam:1', 'steam')] }, budget),
    ).toThrow(/backup limit/);
  });

  it('always allows removals, dequeues and reorders, even for a library already over budget', () => {
    let over = noted(fixture(), 'n'.repeat(500));
    over = { ...over, revision: 9 };
    const budget = libraryBackupBytes(over) - 100;
    // The reorder moves the revision from 9 to 10, one more digit, and must still pass.
    const moved = applyPersonalActionWithin(over, { type: 'move-item', list: 'queue', id: a.id, overId: b.id }, budget);
    expect(moved.revision).toBe(10);
    expect(moved.queueOrder).toEqual([b.id, a.id]);
    expect(
      applyPersonalActionWithin(over, { type: 'set-progress', records: [a], key: 'later', value: false }, budget)
        .queueOrder,
    ).toEqual([b.id]);
    expect(applyPersonalActionWithin(over, { type: 'remove-ranking', ids: [c.id] }, budget).ranking).toEqual([]);
    expect(
      applyPersonalActionWithin(over, { type: 'remove-records', ids: [a.id] }, budget).records[a.id],
    ).toBeUndefined();
    expect(
      applyPersonalActionWithin(over, { type: 'edit-ranking', id: c.id, note: 'shorter' }, budget).ranking[0]?.note,
    ).toBe('shorter');
    expect(() =>
      applyPersonalActionWithin(over, { type: 'set-progress', records: [c], key: 'later', value: true }, budget),
    ).toThrow(/backup limit/);
  });

  it('exports compact JSON, or refuses and says how much to remove', () => {
    const state = noted(fixture(), 'A note');
    const exported = exportLibraryBackup(state);
    if (!exported.ok) throw new Error('expected an export');
    expect(exported.text).not.toContain('\n');
    expect(exported.text).toBe(JSON.stringify(JSON.parse(exported.text)));
    expect(parseLibraryBackup(JSON.parse(exported.text))).toEqual(state);
    const refused = exportLibraryBackup(state, exported.bytes - 1);
    expect(refused).toEqual({
      ok: false,
      bytes: exported.bytes,
      message: `This library is 1 KB over its ${formatBackupLimit(exported.bytes - 1)} backup limit, so no file was made. Remove games or shorten notes by at least 1 KB, then export again. Nothing was changed.`,
    });
  });

  it('covers a maximal library: anything the write path allows exports and imports at the exact boundary', () => {
    const state = noted(fixture(), 'Ünïcödé 😀 note');
    const budget = libraryBackupBytes(state);
    // A library written up to the budget exports and re-imports unchanged at that same budget.
    const exported = exportLibraryBackup(state, budget);
    if (!exported.ok) throw new Error('boundary export refused');
    expect(exported.bytes).toBe(budget);
    expect(readLibraryBackup(exported.text, budget)).toEqual(state);
    expect(() =>
      applyPersonalActionWithin(state, { type: 'edit-ranking', id: c.id, note: 'Ünïcödé 😀 note!' }, budget),
    ).toThrow(/backup limit/);
    expect(exportLibraryBackup(state, budget - 1).ok).toBe(false);
    expect(() => readLibraryBackup(exported.text, budget - 1)).toThrow(/backup limit/);
  });

  it('imports pretty-printed v2 and v3 backups by their compact size, and rejects malformed or oversized ones', () => {
    const state = noted(fixture(), 'Pretty');
    const pretty = JSON.stringify(createLibraryBackup(state), null, 2);
    const compact = libraryBackupBytes(state);
    expect(encoded(pretty)).toBeGreaterThan(compact);
    expect(readLibraryBackup(pretty, compact)).toEqual(state);
    const v2 = JSON.stringify(
      {
        app: 'Play 100',
        formatVersion: 2,
        exportedAt: '2024-05-01T10:00:00.000Z',
        library: { ...state, version: 2, ranking: state.ranking.map(({ id, score, note }) => ({ id, score, note })) },
      },
      null,
      2,
    );
    expect(readLibraryBackup(v2).ranking.map((entry) => entry.id)).toEqual(state.ranking.map((entry) => entry.id));
    let failure: unknown;
    try {
      readLibraryBackup(pretty, compact - 1);
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toMatchObject({
      name: 'PersonalLibraryBudgetError',
      message: `This backup holds a library 1 KB over the ${formatBackupLimit(compact - 1)} backup limit. No data was changed.`,
    });
    expect(() => readLibraryBackup('{"formatVersion":2,"library":{"bad":true}}')).toThrow();
    expect(() => readLibraryBackup('{not json')).toThrow(SyntaxError);
  });
});
