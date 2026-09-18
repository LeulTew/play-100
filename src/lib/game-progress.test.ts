import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCollection, filterGames } from './collection';
import { filterUnranked } from './extended-search';
import { applyPersonalAction, emptyPersonalLibrary, parsePersonalLibrary } from './personal-library';
import { recordFromGame } from './personal-types';
import type { PersonalProgress } from './personal-types';
import { defaultFilters, parseUrl, createSearch, createShareUrl } from './url';
import { createDiscoverySearch, defaultDiscoveryFilters, parseDiscoverySearch } from './discovery-search';
import { effectiveProgressFilter, matchesProgress, selectionOperation } from './game-progress';

const games = parseCollection(JSON.parse(readFileSync(join('public', 'data', 'collection.json'), 'utf8'))).games.slice(0, 4);
const records = games.map(recordFromGame);
const values: Array<PersonalProgress | undefined> = [
  undefined,
  { played: true, completed: false, later: false },
  { played: true, completed: true, later: false },
  { played: true, completed: true, later: true },
];
describe('distinct played/completed progress', () => {
  it.each([
    ['all', [0, 1, 2, 3]], ['not-played', [0]], ['unfinished', [1]], ['completed', [2, 3]],
    ['any-played', [1, 2, 3]], ['not-completed', [0, 1]],
  ] as const)('%s has the same truth table for canonical and external games', (view, indices) => {
    const progress = Object.fromEntries(records.flatMap((record, index) => values[index] ? [[record.id, values[index]!]] : []));
    const filters = { ...defaultFilters, progress: view };
    expect(filterGames(games, filters, progress).map(game => game.slug)).toEqual(indices.map(index => records[index]!.id));
    const external = records.map((record, index) => ({ ...record, id: `manual:${index}`, source: 'manual' as const, sourceId: String(index), sourceUrl: null, collectionRank: null }));
    const extras = Object.fromEntries(external.flatMap((record, index) => values[index] ? [[record.id, values[index]!]] : []));
    expect(filterUnranked(external, filters, extras).map(record => record.id)).toEqual(indices.map(index => external[index]!.id));
    expect(values.map((value, index) => matchesProgress(value, view) ? index : -1).filter(index => index >= 0)).toEqual([...indices]);
  });
  it('keeps played, completion, queue, scores, notes and manual positions distinct', () => {
    const record = records[0]!;
    let state = applyPersonalAction(emptyPersonalLibrary(), { type: 'add-ranking', records });
    state = applyPersonalAction(state, { type: 'edit-ranking', id: record.id, score: 8.5, note: 'Keep this private note' });
    state = applyPersonalAction(state, { type: 'move-item', list: 'ranking', id: record.id, overId: records[3]!.id });
    state = applyPersonalAction(state, selectionOperation('later', [record]));
    const ranking = state.ranking; const queue = state.queueOrder;
    state = applyPersonalAction(state, selectionOperation('played', [record]));
    expect(state.progress[record.id]).toEqual({ played: true, completed: false, later: true });
    state = applyPersonalAction(state, selectionOperation('completed', [record]));
    expect(state.progress[record.id]).toEqual({ played: true, completed: true, later: true });
    state = applyPersonalAction(state, selectionOperation('uncomplete', [record]));
    expect(state.progress[record.id]).toEqual({ played: true, completed: false, later: true });
    state = applyPersonalAction(state, selectionOperation('completed', [record]));
    state = applyPersonalAction(state, { type: 'set-progress', records: [record], key: 'played', value: false });
    expect(state.progress[record.id]).toEqual({ played: false, completed: false, later: true });
    expect(state.ranking).toEqual(ranking); expect(state.queueOrder).toEqual(queue);
  });
  it('maps every bulk action explicitly; Mark played never falls through to queue or completion', () => {
    expect(selectionOperation('played', records)).toEqual({ type: 'set-progress', records, key: 'played', value: true });
    expect(selectionOperation('completed', records)).toEqual({ type: 'set-progress', records, key: 'completed', value: true });
    expect(selectionOperation('uncomplete', records)).toEqual({ type: 'set-progress', records, key: 'completed', value: false });
    expect(selectionOperation('later', records)).toEqual({ type: 'set-progress', records, key: 'later', value: true });
    expect(selectionOperation('remove-later', records)).toEqual({ type: 'set-progress', records, key: 'later', value: false });
    expect(selectionOperation('ranking', records)).toEqual({ type: 'add-ranking', records });
  });
  it('preserves old list=unplayed as Not completed and roundtrips clear new filters', () => {
    const old = parseUrl('?list=unplayed').filters;
    expect(effectiveProgressFilter(old)).toBe('not-completed');
    expect(createSearch(old)).toBe('?list=unplayed');
    expect(matchesProgress(values[1], effectiveProgressFilter(old))).toBe(true);
    expect(matchesProgress(values[2], effectiveProgressFilter(old))).toBe(false);
    const next = { ...defaultFilters, list: 'later' as const, progress: 'unfinished' as const };
    expect(parseUrl(createSearch(next)).filters).toEqual(next);
    expect(parseDiscoverySearch(createDiscoverySearch({ ...defaultDiscoveryFilters, progress: 'not-played' })).progress).toBe('not-played');
    const shared = new URL(createShareUrl('https://example.test', next, games[0]!.slug));
    expect(shared.searchParams.get('progress')).toBeNull(); expect(shared.searchParams.get('list')).toBeNull();
    expect(shared.searchParams.get('game')).toBe(games[0]!.slug);
  });
  it('keeps the existing backup migration and never infers progress from ranking or source notes', () => {
    let state = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: records[0]!, score: 9 });
    expect(state.progress[records[0]!.id]?.played ?? false).toBe(false);
    expect(state.progress[records[0]!.id]?.completed ?? false).toBe(false);
    state = applyPersonalAction(state, selectionOperation('completed', [records[0]!]));
    const old = { ...state, version: 2, ranking: state.ranking.map(entry => ({ id: entry.id, score: entry.score, note: entry.note })) };
    expect(parsePersonalLibrary(old).progress[records[0]!.id]).toEqual({ played: true, completed: true, later: false });
    expect(parsePersonalLibrary(state).version).toBe(3);
  });
});
