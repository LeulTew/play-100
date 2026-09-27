import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { collectionFilms } from '../src/lib/films.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const FILM_THUMBNAIL_WIDTHS = [160, 240, 320, 480, 640] as const;
export const FILM_THUMBNAIL_MAX_BYTES = 24 * 1024;
const WEBP = { quality: 76, effort: 6 } as const;
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export async function renderFilmThumbnails(input: Buffer, width: number, height: number) {
  const original = await sharp(input, { failOn: 'warning' }).metadata();
  if (original.format !== 'jpeg' || original.width !== width || original.height !== height || width < 640) {
    throw new Error('The film poster must match its recorded JPEG dimensions and support the 640px candidate.');
  }
  const output = [];
  for (const target of FILM_THUMBNAIL_WIDTHS) {
    const { data, info } = await sharp(input, { failOn: 'warning' })
      .resize({ width: target, withoutEnlargement: true })
      .webp(WEBP)
      .toBuffer({ resolveWithObject: true });
    if (
      info.width !== target ||
      info.height !== Math.round((height * target) / width) ||
      data.length > FILM_THUMBNAIL_MAX_BYTES
    ) {
      throw new Error(`Film thumbnail ${target}px exceeds its dimensions or 24 KiB budget; review encoding settings.`);
    }
    const sha256 = digest(data);
    output.push({
      data,
      asset: {
        src: `/videos/thumbnails/${sha256}.webp`,
        width: info.width,
        height: info.height,
        bytes: data.length,
        sha256,
      },
    });
  }
  return output;
}

export async function generateFilmThumbnails(root = ROOT, verify = false) {
  const entries = [];
  const assets = new Map<string, Buffer>();
  for (const film of [...collectionFilms].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
    const filename = /^\/videos\/([a-f0-9]{64})\.jpg$/.exec(film.poster.src);
    if (!filename) throw new Error(`Unsafe or non-hashed poster path for ${film.id}.`);
    const source = await readFile(path.join(root, 'public', 'videos', `${filename[1]}.jpg`));
    if (digest(source) !== filename[1]) throw new Error(`Original poster checksum changed for ${film.id}.`);
    const thumbnails = await renderFilmThumbnails(source, film.poster.width, film.poster.height);
    for (const { data, asset } of thumbnails) assets.set(path.basename(asset.src), data);
    entries.push([
      film.id,
      {
        source: { ...film.poster, bytes: source.length, sha256: filename[1], credits: film.credits },
        candidates: thumbnails.map(({ asset }) => asset),
      },
    ]);
  }
  const manifest = {
    schemaVersion: 1,
    encoder: { sharp: sharp.versions.sharp, vips: sharp.versions.vips },
    transform: { format: 'webp', ...WEBP, withoutEnlargement: true, widths: FILM_THUMBNAIL_WIDTHS },
    films: Object.fromEntries(entries),
  };
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  const directory = path.join(root, 'public', 'videos', 'thumbnails');
  const metadata = path.join(root, 'src', 'generated', 'film-thumbnails.json');
  if (verify) {
    if ((await readFile(metadata, 'utf8')) !== json) {
      throw new Error('Film thumbnail manifest is stale; regenerate it.');
    }
    for (const [filename, data] of assets) {
      if (!(await readFile(path.join(directory, filename))).equals(data)) {
        throw new Error(`Film thumbnail is missing, stale or corrupt: ${filename}`);
      }
    }
  } else {
    await mkdir(directory, { recursive: true });
    await mkdir(path.dirname(metadata), { recursive: true });
    for (const [filename, data] of assets) {
      const temporary = path.join(directory, `.${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, data, { flag: 'wx' });
        const destination = path.join(directory, filename);
        try {
          await link(temporary, destination);
        } catch (error) {
          if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
          if (!(await readFile(destination)).equals(data)) {
            throw new Error(`Refusing to overwrite a corrupt content-hashed thumbnail: ${filename}`);
          }
        }
      } finally {
        await rm(temporary, { force: true });
      }
    }
    const temporary = `${metadata}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, json, { flag: 'wx' });
      await rename(temporary, metadata);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return {
    ...manifest,
    uniqueFiles: assets.size,
    totalBytes: [...assets.values()].reduce((sum, data) => sum + data.length, 0),
    manifestSha256: digest(Buffer.from(json)),
    verified: verify,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--verify')) {
    throw new Error('Usage: tsx scripts/generate-film-thumbnails.ts [--verify]');
  }
  console.log(JSON.stringify(await generateFilmThumbnails(ROOT, args[0] === '--verify'), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Film thumbnail generation failed.');
    process.exitCode = 1;
  });
}
