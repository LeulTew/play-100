import { friendAllWorkStorageTransaction } from './personal-db';
import type { AccountJournal } from './personal-db';

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
export function readFriendAllCooldown(journal: AccountJournal) {
  return friendAllWorkStorageTransaction(journal, (current) => parseFriendAllCooldown(current));
}
/** Saves the retry state, or with null clears it, which a removed device copy still allows. */
export function saveFriendAllCooldown(journal: AccountJournal, value: FriendAllCooldown | null) {
  return friendAllWorkStorageTransaction(
    journal,
    (_, store) => {
      const key = `friends-all-work:v2:${journal.scope}`;
      if (value) store.put(parseFriendAllCooldown(value), key);
      else store.delete(key);
    },
    value === null,
  );
}
