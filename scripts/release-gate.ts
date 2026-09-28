import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { createServer as createTcpServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { requireObject } from '../src/lib/guards.js';
import { summarizePlaywright, summarizeVitest } from './release-manifest';

export const GATE_NODE = 'v24.21.0';
const ports = [4187, 9199, 8188, 4417, 4517, 9150];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
type Profile = 'configured' | 'offline' | 'emulator';
export interface GateStep {
  name: string;
  profile: Profile;
  tool: 'npm' | 'vitest' | 'playwright' | 'emulators';
  args: string[];
  report?: 'vitest' | 'playwright';
  expectedPassed?: number;
}

export function gatePlan(): GateStep[] {
  const steps: GateStep[] = ['lint', 'typecheck:functions', 'validate:data', 'validate:discovery'].map((script) => ({
    name: script.replaceAll(':', '-'),
    profile: 'configured',
    tool: 'npm',
    args: ['run', script],
  }));
  steps.unshift({ name: 'types', profile: 'configured', tool: 'npm', args: ['exec', '--no', '--', 'tsc', '-b'] });
  steps.push({
    name: 'unit-browser',
    profile: 'configured',
    tool: 'vitest',
    args: ['run', '--maxWorkers=1'],
    report: 'vitest',
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
    steps.push({ name, profile: 'configured', tool: 'playwright', args: ['test'], report: 'playwright' });
  }
  steps.push(
    { name: 'cloud-ui', profile: 'emulator', tool: 'emulators', args: [], report: 'playwright' },
    { name: 'sync-20', profile: 'emulator', tool: 'emulators', args: [], report: 'playwright', expectedPassed: 40 },
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

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
async function json(file: string, value: unknown) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}
export function commandReceipt(name: string, exitCode: number | null, log: Buffer, error?: string) {
  return { name, exitCode, logSha256: hash(log), logBytes: log.length, ...(error ? { error } : {}) };
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

async function runCommand(
  name: string,
  cwd: string,
  evidence: string,
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) {
  const logPath = path.join(evidence, `${name}.log`);
  // Reserve before spawning; a failed attempt is never overwritten or retried.
  await writeFile(logPath, '', { flag: 'wx' });
  const output = createWriteStream(logPath, { flags: 'a' });
  const startedAt = new Date().toISOString();
  let exitCode: number | null = null;
  let failure: string | undefined;
  try {
    exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.pipe(output, { end: false });
      child.stderr.pipe(output, { end: false });
      output.once('error', (cause) => {
        child.kill();
        reject(cause);
      });
      child.once('error', reject);
      child.once('close', (code, signal) => resolve(signal ? 1 : (code ?? 1)));
    });
  } catch (cause) {
    failure = cause instanceof Error ? cause.message : 'Command could not run.';
  } finally {
    await new Promise<void>((resolve, reject) =>
      output.end((error?: Error | null) => (error ? reject(error) : resolve())),
    );
    await json(path.join(evidence, `${name}-exit.json`), {
      ...commandReceipt(name, exitCode, await readFile(logPath), failure),
      command: [executable, ...args],
      startedAt,
      finishedAt: new Date().toISOString(),
    });
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

function reporterArgs(step: GateStep, evidence: string) {
  if (step.report === 'vitest')
    return ['--reporter=default', '--reporter=json', `--outputFile=${path.join(evidence, `${step.name}.json`)}`];
  return [
    '--project=desktop',
    '--project=mobile',
    '--workers=2',
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
      [cli(root, 'playwright'), ...args, ...reporterArgs(step, evidence), '--workers=1'],
      env,
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

export async function releaseGate(evidence: string, offline: string) {
  if (process.version !== GATE_NODE) throw new Error(`Use pinned Node ${GATE_NODE}, not ${process.version}.`);
  for (const name of ['PLAY100_BASE_URL', 'PLAY100_REUSE_SERVER', 'PLAY100_ALLOW_ONLY', 'PLAY100_GOOGLE_LIVE']) {
    if (process.env[name]) throw new Error(`Unset ${name}; the gate never reuses servers or runs live Google.`);
  }
  for (const name of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'APP_ID']) {
    if (!process.env[`VITE_FIREBASE_${name}`]?.trim())
      throw new Error('Load reviewed public Production Firebase values first.');
  }
  const sha = git(root, 'rev-parse', 'HEAD');
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
    tree: git(root, 'rev-parse', 'HEAD^{tree}'),
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
    env.PLAYWRIGHT_JSON_OUTPUT_FILE = path.join(evidence, `${step.name}.json`);
    if (step.tool === 'playwright') env.PLAY100_TEST_BUILD = step.name === 'development' ? 'development' : 'production';
    const args = [...step.args];
    if (step.tool === 'emulators') {
      const local = path.join(evidence, `${step.name}-emulators`);
      await mkdir(local);
      for (const file of ['firebase.json', 'firestore.rules', 'firestore.indexes.json']) {
        await copyFile(path.join(root, file), path.join(local, file));
      }
      const command = [
        process.execPath,
        '--import',
        path.join(root, 'node_modules', 'tsx', 'dist', 'loader.mjs'),
        fileURLToPath(import.meta.url),
        '--inner',
        step.name,
        evidence,
      ]
        .map(quoteShell)
        .join(' ');
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
    } else {
      if (step.report) args.push(...reporterArgs(step, evidence));
      if (step.name.endsWith('check-budgets')) args.push('--', '--json', path.join(evidence, `${step.name}.json`));
      await runCommand(step.name, cwd, evidence, process.execPath, [cli(cwd, step.tool), ...args], env);
    }
    if (step.report) {
      const bytes = await readFile(path.join(evidence, `${step.name}.json`));
      await json(path.join(evidence, `${step.name}-summary.json`), {
        sha256: hash(bytes),
        ...checkGateReport(step, JSON.parse(bytes.toString('utf8'))),
      });
    }
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
      args.push('--receipt', `${step.name}=${path.join(evidence, `${step.name}-exit.json`)}`);
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
