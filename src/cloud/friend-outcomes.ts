import { FriendCommittedError } from '../lib/friend-types';
import { syncFailure } from '../lib/sync-retry';
import { onlineError } from './errors';
import type { FriendSettings, FriendShareHead } from '../lib/friend-types';

export function committedFriendChange(cause: unknown, uid: string): FriendCommittedError | null {
  return cause instanceof FriendCommittedError && cause.receipt.uid === uid ? cause : null;
}
export function committedFriendMessage(cause: FriendCommittedError): string {
  switch (cause.receipt.operation) {
    case 'initialize': return 'Friend settings confirmed. Reconnect to continue.';
    case 'save-identity': return 'Profile saved. Reconnect to refresh it.';
    case 'save-settings': return 'Sharing choice saved. Reconnect to refresh its status.';
    case 'send-request': return 'Request sent. Reconnect to refresh Friends.';
    case 'respond': return 'Connection updated. Reconnect to refresh Friends.';
    case 'create-invite': return 'Invitation created. Reconnect and open Invite links to retrieve it.';
    case 'accept-invite': return 'Invitation accepted. Reconnect to open Friends.';
    case 'publish-ranking': return 'Friends ranking saved. Refresh or cleanup is still pending.';
    case 'save-group': return 'Group saved. Refresh groups before editing it again.';
  }
}
export function friendMutationError(cause: unknown): string {
  const kind = syncFailure(cause);
  if (kind === 'transient') return 'The change could not be confirmed. Reconnect and refresh its status before trying again.';
  if (kind === 'quota') return 'The free quota is busy. Wait, then refresh to check whether the change was saved.';
  return onlineError(cause);
}

export async function refreshCommittedFriendChange(store: {
  pruneSharing: (uid: string) => Promise<number>;
  settings: (uid: string) => Promise<FriendSettings | null>;
  shareHead: (uid: string) => Promise<FriendShareHead | null>;
}, committed: FriendCommittedError, isCurrent: () => boolean): Promise<{ settings: FriendSettings | null; head: FriendShareHead | null } | null> {
  if (!isCurrent()) return null;
  if (committed.receipt.operation === 'publish-ranking') {
    await store.pruneSharing(committed.receipt.uid);
    if (!isCurrent()) return null;
  }
  const [settings, head] = await Promise.all([store.settings(committed.receipt.uid), store.shareHead(committed.receipt.uid)]);
  return isCurrent() ? { settings, head } : null;
}
