import { expect, test } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { openMenu } from './readability-helpers';
import { installGuestLibrary, libraryFixture, libraryRecords } from './library-pagination-helpers';

test('Settings exposes Export and Import without scrolling at 1440x900', async ({ page, baseURL }) => {
  expect(['127.0.0.1', 'localhost']).toContain(new URL(baseURL!).hostname);
  await page.setViewportSize({ width: 1440, height: 900 });
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?info=settings&catalogs=off');
  const settings = page.getByRole('dialog', { name: 'Settings & backups', exact: true });
  await expect(settings.locator('#settings-title')).toBeFocused();
  await expect(settings.getByRole('button', { name: 'Export my library', exact: true })).toBeEnabled();
  await expect(settings.getByRole('button', { name: 'Import backup', exact: true })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  const layout = await settings.evaluate((dialog) => {
    const backup = dialog.querySelector('.backup-panel');
    const preferences = dialog.querySelector('.motion-options');
    if (!backup || !preferences) throw new Error('Both Settings destinations must remain present.');
    const bounds = dialog.getBoundingClientRect();
    const buttons = [...backup.querySelectorAll('button')].slice(0, 2);
    const account = dialog.querySelector('.settings-account');
    return {
      scrollTop: dialog.scrollTop,
      beforePreferences: Boolean(backup.compareDocumentPosition(preferences) & Node.DOCUMENT_POSITION_FOLLOWING),
      accountRules: account
        ? {
            top: getComputedStyle(account).borderTopWidth,
            bottom: getComputedStyle(account).borderBottomWidth,
            nextTop: getComputedStyle(account.nextElementSibling!).borderTopWidth,
          }
        : null,
      preferenceGap: preferences.getBoundingClientRect().top - backup.getBoundingClientRect().bottom,
      sectionRhythm: [...dialog.querySelectorAll('.backup-panel, .motion-options, section.device-settings')].map(
        (section) => {
          const style = getComputedStyle(section);
          return { margin: style.marginTop, padding: style.paddingTop, rule: style.borderTopWidth };
        },
      ),
      controls: buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          name: button.textContent?.trim(),
          visible:
            rect.top >= Math.max(0, bounds.top) &&
            rect.bottom <= Math.min(innerHeight, bounds.bottom) &&
            rect.left >= bounds.left &&
            rect.right <= bounds.right,
          hit: button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
        };
      }),
    };
  });
  expect(layout.scrollTop).toBe(0);
  expect(layout.beforePreferences).toBe(true);
  if (layout.accountRules) expect(layout.accountRules).toEqual({ top: '1px', bottom: '0px', nextTop: '1px' });
  expect(layout.preferenceGap).toBeGreaterThanOrEqual(28);
  expect(layout.sectionRhythm).toHaveLength(3);
  for (const rhythm of layout.sectionRhythm)
    expect(rhythm).toEqual({ margin: '28px', padding: '25px', rule: '1px' });
  expect(layout.controls.map((button) => button.name)).toEqual(['Export my library', 'Import backup']);
  expect(layout.controls.every((button) => button.visible && button.hit)).toBe(true);
});

test('committed Settings and About own the title, and Close restores the route title', async ({
  page,
  context,
  baseURL,
}) => {
  expect(['127.0.0.1', 'localhost']).toContain(new URL(baseURL!).hostname);
  await context.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort('blockedbyclient'),
  );
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?info=settings&catalogs=off');
  const settings = page.getByRole('dialog', { name: 'Settings & backups', exact: true });
  await expect(settings.locator('#settings-title')).toBeFocused();
  await expect(page).toHaveTitle('Settings & backups | Play 100');
  await settings.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(settings).toHaveCount(0);
  await expect(page).not.toHaveURL(/info=/);
  await expect(page).toHaveTitle('Good games. Great escapes. | Play 100');

  await openMenu(page);
  await expect(page).toHaveTitle('Menu | Play 100');
  await page
    .getByRole('dialog', { name: 'Menu', exact: true })
    .getByRole('button', { name: 'About & credits', exact: true })
    .click();
  const about = page.locator('dialog[open]').filter({ has: page.locator('#about-title') });
  await expect(about.locator('#about-title')).toBeFocused();
  await expect(page).toHaveTitle('About & credits | Play 100');
  await about.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(about).toHaveCount(0);
  await expect(page).toHaveTitle('Good games. Great escapes. | Play 100');
});

test('Menu, Compare tray and signed-out Sign in titles restore their underlying view', async ({
  page,
  context,
  baseURL,
  isMobile,
}) => {
  expect(['127.0.0.1', 'localhost']).toContain(new URL(baseURL!).hostname);
  await page.setViewportSize(isMobile ? { width: 393, height: 851 } : { width: 1440, height: 900 });
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === new URL(baseURL!).origin
      ? route.fallback()
      : route.abort('blockedbyclient'),
  );
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installGuestLibrary(page, libraryFixture(3));
  test.skip(
    (await page.locator('.account-nav').count()) === 0,
    'Requires the configured online build; this journey remains signed out and blocks remote account requests.',
  );
  await page
    .getByRole('navigation', { name: 'My games views' })
    .getByRole('button', { name: /^Ranking/ })
    .click();
  await expect(page).toHaveTitle('My games · Ranking | Play 100');
  const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
  for (const close of ['Close', 'Escape'] as const) {
    await openMenu(page);
    await expect(menu.locator('#menu-title')).toBeFocused();
    await expect(page).toHaveTitle('Menu | Play 100');
    if (close === 'Close') await menu.getByRole('button', { name: 'Close dialog', exact: true }).click();
    else await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page).toHaveTitle('My games · Ranking | Play 100');
  }
  await openMenu(page);
  await expect(page).toHaveTitle('Menu | Play 100');
  await page.goBack();
  await expect(menu).toHaveCount(0);
  await expect(page).toHaveTitle('My games · Library | Play 100');

  await page.goto('/?catalogs=off');
  const game = libraryRecords[0];
  const card = page.locator(`.game-card[data-game="${game.id}"]`);
  await card.getByRole('button', { name: `Pin for comparison: ${game.title}`, exact: true }).click();
  const chip = page.getByRole('button', { name: '1 game in Compare tray', exact: true });
  const tray = page.getByRole('dialog', { name: 'Compare tray', exact: true });
  for (const close of ['Close', 'Escape'] as const) {
    await chip.click();
    await expect(tray.getByRole('heading', { name: 'Compare tray', exact: true })).toBeFocused();
    await expect(page).toHaveTitle('Compare tray | Play 100');
    if (close === 'Close') await tray.getByRole('button', { name: 'Close dialog', exact: true }).click();
    else await page.keyboard.press('Escape');
    await expect(tray).toHaveCount(0);
    await expect(chip).toBeFocused();
    await expect(page).toHaveTitle('Good games. Great escapes. | Play 100');
  }
  const signIn = page.getByRole('dialog', { name: 'Sign in', exact: true });
  for (const close of ['Close', 'Escape'] as const) {
    await chip.click();
    await expect(page).toHaveTitle('Compare tray | Play 100');
    await tray.getByRole('button', { name: 'Choose friends', exact: true }).click();
    await expect(signIn.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
    await expect(signIn.locator('#account-signin-title')).toBeFocused();
    await expect(page).toHaveTitle('Sign in | Play 100');
    if (close === 'Close') await signIn.getByRole('button', { name: 'Close dialog', exact: true }).click();
    else await page.keyboard.press('Escape');
    await expect(signIn).toHaveCount(0);
    await expect(chip).toBeFocused();
    await expect(page).toHaveTitle('Good games. Great escapes. | Play 100');
  }
  await card.locator('.game-link').click();
  const detail = page.getByRole('dialog', { name: game.title, exact: true });
  await expect(detail.locator('#game-title')).toBeFocused();
  await expect(page).toHaveTitle(`${game.title} · #1 | Play 100`);
  await page.goBack();
  await expect(detail).toHaveCount(0);
  await expect(page).toHaveTitle('Good games. Great escapes. | Play 100');

  await page.goto(`/?game=${game.id}&info=settings&catalogs=off`);
  const settings = page.getByRole('dialog', { name: 'Settings & backups', exact: true });
  await expect(page.locator('dialog[open]')).toHaveCount(2);
  await expect(settings.locator('#settings-title')).toBeFocused();
  await expect(page).toHaveTitle('Settings & backups | Play 100');
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await expect(detail.locator('#game-title')).toBeFocused();
  await expect(page).toHaveTitle(`${game.title} · #1 | Play 100`);
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
  await expect(page).toHaveTitle('Good games. Great escapes. | Play 100');
});
