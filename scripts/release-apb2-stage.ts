import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { createConnection } from 'node:net';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Browser, type BrowserServer, type Page } from '@playwright/test';
import {
  APB2_ORIGIN,
  APB2_PORT,
  APB2_PROTOCOL,
  APB2_PROTOCOL_ID,
  APB2_PROTOCOL_JSON_SHA256,
  APB2_STAGE_MINUTES,
  contractDifferences,
  fixtureDbVersion,
  moduleEntry,
  verifyProtocol,
  type Apb2ProfileId,
  type Budget,
} from './release-apb2-contract';
import {
  recomputeRows,
  repetitionRecords,
  summarizeTable,
  writeRepetitionRecords,
  type CapturedSample,
} from './release-apb2-records';
import { closureErrors, settleClosure, stageResult } from './release-apb2-outcome';

/** The surface of the pinned v3.2 modules the runner drives; they are plain JavaScript loaded from --protocol. */
interface FrozenProfile {
  id: string;
  viewport: { width: number; height: number };
  dpr: number;
  mobile: boolean;
  touch: boolean;
  cpuRate: number;
}
interface FrozenBuild {
  commit: string;
  dist: string;
  entry: string;
  manifestSha256: string;
  files: { path: string; bytes: number; sha256: string }[];
  archiveSource: string;
  archiveTree: string;
}
interface FrozenConfig {
  apb: {
    id: string;
    profiles: FrozenProfile[];
    budgets: Record<string, Record<string, Budget>>;
    journeysInOrder: string[];
    hintEnabled: boolean;
  };
  probe: string;
  witness: string;
  fixtures: Record<string, unknown>;
  scenarios: Record<string, unknown>;
  staticControl: { route: string; sha256: string; html: string };
  hintBinding: { runtimeBound: boolean; status: string };
}
interface HintProof {
  status: 'FINAL_CANDIDATE_SOURCE_BOUND';
  integratedCandidateValidated: true;
  parentContractConfirmed: true;
  sourceCommit: string;
  relativePath: string;
  sourceArtifact: string;
  sourceSha256: string;
  sourceGitBlob: string;
  candidateReceiptPath: string;
  candidateReceiptSha256: string;
  relatedSourceArtifacts: { relativePath: string; artifact: string; sha256: string; gitBlob: string }[];
}
interface FrozenRun {
  status: string;
  observations: { file: string; journey: string; repetition: number }[];
  errors: unknown[];
  remainingOwnedContexts: number;
  browserClose: unknown;
}
interface FrozenAdapter {
  configuration(build: FrozenBuild, options: { enableHint: boolean; hintProof: HintProof }): Promise<FrozenConfig>;
  readPreflightCapabilities(page: Page): Promise<{ capabilities: unknown }>;
  preflightOrdinaryPin(input: {
    page: Page;
    config: FrozenConfig;
    profile: FrozenProfile;
    phase: string;
    persist: (value: unknown) => Promise<void>;
  }): Promise<Record<string, unknown>>;
  runStage(input: {
    browser: Browser;
    config: FrozenConfig;
    lease: Record<string, unknown>;
    checkLease: (reserve?: number) => void;
    output: string;
  }): Promise<FrozenRun>;
  aggregate(config: FrozenConfig, profileId: string, samples: unknown[]): { results: Record<string, unknown>[] };
}
interface FrozenHelpers {
  finiteStep(run: () => Promise<unknown>, ms: number, deadline: number, label: string): Promise<{ status: string }>;
  seedGuest(
    page: Page,
    origin: string,
    fixture: unknown,
    motion: string,
    tray: unknown[],
    check: () => void,
  ): Promise<unknown>;
  readyApp(
    page: Page,
    scenario: unknown,
    profile: FrozenProfile,
    build: FrozenBuild,
    origin: string,
    check: () => void,
  ): Promise<unknown>;
}
interface FrozenCdp {
  createCdpAttribution(cdp: unknown, options: { sessionLabel: string }): unknown;
  proveCanary(page: Page, ledger: unknown, options: Record<string, unknown>): Promise<unknown>;
}

export interface StageOptions {
  protocol: string;
  dist: string;
  evidence: string;
  profile: Apb2ProfileId;
  stageId: string;
  browserVersion: string;
  quietAttested: boolean;
  smoke: boolean;
  previousRuntime?: string;
}

const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const gitBlob = (bytes: Buffer) =>
  createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes)
    .digest('hex');
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repository, '--no-optional-locks', '-c', 'gc.auto=0', '--no-pager', ...args], {
    encoding: 'utf8',
  }).trim();
const gitBytes = (...args: string[]) =>
  execFileSync('git', ['-C', repository, '--no-optional-locks', '--no-pager', ...args], { maxBuffer: 64 << 20 });
const load = async <T>(root: string, ...parts: string[]) =>
  (await import(pathToFileURL(path.join(root, ...parts)).href)) as T;
export const RUNNER_FILES = [
  'release-apb2.ts',
  'release-apb2-contract.ts',
  'release-apb2-gate.ts',
  'release-apb2-outcome.ts',
  'release-apb2-records.ts',
  'release-apb2-stage.ts',
  'release-apb2-stats.ts',
  'release-apb2-v32-files.ts',
];

/** The committed runner's own files, by SHA-256, as this stage ran them. */
export async function runnerIdentity() {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  return Object.fromEntries(
    await Promise.all(
      RUNNER_FILES.map(async (file): Promise<[string, string]> => [
        file,
        sha256(await readFile(path.join(directory, file))),
      ]),
    ),
  );
}

export const portFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', (error: NodeJS.ErrnoException) => resolve(error.code === 'ECONNREFUSED'));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });

/** Every file of a build folder, sorted, with sizes and SHA-256; symbolic links are refused. */
export async function distFiles(dist: string) {
  const files: { path: string; bytes: number; sha256: string }[] = [];
  const walk = async (directory: string) => {
    assert.equal((await lstat(directory)).isSymbolicLink(), false, `Symbolic link in the build: ${directory}`);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      assert.equal(entry.isSymbolicLink(), false, `Symbolic link in the build: ${full}`);
      if (entry.isDirectory()) await walk(full);
      else {
        const bytes = await readFile(full);
        files.push({ path: path.relative(dist, full), bytes: bytes.length, sha256: sha256(bytes) });
      }
    }
  };
  await walk(dist);
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

const HINT_SOURCES = ['src/lib/motion-hint.ts', 'src/lib/personal-db.ts', 'src/lib/scoped-library.ts', 'src/App.tsx'];

/** Exports the hint-authority sources at HEAD and writes the source binding the pinned hint contract checks. */
async function bindSources(evidence: string, commit: string, tree: string, manifestSha256: string) {
  const exports = [];
  for (const file of HINT_SOURCES) {
    const bytes = gitBytes('cat-file', 'blob', `${commit}:${file}`);
    assert.equal(gitBlob(bytes), git('rev-parse', `${commit}:${file}`), `Git blob mismatch for ${file}`);
    const artifact = path.join(evidence, 'source', ...file.split('/'));
    await mkdir(path.dirname(artifact), { recursive: true });
    await writeFile(artifact, bytes, { flag: 'wx' });
    exports.push({
      relativePath: file.split('/').join('\\'),
      artifact,
      sha256: sha256(bytes),
      gitBlob: gitBlob(bytes),
    });
  }
  const binding = { protocol: APB2_PROTOCOL, commit, tree, distManifestSha256: manifestSha256, exports };
  const bindingPath = path.join(evidence, 'source-binding.json');
  await writeFile(bindingPath, JSON.stringify(binding, null, 2) + '\n', { flag: 'wx' });
  const hint = exports[0] as (typeof exports)[number];
  const proof: HintProof = {
    status: 'FINAL_CANDIDATE_SOURCE_BOUND',
    integratedCandidateValidated: true,
    parentContractConfirmed: true,
    sourceCommit: commit,
    relativePath: hint.relativePath,
    sourceArtifact: hint.artifact,
    sourceSha256: hint.sha256,
    sourceGitBlob: hint.gitBlob,
    candidateReceiptPath: bindingPath,
    candidateReceiptSha256: sha256(await readFile(bindingPath)),
    relatedSourceArtifacts: exports.slice(1),
  };
  return proof;
}

/**
 * Binds HEAD (clean tracked files), the build folder (every file by SHA-256) and the hint-authority sources into the
 * evidence folder, and sets the fixture's IndexedDB version from the committed DB_VERSION (the v3.2 amendment).
 */
async function bindCandidate(evidence: string, distFolder: string) {
  const commit = git('rev-parse', 'HEAD');
  const tree = git('rev-parse', 'HEAD^{tree}');
  assert.equal(git('status', '--porcelain', '--untracked-files=no'), '', 'Commit tracked changes before a stage.');
  const dist = path.resolve(distFolder);
  const files = await distFiles(dist);
  const manifest = {
    Source: commit,
    Tree: tree,
    Root: dist,
    Files: files.map((file) => ({ File: file.path, Bytes: file.bytes, SHA256: file.sha256 })),
  };
  const manifestPath = path.join(evidence, 'dist-manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  const manifestSha256 = sha256(await readFile(manifestPath));
  const build: FrozenBuild = {
    commit,
    dist,
    entry: moduleEntry(await readFile(path.join(dist, 'index.html'), 'utf8')),
    manifestSha256,
    files,
    archiveSource: commit,
    archiveTree: tree,
  };
  const dbVersion = fixtureDbVersion(git('show', `${commit}:src/lib/personal-db.ts`));
  process.env.APB2_FIXTURE_DB_VERSION = String(dbVersion);
  const proof = await bindSources(evidence, commit, tree, manifestSha256);
  return { commit, tree, dist, files, build, proof, dbVersion };
}

/** The read-only archive server of the stage: the bound build only, HTML no-store, /api and /__/auth answered 503. */
function archiveServer(
  build: FrozenBuild,
  staticControl: FrozenConfig['staticControl'],
  protocolSha: string,
  expiresAt: () => number,
  onError: (message: string) => void,
) {
  const allowed = new Map(build.files.map((file) => [path.resolve(build.dist, file.path), file]));
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.mp4': 'video/mp4',
    '.webmanifest': 'application/manifest+json',
  };
  let pageRequests = 0;
  const meta = () => ({
    variant: 'baseline',
    commit: build.commit,
    compilerProduction: true,
    hmr: false,
    archive: build.dist,
    manifestSha256: build.manifestSha256,
    pageRequests,
  });
  const htmlHeaders = (bytes: Buffer) => ({
    'Content-Type': types['.html'] as string,
    'Content-Length': bytes.length,
    'X-Motion-Build': build.commit,
    'Cache-Control': 'no-store',
  });
  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        const send = (status: number, body: string, type = 'application/json') => {
          res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
          res.end(body);
        };
        if (Date.now() >= expiresAt() - 30000) return send(503, '{"error":"APB2 closure reserve"}');
        const url = new URL(req.url ?? '/', APB2_ORIGIN);
        if (url.pathname === '/__perf/meta') return send(200, JSON.stringify(meta()));
        if (url.pathname === '/__perf/select' && req.method === 'POST') {
          assert.equal(req.headers['x-motion-protocol'], protocolSha);
          assert.equal(url.searchParams.get('variant'), 'baseline');
          return send(200, JSON.stringify(meta()));
        }
        if (url.pathname === '/__perf/blank')
          return send(200, '<!doctype html><title>Owned APB2 setup</title>', types['.html']);
        if (url.pathname === '/__perf/redirect-guard') {
          res.writeHead(302, {
            Location: 'https://motion-guard-probe.invalid/redirect-target',
            'Cache-Control': 'no-store',
          });
          return res.end();
        }
        if (!['GET', 'HEAD'].includes(req.method ?? '')) return send(405, '{"error":"read-only archive"}');
        if (url.pathname === staticControl.route) {
          res.writeHead(200, htmlHeaders(Buffer.from(staticControl.html)));
          return res.end(req.method === 'HEAD' ? undefined : staticControl.html);
        }
        if (/^\/(?:api\/|__\/auth\/)/.test(url.pathname)) return send(503, '{"error":"no provider or auth benchmark"}');
        const relative = decodeURIComponent(url.pathname).replace(/^[/\\]+/, '');
        let file = path.resolve(build.dist, relative);
        if (file !== build.dist && !file.startsWith(build.dist + path.sep))
          return send(403, '{"error":"archive boundary"}');
        if (!allowed.has(file)) {
          if (path.extname(relative)) return send(404, '{"error":"unbound asset"}');
          file = path.join(build.dist, 'index.html');
        }
        const expected = allowed.get(file);
        assert.ok(expected);
        const bytes = await readFile(file);
        assert.equal(sha256(bytes), expected.sha256);
        pageRequests++;
        const ext = path.extname(file);
        res.writeHead(
          200,
          ext === '.html'
            ? htmlHeaders(bytes)
            : {
                'Content-Type': types[ext] ?? 'application/octet-stream',
                'Content-Length': bytes.length,
                'X-Motion-Build': build.commit,
                'Cache-Control': ext === '.json' ? 'no-store' : 'public,max-age=31536000,immutable',
              },
        );
        res.end(req.method === 'HEAD' ? undefined : bytes);
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
        res.destroy();
      }
    })();
  });
  return { server, allowed };
}

/**
 * One APB2 v3.2 stage: the pinned measurement set, checked file by file against the committed digests, captures the
 * fixed 72-context population of one profile from the bound build on 127.0.0.1:4199 in stock Chrome. The capture is
 * written where the pinned adapter requires it (under the protocol folder); every receipt, the per-repetition records
 * and the recomputed table are written to the evidence folder. A functional smoke runs the same path under a short
 * lease, so it stops after the first contexts and makes no timing claim.
 */
export async function runApb2Stage(options: StageOptions) {
  assert.ok(
    options.quietAttested || options.smoke,
    'Attest the quiet host with --quiet-attested before a campaign stage.',
  );
  assert.ok(/^[a-z0-9][a-z0-9-]{2,60}$/.test(options.stageId), 'The stage id must be a short lowercase name.');
  const evidence = path.join(path.resolve(options.evidence), options.stageId);
  await mkdir(evidence, { recursive: false });
  const persistEvidence = (name: string, value: unknown) =>
    writeFile(path.join(evidence, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const verification = await verifyProtocol(options.protocol);
  await persistEvidence('protocol-verification.json', verification);
  assert.ok(verification.ok, `The pinned APB2 v3.2 set differs: ${JSON.stringify(verification).slice(0, 400)}`);
  const { commit, tree, dist, files, build, proof, dbVersion } = await bindCandidate(evidence, options.dist);
  const manifestSha256 = build.manifestSha256;
  const bHome = options.protocol;
  const bRoot = path.join(bHome, 'round4-apb2');
  const adapter = await load<FrozenAdapter>(bRoot, 'adapter.mjs');
  const { nativeContext } = await load<{ nativeContext: (actual: unknown) => unknown }>(
    bHome,
    'quality-270f-performance',
    'current-observer-v5.mjs',
  );
  const helpers = await load<FrozenHelpers>(bHome, 'motion-performance', 'paired-v2-helpers.mjs');
  const { nativeRulesFor } = await load<{ nativeRulesFor: (origin: string) => unknown }>(
    bHome,
    'motion-performance',
    'paired-v2-observe.mjs',
  );
  const cdpAttribution = await load<FrozenCdp>(bHome, 'motion-performance', 'cdp-attribution-v3-1.mjs');
  const { sameHtmlPolicy } = await load<{ sameHtmlPolicy: (a: unknown, b: unknown) => boolean }>(
    bRoot,
    'paint-control.mjs',
  );
  const config = await adapter.configuration(build, { enableHint: false, hintProof: proof });
  const differences = contractDifferences(config);
  assert.deepEqual(
    differences,
    [],
    `The pinned protocol disagrees with the committed contract: ${differences.join(', ')}`,
  );
  const profile = config.apb.profiles.find((item) => item.id === options.profile);
  assert.ok(profile, `Unknown profile ${options.profile}`);
  const output = path.join(bRoot, options.stageId);
  await mkdir(output, { recursive: false });
  const persist = (name: string, value: unknown) =>
    writeFile(path.join(output, name), JSON.stringify(value, null, 2), { flag: 'wx' });
  await writeFile(path.join(output, 'constructed-probe.js'), config.probe, { flag: 'wx' });
  await writeFile(path.join(output, 'constructed-witness.js'), config.witness, { flag: 'wx' });
  const start = Date.now();
  const minutes = options.smoke ? 3.5 : APB2_STAGE_MINUTES;
  const runner = await runnerIdentity();
  const lease: Record<string, unknown> = {
    status: 'GRANTED',
    issuer: 'release-apb2',
    leaseId: options.stageId,
    protocolId: APB2_PROTOCOL_ID,
    protocolSha256: APB2_PROTOCOL_JSON_SHA256,
    absolutePerformance: true,
    apb2: true,
    apb2HintEnabled: false,
    apb2StagePart: 0,
    apbProfile: options.profile,
    currentMode: 'current-baseline',
    currentBaselineCommit: commit,
    candidateCommit: commit,
    baselineManifestSha256: manifestSha256,
    origin: APB2_ORIGIN,
    projectExclusive: true,
    allowedStages: ['current-performance'],
    browserChannel: 'chrome',
    browserTransport: 'playwright',
    browserVersion: options.browserVersion,
    notBefore: new Date(start).toISOString(),
    expiresAt: new Date(start + minutes * 60000).toISOString(),
    quiet: {
      status: 'QUIET_GRANTED',
      UWritesAndHooksFinished: true,
      QWritesAndHooksFinished: true,
      integratorHold: true,
      securityEmulatorsAndTestsClosed: true,
      basis: options.quietAttested
        ? 'The operator attested a quiet host with --quiet-attested (no other test, server, emulator or build on this host).'
        : 'Functional smoke without a quiet attestation: the pinned lease needs these fields, and the smoke makes no timing claim.',
    },
    purpose: options.smoke ? 'functional-smoke' : 'campaign',
    runner,
    constructedProbeSHA256: sha256(config.probe),
    constructedWitnessSHA256: sha256(config.witness),
    inheritedComparisonFieldsMeaning: `B-only absolute capture under ${APB2_PROTOCOL}; no A side and no pairing.`,
  };
  const receipt: Record<string, unknown> & { errors: unknown[] } = {
    protocol: APB2_PROTOCOL,
    purpose: lease.purpose,
    profile: options.profile,
    commit,
    tree,
    stageId: options.stageId,
    capture: path.join(output, 'capture'),
    node: process.version,
    startedAt: lease.notBefore,
    status: 'SETUP',
    expectedContexts: 72,
    expectedActionWindows: 104,
    timingClaims: !options.smoke,
    quietAttested: options.quietAttested,
    fixtureDbVersion: dbVersion,
    errors: [],
  };
  let integrityError: string | null = null;
  const checkLease = (reserve = 0) => {
    assert.equal(integrityError, null, 'Archive server integrity failed.');
    assert.ok(Date.now() + reserve < Date.parse(lease.expiresAt as string), 'Finite APB2 lease/reserve exhausted.');
  };
  const bookend = async () => {
    assert.equal(git('rev-parse', 'HEAD'), commit);
    assert.equal(git('rev-parse', 'HEAD^{tree}'), tree);
    assert.equal(git('status', '--porcelain', '--untracked-files=no'), '');
    assert.deepEqual(await distFiles(dist), files);
    const again = await verifyProtocol(options.protocol);
    assert.ok(
      again.ok && again.missing.length === 0 && again.changed.length === 0,
      'The pinned set changed during the stage.',
    );
    return { at: new Date().toISOString(), commit, tree, buildFiles: files.length, protocolFiles: again.files };
  };
  let server: http.Server | undefined;
  let browserServer: BrowserServer | undefined;
  let browser: Browser | undefined;
  let chromePid: number | undefined;
  let browserPort: number | undefined;
  let deadlineTimer: NodeJS.Timeout | undefined;
  let closure: Promise<void> | undefined;
  const expires = () => Date.parse(lease.expiresAt as string);
  const closeOwned = () => {
    closure ??= (async () => {
      const connected = browser?.isConnected() ? browser : undefined;
      if (connected)
        for (const context of connected.contexts()) {
          const close = await helpers.finiteStep(
            () => context.close(),
            10000,
            expires() - 20000,
            'APB2 runner context close',
          );
          if (close.status !== 'CONFIRMED') receipt.errors.push({ kind: 'CONTEXT_CLOSE', close });
        }
      receipt.browserServerClose = await helpers.finiteStep(
        () => browserServer?.close() ?? Promise.resolve(),
        10000,
        expires() - 10000,
        'APB2 owned Chrome close',
      );
      if (connected?.isConnected())
        receipt.browserConnectionClose = await helpers.finiteStep(
          () => connected.close(),
          5000,
          expires() - 5000,
          'APB2 browser connection close',
        );
      const listening = server?.listening ? server : undefined;
      if (listening) {
        listening.closeAllConnections();
        await new Promise<void>((resolve) => listening.close(() => resolve()));
      }
    })();
    return closure;
  };
  let run: FrozenRun | undefined;
  try {
    receipt.before = await bookend();
    assert.equal(await portFree(APB2_PORT), true, `Port ${APB2_PORT} is in use.`);
    const archive = archiveServer(build, config.staticControl, APB2_PROTOCOL_JSON_SHA256, expires, (message) => {
      integrityError = message;
      receipt.errors.push({ kind: 'SERVER', message });
    });
    server = archive.server;
    const listening = server;
    await new Promise<void>((resolve, reject) => {
      listening.once('error', reject);
      listening.listen(APB2_PORT, '127.0.0.1', () => resolve());
    });
    const landing = await fetch(APB2_ORIGIN + '/', { signal: AbortSignal.timeout(5000) });
    assert.equal(
      sha256(Buffer.from(await landing.arrayBuffer())),
      archive.allowed.get(path.join(dist, 'index.html'))?.sha256,
    );
    const control = await fetch(APB2_ORIGIN + config.staticControl.route, { signal: AbortSignal.timeout(5000) });
    assert.equal(sha256(Buffer.from(await control.arrayBuffer())), config.staticControl.sha256);
    lease.landingHtmlHeaders = Object.fromEntries(landing.headers);
    lease.staticControl = {
      sha256: config.staticControl.sha256,
      headers: Object.fromEntries(control.headers),
      headerParityVerified: sameHtmlPolicy(Object.fromEntries(landing.headers), Object.fromEntries(control.headers)),
    };
    assert.equal((lease.staticControl as { headerParityVerified: boolean }).headerParityVerified, true);
    deadlineTimer = setTimeout(() => void closeOwned(), expires() - Date.now() - 30000);
    browserServer = await chromium.launchServer({
      channel: 'chrome',
      headless: true,
      host: '127.0.0.1',
      port: 0,
      args: ['--force-effective-connection-type=4G'],
      ignoreDefaultArgs: [
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    });
    chromePid = browserServer.process().pid;
    browserPort = Number(new URL(browserServer.wsEndpoint()).port);
    browser = await chromium.connect(browserServer.wsEndpoint());
    assert.equal(
      browser.version(),
      options.browserVersion,
      `Chrome ${browser.version()} is not the bound ${options.browserVersion}.`,
    );
    lease.browserLaunchArguments = browserServer.process().spawnargs;
    const contextOptions = {
      viewport: profile.viewport,
      deviceScaleFactor: profile.dpr,
      isMobile: profile.mobile,
      hasTouch: profile.touch,
      reducedMotion: 'no-preference' as const,
      serviceWorkers: 'block' as const,
      locale: 'en-US',
      timezoneId: 'UTC',
      acceptDownloads: false,
    };
    const capabilityContext = await browser.newContext(contextOptions);
    const capabilityPage = await capabilityContext.newPage();
    const capabilities = await adapter.readPreflightCapabilities(capabilityPage);
    const actual = await capabilityPage.evaluate(() => {
      const connection = (navigator as Navigator & { connection?: { saveData: boolean; effectiveType: string } })
        .connection;
      return {
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
        connection: connection ? { saveData: connection.saveData, effectiveType: connection.effectiveType } : null,
      };
    });
    await capabilityContext.close();
    assert.equal(actual.connection?.effectiveType, '4g');
    assert.equal(actual.connection?.saveData, false);
    lease.nativeContext = nativeContext(actual);
    lease.eventTimingCapabilities = capabilities.capabilities;
    if (options.previousRuntime) {
      const previous = JSON.parse(await readFile(options.previousRuntime, 'utf8')) as Record<string, unknown>;
      assert.equal(previous.browserVersion, browser.version());
      assert.deepEqual(previous.nativeContext, lease.nativeContext);
      assert.deepEqual(previous.eventTimingCapabilities, lease.eventTimingCapabilities);
    }
    const setup = await browser.newContext(contextOptions);
    await setup.addInitScript(() => {
      if (globalThis.RTCPeerConnection !== undefined)
        Object.defineProperty(globalThis, 'RTCPeerConnection', { configurable: true, value: undefined });
    });
    await setup.addInitScript(config.probe);
    await setup.addInitScript(config.witness);
    const page = await setup.newPage();
    const cdp = await setup.newCDPSession(page);
    // The pinned protocol's own CDP parameters are sent as recorded (they predate some of Playwright's protocol types).
    const send = (method: string, params?: Record<string, unknown>) =>
      (cdp as unknown as { send(method: string, params?: Record<string, unknown>): Promise<unknown> }).send(
        method,
        params,
      );
    const ledger = cdpAttribution.createCdpAttribution(cdp, { sessionLabel: `${options.stageId}-pin-setup` });
    const descendants: string[] = [];
    cdp.on('Target.attachedToTarget', (event) => {
      descendants.push(event.targetInfo.type);
      void setup.close();
    });
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    await send('Network.enable');
    await send('Network.setBlockedURLs', { urlPatterns: nativeRulesFor(APB2_ORIGIN) });
    await send('Network.setBypassServiceWorker', { bypass: true });
    await send('Emulation.setCPUThrottlingRate', { rate: profile.cpuRate });
    await page.goto(APB2_ORIGIN + '/__perf/blank', { waitUntil: 'load', timeout: 15000 });
    receipt.setupGuards = {
      direct: await cdpAttribution.proveCanary(page, ledger, {
        initialUrl: 'https://motion-guard-probe.invalid/direct',
      }),
      redirect: await cdpAttribution.proveCanary(page, ledger, {
        initialUrl: APB2_ORIGIN + '/__perf/redirect-guard',
        blockedUrl: 'https://motion-guard-probe.invalid/redirect-target',
        redirect: true,
      }),
    };
    await helpers.seedGuest(page, APB2_ORIGIN, config.fixtures.small, 'auto', [], checkLease);
    await page.goto(APB2_ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await helpers.readyApp(page, config.scenarios['ordinary-pin'], profile, build, APB2_ORIGIN, checkLease);
    const pin = await adapter.preflightOrdinaryPin({
      page,
      config,
      profile,
      phase: 'UNTIMED_STAGE_PREFLIGHT',
      persist: (value) => persist('pin-preflight-raw.json', value),
    });
    await setup.close();
    assert.equal(descendants.length, 0);
    assert.equal(browser.contexts().length, 0);
    lease.ordinaryPinPreflight = { ...pin, setupContextClosedBeforeTiming: true };
    await persist('pin-preflight.json', lease.ordinaryPinPreflight);
    const runtime = {
      browserVersion: browser.version(),
      nativeContext: lease.nativeContext,
      eventTimingCapabilities: lease.eventTimingCapabilities,
      actual,
      chromePid,
      browserPort,
      launchArguments: lease.browserLaunchArguments,
      setupContextClosedBeforeTiming: true,
    };
    await persist('runtime.json', runtime);
    await persist('lease.json', lease);
    receipt.captureStartedAt = new Date().toISOString();
    console.log(
      JSON.stringify({
        kind: 'APB2_STAGE_START',
        profile: options.profile,
        output,
        chromePid,
        browserPort,
        expiresAt: lease.expiresAt,
      }),
    );
    run = await adapter.runStage({ browser, config, lease, checkLease, output: path.join(output, 'capture') });
    receipt.run = {
      status: run.status,
      observations: run.observations.length,
      errors: run.errors,
      remainingOwnedContexts: run.remainingOwnedContexts,
      browserClose: run.browserClose,
    };
    receipt.status = 'CAPTURE_RETAINED';
  } catch (error) {
    receipt.status = 'RUNNER_FAILURE_RETAINED_NO_RETRY';
    receipt.errors.push({
      kind: 'RUNNER',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    clearTimeout(deadlineTimer);
    await closeOwned();
    receipt.closure = await settleClosure(async () => {
      try {
        return await physicalClosure(chromePid, browserPort, path.join(output, 'runtime.json'));
      } catch (error) {
        return {
          at: new Date().toISOString(),
          closed: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    if ((receipt.closure as { closed: boolean }).closed) {
      try {
        receipt.after = await bookend();
      } catch (error) {
        receipt.errors.push({ kind: 'BOOKEND', message: error instanceof Error ? error.message : String(error) });
      }
    }
    receipt.errors.push(...closureErrors(receipt.closure as { closed: boolean }, receipt.after));
    receipt.finishedAt = new Date().toISOString();
    receipt.withinLease = Date.now() < expires();
  }
  if (run) {
    try {
      receipt.collection = await collectStage({
        protocol: options.protocol,
        capture: path.join(output, 'capture'),
        evidence,
        profile: options.profile,
        config,
      });
    } catch (error) {
      receipt.errors.push({ kind: 'COLLECTION', message: error instanceof Error ? error.message : String(error) });
    }
  }
  const collection = receipt.collection as { equal?: boolean } | undefined;
  receipt.result = stageResult({
    smoke: options.smoke,
    run: run && { status: run.status, observations: run.observations.length },
    errors: receipt.errors.length,
    collectionEqual: collection?.equal === true,
    closed: (receipt.closure as { closed?: boolean } | undefined)?.closed === true,
    after: Boolean(receipt.after),
  });
  await persistEvidence('stage.json', receipt);
  console.log(
    JSON.stringify(
      {
        kind: 'APB2_STAGE_END',
        evidence,
        result: receipt.result,
        status: receipt.status,
        run: receipt.run,
        errors: receipt.errors,
      },
      null,
      2,
    ),
  );
  return receipt;
}

/** The owned Chrome's temporary profile folder name, from the launch arguments the stage recorded. */
async function chromeProfile(runtimePath: string) {
  try {
    const runtime = JSON.parse(await readFile(runtimePath, 'utf8')) as { launchArguments?: string[] };
    const argument = runtime.launchArguments?.find((value) => value.startsWith('--user-data-dir='));
    return argument ? path.basename(argument.slice('--user-data-dir='.length)) : null;
  } catch {
    return null;
  }
}

/** After the owned Chrome closes: its process tree and profile are gone and both ports are free (Windows process table). */
async function physicalClosure(chromePid: number | undefined, browserPort: number | undefined, runtimePath: string) {
  let chromeAbsent = chromePid === undefined;
  if (chromePid !== undefined) {
    try {
      process.kill(chromePid, 0);
    } catch (error) {
      chromeAbsent = (error as NodeJS.ErrnoException).code === 'ESRCH';
    }
  }
  let remaining: unknown[] | null = null;
  if (process.platform === 'win32' && chromePid !== undefined) {
    const profile = await chromeProfile(runtimePath);
    const filter = [`$_.ProcessId -eq ${chromePid}`, `$_.ParentProcessId -eq ${chromePid}`];
    if (profile && /^[A-Za-z0-9_-]+$/.test(profile))
      filter.push(`($_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*${profile}*')`);
    const command = `@(Get-CimInstance Win32_Process | Where-Object { ${filter.join(' -or ')} } | Select-Object ProcessId,ParentProcessId,Name) | ConvertTo-Json -Compress`;
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      encoding: 'utf8',
      timeout: 30000,
    }).trim();
    remaining = output ? [JSON.parse(output) as unknown].flat() : [];
  }
  const browserPortFree = browserPort === undefined || (await portFree(browserPort));
  const archivePortFree = await portFree(APB2_PORT);
  return {
    at: new Date().toISOString(),
    chromePid,
    chromeAbsent,
    remainingProcesses: remaining,
    browserPort,
    browserPortFree,
    archivePortFree,
    closed: chromeAbsent && browserPortFree && archivePortFree && (remaining === null || remaining.length === 0),
  };
}

/**
 * Writes the per-repetition records of one captured stage, the pinned aggregation's rows and the recomputed rows, and
 * requires them to agree field by field. Works on any capture of the pinned protocol, including one made by another
 * harness of the same protocol, as long as it captured this checkout's HEAD.
 */
export async function collectStage(input: {
  protocol: string;
  capture: string;
  evidence: string;
  profile: Apb2ProfileId;
  config: FrozenConfig;
}) {
  const runFile = path.join(input.capture, 'run.json');
  const runBytes = await readFile(runFile);
  const run = JSON.parse(runBytes.toString('utf8')) as FrozenRun & { profile: string; build: string };
  assert.equal(run.profile, input.profile, 'The capture is of another profile.');
  const samples: { file: string; sha256: string; sample: CapturedSample }[] = [];
  for (const observation of run.observations) {
    const bytes = await readFile(path.join(input.capture, observation.file));
    samples.push({
      file: observation.file,
      sha256: sha256(bytes),
      sample: JSON.parse(bytes.toString('utf8')) as CapturedSample,
    });
  }
  const records = repetitionRecords(input.profile, samples);
  const index = await writeRepetitionRecords(path.join(input.evidence, 'repetitions'), records);
  const adapter = await load<FrozenAdapter>(path.join(input.protocol, 'round4-apb2'), 'adapter.mjs');
  const frozen = adapter.aggregate(
    input.config,
    input.profile,
    samples.map(({ sample }) => sample),
  ).results;
  const recomputed = recomputeRows(input.profile, records);
  const summary = summarizeTable(frozen, recomputed);
  const table = {
    protocol: APB2_PROTOCOL,
    profile: input.profile,
    commit: run.build,
    capture: { run: runFile, sha256: sha256(runBytes), status: run.status, observations: run.observations.length },
    records: { directory: path.join(input.evidence, 'repetitions'), present: index.present, total: index.records },
    rows: summary.rows,
    gated: summary.gated,
    expectedGated: summary.expectedGated,
    passed: summary.passed,
    recomputation: { equal: summary.differences.length === 0, differences: summary.differences },
  };
  await writeFile(path.join(input.evidence, 'table.json'), JSON.stringify(table, null, 2) + '\n', { flag: 'wx' });
  return {
    table: path.join(input.evidence, 'table.json'),
    rows: summary.rows.length,
    gated: summary.gated,
    passed: summary.passed,
    allGatedPass: summary.allGatedPass,
    equal: summary.differences.length === 0,
    differences: summary.differences,
  };
}

/**
 * Collects a capture made earlier (for example by another harness of the same pinned protocol) from this checkout:
 * binds HEAD, the build and the sources into a fresh evidence folder, rebuilds the pinned configuration, and writes the
 * records and the recomputed table. The capture must be of this HEAD.
 */
export async function collectCapture(options: {
  protocol: string;
  capture: string;
  dist: string;
  evidence: string;
  profile: Apb2ProfileId;
  name: string;
}) {
  assert.ok(/^[a-z0-9][a-z0-9-]{2,60}$/.test(options.name), 'The collection name must be a short lowercase name.');
  const evidence = path.join(path.resolve(options.evidence), options.name);
  await mkdir(evidence, { recursive: false });
  const verification = await verifyProtocol(options.protocol);
  await writeFile(path.join(evidence, 'protocol-verification.json'), JSON.stringify(verification, null, 2) + '\n', {
    flag: 'wx',
  });
  assert.ok(verification.ok, 'The pinned APB2 v3.2 set differs.');
  const { commit, build, proof } = await bindCandidate(evidence, options.dist);
  const run = JSON.parse(await readFile(path.join(options.capture, 'run.json'), 'utf8')) as { build: string };
  assert.equal(run.build, commit, 'The capture is of another commit.');
  const adapter = await load<FrozenAdapter>(path.join(options.protocol, 'round4-apb2'), 'adapter.mjs');
  const config = await adapter.configuration(build, { enableHint: false, hintProof: proof });
  assert.deepEqual(contractDifferences(config), [], 'The pinned protocol disagrees with the committed contract.');
  const collection = await collectStage({
    protocol: options.protocol,
    capture: path.resolve(options.capture),
    evidence,
    profile: options.profile,
    config,
  });
  await writeFile(
    path.join(evidence, 'collection.json'),
    JSON.stringify(
      {
        protocol: APB2_PROTOCOL,
        commit,
        capture: path.resolve(options.capture),
        runner: await runnerIdentity(),
        collection,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  return collection;
}
