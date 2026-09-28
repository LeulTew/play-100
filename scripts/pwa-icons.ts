import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  return Promise.all(
    PWA_ICONS.map(async (icon) => {
      const bytes = await sharp(icon.maskable ? maskable : standard, { density: 576 })
        .resize(icon.size, icon.size)
        .flatten({ background: '#f3f3e9' })
        .png({ compressionLevel: 9 })
        .toBuffer();
      if (bytes.length > 24 * 1024) throw new Error(`${icon.file} exceeds the 24 KiB icon budget.`);
      return { ...icon, bytes };
    }),
  );
}

export async function writePwaIcons(root: string, output: string) {
  const icons = await renderPwaIcons(root);
  await mkdir(path.join(output, 'pwa'), { recursive: true });
  for (const icon of icons) await writeFile(path.join(output, 'pwa', icon.file), icon.bytes);
  return icons;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  writePwaIcons(root, path.join(root, 'public'))
    .then((icons) => {
      console.log(
        JSON.stringify(
          icons.map(({ file, size, maskable, bytes }) => ({
            file,
            size,
            maskable,
            bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          })),
          null,
          2,
        ),
      );
    })
    .catch((cause: unknown) => {
      console.error('PWA icon generation failed.', cause);
      process.exitCode = 1;
    });
}
