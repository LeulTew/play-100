import { ENRICHMENT_LIMITS, parseReportedScore, publicHttpsUrl } from '../../src/lib/catalog-enrichment.js';
import type { CatalogExternalRating } from '../../src/lib/catalog-enrichment.ts';
import { hasAsciiControl } from '../../src/lib/text-controls.js';

type JsonObject = Record<string, unknown>;
export function jsonObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}
function snakValue(value: unknown): unknown {
  const snak = jsonObject(value);
  return snak?.snaktype === 'value' ? jsonObject(snak.datavalue)?.value : undefined;
}
function statements(entity: JsonObject, property: string): JsonObject[] {
  const values = jsonObject(entity.claims)?.[property];
  return Array.isArray(values) ? values.flatMap(value => {
    const statement = jsonObject(value);
    return statement && (statement.rank === 'normal' || statement.rank === 'preferred') ? [statement] : [];
  }) : [];
}
function values(statement: JsonObject, property: string): unknown[] {
  const list = jsonObject(statement.qualifiers)?.[property];
  return Array.isArray(list) ? list.map(snakValue) : [];
}
function entityIds(values: unknown[]): string[] {
  return [...new Set(values.flatMap(value => {
    const id = jsonObject(value)?.id;
    return typeof id === 'string' && /^Q[1-9]\d{0,14}$/.test(id) ? [id] : [];
  }))];
}
function boundedText(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() && value.length <= max && !hasAsciiControl(value) ? value.trim() : null;
}
function claimDate(value: unknown): string | null {
  const time = jsonObject(value);
  if (!time || typeof time.time !== 'string' || typeof time.precision !== 'number' || time.precision < 9 ||
    time.calendarmodel !== 'http://www.wikidata.org/entity/Q1985727') return null;
  const match = /^\+(\d{4})-(\d{2})-(\d{2})T00:00:00Z$/.exec(time.time);
  if (!match) return null;
  const year = match[1]!;
  const month = time.precision >= 10 ? match[2]! : '01';
  const day = time.precision >= 11 ? match[3]! : '01';
  const full = `${year}-${month}-${day}`;
  const parsed = Date.parse(`${full}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== full) return null;
  return time.precision >= 11 ? full : time.precision === 10 ? `${year}-${month}` : year;
}
function entityLabel(entities: JsonObject, id: string): string {
  const labels = jsonObject(jsonObject(entities[id])?.labels);
  return boundedText(jsonObject(labels?.en)?.value, 200) ?? boundedText(jsonObject(labels?.mul)?.value, 200) ?? id;
}
function references(statement: JsonObject) {
  const refs = Array.isArray(statement.references) ? statement.references : [];
  const grouped = refs.flatMap(ref => {
    const snaks = jsonObject(jsonObject(ref)?.snaks);
    if (!snaks) return [];
    const urls = Array.isArray(snaks.P854) ? snaks.P854.map(snakValue).flatMap(value => publicHttpsUrl(value) ?? []) : [];
    const dates = [...new Set(Array.isArray(snaks.P813) ? snaks.P813.map(snakValue).flatMap(value => claimDate(value) ?? []) : [])];
    return [{ url: urls[0] ?? null, date: dates.length === 1 ? dates[0]! : null }];
  });
  return grouped.find(ref => ref.url !== null) ?? grouped.find(ref => ref.date !== null) ?? { url: null, date: null };
}

export function publicGameEntity(payload: unknown, id: string): JsonObject | null {
  const entity = jsonObject(jsonObject(jsonObject(payload)?.entities)?.[id]);
  if (!entity || entity.id !== id || Object.hasOwn(entity, 'missing') || Object.hasOwn(entity, 'redirect')) return null;
  const types = entityIds(statements(entity, 'P31').map(statement => snakValue(statement.mainsnak)));
  return types.includes('Q7889') ? entity : null;
}

export function reviewLabelIds(entity: JsonObject): string[] {
  return [...new Set(statements(entity, 'P444').slice(0, ENRICHMENT_LIMITS.ratings).flatMap(statement =>
    ['P447', 'P400', 'P459'].flatMap(property => entityIds(values(statement, property))),
  ))].slice(0, 50);
}

export function wikidataRatings(entity: JsonObject, entities: unknown, fetchedAt: string): CatalogExternalRating[] {
  const labels = jsonObject(entities) ?? {};
  const gameId = boundedText(entity.id, 20);
  if (!gameId || !/^Q[1-9]\d{0,14}$/.test(gameId)) return [];
  const result = statements(entity, 'P444').flatMap((statement, index): CatalogExternalRating[] => {
    const raw = boundedText(snakValue(statement.mainsnak), 80);
    const score = raw && parseReportedScore(raw);
    const publishers = entityIds(values(statement, 'P447'));
    const platforms = entityIds(values(statement, 'P400'));
    const methods = entityIds(values(statement, 'P459'));
    if (!score || publishers.length !== 1 || platforms.length > ENRICHMENT_LIMITS.platforms || methods.length > 1) return [];
    const publisherId = publishers[0]!;
    const dates = values(statement, 'P585').flatMap(value => claimDate(value) ?? []);
    const countValues = values(statement, 'P7887').flatMap(value => {
      const amount = jsonObject(value)?.amount;
      if (typeof amount !== 'string' || !/^\+\d+$/.test(amount)) return [];
      const count = Number(amount);
      return Number.isSafeInteger(count) && count <= 1_000_000_000 ? [count] : [];
    });
    const statementId = boundedText(statement.id, 120);
    const reference = references(statement);
    return [{
      id: `wikidata:${statementId ?? `${gameId}-${index}`}`, source: 'wikidata', kind: 'review-score',
      publisher: entityLabel(labels, publisherId), publisherId, score,
      platforms: platforms.map(id => entityLabel(labels, id)), method: methods[0] ? entityLabel(labels, methods[0]) : null,
      count: countValues.length === 1 ? countValues[0]! : null,
      asOf: dates.length === 1 ? dates[0]! : null, referenceDate: reference.date, retrievedAt: fetchedAt,
      sourceUrl: `https://www.wikidata.org/wiki/${gameId}#P444`, referenceUrl: reference.url,
    }];
  });
  const unique = new Map(result.map(rating => [
    JSON.stringify([rating.publisherId, rating.platforms, rating.method, rating.score, rating.asOf]),
    rating,
  ]));
  return [...unique.values()].slice(0, ENRICHMENT_LIMITS.ratings);
}

export function exactSteamApp(entity: JsonObject): { id: string | null; ambiguous: boolean } {
  const all = statements(entity, 'P1733');
  const preferred = all.filter(statement => statement.rank === 'preferred');
  const ids = [...new Set((preferred.length ? preferred : all).flatMap(statement => {
    const value = snakValue(statement.mainsnak);
    return typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value) ? [value] : [];
  }))];
  return { id: ids.length === 1 ? ids[0]! : null, ambiguous: ids.length > 1 };
}

export function commonsFile(entity: JsonObject): string | null {
  for (const property of ['P154', 'P18']) {
    const all = statements(entity, property);
    const preferred = all.filter(statement => statement.rank === 'preferred');
    const files = [...new Set((preferred.length ? preferred : all).flatMap(statement => {
      const file = boundedText(snakValue(statement.mainsnak), 240);
      return file && !/[#|<>\\]/.test(file) && /\.(?:svg|png|jpe?g|webp)$/i.test(file) ? [file] : [];
    }))];
    if (files.length === 1) return files[0]!;
    if (files.length > 1) return null;
  }
  return null;
}

export function steamRating(payload: unknown, appId: string, fetchedAt: string): CatalogExternalRating | null {
  const root = jsonObject(payload);
  const summary = jsonObject(root?.query_summary);
  if (root?.success !== 1 || !summary) throw new Error('Steam returned no usable review summary.');
  const { total_positive: positive, total_negative: negative, total_reviews: total } = summary;
  if (typeof positive !== 'number' || typeof negative !== 'number' || typeof total !== 'number' ||
    ![positive, negative, total].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000) ||
    positive + negative !== total) throw new Error('Steam returned inconsistent review counts.');
  if (total === 0) return null;
  const value = Math.round(positive / total * 1000) / 10;
  return {
    id: `steam:${appId}`, source: 'steam', kind: 'user-recommendations', publisher: 'Steam', publisherId: null,
    score: { text: `${value}%`, value, scale: 100, unit: 'percent' }, platforms: ['Steam'],
    method: 'Steam purchases; all languages; off-topic activity excluded',
    count: total, asOf: null, referenceDate: null, retrievedAt: fetchedAt, sourceUrl: `https://store.steampowered.com/app/${appId}/#app_reviews_hash`, referenceUrl: null,
  };
}
