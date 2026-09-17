import { useSyncExternalStore } from 'react';
import { createDiscoverySearch, parseDiscoverySearch } from '../lib/discovery-search';
import type { DiscoveryFilters } from '../lib/discovery-search';

function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener('play100:navigate', listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener('play100:navigate', listener);
  };
}

export function useDiscoveryUrl() {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => '');
  const filters = parseDiscoverySearch(search);
  const update = (patch: Partial<DiscoveryFilters>, method: 'push' | 'replace' = 'push') => {
    const current = parseDiscoverySearch(window.location.search);
    const next = createDiscoverySearch({ ...current, ...patch });
    if (window.location.search === next) return;
    window.history[method === 'push' ? 'pushState' : 'replaceState'](window.history.state, '', `${window.location.pathname}${next}`);
    window.dispatchEvent(new Event('play100:navigate'));
  };
  return { filters, update };
}
