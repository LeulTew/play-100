import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { createAccount, emailFor, enableSync, seedGuestRating, uidFor, verifyEmail } from './helpers';
import { inviteLifetime, managerPair, pairPath, seedManager, writeManagerDocuments } from './friend-manager-fixtures';

declare global {
  interface Window {
    managerPairGate?: { waiting: boolean; finished: boolean; accepted: boolean; release: () => void };
  }
}
test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(20000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function prepare(page: Page, request: Parameters<typeof seedManager>[0]) {
  const email = emailFor('manager');
  await page.goto('/?game=red-dead-redemption-2');
  await seedGuestRating(page, '7.2');
  await createAccount(page, email);
  await verifyEmail(page, request, email);
  await enableSync(page);
  const uid = await uidFor(request, email);
  const fixture = await seedManager(request, uid);
  await page.evaluate(async (failingPeer) => {
    const source = '/src/cloud/friend-store.ts';
    const module: typeof import('../src/cloud/friend-store') = await import(source);
    const original = module.FriendStore.prototype.identity;
    const ranking = module.FriendStore.prototype.ranking;
    const reads = { identities: [] as string[], rankings: 0 };
    let failOnce = true;
    const persist = () => sessionStorage.setItem('qa:manager-reads', JSON.stringify(reads));
    persist();
    module.FriendStore.prototype.identity = function (uid) {
      reads.identities.push(uid);
      persist();
      if (uid === failingPeer && failOnce) {
        failOnce = false;
        return Promise.reject(Object.assign(new Error('Synthetic temporary profile failure'), { code: 'unavailable' }));
      }
      return original.call(this, uid);
    };
    module.FriendStore.prototype.ranking = function (uid) {
      reads.rankings += 1;
      persist();
      return ranking.call(this, uid);
    };
  }, fixture.accepted[1]!);
  await page.getByRole('button', { name: 'Friends', exact: true }).click();
  await expect(page.locator('.friend-list > li')).toHaveCount(20);
  await expect(page.locator('.friend-list').getByText(fixture.names[0]!, { exact: true })).toBeVisible();
  return { ...fixture, email };
}
async function checkManager(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const result = await new AxeBuilder({ page }).include('.friends-page').analyze();
  expect(result.violations).toEqual([]);
  const small = await page
    .locator(
      '.friends-page button:visible, .friends-page input:not([type="checkbox"]):visible, .friends-page select:visible, .friend-select',
    )
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width < 43.5 || box.height < 43.5;
        })
        .map((element) => element.textContent),
    );
  expect(small).toEqual([]);
}

test('loaded pages survive live changes; directional scans, row recovery, private cohort and Back/reload remain correct', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(150000);
  const f = await prepare(page, request);
  const failed = page.locator('.friend-list > li').filter({ hasText: `Player …${f.accepted[1]!.slice(-6)}` });
  await expect(failed).toContainText('Profile could not be loaded');
  await failed.getByRole('button', { name: 'Retry profile', exact: true }).click();
  await expect(page.locator('.friend-list')).toContainText(f.names[1]!);
  const missing = page.locator('.friend-list > li').filter({ hasText: `Player …${f.accepted[2]!.slice(-6)}` });
  await expect(missing).toContainText('Profile unavailable');
  await writeManagerDocuments(request, {
    [`friendIdentities/${f.accepted[2]}`]: {
      format: 1,
      uid: f.accepted[2],
      displayName: f.names[2],
      avatar: f.avatar,
      revision: 1,
      updatedAt: new Date(),
    },
  });
  await missing.getByRole('button', { name: 'Retry profile', exact: true }).click();
  await expect(page.locator('.friend-list')).toContainText(f.names[2]!);
  await page.getByRole('button', { name: 'Load next 20', exact: true }).click();
  await expect(page.locator('.friend-list > li')).toHaveCount(40);
  await expect(page.locator('.friend-list')).toContainText(f.names[30]!);
  await page.getByRole('checkbox', { name: `Select ${f.names[10]} for comparison`, exact: true }).check();
  await page.getByRole('checkbox', { name: `Select ${f.names[30]} for comparison`, exact: true }).check();
  await writeManagerDocuments(request, {
    [pairPath(f.uid, f.accepted[19]!)]: {
      ...managerPair(f.uid, f.accepted[19]!, f.uid, 'removed', Date.now(), 2),
      createdAt: new Date(f.now - 119000),
    },
  });
  await expect(page.locator('.friend-update-notice')).toBeVisible();
  await expect(page.locator('.friend-list > li')).toHaveCount(39);
  await expect(page.getByRole('checkbox', { name: `Select ${f.names[30]} for comparison`, exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Load next 20', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Refresh loaded', exact: true }).click();
  await expect(page.locator('.friend-list > li')).toHaveCount(40);
  await expect(page.getByRole('checkbox', { name: `Select ${f.names[30]} for comparison`, exact: true })).toBeChecked();
  await page.getByLabel('Filter loaded friends', { exact: true }).fill('QA');
  await page.getByLabel('Order', { exact: true }).selectOption('name');
  const managerUrl = page.url();
  await checkManager(page);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('qa:manager-reads') ?? '{}').rankings)).toBe(0);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.screenshot({ path: testInfo.outputPath('friends-manager.png') });
  await page.getByRole('button', { name: 'Compare selected', exact: true }).click();
  await expect(page).toHaveURL(/\/compare$/);
  await expect(page.getByLabel(f.names[10]!, { exact: true })).toBeChecked();
  await expect(page.getByLabel(f.names[30]!, { exact: true })).toBeChecked();
  expect(new URL(page.url()).search).not.toContain(f.accepted[30]);
  await page.getByLabel('Games', { exact: true }).selectOption('all-shared');
  await page.getByLabel('Search games', { exact: true }).fill('Red');
  await page.getByLabel('Group name', { exact: true }).fill('QA manager cohort');
  await page.getByRole('button', { name: 'Save group', exact: true }).click();
  await expect(page).toHaveURL(/\/compare\?group=[a-f0-9-]{36}$/);
  await page.locator('.friend-matrix').getByRole('button', { name: 'Red Dead Redemption 2', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel(f.names[30]!, { exact: true })).toBeChecked();
  await expect(page.getByLabel('Search games', { exact: true })).toHaveValue('Red');
  await expect(page.getByLabel('Games', { exact: true })).toHaveValue('all-shared');
  const preserved = await page.evaluate(() => sessionStorage.getItem('play100.friend-comparison.v1'));
  await page.goBack();
  await expect(page).toHaveURL(managerUrl);
  await expect(page.getByLabel('Filter loaded friends', { exact: true })).toHaveValue('QA');
  await expect(page.locator('.friend-selection-bar')).toContainText('2 / 5');
  await expect(page.getByRole('button', { name: 'Compare selected', exact: true })).toBeEnabled();
  await page.evaluate(async (peer) => {
    const source = '/src/cloud/friend-store.ts';
    const module: typeof import('../src/cloud/friend-store') = await import(source);
    const original = module.FriendStore.prototype.watchPair;
    let failOnce = true;
    module.FriendStore.prototype.watchPair = function (uid, other, next, error) {
      if (other === peer && failOnce) {
        failOnce = false;
        queueMicrotask(() =>
          error(Object.assign(new Error('Synthetic selected stream interruption'), { code: 'unavailable' })),
        );
        return () => {};
      }
      return original.call(this, uid, other, next, error);
    };
    window.dispatchEvent(new Event('online'));
  }, f.accepted[30]!);
  await expect(page.getByRole('button', { name: 'Compare selected', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Retry selected connections', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('play100.friend-comparison.v1'))).toBe(preserved);
  await page.getByRole('button', { name: 'Retry selected connections', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Compare selected', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => sessionStorage.getItem('play100.friend-comparison.v1'))).toBe(preserved);
  await page.getByRole('button', { name: 'Incoming', exact: true }).click();
  await page.getByRole('button', { name: 'Friends', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Compare selected', exact: true })).toBeEnabled();
  const origin = page.url();
  await page.evaluate(async (peer) => {
    const source = '/src/cloud/friend-store.ts';
    const module: typeof import('../src/cloud/friend-store') = await import(source);
    const original = module.FriendStore.prototype.pair;
    const gate: NonNullable<Window['managerPairGate']> = {
      waiting: false,
      finished: false,
      accepted: false,
      release: () => {
        throw new Error('The comparison read has not started.');
      },
    };
    window.managerPairGate = gate;
    module.FriendStore.prototype.pair = function (uid, other) {
      if (other !== peer || gate.waiting) return original.call(this, uid, other);
      gate.waiting = true;
      return new Promise<Awaited<ReturnType<typeof original>>>((resolve, reject) => {
        gate.release = () => {
          module.FriendStore.prototype.pair = original;
          void original.call(this, uid, other).then(
            (value) => {
              gate.accepted = value?.state === 'accepted';
              gate.finished = true;
              resolve(value);
            },
            (cause) => {
              gate.finished = true;
              reject(cause);
            },
          );
        };
      });
    };
  }, f.accepted[30]!);
  await page.getByRole('button', { name: 'Compare selected', exact: true }).click();
  await page.waitForFunction(() => window.managerPairGate?.waiting);
  await page.goBack();
  await expect(page).toHaveURL(/view=incoming/);
  await page.goForward();
  await expect(page).toHaveURL(origin);
  await page.evaluate(() => {
    if (!window.managerPairGate) throw new Error('Synthetic read gate is missing.');
    window.managerPairGate.release();
  });
  await expect.poll(() => page.evaluate(() => window.managerPairGate?.finished)).toBe(true);
  expect(await page.evaluate(() => window.managerPairGate?.accepted)).toBe(true);
  await expect(page).toHaveURL(origin);
  expect(await page.evaluate(() => sessionStorage.getItem('play100.friend-comparison.v1'))).toBe(preserved);
  await page.getByRole('button', { name: `View ${f.names[10]}`, exact: true }).click();
  await page.getByRole('button', { name: 'Compare rankings', exact: true }).click();
  await expect(page.getByLabel(f.names[10]!, { exact: true })).toBeChecked();
  expect(await page.locator('.compare-people input:checked').count()).toBe(2);
  await page.goto('/friends?view=incoming');
  await expect(page.getByRole('heading', { name: 'No incoming requests loaded', exact: true })).toBeVisible();
  await expect(page.locator('.friend-list-summary')).toContainText('0 shown / 20 loaded');
  await expect(page.getByRole('button', { name: 'Load next 20 requests', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Load next 20 requests', exact: true }).click();
  await expect(page.locator('.friend-list > li')).toHaveCount(5);
  await page.locator('.friend-list > li').first().getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.locator('.friend-list > li')).toHaveCount(4);
  await page.locator('.friend-list > li').first().getByRole('button', { name: 'Decline', exact: true }).click();
  await expect(page.locator('.friend-list > li')).toHaveCount(3);
  await page.getByRole('button', { name: 'Sent', exact: true }).click();
  await expect(page.locator('.friend-list > li')).toHaveCount(20);
  await page.locator('.friend-list > li').first().getByRole('button', { name: 'Cancel request', exact: true }).click();
  await expect(page.locator('.friend-list > li')).toHaveCount(19);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sent', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.friend-list-summary')).toContainText('more available');
});

test('menus confirm named actions, blocked profiles stay private, invite expiry is precise and account changes clear selections', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(150000);
  const f = await prepare(page, request);
  const row = page.locator('.friend-list > li').filter({ hasText: f.names[0]! });
  const more = row.getByRole('button', { name: `More actions for ${f.names[0]}`, exact: true });
  await more.focus();
  await more.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Remove friend', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  await more.click();
  await page.getByRole('menuitem', { name: 'Block player', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading')).toContainText(f.names[0]!);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(more).toBeFocused();
  await more.click();
  await page.getByRole('menuitem', { name: 'Block player', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Block player', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Player blocked.' })).toBeVisible();
  const readsBefore = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem('qa:manager-reads') ?? '{}').identities.length,
  );
  await page.getByRole('button', { name: 'Blocked', exact: true }).click();
  await expect(page.locator('.friend-list > li')).toHaveCount(2);
  const laterReads: string[] = await page.evaluate(
    (start) => JSON.parse(sessionStorage.getItem('qa:manager-reads') ?? '{}').identities.slice(start),
    readsBefore,
  );
  expect(laterReads).not.toContain(f.blocked);
  expect(laterReads).not.toContain(f.accepted[0]);
  await page
    .locator('.friend-list > li')
    .filter({ hasText: f.accepted[0]!.slice(-6) })
    .getByRole('button', { name: 'Unblock', exact: true })
    .click();
  await expect(page.getByRole('status').filter({ hasText: 'Friendship was not restored.' })).toBeVisible();
  await page.getByRole('button', { name: 'Invite links', exact: true }).click();
  await expect(page.locator('.friend-list > li')).toHaveCount(5);
  for (const status of ['Active', 'Used', 'Expired', 'Revoked'])
    await expect(
      page
        .locator('.friend-invite-status')
        .filter({ hasText: new RegExp(`^${status}$`) })
        .first(),
    ).toBeVisible();
  const inactive = page
    .locator('.friend-list > li')
    .filter({ has: page.locator('.friend-invite-status').filter({ hasText: /^(Used|Expired|Revoked)$/ }) });
  expect(await inactive.getByRole('button').count()).toBe(0);
  const active = page
    .locator('.friend-list > li')
    .filter({ has: page.locator('.friend-invite-status').filter({ hasText: /^Active$/ }) })
    .first();
  await active.getByRole('button', { name: 'Revoke', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Existing friendships stay connected');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(active.getByRole('button', { name: 'Copy link', exact: true })).toBeVisible();
  await active.getByRole('button', { name: 'Revoke', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke invitation', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Invitation revoked.' })).toBeVisible();
  await expect(page.locator('.friend-list > li')).toHaveCount(4);
  await expect(page.locator('.friend-invite-status').filter({ hasText: /^Revoked$/ })).toHaveCount(1);
  await page.clock.install();
  await writeManagerDocuments(request, {
    [`friendInvites/${f.tokens[4]}`]: {
      format: 1,
      ownerUid: f.uid,
      slot: 4,
      displayName: 'QA Manager',
      avatar: f.avatar,
      state: 'active',
      createdAt: new Date(Date.now() - inviteLifetime + 3000),
      acceptedBy: null,
    },
  });
  await page.getByRole('button', { name: 'Refresh loaded', exact: true }).click();
  await expect(page.locator('.friend-invite-status').filter({ hasText: /^Active$/ })).toHaveCount(1);
  await page.clock.fastForward(4000);
  await expect(page.locator('.friend-invite-status').filter({ hasText: /^Active$/ })).toHaveCount(0);
  await expect(page.locator('.friend-invite-status').filter({ hasText: /^Expired$/ })).toHaveCount(2);
  await checkManager(page);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.screenshot({ path: testInfo.outputPath('invite-manager.png') });
  await page.goto('/friends');
  await page.getByRole('checkbox', { name: `Select ${f.names[3]} for comparison`, exact: true }).check();
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('play100.friend-comparison.v1'))).toBeNull();
  const otherEmail = emailFor('manager-other');
  await createAccount(page, otherEmail);
  await verifyEmail(page, request, otherEmail);
  await enableSync(page);
  await page.goto('/friends');
  await expect(page.getByRole('heading', { name: 'No friends loaded', exact: true })).toBeVisible();
  await expect(page.locator('.friend-selection-bar')).toHaveCount(0);
  await expect(page.locator('.friend-list')).toBeEmpty();
  await page.goto('/compare');
  await expect(page.locator('.compare-people input:checked')).toHaveCount(1);
  await expect(page.locator('.compare-people')).not.toContainText(f.names[3]!);
});
