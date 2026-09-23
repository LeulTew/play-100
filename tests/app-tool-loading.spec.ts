import path from 'node:path';
import { readBuildManifest } from '../scripts/build-metadata';
import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { motionHintKey } from '../src/lib/motion-hint';

declare global {
  interface Window {
    pendingAppToolIdle: () => number;
    flushAppToolIdle: () => void;
  }
}

const roots = [
  'src/lib/discovery-catalog.ts', 'src/lib/google-intent.ts',
  'src/lib/comparison-game-filter.ts', 'src/lib/friend-comparison-intent.ts',
];

for (const policy of [
  { name: 'capable Full', saveData: false, effectiveType: '4g', allowed: true },
  { name: 'Save-Data', saveData: true, effectiveType: '4g', allowed: false },
  { name: '2G', saveData: false, effectiveType: '2g', allowed: false },
]) {
  test(`noncritical tools stay out of initial requests and warm only when allowed: ${policy.name}`, async ({ page, isMobile }) => {
    const manifest = await readBuildManifest(path.join(process.cwd(), 'dist'));
    const files = roots.map(root => {
      const entry = manifest[root];
      if (!entry) throw new Error(`Missing separately emitted tool: ${root}`);
      return `/${entry.file}`;
    });
    const requested = new Set<string>();
    const catalogRequests: string[] = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (files.includes(url.pathname)) requested.add(url.pathname);
      if (/\/(?:api\/catalog|data\/discovery\/catalog)/.test(url.pathname)) catalogRequests.push(url.pathname);
    });
    await emptyCatalogs(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(({ hintKey, policy }) => {
      localStorage.setItem('play100.library.v1', JSON.stringify({ version: 1, motion: 'full', progress: {} }));
      localStorage.setItem(hintKey, 'full');
      Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 });
      Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
      Object.defineProperty(navigator, 'connection', {
        configurable: true, value: Object.assign(new EventTarget(), { saveData: policy.saveData, effectiveType: policy.effectiveType }),
      });
      const pending = new Map<number, IdleRequestCallback>();
      let id = 0;
      window.requestIdleCallback = callback => { pending.set(++id, callback); return id; };
      window.cancelIdleCallback = key => { pending.delete(key); };
      window.pendingAppToolIdle = () => pending.size;
      window.flushAppToolIdle = () => {
        const callbacks = [...pending.values()];
        pending.clear();
        for (const callback of callbacks) callback({ didTimeout: false, timeRemaining: () => 50 });
      };
    }, { hintKey: motionHintKey('guest'), policy });
    await page.goto('/?catalogs=off');
    await expect(page.locator('.game-card')).toHaveCount(24);
    await expect(page.locator('.game-card .save-game').first()).toBeEnabled();
    expect([...requested]).toEqual([]);
    const navigation = page.locator(isMobile ? '.mobile-nav' : '.desktop-nav');
    await navigation.getByRole('link', { name: 'Discover', exact: true }).focus();
    if (policy.allowed) {
      await expect.poll(() => requested.has(files[0]!)).toBe(true);
      await expect.poll(() => page.evaluate(() => window.pendingAppToolIdle())).toBeGreaterThan(0);
    } else expect([...requested]).toEqual([]);
    await page.evaluate(() => window.flushAppToolIdle());
    if (policy.allowed) await expect.poll(() => [...requested].sort()).toEqual([...new Set(files)].sort());
    else expect([...requested]).toEqual([]);
    expect(catalogRequests).toEqual([]);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(navigation.getByRole('link', { name: 'Discover', exact: true })).toBeFocused();
  });
}
