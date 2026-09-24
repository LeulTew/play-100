import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  commonsRasterPermission,
  fetchCommonsRaster,
  patchedDecoder,
  verifiedRaster,
} from '../../api/_lib/commons-raster';

const permissionFixture = () => ({
  query: {
    pages: {
      '1': {
        title: 'File:Example.png',
        imagerepository: 'local',
        imageinfo: [
          {
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Example.png',
            url: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Example.png',
            thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Example.png/320px-Example.png',
            width: 1,
            height: 1,
            thumbwidth: 1,
            thumbheight: 1,
            mime: 'image/png',
            thumbmime: 'image/png',
            extmetadata: {
              Artist: { value: 'Fixture artist' },
              Credit: { value: 'Original source' },
              Attribution: { value: 'Full attribution' },
              LicenseShortName: { value: 'CC BY-SA 4.0' },
              LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
              Copyrighted: { value: 'True' },
              Restrictions: { value: 'trademarked' },
            },
          },
        ],
      },
    },
  },
});
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a23sAAAAASUVORK5CYII=',
  'base64',
);
function smallOriginalFixture(patch: Record<string, unknown> = {}) {
  const fixture = permissionFixture();
  const info = fixture.query.pages['1'].imageinfo[0]!;
  return {
    query: {
      pages: {
        '1': {
          ...fixture.query.pages['1'],
          imageinfo: [
            {
              ...info,
              width: 483,
              height: 110,
              size: 70739,
              thumbwidth: 320,
              thumbheight: 73,
              thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/aa/Example.png/330px-Example.png',
              ...patch,
            },
          ],
        },
      },
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('conservative Commons rights and media boundary', () => {
  it('selects the exact verified small original before fetching rather than guessing thumbnail bucket dimensions', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(commonsRasterPermission(smallOriginalFixture(), 'Example.png')).toMatchObject({
      selection: 'original',
      downloadUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Example.png',
      width: 483,
      height: 110,
      mime: 'image/png',
      bytes: 70739,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(commonsRasterPermission(smallOriginalFixture({ width: 640, height: 640, size: 512 * 1024 }))).toMatchObject({
      selection: 'original',
      bytes: 512 * 1024,
    });
  });
  it.each([
    { width: 641 },
    { height: 641 },
    { size: 512 * 1024 + 1 },
    { size: undefined },
    { size: 0 },
    { size: -1 },
    { size: 1.5 },
    { size: NaN },
    { size: '70739' },
    { mime: 'image/svg+xml' },
    { mime: 'image/gif' },
    { mime: 'image/avif' },
    { mime: 'image/tiff' },
  ])('keeps the permitted thumbnail path when the original is not independently bounded: %j', (patch) => {
    expect(commonsRasterPermission(smallOriginalFixture(patch))).toMatchObject({
      selection: 'thumbnail',
      width: 320,
      height: 73,
      mime: 'image/png',
      bytes: null,
    });
  });
  it.each([{ width: undefined }, { height: 0 }, { width: -1 }, { height: 1.2 }, { width: 6000, height: 6000 }])(
    'rejects unverified original geometry even when a thumbnail is supplied: %j',
    (patch) => {
      expect(() => commonsRasterPermission(smallOriginalFixture(patch))).toThrow();
    },
  );
  it('does not fetch an unbounded original when no permitted thumbnail is available', () => {
    expect(() => commonsRasterPermission(smallOriginalFixture({ size: undefined, thumburl: undefined }))).toThrow();
    expect(() =>
      commonsRasterPermission(smallOriginalFixture({ size: 512 * 1024 + 1, thumburl: undefined })),
    ).toThrow();
  });
  it('rejects an original byte mismatch and never retries or decodes an alternate thumbnail', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } }));
    vi.stubGlobal('fetch', fetch);
    const permission = commonsRasterPermission(smallOriginalFixture({ width: 1, height: 1, size: png.length + 1 }));
    await expect(
      fetchCommonsRaster(permission, new AbortController().signal, '2026-09-22T12:00:00.000Z'),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toBe(permission.originalUrl);
  });
  it('keeps exact selected original MIME and decoded dimensions instead of accepting another supported raster', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/jpeg' } }));
    vi.stubGlobal('fetch', fetch);
    const permission = commonsRasterPermission(smallOriginalFixture({ width: 1, height: 1, size: png.length }));
    await expect(
      fetchCommonsRaster(permission, new AbortController().signal, '2026-09-22T12:00:00.000Z'),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('retains the decoded-dimension and animation gates on a selected small original without fallback attempts', async () => {
    const { default: sharp } = await import('sharp');
    const raster = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#20231e' } })
      .png()
      .toBuffer();
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array(raster), { headers: { 'Content-Type': 'image/png' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(
      fetchCommonsRaster(
        commonsRasterPermission(smallOriginalFixture({ width: 2, height: 1, size: raster.length })),
        new AbortController().signal,
        '2026-09-22T12:00:00.000Z',
      ),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const chunk = Buffer.alloc(20);
    chunk.writeUInt32BE(8, 0);
    chunk.write('acTL', 4, 'ascii');
    const animated = Buffer.concat([raster.subarray(0, 33), chunk, raster.subarray(33)]);
    fetch.mockResolvedValue(new Response(new Uint8Array(animated), { headers: { 'Content-Type': 'image/png' } }));
    await expect(
      fetchCommonsRaster(
        commonsRasterPermission(smallOriginalFixture({ width: 1, height: 1, size: animated.length })),
        new AbortController().signal,
        '2026-09-22T12:00:00.000Z',
      ),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('preserves complete attribution, source, original and exact license plus transform/trademark notices', () => {
    const permission = commonsRasterPermission(permissionFixture(), 'Example.png');
    expect(permission).toMatchObject({
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      originalUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Example.png',
    });
    for (const part of [
      'Fixture artist',
      'Original source',
      'Full attribution',
      'Resized and converted to WebP',
      'Trademark rights',
    ])
      expect(permission.credit).toContain(part);
  });
  it('rejects a replacement file even when its own license would be reusable', () => {
    expect(() => commonsRasterPermission(permissionFixture(), 'Different.png')).toThrow(/different file identity/);
  });
  it.each(['CC BY-NC 4.0', 'Fair use', 'Copyrighted', ''])('rejects unapproved license %s', (license) => {
    const fixture = permissionFixture();
    fixture.query.pages['1'].imageinfo[0]!.extmetadata.LicenseShortName.value = license;
    expect(() => commonsRasterPermission(fixture)).toThrow();
  });
  it('does not truncate missing, restricted, oversized attribution or ambiguous metadata into permission', () => {
    const fixture = permissionFixture();
    fixture.query.pages['1'].imageinfo[0]!.extmetadata.Artist.value = 'x'.repeat(2100);
    expect(() => commonsRasterPermission(fixture)).toThrow(/complete image credit/);
    fixture.query.pages['1'].imageinfo[0]!.extmetadata.Artist.value = '';
    expect(() => commonsRasterPermission(fixture)).toThrow();
    fixture.query.pages['1'].imageinfo[0]!.extmetadata.Artist.value = 'Artist';
    fixture.query.pages['1'].imageinfo[0]!.extmetadata.Restrictions.value = 'personality';
    expect(() => commonsRasterPermission(fixture)).toThrow();
  });
  it.each(['   ', '<span> </span>', '&nbsp;', '<span>&#160;</span>', '&#x20;'])(
    'rejects a normalized-empty creator before authorizing a raster: %j',
    (artist) => {
      const fixture = permissionFixture();
      const metadata = fixture.query.pages['1'].imageinfo[0]!.extmetadata;
      metadata.Artist.value = artist;
      metadata.Credit.value = '';
      metadata.Attribution.value = '';
      metadata.Restrictions.value = '';
      const requestRaster = vi.fn();
      expect(() => requestRaster(commonsRasterPermission(fixture, 'Example.png'))).toThrow('complete attribution');
      expect(requestRaster).not.toHaveBeenCalled();
    },
  );
  it('retains the full normalized creator, attribution and links before adding application notices', () => {
    const fixture = permissionFixture();
    const metadata = fixture.query.pages['1'].imageinfo[0]!.extmetadata;
    metadata.Artist.value = '<a href="/wiki/User:Example">A &amp; B</a>';
    metadata.Credit.value = '<span>Original archive &amp; collection</span>';
    metadata.Attribution.value = 'Credit the original creators in full.';
    expect(commonsRasterPermission(fixture, 'Example.png').credit).toBe(
      'A & B (https://commons.wikimedia.org/wiki/User:Example) | Original archive & collection | Credit the original creators in full. | Resized and converted to WebP; original license retained. | Trademark rights are not granted by the copyright license.',
    );
  });
  it.each([
    'https://localhost/private.png',
    'https://upload.wikimedia.org.evil.test/file.png',
    'https://upload.wikimedia.org/wikipedia/commons/a/a.svg',
    'http://upload.wikimedia.org/wikipedia/commons/a/a.png',
  ])('rejects arbitrary or nonraster image URL %s', (url) => {
    const fixture = permissionFixture();
    fixture.query.pages['1'].imageinfo[0]!.thumburl = url;
    expect(() => commonsRasterPermission(fixture)).toThrow();
  });
  it('rejects excessive dimensions before downloading an image', () => {
    const fixture = permissionFixture();
    fixture.query.pages['1'].imageinfo[0]!.thumbwidth = 641;
    expect(() => commonsRasterPermission(fixture)).toThrow();
  });
  it.each(['0.34.5', '0.35.0', '0.35.3', '0.35.4-rc1', 'unknown'])(
    'does not permit an unpatched or unverified decoder %s',
    (version) => {
      expect(patchedDecoder(version)).toBe(false);
    },
  );
  it.each(['0.35.4', '0.35.5', '0.36.0', '1.0.0'])('permits patched decoder version %s', (version) => {
    expect(patchedDecoder(version)).toBe(true);
  });
  it('requires MIME and magic, excludes SVG/HTML/GIF/TIFF/AVIF and animated raster chunks before decoding', () => {
    expect(verifiedRaster(png, 'image/png')).toBe(true);
    expect(verifiedRaster(png, 'image/jpeg')).toBe(false);
    for (const [text, mime] of [
      ['<svg/>', 'image/png'],
      ['<html>', 'image/jpeg'],
      ['GIF89a', 'image/gif'],
      ['II*\0', 'image/tiff'],
      ['ftypavif', 'image/avif'],
    ]) {
      expect(verifiedRaster(Buffer.from(text!), mime!)).toBe(false);
    }
    const animationChunk = Buffer.alloc(20);
    animationChunk.writeUInt32BE(8, 0);
    animationChunk.write('acTL', 4, 'ascii');
    const animated = Buffer.concat([png.subarray(0, 33), animationChunk, png.subarray(33)]);
    expect(verifiedRaster(animated, 'image/png')).toBe(false);
    const webp = Buffer.alloc(30);
    webp.write('RIFF', 0, 'ascii');
    webp.writeUInt32LE(22, 4);
    webp.write('WEBPVP8X', 8, 'ascii');
    webp.writeUInt32LE(10, 16);
    webp[20] = 2;
    expect(verifiedRaster(webp, 'image/webp')).toBe(false);
  });
  it('rejects a PNG pixel bomb from its header before native decoding', () => {
    const oversized = Buffer.from(png);
    oversized.writeUInt32BE(40_000, 16);
    oversized.writeUInt32BE(40_000, 20);
    expect(verifiedRaster(oversized, 'image/png')).toBe(false);
  });
  it('does not decode MIME-spoofed active content with the patched decoder', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { headers: { 'Content-Type': 'image/png' } }),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(
      fetchCommonsRaster(
        commonsRasterPermission(permissionFixture()),
        new AbortController().signal,
        '2026-09-22T12:00:00.000Z',
      ),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
  it('re-encodes one bounded verified raster, strips metadata and never enlarges it', async () => {
    const { default: sharp } = await import('sharp');
    expect(patchedDecoder(sharp.versions.sharp)).toBe(true);
    const fixture = await sharp({
      create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Uint8Array(fixture), { headers: { 'Content-Type': 'image/png' } })),
    );
    const artwork = await fetchCommonsRaster(
      commonsRasterPermission(permissionFixture()),
      new AbortController().signal,
      '2026-09-22T12:00:00.000Z',
    );
    expect(artwork).toMatchObject({ kind: 'commons-raster', width: 1, height: 1, license: 'CC BY-SA 4.0' });
    expect(artwork.src).toMatch(/^data:image\/webp;base64,/);
    const bytes = Buffer.from(artwork.src.split(',')[1]!, 'base64');
    expect(bytes.length).toBeLessThanOrEqual(80 * 1024);
    expect(bytes.includes(Buffer.from('EXIF'))).toBe(false);
    expect(bytes.includes(Buffer.from('XMP '))).toBe(false);
  });
});
