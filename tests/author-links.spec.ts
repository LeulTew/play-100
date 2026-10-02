import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { emptyCatalogs } from './catalog-helpers';
import { closeDialog } from './readability-helpers';

declare global {
  interface Window {
    authorLinkCsp: string[];
  }
}

const links = [
  ['github', 'Leul on GitHub (opens in a new tab)', 'https://github.com/LeulTew'],
  ['linkedin', 'Leul on LinkedIn (opens in a new tab)', 'https://www.linkedin.com/in/leul-t-agonafer-861bb3336/'],
  ['telegram', 'Leul on Telegram, @fabbin (opens in a new tab)', 'https://t.me/fabbin'],
  ['email', 'Email Leul at leulman2@gmail.com', 'mailto:leulman2@gmail.com'],
] as const;

test.use({ serviceWorkers: 'allow' });
test.beforeEach(async ({ page }) => {
  await emptyCatalogs(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.authorLinkCsp = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.authorLinkCsp.push(`${event.violatedDirective}: ${event.blockedURI}`);
    });
  });
});

async function verifyLinks(surface: Locator) {
  const group = surface.getByRole('navigation', { name: "Leul's links", exact: true });
  await expect(group.getByRole('link')).toHaveCount(4);
  for (const [index, [icon, name, href]] of links.entries()) {
    const link = group.getByRole('link').nth(index);
    await expect(link).toHaveAccessibleName(name);
    await expect(link).toHaveAttribute('href', href);
    await expect(link).toHaveAttribute('title', name.replace(' (opens in a new tab)', ''));
    if (icon === 'email') await expect(link).not.toHaveAttribute('target');
    else {
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    await link.scrollIntoViewIfNeeded();
    const box = await link.boundingBox();
    expect(box?.width).toBe(44);
    expect(box?.height).toBe(44);
    await expect(link.locator('svg')).toHaveAttribute('aria-hidden', 'true');
    await expect(link.locator('use')).toHaveAttribute('href', `/icons/author-links.svg#${icon}`);
    await expect
      .poll(() =>
        link.locator('use').evaluate((node) => {
          const box = (node as SVGGraphicsElement).getBBox();
          return box.width > 10 && box.height > 10;
        }),
      )
      .toBe(true);
  }
}

async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
  await expect(menu).toBeVisible();
  return menu;
}

test('author profile links appear in Footer, Menu and About without CSP violations', async ({ page }) => {
  for (const route of ['/?catalogs=off', '/discover?catalogs=off', '/my-games?catalogs=off', '/data-use']) {
    await page.goto(route);
    const footer = page.locator('.site-footer');
    await expect(footer).toContainText('Curated by Leul Tewodros Agonafer');
    await verifyLinks(footer);
    await expect(footer.getByRole('link', { name: 'Source code', exact: true })).toHaveAttribute(
      'href',
      'https://github.com/LeulTew/play-100',
    );
    expect(await page.evaluate(() => window.authorLinkCsp)).toEqual([]);
  }
  await page.goto('/?catalogs=off');
  await expect(page.locator('head meta[name="author"]')).toHaveCount(1);
  await expect(page.locator('head meta[name="author"]')).toHaveAttribute('content', 'Leul Tewodros Agonafer');
  const menu = await openMenu(page);
  await expect(menu).toContainText('Curated by Leul Tewodros Agonafer');
  await verifyLinks(menu);
  await menu.getByRole('button', { name: 'About & credits', exact: true }).click();
  const about = page.getByRole('dialog', { name: 'About & credits', exact: true });
  await expect(about).toContainText('Curated by Leul Tewodros Agonafer');
  await verifyLinks(about);
  await closeDialog(page);
  expect(await page.evaluate(() => window.authorLinkCsp)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('offline preparation retains the author sprite for a new offline document', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/?catalogs=off');
  await verifyLinks(page.locator('.site-footer'));
  const menu = await openMenu(page);
  await menu.getByRole('button', { name: 'Install & offline access', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings & backups', exact: true });
  await settings.getByRole('button', { name: 'Enable offline access', exact: true }).click();
  await expect(settings.getByRole('button', { name: 'Offline files ready', exact: true })).toBeDisabled({
    timeout: 45_000,
  });
  expect(await page.evaluate(async () => Boolean(await caches.match('/icons/author-links.svg')))).toBe(true);
  await closeDialog(page);
  await context.setOffline(true);
  try {
    await page.reload();
    await verifyLinks(page.locator('.site-footer'));
    const offlineMenu = await openMenu(page);
    await verifyLinks(offlineMenu);
    await offlineMenu.getByRole('button', { name: 'About & credits', exact: true }).click();
    await verifyLinks(page.getByRole('dialog', { name: 'About & credits', exact: true }));
    expect(await page.evaluate(() => window.authorLinkCsp)).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});
