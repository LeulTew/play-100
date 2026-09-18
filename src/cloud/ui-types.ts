import type { LibraryController } from '../lib/library-controller';
import type { LibraryScope, SyncStatus } from '../lib/cloud-types';
import type { ReactNode } from 'react';

export interface AccountIdentity {
  uid: string;
  email: string;
  displayName: string;
  verified: boolean;
  verificationPending?: boolean;
  providers: string[];
}
export interface OnlineBridge {
  loading: boolean;
  identity: AccountIdentity | null;
  controller: LibraryController | null;
  scope: LibraryScope;
  enabled: boolean;
  status: SyncStatus;
  label: string;
  creator: boolean;
  headerIdentity: { uid: string; name: string; avatarSrc: string } | null;
  friendSharing?: ReactNode;
}
