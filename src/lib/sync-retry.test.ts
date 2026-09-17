import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retryDelay, syncFailure, SyncWorkQueue } from './sync-retry';

const queues: SyncWorkQueue[] = [];
function queue(work: () => Promise<void>, failed?: (cause: unknown) => void) {
  const next = new SyncWorkQueue(work, (cause) => { failed?.(cause); next.failed(syncFailure(cause)); });
  queues.push(next);
  return next;
}
const network = Object.assign(new Error('Network temporarily unavailable'), { code: 'unavailable' });
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(() => { queues.splice(0).forEach((item) => item.dispose()); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('scope-owned automatic sync recovery', () => {
  it('classifies only retryable transport errors and keeps permission/data/identity errors blocked', () => {
    for (const code of ['unavailable', 'deadline-exceeded', 'aborted', 'cancelled', 'auth/network-request-failed']) expect(syncFailure({ code })).toBe('transient');
    expect(syncFailure(new TypeError('Failed to fetch'))).toBe('transient');
    expect(syncFailure({ code: 'resource-exhausted' })).toBe('quota');
    for (const code of ['permission-denied', 'unauthenticated', 'failed-precondition', 'data-loss', 'auth/user-token-expired']) expect(syncFailure({ code })).toBe('blocked');
    for (const name of ['RemoteConflict', 'SyncRevoked', 'PersonalLibraryConflictError']) expect(syncFailure(Object.assign(new Error('Protected state'), { name }))).toBe('blocked');
    expect(syncFailure(new TypeError('Invalid snapshot'))).toBe('blocked');
  });
  it('caps jittered backoff, with a much longer quota cooldown', () => {
    expect(retryDelay('transient', 1, 0)).toBe(2000);
    expect(retryDelay('transient', 2, 1)).toBe(4800);
    expect(retryDelay('transient', 100, 1)).toBe(60000);
    expect(retryDelay('quota', 1, 0)).toBe(60000);
    expect(retryDelay('quota', 100, 1)).toBe(1800000);
  });
  it('does not reset failure backoff on edits and reads current data when the retry fires', async () => {
    let revision = 1;
    const seen: number[] = [];
    const work = vi.fn(async () => { seen.push(revision); if (seen.length < 3) throw network; q.succeeded(); });
    const q = queue(work);
    q.request();
    await vi.advanceTimersByTimeAsync(0);
    const firstRetry = q.nextAttemptAt;
    revision = 2; q.request(2500, true);
    expect(q.nextAttemptAt).toBe(firstRetry);
    await vi.advanceTimersByTimeAsync(2000);
    expect(seen).toEqual([1, 2]);
    const secondRetry = q.nextAttemptAt;
    revision = 3; q.request(2500, true); q.request(2500, true);
    expect(q.nextAttemptAt).toBe(secondRetry);
    await vi.advanceTimersByTimeAsync(3999);
    expect(work).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(seen).toEqual([1, 2, 3]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('holds quota cooldown across focus, manual checks and further edits', async () => {
    const work = vi.fn(async () => { throw { code: 'resource-exhausted' }; });
    const q = queue(work);
    q.request(); await vi.advanceTimersByTimeAsync(0);
    const due = q.nextAttemptAt;
    q.wake(); q.wake(); await q.retry(); q.request(2500, true);
    expect(q.nextAttemptAt).toBe(due);
    await vi.advanceTimersByTimeAsync(59999);
    expect(work).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(work).toHaveBeenCalledTimes(2);
    expect(q.nextAttemptAt).toBe(Date.now() + 120000);
  });
  it('keeps increasing restore backoff when metadata succeeds but the copy download keeps failing', async () => {
    const metadata = vi.fn(async () => ({ enabled: true }));
    const download = vi.fn(async () => { throw { code: 'resource-exhausted' }; });
    const q = queue(async () => { await metadata(); await download(); q.succeeded(); });
    q.request(); await vi.advanceTimersByTimeAsync(0);
    expect(q.nextAttemptAt).toBe(Date.now() + 60000);
    await metadata();
    q.wake(); await q.retry();
    expect(q.nextAttemptAt).toBe(Date.now() + 60000);
    await vi.advanceTimersByTimeAsync(60000);
    expect(q.nextAttemptAt).toBe(Date.now() + 120000);
    await metadata(); q.wake();
    await vi.advanceTimersByTimeAsync(120000);
    expect(download).toHaveBeenCalledTimes(3);
    expect(q.nextAttemptAt).toBe(Date.now() + 240000);
  });
  it('uses no timer while hidden/offline and coalesces the reconnect signal burst', async () => {
    const work = vi.fn(async () => { if (work.mock.calls.length === 1) throw network; q.succeeded(); });
    const q = queue(work);
    q.request(); await vi.advanceTimersByTimeAsync(0);
    q.setAvailable(false);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(600000);
    expect(work).toHaveBeenCalledOnce();
    q.setAvailable(true); q.wake(); q.wake(); q.wake();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(work).toHaveBeenCalledTimes(2);
    q.setAvailable(false); q.setAvailable(true);
    await vi.advanceTimersByTimeAsync(600000);
    expect(work).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('can reattach a failed listener once per recovery attempt without concurrent work', async () => {
    let listener = false;
    const attach = vi.fn();
    const work = vi.fn(async () => {
      if (!listener) { attach(); listener = true; }
      if (work.mock.calls.length === 1) throw network;
      q.succeeded();
    });
    const q = queue(work, () => { listener = false; });
    q.request(); await vi.advanceTimersByTimeAsync(0);
    expect(attach).toHaveBeenCalledOnce();
    q.wake(); q.wake();
    await vi.advanceTimersByTimeAsync(200);
    expect(attach).toHaveBeenCalledTimes(2);
    expect(listener).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('joins manual checks to one running operation and preserves a queued newer edit', async () => {
    let release: (() => void) | undefined;
    let active = 0;
    let maximum = 0;
    const work = vi.fn(async () => {
      maximum = Math.max(maximum, ++active);
      if (work.mock.calls.length === 1) await new Promise<void>((resolve) => { release = resolve; });
      active -= 1; q.succeeded();
    });
    const q = queue(work);
    q.request(); await vi.advanceTimersByTimeAsync(0);
    const first = q.retry(); const second = q.retry();
    q.request(2500, true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(work).toHaveBeenCalledOnce();
    release?.(); await first; await second;
    await vi.advanceTimersByTimeAsync(0);
    expect(work).toHaveBeenCalledTimes(2);
    expect(maximum).toBe(1);
  });
  it('blocks permanent failures and disposes old-scope results and timers', async () => {
    const blockedWork = vi.fn(async () => { throw { code: 'permission-denied' }; });
    const blocked = queue(blockedWork);
    blocked.request(); await vi.advanceTimersByTimeAsync(0);
    blocked.request(); blocked.wake();
    await vi.advanceTimersByTimeAsync(600000);
    expect(blockedWork).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    let rejectOld: ((cause: unknown) => void) | undefined;
    const oldError = vi.fn();
    const old = queue(() => new Promise<void>((_, reject) => { rejectOld = reject; }), oldError);
    old.request(); await vi.advanceTimersByTimeAsync(0);
    old.dispose();
    const newWork = vi.fn(async () => {});
    const next = queue(newWork); next.request();
    rejectOld?.(network);
    await vi.advanceTimersByTimeAsync(60000);
    expect(oldError).not.toHaveBeenCalled();
    expect(newWork).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('clears a recovered clean check without idle polling and re-arms a later edit', async () => {
    const work = vi.fn(async () => { q.succeeded(); });
    const q = queue(work);
    q.failed('transient');
    q.succeeded(true);
    expect(vi.getTimerCount()).toBe(0);
    q.request(2500, true);
    await vi.advanceTimersByTimeAsync(2500);
    expect(work).toHaveBeenCalledOnce();
    expect(q.reason).toBeNull();
  });
  it('does not strand a manual check when a listener fails or the page goes offline before execution', async () => {
    const work = vi.fn(async () => {});
    const q = queue(work);
    const failedCheck = q.retry();
    q.failed('blocked');
    await failedCheck;
    expect(vi.getTimerCount()).toBe(0);
    const offlineCheck = q.retry();
    q.setAvailable(false);
    await offlineCheck;
    expect(work).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
