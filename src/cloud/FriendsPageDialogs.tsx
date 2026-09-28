import type { FriendInvitation } from '../lib/friend-types';
import { invitationStatus } from '../lib/friend-manager';
import { createInviteUrl } from '../lib/invite-continuation';
import { Dialog } from '../components/Dialog';

export type FriendChange =
  | { action: 'remove' | 'block'; peer: string; name: string; epoch: number }
  | { action: 'revoke'; invite: FriendInvitation };

export function FriendChangeDialog({
  confirmation,
  working,
  busy,
  error,
  dateFormat,
  onCancel,
  onConfirm,
}: {
  confirmation: FriendChange;
  working: boolean;
  busy: boolean;
  error: string;
  dateFormat: Intl.DateTimeFormat;
  onCancel: () => void;
  onConfirm: (confirmation: FriendChange) => void;
}) {
  return (
    <Dialog
      open
      titleId="friend-change-title"
      className="info-dialog"
      onClose={() => {
        if (!working) onCancel();
      }}
    >
      <h2 id="friend-change-title">
        {confirmation.action === 'revoke' ? (
          'Revoke this invitation?'
        ) : (
          <>
            {confirmation.action === 'block' ? 'Block' : 'Remove'} <bdi>{confirmation.name}</bdi>?
          </>
        )}
      </h2>
      {confirmation.action === 'revoke' ? (
        <p>
          The link created {dateFormat.format(confirmation.invite.createdAt)} will stop working. Existing friendships
          stay connected.
        </p>
      ) : (
        <p>
          Friends-only rankings become unavailable in both directions.{' '}
          {confirmation.action === 'block'
            ? 'New requests and invitations will be blocked. Unblocking does not restore friendship.'
            : 'A new request is needed to reconnect.'}
        </p>
      )}
      <div className="button-row">
        <button data-autofocus className="button button-outline" disabled={working} onClick={() => onCancel()}>
          Cancel
        </button>
        <button
          className="button button-danger"
          disabled={busy}
          onClick={() => {
            onConfirm(confirmation);
          }}
        >
          {confirmation.action === 'revoke'
            ? 'Revoke invitation'
            : confirmation.action === 'block'
              ? 'Block player'
              : 'Remove friend'}
        </button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

export function InviteLinkDialog({
  creating,
  link,
  now,
  copyState,
  error,
  dateFormat,
  onClose,
  onShare,
  onOpenLinks,
}: {
  creating: boolean;
  link: FriendInvitation | null;
  now: number;
  copyState: string;
  error: string;
  dateFormat: Intl.DateTimeFormat;
  onClose: () => void;
  onShare: (invite: FriendInvitation, native: boolean) => void;
  onOpenLinks: () => void;
}) {
  return (
    <Dialog open titleId="invite-link-title" className="info-dialog" onClose={onClose}>
      <h2 id="invite-link-title" data-autofocus tabIndex={-1}>
        {creating
          ? 'Creating invite…'
          : link
            ? invitationStatus(link, now) === 'Active'
              ? 'Invite link'
              : 'Invitation expired'
            : 'Check invite links'}
      </h2>
      {creating ? (
        <p role="status">Making your one-use link. It appears after the server confirms it.</p>
      ) : link ? (
        invitationStatus(link, now) === 'Active' ? (
          <>
            <p>One use. Expires {dateFormat.format(link.expiresAt)}. Share only with the person you want to invite.</p>
            <label htmlFor="friend-invite-link">Invitation link</label>
            <input
              id="friend-invite-link"
              value={createInviteUrl(link.token)}
              readOnly
              onFocus={(event) => event.target.select()}
            />
            <div className="button-row">
              <button
                className="button button-dark"
                onClick={() => {
                  onShare(link, false);
                }}
              >
                Copy link
              </button>
              <button
                className="text-button"
                onClick={() => {
                  onShare(link, true);
                }}
              >
                Share
              </button>
            </div>
            {copyState && <p role="status">{copyState}</p>}
          </>
        ) : (
          <p>This link is no longer active. Create a new invitation when you need one.</p>
        )
      ) : (
        <>
          <p className="inline-error" role="alert">
            {error || 'The result could not be confirmed. Refresh your links before trying again.'}
          </p>
          <button
            className="button button-outline"
            onClick={() => {
              onOpenLinks();
            }}
          >
            Open invite links
          </button>
        </>
      )}
    </Dialog>
  );
}
