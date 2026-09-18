import { expect, test } from '@playwright/test';
import { createAccount, emailFor, enableSync, expectRestoredSync, readAccount, signIn, uidFor, verifyEmail } from './helpers';

test('account sync keeps Played and Completed distinct and excludes both from All sharing', async ({ page, request, browser, viewport, isMobile }) => {
  const email = emailFor('progress-sync');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page, 'empty');
  const uid = await uidFor(request, email);
  await page.goto('/my-games');
  const editor = page.locator('.my-games-editor:visible');
  await editor.locator('.manual-add > summary').click();
  await editor.getByLabel('Game title', { exact: true }).fill('Sync progress fixture');
  await editor.getByRole('button', { name: 'Add to my library', exact: true }).click();
  await expect(page.locator('.friend-sharing-summary')).toContainText('Up to date', { timeout: 30000 });
  const record = Object.values((await readAccount(page, uid)).state.records).find(record => record.title === 'Sync progress fixture');
  if (!record) throw new Error('The actual account fixture was not saved.');
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:4187', viewport, isMobile, hasTouch: isMobile, reducedMotion: 'reduce' });
  try {
    const peer = await other.newPage();
    await signIn(peer, email); await expectRestoredSync(peer); await peer.goto('/my-games');
    const peerEditor = peer.locator('.my-games-editor:visible');
    const played = editor.getByRole('checkbox', { name: 'Played: Sync progress fixture', exact: true });
    const peerPlayed = peerEditor.getByRole('checkbox', { name: 'Played: Sync progress fixture', exact: true });
    await expect(peerPlayed).not.toBeChecked();
    await expect(played).not.toBeChecked();
    await played.click();
    await expect(played).toBeChecked();
    await expect(peerPlayed).toBeChecked({ timeout: 30000 });
    await expect(peerEditor.getByRole('button', { name: 'Mark Sync progress fixture completed', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await editor.getByRole('button', { name: 'Mark Sync progress fixture completed', exact: true }).click();
    await expect(peerEditor.getByRole('button', { name: 'Unmark Sync progress fixture completed', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
    await peerEditor.getByRole('button', { name: 'Unmark Sync progress fixture completed', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Mark Sync progress fixture completed', exact: true })).toHaveAttribute('aria-pressed', 'false', { timeout: 30000 });
    await expect(played).toBeChecked();
    await expect(page.locator('.friend-sharing-summary')).toContainText('Up to date', { timeout: 30000 });
    const keys = await page.evaluate(async () => {
      const clientPath = '/src/cloud/firebase-client.ts'; const storePath = '/src/cloud/friend-all-store.ts';
      const client: typeof import('../src/cloud/firebase-client') = await import(clientPath);
      const module: typeof import('../src/cloud/friend-all-store') = await import(storePath);
      const uid = client.cloudAuth.currentUser?.uid; if (!uid) throw new Error('Synthetic account missing.');
      const result = await new module.FriendAllStore(client.cloudDb).page(uid, 'games');
      return result.entries.map(entry => Object.keys(entry).sort());
    });
    expect(keys).toEqual([['id', 'source', 'sourceId', 'sourceUrl', 'title', 'year']]);
    expect((await readAccount(page, uid)).state.progress[record.id]).toEqual({ played: true, completed: false, later: false });
  } finally { await other.close(); }
});
