import { enrichmentIdentity, ENRICHMENT_LIMITS, parseCatalogEnrichment } from './catalog-enrichment';
import type { CatalogEnrichment } from './catalog-enrichment';
import { CatalogRequestError, fetchCatalogJson } from './catalog-transport';

interface CacheEntry { data: CatalogEnrichment; expires: number }
const publicCache = new Map<string, CacheEntry>();
export interface EnrichmentRequest {
  id: string;
  scopeKey: string;
  allowed: boolean;
  online: boolean;
  connected: boolean;
}
export interface EnrichmentSnapshot {
  key: string;
  status: 'idle' | 'disabled' | 'offline' | 'loading' | 'ready' | 'error';
  data: CatalogEnrichment | null;
  error: string | null;
  cached: boolean;
}
export function enrichmentRequestKey(request: EnrichmentRequest) {
  return JSON.stringify([request.id, request.scopeKey, request.allowed, request.online, request.connected]);
}
export async function fetchCatalogEnrichment(id: string, signal: AbortSignal): Promise<CatalogEnrichment> {
  if (!enrichmentIdentity(id)) throw new CatalogRequestError('This record does not support public detail lookup.', 'invalid');
  const payload = await fetchCatalogJson(`/api/catalog-detail?${new URLSearchParams({ id })}`, signal, ENRICHMENT_LIMITS.responseBytes, 10_000);
  return parseCatalogEnrichment(payload, id);
}

export class CatalogEnrichmentSession {
  private snapshot: EnrichmentSnapshot = { key: '', status: 'idle', data: null, error: null, cached: false };
  private listeners = new Set<() => void>();
  private controller: AbortController | null = null;
  private generation = 0;
  private request: EnrichmentRequest | null = null;
  private cooldown = 0;
  constructor(
    private readonly load = fetchCatalogEnrichment,
    private readonly now = Date.now,
    private readonly cache = publicCache,
  ) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private publish(snapshot: EnrichmentSnapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
  cancel = () => {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  };
  peek(request: EnrichmentRequest, refresh = false): EnrichmentSnapshot {
    const key = enrichmentRequestKey(request);
    const eligible = request.allowed && Boolean(enrichmentIdentity(request.id));
    const prior = eligible ? this.cache.get(request.id) : undefined;
    const base = { key, data: prior?.data ?? null, error: null, cached: Boolean(prior) };
    if (!eligible || !request.online) return { ...base, status: 'disabled' };
    if (!request.connected) return { ...base, status: 'offline' };
    if (!refresh && prior && prior.expires > this.now()) return { ...base, status: 'ready' };
    if (this.cooldown > this.now()) {
      return { ...base, status: 'error', error: 'A source is rate-limiting requests. Please wait before retrying.' };
    }
    return { ...base, status: 'loading' };
  }
  start(request: EnrichmentRequest, refresh = false) {
    this.cancel();
    this.request = request;
    const initial = this.peek(request, refresh);
    if (initial.status !== 'loading') { this.publish(initial); return; }
    const { key, data, cached } = initial;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.publish(initial);
    void this.load(request.id, controller.signal).then(data => {
      if (controller.signal.aborted || generation !== this.generation) return;
      const current = parseCatalogEnrichment(data, request.id);
      const retryAfter = Math.max(0, ...current.sources.map(source => source.retryAfter));
      this.cooldown = this.now() + retryAfter * 1000;
      this.cache.delete(request.id);
      this.cache.set(request.id, { data: current, expires: this.now() + (current.sources.some(source => source.status === 'error') ? 0 : ENRICHMENT_LIMITS.cacheMs) });
      while (this.cache.size > ENRICHMENT_LIMITS.cacheEntries) this.cache.delete(this.cache.keys().next().value!);
      this.publish({ key, status: 'ready', data: current, error: null, cached: false });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || generation !== this.generation) return;
      if (error instanceof CatalogRequestError && error.kind === 'rate-limited') this.cooldown = this.now() + (error.retryAfter || 30) * 1000;
      this.publish({ key, data, cached, status: 'error', error: error instanceof Error ? error.message : 'Public game details could not be loaded. Existing details are unchanged.' });
    }).finally(() => { if (this.controller === controller) this.controller = null; });
  }
  retry = () => { if (this.request) this.start(this.request, true); };
}
