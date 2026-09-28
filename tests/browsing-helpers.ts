import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export async function openBrowsingFilters(page: Page) {
  // The disclosure itself, not a route skeleton's placeholder that shares its class while the page loads.
  const filters = page.locator('details.browse-filters');
  await expect(filters).toBeAttached();
  if ((await filters.getAttribute('open')) === null) await filters.locator('summary').first().click();
}
