import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { motionHintKey } from '../src/lib/motion-hint';

declare global {
  interface Window {
    pendingArtifactIdle: () => number;
    flushArtifactIdle: () => void;
    pendingArtifactIdleTimeouts: () => (number | null)[];
    unboundedArtifactIdle: () => number;
    firedArtifactIdleTimeouts: number[];
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

    const pending = new Map<number, { callback: IdleRequestCallback; timeout?: number }>();
    let next = 0;
    window.requestIdleCallback = (callback, options) => {
      const id = ++next;
      pending.set(id, { callback, timeout: options?.timeout });
      return id;
    };
    window.cancelIdleCallback = id => { pending.delete(id); };
    window.pendingArtifactIdle = () => pending.size;
    window.pendingArtifactIdleTimeouts = () => [...pending.values()].map(entry => entry.timeout ?? null);
    window.flushArtifactIdle = () => {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const { callback } of callbacks) callback({ didTimeout: false, timeRemaining: () => 50 });
    };
  }, motionHintKey('guest'));
  await page.goto('/?catalogs=off');
  const artifact = page.locator('.collection-artifact');
  await artifact.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.pendingArtifactIdle())).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => window.pendingArtifactIdleTimeouts())).toContain(null);
  await expect(artifact.locator('canvas')).toHaveCount(0);
  await page.evaluate(() => window.flushArtifactIdle());
  await expect.poll(() => page.evaluate(() => window.pendingArtifactIdle())).toBe(1);
  expect(await page.evaluate(() => window.pendingArtifactIdleTimeouts())).toEqual([null]);
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

for (const quality of ['auto', 'full'] as const) {
  test(`${quality}: explicit fan activation escapes a never-idle queue without advancing automatic work`, async ({ page, isMobile }) => {
    await emptyCatalogs(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(({ hintKey, quality }) => {
      localStorage.setItem('play100.library.v1', JSON.stringify({ version: 1, motion: quality, progress: {} }));
      localStorage.setItem(hintKey, quality);
      Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 });
      Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
      Object.defineProperty(navigator, 'connection', {
        configurable: true, value: Object.assign(new EventTarget(), { saveData: false, effectiveType: '4g' }),
      });
      let next = 0;
      const unbounded = new Set<number>();
      const timers = new Map<number, number>();
      window.firedArtifactIdleTimeouts = [];
      window.unboundedArtifactIdle = () => unbounded.size;
      window.requestIdleCallback = (callback, options) => {
        const id = ++next;
        const timeout = options?.timeout;
        if (timeout === undefined) unbounded.add(id);
        else timers.set(id, window.setTimeout(() => {
          timers.delete(id);
          window.firedArtifactIdleTimeouts.push(timeout);
          callback({ didTimeout: true, timeRemaining: () => 0 });
        }, timeout));
        return id;
      };
      window.cancelIdleCallback = id => {
        unbounded.delete(id);
        const timer = timers.get(id);
        if (timer !== undefined) window.clearTimeout(timer);
        timers.delete(id);
      };
    }, { hintKey: motionHintKey('guest'), quality });
    const sceneRequests: string[] = [];
    page.on('request', request => {
      if (/\/assets\/CollectionScene-[^/]+\.js(?:\?|$)/.test(request.url())) sceneRequests.push(request.url());
    });
    await page.goto('/?catalogs=off');
    await expect(page.locator('.save-game').first()).toBeEnabled();
    const artifact = page.locator('.collection-artifact');
    await artifact.scrollIntoViewIfNeeded();
    if (quality === 'auto' && isMobile) {
      await expect(artifact).toHaveAttribute('data-activation', 'on-demand');
      expect(await page.evaluate(() => window.unboundedArtifactIdle())).toBe(0);
    } else {
      await expect(artifact).toHaveAttribute('data-activation', 'automatic');
      await expect.poll(() => page.evaluate(() => window.unboundedArtifactIdle())).toBe(1);
    }
    expect(sceneRequests).toEqual([]);
    await expect(artifact.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Fan out the collection sleeves', exact: true }).click();
    await expect(artifact).toHaveAttribute('data-scene-status', 'ready', { timeout: 0 });
    await expect(artifact).toHaveAttribute('data-render-mode', 'webgl');
    await expect(artifact).toHaveAttribute('data-fanned', 'true');
    expect(sceneRequests).toHaveLength(1);
    expect(await page.evaluate(() => window.unboundedArtifactIdle())).toBe(0);
    expect(await page.evaluate(() => window.firedArtifactIdleTimeouts.filter(timeout => timeout === 150))).toEqual([150, 150]);
    const canvas = await artifact.locator('canvas').elementHandle();
    if (!canvas) throw new Error('Explicit fan activation must create the real scene canvas.');
    await page.getByRole('button', { name: 'Stack up the collection sleeves', exact: true }).click();
    await expect(artifact).toHaveAttribute('data-fanned', 'false');
    expect(await canvas.evaluate(node => node.isConnected && node === document.querySelector('.artifact-canvas canvas'))).toBe(true);
    await canvas.dispose();
  });
}
