import { useMemo } from 'react';
import type { AppPage, Game } from '../lib/types';
import type { LibraryScope, ScopedLibrary } from '../lib/cloud-types';
import { friendSharingView } from '../lib/friend-all';
import { friendShelfJournal } from '../lib/friend-shelf-selection-cache';
import { FriendSharingSummary } from '../components/FriendSharingSummary';
import { useFriendAll } from './useFriendAll';
import { useFriendSharing } from './useFriendSharing';
import { useFriendShelf } from './useFriendShelf';

/**
 * The sharing controller: what the account shares with friends, either everything (automatic sharing) or a selected
 * ranking and selected saved games, and the summary of automatic sharing that Account, the header and Friends show.
 */
export function useOnlineSharing({
  page,
  uid,
  scope,
  snapshot,
  verified,
  games,
  authGeneration,
  signedIn,
  connected,
}: {
  page: AppPage;
  uid: string | undefined;
  scope: LibraryScope | null;
  snapshot: ScopedLibrary | null;
  verified: boolean;
  games: Game[];
  /** The auth session generation this render belongs to. */
  authGeneration: number;
  signedIn: boolean;
  /** Whether the verified account saves online, which automatic sharing needs. */
  connected: boolean;
}) {
  const friendToolsVisible = [
    'account',
    'friends',
    'friend',
    'invite',
    'compare',
    'friend-sharing',
    'friend-shelf',
  ].includes(page);
  const automatic = useFriendAll(uid, scope, snapshot, verified, games, authGeneration);
  const friends = useFriendSharing(
    uid,
    scope,
    snapshot,
    verified,
    games,
    friendToolsVisible,
    authGeneration,
    !automatic.ready || automatic.controlsAll,
  );
  const shelf = useFriendShelf(
    uid,
    scope,
    snapshot,
    verified,
    games,
    friendToolsVisible,
    authGeneration,
    friendShelfJournal,
    !automatic.ready || automatic.controlsAll,
  );
  const canEnableAll = 'canEnable' in automatic.eligibility && automatic.eligibility.canEnable;
  const sharingView = friendSharingView({
    controlsAll: automatic.controlsAll,
    connected,
    ready: automatic.ready,
    eligibility: automatic.eligibility,
  });
  const automaticSummary = useMemo(
    () =>
      signedIn ? (
        <FriendSharingSummary
          mode={automatic.eligibility.kind}
          status={automatic.status}
          canEnable={canEnableAll}
          enabled={Boolean(automatic.policy?.enabled)}
          error={automatic.error}
          onEnable={automatic.enable}
          onStop={automatic.stopSharing}
          onRefresh={automatic.refresh}
          progress={
            automatic.progress && automatic.status !== 'saved' ? (
              <p className="section-help" role="status">
                {(['games', 'ranking'] as const).map((kind) => {
                  const progress = automatic.progress?.[kind];
                  return progress ? (
                    <span key={kind}>
                      {kind === 'games' ? 'Saved games' : 'Rankings'}:{' '}
                      {progress.ready
                        ? `${progress.targetCount} ready`
                        : `${progress.applied} / ${progress.total} changes confirmed`}
                      .{' '}
                    </span>
                  ) : null;
                })}
              </p>
            ) : null
          }
        />
      ) : null,
    [
      signedIn,
      automatic.eligibility.kind,
      automatic.status,
      canEnableAll,
      automatic.policy?.enabled,
      automatic.error,
      automatic.enable,
      automatic.stopSharing,
      automatic.refresh,
      automatic.progress,
    ],
  );
  return { automatic, friends, shelf, sharingView, automaticSummary };
}
export type OnlineSharing = ReturnType<typeof useOnlineSharing>;
