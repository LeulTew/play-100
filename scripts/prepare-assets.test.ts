import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { parseCollection } from '../src/lib/collection';
import coverMetadata from '../src/generated/cover-metadata.json';
import webAssets from '../data/web-assets.json';

const collection = parseCollection(JSON.parse(readFileSync(new URL('../data/collection.json', import.meta.url), 'utf8')));
const illustrated = collection.games.filter(game => game.artwork);
const dimensions: Record<string, { width: number; height: number }> = coverMetadata;
const assets = new Map(webAssets.map(asset => [asset.file, asset]));

describe('native workbook cover derivatives', () => {
  it('keeps withoutEnlargement in the real preparation pipeline', () => {
    const script = readFileSync(new URL('./prepare-assets.ts', import.meta.url), 'utf8');
    const resize = script.match(/\.resize\(\{([^}]+)\}\)/)?.[1];
    expect(resize).toMatch(/\bwithoutEnlargement\s*:\s*true\b/);
    expect(resize).toMatch(/\bfit\s*:\s*['"]inside['"]/);
  });

  it('provides exactly one metadata entry and file record per mapped workbook cover', () => {
    expect(Object.keys(dimensions).sort()).toEqual(illustrated.map(game => game.slug).sort());
    expect(assets.size).toBe(illustrated.length);
    expect(webAssets).toHaveLength(illustrated.length);
  });

  it.each(illustrated)('$slug metadata matches its real WebP without enlarging the source', async game => {
    if (!game.artwork) throw new Error('The fixture must have mapped workbook artwork.');
    const original = fileURLToPath(new URL(`../data/${game.artwork.file}`, import.meta.url));
    const derivative = fileURLToPath(new URL(`../public/covers/${game.slug}.webp`, import.meta.url));
    const [input, output, file] = await Promise.all([sharp(original).metadata(), sharp(derivative).metadata(), stat(derivative)]);
    if (!input.width || !input.height || !output.width || !output.height) throw new Error(`Missing image dimensions for ${game.slug}.`);
    const rotated = input.orientation !== undefined && input.orientation >= 5 && input.orientation <= 8;
    expect(output.width).toBeLessThanOrEqual(rotated ? input.height : input.width);
    expect(output.height).toBeLessThanOrEqual(rotated ? input.width : input.height);
    expect(output.format).toBe('webp');
    expect(dimensions[game.slug]).toEqual({ width: output.width, height: output.height });
    expect(assets.get(`${game.slug}.webp`)).toEqual({
      file: `${game.slug}.webp`, width: output.width, height: output.height, bytes: file.size,
    });
  });
});
