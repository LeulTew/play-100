import { describe, expect, it } from 'vitest';
import { DISCOVERY_CATALOG_URL, DISCOVERY_LIMITS, indexDiscoveryArtwork } from './discovery-catalog';
import * as shared from './discovery-catalog-shared';
import { catalogFixture } from './discovery-test-fixtures';
import { GOOGLE_REDIRECT_KEY } from './google-intent';
import { GOOGLE_REDIRECT_KEY as sharedGoogleKey } from './google-intent-key';

describe('lightweight app imports retain existing contracts', () => {
  it('reexports identical catalog constants and artwork index without a second implementation', () => {
    expect(DISCOVERY_CATALOG_URL).toBe(shared.DISCOVERY_CATALOG_URL);
    expect(DISCOVERY_LIMITS).toBe(shared.DISCOVERY_LIMITS);
    expect(indexDiscoveryArtwork).toBe(shared.indexDiscoveryArtwork);
    expect(shared.indexDiscoveryArtwork(catalogFixture)).toEqual(indexDiscoveryArtwork(catalogFixture));
  });

  it('keeps the exact Google return storage key', () => {
    expect(GOOGLE_REDIRECT_KEY).toBe(sharedGoogleKey);
    expect(sharedGoogleKey).toBe('play100.google-redirect.v1');
  });
});
