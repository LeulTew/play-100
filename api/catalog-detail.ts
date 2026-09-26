import type { IncomingMessage, ServerResponse } from 'node:http';
import { canonicalCatalogId } from '../src/lib/catalog-identity.js';
import {
  enrichmentIdentity,
  ENRICHMENT_LIMITS,
  parseCatalogEnrichment,
  parseExternalCatalogArtwork,
} from '../src/lib/catalog-enrichment.js';
import type { CatalogEnrichment, EnrichmentSource, EnrichmentSourceState } from '../src/lib/catalog-enrichment.ts';
import { hasKnownDiscoveryArtwork } from '../src/lib/discovery-artwork-presence.js';
import {
  commonsFile,
  exactSteamApp,
  jsonObject,
  publicGameEntity,
  reviewLabelIds,
  steamRating,
  wikidataRatings,
} from './_lib/catalog-detail-data.js';
import { commonsRasterPermission, fetchCommonsRaster } from './_lib/commons-raster.js';
import { createAdmission } from './_lib/admission.js';
import { CatalogError, upstreamJson } from './_lib/public-http.js';

const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const JSON_OPTIONS = { maxBytes: 768 * 1024, timeoutMs: 3500, contentTypes: ['application/json'] };
const cache = new Map<string, { expires: number; value: CatalogEnrichment }>();
const cooldown = new Map<EnrichmentSource, number>();
const admission = createAdmission({ maxActive: 4, maxPerWindow: 30, windowMs: 60_000 });
// A cold lookup shared by every concurrent caller of the same ID. Each entry holds one admission slot, so the map
// never exceeds `maxActive`; it is removed after either outcome and a failure is never cached.
interface SharedLookup {
  work: Promise<CatalogEnrichment>;
  controller: AbortController;
  waiters: number;
}
const inflight = new Map<string, SharedLookup>();
const SHARED_DEADLINE_MS = 8500;

function sourceState(
  source: EnrichmentSource,
  status: EnrichmentSourceState['status'],
  message: string,
  code: EnrichmentSourceState['code'] = null,
  retryAfter = 0,
): EnrichmentSourceState {
  return { source, status, message, code, retryAfter };
}
function wikiUrl(base: string, parameters: Record<string, string>): URL {
  const url = new URL(base);
  url.search = new URLSearchParams({ format: 'json', ...parameters }).toString();
  return url;
}
async function provider<T>(
  source: EnrichmentSource,
  work: () => Promise<T>,
): Promise<{ value: T; error: null } | { value: null; error: EnrichmentSourceState }> {
  const remaining = Math.ceil(((cooldown.get(source) ?? 0) - Date.now()) / 1000);
  if (remaining > 0)
    return {
      value: null,
      error: sourceState(
        source,
        'error',
        'This source is rate-limiting requests. Try again after the indicated delay.',
        'rate-limited',
        remaining,
      ),
    };
  try {
    return { value: await work(), error: null };
  } catch (error) {
    const code =
      error instanceof CatalogError && ['rate-limited', 'timeout', 'invalid', 'unsupported'].includes(error.code)
        ? error.code
        : 'unavailable';
    const retryAfter = error instanceof CatalogError ? Math.min(300, error.retryAfter) : 0;
    if (code === 'rate-limited') cooldown.set(source, Date.now() + Math.max(1, retryAfter) * 1000);
    const failure: EnrichmentSourceState['code'] =
      code === 'rate-limited'
        ? 'rate-limited'
        : code === 'timeout'
          ? 'timeout'
          : code === 'invalid'
            ? 'invalid'
            : code === 'unsupported'
              ? 'unsupported'
              : 'unavailable';
    const message =
      error instanceof CatalogError
        ? error.message
        : 'This public source could not be read. Other available details are unchanged.';
    if (!(error instanceof CatalogError)) console.warn('Public catalog detail source failed.', { source });
    return {
      value: null,
      error: sourceState(source, code === 'unsupported' ? 'unavailable' : 'error', message, failure, retryAfter),
    };
  }
}

export async function getCatalogDetail(id: string, signal: AbortSignal): Promise<CatalogEnrichment> {
  signal.throwIfAborted();
  if (canonicalCatalogId(id) !== id)
    throw new CatalogError('This game is already in The 100. Open its original collection entry.', 409, 'canonical');
  const identity = enrichmentIdentity(id);
  if (!identity)
    throw new CatalogError(
      'Choose an exact public catalog game ID, not a title, private record or URL.',
      400,
      'invalid',
    );
  const cached = cache.get(id);
  if (cached && cached.expires > Date.now()) return cached.value;
  let entry = inflight.get(id);
  if (!entry) {
    const release = admission.acquire();
    if (!release)
      throw new CatalogError('Public detail lookups are busy. Please wait before retrying.', 429, 'rate-limited', 15);
    const controller = new AbortController();
    const deadline = setTimeout(
      () =>
        controller.abort(
          new CatalogError('Public game details took too long to load. Try again later.', 504, 'timeout'),
        ),
      SHARED_DEADLINE_MS,
    );
    const created: SharedLookup = {
      controller,
      waiters: 0,
      work: lookupDetail(id, identity, controller.signal).finally(() => {
        clearTimeout(deadline);
        release();
        if (inflight.get(id) === created) inflight.delete(id);
      }),
    };
    // Waiters handle the outcome; this only keeps a run whose waiters all left from reporting an unhandled rejection.
    created.work.catch(() => undefined);
    inflight.set(id, created);
    entry = created;
  }
  return waitForShared(id, entry, signal);
}

// One caller leaving stops only its own wait; the shared run is cancelled once no caller is waiting for it.
function waitForShared(id: string, entry: SharedLookup, signal: AbortSignal): Promise<CatalogEnrichment> {
  signal.throwIfAborted();
  entry.waiters += 1;
  return new Promise<CatalogEnrichment>((resolve, reject) => {
    let settled = false;
    const leave = () => {
      if (settled) return false;
      settled = true;
      entry.waiters -= 1;
      signal.removeEventListener('abort', onAbort);
      return true;
    };
    const onAbort = () => {
      if (!leave()) return;
      if (entry.waiters === 0) {
        if (inflight.get(id) === entry) inflight.delete(id);
        entry.controller.abort(signal.reason);
      }
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    entry.work.then(
      (value) => {
        if (leave()) resolve(value);
      },
      (error: unknown) => {
        if (leave()) reject(error);
      },
    );
  });
}

async function lookupDetail(
  id: string,
  identity: NonNullable<ReturnType<typeof enrichmentIdentity>>,
  signal: AbortSignal,
): Promise<CatalogEnrichment> {
  const fetchedAt = new Date().toISOString();
  if (identity.source === 'freetogame') {
    return {
      schemaVersion: 1,
      id,
      fetchedAt,
      ratings: [],
      artwork: null,
      sources: [
        sourceState(
          'freetogame',
          'unavailable',
          'FreeToGame does not document review scores or a reusable image grant for this lookup. Its game data and source link remain available.',
          'unsupported',
        ),
      ],
    };
  }
  const entityResult = await provider('wikidata', async () => {
    const payload = await upstreamJson(
      wikiUrl(WIKIDATA, { action: 'wbgetentities', ids: identity.sourceId, props: 'claims' }),
      signal,
      JSON_OPTIONS,
    );
    const entity = publicGameEntity(payload, identity.sourceId);
    if (!entity)
      throw new CatalogError(
        'Wikidata did not return this exact video-game identity. No replacement was chosen.',
        404,
        'invalid',
      );
    return entity;
  });
  signal.throwIfAborted();
  if (entityResult.error)
    return {
      schemaVersion: 1,
      id,
      fetchedAt,
      ratings: [],
      artwork: null,
      sources: [
        entityResult.error,
        sourceState(
          'steam',
          'unavailable',
          'No verified Steam ID is available while the game source is unavailable.',
          'missing',
        ),
        sourceState(
          'commons',
          'unavailable',
          'Existing bundled artwork is unchanged. No new image was verified.',
          'missing',
        ),
      ],
    };
  const entity = entityResult.value;
  const labels = reviewLabelIds(entity);
  const steam = exactSteamApp(entity);
  const file = commonsFile(entity);
  const [names, steamResult, imageResult] = await Promise.all([
    provider('wikidata', async () => {
      if (!labels.length) return {};
      const payload = await upstreamJson(
        wikiUrl(WIKIDATA, { action: 'wbgetentities', ids: labels.join('|'), props: 'labels', languages: 'en|mul' }),
        signal,
        JSON_OPTIONS,
      );
      const entities = jsonObject(jsonObject(payload)?.entities);
      if (!entities) throw new CatalogError('Wikidata issuer or platform names could not be read.', 502, 'invalid');
      return entities;
    }),
    provider('steam', async () => {
      if (!steam.id) return null;
      const url = new URL(`https://store.steampowered.com/appreviews/${steam.id}`);
      url.search = new URLSearchParams({
        json: '1',
        filter: 'all',
        language: 'all',
        day_range: '365',
        cursor: '*',
        review_type: 'all',
        purchase_type: 'steam',
        num_per_page: '1',
        filter_offtopic_activity: '1',
      }).toString();
      const payload = await upstreamJson(url, signal, { ...JSON_OPTIONS, maxBytes: 128 * 1024 });
      return steamRating(payload, steam.id, fetchedAt);
    }),
    provider('commons', async () => {
      if (hasKnownDiscoveryArtwork(id) || !file) return null;
      const payload = await upstreamJson(
        wikiUrl(COMMONS, {
          action: 'query',
          titles: `File:${file}`,
          prop: 'imageinfo',
          iilimit: '1',
          iiprop: 'url|extmetadata|size|mime|thumbmime',
          iiurlwidth: '320',
          iiurlheight: '240',
          iiextmetadatalanguage: 'en',
          iiextmetadatafilter: 'Artist|Credit|Attribution|LicenseShortName|LicenseUrl|Copyrighted|Restrictions',
        }),
        signal,
        { ...JSON_OPTIONS, maxBytes: 128 * 1024 },
      );
      const artwork = await fetchCommonsRaster(commonsRasterPermission(payload, file), signal, fetchedAt);
      return parseExternalCatalogArtwork(artwork);
    }),
  ]);
  signal.throwIfAborted();
  const ratings = wikidataRatings(entity, names.value, fetchedAt).slice(
    0,
    ENRICHMENT_LIMITS.ratings - (steamResult.value ? 1 : 0),
  );
  if (steamResult.value) ratings.push(steamResult.value);
  const sources: EnrichmentSourceState[] = [
    names.error ??
      sourceState(
        'wikidata',
        ratings.some((rating) => rating.source === 'wikidata') ? 'ready' : 'unavailable',
        ratings.some((rating) => rating.source === 'wikidata')
          ? 'Reported review scores from Wikidata; not independently verified or blended.'
          : 'Wikidata supplied no supported score with an unambiguous issuer and scale.',
        ratings.some((rating) => rating.source === 'wikidata') ? null : 'missing',
      ),
    steamResult.error ??
      (steamResult.value
        ? sourceState(
            'steam',
            'ready',
            'Steam user recommendations, not a critic rating. Steam purchases, all languages, off-topic activity excluded.',
          )
        : sourceState(
            'steam',
            'unavailable',
            steam.ambiguous
              ? 'More than one Steam app is listed; no rating was chosen.'
              : steam.id
                ? 'Steam supplied no user recommendations for this query.'
                : 'No unambiguous Steam app ID is listed for this game.',
            steam.ambiguous ? 'ambiguous' : 'missing',
          )),
    imageResult.error ??
      (imageResult.value
        ? sourceState('commons', 'ready', 'A licensed Commons raster was verified; full credit and license are shown.')
        : hasKnownDiscoveryArtwork(id)
          ? sourceState('commons', 'ready', 'The existing licensed bundled artwork is used.')
          : sourceState('commons', 'unavailable', 'No unambiguous reusable Commons image was verified.', 'missing')),
  ];
  const result = parseCatalogEnrichment(
    {
      schemaVersion: 1,
      id,
      fetchedAt,
      ratings: ratings.slice(0, ENRICHMENT_LIMITS.ratings),
      artwork: imageResult.value,
      sources,
    },
    id,
  );
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > ENRICHMENT_LIMITS.responseBytes)
    throw new CatalogError('The public detail response exceeded its size budget.', 502, 'invalid');
  if (!sources.some((source) => source.status === 'error')) {
    cache.delete(id);
    cache.set(id, { expires: Date.now() + 15 * 60_000, value: result });
    while (cache.size > 96) cache.delete(cache.keys().next().value!);
  }
  return result;
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response
      .writeHead(405)
      .end(JSON.stringify({ error: 'Only public game-detail GET requests are supported.', code: 'invalid' }));
    return;
  }
  const url = new URL(request.url ?? '/', 'https://play-100-collection.vercel.app');
  const id = url.searchParams.get('id');
  if (!id || id.length > 40 || url.searchParams.size !== 1 || url.searchParams.getAll('id').length !== 1) {
    response.writeHead(400).end(JSON.stringify({ error: 'Provide one exact public game ID only.', code: 'invalid' }));
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(
    () =>
      controller.abort(new CatalogError('Public game details took too long to load. Try again later.', 504, 'timeout')),
    9000,
  );
  const disconnect = () => {
    if (!response.writableEnded) controller.abort();
  };
  request.once('aborted', disconnect);
  response.once('close', disconnect);
  try {
    const result = await getCatalogDetail(id, controller.signal);
    if (response.destroyed) return;
    controller.signal.throwIfAborted();
    const failed = result.sources.some((source) => source.status === 'error');
    if (!failed) response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900');
    response.writeHead(200).end(JSON.stringify(result));
  } catch (cause) {
    if (response.destroyed) return;
    const error =
      controller.signal.reason instanceof CatalogError
        ? controller.signal.reason
        : cause instanceof CatalogError
          ? cause
          : new CatalogError('Public game details could not be loaded. Your saved data is unchanged.', 503);
    if (error.retryAfter) response.setHeader('Retry-After', error.retryAfter);
    response.writeHead(error.status).end(JSON.stringify({ error: error.message, code: error.code }));
  } finally {
    clearTimeout(timeout);
    request.removeListener('aborted', disconnect);
    response.removeListener('close', disconnect);
  }
}
