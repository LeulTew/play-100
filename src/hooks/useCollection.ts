import { startTransition, useEffect, useState } from 'react';
import { parseCollection } from '../lib/collection';
import type { CollectionData } from '../lib/types';

type CollectionResult =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: CollectionData; error: null }
  | { status: 'error'; data: null; error: string };

export function useCollection() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<CollectionResult>({ status: 'loading', data: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);
    setResult({ status: 'loading', data: null, error: null });
    fetch('/data/collection.json', { signal: controller.signal, cache: attempt ? 'reload' : 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`The collection request failed (${response.status}).`);
        return response.json() as Promise<unknown>;
      })
      .then((value) => {
        const data = parseCollection(value);
        // The ready collection re-renders the controls and the first cards; as a transition React
        // renders it in slices.
        startTransition(() => setResult({ status: 'ready', data, error: null }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted && !timedOut) return;
        setResult({
          status: 'error',
          data: null,
          error: timedOut
            ? 'The collection took too long to load. Check your connection and try again.'
            : error instanceof Error
              ? error.message
              : 'The collection could not be loaded.',
        });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);
  return { ...result, retry: () => setAttempt((value) => value + 1) };
}
