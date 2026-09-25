import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPendingEdits, registerPendingEditor } from '../hooks/useExitSave';
import { accountScope } from './cloud-types';
import { applyPersonalAction, emptyPersonalLibrary } from './personal-library';
import { closePersonalLibrary, commitPersonalAction, loadPersonalLibrary } from './personal-db';
import { commitScopedAction, loadScopedLibrary } from './scoped-library';
import type { LibraryRecord, PersonalAction, PersonalLibraryState } from './personal-types';

const records: LibraryRecord[] = ['a', 'b', 'c'].map((id) => ({
  id: `manual:${id}`,
  source: 'manual',
  sourceId: id,
  title: `Synthetic ${id}`,
  year: null,
  studio: null,
  genre: null,
  sourceUrl: null,
  collectionRank: null,
}));
const ids = records.map((record) => record.id);
const initial = () => applyPersonalAction(emptyPersonalLibrary(), { type: 'add-ranking', records });

describe('absolute ranking positions', () => {
  it.each([0, -1, 4, 1.5, NaN, Infinity])(
    'rejects out-of-range or noninteger position %s without mutation',
    (position) => {
      const state = initial();
      const before = JSON.stringify(state);
      expect(() => applyPersonalAction(state, { type: 'move-item', list: 'ranking', id: ids[1]!, position })).toThrow(
        /inside the current ranking/,
      );
      expect(JSON.stringify(state)).toBe(before);
    },
  );

  it('sets the first and last global slots, preserving opinions, progress and metadata', () => {
    const before = initial();
    before.ranking = before.ranking.map((entry, index) => ({
      ...entry,
      score: index + 1,
      note: `Private opinion for ${entry.id}`,
      manualPosition: index + 1,
    }));
    const first = applyPersonalAction(before, { type: 'move-item', list: 'ranking', id: ids[2]!, position: 1 });
    expect(first.ranking.map((entry) => entry.id)).toEqual([ids[2], ids[0], ids[1]]);
    expect(first.ranking[0]?.manualPosition).toBe(1);
    const last = applyPersonalAction(first, { type: 'move-item', list: 'ranking', id: ids[2]!, position: 3 });
    expect(last.ranking.map((entry) => entry.id)).toEqual(ids);
    expect(last.ranking[2]?.manualPosition).toBe(3);
    expect(last.records).toEqual(before.records);
    expect(last.progress).toEqual(before.progress);
    expect(last.ranking.map(({ score, note }) => ({ score, note }))).toEqual(
      before.ranking.map(({ score, note }) => ({ score, note })),
    );
  });

  it('fixes the current slot without reordering when an explicit position is submitted', () => {
    const state = applyPersonalAction(initial(), { type: 'move-item', list: 'ranking', id: ids[1]!, position: 2 });
    expect(state.ranking.map((entry) => entry.id)).toEqual(ids);
    expect(state.ranking[1]?.manualPosition).toBe(2);
    const automatic = applyPersonalAction(state, { type: 'use-rating-order', id: ids[1]! });
    expect(automatic.ranking[1]?.manualPosition).toBeNull();
  });

  it('does not change relative overId move semantics', () => {
    const state = applyPersonalAction(initial(), { type: 'move-item', list: 'ranking', id: ids[0]!, overId: ids[2]! });
    expect(state.ranking.map((entry) => entry.id)).toEqual([ids[1], ids[2], ids[0]]);
    expect(state.ranking[2]?.manualPosition).toBe(3);
  });

  it('rejects mixed destinations and a missing game without mutating the ranking', () => {
    const state = initial();
    const before = JSON.stringify(state);
    const mixed = {
      type: 'move-item' as const,
      list: 'ranking' as const,
      id: ids[0]!,
      position: 2,
      overId: ids[2]!,
    };
    expect(() => applyPersonalAction(state, mixed)).toThrow(/unsupported fields/);
    expect(() =>
      applyPersonalAction(state, { type: 'move-item', list: 'ranking', id: 'manual:missing', position: 1 }),
    ).toThrow(/no longer/);
    expect(JSON.stringify(state)).toBe(before);
  });
});

beforeEach(() => {
  closePersonalLibrary();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
});
afterEach(() => {
  closePersonalLibrary();
  vi.unstubAllGlobals();
});

it.each(['guest', 'account'] as const)(
  '%s resolves the absolute slot inside its transaction after a pending score flush changes the order',
  async (kind) => {
    const scope = accountScope('ranking-position-fixture', 'demo-play100');
    const commit = (action: PersonalAction): Promise<PersonalLibraryState> =>
      kind === 'guest'
        ? commitPersonalAction(action)
        : commitScopedAction(scope, action).then((result) => result.state);
    if (kind === 'guest') await loadPersonalLibrary([]);
    else await loadScopedLibrary(scope);
    await commit({ type: 'add-ranking', records });
    let dirty = true;
    const release = registerPendingEditor({
      pending: () => dirty,
      flush: async () => {
        await commit({ type: 'edit-ranking', id: ids[2]!, score: 10 });
        dirty = false;
        return true;
      },
    });
    try {
      const intent: PersonalAction = { type: 'move-item', list: 'ranking', id: ids[0]!, position: 3 };
      expect(await flushPendingEdits()).toBe(true);
      const state = await commit(intent);
      expect(state.ranking.map((entry) => entry.id)).toEqual([ids[2], ids[1], ids[0]]);
      expect(state.ranking[2]?.manualPosition).toBe(3);
      expect(state.ranking[0]?.score).toBe(10);
      expect(state.progress).toEqual({});
    } finally {
      dirty = false;
      await release();
    }
  },
);
