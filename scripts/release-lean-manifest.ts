import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { requireObject, requireText } from '../src/lib/guards.js';
import { evidenceFileExists, fullGitId, type EvidenceSource } from './release-evidence';

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
  identity?: string;
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
      ...(row.identity === undefined ? {} : { identity: requireText(row.identity) }),
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
function verifyIdentity(input: unknown, source: EvidenceSource) {
  const value = requireObject(input);
  const commit = value.commit ?? value.sha;
  if (
    !fullGitId(commit) ||
    !fullGitId(value.tree) ||
    commit !== source.commit ||
    value.tree !== source.tree ||
    (value.sha !== undefined && value.sha !== source.commit)
  )
    throw new Error('Evidence declares another or incomplete commit/tree; the index cannot override its provenance.');
}
function verifyEmbeddedIdentity(content: Buffer, file: string, source: EvidenceSource) {
  let found = false;
  const check = (input: unknown) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return;
    const value = requireObject(input);
    if (value.tree !== undefined || value.commit !== undefined || value.sha !== undefined) {
      verifyIdentity(value, source);
      found = true;
    }
  };
  if (path.extname(file).toLowerCase() === '.json') {
    const value = parseJson(content);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const report = requireObject(value);
      check(report);
      check(report.source);
      check(report.metadata);
      if (report.config && typeof report.config === 'object' && !Array.isArray(report.config))
        check(requireObject(report.config).metadata);
    }
  } else if (/\.(?:txt|log)$/i.test(file)) {
    const text = content.toString('utf8');
    const commits = [...text.matchAll(/^commit:[ \t]*(\S+)[ \t]*\r?$/gm)].map((match) => match[1]);
    const trees = [...text.matchAll(/^tree:[ \t]*(\S+)[ \t]*\r?$/gm)].map((match) => match[1]);
    if (commits.length || trees.length) {
      if (!commits.length || commits.length !== trees.length)
        throw new Error('Incomplete log identity; the index cannot override its provenance.');
      for (let i = 0; i < commits.length; i++) verifyIdentity({ commit: commits[i], tree: trees[i] }, source);
      found = true;
    }
  }
  return found;
}

async function verifyReportProvenance(
  content: Buffer,
  file: string,
  explicitIdentity: string | undefined,
  checkout: string,
  source: EvidenceSource,
) {
  const embedded = verifyEmbeddedIdentity(content, file, source);
  const adjacent = `${file}.identity.json`;
  const ciIdentity = explicitIdentity ?? path.join(path.dirname(file), 'identity.json');
  const candidates = [...new Set([adjacent, ciIdentity])];
  const identities = [];
  for (const identity of candidates) {
    if (!(await evidenceFileExists(identity))) {
      if (identity === explicitIdentity) throw new Error('Missing explicit evidence identity.');
      continue;
    }
    outside(checkout, await realpath(identity));
    const bytes = await regularFile(identity);
    const receipt = requireObject(parseJson(bytes));
    verifyIdentity(receipt, source);
    if (identity === adjacent || receipt.schemaVersion === 1) {
      if (
        receipt.schemaVersion !== 1 ||
        receipt.sha256 !== hash(content) ||
        !Array.isArray(receipt.command) ||
        !receipt.command.length ||
        receipt.command.some((arg) => typeof arg !== 'string') ||
        !receipt.command[0]
      )
        throw new Error('Report identity must bind the exact report SHA-256 and creation command.');
    } else {
      // Legacy Candidate CI bundles have one creation-time identity, not per-report digests.
      const workflow = requireObject(receipt.workflow);
      const relative = path.relative(await realpath(path.dirname(identity)), await realpath(file));
      if (
        path.basename(identity) !== 'identity.json' ||
        receipt.requestedSha !== source.commit ||
        typeof receipt.suite !== 'string' ||
        !receipt.suite ||
        typeof workflow.run !== 'string' ||
        !/^https:\/\/github\.com\/LeulTew\/play-100\/actions\/runs\/\d+$/.test(workflow.run) ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      )
        throw new Error('CI identity must belong to the original Candidate CI artifact containing this report.');
    }
    identities.push({ file: identity, sha256: hash(bytes), bytes: bytes.length });
  }
  if (!embedded && !identities.length)
    throw new Error(
      'Evidence needs creation-time embedded identity or a matching report/CI sidecar; the index alone is insufficient.',
    );
  return identities;
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
    const identities = await verifyReportProvenance(
      bytes,
      file,
      row.identity ? path.resolve(path.dirname(indexPath), row.identity) : undefined,
      checkout,
      { commit: source.sha, tree: source.tree },
    );
    evidence.push({
      ...row,
      file: portable(file),
      ...(row.identity ? { identity: portable(path.resolve(path.dirname(indexPath), row.identity)) } : {}),
      identities: identities.map((identity) => ({ ...identity, file: portable(identity.file) })),
    });
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
