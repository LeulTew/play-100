import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import type { FriendBlock, FriendCursor, FriendInvitation } from '../lib/friend-types';
import type { FriendsView, FriendsViewState } from '../lib/friend-manager';
import { nextInvitationExpiry } from '../lib/friend-manager';
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

interface AuxiliaryPage {
  view: FriendsView;
  invites: FriendInvitation[];
  blocks: FriendBlock[];
  cursor: FriendCursor | undefined;
  pages: number;
  loading: boolean;
  ready: boolean;
  error: unknown | null;
}

/**
 * The loaded Invite links or Blocked list. loadAux() reloads as many pages as the list last held for the same view (at
 * least one), and loadAux(true) appends the next page. Opening either view clears the list and reloads it. Bumping
 * auxVersionRef cancels a load in progress.
 */
export function useAuxiliaryPages(
  store: FriendStore,
  uid: string,
  view: FriendsViewState,
  relationView: boolean,
  current: () => boolean,
  auxVersionRef: RefObject<number>,
  setRefreshRequired: (value: boolean) => void,
  setError: (value: string) => void,
) {
  const [aux, setAux] = useState<AuxiliaryPage>({
    view: view.view,
    invites: [],
    blocks: [],
    cursor: undefined,
    pages: 0,
    loading: false,
    ready: false,
    error: null,
  });
  const auxRef = useRef(aux);
  useLayoutEffect(() => {
    auxRef.current = aux;
  });
  const loadAux = useCallback(
    async (append = false): Promise<boolean> => {
      const target = view.view;
      if (target !== 'invites' && target !== 'blocked') return false;
      const operation = ++auxVersionRef.current;
      const old = auxRef.current;
      setAux((state) => ({ ...state, view: target, loading: true, error: null }));
      const count = append ? 1 : Math.max(1, old.view === target ? old.pages : 1);
      let cursor = append ? old.cursor : undefined;
      let pages = 0;
      let invites = append ? old.invites : [];
      let blocks = append ? old.blocks : [];
      try {
        for (; pages < count; pages += 1) {
          if (target === 'invites') {
            const result = await store.listInvites(uid, cursor);
            invites = [...new Map([...invites, ...result.items].map((item) => [item.token, item])).values()];
            cursor = result.cursor;
          } else {
            const result = await store.listBlocks(uid, cursor);
            blocks = [...new Map([...blocks, ...result.items].map((item) => [item.uid, item])).values()];
            cursor = result.cursor;
          }
          if (!current() || operation !== auxVersionRef.current) return false;
          if (!cursor) {
            pages += 1;
            break;
          }
        }
        setAux({
          view: target,
          invites,
          blocks,
          cursor,
          pages: (append ? old.pages : 0) + pages,
          ready: true,
          loading: false,
          error: null,
        });
        setRefreshRequired(false);
        setError('');
        return true;
      } catch (cause) {
        if (current() && operation === auxVersionRef.current)
          setAux((state) => ({ ...state, loading: false, error: cause }));
        return false;
      }
    },
    [view.view, store, uid, current, auxVersionRef, setRefreshRequired, setError],
  );
  useEffect(() => {
    if (!relationView) {
      setAux({
        view: view.view,
        invites: [],
        blocks: [],
        cursor: undefined,
        pages: 0,
        loading: true,
        ready: false,
        error: null,
      });
      void loadAux();
    }
    return () => {
      auxVersionRef.current += 1;
    };
  }, [relationView, view.view, loadAux, auxVersionRef]);
  return { aux, loadAux };
}

/**
 * The time that invitation statuses are shown at. It updates when the invitations change, when the next one expires,
 * and when the page becomes visible or is focused again.
 */
export function useInvitationClock(invites: FriendInvitation[], link: FriendInvitation | null) {
  const [now, setNow] = useState(Date.now);
  const timerInvites = useMemo(() => [...invites, ...(link ? [link] : [])], [invites, link]);
  useEffect(() => {
    let timer: number | undefined;
    const update = () => {
      window.clearTimeout(timer);
      if (document.hidden) return;
      const time = Date.now();
      setNow(time);
      const expiry = nextInvitationExpiry(timerInvites, time);
      if (expiry !== null) timer = window.setTimeout(update, Math.max(1, expiry - time));
    };
    update();
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, [timerInvites]);
  return now;
}
