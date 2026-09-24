import { useEffect, useRef, useState } from 'react';
import type { FriendShelfEntry } from '../lib/friend-shelf-types';
import { createFriendReadGuard } from '../lib/friend-read-guard';
import type { FriendShelfStore } from './friend-shelf-store';
import type { FriendStore } from './friend-store';
import { cloudAuth } from './firebase-client';
import { onlineError } from './errors';

export function useFriendShelfRead(
  store: FriendShelfStore,
  friendStore: FriendStore,
  uid: string,
  peer: string,
  authGeneration: number,
  active = true,
  accessRevision = 0,
) {
  const key = `${uid}:${peer}:${authGeneration}:${active}:${accessRevision}`;
  const current = useRef(key);
  current.current = key;
  const [value, setValue] = useState<{
    key: string;
    entries: FriendShelfEntry[];
    status: 'loading' | 'ready' | 'unavailable';
    error: string;
  } | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const access = createFriendReadGuard();
    let alive = true;
    let request = 0;
    let releasePair: (() => void) | undefined;
    let releaseHead: (() => void) | undefined;
    const valid = () =>
      alive &&
      current.current === key &&
      cloudAuth.currentUser?.uid === uid &&
      cloudAuth.app === store.db.app &&
      friendStore.db === store.db &&
      active &&
      !document.hidden &&
      navigator.onLine;
    const clear = (error = '') => {
      request += 1;
      if (alive && current.current === key) setValue({ key, entries: [], status: 'unavailable', error });
    };
    const fail = (cause: unknown) => {
      releaseHead?.();
      releaseHead = undefined;
      access.revoke();
      clear(onlineError(cause));
    };
    const attach = () => {
      releasePair?.();
      releaseHead?.();
      releasePair = undefined;
      releaseHead = undefined;
      access.revoke();
      clear();
      if (!valid()) return;
      setValue({ key, entries: [], status: 'loading', error: '' });
      releasePair = friendStore.watchPair(
        uid,
        peer,
        (pair) => {
          if (!valid()) return;
          releaseHead?.();
          releaseHead = undefined;
          access.revoke();
          clear();
          if (pair?.state !== 'accepted') return;
          access.accept(pair.epoch);
          releaseHead = store.watchHead(
            peer,
            (head) => {
              if (!valid()) return;
              const serial = ++request;
              const lease = access.begin();
              setValue({ key, entries: [], status: head?.current ? 'loading' : 'unavailable', error: '' });
              if (!head?.current) return;
              void store
                .shelf(peer)
                .then((shelf) => {
                  if (valid() && request === serial && access.permits(lease))
                    setValue({ key, entries: shelf.entries, status: 'ready', error: '' });
                })
                .catch((cause) => {
                  if (valid() && request === serial && access.permits(lease)) fail(cause);
                });
            },
            fail,
          );
        },
        fail,
      );
    };
    attach();
    window.addEventListener('online', attach);
    window.addEventListener('offline', attach);
    document.addEventListener('visibilitychange', attach);
    return () => {
      alive = false;
      access.revoke();
      request += 1;
      releasePair?.();
      releaseHead?.();
      window.removeEventListener('online', attach);
      window.removeEventListener('offline', attach);
      document.removeEventListener('visibilitychange', attach);
    };
  }, [key, uid, peer, active, store, friendStore, reload]);
  return {
    entries: value?.key === key ? value.entries : [],
    status: value?.key === key ? value.status : ('loading' as const),
    error: value?.key === key ? value.error : '',
    retry: () => setReload((value) => value + 1),
  };
}
