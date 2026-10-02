import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// iOS Safari zooms into any focused text field under 16px and keeps the zoom after Done, which strands the
// bottom navigation outside the visual viewport. Every text-entry control must compute to 16px on touch screens.
const TEXT_ENTRY =
  'input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], ' +
  'input[type="tel"], input[type="password"], input[type="number"], textarea, select';

async function readVisibleSizes(page: Page) {
  return page.locator(TEXT_ENTRY).evaluateAll((controls) =>
    controls
      .filter((control) => {
        const bounds = control.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0 && getComputedStyle(control).visibility !== 'hidden';
      })
      .map((control) => {
        const type = control.getAttribute('type');
        const classes = (control.getAttribute('class') ?? '').trim();
        return {
          control: `${control.tagName.toLowerCase()}${type ? `[${type}]` : ''}${classes ? `.${classes.split(/\s+/).join('.')}` : ''} "${control.getAttribute('aria-label') ?? control.getAttribute('name') ?? ''}"`,
          size: Number.parseFloat(getComputedStyle(control).fontSize),
        };
      }),
  );
}

async function expectTouchSafe(page: Page, screen: string, { required }: { required: boolean }) {
  const sizes = await readVisibleSizes(page);
  if (required) expect(sizes.length, `${screen} shows text-entry controls`).toBeGreaterThan(0);
  expect(
    sizes.filter(({ size }) => size < 16),
    `${screen}: every visible text-entry control is at least 16px`,
  ).toEqual([]);
}

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The coarse-pointer font-size floor is exercised in the mobile project.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('touch screens keep every text-entry control at 16px or more so iOS Safari never zooms', async ({ page }) => {
  await page.goto('/discover?catalogs=off');
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  await expect(page.getByRole('searchbox', { name: 'Find a game', exact: true })).toBeVisible();
  await expectTouchSafe(page, 'Discover', { required: true });
  await page.getByRole('searchbox', { name: 'Find a game', exact: true }).fill('portal');
  await expectTouchSafe(page, 'Discover with a query', { required: true });

  await page.goto('/');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Menu', exact: true })
    .getByRole('link', { name: 'Ranking', exact: true })
    .click();
  await page.getByRole('button', { name: 'Add games', exact: true }).click();
  await expectTouchSafe(page, 'Ranking game picker', { required: false });
  await page.getByRole('button', { name: 'Add Mass Effect 2 to ranking', exact: true }).click();
  await page.getByRole('button', { name: 'Close game picker', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Your rating / 10 for Mass Effect 2', exact: true })).toBeVisible();
  await page.locator('[data-record-id="mass-effect-2"] .ranking-note summary').click();
  await expect(page.getByRole('textbox', { name: 'Your note for Mass Effect 2', exact: true })).toBeVisible();
  await expectTouchSafe(page, 'Ranking score and note', { required: true });

  await page.goto('/my-games?catalogs=off');
  await expectTouchSafe(page, 'My games', { required: false });
});

test('the 16px floor covers every text-entry type, including controls on online-only screens', async ({ page }) => {
  // Account, friend, report, Compare and avatar fields only render with an online session; the floor is a
  // global coarse-pointer rule, so probing each control type under the app's real stylesheets covers them too.
  await page.goto('/?catalogs=off');
  const sizes = await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'search-field filter-select tier-select share-dialog ranking-note discovery-toolbar';
    host.innerHTML = [
      '<input>',
      ...['text', 'search', 'email', 'url', 'tel', 'password', 'number'].map((type) => `<input type="${type}">`),
      '<textarea></textarea>',
      '<select><option>One</option></select>',
    ].join('');
    document.body.append(host);
    const result = [...host.children].map((control) => ({
      control: `${control.tagName.toLowerCase()}[${control.getAttribute('type') ?? ''}]`,
      size: Number.parseFloat(getComputedStyle(control).fontSize),
    }));
    host.remove();
    return result;
  });
  expect(sizes).toHaveLength(10);
  expect(sizes.filter(({ size }) => size < 16)).toEqual([]);
});
