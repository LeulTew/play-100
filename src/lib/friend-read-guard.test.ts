import { expect, it } from 'vitest';
import { createFriendReadGuard, createFriendWorkGeneration } from './friend-read-guard';

it('a deferred ranking result cannot repopulate data after a relationship permission error', async () => {
  const access = createFriendReadGuard();
  access.accept(3);
  const lease = access.begin();
  let finish: ((score: number) => void) | undefined;
  let visibleScore: number | null = null;
  const read = new Promise<number>((resolve) => { finish = resolve; }).then((score) => { if (access.permits(lease)) visibleScore = score; });
  access.revoke(); visibleScore = null;
  finish?.(9);
  await read;
  expect(visibleScore).toBeNull();
});
it('a new accepted relationship never validates an earlier read lease', () => {
  const access = createFriendReadGuard();
  expect(access.begin()).toBeNull();
  access.accept(1);
  const before = access.begin();
  access.revoke();
  access.accept(3);
  expect(access.permits(before)).toBe(false);
  expect(access.permits(access.begin())).toBe(true);
});

it.each(['settings', 'head'])('stopping during a deferred %s read invalidates work synchronously, while explicit retry gets a new generation', async () => {
  const work = createFriendWorkGeneration();
  const original = work.next();
  let finish: (() => void) | undefined;
  let published = 0;
  let showedSuccess = false;
  const pending = new Promise<void>((resolve) => { finish = resolve; }).then(() => {
    if (!work.current(original)) return;
    published += 1; showedSuccess = true;
  });
  work.cancel();
  finish?.(); await pending;
  expect(published).toBe(0);
  expect(showedSuccess).toBe(false);
  const retried = work.next();
  expect(work.current(original)).toBe(false);
  expect(work.current(retried)).toBe(true);
});
