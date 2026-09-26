import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPwaController, preparePwaUpdate, pwaInstallAvailability, trustedPwaWorker } from './client';

const updateLoad = vi.hoisted(() => {
  let release: () => void = () => {};
  let announce: () => void = () => {};
  return {
    pending: new Promise<void>((resolve) => {
      release = resolve;
    }),
    started: new Promise<void>((resolve) => {
      announce = resolve;
    }),
    release: () => release(),
    announce: () => announce(),
    hold: false,
    loads: 0,
  };
});
vi.mock('./apply-update', async (importOriginal) => {
  updateLoad.loads += 1;
  updateLoad.announce();
  if (updateLoad.hold) await updateLoad.pending;
  return importOriginal<typeof import('./apply-update')>();
});

const origin = 'https://play.test';
const oldVersion = 'a'.repeat(64);
const newVersion = 'b'.repeat(64);

class FakeWorker extends EventTarget {
  scriptURL = `${origin}/sw.js`;
  state = 'installed';
  version = newVersion;
  clientVersion?: string;
  accepts = true;
  holdActivation = false;
  acknowledgeActivation = true;
  onActivationRequest = () => {};
  finishActivation: (() => void) | null = null;
  activated = () => {};
  calls: string[] = [];
  postMessage(data: { type: string; version?: string }, ports: MessagePort[]) {
    this.calls.push(data.type);
    const port = ports[0];
    if (!port) throw new Error('A worker request needs a reply port.');
    if (data.type === 'STATUS')
      port.postMessage({
        channel: 'play100-pwa-v1',
        version: this.version,
        clientVersion: this.clientVersion ?? this.version,
        ready: true,
      });
    else {
      const finish = () => {
        if (this.acknowledgeActivation)
          port.postMessage({
            channel: 'play100-pwa-v1',
            version: this.version,
            accepted: this.accepts,
            reason: this.accepts ? undefined : 'other-tabs',
          });
        if (this.accepts) queueMicrotask(() => this.activated());
      };
      if (this.holdActivation) this.finishActivation = finish;
      else finish();
      this.onActivationRequest();
    }
  }
}

class FakeRegistration extends EventTarget {
  scope = `${origin}/`;
  active: FakeWorker | null = new FakeWorker();
  waiting: FakeWorker | null = new FakeWorker();
  installing: FakeWorker | null = null;
  update = vi.fn(async () => {});
}

function fixture(pathname = '/') {
  const registration = new FakeRegistration();
  registration.active!.version = oldVersion;
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: registration.active,
    getRegistration: vi.fn(async () => registration),
    register: vi.fn(async () => registration),
  });
  const media = Object.assign(new EventTarget(), { matches: false });
  const window = Object.assign(new EventTarget(), {
    isSecureContext: true,
    matchMedia: () => media,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
  const location = { origin, pathname, reload: vi.fn() };
  vi.stubGlobal('window', window);
  vi.stubGlobal('location', location);
  vi.stubGlobal('navigator', {
    serviceWorker,
    onLine: true,
    userAgent: 'Fixture desktop',
    maxTouchPoints: 0,
  });
  const waiting = registration.waiting!;
  waiting.activated = () => {
    waiting.clientVersion = oldVersion;
    serviceWorker.controller = waiting;
    registration.active = waiting;
    registration.waiting = null;
    serviceWorker.dispatchEvent(new Event('controllerchange'));
  };
  const controller = createPwaController();
  const stop = controller.connect();
  return { controller, stop, waiting, registration, serviceWorker, window, location };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('truthful installation and page startup', () => {
  it('announces an explicit check and its up-to-date result without reloading', async () => {
    const current = fixture();
    let finish!: () => void;
    try {
      await vi.waitFor(() => expect(current.controller.getSnapshot().updateState).toBe('waiting'));
      current.registration.waiting = null;
      current.registration.update.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      const check = current.controller.checkForUpdate();
      expect(current.controller.getSnapshot()).toMatchObject({
        checkingUpdate: true,
        message: 'Checking for an update…',
        error: '',
      });
      await current.controller.checkForUpdate();
      expect(current.registration.update).toHaveBeenCalledOnce();
      finish();
      await check;
      expect(current.controller.getSnapshot()).toMatchObject({
        checkingUpdate: false,
        updateState: 'none',
        message: "You're up to date.",
        error: '',
      });
      expect(current.location.reload).not.toHaveBeenCalled();
    } finally {
      finish?.();
      current.stop();
    }
  });

  it('clears the checking message on failure and allows a later successful check', async () => {
    const current = fixture();
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await vi.waitFor(() => expect(current.controller.getSnapshot().updateState).toBe('waiting'));
      current.registration.waiting = null;
      current.registration.update.mockRejectedValueOnce(new Error('Synthetic update check failure'));
      await current.controller.checkForUpdate();
      expect(current.controller.getSnapshot()).toMatchObject({
        checkingUpdate: false,
        message: '',
        error: 'An update could not be checked. Your current page remains available.',
      });
      expect(report).toHaveBeenCalled();
      await current.controller.checkForUpdate();
      expect(current.controller.getSnapshot()).toMatchObject({
        checkingUpdate: false,
        message: "You're up to date.",
        error: '',
      });
    } finally {
      report.mockRestore();
      current.stop();
    }
  });

  it.each(['installing', 'waiting'] as const)('does not claim up to date with an %s update', async (phase) => {
    const current = fixture();
    try {
      await vi.waitFor(() => expect(current.controller.getSnapshot().updateState).toBe('waiting'));
      if (phase === 'installing') {
        current.registration.waiting = null;
        current.registration.installing = new FakeWorker();
        current.registration.installing.state = 'installing';
      }
      await current.controller.checkForUpdate();
      const state = current.controller.getSnapshot();
      expect(state.checkingUpdate).toBe(false);
      expect(state.message).toBe(
        phase === 'installing'
          ? 'An update is downloading. This page will stay open.'
          : 'An update is ready. Your current page stays open until you choose to update.',
      );
      expect(current.location.reload).not.toHaveBeenCalled();
    } finally {
      current.stop();
    }
  });

  it('does not publish a late check result after its connection closes', async () => {
    const current = fixture();
    let finish!: () => void;
    await vi.waitFor(() => expect(current.controller.getSnapshot().updateState).toBe('waiting'));
    current.registration.update.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const check = current.controller.checkForUpdate();
    current.stop();
    const stopped = current.controller.getSnapshot();
    finish();
    await check;
    expect(current.controller.getSnapshot()).toBe(stopped);
    expect(current.location.reload).not.toHaveBeenCalled();
  });

  it.each(['message', 'redundant'] as const)(
    'leaves preparing after a worker %s failure and lets the user retry',
    async (failure) => {
      const current = fixture();
      try {
        await vi.waitFor(() => expect(current.controller.getSnapshot().updateState).toBe('waiting'));
        const installing = new FakeWorker();
        installing.state = 'installing';
        current.registration.installing = installing;
        const active = current.registration.active;
        current.registration.active = null;
        expect(await current.controller.prepareOffline()).toBe(true);
        expect(current.controller.getSnapshot().offlineState).toBe('preparing');
        if (failure === 'message') {
          const event = Object.assign(new Event('message'), {
            source: installing,
            data: {
              channel: 'play100-pwa-v1',
              version: newVersion,
              status: 'error',
              message: 'Offline download took too long. Check your connection and retry.',
            },
          });
          current.serviceWorker.dispatchEvent(event);
        } else {
          installing.state = 'redundant';
          installing.dispatchEvent(new Event('statechange'));
        }
        expect(current.controller.getSnapshot()).toMatchObject({
          offlineState: 'error',
          message: '',
          error: expect.stringMatching(/retry/i),
        });
        current.registration.active = active;
        const retry = current.controller.prepareOffline();
        expect(current.controller.getSnapshot()).toMatchObject({
          offlineState: 'preparing',
          error: '',
          message: 'Preparing offline app files…',
        });
        expect(await retry).toBe(true);
        expect(current.serviceWorker.register).toHaveBeenCalledTimes(2);
        expect(current.controller.getSnapshot().offlineState).toBe('ready');
        expect(current.controller.getSnapshot().error).toBe('');
      } finally {
        current.stop();
      }
    },
  );

  it('announces preparation without claiming that offline files are already ready', async () => {
    const current = fixture();
    try {
      await vi.waitFor(() => expect(current.controller.getSnapshot().updateState).toBe('waiting'));
      const prepared = current.controller.prepareOffline();
      expect(current.controller.getSnapshot()).toMatchObject({
        offlineState: 'preparing',
        message: 'Preparing offline app files…',
        error: '',
      });
      expect(await prepared).toBe(true);
    } finally {
      current.stop();
    }
  });

  it('uses actual browser/standalone signals, not platform guesses as an installation claim', () => {
    expect(pwaInstallAvailability(false, false, false)).toBe('unavailable');
    expect(pwaInstallAvailability(false, true, false)).toBe('ios-instructions');
    expect(pwaInstallAvailability(false, false, true)).toBe('prompt');
    expect(pwaInstallAvailability(true, true, false)).toBe('installed');
  });

  it('does not register or download on a first visit, and does nothing on the Data use bypass', async () => {
    const initial = fixture();
    try {
      await vi.waitFor(() => expect(initial.controller.getSnapshot().updateState).toBe('waiting'));
      expect(initial.serviceWorker.register).not.toHaveBeenCalled();
      expect(initial.registration.update).not.toHaveBeenCalled();
    } finally {
      initial.stop();
    }
    const dataUse = fixture('/data-use');
    try {
      expect(dataUse.serviceWorker.getRegistration).not.toHaveBeenCalled();
      expect(dataUse.serviceWorker.register).not.toHaveBeenCalled();
    } finally {
      dataUse.stop();
    }
  });

  it('uses a deferred install event once and waits for appinstalled before claiming installation', async () => {
    const current = fixture();
    const prompt = vi.fn(async () => {});
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    try {
      current.window.dispatchEvent(event);
      expect(current.controller.getSnapshot().installState).toBe('prompt');
      const installation = current.controller.install();
      expect(prompt).toHaveBeenCalledOnce();
      expect(current.controller.getSnapshot().installState).not.toBe('installed');
      expect(await installation).toBe('accepted');
      expect(await current.controller.install()).toBe('unavailable');
      expect(prompt).toHaveBeenCalledOnce();
      current.window.dispatchEvent(new Event('appinstalled'));
      expect(current.controller.getSnapshot().installState).toBe('installed');
    } finally {
      current.stop();
    }
  });

  it('rejects foreign, query-bearing or alternate worker URLs', () => {
    expect(trustedPwaWorker({ scriptURL: `${origin}/sw.js` }, origin)).toBe(true);
    for (const scriptURL of ['https://evil.test/sw.js', `${origin}/sw.js?token=one`, `${origin}/other.js`]) {
      expect(trustedPwaWorker({ scriptURL }, origin)).toBe(false);
    }
  });
});

describe('explicit update preserves edits and other tabs', () => {
  it('loads update execution only on request and blocks double clicks before the module resolves', async () => {
    const current = fixture();
    let currentGuard = true;
    const prepare = vi.fn(async () => true);
    const guard = { prepare, isCurrent: () => currentGuard, canReload: () => true };
    try {
      await vi.waitFor(() => expect(current.controller.getSnapshot().updateState).toBe('waiting'));
      expect(updateLoad.loads).toBe(0);
      updateLoad.hold = true;
      const operation = current.controller.applyUpdate(guard);
      await updateLoad.started;
      expect(prepare).not.toHaveBeenCalled();
      expect(await current.controller.applyUpdate(guard)).toBe(false);
      expect(current.waiting.calls).not.toContain('ACTIVATE');
      currentGuard = false;
      updateLoad.release();
      expect(await operation).toBe(false);
      expect(prepare).not.toHaveBeenCalled();
      expect(current.location.reload).not.toHaveBeenCalled();
      currentGuard = true;
      expect(await current.controller.applyUpdate(guard)).toBe(true);
      expect(prepare).toHaveBeenCalledOnce();
      expect(current.location.reload).toHaveBeenCalledOnce();
      expect(updateLoad.loads).toBe(1);
    } finally {
      updateLoad.hold = false;
      updateLoad.release();
      current.stop();
    }
  });

  it('does not activate or reload when a pending edit cannot save', async () => {
    const current = fixture();
    try {
      await vi.waitFor(() => expect(current.controller.getSnapshot().updateState).toBe('waiting'));
      expect(
        await current.controller.applyUpdate({
          prepare: async () => false,
          isCurrent: () => true,
          canReload: () => true,
        }),
      ).toBe(false);
      expect(current.waiting.calls).not.toContain('ACTIVATE');
      expect(current.location.reload).not.toHaveBeenCalled();
      expect(current.controller.getSnapshot().error).toMatch(/edit|save/i);
    } finally {
      current.stop();
    }
  });

  it('rechecks scope and non-autosaved form permission after the existing editor flush', async () => {
    let current = true;
    expect(
      await preparePwaUpdate({
        isCurrent: () => current,
        prepare: async () => {
          current = false;
          return true;
        },
        canReload: () => true,
      }),
    ).toBe(false);
    expect(await preparePwaUpdate({ prepare: async () => true, isCurrent: () => true, canReload: () => false })).toBe(
      false,
    );
    await expect(
      preparePwaUpdate({
        prepare: async () => {
          throw new Error('Rejected persistence');
        },
        isCurrent: () => true,
        canReload: () => true,
      }),
    ).rejects.toThrow('Rejected persistence');
  });

  it('reports the other-tab refusal without activation/reload and keeps the update waiting', async () => {
    const current = fixture();
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await vi.waitFor(() => expect(current.controller.getSnapshot().updateState).toBe('waiting'));
      current.waiting.accepts = false;
      expect(
        await current.controller.applyUpdate({
          prepare: async () => true,
          isCurrent: () => true,
          canReload: () => true,
        }),
      ).toBe(false);
      expect(current.location.reload).not.toHaveBeenCalled();
      expect(current.controller.getSnapshot()).toMatchObject({ updateState: 'waiting' });
      expect(current.controller.getSnapshot().error).toMatch(/other Play 100 tabs/);
      expect(report).toHaveBeenCalledOnce();
    } finally {
      current.stop();
      report.mockRestore();
    }
  });

  it('reloads only the requesting page after confirmed version change and final guards', async () => {
    const current = fixture();
    try {
      await vi.waitFor(() => expect(current.controller.getSnapshot().updateState).toBe('waiting'));
      expect(current.location.reload).not.toHaveBeenCalled();
      expect(
        await current.controller.applyUpdate({
          prepare: async () => true,
          isCurrent: () => true,
          canReload: () => true,
        }),
      ).toBe(true);
      expect(current.location.reload).toHaveBeenCalledOnce();
      expect(current.waiting.calls).toContain('ACTIVATE');
    } finally {
      current.stop();
    }
  });

  it('retains a fresh edit made after activation approval and supports later guarded reload', async () => {
    const current = fixture();
    let clean = true;
    const activate = current.waiting.activated;
    current.waiting.activated = () => {
      clean = false;
      activate();
    };
    try {
      await vi.waitFor(() => expect(current.controller.getSnapshot().updateState).toBe('waiting'));
      const guard = { prepare: async () => true, isCurrent: () => true, canReload: () => clean };
      expect(await current.controller.applyUpdate(guard)).toBe(false);
      expect(current.location.reload).not.toHaveBeenCalled();
      expect(current.controller.getSnapshot().updateState).toBe('reload-required');
      clean = true;
      expect(await current.controller.applyUpdate(guard)).toBe(true);
      expect(current.location.reload).toHaveBeenCalledOnce();
      expect(current.waiting.calls.filter((type) => type === 'ACTIVATE')).toHaveLength(1);
    } finally {
      current.stop();
    }
  });

  it('recovers a late activation without an ACK through STATUS, reconnection and a later guarded reload', async () => {
    const current = fixture();
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    let stopReconnected = () => {};
    try {
      await vi.waitFor(() => expect(current.controller.getSnapshot().updateState).toBe('waiting'));
      current.waiting.holdActivation = true;
      current.waiting.acknowledgeActivation = false;
      const requested = new Promise<void>((resolve) => {
        current.waiting.onActivationRequest = resolve;
      });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      current.window.setTimeout = globalThis.setTimeout;
      current.window.clearTimeout = globalThis.clearTimeout;
      const guard = { prepare: vi.fn(async () => true), isCurrent: () => true, canReload: () => true };
      const operation = current.controller.applyUpdate(guard);
      await requested;
      await vi.advanceTimersByTimeAsync(5001);
      expect(await operation).toBe(false);
      expect(current.location.reload).not.toHaveBeenCalled();
      expect(report).toHaveBeenCalledOnce();

      current.waiting.finishActivation?.();
      await current.controller.checkForUpdate();
      await vi.waitFor(() => expect(current.controller.getSnapshot().updateState).toBe('reload-required'));
      expect(current.location.reload).not.toHaveBeenCalled();
      current.stop();

      const reconnected = createPwaController();
      stopReconnected = reconnected.connect();
      await vi.waitFor(() => expect(reconnected.getSnapshot().updateState).toBe('reload-required'));
      expect(await reconnected.applyUpdate({ ...guard, canReload: () => false })).toBe(false);
      expect(await reconnected.applyUpdate({ ...guard, isCurrent: () => false })).toBe(false);
      expect(current.location.reload).not.toHaveBeenCalled();
      expect(await reconnected.applyUpdate(guard)).toBe(true);
      expect(current.location.reload).toHaveBeenCalledOnce();
      expect(current.waiting.calls.filter((type) => type === 'ACTIVATE')).toHaveLength(1);
    } finally {
      current.stop();
      stopReconnected();
      report.mockRestore();
    }
  });

  it('gives a retained document its guarded reload before applying another waiting version', async () => {
    const current = fixture();
    try {
      current.registration.active!.clientVersion = oldVersion;
      current.registration.active!.version = newVersion;
      current.waiting.version = 'c'.repeat(64);
      await current.controller.checkForUpdate();
      await vi.waitFor(() => expect(current.controller.getSnapshot().updateState).toBe('reload-required'));
      expect(
        await current.controller.applyUpdate({
          prepare: async () => false,
          isCurrent: () => true,
          canReload: () => true,
        }),
      ).toBe(false);
      expect(current.location.reload).not.toHaveBeenCalled();
      expect(
        await current.controller.applyUpdate({
          prepare: async () => true,
          isCurrent: () => true,
          canReload: () => true,
        }),
      ).toBe(true);
      expect(current.location.reload).toHaveBeenCalledOnce();
      expect(current.waiting.calls).not.toContain('ACTIVATE');
    } finally {
      current.stop();
    }
  });
});
