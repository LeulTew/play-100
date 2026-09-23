import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { motionHintKey } from '../src/lib/motion-hint';

declare global {
  interface Window {
    pendingArtifactIdle: () => number;
    flushArtifactIdle: () => void;
  }
}

test('3D module loading and visible WebGL construction use separate cancelable idle turns', async ({ page }) => {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(hintKey => {
    localStorage.setItem('play100.library.v1', JSON.stringify({ version: 1, motion: 'full', progress: {} }));
    localStorage.setItem(hintKey, 'full');
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 });
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
    Object.defineProperty(navigator, 'connection', {
      configurable: true, value: Object.assign(new EventTarget(), { saveData: false, effectiveType: '4g' }),
    });
    const pending = new Map<number, IdleRequestCallback>();
    let next = 0;
    window.requestIdleCallback = callback => { const id = ++next; pending.set(id, callback); return id; };
    window.cancelIdleCallback = id => { pending.delete(id); };
    window.pendingArtifactIdle = () => pending.size;
    window.flushArtifactIdle = () => {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback({ didTimeout: false, timeRemaining: () => 50 });
    };
  }, motionHintKey('guest'));
  await page.goto('/?catalogs=off');
  const artifact = page.locator('.collection-artifact');
  await artifact.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.pendingArtifactIdle())).toBeGreaterThanOrEqual(2);
  await expect(artifact.locator('canvas')).toHaveCount(0);
  await page.evaluate(() => window.flushArtifactIdle());
  await expect.poll(() => page.evaluate(() => window.pendingArtifactIdle())).toBe(1);
  await expect(artifact.locator('canvas')).toHaveCount(0);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.pendingArtifactIdle())).toBe(0);
  await page.evaluate(() => window.flushArtifactIdle());
  await expect(artifact.locator('canvas')).toHaveCount(0);
  await artifact.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.pendingArtifactIdle())).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => window.pendingArtifactIdle())).toBe(0);
  await expect(artifact.locator('canvas')).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => window.pendingArtifactIdle())).toBeGreaterThanOrEqual(1);
  await page.evaluate(() => window.flushArtifactIdle());
  await expect(artifact.locator('canvas')).toHaveCount(1);
  await expect(artifact).toHaveAttribute('data-render-mode', 'webgl');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(artifact).toHaveAttribute('data-scene-status', 'static');
  await expect(artifact.locator('canvas')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.pendingArtifactIdle())).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => page.evaluate(() => window.pendingArtifactIdle())).toBeGreaterThanOrEqual(2);
  await page.evaluate(() => window.flushArtifactIdle());
  await expect.poll(() => page.evaluate(() => window.pendingArtifactIdle())).toBe(1);
  await page.evaluate(() => {
    history.pushState({}, '', '/discover?catalogs=off');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(artifact).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.pendingArtifactIdle())).toBe(0);
  await page.evaluate(() => window.flushArtifactIdle());
  await expect(page.locator('.artifact-canvas canvas')).toHaveCount(0);
});
