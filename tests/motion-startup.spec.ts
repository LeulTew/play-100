import { expect, test } from '@playwright/test';
import { emptyPersonalLibrary } from '../src/lib/personal-library';
import { DB_NAME, DB_VERSION, STATE_KEY, STORE_NAME } from '../src/lib/personal-db';
import { motionHintKey } from '../src/lib/motion-hint';
import { emptyCatalogs } from './catalog-helpers';

declare global {
  interface Window {
    releaseGuestOpening: () => void;
    guestReadStartedBeforeRender: boolean;
    firstMotionPolicies: (string | null)[];
  }
}

for (const scenario of [
  { name: 'saved Lite', saved: 'lite', hint: 'lite', first: 'off', ready: 'off' },
  { name: 'saved Auto', saved: 'auto', hint: 'auto', first: 'on', ready: 'on' },
  { name: 'stale Full hint', saved: 'lite', hint: 'full', first: 'on', ready: 'off' },
  { name: 'absent hint', saved: 'auto', hint: null, first: 'off', ready: 'on' },
  { name: 'invalid hint', saved: 'auto', hint: '"full"', first: 'off', ready: 'on' },
  { name: 'blocked hint storage', saved: 'auto', hint: 'full', first: 'off', ready: 'on', blocked: true },
  { name: 'OS reduction overrides Full', saved: 'full', hint: 'full', first: 'off', ready: 'off', reduced: true },
  { name: 'Save-Data constrains Auto', saved: 'auto', hint: 'auto', first: 'off', ready: 'off', saveData: true },
] as const) {
  test(`startup hint: ${scenario.name}`, async ({ page }) => {
    await emptyCatalogs(page);
    await page.emulateMedia({ reducedMotion: 'reduced' in scenario ? 'reduce' : 'no-preference' });
    await page.goto('/favicon.svg');
    const state = { ...emptyPersonalLibrary(), motion: scenario.saved };
    await page.evaluate(({ name, version, store, key, state, hintKey, hint }) => new Promise<void>((resolve, reject) => {
      if (hint === null) localStorage.removeItem(hintKey);
      else localStorage.setItem(hintKey, hint);
      const open = indexedDB.open(name, version);
      open.onupgradeneeded = () => open.result.createObjectStore(store);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(state, key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    }), { name: DB_NAME, version: DB_VERSION, store: STORE_NAME, key: STATE_KEY, state, hintKey: motionHintKey('guest'), hint: scenario.hint });
    await page.addInitScript(({ name, blocked, saveData, hintKey }) => {
      Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 });
      Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
      Object.defineProperty(navigator, 'connection', {
        configurable: true, value: Object.assign(new EventTarget(), { saveData, effectiveType: '4g' }),
      });
      if (blocked) {
        const get = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key: string) {
          if (key === hintKey) throw new DOMException('Blocked hint storage', 'SecurityError');
          return get.call(this, key);
        };
      }
      window.firstMotionPolicies = [];
      new MutationObserver(changes => {
        const policyChanges = changes.filter(change => change.attributeName === 'data-motion');
        policyChanges.forEach((_, index) => {
          window.firstMotionPolicies.push(policyChanges[index + 1]?.oldValue ?? document.documentElement.getAttribute('data-motion'));
        });
      }).observe(document, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['data-motion'] });
      const releases: (() => void)[] = [];
      let held = true;
      window.releaseGuestOpening = () => { held = false; for (const release of releases.splice(0)) release(); };
      const open = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (...args: Parameters<IDBFactory['open']>) {
        const request = open.apply(this, args);
        if (args[0] === name && held) {
          window.guestReadStartedBeforeRender = !document.getElementById('root')?.hasChildNodes();
          request.addEventListener('success', event => {
            if (!held) return;
            event.stopImmediatePropagation();
            releases.push(() => request.dispatchEvent(new Event('success')));
          }, { once: true });
        }
        return request;
      };
    }, { name: DB_NAME, blocked: 'blocked' in scenario, saveData: 'saveData' in scenario, hintKey: motionHintKey('guest') });
    try {
      await page.goto('/?catalogs=off', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).toHaveAttribute('data-motion', scenario.first);
      expect(await page.evaluate(() => window.guestReadStartedBeforeRender)).toBe(true);
      expect((await page.evaluate(() => window.firstMotionPolicies))[0]).toBe(scenario.first);
      await page.evaluate(() => window.releaseGuestOpening());
      await expect(page.locator('.game-card .save-game').first()).toBeEnabled();
      await expect(page.locator('html')).toHaveAttribute('data-motion', scenario.ready);
      if (scenario.first === scenario.ready) {
        expect(await page.evaluate(() => window.firstMotionPolicies.every(value => value === document.documentElement.dataset.motion))).toBe(true);
      }
      if (!('blocked' in scenario)) {
        expect(await page.evaluate(key => localStorage.getItem(key), motionHintKey('guest'))).toBe(scenario.saved);
      }
    } finally { await page.evaluate(() => window.releaseGuestOpening()); }
  });
}
