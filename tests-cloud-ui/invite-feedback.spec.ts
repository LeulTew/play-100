import { expect, test } from '@playwright/test';
import { createAccount, emailFor, enableSync, verifyEmail } from './helpers';

declare global {
  interface Window { inviteGate?: { calls: number; committed: boolean; identityWrites?: number; release: () => void } }
}
test.beforeEach(async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const email = emailFor('invite-feedback');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page, 'empty');
  await page.locator('#page-main').getByRole('button', { name: 'Friends', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Invite someone', exact: true })).toBeEnabled();
});

test('first friend identity waits for delayed lifecycle and settings initialization before writing', async ({ page }) => {
  await page.evaluate(async () => {
    const sourceUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(url => new URL(url).pathname === '/src/cloud/friend-store.ts');
    if (!sourceUrl) throw new Error('Loaded FriendStore module missing.');
    const source: typeof import('../src/cloud/friend-store') = await import(sourceUrl);
    const initialize = source.FriendStore.prototype.initialize;
    const saveIdentity = source.FriendStore.prototype.saveIdentity;
    const gate: NonNullable<Window['inviteGate']> = { calls: 0, committed: false, identityWrites: 0, release: () => {} };
    window.inviteGate = gate;
    source.FriendStore.prototype.initialize = async function(uid) {
      gate.calls += 1;
      if (await this.settings(uid) !== null || await this.identity(uid) !== null) throw new Error('Expected an uninitialized friend identity.');
      await new Promise<void>(resolve => { gate.release = resolve; gate.committed = true; });
      const settings = await initialize.call(this, uid);
      gate.committed = false;
      return settings;
    };
    source.FriendStore.prototype.saveIdentity = function(uid, input, revision) {
      gate.identityWrites = (gate.identityWrites ?? 0) + 1;
      if (gate.committed) throw new Error('Identity write started before initialization was acknowledged.');
      return saveIdentity.call(this, uid, input, revision);
    };
  });
  await page.getByRole('button', { name: 'Invite someone', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.inviteGate?.committed)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Creating invite…', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.inviteGate?.identityWrites)).toBe(0);
  await expect(page.getByLabel('Invitation link', { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.inviteGate?.release());
  await expect(page.getByLabel('Invitation link', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.inviteGate?.identityWrites)).toBe(1);
  expect(await page.evaluate(() => window.inviteGate?.calls)).toBe(1);
});

test('creation feedback is immediate, duplicate clicks create once, and closing cannot reopen a late confirmed link', async ({ page }) => {
  await page.evaluate(async () => {
    const sourceUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(url => new URL(url).pathname === '/src/cloud/friend-store.ts');
    if (!sourceUrl) throw new Error('Loaded FriendStore module missing.');
    const module: typeof import('../src/cloud/friend-store') = await import(sourceUrl);
    const original = module.FriendStore.prototype.createInvite;
    const gate: NonNullable<Window['inviteGate']> = { calls: 0, committed: false, release: () => {} };
    window.inviteGate = gate;
    module.FriendStore.prototype.createInvite = async function(uid) {
      gate.calls += 1;
      const invite = await original.call(this, uid);
      gate.committed = true;
      await new Promise<void>(resolve => { gate.release = resolve; });
      return invite;
    };
  });
  await page.getByRole('button', { name: 'Invite someone', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByRole('heading', { name: 'Creating invite…', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Creating invite…', exact: true })).toBeFocused();
  await expect(page.getByLabel('Invitation link', { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.inviteGate?.committed)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Friends', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Creating invite…', exact: true })).toBeDisabled();
  await page.evaluate(() => window.inviteGate?.release());
  await expect(page.getByRole('button', { name: 'Invite someone', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.inviteGate?.calls)).toBe(1);
  await page.getByRole('button', { name: 'Invite links', exact: true }).click();
  await expect(page.locator('.friend-list > li')).toHaveCount(1);
  await expect(page.locator('.friend-invite-status')).toHaveText('Active');
});

test('known server ACK with a readback failure refreshes the actual invitation without replaying creation', async ({ page }) => {
  await page.getByRole('button', { name: 'Invite links', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Invite someone', exact: true })).toBeEnabled();
  await page.evaluate(async () => {
    const resources = performance.getEntriesByType('resource').map(entry => entry.name);
    const sourceUrl = resources.find(url => new URL(url).pathname === '/src/cloud/friend-store.ts');
    const typesUrl = resources.find(url => new URL(url).pathname === '/src/lib/friend-types.ts');
    if (!sourceUrl || !typesUrl) throw new Error('Loaded friend modules missing.');
    const source: typeof import('../src/cloud/friend-store') = await import(sourceUrl);
    const types: typeof import('../src/lib/friend-types') = await import(typesUrl);
    const original = source.FriendStore.prototype.createInvite;
    const gate: NonNullable<Window['inviteGate']> = { calls: 0, committed: false, release: () => {} };
    window.inviteGate = gate;
    source.FriendStore.prototype.createInvite = async function(uid) {
      gate.calls += 1;
      await original.call(this, uid); gate.committed = true;
      source.FriendStore.prototype.createInvite = original;
      throw new types.FriendCommittedError({ operation: 'create-invite', uid }, new Error('Synthetic acknowledgement readback failure'));
    };
  });
  await page.getByRole('button', { name: 'Invite someone', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check invite links', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Invitation created.');
  await expect(page.getByLabel('Invitation link', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open invite links', exact: true }).click();
  await expect(page.locator('.friend-list > li')).toHaveCount(1);
  await expect(page.locator('.friend-invite-status')).toHaveText('Active');
  await expect(page.getByRole('button', { name: 'Invite someone', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.inviteGate?.calls)).toBe(1);
  await page.getByRole('button', { name: 'Invite someone', exact: true }).click();
  await expect(page.getByLabel('Invitation link', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('.friend-list > li')).toHaveCount(2);
});

for (const exit of ['close', 'navigate'] as const) test(`${exit} while preparation is pending prevents a late invite and preserves the destination`, async ({ page }) => {
  await page.evaluate(async () => {
    const sourceUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(url => new URL(url).pathname === '/src/cloud/friend-store.ts');
    if (!sourceUrl) throw new Error('Loaded FriendStore module missing.');
    const source: typeof import('../src/cloud/friend-store') = await import(sourceUrl);
    const identity = source.FriendStore.prototype.identity;
    const create = source.FriendStore.prototype.createInvite;
    const gate: NonNullable<Window['inviteGate']> = { calls: 0, committed: false, release: () => {} };
    window.inviteGate = gate;
    let holdNextIdentity = true;
    source.FriendStore.prototype.identity = async function(uid) {
      const hold = holdNextIdentity; holdNextIdentity = false;
      const profile = await identity.call(this, uid);
      if (hold) await new Promise<void>(resolve => { gate.release = resolve; gate.committed = true; });
      return profile;
    };
    source.FriendStore.prototype.createInvite = function(uid) { gate.calls += 1; return create.call(this, uid); };
  });
  await page.getByRole('button', { name: 'Invite someone', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.inviteGate?.committed)).toBe(true);
  if (exit === 'navigate') {
    await page.goBack();
    await expect(page).toHaveURL(/\/account$/);
  } else {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.evaluate(() => window.inviteGate?.release());
  await expect(page.getByRole('heading', { name: exit === 'navigate' ? 'Account' : 'Friends', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.inviteGate?.calls)).toBe(0);
  if (exit === 'close') {
    await expect(page.getByRole('button', { name: 'Invite someone', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Invite links', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No invite links', exact: true })).toBeVisible();
  }
});
