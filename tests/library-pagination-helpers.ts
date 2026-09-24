import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { parseCollection } from '../src/lib/collection';
import { parseDiscoveryCatalog } from '../src/lib/discovery-catalog';
import { emptyPersonalLibrary, parsePersonalLibrary } from '../src/lib/personal-library';
import { DB_NAME, DB_VERSION, STATE_KEY, STORE_NAME } from '../src/lib/personal-db';
import { recordFromGame } from '../src/lib/personal-types';
import type { PersonalLibraryState } from '../src/lib/personal-types';

const collection = parseCollection(
  JSON.parse(readFileSync(new URL('../public/data/collection.json', import.meta.url), 'utf8')),
);
const catalog = parseDiscoveryCatalog(
  JSON.parse(readFileSync(new URL('../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8')),
);
export const libraryRecords = [
  ...collection.games.map(recordFromGame),
  ...catalog.items.map((item) => item.record),
].slice(0, 500);
export const rankedRecords = libraryRecords.slice(0, 3);

export function libraryFixture(total = 500): PersonalLibraryState {
  const records = libraryRecords.slice(0, total);
  const ranked = rankedRecords.filter((record) => records.some((candidate) => candidate.id === record.id));
  const state = {
    ...emptyPersonalLibrary(),
    revision: 1,
    motion: 'lite' as const,
    records: Object.fromEntries(records.map((record) => [record.id, record])),
    progress: Object.fromEntries(
      ranked.map((record, index) => [
        record.id,
        {
          later: true,
          played: index !== 2,
          completed: index === 1,
        },
      ]),
    ),
    queueOrder: ranked.map((record) => record.id),
    ranking: ranked.map((record, index) => ({
      id: record.id,
      score: index === 0 ? 8.5 : index === 1 ? 7 : null,
      note: `Synthetic Library paging opinion ${index + 1}.`,
      manualPosition: index + 1,
    })),
  };
  return parsePersonalLibrary(state);
}

export async function installGuestLibrary(page: Page, state = libraryFixture(), url = '/my-games?catalogs=off') {
  await page.goto('/favicon.svg');
  await page.evaluate(
    ({ name, version, store, key, state }) =>
      new Promise<void>((resolve, reject) => {
        if (!['127.0.0.1', 'localhost'].includes(location.hostname))
          throw new Error('Synthetic Library fixtures require a loopback origin.');
        const open = indexedDB.open(name, version);
        open.onupgradeneeded = () => open.result.createObjectStore(store);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(store, 'readwrite');
          tx.objectStore(store).put(state, key);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    { name: DB_NAME, version: DB_VERSION, store: STORE_NAME, key: STATE_KEY, state },
  );
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  if (Object.keys(state.records).length) await expect(page.locator('#library-search')).toBeVisible();
  else await expect(page.getByRole('heading', { name: 'No games yet', exact: true })).toBeVisible();
}

export async function libraryGeometry(page: Page) {
  return page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    touchPoints: navigator.maxTouchPoints,
    documentHeight: document.documentElement.scrollHeight,
    documentWidth: document.documentElement.scrollWidth,
    domNodes: document.querySelectorAll('*').length,
    libraryRows: document.querySelectorAll('ul.personal-records > .personal-row-static').length,
    rankingRows: document.querySelectorAll('.ranking-row-content').length,
    hiddenLibraryRows: document.querySelectorAll('[hidden] ul.personal-records > .personal-row-static').length,
  }));
}

export async function loadedExitSaveModule(page: Page): Promise<string> {
  return page.evaluate(() => {
    const module = performance
      .getEntriesByType('resource')
      .findLast((entry) => new URL(entry.name).pathname === '/src/hooks/useExitSave.ts');
    if (!module)
      throw new Error(
        'The running app has not loaded the exit-save registry module. Use the Vite development server for this fixture.',
      );
    return module.name;
  });
}
