import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from './client';
import { createDeferredPwaController, initialDeferredPwaState } from './deferred-controller';
import { createRetryableModule } from '../lib/retryable-module';

function fixture() {
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: null, getRegistration: vi.fn(async () => undefined), register: vi.fn(),
  });
  const media = Object.assign(new EventTarget(), { matches: false });
  let idle: (() => void) | undefined;
  const window = Object.assign(new EventTarget(), {
    isSecureContext: true, matchMedia: () => media,
    setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    requestIdleCallback: vi.fn((callback: () => void) => { idle = callback; return 1; }),
    cancelIdleCallback: () => { idle = undefined; },
  });
  const document = { readyState: 'loading' };
  const navigator = { serviceWorker, onLine: true, userAgent: 'Fixture desktop', maxTouchPoints: 0 };
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', document);
  vi.stubGlobal('navigator', navigator);
  vi.stubGlobal('location', { origin: 'https://play.test', pathname: '/' });
  return { window, document, navigator, serviceWorker, media, runIdle: () => idle?.() };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('after-load PWA controller', () => {
  it('connects through the real lazy entry without registering until requested', async () => {
    const env = fixture();
    env.navigator.onLine = true;
    const controller = createDeferredPwaController();
    const stop = controller.connect();
    try {
      controller.connectNow();
      await vi.waitFor(() => expect(controller.isConnected()).toBe(true));
      expect(controller.getSnapshot()).toEqual(client.initialPwaState);
      expect(env.serviceWorker.register).not.toHaveBeenCalled();
    } finally { stop(); }
  });

  it.each(['/data-use', '/data-use/', '/api/catalog', '/__/auth/handler'])('does not capture, import or register on excluded %s', pathname => {
    const env = fixture();
    vi.stubGlobal('location', { origin: 'https://play.test', pathname });
    const load = vi.fn(async () => client);
    const controller = createDeferredPwaController(load);
    const stop = controller.connect();
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(async () => {}), userChoice: Promise.resolve({ outcome: 'dismissed' }),
    });
    env.window.dispatchEvent(event);
    env.window.dispatchEvent(new Event('load'));
    env.runIdle();
    controller.connectNow();
    expect(event.defaultPrevented).toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toBe(initialDeferredPwaState);
    expect(env.serviceWorker.register).not.toHaveBeenCalled();
    stop();
  });

  it('does nothing before enabled connect, and Menu intent can connect without waiting for idle', async () => {
    const env = fixture();
    const load = vi.fn(async () => client);
    const controller = createDeferredPwaController(load);
    controller.connectNow();
    expect(load).not.toHaveBeenCalled();
    const stop = controller.connect();
    expect(controller.isConnected()).toBe(false);
    controller.connectNow();
    await vi.waitFor(() => expect(controller.isConnected()).toBe(true));
    expect(load).toHaveBeenCalledOnce();
    expect(env.serviceWorker.register).not.toHaveBeenCalled();
    stop();
  });

  it.each([
    ['iPhone', 0, false, 'ios-instructions'],
    ['Macintosh', 5, false, 'ios-instructions'],
    ['Fixture desktop', 0, true, 'installed'],
  ] as const)('keeps initial install state for %s before any module loads', (userAgent, maxTouchPoints, standalone, expected) => {
    const env = fixture();
    Object.assign(env.navigator, { userAgent, maxTouchPoints });
    env.media.matches = standalone;
    const load = vi.fn(async () => client);
    const controller = createDeferredPwaController(load);
    const stop = controller.connect();
    expect(controller.getSnapshot().installState).toBe(expected);
    expect(load).not.toHaveBeenCalled();
    stop();
  });

  it('retains the original initial contract and defers connection until load/idle when online', async () => {
    expect(initialDeferredPwaState).toEqual(client.initialPwaState);
    const env = fixture();
    const load = vi.fn(async () => client);
    const controller = createDeferredPwaController(load);
    const stop = controller.connect();
    expect(controller.getSnapshot().online).toBe(true);
    expect(load).not.toHaveBeenCalled();
    env.window.dispatchEvent(new Event('load'));
    expect(load).not.toHaveBeenCalled();
    env.runIdle();
    await vi.waitFor(() => expect(env.serviceWorker.getRegistration).toHaveBeenCalledOnce());
    expect(load).toHaveBeenCalledOnce();
    expect(env.serviceWorker.register).not.toHaveBeenCalled();
    stop();
  });

  it.each(['startup', 'offline event'])('connects without waiting for load or idle when offline at %s', async when => {
    const env = fixture();
    if (when === 'startup') env.navigator.onLine = false;
    const load = vi.fn(async () => client);
    const controller = createDeferredPwaController(load);
    const stop = controller.connect();
    if (when === 'offline event') {
      env.navigator.onLine = false;
      env.window.dispatchEvent(new Event('offline'));
    }
    expect(controller.getSnapshot().online).toBe(false);
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    expect(env.window.requestIdleCallback).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(env.serviceWorker.getRegistration).toHaveBeenCalledOnce());
    expect(env.serviceWorker.register).not.toHaveBeenCalled();
    stop();
  });

  it('retains an early browser prompt and invokes prompt synchronously on the eventual click', async () => {
    const env = fixture();
    const controller = createDeferredPwaController(async () => client);
    const stop = controller.connect();
    const prompt = vi.fn(async () => {});
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt, userChoice: Promise.resolve({ outcome: 'dismissed' }),
    });
    env.window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    env.window.dispatchEvent(new Event('load'));
    env.runIdle();
    await vi.waitFor(() => expect(controller.getSnapshot().installState).toBe('prompt'));
    const result = controller.install();
    expect(prompt).toHaveBeenCalledOnce();
    await expect(result).resolves.toBe('dismissed');
    stop();
  });

  it('discards an early prompt after appinstalled', async () => {
    const env = fixture();
    const controller = createDeferredPwaController(async () => client);
    const stop = controller.connect();
    const prompt = vi.fn(async () => {});
    env.window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), {
      prompt, userChoice: Promise.resolve({ outcome: 'dismissed' }),
    }));
    env.window.dispatchEvent(new Event('appinstalled'));
    expect(controller.getSnapshot().installState).toBe('installed');
    env.window.dispatchEvent(new Event('load'));
    env.runIdle();
    await vi.waitFor(() => expect(controller.isConnected()).toBe(true));
    await vi.waitFor(() => expect(controller.getSnapshot().installState).toBe('installed'));
    expect(prompt).not.toHaveBeenCalled();
    stop();
  });

  it('makes a client chunk failure terminal and guards explicit reload without registering or prompting', async () => {
    const env = fixture();
    const added = vi.spyOn(env.window, 'addEventListener');
    const removed = vi.spyOn(env.window, 'removeEventListener');
    const mediaAdded = vi.spyOn(env.media, 'addEventListener');
    const mediaRemoved = vi.spyOn(env.media, 'removeEventListener');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi.fn<() => Promise<typeof client>>().mockRejectedValueOnce(new Error('chunk unavailable')).mockResolvedValue(client);
    const controller = createDeferredPwaController(createRetryableModule(load).load);
    const stop = controller.connect();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const prompt = vi.fn(async () => {});
      env.window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), {
        prompt, userChoice: Promise.resolve({ outcome: 'dismissed' }),
      }));
      env.window.dispatchEvent(new Event('load'));
      env.runIdle();
      await vi.waitFor(() => expect(controller.getSnapshot()).toMatchObject({ moduleError: true, error: "Offline controls didn't load." }));
      for (const [name, listener] of added.mock.calls) expect(removed).toHaveBeenCalledWith(name, listener);
      for (const [name, listener] of mediaAdded.mock.calls) expect(mediaRemoved).toHaveBeenCalledWith(name, listener);
      const failed = controller.getSnapshot();
      env.window.dispatchEvent(new Event('appinstalled'));
      env.media.dispatchEvent(new Event('change'));
      const latePrompt = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt, userChoice: Promise.resolve({ outcome: 'dismissed' }),
      });
      env.window.dispatchEvent(latePrompt);
      expect(latePrompt.defaultPrevented).toBe(false);
      expect(controller.getSnapshot()).toBe(failed);
      await controller.checkForUpdate();
      expect(await controller.prepareOffline()).toBe(false);
      controller.connectNow();
      expect(load).toHaveBeenCalledOnce();
      expect(controller.isConnected()).toBe(false);
      expect(prompt).not.toHaveBeenCalled();
      expect(env.serviceWorker.register).not.toHaveBeenCalled();
      const replace = vi.fn();
      vi.stubGlobal('location', { href: 'https://play.test/?info=settings&catalogs=off', replace });
      const fetch = vi.fn(async () => ({ ok: true }));
      vi.stubGlobal('fetch', fetch);
      let saved = false;
      let current = true;
      let clean = true;
      const guard = { prepare: vi.fn(async () => saved), isCurrent: () => current, canReload: () => clean };
      const editMessage = 'Finish or clear unsubmitted forms, or return to The 100 before updating. Nothing was reloaded.';
      const genericMessage = 'This page could not reload. Save your changes before reloading when connected.';
      for (const cause of [new Error(editMessage), new Error(''), 'prepare failed']) {
        const calls = guard.prepare.mock.calls.length;
        guard.prepare.mockRejectedValueOnce(cause);
        expect(await controller.applyUpdate(guard)).toBe(false);
        expect(guard.prepare).toHaveBeenCalledTimes(calls + 1);
        expect(controller.getSnapshot().message).toBe(cause instanceof Error && cause.message ? editMessage : genericMessage);
        expect(fetch).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
      }
      expect(await controller.applyUpdate(guard)).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
      saved = true;
      clean = false;
      expect(await controller.applyUpdate(guard)).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
      clean = true;
      env.navigator.onLine = false;
      expect(await controller.applyUpdate(guard)).toBe(false);
      expect(controller.getSnapshot().message).toBe("You're offline. Reconnect, then try again.");
      expect(replace).not.toHaveBeenCalled();
      env.navigator.onLine = true;
      fetch.mockResolvedValueOnce({ ok: false });
      expect(await controller.applyUpdate(guard)).toBe(false);
      expect(controller.getSnapshot().message).toBe("Play 100 didn't respond. Try again in a moment.");
      fetch.mockImplementationOnce(async () => { current = false; return { ok: true }; });
      expect(await controller.applyUpdate(guard)).toBe(false);
      expect(controller.getSnapshot().message).toBe('Your edit or page changed. Save or correct it before reloading.');
      expect(replace).not.toHaveBeenCalled();
      current = true;
      replace.mockImplementationOnce(() => { throw new Error('Navigation failed'); });
      expect(await controller.applyUpdate(guard)).toBe(false);
      expect(controller.getSnapshot().message).toBe(genericMessage);
      replace.mockClear();
      fetch.mockImplementationOnce(async () => {
        expect(controller.getSnapshot().message).not.toBe('Checking your connection…');
        return { ok: true };
      });
      const reload = controller.applyUpdate(guard);
      expect(await controller.applyUpdate(guard)).toBe(false);
      expect(await reload).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(replace).toHaveBeenCalledOnce();
      expect(replace).toHaveBeenCalledWith('https://play.test/?info=settings&catalogs=off');
      expect(controller.getSnapshot().message).toBe('');
      expect(load).toHaveBeenCalledOnce();
      expect(env.serviceWorker.register).not.toHaveBeenCalled();
      await new Promise(resolve => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
    } finally { process.off('unhandledRejection', unhandled); stop(); }
  });

  it('does not attach a controller after cleanup, including StrictMode reconnects', async () => {
    const env = fixture();
    let resolve!: (module: typeof client) => void;
    const load = vi.fn(() => new Promise<typeof client>(done => { resolve = done; }));
    const controller = createDeferredPwaController(load);
    const stop = controller.connect();
    env.window.dispatchEvent(new Event('load'));
    env.runIdle();
    await Promise.resolve();
    stop();
    resolve(client);
    await Promise.resolve();
    expect(env.serviceWorker.getRegistration).not.toHaveBeenCalled();
    const stopAgain = controller.connect();
    env.window.dispatchEvent(new Event('load'));
    env.runIdle();
    await Promise.resolve();
    resolve(client);
    await vi.waitFor(() => expect(env.serviceWorker.getRegistration).toHaveBeenCalledOnce());
    stopAgain();
  });

  it('checks update scope both before and after the client import', async () => {
    fixture();
    let resolve!: (module: typeof client) => void;
    const controller = createDeferredPwaController(() => new Promise(done => { resolve = done; }));
    const stop = controller.connect();
    let current = true;
    const guard = { isCurrent: () => current, prepare: vi.fn(async () => true), canReload: () => true };
    const applying = controller.applyUpdate(guard);
    await Promise.resolve();
    current = false;
    resolve(client);
    await expect(applying).resolves.toBe(false);
    expect(guard.prepare).not.toHaveBeenCalled();
    stop();
  });
});
