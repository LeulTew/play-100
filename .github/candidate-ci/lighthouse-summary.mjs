// Summarises the Lighthouse JSON reports in a directory into summary.json, with medians per cell and form factor.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const metrics = {
  fcp: 'first-contentful-paint',
  lcp: 'largest-contentful-paint',
  si: 'speed-index',
  tbt: 'total-blocking-time',
  cls: 'cumulative-layout-shift',
};
const runs = readdirSync(dir)
  .filter((file) => /^lh-.+-\d+\.report\.json$/.test(file))
  .sort()
  .map((file) => {
    const report = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    const [, cell, form, run] = /^lh-(.+)-(mobile|desktop)-(\d+)\.report\.json$/.exec(file);
    const scores = Object.fromEntries(Object.entries(report.categories).map(([id, c]) => [id, c.score]));
    const values = Object.fromEntries(
      Object.entries(metrics).map(([key, id]) => [key, report.audits[id]?.numericValue ?? null]),
    );
    const lcpElement = report.audits['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node;
    return {
      file,
      cell,
      form,
      run: Number(run),
      lighthouseVersion: report.lighthouseVersion,
      userAgent: report.environment?.hostUserAgent ?? report.userAgent,
      finalUrl: report.finalDisplayedUrl ?? report.finalUrl,
      runtimeError: report.runtimeError ?? null,
      runWarnings: report.runWarnings ?? [],
      scores,
      ...values,
      lcpSelector: lcpElement?.selector ?? null,
    };
  });
const median = (list) => {
  const sorted = list.filter((value) => typeof value === 'number').sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};
const groups = {};
for (const run of runs) (groups[`${run.cell}/${run.form}`] ??= []).push(run);
const medians = Object.fromEntries(
  Object.entries(groups).map(([key, list]) => [
    key,
    {
      runs: list.length,
      scores: Object.fromEntries(Object.keys(list[0].scores).map((id) => [id, median(list.map((r) => r.scores[id]))])),
      ...Object.fromEntries(Object.keys(metrics).map((key) => [key, median(list.map((r) => r[key]))])),
      lcpSelectors: [...new Set(list.map((r) => r.lcpSelector))],
    },
  ]),
);
writeFileSync(path.join(dir, 'summary.json'), `${JSON.stringify({ medians, runs }, null, 2)}\n`);
for (const [key, m] of Object.entries(medians)) {
  const scores = Object.entries(m.scores)
    .map(([id, score]) => `${id} ${score === null ? '-' : Math.round(score * 100)}`)
    .join(', ');
  console.log(
    `${key}: ${scores}; FCP ${Math.round(m.fcp)} ms, LCP ${Math.round(m.lcp)} ms, SI ${Math.round(m.si)} ms, ` +
      `TBT ${Math.round(m.tbt)} ms, CLS ${m.cls?.toFixed(3)}; LCP element ${m.lcpSelectors.join(' | ')}`,
  );
}
const failed = runs.filter((run) => run.runtimeError);
if (failed.length) {
  console.error(`Lighthouse runtime errors: ${failed.map((run) => `${run.file} ${run.runtimeError.code}`).join(', ')}`);
  process.exit(1);
}
