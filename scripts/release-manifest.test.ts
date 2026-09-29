import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectReleaseManifest,
  parseDecisions,
  parseManifestArguments,
  sha256,
  summarizeNpmAudit,
  summarizePlaywright,
  summarizeVitest,
  writeReleaseManifest,
} from './release-manifest';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));

const folders: string[] = [];
const sha = 'a'.repeat(40);
const tree = 'b'.repeat(40);
let dirty = false;
beforeEach(() => {
  dirty = false;
  vi.stubEnv('DEBUG', '');
  vi.mocked(execFileSync).mockImplementation((_command, args) => {
    if (args?.includes('HEAD^{tree}')) return tree;
    if (args?.includes('HEAD')) return sha;
    return dirty ? ' M src/example.ts' : '';
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true, maxRetries: 5 });
});

function vitestReport() {
  return vitestFixture().report;
}

/** A passing Vitest report and handles to its first file and assertion, for tests that corrupt one of them. */
function vitestFixture() {
  const assertion = { status: 'passed', failureMessages: [] as string[] };
  const file = {
    name: '/source/example.test.ts',
    status: 'passed',
    assertionResults: [
      assertion,
      { status: 'skipped', failureMessages: [] as string[] },
      { status: 'todo', failureMessages: [] as string[] },
    ],
  };
  const report = {
    numTotalTestSuites: 2,
    numPassedTestSuites: 2,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    numTotalTests: 3,
    numPassedTests: 1,
    numFailedTests: 0,
    numPendingTests: 1,
    numTodoTests: 1,
    success: true,
    testResults: [file],
  };
  return { report, file, assertion };
}

function playwrightReport() {
  return playwrightFixture().report;
}

/** A Playwright report and a handle to its first test, for tests that corrupt it. */
function playwrightFixture() {
  const first = { expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed' }] };
  const report = {
    errors: [] as { message: string }[],
    stats: { expected: 1, unexpected: 0, flaky: 1, skipped: 1 },
    suites: [
      {
        specs: [],
        suites: [
          {
            specs: [
              {
                file: 'example.spec.ts',
                ok: true,
                tests: [
                  first,
                  { expectedStatus: 'passed', status: 'flaky', results: [{ status: 'failed' }, { status: 'passed' }] },
                  { expectedStatus: 'skipped', status: 'skipped', results: [] },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  return { report, first };
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'play100-release-manifest-'));
  folders.push(root);
  async function put(name: string, content: string) {
    const file = path.join(root, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
    return file;
  }
  await put('package.json', '{}');
  await put('package-lock.json', '{"lockfileVersion":3}');
  for (const name of ['vite', 'vitest', '@playwright/test', 'npm']) {
    await put(path.join('node_modules', name, 'package.json'), JSON.stringify({ name, version: '1.2.3' }));
  }
  await put(
    path.join('dist', 'index.html'),
    '<!-- <script type="module" src="/assets/fake.js"></script> -->' +
      '<template id="p100-deferred"><script type="module" src="/assets/main.js"></script></template>',
  );
  for (const name of ['sw.js', 'pwa-assets.json', 'manifest.webmanifest', 'assets/main.js']) {
    await put(path.join('dist', name), `fixture: ${name}`);
  }
  await put('vitest.json', JSON.stringify(vitestReport()));
  await put('playwright.json', JSON.stringify(playwrightReport()));
  const args = ['receipt.json', '--vitest', 'vitest.json', '--playwright', 'playwright.json'];
  const environment = { npm_execpath: path.join(root, 'node_modules', 'npm', 'bin', 'npm-cli.js') };
  return { root, put, args, environment };
}

describe('native release result summaries', () => {
  it('counts Vitest files rather than describe suites and discloses unreported retries', () => {
    expect(summarizeVitest(vitestReport())).toEqual({ files: 1, passed: 1, failed: 0, skipped: 2, flaky: null });
  });

  it.each(['numFailedTests', 'numFailedTestSuites', 'numPendingTestSuites', 'numTotalTests'])(
    'refuses a failing or inconsistent Vitest %s count',
    (field) => {
      expect(() => summarizeVitest({ ...vitestReport(), [field]: 42 })).toThrow();
    },
  );

  it.each(['failed', 'pending', 'unknown'])('refuses Vitest assertion status %s', (status) => {
    const { report, assertion } = vitestFixture();
    assertion.status = status;
    expect(() => summarizeVitest(report)).toThrow();
  });

  it('rejects unsuccessful, empty and file-level failing Vitest reports', () => {
    expect(() => summarizeVitest({ ...vitestReport(), success: false })).toThrow();
    expect(() => summarizeVitest({ ...vitestReport(), testResults: [] })).toThrow();
    const { report, file } = vitestFixture();
    file.status = 'failed';
    expect(() => summarizeVitest(report)).toThrow();
    expect(() => summarizeVitest({ ...vitestReport(), snapshot: { failure: true } })).toThrow('snapshot failure');
  });

  it('counts nested Playwright files once across projects, skips and retries', () => {
    expect(summarizePlaywright(playwrightReport())).toEqual({ files: 1, passed: 1, failed: 0, skipped: 1, flaky: 1 });
  });

  it.each(['unexpected', 'timedOut', 'interrupted', 'unknown'])('refuses Playwright outcome %s', (status) => {
    const { report, first } = playwrightFixture();
    first.status = status;
    expect(() => summarizePlaywright(report)).toThrow();
  });

  it('refuses global Playwright errors even with all expected tests', () => {
    const report = playwrightReport();
    report.errors.push({ message: 'setup failed' });
    expect(() => summarizePlaywright(report)).toThrow('runner errors');
  });

  it('refuses a last interrupted attempt hidden behind an expected outcome', () => {
    const { report, first } = playwrightFixture();
    first.results = [{ status: 'interrupted' }];
    expect(() => summarizePlaywright(report)).toThrow('unfinished');
  });

  it('refuses expected failures, inconsistent counts and empty Playwright reports', () => {
    const { report, first } = playwrightFixture();
    first.expectedStatus = 'failed';
    expect(() => summarizePlaywright(report)).toThrow('expected failure');
    expect(() => summarizePlaywright({ ...playwrightReport(), stats: { expected: 100 } })).toThrow();
    expect(() => summarizePlaywright({ ...playwrightReport(), suites: [] })).toThrow();
  });

  it.each([null, [], {}, { testResults: [] }])('fails closed on malformed native input %#', (input) => {
    expect(() => summarizeVitest(input)).toThrow();
    expect(() => summarizePlaywright(input)).toThrow();
  });
});

describe('release manifest collection', () => {
  it('hashes native dependency audit JSON, nonzero advisory exit, dates and the candidate lockfile', async () => {
    const { root, put, args, environment } = await fixture();
    const report = {
      auditReportVersion: 2,
      vulnerabilities: { example: { severity: 'moderate' } },
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 0, total: 1 } },
    };
    const audit = {
      exitCode: 1,
      report,
      lockfileSha256: sha256(await readFile(path.join(root, 'package-lock.json'))),
      startedAt: '2026-09-29T12:00:00.000Z',
      finishedAt: '2026-09-29T12:00:01.000Z',
      commandReceiptSha256: 'a'.repeat(64),
    };
    const content = JSON.stringify(audit);
    await put('audit.json', content);
    const options = parseManifestArguments([...args, '--audit', 'audit.json']);
    const manifest = await collectReleaseManifest(root, options, environment);
    expect(manifest.audits).toEqual([
      {
        path: 'audit.json',
        sha256: sha256(content),
        exitCode: 1,
        vulnerabilities: report.metadata.vulnerabilities,
        reviewRequired: true,
        startedAt: audit.startedAt,
        finishedAt: audit.finishedAt,
        lockfileSha256: audit.lockfileSha256,
        commandReceiptSha256: audit.commandReceiptSha256,
      },
    ]);
    for (const invalid of [
      { ...audit, lockfileSha256: 'b'.repeat(64) },
      { ...audit, startedAt: null },
      { ...audit, finishedAt: '2026-09-28T12:00:00.000Z' },
      { ...audit, commandReceiptSha256: null },
      { ...audit, exitCode: 2 },
      { ...audit, report: { error: { code: 'ENOAUDIT' } } },
    ]) {
      await put('audit.json', JSON.stringify(invalid));
      await expect(collectReleaseManifest(root, options, environment)).rejects.toThrow(/audit/i);
    }
  });

  it('records clean audits but refuses network errors, malformed reports or contradictory exits', () => {
    const report = {
      auditReportVersion: 2,
      vulnerabilities: {},
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
    };
    expect(summarizeNpmAudit(report, 0)).toEqual({
      exitCode: 0,
      vulnerabilities: report.metadata.vulnerabilities,
      reviewRequired: false,
    });
    expect(() => summarizeNpmAudit(report, 1)).toThrow(/disagree/);
    expect(() => summarizeNpmAudit({ ...report, error: { code: 'ECONNRESET' } }, 1)).toThrow(/complete native/);
    expect(() => summarizeNpmAudit({ ...report, metadata: {} }, 0)).toThrow();
    expect(() =>
      summarizeNpmAudit(
        { ...report, metadata: { vulnerabilities: { ...report.metadata.vulnerabilities, total: 3 } } },
        1,
      ),
    ).toThrow(/disagree/);
  });

  it('binds cloud results, tested rules and named JSON or text receipts without copying their contents', async () => {
    const { root, put, args, environment } = await fixture();
    await put('cloud.json', JSON.stringify(vitestReport()));
    await put('firestore.rules', 'rules fixture');
    await put('tested.rules', 'rules fixture');
    await put('static.json', '{"exitCode":0,"privateDetail":"not-for-manifest"}');
    await put('csp.log', 'CSP check passed');
    const options = parseManifestArguments([
      ...args,
      '--vitest-cloud',
      'cloud.json',
      '--cloud-rules',
      'tested.rules',
      '--receipt',
      'static=static.json',
      '--receipt',
      'csp=csp.log',
    ]);
    const manifest = await collectReleaseManifest(root, options, environment);
    expect(manifest.reports.map((report) => report.kind)).toEqual(['vitest', 'vitest-cloud', 'playwright']);
    expect(manifest.cloudRules).toEqual({ path: 'tested.rules', sha256: sha256('rules fixture') });
    expect(manifest.receipts).toEqual([
      {
        name: 'static',
        path: 'static.json',
        sha256: sha256('{"exitCode":0,"privateDetail":"not-for-manifest"}'),
        exitCode: 0,
      },
      { name: 'csp', path: 'csp.log', sha256: sha256('CSP check passed'), exitCode: null },
    ]);
    expect(JSON.stringify(manifest)).not.toContain('not-for-manifest');
    await put('firestore.rules', 'different rules');
    await expect(collectReleaseManifest(root, options, environment)).rejects.toThrow('do not match');
    await put('firestore.rules', 'rules fixture');
    await put('cloud.json', JSON.stringify({ ...vitestReport(), success: false }));
    await expect(collectReleaseManifest(root, options, environment)).rejects.toThrow('unsuccessful');
  });

  it('already accepts multiple distinct Vitest reports', async () => {
    const { root, put, args, environment } = await fixture();
    await put('second.json', JSON.stringify(vitestReport()));
    const manifest = await collectReleaseManifest(
      root,
      parseManifestArguments([...args, '--vitest', 'second.json']),
      environment,
    );
    expect(manifest.reports.filter((report) => report.kind === 'vitest')).toHaveLength(2);
  });

  it.each(['{"exitCode":1}', '{"ExitCode":2}', '{"exitCode":"0"}', '{"exitCode":0,"ExitCode":1}', '{bad'])(
    'rejects failed or malformed named JSON receipt %s',
    async (content) => {
      const { root, put, args, environment } = await fixture();
      await put('static.json', content);
      await expect(
        writeReleaseManifest(root, [...args, '--receipt', 'static=static.json'], environment),
      ).rejects.toThrow();
      await expect(readFile(path.join(root, 'receipt.json'))).rejects.toThrow();
    },
  );

  it.each([
    ['--vitest-cloud', 'cloud.json'],
    ['--cloud-rules', 'tested.rules'],
    ['--receipt', '=file'],
    ['--receipt', 'static='],
    ['--receipt', 'static=file', '--receipt', 'static=another'],
  ])('rejects incomplete or ambiguous evidence options %j', (...extra) => {
    expect(() =>
      parseManifestArguments(['out.json', '--vitest', 'v.json', '--playwright', 'p.json', ...extra]),
    ).toThrow();
  });

  it('writes portable source, runtime and input hashes without configuration values', async () => {
    const { root, put, args, environment } = await fixture();
    await put('.env.production', 'VITE_FROM_FILE=local-config\nVITE_OVERRIDE=old\n');
    await writeReleaseManifest(root, args, {
      ...environment,
      VITE_OVERRIDE: 'private-value',
      VITE_EMPTY: '',
      PRIVATE_TOKEN: 'never-export-this',
    });
    const receipt = await readFile(path.join(root, 'receipt.json'), 'utf8');
    const manifest = JSON.parse(receipt);
    expect(manifest.source).toEqual({ sha, tree, dirty: false });
    expect(manifest.versions).toEqual({
      node: process.versions.node,
      v8: process.versions.v8,
      npm: '1.2.3',
      vite: '1.2.3',
      vitest: '1.2.3',
      playwright: '1.2.3',
    });
    expect(manifest.os).toEqual({
      platform: expect.any(String),
      release: expect.any(String),
      arch: expect.any(String),
    });
    expect(manifest.configuration).toEqual(
      expect.arrayContaining([
        { name: 'VITE_FROM_FILE', sha256: sha256('local-config') },
        { name: 'VITE_OVERRIDE', sha256: sha256('private-value') },
        { name: 'VITE_EMPTY', sha256: sha256('') },
      ]),
    );
    expect(receipt).not.toMatch(/private-value|local-config|never-export-this|PRIVATE_TOKEN/);
    expect(manifest.lockfile.sha256).toBe(sha256(await readFile(path.join(root, 'package-lock.json'))));
    expect(manifest.artifacts).toHaveLength(5);
    for (const artifact of manifest.artifacts) {
      expect(artifact.sha256).toBe(sha256(await readFile(path.join(root, artifact.path))));
    }
    for (const report of manifest.reports) {
      expect(report.sha256).toBe(sha256(await readFile(path.join(root, report.path))));
    }
    expect(manifest.carryForward).toEqual([]);
    expect(manifest.waivers).toEqual([]);
    expect(manifest.reports.map((report: { path: string }) => report.path)).toEqual(['vitest.json', 'playwright.json']);
  });

  it('rejects a dirty tree unless explicitly allowed and records the exception', async () => {
    const { root, args, environment } = await fixture();
    dirty = true;
    await expect(writeReleaseManifest(root, args, environment)).rejects.toThrow('dirty');
    await expect(readFile(path.join(root, 'receipt.json'))).rejects.toThrow();
    const options = parseManifestArguments([...args, '--allow-dirty']);
    const manifest = await collectReleaseManifest(root, options, environment);
    expect(manifest.source.dirty).toBe(true);
    expect(manifest.allowDirty).toBe(true);
  });

  it.each(['vitest.json', 'playwright.json', 'dist/sw.js', 'dist/assets/main.js', 'package-lock.json'])(
    'refuses missing input %s without writing a receipt',
    async (missing) => {
      const { root, args, environment } = await fixture();
      await rm(path.join(root, missing));
      await expect(writeReleaseManifest(root, args, environment)).rejects.toThrow();
      await expect(readFile(path.join(root, 'receipt.json'))).rejects.toThrow();
    },
  );

  it('rejects malformed JSON without reflecting its contents into diagnostics', async () => {
    const { root, put, args, environment } = await fixture();
    await put('vitest.json', '{"private-value": bad}');
    await expect(writeReleaseManifest(root, args, environment)).rejects.toThrow('Invalid JSON in vitest report.');
  });

  it('rejects absent installed version metadata rather than using lockfile or user-agent guesses', async () => {
    const { root, args, environment } = await fixture();
    await rm(path.join(root, 'node_modules', 'npm', 'package.json'));
    await expect(writeReleaseManifest(root, args, environment)).rejects.toThrow('npm package');
  });

  it('refuses debug logging before Vite can print configuration values', async () => {
    const { root, args, environment } = await fixture();
    await expect(writeReleaseManifest(root, args, { ...environment, DEBUG: 'vite:*' })).rejects.toThrow('Unset DEBUG');
  });

  it('refuses a non-file environment input rather than silently omitting its fingerprints', async () => {
    const { root, args, environment } = await fixture();
    await mkdir(path.join(root, '.env.production'));
    await expect(writeReleaseManifest(root, args, environment)).rejects.toThrow('Vite environment file');
  });

  it('refuses source changes during collection without writing a receipt', async () => {
    const { root, args, environment } = await fixture();
    let heads = 0;
    vi.mocked(execFileSync).mockImplementation((_command, gitArgs) => {
      if (gitArgs?.includes('HEAD^{tree}')) return tree;
      if (gitArgs?.includes('HEAD')) return ++heads === 1 ? sha : 'c'.repeat(40);
      return '';
    });
    await expect(writeReleaseManifest(root, args, environment)).rejects.toThrow('changed while collecting');
    await expect(readFile(path.join(root, 'receipt.json'))).rejects.toThrow();
  });

  it.each(['/assets/../outside.js', 'https://example.org/main.js'])('rejects nonlocal entry %s', async (src) => {
    const { root, put, args, environment } = await fixture();
    await put(path.join('dist', 'index.html'), `<script type="module" src="${src}"></script>`);
    await expect(writeReleaseManifest(root, args, environment)).rejects.toThrow('one local');
  });

  it('requires one module entry and ignores comments and noscript decoys', async () => {
    const { root, put, args, environment } = await fixture();
    await put(
      path.join('dist', 'index.html'),
      '<noscript><script type="module" src="/assets/decoy.js"></script></noscript>',
    );
    await expect(writeReleaseManifest(root, args, environment)).rejects.toThrow('one local');
  });

  it('refuses duplicate report inputs and never overwrites an earlier receipt', async () => {
    const { root, args, environment } = await fixture();
    await expect(writeReleaseManifest(root, [...args, '--vitest', 'vitest.json'], environment)).rejects.toThrow(
      'Duplicate',
    );
    await writeReleaseManifest(root, args, environment);
    const before = await readFile(path.join(root, 'receipt.json'), 'utf8');
    await expect(writeReleaseManifest(root, args, environment)).rejects.toThrow();
    expect(await readFile(path.join(root, 'receipt.json'), 'utf8')).toBe(before);
  });

  it('records reasoned decisions and the exact decisions input hash without waiving failures', async () => {
    const { root, put, args, environment } = await fixture();
    const decisions = {
      carryForward: [
        { check: 'ancestor e2e', reason: 'Reviewed unchanged surface', sourceCommit: sha, evidence: 'old.json' },
      ],
      waivers: [{ check: 'physical iOS', reason: 'Device unavailable; release owner must approve' }],
    };
    const content = JSON.stringify(decisions);
    await put('decisions.json', content);
    const options = parseManifestArguments([...args, '--decisions', 'decisions.json']);
    const manifest = await collectReleaseManifest(root, options, environment);
    expect(manifest.carryForward).toEqual(decisions.carryForward);
    expect(manifest.waivers).toEqual(decisions.waivers);
    expect(manifest.decisionInput).toEqual({ path: 'decisions.json', sha256: sha256(content) });
    await put('vitest.json', JSON.stringify({ ...vitestReport(), numFailedTests: 1 }));
    await expect(collectReleaseManifest(root, options, environment)).rejects.toThrow();
  });

  it('rejects missing reasons, absent lists and unknown decision fields', () => {
    expect(() => parseDecisions({ carryForward: [], waivers: [{ check: 'check', reason: ' ' }] })).toThrow();
    expect(() => parseDecisions({ waivers: [] })).toThrow();
    expect(() => parseDecisions({ carryForward: [], waivers: [], typo: true })).toThrow();
    expect(() => parseDecisions({ carryForward: [{ check: 'x', reason: 'y' }], waivers: [] })).toThrow();
  });

  it.each<[string[]]>([
    [[]],
    [['out.json']],
    [['out.json', '--vitest', 'v.json']],
    [['out.json', '--typo', 'v.json']],
    [['out.json', '--vitest']],
    [['out.json', '--vitest', 'v.json', '--playwright', 'p.json', '--mode', '../bad']],
  ])('rejects invalid CLI arguments %#', (args) => {
    expect(() => parseManifestArguments(args)).toThrow();
  });
});
