import { startTransition, useEffect, useMemo, useState } from 'react';
import type { DiscoveryCatalog } from '../lib/discovery-catalog';
import type { LibraryRecord } from '../lib/personal-types';
import { loadDiscoveryCatalog } from '../lib/discovery-loader';
import { isModuleLoadFailure } from '../lib/chunk-recovery';
import { indexDiscoveryArtwork } from '../lib/discovery-catalog-shared';
import { EMPTY_DISCOVERY_ARTWORK, hasKnownDiscoveryArtwork } from '../lib/discovery-artwork-presence';

export function useDiscoveryCatalog(enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [wasEnabled, setWasEnabled] = useState(enabled);
  const [state, setState] = useState<{
    status: 'idle' | 'loading' | 'ready' | 'error';
    catalog: DiscoveryCatalog | null;
    error: string | null;
    moduleError?: boolean;
  }>({
    status: enabled ? 'loading' : 'idle',
    catalog: null,
    error: null,
  });
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled);
    if (enabled) setState((prior) => ({ ...prior, status: 'loading', error: null }));
  }
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void loadDiscoveryCatalog(controller.signal)
      .then((catalog) => {
        // A loaded catalog re-renders Discover's whole result list; as a transition React renders it in slices.
        if (!controller.signal.aborted) startTransition(() => setState({ status: 'ready', catalog, error: null }));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error('The local catalog could not be loaded.', error);
          setState({
            status: 'error',
            catalog: null,
            error: 'The local catalog could not be loaded. Choose Reload local catalog to try again.',
            moduleError: isModuleLoadFailure(error),
          });
        }
      });
    return () => controller.abort();
  }, [enabled, attempt]);
  return {
    ...state,
    retry: () => {
      if (!state.moduleError) {
        if (enabled) setState((prior) => ({ ...prior, status: 'loading', error: null }));
        setAttempt((value) => value + 1);
      }
    },
  };
}

export function useDiscoveryArtwork(records: readonly LibraryRecord[], active: boolean) {
  const { catalog } = useDiscoveryCatalog(
    active && records.some((record) => record.source !== 'collection' && hasKnownDiscoveryArtwork(record.id)),
  );
  return useMemo(() => (catalog ? indexDiscoveryArtwork(catalog) : EMPTY_DISCOVERY_ARTWORK), [catalog]);
}
