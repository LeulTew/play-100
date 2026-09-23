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
  const marked = await request.get(`${firestoreOrigin}/v1/projects/demo-play100/databases/(default)/documents/syncHeads/${uid}`, {
    headers: { Authorization: 'Bearer owner' },
  });
  const head = (await marked.json()).fields;
  expect(head.cleanupEpoch.integerValue).toBe(head.epoch.integerValue);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await (await lookup()).json()).users ?? []).toEqual([]);
  for (const kind of ['accounts', 'creatorRanks']) {
    const remaining = await request.get(`${firestoreOrigin}/v1/projects/demo-play100/databases/(default)/documents/${kind}/${uid}/chunks?pageSize=20`, {
      headers: { Authorization: 'Bearer owner' },
    });
    expect(remaining.ok()).toBe(true);
    expect((await remaining.json()).documents ?? []).toEqual([]);
  }
});

for (const step of ['private', 'public', 'reports', 'groups', 'blocks', 'all', 'shelf', 'friends', 'marker'] as const) {
  test(`interruption at ${step} cleanup never records completion or removes Auth`, async ({ page, request }) => {
    const email = emailFor(`deletion-stop-${step}`);
    await createAccount(page, email);
    await verifyEmail(page, request, email);
    await enableSync(page, 'empty');
    const uid = await uidFor(request, email);
    if (step === 'reports') {
      const id = `Reported_${uid}`;
      await writeManagerDocuments(request, {
        [`reports/${id}`]: { reporterUid: uid, targetUid: 'Reported', reason: 'Synthetic pending report', status: 'open', counted: true, createdAt: new Date() },
        [`accountQuotas/${uid}/limits/reports`]: { count: 1, revision: 1, lastReport: id },
      });
    } else if (step === 'groups' || step === 'blocks') {
      const id = step === 'groups' ? crypto.randomUUID() : 'BlockedPeer';
      await writeManagerDocuments(request, {
        [`${step === 'groups' ? 'friendGroups' : 'friendBlocks'}/${uid}/items/${id}`]: step === 'groups'
          ? { format: 1, name: 'Synthetic group', participantUids: [uid, 'KnownPeer'], revision: 1, createdAt: new Date(), updatedAt: new Date() }
          : { createdAt: new Date() },
        [`accountQuotas/${uid}/limits/${step}`]: { ids: [id], revision: 1 },
      });
    }
    if (step === 'all') await expect.poll(async () => {
      const policy = await request.get(`${firestoreOrigin}/v1/projects/demo-play100/databases/(default)/documents/friendAllPolicies/${uid}`, {
        headers: { Authorization: 'Bearer owner' },
      });
      return policy.status();
    }).toBe(200);
    await page.evaluate(async step => {
      const stop = () => Promise.reject(new Error('Synthetic stop before the final deletion marker.'));
      const load = async (source: string) => import(source);
      if (step === 'private' || step === 'marker') {
        const module: typeof import('../src/cloud/cloud-store') = await load('/src/cloud/cloud-store.ts');
        if (step === 'marker') module.CloudStore.prototype.markCleanupComplete = stop;
        else {
          const original = module.CloudStore.prototype.cleanup;
          module.CloudStore.prototype.cleanup = function(all = false, options: DeletionCleanupOptions = {}) {
            return all ? stop() : original.call(this, all, options);
          };
        }
      } else if (step === 'public' || step === 'reports') {
        const module: typeof import('../src/cloud/social-store') = await load('/src/cloud/social-store.ts');
        if (step === 'reports') module.SocialStore.prototype.withdrawReport = stop;
        else module.SocialStore.prototype.deleteProfile = stop;
      } else if (step === 'groups' || step === 'blocks') {
        const module: typeof import('../src/cloud/friend-store') = await load('/src/cloud/friend-store.ts');
        if (step === 'groups') module.FriendStore.prototype.deleteGroup = stop;
        else Reflect.set(module.FriendStore.prototype, 'releaseBlock', stop);
      } else if (step === 'all') {
        const module: typeof import('../src/cloud/friend-all-store') = await load('/src/cloud/friend-all-store.ts');
        module.FriendAllStore.prototype.cleanupPage = stop;
      } else if (step === 'shelf') {
        const module: typeof import('../src/cloud/friend-shelf-store') = await load('/src/cloud/friend-shelf-store.ts');
        module.FriendShelfStore.prototype.cleanupDeleted = stop;
      } else {
        const module: typeof import('../src/cloud/friend-store') = await load('/src/cloud/friend-store.ts');
        module.FriendStore.prototype.cleanupDeleted = stop;
      }
    }, step);
    await page.locator('.account-danger summary').click();
    await page.getByRole('button', { name: 'Delete account', exact: true }).click();
    await page.getByLabel('Confirm your password', { exact: true }).fill(password);
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm deletion', exact: true }).click();
    await expect(page.locator('.sync-panel [role="alert"]')).toBeVisible();
    const read = await request.get(`${firestoreOrigin}/v1/projects/demo-play100/databases/(default)/documents/syncHeads/${uid}`, {
      headers: { Authorization: 'Bearer owner' },
    });
    const head = (await read.json()).fields;
    expect(head.deleted.booleanValue).toBe(true);
    expect(head.cleanupEpoch).toBeUndefined();
    await page.reload();
    await expect(page.locator('.account-heading')).toContainText(email);
    await expect(page.getByRole('button', { name: 'Finish deleting', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Online copy deleted', exact: true })).toHaveCount(0);
  });
}

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
  await page.addInitScript(() => {
    const copies: string[] = [];
    Reflect.set(window, 'deletionNoticeCopies', copies);
    new MutationObserver(() => {
      const text = document.querySelector('#deletion-notice-title')?.textContent;
      if (text && copies.length < 20 && copies.at(-1) !== text) copies.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.reload();
  const notice = page.getByRole('region', { name: 'Online copy deleted', exact: true });
  await expect(notice).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish deleting', exact: true })).toHaveCount(0);
  await expect(notice.getByRole('button', { name: 'Delete account', exact: true })).toBeVisible();
  await expect(notice).toContainText('The copy on this device is still here');
  expect(await page.evaluate(() => Reflect.get(window, 'deletionNoticeCopies'))).toEqual(['Online copy deleted']);
});

test('an outstanding deletion probe uses neutral pending copy before its real result', async ({ page, request }) => {
  const email = emailFor('pending-copy-check');
  await createAccount(page, email);
  await verifyEmail(page, request, email);
  await enableSync(page, 'empty');
  await page.goto('/friends');
  await expect(page.getByRole('heading', { name: 'Friends', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const storeSource = '/src/cloud/cloud-store.ts';
    const clientSource = '/src/cloud/firebase-client.ts';
    const module: typeof import('../src/cloud/cloud-store') = await import(storeSource);
    const client: typeof import('../src/cloud/firebase-client') = await import(clientSource);
    const uid = client.cloudAuth.currentUser?.uid;
    if (!uid) throw new Error('The synthetic actor is not signed in.');
    const store = new module.CloudStore(client.cloudDb, uid);
    await store.revoke(await store.head(), true);
    const original = module.CloudStore.prototype.probeDeletedCopy;
    module.CloudStore.prototype.probeDeletedCopy = function(head) {
      return new Promise<Awaited<ReturnType<typeof original>>>((resolve, reject) => {
        Reflect.set(window, 'releaseDeletionProbe', () => { void original.call(this, head).then(resolve, reject); });
      });
    };
    history.pushState({}, '', '/account');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  const pending = page.getByRole('region', { name: 'Deletion was requested', exact: true });
  await expect(pending.getByRole('status')).toHaveText("Checking what's still stored online...");
  await expect(pending).not.toContainText("We couldn't confirm everything was removed");
  await expect(pending.getByRole('button', { name: 'Finish deleting', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const release: unknown = Reflect.get(window, 'releaseDeletionProbe');
    if (typeof release !== 'function') throw new Error('The deletion probe has not started.');
    release();
  });
  await expect(page.getByRole('region', { name: "Deletion isn't finished", exact: true })).toBeVisible();
});
