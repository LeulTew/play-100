import { describe, expect, it, vi } from 'vitest';
import type { IdTokenResult } from 'firebase/auth';
import { authSessionTransition, createAccountIdentity, identityOf } from './account-identity';
import type { IdentityUser } from './account-identity';
import type { AccountIdentity } from './ui-types';

vi.mock('./firebase-client', () => ({ cloudAuth: {}, firebaseApp: { options: { projectId: 'demo-play100' } } }));
vi.mock('../lib/online-availability', () => ({ rememberOnlineRequest: vi.fn() }));
const user: IdentityUser = {
  uid: 'alpha',
  email: 'alpha@example.test',
  displayName: 'Alpha',
  emailVerified: true,
  providerData: [
    {
      providerId: 'password',
      uid: 'alpha',
      displayName: 'Alpha',
      email: 'alpha@example.test',
      phoneNumber: null,
      photoURL: null,
    },
  ],
};
type Token = Pick<IdTokenResult, 'claims'>;
function fixture() {
  const owner = { current: 'alpha' as string | undefined };
  const ports = {
    currentUid: () => owner.current,
    readToken: vi
      .fn<(user: IdentityUser, force: boolean) => Promise<Token>>()
      .mockResolvedValue({ claims: { email_verified: true } }),
    publish: vi.fn<(identity: AccountIdentity | null | undefined) => void>(),
    publishEpoch: vi.fn<(epoch: number) => void>(),
    remember: vi.fn(),
    clearPrevious: vi.fn(),
  };
  const lifetime = createAccountIdentity(ports);
  // Mounted, as the controller's effect leaves it; detach is its unmount.
  const detach = lifetime.attach();
  return { owner, ports, lifetime, detach };
}
function deferred() {
  let resolve!: (token: Token) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<Token>((done, failed) => {
    resolve = done;
    reject = failed;
  });
  return { promise, resolve, reject };
}
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
describe('identity projection and auth-session transitions', () => {
  it('uses verified token claims, keeps provider identity and reports the existing verification-pending state', () => {
    expect(identityOf(user, true)).toEqual({
      uid: 'alpha',
      email: 'alpha@example.test',
      displayName: 'Alpha',
      verified: true,
      verificationPending: false,
      providers: ['password'],
    });
    expect(identityOf(user, false).verificationPending).toBe(true);
    expect(identityOf({ ...user, emailVerified: false }, false).verificationPending).toBe(false);
    expect(identityOf({ ...user, email: null, displayName: null }, false, true)).toMatchObject({
      email: '',
      displayName: '',
      verificationPending: true,
    });
  });
  it.each([
    [null, 0, null, 0, false, null],
    [null, 0, 'alpha', 1, true, null],
    ['alpha', 1, 'alpha', 1, false, null],
    ['alpha', 1, 'beta', 2, true, 'alpha'],
    ['alpha', 1, null, 2, true, 'alpha'],
    [null, 2, 'alpha', 3, true, null],
  ] as const)(
    'moves %s epoch %s to %s without reusing a session',
    (previous, epoch, next, expected, changed, clearUid) => {
      expect(authSessionTransition(previous, epoch, next)).toEqual({ uid: next, epoch: expected, changed, clearUid });
    },
  );
});
describe('identity reconciliation lifetime', () => {
  it('coalesces the same UID even for a forced caller and releases the cache after success', async () => {
    const f = fixture();
    const gate = deferred();
    f.ports.readToken.mockReturnValueOnce(gate.promise);
    const first = f.lifetime.reconcileIdentity(user);
    expect(f.lifetime.reconcileIdentity(user, true)).toBe(first);
    expect(f.ports.readToken).toHaveBeenCalledExactlyOnceWith(user, false);
    gate.resolve({ claims: { email_verified: true } });
    await expect(first).resolves.toEqual(identityOf(user, true));
    expect(f.ports.publish).toHaveBeenCalledWith(identityOf(user, true));
    expect(f.ports.remember).toHaveBeenCalledOnce();
    await f.lifetime.reconcileIdentity(user, true);
    expect(f.ports.readToken).toHaveBeenLastCalledWith(user, true);
    expect(f.ports.readToken).toHaveBeenCalledTimes(2);
  });
  it('refreshes an email/token mismatch once until explicit verification refresh or sign-out', async () => {
    const f = fixture();
    f.ports.readToken.mockResolvedValue({ claims: { email_verified: false } });
    await f.lifetime.reconcileIdentity(user);
    expect(f.ports.readToken.mock.calls.map((call) => call[1])).toEqual([false, true]);
    await f.lifetime.reconcileIdentity(user);
    expect(f.ports.readToken.mock.calls.map((call) => call[1])).toEqual([false, true, false]);
    f.lifetime.clearVerificationMismatch('beta');
    await f.lifetime.reconcileIdentity(user);
    expect(f.ports.readToken).toHaveBeenCalledTimes(4);
    f.lifetime.clearVerificationMismatch('alpha');
    await f.lifetime.reconcileIdentity(user);
    expect(f.ports.readToken).toHaveBeenCalledTimes(6);
    f.lifetime.observeUser(null, () => true, vi.fn(), vi.fn());
    await f.lifetime.reconcileIdentity(user);
    expect(f.ports.readToken).toHaveBeenCalledTimes(8);
  });
  it('does not force-refresh an unverified SDK user even if its first token is unverified', async () => {
    const f = fixture();
    f.ports.readToken.mockResolvedValue({ claims: { email_verified: false } });
    const next = await f.lifetime.reconcileIdentity({ ...user, emailVerified: false });
    expect(next.verified).toBe(false);
    expect(next.verificationPending).toBe(false);
    expect(f.ports.readToken).toHaveBeenCalledOnce();
  });
  it('retains a rejected verification-refresh marker but releases its pending task', async () => {
    const f = fixture();
    f.ports.readToken
      .mockResolvedValueOnce({ claims: { email_verified: false } })
      .mockRejectedValueOnce(new Error('forced read failed'));
    await expect(f.lifetime.reconcileIdentity(user)).rejects.toThrow('forced read failed');
    expect(f.ports.publish).not.toHaveBeenCalled();
    f.ports.readToken.mockResolvedValue({ claims: { email_verified: false } });
    await f.lifetime.reconcileIdentity(user);
    expect(f.ports.readToken).toHaveBeenCalledTimes(3);
  });
  it.each(['alpha-first', 'beta-first'] as const)(
    'never publishes a foreign UID or clears its newer pending slot: %s',
    async (order) => {
      const f = fixture();
      const alpha = deferred();
      const beta = deferred();
      f.ports.readToken.mockReturnValueOnce(alpha.promise).mockReturnValueOnce(beta.promise);
      const first = f.lifetime.reconcileIdentity(user);
      f.owner.current = 'beta';
      const foreign = { ...user, uid: 'beta' };
      const second = f.lifetime.reconcileIdentity(foreign);
      if (order === 'alpha-first') {
        alpha.resolve({ claims: { email_verified: true } });
        await first;
        expect(f.lifetime.reconcileIdentity(foreign)).toBe(second);
        expect(f.ports.publish).not.toHaveBeenCalled();
        beta.resolve({ claims: { email_verified: true } });
      } else {
        beta.resolve({ claims: { email_verified: true } });
        await second;
        alpha.resolve({ claims: { email_verified: true } });
      }
      await Promise.all([first, second]);
      expect(f.ports.publish).toHaveBeenCalledExactlyOnceWith(identityOf(foreign, true));
      expect(f.ports.remember).toHaveBeenCalledOnce();
    },
  );
  it('clears only the settled rejected task and lets a later read retry', async () => {
    const f = fixture();
    const alpha = deferred();
    const beta = deferred();
    f.ports.readToken.mockReturnValueOnce(alpha.promise).mockReturnValueOnce(beta.promise);
    const first = f.lifetime.reconcileIdentity(user);
    const rejection = expect(first).rejects.toThrow('alpha failed');
    const foreign = { ...user, uid: 'beta' };
    f.owner.current = 'beta';
    const second = f.lifetime.reconcileIdentity(foreign);
    alpha.reject(new Error('alpha failed'));
    await rejection;
    expect(f.lifetime.reconcileIdentity(foreign)).toBe(second);
    beta.resolve({ claims: { email_verified: true } });
    await second;
    await f.lifetime.reconcileIdentity(foreign);
    expect(f.ports.readToken).toHaveBeenCalledTimes(3);
  });
  it('keeps token refresh epochs, clears previous account scope and increments roundtrips', async () => {
    const f = fixture();
    const settled = vi.fn();
    const failed = vi.fn();
    f.lifetime.observeUser(user, () => true, settled, failed);
    expect(f.lifetime.authSessionEpoch.current).toBe(1);
    expect(f.ports.publish).toHaveBeenCalledWith(undefined);
    await flush();
    f.lifetime.observeUser(user, () => true, settled, failed);
    expect(f.lifetime.authSessionEpoch.current).toBe(1);
    await flush();
    f.owner.current = 'beta';
    f.lifetime.observeUser({ ...user, uid: 'beta' }, () => true, settled, failed);
    expect(f.ports.clearPrevious).toHaveBeenCalledExactlyOnceWith('alpha');
    expect(f.lifetime.authSessionEpoch.current).toBe(2);
    await flush();
    f.owner.current = undefined;
    f.lifetime.observeUser(null, () => true, settled, failed);
    expect(f.ports.publish).toHaveBeenLastCalledWith(null);
    expect(f.ports.clearPrevious).toHaveBeenLastCalledWith('beta');
    expect(f.lifetime.authSessionEpoch.current).toBe(3);
    f.owner.current = 'alpha';
    f.lifetime.observeUser(user, () => true, settled, failed);
    expect(f.lifetime.authSessionEpoch.current).toBe(4);
    await flush();
    expect(settled).toHaveBeenCalledTimes(5);
    expect(failed).not.toHaveBeenCalled();
    // Each new epoch is published once, and a token refresh for the same account publishes none.
    expect(f.ports.publishEpoch.mock.calls).toEqual([[1], [2], [3], [4]]);
  });
  it('publishes a new epoch in the same call as the identity it belongs to, so renders get both at once', () => {
    const f = fixture();
    const published: Array<[string, unknown]> = [];
    f.ports.publish.mockImplementation((identity) => published.push(['identity', identity]));
    f.ports.publishEpoch.mockImplementation((epoch) => published.push(['epoch', epoch]));
    f.lifetime.observeUser(user, () => true, vi.fn(), vi.fn());
    expect(published).toEqual([
      ['epoch', 1],
      ['identity', undefined],
    ]);
    published.length = 0;
    f.owner.current = undefined;
    f.lifetime.observeUser(null, () => true, vi.fn(), vi.fn());
    expect(published).toEqual([
      ['epoch', 2],
      ['identity', null],
    ]);
  });
  it.each(['current', 'foreign', 'closed'] as const)(
    'reports token failure only for the current live UID: %s',
    async (scope) => {
      const f = fixture();
      const gate = deferred();
      const settled = vi.fn();
      const failed = vi.fn();
      f.ports.readToken.mockReturnValueOnce(gate.promise);
      f.lifetime.observeUser(user, () => scope !== 'closed', settled, failed);
      if (scope === 'foreign') f.owner.current = 'beta';
      gate.reject(new Error('offline token'));
      await flush();
      expect(settled).toHaveBeenCalledOnce();
      if (scope === 'current') {
        expect(f.ports.publish).toHaveBeenLastCalledWith(identityOf(user, false, true));
        expect(failed).toHaveBeenCalledOnce();
      } else {
        expect(f.ports.publish).toHaveBeenCalledExactlyOnceWith(undefined);
        expect(failed).not.toHaveBeenCalled();
      }
    },
  );
  it('publishes and remembers nothing when its controller unmounts before a same-UID read succeeds', async () => {
    const f = fixture();
    const gate = deferred();
    const settled = vi.fn();
    const failed = vi.fn();
    let live = true;
    f.ports.readToken.mockReturnValueOnce(gate.promise);
    f.lifetime.observeUser(user, () => live, settled, failed);
    // Restoration gives up and the controller unmounts, closing its observer, while the same account stays signed
    // in; the user may then choose this device. The read that was still pending succeeds afterwards.
    live = false;
    f.detach();
    const late = f.lifetime.reconcileIdentity(user);
    gate.resolve({ claims: { email_verified: true } });
    await expect(late).resolves.toEqual(identityOf(user, true));
    await flush();
    expect(f.ports.readToken).toHaveBeenCalledOnce();
    expect(settled).toHaveBeenCalledOnce();
    expect(f.ports.publish).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(f.ports.remember).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    expect(f.lifetime.controllerLive()).toBe(false);
  });
  it('publishes and remembers nothing for a sign-in read if its controller unmounts before observing', async () => {
    const f = fixture();
    const gate = deferred();
    f.ports.readToken.mockReturnValueOnce(gate.promise);
    // An email sign-in submitted while the session is still restoring; the controller unmounts before its observer
    // first hears from Firebase.
    const read = f.lifetime.reconcileIdentity(user);
    f.detach();
    gate.resolve({ claims: { email_verified: true } });
    await expect(read).resolves.toEqual(identityOf(user, true));
    expect(f.ports.publish).not.toHaveBeenCalled();
    expect(f.ports.remember).not.toHaveBeenCalled();
    expect(f.lifetime.controllerLive()).toBe(false);
  });
  it('checks the controller when the read completes, not when it starts', async () => {
    const f = fixture();
    const gate = deferred();
    f.ports.readToken.mockReturnValueOnce(gate.promise);
    // StrictMode and Fast Refresh unmount and mount the same controller again; what counts is whether it is mounted
    // when the read finishes.
    f.detach();
    const read = f.lifetime.reconcileIdentity(user);
    f.lifetime.attach();
    gate.resolve({ claims: { email_verified: true } });
    await read;
    expect(f.ports.publish).toHaveBeenCalledExactlyOnceWith(identityOf(user, true));
    expect(f.ports.remember).toHaveBeenCalledOnce();
  });
  it('is live only while attached, as its controller is only while mounted', () => {
    const f = fixture();
    expect(f.lifetime.controllerLive()).toBe(true);
    f.detach();
    expect(f.lifetime.controllerLive()).toBe(false);
    const detach = f.lifetime.attach();
    expect(f.lifetime.controllerLive()).toBe(true);
    detach();
    expect(f.lifetime.controllerLive()).toBe(false);
    expect(createAccountIdentity(f.ports).controllerLive()).toBe(false);
  });
  it('sign-out forgets the pending slot and prevents a late signed-out read from publishing', async () => {
    const f = fixture();
    const gate = deferred();
    f.ports.readToken.mockReturnValueOnce(gate.promise);
    const first = f.lifetime.reconcileIdentity(user);
    f.owner.current = undefined;
    f.lifetime.observeUser(null, () => true, vi.fn(), vi.fn());
    gate.resolve({ claims: { email_verified: true } });
    await first;
    expect(f.ports.publish).toHaveBeenCalledExactlyOnceWith(null);
    expect(f.ports.remember).not.toHaveBeenCalled();
    f.owner.current = 'alpha';
    await f.lifetime.reconcileIdentity(user);
    expect(f.ports.readToken).toHaveBeenCalledTimes(2);
  });
});
