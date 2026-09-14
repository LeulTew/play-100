import { useEffect, useRef } from 'react';

export function useExitSave(flush: () => void) {
  const latest = useRef(flush);
  latest.current = flush;
  useEffect(() => {
    const pending = latest;
    // A cancelled debounce must not discard an edit when its field disappears.
    return () => pending.current();
  }, []);
}
