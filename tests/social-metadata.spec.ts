import { expect, test } from '@playwright/test';

test('served head has unique matching social metadata and a fetchable PNG', async ({ page, request }) => {
  await page.goto('/?catalogs=off');
  const canonical = page.locator('head link[rel="canonical"]');
  await expect(canonical).toHaveCount(1);
  const url = await canonical.getAttribute('href');
  if (!url) throw new Error('The served document has no canonical URL.');
  expect(url).toMatch(/^https:\/\/[^/]+\/$/);
  await expect(page.locator('meta[property="og:url"]')).toHaveCount(1);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', url);
  for (const field of ['title', 'description', 'image', 'image:alt']) {
    const og = page.locator(`meta[property="og:${field}"]`);
    const twitter = page.locator(`meta[name="twitter:${field}"]`);
    await expect(og).toHaveCount(1);
    await expect(twitter).toHaveCount(1);
    const value = await og.getAttribute('content');
    if (!value) throw new Error(`Missing served og:${field}.`);
    await expect(twitter).toHaveAttribute('content', value);
  }
  for (const [field, value] of [['width', '1200'], ['height', '630'], ['type', 'image/png']] as const) {
    const tag = page.locator(`meta[property="og:image:${field}"]`);
    await expect(tag).toHaveCount(1);
    await expect(tag).toHaveAttribute('content', value);
  }
  const imageUrl = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(imageUrl).toBe(`${url}social-card.png`);
  const image = await request.get('/social-card.png');
  expect(image.ok()).toBe(true);
  expect(image.headers()['content-type']).toContain('image/png');
  expect([undefined, 'cross-origin']).toContain(image.headers()['cross-origin-resource-policy']);
});
