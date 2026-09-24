import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FriendStore } from './friend-store';
import { cloudAuth, cloudDb } from './firebase-client';
import { navigateFriend, prepareFriendIdentity } from './friend-page-actions';
import type { OwnFriendIdentity } from './friend-page-actions';
import type { FriendSettings } from '../lib/friend-types';

const auth = vi.hoisted(() => ({ currentUser: { uid: 'alice' } }));
const startDefault = vi.hoisted(() => vi.fn());
vi.mock('./firebase-client', () => ({ cloudAuth: auth, cloudDb: {} }));
vi.mock('./friend-store', () => ({
  FriendStore: class {
    settings = vi.fn();
    initialize = vi.fn();
    identity = vi.fn();
    saveIdentity = vi.fn();
  },
}));
vi.mock('./friend-all-store', () => ({
  FriendAllStore: class {
    startDefault = startDefault;
  },
}));

const identity: OwnFriendIdentity = {
  uid: 'alice',
  verified: true,
  displayName: 'Alice',
  avatar: { version: 1, seed: 'a'.repeat(32), palette: 'moss' },
};
const settings: FriendSettings = {
  format: 1,
  enabled: false,
  deleted: false,
  selectedIds: [],
  epoch: 1,
  revision: 1,
  updatedAt: 1,
};

beforeEach(() => {
  auth.currentUser = { uid: 'alice' };
  startDefault.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it('keeps exact friend routing and rejects invalid UIDs before navigation', () => {
  const pushState = vi.fn();
  const dispatchEvent = vi.fn();
  const scrollTo = vi.fn();
  vi.stubGlobal('history', { pushState });
  vi.stubGlobal('window', { dispatchEvent, scrollTo });
  vi.stubGlobal(
    'PopStateEvent',
    class {
      constructor(readonly type: string) {}
    },
  );
  for (const uid of ['', '../alice', 'a/b', 'a?b', 'a#b', 'a'.repeat(129)])
    expect(() => navigateFriend(uid)).toThrow(/invalid/);
  expect(pushState).not.toHaveBeenCalled();
  navigateFriend('Alice_123-');
  expect(pushState).toHaveBeenCalledExactlyOnceWith(null, '', '/friends/Alice_123-');
  expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'popstate' }));
  expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0 });
});

it('requires verification and current identity before reading or initializing sharing', async () => {
  const store = new FriendStore(cloudDb);
  await expect(prepareFriendIdentity(store, { ...identity, verified: false })).rejects.toThrow(/Verify/);
  auth.currentUser = { uid: 'bob' };
  await expect(prepareFriendIdentity(store, identity)).rejects.toThrow(/Verify/);
  expect(store.settings).not.toHaveBeenCalled();
  expect(store.initialize).not.toHaveBeenCalled();
});

it('rejects a settings result after account replacement without initializing or publishing an old identity', async () => {
  const store = new FriendStore(cloudDb);
  let resolveSettings: ((value: FriendSettings | null) => void) | undefined;
  vi.mocked(store.settings).mockReturnValue(
    new Promise((resolve) => {
      resolveSettings = resolve;
    }),
  );
  vi.mocked(store.identity).mockResolvedValue(null);
  const pending = prepareFriendIdentity(store, identity);
  auth.currentUser = { uid: 'bob' };
  if (!resolveSettings) throw new Error('The deferred settings read did not start.');
  resolveSettings(null);
  await expect(pending).rejects.toThrow(/account changed/);
  expect(store.initialize).not.toHaveBeenCalled();
  expect(startDefault).not.toHaveBeenCalled();
  expect(store.saveIdentity).not.toHaveBeenCalled();
  expect(cloudAuth.currentUser?.uid).toBe('bob');
});

it('starts the automatic default for a missing setup instead of creating off controls first', async () => {
  const store = new FriendStore(cloudDb);
  const created: FriendSettings = { ...settings, enabled: true };
  vi.mocked(store.settings).mockResolvedValueOnce(null).mockResolvedValueOnce(created);
  vi.mocked(store.identity).mockResolvedValue(null);
  startDefault.mockResolvedValue({ enabled: true, origin: 'default' });
  expect(await prepareFriendIdentity(store, identity)).toBe(created);
  expect(startDefault).toHaveBeenCalledExactlyOnceWith('alice', expect.any(Function));
  expect(startDefault.mock.calls[0]![1]()).toBe(true);
  expect(store.initialize).not.toHaveBeenCalled();
  expect(store.saveIdentity).toHaveBeenCalledExactlyOnceWith(
    'alice',
    { displayName: 'Alice', avatar: identity.avatar },
    0,
  );
});

it('keeps the off initialization only when the default cannot start and rechecks the account after starting it', async () => {
  const store = new FriendStore(cloudDb);
  vi.mocked(store.settings).mockResolvedValue(null);
  vi.mocked(store.identity).mockResolvedValue(null);
  vi.mocked(store.initialize).mockResolvedValue(settings);
  startDefault.mockResolvedValue(null);
  expect(await prepareFriendIdentity(store, identity)).toBe(settings);
  expect(startDefault.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(store.initialize).mock.invocationCallOrder[0]!,
  );
  vi.mocked(store.initialize).mockClear();
  vi.mocked(store.saveIdentity).mockClear();
  startDefault.mockImplementation(async () => {
    auth.currentUser = { uid: 'bob' };
    return null;
  });
  await expect(prepareFriendIdentity(store, identity)).rejects.toThrow(/account changed/);
  expect(store.initialize).not.toHaveBeenCalled();
  expect(store.saveIdentity).not.toHaveBeenCalled();
});

it('does not re-save an unchanged identity or overwrite settings consent', async () => {
  const store = new FriendStore(cloudDb);
  vi.mocked(store.settings).mockResolvedValue(settings);
  vi.mocked(store.identity).mockResolvedValue({
    format: 1,
    uid: identity.uid,
    displayName: identity.displayName,
    avatar: identity.avatar,
    revision: 4,
    updatedAt: 1,
  });
  expect(await prepareFriendIdentity(store, identity)).toBe(settings);
  expect(store.initialize).not.toHaveBeenCalled();
  expect(startDefault).not.toHaveBeenCalled();
  expect(store.saveIdentity).not.toHaveBeenCalled();
  vi.mocked(store.settings).mockResolvedValue({ ...settings, deleted: true });
  await expect(prepareFriendIdentity(store, identity)).rejects.toThrow(/being deleted/);
  expect(store.saveIdentity).not.toHaveBeenCalled();
});
