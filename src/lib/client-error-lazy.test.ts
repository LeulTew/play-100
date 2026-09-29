import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('./client-error-reporter');
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function browser() {
  vi.stubEnv('PROD', true);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal(
    'document',
    Object.assign(new EventTarget(), {
      querySelectorAll: () => [{ src: 'https://play-100-collection.vercel.app/assets/index-AbCd_123.js' }],
      visibilityState: 'visible',
    }),
  );
  const location = { origin: 'https://play-100-collection.vercel.app', pathname: '/u/private-person' };
  vi.stubGlobal('location', location);
  const sendBeacon = vi.fn<(url: string, body: Blob) => boolean>(() => true);
  vi.stubGlobal('navigator', { sendBeacon });
  return { location, sendBeacon };
}

describe('lazy client fault reporting', () => {
  it('keeps beacon, fingerprint and batching implementation out of the eager module', () => {
    const source = readFileSync(new URL('./client-error-report.ts', import.meta.url), 'utf8');
    expect(source).toContain("import('./client-error-reporter')");
    expect(source).not.toMatch(/sendBeacon|Blob|querySelector|setTimeout|client-error-schema/);
    expect(source).not.toMatch(/^import\s+(?!type\b)/m);
  });

  it.each(['visible', 'hidden'])(
    'snapshots queued classifications and routes and caps the page at 20 when %s',
    async (visibilityState) => {
      vi.useFakeTimers();
      vi.resetModules();
      const { location, sendBeacon } = browser();
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const loads = vi.fn();
      const implementation = await vi.importActual<typeof import('./client-error-reporter')>('./client-error-reporter');
      vi.doMock('./client-error-reporter', async () => {
        loads();
        await pending;
        return implementation;
      });
      const { reportClientError } = await import('./client-error-report');
      expect(loads).not.toHaveBeenCalled();
      const error = new TypeError('private message');
      error.stack = 'private stack';
      reportClientError(error, 'route');
      error.name = 'visitor-secret';
      location.pathname = '/';
      for (let index = 0; index < 29; index++) reportClientError(error, 'app');
      expect(sendBeacon).not.toHaveBeenCalled();
      Object.assign(document, { visibilityState });
      release();
      await vi.dynamicImportSettled();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(loads).toHaveBeenCalledOnce();
      expect(sendBeacon).toHaveBeenCalledOnce();
      const text = await sendBeacon.mock.calls[0]![1].text();
      expect(JSON.parse(text)).toEqual({
        buildVersion: 'entry:AbCd_123',
        counts: [
          { errorClass: 'TypeError', area: 'route', route: '/u/:handle', count: 1 },
          { errorClass: 'other', area: 'app', route: '/', count: 19 },
        ],
      });
      expect(text).not.toMatch(/private|visitor|secret/);
    },
  );

  it('reports an import failure once without retries or breaking boundary recovery', async () => {
    vi.resetModules();
    const { sendBeacon } = browser();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loads = vi.fn(() => {
      throw new Error('private module failure');
    });
    vi.doMock('./client-error-reporter', loads);
    const { reportClientError } = await import('./client-error-report');
    for (let index = 0; index < 5; index++) reportClientError(new Error('private'), 'app');
    await vi.dynamicImportSettled();
    reportClientError(new Error(), 'app');
    await vi.dynamicImportSettled();
    expect(loads).toHaveBeenCalledOnce();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private');
  });

  it('never loads in development and contains an error-name getter failure', async () => {
    vi.resetModules();
    browser();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loads = vi.fn();
    vi.doMock('./client-error-reporter', () => {
      loads();
      return { reportClientErrorCount: vi.fn() };
    });
    const { reportClientError } = await import('./client-error-report');
    vi.stubEnv('PROD', false);
    reportClientError(new Error(), 'app');
    await vi.dynamicImportSettled();
    expect(loads).not.toHaveBeenCalled();
    vi.stubEnv('PROD', true);
    const error = new Error();
    Object.defineProperty(error, 'name', {
      get: () => {
        throw new Error('private');
      },
    });
    expect(() => reportClientError(error, 'app')).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    expect(loads).not.toHaveBeenCalled();
  });
});
