/**
 * Read-only acceptance gate for a finished build (docs/first-paint-shell.md): every HTML document
 * in dist must work under the main-document policy in vercel.json, and dist/pwa-assets.json must
 * embed that same policy for the documents the service worker serves. It prints every inline
 * <script> and <style> with its CSP hash so two builds can be compared.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cspProblems, directiveSources, inlineBlocks, mainDocumentPolicy } from './first-paint/csp.ts';
import type { CspDocument } from './first-paint/csp.ts';
import { expectedDocumentHeaders } from './release-verify.ts';
import { MAIN_DOCUMENT_RULE } from './first-paint/csp.ts';

export function authHeaderCoverageProblems(configuration: unknown): string[] {
  if (
    !configuration ||
    typeof configuration !== 'object' ||
    !('headers' in configuration) ||
    !Array.isArray(configuration.headers)
  )
    return ['No deployment header rules were provided.'];
  const rules = configuration.headers.filter(
    (rule: unknown): rule is { source: string } =>
      !!rule && typeof rule === 'object' && 'source' in rule && typeof rule.source === 'string',
  );
  const matches = (pathname: string) => rules.filter((rule) => new RegExp(`^${rule.source}$`).test(pathname));
  const problems: string[] = [];
  for (const pathname of ['/__/auth/unknown', '/__/auth/', '/__/auth/handler/child', '/__/auth/handler.js.map']) {
    if (!matches(pathname).some((rule: { source: string }) => rule.source === MAIN_DOCUMENT_RULE))
      problems.push(`${pathname} must receive the main document security headers.`);
  }
  for (const pathname of ['/__/auth/handler', '/__/auth/iframe'])
    if (matches(pathname).length) problems.push(`${pathname} must keep its function-owned nonce headers only.`);
  for (const name of ['handler', 'iframe', 'experiments']) {
    const rules = matches(`/__/auth/${name}.js`);
    if (rules.length !== 1 || rules[0].source !== '/__/auth/(handler|iframe|experiments)\\.js')
      problems.push(`/__/auth/${name}.js must keep only the helper script headers.`);
  }
  return problems;
}

export function reportingProblems(configuration: unknown): string[] {
  const headers = expectedDocumentHeaders(configuration);
  const policy = headers['content-security-policy']!;
  return headers['reporting-endpoints'] === 'csp="/api/csp-report"' &&
    JSON.stringify(directiveSources(policy, 'report-to')) === '["csp"]' &&
    JSON.stringify(directiveSources(policy, 'report-uri')) === '["/api/csp-report"]'
    ? []
    : ['CSP reports must use the first-party csp endpoint and report-uri fallback.'];
}

async function htmlDocuments(root: string, relative = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await htmlDocuments(root, name)));
    else if (entry.isFile() && name.endsWith('.html')) files.push(name);
  }
  return files.sort();
}

function emittedDocumentHeader(manifest: unknown, name: string): string | null {
  if (!manifest || typeof manifest !== 'object' || !('documentPolicy' in manifest)) return null;
  const policy: unknown = manifest.documentPolicy;
  if (!policy || typeof policy !== 'object' || !('headers' in policy) || !Array.isArray(policy.headers)) return null;
  const header: unknown = policy.headers.find(
    (entry: unknown) => Boolean(entry) && typeof entry === 'object' && (entry as { name?: unknown }).name === name,
  );
  const value = header && typeof header === 'object' ? (header as { value?: unknown }).value : undefined;
  return typeof value === 'string' ? value : null;
}

export function emittedDocumentPolicy(manifest: unknown): string | null {
  return emittedDocumentHeader(manifest, 'content-security-policy');
}

export async function checkCsp(root: string, configuration: unknown): Promise<{ lines: string[]; problems: string[] }> {
  const policy = mainDocumentPolicy(configuration);
  const documents: CspDocument[] = [];
  for (const name of await htmlDocuments(root))
    documents.push({ name, html: await readFile(path.join(root, ...name.split('/')), 'utf8') });
  if (!documents.some((entry) => entry.name === 'index.html'))
    throw new Error(`No index.html in ${root}. Build before checking the CSP.`);
  // Vercel serves 404.html for unknown paths under the same main-document policy.
  if (!documents.some((entry) => entry.name === '404.html'))
    throw new Error(`No 404.html in ${root}. Build before checking the CSP.`);
  // One build holds one shell variant, so stale style hashes are left to the build, which knows both.
  const problems = cspProblems(documents, policy, { otherVariantStyles: 'unchecked' });
  problems.push(...reportingProblems(configuration));
  problems.push(...authHeaderCoverageProblems(configuration));
  const manifest: unknown = JSON.parse(await readFile(path.join(root, 'pwa-assets.json'), 'utf8'));
  const emitted = emittedDocumentPolicy(manifest);
  if (emitted !== policy)
    problems.push(
      'pwa-assets.json embeds a different content-security-policy than vercel.json for the documents the service worker serves.',
    );
  if (
    emitted &&
    directiveSources(emitted, 'report-to') !== null &&
    (JSON.stringify(directiveSources(emitted, 'report-to')) !== '["csp"]' ||
      emittedDocumentHeader(manifest, 'reporting-endpoints') !== 'csp="/api/csp-report"')
  )
    problems.push('pwa-assets.json must retain the first-party Reporting-Endpoints header for CSP report-to.');
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
