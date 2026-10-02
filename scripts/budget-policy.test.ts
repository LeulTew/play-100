import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PWA_BUDGET } from '../src/pwa/worker.ts';
import { BUDGET_METRICS, parseBudgetLimits } from './check-budgets.ts';
import type { BudgetLimits } from './check-budgets.ts';
import {
  WORKER_LIMITS,
  budgetPolicyProblems,
  latestReleaseCommit,
  latestReleaseTrees,
  parseBudgetRaises,
  parseBudgetRelease,
  policyCap,
  recordBudgetRelease,
  releaseRecordProblems,
  reportMeasurements,
} from './budget-policy.ts';
import type { ReleaseHistory } from './budget-policy.ts';

const committed = JSON.parse(readFileSync(new URL('../budgets.json', import.meta.url), 'utf8')) as Record<
  string,
  unknown
>;
const commit = 'a'.repeat(40);
const limits = (overrides: Partial<BudgetLimits> = {}): BudgetLimits => ({
  ...(Object.fromEntries(BUDGET_METRICS.map((metric) => [metric, 1000])) as BudgetLimits),
  pwaCoreBytes: PWA_BUDGET.coreBytes,
  pwaCoreFiles: PWA_BUDGET.coreFiles,
  ...overrides,
});
const budgets = (cap: Partial<BudgetLimits> = {}, extra: Record<string, unknown> = {}) => ({
  version: 1,
  limits: limits(cap),
  release: { name: 'R1', commit, measured: limits({ pwaCoreBytes: 1000, pwaCoreFiles: 40 }), limits: limits() },
  raises: [],
  ...extra,
});

describe('budget cap policy', () => {
  it('holds for the committed budgets.json: no cap above its release measurement, or its raise, plus the margin', () => {
    expect(budgetPolicyProblems(committed)).toEqual([]);
    const release = parseBudgetRelease(committed);
    const raises = parseBudgetRaises(committed);
    const caps = parseBudgetLimits(committed);
    for (const metric of BUDGET_METRICS) {
      const worker = WORKER_LIMITS[metric];
      if (worker !== undefined) {
        expect(caps[metric], metric).toBe(worker);
        continue;
      }
      // A raise (docs/performance.md) lets a cap reach its own measurement plus the margin, no further.
      const raise = raises.find((entry) => entry.metric === metric);
      expect(caps[metric], metric).toBeLessThanOrEqual(policyCap(raise ? raise.measured : release.measured[metric]));
    }
  });

  it('allows the measurement plus 1% of it, rounded up, and at least 256', () => {
    // The G11 re-review's figures for the R22 release measurement.
    expect(policyCap(173072)).toBe(174803);
    expect(policyCap(279232)).toBe(282025);
    expect(policyCap(144991)).toBe(146441);
    expect(policyCap(32776)).toBe(33104);
    expect(policyCap(574)).toBe(830);
    expect(policyCap(25600)).toBe(25856);
    // 1% of 25,601 is 256.01, which rounds up to 257.
    expect(policyCap(25601)).toBe(25858);
  });

  it('refuses a cap that rises above the cap set from the release without a raise', () => {
    expect(budgetPolicyProblems(budgets())).toEqual([]);
    expect(budgetPolicyProblems(budgets({ cssRawBytes: 900 }))).toEqual([]);
    expect(budgetPolicyProblems(budgets({ cssRawBytes: 1001 }))).toEqual([
      'cssRawBytes is 1001, above the cap set from R1 (1000). Caps only move down; a raise needs an entry in raises with the measurement and the reason (docs/performance.md).',
    ]);
  });

  it('lets a recorded raise lift a cap to its new measurement plus the margin, no further', () => {
    const raise = { metric: 'cssRawBytes', measured: 1100, reason: 'The Discover filters need their own rules.' };
    expect(budgetPolicyProblems(budgets({ cssRawBytes: 1356 }, { raises: [raise] }))).toEqual([]);
    expect(budgetPolicyProblems(budgets({ cssRawBytes: 1357 }, { raises: [raise] }))).toEqual([
      'cssRawBytes is 1357, above its raised measurement 1100 plus the margin, 1356.',
    ]);
    expect(budgetPolicyProblems(budgets({}, { raises: [{ ...raise, measured: 1000 }] }))).toEqual([
      "cssRawBytes: a raise needs a measurement above R1's (1000), not 1000.",
    ]);
    expect(budgetPolicyProblems(budgets({}, { raises: [{ ...raise, reason: ' ' }] }))).toEqual([
      'budgets.json raises[0] needs the reason the growth is accepted.',
    ]);
    expect(budgetPolicyProblems(budgets({}, { raises: [{ ...raise, metric: 'cssBytes' }] }))).toEqual([
      'budgets.json raises[0] names no budget metric.',
    ]);
  });

  it('refuses a release cap above its measurement plus the margin, and a release over its own caps', () => {
    const release = { name: 'R1', commit, measured: limits({ cssGzipBytes: 500 }), limits: limits() };
    expect(budgetPolicyProblems({ ...budgets(), release })).toEqual([
      'cssGzipBytes: the cap set from R1 (1000) is above its measurement 500 plus the margin, 756.',
    ]);
    const over = { ...release, measured: limits({ cssGzipBytes: 1001 }) };
    expect(budgetPolicyProblems({ ...budgets(), release: over })).toEqual([
      'cssGzipBytes: R1 measured 1001, over the cap set from it (1000).',
    ]);
  });

  it("keeps the offline core caps at the worker's install limits", () => {
    expect(budgetPolicyProblems(budgets({ pwaCoreFiles: 50 }))).toEqual([
      "pwaCoreFiles must equal the offline worker's install limit, 51 (src/pwa/worker.ts PWA_BUDGET).",
    ]);
  });

  it('needs a release record with the measured commit', () => {
    expect(budgetPolicyProblems({ version: 1, limits: limits() })).toEqual([
      'budgets.json needs a release record with the name of the measured release.',
    ]);
    expect(budgetPolicyProblems({ ...budgets(), release: { ...budgets().release, commit: 'abc' } })).toEqual([
      'budgets.json release.commit must be the full commit the release measured.',
    ]);
    const partial: Record<string, number> = { ...limits() };
    delete partial.eagerCombinedGzipBytes;
    expect(budgetPolicyProblems({ ...budgets(), release: { ...budgets().release, measured: partial } })).toEqual([
      'budgets.json release.measured must give every budget metric as a whole number of bytes or files.',
    ]);
  });
});

describe('the release record against the last production release', () => {
  const root = new URL('..', import.meta.url);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  const succeeds = (...args: string[]) => {
    try {
      git(...args);
      return true;
    } catch {
      return false;
    }
  };
  const repository: ReleaseHistory = {
    exists: (sha) => succeeds('cat-file', '-e', `${sha}^{commit}`),
    isAncestor: (ancestor, sha) => succeeds('merge-base', '--is-ancestor', ancestor, sha),
    treeOf: (sha) => {
      try {
        return git('rev-parse', '--verify', '--quiet', `${sha}^{tree}`).trim();
      } catch {
        return undefined;
      }
    },
    reachable: (sha) => succeeds('merge-base', '--is-ancestor', sha, 'HEAD'),
  };

  it('keeps the record the release in docs/releases.md shipped, or a newer measurement', () => {
    const ledger = readFileSync(new URL('docs/releases.md', root), 'utf8');
    const shippedCommit = latestReleaseCommit(ledger);
    expect(
      repository.exists(shippedCommit),
      `${shippedCommit} (docs/releases.md) is missing: fetch the full history`,
    ).toBe(true);
    const shipped: unknown = JSON.parse(git('show', `${shippedCommit}:budgets.json`));
    expect(releaseRecordProblems(committed, shipped, repository, latestReleaseTrees(ledger))).toEqual([]);
  });

  it('reads the commit trees the latest release section records', () => {
    const sha = (digit: string) => digit.repeat(40);
    const ledger = `## Release 2: x\n\n| Commit | \`${sha('2')}\` (tree \`${sha('3')}\`) |\n| Rollback | \`${sha('4')}\` (tree \`${sha('5')}\`) |\n\n## Release 1: x\n\n| Commit | \`${sha('1')}\` (tree \`${sha('6')}\`) |\n`;
    expect([...latestReleaseTrees(ledger)]).toEqual([
      [sha('2'), sha('3')],
      [sha('4'), sha('5')],
    ]);
  });

  it('reads the commit of the first release section of the ledger', () => {
    const sha = (digit: string) => digit.repeat(40);
    const ledger = `# Release ledger\n\n| Commit | \`${sha('0')}\` |\n\n## Release 2: x\n\n| Field | Value |\n| Commit | \`${sha('2')}\` (tree x) |\n\n## Release 1: x\n\n| Commit | \`${sha('1')}\` |\n`;
    expect(latestReleaseCommit(ledger)).toBe(sha('2'));
    expect(() => latestReleaseCommit('# Release ledger\n\n## Release 1\n\n| Commit | `abc` |\n')).toThrow(
      'no release section',
    );
  });

  const shipped = budgets();
  const newer = { ...budgets(), release: { ...shipped.release, name: 'R2', commit: 'b'.repeat(40) } };
  const history = (known: boolean, older: boolean): ReleaseHistory => ({
    exists: () => known,
    isAncestor: () => older,
    treeOf: () => undefined,
    reachable: () => true,
  });

  it('refuses an edited copy of the shipped record', () => {
    expect(releaseRecordProblems(shipped, shipped, history(true, false))).toEqual([]);
    const edited = { ...shipped, release: { ...shipped.release, measured: limits({ cssRawBytes: 1100 }) } };
    expect(releaseRecordProblems(edited, shipped, history(true, false))).toEqual([
      `budgets.json release R1 differs from the record the latest release shipped (R1, ${commit}). Record a new measurement with npm run budgets:record instead of editing it.`,
    ]);
    const renamed = { ...shipped, release: { ...shipped.release, name: 'R2' } };
    expect(releaseRecordProblems(renamed, shipped, history(true, false))).toHaveLength(1);
  });

  it('accepts a newer measurement of a real commit, and refuses an unknown or older one', () => {
    expect(releaseRecordProblems(newer, shipped, history(true, false))).toEqual([]);
    expect(releaseRecordProblems(newer, shipped, history(false, false))).toEqual([
      `budgets.json release R2 names ${'b'.repeat(40)}, which is not in this repository.`,
    ]);
    expect(releaseRecordProblems(newer, shipped, history(true, true))).toEqual([
      `budgets.json release R2 measures ${'b'.repeat(40)}, older than the shipped measurement R1 (${commit}).`,
    ]);
  });

  describe('a provenance alias of the shipped commit', () => {
    const aliasCommit = 'c'.repeat(40);
    const tree = 'd'.repeat(40);
    const alias = { ...shipped, release: { ...shipped.release, commit: aliasCommit, tree } };
    const named = `budgets.json release R1 names ${aliasCommit} instead of the shipped ${commit}`;
    const trees = (overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> => ({
      [aliasCommit]: tree,
      [commit]: tree,
      ...overrides,
    });
    const aliasHistory = (
      treeByCommit: Record<string, string | undefined>,
      { shippedKnown = true, reachable = true } = {},
    ): ReleaseHistory => ({
      exists: (sha) => (sha === commit ? shippedKnown : sha in treeByCommit),
      isAncestor: () => false,
      treeOf: (sha) => (sha === commit && !shippedKnown ? undefined : treeByCommit[sha]),
      reachable: () => reachable,
    });

    it('accepts a reachable commit of the shipped tree', () => {
      expect(releaseRecordProblems(alias, shipped, aliasHistory(trees()))).toEqual([]);
    });

    it('refuses an alias without release.tree, of another tree, or unreachable from HEAD', () => {
      const untreed = { ...shipped, release: { ...shipped.release, commit: aliasCommit } };
      expect(releaseRecordProblems(untreed, shipped, aliasHistory(trees()))).toEqual([
        `${named}: an alias of the same tree needs release.tree.`,
      ]);
      expect(releaseRecordProblems(alias, shipped, aliasHistory(trees({ [aliasCommit]: 'e'.repeat(40) })))).toEqual([
        `${named}: its tree is ${'e'.repeat(40)}, not release.tree ${tree}.`,
      ]);
      expect(releaseRecordProblems(alias, shipped, aliasHistory(trees({ [commit]: 'e'.repeat(40) })))).toEqual([
        `${named}: the shipped commit's tree is ${'e'.repeat(40)}, not release.tree ${tree}.`,
      ]);
      expect(releaseRecordProblems(alias, shipped, aliasHistory(trees(), { reachable: false }))).toEqual([
        `${named}, which is not reachable from HEAD.`,
      ]);
    });

    it('needs the ledger to record the tree when the shipped commit is not in the repository', () => {
      const absent = aliasHistory(trees(), { shippedKnown: false });
      expect(releaseRecordProblems(alias, shipped, absent, new Map([[aliasCommit, tree]]))).toEqual([]);
      expect(releaseRecordProblems(alias, shipped, absent, new Map([[commit, tree]]))).toEqual([]);
      expect(releaseRecordProblems(alias, shipped, absent, new Map([[aliasCommit, 'e'.repeat(40)]]))).toEqual([
        `${named}: the shipped commit is not in this repository, and docs/releases.md records no tree ${tree} for either commit in the latest release.`,
      ]);
    });

    it('still refuses an alias with an edited measurement', () => {
      const edited = { ...alias, release: { ...alias.release, measured: limits({ cssRawBytes: 1100 }) } };
      expect(releaseRecordProblems(edited, shipped, aliasHistory(trees()))).toEqual([
        `budgets.json release R1 differs from the record the latest release shipped (R1, ${commit}). Record a new measurement with npm run budgets:record instead of editing it.`,
      ]);
    });
  });
});

describe('recording a release', () => {
  const measuredValues = limits({ eagerCombinedGzipBytes: 600, pwaCoreBytes: 1000, pwaCoreFiles: 40 });
  for (const metric of BUDGET_METRICS)
    if (!['eagerCombinedGzipBytes', 'pwaCoreBytes', 'pwaCoreFiles'].includes(metric)) measuredValues[metric] = 900;
  const report = (overrides: Record<string, unknown> = {}) => ({
    schemaVersion: 1,
    sourceCommit: commit,
    dirty: false,
    pass: true,
    budgets: BUDGET_METRICS.map((metric) => ({ metric, measured: measuredValues[metric] })),
    reportedOnly: { firstPaint: { variant: 'online' } },
    ...overrides,
  });

  it('lowers each cap with room to the measurement plus the margin and clears the raises it absorbs', () => {
    const { measured } = reportMeasurements(report());
    const before = budgets({ cssRawBytes: 1100 }, { raises: [{ metric: 'cssRawBytes', measured: 1050, reason: 'x' }] });
    const next = recordBudgetRelease(before, 'R2', commit, measured);
    // The raised cap stays while the measurement plus the margin (1156) is above it.
    expect(next.limits).toEqual(limits({ eagerCombinedGzipBytes: 856, cssRawBytes: 1100 }));
    expect(next.release).toEqual({ name: 'R2', commit, measured, limits: next.limits });
    expect(next.raises).toEqual([]);
    expect(budgetPolicyProblems(next)).toEqual([]);
  });

  it('keeps a cap already below the measurement plus the margin', () => {
    const { measured } = reportMeasurements(report());
    expect(
      parseBudgetLimits(recordBudgetRelease(budgets({ cssGzipBytes: 950 }), 'R2', commit, measured)).cssGzipBytes,
    ).toBe(950);
  });

  it('refuses a measurement over its caps, and reports that are not of a clean, configured, passing build', () => {
    expect(() => recordBudgetRelease(budgets(), 'R2', commit, limits({ cssRawBytes: 1200 }))).toThrow(
      'The measurement exceeds cssRawBytes',
    );
    expect(() => reportMeasurements(report({ pass: false }))).toThrow('record a passing build');
    expect(() => reportMeasurements(report({ dirty: true }))).toThrow('clean, committed tree');
    expect(() => reportMeasurements(report({ reportedOnly: { firstPaint: { variant: 'offline' } } }))).toThrow(
      'configured build',
    );
    expect(() => reportMeasurements({ budgets: [] })).toThrow('npm run check:budgets -- --json');
  });
});
