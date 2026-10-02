import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ALERT_BUDGET_MS,
  ALERT_LABEL,
  ALERT_MARKER,
  ALERT_THRESHOLDS,
  ALERT_TITLE,
  createClientErrorAlert,
  createCspAlert,
  createRollingCounter,
  productionAlertOptions,
} from '../../api/_lib/production-alert';
import type { AlertOutcome } from '../../api/_lib/production-alert';
import { createClientErrorHandler } from '../../api/client-error-report';
import { createCspReportHandler } from '../../api/csp-report';
import type { ClientErrorCount } from './client-error-schema';
import { listenOnFetchSafePort } from './test-server-ports';

const nativeFetch = globalThis.fetch;
const MINUTE = 60_000;
const T0 = Date.UTC(2026, 9, 2, 4, 0);
const token = `github_pat_${'A1b_'.repeat(20)}`;
const repo = '/repos/LeulTew/play-100';

const servers: Server[] = [];
async function serve(handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>) {
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  servers.push(server);
  await listenOnFetchSafePort(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture address.');
  return `http://127.0.0.1:${address.port}`;
}
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((cause) => (cause ? reject(cause) : resolve())));
  }
});

interface Recorded {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

interface FakePost {
  /** Defaults to the token's owner. */
  login?: string;
  /** Defaults to a day before T0. */
  createdAt?: string;
  body: string;
}
const iso = (time: number) => new Date(time).toISOString();
const spikePost = (createdAt: string, login?: string): FakePost => ({
  login,
  createdAt,
  body: `${ALERT_MARKER}\nAn earlier spike.`,
});

/**
 * GitHub's issue endpoints as the alert uses them, recording every request. New issues and comments are the owner's,
 * created at `now`, and later requests see them, so several instances can share one fake repository.
 */
function fakeGitHub(
  options: {
    issues?: Array<FakePost & { number: number; pullRequest?: boolean }>;
    comments?: FakePost[];
    fail?: number | 'network';
    lockStatus?: number;
    now?: () => number;
  } = {},
) {
  const requests: Recorded[] = [];
  const issues = [...(options.issues ?? [])];
  const comments = [...(options.comments ?? [])];
  const json = ({ login = 'LeulTew', createdAt = iso(T0 - 24 * 60 * MINUTE), body }: FakePost) => ({
    user: { login, type: login.endsWith('[bot]') ? 'Bot' : 'User' },
    created_at: createdAt,
    body,
  });
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({
      method,
      path: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(new Headers(init?.headers)),
      body,
    });
    if (options.fail === 'network') throw new TypeError('fetch failed');
    if (options.fail) return new Response('{}', { status: options.fail });
    const now = iso(options.now?.() ?? T0);
    const text = (body as { body: string } | undefined)?.body ?? '';
    if (method === 'GET' && url.pathname === `${repo}/issues`)
      return Response.json(
        // Newest first, as GitHub lists them.
        [...issues]
          .sort((a, b) => b.number - a.number)
          .map((issue) => ({ number: issue.number, ...json(issue), ...(issue.pullRequest ? { pull_request: {} } : {}) })),
      );
    if (method === 'GET' && url.pathname.endsWith('/comments')) return Response.json(comments.map(json));
    if (method === 'POST' && url.pathname === `${repo}/issues`) {
      issues.push({ number: 7, createdAt: now, body: text });
      return Response.json({ number: 7 }, { status: 201 });
    }
    if (method === 'POST' && url.pathname.endsWith('/comments')) {
      comments.push({ createdAt: now, body: text });
      return Response.json({ id: comments.length }, { status: 201 });
    }
    if (method === 'PUT' && url.pathname.endsWith('/lock')) return new Response(null, { status: options.lockStatus ?? 204 });
    return new Response('{}', { status: 404 });
  });
  return {
    fetch: request as typeof fetch,
    requests,
    posts: () => requests.filter(({ method }) => method === 'POST'),
    locks: () => requests.filter(({ method }) => method === 'PUT').map(({ path }) => path),
  };
}

const clientReport = (errorClass: ClientErrorCount['errorClass'], area: ClientErrorCount['area'], count = 1) => ({
  counts: [{ errorClass, area, route: '/' as const, count }],
});
const violation = (route: string, count = 1, directive = 'script-src-elem', blockedOrigin = 'inline') => [
  { directive, blockedOrigin, route, count },
];

describe('client report alert counts', () => {
  it('counts a rolling hour of minutes, forgets older ones and bounds its categories', () => {
    let time = T0;
    const counter = createRollingCounter(() => time);
    counter.add('a');
    time += 30 * MINUTE;
    counter.add('a', 2);
    counter.add('b');
    expect(Object.fromEntries(counter.totals())).toEqual({ a: 3, b: 1 });
    time += 31 * MINUTE;
    expect(Object.fromEntries(counter.totals())).toEqual({ a: 2, b: 1 });
    // A clock that moved backwards still counts, into the newest minute.
    time -= 45 * MINUTE;
    counter.add('a');
    expect(counter.totals().get('a')).toBe(3);
    time += 120 * MINUTE;
    expect(counter.totals().size).toBe(0);
    for (let index = 0; index < 70; index += 1) counter.add(`category ${index}`);
    const totals = counter.totals();
    expect(totals.size).toBe(65);
    expect(totals.get('more categories')).toBe(6);
  });

  it('alerts at five reports of one class and area, counting a report once however many errors it counted', async () => {
    expect(ALERT_THRESHOLDS.sameClassAndArea).toBe(5);
    const github = fakeGitHub();
    const alert = createClientErrorAlert({ token, now: () => T0, fetch: github.fetch })!;
    expect(alert(clientReport('TypeError', 'route', 20))).toBeNull();
    for (let index = 0; index < 3; index += 1) expect(alert(clientReport('TypeError', 'route'))).toBeNull();
    await expect(alert(clientReport('TypeError', 'route'))).resolves.toEqual({ alert: 'created' });
    expect(github.posts()).toHaveLength(1);
  });

  it('alerts at twenty client error reports in all, even when no class and area reaches five', async () => {
    expect(ALERT_THRESHOLDS.clientErrorReports).toBe(20);
    const alert = createClientErrorAlert({ token, now: () => T0, fetch: fakeGitHub().fetch })!;
    const classes = ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError'] as const;
    for (let index = 0; index < 19; index += 1) expect(alert(clientReport(classes[index % 5]!, 'app'))).toBeNull();
    await expect(alert(clientReport('other', 'app'))).resolves.toEqual({ alert: 'created' });
  });

  it('alerts at three main-document CSP violations and never counts the sign-in helper documents', async () => {
    expect(ALERT_THRESHOLDS.mainDocumentCspViolations).toBe(3);
    const alert = createCspAlert({ token, now: () => T0, fetch: fakeGitHub().fetch })!;
    expect(alert(violation('/__/auth/handler', 9))).toBeNull();
    expect(alert(violation('/__/auth/iframe', 9))).toBeNull();
    expect(alert(violation('/'))).toBeNull();
    expect(alert(violation('/account'))).toBeNull();
    await expect(alert(violation('/', 1, 'connect-src', 'other-origin'))).resolves.toEqual({ alert: 'created' });
  });

  it('posts at most once per instance per hour, failed or not', async () => {
    let time = T0;
    const github = fakeGitHub({ fail: 503 });
    const alert = createCspAlert({ token, now: () => time, fetch: github.fetch })!;
    await expect(alert(violation('/', 3))).resolves.toEqual({ alert: 'failed', alertStatus: 503 });
    time += 59 * MINUTE;
    expect(alert(violation('/', 3))).toBeNull();
    time += MINUTE;
    await expect(alert(violation('/', 3))).resolves.toMatchObject({ alert: 'failed' });
    // A clock that moved backwards ends the wait rather than extending it.
    time -= 10 * MINUTE;
    await expect(alert(violation('/', 3))).resolves.toMatchObject({ alert: 'failed' });
    expect(github.requests.filter(({ path }) => path.startsWith(`${repo}/issues?`))).toHaveLength(3);
  });
});

describe('client report alert posts', () => {
  const lookup = `GET ${repo}/issues?state=open&labels=${ALERT_LABEL}&creator=LeulTew&per_page=10`;

  it('comments on the owner’s open labelled issue and never repeats a post the owner made', async () => {
    const existing = fakeGitHub({ issues: [{ number: 12, body: 'An earlier spike.' }] });
    const alert = createCspAlert({ token, now: () => T0, fetch: existing.fetch, deploymentId: 'dpl_abc123' })!;
    await expect(alert(violation('/', 3))).resolves.toEqual({ alert: 'commented' });
    const since = encodeURIComponent(new Date(T0 - 25 * 60 * MINUTE).toISOString());
    expect(existing.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      lookup,
      `GET ${repo}/issues/12/comments?since=${since}&per_page=100`,
      `POST ${repo}/issues/12/comments`,
    ]);
    const posted = existing.posts()[0]!.body as { body: string };
    expect(Object.keys(posted)).toEqual(['body']);

    for (const repeat of [
      fakeGitHub({ issues: [{ number: 12, body: 'An earlier spike.' }], comments: [{ body: posted.body }] }),
      fakeGitHub({ issues: [{ number: 12, body: posted.body }] }),
    ]) {
      const again = createCspAlert({ token, now: () => T0, fetch: repeat.fetch, deploymentId: 'dpl_abc123' })!;
      await expect(again(violation('/', 3))).resolves.toEqual({ alert: 'duplicate' });
      expect(repeat.posts()).toEqual([]);
    }
  });

  it('ignores issues and posts by anyone but the token’s owner', async () => {
    const strangers = fakeGitHub({
      issues: [
        { number: 31, login: 'someone-else', body: 'Labelled by a collaborator.' },
        { number: 30, pullRequest: true, body: 'A pull request with the label.' },
      ],
    });
    const alert = createCspAlert({ token, now: () => T0, fetch: strangers.fetch, deploymentId: 'dpl_abc123' })!;
    await expect(alert(violation('/', 3))).resolves.toEqual({ alert: 'created' });
    const text = (strangers.posts()[0]!.body as { body: string }).body;

    // On the owner's issue, another author's copy of the post, or of a recent spike marker, changes nothing.
    const forged = fakeGitHub({
      issues: [{ number: 12, body: 'An earlier spike.' }],
      comments: [
        { login: 'someone-else', createdAt: iso(T0 - MINUTE), body: text },
        spikePost(iso(T0 - MINUTE), 'someone-else'),
        spikePost(iso(T0 - MINUTE), 'github-actions[bot]'),
      ],
    });
    const again = createCspAlert({ token, now: () => T0, fetch: forged.fetch, deploymentId: 'dpl_abc123' })!;
    await expect(again(violation('/', 3))).resolves.toEqual({ alert: 'commented' });
  });

  it('waits an hour after the owner’s newest spike post, across instances', async () => {
    let time = T0;
    const github = fakeGitHub({ now: () => time });
    const instance = () => createCspAlert({ token, now: () => time, fetch: github.fetch })!;
    await expect(instance()(violation('/', 3))).resolves.toEqual({ alert: 'created' });
    // New instances, as after a cold start or a scale-out, each reaching the threshold.
    time += 10 * MINUTE;
    await expect(instance()(violation('/', 3))).resolves.toEqual({ alert: 'cooldown' });
    time = T0 + 60 * MINUTE - 1;
    await expect(instance()(violation('/', 3))).resolves.toEqual({ alert: 'cooldown' });
    time = T0 + 60 * MINUTE;
    await expect(instance()(violation('/', 3))).resolves.toEqual({ alert: 'commented' });
    time += 30 * MINUTE;
    await expect(instance()(violation('/', 3))).resolves.toEqual({ alert: 'cooldown' });
    expect(github.posts().map(({ path }) => path)).toEqual([`${repo}/issues`, `${repo}/issues/7/comments`]);

    // Only the owner's spike posts start the wait: not a note, a quoted post or the workflow's acknowledgement.
    const notes = fakeGitHub({
      issues: [{ number: 12, body: `${ALERT_MARKER}\nAn earlier spike.` }],
      comments: [
        { createdAt: iso(T0 - MINUTE), body: 'Looking into it.' },
        { createdAt: iso(T0 - MINUTE), body: `> ${ALERT_MARKER}\n> An earlier spike.` },
        { login: 'github-actions[bot]', createdAt: iso(T0 - MINUTE), body: '<!-- client-report-spike-seen: x -->' },
        spikePost(iso(T0 - 60 * MINUTE)),
      ],
    });
    const later = createCspAlert({ token, now: () => T0, fetch: notes.fetch })!;
    await expect(later(violation('/', 3))).resolves.toEqual({ alert: 'commented' });
  });

  it('opens and locks the labelled issue when the owner has none open', async () => {
    const github = fakeGitHub();
    const alert = createCspAlert({ token, now: () => T0, fetch: github.fetch })!;
    await expect(alert(violation('/', 3))).resolves.toEqual({ alert: 'created' });
    expect(github.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      lookup,
      `POST ${repo}/issues`,
      `PUT ${repo}/issues/7/lock`,
    ]);
    const created = github.posts()[0]!;
    expect(created.body).toMatchObject({ title: ALERT_TITLE, labels: [ALERT_LABEL] });
    expect(Object.keys(created.body as object).sort()).toEqual(['body', 'labels', 'title']);

    const refused = fakeGitHub({ lockStatus: 403 });
    const unlocked = createCspAlert({ token, now: () => T0, fetch: refused.fetch })!;
    await expect(unlocked(violation('/', 3))).resolves.toEqual({ alert: 'unlocked', alertStatus: 403 });
    expect(refused.posts()).toHaveLength(1);
  });

  it('posts only fixed categories, counts, the window and the deployment', async () => {
    const github = fakeGitHub();
    const deploymentId = 'dpl_8SCr4VKs5FdnW8m8ay8y61VVyM45';
    const alert = createClientErrorAlert({ token, now: () => T0 + 30_000, fetch: github.fetch, deploymentId })!;
    for (let index = 0; index < 4; index += 1) expect(alert(clientReport('TypeError', 'route'))).toBeNull();
    await alert(clientReport('TypeError', 'route'));
    const sent = github.posts()[0]!;
    expect(sent.headers).toMatchObject({
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    });
    const { body } = sent.body as { body: string };
    expect(body.startsWith(`${ALERT_MARKER}\n`)).toBe(true);
    expect(body).toContain('- Endpoint: `/api/client-error-report`');
    expect(body).toContain('2026-10-02T03:00Z to 2026-10-02T04:00Z');
    expect(body).toContain(`- Deployment: \`${deploymentId}\``);
    expect(body).toContain('| `TypeError` · `route` | 5 reports |');
    expect(body).toContain('Client error reports in the window: 5');
    expect(body).not.toMatch(/\?|\b\d{1,3}(?:\.\d{1,3}){3}\b|mozilla|agent|entry:|\/u\//i);

    const unexpected = fakeGitHub();
    const odd = createCspAlert({ token, now: () => T0, fetch: unexpected.fetch, deploymentId: 'dpl_x?leak=1' })!;
    await odd(violation('/', 3, 'connect-src', 'https://apis.google.com'));
    const oddBody = (unexpected.posts()[0]!.body as { body: string }).body;
    expect(oddBody).toContain('- Deployment: `unknown`');
    expect(oddBody).toContain('| `connect-src` · `https://apis.google.com` · `/` | 3 violations |');
    expect(oddBody).not.toContain('leak');
  });

  it('gives up when GitHub has not answered within the five-second budget', async () => {
    expect(ALERT_BUDGET_MS).toBe(5_000);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const signals: AbortSignal[] = [];
    const hung: typeof fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) throw new Error('The post has no budget signal.');
        signals.push(signal);
        signal.addEventListener('abort', () => reject(new DOMException('The budget ran out.', 'AbortError')));
      });
    const alert = createCspAlert({ token, now: () => T0, fetch: hung })!;
    let outcome: AlertOutcome | undefined;
    void alert(violation('/', 3))!.then((value) => (outcome = value));
    await vi.advanceTimersByTimeAsync(ALERT_BUDGET_MS - 1);
    expect(outcome).toBeUndefined();
    expect(signals).toHaveLength(1);
    expect(signals[0]!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signals[0]!.aborted).toBe(true);
    expect(outcome).toEqual({ alert: 'failed', alertStatus: 0 });
  });

  it('does nothing without a fine-grained token', () => {
    for (const missing of [undefined, '', 'not a token', `ghp_${'a'.repeat(36)}`, `${token} `]) {
      expect(createClientErrorAlert({ token: missing })).toBeNull();
      expect(createCspAlert({ token: missing })).toBeNull();
    }
    expect(productionAlertOptions({})).toEqual({ token: undefined, deploymentId: undefined });
    expect(
      productionAlertOptions({ PRODUCTION_ALERT_GITHUB_TOKEN: token, VERCEL_DEPLOYMENT_ID: 'dpl_abc123', OTHER: 'x' }),
    ).toEqual({ token, deploymentId: 'dpl_abc123' });
  });
});

describe('report endpoints with the client report alert', () => {
  const clientBody = JSON.stringify({
    buildVersion: 'entry:AbCd_123',
    counts: [{ errorClass: 'TypeError', area: 'route', route: '/', count: 1 }],
  });
  const postClientError = (base: string) =>
    nativeFetch(base, { method: 'POST', body: clientBody, headers: { 'content-type': 'application/json' } });

  it('without a token logs exactly as before and fetches nothing', async () => {
    const log = vi.fn<(line: string) => void>();
    const request = vi.fn();
    const base = await serve(
      createClientErrorHandler(undefined, log, createClientErrorAlert({ fetch: request as typeof fetch })),
    );
    for (let index = 0; index < 6; index += 1) expect((await postClientError(base)).status).toBe(204);
    expect(log).toHaveBeenCalledTimes(6);
    for (const [line] of log.mock.calls)
      expect(line).toBe(JSON.stringify({ event: 'client-error-count', ...(JSON.parse(clientBody) as object) }));
    expect(request).not.toHaveBeenCalled();
  });

  it('answers the report that posts only after the post, with the outcome in that report’s one log line', async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    let reached!: () => void;
    const posting = new Promise<void>((resolve) => (reached = resolve));
    const github = fakeGitHub();
    const gated: typeof fetch = async (input, init) => {
      reached();
      await gate;
      return github.fetch(input, init);
    };
    const log = vi.fn<(line: string) => void>();
    const base = await serve(
      createClientErrorHandler(undefined, log, createClientErrorAlert({ token, now: () => T0, fetch: gated })),
    );
    for (let index = 0; index < 4; index += 1) expect((await postClientError(base)).status).toBe(204);
    expect(log).toHaveBeenCalledTimes(4);
    let answered = false;
    const fifth = postClientError(base).then((response) => {
      answered = true;
      return response;
    });
    await posting;
    // While GitHub hasn't answered, neither has the report.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(answered).toBe(false);
    expect(log).toHaveBeenCalledTimes(4);
    open();
    expect((await fifth).status).toBe(204);
    expect(github.posts()).toHaveLength(1);
    expect(log).toHaveBeenCalledTimes(5);
    expect(JSON.parse(log.mock.calls[4]![0])).toEqual({
      event: 'client-error-count',
      ...(JSON.parse(clientBody) as object),
      alert: 'created',
    });
    for (const [line] of log.mock.calls.slice(0, 4)) expect(line).not.toContain('alert');
  });

  it.each([
    [503, 503],
    ['network', 0],
  ] as const)('swallows a GitHub failure (%s) into the report’s log line', async (fail, alertStatus) => {
    const error = vi.spyOn(console, 'error');
    const warn = vi.spyOn(console, 'warn');
    const log = vi.fn<(line: string) => void>();
    const base = await serve(
      createCspReportHandler(
        undefined,
        log,
        createCspAlert({ token, now: () => T0, fetch: fakeGitHub({ fail }).fetch }),
      ),
    );
    const report = JSON.stringify({
      'csp-report': {
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'inline',
        'document-uri': 'https://play-100-collection.vercel.app/',
      },
    });
    for (let index = 0; index < 3; index += 1)
      expect(
        (
          await nativeFetch(base, {
            method: 'POST',
            body: report,
            headers: { 'content-type': 'application/csp-report' },
          })
        ).status,
      ).toBe(204);
    expect(log).toHaveBeenCalledTimes(3);
    expect(JSON.parse(log.mock.calls[2]![0])).toEqual({
      event: 'csp-count',
      counts: [{ directive: 'script-src-elem', blockedOrigin: 'inline', route: '/', count: 1 }],
      alert: 'failed',
      alertStatus,
    });
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
