import type { ClientErrorCount } from '../../src/lib/client-error-schema.js';
import { isUnknownArray, nullableObject } from '../../src/lib/guards.js';

/*
 * Client report spike alerts (docs/release-operations.md, "Client report alerts"). Each function instance counts the
 * reports it accepted over a rolling hour. Without a fine-grained PRODUCTION_ALERT_GITHUB_TOKEN none of this runs.
 * With one, a report that leaves a count at or over its threshold posts to the one open issue labelled ALERT_LABEL,
 * at most once per instance per hour, and that report's response waits for the post, within ALERT_BUDGET_MS. A post
 * carries fixed report categories, counts, the window and the deployment ID, nothing else.
 */
export const ALERT_REPOSITORY = 'LeulTew/play-100';
export const ALERT_LABEL = 'client-report-spike';
export const ALERT_TITLE = 'Production alert: client error or CSP report spike';
/** Opens every post, so the hourly production-alert workflow can tell spike posts from its own comments. */
export const ALERT_MARKER = '<!-- client-report-spike -->';
export const ALERT_WINDOW_MS = 60 * 60_000;
export const ALERT_COOLDOWN_MS = 60 * 60_000;
/**
 * Every GitHub request of one post shares this budget. The report that posts answers only after the post, so this
 * bounds that delay; with the report's three-second read, the function stays well inside its time limit.
 */
export const ALERT_BUDGET_MS = 5_000;
export const ALERT_THRESHOLDS = {
  /** Reports naming one error class and area. A page load sends at most four reports, so five need two loads. */
  sameClassAndArea: 5,
  /** Client error reports of any category, so at least five page loads. */
  clientErrorReports: 20,
  /** Main-document violations, which the policy should never produce; three tolerate a stray extension script. */
  mainDocumentCspViolations: 3,
} as const;

// The sign-in helper documents have their own policy, and their violations do not count toward the main threshold.
const HELPER_ROUTES = new Set(['/__/auth/handler', '/__/auth/iframe']);
const MINUTE_MS = 60_000;
const MAX_CATEGORIES = 64;
const OVERFLOW = 'more categories';
const ROWS = 10;
const TOKEN = /^github_pat_[A-Za-z0-9_]{20,255}$/;
const DEPLOYMENT = /^dpl_[A-Za-z0-9]{1,64}$/;

export type AlertOutcome = { alert: 'created' | 'commented' | 'duplicate' } | { alert: 'failed'; alertStatus: number };
/** Records one accepted report and returns the post it started, or null. The promise never rejects. */
export type ReportAlert<T> = (report: T) => Promise<AlertOutcome> | null;

export interface AlertOptions {
  /** A fine-grained personal access token. Without one, or with any other kind of token, the alert is off. */
  token?: string;
  deploymentId?: string;
  now?: () => number;
  fetch?: typeof fetch;
}

export interface CspViolationCount {
  readonly directive: string;
  readonly blockedOrigin: string;
  readonly route: string;
  readonly count: number;
}

export function productionAlertOptions(env: NodeJS.ProcessEnv): AlertOptions {
  return { token: env.PRODUCTION_ALERT_GITHUB_TOKEN, deploymentId: env.VERCEL_DEPLOYMENT_ID };
}

export interface RollingCounter {
  add(category: string, amount?: number): void;
  totals(): Map<string, number>;
}

/** Per-minute counts covering the last hour, with at most MAX_CATEGORIES categories in a minute. */
export function createRollingCounter(now: () => number): RollingCounter {
  const span = ALERT_WINDOW_MS / MINUTE_MS;
  const buckets: Array<{ minute: number; counts: Map<string, number> }> = [];
  // A clock that moved backwards counts into the newest minute rather than reordering the window.
  const current = () => Math.max(Math.floor(now() / MINUTE_MS), buckets.at(-1)?.minute ?? Number.NEGATIVE_INFINITY);
  const prune = (minute: number) => {
    while (buckets.length > 0 && buckets[0]!.minute <= minute - span) buckets.shift();
  };
  return {
    add(category, amount = 1) {
      const minute = current();
      prune(minute);
      let bucket = buckets.at(-1);
      if (!bucket || bucket.minute !== minute) {
        bucket = { minute, counts: new Map() };
        buckets.push(bucket);
      }
      const key = bucket.counts.has(category) || bucket.counts.size < MAX_CATEGORIES ? category : OVERFLOW;
      bucket.counts.set(key, (bucket.counts.get(key) ?? 0) + amount);
    },
    totals() {
      prune(current());
      const totals = new Map<string, number>();
      for (const { counts } of buckets)
        for (const [key, value] of counts) totals.set(key, (totals.get(key) ?? 0) + value);
      return totals;
    },
  };
}

interface Breach {
  reason: string;
  summary: string;
  rows: Array<readonly [category: string, count: string]>;
}

const rank = (totals: Map<string, number>) => [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en'));
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** The post: fixed categories and counts, the window and the deployment; no URL with a query, agent or address. */
export function alertBody(endpoint: string, breach: Breach, time: number, deploymentId: string | undefined): string {
  const minute = (at: number) => `${new Date(Math.floor(at / MINUTE_MS) * MINUTE_MS).toISOString().slice(0, 16)}Z`;
  const deployment = deploymentId !== undefined && DEPLOYMENT.test(deploymentId) ? deploymentId : 'unknown';
  return [
    ALERT_MARKER,
    breach.reason,
    '',
    `- Endpoint: \`${endpoint}\``,
    `- Window: one function instance's last hour, ${minute(time - ALERT_WINDOW_MS)} to ${minute(time)}`,
    `- Deployment: \`${deployment}\``,
    `- ${breach.summary}`,
    '',
    '| Category | Count |',
    '| --- | --- |',
    ...breach.rows.map(([category, count]) => `| ${category} | ${count} |`),
    '',
    'Only fixed report categories and counts are included. The `client-error-count` and `csp-count` log lines of this deployment have the detail.',
  ].join('\n');
}

class GitHubFailure extends Error {
  constructor(readonly status: number) {
    super('GitHub refused the alert.');
  }
}

async function github(request: typeof fetch, token: string, signal: AbortSignal, path: string, body?: object) {
  const response = await request(`https://api.github.com/repos/${ALERT_REPOSITORY}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'play-100-production-alert',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal,
  });
  if (!response.ok || body) {
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw new GitHubFailure(response.status);
    return null;
  }
  return (await response.json()) as unknown;
}

/** Comments on the open labelled issue, or opens it, unless the issue already has this exact text. Never rejects. */
export async function postAlert(
  request: typeof fetch,
  token: string,
  body: string,
  time: number,
): Promise<AlertOutcome> {
  const budget = new AbortController();
  const timer = setTimeout(() => budget.abort(), ALERT_BUDGET_MS);
  const signal = budget.signal;
  try {
    const open = await github(request, token, signal, `/issues?state=open&labels=${ALERT_LABEL}&per_page=1`);
    const issue = isUnknownArray(open) ? nullableObject(open[0]) : null;
    const number = issue?.number;
    if (!issue || typeof number !== 'number') {
      await github(request, token, signal, '/issues', { title: ALERT_TITLE, body, labels: [ALERT_LABEL] });
      return { alert: 'created' };
    }
    // Posts come at most hourly per instance, and the workflow closes the issue after a quiet day.
    const since = encodeURIComponent(new Date(time - 25 * ALERT_WINDOW_MS).toISOString());
    const comments = await github(request, token, signal, `/issues/${number}/comments?since=${since}&per_page=100`);
    const texts = [
      issue.body,
      ...(isUnknownArray(comments) ? comments.map((comment) => nullableObject(comment)?.body) : []),
    ];
    if (texts.includes(body)) return { alert: 'duplicate' };
    await github(request, token, signal, `/issues/${number}/comments`, { body });
    return { alert: 'commented' };
  } catch (cause) {
    return { alert: 'failed', alertStatus: cause instanceof GitHubFailure ? cause.status : 0 };
  } finally {
    clearTimeout(timer);
  }
}

function spikeSender(endpoint: string, options: AlertOptions) {
  const token = options.token;
  if (token === undefined || !TOKEN.test(token)) return null;
  const now = options.now ?? Date.now;
  const request: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));
  let posted = Number.NEGATIVE_INFINITY;
  return (breach: Breach): Promise<AlertOutcome> | null => {
    const time = now();
    // One post per instance per hour, failed or not; a clock that moved backwards ends the wait rather than extending it.
    if (time >= posted && time - posted < ALERT_COOLDOWN_MS) return null;
    posted = time;
    return postAlert(request, token, alertBody(endpoint, breach, time, options.deploymentId), time);
  };
}

/** Five reports naming one error class and area, or twenty reports in all, within one instance's last hour. */
export function createClientErrorAlert(
  options: AlertOptions,
): ReportAlert<{ readonly counts: readonly ClientErrorCount[] }> | null {
  const send = spikeSender('/api/client-error-report', options);
  if (!send) return null;
  const now = options.now ?? Date.now;
  const reports = createRollingCounter(now);
  const categories = createRollingCounter(now);
  return ({ counts }) => {
    reports.add('reports');
    // A report counts once for each class and area it names, however many errors it counted.
    for (const category of new Set(counts.map(({ errorClass, area }) => `\`${errorClass}\` · \`${area}\``)))
      categories.add(category);
    const total = reports.totals().get('reports') ?? 0;
    const ranked = rank(categories.totals());
    const top = ranked[0]?.[1] ?? 0;
    const reasons = [
      ...(top >= ALERT_THRESHOLDS.sameClassAndArea
        ? [
            `${plural(top, 'report')} named one error class and area (the alert is at ${ALERT_THRESHOLDS.sameClassAndArea})`,
          ]
        : []),
      ...(total >= ALERT_THRESHOLDS.clientErrorReports
        ? [`${plural(total, 'client error report')} in all (the alert is at ${ALERT_THRESHOLDS.clientErrorReports})`]
        : []),
    ];
    if (!reasons.length) return null;
    return send({
      reason: `Client error reports crossed an alert threshold: ${reasons.join('; ')}.`,
      summary: `Client error reports in the window: ${total}`,
      rows: ranked.slice(0, ROWS).map(([category, count]) => [category, plural(count, 'report')] as const),
    });
  };
}

/** Three CSP violations in main documents within one instance's last hour; the sign-in helper documents don't count. */
export function createCspAlert(options: AlertOptions): ReportAlert<readonly CspViolationCount[]> | null {
  const send = spikeSender('/api/csp-report', options);
  if (!send) return null;
  const now = options.now ?? Date.now;
  const violations = createRollingCounter(now);
  const categories = createRollingCounter(now);
  return (counts) => {
    const main = counts.filter(({ route }) => !HELPER_ROUTES.has(route));
    if (!main.length) return null;
    for (const { directive, blockedOrigin, route, count } of main) {
      violations.add('violations', count);
      categories.add(`\`${directive}\` · \`${blockedOrigin}\` · \`${route}\``, count);
    }
    const total = violations.totals().get('violations') ?? 0;
    if (total < ALERT_THRESHOLDS.mainDocumentCspViolations) return null;
    return send({
      reason: `Main documents reported ${plural(total, 'CSP violation')} in the last hour (the alert is at ${ALERT_THRESHOLDS.mainDocumentCspViolations}).`,
      summary: `Main-document CSP violations in the window: ${total}`,
      rows: rank(categories.totals())
        .slice(0, ROWS)
        .map(([category, count]) => [category, plural(count, 'violation')] as const),
    });
  };
}
