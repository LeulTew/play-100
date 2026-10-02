import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { parseCollection } from '../src/lib/collection';
import coverSizes from '../src/generated/cover-sizes.json';
import webAssets from '../data/web-assets.json';
import { sourceNodes } from './source-contract';

const collection = parseCollection(
  JSON.parse(readFileSync(new URL('../data/collection.json', import.meta.url), 'utf8')),
);
const illustrated = collection.games.filter((game) => game.artwork);
const sizes: readonly (readonly number[] | null)[] = coverSizes;
const assets = new Map(webAssets.map((asset) => [asset.file, asset]));

describe('native workbook cover derivatives', () => {
  it('keeps withoutEnlargement in the real preparation pipeline', () => {
    const script = readFileSync(new URL('./prepare-assets.ts', import.meta.url), 'utf8');
    const source = ts.createSourceFile('prepare-assets.ts', script, ts.ScriptTarget.Latest, true);
    const resize = sourceNodes(source, ts.isCallExpression).find(
      (call) => ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'resize',
    );
    const options = resize?.arguments[0];
    if (!options || !ts.isObjectLiteralExpression(options))
      throw new Error('The real resize call must have literal options.');
    const option = (name: string) =>
      options.properties.find(
        (property): property is ts.PropertyAssignment =>
          ts.isPropertyAssignment(property) && property.name.getText(source) === name,
      )?.initializer;
    expect(option('withoutEnlargement')?.kind).toBe(ts.SyntaxKind.TrueKeyword);
    const fit = option('fit');
    expect(fit && ts.isStringLiteral(fit) ? fit.text : undefined).toBe('inside');
  });

  it('has one size per rank, null only without workbook artwork, and one file record per cover', () => {
    expect(sizes).toHaveLength(collection.games.length);
    for (const game of collection.games) expect(sizes[game.rank - 1] === null).toBe(!game.artwork);
    expect(assets.size).toBe(illustrated.length);
    expect(webAssets).toHaveLength(illustrated.length);
  });

  it.each(illustrated)('$slug size matches its real WebP without enlarging the source', async (game) => {
    if (!game.artwork) throw new Error('The fixture must have mapped workbook artwork.');
    const original = fileURLToPath(new URL(`../data/${game.artwork.file}`, import.meta.url));
    const derivative = fileURLToPath(new URL(`../public/covers/${game.slug}.webp`, import.meta.url));
    const [input, output, file] = await Promise.all([
      sharp(original).metadata(),
      sharp(derivative).metadata(),
      stat(derivative),
    ]);
    if (!input.width || !input.height || !output.width || !output.height)
      throw new Error(`Missing image dimensions for ${game.slug}.`);
    const rotated = input.orientation !== undefined && input.orientation >= 5 && input.orientation <= 8;
    expect(output.width).toBeLessThanOrEqual(rotated ? input.height : input.width);
    expect(output.height).toBeLessThanOrEqual(rotated ? input.width : input.height);
    expect(output.format).toBe('webp');
    expect(sizes[game.rank - 1]).toEqual([output.width, output.height]);
    expect(assets.get(`${game.slug}.webp`)).toEqual({
      file: `${game.slug}.webp`,
      width: output.width,
      height: output.height,
      bytes: file.size,
    });
  });
});
