import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { NOTICE_OPEN } from '../scripts/first-paint/shell-html';
import { emptyCatalogs } from './catalog-helpers';
import { productionPolicy, recordViolations } from './csp-violation-helpers';

declare global {
  interface Window {
    p100NoticeShown?: boolean;
  }
}

// REL-04: when the module entry or one of its static imports does not load, React never starts. The first-paint boot
// script (src/first-paint/boot.js) then replaces the shell with the failure notice index.html keeps hidden in #root.
// Documents carry the production policy, under which the notice has to work without an inline handler or style.
test.use({ serviceWorkers: 'block' });

const deployed = Boolean(process.env.PLAY100_BASE_URL);

/** The module entry and the entry stylesheet the served document's startup template names. */
async function startupAssets(page: Page): Promise<{ entry: string; stylesheet: string }> {
  const html = await (await page.request.get('/')).text();
  const deferred = /<template id="p100-deferred">([\s\S]*?)<\/template>/.exec(html)?.[1] ?? '';
  const entry = /<script type="module" crossorigin src="(\/assets\/[^"]+\.js)"/.exec(deferred)?.[1];
  const stylesheet = /<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)"/.exec(deferred)?.[1];
  if (!entry || !stylesheet)
    throw new Error(
      'Build the app before this check: index.html has no startup template with an entry script and stylesheet.',
    );
  return { entry, stylesheet };
}

/** Whether the entry stylesheet has loaded and applies. */
async function stylesheetApplied(page: Page, href: string): Promise<boolean> {
  return page.evaluate((path) => Array.from(document.styleSheets).some((sheet) => sheet.href?.endsWith(path)), href);
}

/**
 * The notice wears ErrorBoundary's page style, and its Reload button and workbook link are normal targets at every
 * viewport, whether its rules come from the entry stylesheet or, when that failed too, from the inline style alone.
 */
async function expectNoticeStyled(page: Page, when: string): Promise<void> {
  const notice = page.locator('#p100-boot-error');
  const look = await notice.evaluate((main) => {
    const style = (selector: string) => getComputedStyle(main.querySelector(selector)!);
    return {
      page: getComputedStyle(main).maxWidth,
      heading: style('h1').fontSize,
      paragraph: style('p').marginTop,
      link: `${style('a').display} ${style('a').minHeight}`,
      button: style('button').minHeight,
    };
  });
  expect(look, `${when}: the error page's rules apply`).toEqual({
    page: '650px',
    heading: '56px',
    paragraph: '24px',
    link: 'block 44px',
    button: '48px',
  });
  for (const target of [notice.getByRole('button'), notice.getByRole('link')]) {
    const box = await target.boundingBox();
    expect(box?.height ?? 0, `${when}: a normal target`).toBeGreaterThanOrEqual(44);
  }
}

for (const path of ['/', '/?catalogs=off']) {
  test(`a normal start never shows the failure notice: ${path}`, async ({ page, baseURL }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await emptyCatalogs(page);
    const violations = await recordViolations(page, deployed ? null : productionPolicy, new URL(baseURL ?? '/').origin);
    await page.addInitScript(() => {
      window.p100NoticeShown = false;
      new MutationObserver((records) => {
        for (const { target } of records) {
          if (target instanceof HTMLElement && target.id === 'p100-boot-error' && !target.hidden)
            window.p100NoticeShown = true;
        }
      }).observe(document, { attributes: true, attributeFilter: ['hidden'], subtree: true });
    });
    const served = await (await page.request.get(path)).text();
    expect(served).toContain(NOTICE_OPEN);
    await page.goto(path);
    await expect(page.locator('.game-card')).toHaveCount(24);
    await expect(page.locator('html')).toHaveAttribute('data-app-started', '');
    await expect(page.locator('#p100-boot-error'), "React's first commit replaced it").toHaveCount(0);
    expect(await page.evaluate(() => window.p100NoticeShown)).toBe(false);
    expect(await violations.read()).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const { path, stylesheet } of [
  { path: '/', stylesheet: false },
  { path: '/?catalogs=off', stylesheet: false },
  { path: '/', stylesheet: true },
]) {
  const name = `${path}${stylesheet ? ' without the entry stylesheet' : ''}`;
  test(`a failed module entry shows the failure notice, and Reload recovers: ${name}`, async ({ page, baseURL }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await emptyCatalogs(page);
    const violations = await recordViolations(page, deployed ? null : productionPolicy, new URL(baseURL ?? '/').origin);
    const assets = await startupAssets(page);
    let blocked = true;
    const refused: string[] = [];
    await page.route(
      (url) => url.pathname === assets.entry || (stylesheet && url.pathname === assets.stylesheet),
      (route) => {
        if (!blocked) return route.fallback();
        refused.push(new URL(route.request().url()).pathname);
        return route.abort('failed');
      },
    );
    await page.goto(path);
    const notice = page.locator('#p100-boot-error');
    await expect(notice.getByRole('alert')).toContainText("The collection couldn't finish loading.");
    await expect(notice.getByRole('heading', { level: 1 })).toHaveText("The collection couldn't finish loading.");
    await expect(page.locator('.first-paint-shell'), 'the notice replaces the shell').toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-app-started');
    expect(refused).toContain(assets.entry);
    const workbook = notice.getByRole('link', { name: 'Or download the workbook', exact: true });
    await expect(workbook).toHaveAttribute('href', '/downloads/Play-100-Collection.xlsx');
    await expect(workbook).toHaveAttribute('download', '');
    const reload = notice.getByRole('button', { name: 'Reload the collection', exact: true });
    await expect(reload).toBeEnabled();
    // On / the notice usually appears before the entry stylesheet has arrived, so its rules are inline as well.
    await expectNoticeStyled(page, 'as the notice appears');
    if (stylesheet) {
      expect(await stylesheetApplied(page, assets.stylesheet), 'the entry stylesheet failed').toBe(false);
    } else {
      await expect.poll(() => stylesheetApplied(page, assets.stylesheet)).toBe(true);
      await expectNoticeStyled(page, 'with the entry stylesheet');
    }
    blocked = false;
    await Promise.all([page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame()), reload.click()]);
    await expect(page.locator('.game-card')).toHaveCount(24);
    await expect(page.locator('#p100-boot-error')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-app-started', '');
    expect(await violations.read()).toEqual([]);
    expect(errors).toEqual([]);
  });
}
