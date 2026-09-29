import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { accountScope } from './cloud-types';
import type { ScopedLibrary } from './cloud-types';
import { accountStorageTransaction, closePersonalLibrary, publishLibraryChange } from './personal-db';
import { applyPersonalAction, emptyPersonalLibrary, parsePersonalLibrary } from './personal-library';
import type { PersonalAction } from './personal-types';
import { commitScopedAction, loadScopedLibrary, parseScopedLibrary } from './scoped-library';
import { recordFriendRemovals } from './friend-selection-cache';
import { recordFriendShelfRemovals } from './friend-shelf-selection-cache';
import { rememberMotionHint } from './motion-hint';

const scope = accountScope('dense-benchmark');
const action: PersonalAction = { type: 'edit-ranking', id: 'manual:dense-5000', note: 'Changed synthetic opinion' };

// The pre-optimization transaction, including both envelope/state parses and both journals.
async function beforeOptimization(): Promise<ScopedLibrary> {
  const saved = await accountStorageTransaction(scope, (value, store) => {
    const current = parseScopedLibrary(value, scope);
    const next = parseScopedLibrary({
      ...current,
      state: applyPersonalAction(current.state, action),
      sync: { ...current.sync, dirty: true, dataRevision: current.sync.dataRevision + 1 },
    }, scope);
    const ranked = new Set(next.state.ranking.map((entry) => entry.id));
    const removed = current.state.ranking.filter((entry) => !ranked.has(entry.id)).map((entry) => entry.id);
    recordFriendRemovals(store, scope, removed, current.state.revision, next.state.revision);
    const removedRecords = Object.keys(current.state.records).filter((id) => !Object.hasOwn(next.state.records, id));
    recordFriendShelfRemovals(store, scope, removedRecords, current.state.revision, next.state.revision);
    store.put(next, scope);
    return next;
  });
  rememberMotionHint(scope, saved.state.motion);
  publishLibraryChange(scope);
  return saved;
}

beforeEach(() => {
  closePersonalLibrary();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem: () => null, removeItem: () => undefined });
  vi.stubGlobal('window', undefined);
});
afterEach(() => {
  closePersonalLibrary();
  vi.unstubAllGlobals();
});

it('reports before/after dense account-edit timing without a timing threshold', async () => {
  const state = emptyPersonalLibrary();
  state.revision = 10;
  for (let index = 0; index < 10_000; index += 1) {
    const id = `manual:dense-${index}`;
    state.records[id] = {
      id, source: 'manual', sourceId: `dense-${index}`, title: `Synthetic game ${index}`,
      year: 2020, studio: null, genre: null, sourceUrl: null, collectionRank: null,
    };
    state.progress[id] = { played: true, completed: index % 2 === 0, later: true };
    state.queueOrder.push(id);
    state.ranking.push({
      id, score: index % 11, manualPosition: index === 0 ? 1 : null,
      note: `Synthetic private opinion ${index}. `.repeat(4),
    });
  }
  const seed: ScopedLibrary = {
    ...await loadScopedLibrary(scope),
    state: parsePersonalLibrary(state),
  };
  const reset = () => accountStorageTransaction(scope, (_value, store) => {
    store.put(seed, scope);
  });
  const operations = [beforeOptimization, () => commitScopedAction(scope, action)];
  const samples: [number[], number[]] = [[], []];
  const expected = parseScopedLibrary({
    ...seed,
    state: applyPersonalAction(seed.state, action),
    sync: { ...seed.sync, dirty: true, dataRevision: seed.sync.dataRevision + 1 },
  }, scope);
  // One untimed warmup per path, followed by three alternating before/after pairs.
  for (const operation of operations) {
    await reset();
    expect(await operation()).toEqual(expected);
  }
  for (let pair = 0; pair < 3; pair += 1) {
    const order: readonly (0 | 1)[] = pair % 2 === 0 ? [0, 1] : [1, 0];
    for (const index of order) {
      await reset();
      const start = performance.now();
      const result = await operations[index]!();
      samples[index].push(performance.now() - start);
      expect(result).toEqual(expected);
    }
  }
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[1]!;
  console.info(
    'Dense account edit (10,000 records, progress, queue and ranking entries; fake IndexedDB; 3 samples):',
    JSON.stringify({
      beforeMs: samples[0].map((value) => Number(value.toFixed(2))),
      afterMs: samples[1].map((value) => Number(value.toFixed(2))),
      beforeMedianMs: Number(median(samples[0]).toFixed(2)),
      afterMedianMs: Number(median(samples[1]).toFixed(2)),
    }),
  );
}, 30_000);
