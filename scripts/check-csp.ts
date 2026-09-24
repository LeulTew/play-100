import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cspProblems, inlineBlocks, mainDocumentPolicy } from './first-paint/csp.ts';
import type { CspDocument } from './first-paint/csp.ts';

/**
 * Read-only acceptance gate for a finished build (docs/first-paint-shell.md): every HTML document
 * in dist must work under the main-document policy in vercel.json, and dist/pwa-assets.json must
 * embed that same policy for the documents the service worker serves. It prints every inline
 * <script> and <style> with its CSP hash so two builds can be compared.
 */

async function htmlDocuments(root: string, relative = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await htmlDocuments(root, name)));
    else if (entry.isFile() && name.endsWith('.html')) files.push(name);
  }
  return files.sort();
}

export function emittedDocumentPolicy(manifest: unknown): string | null {
  if (!manifest || typeof manifest !== 'object' || !('documentPolicy' in manifest)) return null;
  const policy: unknown = manifest.documentPolicy;
  if (!policy || typeof policy !== 'object' || !('headers' in policy) || !Array.isArray(policy.headers)) return null;
  const header: unknown = policy.headers.find(
    (entry: unknown) =>
      Boolean(entry) && typeof entry === 'object' && (entry as { name?: unknown }).name === 'content-security-policy',
  );
  const value = header && typeof header === 'object' ? (header as { value?: unknown }).value : undefined;
  return typeof value === 'string' ? value : null;
}

export async function checkCsp(root: string, configuration: unknown): Promise<{ lines: string[]; problems: string[] }> {
  const policy = mainDocumentPolicy(configuration);
  const documents: CspDocument[] = [];
  for (const name of await htmlDocuments(root))
    documents.push({ name, html: await readFile(path.join(root, ...name.split('/')), 'utf8') });
  if (!documents.some((entry) => entry.name === 'index.html'))
    throw new Error(`No index.html in ${root}. Build before checking the CSP.`);
  // One build holds one shell variant, so stale style hashes are left to the build, which knows both.
  const problems = cspProblems(documents, policy, { otherVariantStyles: 'unchecked' });
  const emitted = emittedDocumentPolicy(JSON.parse(await readFile(path.join(root, 'pwa-assets.json'), 'utf8')));
  if (emitted !== policy)
    problems.push(
      'pwa-assets.json embeds a different content-security-policy than vercel.json for the documents the service worker serves.',
    );
  const lines = documents.flatMap((entry) =>
    inlineBlocks(entry.html).map(
      (block, index) => `${entry.name} inline ${block.kind} #${index}: ${block.bytes} B ${block.source}`,
    ),
  );
  return { lines, problems };
}

async function main() {
  const { lines, problems } = await checkCsp(path.resolve('dist'), JSON.parse(await readFile('vercel.json', 'utf8')));
  for (const line of lines) console.log(line);
  if (!lines.length) console.log('No inline <script> or <style> in the built documents.');
  if (problems.length) {
    for (const problem of problems) console.error(`CSP: ${problem}`);
    process.exitCode = 1;
  } else
    console.log(
      'CSP: every built document matches the vercel.json main-document policy and the emitted offline policy.',
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((cause: unknown) => {
    console.error('CSP check failed:', cause instanceof Error ? cause.message : 'Unknown error.');
    process.exitCode = 1;
  });
}
