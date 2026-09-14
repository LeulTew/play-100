import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCollection, filterGames } from './collection';
import { author, authorRatingText } from './author';
import { defaultFilters } from './url';
import { recordFromGame } from './personal-types';
import { applyPersonalAction, emptyPersonalLibrary } from './personal-library';

const raw = JSON.parse(readFileSync(new URL('../../data/collection.json', import.meta.url), 'utf8'));
const collection = parseCollection(raw);

describe('public creator ratings stay separate from visitor opinions', () => {
  it('preserves all100 source author values and exact cached text', () => {
    expect(collection.games.every((game) => game.authorRating !== null)).toBe(true);
    expect(collection.collection.authorRatingsAreOriginal).toBe(true);
    expect(collection.games[1]?.authorRating?.rawValue).toBe('9.9696969696969688');
    expect(collection.games[2]?.authorRating).toMatchObject({ value: 9.9, rawValue: '9.9 (AI – not played)', sourceCell: 'L7' });
    expect(collection.games[6]?.authorRating).toMatchObject({ value: 9.8, rawValue: '9.8', sourceCell: 'L11' });
    expect(collection.games[98]?.authorRating?.rawValue).toBe('7.0303030303030303');
    expect(collection.games[99]?.authorRating?.value).toBe(7);
    expect(collection.games[2]?.authorRating?.value).not.toBe(collection.games[2]?.rankIndex);
  });
  it('uses the original display precision without replacing source text ratings with a curve', () => {
    expect(authorRatingText(collection.games[0]?.authorRating ?? null)).toBe('10.0');
    expect(authorRatingText(collection.games[2]?.authorRating ?? null)).toBe('9.9');
    expect(authorRatingText(collection.games[6]?.authorRating ?? null)).toBe('9.8');
    expect(authorRatingText(null)).toBe('Unavailable');
  });
  it('sorts the public author column using source values while preserving ranks', () => {
    const games = filterGames(collection.games, { ...defaultFilters, sort: 'author-rating' }, {});
    expect(games.findIndex((game) => game.rank === 4)).toBeLessThan(games.findIndex((game) => game.rank === 3));
    expect(games[0]?.rank).toBe(1);
    expect(collection.games.map((game) => game.rank)).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
  });
  it('never seeds visitor ratings or played flags from public author metadata', () => {
    const game = collection.games[2];
    if (!game) throw new Error('Missing canonical fixture');
    const record = recordFromGame(game);
    expect(record).not.toHaveProperty('authorRating');
    const state = applyPersonalAction(emptyPersonalLibrary(), { type: 'add-ranking', records: [record] });
    expect(state.ranking[0]).toMatchObject({ score: null, manualPosition: null });
    expect(state.progress[game.slug]?.played ?? false).toBe(false);
  });
  it('supports an older cached collection explicitly without inventing missing creator values', () => {
    const old = structuredClone(raw);
    delete old.collection.authorRatingsAreOriginal;
    for (const game of old.games) delete game.authorRating;
    const parsed = parseCollection(old);
    expect(parsed.collection.authorRatingsAreOriginal).toBe(false);
    expect(parsed.games[0]?.authorRating).toBeNull();
  });
  it('rejects a new collection claiming original ratings when a value is missing or inconsistent', () => {
    const missing = structuredClone(raw);
    delete missing.games[0].authorRating;
    expect(() => parseCollection(missing)).toThrow(/author rating/);
    const wrong = structuredClone(raw);
    wrong.games[2].authorRating.value = wrong.games[2].rankIndex;
    expect(() => parseCollection(wrong)).toThrow(/author rating/);
  });
  it('uses only the verified public identity links', () => {
    expect(author.fullName).toBe('Leul Tewodros Agonafer');
    expect(author.githubUrl).toBe('https://github.com/LeulTew/play-100');
    expect(author.linkedinUrl).toBe('https://www.linkedin.com/in/leul-t-agonafer-861bb3336/');
    expect(author.telegramUrl).toBe('https://t.me/fabbin');
    expect(author).not.toHaveProperty('email');
    expect(author).not.toHaveProperty('phone');
  });
});
