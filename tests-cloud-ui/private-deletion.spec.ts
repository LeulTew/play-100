import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { DeletionCleanupOptions } from '../src/cloud/cloud-store';
import { authOrigin, createAccount, emailFor, enableSync, firestoreOrigin, password, signIn, uidFor, verifyEmail } from './helpers';
import { writeManagerDocuments } from './friend-manager-fixtures';

test.beforeEach(async ({ page, context, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Use only the owned demo-emulator app.');
  await context.route('**/*', route => [new URL(baseURL).origin, authOrigin, firestoreOrigin].includes(new URL(route.request().url()).origin)
    ? route.continue() : route.abort('blockedbyclient'));
  await page.goto('/account');
  await expect(page.locator('.emulator-page-note')).toContainText('no production account');
});

test('interrupted private deletion keeps Auth and resumes on the next sign-in before removing the account', async ({ page, request }) => {
  const email = emailFor('private-deletion-resume');
  await createAccount(page, email);
  await verifyEmail(page, request, email);
  await enableSync(page, 'empty');
  const uid = await uidFor(request, email);
  const holder = crypto.randomUUID();
  const documents: Record<string, Record<string, unknown>> = {};
  for (let index = 0; index < 41; index += 1) {
    const bytes = Buffer.from(`Legacy private orphan ${index}`, 'utf8');
    const digest = createHash('sha256').update(bytes).digest('hex');
    documents[`accounts/${uid}/chunks/${digest}`] = {
      digest, data: bytes.toString('base64'), bytes: bytes.length, holders: [holder], holder, createdAt: new Date(),
    };
  }
  await writeManagerDocuments(request, documents);
  await page.evaluate(async () => {
    const source = '/src/cloud/cloud-store.ts';
    const module: typeof import('../src/cloud/cloud-store') = await import(source);
    const original = module.CloudStore.prototype.cleanup;
    let interrupted = false;
    module.CloudStore.prototype.cleanup = function(all = false, options: DeletionCleanupOptions = {}) {
      return original.call(this, all, {
        ...options,
        onProgress: async progress => {
          await options.onProgress?.(progress);
          if (all && !interrupted && progress.confirmed === 20) {
            interrupted = true;
            throw new Error('Synthetic stop after twenty real committed payload deletions.');
          }
        },
      });
    };
  });
  await page.locator('.account-danger summary').click();
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByLabel('Confirm your password', { exact: true }).fill(password);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page.locator('.sync-panel [role="alert"]')).toContainText('Deletion stopped before it finished');
  await expect(page.locator('.sync-panel [role="alert"]')).not.toContainText('chunk');
  const lookup = () => request.post(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=demo-play100-key`, {
    headers: { Authorization: 'Bearer owner' }, data: { localId: [uid] },
  });
  expect((await (await lookup()).json()).users).toHaveLength(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Keep my data', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn(page, email);
  await expect(page.getByRole('button', { name: 'Finish deleting', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: "Deletion isn't finished", exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete account', exact: true })).toBeVisible();
  await page.route('**/identitytoolkit.googleapis.com/v1/accounts:delete?*', route => route.fulfill({
    status: 400, contentType: 'application/json',
    body: JSON.stringify({ error: { code: 400, message: 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN' } }),
  }), { times: 1 });
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByLabel('Confirm your password', { exact: true }).fill(password);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page.locator('.sync-panel [role="alert"]')).toContainText('To delete your sign-in, confirm your password again');
  expect((await (await lookup()).json()).users).toHaveLength(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await (await lookup()).json()).users ?? []).toEqual([]);
  for (const kind of ['accounts', 'creatorRanks']) {
    const remaining = await request.get(`${firestoreOrigin}/v1/projects/demo-play100/databases/(default)/documents/${kind}/${uid}/chunks?pageSize=20`, {
      headers: { Authorization: 'Bearer owner' },
    });

    test('a completed online-copy deletion stays complete after reload and offers account deletion without Finish deleting', async ({ page, request }) => {
      const email = emailFor('complete-copy');
      await createAccount(page, email);
      await verifyEmail(page, request, email);
      await enableSync(page, 'empty');
      await page.locator('.account-danger summary').click();
      await page.getByRole('button', { name: 'Delete online copy', exact: true }).click();
      await page.getByLabel('Confirm your password', { exact: true }).fill(password);
      await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Your online copy was deleted.' })).toBeVisible();
      await page.reload();
      const notice = page.getByRole('region', { name: 'Online copy deleted', exact: true });
      await expect(notice).toBeVisible();
      await expect(page.getByRole('button', { name: 'Finish deleting', exact: true })).toHaveCount(0);
      await expect(notice.getByRole('button', { name: 'Delete account', exact: true })).toBeVisible();
      await expect(notice).toContainText('The copy on this device is still here');
    });
    expect(remaining.ok()).toBe(true);
    expect((await remaining.json()).documents ?? []).toEqual([]);
  }
});
