import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import type { AccountIdentity } from './ui-types';
import type { GoogleRequest } from '../lib/google-intent';
import type { GoogleReturn } from './google-auth';
import {
  applyGoogleReturn,
  googleReturnTransition,
  observeAccountSession,
  sessionNeedsConfirmation,
  signInNeedsAccountPage,
} from './account-session';

const calls = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'alpha' } as { uid: string } | null },
  finish: vi.fn<() => Promise<GoogleReturn>>(),
  listen: vi.fn(),
  stop: vi.fn(),
  next: null as ((user: User | null) => void) | null,
  error: null as ((error: Error) => void) | null,
  intent: vi.fn(() => ({ raw: null as string | null })),
  remember: vi.fn(async () => true),
}));
vi.mock('./firebase-client', () => ({ cloudAuth: calls.auth, initialAuthUser: Promise.resolve('alpha') }));
vi.mock('firebase/auth', () => ({ onIdTokenChanged: calls.listen }));
vi.mock('./google-auth', () => ({ finishGoogleRedirect: calls.finish }));
vi.mock('../lib/google-intent', () => ({ readGoogleIntent: calls.intent }));
vi.mock('../lib/online-availability', () => ({ rememberOnlineRequest: calls.remember }));
const identity: AccountIdentity = {
  uid: 'alpha',
  email: 'alpha@example.test',
  displayName: 'Alpha',
  verified: true,
  providers: ['google.com'],
};
function returned(request: GoogleRequest = { kind: 'sign-in', uid: null }): GoogleReturn {
  return {
    attempted: true,
    completed: true,
    uid: 'alpha',
    intent: { ...request, version: 1, requestId: 'request-a', createdAt: 1000, returnPath: '/account' },
    error: '',
    message: '',
  };
}
function input(): Parameters<typeof googleReturnTransition>[0] {
  return {
    returned: returned({ kind: 'reauthenticate', uid: 'alpha', target: 'account', epoch: 3 }),
    identity,
    authUid: 'alpha',
    handled: null,
    cacheReady: true,
    cacheError: null,
    epoch: 3,
    sessionEpoch: 7,
    now: 5000,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  calls.auth.currentUser = { uid: 'alpha' };
  calls.finish.mockResolvedValue(returned());
  calls.intent.mockReturnValue({ raw: null });
  calls.next = null;
  calls.error = null;
  calls.listen.mockImplementation(
    (_auth: unknown, next: (user: User | null) => void, error: (cause: Error) => void) => {
      calls.next = next;
      calls.error = error;
      return calls.stop;
    },
  );
  vi.stubGlobal('window', Object.assign(new EventTarget(), { setTimeout, clearTimeout }));
  vi.stubGlobal('location', { reload: vi.fn() });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
describe('Google return transitions', () => {
  it('requires confirmation for a new session or a completed redirect, not an established restored session', () => {
    expect(sessionNeedsConfirmation('alpha', { ...returned(), completed: false })).toBe(false);
    expect(sessionNeedsConfirmation(null, { ...returned(), completed: false })).toBe(true);
    expect(sessionNeedsConfirmation('alpha', returned())).toBe(true);
  });
  it.each([
    { returned: null },
    { returned: { ...returned(), completed: false } },
    { returned: { ...returned(), intent: null } },
    { identity: null },
    { identity: { ...identity, uid: 'beta' } },
    { authUid: 'beta' },
    { authUid: undefined },
    { handled: 'request-a' },
  ] satisfies Array<Partial<Parameters<typeof googleReturnTransition>[0]>>)(
    'ignores an incomplete, foreign, stale or already handled return: %j',
    (patch) => {
      expect(googleReturnTransition({ ...input(), ...patch })).toBeNull();
    },
  );
  it.each(['sign-in', 'link'] as const)('handles %s without waiting for an account cache', (kind) => {
    const request: GoogleRequest = kind === 'sign-in' ? { kind, uid: null } : { kind, uid: 'alpha' };
    expect(googleReturnTransition({ ...input(), returned: returned(request), cacheReady: false })).toEqual({
      kind,
      requestId: 'request-a',
    });
  });
  it('waits for reauthentication cache readiness, but a failed cache still resolves using its supplied epoch', () => {
    expect(googleReturnTransition({ ...input(), cacheReady: false })).toBeNull();
    expect(googleReturnTransition({ ...input(), cacheReady: false, cacheError: 'Unreadable', epoch: 0 })).toEqual({
      kind: 'changed',
      requestId: 'request-a',
    });
    expect(googleReturnTransition({ ...input(), epoch: 4 })).toEqual({ kind: 'changed', requestId: 'request-a' });
  });
  it.each(['copy', 'account'] as const)(
    'binds an approved %s deletion to both epochs without deleting anything',
    (target) => {
      expect(
        googleReturnTransition({
          ...input(),
          returned: returned({ kind: 'reauthenticate', uid: 'alpha', target, epoch: 3 }),
        }),
      ).toEqual({
        kind: 'approved',
        requestId: 'request-a',
        approval: {
          requestId: 'request-a',
          uid: 'alpha',
          target,
          epoch: 3,
          sessionEpoch: 7,
          startedAt: 1000,
          expiresAt: 305000,
        },
      });
    },
  );
  it('preserves all sign-in destination exceptions, with ordinary public pages returning to Account', () => {
    for (const page of [
      'publish',
      'creator',
      'friends',
      'friend',
      'invite',
      'compare',
      'friend-sharing',
      'friend-shelf',
    ] as const)
      expect(signInNeedsAccountPage(page)).toBe(false);
    for (const page of [
      'collection',
      'games',
      'library',
      'rankings',
      'discover',
      'account',
      'community',
      'profile',
    ] as const)
      expect(signInNeedsAccountPage(page)).toBe(true);
  });
  it.each(['sign-in', 'link', 'approved', 'changed'] as const)(
    'applies %s once and keeps its existing message and navigation',
    (kind) => {
      const options: Parameters<typeof applyGoogleReturn>[0] = {
        state: {
          googleReturn:
            kind === 'sign-in'
              ? returned()
              : kind === 'link'
                ? returned({ kind: 'link', uid: 'alpha' })
                : returned({ kind: 'reauthenticate', uid: 'alpha', target: 'account', epoch: 3 }),
          handledGoogleReturn: { current: null },
          setReturnSheet: vi.fn(),
        },
        identity,
        cacheReady: true,
        cacheError: null,
        epoch: kind === 'changed' ? 4 : 3,
        sessionEpoch: 7,
        navigation: { current: { page: 'collection', onCloseSheet: vi.fn(), onNavigate: vi.fn() } },
        setDeletionApproval: vi.fn(),
        setError: vi.fn(),
        setMessage: vi.fn(),
      };
      applyGoogleReturn(options);
      applyGoogleReturn(options);
      expect(options.state.handledGoogleReturn.current).toBe('request-a');
      expect(options.state.setReturnSheet).toHaveBeenCalledExactlyOnceWith(false);
      if (kind === 'sign-in') {
        expect(options.navigation.current.onNavigate).toHaveBeenCalledExactlyOnceWith('account');
        expect(calls.remember).toHaveBeenCalledExactlyOnceWith(true);
      } else {
        expect(options.navigation.current.onNavigate).not.toHaveBeenCalled();
        expect(calls.remember).not.toHaveBeenCalled();
      }
      if (kind === 'link')
        expect(options.setMessage).toHaveBeenCalledWith('Google is linked to this existing account.');
      if (kind === 'approved') expect(options.setDeletionApproval).toHaveBeenCalledOnce();
      else expect(options.setDeletionApproval).not.toHaveBeenCalled();
      if (kind === 'changed') expect(options.setError).toHaveBeenCalledOnce();
      else expect(options.setError).not.toHaveBeenCalled();
    },
  );
});
describe('session bootstrap ownership', () => {
  function callbacks() {
    return {
      state: {
        setSessionUnconfirmed: vi.fn(),
        setGoogleReturn: vi.fn(),
        setReturnSheet: vi.fn(),
        setStartupError: vi.fn(),
      },
      onUser: vi.fn<Parameters<typeof observeAccountSession>[0]['onUser']>(),
      onError: vi.fn(),
    };
  }
  it('subscribes after redirect and persistence settle and clears the deadline only when identity settles', async () => {
    const options = callbacks();
    const close = observeAccountSession(options);
    expect(calls.listen).not.toHaveBeenCalled();
    await flush();
    expect(options.state.setSessionUnconfirmed).toHaveBeenCalledWith(true);
    expect(options.state.setGoogleReturn).toHaveBeenCalledWith(returned());
    expect(options.state.setReturnSheet).toHaveBeenCalledWith(false);
    calls.next!(null);
    const [, isCurrent, settled] = options.onUser.mock.calls[0]!;
    expect(isCurrent()).toBe(true);
    settled();
    await vi.advanceTimersByTimeAsync(45000);
    expect(options.state.setStartupError).not.toHaveBeenCalled();
    close();
    expect(isCurrent()).toBe(false);
    expect(calls.stop).toHaveBeenCalledOnce();
  });
  it('reports the unchanged restoration timeout without inventing identity readiness', async () => {
    const options = callbacks();
    const close = observeAccountSession(options);
    await flush();
    await vi.advanceTimersByTimeAsync(45000);
    expect(options.state.setStartupError).toHaveBeenCalledWith(
      'Account restoration timed out. Reload when connected, or keep using the device library.',
    );
    close();
  });
  it('ignores a redirect settling after its bootstrap lifetime has closed', async () => {
    let resolve!: (result: GoogleReturn) => void;
    calls.finish.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const options = callbacks();
    const close = observeAccountSession(options);
    close();
    resolve(returned());
    await flush();
    await vi.advanceTimersByTimeAsync(45000);
    expect(calls.listen).not.toHaveBeenCalled();
    expect(options.state.setGoogleReturn).not.toHaveBeenCalled();
    expect(options.state.setStartupError).not.toHaveBeenCalled();
  });
  it('shows an attempted failed return but leaves an absent return alone', async () => {
    const failed = { ...returned(), completed: false, error: 'Redirect failed' };
    calls.finish.mockResolvedValueOnce(failed);
    const first = callbacks();
    const closeFirst = observeAccountSession(first);
    await flush();
    expect(first.state.setReturnSheet).toHaveBeenCalledWith(true);
    closeFirst();
    calls.finish.mockResolvedValueOnce({ ...failed, attempted: false });
    const next = callbacks();
    const closeNext = observeAccountSession(next);
    await flush();
    expect(next.state.setGoogleReturn).not.toHaveBeenCalled();
    expect(next.state.setReturnSheet).not.toHaveBeenCalled();
    closeNext();
  });
  it('routes token-listener failure separately from bootstrap failure and cancels the deadline', async () => {
    const options = callbacks();
    const close = observeAccountSession(options);
    await flush();
    const error = new Error('Token listener failed');
    calls.error!(error);
    expect(options.onError).toHaveBeenCalledWith(error);
    await vi.advanceTimersByTimeAsync(45000);
    expect(options.state.setStartupError).not.toHaveBeenCalled();
    close();
    calls.finish.mockRejectedValueOnce(error);
    const failed = callbacks();
    const closeFailed = observeAccountSession(failed);
    await flush();
    expect(failed.state.setStartupError).toHaveBeenCalledWith(error.message);
    closeFailed();
  });
  it('reloads only a persisted Google-return page and removes the pageshow listener on cleanup', () => {
    const options = callbacks();
    const close = observeAccountSession(options);
    const show = (persisted: boolean) => window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }));
    show(true);
    expect(location.reload).not.toHaveBeenCalled();
    calls.intent.mockReturnValue({ raw: 'pending-return' });
    show(false);
    expect(location.reload).not.toHaveBeenCalled();
    show(true);
    expect(location.reload).toHaveBeenCalledOnce();
    close();
    show(true);
    expect(location.reload).toHaveBeenCalledOnce();
  });
});
