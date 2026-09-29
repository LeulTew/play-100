import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { catalogFixture, discoveryFixture, enrichmentFixture } from '../src/lib/discovery-test-fixtures';
import { applyPersonalAction } from '../src/lib/personal-library';
import type { PersonalAction, PersonalLibraryState } from '../src/lib/personal-types';
import { emptyCatalogs } from './catalog-helpers';
import { readLibrary } from './library-helpers';

const record = discoveryFixture.record;

test.beforeEach(async ({ page, context, baseURL, isMobile }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname))
    throw new Error('Catalog detail fixtures require the owned local preview.');
  await page.setViewportSize({ width: isMobile ? 393 : 1440, height: isMobile ? 851 : 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === new URL(baseURL).origin
      ? route.fallback()
      : route.abort('blockedbyclient'),
  );
  await emptyCatalogs(page);
  await page.route('**/data/discovery/catalog.v1.json', (route) => route.fulfill({ json: catalogFixture }));
});

for (const input of ['pointer', 'keyboard'] as const) {
  test(`catalog detail adds only to Library using ${input}`, async ({ page, isMobile }) => {
    await page.goto('/discover?catalogs=off');
    const card = page.locator(`[data-catalog-id="${record.id}"]`);
    const opener = card.getByRole('button', { name: record.title, exact: true });
    await expect(opener).toBeVisible();
    const before = await readLibrary(page);
    expect(before.records[record.id]).toBeUndefined();
    if (input === 'keyboard') {
      await opener.focus();
      await page.keyboard.press('Enter');
    } else if (isMobile) await opener.tap();
    else await opener.click();
    const dialog = page.getByRole('dialog', { name: record.title, exact: true });
    const add = dialog.getByRole('button', { name: `Add to My games: ${record.title}`, exact: true });
    await expect(dialog.locator('#catalog-game-title')).toBeFocused();
    await expect(add).toBeEnabled();
    await expect(dialog.locator('.device-note')).toContainText(
      'Add to My games to keep this game without changing your progress, Play later or ranking.',
    );
    if (input === 'keyboard') {
      for (let step = 0; step < 12; step++) {
        if (await add.evaluate((element) => element === document.activeElement)) break;
        await page.keyboard.press('Tab');
      }
      await expect(add).toBeFocused();
      await page.keyboard.press('Enter');
    } else if (isMobile) await add.tap();
    else await add.click();
    const saved = dialog.getByRole('button', { name: `In My games: ${record.title}`, exact: true });
    await expect(saved).toBeDisabled();
    await expect(saved).not.toHaveAttribute('disabled');
    if (input === 'keyboard') await expect(saved).toBeFocused();
    await expect(dialog.locator('.detail-share-notice')).toHaveText(`${record.title} added to My games.`);
    await expect(dialog.locator('.detail-share-notice')).toHaveAttribute('role', 'status');
    await expect(dialog.locator('.device-note')).toHaveText('Saved in My games. The 100 stays unchanged.');
    const after = await readLibrary(page);
    expect(after).toEqual({
      ...before,
      revision: before.revision + 1,
      records: { ...before.records, [record.id]: record },
    });
    expect(after.progress[record.id]).toBeUndefined();
    expect(after.queueOrder).toEqual(before.queueOrder);
    expect(after.ranking).toEqual(before.ranking);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(card.getByRole('button', { name: `In My games: ${record.title}`, exact: true })).toBeDisabled();
    await page.reload();
    await expect(card.getByRole('button', { name: `In My games: ${record.title}`, exact: true })).toBeDisabled();
    expect(await readLibrary(page)).toEqual(after);
  });
}

async function holdCatalogWrite(page: Page, rejected: boolean) {
  return page.evaluateHandle(
    ({ id, rejected }) => {
      const put = IDBObjectStore.prototype.put;
      const state = { attempts: 0, held: false };
      let finish: (() => void) | null = null;
      IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
        const value: Partial<PersonalLibraryState> | null | undefined = args[0];
        if (
          this.transaction.db.name === 'play100-personal' &&
          this.name === 'library' &&
          args[1] === 'state' &&
          value?.records?.[id]
        ) {
          state.attempts += 1;
          if (state.attempts === 1) {
            const transaction = this.transaction;
            const eventName = rejected ? 'onabort' : 'oncomplete';
            const callback = transaction[eventName];
            if (!callback) throw new Error('The library transaction must have its completion receiver.');
            transaction[eventName] = (event) => {
              state.held = true;
              finish = () => {
                state.held = false;
                transaction[eventName] = callback;
                callback.call(transaction, event);
              };
            };
          }
          if (rejected) throw new DOMException('Synthetic catalog write refusal.', 'QuotaExceededError');
        }
        return put.apply(this, args);
      };
      return {
        state,
        release() {
          if (!finish) throw new Error('Observe the native transaction before releasing its completion.');
          const callback = finish;
          finish = null;
          callback();
        },
        restore() {
          IDBObjectStore.prototype.put = put;
          if (finish) {
            const callback = finish;
            finish = null;
            callback();
          }
        },
      };
    },
    { id: record.id, rejected },
  );
}

test('enabling public details receives the rating-blur click and waits for its save', async ({ page }) => {
  const requests: URL[] = [];
  await page.route('**/api/catalog-detail?**', (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({ json: enrichmentFixture() });
  });
  await page.goto('/discover?catalogs=off&genreFamily=role-playing&campaign=retained');
  await page
    .locator(`[data-catalog-id="${record.id}"]`)
    .getByRole('button', { name: record.title, exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: record.title, exact: true });
  const rating = dialog.getByRole('spinbutton');
  const enable = dialog.getByRole('button', { name: 'Enable online details', exact: true });
  await expect(enable).toBeEnabled();
  const original = page.url();
  const historyLength = await page.evaluate(() => history.length);
  const before = await readLibrary(page);
  await rating.fill('11');
  await enable.click();
  await expect(rating).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(original);
  expect(requests).toEqual([]);

  const held = await holdCatalogWrite(page, false);
  const activation = await enable.evaluateHandle((button) => {
    if (!(button instanceof HTMLButtonElement)) throw new Error('Public consent needs its native button.');
    const receipt = { clicks: 0, press: null as { x: number; y: number } | null };
    const down = (event: PointerEvent) => {
      receipt.press = { x: event.clientX, y: event.clientY };
    };
    const click = () => {
      receipt.clicks += 1;
    };
    button.addEventListener('pointerdown', down);
    button.addEventListener('click', click);
    return {
      read() {
        const box = button.getBoundingClientRect();
        const point = receipt.press;
        return {
          clicks: receipt.clicks,
          stillUnderPointer:
            point !== null &&
            point.x >= box.left &&
            point.x <= box.right &&
            point.y >= box.top &&
            point.y <= box.bottom,
        };
      },
      dispose() {
        button.removeEventListener('pointerdown', down);
        button.removeEventListener('click', click);
      },
    };
  });
  try {
    await rating.fill('7.25');
    await enable.click();
    await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
    expect(await activation.evaluate((probe) => probe.read())).toEqual({ clicks: 1, stillUnderPointer: true });
    await expect(dialog.locator('.detail-share-notice')).toHaveText('Saving changes…');
    await expect(dialog.locator('.detail-share-notice')).toHaveAttribute('role', 'status');
    await expect(rating).toBeDisabled();
    await expect(enable).toBeEnabled();
    await expect(page).toHaveURL(original);
    expect(requests).toEqual([]);
    await held.evaluate((probe) => probe.release());
    await expect(enable).toHaveCount(0);
    await expect(rating).toBeEnabled();
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    const expectedUrl = new URL(original);
    expectedUrl.searchParams.delete('catalogs');
    const currentUrl = new URL(page.url());
    expect(currentUrl.pathname).toBe(expectedUrl.pathname);
    expect([...currentUrl.searchParams].sort()).toEqual([...expectedUrl.searchParams].sort());
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    expect(await readLibrary(page)).toEqual(applyPersonalAction(before, { type: 'rate-game', record, score: 7.25 }));
    expect(await held.evaluate((probe) => probe.state.attempts)).toBe(1);
    for (const request of requests) expect([...request.searchParams]).toEqual([['id', record.id]]);
    await expect(dialog.locator('.detail-share-notice')).toHaveAttribute('role', 'status');
    await expect(page.locator('.toast-visible')).toHaveCount(0);
  } finally {
    await activation.evaluate((probe) => probe.dispose());
    await activation.dispose();
    await held.evaluate((probe) => probe.restore());
    await held.dispose();
  }
});

const mutationCases: {
  name: string;
  label: string;
  after: string;
  key: 'Enter' | 'Space';
  action: PersonalAction;
  message: string;
}[] = [
  {
    name: 'library add',
    label: `Add to My games: ${record.title}`,
    after: `In My games: ${record.title}`,
    key: 'Enter',
    action: { type: 'add-records', records: [record] },
    message: `${record.title} added to My games.`,
  },
  {
    name: 'queue',
    label: 'Play later',
    after: 'Play later',
    key: 'Space',
    action: { type: 'toggle-progress', record, key: 'later' },
    message: `${record.title} added to Play later.`,
  },
  {
    name: 'completion',
    label: 'Completed',
    after: 'Completed',
    key: 'Space',
    action: { type: 'set-progress', records: [record], key: 'completed', value: true },
    message: `${record.title} marked completed.`,
  },
  {
    name: 'ranking add',
    label: 'Add to my ranking',
    after: 'Your rank: #1',
    key: 'Enter',
    action: { type: 'add-ranking', records: [record] },
    message: `${record.title} added to your ranking at #1.`,
  },
];

for (const mutation of mutationCases) {
  for (const rejected of [false, true]) {
    test(`catalog ${mutation.name} keeps focus through a pending ${rejected ? 'rejected' : 'successful'} save`, async ({
      page,
    }) => {
      await page.goto('/discover?catalogs=off');
      const opener = page
        .locator(`[data-catalog-id="${record.id}"]`)
        .getByRole('button', { name: record.title, exact: true });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: record.title, exact: true });
      if (mutation.name !== 'library add') {
        await dialog.getByRole('button', { name: `Add to My games: ${record.title}`, exact: true }).click();
        await expect(dialog.getByRole('button', { name: `In My games: ${record.title}`, exact: true })).toBeDisabled();
        await page.keyboard.press('Escape');
        await opener.click();
        await expect(dialog.locator('.detail-share-notice')).toHaveCount(0);
      }
      const before = await readLibrary(page);
      const control = dialog.getByRole('button', { name: mutation.label, exact: true });
      const node = await control.elementHandle();
      if (!node) throw new Error('The original mutation control must be mounted.');
      const held = await holdCatalogWrite(page, rejected);
      try {
        await control.focus();
        await page.keyboard.press(mutation.key);
        await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
        await expect(control).toBeFocused();
        await expect(control).toHaveAttribute('aria-disabled', 'true');
        await expect(control).not.toHaveAttribute('disabled');
        await expect(dialog.locator('.detail-share-notice')).toHaveText('Saving changes…');
        await expect(dialog.locator('.detail-share-notice')).toHaveAttribute('role', 'status');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Space');
        await node.evaluate((element) => {
          if (!(element instanceof HTMLButtonElement)) throw new Error('The mutation target must stay a button.');
          element.click();
        });
        expect(await held.evaluate((probe) => probe.state.attempts)).toBe(1);
        await held.evaluate((probe) => probe.release());
        await expect(dialog.locator('.detail-actions')).not.toHaveAttribute('aria-busy', 'true');
        if (rejected) {
          await expect(dialog.getByRole('alert')).toHaveText(
            'Device storage is full. Your changes were not saved. Free some space and try again.',
          );
          await expect(dialog.locator('.detail-share-notice')).toHaveCount(0);
          await expect(control).toBeFocused();
          await expect(control).toBeEnabled();
          expect(await readLibrary(page)).toEqual(before);
          await held.evaluate((probe) => probe.restore());
          await page.keyboard.press(mutation.key);
        }
        await expect(dialog.locator('.detail-share-notice')).toHaveText(mutation.message);
        await expect(dialog.locator('.detail-share-notice')).toHaveAttribute('role', 'status');
        await expect(dialog.getByRole('alert')).toHaveCount(0);
        await expect(dialog.getByRole('button', { name: mutation.after, exact: true })).toBeFocused();
        expect(
          await node.evaluate((element) => ({
            sameFocus: element.isConnected && document.activeElement === element,
            visibleFocus: element.matches(':focus-visible') && getComputedStyle(element).outlineStyle !== 'none',
            documentFocused: document.hasFocus(),
          })),
        ).toEqual({ sameFocus: true, visibleFocus: true, documentFocused: true });
        expect(await readLibrary(page)).toEqual(applyPersonalAction(before, mutation.action));
        expect(await held.evaluate((probe) => probe.state.attempts)).toBe(1);
        await expect(page.locator('.toast-visible')).toHaveCount(0);
        if (mutation.name === 'library add') {
          await page.keyboard.press('Enter');
          await node.evaluate((element) => {
            if (!(element instanceof HTMLButtonElement)) throw new Error('The saved control must stay a button.');
            element.click();
          });
          expect(await readLibrary(page)).toEqual(applyPersonalAction(before, mutation.action));
          expect(await held.evaluate((probe) => probe.state.attempts)).toBe(1);
        }
      } finally {
        await held.evaluate((probe) => probe.restore());
        await held.dispose();
        await node.dispose();
      }
    });
  }
}

test('a closed catalog save does not steal focus or replay feedback in a fresh detail', async ({ page }) => {
  await page.goto('/discover?catalogs=off');
  const opener = page
    .locator(`[data-catalog-id="${record.id}"]`)
    .getByRole('button', { name: record.title, exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: record.title, exact: true });
  const held = await holdCatalogWrite(page, false);
  try {
    const add = dialog.getByRole('button', { name: `Add to My games: ${record.title}`, exact: true });
    await add.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => held.evaluate((probe) => probe.state.held)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await opener.click();
    await expect(dialog.locator('#catalog-game-title')).toBeFocused();
    await held.evaluate((probe) => probe.release());
    await expect(dialog.getByRole('button', { name: `In My games: ${record.title}`, exact: true })).toBeDisabled();
    await expect(dialog.locator('#catalog-game-title')).toBeFocused();
    await expect(dialog.locator('.detail-share-notice')).toHaveCount(0);
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.toast-visible')).toHaveCount(0);
    expect((await readLibrary(page)).records[record.id]).toEqual(record);
  } finally {
    await held.evaluate((probe) => probe.restore());
    await held.dispose();
  }
});

for (const close of ['Escape', 'Back', 'Close'] as const) {
  test(`${close} flushes a catalog rating exactly once with autosave paused`, async ({ page }) => {
    await page.goto('/discover?catalogs=off');
    const opener = page
      .locator(`[data-catalog-id="${record.id}"]`)
      .getByRole('button', { name: record.title, exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: record.title, exact: true });
    const input = dialog.getByRole('spinbutton');
    await expect(input).toBeEnabled();
    const before = await readLibrary(page);
    expect(before.records[record.id]).toBeUndefined();
    await page.clock.install({ time: new Date('2026-09-28T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-09-28T00:00:10Z'));
    try {
      await input.fill('7.75');
      await expect(input).toBeFocused();
      expect(await readLibrary(page)).toEqual(before);
      if (close === 'Escape') await page.keyboard.press('Escape');
      else if (close === 'Back') await page.goBack();
      else await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect
        .poll(async () => (await readLibrary(page)).ranking.find((entry) => entry.id === record.id)?.score)
        .toBe(7.75);
      const expected = applyPersonalAction(before, { type: 'rate-game', record, score: 7.75 });
      expect(await readLibrary(page)).toEqual(expected);
      await expect(opener).toBeFocused();
      await page.clock.runFor(1500);
      expect(await readLibrary(page)).toEqual(expected);
      await opener.click();
      await expect(input).toHaveValue('7.75');
      await expect(dialog.locator('#catalog-game-title')).toBeFocused();
      await expect(dialog.locator('.detail-share-notice')).toHaveCount(0);
    } finally {
      await page.clock.resume();
    }
  });
}

test('canonical Discover details keep the original collection actions', async ({ page }) => {
  await page.goto('/discover?q=red%20dead%20redemption%202&include100=on&catalogs=off');
  await page
    .locator('[data-catalog-id="red-dead-redemption-2"]')
    .getByRole('button', { name: 'Red Dead Redemption 2', exact: true })
    .click();
  const detail = page.getByRole('dialog', { name: 'Red Dead Redemption 2', exact: true });
  await expect(detail).toHaveClass(/game-dialog/);
  await expect(detail.getByRole('button', { name: /^Add to My games:/ })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: 'Play later', exact: true })).toBeEnabled();
});

for (const [genre, label] of [
  [
    'role-playing video game / turn-based Japanese role-playing game / time travel video game / video game with LGBT character',
    'Role-playing',
  ],
  ['time travel video game / unknown shooterish theme', 'Other / unclassified'],
  [null, 'Other / unclassified'],
] as const) {
  test(`provider genre ${genre ?? 'missing'} keeps its full source classification`, async ({ page }) => {
    await page.route('**/data/discovery/catalog.v1.json', (route) =>
      route.fulfill({
        json: {
          ...catalogFixture,
          items: [{ ...discoveryFixture, record: { ...record, genre } }],
        },
      }),
    );
    await page.goto('/discover?catalogs=off');
    const card = page.locator(`[data-catalog-id="${record.id}"]`);
    await expect(card.locator('.discovery-card-meta')).toHaveText(`${record.year} · ${label}`);
    await card.getByText('More actions', { exact: true }).click();
    await expect(card.locator('.discovery-card-source')).toContainText(
      `Source classification: ${genre ?? 'Not provided'}`,
    );
    await card.getByRole('button', { name: record.title, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: record.title, exact: true });
    const genreField = dialog.locator('.catalog-facts > div').filter({
      has: page.locator('dt').filter({ hasText: /^Genre$/ }),
    });
    await expect(genreField.locator('dd')).toHaveText(label);
    const classification = dialog.locator('.catalog-source-classification');
    await expect(classification).not.toHaveAttribute('open');
    await classification.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(classification).toHaveAttribute('open', '');
    await expect(classification.locator('p')).toHaveText(genre ?? 'Not provided');
    await dialog.getByRole('button', { name: `Add to My games: ${record.title}`, exact: true }).click();
    await expect(dialog.getByRole('button', { name: `In My games: ${record.title}`, exact: true })).toBeDisabled();
    expect((await readLibrary(page)).records[record.id]?.genre).toBe(genre);
  });
}
