import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdmission } from '../../api/_lib/admission';

type GetCatalogPage = typeof import('../../api/catalog').getCatalogPage;
const EMPTY_SEARCH = { query: { search: [], searchinfo: { totalhits: 0 } } };
const FREE_GAME = { id: 540, title: 'Admission Test Game', freetogame_profile_url: 'https://www.freetogame.com/admission-test-game', genre: 'Shooter', developer: 'Studio', release_date: '2020-01-02' };

function json(data: unknown, type = 'application/json; charset=utf-8') {
  return new Response(JSON.stringify(data), { headers: { 'content-type': type } });
}

interface Held { resolve: (response: Response) => void; signal: AbortSignal }
function holdingFetch() {
  const held: Held[] = [];
  const upstream = vi.fn((_url: URL, options: RequestInit) => new Promise<Response>((resolve, reject) => {
    const signal = options.signal!;
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    held.push({ resolve, signal });
  }));
  return { held, upstream };
}

async function settle() {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

let getCatalogPage: GetCatalogPage;
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  ({ getCatalogPage } = await import('../../api/catalog'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const signal = () => new AbortController().signal;
const busy = { status: 429, code: 'rate-limited', retryAfter: 15, message: expect.stringContaining('busy') };

describe('bounded admission helper', () => {
  it('refuses the first request over the active or window limit and rolls the window over', () => {
    let time = 1_000;
    const admission = createAdmission({ maxActive: 2, maxPerWindow: 3, windowMs: 100 }, () => time);
    const first = admission.acquire();
    const second = admission.acquire();
    expect(first).toBeTypeOf('function');
    expect(second).toBeTypeOf('function');
    expect(admission.acquire()).toBeNull();
    first!();
    first!();
    const third = admission.acquire();
    expect(third).toBeTypeOf('function');
    second!(); third!();
    expect(admission.acquire()).toBeNull();
    time += 99;
    expect(admission.acquire()).toBeNull();
    time += 1;
    expect(admission.acquire()).toBeTypeOf('function');
  });
  it('starts a new window when the clock moves backwards', () => {
    let time = 5_000;
    const admission = createAdmission({ maxActive: 5, maxPerWindow: 1, windowMs: 100 }, () => time);
    admission.acquire()!();
    expect(admission.acquire()).toBeNull();
    time = 10;
    expect(admission.acquire()).toBeTypeOf('function');
  });
});

describe('catalog search admission', () => {
  it('refuses the seventh concurrent search, then releases slots after abort and after upstream failure', async () => {
    const { held, upstream } = holdingFetch();
    vi.stubGlobal('fetch', upstream);
    const controllers = Array.from({ length: 6 }, () => new AbortController());
    const pending = controllers.map((controller, index) => getCatalogPage('wikidata', `Held ${index}`, 0, controller.signal));
    await settle();
    expect(held).toHaveLength(6);
    await expect(getCatalogPage('wikidata', 'Refused', 0, signal())).rejects.toMatchObject(busy);
    expect(upstream).toHaveBeenCalledTimes(6);

    controllers[0]!.abort(new Error('client left'));
    await expect(pending[0]).rejects.toThrow('client left');
    const afterAbort = getCatalogPage('wikidata', 'After abort', 0, signal());
    await settle();
    expect(held).toHaveLength(7);
    await expect(getCatalogPage('wikidata', 'Still full', 0, signal())).rejects.toMatchObject(busy);

    held[1]!.resolve(new Response('{}', { status: 503 }));
    await expect(pending[1]).rejects.toMatchObject({ status: 503 });
    const afterFailure = getCatalogPage('wikidata', 'After failure', 0, signal());
    await settle();
    expect(held).toHaveLength(8);

    for (const entry of held.slice(2)) entry.resolve(json(EMPTY_SEARCH));
    await expect(afterAbort).resolves.toMatchObject({ items: [] });
    await expect(afterFailure).resolves.toMatchObject({ items: [] });
    await Promise.all(pending.slice(2));
  });
  it('refuses the ninety-first search in a window and admits again after rollover', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(EMPTY_SEARCH)));
    for (let index = 0; index < 90; index += 1) await getCatalogPage('wikidata', `Window ${index}`, 0, signal());
    await expect(getCatalogPage('wikidata', 'Window refused', 0, signal())).rejects.toMatchObject(busy);
    vi.setSystemTime(Date.now() + 59_999);
    await expect(getCatalogPage('wikidata', 'Window still refused', 0, signal())).rejects.toMatchObject(busy);
    vi.setSystemTime(Date.now() + 1);
    await expect(getCatalogPage('wikidata', 'Window rolled over', 0, signal())).resolves.toMatchObject({ items: [] });
  });
  it('rejects a search upstream that is not JSON before reading it', async () => {
    const cancel = vi.fn(async () => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'text/html' } })));
    await expect(getCatalogPage('wikidata', 'Markup', 0, signal())).rejects.toMatchObject({ status: 502, code: 'invalid' });
    expect(cancel).toHaveBeenCalledOnce();
    vi.stubGlobal('fetch', vi.fn(async () => json([FREE_GAME], 'text/plain')));
    await expect(getCatalogPage('freetogame', '', 0, signal())).rejects.toMatchObject({ status: 502, code: 'invalid' });
  });
});

describe('FreeToGame cold-cache coalescing', () => {
  it('shares one upstream fill across concurrent searches and lets one waiter leave without cancelling it', async () => {
    const { held, upstream } = holdingFetch();
    vi.stubGlobal('fetch', upstream);
    const leaving = new AbortController();
    const first = getCatalogPage('freetogame', 'Admission', 0, signal());
    const second = getCatalogPage('freetogame', 'Admission', 0, leaving.signal);
    const third = getCatalogPage('freetogame', 'Nothing matches', 0, signal());
    await settle();
    expect(upstream).toHaveBeenCalledOnce();
    leaving.abort(new Error('waiter left'));
    await expect(second).rejects.toThrow('waiter left');
    expect(held[0]!.signal.aborted).toBe(false);
    held[0]!.resolve(json([FREE_GAME]));
    await expect(first).resolves.toMatchObject({ total: 1, items: [expect.objectContaining({ id: 'freetogame:540' })] });
    await expect(third).resolves.toMatchObject({ total: 0, items: [] });
    await expect(getCatalogPage('freetogame', 'Admission', 0, signal())).resolves.toMatchObject({ total: 1 });
    expect(upstream).toHaveBeenCalledOnce();
  });
  it('clears a failed fill and its admission slot so the next search refetches', async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(json([FREE_GAME]));
    vi.stubGlobal('fetch', upstream);
    const [first, second] = [getCatalogPage('freetogame', '', 0, signal()), getCatalogPage('freetogame', '', 0, signal())];
    await expect(first).rejects.toMatchObject({ status: 503 });
    await expect(second).rejects.toMatchObject({ status: 503 });
    await expect(getCatalogPage('freetogame', '', 0, signal())).resolves.toMatchObject({ total: 1 });
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it('holds one search slot for the shared fill', async () => {
    const { held, upstream } = holdingFetch();
    vi.stubGlobal('fetch', upstream);
    const fill = getCatalogPage('freetogame', '', 0, signal());
    const extra = getCatalogPage('freetogame', '', 0, signal());
    const searches = Array.from({ length: 5 }, (_, index) => getCatalogPage('wikidata', `Slot ${index}`, 0, signal()));
    await settle();
    expect(held).toHaveLength(6);
    await expect(getCatalogPage('wikidata', 'Slot refused', 0, signal())).rejects.toMatchObject(busy);
    held[0]!.resolve(json([FREE_GAME]));
    for (const entry of held.slice(1)) entry.resolve(json(EMPTY_SEARCH));
    await Promise.all([fill, extra, ...searches]);
  });
});
