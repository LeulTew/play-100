import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_DISCOVERY_ARTWORK } from './discovery-artwork-presence';
import { loadDiscoveryCatalog } from './discovery-loader';
import { artworkFixture, catalogFixture, discoveryFixture } from './discovery-test-fixtures';
import { loadSavedDiscoveryArtwork } from './saved-discovery-artwork';

vi.mock('./discovery-loader', () => ({ loadDiscoveryCatalog: vi.fn() }));

const id = 'wikidata:Q161234';
const catalog = {
  ...catalogFixture,
  items: [
    {
      ...discoveryFixture,
      record: { ...discoveryFixture.record, id, sourceId: 'Q161234' },
      artwork: artworkFixture,
    },
  ],
};

afterEach(() => vi.resetAllMocks());

describe('on-demand saved artwork loading', () => {
  it('does no work merely because the module is imported', () => {
    expect(loadDiscoveryCatalog).not.toHaveBeenCalled();
  });

  it.each([
    { ids: [] },
    { ids: ['manual:same-title'] },
    { ids: ['freetogame:615'] },
    { ids: ['wikidata:Q999999999999999'] },
  ])('does not fetch a catalog for IDs with no shipped artwork: $ids', async ({ ids }) => {
    expect(await loadSavedDiscoveryArtwork(ids, new AbortController().signal)).toBe(EMPTY_DISCOVERY_ARTWORK);
    expect(loadDiscoveryCatalog).not.toHaveBeenCalled();
  });

  it('shares the existing catalog transport and retains exact artwork and attribution', async () => {
    vi.mocked(loadDiscoveryCatalog).mockResolvedValue(catalog);
    const signal = new AbortController().signal;
    const artwork = await loadSavedDiscoveryArtwork([id, id, 'manual:same-title', 'freetogame:615'], signal);
    expect(loadDiscoveryCatalog).toHaveBeenCalledOnce();
    expect(loadDiscoveryCatalog).toHaveBeenCalledWith(signal);
    expect([...artwork]).toEqual([[id, artworkFixture]]);
    expect(artwork.get(id)).toBe(artworkFixture);
    expect(artwork.get('manual:same-title')).toBeUndefined();
    expect(artwork.get('freetogame:615')).toBeUndefined();
  });

  it('rejects an obsolete effect before requesting any catalog', async () => {
    const controller = new AbortController();
    const reason = new Error('The listed records changed before import completed.');
    controller.abort(reason);
    await expect(loadSavedDiscoveryArtwork([id], controller.signal)).rejects.toBe(reason);
    expect(loadDiscoveryCatalog).not.toHaveBeenCalled();
  });

  it('does not hand an old effect artwork after the shared load finishes', async () => {
    let finish: (value: typeof catalog) => void = () => {
      throw new Error('No held catalog load.');
    };
    vi.mocked(loadDiscoveryCatalog).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const controller = new AbortController();
    const task = loadSavedDiscoveryArtwork([id], controller.signal);
    await vi.waitFor(() => expect(loadDiscoveryCatalog).toHaveBeenCalledOnce());
    const reason = new Error('The additions unmounted.');
    controller.abort(reason);
    finish(catalog);
    await expect(task).rejects.toBe(reason);
  });

  it('propagates load failures instead of returning an empty success', async () => {
    const failure = new Error('Catalog is unavailable.');
    vi.mocked(loadDiscoveryCatalog).mockRejectedValueOnce(failure).mockResolvedValueOnce(catalog);
    await expect(loadSavedDiscoveryArtwork([id], new AbortController().signal)).rejects.toBe(failure);
    expect(await loadSavedDiscoveryArtwork([id], new AbortController().signal)).toEqual(
      new Map([[id, artworkFixture]]),
    );
  });
});
