import { describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  checkGateReport,
  commandReceipt,
  gateEnvironment,
  gatePlan,
  GATE_NODE,
  innerEmulatorCommand,
  evidenceLogHeader,
  reporterArgs,
  runCommand,
  stampLogs,
  FILM_DOWNLOAD_TEST,
  runPartitionAttempts,
  APB2_GATE_SCRIPT,
  requireApb2Runner,
  requireApb2Operator,
  checkApb2GateReceipt,
  bindFilmAttempts,
} from './release-gate';

describe('candidate release gate planning', () => {
  it('uses a file URL for the tsx loader in every Windows inner emulator command', () => {
    for (const step of gatePlan().filter((step) => step.tool === 'emulators')) {
      const command = innerEmulatorCommand(String.raw`C:\release\play100`, step.name, String.raw`C:\release\evidence`);
      expect(command).toContain('"--import" "file:///C:/release/play100/node_modules/tsx/dist/loader.mjs"');
      expect(command).toContain(`"--inner" "${step.name}" "C:\\release\\evidence"`);
      expect(command).not.toContain('"--import" "C:');
    }
  });

  it('also preserves POSIX loader URLs and rejects unsafe shell arguments', () => {
    expect(innerEmulatorCommand('/release/play100', 'cloud', '/release/evidence')).toContain(
      '"--import" "file:///release/play100/node_modules/tsx/dist/loader.mjs"',
    );
    expect(() => innerEmulatorCommand(String.raw`C:\release\play100`, 'cloud', 'evidence&command')).toThrow(
      'unsupported shell metacharacters',
    );
  });

  it('pins the runtime and orders every partition without a deployment or dependency install', () => {
    expect(GATE_NODE).toBe('v24.21.0');
    const plan = gatePlan();
    const names = plan.map((step) => step.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.slice(0, 12)).toEqual([
      'configured-audit-signatures',
      'offline-audit-signatures',
      'configured-dependency-audit',
      'offline-dependency-audit',
      'history-secret-scan',
      'types',
      'lint',
      'typecheck-functions',
      'validate-data',
      'validate-discovery',
      'unit-browser',
      'cloud',
    ]);
    expect(names.filter((name) => name.startsWith('handle-race-'))).toHaveLength(5);
    expect(names.filter((name) => name.startsWith('convergence-'))).toHaveLength(20);
    expect(names.slice(-15)).toEqual([
      'configured-build',
      'configured-check-csp',
      'configured-check-budgets',
      'offline-build',
      'offline-check-csp',
      'offline-check-budgets',
      'production',
      'development',
      'floor-smoke',
      'apb2',
      'films-download',
      'cloud-ui',
      'sync-20',
      'offline-navigation',
      'offline-unit-browser',
    ]);
    expect(plan.flatMap((step) => step.args).join(' ')).not.toMatch(/\b(?:install|ci|deploy|push|merge|vercel)\b/);
    expect(plan.filter((step) => step.audit).map((step) => [step.profile, step.args])).toEqual([
      ['configured', ['audit', '--json', '--audit-level=info']],
      ['offline', ['audit', '--json', '--audit-level=info']],
    ]);
  });

  it('isolates only the native film case and keeps all browser invocations zero-retry', () => {
    const plan = gatePlan();
    expect(plan.find((step) => step.name === 'production')?.args).toEqual([
      'test',
      '--grep-invert',
      FILM_DOWNLOAD_TEST,
    ]);
    expect(plan.find((step) => step.name === 'development')?.args).toEqual(['test']);
    expect(plan.find((step) => step.name === 'films-download')).toMatchObject({
      args: ['test', 'tests/films.spec.ts', '--grep', FILM_DOWNLOAD_TEST],
      expectedPassed: 2,
    });
    for (const step of plan.filter((step) => step.report === 'playwright'))
      expect(reporterArgs(step, 'evidence')).toContain('--retries=0');
  });

  it('binds the three floor engines and a fail-closed typed APB2 runner hook', () => {
    const plan = gatePlan();
    const floor = plan.find((step) => step.name === 'floor-smoke')!;
    expect(floor).toMatchObject({
      args: ['test', '--config', 'playwright.floor.config.ts'],
      expectedPassed: 23,
    });
    expect(reporterArgs(floor, 'evidence').filter((arg) => arg.startsWith('--project='))).toEqual([
      '--project=floor-firefox',
      '--project=floor-webkit',
      '--project=floor-chromium',
    ]);
    expect(plan.find((step) => step.name === 'apb2')?.args).toEqual(['run', APB2_GATE_SCRIPT]);
    expect(() => requireApb2Runner({ scripts: {} })).toThrow('hook blocked');
    expect(() => requireApb2Runner({ scripts: { [APB2_GATE_SCRIPT]: 'tsx scripts/release-apb2.ts' } })).not.toThrow();
    const source = { sha: 'a'.repeat(40), tree: 'b'.repeat(40) };
    const receipt = { schemaVersion: 1, source, status: 'passed' };
    expect(checkApb2GateReceipt(receipt, source)).toEqual(receipt);
    for (const invalid of [
      { ...receipt, status: 'failed' },
      { ...receipt, schemaVersion: 0 },
      { ...receipt, source: { ...source, tree: 'c'.repeat(40) } },
      { ...receipt, source: { ...source, sha: 'c'.repeat(40) } },
    ])
      expect(() => checkApb2GateReceipt(invalid, source)).toThrow('exact candidate');
  });

  it('checks the operator APB2 settings and verifies the pinned set before the first step', async () => {
    const folder = path.join(tmpdir(), 'pinned-apb2-v32');
    const verified = { ok: true, files: 145, freezeSha256: 'f'.repeat(64) };
    const env = {
      PLAY100_APB2_PROTOCOL: folder,
      PLAY100_APB2_QUIET_ATTESTED: '1',
      PLAY100_APB2_BROWSER_VERSION: '154.0.8037.93',
    };
    const verify = vi.fn(() => Promise.resolve(verified));
    await expect(requireApb2Operator(env, verify)).resolves.toEqual({
      protocol: folder,
      browserVersion: '154.0.8037.93',
      files: 145,
      freezeSha256: 'f'.repeat(64),
    });
    expect(verify).toHaveBeenCalledWith(folder);
    for (const [change, message] of [
      [{ PLAY100_APB2_PROTOCOL: undefined }, 'Set PLAY100_APB2_PROTOCOL'],
      [{ PLAY100_APB2_PROTOCOL: path.join('pinned', 'apb2') }, 'absolute folder'],
      [{ PLAY100_APB2_QUIET_ATTESTED: undefined }, 'PLAY100_APB2_QUIET_ATTESTED=1'],
      [{ PLAY100_APB2_QUIET_ATTESTED: 'true' }, 'PLAY100_APB2_QUIET_ATTESTED=1'],
      [{ PLAY100_APB2_BROWSER_VERSION: undefined }, 'four-part Chrome version'],
      [{ PLAY100_APB2_BROWSER_VERSION: '154' }, 'four-part Chrome version'],
    ] as const)
      await expect(requireApb2Operator({ ...env, ...change }, verify)).rejects.toThrow(message);
    expect(verify).toHaveBeenCalledTimes(1);
    await expect(requireApb2Operator(env, () => Promise.resolve({ ...verified, ok: false }))).rejects.toThrow(
      'committed APB2 v3.2 digests',
    );
    const empty = await mkdtemp(path.join(tmpdir(), 'release-gate-apb2-'));
    try {
      await expect(requireApb2Operator({ ...env, PLAY100_APB2_PROTOCOL: empty })).rejects.toThrow(
        'committed APB2 v3.2 digests',
      );
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('retains distinct film attempts, retries once only, and never retries another partition', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const film = gatePlan().find((step) => step.name === 'films-download')!;
      const execute = vi.fn<Parameters<typeof runPartitionAttempts>[1]>();
      execute.mockResolvedValueOnce();
      expect(await runPartitionAttempts(film, execute)).toEqual([{ name: 'films-download-attempt-1', passed: true }]);
      execute.mockReset().mockRejectedValueOnce(new Error('framing')).mockResolvedValueOnce();
      expect(await runPartitionAttempts(film, execute)).toEqual([
        { name: 'films-download-attempt-1', passed: false },
        { name: 'films-download-attempt-2', passed: true },
      ]);
      expect(execute.mock.calls.map(([step]) => step.name)).toEqual([
        'films-download-attempt-1',
        'films-download-attempt-2',
      ]);
      execute.mockReset().mockRejectedValue(new Error('second failure'));
      await expect(runPartitionAttempts(film, execute)).rejects.toThrow('second failure');
      expect(execute).toHaveBeenCalledTimes(2);
      execute.mockReset().mockRejectedValue(new Error('ordinary failure'));
      await expect(
        runPartitionAttempts(
          gatePlan().find((step) => step.name === 'production')!,
          execute,
        ),
      ).rejects.toThrow('ordinary failure');
      expect(execute).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
    }
  });

  it('uses exactly one worker option per browser partition', () => {
    for (const step of gatePlan().filter((step) => step.report === 'playwright')) {
      expect(reporterArgs(step, 'evidence').filter((arg) => arg.startsWith('--workers='))).toEqual([
        step.tool === 'emulators' ? '--workers=1' : '--workers=2',
      ]);
    }
  });

  it('hashes both native film attempts without hiding a missing failed report or changing raw files', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gate-film-attempts-'));
    const attempts = [
      { name: 'films-download-attempt-1', passed: false },
      { name: 'films-download-attempt-2', passed: true },
    ];
    try {
      for (const attempt of attempts) {
        await writeFile(path.join(directory, `${attempt.name}.log`), `${attempt.name}\n`);
        await writeFile(
          path.join(directory, `${attempt.name}-exit.json`),
          JSON.stringify({ exitCode: attempt.passed ? 0 : 1 }),
        );
      }
      await writeFile(path.join(directory, 'films-download-attempt-2.json'), '{"passed":2}\n');
      const bound = await bindFilmAttempts(directory, attempts);
      expect(bound[0]).toMatchObject({ name: attempts[0]!.name, passed: false });
      expect(bound[0]!.files.at(-1)).toEqual({ path: 'films-download-attempt-1.json', missing: true });
      expect(bound[1]!.files.at(-1)).toMatchObject({ path: 'films-download-attempt-2.json', bytes: 13 });
      expect(bound[1]!.files.at(-1)?.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(await readFile(path.join(directory, 'films-download-attempt-1-exit.json'), 'utf8')).toBe('{"exitCode":1}');
      await rm(path.join(directory, 'films-download-attempt-2.json'));
      await expect(bindFilmAttempts(directory, attempts)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects incomplete log provenance and prefixes real success and failure logs', async () => {
    expect(() => evidenceLogHeader({ sha: 'short', tree: 'short' })).toThrow('full candidate');
    const identity = { sha: 'a'.repeat(40), tree: 'b'.repeat(40) };
    const directory = await mkdtemp(path.join(tmpdir(), 'gate-log-'));
    try {
      await writeFile(path.join(directory, 'plan.json'), JSON.stringify(identity));
      for (const code of [0, 1]) {
        const name = `command-${code}`;
        const run = runCommand(
          name,
          directory,
          directory,
          process.execPath,
          ['-e', `console.log('native output'); process.exitCode = ${code}`],
          process.env,
        );
        if (code) await expect(run).rejects.toThrow('failed; retain');
        else await run;
        const bytes = await readFile(path.join(directory, `${name}.log`));
        expect(bytes.toString()).toBe(`${evidenceLogHeader(identity)}native output\n`);
        const receipt = JSON.parse(await readFile(path.join(directory, `${name}-exit.json`), 'utf8')) as ReturnType<
          typeof commandReceipt
        >;
        expect(receipt).toMatchObject(commandReceipt(name, code, bytes));
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('stamps nested emulator logs once without changing native JSON reports', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gate-native-log-'));
    try {
      const nested = path.join(directory, 'emulators');
      await mkdir(nested);
      await writeFile(path.join(nested, 'firestore-debug.log'), 'native diagnostic\n');
      await writeFile(path.join(nested, 'report.json'), '{"success":false}\n');
      const header = evidenceLogHeader({ sha: 'a'.repeat(40), tree: 'b'.repeat(40) });
      await stampLogs(directory, header);
      await stampLogs(directory, header);
      expect(await readFile(path.join(nested, 'firestore-debug.log'), 'utf8')).toBe(`${header}native diagnostic\n`);
      expect(await readFile(path.join(nested, 'report.json'), 'utf8')).toBe('{"success":false}\n');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([0, 1])('sets child source identity and hashes native reports even on exit %s', async (exit) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gate-report-identity-'));
    try {
      const identity = { sha: 'a'.repeat(40), tree: 'b'.repeat(40) };
      await writeFile(path.join(directory, 'plan.json'), JSON.stringify(identity));
      const report = path.join(directory, 'vitest.json');
      const args = [
        '-e',
        `require('node:fs').writeFileSync(process.argv[1], JSON.stringify({metadata:{commit:process.env.PLAY100_SOURCE_COMMIT,tree:process.env.PLAY100_SOURCE_TREE}}));process.exitCode=${exit}`,
        report,
      ];
      const command = runCommand(
        'native',
        directory,
        directory,
        process.execPath,
        args,
        { ...process.env, PLAY100_SOURCE_COMMIT: 'stale', PLAY100_SOURCE_TREE: 'stale' },
        undefined,
        [report],
      );
      if (exit) await expect(command).rejects.toThrow('failed; retain');
      else await command;
      expect(JSON.parse(await readFile(report, 'utf8'))).toEqual({
        metadata: { commit: identity.sha, tree: identity.tree },
      });
      const sidecar = JSON.parse(await readFile(`${report}.identity.json`, 'utf8')) as Record<string, unknown>;
      expect(sidecar).toMatchObject({
        schemaVersion: 1,
        commit: identity.sha,
        tree: identity.tree,
        command: [process.execPath, ...args],
      });
      expect(sidecar.sha256).toBe(commandReceipt('unused', 0, await readFile(report)).logSha256);
      const exitIdentity: unknown = JSON.parse(
        await readFile(path.join(directory, 'native-exit.json.identity.json'), 'utf8'),
      );
      expect(exitIdentity).toMatchObject({
        commit: identity.sha,
        tree: identity.tree,
        command: [process.execPath, ...args],
      });
      await expect(
        runCommand('duplicate', directory, directory, process.execPath, args, process.env, undefined, [report]),
      ).rejects.toThrow('existing evidence');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('removes stale test overrides and isolates configured, offline and emulator environments', () => {
    const original = {
      PATH: 'runtime',
      VITE_FIREBASE_API_KEY: 'public',
      VITE_SITE_URL: 'https://play.test',
      VITE_APP_CHECK_ENABLED: 'true',
      VITE_APP_CHECK_SITE_KEY: 'reviewed',
      VITE_UNREVIEWED: 'discard',
      VITE_USE_FIREBASE_EMULATORS: 'true',
      PLAY100_REUSE_SERVER: '1',
      PLAY100_BASE_URL: 'https://remote.test',
      PLAY100_GOOGLE_LIVE: '1',
      PLAYWRIGHT_JSON_OUTPUT_NAME: 'stale',
      DEBUG: '*',
      GITHUB_SHA: 'stale',
    };
    expect(gateEnvironment(original, 'offline')).toEqual({ PATH: 'runtime' });
    expect(gateEnvironment(original, 'emulator')).toEqual({ PATH: 'runtime', VITE_USE_FIREBASE_EMULATORS: 'true' });
    expect(gateEnvironment(original, 'configured')).toEqual({
      PATH: 'runtime',
      VITE_FIREBASE_API_KEY: 'public',
      VITE_FIREBASE_REQUIRED: 'true',
      VITE_SITE_URL: 'https://play.test',
      VITE_APP_CHECK_ENABLED: 'true',
      VITE_APP_CHECK_SITE_KEY: 'reviewed',
    });
    expect(original.PLAY100_REUSE_SERVER).toBe('1');
  });

  it('binds exact log bytes and distinguishes spawn failure from a successful exit', () => {
    const ok = commandReceipt('types', 0, Buffer.from('passed\n'));
    expect(ok).toMatchObject({ name: 'types', exitCode: 0, logBytes: 7 });
    expect(ok.logSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(commandReceipt('types', 1, Buffer.from('passed')).logSha256).not.toBe(ok.logSha256);
    expect(commandReceipt('types', null, Buffer.alloc(0), 'spawn failed')).toMatchObject({
      exitCode: null,
      error: 'spawn failed',
    });
  });

  it('refuses empty, inconsistent and failing native reports', () => {
    const step = gatePlan().find((step) => step.name === 'cloud')!;
    for (const value of [null, {}, { success: true, testResults: [] }, { success: false, testResults: [{}] }]) {
      expect(() => checkGateReport(step, value)).toThrow();
    }
  });

  it('requires exactly one selected race/convergence test while permitting unselected Vitest cases', () => {
    const step = gatePlan().find((step) => step.name === 'convergence-1')!;
    const report = {
      success: true,
      numTotalTestSuites: 1,
      numPassedTestSuites: 1,
      numFailedTestSuites: 0,
      numPendingTestSuites: 0,
      numTotalTests: 2,
      numPassedTests: 1,
      numFailedTests: 0,
      numPendingTests: 1,
      numTodoTests: 0,
      testResults: [
        {
          name: 'friend-all.test.ts',
          status: 'passed',
          assertionResults: [
            { status: 'passed', failureMessages: [] },
            { status: 'skipped', failureMessages: [] },
          ],
        },
      ],
    };
    expect(checkGateReport(step, report).passed).toBe(1);
    expect(() => checkGateReport({ ...step, expectedPassed: 2 }, report)).toThrow('expected 2');
  });

  it('rejects skipped or flaky Playwright loop evidence', () => {
    const step = gatePlan().find((step) => step.name === 'sync-20')!;
    const report = {
      errors: [],
      stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 },
      suites: [
        {
          specs: [
            {
              file: 'identity.spec.ts',
              ok: true,
              tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed' }] }],
            },
          ],
        },
      ],
    };
    expect(() => checkGateReport(step, report)).toThrow('expected 80');
    expect(checkGateReport({ ...step, expectedPassed: 1 }, report).passed).toBe(1);
    report.suites[0]!.specs[0]!.tests[0]!.status = 'flaky';
    report.stats.expected = 0;
    report.stats.flaky = 1;
    expect(() => checkGateReport(step, report)).toThrow('flaky retries');
  });
});
