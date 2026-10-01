import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { parseCollection } from '../src/lib/collection';
import { isRecord } from '../src/lib/guards';
import { installGuestLibrary, libraryFixture } from './library-pagination-helpers';

const game = parseCollection(JSON.parse(readFileSync(new URL('../data/collection.json', import.meta.url), 'utf8')))
  .games[0]!;

declare global {
  interface Window {
    detailFocusEvents: string[];
  }
}

async function activateWithoutFocus(page: Page, target: Locator) {
  await page.evaluate(() => document.fonts.ready);
  await target.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
  // Scrolling to the footer first lays out skipped cards and anchors the viewport.
  // Compare the dialog with the settled click position, not that earlier estimate.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const before = [scrollX, scrollY, document.documentElement.scrollHeight];
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return [scrollX, scrollY, document.documentElement.scrollHeight].every(
          (value, index) => value === before[index],
        );
      }),
    )
    .toBe(true);
  return target.evaluate((element: HTMLElement) => {
    const before = { x: scrollX, y: scrollY };
    element.click();
    return before;
  });
}

test.beforeEach(async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!);
  expect(['127.0.0.1', 'localhost']).toContain(origin.hostname);
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin.origin) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({ status: 503, json: { error: 'Offline test source.' } });
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.detailFocusEvents = [];
    document.addEventListener('focusin', (event) => {
      if (event.target instanceof HTMLElement && event.target.closest('.game-dialog'))
        window.detailFocusEvents.push(event.target.id || event.target.className);
    });
  });
});

for (const view of ['grid', 'list', 'table']) {
  test(`browse-mode ${view} activation returns to its actual link without extra scrolling`, async ({ page }) => {
    await page.goto(`/?catalogs=off&view=${view}`);
    const opener = page.locator(
      view === 'table' ? `[data-game="${game.slug}"] .table-game a` : `[data-game="${game.slug}"] .game-link`,
    );
    await expect(opener).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const scroll = await activateWithoutFocus(page, opener);
    const dialog = page.getByRole('dialog', { name: game.title, exact: true });
    await expect(dialog.locator('#game-title')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(scroll);
  });
}

test('game detail has one native initial focus and no body-text accessible description', async ({ page }) => {
  await page.goto('/?catalogs=off');
  const opener = page.locator(`[data-game="${game.slug}"] .game-link`);
  await activateWithoutFocus(page, opener);
  const dialog = page.getByRole('dialog', { name: game.title, exact: true });
  await expect(dialog.locator('#game-title')).toBeFocused();
  expect(await page.evaluate(() => window.detailFocusEvents)).toEqual(['game-title']);
  await expect(dialog).toHaveAccessibleDescription('');
  await expect(dialog.locator('.rationale')).toHaveCount(1);
  await expect(dialog.locator('.rationale')).toHaveText(game.rationale);
  const client = await page.context().newCDPSession(page);
  try {
    const tree: unknown = await client.send('Accessibility.getFullAXTree');
    if (!isRecord(tree) || !Array.isArray(tree.nodes)) throw new Error('Missing accessibility tree.');
    const nodes: unknown[] = tree.nodes;
    const found = nodes
      .filter(isRecord)
      .find(
        (node) =>
          isRecord(node.role) && node.role.value === 'dialog' && isRecord(node.name) && node.name.value === game.title,
      );
    if (!found) throw new Error('The named game dialog is absent from the accessibility tree.');
    const description = isRecord(found.description) ? found.description.value : '';
    expect(description).toBe('');
    const sentences = await dialog.locator('p').allTextContents();
    expect(sentences.map((text) => text.trim())).toContain(game.rationale);
    for (const text of sentences.filter((value) => value.trim())) expect(description).not.toContain(text.trim());
  } finally {
    await client.detach();
  }
});

test('a directly linked game returns to its rendered card when no activation exists', async ({ page }) => {
  await page.goto(`/?catalogs=off&game=${game.slug}`);
  const dialog = page.getByRole('dialog', { name: game.title, exact: true });
  await expect(dialog.locator('#game-title')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(`[data-game="${game.slug}"] .game-link`)).toBeFocused();
});

for (const surface of ['Discover', 'Library']) {
  test(`browse-mode ${surface} preview returns to the actual opening button`, async ({ page }) => {
    let opener: Locator;
    if (surface === 'Discover') {
      await page.goto('/discover?catalogs=off&q=Kingdomcome');
      opener = page.locator('[data-catalog-id="wikidata:Q15408545"] h3 button');
    } else {
      await installGuestLibrary(page, libraryFixture(3));
      opener = page.locator(`[data-record-id="${game.slug}"] .record-title`).first();
    }
    const scroll = await activateWithoutFocus(page, opener);
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toHaveCount(1);
    await expect(dialog.locator('[data-autofocus]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(scroll);
  });
}

for (const destination of ['Menu', 'Settings', 'About']) {
  test(`browse-mode ${destination} opening restores the initiating control`, async ({ page }) => {
    await page.goto('/?catalogs=off');
    const opener =
      destination === 'Menu'
        ? page.getByRole('button', { name: 'Menu', exact: true })
        : page.locator('.site-footer').getByRole('button', {
            name: destination === 'About' ? 'About & credits' : /^Effects:/,
          });
    const scroll = await activateWithoutFocus(page, opener);
    const dialog = page.getByRole('dialog', {
      name: destination === 'Menu' ? 'Menu' : destination === 'About' ? 'About & credits' : 'Settings & backups',
      exact: true,
    });
    await expect(dialog.locator('[data-autofocus]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(scroll);
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(scroll);
  });
}

test('footer return keeps exact scroll with unremembered skipped-card height estimates', async ({ page }) => {
  await page.goto('/?catalogs=off');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await page.evaluate(() => {
    const card = document.querySelector('.games-grid > .game-card:nth-child(5)');
    if (!card) throw new Error('Expected a contained collection card.');
    const estimate = getComputedStyle(card).containIntrinsicBlockSize.replace(/^auto\s+/, '');
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`.games-grid > .game-card:nth-child(n + 5) { contain-intrinsic-block-size: ${estimate}; }`);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
  for (const destination of ['Settings', 'About']) {
    const opener = page.locator('.site-footer').getByRole('button', {
      name: destination === 'About' ? 'About & credits' : /^Effects:/,
    });
    const scroll = await activateWithoutFocus(page, opener);
    const dialog = page.getByRole('dialog', {
      name: destination === 'About' ? 'About & credits' : 'Settings & backups',
      exact: true,
    });
    await expect(dialog.locator('[data-autofocus]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(scroll);
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(scroll);
  }
});

for (const destination of ['Settings & backups', 'About & credits']) {
  test(`browse-mode Menu to ${destination} retains the original Menu opener`, async ({ page }) => {
    await page.goto('/?catalogs=off');
    const opener = page.getByRole('button', { name: 'Menu', exact: true });
    const scroll = await activateWithoutFocus(page, opener);
    const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
    await expect(menu.locator('#menu-title')).toBeFocused();
    await menu
      .getByRole('button', { name: destination, exact: true })
      .evaluate((element: HTMLElement) => element.click());
    const dialog = page.getByRole('dialog', { name: destination, exact: true });
    await expect(dialog.locator('[data-autofocus]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(scroll);
  });
}
