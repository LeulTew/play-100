import { readFile } from 'node:fs/promises';

const origin = 'http://127.0.0.1:8188';
const project = 'demo-play100';
function field(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, field(item)])) } };
}
async function write(path, data) {
  const response = await fetch(`${origin}/v1/projects/${project}/databases/(default)/documents/${path}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, field(value)])) }),
  });
  if (!response.ok) throw new Error(`Isolated emulator fixture setup failed: HTTP ${response.status}.`);
}
const collection = JSON.parse(await readFile(new URL('../public/data/collection.json', import.meta.url), 'utf8'));
await write('_owner/config', { email: 'creator@play100.test' });
await write('ownerAccess/status', { enabled: true });
await write('catalog/author', { records: Object.fromEntries(collection.games.map((game) => [game.slug, { title: game.title, year: game.year }])) });
console.log('Seeded only demo-play100 emulator authorization and trusted canonical metadata. No users or public profiles were created.');
