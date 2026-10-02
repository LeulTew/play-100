import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import {
  add,
  buildIndex,
  countChecks,
  countedReports,
  countPlaywright,
  countVitest,
  outcome,
  parseRuns,
  summaryMarkdown,
  summaryRow,
  verifyIdentity,
  type Collected,
  type Counts,
} from './evidence.ts';
import { evidenceFiles } from './identity.ts';
import { LEAN_CI_CHECKS, MIN_POLL_SECONDS, pollSeconds } from './plan.ts';

/**
 * `npm run ci:collect -- --runs runs.json --out <dir> [--wait]`: downloads every run's artifact into <dir>/<entry>/,
 * verifies each identity.json against its run, entry and file digests, and writes <dir>/index.json (partial lean
 * evidence for scripts/release-lean-manifest.ts), summary.json and summary.md.
 */

const { values } = parseArgs({
  options: {
    runs: { type: 'string', default: 'runs.json' },
    out: { type: 'string' },
    wait: { type: 'boolean', default: false },
    'poll-seconds': { type: 'string', default: String(MIN_POLL_SECONDS) },
  },
  strict: true,
});
const poll = pollSeconds(values['poll-seconds']);
if (!values.out) throw new Error('Pass --out with a directory outside the checkout.');
const runsFile = parseRuns(JSON.parse(readFileSync(values.runs, 'utf8')) as unknown);
const { sha, repo } = runsFile;

const checkout = realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
mkdirSync(values.out, { recursive: true });
const out = realpathSync(values.out);
const inside = path.relative(checkout, out);
if (!inside || (!inside.startsWith('..') && !path.isAbsolute(inside)))
  throw new Error('--out must be outside the checkout: the release manifest rejects evidence inside it.');

const gh = (args: string[], timeout = 120_000) => execFileSync('gh', args, { encoding: 'utf8', timeout }).trim();

interface RunState {
  status: string;
  conclusion: string;
}
/** One batched run list per poll (plus a run view only for runs that fell outside it), at MIN_POLL_SECONDS or slower. */
async function settledStates(): Promise<Map<number, RunState>> {
  for (;;) {
    const listed = JSON.parse(
      gh([
        'run',
        'list',
        '--repo',
        repo,
        '--workflow',
        'candidate-ci.yml',
        '--branch',
        runsFile.ref,
        '--event',
        'workflow_dispatch',
        '--json',
        'databaseId,status,conclusion',
        '-L',
        String(Math.max(100, runsFile.runs.length * 3)),
      ]),
    ) as (RunState & { databaseId: number })[];
    const states = new Map<number, RunState>(listed.map((run) => [run.databaseId, run]));
    for (const run of runsFile.runs)
      if (!states.has(run.runId))
        states.set(
          run.runId,
          JSON.parse(gh(['run', 'view', String(run.runId), '--repo', repo, '--json', 'status,conclusion'])) as RunState,
        );
    const open = runsFile.runs.filter((run) => states.get(run.runId)!.status !== 'completed');
    if (!open.length) return states;
    const names = open.map((run) => run.entry.id).join(', ');
    if (!values.wait) throw new Error(`Still running: ${names}; rerun with --wait.`);
    console.log(`waiting ${poll} s: ${open.length} open (${names})`);
    await sleep(poll * 1000);
  }
}

function findIdentity(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === 'identity.json')
    .map((entry) => path.join(entry.parentPath, entry.name));
}

const portable = (file: string) => file.split(path.sep).join('/');
let localTree: string | null = null;
try {
  localTree = execFileSync('git', ['rev-parse', '--verify', '--quiet', `${sha}^{tree}`], { encoding: 'utf8' }).trim();
} catch {
  console.log(`${sha} is not in this clone; trees are checked between runs only.`);
}
const items: Collected[] = [];
const states = await settledStates();
for (const run of runsFile.runs) {
  const state = states.get(run.runId)!;
  const target = path.join(out, run.entry.id);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  try {
    gh(['run', 'download', String(run.runId), '--repo', repo, '-D', target, '-p', 'candidate-ci-*'], 900_000);
  } catch (error) {
    console.error(`${run.entry.id}: no artifact (${String(error).split('\n')[0]})`);
  }
  const identities = existsSync(target) ? findIdentity(target) : [];
  if (identities.length > 1) throw new Error(`${run.entry.id}: more than one identity.json in ${run.url}.`);
  if (!identities.length) {
    items.push({ run, conclusion: state.conclusion, counts: null, tree: null, dir: run.entry.id, report: null });
    continue;
  }
  const identityPath = identities[0]!;
  const root = path.dirname(identityPath);
  const files = evidenceFiles(root, identityPath);
  const tree = verifyIdentity(JSON.parse(readFileSync(identityPath, 'utf8')) as unknown, run, sha, files);
  if (localTree && tree !== localTree)
    throw new Error(`${run.entry.id}: tree ${tree} is not ${sha}'s tree ${localTree}.`);
  let counts: Counts | null = null;
  if (run.entry.suite !== 'lighthouse') {
    counts = { passed: 0, failed: 0, skipped: 0 };
    for (const report of countedReports(
      run.entry.suite,
      files.map((file) => file.path),
    )) {
      const content = readFileSync(path.join(root, report), 'utf8');
      counts = add(
        counts,
        report.endsWith('.txt')
          ? countChecks(content)
          : report.startsWith('vitest-')
            ? countVitest(JSON.parse(content) as unknown)
            : countPlaywright(JSON.parse(content) as unknown),
      );
    }
  }
  const lean = run.entry.lean;
  const report = lean ? (files.find((file) => file.path === LEAN_CI_CHECKS[lean].report) ?? null) : null;
  const item: Collected = {
    run,
    conclusion: state.conclusion,
    counts,
    tree,
    dir: portable(path.relative(out, root)),
    report,
  };
  items.push(item);
  console.log(`${run.entry.id}: ${outcome(item)} ${JSON.stringify(counts)} ${run.url}`);
}

const rows = items.map(summaryRow);
writeFileSync(path.join(out, 'summary.json'), `${JSON.stringify({ sha, rows }, null, 2)}\n`);
const markdown = summaryMarkdown(rows);
writeFileSync(path.join(out, 'summary.md'), markdown);
console.log(`\n${markdown}`);
const index = buildIndex(items, sha, new Date().toISOString());
writeFileSync(path.join(out, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(`Lean rows: ${index.evidence.map((row) => `${row.check}=${row.result}`).join(', ') || 'none'}`);
if (index.omitted.length) console.log(`Omitted: ${JSON.stringify(index.omitted)}`);
if (rows.some((row) => row.result === 'failed')) process.exitCode = 1;
