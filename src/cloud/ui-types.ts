import type { LibraryController } from '../lib/library-controller';
import type { LibraryScope, SyncStatus } from '../lib/cloud-types';

export interface AccountIdentity {
  uid: string;
  email: string;
  displayName: string;
  verified: boolean;
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
}
