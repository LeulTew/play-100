import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFirstPaintRecord, textDigest } from '../build-metadata.ts';
import type { FirstPaintRecord } from '../build-metadata.ts';
import { mainDocumentPolicy, withInlineHashes } from './csp.ts';

/**
 * `npm run csp:write` (docs/first-paint-shell.md): writes the hashes of the first-paint shell's inline style (both
 * header variants) and boot script into vercel.json's main-document Content-Security-Policy, from a build, instead of
 * by hand. It builds once with PLAY100_CSP_WRITE=1, which lets the build record hashes that vercel.json does not list
 * yet (any other policy problem still fails it), rewrites only those hashes, then builds again as usual: that build's
 * guard confirms the result, and its output embeds the new policy for the documents the service worker serves.
 */

/** vercel.json's text with the record's hashes in its main-document policy, and every other byte as it was. */
export function writeFirstPaintHashes(text: string, record: Pick<FirstPaintRecord, 'script' | 'styles'>): string {
  const policy = mainDocumentPolicy(JSON.parse(text));
  const next = withInlineHashes(policy, {
    script: [record.script.source],
    style: [record.styles.online.source, record.styles.offline.source],
  });
  if (next === policy) return text;
  const literal = JSON.stringify(policy);
  const at = text.indexOf(literal);
  if (at < 0 || text.includes(literal, at + literal.length))
    throw new Error('vercel.json must write its main-document Content-Security-Policy value once, as a plain string.');
  const updated = `${text.slice(0, at)}${JSON.stringify(next)}${text.slice(at + literal.length)}`;
  if (mainDocumentPolicy(JSON.parse(updated)) !== next) throw new Error('vercel.json did not take the new policy.');
  return updated;
}

/** Runs `vite build` with this environment, failing when the build does. */
export type BuildRunner = (environment: NodeJS.ProcessEnv) => void | Promise<void>;

function viteBuild(environment: NodeJS.ProcessEnv): void {
  const vite = path.join(path.dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin', 'vite.js');
  const result = spawnSync(process.execPath, [vite, 'build'], { stdio: 'inherit', env: environment });
  if (result.status !== 0)
    throw new Error(`vite build failed (${result.status ?? result.signal ?? 'no exit status'}).`);
}

/** Writes this build's first-paint hashes into vercel.json; returns whether it changed the file. */
export async function writeCsp(
  root: string,
  build: BuildRunner = viteBuild,
  log: (message: string) => void = console.log,
): Promise<boolean> {
  const environment = { ...process.env };
  delete environment.PLAY100_CSP_WRITE;
  await build({ ...environment, PLAY100_CSP_WRITE: '1' });
  const output = path.join(root, 'dist');
  const record = await readFirstPaintRecord(output);
  if (record.indexHtml.source !== textDigest(await readFile(path.join(output, 'index.html'), 'utf8')).source)
    throw new Error('The first-paint record belongs to another build than dist/index.html.');
  const file = path.join(root, 'vercel.json');
  const text = await readFile(file, 'utf8');
  const next = writeFirstPaintHashes(text, record);
  if (next === text) {
    log('vercel.json already allows the first-paint shell of this build.');
    return false;
  }
  await writeFile(file, next);
  log(
    `vercel.json now allows the boot script ${record.script.source} and the inline styles ${record.styles.online.source} (online) and ${record.styles.offline.source} (offline). Building again to check it.`,
  );
  await build(environment);
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void writeCsp(process.cwd()).catch((cause: unknown) => {
    console.error('csp:write failed:', cause instanceof Error ? cause.message : 'Unknown error.');
    process.exitCode = 1;
  });
}
