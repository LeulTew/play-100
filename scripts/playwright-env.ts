/**
 * Fail-closed defaults for the local Playwright gate (README "Quality checks"). CI is disabled, so
 * safety must not depend on `CI` being set: a server already on the fixed port is reused only on an
 * explicit opt-in, and `.only` is refused unless explicitly allowed.
 */

export type HarnessEnvironment = Readonly<Record<string, string | undefined>>;

export const REUSE_SERVER_VARIABLE = 'PLAY100_REUSE_SERVER';
export const ALLOW_ONLY_VARIABLE = 'PLAY100_ALLOW_ONLY';

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
