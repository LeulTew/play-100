import { expect, test } from '@playwright/test';
import {
  createAccount,
  emailFor,
  enableSync,
  keepResourceTimings,
  seedGuestRating,
  stopAutomaticSharing,
  verifyEmail,
} from './helpers';

test.beforeEach(({ context }) => keepResourceTimings(context));

for (const phase of ['refresh', 'cleanup'] as const) {
  test(`a saved shared ranking explains its failed ${phase} and names a working recovery action`, async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?game=red-dead-redemption-2');
    await seedGuestRating(page, '8');
    const email = emailFor(`sharing-${phase}`);
    await createAccount(page, email);
    await verifyEmail(page, request, email);
    await enableSync(page);
    await stopAutomaticSharing(page);
    await page.goto('/friends/sharing');
    const editor = page.locator('.friends-sharing-page');
    await expect(editor.getByRole('button', { name: 'Select all', exact: true })).toBeVisible();
    await page.evaluate(async (failedPhase) => {
      const url = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((value) => new URL(value).pathname === '/src/cloud/friend-store.ts');
      if (!url) throw new Error('The loaded sharing store is missing.');
      const module = (await import(url)) as typeof import('../src/cloud/friend-store');
      const afterCommit = module.FriendStore.prototype.afterCommit;
      module.FriendStore.prototype.afterCommit = function <T>(
        receipt: import('../src/lib/friend-types').FriendMutationReceipt,
        operation: () => Promise<T>,
        currentPhase: 'refresh' | 'cleanup' = 'refresh',
      ): Promise<T> {
        if (receipt.operation === 'publish-ranking' && currentPhase === failedPhase) {
          module.FriendStore.prototype.afterCommit = afterCommit;
          return (afterCommit<T>).call(
            this,
            receipt,
            async () => {
              throw new Error('Synthetic post-commit follow-up failure');
            },
            currentPhase,
          );
        }
        return (afterCommit<T>).call(this, receipt, operation, currentPhase);
      };
    }, phase);
    await editor.getByRole('button', { name: 'Select all', exact: true }).click();
    await editor.getByRole('button', { name: 'Preview friend sharing', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Agree & share with friends', exact: true }).click();
    const copy =
      phase === 'cleanup'
        ? 'Shared ranking saved. Older shared copies could not be removed. In Account, choose Refresh selected sharing to retry.'
        : 'Shared ranking saved. Its latest status could not be loaded. In Account, choose Refresh selected sharing to retry.';
    await expect(editor.getByRole('alert')).toHaveText(copy, { timeout: 30000 });
    await editor.getByRole('button', { name: 'Account', exact: true }).click();
    const notice = page.getByRole('alert').filter({ hasText: copy });
    await expect(notice).toBeVisible();
    await notice.getByRole('button', { name: 'Refresh selected sharing', exact: true }).click();
    await expect(notice).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Selected ranking: saved', exact: true })).toBeVisible();
  });
}
