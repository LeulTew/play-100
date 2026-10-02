import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { GOOGLE_REDIRECT_KEY } from '../src/lib/google-intent-key';
import { openBrowsingFilters } from './browsing-helpers';
import { emptyCatalogs } from './catalog-helpers';

// READINESS-08: the browser-floor smoke. The default gate runs current Chromium only, which is how a URLSearchParams.size
// read shipped. These flows broke or would break first on an engine at the floor (README.md, Browser support); they run
// on Firefox, WebKit and an old Chromium through `npm run test:floor` (docs/release-operations.md), never in the
// default run. Every test also removes URLSearchParams.prototype.size, which engines before Chrome 113, Firefox 112
// and Safari 17 lack.
test.use({ serviceWorkers: 'block' });

function recordPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Reflect.deleteProperty(URLSearchParams.prototype, 'size');
  });
});

test('a game detail opens through its link and keeps ?game= through close, reload and history', async ({ page }) => {
  await emptyCatalogs(page);
  const errors = recordPageErrors(page);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-app-started', '');
  await page.locator('[data-game="red-dead-redemption-2"] .game-link').click();
  await expect(page).toHaveURL(/[?&]game=red-dead-redemption-2(&|$)/);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Red Dead Redemption 2', exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Red Dead Redemption 2', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/?game=portal-2');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(/[?&]game=portal-2(&|$)/);
  expect(errors).toEqual([]);
});

test('Discover filters and paging keep the query through history and reload', async ({ page }) => {
  const errors = recordPageErrors(page);
  await page.goto('/discover?catalogs=off&campaign=preserved');
  await expect(page.locator('.discovery-results-heading')).not.toContainText('Loading');
  await expect(page.locator('[data-catalog-id]').first()).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Find a game', exact: true })).toBeVisible();
  await openBrowsingFilters(page);
  await page.getByRole('combobox', { name: 'Genre family', exact: true }).selectOption('role-playing');
  await expect(page).toHaveURL(/genreFamily=role-playing/);
  const first = await page.locator('[data-catalog-id]').first().getAttribute('data-catalog-id');
  await page
    .getByRole('navigation', { name: 'Catalog pages' })
    .getByRole('button', { name: 'Next', exact: true })
    .click();
  await expect(page).toHaveURL(/offset=24/);
  const url = new URL(page.url());
  expect(url.searchParams.get('genreFamily')).toBe('role-playing');
  expect(url.searchParams.get('campaign')).toBe('preserved');
  await expect(page.locator('[data-catalog-id]').first()).not.toHaveAttribute('data-catalog-id', first ?? '');
  await page.reload();
  await expect(page).toHaveURL(/offset=24/);
  await expect(page.locator('[data-catalog-id]').first()).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/offset=24/);
  await expect(page).toHaveURL(/genreFamily=role-playing/);
  expect(errors).toEqual([]);
});

test('My games tabs follow direct entry, clicks, reload and history', async ({ page }) => {
  await emptyCatalogs(page);
  const errors = recordPageErrors(page);
  await page.goto('/my-games?tab=queue&catalogs=off');
  const tabs = page.getByRole('navigation', { name: 'My games views', exact: true });
  const queue = tabs.getByRole('button', { name: /^Play later,/ });
  const library = tabs.getByRole('button', { name: /^Library,/ });
  await expect(queue).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveTitle('My games · Play later | Play 100');
  await library.click();
  await expect(library).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveTitle('My games · Library | Play 100');
  await page.reload();
  await expect(library).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page).toHaveURL(/[?&]tab=queue(&|$)/);
  await expect(queue).toHaveAttribute('aria-current', 'page');
  await page.goto('/my-rankings');
  await expect(page).toHaveTitle('My games · Ranking | Play 100');
  expect(errors).toEqual([]);
});

test('a Google sign-in return keeps its return path and clears the request', async ({ page }) => {
  await emptyCatalogs(page);
  const errors = recordPageErrors(page);
  await page.goto('/?catalogs=off');
  await expect(page.locator('html')).toHaveAttribute('data-app-started', '');
  test.skip(
    (await page.getByRole('link', { name: /^Account/ }).count()) === 0,
    'The sign-in return path needs a configured build.',
  );
  const returnPath = '/my-games?tab=queue';
  // A sign-in that left for Google and came back without a result: what an engine at the floor must parse and clear.
  await page.evaluate(({ key, intent }) => sessionStorage.setItem(key, JSON.stringify(intent)), {
    key: GOOGLE_REDIRECT_KEY,
    intent: {
      version: 1,
      requestId: '0123456789abcdef0123456789abcdef',
      createdAt: Date.now(),
      returnPath,
      kind: 'sign-in',
      uid: null,
    },
  });
  await page.goto(returnPath);
  await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), GOOGLE_REDIRECT_KEY)).toBeNull();
  await expect(page).toHaveURL(new RegExp(`${returnPath.replace('?', '\\?')}$`));
  expect(errors).toEqual([]);
});

// An engine below the floor cannot parse the entry and reports a SyntaxError from it; the boot script then shows the
// outdated-browser notice instead of a blank page (as entry-recovery.spec.ts checks in detail on current Chromium).
test('an engine below the floor gets the outdated-browser notice', async ({ page }) => {
  await emptyCatalogs(page);
  const html = await (await page.request.get('/')).text();
  const deferred = /<template id="p100-deferred">([\s\S]*?)<\/template>/.exec(html)?.[1] ?? '';
  const entry = /<script type="module" crossorigin src="(\/assets\/[^"]+\.js)"/.exec(deferred)?.[1];
  if (!entry) throw new Error('Build the app before this check: the startup template of index.html names no entry.');
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () =>
      window.dispatchEvent(
        new ErrorEvent('error', {
          error: new SyntaxError("Unexpected token '='"),
          filename: `${location.origin}/assets/index.js`,
          message: "Uncaught SyntaxError: Unexpected token '='",
        }),
      ),
    );
  });
  await page.route(
    (url) => url.pathname === entry,
    (route) => route.fulfill({ contentType: 'text/javascript', body: 'export {};' }),
  );
  await page.goto('/?catalogs=off');
  await expect(page.locator('#p100-boot-error').getByRole('heading', { level: 1 })).toHaveText(
    'This browser needs an update to open the collection.',
  );
});
