import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('includes every root API entry in the independent Functions typecheck', async () => {
  const root = new URL('../', import.meta.url);
  const entries = (await readdir(new URL('api/', root), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !/\.(?:test|spec)\.ts$/.test(entry.name))
    .map((entry) => `api/${entry.name}`)
    .sort();
  const configuration = JSON.parse(await readFile(fileURLToPath(new URL('tsconfig.functions.json', root)), 'utf8'));
  expect(entries.length).toBeGreaterThan(0);
  expect(configuration.files).toEqual(expect.arrayContaining(entries));
});
