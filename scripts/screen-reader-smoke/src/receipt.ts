/**
 * Records what the screen readers were pointed at: the validated origin and the SHA-256 of the index.html it served.
 * Run with `node src/receipt.ts` (Node strips the types). Writes artifacts/<reader>/receipt.json.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateOrigin } from './speech.ts';

const reader = process.env.SR_READER ?? 'unknown';
const origin = validateOrigin(process.env.TARGET_ORIGIN);
const url = `${origin}/index.html`;

const response = await fetch(url, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
const body = Buffer.from(await response.arrayBuffer());
if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`);

const receipt = {
  reader,
  targetOrigin: origin,
  indexUrl: url,
  finalUrl: response.url,
  status: response.status,
  indexSha256: createHash('sha256').update(body).digest('hex'),
  indexBytes: body.length,
  fetchedAt: new Date().toISOString(),
  gitSha: process.env.GITHUB_SHA,
  // Set when the workflow built and served this commit on 127.0.0.1 instead of testing a deployed origin.
  servedCommit: process.env.CANDIDATE_SHA || undefined,
  runUrl: process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : undefined,
};

const directory = join('artifacts', reader);
await mkdir(directory, { recursive: true });
await writeFile(join(directory, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
