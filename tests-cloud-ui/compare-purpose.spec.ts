import { expect, test } from '@playwright/test';

test('signed-out Compare explains friends rankings before authentication and preserves the device-only exit', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/compare?catalogs=off');
  const purpose = page.getByRole('heading', { name: "Compare friends' rankings", exact: true });
  await expect(purpose).toBeVisible();
  await expect(page.locator('.auth-purpose')).toContainText('Sign in to compare rankings shared by your friends.');
  await expect(page.locator('.auth-purpose')).toContainText(
    'Pins select games for comparison; they do not share your library.',
  );
  const order = await page.locator('.auth-panel').evaluate((element) => {
    const purpose = element.querySelector('.auth-purpose')!;
    const provider = element.querySelector('.google-signin')!;
    return Boolean(purpose.compareDocumentPosition(provider) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(order).toBe(true);
  await page.getByRole('button', { name: 'Keep using this device', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/');
  await page.goto('/account?catalogs=off');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('.auth-purpose')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
});
