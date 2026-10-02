import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Candidate CI (docs/release-operations.md, "Candidate CI runs"): summarises the Lighthouse JSON reports in a directory
 * (lh-<cell>-<mobile|desktop>-<run>.report.json) into summary.json, with medians per font cell and form factor.
 */

export const METRICS = {
  fcp: 'first-contentful-paint',
  lcp: 'largest-contentful-paint',
  si: 'speed-index',
  tbt: 'total-blocking-time',
  cls: 'cumulative-layout-shift',
} as const;

export type MetricKey = keyof typeof METRICS;

/** The parts of a Lighthouse result this summary reads. */
export interface LighthouseReport {
  lighthouseVersion?: string;
  userAgent?: string;
  finalUrl?: string;
  finalDisplayedUrl?: string;
  environment?: { hostUserAgent?: string };
  runtimeError?: { code: string; message?: string };
  runWarnings?: string[];
  categories: Record<string, { score: number | null }>;
  audits: Record<
    string,
    { numericValue?: number; details?: { items?: { items?: { node?: { selector?: string } }[] }[] } } | undefined
  >;
}

export interface ReportName {
  cell: string;
  form: 'mobile' | 'desktop';
  run: number;
}

export type RunSummary = ReportName & {
  file: string;
  lighthouseVersion: string | null;
  userAgent: string | null;
  finalUrl: string | null;
  runtimeError: LighthouseReport['runtimeError'] | null;
  runWarnings: string[];
  scores: Record<string, number | null>;
  lcpSelector: string | null;
} & Record<MetricKey, number | null>;

export type CellMedians = {
  runs: number;
  scores: Record<string, number | null>;
  lcpSelectors: (string | null)[];
} & Record<MetricKey, number | null>;

const metricKeys = Object.keys(METRICS) as MetricKey[];

/** The cell, form factor and run of a report file name, or null for any other file. */
export function parseReportName(file: string): ReportName | null {
  const [, cell, form, run] = /^lh-(.+)-(mobile|desktop)-(\d+)\.report\.json$/.exec(file) ?? [];
  if (!cell || !form || !run) return null;
  return { cell, form: form as ReportName['form'], run: Number(run) };
}

export function summariseRun(file: string, report: LighthouseReport): RunSummary {
  const name = parseReportName(file);
  if (!name) throw new Error(`Not a Lighthouse report name: ${file}`);
  const scores = Object.fromEntries(Object.entries(report.categories).map(([id, category]) => [id, category.score]));
  const values = Object.fromEntries(
    metricKeys.map((key) => [key, report.audits[METRICS[key]]?.numericValue ?? null]),
  ) as Record<MetricKey, number | null>;
  const lcpElement = report.audits['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node;
  return {
    file,
    ...name,
    lighthouseVersion: report.lighthouseVersion ?? null,
    userAgent: report.environment?.hostUserAgent ?? report.userAgent ?? null,
    finalUrl: report.finalDisplayedUrl ?? report.finalUrl ?? null,
    runtimeError: report.runtimeError ?? null,
    runWarnings: report.runWarnings ?? [],
    scores,
    ...values,
    lcpSelector: lcpElement?.selector ?? null,
  };
}

/** The upper median of the numbers in the list (the middle run of three), or null when there are none. */
export function median(list: readonly (number | null | undefined)[]): number | null {
  const sorted = list.filter((value): value is number => typeof value === 'number').sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

/** Medians per `<cell>/<form>`, in the runs' order. */
export function summarise(runs: readonly RunSummary[]): Record<string, CellMedians> {
  const groups = new Map<string, RunSummary[]>();
  for (const run of runs) {
    const key = `${run.cell}/${run.form}`;
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  return Object.fromEntries(
    [...groups].map(([key, list]) => {
      const categories = [...new Set(list.flatMap((run) => Object.keys(run.scores)))];
      const medians = {
        runs: list.length,
        scores: Object.fromEntries(categories.map((id) => [id, median(list.map((run) => run.scores[id]))])),
        ...(Object.fromEntries(metricKeys.map((metric) => [metric, median(list.map((run) => run[metric]))])) as Record<
          MetricKey,
          number | null
        >),
        lcpSelectors: [...new Set(list.map((run) => run.lcpSelector))],
      };
      return [key, medians];
    }),
  );
}

const ms = (value: number | null) => (value === null ? '-' : `${Math.round(value)} ms`);

/** One line per cell and form factor: category scores out of 100, then the metric medians. */
export function format(medians: Record<string, CellMedians>): string[] {
  return Object.entries(medians).map(([key, cell]) => {
    const scores = Object.entries(cell.scores)
      .map(([id, score]) => `${id} ${score === null ? '-' : Math.round(score * 100)}`)
      .join(', ');
    return (
      `${key}: ${scores}; FCP ${ms(cell.fcp)}, LCP ${ms(cell.lcp)}, SI ${ms(cell.si)}, TBT ${ms(cell.tbt)}, ` +
      `CLS ${cell.cls === null ? '-' : cell.cls.toFixed(3)}; LCP element ${cell.lcpSelectors.join(' | ')}`
    );
  });
}

/** Writes summary.json and returns the summary lines and the runs that ended in a Lighthouse runtime error. */
export function summariseDirectory(dir: string) {
  const runs = readdirSync(dir)
    .filter((file) => parseReportName(file))
    .sort()
    .map((file) => summariseRun(file, JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as LighthouseReport));
  const medians = summarise(runs);
  writeFileSync(path.join(dir, 'summary.json'), `${JSON.stringify({ medians, runs }, null, 2)}\n`);
  return { lines: format(medians), failed: runs.filter((run) => run.runtimeError) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) throw new Error('Pass the directory of Lighthouse reports.');
  const { lines, failed } = summariseDirectory(dir);
  for (const line of lines) console.log(line);
  if (failed.length) {
    console.error(
      `Lighthouse runtime errors: ${failed.map((run) => `${run.file} ${run.runtimeError?.code}`).join(', ')}`,
    );
    process.exitCode = 1;
  }
}
