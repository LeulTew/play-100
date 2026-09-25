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
    remember: vi.fn(),
    clearPrevious: vi.fn(),
  };
  const lifetime = createAccountIdentity(ports);
  return { owner, ports, lifetime };
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
