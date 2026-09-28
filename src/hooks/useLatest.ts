import { useCallback, useInsertionEffect, useRef, useState } from 'react';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a handler record takes any parameter list.
type Handlers<T> = { [K in keyof T]: (...args: any[]) => unknown };

/**
 * useStableHandler for a record of handlers: each keeps its identity for the component's lifetime. The first render
 * fixes the keys. Never call one in render; render-time functions (hrefs, render props) need a plain useCallback.
 */
export function useStableHandlers<T extends Handlers<T>>(handlers: T): T {
  const latest = useLatest(handlers);
  const [stable] = useState(
    () =>
      Object.fromEntries(
        Object.keys(handlers).map((key) => [key, (...args: unknown[]) => latest.current[key as keyof T](...args)]),
      ) as T,
  );
  return stable;
}
