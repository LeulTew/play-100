import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { productionPolicy, recordViolations } from './csp-violation-helpers';

// SECURITY-01: every main route and its common dynamic UI render under the exact vercel.json main-document
// policy (strict style-src) without a single securitypolicyviolation. The worker is blocked so each
// navigation is a network document carrying that header; pwa-offline.spec covers the worker's copy.
test.use({ serviceWorkers: 'block' });

const deployed = Boolean(process.env.PLAY100_BASE_URL);
const routes = [
  '/', '/?catalogs=off', '/discover?catalogs=off', '/my-games', '/my-games?tab=queue', '/my-games?tab=ranking',
  '/my-library', '/my-rankings', '/compare', '/friends', '/friends/sharing', '/community', '/publish', '/invite',
  '/u/player_one', '/account', '/creator', '/data-use',
];

test('every main route renders under the production CSP without a violation', async ({ page, baseURL }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await emptyCatalogs(page);
  const violations = await recordViolations(page, deployed ? null : productionPolicy, new URL(baseURL ?? '/').origin);
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('#root > .site-header')).toBeVisible();
    await expect(page.locator('.first-paint-shell')).toHaveCount(0);
    await expect(page.locator('.route-fallback')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.mouse.wheel(0, 4000);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }
  expect(await violations.read()).toEqual([]);
  expect(errors).toEqual([]);
});

/** Mirrors selectQuality in artifact-controls.spec.ts. */
async function selectQuality(page: Page, name: 'Auto' | 'Full' | 'Lite') {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  const radio = page.getByRole('radio', { name: new RegExp(`^${name}`) });
  await radio.click();
  await expect(radio).toBeChecked();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.locator('.collection-artifact').scrollIntoViewIfNeeded();
}

test('landing dialogs, detail and the collection scene run under the production CSP without a violation', async ({ page, baseURL }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 });
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
    Object.defineProperty(navigator, 'connection', {
      configurable: true, value: Object.assign(new EventTarget(), { saveData: false, effectiveType: '4g' }),
    });
  });
  const violations = await recordViolations(page, deployed ? null : productionPolicy, new URL(baseURL ?? '/').origin);
  await page.goto('/');
  await expect(page.locator('.game-card')).toHaveCount(24);
  // Full starts WebGL on every device (Auto defers it on touch), so the scene's construction and controls run here.
  await selectQuality(page, 'Full');
  const artifact = page.locator('.collection-artifact');
  await expect(artifact).toHaveAttribute('data-scene-status', 'ready', { timeout: 0 });
  await expect(artifact).toHaveAttribute('data-render-mode', 'webgl');
  await page.getByRole('button', { name: 'Fan out the collection sleeves', exact: true }).click();
  await expect(artifact).toHaveAttribute('data-fanned', 'true');
  await page.locator('[data-game="red-dead-redemption-2"] .game-link').click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Red Dead Redemption 2', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  await expect(page.locator('.games-list')).toBeVisible();
  await page.goto('/?game=red-dead-redemption-2');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await violations.read()).toEqual([]);
  expect(errors).toEqual([]);
});
/** Every rendered element's box and resolved styles: a style a policy blocked would change one of them. */
const layout = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('body *'))
  .filter(element => element.getClientRects().length > 0)
  .map(element => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const properties = ['display', 'position', 'color', 'background-color', 'background-image', 'font-family', 'font-size',
      'font-weight', 'line-height', 'opacity', 'transform', 'visibility', 'border-top-width', 'box-shadow', 'z-index'];
    return `${element.tagName}.${element.className} ${[box.x, box.y + scrollY, box.width, box.height].map(value => value.toFixed(1)).join(',')} ${properties.map(name => style.getPropertyValue(name)).join('|')}`;
  }));

test('main routes lay out identically under the legacy and strict style-src', async ({ context, baseURL }, info) => {
  test.skip(deployed, 'Needs both policies on one build; a deployment serves only its own header.');
  test.setTimeout(120000);
  const origin = new URL(baseURL ?? '/').origin;
  const legacyPolicy = productionPolicy.replace(/style-src [^;]*/, "style-src 'self' 'unsafe-inline'");
  expect(legacyPolicy).not.toBe(productionPolicy);
  // Two tabs of one device context, each serving its own policy.
  const open = async (policy: string) => {
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await emptyCatalogs(page);
    return { page, violations: await recordViolations(page, policy, origin) };
  };
  const legacy = await open(legacyPolicy);
  const strict = await open(productionPolicy);
  try {
    for (const route of ['/', '/discover?catalogs=off', '/my-games?tab=ranking', '/compare', '/account', '/data-use', '/?game=red-dead-redemption-2']) {
      const snapshots: string[][] = [];
      for (const [name, { page }] of [['legacy', legacy], ['strict', strict]] as const) {
        await page.goto(route);
        await expect(page.locator('#root > .site-header')).toBeVisible();
        await expect(page.locator('.first-paint-shell')).toHaveCount(0);
        await expect(page.locator('.route-fallback')).toHaveCount(0);
        if (route.includes('game=')) await expect(page.getByRole('dialog')).toBeVisible();
        if (route === '/data-use') await expect(page.locator('#data-use h2')).toHaveCount(9);
        if (route === '/') await expect(page.locator('.game-card')).toHaveCount(24);
        // Lazy routes (configured builds especially) settle at different times in the two tabs, so each
        // capture waits for the route's loaded content and for every loading placeholder to go.
        if (route.startsWith('/discover')) {
          await expect(page.locator('.discovery-cards > li').first()).toBeVisible();
          await expect(page.getByRole('region', { name: 'Catalog games', exact: true })).toHaveAttribute('aria-busy', 'false');
        }
        if (route === '/account') await expect(page.locator('.auth-page, .account-heading, .empty-state').first()).toBeVisible();
        await expect(page.locator('[aria-busy="true"], .page-loading, .collection-loading, .route-fallback, [class*="skeleton"]')).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready.then(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
        await page.screenshot({ path: info.outputPath(`${name}${route.replace(/[^a-z0-9]+/gi, '-')}.png`), animations: 'disabled' });
        snapshots.push(await layout(page));
      }
      expect(snapshots[1], `${route} under the strict style-src`).toEqual(snapshots[0]);
    }
    expect(await strict.violations.read()).toEqual([]);
  } finally {
    await legacy.page.close();
    await strict.page.close();
  }
});