import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDiscoverySearch, defaultDiscoveryFilters, patchDiscoverySearch } from './discovery-search';
import { friendsViewUrl } from './friend-manager';
import { googleReturnPath } from './google-intent';
import { gameDetailSearch, libraryPageSearch, myGamesSearch } from './my-games-navigation';
import { querySuffix } from './query-suffix';
import { parseUrl } from './url';

const src = fileURLToPath(new URL('../', import.meta.url));
const sources = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [file] : [];
  });

describe('queries in browsers older than URLSearchParams.size', () => {
  // As in Chrome before 113, Firefox before 112 and Safari before 17, all within Play 100's floor.
  const size = Object.getOwnPropertyDescriptor(URLSearchParams.prototype, 'size');
  beforeEach(() => {
    Reflect.deleteProperty(URLSearchParams.prototype, 'size');
  });
  afterEach(() => {
    if (size) Object.defineProperty(URLSearchParams.prototype, 'size', size);
  });

  it('keeps every query a game card, a filter, a tab or a sign-in builds', () => {
    expect('size' in new URLSearchParams('a=1')).toBe(false);
    // The Test Lab phone's game card: the detail it opens.
    expect(gameDetailSearch('', 'red-dead-redemption-2')).toBe('?game=red-dead-redemption-2');
    expect(gameDetailSearch('?game=red-dead-redemption-2', null)).toBe('');
    expect(libraryPageSearch('', 2)).toBe('?page=2');
    expect(myGamesSearch(parseUrl('').filters, 'queue')).toBe('?tab=queue');
    expect(createDiscoverySearch({ ...defaultDiscoveryFilters, view: 'list' })).toBe('?view=list');
    expect(patchDiscoverySearch('?game=a', { view: 'list' })).toBe('?game=a&view=list');
    expect(friendsViewUrl({ view: 'sent', name: '', order: 'recent' })).toBe('/friends?view=sent');
    expect(googleReturnPath('/my-games?tab=queue')).toBe('/my-games?tab=queue');
    expect(querySuffix(new URLSearchParams())).toBe('');
    expect(querySuffix(new URLSearchParams('='))).toBe('?=');
  });
});

describe('query building', () => {
  it('never tests URLSearchParams.size, which browsers within the floor lack', () => {
    const uses = sources(src).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          /\.size\s*\?\s*`\?\$\{/.test(line) ? [`${path.relative(src, file)}:${index + 1}`] : [],
        ),
    );
    expect(uses).toEqual([]);
  });
});
