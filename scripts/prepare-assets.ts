import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { parseCollection } from '../src/lib/collection';

const project = process.cwd();
const collection = parseCollection(JSON.parse(await readFile(path.join(project, 'data', 'collection.json'), 'utf8')));
const output = path.join(project, 'public', 'covers');
await mkdir(output, { recursive: true });
const assets: { file: string; width: number; height: number; bytes: number }[] = [];
const metadata: Record<string, { width: number; height: number }> = {};
for (const game of collection.games) {
  if (!game.artwork) continue;
  const original = path.join(project, 'data', game.artwork.file);
  const file = `${game.slug}.webp`;
  const info = await sharp(original).rotate().resize({ width: 480, height: 720, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 86, effort: 5 }).toFile(path.join(output, file));
  assets.push({ file, width: info.width, height: info.height, bytes: info.size });
  metadata[game.slug] = { width: info.width, height: info.height };
}
await writeFile(path.join(project, 'data', 'web-assets.json'), `${JSON.stringify(assets, null, 2)}\n`);
await mkdir(path.join(project, 'src', 'generated'), { recursive: true });
await writeFile(path.join(project, 'src', 'generated', 'cover-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
await sharp(path.join(project, 'public', 'social-card.svg')).png().toFile(path.join(project, 'public', 'social-card.png'));
const notices = path.join(project, 'public', 'licenses');
await mkdir(notices, { recursive: true });
for (const [source, target] of [
  ['third-party/react-bits/LICENSE.md', 'react-bits.txt'],
  ['third-party/firebase/sdk-LICENSE.txt', 'firebase.txt'],
  ['third-party/google-sign-in.txt', 'google-sign-in.txt'],
  ['node_modules/@fontsource/barlow-condensed/LICENSE', 'barlow-condensed.txt'],
  ['node_modules/@fontsource-variable/hanken-grotesk/LICENSE', 'hanken-grotesk.txt'],
  ['node_modules/react/LICENSE', 'react.txt'],
  ['node_modules/three/LICENSE', 'three.txt'],
  ['node_modules/motion/LICENSE.md', 'motion.txt'],
  ['node_modules/@dnd-kit/core/LICENSE', 'dnd-kit-core.txt'],
  ['node_modules/@dnd-kit/sortable/LICENSE', 'dnd-kit-sortable.txt'],
  ['node_modules/@dnd-kit/utilities/LICENSE', 'dnd-kit-utilities.txt'],
]) {
  if (!source || !target) throw new Error('Invalid license copy entry.');
  await copyFile(path.join(project, source), path.join(notices, target));
}
console.log(`Prepared ${assets.length} native-size WebP thumbnails, social image and public third-party licenses. No source image enlarged.`);
