import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';

declare global {
  interface Window {
    resizeObserverLoopErrors?: string[];
  }
}

/** Scrolls the whole page a half screen at a time, so every contained card renders, then back to the top. */
async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    for (let top = 0; top < document.documentElement.scrollHeight; top += innerHeight / 2) {
      scrollTo(0, top);
      await frame();
    }
    scrollTo(0, 0);
    await frame();
  });
}

// On a Galaxy A03s (WebView Chrome 106) the landing reported "ResizeObserver loop limit exceeded" as it loaded and
// again on each route change. This replays that phone's visit (docs/performance.md, "Low-end phones") at narrow widths.
// A current Chromium no longer reports that loop (src/render-containment.css), so this guards the page's own observers.
for (const viewport of [
  { width: 412, height: 785 },
  { width: 320, height: 640 },
]) {
  test(`a visit at ${viewport.width}px reports no ResizeObserver loop and opens the first game's details`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      const errors: string[] = [];
      window.resizeObserverLoopErrors = errors;
      addEventListener('error', (event) => {
        if (/ResizeObserver/.test(event.message)) errors.push(event.message);
      });
    });
    const reported: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /ResizeObserver/.test(message.text())) reported.push(message.text());
    });
    await emptyCatalogs(page);
    await page.goto('/');
    await expect(page.locator('.game-card')).toHaveCount(24);
    await scrollThrough(page);
    const navigation = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
    await navigation.getByRole('link', { name: 'Discover', exact: true }).click();
    await expect(page.locator('.discovery-card')).toHaveCount(24);
    await scrollThrough(page);
    await navigation.getByRole('link', { name: 'The 100', exact: true }).click();
    await expect(page).toHaveURL(/\/(\?.*)?$/);
    await expect(page.locator('.game-card')).toHaveCount(24);
    // As the Test Lab harness did: the document's first game link, clicked from script.
    await page.evaluate(() => document.querySelector<HTMLAnchorElement>('a[href*="game="]')!.click());
    await expect(page.locator('.game-dialog[open]')).toBeVisible();
    await page.goBack();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await navigation.getByRole('link', { name: 'My games', exact: true }).click();
    await expect(page).toHaveURL(/\/my-games/);
    await expect(page.locator('#my-games-title')).toBeVisible();
    await scrollThrough(page);
    expect(await page.evaluate(() => window.resizeObserverLoopErrors)).toEqual([]);
    expect(reported).toEqual([]);
  });
}
