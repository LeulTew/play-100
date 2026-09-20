import { COLLECTION_IDENTITIES } from './collection-identities';
import type { CatalogArtwork, DiscoveryItem } from './discovery-catalog';
import type { GameSource, LibraryRecord, PersonalLibraryState } from './personal-types';
import { recordFromGame } from './personal-types';
import type { Game } from './types';

const providerSlugs: ReadonlyMap<string, string> = new Map(COLLECTION_IDENTITIES.map(([slug, id]) => [`wikidata:${id}`, slug]));
const mappedSlugs = new Set<string>(COLLECTION_IDENTITIES.map(([slug]) => slug));
export type CatalogOwnership = ReadonlyMap<string, readonly LibraryRecord[]>;

export interface CatalogSearchItem {
  record: LibraryRecord;
  aliases: readonly string[];
  artwork: CatalogArtwork | null;
  game?: Game;
  sources?: readonly GameSource[];
  searchTerms?: readonly string[];
}

export function collectionGameForId(games: readonly Game[], id: string): Game | undefined {
  const slug = canonicalCatalogId(id);
  return games.find(game => game.slug === slug);
}

export function canonicalCatalogId(id: string): string {
  return providerSlugs.get(id) ?? id;
}

export function catalogOwnership(records: Record<string, LibraryRecord>): CatalogOwnership {
  const owned = new Map<string, LibraryRecord[]>();
  for (const record of Object.values(records)) {
    const id = canonicalCatalogId(record.id);
    const copies = owned.get(id) ?? [];
    copies.push(record);
    owned.set(id, copies);
  }
  return owned;
}

export function catalogActionRecord(record: LibraryRecord, ownership: CatalogOwnership): LibraryRecord {
  const copies = ownership.get(record.id);
  return copies?.find(copy => copy.id === record.id) ?? (copies?.length === 1 ? copies[0] : undefined) ?? record;
}

export function catalogProgress(state: PersonalLibraryState, ownership: CatalogOwnership) {
  const progress = { ...state.progress };
  for (const [id, copies] of ownership) {
    const owned = copies.find(copy => copy.id === id) ?? (copies.length === 1 ? copies[0] : undefined);
    const value = owned && state.progress[owned.id];
    if (value) progress[id] = value;
  }
  return progress;
}

export function catalogPinnedIds(records: readonly LibraryRecord[]): ReadonlySet<string> {
  const ids = new Set(records.flatMap(record => [record.id, canonicalCatalogId(record.id)]));
  for (const [providerId, slug] of providerSlugs) if (ids.has(slug)) ids.add(providerId);
  return ids;
}

export function resolveCatalogRecord(record: LibraryRecord, games: readonly Game[]): LibraryRecord {
  const game = collectionGameForId(games, record.id);
  return game ? recordFromGame(game) : record;
}

export function resolveCatalogRecords(records: readonly LibraryRecord[], games: readonly Game[]): LibraryRecord[] {
  return [...new Map(records.map(record => {
    const resolved = resolveCatalogRecord(record, games);
    return [resolved.id, resolved];
  })).values()];
}

export function catalogPageRecords(local: readonly CatalogSearchItem[], remote: readonly LibraryRecord[], offset: number, limit: number): LibraryRecord[] {
  const localIds = new Set(local.map(item => item.record.id));
  return [...local.slice(offset, offset + limit).map(item => item.record),
    ...new Map(remote.filter(record => !localIds.has(record.id)).map(record => [record.id, record])).values()];
}

export function catalogSearchItems(games: readonly Game[], seed: readonly DiscoveryItem[]): CatalogSearchItem[] {
  const items = new Map<string, CatalogSearchItem>(games.map(game => [game.slug, {
    record: recordFromGame(game), game, aliases: [], artwork: null,
    sources: mappedSlugs.has(game.slug) ? ['collection', 'wikidata'] : ['collection'],
  }]));
  for (const item of seed) {
    const record = resolveCatalogRecord(item.record, games);
    const existing = items.get(record.id);
    if (existing) {
      existing.aliases = [...new Set([...existing.aliases, item.record.title, ...item.aliases])];
      existing.searchTerms = [...new Set([...(existing.searchTerms ?? []), item.record.studio ?? '', item.record.genre ?? ''].filter(Boolean))];
    } else items.set(record.id, { ...item, sources: [item.record.source] });
  }
  return [...items.values()];
}
