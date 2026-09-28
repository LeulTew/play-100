import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNoticeStore, NOTICE_DURATION } from './notice-store';

describe('createNoticeStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a notice to its subscribers until it expires', () => {
    const notices = createNoticeStore();
    const listener = vi.fn();
    notices.subscribe(listener);
    notices.notify('Saved.');
    expect(notices.get()).toBe('Saved.');
    expect(listener).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(NOTICE_DURATION - 1);
    expect(notices.get()).toBe('Saved.');
    vi.advanceTimersByTime(1);
    expect(notices.get()).toBe('');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('lets a new notice replace the last and restart the expiry', () => {
    const notices = createNoticeStore(100);
    notices.notify('First.');
    vi.advanceTimersByTime(80);
    notices.notify('Second.');
    vi.advanceTimersByTime(80);
    expect(notices.get()).toBe('Second.');
    vi.advanceTimersByTime(20);
    expect(notices.get()).toBe('');
  });

  it('notifies nobody when a notice repeats or clearing finds none', () => {
    const notices = createNoticeStore(100);
    const listener = vi.fn();
    notices.subscribe(listener);
    notices.clear();
    notices.notify('Same.');
    notices.notify('Same.');
    expect(listener).toHaveBeenCalledTimes(1);
    notices.clear();
    expect(notices.get()).toBe('');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stops the pending expiry when disposed', () => {
    const notices = createNoticeStore(100);
    const listener = vi.fn();
    notices.notify('Kept.');
    notices.subscribe(listener);
    notices.dispose();
    vi.advanceTimersByTime(200);
    expect(notices.get()).toBe('Kept.');
    expect(listener).not.toHaveBeenCalled();
  });
});
