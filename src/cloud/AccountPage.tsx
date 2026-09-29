import type { ReactNode } from 'react';
import type { AccountIdentity } from './ui-types';
import type { ScopedLibrary, SyncHead, SyncStatus } from '../lib/cloud-types';
import type { Member } from '../lib/community';
import type { PersonalLibraryState } from '../lib/personal-types';
import { Icon } from '../components/Icon';
import { CANCELLED_REGISTRATION_MESSAGE } from './account-lifecycle';
import type { DeletionCopyState } from './cloud-store';
import type { AccountDeletionContext } from './account-deletion-action';
import { useAccountPage } from './useAccountPage';
import { AccountLibrarySection } from './AccountLibrarySection';
import { AccountSidebar } from './AccountSidebar';
import { AccountConfirmation } from './AccountConfirmation';
// Account's deletion, cleanup and export use the public-copy cleanup, so it loads with this page.
import './social-publication';

export type ConnectionChoice = 'guest' | 'online' | 'empty' | 'cached';
export interface AccountPageProps {
  cancelledRegistration?: boolean;
  deletionState?: DeletionCopyState | 'checking';
  identity: AccountIdentity;
  member: Member | null;
  cache: ScopedLibrary | null;
  guest: PersonalLibraryState;
  head: SyncHead | null;
  remoteReady: boolean;
  status: SyncStatus;
  error: string;
  message: string;
  cleanupWarning: string;
  busy: boolean;
  resendIn: number;
  isCreator: boolean;
  avatar: ReactNode;
  onAvatar: () => void;
  onName: (name: string) => Promise<boolean>;
  onConnect: (choice: ConnectionChoice, name: string) => Promise<boolean>;
  onVerify: () => Promise<boolean>;
  onRefreshIdentity: () => Promise<boolean>;
  onSignOut: () => Promise<boolean>;
  onLinkGoogle: () => Promise<boolean>;
  onSignOutAndRemove?: () => Promise<boolean>;
  onRetry: () => Promise<boolean>;
  onCleanup: () => Promise<boolean>;
  onPause: () => Promise<boolean>;
  onDownload: (source: 'local' | 'online' | 'guest' | 'all') => Promise<boolean>;
  onUseRemote: (head: SyncHead, localRevision: number) => Promise<boolean>;
  onUseLocal: (head: SyncHead, localRevision: number) => Promise<boolean>;
  /** What deleting an online copy or the account runs in; the page runs it (account-deletion-action.ts). */
  deletion: AccountDeletionContext;
  googleDeletion: { requestId: string; target: 'copy' | 'account' } | null;
  onDismissDeletion: () => void;
  onPublish: () => void;
  onCommunity: () => void;
  onCreator: () => void;
  onFriends?: () => void;
  onCompare?: () => void;
  friendsSharing?: ReactNode;
  sharedGames?: ReactNode;
}

export function AccountPage(props: AccountPageProps) {
  const {
    identity,
    cache,
    head,
    busy,
    avatar,
    onAvatar,
    onSignOut,
    onSignOutAndRemove,
    cancelledRegistration = false,
    deletionState = 'checking',
  } = props;
  const model = useAccountPage(props);
  const { setConfirmation } = model;

  return (
    <section className="app-page account-page" aria-labelledby="account-title">
      <div className="account-heading">
        <div className="account-avatar">
          <button
            className="account-icon-change"
            aria-label="Change icon"
            disabled={busy || !identity.verified}
            onClick={onAvatar}
          >
            {avatar}
            <span>Change icon</span>
          </button>
        </div>
        <div>
          <h1 id="account-title" data-page-heading tabIndex={-1}>
            Account
          </h1>
          <p>
            {identity.email}
            <span>
              Signed in
              {identity.verificationPending ? ' · checking access' : identity.verified ? '' : ' · verify your email'}
            </span>
          </p>
        </div>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            void onSignOut();
          }}
        >
          Sign out
          <Icon name="arrow" width="17" height="17" />
        </button>
      </div>
      {onSignOutAndRemove && (
        <div className="account-section">
          <button
            className="text-button"
            disabled={busy || !cache || cache.sync.dirty}
            onClick={() => setConfirmation('signout-device')}
          >
            Sign out and remove this device's copy
          </button>
          {cache?.sync.dirty && (
            <p>Unsynced changes are on this device. Save or export them first; ordinary Sign out keeps the copy.</p>
          )}
        </div>
      )}
      {cancelledRegistration && (
        <section className="account-notice" role="alert">
          <p>{CANCELLED_REGISTRATION_MESSAGE}</p>
          <button className="button button-outline" disabled={busy} onClick={() => setConfirmation('delete-account')}>
            Remove cancelled sign-in
          </button>
        </section>
      )}
      {head?.deleted && (
        <section className="account-notice" aria-labelledby="deletion-notice-title">
          <h2 id="deletion-notice-title">
            {deletionState === 'complete'
              ? 'Online copy deleted'
              : deletionState === 'incomplete'
                ? "Deletion isn't finished"
                : 'Deletion was requested'}
          </h2>
          <p role="status">
            {deletionState === 'complete'
              ? 'Online saving and sharing are off. The copy on this device is still here.'
              : deletionState === 'incomplete'
                ? 'Some online data is still stored.'
                : deletionState === 'checking'
                  ? "Checking what's still stored online…"
                  : 'Removal of all online data could not be confirmed.'}
          </p>
          <div className="button-row">
            {deletionState !== 'complete' && (
              <button className="button button-dark" disabled={busy} onClick={() => setConfirmation('delete-copy')}>
                Finish deleting
              </button>
            )}
            {(deletionState === 'complete' || deletionState === 'incomplete') && (
              <button className="text-button" disabled={busy} onClick={() => setConfirmation('delete-account')}>
                Delete account
              </button>
            )}
          </div>
          <p>To use online saving again, turn it on below; this starts a new online copy.</p>
        </section>
      )}
      <div className="account-columns">
        <AccountLibrarySection props={props} model={model} />
        <AccountSidebar props={props} model={model} />
      </div>
      <AccountConfirmation props={props} model={model} />
    </section>
  );
}
