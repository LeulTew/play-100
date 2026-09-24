import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export async function openBrowsingFilters(page: Page) {
  const filters = page.locator('.browse-filters');
  await expect(filters).toBeAttached();
  if ((await filters.getAttribute('open')) === null) await filters.locator('summary').first().click();
}
