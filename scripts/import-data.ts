import { cp, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseCollection } from '../src/lib/collection';

const input = process.argv[2];
if (!input) throw new Error('Usage: npm run import:data -- <canonical-output-directory>');
const source = path.resolve(input);
const project = process.cwd();
if (source === project || source.startsWith(`${project}${path.sep}`)) {
  throw new Error('Import from a separate canonical output directory, not this project.');
}
const collection = parseCollection(JSON.parse(await readFile(path.join(source, 'collection.json'), 'utf8')));
await stat(path.join(source, 'Play-100-Collection.xlsx'));
await stat(path.join(source, 'artifact-manifest.json'));
for (const game of collection.games) {
  if (game.artwork) await stat(path.join(source, game.artwork.file));
}
await mkdir(path.join(project, 'data'), { recursive: true });
for (const name of [
  'collection.json', 'Play-100-Collection.xlsx', 'artifact-manifest.json', 'source-audit.json',
  'generate_collection.py', 'requirements.txt', 'test_collection.py', 'assets',
  'author.json',
]) {
  await cp(path.join(source, name), path.join(project, 'data', name), { recursive: true });
}
await mkdir(path.join(project, 'public', 'data'), { recursive: true });
await mkdir(path.join(project, 'public', 'downloads'), { recursive: true });
await cp(path.join(source, 'collection.json'), path.join(project, 'public', 'data', 'collection.json'));
await cp(path.join(source, 'Play-100-Collection.xlsx'), path.join(project, 'public', 'downloads', 'Play-100-Collection.xlsx'));
console.log(`Imported ${collection.games.length} canonical games, ${collection.games.filter((game) => game.artwork).length} source artworks, workbook and reproduction material.`);
