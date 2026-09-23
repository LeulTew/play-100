import { expect, test } from '@playwright/test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { candidateRules, live270fRules } from '../tests-cloud/fixtures/migration-rules';
import { authOrigin, createAccount, emailFor, enableSync, firestoreOrigin, password, uidFor, verifyEmail } from './helpers';
import { managerPair, pairPath, writeManagerDocuments } from './friend-manager-fixtures';

for (const policy of ['live-270f', 'candidate'] as const) test.describe(`profile read migration with ${policy} rules`, () => {
  let environment: RulesTestEnvironment;
  const target = new URL(firestoreOrigin);
  const configuration = (rules: string) => ({
    projectId: 'demo-play100', firestore: { host: target.hostname, port: Number(target.port), rules },
  });
  test.beforeAll(async () => {
    if (target.hostname !== '127.0.0.1') throw new Error('Only the local demo rules may be changed by this fixture.');
    environment = await initializeTestEnvironment(configuration(policy === 'live-270f' ? live270fRules() : candidateRules()));
  });
  test.afterAll(async () => {
    try { await environment?.cleanup(); }
    finally {
      if (policy === 'live-270f') {
        const restored = await initializeTestEnvironment(configuration(candidateRules()));
        await restored.cleanup();
      }
    }
  });

  if (policy === 'live-270f') test('a deployment-window LIST denial keeps payload intact and leaves Finish deleting visible after reload', async ({ page, context, request, baseURL }) => {
    if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Use the owned emulator-bound UI.');
    await context.route('**/*', route => [new URL(baseURL).origin, authOrigin, firestoreOrigin].includes(new URL(route.request().url()).origin)
      ? route.continue() : route.abort('blockedbyclient'));
    const email = emailFor('deletion-permission-window');
    await createAccount(page, email);
    await verifyEmail(page, request, email);
    await enableSync(page, 'empty');
    const uid = await uidFor(request, email);
    const countPayload = async (kind: string) => {
      const result = await request.get(`${firestoreOrigin}/v1/projects/demo-play100/databases/(default)/documents/${kind}/${uid}/chunks?pageSize=20`, {
        headers: { Authorization: 'Bearer owner' },
      });
      expect(result.ok()).toBe(true);
      return ((await result.json()).documents ?? []).length;
    };
    const before = [await countPayload('accounts'), await countPayload('creatorRanks')];
    expect(before[0]).toBeGreaterThan(0);
    await page.locator('.account-danger summary').click();
    await page.getByRole('button', { name: 'Delete online copy', exact: true }).click();
    await page.getByLabel('Confirm your password', { exact: true }).fill(password);
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
    await expect(page.locator('.sync-panel [role="alert"]')).toContainText('Deletion is paused');
    await expect(page.locator('.sync-panel [role="alert"]')).toContainText('Nothing has been deleted yet');
    expect([await countPayload('accounts'), await countPayload('creatorRanks')]).toEqual(before);
    await page.reload();
    await expect(page.locator('.account-heading')).toContainText(email);
    await expect(page.getByRole('button', { name: 'Finish deleting', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Deletion was requested', exact: true })).toContainText("We couldn't confirm everything was removed");
  });

  test('sent rows show the published source or an unavailable profile without substituting private identity', async ({ page, context, request, baseURL }) => {
    if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Use the owned emulator-bound UI.');
    await context.route('**/*', route => [new URL(baseURL).origin, authOrigin, firestoreOrigin].includes(new URL(route.request().url()).origin)
      ? route.continue() : route.abort('blockedbyclient'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/account');
    await expect(page.locator('.auth-panel .emulator-note')).toHaveCount(1);
    await expect(page.locator('.auth-panel .emulator-note')).toContainText('synthetic accounts only');
    const email = emailFor('migration-manager');
    await createAccount(page, email);
    await verifyEmail(page, request, email);
    await enableSync(page, 'empty');
    const uid = await uidFor(request, email);
    const peer = `migration-peer-${crypto.randomUUID()}`;
    const now = Date.now();
    const avatar = { version: 1, seed: 'c'.repeat(32), palette: 'sky' };
    const generation = crypto.randomUUID();
    const documents: Record<string, Record<string, unknown>> = {
      [`accountLifecycle/${peer}`]: { state: 'active' },
      [`friendSettings/${peer}`]: { format: 1, enabled: false, deleted: false, selection: '', epoch: 1, revision: 1, updatedAt: new Date(now) },
      [`friendIdentities/${peer}`]: { format: 1, uid: peer, displayName: 'Private name must not appear', avatar, revision: 1, updatedAt: new Date(now) },
      [pairPath(uid, peer)]: managerPair(uid, peer, uid, 'pending', now),
    };
    if (policy === 'live-270f') documents[`publicProfiles/${peer}`] = {
      uid: peer, handle: 'migration_published', displayName: 'Published migration name', avatar, title: 'Migration ranking',
      count: 1, preview: ['Fixture game'], generation, epoch: 1, published: true, listed: false, hidden: false, creator: false,
      updatedAt: new Date(now),
    };
    await writeManagerDocuments(request, documents);
    if (policy === 'candidate') {
      const missing = await request.get(`${firestoreOrigin}/v1/projects/demo-play100/databases/(default)/documents/publicProfiles/${peer}`);
      expect(missing.status()).toBe(403);
      expect((await missing.json()).error.status).toBe('PERMISSION_DENIED');
    }
    await page.goto('/friends?view=sent');
    await expect(page.getByRole('button', { name: 'Sent', exact: true })).toHaveAttribute('aria-current', 'page');
    const row = page.locator('.friend-manager-row');
    await expect(row).toHaveCount(1);
    if (policy === 'live-270f') {
      await expect(row.locator('strong')).toHaveText('Published migration name');
      await expect(row.getByText('Published profile', { exact: true })).toBeVisible();
    } else {
      await expect(row.getByText('Profile unavailable', { exact: true })).toBeVisible();
      await expect(row.getByRole('button', { name: 'Retry profile', exact: true })).toBeVisible();
      await expect(row).not.toContainText('Profile could not be loaded');
    }
    await expect(row).not.toContainText('Private name must not appear');
    await expect(page.locator('.friends-page [role="alert"]')).toHaveCount(0);
  });
});
