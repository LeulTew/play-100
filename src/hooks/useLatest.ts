import { useCallback, useInsertionEffect, useMemo, useRef, useState } from 'react';

/**
 * The value of the last committed render, for code that runs after render: events, timers, effects and async work.
 * Render must not read it. The insertion effect runs before the layout effects of its commit mount, so a child's
 * layout effect setup already sees this commit's value, and a render React discards never changes it. Cleanups in the
 * same commit's mutation phase (a child's insertion or layout cleanup) may still run first and see the previous value.
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

/**
 * useStableHandlers bound to `binding` (the library a save goes to): each handler keeps its identity while the binding
 * does and calls the last handlers committed with that binding. When the binding changes the record is new, and the
 * old record keeps calling the handlers of its own binding, so an editor that holds one still saves where it began.
 */
export function useBoundHandlers<B extends object, T extends Handlers<T>>(binding: B, handlers: T): T {
  const [committed] = useState(() => new WeakMap<B, T>());
  const [keys] = useState(() => Object.keys(handlers) as (keyof T)[]);
  useInsertionEffect(() => {
    committed.set(binding, handlers);
  });
  return useMemo(
    () =>
      Object.fromEntries(
        keys.map((key) => [
          key,
          (...args: unknown[]) => {
            const current = committed.get(binding);
            if (!current) throw new Error('A bound handler ran before its first commit.');
            return current[key](...args);
          },
        ]),
      ) as T,
    [committed, keys, binding],
  );
}
