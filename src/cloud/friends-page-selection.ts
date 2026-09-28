import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { initialComparison, readComparisonView, rememberComparisonView } from '../lib/friend-comparison-intent';
import type { FriendStore } from './friend-store';

export type SelectionCheck = { status: 'checking' | 'ready' } | { status: 'error'; cause: unknown };

/**
 * The friends chosen for comparison, remembered for this account's comparison scope. Each chosen pair is watched
 * while the page is visible and online: a pair that is no longer accepted leaves the selection, with a message.
 */
export function useComparisonSelection(
  store: FriendStore,
  uid: string,
  scope: string,
  current: () => boolean,
  setMessage: (message: string) => void,
) {
  const [selected, setSelected] = useState<string[]>(() => {
    const prior = readComparisonView(scope);
    return prior?.selected.includes(uid) ? prior.selected.filter((peer) => peer !== uid) : [];
  });
  const selectedRef = useRef(selected);
  useLayoutEffect(() => {
    selectedRef.current = selected;
  });
  const [selectionChecks, setSelectionChecks] = useState<Record<string, SelectionCheck>>({});
  const [selectionRetry, setSelectionRetry] = useState(0);
  const choose = useCallback(
    (peers: string[], preserveView = false) => {
      if (!current()) return;
      const initial = initialComparison(scope, uid, peers);
      const prior = preserveView ? readComparisonView(scope) : null;
      const intent = prior ? { ...prior, selected: initial.selected } : initial;
      selectedRef.current = peers;
      setSelected(peers);
      rememberComparisonView(intent, false);
    },
    [current, scope, uid],
  );
  useEffect(() => {
    let active = true;
    let generation = 0;
    const releases: Array<() => void> = [];
    const bind = () => {
      const version = ++generation;
      releases.splice(0).forEach((release) => release());
      setSelectionChecks(Object.fromEntries(selected.map((peer) => [peer, { status: 'checking' as const }])));
      if (document.hidden || navigator.onLine === false) return;
      const valid = () => active && current() && version === generation;
      for (const peer of selected)
        releases.push(
          store.watchPair(
            uid,
            peer,
            (pair) => {
              if (!valid()) return;
              if (pair?.state !== 'accepted') {
                choose(
                  selectedRef.current.filter((value) => value !== peer),
                  true,
                );
                setMessage('A connection changed. Your comparison selection was updated.');
              } else setSelectionChecks((old) => ({ ...old, [peer]: { status: 'ready' } }));
            },
            (cause) => {
              if (!valid()) return;
              if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'permission-denied') {
                choose(
                  selectedRef.current.filter((value) => value !== peer),
                  true,
                );
                setMessage('A selected connection is no longer available.');
              } else setSelectionChecks((old) => ({ ...old, [peer]: { status: 'error', cause } }));
            },
          ),
        );
    };
    bind();
    window.addEventListener('online', bind);
    window.addEventListener('offline', bind);
    document.addEventListener('visibilitychange', bind);
    return () => {
      active = false;
      generation += 1;
      releases.forEach((release) => release());
      window.removeEventListener('online', bind);
      window.removeEventListener('offline', bind);
      document.removeEventListener('visibilitychange', bind);
    };
  }, [store, uid, selected, current, choose, selectionRetry, setMessage]);
  const selectionReady = selected.every((peer) => selectionChecks[peer]?.status === 'ready');
  const selectionError = Object.values(selectionChecks).find((check) => check.status === 'error');
  return {
    selected,
    selectedRef,
    choose,
    selectionReady,
    selectionError,
    retrySelection: () => setSelectionRetry((value) => value + 1),
  };
}
