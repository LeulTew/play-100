import type { FriendCursor } from '../lib/friend-types';
import type { FriendsView, FriendsViewState } from '../lib/friend-manager';
import { onlineError } from './errors';
import type { SelectionCheck } from './friends-page-selection';

const viewLabels: Record<FriendsView, string> = {
  friends: 'Friends',
  incoming: 'Incoming',
  sent: 'Sent',
  invites: 'Invite links',
  blocked: 'Blocked',
};

export function FriendViewControls({
  view,
  relationView,
  working,
  onUpdateView,
}: {
  view: FriendsViewState;
  relationView: boolean;
  working: boolean;
  onUpdateView: (patch: Partial<FriendsViewState>, replace?: boolean) => void;
}) {
  return (
    <>
      <nav className="personal-tabs friend-view-tabs" aria-label="Friends view">
        {(Object.keys(viewLabels) as FriendsView[]).map((value) => (
          <button
            key={value}
            disabled={working}
            aria-current={view.view === value ? 'page' : undefined}
            aria-pressed={view.view === value}
            onClick={() => onUpdateView({ view: value })}
          >
            {viewLabels[value]}
          </button>
        ))}
      </nav>
      {relationView && (
        <div className="friend-manager-toolbar">
          <label>
            Filter loaded {view.view === 'friends' ? 'friends' : 'requests'}
            <input
              type="search"
              maxLength={60}
              value={view.name}
              onChange={(event) => onUpdateView({ name: event.target.value }, true)}
            />
          </label>
          <label>
            Order
            <select
              aria-label="Order"
              value={view.order}
              onChange={(event) => onUpdateView({ order: event.target.value === 'name' ? 'name' : 'recent' })}
            >
              <option value="recent">Recent first</option>
              <option value="name">Name A-Z</option>
            </select>
          </label>
        </div>
      )}
    </>
  );
}

export function FriendListStatus({
  loading,
  ready,
  relationView,
  shown,
  loaded,
  cursor,
  working,
  active,
  changed,
  problem,
  message,
  onRefresh,
}: {
  loading: boolean;
  ready: boolean;
  relationView: boolean;
  shown: number;
  loaded: number;
  cursor: FriendCursor | undefined;
  working: boolean;
  active: boolean;
  changed: boolean;
  problem: string;
  message: string;
  onRefresh: () => void;
}) {
  return (
    <>
      <div className="friend-list-summary">
        <p role="status">
          {loading
            ? ready
              ? 'Updating loaded entries…'
              : 'Loading…'
            : ready
              ? `${relationView ? `${shown} shown / ` : ''}${loaded} loaded${cursor ? ' · more available' : ''}`
              : 'List unavailable'}
        </p>
        <button className="text-button" disabled={working || loading || (relationView && !active)} onClick={onRefresh}>
          Refresh loaded
        </button>
      </div>
      {relationView && changed && (
        <p className="friend-update-notice" role="status">
          The list changed. Refresh loaded entries before loading more.
        </p>
      )}
      {relationView && !active && <p role="status">Reconnect or return to this tab to manage friends.</p>}
      {problem && (
        <p className="inline-error" role="alert">
          {problem}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </>
  );
}

export function FriendSelectionBar({
  selected,
  busy,
  working,
  selectionReady,
  selectionError,
  friendsView,
  onCompareSelected,
  onClear,
  onRetry,
  onOpenComparisons,
}: {
  selected: string[];
  busy: boolean;
  working: boolean;
  selectionReady: boolean;
  selectionError: SelectionCheck | undefined;
  friendsView: boolean;
  onCompareSelected: () => void;
  onClear: () => void;
  onRetry: () => void;
  onOpenComparisons: () => void;
}) {
  return (
    <>
      {selected.length > 0 && (
        <div className="friend-selection-bar">
          <span>{selected.length} / 5 friends selected</span>
          <div className="button-row">
            <button className="button button-dark" disabled={busy || !selectionReady} onClick={onCompareSelected}>
              Compare selected
            </button>
            <button className="text-button" disabled={working} onClick={onClear}>
              Clear
            </button>
          </div>
          {!selectionReady && (
            <p className="section-help" role="status">
              {selectionError?.status === 'error'
                ? `A selected connection could not be confirmed. ${onlineError(selectionError.cause)}`
                : 'Checking selected connections…'}
              {selectionError && (
                <button className="text-button" disabled={working} onClick={onRetry}>
                  Retry selected connections
                </button>
              )}
            </p>
          )}
        </div>
      )}
      {friendsView && !selected.length && (
        <p className="section-help">
          Choose up to five friends to compare with you.{' '}
          <button className="text-button" onClick={onOpenComparisons}>
            Open comparisons & groups
          </button>
        </p>
      )}
    </>
  );
}

export function FriendsEmptyState({
  view,
  relationView,
  cursor,
  changed,
  onCommunity,
  onClearFilter,
}: {
  view: FriendsViewState;
  relationView: boolean;
  cursor: FriendCursor | undefined;
  changed: boolean;
  onCommunity: () => void;
  onClearFilter: () => void;
}) {
  return (
    <div className="empty-state">
      <h2>
        {view.name && relationView
          ? 'No loaded names match'
          : view.view === 'friends'
            ? 'No friends loaded'
            : view.view === 'incoming'
              ? 'No incoming requests loaded'
              : view.view === 'sent'
                ? 'No sent requests loaded'
                : view.view === 'invites'
                  ? 'No invite links'
                  : 'No blocked accounts'}
      </h2>
      {cursor ? (
        <p>
          {view.view === 'incoming' || view.view === 'sent'
            ? 'Incoming and sent requests share these pages. Load more to check further.'
            : 'More entries are available below.'}
        </p>
      ) : view.view === 'friends' && !view.name && !changed ? (
        <button className="text-button" onClick={onCommunity}>
          Find players in Community
        </button>
      ) : null}
      {view.name && relationView && (
        <button className="text-button" onClick={onClearFilter}>
          Clear filter
        </button>
      )}
    </div>
  );
}
