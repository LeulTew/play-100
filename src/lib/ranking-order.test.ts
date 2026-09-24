import { describe, expect, it } from 'vitest';
import {
  applyPersonalAction,
  createLibraryBackup,
  emptyPersonalLibrary,
  parseLibraryBackup,
  parsePersonalLibrary,
} from './personal-library';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from './personal-types';

const records: LibraryRecord[] = ['a', 'b', 'c', 'd'].map((id, index) => ({
  id,
  title: `Game ${id}`,
  year: 2020,
  studio: null,
  genre: null,
  source: 'collection',
  sourceId: id,
  sourceUrl: null,
  collectionRank: index + 1,
}));
const ids = (state: PersonalLibraryState) => state.ranking.map((entry) => entry.id);
const apply = (state: PersonalLibraryState, ...actions: PersonalAction[]) => actions.reduce(applyPersonalAction, state);
const ranked = () => apply(emptyPersonalLibrary(), { type: 'add-ranking', records });
const scored = () =>
  apply(
    ranked(),
    ...records.map((record, index): PersonalAction => ({
      type: 'edit-ranking',
      id: record.id,
      score: 9 - index,
    })),
  );

describe('automatic score order with durable manual slots', () => {
  it('sorts new ratings highest first without marking a game played', () => {
    const state = apply(
      ranked(),
      { type: 'edit-ranking', id: 'c', score: 8 },
      { type: 'edit-ranking', id: 'b', score: 9 },
    );
    expect(ids(state)).toEqual(['b', 'c', 'a', 'd']);
    expect(state.progress).toEqual({});
    expect(state.records.a?.collectionRank).toBe(1);
  });
  it('keeps ties stable and puts unrated entries after a genuine zero rating', () => {
    const state = apply(
      ranked(),
      { type: 'edit-ranking', id: 'b', score: 8 },
      { type: 'edit-ranking', id: 'a', score: 8 },
      { type: 'edit-ranking', id: 'd', score: 0 },
    );
    expect(ids(state)).toEqual(['b', 'a', 'd', 'c']);
    expect(ids(parsePersonalLibrary(JSON.parse(JSON.stringify(state))))).toEqual(ids(state));
    expect(ids(apply(state, { type: 'edit-ranking', id: 'b', score: null }))).toEqual(['a', 'd', 'b', 'c']);
  });
  it('keeps a manually moved low-rated game at the exact selected position', () => {
    const state = apply(
      scored(),
      { type: 'move-item', list: 'ranking', id: 'd', overId: 'a' },
      { type: 'edit-ranking', id: 'd', score: 0 },
      { type: 'edit-ranking', id: 'b', score: 10 },
    );
    expect(ids(state)).toEqual(['d', 'b', 'a', 'c']);
    expect(state.ranking[0]?.manualPosition).toBe(1);
    expect(state.ranking[1]?.manualPosition).toBeNull();
  });
  it('holds multiple manual slots while sorting the remaining games', () => {
    const state = apply(
      scored(),
      { type: 'move-item', list: 'ranking', id: 'd', overId: 'a' },
      { type: 'move-item', list: 'ranking', id: 'c', overId: 'b' },
      { type: 'edit-ranking', id: 'a', score: 1 },
    );
    expect(ids(state)).toEqual(['d', 'b', 'c', 'a']);
    expect(
      state.ranking.filter((entry) => entry.manualPosition !== null).map((entry) => [entry.id, entry.manualPosition]),
    ).toEqual([
      ['d', 1],
      ['c', 3],
    ]);
  });
  it('updates displaced manual slots when the user deliberately drags another item', () => {
    const state = apply(
      scored(),
      { type: 'move-item', list: 'ranking', id: 'd', overId: 'a' },
      { type: 'move-item', list: 'ranking', id: 'c', overId: 'b' },
      { type: 'move-item', list: 'ranking', id: 'b', overId: 'd' },
    );
    expect(ids(state)).toEqual(['b', 'd', 'a', 'c']);
    expect(
      state.ranking.filter((entry) => entry.manualPosition !== null).map((entry) => [entry.id, entry.manualPosition]),
    ).toEqual([
      ['b', 1],
      ['d', 2],
      ['c', 4],
    ]);
  });
  it('releases one override without releasing other manually placed games', () => {
    const state = apply(
      scored(),
      { type: 'move-item', list: 'ranking', id: 'd', overId: 'a' },
      { type: 'move-item', list: 'ranking', id: 'c', overId: 'b' },
      { type: 'use-rating-order', id: 'd' },
    );
    expect(ids(state)).toEqual(['a', 'b', 'c', 'd']);
    expect(state.ranking[2]?.manualPosition).toBe(3);
    expect(state.ranking[3]?.manualPosition).toBeNull();
  });
  it('can explicitly clear every override and resume score ordering', () => {
    const state = apply(
      scored(),
      { type: 'move-item', list: 'ranking', id: 'd', overId: 'a' },
      { type: 'use-rating-order' },
    );
    expect(ids(state)).toEqual(['a', 'b', 'c', 'd']);
    expect(state.ranking.every((entry) => entry.manualPosition === null)).toBe(true);
  });
  it('compacts manual positions safely when a preceding entry is removed', () => {
    const state = apply(
      scored(),
      { type: 'move-item', list: 'ranking', id: 'd', overId: 'a' },
      { type: 'move-item', list: 'ranking', id: 'c', overId: 'b' },
      { type: 'remove-ranking', ids: ['a'] },
    );
    expect(ids(state)).toEqual(['d', 'c', 'b']);
    expect(state.ranking.map((entry) => entry.manualPosition)).toEqual([1, 2, null]);
  });
  it('does not pin a game when a move does not actually change position', () => {
    const state = apply(scored(), { type: 'move-item', list: 'ranking', id: 'a', overId: 'a' });
    expect(state.ranking[0]?.manualPosition).toBeNull();
  });
  it('preserves earlier version-two ordering instead of guessing which moves were manual', () => {
    const old = {
      ...scored(),
      version: 2,
      ranking: [
        { id: 'd', score: 1, note: 'Keep first' },
        { id: 'a', score: 10, note: '' },
      ],
    };
    const migrated = parsePersonalLibrary(old);
    expect(migrated.version).toBe(3);
    expect(ids(migrated)).toEqual(['d', 'a']);
    expect(migrated.ranking.map((entry) => entry.manualPosition)).toEqual([1, 2]);
    expect(ids(apply(migrated, { type: 'edit-ranking', id: 'a', score: 9 }))).toEqual(['d', 'a']);
    expect(ids(apply(migrated, { type: 'use-rating-order' }))).toEqual(['a', 'd']);
  });
  it('imports version-two backups and round-trips version-three overrides', () => {
    const old = {
      ...scored(),
      version: 2,
      ranking: [
        { id: 'b', score: 4, note: 'Old order' },
        { id: 'a', score: 9, note: '' },
      ],
    };
    const migrated = parseLibraryBackup({
      app: 'Play 100',
      formatVersion: 2,
      exportedAt: '2026-09-14T00:00:00.000Z',
      library: old,
    });
    expect(ids(migrated)).toEqual(['b', 'a']);
    const backup = createLibraryBackup(migrated);
    expect(backup.formatVersion).toBe(3);
    expect(parseLibraryBackup(JSON.parse(JSON.stringify(backup)))).toEqual(migrated);
  });
  it.each([0, 5, -1, 1.5, '1', NaN])(
    'rejects invalid manual position %s without repairing user data silently',
    (position) => {
      const state = scored();
      expect(() =>
        parsePersonalLibrary({
          ...state,
          ranking: state.ranking.map((entry, index) => (index ? entry : { ...entry, manualPosition: position })),
        }),
      ).toThrow();
    },
  );
  it('rejects duplicate manual positions and unsupported schema versions', () => {
    const state = scored();
    expect(() =>
      parsePersonalLibrary({ ...state, ranking: state.ranking.map((entry) => ({ ...entry, manualPosition: 1 })) }),
    ).toThrow();
    expect(() => parsePersonalLibrary({ ...state, version: 4 })).toThrow();
    expect(() => parseLibraryBackup({ ...createLibraryBackup(state), formatVersion: 2 })).toThrow();
  });
});
