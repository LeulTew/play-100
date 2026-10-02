import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { redactOAuthUrls } from './google.ts';

const directory = process.argv[2];
if (!directory) throw new Error('An artifact directory is required.');
for (const entry of await readdir(directory, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(?:log|xml|json)$/.test(entry.name)) continue;
  const path = join(directory, entry.name);
  const text = await readFile(path, 'utf8');
  await writeFile(path, redactOAuthUrls(text));
}
