import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCatalogPage } from '../lib/catalog-client';
import type { CatalogSource } from '../lib/catalog-types';
import type { LibraryRecord } from '../lib/personal-types';

export interface SourceSearchState {
  source: CatalogSource;
  status: 'idle' | 'loading' | 'ready' | 'error';
  records: LibraryRecord[];
  nextOffset: number | null;
  requestOffset: number;
  total: number;
  error: string | null;
}

const sources: readonly CatalogSource[] = ['wikidata', 'freetogame'];
const emptySources = (): SourceSearchState[] => sources.map((source) => ({
  source, status: 'idle', records: [], nextOffset: null, requestOffset: 0, total: 0, error: null,
}));

export function useExtendedSearch(query: string, enabled: boolean) {
  const term = query.trim();
  const eligible = enabled && term.length >= 2 && term.length <= 80;
  const [snapshot, setSnapshot] = useState({ query: '', sources: emptySources() });
  const generation = useRef(0);
  const requests = useRef(new Map<CatalogSource, AbortController>());
  const current = useRef({ query: term, eligible });
  current.current = { query: term, eligible };

  const load = useCallback(async (source: CatalogSource, search: string, offset: number, append: boolean, cycle: number) => {
    if (!current.current.eligible || current.current.query !== search || cycle !== generation.current) return;
    requests.current.get(source)?.abort();
    const controller = new AbortController();
    requests.current.set(source, controller);
    const timeout = window.setTimeout(() => controller.abort('timeout'), 15000);
    setSnapshot((previous) => ({
      query: search,
      sources: (previous.query === search ? previous.sources : emptySources()).map((item) => item.source === source
        ? { ...item, status: 'loading', requestOffset: offset, error: null } : item),
    }));
    try {
      const page = await fetchCatalogPage(source, search, offset, controller.signal);
      if (controller.signal.aborted || cycle !== generation.current || !current.current.eligible || current.current.query !== search) return;
      setSnapshot((previous) => ({
        query: search,
        sources: previous.sources.map((item) => item.source !== source ? item : {
          source, status: 'ready', error: null, total: page.total, nextOffset: page.nextOffset, requestOffset: offset,
          records: [...new Map([...(append ? item.records : []), ...page.items].map((record) => [record.id, record])).values()],
        }),
      }));
    } catch (error: unknown) {
      if (cycle !== generation.current || !current.current.eligible || current.current.query !== search || (controller.signal.aborted && controller.signal.reason !== 'timeout')) return;
      const message = controller.signal.reason === 'timeout' ? 'This catalog took too long to reply. Retry when your connection is ready.'
        : error instanceof Error ? error.message : 'This catalog could not be reached.';
      setSnapshot((previous) => ({
        ...previous,
        sources: previous.sources.map((item) => item.source === source ? { ...item, status: 'error', error: message } : item),
      }));
    } finally {
      window.clearTimeout(timeout);
      if (requests.current.get(source) === controller) requests.current.delete(source);
    }
  }, []);

  useEffect(() => {
    const cycle = ++generation.current;
    for (const request of requests.current.values()) request.abort();
    requests.current.clear();
    if (!eligible) { setSnapshot({ query: term, sources: emptySources() }); return; }
    setSnapshot({ query: term, sources: emptySources().map((source) => ({ ...source, status: 'loading' })) });
    const timer = window.setTimeout(() => {
      for (const source of sources) void load(source, term, 0, false, cycle);
    }, 750);
    const activeRequests = requests.current;
    return () => {
      window.clearTimeout(timer);
      for (const request of activeRequests.values()) request.abort();
      activeRequests.clear();
    };
  }, [term, eligible, load]);

  const visible = (eligible && snapshot.query === term ? snapshot.sources : emptySources())
    .map((source): SourceSearchState => eligible && source.status === 'idle' ? { ...source, status: 'loading' } : source);
  const retry = (source: CatalogSource) => {
    if (!current.current.eligible || requests.current.has(source)) return;
    const offset = visible.find((entry) => entry.source === source)?.requestOffset ?? 0;
    void load(source, current.current.query, offset, offset > 0, generation.current);
  };
  const more = (source: CatalogSource) => {
    const state = visible.find((entry) => entry.source === source);
    if (!current.current.eligible || requests.current.has(source) || !state || state.status !== 'ready' || state.nextOffset === null) return;
    void load(source, current.current.query, state.nextOffset, true, generation.current);
  };
  return { sources: visible, records: visible.flatMap((source) => source.records), loading: visible.some((source) => source.status === 'loading'), eligible, retry, more };
}
