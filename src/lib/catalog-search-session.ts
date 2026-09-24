import { fetchCatalogPage } from './catalog-client';
import { CatalogRequestError } from './catalog-transport';
import type { CatalogFailure } from './catalog-transport';
import type { CatalogSource } from './catalog-types';
import type { LibraryRecord } from './personal-types';

export interface SourceSearchState {
  source: CatalogSource;
  status: 'idle' | 'loading' | 'ready' | 'error';
  records: LibraryRecord[];
  nextOffset: number | null;
  requestOffset: number;
  total: number;
  error: string | null;
  failure: CatalogFailure | null;
  notices: string[];
}
export const CATALOG_SOURCES: readonly CatalogSource[] = ['wikidata', 'freetogame'];
export const emptySources = (): SourceSearchState[] =>
  CATALOG_SOURCES.map((source) => ({
    source,
    status: 'idle',
    records: [],
    nextOffset: null,
    requestOffset: 0,
    total: 0,
    error: null,
    failure: null,
    notices: [],
  }));

export class CatalogSearchSession {
  private snapshot = { key: '', sources: emptySources() };
  private listeners = new Set<() => void>();
  private requests = new Map<CatalogSource, AbortController>();
  private cooldowns = new Map<CatalogSource, number>();
  private generation = 0;
  private query = '';
  private offset = 0;
  constructor(private readonly fetchPage = fetchCatalogPage) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private update(source: CatalogSource, change: (state: SourceSearchState) => SourceSearchState) {
    this.snapshot = {
      ...this.snapshot,
      sources: this.snapshot.sources.map((state) => (state.source === source ? change(state) : state)),
    };
    for (const listener of this.listeners) listener();
  }
  cancel() {
    this.generation++;
    for (const controller of this.requests.values()) controller.abort();
    this.requests.clear();
  }
  start(key: string, query: string, sources: readonly CatalogSource[], offset = 0) {
    this.cancel();
    this.query = query;
    this.offset = offset;
    this.snapshot = { key, sources: emptySources() };
    for (const listener of this.listeners) listener();
    for (const source of sources) void this.load(source, offset, false);
  }
  private async load(source: CatalogSource, offset: number, append: boolean) {
    if (this.requests.has(source)) return;
    if ((this.cooldowns.get(source) ?? 0) > Date.now()) {
      this.update(source, (state) => ({
        ...state,
        status: 'error',
        error: 'This provider is rate-limiting requests. Wait a moment before retrying.',
        failure: 'rate-limited',
        requestOffset: offset,
      }));
      return;
    }
    const generation = this.generation;
    const controller = new AbortController();
    this.requests.set(source, controller);
    this.update(source, (state) => ({
      ...state,
      status: 'loading',
      error: null,
      failure: null,
      requestOffset: offset,
    }));
    try {
      const page = await this.fetchPage(source, this.query, offset, controller.signal);
      if (generation !== this.generation || controller.signal.aborted) return;
      this.update(source, (state) => ({
        ...state,
        status: 'ready',
        total: page.total,
        nextOffset: page.nextOffset,
        notices: page.notices,
        records: [
          ...new Map([...(append ? state.records : []), ...page.items].map((record) => [record.id, record])).values(),
        ],
      }));
    } catch (error: unknown) {
      if (generation !== this.generation || controller.signal.aborted) return;
      if (error instanceof CatalogRequestError && error.kind === 'rate-limited') {
        this.cooldowns.set(source, Date.now() + (error.retryAfter || 30) * 1000);
      }
      this.update(source, (state) => ({
        ...state,
        status: 'error',
        failure: error instanceof CatalogRequestError ? error.kind : 'unavailable',
        error: error instanceof Error ? error.message : 'The catalog could not be reached.',
      }));
    } finally {
      if (this.requests.get(source) === controller) this.requests.delete(source);
    }
  }
  retry(source: CatalogSource) {
    const state = this.snapshot.sources.find((item) => item.source === source);
    if (state) void this.load(source, state.requestOffset, state.requestOffset > this.offset);
  }
  more(source: CatalogSource) {
    const state = this.snapshot.sources.find((item) => item.source === source);
    if (state?.status === 'ready' && state.nextOffset !== null) void this.load(source, state.nextOffset, true);
  }
}
