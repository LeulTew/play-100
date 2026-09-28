import { expect, test } from '@playwright/test';
import { catalogFixture, discoveryFixture } from '../src/lib/discovery-test-fixtures';
import { catalogRecord, emptyCatalogs } from './catalog-helpers';
import { closeDialog } from './readability-helpers';

const items = [
  { title: 'A short title', genre: 'Puzzle' },
  {
    title: 'B longer title: an expedition across the many islands of a distant world',
    genre:
      'action-adventure game / role-playing video game / historical video game / open-world action RPG / first-person shooter / platformer',
  },
  { title: 'C another game', genre: 'real-time strategy / historical video game' },
  {
    title: 'D final layout fixture',
    genre: 'social deduction video game / party video game / science fiction video game',
  },
].map(({ title, genre }, index) => ({
  ...discoveryFixture,
  record: { ...catalogRecord('wikidata', `Q9100000${index + 1}`, title), genre },
  aliases: [],
}));

for (const width of [320, 393, 768, 1024, 1440, 1920]) {
  test(`Discover Pin and Pinned keep the same action rows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await emptyCatalogs(page);
    await page.route('**/data/discovery/catalog.v1.json', (route) =>
      route.fulfill({ json: { ...catalogFixture, items } }),
    );
    await page.goto('/discover?catalogs=off');
    const cards = page.locator('.discovery-cards-grid > .discovery-card');
    await expect(cards).toHaveCount(items.length);
    await page.evaluate(() => document.fonts.ready);
    const card = cards.first();
    const pin = card.getByRole('button', { name: `Pin for comparison: ${items[0]!.record.title}`, exact: true });
    const pinned = card.getByRole('button', { name: `Pinned for comparison: ${items[0]!.record.title}`, exact: true });
    const geometry = () =>
      cards.evaluateAll((elements) =>
        elements.map((element) => {
          const primary = element.querySelector('.discovery-card-primary')!;
          const targets = [
            element,
            ...primary.querySelectorAll('.button, [data-compare-drag-grip]'),
            element.querySelector('.discovery-card-details > summary')!,
          ];
          return targets
            .filter((target) => target.getClientRects().length > 0)
            .map((target) => {
              const bounds = target.getBoundingClientRect();
              return {
                x: bounds.x + scrollX,
                y: bounds.y + scrollY,
                width: bounds.width,
                height: bounds.height,
              };
            });
        }),
      );
    for (const forcedColors of ['none', 'active'] as const) {
      await page.emulateMedia({ forcedColors });
      await pin.scrollIntoViewIfNeeded();
      await pin.focus();
      const before = await geometry();
      for (const targets of before) {
        for (let index = 2; index < targets.length; index++) {
          const previous = targets[index - 1]!;
          const current = targets[index]!;
          expect(
            current.y >= previous.y + previous.height || current.x >= previous.x + previous.width,
            'Consecutive action targets may share a row but must not overlap.',
          ).toBe(true);
        }
      }
      const grip = card.locator('[data-compare-drag-grip]');
      if (await grip.isVisible()) {
        const gripBox = await grip.boundingBox();
        const pinBox = await pin.boundingBox();
        if (!gripBox || !pinBox) throw new Error('Pin and the fine-pointer grip must have real target boxes.');
        expect(Math.abs(gripBox.y - pinBox.y)).toBeLessThanOrEqual(1);
        expect(gripBox.x).toBeGreaterThanOrEqual(pinBox.x + pinBox.width);
      }
      const pinBefore = await pin.boundingBox();
      if (!pinBefore) throw new Error('The unpinned action must have a visible box.');
      if (forcedColors === 'active') await pin.press('Enter');
      else await pin.click();
      await expect(pinned).toHaveAttribute('aria-disabled', 'true');
      await expect(pinned).toBeFocused();
      // Read immediately: no action may scroll the card to conceal a success-state layout shift.
      const afterPin = await geometry();
      const pinAfter = await pinned.boundingBox();
      if (!pinAfter) throw new Error('The pinned action must keep a visible box.');
      expect(Math.abs(pinAfter.y - pinBefore.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(pinAfter.x - pinBefore.x)).toBeLessThanOrEqual(1);
      expect(pinAfter.height).toBeGreaterThanOrEqual(44);
      expect(pinAfter.width).toBeGreaterThanOrEqual(44);
      if (forcedColors === 'active') {
        await expect(pinned).toHaveCSS('outline-style', 'solid');
        await expect(pinned).toHaveCSS('outline-width', '3px');
      }
      await page.locator('.compare-tray-expand').click();
      const tray = page.getByRole('dialog', { name: 'Compare tray', exact: true });
      await tray.getByRole('button', { name: `Unpin ${items[0]!.record.title} from comparison`, exact: true }).click();
      await closeDialog(page);
      await expect(pin).not.toHaveAttribute('aria-disabled');
      // Document coordinates exclude intentional dialog scrolling, without moving any card back.
      const afterUnpin = await geometry();
      for (const after of [afterPin, afterUnpin]) {
        expect(after).toHaveLength(before.length);
        for (let index = 0; index < before.length; index++) {
          expect(after[index]).toHaveLength(before[index]!.length);
          for (let target = 0; target < before[index]!.length; target++) {
            for (const field of ['x', 'y', 'width', 'height'] as const) {
              expect(
                Math.abs(after[index]![target]![field] - before[index]![target]![field]),
                `card ${index}, target ${target}, ${field}, forced colors ${forcedColors}`,
              ).toBeLessThanOrEqual(1);
            }
          }
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

test('Discover primary filters share aligned native select styling at 1440px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await emptyCatalogs(page);
  await page.route('**/data/discovery/catalog.v1.json', (route) =>
    route.fulfill({ json: { ...catalogFixture, items } }),
  );
  await page.goto('/discover?catalogs=off');
  await expect(page.locator('.discovery-card')).toHaveCount(items.length);
  const toolbar = page.locator('.discovery-toolbar').first();
  const selects = toolbar.getByRole('combobox');
  await expect(selects).toHaveCount(4);
  await expect(toolbar.getByRole('combobox', { name: 'Genre family', exact: true })).toHaveAttribute(
    'aria-describedby',
    'discovery-genre-help',
  );
  await page.evaluate(() => document.fonts.ready);
  const geometry = await selects.evaluateAll((elements) =>
    elements.map((element) => {
      if (!(element instanceof HTMLSelectElement)) throw new Error('Discover filters must remain native selects.');
      const label = element.labels?.[0];
      if (!label) throw new Error('Every Discover filter needs its visible label.');
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        name: label.textContent?.trim(),
        top: bounds.top,
        height: bounds.height,
        border: style.borderTopColor,
        fill: style.backgroundColor,
        labelSize: getComputedStyle(label).fontSize,
      };
    }),
  );
  expect(geometry.map((control) => control.name)).toEqual(['Progress', 'Genre family', 'Year', 'Source']);
  const tops = geometry.map((control) => control.top);
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
  for (const control of geometry) {
    expect(control.height).toBe(48);
    expect(control.border).toBe('rgb(127, 129, 121)');
    expect(control.fill).toBe('rgb(253, 253, 246)');
    expect(control.labelSize).toBe('12px');
  }
});

test('Discover reuses the collection view switch active fill, ink and underline', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await emptyCatalogs(page);
  const appearance = () =>
    page.locator('.view-switch .is-active').evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color, shadow: style.boxShadow };
    });
  await page.goto('/?catalogs=off');
  await expect(page.getByRole('button', { name: 'Grid view', exact: true })).toHaveClass(/is-active/);
  const expected = await appearance();
  expect(expected.shadow).not.toBe('none');
  await page.goto('/discover?catalogs=off');
  const controls = page.getByRole('group', { name: 'Catalog view', exact: true });
  for (const name of ['Grid view', 'List view']) {
    const button = controls.getByRole('button', { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toHaveClass(/is-active/);
    expect(await appearance()).toEqual(expected);
  }
});

test('Discover single-line and two-line titles start together without shrinking their targets', async ({
  page,
  isMobile,
}) => {
  await page.setViewportSize({ width: isMobile ? 393 : 1024, height: isMobile ? 851 : 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await emptyCatalogs(page);
  const titles = ['Age of Empires', 'Age of Empires II: The Age of Kings'];
  const titleItems = items.slice(0, titles.length).map((item, index) => ({
    ...item,
    record: { ...item.record, title: titles[index]! },
  }));
  await page.route('**/data/discovery/catalog.v1.json', (route) =>
    route.fulfill({ json: { ...catalogFixture, items: titleItems } }),
  );
  await page.goto('/discover?catalogs=off');
  const cards = page.locator('.discovery-cards-grid > .discovery-card');
  await expect(cards).toHaveCount(titles.length);
  await expect(cards.locator('h3 button')).toHaveText(titles);
  await page.evaluate(() => document.fonts.ready);
  const geometry = await cards.evaluateAll((elements) =>
    elements.map((card) => {
      const heading = card.querySelector('h3');
      const button = heading?.querySelector('button');
      if (!heading || !button) throw new Error('The title must keep its native button.');
      // The 44px button box can hide text misalignment; measure its actual line fragments.
      const range = document.createRange();
      range.selectNodeContents(button);
      const lines = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
      const firstLine = lines[0];
      if (!firstLine) throw new Error('The full game title must have visible text.');
      const bounds = button.getBoundingClientRect();
      return {
        cardTop: card.getBoundingClientRect().top,
        firstLineTop: firstLine.top,
        lines: lines.length,
        height: bounds.height,
        widthDifference: Math.abs(bounds.width - heading.getBoundingClientRect().width),
        textFits: button.scrollHeight <= button.clientHeight + 1 && button.scrollWidth <= button.clientWidth + 1,
      };
    }),
  );
  expect(geometry.map((title) => title.lines)).toEqual([1, 2]);
  for (const field of ['cardTop', 'firstLineTop'] as const) {
    const positions = geometry.map((title) => title[field]);
    expect(Math.max(...positions) - Math.min(...positions), field).toBeLessThanOrEqual(1);
  }
  expect(geometry.every((title) => title.height >= 44 && title.widthDifference <= 1 && title.textFits)).toBe(true);
});

test('Discover grid action rows align at 1024 and 393 without truncating text', async ({ page, isMobile }) => {
  await page.setViewportSize({ width: isMobile ? 393 : 1024, height: isMobile ? 851 : 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await emptyCatalogs(page);
  await page.route('**/data/discovery/catalog.v1.json', (route) =>
    route.fulfill({ json: { ...catalogFixture, items } }),
  );
  await page.goto('/discover?catalogs=off');
  const cards = page.locator('.discovery-cards-grid > .discovery-card');
  await expect(cards).toHaveCount(items.length);
  await page.evaluate(() => document.fonts.ready);

  const primaryGenres = [
    'Puzzles',
    'Action & adventure · Role-playing · Shooters · Platformers',
    'Strategy',
    'Casual & social',
  ];
  for (const [index, { record }] of items.entries()) {
    const card = page.locator(`[data-catalog-id="${record.id}"]`);
    await expect(card.locator('h3')).toHaveText(record.title);
    await expect(card.locator('.discovery-card-meta')).toHaveText(`${record.year} · ${primaryGenres[index]}`);
    await expect(card.locator('.discovery-card-source')).toContainText(`Source classification: ${record.genre}`);
  }
  const geometry = await cards.evaluateAll((elements) =>
    elements.map((card) => {
      const title = card.querySelector<HTMLElement>('h3');
      const genre = card.querySelector<HTMLElement>('.discovery-card-meta');
      const primary = card.querySelector<HTMLElement>('.discovery-card-primary');
      const summary = card.querySelector<HTMLElement>('.discovery-card-details > summary');
      const add = primary?.querySelector<HTMLButtonElement>('button');
      const pin = primary?.querySelector<HTMLButtonElement>('button[aria-label^="Pin for comparison:"]');
      if (!title || !genre || !primary || !summary || !add || !pin)
        throw new Error('Every layout fixture must expose its full identity and native actions.');
      const bounds = card.getBoundingClientRect();
      return {
        top: bounds.top,
        height: bounds.height,
        primaryTop: primary.getBoundingClientRect().top,
        addTop: add.getBoundingClientRect().top,
        pinTop: pin.getBoundingClientRect().top,
        summaryTop: summary.getBoundingClientRect().top,
        titleHeight: title.getBoundingClientRect().height,
        genreHeight: genre.getBoundingClientRect().height,
        textFits: [title, genre].every(
          (element) =>
            element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1,
        ),
        targetHeights: [add, pin, summary].map((element) => element.getBoundingClientRect().height),
      };
    }),
  );
  const firstTop = geometry[0]?.top;
  if (firstTop === undefined) throw new Error('The first Discover row did not render.');
  const firstRow = geometry.filter((card) => Math.abs(card.top - firstTop) <= 1);
  expect(firstRow).toHaveLength(isMobile ? 2 : 4);
  for (const field of ['height', 'primaryTop', 'addTop', 'pinTop', 'summaryTop'] as const) {
    const positions = firstRow.map((card) => card[field]);
    expect(Math.max(...positions) - Math.min(...positions), `${field} alignment`).toBeLessThanOrEqual(1);
  }
  expect(
    Math.max(...firstRow.map((card) => card.titleHeight)) - Math.min(...firstRow.map((card) => card.titleHeight)),
  ).toBeGreaterThan(10);
  expect(
    Math.max(...firstRow.map((card) => card.genreHeight)) - Math.min(...firstRow.map((card) => card.genreHeight)),
  ).toBeGreaterThan(10);
  expect(geometry.every((card) => card.textFits)).toBe(true);
  expect(geometry.every((card) => card.targetHeights.every((height) => height >= 44))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'List view', exact: true }).click();
  const listCard = page.locator('.discovery-cards-list > .discovery-card').first();
  await expect(listCard).toHaveCSS('display', 'grid');
  await expect(listCard.locator('.discovery-card-primary')).toHaveCSS('padding-top', '0px');
  await listCard.locator('.discovery-card-details > summary').click();
  await expect(listCard.locator('.discovery-card-details')).toHaveAttribute('open', '');
  await expect(listCard.getByRole('link', { name: 'Game data: Wikidata' })).toHaveAttribute(
    'href',
    items[0]!.record.sourceUrl!,
  );
});
