import type { Auth } from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOOGLE_REDIRECT_KEY } from '../lib/google-intent';
import { finishGoogleRedirect } from './google-auth';

const sdk = vi.hoisted(() => ({ getRedirectResult: vi.fn() }));
vi.mock('firebase/auth', () => ({
  getRedirectResult: sdk.getRedirectResult,
  GoogleAuthProvider: class {},
  linkWithRedirect: vi.fn(),
  reauthenticateWithRedirect: vi.fn(),
  signInWithRedirect: vi.fn(),
}));

const stored = new Map<string, string>();
function auth(uid: string | null = null): Auth {
  return { currentUser: uid ? { uid } : null } as unknown as Auth;
}
function storeIntent(kind: 'sign-in' | 'link') {
  const intent = {
    version: 1,
    requestId: 'a'.repeat(32),
    createdAt: Date.now(),
    returnPath: '/account',
    kind,
    uid: kind === 'link' ? 'qa-user-a' : null,
  };
  stored.set(GOOGLE_REDIRECT_KEY, JSON.stringify(intent));
  return intent;
}
const googleSignIn = { user: { uid: 'qa-user-a' }, providerId: 'google.com', operationType: 'signIn' };

beforeEach(() => {
  stored.clear();
  sdk.getRedirectResult.mockReset();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => {
      stored.set(key, value);
    },
    removeItem: (key: string) => {
      stored.delete(key);
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Google redirect return', () => {
  // Auth start-up already reads any pending redirect, so asking again costs no request and keeps the check below.
  it('still asks the SDK without a stored request, and settles quietly when nothing returned', async () => {
    sdk.getRedirectResult.mockResolvedValue(null);
    const target = auth();
    await expect(finishGoogleRedirect(target)).resolves.toEqual({
      attempted: false,
      intent: null,
      uid: null,
      completed: false,
      error: '',
      message: '',
    });
    expect(sdk.getRedirectResult).toHaveBeenCalledTimes(1);
    expect(sdk.getRedirectResult).toHaveBeenCalledWith(target);
  });

  it('refuses a Google result that returns without a matching request in this tab', async () => {
    sdk.getRedirectResult.mockResolvedValue(googleSignIn);
    const outcome = await finishGoogleRedirect(auth('qa-user-a'));
    expect(outcome).toMatchObject({ attempted: true, completed: false, uid: null, message: '' });
    expect(outcome.error).toBe(
      'Google returned without a matching request in this tab. Review Account; nothing was deleted or copied.',
    );
  });

  it('explains a request that came back unfinished and clears it', async () => {
    storeIntent('link');
    sdk.getRedirectResult.mockResolvedValue(null);
    await expect(finishGoogleRedirect(auth('qa-user-a'))).resolves.toMatchObject({
      attempted: true,
      completed: false,
      error: '',
      message: 'Google linking was not completed. Your existing account is unchanged.',
    });
    expect(stored.has(GOOGLE_REDIRECT_KEY)).toBe(false);
  });

  it('completes a matching sign-in once per Auth instance', async () => {
    const intent = storeIntent('sign-in');
    sdk.getRedirectResult.mockResolvedValue(googleSignIn);
    const target = auth('qa-user-a');
    const first = finishGoogleRedirect(target);
    expect(finishGoogleRedirect(target)).toBe(first);
    await expect(first).resolves.toMatchObject({
      attempted: true,
      completed: true,
      uid: 'qa-user-a',
      intent,
      error: '',
    });
    expect(sdk.getRedirectResult).toHaveBeenCalledTimes(1);
    expect(stored.has(GOOGLE_REDIRECT_KEY)).toBe(false);
  });

  it('reports an unreachable sign-in service without completing', async () => {
    storeIntent('sign-in');
    const offline = Object.assign(new Error('offline'), { code: 'auth/network-request-failed' });
    sdk.getRedirectResult.mockRejectedValue(offline);
    await expect(finishGoogleRedirect(auth())).resolves.toMatchObject({
      attempted: true,
      completed: false,
      error: 'The sign-in service could not be reached. Check your connection and try again.',
    });
  });
});
