import { describe, expect, it } from 'vitest';
import { LEAN_CHECKS, parseLeanEvidence } from '../release-lean-manifest.ts';
import {
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
  type FileDigest,
  type RunRecord,
} from './evidence.ts';
import { parsePlan } from './plan.ts';

const sha = 'a49f27a665c18288e2b1bd253ca3244fc70a4a61';
const tree = 'b'.repeat(40);
const digest = (path: string, char = 'c'): FileDigest => ({ path, bytes: 10, sha256: char.repeat(64) });

function runFor(raw: Record<string, unknown>, runId = 101): RunRecord {
  const [entry] = parsePlan({ schemaVersion: 1, entries: [raw] }).entries;
  return {
    entry: entry!,
    requestId: `${entry!.id}.${sha.slice(0, 8)}.n1`,
    runId,
    url: `https://github.com/LeulTew/play-100/actions/runs/${runId}`,
    dispatchedAt: '2026-09-30T08:00:00.000Z',
  };
}

const focus = runFor({ id: 'focus', suite: 'e2e-prod', specs: ['tests/a.spec.ts'], project: 'desktop', repeat: 3 });
const files = [digest('playwright.json'), digest('junit.xml', 'd')];
const identity = (extra: Record<string, unknown> = {}) => ({
  commit: sha,
  requestedSha: sha,
  tree,
  requestId: focus.requestId,
  workflow: { run: focus.url },
  suite: 'e2e-prod',
  specs: 'tests/a.spec.ts',
  project: 'desktop',
  repeat: '3',
  workers: null,
  grep: null,
  browserEnv: 'default',
  files,
  ...extra,
});

describe('verifyIdentity', () => {
  it('returns the tree of a matching artifact', () => {
    expect(verifyIdentity(identity(), focus, sha, files)).toBe(tree);
  });

  it.each([
    [{ commit: 'f'.repeat(40) }, /commit is/],
    [{ requestedSha: 'f'.repeat(40) }, /requestedSha is/],
    [{ requestId: 'focus.a49f27a6.other' }, /requestId is/],
    [{ workflow: { run: 'https://github.com/LeulTew/play-100/actions/runs/9' } }, /workflow.run is/],
    [{ tree: 'short' }, /tree is not/],
    [{ repeat: '1' }, /repeat is/],
    [{ specs: 'tests/b.spec.ts' }, /specs is/],
    [{ browserEnv: 'xvfb-headed' }, /browserEnv is/],
    [{ files: undefined }, /files is missing/],
  ])('rejects identity %j', (extra, error) => {
    expect(() => verifyIdentity(identity(extra), focus, sha, files)).toThrow(error);
  });

  it('rejects changed, missing and unlisted files', () => {
    expect(() => verifyIdentity(identity(), focus, sha, [digest('playwright.json', 'e'), files[1]!])).toThrow(
      /playwright.json does not match its digest/,
    );
    expect(() => verifyIdentity(identity(), focus, sha, [files[0]!])).toThrow(/junit.xml is listed but missing/);
    expect(() => verifyIdentity(identity(), focus, sha, [...files, digest('extra.log')])).toThrow(
      /extra.log is in the artifact but not listed/,
    );
  });
});

describe('counts', () => {
  it('reads Playwright, Vitest and checks reports', () => {
    expect(countPlaywright({ stats: { expected: 5, unexpected: 1, flaky: 1, skipped: 2 } })).toEqual({
      passed: 5,
      failed: 2,
      skipped: 2,
    });
    expect(countVitest({ numPassedTests: 4, numFailedTests: 1, numPendingTests: 1, numTodoTests: 1 })).toEqual({
      passed: 4,
      failed: 1,
      skipped: 2,
    });
    expect(countChecks('static 0\nunits 1\nnoise line\nbuild 0\n')).toEqual({ passed: 2, failed: 1, skipped: 0 });
  });

  it('chooses the counted reports per suite', () => {
    const paths = ['checks.txt', 'playwright.json', 'vitest-1.json', 'vitest-2.json', 'vitest-x.json'];
    expect(countedReports('cloud-rules', paths)).toEqual(['vitest-1.json', 'vitest-2.json']);
    expect(countedReports('checks', paths)).toEqual(['checks.txt']);
    expect(countedReports('lighthouse', paths)).toEqual([]);
    expect(countedReports('cloud-ui', paths)).toEqual(['playwright.json']);
  });
});

describe('outcome', () => {
  const ok = { passed: 3, failed: 0, skipped: 0 };
  it('needs a successful run with passes and nothing failed or skipped', () => {
    expect(outcome({ run: focus, conclusion: 'success', counts: ok })).toBe('passed');
    expect(outcome({ run: focus, conclusion: 'failure', counts: ok })).toBe('failed');
    expect(outcome({ run: focus, conclusion: 'success', counts: { ...ok, skipped: 1 } })).toBe('failed');
    expect(outcome({ run: focus, conclusion: 'success', counts: { ...ok, passed: 0 } })).toBe('failed');
    expect(outcome({ run: focus, conclusion: 'success', counts: null })).toBe('passed');
  });

  it('holds an entry to its expected passes', () => {
    const films = runFor({ id: 'films', suite: 'e2e-prod', expectedPassed: 2 });
    expect(outcome({ run: films, conclusion: 'success', counts: { ...ok, passed: 2 } })).toBe('passed');
    expect(outcome({ run: films, conclusion: 'success', counts: ok })).toBe('failed');
  });
});

describe('buildIndex', () => {
  const at = '2026-09-30T09:00:00.000Z';
  const ok = { passed: 2, failed: 0, skipped: 0 };
  const item = (run: RunRecord, extra: Partial<Collected> = {}): Collected => ({
    run,
    conclusion: 'success',
    counts: ok,
    tree,
    dir: run.entry.id,
    report: digest('playwright.json'),
    ...extra,
  });
  const prod = runFor({ id: 'prod', suite: 'e2e-prod', lean: 'e2e-production' }, 1);
  const films = runFor({ id: 'films', suite: 'e2e-prod', lean: 'films-download', expectedPassed: 2 }, 2);
  const rules = runFor({ id: 'rules', suite: 'cloud-rules', lean: 'cloud-rules' }, 3);

  it('writes passing lean rows with identities and summary runs', () => {
    const index = buildIndex([item(prod), item(films), item(focus)], sha, at);
    expect(index).toMatchObject({ schemaVersion: 1, partial: true, commit: sha, tree, omitted: [] });
    expect(index.evidence).toEqual([
      {
        check: 'e2e-production',
        file: 'prod/playwright.json',
        tree,
        sha256: 'c'.repeat(64),
        bytes: 10,
        recordedAt: at,
        result: 'passed',
        identity: 'prod/identity.json',
      },
      expect.objectContaining({ check: 'films-download', attempt: 1, result: 'passed' }),
    ]);
    expect(index.runs).toHaveLength(3);
  });

  it('keeps a failed FLAKE-01 attempt and omits other failures', () => {
    const index = buildIndex(
      [item(prod, { conclusion: 'failure' }), item(films, { conclusion: 'failure' }), item(rules, { report: null })],
      sha,
      at,
    );
    expect(index.evidence).toEqual([
      expect.objectContaining({ check: 'films-download', result: 'failed', attempt: 1 }),
    ]);
    expect(index.omitted).toEqual([
      { entry: 'prod', check: 'e2e-production', reason: 'the run failed' },
      { entry: 'rules', check: 'cloud-rules', reason: 'vitest-1.json is missing' },
    ]);
  });

  it('refuses mixed or missing trees', () => {
    expect(() => buildIndex([item(prod), item(films, { tree: 'f'.repeat(40) })], sha, at)).toThrow(/2 trees/);
    expect(() => buildIndex([item(prod, { tree: null })], sha, at)).toThrow(/0 trees/);
  });

  it('writes rows the release manifest accepts', () => {
    const index = buildIndex([item(prod), item(films), item(rules, { report: digest('vitest-1.json') })], sha, at);
    const present = new Set(index.evidence.map((row) => row.check));
    const padded = [
      ...index.evidence,
      ...LEAN_CHECKS.filter((check) => !present.has(check)).map((check) => ({
        check,
        file: `${check}.log`,
        tree,
        sha256: 'a'.repeat(64),
        bytes: 1,
        recordedAt: at,
        result: 'passed',
      })),
    ];
    expect(parseLeanEvidence({ ...index, evidence: padded }, tree).filter((row) => row.identity)).toHaveLength(3);
  });
});

describe('summary and runs.json', () => {
  it('renders the pass/fail table', () => {
    const grep = runFor({ id: 'grep', suite: 'e2e-prod', specs: ['tests/a.spec.ts'], grep: 'a|b', repeat: 20 });
    const rows = [
      summaryRow({
        run: focus,
        conclusion: 'success',
        counts: { passed: 3, failed: 0, skipped: 0 },
        tree,
        dir: '',
        report: null,
      }),
      summaryRow({ run: grep, conclusion: 'failure', counts: null, tree: null, dir: '', report: null }),
    ];
    expect(rows[1]).toMatchObject({ spec: 'tests/a.spec.ts -g "a|b"', passed: null, result: 'failed' });
    const markdown = summaryMarkdown(rows);
    expect(markdown).toContain('| focus | e2e-prod | desktop | tests/a.spec.ts | 3 | 3 | 0 | 0 | passed |');
    expect(markdown).toContain('-g "a\\|b"');
    expect(markdown).toContain('1 of 2 runs passed.');
  });

  it('validates runs.json', () => {
    const file = { schemaVersion: 1, sha, ref: 'r', repo: 'LeulTew/play-100', plan: 'p', runs: [focus] };
    expect(parseRuns(JSON.parse(JSON.stringify(file))).runs[0]).toEqual(focus);
    expect(() => parseRuns({ ...file, runs: [{ ...focus, url: focus.url.replace('101', '102') }] })).toThrow(
      /run id and URL/,
    );
    expect(() => parseRuns({ ...file, runs: [{ ...focus, requestId: 'other.a49f27a6.n1' }] })).toThrow(/request id/);
    expect(() => parseRuns({ ...file, runs: [focus, focus] })).toThrow(/duplicate/);
    expect(() => parseRuns({ ...file, repo: 'someone/fork' })).toThrow(/LeulTew\/play-100/);
  });
});
