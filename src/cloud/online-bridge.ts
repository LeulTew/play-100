import type { ReactNode } from 'react';
import type { LibraryController } from '../lib/library-controller';
import type { LibraryScope, SyncStatus } from '../lib/cloud-types';
import { SYNC_LABELS } from '../lib/cloud-types';
import type { AccountIdentity, OnlineBridge } from './ui-types';

/**
 * What App shows of the online state: the account, the library it edits and where that library saves. An account's
 * library is the one App edits only once its device copy is open, or while that copy cannot be read.
 */
export function onlineBridge({
  restoring,
  identity,
  signInOpen,
  controller,
  scope,
  active,
  cacheUnavailable,
  syncEnabled,
  status,
  pendingEdits,
  creator,
  headerIdentity,
  friendSharing,
}: {
  restoring: boolean;
  identity: AccountIdentity | null | undefined;
  signInOpen: boolean;
  controller: LibraryController | null;
  scope: LibraryScope | null;
  /** Whether the account's device copy is open and connected to an online copy. */
  active: boolean;
  cacheUnavailable: boolean;
  syncEnabled: boolean | undefined;
  status: SyncStatus;
  pendingEdits: boolean;
  creator: boolean;
  headerIdentity: OnlineBridge['headerIdentity'];
  friendSharing: ReactNode;
}): OnlineBridge {
  return {
    loading: restoring,
    identity: identity ?? null,
    signInOpen,
    controller,
    scope: (active || cacheUnavailable) && scope ? scope : 'guest',
    enabled: active && Boolean(syncEnabled && identity?.verified),
    status: cacheUnavailable ? 'error' : active ? status : 'device',
    label: cacheUnavailable
      ? 'Device copy unavailable'
      : active
        ? pendingEdits
          ? 'Finishing local edits…'
          : SYNC_LABELS[status]
        : 'Device only',
    creator,
    headerIdentity,
    friendSharing,
  };
}
