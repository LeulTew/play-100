import { LEAN_CI_CHECKS, parsePlan, resolvedBrowserEnv, type PlanEntry } from './plan.ts';

/**
 * Candidate CI evidence (docs/release-operations.md, "Candidate CI runs"): the pure parts of `npm run ci:collect`,
 * which checks each downloaded artifact against the run and plan entry that should have made it, counts its results
 * and writes a partial lean evidence index for the release manifest.
 */

export const RUN_URL = /^https:\/\/github\.com\/LeulTew\/play-100\/actions\/runs\/(\d+)$/;
const GIT_ID = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export interface FileDigest {
  path: string;
  bytes: number;
  sha256: string;
}

/** One dispatched run, as runs.json records it. */
export interface RunRecord {
  entry: PlanEntry;
  requestId: string;
  runId: number;
  url: string;
  dispatchedAt: string;
}

export interface RunsFile {
  schemaVersion: 1;
  sha: string;
  ref: string;
  repo: string;
  plan: string;
  runs: RunRecord[];
}

/** Validates runs.json: its entries as a plan, and each run URL against its id, so collect fetches the right runs. */
export function parseRuns(input: unknown): RunsFile {
  const file = record(input, 'runs.json');
  if (file.schemaVersion !== 1 || typeof file.sha !== 'string' || !GIT_ID.test(file.sha) || !Array.isArray(file.runs))
    throw new Error('runs.json must have schemaVersion 1, the full sha and runs.');
  const sha = file.sha;
  const runs = file.runs.map((value) => record(value, 'runs[]'));
  const plan = parsePlan({ schemaVersion: 1, entries: runs.map((run) => run.entry) });
  const requests = new Set<string>();
  const records = runs.map((run, index): RunRecord => {
    const entry = plan.entries[index]!;
    const runId = run.runId;
    if (
      typeof runId !== 'number' ||
      !Number.isSafeInteger(runId) ||
      run.url !== `https://github.com/LeulTew/play-100/actions/runs/${runId}`
    )
      throw new Error(`${entry.id}: run id and URL do not match.`);
    if (typeof run.requestId !== 'string' || !run.requestId.startsWith(`${entry.id}.${sha.slice(0, 8)}.`))
      throw new Error(`${entry.id}: request id does not name this entry and sha.`);
    if (requests.has(run.requestId)) throw new Error(`${entry.id}: duplicate request id.`);
    requests.add(run.requestId);
    return { entry, requestId: run.requestId, runId, url: run.url, dispatchedAt: text(run.dispatchedAt) ?? '' };
  });
  if (file.repo !== 'LeulTew/play-100') throw new Error('runs.json must name the LeulTew/play-100 repository.');
  return {
    schemaVersion: 1,
    sha,
    ref: text(file.ref) ?? '',
    repo: file.repo,
    plan: text(file.plan) ?? '',
    runs: records,
  };
}

export interface Counts {
  passed: number;
  failed: number;
  skipped: number;
}

const text = (value: unknown) => (typeof value === 'string' ? value : null);

function record(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${what} must be an object.`);
  return value as Record<string, unknown>;
}

/**
 * Checks that an artifact's identity.json was written by the dispatched run for this entry and SHA, and that the
 * artifact holds exactly the files the identity digested, byte for byte. Returns the identity's tree.
 */
export function verifyIdentity(input: unknown, run: RunRecord, sha: string, files: FileDigest[]): string {
  const identity = record(input, 'identity.json');
  const problems: string[] = [];
  const expect = (what: string, actual: unknown, wanted: unknown) => {
    if (actual !== wanted) problems.push(`${what} is ${JSON.stringify(actual)}, expected ${JSON.stringify(wanted)}`);
  };
  if (!GIT_ID.test(sha)) throw new Error(`${sha} is not a full commit SHA.`);
  expect('commit', identity.commit, sha);
  expect('requestedSha', identity.requestedSha, sha);
  if (typeof identity.tree !== 'string' || !GIT_ID.test(identity.tree)) problems.push('tree is not a full git id');
  expect('requestId', identity.requestId, run.requestId);
  const workflow = record(identity.workflow ?? {}, 'identity.workflow');
  expect('workflow.run', workflow.run, `https://github.com/LeulTew/play-100/actions/runs/${run.runId}`);
  const { entry } = run;
  expect('suite', identity.suite, entry.suite);
  expect('specs', identity.specs, entry.specs.join(' '));
  expect('project', identity.project, entry.project);
  expect('repeat', identity.repeat, String(entry.repeat));
  expect('workers', identity.workers, entry.workers === null ? null : String(entry.workers));
  expect('grep', identity.grep, entry.grep || null);
  expect('browserEnv', identity.browserEnv, resolvedBrowserEnv(entry));
  if (!Array.isArray(identity.files)) problems.push('files is missing');
  else {
    const listed = new Map<string, FileDigest>();
    for (const value of identity.files) {
      const file = record(value, 'identity.files[]');
      const path = text(file.path);
      if (!path || typeof file.bytes !== 'number' || typeof file.sha256 !== 'string' || !DIGEST.test(file.sha256)) {
        problems.push(`files has a malformed entry ${JSON.stringify(value)}`);
        continue;
      }
      listed.set(path, { path, bytes: file.bytes, sha256: file.sha256 });
    }
    const found = new Map(files.map((file) => [file.path, file]));
    for (const [path, want] of listed) {
      const got = found.get(path);
      if (!got) problems.push(`${path} is listed but missing from the artifact`);
      else if (got.bytes !== want.bytes || got.sha256 !== want.sha256)
        problems.push(`${path} does not match its digest`);
    }
    for (const path of found.keys()) if (!listed.has(path)) problems.push(`${path} is in the artifact but not listed`);
  }
  if (problems.length) throw new Error(`${entry.id} (run ${run.runId}): ${problems.join('; ')}.`);
  return identity.tree as string;
}

/** Playwright JSON stats, with zero retries: flaky can only mean a failed first attempt, so it counts as failed. */
export function countPlaywright(report: unknown): Counts {
  const stats = record(record(report, 'Playwright report').stats, 'Playwright stats');
  const n = (key: string) => (typeof stats[key] === 'number' ? stats[key] : 0);
  return { passed: n('expected'), failed: n('unexpected') + n('flaky'), skipped: n('skipped') };
}

/** Vitest JSON totals; pending and todo count as skipped. */
export function countVitest(report: unknown): Counts {
  const value = record(report, 'Vitest report');
  const n = (key: string) => (typeof value[key] === 'number' ? value[key] : 0);
  return {
    passed: n('numPassedTests'),
    failed: n('numFailedTests'),
    skipped: n('numPendingTests') + n('numTodoTests'),
  };
}

/** run-suite.sh's checks.txt: one `<name> <exit status>` line per check. */
export function countChecks(content: string): Counts {
  const counts = { passed: 0, failed: 0, skipped: 0 };
  for (const line of content.split('\n')) {
    const match = /^(\S+) (\d+)\s*$/.exec(line);
    if (match) counts[match[2] === '0' ? 'passed' : 'failed']++;
  }
  return counts;
}

export const add = (a: Counts, b: Counts): Counts => ({
  passed: a.passed + b.passed,
  failed: a.failed + b.failed,
  skipped: a.skipped + b.skipped,
});

/** The report files whose results count for each suite: `cloud-rules` has one Vitest report per iteration. */
export function countedReports(suite: PlanEntry['suite'], paths: string[]): string[] {
  switch (suite) {
    case 'cloud-rules':
      return paths.filter((path) => /^vitest-\d+\.json$/.test(path));
    case 'checks':
    case 'csp-refresh':
      return paths.filter((path) => path === 'checks.txt');
    case 'lighthouse':
      return [];
    default:
      return paths.filter((path) => path === 'playwright.json');
  }
}

/** A collected run: its record, the run's conclusion, its counts (null when the suite reports none) and its tree. */
export interface Collected {
  run: RunRecord;
  conclusion: string;
  counts: Counts | null;
  /** The identity's tree; null when the run uploaded no artifact. */
  tree: string | null;
  /** Path of the artifact directory (where identity.json sits) relative to the index directory, POSIX separators. */
  dir: string;
  /** Digest of the lean report, when the entry supplies a lean check. */
  report: FileDigest | null;
}

export type Outcome = 'passed' | 'failed';

/**
 * The entry's outcome: the run must have succeeded, reported no failures and no skips (when it counts any), and
 * matched the entry's expected passes. A filtered-out spec would otherwise pass with nothing run. Vitest reports a
 * `-t` filter's deselected tests as skipped, so a grep-filtered `cloud-rules` entry tolerates skips; it still needs a
 * pass, and `expectedPassed` pins the count. A whole Playwright suite with no pinned count keeps its designed skips
 * (desktop-only cases on the mobile project and the like), as the release gate's whole partitions do.
 */
export function outcome(item: Pick<Collected, 'run' | 'conclusion' | 'counts'>): Outcome {
  const { counts, conclusion, run } = item;
  if (conclusion !== 'success') return 'failed';
  if (!counts) return 'passed';
  const filteredSkips = run.entry.suite === 'cloud-rules' && run.entry.grep !== '';
  const designedSkips =
    WHOLE_SUITE_SKIPS.includes(run.entry.suite) &&
    run.entry.specs.length === 0 &&
    run.entry.grep === '' &&
    run.entry.expectedPassed === null;
  if (counts.failed || (counts.skipped && !filteredSkips && !designedSkips) || !counts.passed) return 'failed';
  if (run.entry.expectedPassed !== null && counts.passed !== run.entry.expectedPassed) return 'failed';
  return 'passed';
}

const WHOLE_SUITE_SKIPS: readonly string[] = ['e2e-prod', 'e2e-dev', 'e2e-offline', 'cloud-ui'];

export interface LeanRow {
  check: string;
  file: string;
  tree: string;
  sha256: string;
  bytes: number;
  recordedAt: string;
  result: Outcome;
  attempt?: number;
  identity: string;
}

/**
 * The lean evidence index: a row for each entry that supplies a lean check and passed (and FLAKE-01's first attempt
 * either way, which the manifest accepts as failed), on one tree. It is partial: the release manifest merges it with
 * the local gate's rows, so this checks the CI rows alone.
 */
export function buildIndex(items: Collected[], sha: string, recordedAt: string) {
  const trees = new Set(items.flatMap((item) => (item.tree ? [item.tree] : [])));
  if (trees.size !== 1) throw new Error(`Runs report ${trees.size} trees; collect one candidate at a time.`);
  const [tree] = [...trees] as [string];
  const evidence: LeanRow[] = [];
  const omitted: { entry: string; check: string; reason: string }[] = [];
  for (const item of items) {
    const check = item.run.entry.lean;
    if (!check) continue;
    const result = outcome(item);
    if (!item.report || !item.tree) {
      omitted.push({ entry: item.run.entry.id, check, reason: `${LEAN_CI_CHECKS[check].report} is missing` });
      continue;
    }
    if (result === 'failed' && check !== 'films-download') {
      omitted.push({ entry: item.run.entry.id, check, reason: 'the run failed' });
      continue;
    }
    evidence.push({
      check,
      file: `${item.dir}/${item.report.path}`,
      tree,
      sha256: item.report.sha256,
      bytes: item.report.bytes,
      recordedAt,
      result,
      ...(check === 'films-download' ? { attempt: 1 } : {}),
      identity: `${item.dir}/identity.json`,
    });
  }
  return {
    schemaVersion: 1 as const,
    partial: true,
    commit: sha,
    tree,
    evidence,
    omitted,
    runs: items.map((item) => summaryRow(item)),
  };
}

export interface SummaryRow {
  entry: string;
  suite: string;
  project: string;
  spec: string;
  repeat: number;
  passed: number | null;
  failed: number | null;
  skipped: number | null;
  result: Outcome;
  run: string;
}

export function summaryRow(item: Collected): SummaryRow {
  const { entry } = item.run;
  const spec = entry.specs.length ? entry.specs.join(' ') : '(full suite)';
  return {
    entry: entry.id,
    suite: entry.suite,
    project: entry.project,
    spec: entry.grep ? `${spec} -g "${entry.grep}"` : spec,
    repeat: entry.repeat,
    passed: item.counts?.passed ?? null,
    failed: item.counts?.failed ?? null,
    skipped: item.counts?.skipped ?? null,
    result: outcome(item),
    run: item.run.url,
  };
}

const cell = (value: string | number | null) => (value === null ? '–' : String(value).replaceAll('|', '\\|'));

/** The pass/fail table: suite, spec, repeat, passed, failed, skipped and run URL. */
export function summaryMarkdown(rows: SummaryRow[]): string {
  const header = ['Entry', 'Suite', 'Project', 'Spec', 'Repeat', 'Passed', 'Failed', 'Skipped', 'Result', 'Run'];
  const lines = [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`];
  for (const row of rows)
    lines.push(
      `| ${[row.entry, row.suite, row.project, row.spec, row.repeat, row.passed, row.failed, row.skipped, row.result, row.run].map(cell).join(' | ')} |`,
    );
  const failed = rows.filter((row) => row.result === 'failed').length;
  lines.push('', `${rows.length - failed} of ${rows.length} runs passed.`);
  return `${lines.join('\n')}\n`;
}
