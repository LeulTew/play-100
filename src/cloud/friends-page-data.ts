import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { FriendsView } from '../lib/friend-manager';
import { FriendManagerFeed } from '../lib/friend-manager-feed';
import type { FriendStore } from './friend-store';
import { cloudAuth } from './firebase-client';

/** The loaded friends or requests of a relation view, as a feed and its current snapshot. */
export function useFriendManagerFeed(store: FriendStore, uid: string, view: FriendsView) {
  const kind = view === 'friends' ? 'accepted' : 'pending';
  const feed = useMemo(
    () => new FriendManagerFeed(store, uid, kind, () => cloudAuth.currentUser?.uid === uid),
    [store, uid, kind],
  );
  const list = useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot);
  return { feed, list };
}

/** Keeps the feed's live reads running in relation views while the page is visible and online. */
export function useLiveFeed(feed: FriendManagerFeed, relationView: boolean) {
  useEffect(() => {
    if (!relationView) return;
    const bind = () => {
      if (document.hidden || navigator.onLine === false) feed.stop();
      else feed.start();
    };
    bind();
    document.addEventListener('visibilitychange', bind);
    window.addEventListener('online', bind);
    window.addEventListener('offline', bind);
    return () => {
      feed.stop();
      document.removeEventListener('visibilitychange', bind);
      window.removeEventListener('online', bind);
      window.removeEventListener('offline', bind);
    };
  }, [feed, relationView]);
}
