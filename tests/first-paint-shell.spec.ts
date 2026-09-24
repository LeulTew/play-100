import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { mainDocumentPolicy } from '../scripts/first-paint/csp';
import { motionHintKey } from '../src/lib/motion-hint';
import { emptyCatalogs } from './catalog-helpers';

interface Box { key: string; text: string; x: number; y: number; width: number; height: number; style: string }

declare global {
  interface Window {
    p100Capture: (selectors: readonly string[]) => Box[];
    p100Commit?: Box[];
    p100CspViolations: string[];
    p100TakeLayoutShift?: () => number;
  }
}

interface Scenario {
  name: string;
  hint: 'auto' | 'full' | null;
  art: (mobile: boolean) => string;
  saveData?: boolean;
  reducedMotion?: boolean;
  fontSwap?: boolean;
}

// The production main-document policy, so the inline boot script only runs if vercel.json allows its hash.
const policy = mainDocumentPolicy(JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')));
// Elements both the static shell and React's first commit render. React also paints the decorative
// artifact still, which is absolutely positioned and moves nothing.
const SHARED = [
  '.skip-link', '.site-header', '.wordmark', '.desktop-nav a', '.header-actions > *', '.hero', '#hero-title', '#hero-title span',
  '.hero-copy > p', '.hero-actions .button', '.collection-dot', '.collection-artifact', '.artifact-stage', '.artifact-footer',
  '.artifact-caption-title', '.artifact-status', '.artifact-control', '#collection', '#collection-title', '.collection-loading > p',
  '.loading-jackets span', '.mobile-nav > *',
];
const FONT_SWAP = ['.wordmark', '.desktop-nav a', '.header-actions > *', '#hero-title', '.hero-copy > p', '.hero-actions .button', '#collection-title', '.collection-loading > p', '.mobile-nav > *'];
const SCENARIOS: readonly Scenario[] = [
  { name: 'no saved hint', hint: null, art: () => 'lite' },
  { name: 'saved Auto', hint: 'auto', art: mobile => mobile ? 'tap' : 'ready' },
  { name: 'saved Full', hint: 'full', art: () => 'ready' },
  { name: 'Save-Data', hint: 'auto', saveData: true, art: () => 'saving' },
  // Reduced motion keeps the artifact static after the library opens, so only the fonts change later.
  { name: 'reduced motion', hint: 'full', reducedMotion: true, art: () => 'reduced', fontSwap: true },
];

/** Holds matching requests until the returned function releases them. */
async function hold(page: Page, matches: (url: URL) => boolean): Promise<() => void> {
  let open = () => {};
  const gate = new Promise<void>(resolve => { open = resolve; });
  await page.route(matches, async (route: Route) => {
    await gate;
    await route.continue().catch(() => undefined);
  });
  return () => open();
}

const frames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const capture = (page: Page, selectors: readonly string[]) => page.evaluate(list => window.p100Capture(list), selectors);

function differences(before: Box[], after: Box[], tolerance: number): string[] {
  const keys = [...new Set([...before, ...after].map(box => box.key))];
  return keys.flatMap(key => {
    const from = before.find(box => box.key === key);
    const to = after.find(box => box.key === key);
    if (!from || !to) return [`${key}: ${from ? 'no longer rendered' : 'newly rendered'}`];
    const changes = (['x', 'y', 'width', 'height'] as const).filter(side => Math.abs(from[side] - to[side]) > tolerance)
      .map(side => `${side} ${from[side].toFixed(2)} -> ${to[side].toFixed(2)}`);
    if (from.text !== to.text) changes.push(`text "${from.text}" -> "${to.text}"`);
    if (from.style !== to.style) changes.push(`style ${from.style} -> ${to.style}`);
    return changes.length ? [`${key}: ${changes.join('; ')}`] : [];
  });
}

/** Web fonts may change widths slightly, but nothing may move 3px or more or wrap differently. */
function fontSwapDifferences(before: Box[], after: Box[]): string[] {
  if (before.map(box => box.key).join() !== after.map(box => box.key).join()) return ['different elements are rendered'];
  return before.flatMap((from, index) => {
    const to = after[index]!;
    const moved = Math.abs(from.x - to.x) >= 3 || Math.abs(from.y - to.y) >= 3 || Math.abs(from.height - to.height) > 1;
    return moved ? [`${from.key}: (${from.x.toFixed(2)}, ${from.y.toFixed(2)}, h ${from.height.toFixed(2)}) -> (${to.x.toFixed(2)}, ${to.y.toFixed(2)}, h ${to.height.toFixed(2)})`] : [];
  });
}

for (const scenario of SCENARIOS) {
  test(`first paint equals React's first commit: ${scenario.name}`, async ({ page, isMobile }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await emptyCatalogs(page);
    await page.emulateMedia({ reducedMotion: scenario.reducedMotion ? 'reduce' : 'no-preference' });
    await page.addInitScript(({ key, hint, saveData }) => {
      const properties = ['color', 'background-color', 'border-top-color', 'border-top-width', 'font-family', 'font-size', 'font-weight',
        'font-style', 'letter-spacing', 'line-height', 'text-transform', 'text-decoration-line', 'opacity', 'visibility', 'box-shadow'];
      window.p100Capture = selectors => selectors.flatMap(selector => Array.from(document.querySelectorAll<HTMLElement>(`#root ${selector}`))
        .filter(element => element.getClientRects().length > 0)
        .map((element, index) => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const before = getComputedStyle(element, '::before');
          const after = getComputedStyle(element, '::after');
          return {
            key: `${selector} #${index}`, text: element.innerText.replace(/\s+/g, ' ').trim(),
            x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height,
            style: [...properties.map(name => style.getPropertyValue(name)), before.content, before.backgroundColor, after.content, after.backgroundColor].join(' | '),
          };
        }));
      window.p100CspViolations = [];
      document.addEventListener('securitypolicyviolation', event => { window.p100CspViolations.push(`${event.effectiveDirective} ${event.blockedURI}`); });
      Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 });
      Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
      Object.defineProperty(navigator, 'connection', { configurable: true, value: Object.assign(new EventTarget(), { saveData, effectiveType: '4g' }) });
      try {
        if (hint === null) localStorage.removeItem(key);
        else localStorage.setItem(key, hint);
      } catch { /* Documents without storage (about:blank) never show the shell. */ }
    }, { key: motionHintKey('guest'), hint: scenario.hint, saveData: Boolean(scenario.saveData) });
    await page.route(url => url.pathname === '/', async route => {
      if (route.request().resourceType() !== 'document') return route.fallback();
      const response = await route.fetch();
      const headers = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => !['content-encoding', 'content-length'].includes(name)));
      await route.fulfill({ response, headers: { ...headers, 'content-security-policy': policy } });
    });
    const built = await (await page.request.get('/')).text();
    const entryScript = /<script type="module" crossorigin src="(\/assets\/[^"]+\.js)"/.exec(built)?.[1];
    const entryStylesheet = /<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)"/.exec(built)?.[1];
    if (!entryScript || !entryStylesheet) throw new Error('Build the app before this check: index.html has no entry script and stylesheet.');
    const releaseScript = await hold(page, url => url.pathname === entryScript);
    const releaseStylesheet = await hold(page, url => url.pathname === entryStylesheet);
    const releaseFonts = await hold(page, url => url.pathname.endsWith('.woff2'));
    const releaseCollection = await hold(page, url => url.pathname === '/data/collection.json');
    try {
      await page.goto('/', { waitUntil: 'commit' });
      await page.waitForFunction(() => document.querySelector('.first-paint-shell .loading-jackets') !== null);
      expect(await page.evaluate(() => [document.documentElement.dataset.boot, document.documentElement.dataset.bootArt]),
        'the boot script accepts the shell (it runs only under its CSP hash and with the metric-matched local fonts)').toEqual(['landing', scenario.art(isMobile)]);
      await expect(page.locator('head > style')).toHaveCount(1);
      await expect(page.locator('head > script:not([src])')).toHaveCount(1);
      test.info().annotations.push({ type: 'shell variant', description: await page.evaluate(() => document.querySelector('.first-paint-shell .site-header-online') ? 'online' : 'offline') });
      await frames(page);
      const critical = await capture(page, SHARED);
      expect(critical.length).toBeGreaterThan(20);

      releaseStylesheet();
      await page.waitForFunction(href => Array.from(document.styleSheets).some(sheet => sheet.href !== null && new URL(sheet.href).pathname === href), entryStylesheet);
      await frames(page);
      const shell = await capture(page, SHARED);
      expect(differences(critical, shell, 0.01), 'the inline critical CSS renders the shell exactly like the full stylesheet').toEqual([]);

      await page.evaluate(selectors => {
        const root = document.getElementById('root');
        if (!root) throw new Error('#root is missing.');
        new MutationObserver((_, observer) => {
          if (document.querySelector('.first-paint-shell') || !document.querySelector('#root > .site-header')) return;
          observer.disconnect();
          window.p100Commit = window.p100Capture(selectors);
        }).observe(root, { childList: true });
      }, SHARED);
      releaseScript();
      await page.waitForFunction(() => window.p100Commit !== undefined);
      const commit = await page.evaluate(() => window.p100Commit ?? []);
      expect(differences(shell, commit, 0.5), 'React\'s first commit renders exactly what the shell painted').toEqual([]);

      if (scenario.fontSwap) {
        await page.waitForFunction(() => document.documentElement.dataset.motion !== undefined);
        await frames(page);
        const before = await capture(page, FONT_SWAP);
        await page.evaluate(() => {
          let total = 0;
          const add = (entries: PerformanceEntryList) => {
            for (const entry of entries) {
              if ('value' in entry && typeof entry.value === 'number' && !('hadRecentInput' in entry && entry.hadRecentInput)) total += entry.value;
            }
          };
          const observer = new PerformanceObserver(list => add(list.getEntries()));
          observer.observe({ type: 'layout-shift' });
          window.p100TakeLayoutShift = () => { add(observer.takeRecords()); return total; };
        });
        releaseFonts();
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        await frames(page);
        const after = await capture(page, FONT_SWAP);
        expect(fontSwapDifferences(before, after), 'web fonts replace the metric-matched fallbacks without reflow').toEqual([]);
        expect(await page.evaluate(() => window.p100TakeLayoutShift?.() ?? Number.NaN), 'layout shift while the web fonts swap in').toBe(0);
      }
      expect(await page.evaluate(() => window.p100CspViolations)).toEqual([]);
    } finally {
      for (const release of [releaseScript, releaseStylesheet, releaseFonts, releaseCollection]) release();
    }
    expect(errors).toEqual([]);
  });
}
