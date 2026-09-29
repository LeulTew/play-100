import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseCollection } from '../src/lib/collection';
import { installGuestLibrary, libraryFixture } from './library-pagination-helpers';
import { readLibrary } from './library-helpers';
import { catalogRecord, respondWithCatalog } from './catalog-helpers';
import { COLLECTION_IDENTITIES } from '../src/lib/collection-identities';

const games = parseCollection(
  JSON.parse(readFileSync(new URL('../data/collection.json', import.meta.url), 'utf8')),
).games;

async function expectPosition(dialog: Locator, slug: string, current: number, total: number) {
  const game = games.find((entry) => entry.slug === slug);
  if (!game) throw new Error(`Unknown canonical fixture: ${slug}`);
  await expect(dialog.locator('#game-title')).toHaveText(game.title);
  await expect(dialog.locator('#game-title')).toBeFocused();
  await expect(dialog.locator('.detail-pagination > span')).toHaveText(`${current} of ${total}`);
  await expect(dialog.locator('.detail-place')).toContainText(
    `#${String(game.rank).padStart(2, '0')} in the collection`,
  );
}

test.beforeEach(async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!);
  expect(['127.0.0.1', 'localhost']).toContain(origin.hostname);
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin.origin) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({ status: 503, json: { error: 'Synthetic offline provider.' } });
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('filtered neighbors follow the displayed results and preserve Back, Forward and query state', async ({ page }) => {
  await page.goto('/?genre=Action-Adventure&catalogs=off&campaign=retained');
  const cards = page.locator('.game-card[data-game]');
  await expect(cards).toHaveCount(10);
  const order = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-game')!));
  const index = order.indexOf('god-of-war');
  expect(index).toBe(0);
  await page.locator('.game-card[data-game="god-of-war"] .game-link').click();
  const dialog = page.locator('.game-dialog[open]');
  await expectPosition(dialog, order[index]!, index + 1, order.length);
  const historyLength = await page.evaluate(() => history.length);
  for (const next of [index + 1, index + 2]) {
    await dialog.getByRole('button', { name: 'Next game', exact: true }).click();
    await expectPosition(dialog, order[next]!, next + 1, order.length);
    const url = new URL(page.url());
    expect(url.searchParams.get('genre')).toBe('Action-Adventure');
    expect(url.searchParams.get('catalogs')).toBe('off');
    expect(url.searchParams.get('campaign')).toBe('retained');
    expect(url.searchParams.get('game')).toBe(order[next]);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
  }
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(cards).toHaveCount(10);
  await page.goForward();
  await expectPosition(dialog, order[index + 2]!, index + 3, order.length);
  await dialog.getByRole('button', { name: 'Previous game', exact: true }).click();
  await expectPosition(dialog, order[index + 1]!, index + 2, order.length);
  await page.reload();
  await expectPosition(dialog, order[index + 1]!, index + 2, order.length);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('game')).toBe(false);
});

for (const query of ['sort=newest', 'sort=title&direction=desc', 'sort=metacritic&direction=asc&view=table']) {
  test(`detail traversal keeps the displayed sort ${query}`, async ({ page }) => {
    await page.goto(`/?catalogs=off&${query}`);
    const rows = page.locator(query.includes('view=table') ? 'tr[data-game]' : '.game-card[data-game]');
    await expect(rows).toHaveCount(24);
    const order = await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-game')!));
    await rows
      .first()
      .locator(query.includes('view=table') ? '.table-game a' : '.game-link')
      .click();
    const dialog = page.locator('.game-dialog[open]');
    await expectPosition(dialog, order[0]!, 1, 100);
    await expect(dialog.getByRole('button', { name: 'Previous game', exact: true })).toBeDisabled();
    for (const index of [1, 2]) {
      await dialog.getByRole('button', { name: 'Next game', exact: true }).click();
      await expectPosition(dialog, order[index]!, index + 1, 100);
    }
    await dialog.getByRole('button', { name: 'Previous game', exact: true }).click();
    await expectPosition(dialog, order[1]!, 2, 100);
    for (const [key, value] of new URLSearchParams(query))
      expect(new URL(page.url()).searchParams.get(key)).toBe(value);
  });
}

test('direct links outside a filtered list stay open without inventing a next result', async ({ page }) => {
  for (const query of ['q=no-matching-game', 'genre=Action-Adventure&year=1990&tier=essential']) {
    await page.goto(`/?catalogs=off&${query}&game=god-of-war`);
    const dialog = page.locator('.game-dialog[open]');
    await expect(dialog.locator('#game-title')).toHaveText('God of War');
    await expect(dialog.locator('.detail-pagination > span')).toHaveText('Not in these results');
    await expect(dialog.getByRole('button', { name: 'Previous game', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Next game', exact: true })).toBeDisabled();
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    for (const [key, value] of new URLSearchParams(query))
      expect(new URL(page.url()).searchParams.get(key)).toBe(value);
  }
});

test('a singleton has no neighbors and aliases match the same local cards without provider requests', async ({
  page,
}) => {
  await page.goto('/?catalogs=off&q=God+of+War&year=2018&game=god-of-war');
  const dialog = page.locator('.game-dialog[open]');
  await expectPosition(dialog, 'god-of-war', 1, 1);
  for (const name of ['Previous game', 'Next game'])
    await expect(dialog.getByRole('button', { name, exact: true })).toBeDisabled();
  await page.goto('/?catalogs=off&q=gta');
  const cards = page.locator('.game-card[data-game]');
  await expect(cards).toHaveCount(4);
  const order = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-game')!));
  const providers: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) providers.push(request.url());
  });
  await cards.first().locator('.game-link').click();
  await expectPosition(dialog, order[0]!, 1, order.length);
  await dialog.getByRole('button', { name: 'Next game', exact: true }).click();
  await expectPosition(dialog, order[1]!, 2, order.length);
  expect(providers).toEqual([]);
});

test('private progress restrictions and changed membership never fall back to unfiltered ranks', async ({ page }) => {
  await installGuestLibrary(page, libraryFixture(3));
  await page.goto('/?catalogs=off&list=later&sort=title');
  const cards = page.locator('.game-card[data-game]');
  await expect(cards).toHaveCount(3);
  const order = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-game')!));
  await cards.first().locator('.game-link').click();
  const dialog = page.locator('.game-dialog[open]');
  await expectPosition(dialog, order[0]!, 1, 3);
  await dialog.getByRole('button', { name: 'Next game', exact: true }).click();
  await expectPosition(dialog, order[1]!, 2, 3);
  await dialog.getByRole('button', { name: 'Play later', exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).queueOrder.length).toBe(2);
  await expect(dialog.locator('.detail-pagination > span')).toHaveText('Not in these results');
  for (const name of ['Previous game', 'Next game'])
    await expect(dialog.getByRole('button', { name, exact: true })).toBeDisabled();
});

test('remote-only canonical aliases share the displayed results without launching another lookup', async ({ page }) => {
  const matches = ['god-of-war', 'batman-arkham-city'].map((slug) => {
    const identity = COLLECTION_IDENTITIES.find(([canonical]) => canonical === slug);
    if (!identity) throw new Error(`Missing canonical provider fixture: ${slug}`);
    return catalogRecord('wikidata', identity[1], `RemoteOnlyAlias ${slug}`);
  });
  let requests = 0;
  await page.route('**/api/catalog?**', (route) => {
    requests += 1;
    return respondWithCatalog(
      route,
      new URL(route.request().url()).searchParams.get('source') === 'wikidata' ? matches : [],
    );
  });
  await page.goto('/?q=RemoteOnlyAlias');
  const cards = page.locator('.game-card[data-game]');
  await expect(cards).toHaveCount(2);
  const before = requests;
  await cards.first().locator('.game-link').click();
  const dialog = page.locator('.game-dialog[open]');
  await expectPosition(dialog, 'god-of-war', 1, 2);
  await dialog.getByRole('button', { name: 'Next game', exact: true }).click();
  await expectPosition(dialog, 'batman-arkham-city', 2, 2);
  await expect(dialog.getByRole('button', { name: 'Next game', exact: true })).toBeDisabled();
  expect(requests).toBe(before);
});

test('filtered Next blocks an invalid draft and commits a valid rating to its original game', async ({ page }) => {
  await page.goto('/?catalogs=off&genre=Action-Adventure&game=god-of-war');
  const dialog = page.locator('.game-dialog[open]');
  const input = dialog.getByRole('spinbutton');
  const next = dialog.getByRole('button', { name: 'Next game', exact: true });
  await input.fill('11');
  await input.press('Tab');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await next.click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('11');
  expect(new URL(page.url()).searchParams.get('game')).toBe('god-of-war');
  const before = await readLibrary(page);
  await page.clock.install({ time: new Date('2026-09-29T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-29T12:00:10Z'));
  await input.fill('7.25');
  await next.click();
  await expect(dialog.locator('.detail-pagination > span')).toHaveText('2 of 10');
  expect(new URL(page.url()).searchParams.get('genre')).toBe('Action-Adventure');
  await expect
    .poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === 'god-of-war')?.score)
    .toBe(7.25);
  expect((await readLibrary(page)).revision).toBe(before.revision + 1);
  await expect(dialog.getByRole('spinbutton')).toHaveValue('');
});

test('the source rating is rounded in plain language without changing the personal rating', async ({ page }) => {
  const game = games.find((entry) => entry.authorRating?.value.toFixed(2) === '7.39');
  if (!game) throw new Error('Missing repeating-decimal workbook rating fixture.');
  await page.goto(`/?catalogs=off&game=${game.slug}`);
  const dialog = page.locator('.game-dialog[open]');
  await expect(dialog.locator('.catalog-detail-rating')).toContainText(
    "Your rating ranks this game; it doesn't mark it played.",
  );
  await dialog.getByText('Score sources & method', { exact: true }).click();
  await expect(dialog.locator('.methodology-details')).toContainText(
    'Original workbook rating: 7.39, shown as 7.4 / 10.',
  );
  await expect(dialog.locator('.methodology-details')).not.toContainText('7.3939393939393945');
  await expect(dialog.locator('.author-rating-detail [title]')).toHaveAttribute(
    'title',
    'Original workbook rating: 7.39',
  );
  await expect(dialog.getByRole('spinbutton')).toHaveValue('');
});
