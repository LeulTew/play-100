import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';

async function expectCssMotionOff(page: Page) {
  const moving = await page.locator('button, a, .game-cover img, .game-copy h3 > svg, .dialog-inner, .toast, .magnet > div, .personal-row, .avatar-picker__candidate, .avatar-picker__palette').evaluateAll(nodes =>
    nodes.filter(node => {
      const style = getComputedStyle(node);
      return style.animationName !== 'none' || style.transitionDuration.split(',').some(duration => Number.parseFloat(duration) !== 0);
    }).map(node => `${node.tagName}.${node.className}`));
  expect(moving).toEqual([]);
}

test('scoped CSS policy preserves Settings Lite, OS reduction, print and forced colors', async ({ page }) => {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?catalogs=off');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Settings & backups', exact: true }).click();
  const lite = page.getByRole('radio', { name: /^Lite/ });
  await lite.click();
  await expect(lite).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await expectCssMotionOff(page);
  await page.emulateMedia({ media: 'print', forcedColors: 'active' });
  await expectCssMotionOff(page);
  await page.emulateMedia({ media: 'screen', forcedColors: 'none' });
  const full = page.getByRole('radio', { name: /^Full/ });
  await full.click();
  await expect(full).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  expect(await page.locator('.game-cover img').first().evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0.35s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await expectCssMotionOff(page);
  await page.keyboard.press('Escape');
});
