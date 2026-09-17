import { useEffect, useState, useSyncExternalStore } from 'react';
import { CATALOG_SOURCES, CatalogSearchSession, emptySources } from '../lib/catalog-search-session';
import type { CatalogSource } from '../lib/catalog-types';

export function useCatalogSearch(query: string, enabled: boolean, source: 'all' | CatalogSource = 'all', offset = 0) {
  const [session] = useState(() => new CatalogSearchSession());
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const term = query.trim();
  const key = JSON.stringify([term, source, offset, enabled]);
  useEffect(() => {
    session.cancel();
    if (!enabled) return;
    const timer = window.setTimeout(() => session.start(key, term, source === 'all' ? CATALOG_SOURCES : [source], offset), 500);
    return () => { window.clearTimeout(timer); session.cancel(); };
  }, [key, term, source, offset, enabled, session]);
  const sources = enabled && snapshot.key === key ? snapshot.sources : emptySources().map((state) =>
    enabled && (source === 'all' || source === state.source) ? { ...state, status: 'loading' as const } : state);
  return {
    sources, records: sources.flatMap((state) => state.records), loading: sources.some((state) => state.status === 'loading'),
    retry: (provider: CatalogSource) => { if (enabled && snapshot.key === key) session.retry(provider); },
    more: (provider: CatalogSource) => { if (enabled && snapshot.key === key) session.more(provider); },
  };
}
