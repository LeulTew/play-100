import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// This is a fetch hint, not catalog validation. The collector and seed tests validate the complete catalog.
export function discoveryArtworkPresenceJson(value: unknown): string {
  if (
    !value ||
    typeof value !== 'object' ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1 ||
    !('items' in value) ||
    !Array.isArray(value.items) ||
    value.items.length > 1000
  )
    throw new Error('Invalid artwork presence source.');
  const seen = new Set<string>();
  const ids: string[] = [];
  const items: unknown[] = value.items;
  for (const item of items) {
    if (
      !item ||
      typeof item !== 'object' ||
      !('record' in item) ||
      !item.record ||
      typeof item.record !== 'object' ||
      !('id' in item.record) ||
      typeof item.record.id !== 'string' ||
      !/^(wikidata:Q[1-9]\d{0,14}|freetogame:[1-9]\d{0,14})$/.test(item.record.id) ||
      seen.has(item.record.id) ||
      !('artwork' in item) ||
      (item.artwork !== null && (!item.artwork || typeof item.artwork !== 'object' || Array.isArray(item.artwork)))
    ) {
      throw new Error('Invalid or duplicate artwork presence record.');
    }
    seen.add(item.record.id);
    if (item.artwork !== null) ids.push(item.record.id);
  }
  return `${JSON.stringify(ids.sort())}\n`;
}

export function artworkPresencePath(root = ROOT): string {
  return path.join(root, 'src', 'lib', 'discovery-artwork-ids.json');
}

export async function writeArtworkPresence(value: unknown, root = ROOT): Promise<void> {
  const contents = discoveryArtworkPresenceJson(value);
  const destination = artworkPresencePath(root);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { flag: 'wx' });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--verify')) {
    throw new Error('Usage: node scripts/generate-discovery-artwork-presence.ts [--verify]');
  }
  const catalog: unknown = JSON.parse(
    await readFile(path.join(ROOT, 'public', 'data', 'discovery', 'catalog.v1.json'), 'utf8'),
  );
  if (args[0] === '--verify') {
    if ((await readFile(artworkPresencePath(), 'utf8')) !== discoveryArtworkPresenceJson(catalog))
      throw new Error('Artwork presence index is stale. Regenerate it from the checked-in catalog.');
  } else await writeArtworkPresence(catalog);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Artwork presence generation failed.');
    process.exitCode = 1;
  });
}
