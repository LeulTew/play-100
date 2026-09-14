import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseCollection } from '../src/lib/collection';

const dataBytes = await readFile(path.join('data', 'collection.json'));
const publicBytes = await readFile(path.join('public', 'data', 'collection.json'));
if (!dataBytes.equals(publicBytes)) throw new Error('Public collection does not match the canonical collection.');
const collection = parseCollection(JSON.parse(dataBytes.toString('utf8')));
const canonicalWorkbook = await readFile(path.join('data', 'Play-100-Collection.xlsx'));
const publicWorkbook = await readFile(path.join('public', 'downloads', 'Play-100-Collection.xlsx'));
if (!canonicalWorkbook.equals(publicWorkbook)) throw new Error('The download is not the canonical enhanced workbook.');
if (publicWorkbook.subarray(0, 2).toString() !== 'PK') throw new Error('The workbook is not a valid ZIP-based XLSX container.');
const originalWorkbook = await readFile(path.join('public', 'downloads', 'AAA_games_u_have_to_play_list_top_100.xlsx'));
const manifest: unknown = JSON.parse(await readFile(path.join('data', 'artifact-manifest.json'), 'utf8'));
if (
  typeof manifest !== 'object' || manifest === null || !('source' in manifest) ||
  typeof manifest.source !== 'object' || manifest.source === null || !('sha256' in manifest.source) ||
  typeof manifest.source.sha256 !== 'string' ||
  createHash('sha256').update(originalWorkbook).digest('hex') !== manifest.source.sha256
) {
  throw new Error('The original workbook download does not match the untouched supplied file.');
}
for (const game of collection.games) {
  if (!game.artwork) continue;
  await stat(path.join('data', game.artwork.file));
  await stat(path.join('public', 'covers', `${game.slug}.webp`));
}
const covers = collection.games.filter((game) => game.artwork).length;
console.log(`Valid: 100 ordered games, 50 core + 50 essential, ${covers} supplied artworks, exact source/public JSON and workbook match.`);
console.log(`Workbook SHA-256: ${createHash('sha256').update(publicWorkbook).digest('hex')}`);
