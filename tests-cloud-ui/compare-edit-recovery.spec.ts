import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import type { ScopedLibrary } from '../src/lib/cloud-types';
import type { LibraryRecord } from '../src/lib/personal-types';
import { createAccount, emailFor, enableSync, readAccount, uidFor, verifyEmail } from './helpers';
import { readLibrary } from '../tests/library-helpers';

const records: LibraryRecord[] = ['Alpha', 'Beta'].map((name) => ({
  id: `manual:compare-recovery-${name.toLowerCase()}`,
  source: 'manual',
  sourceId: `compare-recovery-${name.toLowerCase()}`,
  title: `Compare recovery ${name}`,
  collectionRank: null,
  year: null,
  genre: null,
  studio: null,
  sourceUrl: null,
}));
const target = records[1]!;
const rating = (page: Page) =>
  page.getByRole('spinbutton', { name: `Your rating / 10 for ${target.title}`, exact: true });
const tray = (page: Page) => page.getByRole('dialog', { name: 'Compare tray', exact: true });

test.beforeEach(async ({ context, page, baseURL }) => {
  if (!baseURL || new URL(baseURL).origin !== 'http://127.0.0.1:4187')
    throw new Error('Authenticated Compare recovery requires the owned cloud-test app.');
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (!['http://127.0.0.1:4187', 'http://127.0.0.1:9199', 'http://127.0.0.1:8188'].includes(url.origin))
      return route.abort('blockedbyclient');
    if (url.pathname === '/api/catalog')
      return route.fulfill({ status: 503, json: { error: 'Synthetic unavailable catalog.' } });
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function prepare(page: Page, request: APIRequestContext, entry: 'dock' | 'expanded') {
  const email = emailFor('compare-edit');
  await createAccount(page, email);
  await expect(page.locator('.emulator-note').first()).toBeVisible();
  await verifyEmail(page, request, email);
  await enableSync(page, 'empty');
  const uid = await uidFor(request, email);
  await page.evaluate(
    async ({ uid, records }) => {
      const clientPath = '/src/cloud/firebase-client.ts';
      const client: typeof import('../src/cloud/firebase-client') = await import(clientPath);
      const user = client.cloudAuth.currentUser;
      if (
        client.firebaseApp.options.projectId !== 'demo-play100' ||
        client.cloudAuth.emulatorConfig?.port !== 9199 ||
        user?.uid !== uid ||
        (await user.getIdTokenResult()).claims.email_verified !== true
      )
        throw new Error('The recovery fixture needs its verified emulator identity.');
      const libraryPath = '/src/lib/scoped-library.ts';
      const scoped: typeof import('../src/lib/scoped-library') = await import(libraryPath);
      const scope = `account:demo-play100:${uid}` as const;
      const before = await scoped.loadScopedLibrary(scope);
      if (!before.sync.enabled) throw new Error('Online-saving consent must already be enabled.');
      for (const [index, record] of records.entries())
        await scoped.commitScopedAction(scope, { type: 'rate-game', record, score: index === 0 ? 9 : 5 });
    },
    { uid, records },
  );
  await expect.poll(async () => (await readAccount(page, uid)).sync.dirty, { timeout: 30000 }).toBe(false);
  await expect(page.locator('.sync-panel .sync-state')).toHaveText('Saved online');
  await page.goto(entry === 'dock' ? '/?q=Compare%20recovery&catalogs=off' : '/my-games?tab=ranking&catalogs=off');
  if (entry === 'dock') {
    await expect(page.locator('.extended-results .discovery-card')).toHaveCount(2);
    for (const record of records) {
      await page.locator(`[data-catalog-id="${record.id}"]`).getByText('Actions & source', { exact: true }).click();
    }
  }
  await expect(rating(page)).toHaveValue('5');
  await expect(rating(page)).toBeEnabled();
  await page.getByRole('button', { name: `Pin for comparison: ${target.title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Compare tray, 1 game', exact: true })).toBeVisible();
  // Warm the actual comparison tools, not a replacement callback, so Compare reaches the held editor directly.
  await page.evaluate(async () => {
    const toolsPath = '/src/lib/app-tool-preload.ts';
    const tools: typeof import('../src/lib/app-tool-preload') = await import(toolsPath);
    await tools.loadComparisonTools();
  });
  return uid;
}

async function chooseCompare(page: Page) {
  await page.getByRole('button', { name: 'Open Compare tray, 1 game', exact: true }).click();
  await expect(tray(page)).toBeVisible();
  await tray(page).getByRole('button', { name: 'Choose friends', exact: true }).click();
  await expect(tray(page)).toHaveCount(0);
}

async function holdRejectedRating(page: Page, uid: string) {
  return page.evaluateHandle(
    ({ scope, id }) => {
      const put = IDBObjectStore.prototype.put;
      let finish: (() => void) | null = null;
      const state = { attempts: 0, held: false, released: false };
      IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
        const value: Partial<ScopedLibrary> | null | undefined = args[0];
        if (
          this.transaction.db.name === 'play100-personal' &&
          this.name === 'library' &&
          args[1] === scope &&
          value?.state?.ranking.some((entry) => entry.id === id && entry.score === 7.5)
        ) {
          state.attempts += 1;
          const transaction = this.transaction;
          const abort = transaction.onabort;
          if (!abort) throw new Error('The failed account write needs its original abort receiver.');
          transaction.onabort = (event) => {
            state.held = true;
            finish = () => {
              state.held = false;
              state.released = true;
              transaction.onabort = abort;
              abort.call(transaction, event);
            };
          };
          // Abort the native transaction without writing, but hold the app's failure completion.
          throw new DOMException('Synthetic comparison rating write refusal.', 'QuotaExceededError');
        }
        return put.apply(this, args);
      };
      return {
        state,
        release() {
          if (!finish) throw new Error('Observe the rejected transaction before releasing it.');
          const callback = finish;
          finish = null;
          callback();
        },
        restore() {
          IDBObjectStore.prototype.put = put;
          if (finish) {
            const callback = finish;
            finish = null;
            callback();
          }
        },
      };
    },
    { scope: `account:demo-play100:${uid}`, id: target.id },
  );
}

for (const entry of ['dock', 'expanded'] as const) {
  for (const failure of ['invalid', 'rejected'] as const) {
    test(`signed-in ${entry} Compare returns the exact ${failure} rating editor`, async ({ page, request }) => {
      const uid = await prepare(page, request, entry);
      const before = await readAccount(page, uid);
      const guest = await readLibrary(page);
      const originalUrl = page.url();
      const input = rating(page);
      const node = await input.elementHandle();
      if (!node) throw new Error('The original rating editor must be mounted.');
      const rejected = failure === 'rejected' ? await holdRejectedRating(page, uid) : null;
      try {
        await input.fill(failure === 'invalid' ? '11' : '7.5');
        if (rejected) {
          await input.press('Tab');
          await expect.poll(() => rejected.evaluate((probe) => probe.state.held)).toBe(true);
          await expect(input).toBeDisabled();
        }
        await chooseCompare(page);
        await expect(page).toHaveURL(originalUrl);
        if (rejected) {
          await expect(input).toBeDisabled();
          await rejected.evaluate((probe) => probe.release());
        }
        await expect(page.locator('.toast')).toContainText('Correct the open edit before starting a comparison.');
        await expect(input).toBeEnabled();
        await expect(input).toBeFocused();
        await expect(input).toHaveValue(failure === 'invalid' ? '11' : '7.5');
        await expect(input).toHaveAttribute('aria-invalid', 'true');
        await expect(input).toHaveAccessibleDescription(
          failure === 'invalid'
            ? 'Use a rating from 0 to 10, or leave it blank.'
            : 'The rating could not be saved. Your previous rating is unchanged. Press Enter in this field to retry.',
        );
        expect(await node.evaluate((element) => element.isConnected && element === document.activeElement)).toBe(true);
        await expect(
          page.getByRole('spinbutton', { name: `Your rating / 10 for ${records[0]!.title}`, exact: true }),
        ).not.toBeFocused();
        await expect(page.locator('dialog[open]')).toHaveCount(0);
        expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
        await expect(page).toHaveURL(originalUrl);
        const after = await readAccount(page, uid);
        expect(after.state).toEqual(before.state);
        expect(after.sync.enabled).toBe(before.sync.enabled);
        expect(after.sync.epoch).toBe(before.sync.epoch);
        expect(await readLibrary(page)).toEqual(guest);
        if (rejected) expect(await rejected.evaluate((probe) => probe.state.attempts)).toBe(1);
      } finally {
        if (rejected) {
          await rejected.evaluate((probe) => probe.restore());
          await rejected.dispose();
        }
        await node.dispose();
      }
    });
  }
}

test('a scope change while signed-in Compare awaits a failed save cancels editor recovery', async ({
  page,
  context,
  request,
}) => {
  const uid = await prepare(page, request, 'expanded');
  const before = await readAccount(page, uid);
  const guest = await readLibrary(page);
  const peer = await context.newPage();
  const rejected = await holdRejectedRating(page, uid);
  try {
    await peer.goto('/account?catalogs=off');
    await expect(peer.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled();
    const input = rating(page);
    await input.fill('7.5');
    await input.press('Tab');
    await expect.poll(() => rejected.evaluate((probe) => probe.state.held)).toBe(true);
    await chooseCompare(page);
    await expect(input).toBeDisabled();
    await peer.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.locator('.account-nav')).toHaveAccessibleName('Account Device only');
    await expect(input).toHaveCount(0);
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    await menu.focus();
    const retainedUrl = page.url();
    await rejected.evaluate((probe) => probe.release());
    await expect(menu).toBeFocused();
    await expect(page).toHaveURL(retainedUrl);
    await expect(page).not.toHaveURL((url) => url.pathname === '/compare');
    await expect(page.locator('.toast')).not.toContainText('Correct the open edit before starting a comparison.');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    expect((await readAccount(page, uid)).state).toEqual(before.state);
    expect(await readLibrary(page)).toEqual(guest);
    expect(await rejected.evaluate((probe) => probe.state.attempts)).toBe(1);
  } finally {
    await rejected.evaluate((probe) => probe.restore());
    await rejected.dispose();
    await peer.close();
  }
});
