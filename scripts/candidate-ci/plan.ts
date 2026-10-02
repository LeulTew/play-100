/**
 * Candidate CI plans (docs/release-operations.md, "Candidate CI runs"): the set of workflow dispatches that make up
 * one candidate's CI evidence, with the pure parts of dispatching them and matching each run back to its entry.
 */

export const SUITES = [
  'e2e-prod',
  'e2e-dev',
  'e2e-offline',
  'cloud-rules',
  'cloud-ui',
  'lighthouse',
  'checks',
  'csp-refresh',
  'floor',
] as const;
export type Suite = (typeof SUITES)[number];
export const PROJECTS = ['both', 'desktop', 'mobile'] as const;
export type Project = (typeof PROJECTS)[number];
export const BROWSER_ENVS = ['auto', 'default', 'unthrottled', 'xvfb-headed'] as const;
export type BrowserEnv = (typeof BROWSER_ENVS)[number];

/**
 * Lean release checks (scripts/release-lean-manifest.ts) a whole-suite CI run can supply, with the report in its
 * artifact that the index row names. Loops and the remaining suites appear only in the summary.
 */
export const LEAN_CI_CHECKS = {
  'e2e-production': { suite: 'e2e-prod', report: 'playwright.json' },
  'e2e-development': { suite: 'e2e-dev', report: 'playwright.json' },
  'e2e-offline': { suite: 'e2e-offline', report: 'playwright.json' },
  'films-download': { suite: 'e2e-prod', report: 'playwright.json' },
  'cloud-rules': { suite: 'cloud-rules', report: 'vitest-1.json' },
  'cloud-ui-desktop': { suite: 'cloud-ui', report: 'playwright.json' },
  'cloud-ui-mobile': { suite: 'cloud-ui', report: 'playwright.json' },
  'floor-smoke': { suite: 'floor', report: 'playwright.json' },
} as const satisfies Record<string, { suite: Suite; report: string }>;
export type LeanCiCheck = keyof typeof LEAN_CI_CHECKS;

export interface PlanEntry {
  id: string;
  purpose: string;
  suite: Suite;
  specs: string[];
  project: Project;
  repeat: number;
  workers: number | null;
  grep: string;
  browserEnv: BrowserEnv;
  /** The lean check this whole-suite run supplies, if any. */
  lean: LeanCiCheck | null;
  /** Passed executions the run must report, as the gate's expectedPassed; null when any count is acceptable. */
  expectedPassed: number | null;
}

export interface Plan {
  schemaVersion: 1;
  description: string;
  entries: PlanEntry[];
}

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SPEC = /^[A-Za-z0-9._/-]+(:[0-9]+)?$/;

function object(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${what} must be an object.`);
  return value as Record<string, unknown>;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string, fallback?: T): T {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value))
    throw new Error(`${what} must be one of ${allowed.join(', ')}.`);
  return value as T;
}

function integer(value: unknown, what: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`${what} must be an integer from ${min} to ${max}.`);
  return value;
}

/** Validates a plan file's content against what the workflow's input validation accepts. */
export function parsePlan(input: unknown): Plan {
  const plan = object(input, 'The plan');
  if (plan.schemaVersion !== 1) throw new Error('The plan must have schemaVersion 1.');
  if (!Array.isArray(plan.entries) || !plan.entries.length) throw new Error('The plan needs at least one entry.');
  const ids = new Set<string>();
  const leans = new Set<string>();
  const entries = plan.entries.map((value, index): PlanEntry => {
    const row = object(value, `Entry ${index + 1}`);
    if (typeof row.id !== 'string' || !ID.test(row.id))
      throw new Error(`Entry ${index + 1}: id must be lowercase letters, digits and hyphens, at most 40.`);
    const id = row.id;
    if (ids.has(id)) throw new Error(`${id}: duplicate id.`);
    ids.add(id);
    const suite = oneOf(row.suite, SUITES, `${id}: suite`);
    const specs = row.specs ?? [];
    if (
      !Array.isArray(specs) ||
      specs.some((spec) => typeof spec !== 'string' || !SPEC.test(spec) || spec.includes('..'))
    )
      throw new Error(`${id}: specs must be safe relative paths.`);
    const grep = row.grep ?? '';
    if (typeof grep !== 'string' || grep.includes('\n')) throw new Error(`${id}: grep must be one line.`);
    const lean =
      row.lean === undefined || row.lean === null
        ? null
        : oneOf(row.lean, Object.keys(LEAN_CI_CHECKS) as LeanCiCheck[], `${id}: lean`);
    if (lean) {
      if (LEAN_CI_CHECKS[lean].suite !== suite)
        throw new Error(`${id}: ${lean} comes from the ${LEAN_CI_CHECKS[lean].suite} suite.`);
      if (leans.has(lean)) throw new Error(`${id}: ${lean} is already supplied by another entry.`);
      leans.add(lean);
    }
    return {
      id,
      purpose: typeof row.purpose === 'string' ? row.purpose : '',
      suite,
      specs: specs as string[],
      project: oneOf(row.project, PROJECTS, `${id}: project`, 'both'),
      repeat: row.repeat === undefined ? 1 : integer(row.repeat, `${id}: repeat`, 1, 999),
      workers: row.workers === undefined || row.workers === null ? null : integer(row.workers, `${id}: workers`, 1, 99),
      grep,
      browserEnv: oneOf(row.browserEnv, BROWSER_ENVS, `${id}: browserEnv`, 'auto'),
      lean,
      expectedPassed:
        row.expectedPassed === undefined || row.expectedPassed === null
          ? null
          : integer(row.expectedPassed, `${id}: expectedPassed`, 0, 1_000_000),
    };
  });
  return { schemaVersion: 1, description: typeof plan.description === 'string' ? plan.description : '', entries };
}

/**
 * The run's request id: the entry id, the SHA's first 8 characters and a per-dispatch nonce, so a redispatch of the
 * same entry is still told apart. At most 64 of [A-Za-z0-9._-], as the workflow validates.
 */
export function requestId(entry: Pick<PlanEntry, 'id'>, sha: string, nonce: string): string {
  const id = `${entry.id}.${sha.slice(0, 8)}.${nonce}`;
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(id)) throw new Error(`Request id ${id} is not valid.`);
  return id;
}

/** The run name the workflow gives a dispatch (its `run-name`), which `gh run list` reports as displayTitle. */
export function runName(entry: Pick<PlanEntry, 'suite' | 'project'>, sha: string, request: string): string {
  return `Candidate CI ${entry.suite} ${entry.project} ${sha} ${request}`;
}

/** `gh workflow run` arguments that dispatch one entry. */
export function dispatchArgs(entry: PlanEntry, sha: string, ref: string, request: string, repo: string): string[] {
  const field = (name: string, value: string) => ['-f', `${name}=${value}`];
  return [
    'workflow',
    'run',
    'candidate-ci.yml',
    '--repo',
    repo,
    '--ref',
    ref,
    ...field('sha', sha),
    ...field('suite', entry.suite),
    ...field('specs', entry.specs.join(' ')),
    ...field('project', entry.project),
    ...field('repeat', String(entry.repeat)),
    ...field('workers', entry.workers === null ? '' : String(entry.workers)),
    ...field('grep', entry.grep),
    ...field('browser_env', entry.browserEnv),
    ...field('request', request),
  ];
}

const HEADED_SUITES: readonly string[] = ['e2e-dev', 'e2e-offline'];

/** The browser environment run-suite.sh resolves and identity.json records: `auto` is xvfb-headed for e2e-dev and e2e-offline. */
export function resolvedBrowserEnv(entry: Pick<PlanEntry, 'suite' | 'browserEnv'>): string {
  if (entry.browserEnv !== 'auto') return entry.browserEnv;
  return HEADED_SUITES.includes(entry.suite) ? 'xvfb-headed' : 'default';
}

/** Quotes arguments for a POSIX shell, for printing copyable command lines. */
export function shellLine(command: string, args: string[]): string {
  const quote = (arg: string) => (/^[A-Za-z0-9_./:=@%+,-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`);
  return [command, ...args].map(quote).join(' ');
}

/** Finds the run whose name carries this request id; more than one is an error, since ids are never reused. */
export function findRun<T extends { displayTitle: string }>(runs: T[], name: string): T | null {
  const matches = runs.filter((run) => run.displayTitle === name);
  if (matches.length > 1) throw new Error(`More than one run is named ${name}.`);
  return matches[0] ?? null;
}
