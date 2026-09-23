import { expect, test } from '@playwright/test';
import { emptyPersonalLibrary } from '../src/lib/personal-library';
import { DB_NAME, DB_VERSION, STATE_KEY, STORE_NAME } from '../src/lib/personal-db';
import { emptyCatalogs } from './catalog-helpers';
import { readLibrary } from './library-helpers';

declare global {
  interface Window { guestStartupReads: number }
}

test('dense guest data loads independently of canonical metadata and is not reread when it arrives', async ({ page }) => {
  await emptyCatalogs(page);
  const state = emptyPersonalLibrary();
  state.revision = 19;
  state.motion = 'lite';
  for (let index = 0; index < 500; index += 1) {
    const id = `manual:startup-${index}`;
    state.records[id] = { id, title: `Startup ${String(index).padStart(3, '0')}`, year: null, studio: null, genre: null,
      source: 'manual', sourceId: `startup-${index}`, sourceUrl: null, collectionRank: null };
    if (index < 3) {
      state.progress[id] = { later: true, completed: false, played: false };
      state.queueOrder.unshift(id);
    }
  }
  await page.goto('/favicon.svg');
  await page.evaluate(({ name, version, store, key, state }) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(name, version);
    open.onupgradeneeded = () => open.result.createObjectStore(store);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(state, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), { name: DB_NAME, version: DB_VERSION, store: STORE_NAME, key: STATE_KEY, state });
  await page.addInitScript(({ db, store, key }) => {
    window.guestStartupReads = 0;
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (...args: Parameters<IDBObjectStore['get']>) {
      if (this.transaction.db.name === db && this.name === store && args[0] === key) window.guestStartupReads += 1;
      return get.apply(this, args);
    };
  }, { db: DB_NAME, store: STORE_NAME, key: STATE_KEY });
  let release!: () => void;
  const metadata = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/data/collection.json', async route => { await metadata; await route.continue(); });
  try {
    await page.goto('/my-games?tab=queue&catalogs=off');
    const rows = page.locator('.my-games-editor:visible [data-record-id]');
    await expect(rows).toHaveCount(3);
    expect(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-record-id')))).toEqual(state.queueOrder);
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
    // Read the persisted state before the baseline; this helper itself issues a get.
    expect(await readLibrary(page)).toEqual(state);
    const before = await page.evaluate(() => window.guestStartupReads);
    const response = page.waitForResponse(response => new URL(response.url()).pathname === '/data/collection.json');
    release();
    await (await response).finished();
    // Rendering the original cards proves that canonical metadata has committed.
    await page.locator('.wordmark').click();
    await expect(page.locator('.game-card')).toHaveCount(24);
    expect(await page.evaluate(() => window.guestStartupReads)).toBe(before);
    await page.locator('.saved-nav').click();
    await expect(rows).toHaveCount(3);
    expect(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-record-id')))).toEqual(state.queueOrder);
    await page.getByRole('button', { name: /^Library/ }).click();
    await expect(page.locator('.personal-row-static')).toHaveCount(25);
    expect(await readLibrary(page)).toEqual(state);
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  } finally {
    release();
  }
});
