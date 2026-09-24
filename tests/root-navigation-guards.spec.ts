import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readLibrary } from './library-helpers';

const first = { id: 'red-dead-redemption-2', title: 'Red Dead Redemption 2' };
const provider = { id: 'wikidata:Q15408545', title: 'Kingdom Come: Deliverance' };
const rankingUrl = '/my-games?tab=ranking&catalogs=off';
const rankedList = (page: Page) => page.getByRole('list', { name: 'Your ranked games', exact: true, includeHidden: true });
const rating = (page: Page) => rankedList(page).getByRole('spinbutton', { name: `Your rating / 10 for ${first.title}`, exact: true });
const primary = (page: Page, mobile: boolean) => page.getByRole('navigation', { name: mobile ? 'Mobile navigation' : 'Main navigation', exact: true });

async function prepareRanking(page: Page) {
  await page.goto(rankingUrl);
  await page.getByRole('button', { name: 'Add games', exact: true }).click();
  await page.getByRole('button', { name: `Add ${first.title} to ranking`, exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).ranking.some(entry => entry.id === first.id)).toBe(true);
  await page.getByRole('button', { name: 'Close game picker', exact: true }).click();
  await rating(page).fill('5');
  await rating(page).press('Tab');
  await expect.poll(async () => (await readLibrary(page)).ranking.find(entry => entry.id === first.id)?.score).toBe(5);
  await expect(rating(page)).toBeEnabled();
  await expect(page.getByRole('link', { name: /^Account/ })).toHaveCount(0);
}

async function openNote(page: Page) {
  const row = rankedList(page).locator(`[data-record-id="${first.id}"]`);
  await row.locator('.ranking-note summary').click();
  return row.getByRole('textbox', { name: `Your note for ${first.title}`, exact: true });
}

// Replace the already-registered completion receiver, not a later target listener:
// IndexedDB target dispatch can call oncomplete before a capturing listener.
// The native write still commits; only the app's completion promise is held.
async function holdNextSave(page: Page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    const root = document.documentElement;
    root.dataset.rootSavePhase = 'armed';
    root.dataset.rootSaveWrites = '0';
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.transaction.db.name === 'play100-personal' && this.name === 'library' && args[1] === 'state') {
        root.dataset.rootSaveWrites = String(Number(root.dataset.rootSaveWrites) + 1);
        if (root.dataset.rootSavePhase === 'armed') {
          root.dataset.rootSavePhase = 'waiting';
          const transaction = this.transaction;
          const complete = transaction.oncomplete;
          if (!complete) throw new Error('The held write has no completion receiver.');
          transaction.oncomplete = event => {
            root.dataset.rootSavePhase = 'held';
            window.addEventListener('root-navigation:release-save', () => {
              root.dataset.rootSavePhase = 'released';
              transaction.oncomplete = complete;
              complete.call(transaction, event);
            }, { once: true });
          };
        }
      }
      return put.apply(this, args);
    };
    window.addEventListener('root-navigation:restore-put', () => { IDBObjectStore.prototype.put = put; }, { once: true });
  });
}

async function held(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-root-save-phase', 'held');
}

async function releaseSave(page: Page) {
  await page.evaluate(() => {
    if (document.documentElement.dataset.rootSavePhase !== 'held') throw new Error('Release requires an observed held save.');
    window.dispatchEvent(new Event('root-navigation:release-save'));
  });
  await expect(page.locator('html')).toHaveAttribute('data-root-save-phase', 'released');
}

async function rejectWrites(page: Page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    document.documentElement.dataset.rootRejectedWrites = '0';
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.transaction.db.name === 'play100-personal' && this.name === 'library' && args[1] === 'state') {
        document.documentElement.dataset.rootRejectedWrites = String(Number(document.documentElement.dataset.rootRejectedWrites) + 1);
        throw new DOMException('Synthetic root-navigation write refusal.', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
    window.addEventListener('root-navigation:restore-put', () => { IDBObjectStore.prototype.put = put; }, { once: true });
  });
}

async function publicDetail(page: Page) {
  await page.goto('/discover?q=Kingdomcome&catalogs=off&genreFamily=role-playing&campaign=retained');
  await page.locator(`[data-catalog-id="${provider.id}"]`).getByRole('button', { name: provider.title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: provider.title, exact: true });
  await expect(dialog.getByRole('button', { name: 'Enable online details', exact: true })).toBeEnabled();
  return dialog;
}

async function expectOneWrite(page: Page, revision: number) {
  await expect(page.locator('html')).toHaveAttribute('data-root-save-writes', '1');
  expect((await readLibrary(page)).revision).toBe(revision + 1);
}

test.beforeEach(async ({ context, page, baseURL }) => {
  const origin = new URL(baseURL!);
  expect(['localhost', '127.0.0.1']).toContain(origin.hostname);
  const document = await page.request.get('/');
  expect(document.ok()).toBe(true);
  test.skip((await document.text()).includes('site-header-online'),
    'Offline root-navigation characterization; configured account/scope behavior is outside this spec.');
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin.origin) return route.abort('blockedbyclient');
    if (url.pathname === '/api/catalog') return route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } });
    if (url.pathname === '/api/catalog-detail') return route.fulfill({ status: 503, json: { error: 'Synthetic detail provider failure.' } });
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  await page.evaluate(() => {
    if (document.documentElement.dataset.rootSavePhase === 'held') window.dispatchEvent(new Event('root-navigation:release-save'));
    window.dispatchEvent(new Event('root-navigation:restore-put'));
  });
});

test('the save hold delays an already-registered completion receiver until one explicit release', async ({ page }) => {
  await prepareRanking(page);
  const before = await readLibrary(page);
  await holdNextSave(page);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const root = document.documentElement;
    root.dataset.rootProbeCompletions = '0';
    const request = indexedDB.open('play100-personal');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('library', 'readwrite');
      // Match personal-db: register completion before get.onsuccess calls put.
      transaction.oncomplete = function (event) {
        root.dataset.rootProbeCompletions = String(Number(root.dataset.rootProbeCompletions) + 1);
        root.dataset.rootProbeReceiver = this === transaction && event.target === transaction && event.type === 'complete'
          ? 'original' : 'unexpected';
        database.close();
      };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
      const store = transaction.objectStore('library');
      const read = store.get('state');
      read.onerror = () => reject(read.error);
      read.onsuccess = () => {
        const write = store.put(read.result, 'state');
        write.onerror = () => reject(write.error);
        write.onsuccess = () => resolve();
      };
    };
  }));
  await held(page);
  await expect(page.locator('html')).toHaveAttribute('data-root-probe-completions', '0');
  await expect(page.locator('html')).toHaveAttribute('data-root-save-writes', '1');
  expect(await readLibrary(page)).toEqual(before);
  await releaseSave(page);
  await expect(page.locator('html')).toHaveAttribute('data-root-probe-completions', '1');
  await expect(page.locator('html')).toHaveAttribute('data-root-probe-receiver', 'original');
  await page.evaluate(() => window.dispatchEvent(new Event('root-navigation:release-save')));
  await expect(page.locator('html')).toHaveAttribute('data-root-probe-completions', '1');
  expect(await readLibrary(page)).toEqual(before);
});

test('primary links keep an invalid rating and wait for one real note save before leaving', async ({ page, isMobile }) => {
  await prepareRanking(page);
  const discover = primary(page, isMobile).getByRole('link', { name: 'Discover', exact: true });
  const before = await readLibrary(page);
  await rating(page).fill('11');
  await discover.click();
  await expect(page.locator('.toast')).toContainText('Finish or correct the open rating or note');
  await expect(page).toHaveURL(url => `${url.pathname}${url.search}` === rankingUrl);
  await expect(rating(page)).toHaveValue('11');
  expect(await readLibrary(page)).toEqual(before);
  await rating(page).fill('5');
  await rating(page).press('Tab');
  const note = await openNote(page);
  await holdNextSave(page);
  await note.fill('Primary navigation must await this original record.');
  await discover.click();
  await held(page);
  await expect(page).toHaveURL(url => `${url.pathname}${url.search}` === rankingUrl);
  await expect(note).toBeDisabled();
  await releaseSave(page);
  await expect(page).toHaveURL(url => url.pathname === '/discover' && url.searchParams.get('catalogs') === 'off');
  await expect(primary(page, isMobile).getByRole('link', { name: 'Discover', exact: true })).toHaveAttribute('aria-current', 'page');
  await expectOneWrite(page, before.revision);
  const after = await readLibrary(page);
  expect(after.ranking.find(entry => entry.id === first.id)?.note).toBe('Primary navigation must await this original record.');
  expect(after.progress).toEqual(before.progress);
  expect(after.queueOrder).toEqual(before.queueOrder);
});

test('primary navigation preserves a rejected note without retrying or discarding it', async ({ page, isMobile }) => {
  await prepareRanking(page);
  const before = await readLibrary(page);
  const note = await openNote(page);
  await rejectWrites(page);
  await note.fill('Keep this rejected draft.');
  await note.press('Tab');
  await expect(rankedList(page).getByRole('alert')).toContainText('The note could not be saved');
  await primary(page, isMobile).getByRole('link', { name: 'Discover', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Finish or correct the open rating or note');
  await expect(page).toHaveURL(url => `${url.pathname}${url.search}` === rankingUrl);
  await expect(note).toHaveValue('Keep this rejected draft.');
  await expect(page.locator('html')).toHaveAttribute('data-root-rejected-writes', '1');
  expect(await readLibrary(page)).toEqual(before);
});

test('primary modified and nonprimary clicks retain native defaults and the current draft', async ({ page, context, isMobile }) => {
  await prepareRanking(page);
  await rating(page).fill('11');
  const discover = primary(page, isMobile).getByRole('link', { name: 'Discover', exact: true });
  await expect(discover).toHaveAttribute('href', '/discover?catalogs=off');
  const popupPromise = context.waitForEvent('page');
  await discover.click({ modifiers: ['Control'] });
  const popup = await popupPromise;
  await expect(popup).toHaveURL(url => url.pathname === '/discover');
  await popup.close();
  for (const modifiers of [{ metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    const prevented = await discover.evaluate((element, modifiers) => {
      let intercepted: boolean | undefined;
      document.addEventListener('click', event => {
        intercepted = event.defaultPrevented;
        // Observe React first, then suppress only the synthetic browser default.
        event.preventDefault();
      }, { once: true });
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...modifiers }));
      return intercepted;
    }, modifiers);
    expect(prevented).toBe(false);
  }
  await expect(page).toHaveURL(url => `${url.pathname}${url.search}` === rankingUrl);
  await expect(rating(page)).toHaveValue('11');
  expect((await readLibrary(page)).ranking.find(entry => entry.id === first.id)?.score).toBe(5);
});

for (const roundtrip of [false, true]) {
  test(`a held primary-link save cannot override native ${roundtrip ? 'Back/Forward A-B-A' : 'Back'}`, async ({ page, isMobile }) => {
    await prepareRanking(page);
    const tabs = page.getByRole('navigation', { name: 'My games views', exact: true });
    await tabs.getByRole('button', { name: /^Library, / }).click();
    await expect(tabs.getByRole('button', { name: /^Library, / })).toHaveAttribute('aria-current', 'page');
    await tabs.getByRole('button', { name: /^Ranking, / }).click();
    await expect(tabs.getByRole('button', { name: /^Ranking, / })).toHaveAttribute('aria-current', 'page');
    const original = page.url();
    const before = await readLibrary(page);
    const note = await openNote(page);
    await holdNextSave(page);
    await note.fill('Persist once, but do not resurrect the old route intent.');
    await primary(page, isMobile).getByRole('link', { name: 'Discover', exact: true }).click();
    await held(page);
    await expect(page).toHaveURL(original);
    await expect(note).toBeDisabled();
    await page.goBack();
    await expect(tabs.getByRole('button', { name: /^Library, / })).toHaveAttribute('aria-current', 'page');
    if (roundtrip) {
      await page.goForward();
      await expect(page).toHaveURL(original);
      await expect(tabs.getByRole('button', { name: /^Ranking, / })).toHaveAttribute('aria-current', 'page');
    }
    const retained = page.url();
    await releaseSave(page);
    await expect(rankedList(page).getByRole('textbox', { name: `Your note for ${first.title}`, exact: true, includeHidden: true })).toBeEnabled();
    await expectOneWrite(page, before.revision);
    await expect(page).toHaveURL(retained);
    expect((await readLibrary(page)).ranking.find(entry => entry.id === first.id)?.note).toBe('Persist once, but do not resurrect the old route intent.');
    await primary(page, isMobile).getByRole('link', { name: 'Discover', exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname === '/discover');
    await expectOneWrite(page, before.revision);
  });
}

test('same-page mobile Browse scrolls and focuses the collection without changing history or data', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await page.goto('/?catalogs=off');
  await expect(page.locator('.game-card').first()).toBeVisible();
  const before = await readLibrary(page);
  const url = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await primary(page, true).getByRole('link', { name: 'The 100', exact: true }).click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.getElementById('collection')?.contains(document.activeElement))).toBe(true);
  await expect(page).toHaveURL(url);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  expect(await readLibrary(page)).toEqual(before);
});

test('direct queue and detail callbacks retain the hidden invalid ranking draft and detail history', async ({ page }) => {
  await prepareRanking(page);
  const before = await readLibrary(page);
  await rating(page).fill('11');
  await page.getByRole('button', { name: /^Play later, \d+ games?$/ }).click();
  await expect(page).toHaveURL(url => url.pathname === '/my-games' && url.searchParams.get('tab') === 'queue');
  const hiddenRating = page.locator(`[hidden] [data-record-id="${first.id}"] input[type="number"]`);
  await expect(hiddenRating).toHaveValue('11');
  expect(await readLibrary(page)).toEqual(before);
  await page.goBack();
  await expect(rating(page)).toHaveValue('11');
  const url = page.url();
  await rankedList(page).getByRole('button', { name: first.title, exact: true }).click();
  await expect(page.getByRole('dialog', { name: first.title, exact: true })).toBeVisible();
  await expect(page).toHaveURL(next => next.searchParams.get('game') === first.id);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(url);
  await expect(rating(page)).toHaveValue('11');
  expect(await readLibrary(page)).toEqual(before);
});

test('the My games host exit waits for one save, and Menu Settings still opens and closes natively', async ({ page }) => {
  await prepareRanking(page);
  const before = await readLibrary(page);
  const note = await openNote(page);
  await holdNextSave(page);
  await note.fill('The host exit keeps this record and saves only once.');
  await page.getByRole('button', { name: 'Find games', exact: true }).click();
  await held(page);
  await expect(page).toHaveURL(url => `${url.pathname}${url.search}` === rankingUrl);
  await releaseSave(page);
  await expect(page).toHaveURL(url => url.pathname === '/discover');
  await expectOneWrite(page, before.revision);
  expect((await readLibrary(page)).ranking.find(entry => entry.id === first.id)?.note).toBe('The host exit keeps this record and saves only once.');
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await menu.click();
  await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: 'Settings & backups', exact: true }).click();
  await expect(page.locator('#settings-title')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await expect(page).toHaveURL(url => url.pathname === '/discover');
  await expectOneWrite(page, before.revision);
});

test('the catalog-detail ranking callback opens the saved ranking without another write', async ({ page }) => {
  const dialog = await publicDetail(page);
  const input = dialog.getByRole('spinbutton');
  await input.fill('7.25');
  await input.press('Tab');
  await expect.poll(async () => (await readLibrary(page)).ranking.find(entry => entry.id === provider.id)?.score).toBe(7.25);
  await expect(input).toBeEnabled();
  const before = await readLibrary(page);
  await dialog.getByRole('button', { name: 'Your rank: #1', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === '/my-games' && url.searchParams.get('tab') === 'ranking');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(rankedList(page).getByRole('spinbutton', { name: `Your rating / 10 for ${provider.title}`, exact: true })).toHaveValue('7.25');
  expect(await readLibrary(page)).toEqual(before);
});

test('public enable blocks invalid edits, then awaits persistence and preserves detail/query/history', async ({ page }) => {
  const requests: URL[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/catalog-detail') requests.push(new URL(request.url())); });
  const dialog = await publicDetail(page);
  const input = dialog.getByRole('spinbutton', { name: `Your rating / 10 for ${provider.title}`, exact: true });
  const enable = dialog.getByRole('button', { name: 'Enable online details', exact: true });
  const original = new URL(page.url());
  const historyLength = await page.evaluate(() => history.length);
  const before = await readLibrary(page);
  await input.fill('11');
  await enable.click();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(original.href);
  expect(requests).toEqual([]);
  await holdNextSave(page);
  await input.fill('7.25');
  await enable.click();
  await held(page);
  await expect(page).toHaveURL(original.href);
  expect(requests).toEqual([]);
  await releaseSave(page);
  await expect(enable).toHaveCount(0);
  await expect(input).toBeEnabled();
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  const expected = new URL(original);
  expected.searchParams.delete('catalogs');
  expect(new URL(page.url()).pathname).toBe(expected.pathname);
  expect([...new URL(page.url()).searchParams.entries()].sort()).toEqual([...expected.searchParams.entries()].sort());
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expectOneWrite(page, before.revision);
  expect((await readLibrary(page)).ranking.find(entry => entry.id === provider.id)?.score).toBe(7.25);
  for (const request of requests) {
    expect([...request.searchParams.keys()]).toEqual(['id']);
    expect(request.searchParams.get('id')).toBe(provider.id);
  }
});

for (const roundtrip of [false, true]) {
  test(`public-enable consent cannot survive native ${roundtrip ? 'Back/Forward A-B-A' : 'Back'} during its save`, async ({ page }) => {
    const requests: string[] = [];
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/catalog-detail') requests.push(request.url()); });
    const dialog = await publicDetail(page);
    const original = page.url();
    const before = await readLibrary(page);
    await holdNextSave(page);
    await dialog.getByRole('spinbutton').fill('7.5');
    await dialog.getByRole('button', { name: 'Enable online details', exact: true }).click();
    await held(page);
    await expect(page).toHaveURL(original);
    await expect(dialog.getByRole('spinbutton')).toBeDisabled();
    expect(requests).toEqual([]);
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (roundtrip) {
      await page.goForward();
      await expect(page).toHaveURL(original);
      await expect(page.getByRole('dialog', { name: provider.title, exact: true })).toBeVisible();
    }
    const retained = page.url();
    await releaseSave(page);
    await expect(page).toHaveURL(retained);
    if (!roundtrip) {
      await page.locator(`[data-catalog-id="${provider.id}"]`).getByRole('button', { name: provider.title, exact: true }).click();
    }
    const current = page.getByRole('dialog', { name: provider.title, exact: true });
    await expect(current.getByRole('spinbutton')).toBeEnabled();
    await expect(current.getByRole('spinbutton')).toHaveValue('7.5');
    await expect(current.getByRole('button', { name: 'Enable online details', exact: true })).toBeEnabled();
    await expectOneWrite(page, before.revision);
    if (roundtrip) await expect(page).toHaveURL(retained);
    expect(new URL(page.url()).searchParams.get('catalogs')).toBe('off');
    expect(requests).toEqual([]);
  });
}
