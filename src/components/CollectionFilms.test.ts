import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import thumbnails from '../generated/film-thumbnails.json';
import { collectionFilms } from '../lib/films';
import { isPublicPwaFile } from '../pwa/worker';
import CollectionFilms, { FilmPoster } from './CollectionFilms';

describe('film listing thumbnail contract', () => {
  it('keeps text and Watch available without image or movie sources before the collection settles', () => {
    const html = renderToStaticMarkup(createElement(CollectionFilms, { postersReady: false }));
    expect(html).toContain('id="collection-films"');
    expect(html).toContain('Watch films');
    expect(html.match(/class="film-poster"/g)).toHaveLength(2);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<video');
    for (const film of collectionFilms) {
      expect(html).not.toContain(film.poster.src);
      expect(html).not.toContain(film.video.src);
    }
  });

  it('uses only responsive derivatives for listing images, with unchanged intrinsic dimensions', () => {
    for (const film of collectionFilms) {
      const html = renderToStaticMarkup(createElement(FilmPoster, { film, enabled: true }));
      const entry = thumbnails.films[film.id];
      expect(html).toContain(`src="${entry.candidates[0]!.src}"`);
      expect(html.toLowerCase()).toContain(
        `srcset="${entry.candidates.map((asset) => `${asset.src} ${asset.width}w`).join(', ')}"`,
      );
      expect(html).toContain('sizes="(max-width: 380px)');
      expect(html).toContain(`width="${film.poster.width}" height="${film.poster.height}"`);
      expect(html).not.toContain(film.poster.src);
      expect(html).not.toContain(film.video.src);
    }
    const source = readFileSync(new URL('./CollectionFilms.tsx', import.meta.url), 'utf8');
    expect(source).toContain('poster={film.poster.src}');
    expect(source).toContain('src={film.video.src}');
  });

  it('retains provenance, bounded decoded derivatives and the existing PWA exclusion', async () => {
    expect(thumbnails.schemaVersion).toBe(1);
    expect(Object.keys(thumbnails.films)).toEqual(collectionFilms.map((film) => film.id).sort());
    for (const film of collectionFilms) {
      const { source, candidates } = thumbnails.films[film.id];
      expect(source).toMatchObject({ ...film.poster, credits: film.credits });
      const original = readFileSync(new URL(`../../public${source.src}`, import.meta.url));
      expect(source.bytes).toBe(original.length);
      expect(source.sha256).toBe(createHash('sha256').update(original).digest('hex'));
      expect(candidates.map((asset) => asset.width)).toEqual([160, 240, 320, 480, 640]);
      for (const asset of candidates) {
        const bytes = readFileSync(new URL(`../../public${asset.src}`, import.meta.url));
        const hash = createHash('sha256').update(bytes).digest('hex');
        expect(asset.src).toBe(`/videos/thumbnails/${hash}.webp`);
        expect(asset.sha256).toBe(hash);
        expect(asset.bytes).toBe(bytes.length);
        expect(asset.bytes).toBeLessThanOrEqual(24 * 1024);
        expect(await sharp(bytes).metadata()).toMatchObject({
          format: 'webp',
          width: asset.width,
          height: asset.height,
        });
        await sharp(bytes).raw().toBuffer();
        expect(isPublicPwaFile(asset.src)).toBe(false);
      }
    }
  });
});
