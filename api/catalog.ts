import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LibraryRecord } from '../src/lib/personal-types.ts';
import type { CatalogPage, CatalogSource } from '../src/lib/catalog-types.ts';

const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const FREE_TO_GAME = 'https://www.freetogame.com/api/games';
const USER_AGENT = 'Play100Catalog/2.0 (https://play-100-collection.vercel.app; public game metadata lookup)';
const UPSTREAM_LIMIT = 4 * 1024 * 1024;
const WIKI_PAGE_SIZE = 5;
const FREE_PAGE_SIZE = 20;
type JsonObject = Record<string, unknown>;

export class CatalogError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function upstreamJson(url: URL | string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal, redirect: 'error' });
  if (response.status === 429) throw new CatalogError('This catalog is rate-limiting requests. Please wait a minute and try again.', 503);
  if (!response.ok) throw new CatalogError(`The source catalog is unavailable (${response.status}). Try again later or add a game manually.`, 503);
  if (!response.body) throw new CatalogError('The catalog returned no data.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > UPSTREAM_LIMIT) {
        await reader.cancel();
        throw new CatalogError('The source response was too large to import safely. Try a more specific search.');
      }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
  let data: unknown;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new CatalogError('The source returned something other than readable catalog data.'); }
  const sourceError = object(object(data)?.error);
  if (sourceError) throw new CatalogError('Wikidata is temporarily busy or rejected the request. Please try again later.', 503);
  return data;
}

function wikiUrl(parameters: Record<string, string>): URL {
  const url = new URL(WIKIDATA);
  const params = { format: 'json', maxlag: '5', maxage: '300', smaxage: '300', ...parameters };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

function statements(entity: JsonObject, property: string): JsonObject[] {
  const values = object(entity.claims)?.[property];
  return Array.isArray(values) ? values.flatMap((value) => {
    const statement = object(value);
    return statement && statement.rank !== 'deprecated' ? [statement] : [];
  }) : [];
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
  return years.length && new Set(years).size === 1 ? years[0] ?? null : null;
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
  const found = object(await upstreamJson(wikiUrl({
    action: 'query', list: 'search', srsearch: search, srnamespace: '0',
    srlimit: String(WIKI_PAGE_SIZE), sroffset: String(offset), srprop: '',
  }), signal));
  const searchResult = object(found?.query);
  const hits = searchResult?.search;
  const total = object(searchResult?.searchinfo)?.totalhits;
  if (!Array.isArray(hits) || typeof total !== 'number' || !Number.isSafeInteger(total)) throw new CatalogError('Wikidata returned an unexpected search format.');
  const ids = hits.flatMap((hit) => {
    const id = object(hit)?.title;
    return typeof id === 'string' && /^Q\d+$/.test(id) ? [id] : [];
  });
  const continuation = object(found?.continue)?.sroffset;
  const nextOffset = typeof continuation === 'number' && continuation > offset && continuation <= 10000 ? continuation : null;
  if (!ids.length) return { source: 'wikidata', query, items: [], total, offset, nextOffset, notices: [] };
  const response = object(await upstreamJson(wikiUrl({
    action: 'wbgetentities', ids: ids.join('|'), props: 'labels|claims',
    languages: 'en|mul', languagefallback: '1',
  }), signal));
  const entities = object(response?.entities);
  if (!entities) throw new CatalogError('Wikidata could not supply the matching game records.');
  const validated = ids.flatMap((id) => {
    const entity = object(entities[id]);
    const title = label(entity);
    return entity && title && title.length <= 200 && relatedIds(entity, 'P31').includes('Q7889') ? [{ id, title, entity }] : [];
  });
  const related = [...new Set(validated.flatMap(({ entity }) => [...relatedIds(entity, 'P178'), ...relatedIds(entity, 'P136')]))].slice(0, 50);
  let names: JsonObject = {};
  if (related.length) {
    const labels = object(await upstreamJson(wikiUrl({ action: 'wbgetentities', ids: related.join('|'), props: 'labels', languages: 'en|mul', languagefallback: '1' }), signal));
    const labelEntities = object(labels?.entities);
    if (!labelEntities) throw new CatalogError('Wikidata could not resolve studio and genre labels.');
    names = labelEntities;
  }
  const items: LibraryRecord[] = validated.map(({ id, title, entity }) => ({
    id: `wikidata:${id}`, title, year: sourceYear(entity),
    studio: joinedLabels(relatedIds(entity, 'P178'), names),
    genre: joinedLabels(relatedIds(entity, 'P136'), names),
    source: 'wikidata', sourceId: id, sourceUrl: `https://www.wikidata.org/wiki/${id}`, collectionRank: null,
  }));
  return {
    source: 'wikidata', query, items, total, offset, nextOffset,
    notices: [
      'Wikidata structured data is CC0. This search includes entries explicitly classified as video games; it is not an exhaustive census.',
      'The year is shown only when source date claims yield one unambiguous year. Preferred source dates take precedence.',
      ...(validated.length < ids.length ? ['Some search hits lacked a usable title or current video-game classification and were not imported.'] : []),
    ],
  };
}

let freeCatalog: { expires: number; records: LibraryRecord[] } | null = null;

async function freeToGamePage(query: string, offset: number, signal: AbortSignal): Promise<CatalogPage> {
  if (!freeCatalog || freeCatalog.expires < Date.now()) {
    const payload = await upstreamJson(FREE_TO_GAME, signal);
    if (!Array.isArray(payload)) throw new CatalogError('FreeToGame returned an unexpected catalog format.');
    const records = payload.flatMap((value): LibraryRecord[] => {
      const item = object(value);
      const title = text(item?.title);
      if (!item || !Number.isSafeInteger(item.id) || Number(item.id) < 1 || !title || title.length > 200) return [];
      const profile = text(item.freetogame_profile_url);
      if (!profile) return [];
      let sourceUrl: URL;
      try { sourceUrl = new URL(profile); } catch { return []; }
      if (sourceUrl.protocol !== 'https:' || !['www.freetogame.com', 'freetogame.com'].includes(sourceUrl.hostname) || sourceUrl.username || sourceUrl.password) return [];
      const year = Number(/^(\d{4})-\d{2}-\d{2}$/.exec(text(item.release_date) ?? '')?.[1]);
      return [{
        id: `freetogame:${item.id}`, title, year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null,
        studio: text(item.developer)?.slice(0, 200) ?? null, genre: text(item.genre)?.slice(0, 200) ?? null,
        source: 'freetogame', sourceId: String(item.id), sourceUrl: sourceUrl.href, collectionRank: null,
      }];
    });
    if (payload.length && !records.length) throw new CatalogError('FreeToGame did not return usable game records.');
    freeCatalog = { expires: Date.now() + 10 * 60_000, records };
  }
  const terms = query.toLocaleLowerCase('en').split(/\s+/).filter(Boolean);
  const matches = freeCatalog.records.filter((record) => terms.every((term) => `${record.title} ${record.genre ?? ''} ${record.studio ?? ''}`.toLocaleLowerCase('en').includes(term))).sort((a, b) => a.title.localeCompare(b.title, 'en'));
  return {
    source: 'freetogame', query, items: matches.slice(offset, offset + FREE_PAGE_SIZE), total: matches.length,
    offset, nextOffset: offset + FREE_PAGE_SIZE < matches.length ? offset + FREE_PAGE_SIZE : null,
    notices: ['Game data from FreeToGame.com. This source covers its free-to-play catalog, not every commercial game. No artwork or review scores are copied.'],
  };
}

export async function getCatalogPage(source: CatalogSource, query: string, offset: number, signal: AbortSignal): Promise<CatalogPage> {
  return source === 'wikidata' ? wikidataPage(query, offset, signal) : freeToGamePage(query, offset, signal);
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
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
    (source !== 'wikidata' && source !== 'freetogame') || query.length > 80 || [...query].some((character) => character.charCodeAt(0) < 32) ||
    !/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000 ||
    [...url.searchParams.keys()].some((key) => !['source', 'q', 'offset'].includes(key))
  ) {
    response.writeHead(400).end(JSON.stringify({ error: 'Choose a supported source, a search of up to 80 characters and a valid page offset.' }));
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const page = await getCatalogPage(source, query, offset, controller.signal);
    response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    response.writeHead(200).end(JSON.stringify(page));
  } catch (error: unknown) {
    response.setHeader('Cache-Control', 'no-store');
    const message = controller.signal.aborted ? 'The source took too long to reply. Try again later or add a game manually.' : error instanceof CatalogError ? error.message : 'The public catalog could not be reached. Please try again later.';
    response.writeHead(error instanceof CatalogError ? error.status : 503).end(JSON.stringify({ error: message }));
  } finally { clearTimeout(timeout); }
}
