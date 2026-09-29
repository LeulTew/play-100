import type { FriendPair } from '../lib/friend-types';
import type { FriendIdentityState } from '../lib/friend-manager';
import { friendPeer } from '../lib/friend-manager';
import { navigateFriend } from './friend-page-actions';
import { onlineError } from './errors';
import type { FriendChange } from './FriendsPageDialogs';
import { Avatar } from '../components/avatar/Avatar';
import { Icon } from '../components/Icon';
import { FriendMoreActions } from './FriendMoreActions';

export function FriendRelationList({
  rows,
  uid,
  identities,
  selected,
  busy,
  onSelect,
  onRetryProfile,
  onCompare,
  onRespond,
  onConfirm,
}: {
  rows: FriendPair[];
  uid: string;
  identities: Record<string, FriendIdentityState>;
  selected: string[];
  busy: boolean;
  onSelect: (peers: string[]) => void;
  onRetryProfile: (peer: string) => void;
  onCompare: (peers: string[]) => void;
  onRespond: (peer: string, action: 'accept' | 'decline' | 'cancel', epoch: number, success: string) => void;
  onConfirm: (change: FriendChange) => void;
}) {
  return (
    <ul className="friend-list">
      {rows.map((pair) => {
        const peer = friendPeer(pair, uid);
        const profile = identities[peer];
        const person = profile?.status === 'ready' ? profile.value : null;
        const name = person?.displayName ?? `Player …${peer.slice(-6)}`;
        return (
          <li key={peer} className="friend-manager-row">
            <div className="friend-row-person">
              {pair.state === 'accepted' && (
                <label className="check-control friend-select">
                  <input
                    type="checkbox"
                    aria-label={`Select ${name} for comparison`}
                    checked={selected.includes(peer)}
                    disabled={busy || (!selected.includes(peer) && selected.length >= 5)}
                    onChange={(event) =>
                      onSelect(event.target.checked ? [...selected, peer] : selected.filter((value) => value !== peer))
                    }
                  />
                </label>
              )}
              <div className="friend-identity">
                {person ? (
                  <Avatar descriptor={person.avatar} size={48} />
                ) : (
                  <span className="friend-avatar-placeholder" aria-hidden="true">
                    <Icon name="user" />
                  </span>
                )}
                <div>
                  <strong>
                    <bdi>{name}</bdi>
                  </strong>
                  {pair.state === 'pending' && pair.from === uid && person && <small>Published profile</small>}
                  {(!profile || profile.status === 'loading') && <small role="status">Loading profile…</small>}
                  {profile?.status === 'unavailable' && <small>Profile unavailable</small>}
                  {profile?.status === 'error' && (
                    <small>Profile could not be loaded. {onlineError(profile.cause)}</small>
                  )}
                  {(profile?.status === 'error' || profile?.status === 'unavailable') && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        onRetryProfile(peer);
                      }}
                    >
                      Retry profile
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="button-row friend-row-actions">
              <button className="text-button" aria-label={`View ${name}`} onClick={() => navigateFriend(peer)}>
                View
              </button>
              {pair.state === 'accepted' ? (
                <button
                  className="text-button"
                  disabled={busy}
                  aria-label={`Compare with ${name}`}
                  onClick={() => {
                    onCompare([peer]);
                  }}
                >
                  Compare
                </button>
              ) : pair.from === uid ? (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    onRespond(peer, 'cancel', pair.epoch, 'Request cancelled.');
                  }}
                >
                  Cancel request
                </button>
              ) : (
                <>
                  <button
                    className="button button-outline"
                    disabled={busy}
                    onClick={() => {
                      onRespond(peer, 'accept', pair.epoch, 'Friend added.');
                    }}
                  >
                    Accept
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      onRespond(peer, 'decline', pair.epoch, 'Request declined.');
                    }}
                  >
                    Decline
                  </button>
                </>
              )}
              <FriendMoreActions
                name={name}
                accepted={pair.state === 'accepted'}
                disabled={busy}
                onChoose={(action) => onConfirm({ action, peer, name, epoch: pair.epoch })}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
