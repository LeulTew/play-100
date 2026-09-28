import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FriendPair } from '../lib/friend-types';
import type { FriendIdentityState } from '../lib/friend-manager';
import { friendPeer } from '../lib/friend-manager';
import { navigateFriend } from './friend-page-actions';
import { onlineError } from './errors';
import type { FriendChange } from './FriendsPageDialogs';
import { Avatar } from '../components/avatar/Avatar';
import { Icon } from '../components/Icon';

function MoreActions({
  name,
  accepted,
  disabled,
  onChoose,
}: {
  name: string;
  accepted: boolean;
  disabled: boolean;
  onChoose: (action: 'remove' | 'block') => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => {
    menu.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  };
  const place = useCallback(() => {
    const button = trigger.current;
    const popup = menu.current;
    if (!button || !popup?.matches(':popover-open')) return;
    const rect = button.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) {
      popup.hidePopover();
      return;
    }
    popup.style.left = `${Math.max(8, Math.min(rect.right - popup.offsetWidth, innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - popup.offsetHeight - 8))}px`;
  }, []);
  const show = (last = false) => {
    const button = trigger.current;
    const popup = menu.current;
    if (!button || !popup) return;
    if (popup.matches(':popover-open')) {
      close();
      return;
    }
    popup.showPopover();
    place();
    const items = popup.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items[last ? items.length - 1 : 0]?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place);
    };
  }, [open, place]);
  return (
    <>
      <button
        ref={trigger}
        className="text-button"
        disabled={disabled}
        aria-label={`More actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => show()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            show(event.key === 'ArrowUp');
          }
        }}
      >
        More
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        role="menu"
        aria-label={`Actions for ${name}`}
        className="friend-more-menu"
        onToggle={(event) => setOpen(event.newState === 'open')}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Tab') {
            if (event.key === 'Escape') event.preventDefault();
            close();
            return;
          }
          const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
          const index = items.findIndex((item) => item === document.activeElement);
          const next =
            event.key === 'ArrowDown'
              ? (index + 1) % items.length
              : event.key === 'ArrowUp'
                ? (index + items.length - 1) % items.length
                : event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? items.length - 1
                    : -1;
          if (next >= 0) {
            event.preventDefault();
            items[next]?.focus();
          }
        }}
      >
        {accepted && (
          <button
            role="menuitem"
            className="text-button"
            onClick={() => {
              close();
              onChoose('remove');
            }}
          >
            Remove friend
          </button>
        )}
        <button
          role="menuitem"
          className="text-button danger-text"
          onClick={() => {
            close();
            onChoose('block');
          }}
        >
          Block player
        </button>
      </div>
    </>
  );
}

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
              <MoreActions
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
