import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createAccount, emailFor, enableSync, verifyEmail } from './helpers';

interface InviteTiming { start: number; disabled: number | null; dialog: number | null; link: number | null; calls: Array<{ method: string; elapsed: number }> }
declare global { interface Window { inviteTiming?: InviteTiming } }

test('measures first and warm invitation feedback and confirmed links with a 300ms request delay', async ({ page, request }, testInfo) => {
  test.setTimeout(180000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const email = emailFor('invite-latency');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page, 'empty');
  await page.goto('/friends');
  await expect(page.getByRole('button', { name: 'Invite someone', exact: true })).toBeEnabled();
  await page.evaluate(async () => {
    const modulePath = performance.getEntriesByType('resource').map(entry => entry.name).find(url => new URL(url).pathname === '/src/cloud/friend-store.ts');
    if (!modulePath) throw new Error('The application FriendStore module was not loaded.');
    const source: typeof import('../src/cloud/friend-store') = await import(modulePath);
    const originalInitialize = source.FriendStore.prototype.initialize;
    const originalIdentity = source.FriendStore.prototype.identity;
    const originalSettings = source.FriendStore.prototype.settings;
    const originalCreate = source.FriendStore.prototype.createInvite;
    const tracked = async <T,>(method: string, operation: () => Promise<T>) => {
      const start = performance.now(); const timing = window.inviteTiming;
      try { return await operation(); } finally { if (timing) timing.calls.push({ method, elapsed: performance.now() - start }); }
    };
    source.FriendStore.prototype.initialize = function(uid) { return tracked('initialize', () => originalInitialize.call(this, uid)); };
    source.FriendStore.prototype.identity = function(uid) { return tracked('identity', () => originalIdentity.call(this, uid)); };
    source.FriendStore.prototype.settings = function(uid) { return tracked('settings', () => originalSettings.call(this, uid)); };
    source.FriendStore.prototype.createInvite = function(uid) { return tracked('createInvite', () => originalCreate.call(this, uid)); };
  });
  await page.route('http://127.0.0.1:8188/**', async route => {
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.continue();
  });
  const results = [];
  let measuring = false;
  let requests: Record<string, number> = {};
  const mutation: { acknowledged: number | null } = { acknowledged: null };
  let started = 0;
  page.on('request', request => {
    if (!measuring || new URL(request.url()).port !== '8188') return;
    const url = new URL(request.url());
    const kind = url.pathname.includes(':batchGet') ? 'transaction-read' : url.pathname.includes(':commit') ? 'transaction-commit' :
      url.pathname.includes('/Listen/') ? 'server-listener' : url.pathname.includes('/Write/') ? 'write-stream' : 'other';
    requests[kind] = (requests[kind] ?? 0) + 1;
  });
  page.on('response', response => {
    if (!measuring || !response.url().includes(':commit') || !response.ok()) return;
    const body = response.request().postData();
    if (body?.includes('/documents/friendInvites/') && body.includes('"active"')) mutation.acknowledged = Date.now() - started;
  });
  for (const state of ['first', 'warm'] as const) {
    requests = {}; mutation.acknowledged = null;
    await page.evaluate(() => {
      const timing: InviteTiming = { start: performance.now(), disabled: null, dialog: null, link: null, calls: [] };
      window.inviteTiming = timing;
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('Invite someone'));
      if (!button) throw new Error('Invite action missing.');
      button.addEventListener('click', () => { timing.start = performance.now(); }, { once: true });
      const observer = new MutationObserver(() => {
        if (timing.disabled === null && button.disabled) timing.disabled = performance.now() - timing.start;
        if (timing.dialog === null && document.querySelector('#invite-link-title')) timing.dialog = performance.now() - timing.start;
        if (document.querySelector('#friend-invite-link')) { timing.link = performance.now() - timing.start; observer.disconnect(); }
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    });
    measuring = true; started = Date.now();
    await page.getByRole('button', { name: 'Invite someone', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Creating invite…', exact: true })).toBeVisible();
    await expect(page.getByLabel('Invitation link', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Invitation link', { exact: true })).toBeVisible({ timeout: 60000 });
    const link = await page.getByLabel('Invitation link', { exact: true }).inputValue();
    expect(new URL(link).hash).toMatch(/^#[a-f0-9]{64}$/);
    const timing = await page.evaluate(() => window.inviteTiming);
    expect(timing?.calls.filter(call => call.method === 'createInvite')).toHaveLength(1);
    expect(timing?.disabled).toBeLessThan(500);
    expect(timing?.dialog).toBeLessThan(500);
    expect(mutation.acknowledged).not.toBeNull();
    results.push({ state, injectedDelayPerFirestoreHttpRequest: 300, feedbackMs: Math.round(timing!.disabled!), creatingDialogMs: Math.round(timing!.dialog!), linkMs: Math.round(timing!.link!), mutationAckMs: mutation.acknowledged, requests: { ...requests }, calls: timing!.calls.map(call => ({ method: call.method, elapsedMs: Math.round(call.elapsed) })) });
    measuring = false;
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Invite someone', exact: true })).toBeEnabled();
  }
  await writeFile(testInfo.outputPath('invite-latency.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
});
