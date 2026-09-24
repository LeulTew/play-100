import type { LibraryScope } from './cloud-types';
import { friendAllWorkStorageTransaction } from './personal-db';

export interface FriendAllCooldown {
  version: 2;
  epoch: number;
  nextAttemptAt: number;
}
export function parseFriendAllCooldown(value: unknown): FriendAllCooldown | null {
  if (value === undefined || value === null) return null;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== 'epoch,nextAttemptAt,version' ||
    !('version' in value) ||
    value.version !== 2 ||
    !('epoch' in value) ||
    typeof value.epoch !== 'number' ||
    !Number.isSafeInteger(value.epoch) ||
    value.epoch < 1 ||
    !('nextAttemptAt' in value) ||
    typeof value.nextAttemptAt !== 'number' ||
    !Number.isSafeInteger(value.nextAttemptAt) ||
    value.nextAttemptAt < 0
  ) {
    throw new Error('The sharing retry state is unreadable. Your library is unchanged.');
  }
  return { version: 2, epoch: value.epoch, nextAttemptAt: value.nextAttemptAt };
}
export function readFriendAllCooldown(scope: LibraryScope) {
  return friendAllWorkStorageTransaction(scope, (current) => parseFriendAllCooldown(current));
}
export function saveFriendAllCooldown(scope: LibraryScope, value: FriendAllCooldown | null) {
  return friendAllWorkStorageTransaction(scope, (_, store) => {
    const key = `friends-all-work:v2:${scope}`;
    if (value) store.put(parseFriendAllCooldown(value), key);
    else store.delete(key);
  });
}
