import { afterEach, expect, it, vi } from 'vitest';
import { createPwaController } from './client';

const imports = vi.hoisted(() => ({ count: 0 }));
vi.mock('./apply-update', () => {
  imports.count++;
  throw new Error('Synthetic dependency failure');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('retains a waiting worker and protects edits before a connected recovery reload', async () => {
  const waiting = Object.assign(new EventTarget(), { scriptURL: 'https://play.test/sw.js' });
  const registration = Object.assign(new EventTarget(), {
    scope: 'https://play.test/',
    active: null,
    waiting,
    installing: null,
  });
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: null,
    getRegistration: vi.fn(async () => registration),
  });
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      isSecureContext: true,
      matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
    }),
  );
  const browser = { serviceWorker, onLine: true, userAgent: 'Fixture desktop', maxTouchPoints: 0 };
  vi.stubGlobal('navigator', browser);
  const replace = vi.fn();
  vi.stubGlobal('location', {
    origin: 'https://play.test',
    pathname: '/',
    href: 'https://play.test/?info=settings',
    replace,
  });
  const network = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal('fetch', network);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const controller = createPwaController();
  const stop = controller.connect();
  let saved = true;
  let current = true;
  const guard = { prepare: vi.fn(async () => saved), isCurrent: () => current, canReload: () => current };
  try {
    await vi.waitFor(() => expect(controller.getSnapshot().updateState).toBe('waiting'));
    expect(await controller.applyUpdate(guard)).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({ moduleError: true, updateState: 'waiting' });
    expect(imports.count).toBe(1);
    expect(replace).not.toHaveBeenCalled();
    saved = false;
    expect(await controller.applyUpdate(guard)).toBe(false);
    expect(network).not.toHaveBeenCalled();
    saved = true;
    browser.onLine = false;
    expect(await controller.applyUpdate(guard)).toBe(false);
    expect(controller.getSnapshot().message).toBe("You're offline. Reconnect, then try again.");
    expect(replace).not.toHaveBeenCalled();
    browser.onLine = true;
    network.mockResolvedValueOnce({ ok: false });
    expect(await controller.applyUpdate(guard)).toBe(false);
    expect(controller.getSnapshot().message).toBe("Play 100 didn't respond. Try again in a moment.");
    expect(replace).not.toHaveBeenCalled();
    network.mockImplementationOnce(async () => {
      current = false;
      return { ok: true };
    });
    expect(await controller.applyUpdate(guard)).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    current = true;
    expect(await controller.applyUpdate(guard)).toBe(true);
    expect(replace).toHaveBeenCalledWith('https://play.test/?info=settings');
    expect(registration.waiting).toBe(waiting);
    expect(imports.count).toBe(1);
  } finally {
    stop();
  }
});
