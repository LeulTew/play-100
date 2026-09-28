import type { FriendBlock, FriendInvitation } from '../lib/friend-types';
import { invitationStatus } from '../lib/friend-manager';
import type { FriendChange } from './FriendsPageDialogs';

export function FriendInviteList({
  invites,
  now,
  dateFormat,
  busy,
  onShare,
  onConfirm,
}: {
  invites: FriendInvitation[];
  now: number;
  dateFormat: Intl.DateTimeFormat;
  busy: boolean;
  onShare: (invite: FriendInvitation, native: boolean) => void;
  onConfirm: (change: FriendChange) => void;
}) {
  return (
    <ul className="friend-list">
      {invites.map((invite) => {
        const status = invitationStatus(invite, now);
        return (
          <li key={invite.token}>
            <div>
              <strong className="friend-invite-status">{status}</strong>
              <p className="friend-invite-dates">
                Created{' '}
                <time dateTime={new Date(invite.createdAt).toISOString()}>{dateFormat.format(invite.createdAt)}</time>
                <br />
                {status === 'Expired' ? 'Expired' : 'Expiry'}{' '}
                <time dateTime={new Date(invite.expiresAt).toISOString()}>{dateFormat.format(invite.expiresAt)}</time>
              </p>
            </div>
            {status === 'Active' && (
              <div className="button-row">
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    onShare(invite, false);
                  }}
                >
                  Copy link
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    onShare(invite, true);
                  }}
                >
                  Share
                </button>
                <button
                  className="text-button danger-text"
                  disabled={busy}
                  onClick={() => onConfirm({ action: 'revoke', invite })}
                >
                  Revoke
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function FriendBlockList({
  blocks,
  busy,
  onUnblock,
}: {
  blocks: FriendBlock[];
  busy: boolean;
  onUnblock: (peer: string) => void;
}) {
  return (
    <ul className="friend-list">
      {blocks.map((block) => (
        <li key={block.uid}>
          <div>
            <strong>Blocked account …{block.uid.slice(-6)}</strong>
            <p className="section-help">Unblocking will not restore friendship.</p>
          </div>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              onUnblock(block.uid);
            }}
          >
            Unblock
          </button>
        </li>
      ))}
    </ul>
  );
}
