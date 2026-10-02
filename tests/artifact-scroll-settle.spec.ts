import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { motionHintKey } from '../src/lib/motion-hint';

declare global {
  interface Window {
    sceneMarks: { name: string; at: number }[];
    lastScrollAt: number;
  }
}

const NUDGE_MS = 3000;

// The 3D scene's start-up turns are long tasks, and one that landed mid-scroll held the frames the scroll needed.
// Automatic starts now wait for scrolling to pause for 300 ms (CollectionArtifact, scroll-settle.ts): a visit that
// scrolls from the moment the page parses sees the scene's first start-up mark only once it has stopped.
test('the 3D scene starts only once scrolling has paused', async ({ page }) => {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(
    ({ hintKey, nudgeMs }) => {
      localStorage.setItem('play100.library.v1', JSON.stringify({ version: 1, motion: 'full', progress: {} }));
      localStorage.setItem(hintKey, 'full');
      Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 });
      Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
      window.sceneMarks = [];
      const mark = performance.mark.bind(performance);
      performance.mark = (name, options) => {
        const entry = mark(name, options);
        if (name.startsWith('p100:scene:')) window.sceneMarks.push({ name, at: entry.startTime });
        return entry;
      };
      window.lastScrollAt = Number.NEGATIVE_INFINITY;
      addEventListener(
        'scroll',
        () => {
          window.lastScrollAt = performance.now();
        },
        { capture: true, passive: true },
      );
      // A few pixels down and back every 50 ms, which keeps the artifact on screen, so only scrolling holds it back.
      let down = false;
      const nudge = setInterval(() => {
        if (performance.now() > nudgeMs) {
          clearInterval(nudge);
          return;
        }
        down = !down;
        scrollTo(0, down ? 6 : 0);
      }, 50);
    },
    { hintKey: motionHintKey('guest'), nudgeMs: NUDGE_MS },
  );
  await page.goto('/?catalogs=off');
  const artifact = page.locator('.collection-artifact');
  await expect(artifact).toHaveAttribute('data-activation', 'automatic');
  await expect(artifact).toHaveAttribute('data-scene-status', 'ready', { timeout: 30_000 });
  await expect(artifact).toHaveAttribute('data-render-mode', 'webgl');
  const { marks, lastScrollAt } = await page.evaluate(() => ({
    marks: window.sceneMarks,
    lastScrollAt: window.lastScrollAt,
  }));
  // The page did scroll through the time a scene would otherwise start, about a second in.
  expect(lastScrollAt).toBeGreaterThan(NUDGE_MS - 500);
  expect(marks.map(({ name }) => name)).toEqual(
    expect.arrayContaining(['p100:scene:module-start', 'p100:scene:context-start', 'p100:scene:first-render-end']),
  );
  for (const { name, at } of marks) expect(at, name).toBeGreaterThanOrEqual(lastScrollAt + 300);
});
