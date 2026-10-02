import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import type { RunRecord, RunsFile } from './evidence.ts';
import { dispatchArgs, findRun, parsePlan, requestId, runName, shellLine } from './plan.ts';

/**
 * `npm run ci:dispatch -- --sha <sha> [--plan <plan.json>] [--only <id,...>] [--dry-run]`: dispatches every plan
 * entry on Candidate CI for one exact commit and writes runs.json for `npm run ci:collect`. Each dispatch carries a
 * unique request id in its run name, so runs are matched to entries by name rather than by the order GitHub answers
 * in; collect then confirms the match against each artifact's identity.json.
 */

const { values } = parseArgs({
  options: {
    sha: { type: 'string' },
    plan: { type: 'string', default: path.join('scripts', 'candidate-ci', 'plan.json') },
    ref: { type: 'string', default: 'leultew-r24-candidate-ci' },
    repo: { type: 'string', default: 'LeulTew/play-100' },
    out: { type: 'string', default: 'runs.json' },
    only: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'match-timeout': { type: 'string', default: '600' },
  },
  strict: true,
});

const sha = values.sha ?? '';
if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Pass --sha with the full 40-character commit.');
if (values.repo !== 'LeulTew/play-100') throw new Error('Candidate CI evidence must come from LeulTew/play-100.');
const plan = parsePlan(JSON.parse(readFileSync(values.plan, 'utf8')) as unknown);
const only = values.only ? new Set(values.only.split(',').map((id) => id.trim())) : null;
if (only) for (const id of only) if (!plan.entries.some((entry) => entry.id === id)) throw new Error(`No entry ${id}.`);
const entries = only ? plan.entries.filter((entry) => only.has(entry.id)) : plan.entries;
const nonce = Date.now().toString(36);

const pending = entries.map((entry) => {
  const request = requestId(entry, sha, nonce);
  return {
    entry,
    request,
    name: runName(entry, sha, request),
    args: dispatchArgs(entry, sha, values.ref, request, values.repo),
  };
});

if (values['dry-run']) {
  for (const item of pending) console.log(shellLine('gh', item.args));
  console.log(`\n${pending.length} dispatches for ${sha} on ${values.ref} (dry run; nothing dispatched).`);
  process.exit(0);
}

const gh = (args: string[]) => execFileSync('gh', args, { encoding: 'utf8', timeout: 120_000 }).trim();
const dispatchedAt = new Date().toISOString();
for (const item of pending) {
  console.log(`dispatch ${item.entry.id}: ${item.request}`);
  gh(item.args);
}

interface ListedRun {
  databaseId: number;
  displayTitle: string;
  url: string;
}
const runs = new Map<string, RunRecord>();
const deadline = Date.now() + Number(values['match-timeout']) * 1000;
while (runs.size < pending.length) {
  if (Date.now() > deadline) {
    const missing = pending.filter((item) => !runs.has(item.request)).map((item) => item.entry.id);
    throw new Error(`No run appeared for ${missing.join(', ')}.`);
  }
  await sleep(10_000);
  const listed = JSON.parse(
    gh([
      'run',
      'list',
      '--repo',
      values.repo,
      '--workflow',
      'candidate-ci.yml',
      '--branch',
      values.ref,
      '--event',
      'workflow_dispatch',
      '--json',
      'databaseId,displayTitle,url',
      '-L',
      String(Math.max(100, pending.length * 3)),
    ]),
  ) as ListedRun[];
  for (const item of pending) {
    if (runs.has(item.request)) continue;
    const run = findRun(listed, item.name);
    if (!run) continue;
    runs.set(item.request, {
      entry: item.entry,
      requestId: item.request,
      runId: run.databaseId,
      url: run.url,
      dispatchedAt,
    });
    console.log(`${item.entry.id}: ${run.url}`);
  }
}

const file: RunsFile = {
  schemaVersion: 1,
  sha,
  ref: values.ref,
  repo: values.repo,
  plan: values.plan,
  runs: pending.map((item) => runs.get(item.request)!),
};
writeFileSync(values.out, `${JSON.stringify(file, null, 2)}\n`);
console.log(`Wrote ${values.out}: ${file.runs.length} runs.`);
