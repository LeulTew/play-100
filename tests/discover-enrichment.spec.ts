import { expect, test } from '@playwright/test';
import { catalogFixture, enrichmentFixture } from '../src/lib/discovery-test-fixtures';
import { readLibrary } from './library-helpers';
import { openBrowsingFilters } from './browsing-helpers';

const id = 'wikidata:Q15408545';
const title = 'Kingdom Come: Deliverance';
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/catalog?**', (route) => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: {
        source: params.get('source'),
        query: params.get('q') ?? '',
        offset: Number(params.get('offset') ?? 0),
        items: [],
        total: 0,
        nextOffset: null,
        notices: [],
      },
    });
  });
});

test('outside100 is the default and canonical alias recovery never requests enrichment', async ({ page }) => {
  const lookups: string[] = [];
  await page.route('**/api/catalog-detail?**', (route) => {
    lookups.push(route.request().url());
    return route.fulfill({ json: enrichmentFixture() });
  });
  await page.goto('/discover?q=RDR2&genreFamily=action-adventure&campaign=retained');
  const canonical = page.locator('[data-canonical-id="red-dead-redemption-2"]');
  await expect(canonical).toBeVisible();
  await expect(page.locator('[data-catalog-id="red-dead-redemption-2"]')).toHaveCount(0);
  await canonical.click();
  await expect(page.locator('.game-dialog')).toBeVisible();
  await expect(page.locator('.game-dialog .author-rating-detail')).toContainText("Leul's original rating");
  expect(new URL(page.url()).searchParams.get('genreFamily')).toBe('action-adventure');
  expect(new URL(page.url()).searchParams.get('campaign')).toBe('retained');
  await page.keyboard.press('Escape');
  await openBrowsingFilters(page);
  await page.getByRole('checkbox', { name: 'Include The 100', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Include The 100', exact: true })).toBeChecked();
  await expect(page.locator('[data-catalog-id="red-dead-redemption-2"]')).toHaveCount(1);
  await expect(canonical).toHaveCount(0);
  expect(lookups).toEqual([]);
});

test('an unknown edition is not title-merged with The100', async ({ page }) => {
  await page.unroute('**/api/catalog?**');
  await page.route('**/api/catalog?**', (route) =>
    route.fulfill({
      json: {
        source: 'wikidata',
        query: 'RDR2',
        offset: 0,
        total: 2,
        nextOffset: null,
        notices: [],
        items: [
          {
            id: 'wikidata:Q27438121',
            source: 'wikidata',
            sourceId: 'Q27438121',
            title: 'RDR2',
            year: 2018,
            studio: null,
            genre: null,
            sourceUrl: 'https://www.wikidata.org/wiki/Q27438121',
            collectionRank: null,
          },
          {
            id: 'wikidata:Q90000001',
            source: 'wikidata',
            sourceId: 'Q90000001',
            title: 'RDR2',
            year: 2025,
            studio: null,
            genre: 'RPG',
            sourceUrl: 'https://www.wikidata.org/wiki/Q90000001',
            collectionRank: null,
          },
        ],
      },
    }),
  );
  await page.goto('/discover?q=RDR2&online=on&source=wikidata');
  await expect(page.locator('[data-catalog-id="wikidata:Q90000001"]')).toBeVisible();
  await expect(page.locator('[data-catalog-id="wikidata:Q27438121"]')).toHaveCount(0);
  await expect(page.locator('[data-catalog-id="red-dead-redemption-2"]')).toHaveCount(0);
  await expect(page.locator('[data-canonical-id="red-dead-redemption-2"]')).toHaveCount(1);
});

test('detail opens before enrichment, keeps source scales separate and does not write private opinions', async ({
  page,
}) => {
  let release = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requests: URL[] = [];
  await page.route('**/api/catalog-detail?**', async (route) => {
    requests.push(new URL(route.request().url()));
    await waiting;
    await route.fulfill({ json: enrichmentFixture() });
  });
  await page.goto('/discover?q=Kingdomcome');
  const card = page.locator(`[data-catalog-id="${id}"]`);
  await expect(card).toBeVisible();
  const before = await readLibrary(page);
  await card.getByRole('button', { name: title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeFocused();
  await expect(dialog.getByRole('spinbutton', { name: `Your rating / 10 for ${title}`, exact: true })).toBeEnabled();
  await expect(dialog).toContainText('Loading public ratings');
  release();
  await expect(dialog.locator('.catalog-review-list')).toContainText('83/100');
  await expect(dialog.locator('.catalog-review-list')).toContainText('Example publication');
  await expect(dialog.locator('.catalog-review-list')).toContainText('via Wikidata');
  const details = dialog.locator('.catalog-review-details').first();
  const summary = details.locator('summary');
  await expect(summary).toHaveText('Source details for Example publication');
  await expect(details).not.toHaveAttribute('open');
  await expect(details.getByRole('link')).toHaveCount(0);
  await dialog.getByRole('spinbutton').focus();
  await page.keyboard.press('Tab');
  await expect(summary).toBeFocused();
  await summary.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(details).toContainText('PC · Critic average');
  await expect(details.locator('time[datetime="2024-04-20"]')).toBeVisible();
  await expect(details.locator('time[datetime="2024-04-21"]')).toBeVisible();
  await expect(details.locator('time[datetime="2026-09-22T12:00:00.000Z"]')).toBeVisible();
  await expect(details.getByRole('link', { name: 'View Wikidata score claims', exact: true })).toHaveAttribute(
    'href',
    'https://www.wikidata.org/wiki/Q15408545#P444',
  );
  await expect(details.getByRole('link', { name: 'Cited source', exact: true })).toHaveAttribute(
    'href',
    'https://example.com/reviews/game',
  );
  await expect(dialog.getByRole('spinbutton')).toHaveValue('');
  expect(await readLibrary(page)).toEqual(before);
  expect(requests.length).toBeGreaterThan(0);
  for (const url of requests) {
    expect([...url.searchParams.keys()]).toEqual(['id']);
    expect(url.searchParams.get('id')).toBe(id);
  }
});

test('online optout makes no detail request until the explicit enable action', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/catalog-detail?**', (route) => {
    requests.push(route.request().url());
    return route.fulfill({ json: enrichmentFixture() });
  });
  await page.goto('/discover?q=Kingdomcome&catalogs=off&genreFamily=role-playing');
  await page.locator(`[data-catalog-id="${id}"]`).getByRole('button', { name: title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog).toContainText('Online lookup is off.');
  expect(requests).toEqual([]);
  await dialog.getByRole('button', { name: 'Enable online details', exact: true }).click();
  await expect(dialog.locator('.catalog-review-list')).toContainText('83/100');
  expect(new URL(page.url()).searchParams.get('genreFamily')).toBe('role-playing');
  expect(requests.length).toBeGreaterThan(0);
});

test('personal catalog actions precede a long external rating list at 393px', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 });
  const data = enrichmentFixture();
  const rating = data.ratings[0];
  if (!rating) throw new Error('The enrichment fixture needs a source rating.');
  data.ratings = Array.from({ length: 12 }, (_, index) => ({
    ...rating,
    id: `${rating.id}-${index}`,
    publisher: `Fixture publication ${index + 1}`,
  }));
  await page.route('**/api/catalog-detail?**', (route) => route.fulfill({ json: data }));
  await page.goto('/discover?q=Kingdomcome');
  await page.locator(`[data-catalog-id="${id}"]`).getByRole('button', { name: title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog.locator('.catalog-review-list > li')).toHaveCount(12);
  await expect(dialog.getByRole('button', { name: 'Play later', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Completed', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Add to my ranking', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('spinbutton')).toBeEnabled();
  const order = await dialog.evaluate((element) => {
    const firstRating = element.querySelector('.catalog-review-list > li');
    const personal = [...element.querySelectorAll('.detail-actions, .personal-detail-actions, .catalog-detail-rating')];
    if (!firstRating || personal.length !== 3)
      throw new Error('Both personal controls and external ratings must render.');
    return personal.map((controls) => ({
      bottom: controls.getBoundingClientRect().bottom,
      ratingTop: firstRating.getBoundingClientRect().top,
      precedes: Boolean(controls.compareDocumentPosition(firstRating) & Node.DOCUMENT_POSITION_FOLLOWING),
    }));
  });
  for (const controls of order) {
    expect(controls.precedes).toBe(true);
    expect(controls.bottom).toBeLessThanOrEqual(controls.ratingTop);
  }
});

test('a late response cannot reopen a closed detail or attach ratings to a new game', async ({ page }) => {
  let release = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/catalog-detail?**', async (route) => {
    await waiting;
    await route.fulfill({ json: enrichmentFixture() });
  });
  await page.goto('/discover?q=Kingdomcome');
  await page.locator(`[data-catalog-id="${id}"]`).getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Loading public ratings');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  release();
  await page.getByRole('searchbox', { name: 'Find a game', exact: true }).fill('RDR2');
  await page.locator('[data-canonical-id="red-dead-redemption-2"]').click();
  await expect(page.locator('.game-dialog')).toBeVisible();
  await expect(page.locator('.game-dialog')).not.toContainText('Example publication');
  await expect(page.locator('.game-dialog .catalog-review-list')).toHaveCount(0);
});

test('a per-source failure stays visible while successful scores remain usable', async ({ page }) => {
  const fixture = enrichmentFixture();
  fixture.sources[1] = {
    source: 'steam',
    status: 'error',
    code: 'rate-limited',
    message: 'Steam is rate-limiting public summaries.',
    retryAfter: 30,
  };
  await page.route('**/api/catalog-detail?**', (route) => route.fulfill({ json: fixture }));
  await page.goto('/discover?q=Kingdomcome');
  await page.locator(`[data-catalog-id="${id}"]`).getByRole('button', { name: title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await expect(dialog.locator('.catalog-review-list')).toContainText('83/100');
  await expect(dialog.getByRole('alert')).toContainText('Steam is rate-limiting');
  await expect(dialog.getByRole('button', { name: 'Play later', exact: true })).toBeEnabled();
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
});

for (const width of [320, 393]) {
  test(`catalog detail wraps whole action buttons before and after saving at ${width}px`, async ({
    page,
    baseURL,
  }, info) => {
    if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
      throw new Error('Catalog action fixtures require the owned local preview.');
    }
    await page.setViewportSize({ width, height: 851 });
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      return url.origin !== new URL(baseURL).origin || url.pathname.startsWith('/api/')
        ? route.abort('blockedbyclient')
        : route.continue();
    });
    await page.route('**/data/discovery/catalog.v1.json', (route) => route.fulfill({ json: catalogFixture }));
    await page.goto('/discover?q=Kingdomcome&catalogs=off');
    await page.locator(`[data-catalog-id="${id}"]`).getByRole('button', { name: title, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    for (const saved of [false, true]) {
      if (saved) {
        await dialog.getByRole('button', { name: `Add to My games: ${title}`, exact: true }).click();
        await expect.poll(async () => (await readLibrary(page)).records[id]).toEqual(catalogFixture.items[0]!.record);
        await page.reload();
      }
      const save = dialog.getByRole('button', {
        name: `${saved ? 'In My games' : 'Add to My games'}: ${title}`,
        exact: true,
      });
      if (saved) await expect(save).toBeDisabled();
      else await expect(save).toBeEnabled();
      const actions = dialog.locator('.detail-actions');
      await expect(actions.locator(':scope > .button')).toHaveCount(3);
      await actions.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);
      const geometry = await actions.evaluate((element) => ({
        overflow: element.scrollWidth > element.clientWidth,
        dialogOverflow: element.closest('dialog')!.scrollWidth > element.closest('dialog')!.clientWidth,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        buttons: [...element.querySelectorAll<HTMLButtonElement>(':scope > .button')].map((button) => {
          const box = button.getBoundingClientRect();
          const words: { word: string; lines: number; inside: boolean }[] = [];
          const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            for (const word of (walker.currentNode.textContent ?? '').matchAll(/\S+/g)) {
              const range = document.createRange();
              range.setStart(walker.currentNode, word.index);
              range.setEnd(walker.currentNode, word.index + word[0].length);
              const fragments = [...range.getClientRects()].filter((rect) => rect.width > 0);
              words.push({
                word: word[0],
                lines: new Set(fragments.map((rect) => Math.round(rect.top))).size,
                inside: fragments.every((rect) => rect.left >= box.left && rect.right <= box.right),
              });
            }
          }
          return {
            text: button.textContent?.trim(),
            width: box.width,
            height: box.height,
            fontSize: parseFloat(getComputedStyle(button).fontSize),
            words,
          };
        }),
      }));
      expect(geometry).toMatchObject({ overflow: false, dialogOverflow: false, pageOverflow: false });
      expect(geometry.buttons.map((button) => button.text)).toEqual([
        saved ? 'In My games' : 'Add to My games',
        'Play later',
        'Completed',
      ]);
      for (const button of geometry.buttons) {
        expect(button.width).toBeGreaterThanOrEqual(44);
        expect(button.height).toBeGreaterThanOrEqual(44);
        expect(button.fontSize).toBeGreaterThanOrEqual(12);
        expect(button.words.length).toBeGreaterThan(0);
        for (const word of button.words) {
          expect(word.lines, `${button.text}: ${word.word} must not break inside the word`).toBe(1);
          expect(word.inside).toBe(true);
        }
      }
      await info.attach(`catalog-actions-${saved ? 'saved' : 'unsaved'}`, {
        contentType: 'application/json',
        body: JSON.stringify({ viewport: page.viewportSize(), saved, ...geometry }),
      });
    }
  });
}

test('long external scores stay compact and retain source precision', async ({ page, baseURL, isMobile }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
    throw new Error('External score fixtures require the owned local preview.');
  }
  await page.setViewportSize({ width: isMobile ? 393 : 1440, height: 851 });
  const data = enrichmentFixture();
  const rating = data.ratings[0]!;
  data.ratings = [
    {
      ...rating,
      publisher: 'Google Play',
      score: { text: '4.44728422164917/5', value: 4.44728422164917, scale: 5, unit: 'points' },
    },
    {
      ...rating,
      id: 'wikidata:claim-two',
      publisher: 'Ten-point source',
      score: { text: '8.9/10', value: 8.9, scale: 10, unit: 'points' },
    },
    {
      ...rating,
      id: 'wikidata:claim-three',
      publisher: 'Percentage source',
      score: { text: '98.123456789%', value: 98.123456789, scale: 100, unit: 'percent' },
    },
  ];
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin !== new URL(baseURL).origin || url.pathname.startsWith('/api/')
      ? route.abort('blockedbyclient')
      : route.continue();
  });
  await page.route('**/data/discovery/catalog.v1.json', (route) => route.fulfill({ json: catalogFixture }));
  await page.route('**/api/catalog-detail?**', (route) => route.fulfill({ json: data }));
  await page.goto('/discover?q=Kingdomcome&catalogs=off');
  await expect(page.locator(`[data-catalog-id="${id}"]`)).toBeVisible();
  const before = await readLibrary(page);
  await page.locator(`[data-catalog-id="${id}"]`).getByRole('button', { name: title, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: title, exact: true });
  await dialog.getByRole('button', { name: 'Enable online details', exact: true }).click();
  const scores = dialog.locator('.catalog-review-heading > strong');
  await expect(scores).toHaveText(['≈4.45/5', '8.9/10', '98.123456789%']);
  await scores.first().scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  const geometry = await scores.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      const row = element.closest('li')!.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const fragments = [...range.getClientRects()].filter((rect) => rect.width > 0);
      return {
        text: element.textContent,
        lines: new Set(fragments.map((rect) => rect.top)).size,
        inside: box.left >= row.left && box.right <= row.right,
        fontSize: parseFloat(getComputedStyle(element).fontSize),
      };
    }),
  );
  for (const score of geometry) {
    expect(score.lines, `${score.text} must stay on one line`).toBe(1);
    expect(score.inside).toBe(true);
    expect(score.fontSize).toBe(20);
  }
  const google = dialog
    .locator('.catalog-review-list > li')
    .filter({ has: page.getByRole('heading', { name: 'Google Play', exact: true }) });
  await google.getByText('Source details for Google Play', { exact: true }).click();
  await expect(google.locator('.catalog-review-details')).toContainText('Original score: 4.44728422164917/5');
  await expect(google.getByRole('link', { name: 'View Wikidata score claims', exact: true })).toHaveAttribute(
    'href',
    rating.sourceUrl,
  );
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(dialog.getByRole('spinbutton', { name: `Your rating / 10 for ${title}`, exact: true })).toHaveValue('');
  expect(await readLibrary(page)).toEqual(before);
});
