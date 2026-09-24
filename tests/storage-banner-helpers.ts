import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export async function expectStorageDenial(page: Page) {
  const banner = page.locator('.storage-banner');
  await expect(banner).toHaveCount(1);
  await expect(banner).toHaveAttribute('role', 'alert');
  await expect(banner).toContainText('Changes now work in this tab only; download a backup before closing it');
  await expect(banner.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  const configured = (await page.getByRole('link', { name: /^Account/ }).count()) > 0;
  if (configured) {
    await expect(banner.getByRole('button', { name: 'Open Account', exact: true })).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Use this device only', exact: true })).toBeVisible();
    await expect(banner).toContainText('Choose an account check or continue with this device explicitly.');
  } else {
    await expect(banner.getByRole('button', { name: 'Open Account', exact: true })).toHaveCount(0);
    await expect(banner.getByRole('button', { name: 'Use this device only', exact: true })).toHaveCount(0);
  }
  await expect(banner).toHaveCount(1);
  const text = await banner.innerText();
  expect(text.match(/Device storage is blocked\./g)).toHaveLength(1);
  expect(text.match(/Allow this site to use device storage and try again\./g)).toHaveLength(1);
  expect(text.match(/has not been overwritten/g)).toHaveLength(1);
  expect(text.match(/Your saved data has not been overwritten or cleared\./g)).toHaveLength(1);
  expect(text.match(/Changes now work in this tab only/g)).toHaveLength(1);
  expect(text).not.toContain('Your libraries have not been cleared.');
  expect(await banner.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  return { banner, configured };
}
