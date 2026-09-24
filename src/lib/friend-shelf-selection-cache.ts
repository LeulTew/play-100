import type { LibraryScope } from './cloud-types';
import { friendShelfSelectionStorageTransaction } from './personal-db';
import {
  applyShelfRemovals,
  friendShelfSelectionKey,
  pendingShelfRemovals,
  rememberShelfSelection,
} from './friend-shelf-selection';
import type { FriendShelfJournal } from './friend-shelf-selection';

function selectionWork<T>(work: () => T): T {
  try {
    return work();
  } catch (cause) {
    const error = new Error(cause instanceof Error ? cause.message : 'Shared games need a fresh selection review.', {
      cause,
    });
    error.name = 'PersonalLibraryFriendShelfSelectionError';
    throw error;
  }
}

export const friendShelfJournal: FriendShelfJournal = {
  update(scope, revision, selected, explicitThroughRevision, initialStateRevision = 0) {
    return friendShelfSelectionStorageTransaction(scope, (current, store) => {
      const next = selectionWork(() =>
        rememberShelfSelection(current, revision, selected, initialStateRevision, explicitThroughRevision),
      );
      store.put(next, friendShelfSelectionKey(scope));
    });
  },
  pending(scope, stateRevision) {
    return friendShelfSelectionStorageTransaction(scope, (current) =>
      selectionWork(() => pendingShelfRemovals(current, stateRevision)),
    );
  },
};

export function recordFriendShelfRemovals(
  store: IDBObjectStore,
  scope: LibraryScope,
  removedIds: readonly string[],
  previousRevision: number,
  nextRevision: number,
): void {
  if (nextRevision === previousRevision) return;
  const key = friendShelfSelectionKey(scope);
  const request = store.get(key);
  request.onsuccess = () => {
    try {
      const next = applyShelfRemovals(request.result, removedIds, previousRevision, nextRevision);
      if (next) store.put(next, key);
    } catch (cause) {
      console.error(
        'Shared games need a fresh selection before they can resume.',
        cause instanceof Error ? cause.message : 'Invalid selection.',
      );
      store.put({ version: 1, blocked: true, changedAt: nextRevision }, key);
    }
  };
}
