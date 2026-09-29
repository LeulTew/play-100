import { describe, expect, it } from 'vitest';
import { checkGateReport, commandReceipt, gateEnvironment, gatePlan, GATE_NODE } from './release-gate';

describe('candidate release gate planning', () => {
  it('pins the runtime and orders every partition without a deployment or dependency install', () => {
    expect(GATE_NODE).toBe('v24.21.0');
    const plan = gatePlan();
    const names = plan.map((step) => step.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.slice(0, 11)).toEqual([
      'configured-audit-signatures',
      'offline-audit-signatures',
      'configured-dependency-audit',
      'offline-dependency-audit',
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
    expect(names.slice(-12)).toEqual([
      'configured-build',
      'configured-check-csp',
      'configured-check-budgets',
      'offline-build',
      'offline-check-csp',
      'offline-check-budgets',
      'production',
      'development',
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
    expect(() => checkGateReport(step, report)).toThrow('expected 40');
    expect(checkGateReport({ ...step, expectedPassed: 1 }, report).passed).toBe(1);
    report.suites[0]!.specs[0]!.tests[0]!.status = 'flaky';
    report.stats.expected = 0;
    report.stats.flaky = 1;
    expect(() => checkGateReport(step, report)).toThrow('flaky retries');
  });
});
