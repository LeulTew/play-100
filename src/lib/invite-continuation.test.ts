import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  captureInviteContinuation,
  clearInviteContinuation,
  createInviteUrl,
  readInviteContinuation,
  saveInviteContinuation,
} from './invite-continuation';

const synthetic = 'a'.repeat(64);
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal('location', {
    pathname: '/invite',
    hash: `#${synthetic}`,
    origin: 'https://play-100-collection.vercel.app',
  });
  vi.stubGlobal('history', { replaceState: vi.fn() });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('captures a fragment-only capability before sign-in without adding it to a return URL', () => {
  const result = captureInviteContinuation();
  expect(result).toEqual({ capability: synthetic, error: '' });
  expect(history.replaceState).toHaveBeenCalledWith(null, '', '/invite');
  expect(readInviteContinuation()).toBe(synthetic);
  expect(createInviteUrl(synthetic)).toBe(`https://play-100-collection.vercel.app/invite#${synthetic}`);
});
it('expires the temporary resume and clears it on successful consumption', () => {
  vi.useFakeTimers();
  saveInviteContinuation(synthetic);
  vi.advanceTimersByTime(30 * 60_000 + 1);
  expect(readInviteContinuation()).toBeNull();
  expect(values.size).toBe(0);
  saveInviteContinuation(synthetic);
  clearInviteContinuation();
  expect(readInviteContinuation()).toBeNull();
});
it('rejects malformed and private-data-shaped intents instead of routing arbitrary URLs', () => {
  vi.stubGlobal('location', {
    pathname: '/invite',
    hash: '#https://untrusted.invalid/',
    origin: 'https://play-100-collection.vercel.app',
  });
  expect(captureInviteContinuation()).toEqual({ capability: null, error: 'This invitation link is invalid.' });
  saveInviteContinuation(synthetic);
  const key = [...values.keys()][0]!;
  const data = JSON.parse(values.get(key)!);
  values.set(key, JSON.stringify({ ...data, email: 'forbidden@example.invalid' }));
  expect(readInviteContinuation()).toBeNull();
});
it('keeps the opened invitation available in memory with an explicit warning if temporary storage fails', () => {
  vi.stubGlobal('sessionStorage', {
    setItem: () => {
      throw new DOMException('Denied', 'SecurityError');
    },
  });
  const result = captureInviteContinuation();
  expect(result.capability).toBe(synthetic);
  expect(result.error).toContain('cannot keep the invitation');
  expect(history.replaceState).toHaveBeenCalledWith(null, '', '/invite');
});
it.each(['normal acknowledgement', 'committed refresh error'])(
  'an old %s cannot clear a newer invitation continuation',
  () => {
    const newer = 'b'.repeat(64);
    saveInviteContinuation(synthetic);
    saveInviteContinuation(newer);
    clearInviteContinuation(synthetic);
    expect(readInviteContinuation()).toBe(newer);
    clearInviteContinuation(newer);
    expect(readInviteContinuation()).toBeNull();
  },
);
