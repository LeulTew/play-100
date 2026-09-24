import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogSearchSession } from './catalog-search-session';
import { CatalogRequestError } from './catalog-transport';
import type { CatalogPage, CatalogSource } from './catalog-types';
import { discoveryFixture } from './discovery-test-fixtures';

const page = (source: CatalogSource = 'wikidata', query = 'KCD', offset = 0): CatalogPage => ({
  source,
  query,
  offset,
  items: source === 'wikidata' ? [discoveryFixture.record] : [],
  total: source === 'wikidata' ? 1 : 0,
  nextOffset: null,
  notices: [],
});
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
afterEach(() => vi.useRealTimers());

describe('per-query online request lifecycle', () => {
  it('rejects out-of-order old responses even when the upstream ignores abort', async () => {
    let old: (value: CatalogPage) => void = () => undefined;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            old = resolve;
          }),
      )
      .mockResolvedValueOnce(page('wikidata', 'new'));
    const session = new CatalogSearchSession(fetcher);
    session.start('old', 'old', ['wikidata']);
    const oldSignal = fetcher.mock.calls[0]?.[3] as AbortSignal;
    session.start('new', 'new', ['wikidata']);
    expect(oldSignal.aborted).toBe(true);
    await flush();
    old({ ...page(), items: [{ ...discoveryFixture.record, title: 'obsolete result' }] });
    await flush();
    expect(session.getSnapshot().key).toBe('new');
    expect(session.getSnapshot().sources[0]?.records[0]?.title).toBe(discoveryFixture.record.title);
  });
  it('lets one provider finish while the other is offline, rate limited, timed out or unavailable', async () => {
    for (const kind of ['offline', 'rate-limited', 'timeout', 'unavailable'] as const) {
      const fetcher = vi
        .fn()
        .mockImplementation((source: CatalogSource) =>
          source === 'wikidata'
            ? Promise.resolve(page())
            : Promise.reject(new CatalogRequestError('Provider failed', kind)),
        );
      const session = new CatalogSearchSession(fetcher);
      session.start('KCD', 'KCD', ['wikidata', 'freetogame']);
      await flush();
      expect(session.getSnapshot().sources[0]?.records).toHaveLength(1);
      expect(session.getSnapshot().sources[1]).toMatchObject({ status: 'error', failure: kind });
    }
  });
  it('preserves good records after pagination failure and retries the failed offset', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ...page(), nextOffset: 5 })
      .mockRejectedValueOnce(new CatalogRequestError('Timed out', 'timeout'))
      .mockResolvedValueOnce(page('wikidata', 'KCD', 5));
    const session = new CatalogSearchSession(fetcher);
    session.start('KCD', 'KCD', ['wikidata']);
    await flush();
    session.more('wikidata');
    await flush();
    expect(session.getSnapshot().sources[0]).toMatchObject({
      status: 'error',
      records: [discoveryFixture.record],
      requestOffset: 5,
    });
    session.retry('wikidata');
    await flush();
    expect(fetcher.mock.calls[2]?.[2]).toBe(5);
    expect(session.getSnapshot().sources[0]?.records).toHaveLength(1);
  });
  it('honors a bounded rate-limit cooldown without blocking the other provider or looping', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new CatalogRequestError('Slow down', 'rate-limited', 1))
      .mockResolvedValue(page('freetogame'));
    const session = new CatalogSearchSession(fetcher);
    session.start('KCD', 'KCD', ['wikidata']);
    await flush();
    session.retry('wikidata');
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    session.retry('freetogame');
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    session.retry('wikidata');
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('cancels all work on scope opt-out and never runs implicit retries', async () => {
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => undefined));
    const session = new CatalogSearchSession(fetcher);
    session.start('KCD', 'KCD', ['wikidata', 'freetogame']);
    session.cancel();
    expect(fetcher.mock.calls.every((call) => (call[3] as AbortSignal).aborted)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
