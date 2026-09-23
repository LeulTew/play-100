import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readLibrary } from './library-helpers';

const first = { id: 'red-dead-redemption-2', title: 'Red Dead Redemption 2' };
const second = { id: 'mass-effect-2', title: 'Mass Effect 2' };
const menu = (page: Page) => page.getByRole('dialog', { name: 'Menu', exact: true });
const trigger = (page: Page) => page.getByRole('button', { name: 'Menu', exact: true });
const rating = (page: Page) => page.getByRole('spinbutton', { name: `Your rating for ${first.title}`, exact: true });

async function openMenu(page: Page) {
  await trigger(page).click();
  await expect(menu(page)).toBeVisible();
}

async function prepareRanking(page: Page) {
  await page.goto('/my-games?tab=ranking&catalogs=off');
  await page.getByRole('button', { name: 'Add games', exact: true }).click();
  for (const game of [first, second]) {
    await page.getByRole('button', { name: `Add ${game.title} to ranking`, exact: true }).click();
    await expect.poll(async () => (await readLibrary(page)).ranking.some(entry => entry.id === game.id)).toBe(true);
  }
  await page.getByRole('button', { name: 'Close game picker', exact: true }).click();
  await rating(page).fill('5');
  await rating(page).press('Tab');
  await expect.poll(async () => (await readLibrary(page)).ranking.find(entry => entry.id === first.id)?.score).toBe(5);
}

async function rejectMenuWrites(page: Page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (document.documentElement.dataset.rejectMenuWrite === 'yes') {
        document.documentElement.dataset.menuWriteAttempts = String(Number(document.documentElement.dataset.menuWriteAttempts ?? 0) + 1);
        throw new DOMException('Synthetic Menu storage failure', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
    document.documentElement.dataset.rejectMenuWrite = 'yes';
  });
}

test.beforeEach(async ({ context, page, baseURL }) => {
  const origin = new URL(baseURL!);
  expect(['localhost', '127.0.0.1']).toContain(origin.hostname);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || ![origin.port, '9199', '8188'].includes(url.port)) return route.abort('blockedbyclient');
    if (url.pathname === '/api/catalog') return route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } });
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const width of [390, 1280]) {
  test(`secondary dialogs restore the visible Menu at ${width}px; direct game links restore the heading`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?catalogs=off');
    for (const name of ['Settings & backups', 'About & credits']) {
      await openMenu(page);
      await menu(page).getByRole('button', { name, exact: true }).click();
      await expect(page.locator(name === 'About & credits' ? '#about-title' : '#settings-title')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(trigger(page)).toBeVisible();
      await expect(trigger(page)).toBeFocused();
    }
    await page.goto(`/?game=${first.id}&catalogs=off`);
    await expect(page.locator('#game-title')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#collection-title')).toBeFocused();
    const footer = page.locator('.site-footer').getByRole('button', { name: 'About & credits', exact: true });
    await footer.click();
    await expect(page.locator('#about-title')).toBeFocused();
    await footer.evaluate(element => element.setAttribute('disabled', ''));
    await page.locator('[data-page-heading], #collection-title, main h1').evaluateAll(headings => {
      for (const heading of headings) heading.removeAttribute('tabindex');
    });
    await page.keyboard.press('Escape');
    await expect(trigger(page)).toBeFocused();
  });
}

test('Menu is secondary, grouped, current, keyboard-operable and does not bootstrap or mutate a guest', async ({ page, isMobile }) => {
  const accountRequests: string[] = [];
  page.on('request', request => { if (/\/src\/cloud\/|:9199\/|:8188\//.test(request.url())) accountRequests.push(request.url()); });
  await page.goto('/my-games?tab=queue&catalogs=off');
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  const before = await readLibrary(page);
  const primary = page.locator(isMobile ? '.mobile-nav' : '.desktop-nav');
  for (const name of ['The 100', 'Discover', 'My games']) {
    await expect(primary.getByRole('link', { name, exact: true })).toBeVisible();
  }
  if (isMobile) await expect(primary.locator('> a, > button')).toHaveCount(5);
  await openMenu(page);
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(menu(page).getByRole('navigation', { name: 'All navigation' })).toBeVisible();
  await expect(menu(page).getByRole('menu')).toHaveCount(0);
  await expect(menu(page).locator('#menu-title')).toBeFocused();
  await expect(menu(page).locator('[aria-current="page"]')).toHaveText('QueueCurrent');
  const hrefs = await menu(page).locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')));
  expect(new Set(hrefs).size).toBe(hrefs.length);
  expect(hrefs).not.toContain('/my-library');
  expect(hrefs).not.toContain('/my-rankings');
  expect(hrefs).not.toContain('/invite');
  await expect(menu(page).getByRole('link', { name: 'Creator desk', exact: true })).toHaveCount(0);
  expect(await readLibrary(page)).toEqual(before);
  expect(accountRequests).toEqual([]);
  await page.keyboard.press('Tab');
  await expect(menu(page).getByRole('link', { name: 'The 100', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
  await openMenu(page);
  await menu(page).getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(trigger(page)).toBeFocused();
  await openMenu(page);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/\?catalogs=off$/);
  await expect(menu(page)).toHaveCount(0);
});

test('every applicable route uses its real target and only one current link', async ({ page }) => {
  await page.goto('/?catalogs=off');
  await openMenu(page);
  const online = await menu(page).getByRole('link', { name: 'Account', exact: true }).count() > 0;
  const destinations = [
    ['Discover', '/discover?catalogs=off'],
    ['Library', '/my-games?catalogs=off'],
    ['Queue', '/my-games?catalogs=off&tab=queue'],
    ['Ranking', '/my-games?catalogs=off&tab=ranking'],
    ...(online ? [
      ['Friends', '/friends?catalogs=off'], ['Compare', '/compare?catalogs=off'],
      ['Community', '/community?catalogs=off'], ['Public ranking', '/publish?catalogs=off'],
      ['Friends sharing', '/friends/sharing?catalogs=off'], ['Shared games', '/friends/sharing/games?catalogs=off'],
      ['Account', '/account?catalogs=off'],
    ] : []),
    ['The 100', '/?catalogs=off'],
  ];
  for (const [name, path] of destinations) {
    const link = menu(page).getByRole('link', { name, exact: true });
    await expect(link).toHaveAttribute('href', path!);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${path!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    await expect(menu(page)).toHaveCount(0);
    await expect(page.locator('main h1').first()).toBeVisible();
    await openMenu(page);
    await expect(menu(page).locator('[aria-current="page"]')).toHaveText(`${name}Current`);
  }
});

test('Settings, credits, Data use and both actual workbook downloads retain their existing handlers', async ({ page }) => {
  await page.goto('/?catalogs=off');
  await openMenu(page);
  await menu(page).getByRole('button', { name: 'Settings & backups', exact: true }).click();
  await expect(page.locator('#settings-title')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export my library', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger(page)).toBeFocused();
  await openMenu(page);
  await menu(page).getByRole('button', { name: 'About & credits', exact: true }).click();
  await expect(page.locator('#about-title')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger(page)).toBeFocused();
  await page.goto('/?info=credits');
  await expect(page.locator('#about-title')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/$/);
  await openMenu(page);
  for (const [name, file] of [
    ['Enhanced spreadsheet', 'Play-100-Collection.xlsx'],
    ['Original spreadsheet', 'AAA_games_u_have_to_play_list_top_100.xlsx'],
  ]) {
    const downloadPromise = page.waitForEvent('download');
    await menu(page).getByRole('link', { name: name!, exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(file);
    const path = await download.path();
    expect(path).not.toBeNull();
    expect(readFileSync(path!)).toEqual(readFileSync(new URL(`../public/downloads/${file}`, import.meta.url)));
  }
});

test('legacy Library, Queue and Ranking links keep their location and Back history', async ({ page }) => {
  for (const [path, current] of [
    ['/my-library?list=completed&catalogs=off', 'Library'],
    ['/my-library?list=later&catalogs=off', 'Queue'],
    ['/my-rankings?catalogs=off', 'Ranking'],
  ]) {
    await page.goto(path!);
    await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
    await openMenu(page);
    await expect(menu(page).locator('[aria-current="page"]')).toHaveText(`${current}Current`);
    await menu(page).getByRole('link', { name: 'Discover', exact: true }).click();
    await expect(page).toHaveURL(/\/discover\?catalogs=off$/);
    await page.goBack();
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(path);
    await page.reload();
    await openMenu(page);
    await expect(menu(page).locator('[aria-current="page"]')).toHaveText(`${current}Current`);
    await page.keyboard.press('Escape');
  }
});

for (const field of ['rating', 'note'] as const) {
  test(`valid pending ${field} stays with its original record before Menu navigation`, async ({ page }) => {
    await prepareRanking(page);
    const before = await readLibrary(page);
    if (field === 'rating') {
      const now = new Date();
      await page.clock.install({ time: now });
      await page.clock.pauseAt(new Date(now.getTime() + 1000));
      await rating(page).fill('8.75');
    } else {
      await page.locator(`[data-record-id="${first.id}"] .ranking-note summary`).click();
      await page.getByRole('textbox', { name: `Your note for ${first.title}`, exact: true }).fill('Menu preserves this private draft.');
    }
    await openMenu(page);
    await menu(page).getByRole('link', { name: 'Discover', exact: true }).click();
    await expect(page).toHaveURL(/\/discover\?catalogs=off$/);
    const after = await readLibrary(page);
    expect(after.ranking.find(entry => entry.id === first.id)?.[field === 'rating' ? 'score' : 'note'])
      .toBe(field === 'rating' ? 8.75 : 'Menu preserves this private draft.');
    expect(after.ranking.find(entry => entry.id === second.id)).toEqual(before.ranking.find(entry => entry.id === second.id));
    expect(after.records).toEqual(before.records);
    expect(after.progress).toEqual(before.progress);
    expect(after.queueOrder).toEqual(before.queueOrder);
    expect(after.revision).toBe(before.revision + 1);
    await page.reload();
    expect(await readLibrary(page)).toEqual(after);
  });
}

test('invalid ratings block destinations and Settings without losing the draft, then allow correction', async ({ page }) => {
  await prepareRanking(page);
  const before = await readLibrary(page);
  await rating(page).fill('11');
  await openMenu(page);
  for (const target of [
    menu(page).getByRole('link', { name: 'Discover', exact: true }),
    menu(page).getByRole('button', { name: 'Settings & backups', exact: true }),
  ]) {
    await target.click();
    await expect(menu(page).getByRole('alert')).toContainText('Your edit has not saved');
    await expect(page).toHaveURL(/\/my-games\?tab=ranking&catalogs=off$/);
    expect(await readLibrary(page)).toEqual(before);
  }
  await menu(page).getByRole('button', { name: 'Return to edit', exact: true }).click();
  await expect(rating(page)).toBeFocused();
  await expect(rating(page)).toHaveValue('11');
  await expect(rating(page)).toHaveAttribute('aria-invalid', 'true');
  await rating(page).fill('9.25');
  await openMenu(page);
  await menu(page).getByRole('link', { name: 'Queue', exact: true }).click();
  await expect(page).toHaveURL(/\/my-games\?catalogs=off&tab=queue$/);
  expect((await readLibrary(page)).ranking.find(entry => entry.id === first.id)?.score).toBe(9.25);
});

test('rejected local writes stay recoverable and Menu does not retry or discard the rejected edit', async ({ page }) => {
  await prepareRanking(page);
  const before = await readLibrary(page);
  await rejectMenuWrites(page);
  await rating(page).fill('9');
  await rating(page).press('Tab');
  await expect(page.locator('.ranking-row-content .inline-error')).toContainText('could not be saved');
  const attempts = await page.evaluate(() => document.documentElement.dataset.menuWriteAttempts);
  await openMenu(page);
  await menu(page).getByRole('link', { name: 'Library', exact: true }).click();
  await expect(menu(page).getByRole('alert')).toContainText('Your edit has not saved');
  expect(await readLibrary(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.dataset.menuWriteAttempts)).toBe(attempts);
  await page.keyboard.press('Escape');
  await expect(trigger(page)).toBeFocused();
  await expect(rating(page)).toHaveValue('9');
  await openMenu(page);
  await menu(page).getByRole('link', { name: 'Library', exact: true }).click();
  await expect(menu(page).getByRole('alert')).toContainText('Your edit has not saved');
  await rating(page).evaluate(input => input.removeAttribute('aria-invalid'));
  await menu(page).getByRole('button', { name: 'Return to edit', exact: true }).click();
  await expect(rating(page)).toBeFocused();
  await expect(rating(page)).toHaveValue('9');
  expect(await readLibrary(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.dataset.menuWriteAttempts)).toBe(attempts);
  await page.evaluate(() => { document.documentElement.dataset.rejectMenuWrite = 'no'; });
  await rating(page).fill('9.1');
  await openMenu(page);
  await menu(page).getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page).toHaveURL(/\/my-games\?catalogs=off$/);
  expect((await readLibrary(page)).ranking.find(entry => entry.id === first.id)?.score).toBe(9.1);
});

test('Return to edit focuses the exact rejected note without relying on an invalid marker or another record', async ({ page }) => {
  await prepareRanking(page);
  const before = await readLibrary(page);
  await rejectMenuWrites(page);
  const firstRow = page.getByRole('list', { name: 'Your ranked games', exact: true }).locator(`[data-record-id="${first.id}"]`);
  await firstRow.locator('.ranking-note summary').click();
  const note = firstRow.getByRole('textbox');
  await note.fill('Keep this rejected note on its exact original record.');
  await openMenu(page);
  await menu(page).getByRole('link', { name: 'Discover', exact: true }).click();
  await expect(menu(page).getByRole('alert')).toContainText('Your edit has not saved');
  await note.evaluate(input => input.removeAttribute('aria-invalid'));
  const otherRating = page.getByRole('spinbutton', { name: `Your rating for ${second.title}`, exact: true });
  await otherRating.evaluate(input => input.setAttribute('aria-invalid', 'true'));
  await menu(page).getByRole('button', { name: 'Return to edit', exact: true }).click();
  await expect(note).toBeFocused();
  await expect(note).toHaveValue('Keep this rejected note on its exact original record.');
  await expect(otherRating).not.toBeFocused();
  expect(await readLibrary(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.dataset.menuWriteAttempts)).toBe('1');
});

test('Return to edit never focuses a retained hidden editor and keeps its invalid draft', async ({ page }) => {
  await prepareRanking(page);
  const before = await readLibrary(page);
  const tabs = page.getByRole('navigation', { name: 'My games views', exact: true });
  await tabs.getByRole('button', { name: /^Library, / }).click();
  await tabs.getByRole('button', { name: /^Ranking, / }).click();
  await rating(page).fill('11');
  await page.goBack();
  const hidden = page.locator(`[hidden] [data-record-id="${first.id}"] input[type="number"]`);
  await expect(hidden).toHaveValue('11');
  await openMenu(page);
  await menu(page).getByRole('link', { name: 'Discover', exact: true }).click();
  await expect(menu(page).getByRole('alert')).toContainText('Your edit has not saved');
  await menu(page).getByRole('button', { name: 'Return to edit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeFocused();
  await expect(hidden).not.toBeFocused();
  await expect(hidden).toHaveValue('11');
  expect(await readLibrary(page)).toEqual(before);
});

test('Return to edit does not apply stale focus after navigation leaves and returns to the same view', async ({ page }) => {
  await prepareRanking(page);
  await rating(page).fill('11');
  await openMenu(page);
  await menu(page).getByRole('link', { name: 'Discover', exact: true }).click();
  await expect(menu(page).getByRole('alert')).toContainText('Your edit has not saved');
  await rating(page).evaluate(input => {
    const focus = input.focus.bind(input);
    document.documentElement.dataset.menuRecoveryFocusAttempts = '0';
    input.focus = options => {
      document.documentElement.dataset.menuRecoveryFocusAttempts = String(Number(document.documentElement.dataset.menuRecoveryFocusAttempts) + 1);
      focus(options);
    };
  });
  await menu(page).getByRole('button', { name: 'Return to edit', exact: true }).evaluate(button => {
    button.addEventListener('click', () => {
      history.pushState(history.state, '', '/my-games?catalogs=off&tab=queue');
      window.dispatchEvent(new PopStateEvent('popstate'));
      history.pushState(history.state, '', '/my-games?catalogs=off&tab=ranking');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, { capture: true, once: true });
  });
  await menu(page).getByRole('button', { name: 'Return to edit', exact: true }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(rating(page)).toHaveValue('11');
  expect(await page.evaluate(() => document.documentElement.dataset.menuRecoveryFocusAttempts)).toBe('0');
});

test('Data use and modified-click links keep an invalid draft in its original tab', async ({ page, context }) => {
  await prepareRanking(page);
  await rating(page).fill('11');
  await openMenu(page);
  await context.addInitScript(() => {
    if (location.pathname !== '/data-use') return;
    const recordAccess = () => { document.documentElement.dataset.privateBootstrap = 'yes'; throw new Error('Data use opened private storage.'); };
    indexedDB.open = recordAccess;
    Storage.prototype.getItem = recordAccess;
  });
  const popupPromise = context.waitForEvent('page');
  await menu(page).getByRole('link', { name: 'Data use', exact: false }).click();
  const privacy = await popupPromise;
  await expect(privacy.getByRole('heading', { name: 'Data use', exact: true })).toBeVisible();
  expect(await privacy.evaluate(() => document.documentElement.dataset.privateBootstrap)).toBeUndefined();
  expect(await privacy.evaluate(() => performance.getEntriesByType('resource').some(entry => /:9199\/|:8188\/|\/src\/cloud\//.test(entry.name)))).toBe(false);
  await privacy.close();
  const modifiedClicks: Parameters<Locator['click']>[0][] = [{ modifiers: ['Control'] }, { button: 'middle' }];
  for (const options of modifiedClicks) {
    const nextPagePromise = context.waitForEvent('page');
    await menu(page).getByRole('link', { name: 'Discover', exact: true }).click(options);
    const nextPage = await nextPagePromise;
    await expect(nextPage).toHaveURL(/\/discover\?catalogs=off$/);
    await nextPage.close();
    await expect(menu(page)).toBeVisible();
    await expect(page).toHaveURL(/\/my-games\?tab=ranking&catalogs=off$/);
  }
  await page.keyboard.press('Escape');
  await expect(rating(page)).toHaveValue('11');
  expect((await readLibrary(page)).ranking.find(entry => entry.id === first.id)?.score).toBe(5);
});

test('Escape cancels an in-flight Menu transition even when the pending save finishes later', async ({ page }) => {
  await page.goto('/my-games?tab=ranking&catalogs=off');
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/hooks/useExitSave.ts';
    const loaded = performance.getEntriesByType('resource').map(entry => entry.name).findLast(value => new URL(value).pathname === path);
    if (!loaded) throw new Error('The active app editor registry was not loaded.');
    const { registerPendingEditor }: typeof import('../src/hooks/useExitSave') = await import(loaded);
    let pending = true;
    const saved = new Promise<boolean>(resolve => window.addEventListener('menu-test:finish', () => { pending = false; resolve(true); }, { once: true }));
    const release = registerPendingEditor({ pending: () => pending, flush: () => saved });
    window.addEventListener('menu-test:release', () => { void release(); }, { once: true });
  });
  await openMenu(page);
  await menu(page).getByRole('link', { name: 'Discover', exact: true }).click();
  await expect(menu(page).getByRole('status')).toContainText('Saving your open edit');
  await page.keyboard.press('Escape');
  await expect(trigger(page)).toBeFocused();
  await page.evaluate(() => { window.dispatchEvent(new Event('menu-test:finish')); window.dispatchEvent(new Event('menu-test:release')); });
  await expect(page).toHaveURL(/\/my-games\?tab=ranking&catalogs=off$/);
  await openMenu(page);
  await menu(page).getByRole('link', { name: 'Discover', exact: true }).click();
  await expect(page).toHaveURL(/\/discover\?catalogs=off$/);
});

test('Menu stays scrollable, reachable and accessible at 320px with five bottom items', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/my-games?tab=queue&catalogs=off');
  await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
  await expect(page.locator('.mobile-nav > a, .mobile-nav > button')).toHaveCount(5);
  await openMenu(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const scroll = menu(page).getByRole('navigation', { name: 'All navigation' });
  expect(await scroll.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  const sizes = await menu(page).locator('a, button').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  expect(sizes.every(size => size.width >= 44 && size.height >= 44)).toBe(true);
  const last = menu(page).getByRole('link', { name: 'Original spreadsheet', exact: true });
  await last.focus();
  await expect(last).toBeInViewport();
  await expect(menu(page).getByRole('button', { name: 'Close dialog', exact: true })).toBeInViewport();
  expect(await scroll.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.menu-dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(trigger(page)).toBeFocused();
});

test('primary route anchors preserve modified clicks, draft guards, current location and keyboard focus', async ({ page, context, isMobile }) => {
  await prepareRanking(page);
  const primary = page.locator(isMobile ? '.mobile-nav' : '.desktop-nav');
  const discover = primary.getByRole('link', { name: 'Discover', exact: true });
  await expect(discover).toHaveAttribute('href', '/discover?catalogs=off');
  const current = isMobile && !await page.locator('.account-nav').count() ? 'Ranking' : 'My games';
  await expect(primary.locator('[aria-current="page"]')).toHaveText(current);
  if (isMobile) {
    await expect(primary.getByRole('link')).toHaveCount(4);
    await expect(primary.getByRole('button')).toHaveCount(1);
  }
  await rating(page).fill('11');
  const nextPagePromise = context.waitForEvent('page');
  await discover.click({ modifiers: ['Control'] });
  const nextPage = await nextPagePromise;
  await expect(nextPage).toHaveURL(/\/discover\?catalogs=off$/);
  await nextPage.close();
  await discover.click();
  await expect(page.locator('.toast')).toContainText('Finish or correct the open rating or note');
  await expect(page).toHaveURL(/\/my-games\?tab=ranking&catalogs=off$/);
  await expect(rating(page)).toHaveValue('11');
  expect((await readLibrary(page)).ranking.find(entry => entry.id === first.id)?.score).toBe(5);
  await rating(page).fill('8.25');
  await discover.click();
  await expect(page).toHaveURL(/\/discover\?catalogs=off$/);
  await expect(discover).toHaveAttribute('aria-current', 'page');
  expect((await readLibrary(page)).ranking.find(entry => entry.id === first.id)?.score).toBe(8.25);
  const home = primary.getByRole('link', { name: 'The 100', exact: true });
  await home.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/\?catalogs=off$/);
  await expect(home).toBeFocused();
  if (isMobile) {
    await page.goto('/?q=Mass&catalogs=off');
    await home.click();
    await expect(page).toHaveURL(/\/\?q=Mass&catalogs=off$/);
  }
});
