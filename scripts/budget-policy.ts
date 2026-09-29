import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRecord as object } from '../src/lib/guards.js';
import { PWA_BUDGET } from '../src/pwa/worker.ts';
import { BUDGET_METRICS, parseBudgetLimits } from './check-budgets.ts';
import type { BudgetLimits, BudgetMetric } from './check-budgets.ts';

/**
 * The cap policy of docs/performance.md, as code. Caps only move down: after a configured build of the integrated
 * tree, each cap with room drops to its measurement plus a margin, and budgets.json records that measurement as its
 * `release`. A cap may rise above the cap set from the release only with an entry in `raises`, which gives the new
 * measurement and the reason, and then only to that measurement plus the margin. The offline worker's install limits
 * are PWA_BUDGET's and move only with it. scripts/budget-policy.test.ts checks the committed budgets.json against these
 * rules, and `npm run budgets:record` writes the release record from a check:budgets report.
 */

/** The margin a cap keeps above its measurement: 1% of it, rounded up, and at least 256. */
export function policyMargin(measured: number): number {
  return Math.max(Math.ceil(measured / 100), 256);
}

/** The highest cap the policy allows for a measurement. */
export function policyCap(measured: number): number {
  return measured + policyMargin(measured);
}

/** The offline worker's install limits, which budgets.json mirrors (src/pwa/worker.ts PWA_BUDGET). */
export const WORKER_LIMITS: Readonly<Partial<Record<BudgetMetric, number>>> = {
  pwaCoreBytes: PWA_BUDGET.coreBytes,
  pwaCoreFiles: PWA_BUDGET.coreFiles,
};

export interface BudgetRelease {
  /** The release or round the measurement belongs to, for example "R22". */
  readonly name: string;
  /** The measured commit. */
  readonly commit: string;
  readonly measured: BudgetLimits;
  /** The caps set from this measurement. */
  readonly limits: BudgetLimits;
}

export interface BudgetRaise {
  readonly metric: BudgetMetric;
  /** The measurement that needs more room than the release's cap. */
  readonly measured: number;
  readonly reason: string;
}

function measurements(value: unknown, what: string): BudgetLimits {
  try {
    return parseBudgetLimits({ version: 1, limits: value });
  } catch {
    throw new Error(`budgets.json ${what} must give every budget metric as a whole number of bytes or files.`);
  }
}

export function parseBudgetRelease(input: unknown): BudgetRelease {
  const release = object(input) ? input.release : undefined;
  if (!object(release) || typeof release.name !== 'string' || !release.name.trim())
    throw new Error('budgets.json needs a release record with the name of the measured release.');
  if (typeof release.commit !== 'string' || !/^[0-9a-f]{40}$/.test(release.commit))
    throw new Error('budgets.json release.commit must be the full commit the release measured.');
  return {
    name: release.name,
    commit: release.commit,
    measured: measurements(release.measured, 'release.measured'),
    limits: measurements(release.limits, 'release.limits'),
  };
}

export function parseBudgetRaises(input: unknown): BudgetRaise[] {
  const raises = object(input) ? input.raises : undefined;
  if (raises === undefined) return [];
  if (!Array.isArray(raises)) throw new Error('budgets.json raises must be a list.');
  return raises.map((entry: unknown, index) => {
    const metric = object(entry) ? entry.metric : undefined;
    const measured = object(entry) ? entry.measured : undefined;
    const reason = object(entry) ? entry.reason : undefined;
    if (typeof metric !== 'string' || !(BUDGET_METRICS as readonly string[]).includes(metric))
      throw new Error(`budgets.json raises[${index}] names no budget metric.`);
    if (typeof measured !== 'number' || !Number.isSafeInteger(measured) || measured < 0)
      throw new Error(`budgets.json raises[${index}] needs the measurement that needs the room.`);
    if (typeof reason !== 'string' || !reason.trim())
      throw new Error(`budgets.json raises[${index}] needs the reason the growth is accepted.`);
    return { metric: metric as BudgetMetric, measured, reason };
  });
}

/** Everything in budgets.json that breaks the policy; empty when it follows it. */
export function budgetPolicyProblems(input: unknown): string[] {
  let limits: BudgetLimits;
  let release: BudgetRelease;
  let raises: BudgetRaise[];
  try {
    limits = parseBudgetLimits(input);
    release = parseBudgetRelease(input);
    raises = parseBudgetRaises(input);
  } catch (cause) {
    return [cause instanceof Error ? cause.message : String(cause)];
  }
  const problems: string[] = [];
  for (const metric of BUDGET_METRICS) {
    const measured = release.measured[metric];
    if (measured > release.limits[metric])
      problems.push(
        `${metric}: ${release.name} measured ${measured}, over the cap set from it (${release.limits[metric]}).`,
      );
    const worker = WORKER_LIMITS[metric];
    if (worker !== undefined) {
      if (limits[metric] !== worker || release.limits[metric] !== worker)
        problems.push(
          `${metric} must equal the offline worker's install limit, ${worker} (src/pwa/worker.ts PWA_BUDGET).`,
        );
      continue;
    }
    if (release.limits[metric] > policyCap(measured))
      problems.push(
        `${metric}: the cap set from ${release.name} (${release.limits[metric]}) is above its measurement ${measured} plus the margin, ${policyCap(measured)}.`,
      );
    const entries = raises.filter((raise) => raise.metric === metric);
    if (entries.length > 1)
      problems.push(`${metric} has ${entries.length} raises; keep one, with the latest measurement.`);
    const raise = entries.at(-1);
    if (raise && raise.measured <= measured)
      problems.push(
        `${metric}: a raise needs a measurement above ${release.name}'s (${measured}), not ${raise.measured}.`,
      );
    const allowed = raise ? policyCap(raise.measured) : release.limits[metric];
    if (limits[metric] > allowed)
      problems.push(
        raise
          ? `${metric} is ${limits[metric]}, above its raised measurement ${raise.measured} plus the margin, ${allowed}.`
          : `${metric} is ${limits[metric]}, above the cap set from ${release.name} (${allowed}). Caps only move down; a raise needs an entry in raises with the measurement and the reason (docs/performance.md).`,
      );
  }
  return problems;
}

/** The measurements of a `check:budgets --json` report of a clean, configured, passing build. */
export function reportMeasurements(report: unknown): { commit: string; measured: BudgetLimits } {
  if (!object(report) || report.schemaVersion !== 1 || !Array.isArray(report.budgets))
    throw new Error('Pass the JSON report of npm run check:budgets -- --json <file>.');
  if (report.pass !== true) throw new Error('The report fails its caps: record a passing build.');
  if (report.dirty !== false || typeof report.sourceCommit !== 'string' || !/^[0-9a-f]{40}$/.test(report.sourceCommit))
    throw new Error('Record the build of a clean, committed tree: the report must name its commit and be clean.');
  const firstPaint = object(report.reportedOnly) ? report.reportedOnly.firstPaint : undefined;
  if (!object(firstPaint) || firstPaint.variant !== 'online')
    throw new Error('Record a configured build (the online header), as the release gate measures.');
  const values: Record<string, unknown> = {};
  for (const row of report.budgets as unknown[])
    if (object(row) && typeof row.metric === 'string') values[row.metric] = row.measured;
  return { commit: report.sourceCommit, measured: measurements(values, 'report') };
}

/**
 * budgets.json after a release's measurement: each cap with room drops to the measurement plus the margin, the worker
 * limits follow PWA_BUDGET, the measurement becomes the release record and the raises it absorbs are cleared.
 */
export function recordBudgetRelease(
  budgets: Record<string, unknown>,
  name: string,
  commit: string,
  measured: BudgetLimits,
): Record<string, unknown> {
  const current = parseBudgetLimits(budgets);
  const limits = Object.fromEntries(
    BUDGET_METRICS.map((metric) => [
      metric,
      WORKER_LIMITS[metric] ?? Math.min(current[metric], policyCap(measured[metric])),
    ]),
  ) as BudgetLimits;
  const over = BUDGET_METRICS.filter((metric) => measured[metric] > limits[metric]);
  if (over.length)
    throw new Error(`The measurement exceeds ${over.join(', ')}: record a passing build, or add a raise first.`);
  return { ...budgets, limits, release: { name, commit, measured, limits }, raises: [] };
}

async function main(args: readonly string[]) {
  const [reportPath, flag, name] = args;
  if (!reportPath || flag !== '--release' || !name?.trim() || args.length !== 3)
    throw new Error('Usage: npm run budgets:record -- <check-budgets report.json> --release <name>.');
  const file = path.resolve('budgets.json');
  const budgets: unknown = JSON.parse(await readFile(file, 'utf8'));
  if (!object(budgets)) throw new Error('Invalid budgets.json format.');
  const { commit, measured } = reportMeasurements(JSON.parse(await readFile(reportPath, 'utf8')));
  const next = recordBudgetRelease(budgets, name, commit, measured);
  const problems = budgetPolicyProblems(next);
  if (problems.length) throw new Error(problems.join('\n'));
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
  const before = parseBudgetLimits(budgets);
  const after = parseBudgetLimits(next);
  for (const metric of BUDGET_METRICS)
    console.log(
      `${metric}: ${measured[metric]} measured, cap ${before[metric]}${after[metric] < before[metric] ? ` -> ${after[metric]}` : ''}`,
    );
  console.log(`budgets.json records ${name} (${commit}). Explain the lowered caps in notes.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main(process.argv.slice(2)).catch((cause: unknown) => {
    console.error('Budget record failed:', cause instanceof Error ? cause.message : 'Unknown error.');
    process.exitCode = 1;
  });
}
