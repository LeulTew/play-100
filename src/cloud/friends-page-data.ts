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

function clearedAux(view: FriendsView, loading: boolean): AuxiliaryPage {
  return { view, invites: [], blocks: [], cursor: undefined, pages: 0, loading, ready: false, error: null };
}

/**
 * Reads count pages of Invite links or Blocked: afresh, or after the list in `after` to append to it. It sets no state,
 * and returns null once isCurrent() says a newer load, view or account replaced it.
 */
async function readAuxPages(
  store: FriendStore,
  uid: string,
  target: 'invites' | 'blocked',
  after: AuxiliaryPage | null,
  count: number,
  isCurrent: () => boolean,
): Promise<AuxiliaryPage | null> {
  let cursor = after?.cursor;
  let pages = 0;
  let invites = after?.invites ?? [];
  let blocks = after?.blocks ?? [];
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
    if (!isCurrent()) return null;
    if (!cursor) {
      pages += 1;
      break;
    }
  }
  return {
    view: target,
    invites,
    blocks,
    cursor,
    pages: (after?.pages ?? 0) + pages,
    ready: true,
    loading: false,
    error: null,
  };
}

/**
 * The loaded Invite links or Blocked list. Opening either view clears the list in that same render, so its first frame
 * shows loading, and reloads as many pages as the list last held for that view (at least one). loadAux() reloads the
 * open view the same way but keeps the list until the reload lands, and loadAux(true) appends the next page. Bumping
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
  const [aux, setAux] = useState<AuxiliaryPage>(() => clearedAux(view.view, false));
  const auxRef = useRef(aux);
  useLayoutEffect(() => {
    auxRef.current = aux;
  });
  // Sets state only once the read settles, so an effect can start one without setting state synchronously.
  const readAux = useCallback(
    (target: 'invites' | 'blocked', after: AuxiliaryPage | null, count: number) => {
      const operation = ++auxVersionRef.current;
      const isCurrent = () => current() && operation === auxVersionRef.current;
      return readAuxPages(store, uid, target, after, count, isCurrent).then(
        (next) => {
          if (!next || !isCurrent()) return false;
          setAux(next);
          setRefreshRequired(false);
          setError('');
          return true;
        },
        (cause: unknown) => {
          if (isCurrent()) setAux((state) => ({ ...state, loading: false, error: cause }));
          return false;
        },
      );
    },
    [store, uid, current, auxVersionRef, setRefreshRequired, setError],
  );
  // Opening a view, or a new account or store, clears the list during render and notes how many pages to reload.
  const [opened, setOpened] = useState<{
    view: FriendsView;
    relationView: boolean;
    store: FriendStore;
    uid: string;
    pages: number;
  } | null>(null);
  if (
    opened?.view !== view.view ||
    opened.relationView !== relationView ||
    opened.store !== store ||
    opened.uid !== uid
  ) {
    setOpened({ view: view.view, relationView, store, uid, pages: aux.view === view.view ? aux.pages : 0 });
    if (!relationView) setAux(clearedAux(view.view, true));
  }
  const reloadPages = opened?.pages ?? 0;
  useEffect(() => {
    if (!relationView && (view.view === 'invites' || view.view === 'blocked'))
      void readAux(view.view, null, Math.max(1, reloadPages));
    return () => {
      auxVersionRef.current += 1;
    };
  }, [relationView, view.view, reloadPages, readAux, auxVersionRef]);
  const loadAux = useCallback(
    (append = false): Promise<boolean> => {
      const target = view.view;
      if (target !== 'invites' && target !== 'blocked') return Promise.resolve(false);
      const old = auxRef.current;
      setAux((state) => ({ ...state, view: target, loading: true, error: null }));
      return readAux(target, append ? old : null, append ? 1 : Math.max(1, old.view === target ? old.pages : 1));
    },
    [view.view, readAux],
  );
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
