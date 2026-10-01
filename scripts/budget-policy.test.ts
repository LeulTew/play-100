import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PWA_BUDGET } from '../src/pwa/worker.ts';
import { BUDGET_METRICS, parseBudgetLimits } from './check-budgets.ts';
import type { BudgetLimits } from './check-budgets.ts';
import {
  WORKER_LIMITS,
  budgetPolicyProblems,
  parseBudgetRaises,
  parseBudgetRelease,
  policyCap,
  recordBudgetRelease,
  reportMeasurements,
} from './budget-policy.ts';

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
