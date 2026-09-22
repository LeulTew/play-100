import artworkIds from './discovery-artwork-ids.json' with { type: 'json' };
import type { CatalogArtwork } from './discovery-catalog.js';

const knownArtworkIds: ReadonlySet<string> = new Set(artworkIds);
export const EMPTY_DISCOVERY_ARTWORK: ReadonlyMap<string, CatalogArtwork> = new Map();

// Absence means no artwork in the shipped seed, not that an unresolved public record does not exist.
export function hasKnownDiscoveryArtwork(id: string): boolean {
  return knownArtworkIds.has(id);
}
