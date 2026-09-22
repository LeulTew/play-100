import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const PWA_ICONS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-192.png', size: 192, maskable: true },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
] as const;

export async function renderPwaIcons(root: string) {
  const standard = await readFile(path.join(root, 'public', 'favicon.svg'));
  const maskable = await readFile(path.join(root, 'public', 'pwa', 'icon-source.svg'));
  return Promise.all(PWA_ICONS.map(async icon => ({
    ...icon,
    bytes: await sharp(icon.maskable ? maskable : standard, { density: 576 })
      .resize(icon.size, icon.size).flatten({ background: '#d3f36b' })
      .png({ compressionLevel: 9 }).toBuffer(),
  })));
}

export async function writePwaIcons(root: string, output: string) {
  const icons = await renderPwaIcons(root);
  await mkdir(path.join(output, 'pwa'), { recursive: true });
  for (const icon of icons) await writeFile(path.join(output, 'pwa', icon.file), icon.bytes);
  return icons;
}
