import { useEffect, useState } from 'react';
import type { DiscoveryCatalog } from '../lib/discovery-catalog';
import { loadDiscoveryCatalog } from '../lib/discovery-loader';
import { isModuleLoadFailure } from '../lib/chunk-recovery';

export function useDiscoveryCatalog(enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; catalog: DiscoveryCatalog | null; error: string | null; moduleError?: boolean }>({
    status: 'idle', catalog: null, error: null,
  });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState((prior) => ({ ...prior, status: 'loading', error: null }));
    void loadDiscoveryCatalog(controller.signal).then((catalog) => {
      if (!controller.signal.aborted) setState({ status: 'ready', catalog, error: null });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ status: 'error', catalog: null, error: error instanceof Error ? error.message : 'The local catalog could not be loaded.', moduleError: isModuleLoadFailure(error) });
    });
    return () => controller.abort();
  }, [enabled, attempt]);
  return { ...state, retry: () => { if (!state.moduleError) setAttempt((value) => value + 1); } };
}
