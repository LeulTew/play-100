import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { AppPage } from '../lib/types';
import type { Member } from '../lib/community';
import type { AvatarDescriptor } from '../lib/avatar';
import type { FriendSettings } from '../lib/friend-types';
import type { FriendShelfConfig } from '../lib/friend-shelf-types';
import { comparisonScope, initialComparison, rememberComparisonView } from '../lib/friend-comparison-intent';
import { cloudAuth, firebaseApp } from './firebase-client';
import { onlineError } from './errors';
import { prepareFriendIdentity } from './friend-page-actions';
import type { OwnFriendIdentity } from './friend-page-actions';
import type { FriendStore } from './friend-store';
import type { FriendShelfStore } from './friend-shelf-store';
import type { AccountIdentity } from './ui-types';
import { compareRouteFor, initialCompareRoute, keepCompareRouteGroup } from './compare-route';

/**
 * The friends controller: the identity friends see, kept in step with the member's name and creature, and the way to
 * Compare and to the games shared with friends.
 */
export function useOnlineFriends({
  page,
  identity,
  name,
  avatar,
  member,
  friends,
  shelf,
  authSessionEpoch,
  setError,
  onNavigate,
}: {
  page: AppPage;
  identity: AccountIdentity | null | undefined;
  /** The name the header shows, or null while signed out. */
  name: string | null;
  avatar: AvatarDescriptor;
  member: Member | null;
  friends: {
    store: FriendStore;
    settings: FriendSettings | null;
    acceptSettings: (settings: FriendSettings) => void;
  };
  shelf: { store: Pick<FriendShelfStore, 'initialize'> };
  authSessionEpoch: RefObject<number>;
  setError: (message: string) => void;
  onNavigate: (page: AppPage) => void;
}) {
  const uid = identity?.uid;
  const friendIdentity =
    identity && name !== null ? { uid: identity.uid, verified: identity.verified, displayName: name, avatar } : null;
  // The friend identity last committed, which a friend profile update checks it still matches before it saves.
  const committedFriendIdentity = useRef(friendIdentity);
  useLayoutEffect(() => {
    committedFriendIdentity.current = friendIdentity;
  });
  const friendIdentityReady = Boolean(friends.settings && !friends.settings.deleted);
  const memberName = member?.displayName;
  const memberAvatar = member?.avatar;
  useEffect(() => {
    if (!uid || !identity?.verified || !friendIdentityReady || memberName === undefined || !memberAvatar) return;
    let alive = true;
    const source = `${memberName}:${JSON.stringify(memberAvatar)}`;
    void (async () => {
      const old = await friends.store.identity(uid);
      if (!alive || !old || cloudAuth.currentUser?.uid !== uid) return;
      if (old.displayName === memberName && JSON.stringify(old.avatar) === JSON.stringify(memberAvatar)) return;
      const current = committedFriendIdentity.current;
      if (!current || `${current.displayName}:${JSON.stringify(current.avatar)}` !== source) return;
      await friends.store.saveIdentity(uid, { displayName: memberName, avatar: memberAvatar }, old.revision);
    })().catch((cause) => {
      if (alive && cloudAuth.currentUser?.uid === uid) setError(`Friend profile update pending. ${onlineError(cause)}`);
    });
    return () => {
      alive = false;
    };
  }, [uid, identity?.verified, friendIdentityReady, friends.store, memberName, memberAvatar, setError]);
  // Opens Compare, with these friends chosen when a page names them.
  const openComparison = (peers?: string[]) => {
    if (!identity || cloudAuth.currentUser?.uid !== identity.uid) return;
    const selected = peers
      ? initialComparison(comparisonScope(firebaseApp.options.projectId ?? '', identity.uid), identity.uid, peers)
      : null;
    if (selected) rememberComparisonView(selected, false);
    onNavigate('compare');
    if (selected) rememberComparisonView(selected, true);
  };
  // Compare opens the group its URL names, and a navigation to another group opens that group afresh. The page changes
  // ?group= in place (replaceState) when the user picks, saves or clears a group, and reports it here, because every
  // render reads the URL again: it must not take the page's own change for a navigation, remount the page and lose its
  // unsaved name and selection at whatever unrelated render comes next.
  const [compareRoute, setCompareRoute] = useState(initialCompareRoute);
  const urlGroup = new URLSearchParams(location.search).get('group') ?? '';
  const nextCompareRoute = compareRouteFor(compareRoute, page, urlGroup);
  if (nextCompareRoute !== compareRoute) setCompareRoute(nextCompareRoute);
  const keepCompareGroup = useCallback(
    (group: string) => setCompareRoute((route) => keepCompareRouteGroup(route, group)),
    [],
  );
  // Prepares the friend identity and the shared-games list before the first preview of the games to share.
  const prepareShelf = async (owner: OwnFriendIdentity): Promise<FriendShelfConfig> => {
    const session = authSessionEpoch.current;
    const settings = await prepareFriendIdentity(friends.store, owner);
    if (cloudAuth.currentUser?.uid !== owner.uid || authSessionEpoch.current !== session)
      throw new Error('The account changed. Preview these games again.');
    friends.acceptSettings(settings);
    const config = await shelf.store.initialize(owner.uid);
    if (cloudAuth.currentUser?.uid !== owner.uid || authSessionEpoch.current !== session)
      throw new Error('The account changed. Preview these games again.');
    return config;
  };

  return {
    friendIdentity,
    openComparison,
    compareKey: String(compareRoute.generation),
    keepCompareGroup,
    prepareShelf,
  };
}
export type OnlineFriends = ReturnType<typeof useOnlineFriends>;
