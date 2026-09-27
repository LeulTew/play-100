import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { collectionFilms } from '../src/lib/films';
import {
  FILM_THUMBNAIL_MAX_BYTES,
  FILM_THUMBNAIL_WIDTHS,
  generateFilmThumbnails,
  renderFilmThumbnails,
} from './generate-film-thumbnails';

describe('reproducible film listing thumbnails', () => {
  it('generates bounded, content-hashed 16:9 candidates identically from the same source', async () => {
    const source = await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: { r: 243, g: 243, b: 233 } },
    })
      .jpeg()
      .toBuffer();
    const first = await renderFilmThumbnails(source, 1920, 1080);
    const second = await renderFilmThumbnails(source, 1920, 1080);
    expect(first).toEqual(second);
    expect(first.map(({ asset }) => asset.width)).toEqual(FILM_THUMBNAIL_WIDTHS);
    for (const { data, asset } of first) {
      const sha256 = createHash('sha256').update(data).digest('hex');
      expect(asset.src).toBe(`/videos/thumbnails/${sha256}.webp`);
      expect(asset.sha256).toBe(sha256);
      expect(data.length).toBe(asset.bytes);
      expect(data.length).toBeLessThanOrEqual(FILM_THUMBNAIL_MAX_BYTES);
      expect(await sharp(data).metadata()).toMatchObject({
        format: 'webp',
        width: asset.width,
        height: (asset.width * 9) / 16,
      });
    }
  });

  it('refuses mismatched source dimensions and never upscales a small original', async () => {
    const source = await sharp({
      create: { width: 320, height: 180, channels: 3, background: { r: 32, g: 35, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    await expect(renderFilmThumbnails(source, 1920, 1080)).rejects.toThrow(/recorded JPEG dimensions/);
    await expect(renderFilmThumbnails(source, 320, 180)).rejects.toThrow(/640px candidate/);
  });

  it('reproduces the real files and refuses to overwrite a corrupt immutable candidate', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'play100-film-thumbnails-'));
    try {
      await mkdir(path.join(root, 'public', 'videos'), { recursive: true });
      for (const film of collectionFilms) {
        await copyFile(
          new URL(`../public${film.poster.src}`, import.meta.url),
          path.join(root, 'public', 'videos', path.basename(film.poster.src)),
        );
      }
      const first = await generateFilmThumbnails(root);
      expect(await generateFilmThumbnails(root)).toEqual(first);
      expect(await generateFilmThumbnails(root, true)).toEqual({ ...first, verified: true });
      const manifest = path.join(root, 'src', 'generated', 'film-thumbnails.json');
      const before = await readFile(manifest);
      const directory = path.join(root, 'public', 'videos', 'thumbnails');
      const file = (await readdir(directory)).find((name) => name.endsWith('.webp'));
      if (!file) throw new Error('The generator produced no thumbnails.');
      const destination = path.join(directory, file);
      await writeFile(destination, 'corrupt fixture');
      await expect(generateFilmThumbnails(root)).rejects.toThrow(/Refusing to overwrite/);
      expect(await readFile(manifest)).toEqual(before);
      expect(await readFile(destination, 'utf8')).toBe('corrupt fixture');
      expect((await readdir(directory)).some((name) => name.endsWith('.tmp'))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);
});
