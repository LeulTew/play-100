import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BoundedClient,
  checksum,
  collect,
  commonsPermission,
  makeArtwork,
  parseFreeToGame,
  parseWikiEntity,
  validateFetchUrl,
  verifySnapshot,
  writeSnapshot,
  type CommonsPermission,
} from './collect-discovery-catalog';
import { parseDiscoveryCatalog, type DiscoveryCatalog } from '../src/lib/discovery-catalog';
import { artworkPresencePath, discoveryArtworkPresenceJson } from './generate-discovery-artwork-presence';

const temporaryRoots: string[] = [];
const date = '2026-09-17T18:00:00.000Z';
const claim = (value: unknown, rank = 'normal') => ({ rank, mainsnak: { snaktype: 'value', datavalue: { value } } });
const entity = {
  id: 'Q15408545',
  labels: { en: { value: 'Kingdom Come: Deliverance' } },
  aliases: { en: [{ value: 'Kingdom Come Deliverance' }], mul: [{ value: 'KCD' }] },
  claims: { P31: [claim({ id: 'Q7889' })] },
};
const permission: CommonsPermission = {
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  credit: 'Fixture creator | converted to WebP',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Fixture.png',
  originalUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Fixture.png',
  downloadUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/aa/Fixture.png/500px-Fixture.png',
  sourceWidth: 320,
  sourceHeight: 180,
};
const commonsInfo = {
  url: permission.originalUrl,
  thumburl: permission.downloadUrl,
  descriptionurl: permission.sourceUrl,
  width: 320,
  height: 180,
  extmetadata: {
    Artist: { value: '<a href="/wiki/User:Artist">Artist</a>' },
    Credit: { value: 'Own work' },
    Attribution: { value: 'Required attribution' },
    LicenseShortName: { value: 'CC BY-SA 4.0' },
    LicenseUrl: { value: permission.licenseUrl },
    Copyrighted: { value: 'True' },
  },
};
const freeRow = (id = 1) => ({
  id,
  title: `Fixture free game ${id}`,
  developer: 'Fixture developer',
  genre: 'RPG',
  release_date: '2020-01-01',
  freetogame_profile_url: `https://www.freetogame.com/fixture-${id}`,
  short_description: 'Never copied',
  thumbnail: 'https://www.freetogame.com/g/1/thumbnail.jpg',
});
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const clientWith = (fetcher: typeof fetch) => new BoundedClient(new AbortController().signal, fetcher, async () => {});

it('preserves collector trimming and exact ASCII control rejection for text and aliases', () => {
  for (const code of [...Array.from({ length: 32 }, (_, index) => index), 127]) {
    const title = `Before${String.fromCharCode(code)}after`;
    expect(() => parseFreeToGame([{ ...freeRow(), title }], date)).toThrow();
    expect(parseWikiEntity({ ...entity, aliases: { en: [{ value: title }] } }, {}, date)?.aliases).toEqual([]);
  }
  for (const code of [32, 126, 128, 159, 160, 256, 287, 383, 0x2028, 0x2029, 0x1f600]) {
    const title = `Before${String.fromCodePoint(code)}after`;
    expect(parseFreeToGame([{ ...freeRow(), title }], date)[0]?.record.title).toBe(title);
    expect(parseWikiEntity({ ...entity, aliases: { en: [{ value: title }] } }, {}, date)?.aliases).toEqual([title]);
  }
  expect(parseFreeToGame([{ ...freeRow(), title: '\tTrimmed\n' }], date)[0]?.record.title).toBe('Trimmed');
  expect(parseWikiEntity({ ...entity, aliases: { en: [{ value: '\tTrimmed\n' }] } }, {}, date)?.aliases).toEqual([
    'Trimmed',
  ]);
});

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 5 });
});
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'play100-discovery-test-'));
  temporaryRoots.push(root);
  return root;
}
async function fixture() {
  const input = await sharp({ create: { width: 16, height: 9, channels: 4, background: '#789abc' } })
    .png()
    .toBuffer();
  const image = await makeArtwork(input, permission, 'Fixture game', date);
  const item = parseWikiEntity(entity, {}, date)!;
  item.artwork = image.artwork;
  item.provenance.artworkMissingReason = null;
  const catalog: DiscoveryCatalog = { schemaVersion: 1, generatedAt: date, items: [item] };
  return { input, catalog, assets: new Map([[image.artwork.src, image.bytes]]) };
}

describe('bounded request transport', () => {
  it.each([
    'http://www.wikidata.org/w/api.php?action=query',
    'https://www.wikidata.org.evil.test/w/api.php?action=query',
    'https://user@www.wikidata.org/w/api.php?action=query',
    'https://www.wikidata.org:8443/w/api.php?action=query',
    'https://www.wikidata.org/w/api.php?action=edit',
    'https://www.freetogame.com/api/game?id=1',
    'https://127.0.0.1/w/api.php?action=query',
  ])('rejects non-allowlisted endpoint %s before fetching', async (url) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(clientWith(fetcher).bytes(url)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    'https://upload.wikimedia.org/wikipedia/commons/a/aa/File.svg',
    'https://evil.example/a.png',
    'https://upload.wikimedia.org/arbitrary/a.png',
    'https://upload.wikimedia.org/wikipedia/commons/a%2fb.png',
  ])('rejects unsupported image source %s', (url) => expect(() => validateFetchUrl(url, true)).toThrow());
  it('identifies requests, forbids redirects, and rate-limits starts globally', async () => {
    let clock = 0;
    const starts: number[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_, init) => {
      expect(init?.redirect).toBe('error');
      expect(new Headers(init?.headers).get('User-Agent')).toContain('Play100Discovery');
      starts.push(clock);
      return json({});
    });
    const client = new BoundedClient(
      new AbortController().signal,
      fetcher,
      async (ms) => {
        clock += ms;
      },
      () => clock,
    );
    await client.bytes('https://www.freetogame.com/api/games');
    await client.bytes('https://www.wikidata.org/w/api.php?action=query');
    expect(starts).toEqual([0, 550]);
  });
  it('obeys Retry-After and fails rather than ignoring a long provider pause', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 429, { 'Retry-After': '3' }))
      .mockResolvedValueOnce(json({ ok: true }));
    const delays: number[] = [];
    const client = new BoundedClient(new AbortController().signal, fetcher, async (ms) => {
      delays.push(ms);
    });
    expect(await client.json('https://www.freetogame.com/api/games')).toEqual({ ok: true });
    expect(delays).toContain(3000);
    await expect(
      clientWith(vi.fn<typeof fetch>().mockResolvedValue(json({}, 429, { 'Retry-After': '120' }))).bytes(
        'https://www.freetogame.com/api/games',
      ),
    ).rejects.toThrow(/longer wait/);
  });
  it('caps retries and surfaces source errors instead of empty success', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => json({}, 503));
    await expect(clientWith(fetcher).bytes('https://www.freetogame.com/api/games')).rejects.toThrow(/503/);
    expect(fetcher).toHaveBeenCalledTimes(3);
    await expect(
      clientWith(vi.fn<typeof fetch>().mockImplementation(async () => json({ error: { code: 'maxlag' } }))).json(
        'https://www.freetogame.com/api/games',
      ),
    ).rejects.toThrow(/maxlag/);
  });
  it('rejects HTML, misleading sizes, malformed JSON and oversized streaming bodies', async () => {
    for (const response of [
      new Response('<html>blocked</html>', { headers: { 'Content-Type': 'text/html' } }),
      json({}, 200, { 'Content-Length': String(9 * 1024 * 1024) }),
      new Response('x'.repeat(8 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'application/json' } }),
      new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    ])
      await expect(
        clientWith(vi.fn<typeof fetch>().mockResolvedValue(response)).json('https://www.freetogame.com/api/games'),
      ).rejects.toThrow();
  });
  it('honors cancellation without making requests', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Cancelled'));
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      new BoundedClient(controller.signal, fetcher).bytes('https://www.freetogame.com/api/games'),
    ).rejects.toThrow(/Cancelled/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('prevents concurrent requests and stops at the request budget', async () => {
    let release!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const client = clientWith(fetcher);
    const first = client.bytes('https://www.freetogame.com/api/games');
    await Promise.resolve();
    await expect(client.bytes('https://www.freetogame.com/api/games')).rejects.toThrow(/serial/);
    release(json({}));
    await first;
    client.requests = 700;
    await expect(client.bytes('https://www.freetogame.com/api/games')).rejects.toThrow(/Request budget/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('recovers from maxlag only within its bounded retry allowance', async () => {
    const delays: number[] = [];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: { code: 'maxlag' } }))
      .mockResolvedValueOnce(json({ ok: true }));
    const client = new BoundedClient(new AbortController().signal, fetcher, async (ms) => {
      delays.push(ms);
    });
    expect(await client.json('https://www.wikidata.org/w/api.php?action=query')).toEqual({ ok: true });
    expect(delays).toContain(5000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('provider facts and per-file rights', () => {
  it('retains provider facts without descriptions, thumbnails or fabricated aliases', () => {
    const item = parseFreeToGame([freeRow()], date)[0]!;
    expect(item.aliases).toEqual([]);
    expect(item.artwork).toBeNull();
    expect(item.record).not.toHaveProperty('short_description');
    expect(item.provenance.artworkMissingReason).toMatch(/rights/);
    expect(() => parseFreeToGame([freeRow(), freeRow()], date)).toThrow(/Duplicate/);
    expect(() => parseFreeToGame([{ ...freeRow(), id: NaN }], date)).toThrow();
  });
  it('requires video-game classification and preserves actual aliases/ambiguous years', () => {
    expect(parseWikiEntity(entity, {}, date)?.aliases).toEqual(['KCD', 'Kingdom Come Deliverance']);
    expect(parseWikiEntity({ ...entity, claims: {} }, {}, date)).toBeNull();
    const dated = {
      ...entity,
      claims: {
        ...entity.claims,
        P577: [
          claim({ time: '+2018-01-01T00:00:00Z', precision: 11 }),
          claim({ time: '+2019-01-01T00:00:00Z', precision: 11 }),
        ],
      },
    };
    expect(parseWikiEntity(dated, {}, date)?.record.year).toBeNull();
  });
  it('preserves creator links, source and attribution with the exact image license', () => {
    const result = commonsPermission(commonsInfo);
    expect(result).toMatchObject({ license: 'CC BY-SA 4.0', licenseUrl: permission.licenseUrl });
    expect(typeof result !== 'string' && result.credit).toContain('https://commons.wikimedia.org/wiki/User:Artist');
    expect(typeof result !== 'string' && result.credit).toContain('Required attribution');
  });
  it.each([
    { LicenseShortName: { value: 'Fair use' } },
    { LicenseShortName: { value: 'CC BY-NC 4.0' } },
    { LicenseUrl: { value: 'https://evil.test/' } },
    { Artist: { value: '' } },
    { Restrictions: { value: 'personality' } },
    { LicenseShortName: { value: 'Public domain' }, Copyrighted: { value: 'True' } },
  ])('excludes unclear or restricted Commons rights %j', (patch) => {
    expect(typeof commonsPermission({ ...commonsInfo, extmetadata: { ...commonsInfo.extmetadata, ...patch } })).toBe(
      'string',
    );
  });
  it('accepts a declared public-domain file without mislabelling it CC0', () => {
    expect(
      commonsPermission({
        ...commonsInfo,
        extmetadata: {
          ...commonsInfo.extmetadata,
          LicenseShortName: { value: 'Public domain' },
          Copyrighted: { value: 'False' },
        },
      }),
    ).toMatchObject({ license: 'Public domain', licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/' });
  });
});

describe('raster and atomic snapshot output', () => {
  it('does not upscale, writes deterministic bytes, and verifies every file and reference', async () => {
    const root = await temporaryRoot();
    const { catalog, assets } = await fixture();
    expect(catalog.items[0]!.artwork).toMatchObject({ width: 16, height: 9 });
    await writeSnapshot(catalog, assets, root);
    const first = await verifySnapshot(root);
    expect(await readFile(artworkPresencePath(root), 'utf8')).toBe(discoveryArtworkPresenceJson(catalog));
    await writeSnapshot(catalog, assets, root);
    expect(await verifySnapshot(root)).toEqual(first);
    expect(first).toMatchObject({ records: 1, illustratedRecords: 1, uniqueImages: 1 });
    expect(await readdir(path.join(root, 'public', 'data', 'discovery'))).toEqual(['catalog.v1.json']);
  });
  it('detects a stale artwork hint and regenerates it with a changed validated snapshot', async () => {
    const root = await temporaryRoot();
    const { catalog, assets } = await fixture();
    await writeSnapshot(catalog, assets, root);
    await writeFile(artworkPresencePath(root), '[]\n');
    await expect(verifySnapshot(root)).rejects.toThrow(/presence index is stale/);
    await writeSnapshot(catalog, assets, root);
    expect(await verifySnapshot(root)).toMatchObject({ illustratedRecords: 1 });
    const withoutArtwork = structuredClone(catalog);
    withoutArtwork.items[0]!.artwork = null;
    withoutArtwork.items[0]!.provenance.artworkMissingReason = 'No licensed image in this snapshot';
    await writeSnapshot(withoutArtwork, new Map(), root);
    expect(await readFile(artworkPresencePath(root), 'utf8')).toBe('[]\n');
    expect(await verifySnapshot(root)).toMatchObject({ illustratedRecords: 0 });
  });
  it('preserves a last-good manifest on failed assets, schema or byte budgets', async () => {
    const root = await temporaryRoot();
    const { catalog, assets } = await fixture();
    await writeSnapshot(catalog, assets, root);
    const manifestPath = path.join(root, 'public', 'data', 'discovery', 'catalog.v1.json');
    const before = await readFile(manifestPath);
    const presenceBefore = await readFile(artworkPresencePath(root));
    await expect(writeSnapshot(catalog, new Map(), root)).rejects.toThrow(/counts/);
    const malformed = structuredClone(catalog);
    malformed.items[0]!.record.id = 'wikidata:Q1';
    await expect(writeSnapshot(malformed, assets, root)).rejects.toThrow(/identity/);
    expect(await readFile(manifestPath)).toEqual(before);
    expect(await readFile(artworkPresencePath(root))).toEqual(presenceBefore);
    const src = catalog.items[0]!.artwork!.src;
    const bad = Buffer.from('HTML is not an image');
    const badCatalog = structuredClone(catalog);
    Object.assign(badCatalog.items[0]!.artwork!, {
      src: `/images/discovery/${checksum(bad)}.webp`,
      sha256: checksum(bad),
      bytes: bad.length,
    });
    await expect(
      writeSnapshot(badCatalog, new Map([[badCatalog.items[0]!.artwork!.src, bad]]), root),
    ).rejects.toThrow();
    expect(await readFile(manifestPath)).toEqual(before);
    await writeFile(path.join(root, 'public', 'images', 'discovery', path.basename(src)), 'corruption');
    await expect(verifySnapshot(root)).rejects.toThrow();
  });
  it('rejects HTML-as-image and bounds transformed output against original source dimensions', async () => {
    await expect(makeArtwork(Buffer.from('<html>denied</html>'), permission, 'X', date)).rejects.toThrow();
    const input = await sharp({ create: { width: 100, height: 100, channels: 4, background: '#000' } })
      .png()
      .toBuffer();
    const image = await makeArtwork(input, { ...permission, sourceWidth: 12, sourceHeight: 12 }, 'X', date);
    expect(image.artwork.width).toBe(12);
    expect(image.artwork.height).toBe(12);
  });
  it('rejects aggregate asset budgets before publication', async () => {
    const { catalog } = await fixture();
    catalog.items = Array.from({ length: 500 }, (_, index) => {
      const item = structuredClone(catalog.items[0]!);
      item.record.id = `wikidata:Q${index + 1}`;
      item.record.sourceId = `Q${index + 1}`;
      item.record.sourceUrl = `https://www.wikidata.org/wiki/Q${index + 1}`;
      const hash = index.toString(16).padStart(64, '0');
      item.artwork = { ...item.artwork!, sha256: hash, src: `/images/discovery/${hash}.webp`, bytes: 80 * 1024 };
      return item;
    });
    expect(() => parseDiscoveryCatalog(catalog)).toThrow(/35 MiB/);
  });
  it('runs the full collector with a dry offline provider fixture and no public side effects', async () => {
    const { input } = await fixture();
    const wikiIds = Array.from({ length: 100 }, (_, index) => `Q${index + 100}`);
    const wikiEntities = Object.fromEntries(
      wikiIds.map((id) => [
        id,
        {
          id,
          labels: { en: { value: `Fixture wiki ${id}` } },
          claims: entity.claims,
        },
      ]),
    );
    const fetcher: typeof fetch = async (url) => {
      const parsed = new URL(String(url));
      if (parsed.hostname === 'www.freetogame.com')
        return json(Array.from({ length: 500 }, (_, index) => freeRow(index + 1)));
      if (parsed.hostname === 'commons.wikimedia.org')
        return json({ query: { pages: { 1: { imageinfo: [commonsInfo] } } } });
      if (parsed.hostname === 'thumb.wikimedia.org')
        return new Response(new Uint8Array(input), { headers: { 'Content-Type': 'image/png' } });
      if (parsed.searchParams.get('action') === 'query')
        return json({ query: { search: wikiIds.map((title) => ({ title })) } });
      if (parsed.searchParams.has('sites'))
        return json({
          entities: {
            Q15408545: { ...entity, claims: { ...entity.claims, P154: [claim('Fixture.png')] } },
          },
        });
      return json({
        entities: Object.fromEntries(
          parsed.searchParams
            .get('ids')!
            .split('|')
            .map((id) => [id, wikiEntities[id]]),
        ),
      });
    };
    const result = await collect(clientWith(fetcher));
    expect(result.catalog.items).toHaveLength(601);
    expect(result.assets.size).toBe(1);
    const root = await temporaryRoot();
    await writeSnapshot(result.catalog, result.assets, root);
    expect(await verifySnapshot(root)).toMatchObject({ records: 601, illustratedRecords: 1, uniqueImages: 1 });
  });
});
