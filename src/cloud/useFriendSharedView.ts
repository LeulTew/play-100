import { useEffect, useMemo, useRef, useState } from 'react';
import type { FriendAllEntry, FriendAllKind } from '../lib/friend-all';
import type { FriendCursor } from '../lib/friend-types';
import type { FriendAllHead } from '../lib/friend-all-transport';
import type { FriendShelfStore } from './friend-shelf-store';
import type { FriendStore } from './friend-store';
import { FriendAllStore } from './friend-all-store';
import { cloudAuth } from './firebase-client';
import { onlineError } from './errors';

export interface FriendSharedView {
  key: string;
  entries: FriendAllEntry[];
  mode: 'all' | 'selected';
  status: 'loading' | 'ready' | 'unavailable';
  total: number | null;
  complete: boolean;
  exactIds: readonly string[] | null;
  updatedAt: number | null;
  cursor?: FriendCursor;
  loadingMore: boolean;
  error: string;
  head?: FriendAllHead;
}
export function useFriendSharedView(
  store: FriendStore,
  shelf: FriendShelfStore,
  uid: string,
  peer: string,
  kind: FriendAllKind,
  active: boolean,
  exactIds: readonly string[] | null = null,
  authGeneration = 0,
) {
  const all = useMemo(() => new FriendAllStore(store.db), [store]);
  const exactKey = exactIds?.join('|') ?? '';
  const exact = useMemo(() => (exactKey ? exactKey.split('|') : null), [exactKey]);
  const key = `${uid}:${peer}:${kind}:${authGeneration}:${active}:${exactKey}`;
  const [value, setValue] = useState<FriendSharedView | null>(null);
  const [reload, setReload] = useState(0);
  const latest = useRef(value);
  latest.current = value;
  const current = useRef(key);
  current.current = key;
  const more = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let alive = true;
    let serial = 0;
    let activePair = false;
    let releasePair: (() => void) | undefined;
    let releaseAll: (() => void) | undefined;
    let releaseLegacy: (() => void) | undefined;
    let releaseControls: Array<() => void> = [];
    let legacyStarted = false;
    let controlEpoch = 0;
    const valid = () =>
      alive &&
      current.current === key &&
      cloudAuth.currentUser?.uid === uid &&
      active &&
      !document.hidden &&
      navigator.onLine !== false;
    const base = (mode: 'all' | 'selected', status: FriendSharedView['status'], error = ''): FriendSharedView => ({
      key,
      mode,
      status,
      entries: [],
      total: null,
      complete: false,
      exactIds: exact,
      updatedAt: null,
      loadingMore: false,
      error,
    });
    const clear = (error = '') => {
      serial += 1;
      if (valid()) setValue(base('all', 'unavailable', error));
    };
    const controlsOff = (cause?: unknown) => {
      clear(cause ? onlineError(cause) : 'Sharing is no longer available.');
    };
    const watchControls = () => {
      if (releaseControls.length) return;
      let rankingRevision: number | null = null;
      let shelfRevision: number | null = null;
      releaseControls = [
        store.watchSettings(
          peer,
          (settings) => {
            if (
              !settings?.enabled ||
              settings.deleted ||
              settings.selectedIds.length ||
              (rankingRevision !== null && settings.revision !== rankingRevision)
            )
              controlsOff();
            else rankingRevision = settings.revision;
          },
          controlsOff,
        ),
        shelf.watchConfig(
          peer,
          (settings) => {
            if (
              !settings?.enabled ||
              settings.deleted ||
              settings.selectedIds.length ||
              (shelfRevision !== null && settings.revision !== shelfRevision)
            )
              controlsOff();
            else shelfRevision = settings.revision;
          },
          controlsOff,
        ),
      ];
    };
    const legacy = () => {
      if (legacyStarted || !valid() || !activePair) return;
      legacyStarted = true;
      const next = async (head: { current: unknown; updatedAt: number } | null) => {
        const request = ++serial;
        if (!valid()) return;
        setValue(base('selected', head?.current ? 'loading' : 'unavailable'));
        if (!head?.current) return;
        try {
          const result = kind === 'games' ? await shelf.shelf(peer) : await store.ranking(peer);
          if (!valid() || request !== serial) return;
          const entries = exact ? result.entries.filter((entry) => exact.includes(entry.id)) : result.entries;
          setValue({
            ...base('selected', 'ready'),
            entries,
            total: result.entries.length,
            complete: true,
            updatedAt: result.head.updatedAt,
          });
        } catch (cause) {
          if (valid() && request === serial) setValue(base('selected', 'unavailable', onlineError(cause)));
        }
      };
      releaseLegacy =
        kind === 'games'
          ? shelf.watchHead(
              peer,
              (head) => {
                void next(head);
              },
              controlsOff,
            )
          : store.watchShareHead(
              peer,
              (head) => {
                void next(head);
              },
              controlsOff,
            );
    };
    const headChanged = (head: FriendAllHead | null) => {
      if (!valid() || !activePair) return;
      if (!head) {
        legacy();
        return;
      }
      releaseLegacy?.();
      releaseLegacy = undefined;
      legacyStarted = false;
      const request = ++serial;
      if (head.epoch !== controlEpoch) {
        releaseControls.forEach((release) => release());
        releaseControls = [];
        controlEpoch = head.epoch;
      }
      watchControls();
      setValue({ ...base('all', 'loading'), total: head.status === 'ready' ? head.count : null, head });
      if (head.status !== 'ready') return;
      void (exact?.length ? all.exact(peer, kind, exact) : all.page(peer, kind))
        .then((result) => {
          if (!valid() || request !== serial || result.head.revision !== head.revision) return;
          const cursor = 'cursor' in result ? result.cursor : undefined;
          setValue({
            ...base('all', 'ready'),
            head,
            entries: result.entries,
            total: head.count,
            complete: exact !== null || result.entries.length === head.count,
            updatedAt: head.updatedAt,
            cursor,
            loadingMore: false,
          });
        })
        .catch((cause) => {
          if (valid() && request === serial) setValue(base('all', 'unavailable', onlineError(cause)));
        });
    };
    const reset = () => {
      serial += 1;
      releasePair?.();
      releaseAll?.();
      releaseLegacy?.();
      releaseControls.forEach((release) => release());
      releaseControls = [];
      releasePair = undefined;
      releaseAll = undefined;
      releaseLegacy = undefined;
      activePair = false;
      legacyStarted = false;
      if (alive && current.current === key) setValue(base('all', valid() ? 'loading' : 'unavailable'));
    };
    const attach = () => {
      reset();
      if (!valid()) return;
      releasePair = store.watchPair(
        uid,
        peer,
        (pair) => {
          if (!valid()) return;
          releaseAll?.();
          releaseLegacy?.();
          releaseControls.forEach((release) => release());
          releaseControls = [];
          legacyStarted = false;
          activePair = pair?.state === 'accepted';
          clear();
          if (!activePair) return;
          releaseAll = all.watchHead(peer, kind, headChanged, (cause) => {
            if (!valid()) return;
            clear(onlineError(cause));
            legacy();
          });
        },
        controlsOff,
      );
    };
    more.current = async () => {
      const old = latest.current;
      if (
        !valid() ||
        !activePair ||
        old?.key !== key ||
        old.status !== 'ready' ||
        old.mode !== 'all' ||
        old.complete ||
        !old.cursor ||
        !old.head ||
        old.loadingMore
      )
        return;
      const request = serial;
      setValue({ ...old, loadingMore: true, error: '' });
      try {
        const result = await all.page(peer, kind, old.cursor, old.head.revision);
        if (!valid() || request !== serial) return;
        const entries = [...old.entries, ...result.entries];
        if (new Set(entries.map((entry) => entry.id)).size !== entries.length || entries.length > result.head.count)
          throw new Error('The shared list changed. Refresh it.');
        setValue({
          ...old,
          entries,
          cursor: result.cursor,
          complete: entries.length === result.head.count,
          loadingMore: false,
        });
      } catch (cause) {
        if (valid() && request === serial) setValue(base('all', 'unavailable', onlineError(cause)));
      }
    };
    attach();
    window.addEventListener('online', attach);
    window.addEventListener('offline', attach);
    document.addEventListener('visibilitychange', attach);
    return () => {
      alive = false;
      reset();
      more.current = async () => {};
      window.removeEventListener('online', attach);
      window.removeEventListener('offline', attach);
      document.removeEventListener('visibilitychange', attach);
    };
  }, [uid, peer, kind, authGeneration, active, exact, key, store, shelf, all, reload]);
  const empty = useMemo<FriendSharedView>(
    () => ({
      key,
      mode: 'all',
      status: 'loading',
      entries: [],
      total: null,
      complete: false,
      exactIds: exact,
      updatedAt: null,
      loadingMore: false,
      error: '',
    }),
    [key, exact],
  );
  const view = value?.key === key ? value : empty;
  return { ...view, loadMore: () => more.current(), retry: () => setReload((count) => count + 1), reload };
}
