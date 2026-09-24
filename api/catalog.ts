import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LibraryRecord } from '../src/lib/personal-types.ts';
import type { CatalogPage, CatalogSource } from '../src/lib/catalog-types.ts';
import { matchesCatalogQuery } from '../src/lib/catalog-query.js';
import { createAdmission } from './_lib/admission.js';
import { CatalogError, upstreamJson } from './_lib/public-http.js';
export { CatalogError } from './_lib/public-http.js';

const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const FREE_TO_GAME = 'https://www.freetogame.com/api/games';
const WIKI_PAGE_SIZE = 5;
const FREE_PAGE_SIZE = 20;
const JSON_OPTIONS = { contentTypes: ['application/json'] };
// Per-instance: a searched Wikidata page or one cold FreeToGame fill holds a slot. The WAF rule is the global limit.
const admission = createAdmission({ maxActive: 6, maxPerWindow: 90, windowMs: 60_000 });
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function wikiUrl(parameters: Record<string, string>): URL {
  const url = new URL(WIKIDATA);
  const params = { format: 'json', maxlag: '5', maxage: '300', smaxage: '300', ...parameters };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

function statements(entity: JsonObject, property: string): JsonObject[] {
  const values = object(entity.claims)?.[property];
  return Array.isArray(values)
    ? values.flatMap((value) => {
        const statement = object(value);
        return statement && statement.rank !== 'deprecated' ? [statement] : [];
      })
    : [];
}

function statementValue(statement: JsonObject): unknown {
  const snak = object(statement.mainsnak);
  return snak?.snaktype === 'value' ? object(snak.datavalue)?.value : undefined;
}

function relatedIds(entity: JsonObject, property: string): string[] {
  return statements(entity, property).flatMap((statement) => {
    const id = object(statementValue(statement))?.id;
    return typeof id === 'string' && /^Q\d+$/.test(id) ? [id] : [];
  });
}

function label(entity: JsonObject | null): string | null {
  const labels = object(entity?.labels);
  return text(object(labels?.en)?.value) ?? text(object(labels?.mul)?.value);
}

function sourceYear(entity: JsonObject): number | null {
  const entries = statements(entity, 'P577');
  const preferred = entries.filter((entry) => entry.rank === 'preferred');
  const years = (preferred.length ? preferred : entries).flatMap((entry) => {
    const value = object(statementValue(entry));
    const time = text(value?.time);
    if (!time || typeof value?.precision !== 'number' || value.precision < 9) return [];
    const year = Number(/^\+(\d{4})-/.exec(time)?.[1]);
    return Number.isInteger(year) && year >= 1900 && year <= 2100 ? [year] : [];
  });
  return years.length && new Set(years).size === 1 ? (years[0] ?? null) : null;
}

function joinedLabels(ids: string[], entities: JsonObject): string | null {
  const labels = [...new Set(ids.flatMap((id) => label(object(entities[id])) ?? []))];
  if (!labels.length) return null;
  const joined = labels.join(' / ');
  if (joined.length <= 200) return joined;
  const selected: string[] = [];
  for (const value of labels) {
    if ([...selected, value].join(' / ').length > 190) break;
    selected.push(value);
  }
  return selected.length ? `${selected.join(' / ')} + more` : null;
}

async function wikidataPage(query: string, offset: number, signal: AbortSignal): Promise<CatalogPage> {
  const escaped = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const search = escaped ? `"${escaped}" haswbstatement:P31=Q7889` : 'haswbstatement:P31=Q7889';
  const found = object(
    await upstreamJson(
      wikiUrl({
        action: 'query',
        list: 'search',
        srsearch: search,
        srnamespace: '0',
        srlimit: String(WIKI_PAGE_SIZE),
        sroffset: String(offset),
        srprop: '',
      }),
      signal,
      JSON_OPTIONS,
    ),
  );
  const searchResult = object(found?.query);
  const hits = searchResult?.search;
  const total = object(searchResult?.searchinfo)?.totalhits;
  if (!Array.isArray(hits) || typeof total !== 'number' || !Number.isSafeInteger(total))
    throw new CatalogError('Wikidata returned an unexpected search format.');
  const ids = hits.flatMap((hit) => {
    const id = object(hit)?.title;
    return typeof id === 'string' && /^Q\d+$/.test(id) ? [id] : [];
  });
  const continuation = object(found?.continue)?.sroffset;
  const nextOffset =
    typeof continuation === 'number' && continuation > offset && continuation <= 10000 ? continuation : null;
  if (!ids.length) return { source: 'wikidata', query, items: [], total, offset, nextOffset, notices: [] };
  const response = object(
    await upstreamJson(
      wikiUrl({
        action: 'wbgetentities',
        ids: ids.join('|'),
        props: 'labels|claims',
        languages: 'en|mul',
        languagefallback: '1',
      }),
      signal,
      JSON_OPTIONS,
    ),
  );
  const entities = object(response?.entities);
  if (!entities) throw new CatalogError('Wikidata could not supply the matching game records.');
  const validated = ids.flatMap((id) => {
    const entity = object(entities[id]);
    const title = label(entity);
    return entity && title && title.length <= 200 && relatedIds(entity, 'P31').includes('Q7889')
      ? [{ id, title, entity }]
      : [];
  });
  const related = [
    ...new Set(validated.flatMap(({ entity }) => [...relatedIds(entity, 'P178'), ...relatedIds(entity, 'P136')])),
  ].slice(0, 50);
  let names: JsonObject = {};
  if (related.length) {
    const labels = object(
      await upstreamJson(
        wikiUrl({
          action: 'wbgetentities',
          ids: related.join('|'),
          props: 'labels',
          languages: 'en|mul',
          languagefallback: '1',
        }),
        signal,
        JSON_OPTIONS,
      ),
    );
    const labelEntities = object(labels?.entities);
    if (!labelEntities) throw new CatalogError('Wikidata could not resolve studio and genre labels.');
    names = labelEntities;
  }
  const items: LibraryRecord[] = validated.map(({ id, title, entity }) => ({
    id: `wikidata:${id}`,
    title,
    year: sourceYear(entity),
    studio: joinedLabels(relatedIds(entity, 'P178'), names),
    genre: joinedLabels(relatedIds(entity, 'P136'), names),
    source: 'wikidata',
    sourceId: id,
    sourceUrl: `https://www.wikidata.org/wiki/${id}`,
    collectionRank: null,
  }));
  return {
    source: 'wikidata',
    query,
    items,
    total,
    offset,
    nextOffset,
    notices: [
      'Wikidata structured data is CC0. This search includes entries explicitly classified as video games; it is not an exhaustive census.',
      'The year is shown only when source date claims yield one unambiguous year. Preferred source dates take precedence.',
      ...(validated.length < ids.length
        ? ['Some search hits lacked a usable title or current video-game classification and were not imported.']
        : []),
    ],
  };
}

let freeCatalog: { expires: number; records: LibraryRecord[] } | null = null;
let freeCatalogFill: Promise<LibraryRecord[]> | null = null;
// The shared fill is not tied to any one caller; publicBytes' own timeout bounds it.
const UNCANCELLED = new AbortController().signal;

function admit(): () => void {
  const release = admission.acquire();
  if (!release)
    throw new CatalogError('Public catalog searches are busy. Please wait before retrying.', 429, 'rate-limited', 15);
  return release;
}

function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

async function fillFreeCatalog(): Promise<LibraryRecord[]> {
  const payload = await upstreamJson(FREE_TO_GAME, UNCANCELLED, JSON_OPTIONS);
  if (!Array.isArray(payload)) throw new CatalogError('FreeToGame returned an unexpected catalog format.');
  const records = payload.flatMap((value): LibraryRecord[] => {
    const item = object(value);
    const title = text(item?.title);
    if (!item || !Number.isSafeInteger(item.id) || Number(item.id) < 1 || !title || title.length > 200) return [];
    const profile = text(item.freetogame_profile_url);
    if (!profile) return [];
    let sourceUrl: URL;
    try {
      sourceUrl = new URL(profile);
    } catch {
      return [];
    }
    if (
      sourceUrl.protocol !== 'https:' ||
      !['www.freetogame.com', 'freetogame.com'].includes(sourceUrl.hostname) ||
      sourceUrl.username ||
      sourceUrl.password
    )
      return [];
    const year = Number(/^(\d{4})-\d{2}-\d{2}$/.exec(text(item.release_date) ?? '')?.[1]);
    return [
      {
        id: `freetogame:${item.id}`,
        title,
        year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null,
        studio: text(item.developer)?.slice(0, 200) ?? null,
        genre: text(item.genre)?.slice(0, 200) ?? null,
        source: 'freetogame',
        sourceId: String(item.id),
        sourceUrl: sourceUrl.href,
        collectionRank: null,
      },
    ];
  });
  if (payload.length && !records.length) throw new CatalogError('FreeToGame did not return usable game records.');
  freeCatalog = { expires: Date.now() + 10 * 60_000, records };
  return records;
}

async function freeToGamePage(query: string, offset: number, signal: AbortSignal): Promise<CatalogPage> {
  signal.throwIfAborted();
  let records = freeCatalog && freeCatalog.expires >= Date.now() ? freeCatalog.records : null;
  if (!records) {
    // Concurrent cold requests share one upstream fill; a caller that disconnects stops waiting without cancelling it.
    if (!freeCatalogFill) {
      const release = admit();
      freeCatalogFill = fillFreeCatalog().finally(() => {
        release();
        freeCatalogFill = null;
      });
    }
    records = await untilAborted(freeCatalogFill, signal);
  }
  const matches = records
    .filter((record) => matchesCatalogQuery(`${record.title} ${record.genre ?? ''} ${record.studio ?? ''}`, query))
    .sort((a, b) => a.title.localeCompare(b.title, 'en'));
  return {
    source: 'freetogame',
    query,
    items: matches.slice(offset, offset + FREE_PAGE_SIZE),
    total: matches.length,
    offset,
    nextOffset: offset + FREE_PAGE_SIZE < matches.length ? offset + FREE_PAGE_SIZE : null,
    notices: [
      'Game data from FreeToGame.com. This source covers its free-to-play catalog, not every commercial game. No artwork or review scores are copied.',
    ],
  };
}

export async function getCatalogPage(
  source: CatalogSource,
  query: string,
  offset: number,
  signal: AbortSignal,
): Promise<CatalogPage> {
  if (source === 'freetogame') return freeToGamePage(query, offset, signal);
  const release = admit();
  try {
    return await wikidataPage(query, offset, signal);
  } finally {
    release();
  }
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.writeHead(405).end(JSON.stringify({ error: 'Only catalog lookup GET requests are supported.' }));
    return;
  }
  const url = new URL(request.url ?? '/', 'https://play-100-collection.vercel.app');
  const source = url.searchParams.get('source') ?? 'wikidata';
  const query = (url.searchParams.get('q') ?? '').trim();
  const rawOffset = url.searchParams.get('offset') ?? '0';
  const offset = Number(rawOffset);
  if (
    (source !== 'wikidata' && source !== 'freetogame') ||
    query.length > 80 ||
    [...query].some((character) => character.charCodeAt(0) < 32) ||
    !/^\d+$/.test(rawOffset) ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 10000 ||
    [...url.searchParams.keys()].some(
      (key) => !['source', 'q', 'offset'].includes(key) || url.searchParams.getAll(key).length !== 1,
    )
  ) {
    response.writeHead(400).end(
      JSON.stringify({
        error: 'Choose a supported source, a search of up to 80 characters and a valid page offset.',
      }),
    );
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  // A superseded client search closes its request; stop the upstream work it no longer needs.
  const disconnect = () => {
    if (!response.writableEnded) controller.abort();
  };
  request.once('aborted', disconnect);
  response.once('close', disconnect);
  try {
    const page = await getCatalogPage(source, query, offset, controller.signal);
    if (response.destroyed) return;
    response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    response.writeHead(200).end(JSON.stringify(page));
  } catch (error: unknown) {
    if (response.destroyed) return;
    const message = controller.signal.aborted
      ? 'The source took too long to reply. Try again later or add a game manually.'
      : error instanceof CatalogError
        ? error.message
        : 'The public catalog could not be reached. Please try again later.';
    if (error instanceof CatalogError && error.retryAfter) response.setHeader('Retry-After', error.retryAfter);
    response.writeHead(controller.signal.aborted ? 504 : error instanceof CatalogError ? error.status : 503).end(
      JSON.stringify({
        error: message,
        code: controller.signal.aborted ? 'timeout' : error instanceof CatalogError ? error.code : 'unavailable',
      }),
    );
  } finally {
    clearTimeout(timeout);
    request.removeListener('aborted', disconnect);
    response.removeListener('close', disconnect);
  }
}
