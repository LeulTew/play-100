import { readFileSync } from 'node:fs';
import { sourceTokenBytes } from '../../scripts/source-contract';
import { describe, expect, it } from 'vitest';
import { DISCOVERY_GENRE_FAMILIES, discoveryGenreFamilies, matchesDiscoveryGenre, parseDiscoveryGenreFamily } from './discovery-genres';
import { parseDiscoveryCatalogJson } from './discovery-catalog';
import { parseCollection } from './collection';
import { catalogSearchItems } from './catalog-identity';
import { defaultDiscoveryFilters, DISCOVERY_PAGE_SIZE, searchDiscoveryItems } from './discovery-search';
import { getLocalPage } from './local-pagination';

describe('explicit browsing families without rewriting source genres', () => {
  it.each([
    ['action role-playing game / first-person shooter / cyberpunk video game / role-playing video game / stealth game / immersive sim', ['action-adventure', 'role-playing', 'shooter']],
    ['Action RPG / Sci-Fi', ['action-adventure', 'role-playing']],
    ['turn-based strategy video game / 4X', ['strategy']],
    ['city-building game / construction and management simulation / simulation video game / strategic game', ['simulation', 'strategy']],
    ['puzzle-platformer', ['platform', 'puzzle']],
    ['Metroidvania / video game with LGBT character / 2D platform game / soulsvania', ['platform']],
    ['2D fighting game / airdasher', ['fighting']],
    ['survival horror / first-person shooter', ['horror-survival', 'shooter']],
    ['kart racing game / vehicular combat game / mascot racer', ['racing-sports']],
    ['card battle video game / fantasy video game', ['cards']],
    ['party video game / social deduction video game / science fiction video game / casual game', ['casual-social']],
    ['rhythm game / gacha game / visual novel', ['rhythm', 'action-adventure']],
    ['MMORPG', ['role-playing']],
    ['Third-person Roguelike Shooter', ['shooter']],
  ] as const)('maps only explicit gameplay terms in %s', (genre, expected) => {
    expect([...discoveryGenreFamilies(genre)].sort()).toEqual([...expected].sort());
    expect(discoveryGenreFamilies(` ${genre.toUpperCase()} `)).toEqual(discoveryGenreFamilies(genre));
  });
  it.each([null, '', 'Fantasy', 'MMO', 'massively multiplayer online game', 'roguelike', 'Battle Royale', 'augmented reality / location-based game', 'unknown shooterish theme'])('keeps ambiguous or unrecognized %s in Other and All', genre => {
    expect(discoveryGenreFamilies(genre)).toEqual(['other']);
    expect(matchesDiscoveryGenre(genre, '', 'other')).toBe(true);
    expect(matchesDiscoveryGenre(genre, '')).toBe(true);
    if (genre) expect(matchesDiscoveryGenre(genre, genre)).toBe(true);
  });
  it('does not infer a genre from themes, conflate identities or reinterpret exact source strings', () => {
    expect(discoveryGenreFamilies('science fiction video game / fantasy video game')).toEqual(['other']);
    expect(matchesDiscoveryGenre('Action RPG', 'RPG', 'role-playing')).toBe(false);
    expect(matchesDiscoveryGenre('RPG', 'rpg', 'role-playing')).toBe(false);
    expect(matchesDiscoveryGenre('RPG', 'RPG', 'shooter')).toBe(false);
    expect(matchesDiscoveryGenre('RPG', 'RPG', 'role-playing')).toBe(true);
    expect(parseDiscoveryGenreFamily('Action RPG')).toBe('');
    expect(parseDiscoveryGenreFamily('unknown')).toBe('');
    expect(DISCOVERY_GENRE_FAMILIES.length + 1).toBeLessThanOrEqual(15);
    // Bound the taxonomy/code payload, not its indentation or explanatory comments.
    expect(sourceTokenBytes(readFileSync(new URL('./discovery-genres.ts', import.meta.url), 'utf8'))).toBeLessThanOrEqual(8192);
  });
});

describe('complete shipped catalog coverage', () => {
  const seed = parseDiscoveryCatalogJson(readFileSync(new URL('../../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8'));
  const collection = parseCollection(JSON.parse(readFileSync(new URL('../../public/data/collection.json', import.meta.url), 'utf8')));
  const items = catalogSearchItems(collection.games, seed.items);
  it('keeps every raw and canonical record reachable through All, a family and its original exact genre', () => {
    const before = JSON.stringify({ seed, collection, items });
    for (const item of [...seed.items, ...items]) {
      const families = discoveryGenreFamilies(item.record.genre);
      expect(families.length).toBeGreaterThan(0);
      expect(families.every(family => DISCOVERY_GENRE_FAMILIES.some(option => option.id === family))).toBe(true);
      if (families.includes('other')) expect(families).toEqual(['other']);
      expect(matchesDiscoveryGenre(item.record.genre, '')).toBe(true);
      if (item.record.genre) expect(matchesDiscoveryGenre(item.record.genre, item.record.genre)).toBe(true);
    }
    const all = searchDiscoveryItems(items, defaultDiscoveryFilters);
    const union = new Set(DISCOVERY_GENRE_FAMILIES.flatMap(({ id }) => searchDiscoveryItems(items, { ...defaultDiscoveryFilters, genreFamily: id }).map(item => item.record.id)));
    expect([...union].sort()).toEqual(all.map(item => item.record.id).sort());
    expect(all).toHaveLength(items.length);
    for (const genre of new Set(items.map(item => item.record.genre).filter((value): value is string => value !== null))) {
      expect(searchDiscoveryItems(items, { ...defaultDiscoveryFilters, genre }).map(item => item.record.id).sort())
        .toEqual(items.filter(item => item.record.genre === genre).map(item => item.record.id).sort());
    }
    expect(JSON.stringify({ seed, collection, items })).toBe(before);
  });
  it('retains 24-record local pages and exact filtered totals without affecting the library pager', () => {
    const rolePlaying = searchDiscoveryItems(items, { ...defaultDiscoveryFilters, genreFamily: 'role-playing' });
    expect(rolePlaying.length).toBeGreaterThan(DISCOVERY_PAGE_SIZE);
    expect(DISCOVERY_PAGE_SIZE).toBe(24);
    const reached = [];
    for (let offset = 0; offset < rolePlaying.length; offset += DISCOVERY_PAGE_SIZE) {
      const page = getLocalPage(rolePlaying.length, DISCOVERY_PAGE_SIZE, offset);
      reached.push(...rolePlaying.slice(page.offset, page.offset + DISCOVERY_PAGE_SIZE).map(item => item.record.id));
    }
    expect(reached).toEqual(rolePlaying.map(item => item.record.id));
    expect(new Set(reached).size).toBe(rolePlaying.length);
  });
});
