import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { collectionFilms, filmDuration } from './films';

const asset = (url: string) => fileURLToPath(new URL(`../../public${url}`, import.meta.url));

describe('finished first-party collection films', () => {
  it('presents the authored 100 first and keeps both completed films short', () => {
    expect(collectionFilms.map((film) => film.id)).toEqual(['the-100', 'discover-compare']);
    for (const film of collectionFilms) {
      expect(film.durationSeconds).toBe(22);
      expect(film.transcript.length).toBeGreaterThanOrEqual(4);
      expect(film.video.bytes).toBeLessThan(5_000_000);
    }
  });
  it('retains exact immutable video, poster, caption and credit bytes', async () => {
    expect(readFileSync(new URL('../../.gitattributes', import.meta.url), 'utf8')).toContain('/public/videos/** -text');
    for (const film of collectionFilms) {
      for (const url of [film.video.src, film.poster.src, film.captions, film.credits, film.transcriptFile]) {
        expect(url).toMatch(/^\/videos\/[a-f0-9]{64}\.(mp4|jpg|vtt|md|txt)$/);
        const bytes = readFileSync(asset(url));
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(path.basename(url).split('.')[0]);
        if (url === film.video.src) {
          expect(bytes.byteLength).toBe(film.video.bytes);
          expect(path.basename(url)).toBe(`${film.video.sha256}.mp4`);
        }
      }
      expect(await sharp(asset(film.poster.src)).metadata()).toMatchObject({
        format: 'jpeg',
        width: film.poster.width,
        height: film.poster.height,
      });
      expect(readFileSync(asset(film.captions), 'utf8')).toContain('WEBVTT');
      expect(readFileSync(asset(film.captions), 'utf8')).toContain('no speech');
      expect(readFileSync(asset(film.credits), 'utf8')).toMatch(/Kenney|kenney/);
      expect(readFileSync(asset(film.transcriptFile), 'utf8')).toContain('00:00-00:04');
    }
    for (const file of readdirSync(new URL('../../public/videos/', import.meta.url)))
      expect(file).toMatch(/^[a-f0-9]{64}\.(mp4|jpg|vtt|md|txt)$/);
  });
  it('ships fast-start MP4 files with the metadata before the media payload', () => {
    for (const film of collectionFilms) {
      const data = readFileSync(asset(film.video.src));
      const boxes: string[] = [];
      for (let offset = 0; offset < data.byteLength;) {
        const header = data.readUInt32BE(offset);
        const size =
          header === 1 ? Number(data.readBigUInt64BE(offset + 8)) : header === 0 ? data.byteLength - offset : header;
        expect(size).toBeGreaterThanOrEqual(8);
        expect(offset + size).toBeLessThanOrEqual(data.byteLength);
        boxes.push(data.toString('ascii', offset + 4, offset + 8));
        offset += size;
      }
      expect(boxes[0]).toBe('ftyp');
      expect(boxes.indexOf('moov')).toBeGreaterThan(0);
      expect(boxes.indexOf('mdat')).toBeGreaterThan(boxes.indexOf('moov'));
    }
  });
  it('uses self-hosted media caching without weakening the auth-helper policy', () => {
    const deployment = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')) as {
      headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    };
    const root = deployment.headers.find((rule) => rule.source === '/((?!__/auth/).*)');
    const videos = deployment.headers.find((rule) => rule.source === '/videos/(.*)');
    const auth = deployment.headers.find((rule) => rule.source === '/__/auth/(handler|iframe|experiments)\\.js');
    expect(root?.headers.find((header) => header.key === 'Content-Security-Policy')?.value).toContain(
      "media-src 'self'",
    );
    expect(videos?.headers.find((header) => header.key === 'Cache-Control')?.value).toContain('immutable');
    expect(auth?.headers.find((header) => header.key === 'X-Frame-Options')?.value).toBe('SAMEORIGIN');
    expect(auth?.headers.find((header) => header.key === 'Cache-Control')?.value).toContain('no-store');
    expect(auth?.headers.find((header) => header.key === 'Content-Security-Policy')?.value).toContain(
      "frame-ancestors 'self'",
    );
  });
  it.each([
    [0, '0:00'],
    [22, '0:22'],
    [59.8, '1:00'],
  ])('formats %s seconds without a sixty-second remainder', (seconds, expected) => {
    expect(filmDuration(Number(seconds))).toBe(expected);
  });
});
