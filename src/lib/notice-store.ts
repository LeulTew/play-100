import { createValueStore } from './value-store';

/**
 * The app's transient notice. Only the regions that show it subscribe, so a notice appearing or expiring re-renders
 * the toast and an open detail, never the header, the route or its cards.
 */
export interface NoticeStore {
  get(): string;
  subscribe(listener: () => void): () => void;
  /** Shows a message, replacing any other, until `duration` passes. */
  notify(message: string): void;
  clear(): void;
  /** Stops the pending expiry; the store stays usable. */
  dispose(): void;
}

export const NOTICE_DURATION = 6500;

export function createNoticeStore(duration = NOTICE_DURATION): NoticeStore {
  const value = createValueStore('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    get: value.get,
    subscribe: value.subscribe,
    notify(message) {
      clearTimeout(timer);
      value.set(message);
      timer = setTimeout(() => value.set(''), duration);
    },
    clear() {
      value.set('');
    },
    dispose() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
