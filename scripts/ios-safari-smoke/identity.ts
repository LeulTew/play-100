import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { productionOrigin, targetOrigin } from './target.ts';

export async function fetchTargetIdentity(
  value: string,
  request: typeof fetch = fetch,
  now: () => Date = () => new Date(),
) {
  const origin = targetOrigin(value);
  const response = await request(`${origin}/`, {
    headers: { Accept: 'text/html', 'Cache-Control': 'no-cache' },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(45_000),
  });
  assert.ok(response.ok, `Target index fetch failed: HTTP ${response.status} at ${origin}/`);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html(?:;|$)/i, 'The target must serve HTML.');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length, 'The target index must not be empty.');
  return {
    origin,
    fetchedAtUtc: now().toISOString(),
    indexHtmlSha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  };
}

if (process.argv[1]?.endsWith('identity.ts')) {
  const identity = await fetchTargetIdentity(process.env.IOS_TARGET_ORIGIN ?? productionOrigin);
  await mkdir('ios-safari-artifacts', { recursive: true });
  await writeFile('ios-safari-artifacts/target-identity.json', `${JSON.stringify(identity, null, 2)}\n`);
  console.log(JSON.stringify(identity));
}
