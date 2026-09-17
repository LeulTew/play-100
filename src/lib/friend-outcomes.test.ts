import { expect, it, vi } from 'vitest';
import { FriendCommittedError } from './friend-types';
import type { FriendSettings } from './friend-types';
import { committedFriendChange, friendMutationError, refreshCommittedFriendChange } from '../cloud/friend-outcomes';

it.each(['refresh', 'cleanup'] as const)('repairs a known publication %s failure by pruning and reading, never republishing', async (phase) => {
  const cause = new Error('Synthetic cleanup failure');
  const committed = new FriendCommittedError({ operation: 'publish-ranking', uid: 'alice', revision: 2 }, cause, phase);
  const settings: FriendSettings = { format: 1, enabled: true, deleted: false, selectedIds: [], epoch: 1, revision: 1, updatedAt: 1 };
  const store = {
    pruneSharing: vi.fn().mockRejectedValueOnce(cause).mockResolvedValue(0),
    settings: vi.fn().mockResolvedValue(settings),
    shareHead: vi.fn().mockResolvedValue(null),
    publishRanking: vi.fn(),
  };
  await expect(refreshCommittedFriendChange(store, committed, () => true)).rejects.toBe(cause);
  expect(store.settings).not.toHaveBeenCalled();
  expect(store.publishRanking).not.toHaveBeenCalled();
  await expect(refreshCommittedFriendChange(store, committed, () => true)).resolves.toEqual({ settings, head: null });
  expect(store.pruneSharing).toHaveBeenCalledTimes(2);
  expect(store.publishRanking).not.toHaveBeenCalled();
});
it('does not continue metadata recovery after a synchronous stop', async () => {
  let current = true;
  const store = {
    pruneSharing: vi.fn(async () => { current = false; return 0; }),
    settings: vi.fn(),
    shareHead: vi.fn(),
  };
  const committed = new FriendCommittedError({ operation: 'publish-ranking', uid: 'alice' }, new Error('Refresh failed'));
  expect(await refreshCommittedFriendChange(store, committed, () => current)).toBeNull();
  expect(store.settings).not.toHaveBeenCalled();
});
it('distinguishes a known owner commit from an unacknowledged transport failure', () => {
  const committed = new FriendCommittedError({ operation: 'save-group', uid: 'alice', groupId: 'synthetic-id' }, new Error('Read failed'));
  expect(committedFriendChange(committed, 'alice')).toBe(committed);
  expect(committedFriendChange(committed, 'bob')).toBeNull();
  expect(committedFriendChange({ code: 'unavailable' }, 'alice')).toBeNull();
  expect(friendMutationError({ code: 'unavailable' })).toContain('could not be confirmed');
});
