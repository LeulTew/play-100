import { useEffect, useState, useSyncExternalStore } from 'react';
import { createNoticeStore } from '../lib/notice-store';
import type { NoticeStore } from '../lib/notice-store';

/** One notice store for the component's lifetime; unmounting stops its pending expiry. */
export function useNoticeStore(): NoticeStore {
  const [store] = useState(() => createNoticeStore());
  useEffect(() => () => store.dispose(), [store]);
  return store;
}

const noNotice = () => '';

/** The current notice. While `enabled` is false the component ignores notices and never re-renders for one. */
export function useNotice(store: NoticeStore, enabled = true): string {
  return useSyncExternalStore(store.subscribe, enabled ? store.get : noNotice, noNotice);
}
