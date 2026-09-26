import { describe, expect, it } from 'vitest';
import { cloudUiServerProblem, compareFixtureGate, localGateOptions } from './playwright-env.ts';

describe('local Playwright gate', () => {
  it('refuses .only and never reuses a server on the fixed port by default', () => {
    expect(localGateOptions({})).toEqual({ forbidOnly: true, reuseExistingServer: false });
  });

  it('honours only the explicit local opt-ins', () => {
    expect(localGateOptions({ PLAY100_REUSE_SERVER: '1', PLAY100_ALLOW_ONLY: '1' })).toEqual({
      forbidOnly: false,
      reuseExistingServer: true,
    });
    expect(localGateOptions({ PLAY100_REUSE_SERVER: 'true', PLAY100_ALLOW_ONLY: 'yes' })).toEqual({
      forbidOnly: true,
      reuseExistingServer: false,
    });
  });

  it('keeps CI runs strict even with the opt-ins set', () => {
    expect(localGateOptions({ CI: 'true', PLAY100_REUSE_SERVER: '1', PLAY100_ALLOW_ONLY: '1' })).toEqual({
      forbidOnly: true,
      reuseExistingServer: false,
    });
  });

  it('does not depend on the deployed-URL or build-partition variables', () => {
    expect(
      localGateOptions({ PLAY100_BASE_URL: 'https://example.vercel.app', PLAY100_TEST_BUILD: 'development' }),
    ).toEqual({ forbidOnly: true, reuseExistingServer: false });
  });
});

describe('comparison fixture gate', () => {
  it('keeps the opt-in skip for ordinary runs and runs the cases once a fixture manifest is named', () => {
    expect(compareFixtureGate({})).toBe('skip');
    expect(compareFixtureGate({ PLAY100_COMPARE_FIXTURE: '' })).toBe('skip');
    expect(compareFixtureGate({ PLAY100_COMPARE_FIXTURE: 'C:\\evidence\\compare-fixture.json' })).toBe('run');
  });

  it('turns a missing fixture into a failure whenever the release gate is set', () => {
    expect(compareFixtureGate({ PLAY100_RELEASE_GATE: '1' })).toBe('missing');
    expect(compareFixtureGate({ PLAY100_RELEASE_GATE: 'true', PLAY100_COMPARE_FIXTURE: '' })).toBe('missing');
    expect(compareFixtureGate({ PLAY100_RELEASE_GATE: '1', PLAY100_COMPARE_FIXTURE: 'fixture.json' })).toBe('run');
  });
});

describe('cloud-UI server probe', () => {
  const url = 'http://127.0.0.1:4187/src/lib/online-availability.ts';
  const served = (env: string) =>
    `import.meta.env = ${env};\nexport const EMULATOR_MODE = import.meta.env.MODE === 'cloud-test';`;

  it('accepts the emulator-bound cloud-test development server, quoted or bare keys', () => {
    expect(
      cloudUiServerProblem(
        url,
        200,
        served('{"BASE_URL":"/","MODE":"cloud-test","DEV":true,"VITE_USE_FIREBASE_EMULATORS":"true"}'),
      ),
    ).toBeNull();
    expect(
      cloudUiServerProblem(
        url,
        200,
        served('{BASE_URL: "/", MODE: "cloud-test", VITE_USE_FIREBASE_EMULATORS: "true"}'),
      ),
    ).toBeNull();
  });

  it('refuses nothing listening, a preview or stale build, and the wrong mode', () => {
    expect(cloudUiServerProblem(url, null, '')).toContain('Nothing answers at');
    expect(cloudUiServerProblem(url, 404, '<!doctype html>')).toContain('answered 404');
    expect(
      cloudUiServerProblem(url, 200, served('{"MODE":"development","VITE_USE_FIREBASE_EMULATORS":"true"}')),
    ).toContain('not in cloud-test mode');
    expect(cloudUiServerProblem(url, 200, served('{"MODE":"cloud-test"}'))).toContain('not in cloud-test mode');
    expect(
      cloudUiServerProblem(url, 200, served('{"MODE":"cloud-test","VITE_USE_FIREBASE_EMULATORS":"false"}')),
    ).toContain('http://127.0.0.1:4187');
  });
});
