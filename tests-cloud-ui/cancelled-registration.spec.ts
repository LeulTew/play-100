import { expect, test } from '@playwright/test';
import { authOrigin, emailFor, firestoreOrigin, password, signIn } from './helpers';

test('a verified cancelled registration offers removal without bootstrapping content', async ({ page, context, request, baseURL }) => {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Use only the owned emulator-bound app.');
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return [new URL(baseURL).origin, authOrigin, firestoreOrigin].includes(url.origin)
      ? route.continue() : route.abort('blockedbyclient');
  });
  await page.goto('/account');
  await expect(page.locator('.emulator-note')).toContainText('synthetic accounts only');
  const email = emailFor('cancelled-registration');
  const created = await request.post(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-play100-key`, {
    data: { email, password, returnSecureToken: true },
  });
  expect(created.ok()).toBe(true);
  const actor: unknown = await created.json();
  if (!actor || typeof actor !== 'object' || !('localId' in actor) || typeof actor.localId !== 'string' ||
    !('idToken' in actor) || typeof actor.idToken !== 'string') throw new Error('The local cancellation actor was not created.');
  const uid = actor.localId;
  const document = `${firestoreOrigin}/v1/projects/demo-play100/databases/(default)/documents/accountLifecycle/${uid}`;
  try {
    const cancelled = await request.patch(document, {
      headers: { Authorization: `Bearer ${actor.idToken}` }, data: { fields: { state: { stringValue: 'cancelled' } } },
    });
    expect(cancelled.ok()).toBe(true);
    const verified = await request.post(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-play100-key`, {
      headers: { Authorization: 'Bearer owner' }, data: { localId: uid, emailVerified: true },
    });
    expect(verified.ok()).toBe(true);
    await signIn(page, email);
    const removal = page.getByRole('button', { name: 'Remove cancelled sign-in', exact: true });
    await expect(removal).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'cancelled registration' })).toContainText('same email');
    await removal.click();
    const dialog = page.getByRole('dialog', { name: 'Remove cancelled sign-in?', exact: true });
    await dialog.getByLabel('Confirm your password').fill(password);
    await dialog.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    const result = await request.post(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=demo-play100-key`, {
      headers: { Authorization: 'Bearer owner' }, data: { localId: [uid] },
    });
    expect((await result.json()).users ?? []).toEqual([]);
    for (const collection of ['members', 'syncHeads', 'publicControls']) {
      const content = await request.get(`${firestoreOrigin}/v1/projects/demo-play100/databases/(default)/documents/${collection}/${uid}`, {
        headers: { Authorization: 'Bearer owner' },
      });
      expect(content.status()).toBe(404);
    }
    const marker = await request.get(document, { headers: { Authorization: 'Bearer owner' } });
    expect((await marker.json()).fields.state.stringValue).toBe('cancelled');
  } finally {
    await request.post(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-play100-key`, {
      headers: { Authorization: 'Bearer owner' }, data: { localId: uid },
    });
    await request.delete(document, { headers: { Authorization: 'Bearer owner' } });
  }
});
