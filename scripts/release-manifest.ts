import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { arch, platform, release } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { scanDocument } from './check-budgets';

type ObjectValue = Record<string, unknown>;
interface Counts {
  files: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number | null;
}
export interface ManifestOptions {
  output: string;
  mode: string;
  vitest: string[];
  playwright: string[];
  decisions?: string;
  allowDirty: boolean;
}

function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.');
  return value as ObjectValue;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected a JSON array.');
  return value;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Expected a non-empty string.');
  return value;
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Expected a non-negative integer count.');
  }
  return value;
}

function equal(actual: number, expected: unknown): void {
  if (actual !== count(expected)) throw new Error('Native report counts disagree with its result rows.');
}

export function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function summarizeVitest(input: unknown): Counts {
  const report = object(input);
  const rows = array(report.testResults);
  const counts: Counts = { files: rows.length, passed: 0, failed: 0, skipped: 0, flaky: null };
  let pending = 0;
  let todo = 0;
  if (!rows.length || report.success !== true) throw new Error('Vitest report is empty or unsuccessful.');
  if (report.snapshot !== undefined && object(report.snapshot).failure === true) {
    throw new Error('Vitest contains a snapshot failure.');
  }
  for (const value of rows) {
    const file = object(value);
    text(file.name);
    if (file.status !== 'passed') throw new Error('Vitest contains a failing or unfinished test file.');
    for (const assertion of array(file.assertionResults)) {
      const result = object(assertion);
      if (array(result.failureMessages).length) throw new Error('Vitest contains assertion failures.');
      if (result.status === 'passed') counts.passed += 1;
      else if (result.status === 'failed') counts.failed += 1;
      else if (result.status === 'skipped') pending += 1;
      else if (result.status === 'todo') todo += 1;
      else throw new Error('Vitest contains an unknown or unfinished assertion status.');
    }
  }
  counts.skipped = pending + todo;
  equal(counts.passed, report.numPassedTests);
  equal(counts.failed, report.numFailedTests);
  equal(pending, report.numPendingTests);
  equal(todo, report.numTodoTests);
  equal(counts.passed + counts.failed + counts.skipped, report.numTotalTests);
  equal(0, report.numFailedTestSuites);
  equal(0, report.numPendingTestSuites);
  equal(count(report.numPassedTestSuites), report.numTotalTestSuites);
  if (!counts.passed || counts.failed) throw new Error('Vitest must contain passing tests and no failures.');
  return counts;
}

export function summarizePlaywright(input: unknown): Counts {
  const report = object(input);
  if (array(report.errors).length) throw new Error('Playwright contains runner errors.');
  const stats = object(report.stats);
  const counts: Counts = { files: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 };
  const files = new Set<string>();
  const visit = (suites: unknown[]) => {
    for (const item of suites) {
      const suite = object(item);
      for (const specValue of array(suite.specs)) {
        const spec = object(specValue);
        files.add(text(spec.file));
        if (typeof spec.ok !== 'boolean') throw new Error('Playwright spec is missing its outcome.');
        const tests = array(spec.tests);
        if (!tests.length) throw new Error('Playwright spec contains no tests.');
        for (const testValue of tests) {
          const test = object(testValue);
          const results = array(test.results).map(object);
          const statuses = ['passed', 'failed', 'timedOut', 'skipped', 'interrupted'];
          if (results.some((result) => !statuses.includes(text(result.status)))) {
            throw new Error('Playwright contains an unknown attempt status.');
          }
          if (test.status === 'skipped') {
            if (results.some((result) => result.status !== 'skipped')) {
              throw new Error('Playwright skipped test contains a non-skipped attempt.');
            }
            counts.skipped += 1;
          } else if (test.status === 'unexpected' || !spec.ok) counts.failed += 1;
          else if (
            test.expectedStatus !== 'passed' ||
            results.at(-1)?.status !== 'passed' ||
            (test.status === 'expected' && results.some((result) => result.status !== 'passed'))
          ) {
            throw new Error('Playwright contains an expected failure or unfinished execution.');
          } else if (test.status === 'expected') counts.passed += 1;
          else if (test.status === 'flaky') counts.flaky = (counts.flaky ?? 0) + 1;
          else throw new Error('Playwright contains an unknown test outcome.');
        }
      }
      if (suite.suites !== undefined) visit(array(suite.suites));
    }
  };
  visit(array(report.suites));
  counts.files = files.size;
  equal(counts.passed, stats.expected);
  equal(counts.failed, stats.unexpected);
  equal(counts.skipped, stats.skipped);
  equal(counts.flaky ?? 0, stats.flaky);
  if (!counts.files || !(counts.passed + (counts.flaky ?? 0)) || counts.failed) {
    throw new Error('Playwright must contain completed tests and no unexpected failures.');
  }
  return counts;
}

export function parseDecisions(input: unknown) {
  const value = object(input);
  if (Object.keys(value).some((key) => !['carryForward', 'waivers'].includes(key))) {
    throw new Error('Unknown release decision field.');
  }
  const carryForward = array(value.carryForward).map((item) => {
    const entry = object(item);
    if (Object.keys(entry).some((key) => !['check', 'reason', 'sourceCommit', 'evidence'].includes(key))) {
      throw new Error('Unknown carry-forward field.');
    }
    const sourceCommit = text(entry.sourceCommit);
    if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('Carry-forward requires a full source commit.');
    return { check: text(entry.check), reason: text(entry.reason), sourceCommit, evidence: text(entry.evidence) };
  });
  const waivers = array(value.waivers).map((item) => {
    const entry = object(item);
    if (Object.keys(entry).some((key) => !['check', 'reason'].includes(key))) throw new Error('Unknown waiver field.');
    return { check: text(entry.check), reason: text(entry.reason) };
  });
  return { carryForward, waivers };
}

export function parseManifestArguments(args: string[]): ManifestOptions {
  const output = args[0];
  if (!output || output.startsWith('--')) {
    throw new Error('Usage: release:manifest OUTPUT --vitest FILE --playwright FILE');
  }
  const options: ManifestOptions = { output, mode: 'production', vitest: [], playwright: [], allowDirty: false };
  const single = new Set<string>();
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--allow-dirty') {
      if (options.allowDirty) throw new Error('Duplicate --allow-dirty.');
      options.allowDirty = true;
      continue;
    }
    if (!flag || !['--vitest', '--playwright', '--decisions', '--mode'].includes(flag)) {
      throw new Error('Unknown release-manifest option.');
    }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error('Missing release-manifest option value.');
    if (flag === '--vitest') options.vitest.push(value);
    else if (flag === '--playwright') options.playwright.push(value);
    else {
      if (single.has(flag)) throw new Error('Duplicate release-manifest option.');
      single.add(flag);
      if (flag === '--decisions') options.decisions = value;
      else options.mode = value;
    }
  }
  if (!options.vitest.length || !options.playwright.length) throw new Error('Both native reporter kinds are required.');
  if (!/^[a-zA-Z0-9_-]+$/.test(options.mode) || options.mode === 'local') throw new Error('Invalid Vite mode.');
  return options;
}

async function bytes(file: string, label: string): Promise<Buffer> {
  try {
    if (!(await lstat(file)).isFile()) throw new Error('Not a regular file.');
    return await readFile(file);
  } catch (cause) {
    throw new Error(`Cannot read ${label} as a regular file.`, { cause });
  }
}

function json(buffer: Buffer, label: string): unknown {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (cause) {
    // JSON parser diagnostics can contain source text, including configuration values.
    throw new Error(`Invalid JSON in ${label}.`, { cause });
  }
}

function git(root: string, args: string[]): string {
  try {
    return execFileSync('git', ['-c', 'gc.auto=0', ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (cause) {
    throw new Error('Cannot read release Git identity/status.', { cause });
  }
}

async function version(file: string, name: string): Promise<string> {
  const pkg = object(json(await bytes(file, `${name} package`), `${name} package`));
  if (pkg.name !== name) throw new Error('Installed package identity mismatch.');
  return text(pkg.version);
}

export async function collectReleaseManifest(
  root: string,
  options: ManifestOptions,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const source = {
    sha: git(root, ['rev-parse', 'HEAD']),
    tree: git(root, ['rev-parse', 'HEAD^{tree}']),
    dirty: git(root, ['status', '--porcelain', '--untracked-files=all']) !== '',
  };
  if (source.dirty && !options.allowDirty) {
    throw new Error('Release tree is dirty; commit changes or use --allow-dirty.');
  }
  const output = path.resolve(root, options.output);
  const portable = (file: string) => path.relative(path.dirname(output), file).split(path.sep).join('/');
  const require = createRequire(path.join(root, 'package.json'));
  const installed = async (name: string) => {
    let file: string;
    try {
      file = require.resolve(`${name}/package.json`);
    } catch (cause) {
      throw new Error(`Cannot locate installed ${name} package.`, { cause });
    }
    return version(file, name);
  };
  if (!environment.npm_execpath) throw new Error('Run via npm run release:manifest to identify the installed npm.');
  const versions = {
    node: process.versions.node,
    v8: process.versions.v8,
    npm: await version(path.resolve(path.dirname(environment.npm_execpath), '..', 'package.json'), 'npm'),
    vite: await installed('vite'),
    vitest: await installed('vitest'),
    playwright: await installed('@playwright/test'),
  };
  // Vite's environment debugger can print raw values; do not invoke it when debugging is enabled.
  if (process.env.DEBUG || environment.DEBUG) {
    throw new Error('Unset DEBUG before collecting configuration fingerprints.');
  }
  const envFiles = new Set(await readdir(root));
  for (const name of ['.env', '.env.local', `.env.${options.mode}`, `.env.${options.mode}.local`]) {
    if (envFiles.has(name)) await bytes(path.join(root, name), 'Vite environment file');
  }
  let config: Record<string, string>;
  try {
    config = loadEnv(options.mode, root, 'VITE_');
  } catch (cause) {
    throw new Error('Cannot fingerprint Vite environment files.', { cause });
  }
  for (const [name, value] of Object.entries(environment)) {
    if (name.startsWith('VITE_') && value !== undefined) config[name] = value;
  }
  const configuration = Object.keys(config)
    .sort()
    .map((name) => ({ name, sha256: sha256(config[name]!) }));
  const dist = path.join(root, 'dist');
  const distReal = await realpath(dist);
  const artifact = async (name: string) => {
    const file = path.join(dist, name);
    const relative = path.relative(distReal, await realpath(file));
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Artifact escapes dist.');
    const content = await bytes(file, 'dist artifact');
    return { path: `dist/${name}`, sha256: sha256(content) };
  };
  const html = await bytes(path.join(dist, 'index.html'), 'dist/index.html');
  const entries = scanDocument(html.toString('utf8')).tags.filter(
    (tag) => !tag.inNoscript && tag.name === 'script' && tag.attributes.get('type') === 'module',
  );
  const entry = entries[0]?.attributes.get('src');
  if (entries.length !== 1 || !entry || !/^\/assets\/[\w.-]+\.js$/.test(entry)) {
    throw new Error('dist/index.html must reference one local /assets/ module entry, including deferred templates.');
  }
  const artifacts = await Promise.all(
    ['index.html', 'sw.js', 'pwa-assets.json', 'manifest.webmanifest', entry.slice(1)].map(artifact),
  );
  const seen = new Set<string>();
  const reports = [];
  for (const kind of ['vitest', 'playwright'] as const) {
    for (const input of options[kind]) {
      const file = path.resolve(root, input);
      const identity = await realpath(file);
      if (seen.has(identity)) throw new Error('Duplicate native report input.');
      seen.add(identity);
      const content = await bytes(file, `${kind} report`);
      const parsed = json(content, `${kind} report`);
      const counts = kind === 'vitest' ? summarizeVitest(parsed) : summarizePlaywright(parsed);
      reports.push({ kind, path: portable(file), sha256: sha256(content), counts });
    }
  }
  let decisions = parseDecisions({ carryForward: [], waivers: [] });
  let decisionInput: { path: string; sha256: string } | null = null;
  if (options.decisions) {
    const file = path.resolve(root, options.decisions);
    const content = await bytes(file, 'release decisions');
    decisions = parseDecisions(json(content, 'release decisions'));
    decisionInput = { path: portable(file), sha256: sha256(content) };
  }
  const manifest = {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    source,
    allowDirty: options.allowDirty,
    lockfile: {
      path: 'package-lock.json',
      sha256: sha256(await bytes(path.join(root, 'package-lock.json'), 'lockfile')),
    },
    versions,
    os: { platform: platform(), release: release(), arch: arch() },
    mode: options.mode,
    configuration,
    artifacts,
    reports,
    decisionInput,
    ...decisions,
  };
  if (
    git(root, ['rev-parse', 'HEAD']) !== source.sha ||
    git(root, ['rev-parse', 'HEAD^{tree}']) !== source.tree ||
    (git(root, ['status', '--porcelain', '--untracked-files=all']) !== '') !== source.dirty
  ) {
    throw new Error('Git identity/status changed while collecting the manifest.');
  }
  return manifest;
}

export async function writeReleaseManifest(root: string, args: string[], environment = process.env): Promise<void> {
  const options = parseManifestArguments(args);
  const manifest = await collectReleaseManifest(root, options, environment);
  // Refuse to overwrite an earlier receipt or an input, even on a failed rerun.
  await writeFile(path.resolve(root, options.output), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  void writeReleaseManifest(root, process.argv.slice(2)).catch((cause: unknown) => {
    console.error('Release manifest failed:', cause instanceof Error ? cause.message : 'Unknown collection failure.');
    process.exitCode = 1;
  });
}
