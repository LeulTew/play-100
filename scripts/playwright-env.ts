/**
 * Fail-closed defaults for the local Playwright gate (README "Quality checks"). CI is disabled, so
 * safety must not depend on `CI` being set: a server already on the fixed port is reused only on an
 * explicit opt-in, and `.only` is refused unless explicitly allowed.
 */

export type HarnessEnvironment = Readonly<Record<string, string | undefined>>;

export function sourceMetadata(environment: HarnessEnvironment): { commit?: string; tree?: string } {
  const commit = environment.PLAY100_SOURCE_COMMIT;
  const tree = environment.PLAY100_SOURCE_TREE;
  if (commit === undefined && tree === undefined) return {};
  if (!commit || !tree || !/^[a-f0-9]{40}$/.test(commit) || !/^[a-f0-9]{40}$/.test(tree))
    throw new Error('Playwright evidence requires both full PLAY100_SOURCE_COMMIT and PLAY100_SOURCE_TREE.');
  return { commit, tree };
}

export const REUSE_SERVER_VARIABLE = 'PLAY100_REUSE_SERVER';
export const ALLOW_ONLY_VARIABLE = 'PLAY100_ALLOW_ONLY';
export const RELEASE_GATE_VARIABLE = 'PLAY100_RELEASE_GATE';
export const COMPARE_FIXTURE_VARIABLE = 'PLAY100_COMPARE_FIXTURE';
export const GOOGLE_LIVE_VARIABLE = 'PLAY100_GOOGLE_LIVE';

export interface LocalGateOptions {
  readonly forbidOnly: boolean;
  /**
   * With false, Playwright refuses to start when the port is already taken ("… is already used …")
   * instead of testing whatever is listening; vite's --strictPort refuses too. No process is killed.
   */
  readonly reuseExistingServer: boolean;
}

export function localGateOptions(environment: HarnessEnvironment): LocalGateOptions {
  const ci = Boolean(environment.CI);
  return {
    forbidOnly: ci || environment[ALLOW_ONLY_VARIABLE] !== '1',
    reuseExistingServer: !ci && environment[REUSE_SERVER_VARIABLE] === '1',
  };
}

/**
 * How the cloud-UI cases that need the allocated six-person comparison fixture treat it. An ordinary run skips them
 * unless a fixture manifest is named; any release-gate value makes a missing fixture an error instead of a silent skip.
 */
export function compareFixtureGate(environment: HarnessEnvironment): 'run' | 'skip' | 'missing' {
  if (environment[COMPARE_FIXTURE_VARIABLE]) return 'run';
  return environment[RELEASE_GATE_VARIABLE] ? 'missing' : 'skip';
}

/**
 * Whether a cloud-UI run includes the live Google check (tests-cloud-ui/google-live.spec.ts), which loads Google's own
 * scripts. It runs only on its explicit opt-in and never in the release gate, so a public host cannot decide the gate.
 */
export function googleLiveCheck(environment: HarnessEnvironment): boolean {
  return environment[GOOGLE_LIVE_VARIABLE] === '1' && !environment[RELEASE_GATE_VARIABLE];
}

/**
 * How cloud-UI cases that load Firestore rules into the demo-play100 emulator treat a run with `workers` workers. The
 * emulator keeps one rule set for the project, so loading rules changes them for every test another worker runs
 * meanwhile (docs/security.md): these cases run only in a one-worker run. Any other run skips them, to cover them in a
 * one-worker pass of their own; inside the release gate they fail instead of being silently skipped.
 */
export function emulatorRulesGate(environment: HarnessEnvironment, workers: number): 'run' | 'skip' | 'refuse' {
  if (workers <= 1) return 'run';
  return environment[RELEASE_GATE_VARIABLE] ? 'refuse' : 'skip';
}

/** The dev-server module whose served source shows the mode it was started in. */
export const CLOUD_UI_PROBE_PATH = '/src/lib/online-availability.ts';

/**
 * Why the server the cloud-UI suite would test is not the emulator-bound development server, or null.
 * Vite serves `import.meta.env` of a source module as an inlined object literal (quoted or bare keys).
 */
export function cloudUiServerProblem(url: string, status: number | null, body: string): string | null {
  const start = `Start the Vite development server with --mode cloud-test and VITE_USE_FIREBASE_EMULATORS=true on ${new URL('/', url).origin} first (docs/online-saving.md).`;
  if (status === null) return `Nothing answers at ${url}. ${start}`;
  if (status !== 200)
    return `${url} answered ${status}, so the server there is not the Vite development server (a preview or another project?). ${start}`;
  if (!/\bMODE"?\s*:\s*"cloud-test"/.test(body) || !/\bVITE_USE_FIREBASE_EMULATORS"?\s*:\s*"true"/.test(body)) {
    return `The development server at ${url} is not in cloud-test mode with emulators enabled. ${start}`;
  }
  return null;
}
