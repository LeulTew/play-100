import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { requireObject, requireText } from '../src/lib/guards.js';

export const LEAN_CHECKS = [
  'static',
  'units',
  'configured-build',
  'configured-csp',
  'configured-budgets',
  'offline-build',
  'offline-csp',
  'offline-budgets',
  'e2e-production',
  'e2e-development',
  'e2e-offline',
  'films-download',
  'cloud-rules',
  'cloud-ui-desktop',
  'cloud-ui-mobile',
  'floor-smoke',
  'sw-probe',
  'rollback-drill',
  'apb2',
  'test-lab',
  'ios-safari',
  'screen-reader',
  'gitleaks',
  'npm-audit',
  'npm-signatures',
] as const;
type LeanCheck = (typeof LEAN_CHECKS)[number];
interface Evidence {
  check: LeanCheck;
  file: string;
  tree: string;
  sha256: string;
  bytes: number;
  recordedAt: string;
  result: 'passed' | 'failed' | 'review-required';
  attempt?: number;
}
const hash = (content: Buffer) => createHash('sha256').update(content).digest('hex');
const fullTree = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
function parseJson(content: Buffer): unknown {
  try {
    return JSON.parse(content.toString('utf8'));
  } catch (cause) {
    throw new Error('Invalid JSON in lean evidence; parser excerpts are not logged.', { cause });
  }
}

export function parseLeanEvidence(input: unknown, tree: string): Evidence[] {
  const index = requireObject(input);
  if (index.schemaVersion !== 1 || index.tree !== tree || !fullTree(tree) || !Array.isArray(index.evidence))
    throw new Error('Lean evidence index must have schemaVersion 1 and the full candidate tree.');
  const evidence = index.evidence.map((input): Evidence => {
    const row = requireObject(input);
    const check = LEAN_CHECKS.find((name) => name === row.check);
    if (!check) throw new Error('Unknown lean evidence check.');
    if (!fullTree(row.tree) || row.tree !== tree) throw new Error(`${check}: evidence was recorded on another tree.`);
    if (typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sha256))
      throw new Error(`${check}: missing SHA-256 recorded with the evidence.`);
    if (typeof row.bytes !== 'number' || !Number.isSafeInteger(row.bytes) || row.bytes < 1)
      throw new Error(`${check}: evidence size must be a positive byte count.`);
    const recordedAt = requireText(row.recordedAt);
    if (
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(recordedAt) ||
      !Number.isFinite(Date.parse(recordedAt)) ||
      new Date(recordedAt).toISOString() !== recordedAt
    )
      throw new Error(`${check}: record the evidence time in UTC.`);
    if (row.result !== 'passed' && row.result !== 'failed' && row.result !== 'review-required')
      throw new Error(`${check}: missing evidence result.`);
    if (row.result === 'review-required' && check !== 'npm-audit')
      throw new Error(`${check}: only a dependency audit can require advisory review.`);
    if (row.result === 'failed' && check !== 'films-download')
      throw new Error(`${check}: failed evidence stops release.`);
    if (check === 'films-download' ? row.attempt !== 1 && row.attempt !== 2 : row.attempt !== undefined)
      throw new Error(`${check}: only FLAKE-01 permits numbered attempts 1 and 2.`);
    return {
      check,
      file: requireText(row.file),
      tree: row.tree,
      sha256: row.sha256,
      bytes: row.bytes,
      recordedAt,
      result: row.result,
      ...(row.attempt === 1 || row.attempt === 2 ? { attempt: row.attempt } : {}),
    };
  });
  for (const check of LEAN_CHECKS)
    if (!evidence.some((row) => row.check === check)) throw new Error(`Missing required lean evidence: ${check}.`);
  const films = evidence.filter((row) => row.check === 'films-download').sort((a, b) => a.attempt! - b.attempt!);
  if (films.length === 1) {
    if (films[0]!.attempt !== 1 || films[0]!.result !== 'passed')
      throw new Error('FLAKE-01 requires a passing first attempt or both attempts.');
  } else if (
    films.length !== 2 ||
    films[0]!.attempt !== 1 ||
    films[0]!.result !== 'failed' ||
    films[1]!.attempt !== 2 ||
    films[1]!.result !== 'passed'
  ) {
    throw new Error('FLAKE-01 permits only one failed attempt followed by one passing rerun.');
  }
  return evidence;
}

async function regularFile(file: string): Promise<Buffer> {
  if (!(await lstat(file)).isFile()) throw new Error('Evidence must be a regular file, not a symlink or directory.');
  return readFile(file);
}
function verifyEmbeddedTree(content: Buffer, file: string, tree: string) {
  const declared: unknown[] = [];
  if (path.extname(file).toLowerCase() === '.json') {
    const value = parseJson(content);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const report = requireObject(value);
      if (report.tree !== undefined) declared.push(report.tree);
      if (report.source && typeof report.source === 'object' && !Array.isArray(report.source)) {
        const source = requireObject(report.source);
        if (source.tree !== undefined) declared.push(source.tree);
      }
    }
  } else if (/\.(?:txt|log)$/i.test(file)) {
    for (const match of content.toString('utf8').matchAll(/^tree:\s*(\S+)\s*$/gm)) declared.push(match[1]);
  }
  if (declared.some((value) => value !== tree))
    throw new Error('Evidence file declares another tree; the index cannot override its provenance.');
}
function git(root: string, ...args: string[]) {
  return execFileSync('git', ['--no-optional-locks', '-c', 'gc.auto=0', ...args], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}
function sourceIdentity(root: string) {
  const sha = git(root, 'rev-parse', 'HEAD');
  const tree = git(root, 'rev-parse', 'HEAD^{tree}');
  if (!fullTree(sha) || !fullTree(tree) || git(root, 'status', '--porcelain', '--untracked-files=all'))
    throw new Error('Lean release manifests require a clean committed candidate.');
  return { sha, tree };
}
function outside(root: string, file: string) {
  const relative = path.relative(root, file);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)))
    throw new Error('Keep lean release evidence and the manifest outside the checkout.');
}

export async function collectLeanManifest(root: string, output: string, input: string) {
  const source = sourceIdentity(root);
  const checkout = await realpath(root);
  const target = path.resolve(root, output);
  outside(checkout, path.join(await realpath(path.dirname(target)), path.basename(target)));
  const indexPath = path.resolve(root, input);
  outside(checkout, await realpath(indexPath));
  const indexBytes = await regularFile(indexPath);
  const rows = parseLeanEvidence(parseJson(indexBytes), source.tree);
  const portable = (file: string) => path.relative(path.dirname(target), file).split(path.sep).join('/');
  const seen = new Set<string>();
  const evidence = [];
  for (const row of rows) {
    const file = path.resolve(path.dirname(indexPath), row.file);
    const identity = await realpath(file);
    outside(checkout, identity);
    if (seen.has(identity)) throw new Error('Each evidence file must be listed exactly once.');
    seen.add(identity);
    const bytes = await regularFile(file);
    if (bytes.length !== row.bytes || hash(bytes) !== row.sha256)
      throw new Error(`${row.check}: evidence bytes changed since they were recorded.`);
    verifyEmbeddedTree(bytes, file, source.tree);
    evidence.push({ ...row, file: portable(file) });
  }
  const fingerprints = [];
  for (const file of ['package-lock.json', 'docs/intermittents.md']) {
    const content = await regularFile(path.join(root, file));
    fingerprints.push({ path: file, sha256: hash(content), bytes: content.length });
  }
  if (JSON.stringify(sourceIdentity(root)) !== JSON.stringify(source))
    throw new Error('Candidate identity changed during manifest collection.');
  if (!indexBytes.equals(await regularFile(indexPath))) throw new Error('Evidence index changed during collection.');
  return {
    schemaVersion: 1,
    mode: 'lean',
    collectedAt: new Date().toISOString(),
    source,
    fingerprints,
    evidenceIndex: { file: portable(indexPath), sha256: hash(indexBytes), bytes: indexBytes.length, tree: source.tree },
    evidence,
    reviewRequired: evidence.some((row) => row.result === 'review-required'),
  };
}

export async function writeLeanManifest(root: string, output: string, index: string) {
  const manifest = await collectLeanManifest(root, output, index);
  await writeFile(path.resolve(root, output), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
}
