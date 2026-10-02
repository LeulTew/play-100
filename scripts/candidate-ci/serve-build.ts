import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Candidate CI (docs/release-operations.md, "Candidate CI runs"): serves a candidate's dist/ through the candidate's
 * own low-end-profile server (HTTPS with HTTP/2, Brotli and the vercel.json rewrites and headers, as production serves
 * it). Run with the candidate's tsx from the candidate checkout: `tsx serve-build.ts <origin-file>`. It writes the
 * origin to <origin-file> and stays up until the job ends.
 */

type LowEndProfile = typeof import('../low-end-profile.ts');

export async function main(originFile: string, candidate = process.cwd()) {
  const module = pathToFileURL(path.join(candidate, 'scripts', 'low-end-profile.ts')).href;
  const { serve } = (await import(module)) as LowEndProfile;
  const root = path.join(candidate, 'dist');
  const server = await serve(root);
  writeFileSync(originFile, `${server.origin}\n`);
  console.log(`Serving ${root} at ${server.origin}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const originFile = process.argv[2];
  if (!originFile) throw new Error('Pass the file to write the server origin to.');
  await main(originFile);
}
