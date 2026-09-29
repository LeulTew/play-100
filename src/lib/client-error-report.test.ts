import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClientErrorReporter, entryBuildFingerprint, reportClientError } from './client-error-report';
import { clientErrorCounts, reportRouteTemplate } from './client-error-schema';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const buildVersion = 'entry:AbCd_123';
const row = { errorClass: 'TypeError', area: 'app', route: '/u/:handle', count: 1 };
function fixture(accepted = true) {
  const sendBeacon = vi.fn<(url: string, body: Blob) => boolean>(() => accepted);
  const warn = vi.fn();
  const reporter = createClientErrorReporter({
    buildVersion,
    pathname: () => '/u/private-handle',
    sendBeacon,
    warn,
  });
  return { ...reporter, sendBeacon, warn };
}

describe('anonymous client error counts', () => {
  it('batches only fixed categories, a route template and the entry fingerprint', async () => {
    vi.useFakeTimers();
    const reporter = fixture();
    const error = new TypeError('private message https://secret.test/?token=secret');
    error.stack = 'private stack and user ID';
    reporter.report(error, 'app');
    reporter.report(error, 'app');
    expect(reporter.sendBeacon).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(reporter.sendBeacon).toHaveBeenCalledOnce();
    const [url, body] = reporter.sendBeacon.mock.calls[0]!;
    expect(url).toBe('/api/client-error-report');
    expect(body.type).toBe('application/json');
    const text = await body.text();
    expect(JSON.parse(text)).toEqual({ buildVersion, counts: [{ ...row, count: 2 }] });
    expect(text).not.toMatch(/private|secret|https:|user ID/);
  });

  it('limits a page to 20 errors and four batches without retrying declined or throwing beacons', async () => {
    vi.useFakeTimers();
    const reporter = fixture();
    for (let i = 0; i < 30; i++) reporter.report(new TypeError(), 'app');
    reporter.flush();
    expect(JSON.parse(await reporter.sendBeacon.mock.calls[0]![1].text()).counts[0].count).toBe(20);
    reporter.report(new Error(), 'app');
    reporter.flush();
    expect(reporter.sendBeacon).toHaveBeenCalledOnce();
    const declined = fixture(false);
    for (let i = 0; i < 8; i++) {
      declined.report(new Error(), 'route');
      declined.flush();
    }
    await vi.runAllTimersAsync();
    expect(declined.sendBeacon).toHaveBeenCalledTimes(4);
    expect(declined.warn).toHaveBeenCalledOnce();
    const throwing = fixture();
    throwing.sendBeacon.mockImplementation(() => {
      throw new Error('private network error');
    });
    throwing.report(new Error(), 'online');
    expect(() => throwing.flush()).not.toThrow();
    await vi.runAllTimersAsync();
    expect(throwing.sendBeacon).toHaveBeenCalledOnce();
    expect(throwing.warn).toHaveBeenCalledOnce();
  });

  it('does not transmit in development or with a missing or unsafe build fingerprint', () => {
    vi.stubEnv('PROD', false);
    expect(() => reportClientError(new Error(), 'app')).not.toThrow();
    const origin = 'https://play-100-collection.vercel.app';
    expect(entryBuildFingerprint([`${origin}/assets/index-AbCd_123.js`], origin)).toBe(buildVersion);
    for (const sources of [
      [],
      ['/src/main.tsx'],
      ['/assets/index-short.js'],
      ['/assets/index-AbCd_123.js?private=1'],
      ['https://elsewhere.test/assets/index-AbCd_123.js'],
      ['/assets/index-AbCd_123.js#private'],
      ['/assets/index-AbCd_123.js', '/assets/index-different.js'],
    ])
      expect(entryBuildFingerprint(sources, origin)).toBeNull();
    const sendBeacon = vi.fn(() => true);
    const reporter = createClientErrorReporter({
      buildVersion: 'private',
      pathname: () => '/',
      sendBeacon,
      warn: vi.fn(),
    });
    reporter.report(new Error(), 'app');
    reporter.flush();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('wires production batching to page lifecycle with no URL or query in the beacon', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.stubEnv('PROD', true);
    const sendBeacon = vi.fn<(url: string, body: Blob) => boolean>(() => true);
    const windowEvents = new EventTarget();
    const documentEvents = new EventTarget();
    vi.stubGlobal('window', windowEvents);
    vi.stubGlobal(
      'document',
      Object.assign(documentEvents, {
        querySelectorAll: () => [{ src: 'https://play-100-collection.vercel.app/assets/index-AbCd_123.js' }],
        visibilityState: 'hidden',
      }),
    );
    vi.stubGlobal('navigator', { sendBeacon });
    vi.stubGlobal('location', {
      origin: 'https://play-100-collection.vercel.app',
      pathname: '/friends/private-uid',
      search: '?secret=private',
    });
    const { reportClientError: report } = await import('./client-error-report');
    report(new TypeError('private'), 'route');
    documentEvents.dispatchEvent(new Event('visibilitychange'));
    windowEvents.dispatchEvent(new Event('pagehide'));
    await vi.runAllTimersAsync();
    expect(sendBeacon).toHaveBeenCalledOnce();
    const blob: Blob = vi.mocked(sendBeacon).mock.calls[0]![1]!;
    expect(JSON.parse(await blob.text())).toEqual({
      buildVersion,
      counts: [{ errorClass: 'TypeError', area: 'route', route: '/friends/:uid', count: 1 }],
    });
  });

  it('reduces unknown names and routes, and rejects raw fields or unbounded counts at the endpoint schema', () => {
    expect(reportRouteTemplate('/u/private')).toBe('/u/:handle');
    expect(reportRouteTemplate('/friends/private')).toBe('/friends/:uid');
    expect(reportRouteTemplate('/friends/sharing')).toBe('/friends/sharing');
    expect(reportRouteTemplate('/private/path')).toBe('other');
    expect(clientErrorCounts({ buildVersion, counts: [row, row] })).toEqual({
      buildVersion,
      counts: [{ ...row, count: 2 }],
    });
    for (const input of [
      { buildVersion, counts: [row], url: 'private' },
      { buildVersion, counts: [{ ...row, message: 'private' }] },
      { buildVersion, counts: [{ ...row, route: '/u/private' }] },
      { buildVersion, counts: [{ ...row, errorClass: 'private error' }] },
      { buildVersion, counts: [{ ...row, area: 'private area' }] },
      ...[0, -1, 1.5, 21, Infinity].map((count) => ({ buildVersion, counts: [{ ...row, count }] })),
      {
        buildVersion,
        counts: [
          { ...row, count: 11 },
          { ...row, count: 10 },
        ],
      },
      { buildVersion, counts: [] },
      { buildVersion: 'https://private.test', counts: [row] },
    ])
      expect(() => clientErrorCounts(input)).toThrow(/Invalid client error/);
  });

  it('does not let unusual error objects interfere with recovery or leak names', async () => {
    vi.useFakeTimers();
    const reporter = fixture();
    const error = new Error('private');
    error.name = 'visitor-unique-error';
    reporter.report(error, 'chunk');
    reporter.flush();
    expect(JSON.parse(await reporter.sendBeacon.mock.calls[0]![1].text()).counts[0].errorClass).toBe('other');
    Object.defineProperty(error, 'name', {
      get: () => {
        throw new Error('private getter');
      },
    });
    expect(() => reporter.report(error, 'app')).not.toThrow();
    expect(reporter.warn).toHaveBeenCalledOnce();
  });
});
