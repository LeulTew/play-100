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
  const browserIcons = await renderBrowserIcons(root);
  await mkdir(path.join(output, 'pwa'), { recursive: true });
  for (const icon of icons) await writeFile(path.join(output, 'pwa', icon.file), icon.bytes);
  for (const icon of browserIcons) await writeFile(path.join(output, ...icon.file.split('/')), icon.bytes);
  return icons;
}

export async function renderBrowserIcons(root: string) {
  const source = await readFile(path.join(root, 'public', 'favicon.svg'));
  const png = await sharp(source, { density: 576 })
    .resize(32, 32)
    .flatten({ background: '#f3f3e9' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = 32;
  header[7] = 32;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return [
    { file: 'pwa/icon-32.png', size: 32, bytes: png },
    { file: 'favicon.ico', size: 32, bytes: Buffer.concat([header, png]) },
  ];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  writePwaIcons(root, path.join(root, 'public'))
    .then(async (icons) => {
      const files = [
        ...icons.map(({ file, size, maskable, bytes }) => ({ file: `pwa/${file}`, size, maskable, bytes })),
        ...(await renderBrowserIcons(root)),
      ];
      console.log(
        JSON.stringify(
          files.map(({ file, size, bytes }) => ({
            file,
            size,
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
