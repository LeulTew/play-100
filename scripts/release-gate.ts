import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { createServer as createTcpServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { requireObject } from '../src/lib/guards.js';
import { summarizeNpmAudit, summarizePlaywright, summarizeVitest } from './release-manifest';
import { prepareGitleaks, gitleaksSummary } from './release-gitleaks';
import { verifyProtocol, type ProtocolVerification } from './release-apb2-contract';
import {
  evidenceEnvironment,
  evidenceFileExists,
  reserveEvidenceNames,
  writeEvidenceIdentity,
} from './release-evidence';

export const GATE_NODE = 'v24.21.0';
export const FILM_DOWNLOAD_TEST =
  'optional films stay unloaded until Watch, play and seek natively, switch without overlap and restore focus';
export const APB2_GATE_SCRIPT = 'release:apb2';
export interface Apb2GateReceipt {
  schemaVersion: 1;
  source: { sha: string; tree: string };
  status: 'passed';
}
export function requireApb2Runner(input: unknown) {
  const scripts = requireObject(requireObject(input).scripts);
  if (typeof scripts[APB2_GATE_SCRIPT] !== 'string' || !scripts[APB2_GATE_SCRIPT].trim())
    throw new Error('APB2 gate hook blocked: the committed npm run release:apb2 runner is not available.');
}
/**
 * The operator's APB2 settings, checked before the gate's first step as PLAY100_FLOOR_CHROMIUM is: the absolute folder
 * of the pinned set, which must match the committed digests, the quiet-host attestation and the bound Chrome version.
 */
export async function requireApb2Operator(
  env: NodeJS.ProcessEnv,
  verify: (folder: string) => Promise<Pick<ProtocolVerification, 'ok' | 'files' | 'freezeSha256'>> = verifyProtocol,
) {
  const protocol = env.PLAY100_APB2_PROTOCOL ?? '';
  if (!path.isAbsolute(protocol))
    throw new Error(
      'Set PLAY100_APB2_PROTOCOL to the absolute folder of the pinned APB2 v3.2 set before the full gate.',
    );
  if (env.PLAY100_APB2_QUIET_ATTESTED !== '1')
    throw new Error('Set PLAY100_APB2_QUIET_ATTESTED=1, the quiet-host attestation, before the full gate.');
  const browserVersion = env.PLAY100_APB2_BROWSER_VERSION ?? '';
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(browserVersion))
    throw new Error('Set PLAY100_APB2_BROWSER_VERSION to the bound four-part Chrome version before the full gate.');
  const verification = await verify(protocol);
  if (!verification.ok)
    throw new Error(
      'PLAY100_APB2_PROTOCOL does not match the committed APB2 v3.2 digests; fix it before the full gate.',
    );
  return { protocol, browserVersion, files: verification.files, freezeSha256: verification.freezeSha256 };
}
export function checkApb2GateReceipt(input: unknown, candidate: { sha: string; tree: string }): Apb2GateReceipt {
  const receipt = requireObject(input);
  const source = requireObject(receipt.source);
  if (
    receipt.schemaVersion !== 1 ||
    receipt.status !== 'passed' ||
    source.sha !== candidate.sha ||
    source.tree !== candidate.tree
  )
    throw new Error('APB2 needs a passing receipt bound to the exact candidate commit and tree.');
  return { schemaVersion: 1, source: candidate, status: 'passed' };
}
/**
 * The APB2 step's own environment: the exact candidate identity, plus the operator's pinned-set folder, quiet-host
 * attestation and bound Chrome version, which the configured profile would otherwise strip with every PLAY100_ variable.
 */
export const APB2_OPERATOR_ENV = [
  'PLAY100_APB2_PROTOCOL',
  'PLAY100_APB2_QUIET_ATTESTED',
  'PLAY100_APB2_BROWSER_VERSION',
] as const;
export function apb2StepEnvironment(input: NodeJS.ProcessEnv, candidate: { sha: string; tree: string }) {
  const env: NodeJS.ProcessEnv = {
    PLAY100_APB2_SOURCE_COMMIT: candidate.sha,
    PLAY100_APB2_SOURCE_TREE: candidate.tree,
  };
  for (const name of APB2_OPERATOR_ENV) if (input[name]) env[name] = input[name];
  return env;
}
const ports = [4187, 9199, 8188, 4417, 4517, 9150];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
type Profile = 'configured' | 'offline' | 'emulator';
export interface GateStep {
  name: string;
  profile: Profile;
  tool: 'npm' | 'vitest' | 'playwright' | 'emulators' | 'gitleaks';
  args: string[];
  report?: 'vitest' | 'playwright';
  expectedPassed?: number;
  audit?: true;
}

export function gatePlan(): GateStep[] {
  const steps: GateStep[] = ['lint', 'typecheck:functions', 'validate:data', 'validate:discovery'].map((script) => ({
    name: script.replaceAll(':', '-'),
    profile: 'configured',
    tool: 'npm',
    args: ['run', script],
  }));
  steps.unshift({ name: 'types', profile: 'configured', tool: 'npm', args: ['exec', '--no', '--', 'tsc', '-b'] });
  steps.unshift(
    ...(['configured', 'offline'] as const).map((profile): GateStep => ({
      name: `${profile}-audit-signatures`,
      profile,
      tool: 'npm',
      args: ['audit', 'signatures'],
    })),
    ...(['configured', 'offline'] as const).map((profile): GateStep => ({
      name: `${profile}-dependency-audit`,
      profile,
      tool: 'npm',
      args: ['audit', '--json', '--audit-level=info'],
      audit: true,
    })),
  );
  steps.push({
    name: 'unit-browser',
    profile: 'configured',
    tool: 'vitest',
    args: ['run', '--maxWorkers=1'],
    report: 'vitest',
  });
  const afterDependencyAudits = steps.findIndex((step) => step.name === 'offline-dependency-audit') + 1;
  if (!afterDependencyAudits) throw new Error('The history scan requires the offline dependency audit anchor.');
  steps.splice(afterDependencyAudits, 0, {
    name: 'history-secret-scan',
    profile: 'configured',
    tool: 'gitleaks',
    args: ['git', '--redact', '--no-banner', '--log-level=info', '--config', '.gitleaks.toml', '--exit-code=1'],
  });
  steps.push({ name: 'cloud', profile: 'emulator', tool: 'emulators', args: [], report: 'vitest' });
  for (const [name, count] of [
    ['handle-race', 5],
    ['convergence', 20],
  ] as const) {
    for (let iteration = 1; iteration <= count; iteration++) {
      steps.push({
        name: `${name}-${iteration}`,
        profile: 'emulator',
        tool: 'emulators',
        args: [],
        report: 'vitest',
        expectedPassed: 1,
      });
    }
  }
  for (const profile of ['configured', 'offline'] as const) {
    for (const script of ['build', 'check:csp', 'check:budgets']) {
      steps.push({ name: `${profile}-${script.replace(':', '-')}`, profile, tool: 'npm', args: ['run', script] });
    }
  }
  for (const name of ['production', 'development'] as const) {
    steps.push({
      name,
      profile: 'configured',
      tool: 'playwright',
      args: name === 'production' ? ['test', '--grep-invert', FILM_DOWNLOAD_TEST] : ['test'],
      report: 'playwright',
    });
  }
  steps.push(
    {
      name: 'floor-smoke',
      profile: 'configured',
      tool: 'playwright',
      args: ['test', '--config', 'playwright.floor.config.ts'],
      report: 'playwright',
      expectedPassed: 15,
    },
    { name: 'apb2', profile: 'configured', tool: 'npm', args: ['run', APB2_GATE_SCRIPT] },
    {
      name: 'films-download',
      profile: 'configured',
      tool: 'playwright',
      args: ['test', 'tests/films.spec.ts', '--grep', FILM_DOWNLOAD_TEST],
      report: 'playwright',
      expectedPassed: 2,
    },
    { name: 'cloud-ui', profile: 'emulator', tool: 'emulators', args: [], report: 'playwright' },
    { name: 'sync-20', profile: 'emulator', tool: 'emulators', args: [], report: 'playwright', expectedPassed: 80 },
    {
      name: 'offline-navigation',
      profile: 'offline',
      tool: 'playwright',
      args: ['test', 'tests/root-navigation-guards.spec.ts'],
      report: 'playwright',
      expectedPassed: 36,
    },
    {
      name: 'offline-unit-browser',
      profile: 'offline',
      tool: 'vitest',
      args: ['run', '--maxWorkers=1'],
      report: 'vitest',
    },
  );
  return steps;
}

export function gateEnvironment(input: NodeJS.ProcessEnv, profile: Profile): NodeJS.ProcessEnv {
  const env = { ...input };
  for (const name of Object.keys(env)) {
    if (/^(?:PLAY100_|PLAYWRIGHT_|VITE_)/.test(name) || ['CI', 'DEBUG', 'GITHUB_SHA'].includes(name)) delete env[name];
  }
  if (profile === 'configured') {
    for (const name of Object.keys(input).filter((name) => /^VITE_(?:FIREBASE_|APP_CHECK_|SITE_URL$)/.test(name)))
      env[name] = input[name];
    env.VITE_FIREBASE_REQUIRED = 'true';
  } else if (profile === 'emulator') {
    env.VITE_USE_FIREBASE_EMULATORS = 'true';
  }
  if (profile !== 'emulator') {
    delete env.FIRESTORE_EMULATOR_HOST;
    delete env.FIREBASE_AUTH_EMULATOR_HOST;
  }
  return env;
}

export function checkGateReport(step: GateStep, report: unknown) {
  const counts = step.report === 'vitest' ? summarizeVitest(report) : summarizePlaywright(report);
  if (counts.flaky) throw new Error(`${step.name}: flaky retries cannot pass the gate.`);
  // Filtered Vitest runs report unselected cases as skipped; the selected case must pass exactly once.
  if (
    step.expectedPassed !== undefined &&
    (counts.passed !== step.expectedPassed || (step.report === 'playwright' && counts.skipped))
  ) {
    throw new Error(`${step.name}: expected ${step.expectedPassed} passing selected tests.`);
  }
  return counts;
}

export async function runPartitionAttempts(
  step: GateStep,
  execute: (attempt: GateStep) => Promise<void>,
): Promise<{ name: string; passed: boolean }[]> {
  const attempts: { name: string; passed: boolean }[] = [];
  const limit = step.name === 'films-download' ? 2 : 1;
  for (let index = 1; index <= limit; index++) {
    const attempt = limit === 1 ? step : { ...step, name: `${step.name}-attempt-${index}` };
    try {
      await execute(attempt);
      attempts.push({ name: attempt.name, passed: true });
      return attempts;
    } catch (cause) {
      attempts.push({ name: attempt.name, passed: false });
      if (index === limit) throw cause;
      console.warn(`${attempt.name} failed; retaining its evidence and using the single FLAKE-01 rerun.`);
    }
  }
  throw new Error('Partition did not execute.');
}

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export async function bindFilmAttempts(evidence: string, attempts: { name: string; passed: boolean }[]) {
  const available = new Set(await readdir(evidence));
  const bound = [];
  for (const attempt of attempts) {
    const files = [];
    for (const suffix of ['.log', '-exit.json', '.json']) {
      const file = `${attempt.name}${suffix}`;
      // A failed runner may leave no native report. Successful attempts must have one.
      if (suffix === '.json' && !attempt.passed && !available.has(file)) {
        files.push({ path: file, missing: true });
      } else {
        const content = await readFile(path.join(evidence, file));
        files.push({ path: file, sha256: hash(content), bytes: content.length });
      }
    }
    bound.push({ ...attempt, files });
  }
  return bound;
}

async function json(file: string, value: unknown, command = ['release:gate', 'write', path.basename(file)]) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  const plan = path.join(path.dirname(file), 'plan.json');
  if (file !== plan && (await evidenceFileExists(plan))) {
    const { sha, tree } = requireObject(JSON.parse(await readFile(plan, 'utf8')));
    if (typeof sha !== 'string' || typeof tree !== 'string') throw new Error('Invalid gate source identity.');
    await writeEvidenceIdentity(file, { commit: sha, tree }, command);
  }
}
export function commandReceipt(name: string, exitCode: number | null, log: Buffer, error?: string) {
  return { name, exitCode, logSha256: hash(log), logBytes: log.length, ...(error ? { error } : {}) };
}

export function evidenceLogHeader(identity: unknown): string {
  const { sha, tree } = requireObject(identity);
  const full = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
  if (!full(sha) || !full(tree)) throw new Error('Evidence logs require the full candidate commit and tree.');
  return `commit: ${sha}\ntree: ${tree}\n\n`;
}

export async function stampLogs(directory: string, header: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await stampLogs(file, header);
    else if (entry.isFile() && entry.name.endsWith('.log')) {
      const bytes = await readFile(file);
      if (!bytes.subarray(0, Buffer.byteLength(header)).equals(Buffer.from(header)))
        await writeFile(file, Buffer.concat([Buffer.from(header), bytes]));
    }
  }
}

export async function refuseBusyPorts(list: number[] = ports) {
  for (const port of list) {
    for (const host of ['127.0.0.1', '::1']) {
      await new Promise<void>((resolve, reject) => {
        const server = createTcpServer();
        server.once('error', (cause) =>
          reject(new Error(`Port ${port} on ${host} is unavailable; never adopt or kill its owner.`, { cause })),
        );
        server.listen({ host, port, exclusive: true }, () =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      });
    }
  }
}

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', ['--no-optional-locks', '-c', 'gc.auto=0', ...args], { cwd, encoding: 'utf8' }).trim();
}
async function cleanCheckout(cwd: string, sha: string) {
  if (git(cwd, 'rev-parse', 'HEAD') !== sha || git(cwd, 'status', '--porcelain', '--untracked-files=all')) {
    throw new Error('Gate requires clean checkouts at the same candidate commit.');
  }
  if ((await readdir(cwd)).some((name) => name === '.env' || name.startsWith('.env.'))) {
    throw new Error('Gate loads reviewed public values from the environment only; remove checkout .env files.');
  }
}

export async function runCommand(
  name: string,
  cwd: string,
  evidence: string,
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  auditLockfileSha256?: string,
  reports: string[] = [],
) {
  const logPath = path.join(evidence, `${name}.log`);
  const plan = requireObject(JSON.parse(await readFile(path.join(evidence, 'plan.json'), 'utf8')));
  if (typeof plan.sha !== 'string' || typeof plan.tree !== 'string') throw new Error('Invalid gate source identity.');
  const source = { commit: plan.sha, tree: plan.tree };
  env = { ...env, ...evidenceEnvironment(source) };
  await reserveEvidenceNames(reports);
  // Reserve before spawning; each attempt has its own immutable evidence paths.
  await writeFile(logPath, evidenceLogHeader(plan), {
    flag: 'wx',
  });
  const output = createWriteStream(logPath, { flags: 'a' });
  const startedAt = new Date().toISOString();
  let exitCode: number | null = null;
  let failure: string | undefined;
  const auditChunks: Buffer[] = [];
  let auditBytes = 0;
  let finishedAt: string;
  try {
    exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.pipe(output, { end: false });
      child.stderr.pipe(output, { end: false });
      if (auditLockfileSha256)
        child.stdout.on('data', (chunk: Buffer) => {
          auditBytes += chunk.length;
          if (auditBytes > 8 * 1024 * 1024) {
            if (!failure) {
              failure = 'Dependency audit JSON exceeds its 8 MiB evidence limit.';
              child.kill();
            }
          } else auditChunks.push(chunk);
        });
      output.once('error', (cause) => {
        child.kill();
        reject(cause);
      });
      child.once('error', reject);
      child.once('close', (code, signal) => {
        if (signal) failure ??= `Command terminated by ${signal}.`;
        resolve(code ?? 1);
      });
    });
  } catch (cause) {
    failure = cause instanceof Error ? cause.message : 'Command could not run.';
  } finally {
    await new Promise<void>((resolve, reject) =>
      output.end((error?: Error | null) => (error ? reject(error) : resolve())),
    );
    finishedAt = new Date().toISOString();
    const produced = [];
    for (const report of reports) {
      if (await evidenceFileExists(report)) produced.push(report);
      else if (exitCode === 0) failure ??= `Successful command did not create ${report}`;
    }
    await json(
      path.join(evidence, `${name}-exit.json`),
      {
        ...commandReceipt(name, exitCode, await readFile(logPath), failure),
        command: [executable, ...args],
        startedAt,
        finishedAt,
      },
      [executable, ...args],
    );
    for (const report of produced) await writeEvidenceIdentity(report, source, [executable, ...args]);
  }
  if (auditLockfileSha256 && !failure) {
    const report: unknown = JSON.parse(Buffer.concat(auditChunks).toString('utf8'));
    const summary = summarizeNpmAudit(report, exitCode);
    await json(
      path.join(evidence, `${name}.json`),
      {
        ...summary,
        startedAt,
        finishedAt,
        lockfileSha256: auditLockfileSha256,
        report,
        commandReceiptSha256: hash(await readFile(path.join(evidence, `${name}-exit.json`))),
      },
      [executable, ...args],
    );
    if (summary.reviewRequired)
      console.warn(`${name}: dependency advisories recorded for owner review; not a clean audit.`);
    return;
  }
  if (exitCode !== 0 || failure) throw new Error(`${name} failed; retain ${logPath} and its receipt.`);
}

function cli(cwd: string, tool: 'npm' | 'vitest' | 'playwright' | 'firebase') {
  if (tool === 'npm') {
    if (!process.env.npm_execpath) throw new Error('Use npm run release:gate with Node 24.21.0 and its bundled npm.');
    return process.env.npm_execpath;
  }
  return path.join(
    cwd,
    'node_modules',
    ...{
      vitest: ['vitest', 'vitest.mjs'],
      playwright: ['playwright', 'cli.js'],
      firebase: ['firebase-tools', 'lib', 'bin', 'firebase.js'],
    }[tool],
  );
}

export function reporterArgs(step: GateStep, evidence: string) {
  if (step.report === 'vitest')
    return ['--reporter=default', '--reporter=json', `--outputFile=${path.join(evidence, `${step.name}.json`)}`];
  return [
    ...(step.name === 'floor-smoke'
      ? ['--project=floor-firefox', '--project=floor-webkit', '--project=floor-chromium']
      : ['--project=desktop', '--project=mobile']),
    `--workers=${step.tool === 'emulators' ? 1 : 2}`,
    '--retries=0',
    '--reporter=list,json',
    `--output=${path.join(evidence, `${step.name}-results`)}`,
  ];
}

async function fingerprint(directory: string): Promise<string> {
  const rows: string[] = [];
  async function visit(dir: string) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) rows.push(`${path.relative(directory, file)}:${hash(await readFile(file))}`);
      else throw new Error('Build evidence may not contain symlinks.');
    }
  }
  await visit(directory);
  return hash(rows.join('\n'));
}

async function runInner(step: GateStep, evidence: string) {
  if (
    process.version !== GATE_NODE ||
    process.env.GCLOUD_PROJECT !== 'demo-play100' ||
    process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8188' ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9199'
  ) {
    throw new Error('Inner gate requires the pinned runtime and owned demo emulators.');
  }
  const env = gateEnvironment(process.env, 'emulator');
  env.PLAYWRIGHT_JSON_OUTPUT_FILE = path.join(evidence, `${step.name}.json`);
  let args = ['run', '--config', 'vitest.cloud.config.ts', '--maxWorkers=1'];
  if (step.name.startsWith('handle-race')) {
    args.push(
      'tests-cloud/social.test.ts',
      '-t',
      'races two handle claims without granting the same handle to two accounts',
    );
  } else if (step.name.startsWith('convergence')) {
    args.push(
      'tests-cloud/friend-all.test.ts',
      '-t',
      'converges a first friend action and the automatic default on one default policy in either order',
    );
  }
  if (step.report === 'vitest') {
    await runCommand(
      `${step.name}-tests`,
      root,
      evidence,
      process.execPath,
      [cli(root, 'vitest'), ...args, ...reporterArgs(step, evidence)],
      env,
      undefined,
      [path.join(evidence, `${step.name}.json`)],
    );
    return;
  }
  await refuseBusyPorts([4187]);
  // Firebase itself owns the isolated log directory; Vite config resolves project inputs from cwd.
  process.chdir(root);
  const server = await createServer({
    root,
    mode: 'cloud-test',
    server: { host: '127.0.0.1', port: 4187, strictPort: true, watch: null },
  });
  try {
    await server.listen();
    const probe = await fetch('http://127.0.0.1:4187/src/lib/online-availability.ts', {
      signal: AbortSignal.timeout(30_000),
    });
    const source = await probe.text();
    if (
      !probe.ok ||
      !/\bMODE"?\s*:\s*"cloud-test"/.test(source) ||
      !/\bVITE_USE_FIREBASE_EMULATORS"?\s*:\s*"true"/.test(source)
    )
      throw new Error('Owned cloud server identity failed.');
    if (step.name === 'cloud-ui') {
      env.PLAY100_COMPARE_FIXTURE = path.join(evidence, 'compare-fixture.json');
      await runCommand(
        'compare-fixture',
        root,
        evidence,
        process.execPath,
        [
          cli(root, 'playwright'),
          'test',
          '--config',
          'playwright.compare-fixture.config.ts',
          '--reporter=list,json',
          `--output=${path.join(evidence, 'compare-fixture-results')}`,
        ],
        { ...env, PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(evidence, 'compare-fixture-report.json') },
        undefined,
        [path.join(evidence, 'compare-fixture-report.json'), env.PLAY100_COMPARE_FIXTURE],
      );
      const fixture = requireObject(JSON.parse(await readFile(env.PLAY100_COMPARE_FIXTURE, 'utf8')));
      if (fixture.status !== 'READY') throw new Error('Comparison fixture is not READY.');
      env.PLAY100_RELEASE_GATE = '1';
    }
    args = ['test', '--config', 'playwright.cloud.config.ts'];
    if (step.name === 'sync-20')
      args.push('tests-cloud-ui/identity.spec.ts', '--grep', 'cross-tab identity change', '--repeat-each=20');
    await runCommand(
      `${step.name}-tests`,
      root,
      evidence,
      process.execPath,
      [cli(root, 'playwright'), ...args, ...reporterArgs(step, evidence)],
      env,
      undefined,
      [path.join(evidence, `${step.name}.json`)],
    );
  } finally {
    await server.close();
  }
}

function quoteShell(value: string) {
  if (/["'`$%&|<>\r\n^!]/.test(value))
    throw new Error('Emulator command paths contain unsupported shell metacharacters.');
  return `"${value}"`;
}

export function innerEmulatorCommand(checkout: string, name: string, evidence: string): string {
  const windows = /^[a-z]:[\\/]|^\\\\/i.test(checkout);
  const loader = (windows ? path.win32 : path.posix).join(checkout, 'node_modules', 'tsx', 'dist', 'loader.mjs');
  return [
    process.execPath,
    '--import',
    pathToFileURL(loader, { windows }).href,
    fileURLToPath(import.meta.url),
    '--inner',
    name,
    evidence,
  ]
    .map(quoteShell)
    .join(' ');
}

export async function releaseGate(evidence: string, offline: string) {
  if (process.version !== GATE_NODE) throw new Error(`Use pinned Node ${GATE_NODE}, not ${process.version}.`);
  for (const name of ['PLAY100_BASE_URL', 'PLAY100_REUSE_SERVER', 'PLAY100_ALLOW_ONLY', 'PLAY100_GOOGLE_LIVE']) {
    if (process.env[name]) throw new Error(`Unset ${name}; the gate never reuses servers or runs live Google.`);
  }
  for (const name of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'APP_ID']) {
    if (!process.env[`VITE_FIREBASE_${name}`]?.trim())
      throw new Error('Load reviewed public Production Firebase values first.');
  }
  if (!process.env.PLAY100_FLOOR_CHROMIUM || !(await stat(process.env.PLAY100_FLOOR_CHROMIUM)).isFile())
    throw new Error('Set PLAY100_FLOOR_CHROMIUM to the reviewed old Chromium executable before the full gate.');
  requireApb2Runner(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')));
  await requireApb2Operator(process.env);
  const sha = git(root, 'rev-parse', 'HEAD');
  const tree = git(root, 'rev-parse', 'HEAD^{tree}');
  await cleanCheckout(root, sha);
  await cleanCheckout(offline, sha);
  if ((await realpath(root)) === (await realpath(offline)))
    throw new Error('Offline characterization needs a separate checkout.');
  if (!(await stat(path.join(offline, 'node_modules'))).isDirectory())
    throw new Error('Prepare offline dependencies before running the gate.');
  if (
    hash(await readFile(path.join(root, 'package-lock.json'))) !==
    hash(await readFile(path.join(offline, 'package-lock.json')))
  ) {
    throw new Error('Offline lockfile mismatch.');
  }
  for (const checkout of [root, offline]) {
    const relative = path.relative(checkout, evidence);
    if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
      throw new Error('Evidence must be outside both checkouts.');
  }
  await refuseBusyPorts();
  await mkdir(evidence); // No recursive creation: existing attempts are never adopted.
  const steps = gatePlan();
  await json(path.join(evidence, 'plan.json'), {
    node: GATE_NODE,
    sha,
    tree,
    steps,
  });
  await json(path.join(evidence, 'driver.json'), {
    sha256: hash(await readFile(fileURLToPath(import.meta.url))),
    node: process.version,
    lockfileSha256: hash(await readFile(path.join(root, 'package-lock.json'))),
  });
  await copyFile(path.join(root, 'firestore.rules'), path.join(evidence, 'tested-firestore.rules'));
  const rulesHash = hash(await readFile(path.join(evidence, 'tested-firestore.rules')));
  const builds = new Map<Profile, string>();
  for (const step of steps) {
    await cleanCheckout(root, sha);
    await cleanCheckout(offline, sha);
    await refuseBusyPorts();
    if (hash(await readFile(path.join(root, 'firestore.rules'))) !== rulesHash)
      throw new Error('Candidate rules changed.');
    const cwd = step.profile === 'offline' ? offline : root;
    const env = gateEnvironment(process.env, step.profile);
    Object.assign(env, evidenceEnvironment({ commit: sha, tree }));
    if (step.name === 'floor-smoke') env.PLAY100_FLOOR_CHROMIUM = process.env.PLAY100_FLOOR_CHROMIUM;
    if (step.name === 'apb2') Object.assign(env, apb2StepEnvironment(process.env, { sha, tree }));
    env.PLAYWRIGHT_JSON_OUTPUT_FILE = path.join(evidence, `${step.name}.json`);
    if (step.tool === 'playwright') env.PLAY100_TEST_BUILD = step.name === 'development' ? 'development' : 'production';
    const args = [...step.args];
    if (step.tool === 'emulators') {
      const local = path.join(evidence, `${step.name}-emulators`);
      await mkdir(local);
      for (const file of ['firebase.json', 'firestore.rules', 'firestore.indexes.json']) {
        await copyFile(path.join(root, file), path.join(local, file));
      }
      const command = innerEmulatorCommand(root, step.name, evidence);
      try {
        await runCommand(
          step.name,
          local,
          evidence,
          process.execPath,
          [
            cli(root, 'firebase'),
            'emulators:exec',
            '--project',
            'demo-play100',
            '--only',
            'auth,firestore',
            '--config',
            path.join(local, 'firebase.json'),
            command,
          ],
          env,
        );
      } finally {
        await stampLogs(local, evidenceLogHeader({ sha, tree }));
      }
    } else if (step.tool === 'gitleaks') {
      const prepared = await prepareGitleaks(root, evidence, process.env.PLAY100_GITLEAKS_ARCHIVE);
      const logOpts = `--full-history ${sha}`;
      await json(path.join(evidence, `${step.name}-tool.json`), {
        ...prepared.receipt,
        scannedRef: sha,
        logOpts,
      });
      await runCommand(
        step.name,
        cwd,
        evidence,
        prepared.executable,
        [
          ...args,
          `--log-opts=${logOpts}`,
          '--report-format=json',
          `--report-path=${path.join(evidence, `${step.name}.json`)}`,
          '.',
        ],
        {
          ...env,
          GOMAXPROCS: '2',
          GITLEAKS_CONFIG: undefined,
          GITLEAKS_CONFIG_TOML: undefined,
          GITLEAKS_ENABLE_COMMENTS: undefined,
        },
        undefined,
        [path.join(evidence, `${step.name}.json`)],
      );
      await json(path.join(evidence, `${step.name}-summary.json`), {
        ...prepared.receipt,
        ...gitleaksSummary(
          root,
          sha,
          await readFile(path.join(evidence, `${step.name}.log`), 'utf8'),
          JSON.parse(await readFile(path.join(evidence, `${step.name}.json`), 'utf8')),
        ),
        logOpts,
      });
    } else if (step.name === 'films-download') {
      const attempts = await runPartitionAttempts(step, async (attempt) => {
        await runCommand(
          attempt.name,
          cwd,
          evidence,
          process.execPath,
          [cli(cwd, 'playwright'), ...attempt.args, ...reporterArgs(attempt, evidence)],
          { ...env, PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(evidence, `${attempt.name}.json`) },
          undefined,
          [path.join(evidence, `${attempt.name}.json`)],
        );
        checkGateReport(attempt, JSON.parse(await readFile(path.join(evidence, `${attempt.name}.json`), 'utf8')));
      });
      await json(path.join(evidence, `${step.name}-exit.json`), {
        exitCode: 0,
        exception: 'FLAKE-01',
        attempts: await bindFilmAttempts(evidence, attempts),
      });
      await copyFile(path.join(evidence, `${attempts.at(-1)!.name}.json`), path.join(evidence, `${step.name}.json`));
      await copyFile(
        path.join(evidence, `${attempts.at(-1)!.name}.json.identity.json`),
        path.join(evidence, `${step.name}.json.identity.json`),
      );
    } else {
      if (step.report) args.push(...reporterArgs(step, evidence));
      if (step.name === 'apb2') args.push('--', '--evidence', path.join(evidence, 'apb2'));
      if (step.name.endsWith('check-budgets')) args.push('--', '--json', path.join(evidence, `${step.name}.json`));
      await runCommand(
        step.name,
        cwd,
        evidence,
        process.execPath,
        [cli(cwd, step.tool), ...args],
        env,
        step.audit ? hash(await readFile(path.join(cwd, 'package-lock.json'))) : undefined,
        step.report || step.name.endsWith('check-budgets') ? [path.join(evidence, `${step.name}.json`)] : [],
      );
    }
    if (step.report) {
      const bytes = await readFile(path.join(evidence, `${step.name}.json`));
      await json(path.join(evidence, `${step.name}-summary.json`), {
        sha256: hash(bytes),
        ...checkGateReport(step, JSON.parse(bytes.toString('utf8'))),
      });
    }
    if (step.name === 'apb2')
      checkApb2GateReceipt(JSON.parse(await readFile(path.join(evidence, 'apb2', 'receipt.json'), 'utf8')), {
        sha,
        tree,
      });
    if (step.name.endsWith('-build')) {
      const firstPaint = requireObject(
        JSON.parse(await readFile(path.join(cwd, '.build-meta', 'dist', 'first-paint.json'), 'utf8')),
      );
      if (firstPaint.variant !== (step.profile === 'offline' ? 'offline' : 'online')) {
        throw new Error('Built first-paint variant does not match this partition.');
      }
      builds.set(step.profile, await fingerprint(path.join(cwd, 'dist')));
      await json(path.join(evidence, `${step.name}-identity.json`), { sha256: builds.get(step.profile) });
    }
    for (const [profile, digest] of builds) {
      if ((await fingerprint(path.join(profile === 'offline' ? offline : root, 'dist'))) !== digest) {
        throw new Error('A prepared build changed during the gate.');
      }
    }
    await refuseBusyPorts();
  }
  await cleanCheckout(root, sha);
  await cleanCheckout(offline, sha);
  if (hash(await readFile(path.join(root, 'firestore.rules'))) !== rulesHash)
    throw new Error('Rules changed during gate.');
  for (const profile of ['configured', 'offline'] as const) {
    const cwd = profile === 'offline' ? offline : root;
    const args = ['run', 'release:manifest', '--', path.join(evidence, `${profile}-manifest.json`)];
    for (const name of ['plan', 'driver']) args.push('--receipt', `${name}=${path.join(evidence, `${name}.json`)}`);
    for (const step of steps.filter((step) =>
      profile === 'offline' ? step.profile === 'offline' : step.profile !== 'offline',
    )) {
      if (step.name === 'cloud')
        args.push(
          '--vitest-cloud',
          path.join(evidence, 'cloud.json'),
          '--cloud-rules',
          path.join(evidence, 'tested-firestore.rules'),
        );
      else if (step.report)
        args.push(step.report === 'vitest' ? '--vitest' : '--playwright', path.join(evidence, `${step.name}.json`));
      if (step.report || step.tool === 'gitleaks' || step.name.endsWith('check-budgets'))
        args.push('--receipt', `${step.name}-identity=${path.join(evidence, `${step.name}.json.identity.json`)}`);
      if (step.audit) args.push('--audit', path.join(evidence, `${step.name}.json`));
      else args.push('--receipt', `${step.name}=${path.join(evidence, `${step.name}-exit.json`)}`);
      if (step.name === 'apb2') args.push('--receipt', `apb2-result=${path.join(evidence, 'apb2', 'receipt.json')}`);
      if (step.tool === 'gitleaks') {
        for (const suffix of ['', '-summary', '-tool'])
          args.push('--receipt', `${step.name}${suffix}=${path.join(evidence, `${step.name}${suffix}.json`)}`);
      }
      if (step.tool === 'emulators')
        args.push('--receipt', `${step.name}-tests=${path.join(evidence, `${step.name}-tests-exit.json`)}`);
      if (step.name === 'cloud-ui') {
        for (const name of ['compare-fixture', 'compare-fixture-report', 'compare-fixture-exit'])
          args.push('--receipt', `${name}=${path.join(evidence, `${name}.json`)}`);
      }
      if (step.name.endsWith('-build'))
        args.push('--receipt', `${step.name}-identity=${path.join(evidence, `${step.name}-identity.json`)}`);
      if (step.name.endsWith('check-budgets'))
        args.push('--receipt', `${step.name}-data=${path.join(evidence, `${step.name}.json`)}`);
    }
    await runCommand(
      `${profile}-manifest`,
      cwd,
      evidence,
      process.execPath,
      [cli(cwd, 'npm'), ...args],
      gateEnvironment(process.env, profile),
    );
  }
  await json(path.join(evidence, 'gate-complete.json'), { exitCode: 0, sha, finishedAt: new Date().toISOString() });
}

async function main(args: string[]) {
  if (args.length === 1 && args[0] === '--dry-run') {
    console.log(
      JSON.stringify(
        { node: GATE_NODE, ports, steps: gatePlan(), final: ['configured-manifest', 'offline-manifest'] },
        null,
        2,
      ),
    );
    return;
  }
  if (args.length === 3 && args[0] === '--inner') {
    const step = gatePlan().find((step) => step.name === args[1] && step.tool === 'emulators');
    if (!step) throw new Error('Unknown inner emulator step.');
    await runInner(step, path.resolve(args[2]!));
    return;
  }
  if (args.length !== 4 || args[0] !== '--evidence' || args[2] !== '--offline-checkout') {
    throw new Error('Usage: release:gate --dry-run | --evidence NEW_DIRECTORY --offline-checkout CLEAN_CHECKOUT');
  }
  await releaseGate(path.resolve(args[1]!), path.resolve(args[3]!));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((cause: unknown) => {
    console.error(cause instanceof Error ? cause.message : 'Release gate failed.');
    process.exitCode = 1;
  });
}
