import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import type { AccountIdentity } from './ui-types';
import type { SyncHead } from '../lib/cloud-types';
import type { FriendSettings } from '../lib/friend-types';
import type { FriendAllPolicy } from '../lib/friend-all';
import {
  createAccountDeletion,
  currentDeletionApproval,
  deletionApprovalMatches,
  deletionCopyState,
  deletionOwnerMatches,
  deletionProbeFor,
  deletionProbeKey,
  expireDeletionApproval,
} from './account-deletion';
import type { AccountDeletionContext, GoogleDeletionApproval } from './account-deletion';

const calls = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string; email: string } | null },
  pending: vi.fn(() => false),
  reauthenticate: vi.fn(async () => {}),
  token: vi.fn(async () => ({ claims: { auth_time: 100, email_verified: false } })),
  redirect: vi.fn(async () => {}),
  cancelled: vi.fn(async () => false),
  cancel: vi.fn(async () => {}),
  activity: vi.fn(async () => {}),
  deleteUser: vi.fn(async () => {}),
  deleteDevice: vi.fn(async () => {}),
  deleteMember: vi.fn(async () => {}),
  pause: vi.fn(async () => {}),
  remember: vi.fn(async () => true),
}));
vi.mock('./firebase-client', () => ({ cloudAuth: calls.auth, cloudDb: {} }));
vi.mock('firebase/auth', () => ({
  EmailAuthProvider: {
    PROVIDER_ID: 'password',
    credential: (email: string, password: string) => ({ email, password }),
  },
  deleteUser: calls.deleteUser,
  getIdTokenResult: calls.token,
  reauthenticateWithCredential: calls.reauthenticate,
}));
vi.mock('../hooks/useExitSave', () => ({ hasPendingEdits: calls.pending }));
vi.mock('../lib/online-availability', () => ({ rememberOnlineRequest: calls.remember }));
vi.mock('../lib/scoped-library', () => ({ deleteScopedLibrary: calls.deleteDevice, pauseScopedLibrary: calls.pause }));
vi.mock('./cloud-store', () => ({ deleteOwnMember: calls.deleteMember }));
vi.mock('./google-auth', () => ({ startGoogleRedirect: calls.redirect }));
vi.mock('./account-lifecycle', () => ({
  removeCancelledRegistration: calls.cancelled,
  cancelUnusedRegistration: calls.cancel,
  ensureAccountActivity: calls.activity,
}));

const identity: AccountIdentity = {
  uid: 'alpha',
  email: 'alpha@example.test',
  displayName: 'Alpha',
  verified: true,
  providers: ['password'],
};
const head: SyncHead = {
  format: 1,
  epoch: 3,
  revision: 8,
  enabled: false,
  deleted: true,
  current: null,
  previous: null,
  updatedAt: 1000,
};
const approval: GoogleDeletionApproval = {
  uid: 'alpha',
  requestId: 'request-a',
  target: 'account',
  epoch: 2,
  sessionEpoch: 4,
  startedAt: 100000,
  expiresAt: 400000,
};
const settings: FriendSettings = {
  format: 1,
  enabled: true,
  deleted: false,
  epoch: 1,
  revision: 1,
  selectedIds: [],
  updatedAt: 1,
};
const policy: FriendAllPolicy = {
  format: 2,
  uid: 'alpha',
  enabled: true,
  deleted: false,
  origin: 'explicit',
  epoch: 1,
  revision: 1,
  syncEpoch: 2,
  ranking: { epoch: 1, revision: 1 },
  shelf: { epoch: 1, revision: 1 },
  updatedAt: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  calls.auth.currentUser = { uid: 'alpha', email: identity.email };
  calls.pending.mockReturnValue(false);
  calls.reauthenticate.mockResolvedValue();
  calls.cancelled.mockResolvedValue(false);
  calls.deleteUser.mockResolvedValue();
  calls.token.mockResolvedValue({ claims: { auth_time: 100, email_verified: false } });
  vi.stubGlobal('navigator', { onLine: true });
  vi.spyOn(Date, 'now').mockReturnValue(200000);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture() {
  const failures: unknown[] = [];
  const context = {
    identity,
    identityRef: { current: identity as AccountIdentity | null | undefined },
    scope: 'account:demo-play100:alpha',
    currentEpoch: { current: 2 },
    authSessionEpoch: { current: 4 },
    state: {
      approval: null as GoogleDeletionApproval | null,
      setApproval: vi.fn(),
      notice: null,
      setNotice: vi.fn(),
      probe: { current: null },
    },
    account: { snapshot: null, waitForWrites: vi.fn(async () => {}), refresh: vi.fn(async () => {}) },
    sync: {
      store: {
        head: vi.fn(async (): Promise<SyncHead | null> => ({ ...head, cleanupEpoch: 3 })),
        revoke: vi.fn(async () => head),
        cleanup: vi.fn<NonNullable<AccountDeletionContext['sync']['store']>['cleanup']>().mockResolvedValue(0),
        markCleanupComplete: vi.fn(async () => ({ ...head, cleanupEpoch: 3 })),
      },
      suspend: vi.fn(),
    },
    friends: {
      store: {
        revokeForDeletion: vi.fn(async () => {}),
        saveSettings: vi.fn(async () => settings),
        cleanupSharing: vi.fn(async () => 0),
        cleanupDeleted: vi.fn(async () => ({ deleted: 0, done: true, message: undefined as string | undefined })),
      },
      stop: vi.fn(),
      acceptSettings: vi.fn(),
    },
    shelf: {
      store: {
        revokeForDeletion: vi.fn(async () => {}),
        saveConfig: vi.fn(async () => ({ ...settings, consentSyncEpoch: null })),
        cleanupSharing: vi.fn(async () => 0),
        cleanupDeleted: vi.fn(async () => ({ deleted: 0, done: true })),
      },
      stop: vi.fn(),
      acceptConfig: vi.fn(async () => {}),
    },
    automatic: {
      store: {
        revokeForDeletion: vi.fn(async () => {}),
        controls: vi
          .fn<AccountDeletionContext['automatic']['store']['controls']>()
          .mockResolvedValue({ policy: null, ranking: null, shelf: null }),
        setPolicy: vi.fn(async () => null),
        policy: vi.fn<AccountDeletionContext['automatic']['store']['policy']>().mockResolvedValue(null),
        cleanupPage: vi.fn(async () => ({ deleted: 0, done: true })),
      },
      suspend: vi.fn(),
    },
    social: {
      control: vi.fn(async () => ({ epoch: 1, deleted: false, hidden: false })),
      unpublish: vi.fn(async () => {}),
      deleteProfile: vi.fn(async () => {}),
    },
    run: vi.fn(async (operation: () => Promise<void>) => {
      try {
        await operation();
        return true;
      } catch (cause) {
        failures.push(cause);
        return false;
      }
    }),
    reconcileIdentity: vi.fn<(user: User) => Promise<AccountIdentity>>(async () => identity),
    setIdentity: vi.fn(),
    setHeadSnapshot: vi.fn(),
    setError: vi.fn(),
    setMessage: vi.fn(),
    refresh: vi.fn(async () => {}),
    onCloseSheet: vi.fn(),
    onNavigate: vi.fn(),
  } satisfies AccountDeletionContext;
  return {
    context,
    failures,
    remove: (account = true, password = 'test-password') => createAccountDeletion(context)(account, password),
  };
}

describe('deletion approval and probe transitions', () => {
  it('matches only the exact owner, target, auth generation, saving epoch and unexpired approval', () => {
    expect(deletionApprovalMatches(approval, 'alpha', 'account', 4, 2, 200000)).toBe(true);
    for (const value of [
      null,
      { ...approval, uid: 'beta' },
      { ...approval, target: 'copy' as const },
      { ...approval, sessionEpoch: 5 },
      { ...approval, epoch: 3 },
      { ...approval, expiresAt: 200000 },
    ]) {
      expect(deletionApprovalMatches(value, 'alpha', 'account', 4, 2, 200000)).toBe(false);
    }
    expect(currentDeletionApproval(approval, 'alpha', 4, 2)).toBe(approval);
    expect(currentDeletionApproval(approval, 'beta', 4, 2)).toBeNull();
    expect(expireDeletionApproval(approval, 'request-a')).toBeNull();
    expect(expireDeletionApproval(approval, 'old-request')).toBe(approval);
  });
  it('rejects missing, foreign and stale-session ownership without conflating the two epochs', () => {
    expect(deletionOwnerMatches('alpha', 'alpha', 'alpha', 4, 4)).toBe(true);
    expect(deletionOwnerMatches('alpha', undefined, 'alpha', 4, 4)).toBe(false);
    expect(deletionOwnerMatches('alpha', 'beta', 'alpha', 4, 4)).toBe(false);
    expect(deletionOwnerMatches('alpha', 'alpha', 'beta', 4, 4)).toBe(false);
    expect(deletionOwnerMatches('alpha', 'alpha', 'alpha', 4, 5)).toBe(false);
  });
  it('reuses only matching probe keys and never substitutes another owner or epoch notice', async () => {
    const read = vi.fn(async () => 'incomplete' as const);
    const key = deletionProbeKey('alpha', 4, head);
    const probe = deletionProbeFor(null, key, read);
    expect(deletionProbeFor(probe, key, read)).toBe(probe);
    expect(read).toHaveBeenCalledOnce();
    expect(deletionCopyState(head, { key, state: 'incomplete' }, key)).toBe('incomplete');
    expect(deletionCopyState(head, { key, state: 'incomplete' }, deletionProbeKey('beta', 4, head))).toBe('checking');
    expect(deletionCopyState({ ...head, cleanupEpoch: 3 }, null, null)).toBe('complete');
    expect(deletionProbeFor(probe, deletionProbeKey('alpha', 5, head), read)).not.toBe(probe);
    const error = new Error('probe failed');
    await expect(deletionProbeFor(null, key, () => Promise.reject(error)).result).rejects.toBe(error);
  });
});

describe('ordered account deletion orchestration', () => {
  it('refuses pending edits before entering the mutation runner', async () => {
    const f = fixture();
    calls.pending.mockReturnValue(true);
    expect(await f.remove()).toBe(false);
    expect(f.context.run).not.toHaveBeenCalled();
    expect(f.context.setError).toHaveBeenCalledWith('Finish the open edit before deleting online data.');
  });
  it.each(['signed-out', 'foreign', 'offline', 'password'] as const)(
    'refuses %s before deleting anything',
    async (reason) => {
      const f = fixture();
      if (reason === 'signed-out') calls.auth.currentUser = null;
      if (reason === 'foreign') calls.auth.currentUser = { uid: 'beta', email: 'beta@example.test' };
      if (reason === 'offline') vi.stubGlobal('navigator', { onLine: false });
      expect(await f.remove(true, reason === 'password' ? '' : 'test-password')).toBe(false);
      expect(calls.deleteUser).not.toHaveBeenCalled();
      expect(f.context.sync.suspend).not.toHaveBeenCalled();
    },
  );
  it.each(['auth', 'identity', 'epoch'] as const)('refuses a changed %s after reauthentication', async (changed) => {
    const f = fixture();
    calls.reauthenticate.mockImplementationOnce(async () => {
      if (changed === 'auth') calls.auth.currentUser = { uid: 'beta', email: 'beta@example.test' };
      if (changed === 'identity') f.context.identityRef.current = { ...identity, uid: 'beta' };
      if (changed === 'epoch') f.context.authSessionEpoch.current += 1;
    });
    expect(await f.remove()).toBe(false);
    expect(f.context.sync.suspend).not.toHaveBeenCalled();
  });
  it('requests Google confirmation without deleting, and consumes a matching approval on the next explicit action', async () => {
    const f = fixture();
    f.context.identity = { ...identity, providers: ['google.com'] };
    expect(await f.remove()).toBe(true);
    expect(calls.redirect).toHaveBeenCalledWith(calls.auth, {
      kind: 'reauthenticate',
      uid: 'alpha',
      target: 'account',
      epoch: 2,
    });
    expect(calls.deleteUser).not.toHaveBeenCalled();
    f.context.state.approval = approval;
    expect(await f.remove()).toBe(true);
    expect(calls.deleteUser).toHaveBeenCalledOnce();
    expect(f.context.state.setApproval).toHaveBeenCalledWith(null);
  });
  it('rejects stale Google token confirmation without suspending writers', async () => {
    const f = fixture();
    f.context.identity = { ...identity, providers: ['google.com'] };
    f.context.state.approval = approval;
    calls.token.mockResolvedValue({ claims: { auth_time: 94, email_verified: true } });
    expect(await f.remove()).toBe(false);
    expect(f.context.sync.suspend).not.toHaveBeenCalled();
  });
  it('removes a cancelled registration without running content cleanup', async () => {
    const f = fixture();
    calls.cancelled.mockResolvedValue(true);
    expect(await f.remove()).toBe(true);
    expect(f.context.automatic.store.revokeForDeletion).not.toHaveBeenCalled();
    expect(f.context.sync.store.cleanup).not.toHaveBeenCalled();
    expect(f.context.onCloseSheet).toHaveBeenCalledOnce();
    expect(f.context.onNavigate).toHaveBeenCalledWith('collection');
  });
  it.each([false, true])('rechecks an unverified registration token, now verified=%s', async (verified) => {
    const f = fixture();
    f.context.identityRef.current = { ...identity, verified: false };
    calls.token.mockResolvedValue({ claims: { auth_time: 100, email_verified: verified } });
    expect(await f.remove()).toBe(!verified);
    if (verified) {
      expect(f.context.reconcileIdentity).toHaveBeenCalled();
      expect(calls.cancel).not.toHaveBeenCalled();
    } else {
      expect(calls.cancel).toHaveBeenCalledWith({}, 'alpha');
      expect(calls.deleteUser).toHaveBeenCalled();
      expect(calls.deleteDevice).toHaveBeenCalledWith(f.context.scope);
    }
    expect(f.context.sync.store.cleanup).not.toHaveBeenCalled();
  });
  it('reserves all irreversible sharing tombstones before private cleanup and deletes Auth only after confirmation', async () => {
    const f = fixture();
    expect(await f.remove()).toBe(true);
    const before = (a: { mock: { invocationCallOrder: number[] } }, b: { mock: { invocationCallOrder: number[] } }) =>
      expect(a.mock.invocationCallOrder[0]).toBeLessThan(b.mock.invocationCallOrder[0]!);
    before(f.context.automatic.store.revokeForDeletion, f.context.friends.store.revokeForDeletion);
    before(f.context.friends.store.revokeForDeletion, f.context.shelf.store.revokeForDeletion);
    before(f.context.shelf.store.revokeForDeletion, f.context.sync.store.cleanup);
    before(f.context.friends.store.cleanupDeleted, f.context.sync.store.markCleanupComplete);
    before(f.context.sync.store.markCleanupComplete, calls.deleteUser);
    before(calls.deleteUser, calls.deleteDevice);
    expect(f.context.friends.store.cleanupSharing).not.toHaveBeenCalled();
  });
  it('ordinary copy deletion stops selected sharing and keeps Auth and the account device copy', async () => {
    const f = fixture();
    f.context.automatic.store.controls.mockResolvedValue({
      policy: null,
      ranking: settings,
      shelf: { ...settings, consentSyncEpoch: 2 },
    });
    expect(await f.remove(false)).toBe(true);
    expect(f.context.friends.store.saveSettings).toHaveBeenCalledWith(
      'alpha',
      { enabled: false, selectedIds: [] },
      settings,
    );
    expect(f.context.shelf.store.saveConfig).toHaveBeenCalled();
    expect(f.context.state.setNotice).toHaveBeenLastCalledWith({ key: 'alpha:4:3:8', state: 'complete' });
    expect(calls.deleteUser).not.toHaveBeenCalled();
    expect(calls.deleteDevice).not.toHaveBeenCalled();
    expect(f.context.automatic.store.revokeForDeletion).not.toHaveBeenCalled();
  });
  it('keeps failed cleanup resumable and never marks or deletes Auth before cleanup succeeds', async () => {
    const f = fixture();
    f.context.sync.store.cleanup.mockRejectedValueOnce(new Error('interrupted'));
    expect(await f.remove()).toBe(false);
    expect(f.context.state.setNotice).toHaveBeenLastCalledWith({ key: 'alpha:4:3:8', state: 'incomplete' });
    expect(f.context.sync.store.markCleanupComplete).not.toHaveBeenCalled();
    expect(calls.deleteUser).not.toHaveBeenCalled();
  });
  it('stops automatic consent instead of writing both selected controls when a policy exists', async () => {
    const f = fixture();
    f.context.automatic.store.controls.mockResolvedValue({ policy, ranking: settings, shelf: null });
    expect(await f.remove(false)).toBe(true);
    expect(f.context.automatic.store.setPolicy).toHaveBeenCalled();
    expect(f.context.friends.store.saveSettings).not.toHaveBeenCalled();
    expect(f.context.shelf.store.saveConfig).not.toHaveBeenCalled();
  });
  it('does not continue after the account generation changes while writes drain', async () => {
    const f = fixture();
    f.context.account.waitForWrites.mockImplementationOnce(async () => {
      f.context.authSessionEpoch.current += 1;
    });
    expect(await f.remove(false)).toBe(false);
    expect(f.context.social.unpublish).not.toHaveBeenCalled();
    expect(f.context.sync.store.revoke).not.toHaveBeenCalled();
  });
  it.each(['shelf', 'friends', 'friend-pages', 'automatic-pages'] as const)(
    'keeps Auth when %s cleanup cannot finish',
    async (phase) => {
      const f = fixture();
      if (phase === 'shelf') f.context.shelf.store.cleanupDeleted.mockResolvedValue({ done: false, deleted: 0 });
      if (phase === 'friends')
        f.context.friends.store.cleanupDeleted.mockResolvedValue({
          done: false,
          deleted: 0,
          message: 'Cleanup refused',
        });
      if (phase === 'friend-pages')
        f.context.friends.store.cleanupDeleted.mockResolvedValue({ done: false, deleted: 0, message: undefined });
      if (phase === 'automatic-pages') {
        f.context.automatic.store.policy.mockResolvedValue({ ...policy, enabled: false, deleted: true });
        f.context.automatic.store.cleanupPage.mockResolvedValue({ done: false, deleted: 0 });
      }
      expect(await f.remove()).toBe(false);
      expect(calls.deleteUser).not.toHaveBeenCalled();
      expect(f.context.sync.store.markCleanupComplete).not.toHaveBeenCalled();
      if (phase === 'friend-pages') expect(f.context.friends.store.cleanupDeleted).toHaveBeenCalledTimes(100);
      if (phase === 'automatic-pages') expect(f.context.automatic.store.cleanupPage).toHaveBeenCalledTimes(250);
    },
  );
  it.each(['head', 'epoch', 'receipt', 'owner'] as const)(
    'rejects changed final %s after cleanup is marked',
    async (changed) => {
      const f = fixture();
      f.context.sync.store.head.mockResolvedValueOnce(head).mockImplementationOnce(async () => {
        if (changed === 'owner') calls.auth.currentUser = { uid: 'beta', email: 'beta@example.test' };
        return changed === 'head'
          ? null
          : { ...head, epoch: changed === 'epoch' ? 4 : 3, cleanupEpoch: changed === 'receipt' ? 2 : 3 };
      });
      expect(await f.remove()).toBe(false);
      expect(calls.deleteUser).not.toHaveBeenCalled();
      expect(f.context.state.setNotice).not.toHaveBeenCalledWith({ key: 'alpha:4:3:8', state: 'incomplete' });
    },
  );
  it.each(['password', 'google.com'])(
    'requests renewed %s authentication after payload deletion without replaying cleanup',
    async (provider) => {
      const f = fixture();
      f.context.identityRef.current = { ...identity, providers: [provider] };
      calls.deleteUser.mockRejectedValueOnce({ code: 'auth/requires-recent-login' });
      expect(await f.remove()).toBe(false);
      expect(String(f.failures[0])).toContain(
        provider === 'password' ? 'confirm your password again' : 'Confirm with Google again',
      );
      expect(calls.deleteDevice).not.toHaveBeenCalled();
      expect(f.context.state.setApproval).toHaveBeenCalledWith(null);
    },
  );
});
