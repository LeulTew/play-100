import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogEnrichmentSession, fetchCatalogEnrichment } from './catalog-enrichment-session';
import type { EnrichmentRequest, EnrichmentSnapshot } from './catalog-enrichment-session';
import type { CatalogEnrichment } from './catalog-enrichment';
import { CatalogRequestError } from './catalog-transport';
import { enrichmentFixture } from './discovery-test-fixtures';

const request = (patch: Partial<EnrichmentRequest> = {}): EnrichmentRequest => ({
  id: 'wikidata:Q15408545', scopeKey: 'guest', allowed: true, online: true, connected: true, ...patch,
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('public detail lookup eligibility and lifecycle', () => {
  it.each(['disabled', 'offline', 'ready', 'error', 'loading'] as const)(
    'peeks the exact first %s snapshot without requests, publication or cache mutation',
    async status => {
      const data = enrichmentFixture();
      const cache = new Map([[data.id, { data, expires: status === 'ready' ? 2000 : 0 }]]);
      const load = vi.fn<(id: string, signal: AbortSignal) => Promise<CatalogEnrichment>>()
        .mockImplementation(() => new Promise(() => {}));
      const session = new CatalogEnrichmentSession(load, () => 1000, cache);
      if (status === 'error') {
        load.mockRejectedValueOnce(new CatalogRequestError('Slow down', 'rate-limited', 30));
        session.start(request());
        await vi.waitFor(() => expect(session.getSnapshot().status).toBe('error'));
        load.mockClear();
      }
      const published: EnrichmentSnapshot[] = [];
      const unsubscribe = session.subscribe(() => { published.push(session.getSnapshot()); });
      const input = request({ online: status !== 'disabled', connected: status !== 'offline' });
      const before = session.getSnapshot();
      const cached = [...cache.entries()];
      const peeked = session.peek(input);
      expect(peeked).toMatchObject({ status, data, cached: true });
      expect(session.getSnapshot()).toBe(before);
      expect(published).toEqual([]);
      expect(load).not.toHaveBeenCalled();
      expect([...cache.entries()]).toEqual(cached);
      session.start(input);
      expect(published[0]).toEqual(peeked);
      expect(load).toHaveBeenCalledTimes(status === 'loading' ? 1 : 0);
      unsubscribe();
      session.cancel();
    },
  );

  it('does not cancel a live request, construct a controller or change retry identity when peeking', () => {
    const load = vi.fn<(id: string, signal: AbortSignal) => Promise<CatalogEnrichment>>()
      .mockImplementation(() => new Promise(() => {}));
    const session = new CatalogEnrichmentSession(load, () => 1000, new Map());
    session.start(request());
    const signal = load.mock.calls[0]![1];
    const controller = vi.fn();
    vi.stubGlobal('AbortController', controller);
    const listener = vi.fn();
    session.subscribe(listener);
    const before = session.getSnapshot();
    expect(session.peek(request({ id: 'manual:private', scopeKey: 'other' }))).toMatchObject({
      status: 'disabled', data: null, cached: false,
    });
    expect(controller).not.toHaveBeenCalled();
    expect(signal.aborted).toBe(false);
    expect(load).toHaveBeenCalledOnce();
    expect(listener).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toBe(before);
    vi.unstubAllGlobals();
    session.retry();
    expect(load.mock.calls[1]![0]).toBe(request().id);
    session.cancel();
  });

  it.each([
    { allowed: false }, { online: false }, { connected: false }, { id: 'manual:private-title' },
    { id: 'red-dead-redemption-2' }, { id: 'wikidata:Q27438121' },
  ])('makes no request for ineligible input %j', patch => {
    const load = vi.fn();
    const session = new CatalogEnrichmentSession(load, Date.now, new Map());
    session.start(request(patch));
    expect(load).not.toHaveBeenCalled();
    expect(session.getSnapshot().data).toBeNull();
  });
  it('rejects manual and reviewed-canonical IDs before the shared transport can fetch', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(fetchCatalogEnrichment('manual:private', new AbortController().signal)).rejects.toThrow();
    await expect(fetchCatalogEnrichment('wikidata:Q27438121', new AbortController().signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses only the exact ID parameter, never a scope, title, note or user identifier', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(enrichmentFixture())));
    vi.stubGlobal('fetch', fetch);
    await fetchCatalogEnrichment('wikidata:Q15408545', new AbortController().signal);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/catalog-detail?id=wikidata%3AQ15408545');
  });
  it('aborts and suppresses a late close, scope change, and superseded ID', async () => {
    const pending: { id: string; signal: AbortSignal; resolve: (data: CatalogEnrichment) => void }[] = [];
    const load = vi.fn((id: string, signal: AbortSignal) => new Promise<CatalogEnrichment>(resolve => { pending.push({ id, signal, resolve }); }));
    const session = new CatalogEnrichmentSession(load, Date.now, new Map());
    session.start(request());
    session.cancel();
    pending[0]!.resolve(enrichmentFixture());
    await Promise.resolve();
    expect(pending[0]!.signal.aborted).toBe(true);
    expect(session.getSnapshot().data).toBeNull();
    session.start(request());
    session.start(request({ id: 'wikidata:Q90000001', scopeKey: 'account:changed' }));
    pending[1]!.resolve(enrichmentFixture());
    await Promise.resolve();
    expect(pending[1]!.signal.aborted).toBe(true);
    expect(session.getSnapshot().data).toBeNull();
    const data = { ...enrichmentFixture(), id: 'wikidata:Q90000001', ratings: [] };
    pending[2]!.resolve(data);
    await vi.waitFor(() => expect(session.getSnapshot().data?.id).toBe(data.id));
  });
  it('uses bounded cached public facts offline or opted out without refreshing them', async () => {
    let clock = 1000;
    const load = vi.fn().mockResolvedValue(enrichmentFixture());
    const session = new CatalogEnrichmentSession(load, () => clock, new Map());
    session.start(request());
    await vi.waitFor(() => expect(session.getSnapshot().status).toBe('ready'));
    clock += 60 * 60_000;
    session.start(request({ online: false }));
    expect(session.getSnapshot()).toMatchObject({ status: 'disabled', cached: true, data: enrichmentFixture() });
    session.start(request({ connected: false }));
    session.retry();
    expect(session.getSnapshot()).toMatchObject({ status: 'offline', cached: true });
    expect(load).toHaveBeenCalledOnce();
  });
  it('retains explicit partial errors and respects retry-after without clearing other scores', async () => {
    let clock = 1000;
    const data = enrichmentFixture();
    data.sources[1] = { source: 'steam', status: 'error', code: 'rate-limited', message: 'Steam rate limit.', retryAfter: 30 };
    const load = vi.fn().mockResolvedValue(data);
    const session = new CatalogEnrichmentSession(load, () => clock, new Map());
    session.start(request());
    await vi.waitFor(() => expect(session.getSnapshot().data?.ratings).toHaveLength(1));
    session.retry();
    expect(load).toHaveBeenCalledOnce();
    expect(session.getSnapshot().error).toMatch(/rate-limiting/);
    clock += 31_000;
    session.retry();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
  it('does not replace a valid cached response with malformed or wrong-game data', async () => {
    const load = vi.fn().mockResolvedValueOnce(enrichmentFixture()).mockResolvedValueOnce({ ...enrichmentFixture(), id: 'wikidata:Q1' });
    const session = new CatalogEnrichmentSession(load, Date.now, new Map());
    session.start(request());
    await vi.waitFor(() => expect(session.getSnapshot().status).toBe('ready'));
    session.retry();
    await vi.waitFor(() => expect(session.getSnapshot().status).toBe('error'));
    expect(session.getSnapshot().data).toEqual(enrichmentFixture());
  });
  it('shows a transport failure honestly without fabricating a successful empty result', async () => {
    const session = new CatalogEnrichmentSession(vi.fn().mockRejectedValue(new CatalogRequestError('Timed out', 'timeout')), Date.now, new Map());
    session.start(request());
    await vi.waitFor(() => expect(session.getSnapshot()).toMatchObject({ status: 'error', data: null, error: 'Timed out' }));
  });
});
