import { useCallback, useInsertionEffect, useRef } from 'react';

/**
 * The value of the last committed render, for code that runs after render: events, timers, effects and async work.
 * Render must not read it. The insertion effect runs before every layout effect of its commit, so a child's layout
 * effect already sees this commit's value, and a render React discards never changes it.
 */
export function useLatest<T>(value: T): { readonly current: T } {
  const latest = useRef(value);
  useInsertionEffect(() => {
    latest.current = value;
  });
  return latest;
}

/** A function whose identity never changes and which calls the last committed handler. Never call it in render. */
export function useStableHandler<A extends unknown[], R>(handler: (...args: A) => R): (...args: A) => R {
  const latest = useLatest(handler);
  return useCallback((...args: A) => latest.current(...args), [latest]);
}
