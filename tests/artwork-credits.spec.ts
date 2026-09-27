import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { parseDiscoveryCatalog } from '../src/lib/discovery-catalog';
import { readLibrary } from './library-helpers';

const catalog = parseDiscoveryCatalog(
  JSON.parse(readFileSync(new URL('../public/data/discovery/catalog.v1.json', import.meta.url), 'utf8')),
);
const item = catalog.items.find((candidate) => candidate.record.title === '0 A.D.');
if (!item?.artwork || !item.artwork.credit.startsWith('Original: Wildfire Games Vector: VulcanSphere')) {
  throw new Error('The shipped 0 A.D. artwork-credit fixture changed.');
}
const record = item.record;
const artwork = item.artwork;
const contributor = 'https://commons.wikimedia.org/wiki/User:VulcanSphere';
const originalSource = 'http://www.wildfiregames.com/forum/index.php?showtopic=17587&p=274506';
const conversion = 'Resized and converted to WebP; original license retained.';
const trademark = 'Trademark rights are not granted by the copyright license.';
const creditLinks = [
  ['VulcanSphere', contributor],
  ['www.wildfiregames.com', originalSource],
  ['Source image', artwork.sourceUrl],
  [artwork.license, artwork.licenseUrl],
] as const;

async function expectCredits(page: Page, disclosure: Locator) {
  const summary = disclosure.locator(':scope > summary');
  await expect(summary).toHaveAccessibleName(`Artwork credits for ${record.title}`);
  await summary.focus();
  await summary.press('Enter');
  const lines = disclosure.locator('.game-artwork-credit-lines');
  await expect(lines.locator('dt')).toHaveText([
    'Original art',
    'Vector',
    'Original source',
    'Conversion',
    'Trademark',
    'Image file',
    'Licence',
  ]);
  await expect(lines).toContainText('Wildfire Games');
  await expect(lines).toContainText('VulcanSphere');
  await expect(lines).toContainText('Own work based on:');
  await expect(lines).toContainText('0AD');
  await expect(lines).toContainText(conversion);
  await expect(lines).toContainText(trademark);
  for (const [name, href] of creditLinks) {
    const link = lines.getByRole('link', { name, exact: true });
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('href', href);
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAttribute('target', '_blank');
  }
  await expect(lines.locator('a')).toHaveCount(4);
  expect(await lines.innerText()).not.toContain('https://');
  expect(await lines.innerText()).not.toContain('http://');
  const raw = disclosure.locator('.game-artwork-credit-original');
  await expect(raw).not.toHaveAttribute('open');
  await raw.locator('summary').click();
  await expect(raw.locator('.game-artwork-credit-text')).toBeVisible();
  expect(await raw.locator('.game-artwork-credit-text').textContent()).toBe(artwork.credit);
  expect(
    await disclosure.evaluate((element) => ({
      contentFits: element.scrollWidth <= element.clientWidth + 1,
      pageFits: document.documentElement.scrollWidth <= innerWidth,
    })),
  ).toEqual({ contentFits: true, pageFits: true });
  await raw.locator('summary').click();
  expect(await page.locator('.game-artwork-credit-original[open]').count()).toBe(0);
}

test('0 A.D. credits are labelled, complete, linked and wrap-safe in detail, tray and My games', async ({
  page,
  context,
  baseURL,
  isMobile,
}, info) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
    throw new Error('Artwork-credit fixtures require the owned local preview.');
  }
  await page.setViewportSize({ width: isMobile ? 320 : 1920, height: isMobile ? 780 : 1080 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin) {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Credit destination fixture</title>',
      });
    }
    return url.pathname.startsWith('/api/') ? route.abort('blockedbyclient') : route.continue();
  });
  await page.goto('/discover?catalogs=off');
  const card = page.locator(`[data-catalog-id="${record.id}"]`);
  await card.getByRole('button', { name: record.title, exact: true }).click();
  const detail = page.getByRole('dialog', { name: record.title, exact: true });
  const detailCredits = detail.locator('.catalog-detail-art-credits .game-artwork-disclosure');
  await expectCredits(page, detailCredits);
  await info.attach('credit-presentation', {
    contentType: 'application/json',
    body: JSON.stringify({
      width: isMobile ? 320 : 1920,
      originalCredit: artwork.credit,
      labelledLines: await detailCredits.locator('.game-artwork-credit-lines').innerText(),
      sourceAndLicenseUnchanged: true,
    }),
  });
  for (const [name, href] of creditLinks) {
    const popupPromise = page.waitForEvent('popup');
    await detailCredits.getByRole('link', { name, exact: true }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(href);
    await expect(popup).toHaveTitle('Credit destination fixture');
    await popup.close();
  }
  await detail.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await card.getByRole('button', { name: `Add to My games: ${record.title}`, exact: true }).click();
  await expect.poll(async () => (await readLibrary(page)).records[record.id]).toEqual(record);
  const before = await readLibrary(page);
  await card.getByRole('button', { name: `Pin for comparison: ${record.title}`, exact: true }).click();
  await page.getByRole('button', { name: 'Open Compare tray, 1 game', exact: true }).click();
  const tray = page.getByRole('dialog', { name: 'Compare tray', exact: true });
  await expectCredits(page, tray.locator('.game-artwork-disclosure'));
  await tray.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.goto('/my-games?catalogs=off');
  const personal = page.locator(`.my-games-editor:visible [data-record-id="${record.id}"]`);
  await expectCredits(page, personal.locator('.game-artwork-disclosure'));
  expect(await readLibrary(page)).toEqual(before);
});
