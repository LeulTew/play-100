import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filterGames, formatAverage, normalizedAverage, parseCollection, searchText } from './collection';
import { createSearch, createShareUrl, defaultFilters, parseUrl } from './url';
import { emptyLibrary, parseLibrary } from './storage';
import type { CollectionData, Critics } from './types';

const raw: unknown = JSON.parse(readFileSync(new URL('../../data/collection.json', import.meta.url), 'utf8'));
const data = parseCollection(raw);
const emptyScores: Critics = { metacritic: null, metacriticPc: null, ign: null, gamespot: null, pcGamer: null };
const clone = (): CollectionData => structuredClone(data);

describe('canonical data and critic semantics', () => {
  it('retains exactly 100 authoritative ranks, distinct slugs, two tiers and source markers', () => {
    expect(data.games).toHaveLength(100);
    expect(data.games.map((game) => game.rank)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(new Set(data.games.map((game) => game.slug)).size).toBe(100);
    expect(data.games.filter((game) => game.tier === 'core')).toHaveLength(50);
    expect(data.games.filter((game) => game.tier === 'essential')).toHaveLength(50);
    expect(data.games.filter((game) => game.sourceNote)).toHaveLength(12);
    expect(data.games.filter((game) => game.artwork)).toHaveLength(100);
    expect(data.games[0]?.title).toBe('Red Dead Redemption 2');
    expect(data.games[2]?.sourceNote).toBe('(AI – not played)');
  });
  it('normalizes ten-point columns and counts both Metacritic entries', () => {
    expect(normalizedAverage({ metacritic: 97, metacriticPc: 93, ign: 10, gamespot: 9, pcGamer: null })).toBe(95);
    expect(normalizedAverage({ metacritic: 96, metacriticPc: 94, ign: 9.6, gamespot: 9, pcGamer: 90 })).toBe(93.2);
    expect(normalizedAverage({ metacritic: 95, metacriticPc: null, ign: 10, gamespot: 8, pcGamer: null })).toBeCloseTo(91.6666667);
  });
  it('never turns missing scores into zeros', () => {
    expect(normalizedAverage(emptyScores)).toBeNull();
    expect(normalizedAverage({ ...emptyScores, ign: 8 })).toBe(80);
    expect(formatAverage(null)).toBe('Unavailable');
    expect(formatAverage(91.6666667)).toBe('91.7');
  });
  it('uses a numeric derived rank index, never an independent review', () => {
    expect(data.games[0]?.rankIndex).toBe(10);
    expect(data.games[6]?.rankIndex).toBeCloseTo(10 - 6 * 3 / 99);
    expect(data.games[99]?.rankIndex).toBe(7);
  });
  it.each(['rank', 'tier', 'average', 'slug', 'scale', 'index', 'artwork'] as const)('rejects inconsistent %s rather than substituting data', (field) => {
    const bad = clone();
    const game = bad.games[0];
    if (!game) throw new Error('Missing fixture entry');
    if (field === 'rank') game.rank = 99;
    if (field === 'tier') game.tier = 'essential';
    if (field === 'average') game.criticAverage = 0;
    if (field === 'slug') game.slug = bad.games[1]?.slug ?? '';
    if (field === 'scale') game.critics.ign = 98;
    if (field === 'index') game.rankIndex = 8.7;
    if (field === 'artwork' && game.artwork) game.artwork.file = 'https://untrusted.invalid/image.jpg';
    expect(() => parseCollection(bad)).toThrow();
  });
  it('rejects incomplete collections and unknown schema versions', () => {
    expect(() => parseCollection({ ...data, games: data.games.slice(0, 50) })).toThrow(/100/);
    expect(() => parseCollection({ ...data, schemaVersion: 2 })).toThrow(/format/);
  });
});

describe('browsing without rewriting rank', () => {
  it('normalizes punctuation, accents and case for search', () => {
    expect(searchText('  Baldur’s Gate: Édition! ')).toBe('baldur s gate edition');
    const results = filterGames(data.games, { ...defaultFilters, q: 'mass EFFECT 2' }, {});
    expect(results.map((game) => game.slug)).toEqual(['mass-effect-2']);
  });
  it('matches every query term across real title, studio, genre and year', () => {
    const results = filterGames(data.games, { ...defaultFilters, q: 'rockstar 2018' }, {});
    expect(results.map((game) => game.rank)).toEqual([1]);
  });
  it('combines exact original genre, year and tier filters', () => {
    const results = filterGames(data.games, { ...defaultFilters, genre: 'Open-world / Action-Adventure', year: '2018', tier: 'core' }, {});
    expect(results.map((game) => game.rank)).toEqual([1]);
    expect(filterGames(data.games, { ...defaultFilters, genre: 'not a real genre' }, {})).toEqual([]);
  });
  it('never assumes completion and keeps saved and completed independent', () => {
    expect(filterGames(data.games, { ...defaultFilters, list: 'completed' }, {})).toHaveLength(0);
    expect(filterGames(data.games, { ...defaultFilters, list: 'unplayed' }, {})).toHaveLength(100);
    const progress = { 'mass-effect-2': { later: true, completed: true } };
    expect(filterGames(data.games, { ...defaultFilters, list: 'later' }, progress).map((game) => game.rank)).toEqual([2]);
    expect(filterGames(data.games, { ...defaultFilters, list: 'completed' }, progress).map((game) => game.rank)).toEqual([2]);
    expect(filterGames(data.games, { ...defaultFilters, list: 'unplayed' }, progress)).toHaveLength(99);
  });
  it('sorts meaningfully without mutating source order and puts unavailable averages last', () => {
    const input = clone().games;
    const first = input[0];
    if (!first) throw new Error('Missing fixture');
    first.criticAverage = null;
    const sorted = filterGames(input, { ...defaultFilters, sort: 'score' }, {});
    expect(sorted.at(-1)?.rank).toBe(1);
    expect(input.map((game) => game.rank)).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
    const newest = filterGames(input, { ...defaultFilters, sort: 'newest' }, {});
    expect(newest[0]?.year).toBe(2026);
    expect(filterGames(input, { ...defaultFilters, sort: 'oldest' }, {})[0]?.year).toBe(2000);
    const titles = filterGames(input, { ...defaultFilters, sort: 'title' }, {}).map((game) => game.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, 'en')));
  });
});

describe('shareable and reversible URL state', () => {
  it('roundtrips every filter, original genre punctuation and selected game', () => {
    const filters = { ...defaultFilters, q: 'sci-fi & RPG', genre: 'Action RPG / Sci-Fi', year: '2010', tier: 'core' as const, sort: 'oldest' as const, view: 'list' as const, list: 'later' as const };
    expect(parseUrl(createSearch(filters, 'mass-effect-2'))).toEqual({ filters, game: 'mass-effect-2' });
  });
  it('keeps default URLs clean and recovers safely from invalid enum values', () => {
    expect(createSearch(defaultFilters)).toBe('');
    expect(parseUrl('?tier=fake&sort=bad&list=everyone&year=no&view=poster').filters).toEqual(defaultFilters);
  });
  it('omits device-list filters from shared links but preserves public filters', () => {
    const url = new URL(createShareUrl('https://play100.example', { ...defaultFilters, list: 'completed', year: '2018' }, 'red-dead-redemption-2'));
    expect(url.searchParams.get('list')).toBeNull();
    expect(url.searchParams.get('year')).toBe('2018');
    expect(url.searchParams.get('game')).toBe('red-dead-redemption-2');
  });
});

describe('private device data format', () => {
  it('starts with no saved or completed games and an Auto preference', () => {
    expect(parseLibrary(null)).toEqual(emptyLibrary());
  });
  it('roundtrips independent states without treating source notes as progress', () => {
    const state = { version: 1 as const, motion: 'lite' as const, progress: { 'mass-effect-2': { later: true, completed: true } } };
    expect(parseLibrary(JSON.stringify(state))).toEqual(state);
  });
  it.each(['{bad', 'null', '{"version":2,"motion":"auto","progress":{}}', '{"version":1,"motion":"fast","progress":{}}', '{"version":1,"motion":"auto","progress":{"game":{"later":"true","completed":false}}}'])('rejects unreadable data without silently accepting it', (raw) => {
    expect(() => parseLibrary(raw)).toThrow();
  });
});
