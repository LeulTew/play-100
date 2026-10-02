import { copyFileSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds the small failures artifact (docs/release-operations.md, "Candidate CI runs"): for every failed test in the
 * run's Playwright and Vitest JSON reports, its title, file:line, project and first error, plus each Playwright
 * failure's error-context.md and screenshots. Traces and videos stay in the full artifact only.
 *
 * Usage: tsx failures.ts <evidence dir> <failures dir>. Writes nothing when no test failed.
 */

export interface Failure {
  report: string;
  title: string;
  location: string;
  project: string | null;
  status: string;
  repeatEachIndex: number | null;
  error: string;
  /** Absolute attachment paths in the evidence directory; replaced by artifact-relative copies on write. */
  attachments: string[];
}

type Json = Record<string, unknown>;
const object = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const ERROR_LIMIT = 4000;

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
export const firstError = (message: string) => {
  const clean = message.replace(ANSI, '').trim();
  return clean.length > ERROR_LIMIT ? `${clean.slice(0, ERROR_LIMIT)}…` : clean;
};

const KEPT_ATTACHMENT = (attachment: Json) =>
  attachment.name === 'error-context' || str(attachment.contentType).startsWith('image/');

/** Failed Playwright results; `flaky` cannot pass with zero retries, so every failed attempt is listed. */
export function playwrightFailures(input: unknown, report: string): Failure[] {
  const failures: Failure[] = [];
  const walk = (suite: Json, titles: string[]) => {
    const here = str(suite.title) && !str(suite.title).endsWith('.ts') ? [...titles, str(suite.title)] : titles;
    for (const child of list(suite.suites)) walk(object(child), here);
    for (const specValue of list(suite.specs)) {
      const spec = object(specValue);
      for (const testValue of list(spec.tests)) {
        const test = object(testValue);
        for (const resultValue of list(test.results)) {
          const result = object(resultValue);
          const status = str(result.status);
          if (status === 'passed' || status === 'skipped') continue;
          const errors = list(result.errors).map((error) => str(object(error).message));
          failures.push({
            report,
            title: [...here, str(spec.title)].join(' › '),
            location: `${str(spec.file)}:${typeof spec.line === 'number' ? spec.line : ''}`,
            project: str(test.projectName) || null,
            status,
            repeatEachIndex: typeof result.repeatEachIndex === 'number' ? result.repeatEachIndex : null,
            error: firstError(errors.find(Boolean) ?? str(object(result.error).message)),
            attachments: list(result.attachments)
              .map(object)
              .filter((attachment) => KEPT_ATTACHMENT(attachment) && str(attachment.path))
              .map((attachment) => str(attachment.path)),
          });
        }
      }
    }
  };
  for (const suite of list(object(input).suites)) walk(object(suite), []);
  return failures;
}

/** Failed Vitest assertions (`cloud-rules`, `checks` units), which have no attachments. */
export function vitestFailures(input: unknown, report: string, root = ''): Failure[] {
  const failures: Failure[] = [];
  for (const fileValue of list(object(input).testResults)) {
    const file = object(fileValue);
    const name = str(file.name);
    const relative = root && path.isAbsolute(name) ? path.relative(root, name).split(path.sep).join('/') : name;
    for (const assertionValue of list(file.assertionResults)) {
      const assertion = object(assertionValue);
      if (assertion.status !== 'failed') continue;
      const line = object(assertion.location).line;
      failures.push({
        report,
        title: str(assertion.fullName) || str(assertion.title),
        location: `${relative}:${typeof line === 'number' ? line : ''}`,
        project: null,
        status: 'failed',
        repeatEachIndex: null,
        error: firstError(list(assertion.failureMessages).map(str).find(Boolean) ?? ''),
        attachments: [],
      });
    }
  }
  return failures;
}

/** All failures in the top-level JSON reports of an evidence directory. */
export function collectFailures(evidence: string, candidate = ''): Failure[] {
  const failures: Failure[] = [];
  for (const name of readdirSync(evidence)
    .filter((file) => file.endsWith('.json'))
    .sort()) {
    let report: unknown;
    try {
      report = JSON.parse(readFileSync(path.join(evidence, name), 'utf8'));
    } catch {
      continue;
    }
    const value = object(report);
    if (Array.isArray(value.suites) && value.stats) failures.push(...playwrightFailures(report, name));
    else if (Array.isArray(value.testResults)) failures.push(...vitestFailures(report, name, candidate));
  }
  return failures;
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

function write(evidence: string, out: string, candidate: string) {
  const failures = collectFailures(evidence, candidate);
  if (!failures.length) {
    console.log('No failed tests: no failures artifact.');
    return;
  }
  const root = realpathSync(evidence);
  mkdirSync(out, { recursive: true });
  const rows = failures.map((failure, index) => {
    const dir = `${String(index + 1).padStart(3, '0')}-${slug(failure.title) || 'failure'}`;
    const files: string[] = [];
    for (const attachment of failure.attachments) {
      let source: string;
      try {
        source = realpathSync(attachment);
      } catch {
        continue;
      }
      const relative = path.relative(root, source);
      if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
      mkdirSync(path.join(out, dir), { recursive: true });
      const target = `${dir}/${files.length + 1}-${path.basename(source)}`;
      copyFileSync(source, path.join(out, target));
      files.push(target);
    }
    const { report, title, location, project, status, repeatEachIndex, error } = failure;
    return { report, title, location, project, status, repeatEachIndex, error, files };
  });
  writeFileSync(
    path.join(out, 'failures.json'),
    `${JSON.stringify({ count: rows.length, failures: rows }, null, 2)}\n`,
  );
  console.log(`${rows.length} failures written to ${out}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [evidence, out] = process.argv.slice(2);
  if (!evidence || !out) throw new Error('Usage: tsx failures.ts <evidence dir> <failures dir>');
  write(evidence, out, process.cwd());
}
