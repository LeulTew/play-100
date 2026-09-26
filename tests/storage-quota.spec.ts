import { expect, test } from '@playwright/test';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { exportLibraryBackup } from '../src/lib/personal-library';
import { installGuestLibrary, libraryFixture } from './library-pagination-helpers';
import { rankingFixture } from './ranking-pagination-helpers';
import { readLibrary } from './library-helpers';

test.use({ serviceWorkers: 'allow' });

const storageFull = 'Device storage is full. Your changes were not saved. Free some space and try again.';
const restoreFailed = 'Restore failed. Your existing library was not replaced.';
const restoreSaved = 'Your backup was restored and saved on this device.';
const manualFailed = 'The game could not be added. Your entry is unchanged; try again.';
// Chromium's IndexedDB backend approves a write against a cached space-remaining figure for up to 30 s, and a quota
// override does not reset that cache, so an IndexedDB write meets a lowered quota only after the cache expires.
const indexedDbSpaceCacheMs = 31_000;
// The worker message, redundant-worker event and registration rejection are distinct client paths.
const preparationErrors = [
  'Offline preparation or storage failed. Reconnect, free storage if needed, and retry.',
  'Offline preparation failed. The current version was not replaced. Retry when connected.',
  'Offline preparation could not start. Check the connection or available storage, then retry.',
];

async function withQuota(
  page: Page,
  origin: string,
  marginBytes: number,
  info: TestInfo,
  work: (quota: { usage: number; quotaSize: number; lift: () => Promise<void> }) => Promise<void>,
) {
  const cdp = await page.context().newCDPSession(page);
  const receipt: {
    origin: string;
    marginBytes: number;
    usage?: number;
    quotaSize?: number;
    overrideConfirmed: boolean;
    lifted: boolean;
  } = { origin, marginBytes, overrideConfirmed: false, lifted: false };
  const lift = async () => {
    await cdp.send('Storage.overrideQuotaForOrigin', { origin });
    const current = await cdp.send('Storage.getUsageAndQuota', { origin });
    expect(current.overrideActive).toBe(false);
    receipt.lifted = true;
  };
  try {
    const usage = await page.evaluate(async () => {
      const estimate = await navigator.storage.estimate();
      if (typeof estimate.usage !== 'number' || !Number.isFinite(estimate.usage) || estimate.usage < 0) {
        throw new Error('The quota campaign requires a measured navigator.storage.estimate().usage.');
      }
      return Math.ceil(estimate.usage);
    });
    const quotaSize = usage + marginBytes;
    receipt.usage = usage;
    receipt.quotaSize = quotaSize;
    await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize });
    const overridden = await cdp.send('Storage.getUsageAndQuota', { origin });
    expect(overridden.overrideActive).toBe(true);
    expect(overridden.quota).toBe(quotaSize);
    receipt.overrideConfirmed = true;
    await work({ usage, quotaSize, lift });
  } finally {
    try {
      await lift();
    } finally {
      try {
        await cdp.detach();
      } finally {
        await info.attach('origin-quota-receipt', { contentType: 'application/json', body: JSON.stringify(receipt) });
      }
    }
  }
}

async function openSettings(page: Page, offline = false) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Menu', exact: true })
    .getByRole('button', {
      name: offline ? 'Install & offline access' : 'Settings & backups',
      exact: true,
    })
    .click();
  const settings = page.locator('dialog[aria-labelledby="settings-title"]');
  await expect(settings).toBeVisible();
  if (offline) await expect(settings.locator('.pwa-settings')).toHaveAttribute('open', '');
  return settings;
}

function largeLibrary() {
  const library = rankingFixture(2000);
  let seed = 0x6d2b79f5;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  // Deterministic, varied notes prevent compression from reducing this large write to the quota margin.
  for (const entry of library.ranking) {
    let note = 'Synthetic quota campaign opinion: ';
    for (let index = 0; index < 1800; index += 1) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      note += alphabet.charAt((seed >>> 0) % alphabet.length);
    }
    entry.note = note;
  }
  return library;
}

async function selectBackup(settings: Locator, buffer: Buffer) {
  await settings.getByLabel('Import personal library backup file').setInputFiles({
    name: 'synthetic-quota-2000.json',
    mimeType: 'application/json',
    buffer,
  });
  await expect(settings.locator('.restore-preview')).toContainText('2000 games, 0 queued, 2000 ranked.');
}

async function readyMarkers(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const ready: string[] = [];
    for (const name of await caches.keys()) {
      if (!/^play100-pwa-v1-core-[a-f0-9]{64}$/.test(name)) continue;
      if (await (await caches.open(name)).match('/pwa/__ready__')) ready.push(name);
    }
    return ready;
  });
}

test.beforeEach(async ({ page, context, browserName, baseURL }) => {
  expect(browserName).toBe('chromium');
  if (process.env.PLAY100_TEST_BUILD === 'development') {
    throw new Error('The quota campaign needs a production build with its real service worker.');
  }
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
    throw new Error('Quota overrides are restricted to a fresh synthetic loopback context, never a deployed profile.');
  }
  const origin = new URL(baseURL).origin;
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('a quota-refused large import preserves the durable library and retries after space is restored', async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(120000);
  await installGuestLibrary(page, libraryFixture(3));
  const before = await readLibrary(page);
  const incoming = largeLibrary();
  const exported = exportLibraryBackup(incoming);
  if (!exported.ok) throw new Error(exported.message);
  const backup = Buffer.from(exported.text);
  expect(backup.byteLength).toBeGreaterThan(3 * 1024 * 1024);
  await info.attach('import-size', {
    contentType: 'application/json',
    body: JSON.stringify({ bytes: backup.byteLength, records: 2000 }),
  });
  let settings = await openSettings(page);
  await selectBackup(settings, backup);
  await withQuota(page, new URL(baseURL!).origin, 1024, info, async ({ lift }) => {
    await page.waitForTimeout(indexedDbSpaceCacheMs);
    await settings.getByRole('button', { name: 'Replace with this backup', exact: true }).click();
    await expect(settings.locator('.backup-panel').getByRole('alert')).toHaveText(restoreFailed);
    await expect(settings.locator('.storage-warning')).toHaveText(storageFull);
    await expect(settings).toBeVisible();
    await expect(settings.locator('.restore-preview')).toBeVisible();
    expect(await readLibrary(page)).toEqual(before);

    // A reload must read the previous committed snapshot, not a partially imported library.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
    expect(await readLibrary(page)).toEqual(before);
    settings = await openSettings(page);
    await selectBackup(settings, backup);
    await settings.getByRole('button', { name: 'Replace with this backup', exact: true }).click();
    await expect(settings.locator('.backup-panel').getByRole('alert')).toHaveText(restoreFailed);
    await expect(settings.locator('.restore-preview')).toBeVisible();

    await lift();
    await settings.getByRole('button', { name: 'Replace with this backup', exact: true }).click();
    await expect(settings.locator('.backup-panel').getByRole('status')).toHaveText(restoreSaved);
    await expect(settings.locator('.backup-panel').getByRole('alert')).toHaveCount(0);
    await expect(settings.locator('.restore-preview')).toHaveCount(0);
    await expect(settings).toBeVisible();
    const restored = { ...incoming, revision: before.revision + 1 };
    expect(await readLibrary(page)).toEqual(restored);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
    expect(await readLibrary(page)).toEqual(restored);
  });
});

test('a quota-refused manual save keeps the open form and every typed field until a successful retry', async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(120000);
  await installGuestLibrary(page, largeLibrary());
  const before = await readLibrary(page);
  const manual = page.locator('.my-games-editor:visible .manual-add');
  await manual.locator('summary').click();
  const title = 'Synthetic unsaved game kept through a full disk';
  const year = '1999';
  await manual.getByLabel('Game title', { exact: true }).fill(title);
  await manual.getByLabel('Year (optional)', { exact: true }).fill(year);
  const document = await page.evaluate(() => performance.timeOrigin);
  await withQuota(page, new URL(baseURL!).origin, 0, info, async ({ lift }) => {
    await page.waitForTimeout(indexedDbSpaceCacheMs);
    await manual.getByRole('button', { name: 'Add to my library', exact: true }).click();
    await expect(manual.getByRole('alert')).toHaveText(manualFailed);
    await expect(manual).toHaveAttribute('open', '');
    await expect(manual.getByLabel('Game title', { exact: true })).toHaveValue(title);
    await expect(manual.getByLabel('Year (optional)', { exact: true })).toHaveValue(year);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(document);
    expect(await readLibrary(page)).toEqual(before);

    await lift();
    await manual.getByRole('button', { name: 'Add to my library', exact: true }).click();
    await expect(manual.getByRole('alert')).toHaveCount(0);
    await expect(manual.getByLabel('Game title', { exact: true })).toHaveValue('');
    await expect(manual.getByLabel('Year (optional)', { exact: true })).toHaveValue('');
    await expect(manual).toHaveAttribute('open', '');
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(document);
    const saved = await readLibrary(page);
    const additions = Object.values(saved.records).filter((record) => !before.records[record.id]);
    expect(additions).toHaveLength(1);
    const added = additions[0];
    if (!added) throw new Error('The retried manual game did not persist.');
    expect(added).toMatchObject({ title, year: 1999, source: 'manual' });
    expect(saved).toEqual({
      ...before,
      revision: before.revision + 1,
      records: { ...before.records, [added.id]: added },
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
    expect(await readLibrary(page)).toEqual(saved);
  });
});

test('quota-limited offline preparation never claims ready and retries without harming the online library', async ({
  page,
  context,
  baseURL,
}, info) => {
  test.setTimeout(120000);
  await installGuestLibrary(page, libraryFixture(3));
  const before = await readLibrary(page);
  const response = await page.request.get('/pwa-assets.json');
  expect(response.ok()).toBe(true);
  const manifest: {
    version: string;
    coreBytes: number;
    core: { url: string; bytes: number }[];
  } = await response.json();
  expect(manifest.version).toMatch(/^[a-f0-9]{64}$/);
  expect(manifest.coreBytes).toBe(manifest.core.reduce((total, asset) => total + asset.bytes, 0));
  expect(manifest.coreBytes).toBeGreaterThan(512 * 1024);
  let settings = await openSettings(page, true);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((items) => items.length))).toBe(0);
  expect(await readyMarkers(page)).toEqual([]);
  const document = await page.evaluate(() => performance.timeOrigin);
  const margin = Math.min(512 * 1024, Math.floor(manifest.coreBytes / 2));
  await withQuota(page, new URL(baseURL!).origin, margin, info, async ({ quotaSize, lift }) => {
    expect(quotaSize).toBeLessThan(manifest.coreBytes);
    await settings.getByRole('button', { name: 'Enable offline access', exact: true }).click();
    const failure = settings.locator('.pwa-settings').getByRole('alert');
    await expect(failure).toBeVisible({ timeout: 45000 });
    const error = (await failure.innerText()).trim();
    expect(preparationErrors).toContain(error);
    await expect(settings.getByRole('button', { name: 'Enable offline access', exact: true })).toBeEnabled();
    await expect(settings.getByRole('button', { name: 'Offline files ready', exact: true })).toHaveCount(0);
    expect(await readyMarkers(page)).toEqual([]);
    expect(await page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(document);
    expect(await readLibrary(page)).toEqual(before);
    await info.attach('offline-quota-error', {
      contentType: 'application/json',
      body: JSON.stringify({ coreBytes: manifest.coreBytes, quotaSize, version: manifest.version, error }),
    });

    // Exercise the real online route after the failed install, without clearing storage.
    await page.keyboard.press('Escape');
    await page.goto('/discover?catalogs=off');
    await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible();
    await expect(page.locator('.discovery-cards > li').first()).toBeVisible();
    expect(await readLibrary(page)).toEqual(before);
    await lift();
    settings = await openSettings(page, true);
    await settings.getByRole('button', { name: 'Enable offline access', exact: true }).click();
    await expect(settings.getByRole('button', { name: 'Offline files ready', exact: true })).toBeDisabled({
      timeout: 45000,
    });
    await expect(settings.locator('.pwa-settings').getByRole('alert')).toHaveCount(0);
    expect(await readyMarkers(page)).toEqual([`play100-pwa-v1-core-${manifest.version}`]);
    expect(await readLibrary(page)).toEqual(before);

    await page.keyboard.press('Escape');
    await context.setOffline(true);
    try {
      await page.goto('/my-games?catalogs=off');
      await expect(page.getByRole('heading', { name: 'My games', exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
      expect(await readLibrary(page)).toEqual(before);
    } finally {
      await context.setOffline(false);
    }
  });
});
