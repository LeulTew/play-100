import { expect, test } from '@playwright/test';
import { readLibrary } from './library-helpers';

test('a cross-tab progress change cancels rather than revives an obsolete completion confirmation', async ({ page, context }) => {
  const title = 'Red Dead Redemption 2';
  const id = 'red-dead-redemption-2';
  await page.goto(`/?game=${id}`);
  await page.getByRole('button', { name: 'Mark completed', exact: true }).click();
  const played = page.getByRole('checkbox', { name: `I have played it: ${title}`, exact: true });
  await played.click();
  await expect(page.getByRole('dialog', { name: `Mark ${title} not played?`, exact: true })).toBeVisible();
  const peer = await context.newPage();
  await peer.goto(`/?game=${id}`);
  await peer.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(page.getByRole('dialog', { name: `Mark ${title} not played?`, exact: true })).toHaveCount(0);
  await expect(played).toBeChecked();
  await peer.getByRole('button', { name: 'Mark completed', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Completed', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog', { name: `Mark ${title} not played?`, exact: true })).toHaveCount(0);
  expect((await readLibrary(page)).progress[id]).toEqual({ played: true, completed: true, later: false });
  await peer.close();
});
