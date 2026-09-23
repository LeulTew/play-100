import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { enrichmentIdentity, parseCatalogEnrichment } from '../src/lib/catalog-enrichment';
import { parseDiscoveryCatalog } from '../src/lib/discovery-catalog';
import { enrichmentFixture } from '../src/lib/discovery-test-fixtures';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';

const catalog = parseDiscoveryCatalog(JSON.parse(readFileSync(new URL('../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8')));
interface DetailFrame {
  unavailable: boolean;
  loading: boolean;
  rating: boolean;
  image: boolean;
  actions: { x: number; y: number; width: number; height: number } | null;
}

declare global {
  interface Window {
    dialogOpenProbe: {
      frameAfterOpen: boolean;
      enrichment: { modal: boolean; focused: boolean; afterFrame: boolean }[];
      motion: { title: string | null; duration: number; phase: string | null }[];
      opens: DetailFrame[][];
    };
  }
}

test.beforeEach(async ({ page, context, baseURL }) => {
  expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL!).hostname);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort('blockedbyclient');
    if (url.pathname === '/api/catalog') return route.fulfill({ status: 503, json: { error: 'Synthetic offline catalog.' } });
    return route.continue();
  });
  await page.addInitScript(() => {
    window.dialogOpenProbe = { frameAfterOpen: false, enrichment: [], motion: [], opens: [] };
    const showModal = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function () {
      showModal.call(this);
      window.dialogOpenProbe.frameAfterOpen = false;
      requestAnimationFrame(() => { window.dialogOpenProbe.frameAfterOpen = true; });
      if (this.matches('.catalog-detail-dialog')) {
        const frames: DetailFrame[] = [];
        window.dialogOpenProbe.opens.push(frames);
        const sample = () => {
          const actions = this.querySelector('.detail-actions')?.getBoundingClientRect();
          const image = this.querySelector<HTMLImageElement>('.catalog-detail-sleeve img');
          frames.push({
            unavailable: this.textContent?.includes('Artwork unavailable') ?? false,
            loading: this.textContent?.includes('Loading public ratings and licensed artwork…') ?? false,
            rating: Boolean(this.querySelector('.catalog-review-list')),
            image: Boolean(image?.complete && image.naturalWidth > 0),
            actions: actions ? { x: actions.x, y: actions.y, width: actions.width, height: actions.height } : null,
          });
          if (frames.length < 3) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }
    };
    const fetch = window.fetch;
    window.fetch = function (...args: Parameters<typeof fetch>) {
      const input = args[0];
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname === '/api/catalog-detail') {
        const title = document.getElementById('catalog-game-title');
        window.dialogOpenProbe.enrichment.push({
          modal: Boolean(title?.closest('dialog')?.matches(':modal')),
          focused: document.activeElement === title,
          afterFrame: window.dialogOpenProbe.frameAfterOpen,
        });
      }
      return fetch.apply(this, args);
    };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
      const animation = animate.apply(this, args);
      const dialog = this.closest('dialog');
      if (dialog) window.dialogOpenProbe.motion.push({
        title: dialog.getAttribute('aria-labelledby'),
        duration: Number(animation.effect?.getTiming().duration),
        phase: this.getAttribute('data-motion-phase'),
      });
      return animation;
    };
  });
});

async function scrollPosition(page: Page) {
  return page.evaluate(() => ({ x: scrollX, y: scrollY }));
}

async function seed(page: Page, mode: 'on' | 'off' | 'lite' | 'reduced' = 'lite') {
  await page.emulateMedia({ reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
  if (mode === 'off') {
    await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 2 }));
  }
  const state = libraryFixture(3);
  state.motion = mode === 'off' ? 'auto' : mode === 'lite' ? 'lite' : 'full';
  await installGuestLibrary(page, state);
  await page.goto('/?catalogs=off');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await expect(page.locator('html')).toHaveAttribute('data-motion', mode === 'on' ? 'on' : 'off');
  await page.evaluate(() => document.fonts.ready);
}

for (const mode of ['on', 'off', 'lite', 'reduced'] as const) {
  test(`${mode}: Menu and detail retain native focus, close behavior and page scroll`, async ({ page }) => {
    await seed(page, mode);
    const before = await readLibrary(page);
    const trigger = page.getByRole('button', { name: 'Menu', exact: true });
    await trigger.focus();
    const menuScroll = await scrollPosition(page);
    for (const close of ['Escape', 'backdrop'] as const) {
      await trigger.press('Enter');
      const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
      await expect(menu.locator('#menu-title')).toBeFocused();
      expect(await menu.evaluate(element => element.matches(':modal'))).toBe(true);
      if (mode === 'on') {
        await expect.poll(() => page.evaluate(() => window.dialogOpenProbe.motion.some(call => call.title === 'menu-title' && call.duration === 180))).toBe(true);
      } else {
        expect(await menu.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
      }
      if (close === 'Escape') await page.keyboard.press('Escape');
      else await page.mouse.click(1, 1);
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(await scrollPosition(page)).toEqual(menuScroll);
    }

    const game = libraryRecords[0];
    const link = page.locator(`.game-card[data-game="${game.id}"] .game-link`);
    await link.scrollIntoViewIfNeeded();
    await link.focus();
    const detailScroll = await scrollPosition(page);
    await link.press('Enter');
    const detail = page.getByRole('dialog', { name: game.title, exact: true });
    await expect(detail.locator('#game-title')).toBeFocused();
    expect(await detail.evaluate(element => element.matches(':modal'))).toBe(true);
    await detail.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(detail).toHaveCount(0);
    await expect(link).toBeFocused();
    expect(await scrollPosition(page)).toEqual(detailScroll);
    expect(await readLibrary(page)).toEqual(before);
  });

  test(`${mode}: nested completed confirmation retains the outer lock and focus`, async ({ page }) => {
    await seed(page, mode);
    const before = await readLibrary(page);
    const game = libraryRecords[1];
    const link = page.locator(`.game-card[data-game="${game.id}"] .game-link`);
    await link.scrollIntoViewIfNeeded();
    await link.focus();
    const originalScroll = await scrollPosition(page);
    const originalStyle = await page.evaluate(() => [document.body.style.overflow, document.body.style.paddingRight]);
    await link.press('Enter');
    const detail = page.getByRole('dialog', { name: game.title, exact: true });
    const played = detail.getByRole('checkbox', { name: `I have played it: ${game.title}`, exact: true });
    await expect(played).toBeChecked();
    await played.scrollIntoViewIfNeeded();
    await played.focus();
    const detailScroll = await detail.evaluate(element => element.scrollTop);
    await played.press('Space');
    const confirmation = page.getByRole('dialog', { name: `Mark ${game.title} not played?`, exact: true });
    await expect(confirmation.getByRole('button', { name: 'Keep completed', exact: true })).toBeFocused();
    await expect(page.locator('dialog[open]')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await expect(detail).toBeVisible();
    await expect(played).toBeFocused();
    expect(await detail.evaluate(element => element.scrollTop)).toBe(detailScroll);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    await expect(link).toBeFocused();
    expect(await page.evaluate(() => [document.body.style.overflow, document.body.style.paddingRight])).toEqual(originalStyle);
    expect(await scrollPosition(page)).toEqual(originalScroll);
    expect(await readLibrary(page)).toEqual(before);
  });
}

async function chromeBounds(page: Page, trayPresent = true) {
  return page.evaluate(trayPresent => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing geometry target: ${selector}`);
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return { header: rect('.site-header'), tray: trayPresent ? rect('.compare-tray-dock') : null, heading: rect('#collection-title') };
  }, trayPresent);
}

for (const length of ['short', 'long'] as const) {
  test(`1440px ${length} page keeps header, tray and heading stationary across native open`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await seed(page);
    const game = libraryRecords[0];
    await page.getByRole('button', { name: `Pin ${game.title} for comparison`, exact: true }).click();
    if (length === 'short') await page.goto('/?q=NoMatchGeometryFixture&catalogs=off');
    await expect(page.locator('.compare-tray-dock')).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const gap = await page.evaluate(() => innerWidth - document.documentElement.clientWidth);
    await info.attach('native-scrollbar-gap', { body: JSON.stringify({ length, gap }), contentType: 'application/json' });
    const before = await chromeBounds(page);
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await expect(page.locator('#menu-title')).toBeFocused();
    await expect(page.locator('.compare-tray-dock')).toHaveCount(0);
    expect(await chromeBounds(page, false)).toEqual({ ...before, tray: null });
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('.compare-tray-dock')).toBeVisible();
    expect(await chromeBounds(page)).toEqual(before);
    if (length === 'long') {
      const link = page.locator(`.game-card[data-game="${game.id}"] .game-link`);
      await link.scrollIntoViewIfNeeded();
      await link.focus();
      const detailBefore = await chromeBounds(page);
      await link.press('Enter');
      await expect(page.locator('#game-title')).toBeFocused();
      await expect(page.locator('.compare-tray-dock')).toHaveCount(0);
      expect(await chromeBounds(page, false)).toEqual({ ...detailBefore, tray: null });
      await page.keyboard.press('Escape');
      await expect(link).toBeFocused();
      await expect(page.locator('.compare-tray-dock')).toBeVisible();
      expect(await chromeBounds(page)).toEqual(detailBefore);
    }
  });
}

test('provider enrichment waits for a focused native detail and a frame, and cannot reopen it after close', async ({ page }) => {
  const record = libraryRecords.find(record => Boolean(enrichmentIdentity(record.id)));
  if (!record) throw new Error('The catalog fixture needs an eligible public enrichment record.');
  await seed(page);
  let release = () => {};
  let settled = () => {};
  const response = new Promise<void>(resolve => { release = resolve; });
  const handled = new Promise<void>(resolve => { settled = resolve; });
  await page.route('**/api/catalog-detail?**', async route => {
    await response;
    await route.fulfill({ status: 503, json: { error: 'Synthetic delayed public detail failure.' } });
    settled();
  });
  try {
    await page.goto(`/discover?${new URLSearchParams({ q: record.title.slice(0, 80), catalogs: 'on' })}`);
    const opener = page.locator(`[data-catalog-id="${record.id}"]`).getByRole('button', { name: record.title, exact: true });
    await opener.click();
    const detail = page.getByRole('dialog', { name: record.title, exact: true });
    await expect(detail.locator('#catalog-game-title')).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.dialogOpenProbe.enrichment.length)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.dialogOpenProbe.opens[0]?.length ?? 0)).toBe(3);
    expect(await page.evaluate(() => window.dialogOpenProbe.opens[0][0].loading)).toBe(true);
    expect(await page.evaluate(() => window.dialogOpenProbe.enrichment)).toEqual([{ modal: true, focused: true, afterFrame: true }]);
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    await expect(opener).toBeFocused();
    release();
    await handled;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  } finally { release(); }
});

function wikidataEnrichment(id: string) {
  const identity = enrichmentIdentity(id);
  if (identity?.source !== 'wikidata') throw new Error('The rating fixture requires an eligible Wikidata identity.');
  const data = enrichmentFixture();
  data.id = id;
  data.ratings = data.ratings.map(rating => ({
    ...rating, sourceUrl: `https://www.wikidata.org/wiki/${identity.sourceId}#P444`,
  }));
  return parseCatalogEnrichment(data, id);
}

test('warm provider art and ratings are present in the first three frames without moving actions', async ({ page }) => {
  const item = catalog.items.find(item => !item.artwork && enrichmentIdentity(item.record.id)?.source === 'wikidata');
  if (!item) throw new Error('Warm-cache coverage requires an eligible Wikidata provider without bundled art.');
  await seed(page, 'on');
  const data = wikidataEnrichment(item.record.id);
  const src = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Synthetic artwork requires a canvas context.');
    context.fillStyle = '#d3f36b';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp');
  });
  data.artwork = {
    kind: 'commons-raster', src, width: 160, height: 90, alt: 'Synthetic warm-cache artwork',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Fixture.webp',
    originalUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Fixture.webp',
    license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    credit: 'Synthetic test artwork', retrievedAt: data.fetchedAt,
  };
  data.sources = data.sources.map(source => source.source === 'commons'
    ? { source: 'commons', status: 'ready', code: null, message: 'Synthetic cached artwork.', retryAfter: 0 }
    : source);
  const response = parseCatalogEnrichment(data, item.record.id);
  let requests = 0;
  await page.route('**/api/catalog-detail?**', route => { requests += 1; return route.fulfill({ json: response }); });
  await page.goto(`/discover?${new URLSearchParams({ q: item.record.title.slice(0, 80), catalogs: 'on' })}`);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  await page.evaluate(() => document.fonts.ready);
  const opener = page.locator(`[data-catalog-id="${item.record.id}"]`).getByRole('button', { name: item.record.title, exact: true });
  const detail = page.getByRole('dialog', { name: item.record.title, exact: true });
  await opener.click();
  await expect(detail.locator('.catalog-review-list')).toContainText('83/100');
  await expect.poll(() => detail.locator('.catalog-detail-sleeve img').evaluate(image =>
    image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
  await expect(opener).toBeFocused();
  const priorMotion = await page.evaluate(() => window.dialogOpenProbe.motion.length);
  await opener.click();
  await expect(detail.locator('#catalog-game-title')).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.dialogOpenProbe.opens[1]?.length ?? 0)).toBe(3);
  const frames = await page.evaluate(() => window.dialogOpenProbe.opens[1]);
  expect(frames.every(frame => frame.image && frame.rating && !frame.unavailable && !frame.loading)).toBe(true);
  expect(frames[0].actions).not.toBeNull();
  expect(frames.map(frame => frame.actions)).toEqual([frames[0].actions, frames[0].actions, frames[0].actions]);
  // No-art source cards have no origin lease; the existing sleeve-only arrival still runs.
  await expect.poll(() => page.evaluate(start => window.dialogOpenProbe.motion.slice(start)
    .some(call => call.title === 'catalog-game-title' && call.phase === null && call.duration > 0), priorMotion)).toBe(true);
  expect(requests).toBe(1);
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});

test('a warm bundled-provider detail retains its real continuity flight', async ({ page }) => {
  const item = catalog.items.find(item => item.artwork && enrichmentIdentity(item.record.id)?.source === 'wikidata');
  if (!item) throw new Error('Continuity coverage requires an illustrated eligible Wikidata provider.');
  const data = wikidataEnrichment(item.record.id);
  await seed(page, 'on');
  await page.route('**/api/catalog-detail?**', route => route.fulfill({ json: data }));
  await page.goto(`/discover?${new URLSearchParams({ q: item.record.title.slice(0, 80), catalogs: 'on' })}`);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  const card = page.locator(`[data-catalog-id="${item.record.id}"]`);
  const opener = card.getByRole('button', { name: item.record.title, exact: true });
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => card.locator('.discovery-card-art img').evaluate(image =>
    image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
  const detail = page.getByRole('dialog', { name: item.record.title, exact: true });
  await opener.click();
  await expect(detail.locator('.catalog-review-list')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.locator('[data-motion-visual]')).toHaveCount(0);
  const priorMotion = await page.evaluate(() => window.dialogOpenProbe.motion.length);
  await opener.click();
  await expect(detail.locator('#catalog-game-title')).toBeFocused();
  await expect.poll(() => page.evaluate(start => window.dialogOpenProbe.motion.slice(start)
    .some(call => call.title === 'catalog-game-title' && call.phase === 'enter'), priorMotion)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});
