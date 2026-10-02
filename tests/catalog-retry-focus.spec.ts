import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { catalogRecord, respondWithCatalog } from './catalog-helpers';
import { enrichmentFixture } from '../src/lib/discovery-test-fixtures';

function heldResponse() {
  let release: () => void = () => {
    throw new Error('The retry response was not initialized.');
  };
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { waiting, release };
}

async function expectVisibleFocus(target: Locator) {
  await expect(target).toBeFocused();
  const bounds = await target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const dialog = element.closest('dialog');
    const rail = dialog?.querySelector('.dialog-close-rail');
    const nav = !dialog ? document.querySelector('.mobile-nav') : null;
    const navBox = nav?.getBoundingClientRect();
    const floor = navBox?.height ? navBox.top : innerHeight;
    return {
      top: box.top,
      bottom: box.bottom,
      viewTop:
        rail?.getBoundingClientRect().bottom ?? document.querySelector('.site-header')!.getBoundingClientRect().bottom,
      viewBottom: dialog ? Math.min(innerHeight, dialog.getBoundingClientRect().bottom) : floor,
      hit: element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
    };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(bounds.viewTop);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewBottom);
  expect(bounds.hit).toBe(true);
}

test.beforeEach(async ({ page, context, baseURL, isMobile }) => {
  const origin = new URL(baseURL!);
  expect(['127.0.0.1', 'localhost']).toContain(origin.hostname);
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin.origin ? route.continue() : route.abort('blockedbyclient'),
  );
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: 'Synthetic catalog refusal.' } }),
  );
  await page.setViewportSize({ width: isMobile ? 393 : 1440, height: isMobile ? 851 : 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function retainPendingRetry(page: Page, retry: Locator, calls: () => number) {
  await retry.focus();
  await retry.press('Enter');
  await expect.poll(calls).toBe(2);
  await expect(retry).toBeFocused();
  await expect(retry).toHaveAttribute('aria-disabled', 'true');
  await expect(retry).toHaveAttribute('aria-busy', 'true');
  await expect(retry).not.toHaveAttribute('disabled');
  await retry.press('Enter');
  expect(calls()).toBe(2);
  expect(await page.evaluate(() => document.hasFocus())).toBe(true);
}

for (const succeeds of [false, true]) {
  for (const next of ['heading', 'newer focus', 'closed dialog'] as const) {
    test(`enabling public details ${succeeds ? 'succeeds' : 'fails'} with ${next} preserved`, async ({ page }) => {
      const response = heldResponse();
      let calls = 0;
      await page.route('**/api/catalog-detail?**', async (route) => {
        calls++;
        await response.waiting;
        return succeeds
          ? route.fulfill({ json: enrichmentFixture() })
          : route.fulfill({ status: 503, json: { error: 'Synthetic enable refusal.' } });
      });
      try {
        await page.goto('/discover?game=wikidata%3AQ15408545&q=Kingdomcome&catalogs=off');
        const dialog = page.getByRole('dialog', { name: 'Kingdom Come: Deliverance', exact: true });
        const enable = dialog.getByRole('button', { name: 'Enable online details', exact: true });
        await enable.focus();
        await page.keyboard.press('Enter');
        await expect.poll(() => calls).toBe(1);
        const heading = dialog.locator('#catalog-enrichment-title');
        await expect(enable).toHaveCount(0);
        await expectVisibleFocus(heading);
        const newer = dialog.getByRole('button', { name: 'Completed', exact: true });
        if (next === 'newer focus') await newer.focus();
        if (next === 'closed dialog') {
          await page.keyboard.press('Escape');
          await expect(dialog).toHaveCount(0);
        }
        const retained = await page.evaluateHandle(() => document.activeElement);
        response.release();
        if (next !== 'closed dialog') {
          const section = dialog.locator('.catalog-enrichment');
          if (succeeds)
            await expect(section.getByRole('list', { name: 'Separate external game ratings' })).toBeVisible();
          else await expect(section.getByRole('button', { name: 'Retry public details', exact: true })).toBeVisible();
          await expect(next === 'heading' ? heading : newer).toBeFocused();
        } else {
          await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
          expect(await retained.evaluate((element) => element === document.activeElement)).toBe(true);
          await expect(dialog).toHaveCount(0);
        }
        await retained.dispose();
      } finally {
        response.release();
      }
    });
  }
}

for (const succeeds of [false, true]) {
  for (const moveFocus of [false, true]) {
    test(`public-detail retry ${succeeds ? 'succeeds' : 'fails'} ${moveFocus ? 'without reclaiming newer focus' : 'without losing its focus location'}`, async ({
      page,
    }) => {
      const response = heldResponse();
      let calls = 0;
      await page.route('**/api/catalog-detail?**', async (route) => {
        calls++;
        if (calls > 1) await response.waiting;
        if (calls > 1 && succeeds) return route.fulfill({ json: enrichmentFixture() });
        return route.fulfill({ status: 503, json: { error: 'Synthetic public details refusal.' } });
      });
      try {
        await page.goto('/discover?game=wikidata%3AQ15408545&q=Kingdomcome&catalogs=off');
        const dialog = page.getByRole('dialog', { name: 'Kingdom Come: Deliverance', exact: true });
        await dialog.getByRole('button', { name: 'Enable online details', exact: true }).click();
        const section = dialog.locator('.catalog-enrichment');
        const retry = section.getByRole('button', { name: 'Retry public details', exact: true });
        await expect(retry).toBeVisible();
        expect(calls).toBe(1);
        const original = await retry.elementHandle();
        if (!original) throw new Error('Missing public retry control.');
        await retainPendingRetry(page, retry, () => calls);
        const newer = dialog.getByRole('button', { name: 'Completed', exact: true });
        if (moveFocus) {
          await newer.scrollIntoViewIfNeeded();
          await newer.focus();
        }
        response.release();
        if (succeeds) {
          await expect(section.getByRole('list', { name: 'Separate external game ratings' })).toBeVisible();
          await expect(retry).toHaveCount(0);
          if (!moveFocus) await expectVisibleFocus(section.locator('#catalog-enrichment-title'));
        } else {
          await expect(section.getByRole('alert')).toBeVisible();
          await expect(retry).not.toHaveAttribute('aria-disabled', 'true');
          await expect(retry).toHaveAttribute('aria-busy', 'false');
          expect(await original.evaluate((node) => node.isConnected)).toBe(true);
          if (!moveFocus) await expectVisibleFocus(retry);
        }
        if (moveFocus) await expect(newer).toBeFocused();
        await expect(dialog).toBeVisible();
        expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
        await original.dispose();
      } finally {
        response.release();
      }
    });

    test(`provider retry ${succeeds ? 'succeeds' : 'fails'} ${moveFocus ? 'without reclaiming newer focus' : 'without losing its focus location'}`, async ({
      page,
    }) => {
      const response = heldResponse();
      const record = catalogRecord('wikidata', 'Q9999901', 'Retryfocus fixture');
      let calls = 0;
      await page.route('**/api/catalog?**', async (route) => {
        calls++;
        if (calls > 1) await response.waiting;
        if (calls > 1 && succeeds) return respondWithCatalog(route, [record]);
        return route.fulfill({ status: 503, json: { error: 'Synthetic Wikidata refusal.' } });
      });
      try {
        await page.goto('/discover?q=Retryfocus&source=wikidata&catalogs=on&online=on');
        const source = page.locator('.discovery-source-status > div').filter({
          has: page.getByRole('link', { name: 'Wikidata', exact: true }),
        });
        const retry = source.getByRole('button', { name: 'Retry Wikidata', exact: true });
        await expect(retry).toBeVisible();
        expect(calls).toBe(1);
        const original = await retry.elementHandle();
        if (!original) throw new Error('Missing provider retry control.');
        await retainPendingRetry(page, retry, () => calls);
        const newer = page.getByRole('searchbox', { name: 'Find a game', exact: true });
        if (moveFocus) {
          await newer.scrollIntoViewIfNeeded();
          await newer.focus();
        }
        response.release();
        if (succeeds) {
          await expect(source.getByRole('status')).toContainText('1 new online match');
          await expect(retry).toHaveCount(0);
          if (!moveFocus) await expectVisibleFocus(source.getByRole('status'));
        } else {
          await expect(source.getByRole('alert')).toBeVisible();
          await expect(retry).not.toHaveAttribute('aria-disabled', 'true');
          await expect(retry).toHaveAttribute('aria-busy', 'false');
          expect(await original.evaluate((node) => node.isConnected)).toBe(true);
          if (!moveFocus) await expectVisibleFocus(retry);
        }
        if (moveFocus) await expect(newer).toBeFocused();
        expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
        await original.dispose();
      } finally {
        response.release();
      }
    });
  }
}
