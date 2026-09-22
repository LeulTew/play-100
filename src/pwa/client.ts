import type { BeforeInstallPromptEvent, PwaController, PwaState, PwaUpdateGuard } from './types';

const channel = 'play100-pwa-v1';
const versionPattern = /^[a-f0-9]{64}$/;

export const PWA_IOS_INSTRUCTIONS =
  'In Safari, open Share, then Add to Home Screen. Turn on Open as Web App if offered, then choose Add. This website cannot open that system dialog for you.';

export function pwaInstallAvailability(standalone: boolean, ios: boolean, hasPrompt: boolean): PwaState['installState'] {
  return standalone ? 'installed' : hasPrompt ? 'prompt' : ios ? 'ios-instructions' : 'unavailable';
}

export async function preparePwaUpdate(guard: PwaUpdateGuard): Promise<boolean> {
  return guard.isCurrent() && await guard.prepare() && guard.isCurrent() && guard.canReload();
}

function isInstallPrompt(event: Event): event is BeforeInstallPromptEvent {
  return 'prompt' in event && typeof event.prompt === 'function' && 'userChoice' in event &&
    event.userChoice instanceof Promise;
}

export function trustedPwaWorker(worker: Pick<ServiceWorker, 'scriptURL'> | null, origin: string): boolean {
  if (!worker) return false;
  try {
    const url = new URL(worker.scriptURL);
    return url.origin === origin && url.pathname === '/sw.js' && !url.search && !url.hash;
  } catch { return false; }
}

interface WorkerReply {
  version: string;
  clientVersion?: string;
  ready?: boolean;
  accepted?: boolean;
  reason?: string;
}

export function sendPwaRequest(worker: ServiceWorker, type: 'STATUS' | 'ACTIVATE', version?: string, previousVersion?: string): Promise<WorkerReply> {
  return new Promise((resolve, reject) => {
    const ports = new MessageChannel();
    const finish = () => { clearTimeout(timeout); ports.port1.close(); ports.port2.close(); };
    const timeout = window.setTimeout(() => { finish(); reject(new Error('The offline worker did not reply. Retry when it is available.')); }, 5000);
    ports.port1.onmessage = event => {
      const reply: unknown = event.data;
      if (!reply || typeof reply !== 'object' || !('channel' in reply) || reply.channel !== channel ||
        !('version' in reply) || typeof reply.version !== 'string' || !versionPattern.test(reply.version)) {
        finish(); reject(new Error('The offline worker returned an invalid version.')); return;
      }
      finish();
      resolve({
        version: reply.version,
        clientVersion: 'clientVersion' in reply && typeof reply.clientVersion === 'string' && versionPattern.test(reply.clientVersion)
          ? reply.clientVersion : undefined,
        ready: 'ready' in reply && reply.ready === true,
        accepted: 'accepted' in reply && reply.accepted === true,
        reason: 'reason' in reply && typeof reply.reason === 'string' ? reply.reason : undefined,
      });
    };
    try { worker.postMessage({ channel, type, version, previousVersion }, [ports.port2]); }
    catch (cause) { finish(); reject(cause); }
  });
}

export const initialPwaState: PwaState = {
  installState: 'unavailable', offlineState: 'idle', updateState: 'none',
  online: true, message: '', error: '',
};

export function createPwaController(): PwaController {
  let state = initialPwaState;
  let attached = false;
  let generation = 0;
  let deferred: BeforeInstallPromptEvent | null = null;
  let registration: ServiceWorkerRegistration | null = null;
  let removeRegistrationListeners = () => {};
  let stopConnection = () => {};
  let preparing: Promise<boolean> | null = null;
  let applying = false;
  let requestedVersion: string | null = null;
  let refreshRequest = 0;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<PwaState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const current = (start: number) => attached && generation === start;
  const report = (message: string, cause?: unknown) => {
    console.error(message, cause instanceof Error ? cause.message : '');
    if (attached) publish({ error: message });
  };
  const availablePage = () => window.isSecureContext && !/^\/(?:data-use|__|api)(?:\/|$)/.test(location.pathname);
  const ensureAvailable = () => {
    if (!attached || !window.isSecureContext || !('serviceWorker' in navigator) ||
      !availablePage()) {
      throw new Error('Offline access is unavailable in this page or browser.');
    }
  };
  const checkRegistration = (value: ServiceWorkerRegistration) => {
    const worker = value.installing ?? value.waiting ?? value.active;
    if (value.scope !== `${location.origin}/` || !trustedPwaWorker(worker, location.origin)) {
      throw new Error('A different offline worker controls this scope. Play 100 did not replace it.');
    }
  };
  const refresh = async (start: number) => {
    const request = ++refreshRequest;
    const worker = navigator.serviceWorker.controller ?? registration?.active;
    if (worker && trustedPwaWorker(worker, location.origin)) {
      const reply = await sendPwaRequest(worker, 'STATUS');
      if (!current(start) || request !== refreshRequest ||
        worker !== (navigator.serviceWorker.controller ?? registration?.active)) return;
      const retainedDocument = worker === navigator.serviceWorker.controller &&
        Boolean(reply.clientVersion && reply.clientVersion !== reply.version);
      if (reply.ready && retainedDocument) {
        requestedVersion = reply.version;
        publish({
          offlineState: 'ready', updateState: 'reload-required',
          message: 'An update is active, but this page still uses its previous version. Save your edits before choosing to reload.',
        });
        return;
      }
      if (!applying) requestedVersion = null;
      publish({
        offlineState: reply.ready ? 'ready' : 'error',
        ...(reply.ready && !navigator.serviceWorker.controller
          ? { message: 'Offline files are ready. Reopen The 100 or the installed app to use them offline.' } : {}),
      });
    }
    if (!current(start) || request !== refreshRequest || applying) return;
    if (registration?.waiting) publish({ updateState: 'waiting', message: 'An update is ready. Your current page stays open until you choose to update.' });
    else publish({ updateState: 'none' });
  };
  const observe = (value: ServiceWorkerRegistration, start: number) => {
    removeRegistrationListeners();
    registration = value;
    const releases: Array<() => void> = [];
    const watch = () => {
      const worker = value.installing;
      if (!worker) return;
      const change = () => {
        if (!current(start)) return;
        if (worker.state === 'redundant') {
          publish({ offlineState: 'error', error: 'Offline preparation failed. The current version was not replaced. Retry when connected.' });
        } else if (worker.state === 'installed') {
          if (value.waiting) publish({ updateState: 'waiting', message: 'An update is ready when you choose to apply it.' });
        } else if (worker.state === 'activated') {
          void refresh(start).catch(cause => report('Offline readiness could not be confirmed. Retry from Settings.', cause));
        }
      };
      worker.addEventListener('statechange', change);
      releases.push(() => worker.removeEventListener('statechange', change));
    };
    value.addEventListener('updatefound', watch);
    releases.push(() => value.removeEventListener('updatefound', watch));
    watch();
    removeRegistrationListeners = () => { for (const release of releases) release(); };
  };
  const controller: PwaController = {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    connect() {
      if (attached || !availablePage()) return () => {};
      attached = true;
      const start = ++generation;
      const media = window.matchMedia('(display-mode: standalone)');
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
      const standalone = () => media.matches || ('standalone' in navigator && navigator.standalone === true);
      let installedHere = false;
      const availability = () => publish({ installState: pwaInstallAvailability(installedHere || standalone(), ios, deferred !== null) });
      const prompt = (event: Event) => {
        if (!isInstallPrompt(event)) return;
        event.preventDefault();
        deferred = event;
        availability();
      };
      const installed = () => { installedHere = true; deferred = null; publish({ installState: 'installed', message: 'Play 100 was added by this browser.' }); };
      const checkExisting = () => {
        if (registration && current(start)) {
          void refresh(start).catch(cause => report('The active offline page version could not be checked. Your page was not reloaded.', cause));
        }
      };
      const online = () => {
        publish({ online: navigator.onLine });
        if (navigator.onLine) checkExisting();
      };
      const message = (event: MessageEvent) => {
        const expected = [navigator.serviceWorker.controller, registration?.active, registration?.installing, registration?.waiting];
        if (!expected.some(worker => worker && event.source === worker)) return;
        const data: unknown = event.data;
        if (!data || typeof data !== 'object' || !('channel' in data) || data.channel !== channel ||
          !('version' in data) || typeof data.version !== 'string' || !versionPattern.test(data.version) ||
          !('status' in data)) return;
        if (data.status === 'error') publish({ offlineState: 'error', error: 'Offline preparation or storage failed. Reconnect, free storage if needed, and retry.' });
        if (data.status === 'warning') publish({ message: 'Some public artwork could not be saved offline. Your library is unchanged.' });
      };
      window.addEventListener('beforeinstallprompt', prompt);
      window.addEventListener('appinstalled', installed);
      window.addEventListener('online', online);
      window.addEventListener('offline', online);
      media.addEventListener('change', availability);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', message);
        navigator.serviceWorker.addEventListener('controllerchange', checkExisting);
        void navigator.serviceWorker.getRegistration('/').then(value => {
          if (!value || !current(start)) return;
          checkRegistration(value);
          observe(value, start);
          return refresh(start);
        }).catch(cause => report('Existing offline access could not be checked. Your library is unchanged.', cause));
      }
      availability();
      online();
      stopConnection = () => {
        if (!current(start)) return;
        attached = false; generation += 1; deferred = null;
        removeRegistrationListeners();
        window.removeEventListener('beforeinstallprompt', prompt);
        window.removeEventListener('appinstalled', installed);
        window.removeEventListener('online', online);
        window.removeEventListener('offline', online);
        media.removeEventListener('change', availability);
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.removeEventListener('message', message);
          navigator.serviceWorker.removeEventListener('controllerchange', checkExisting);
        }
      };
      return stopConnection;
    },
    async install() {
      if (!attached || !deferred) {
        if (state.installState === 'ios-instructions') { publish({ message: PWA_IOS_INSTRUCTIONS }); return 'instructions'; }
        return 'unavailable';
      }
      const prompt = deferred;
      deferred = null;
      publish({ installState: 'unavailable', error: '' });
      try {
        // Nothing awaited before prompt(): it must retain this click's user activation.
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === 'accepted' && attached) {
          publish({ message: 'Installation accepted. The browser will finish adding Play 100.' });
          void controller.prepareOffline();
        }
        return choice.outcome;
      } catch (cause) {
        report('The browser could not open installation. Use its install or share menu if available.', cause);
        return 'unavailable';
      }
    },
    prepareOffline() {
      if (preparing) return preparing;
      const start = generation;
      const task = (async () => {
        try {
          ensureAvailable();
          publish({ offlineState: 'preparing', message: 'Preparing the bounded public files for offline use...', error: '' });
          const existing = await navigator.serviceWorker.getRegistration('/');
          if (existing) checkRegistration(existing);
          if (!current(start)) return false;
          const value = await navigator.serviceWorker.register('/sw.js', { scope: '/', type: 'module', updateViaCache: 'none' });
          if (!current(start)) return false;
          checkRegistration(value);
          observe(value, start);
          if (value.active) await refresh(start);
          return true;
        } catch (cause) {
          if (current(start)) publish({ offlineState: 'error' });
          report('Offline preparation could not start. Check the connection or available storage, then retry.', cause);
          return false;
        }
      })();
      preparing = task;
      void task.finally(() => { if (preparing === task) preparing = null; });
      return task;
    },
    async checkForUpdate() {
      try {
        ensureAvailable();
        if (!registration) { publish({ message: 'Enable offline access before checking its updates.' }); return; }
        await registration.update();
        await refresh(generation);
      } catch (cause) { report('An update could not be checked. Your current page remains available.', cause); }
    },
    async applyUpdate(guard: PwaUpdateGuard) {
      if (applying) return false;
      const start = generation;
      const reloadOnly = state.updateState === 'reload-required' && requestedVersion !== null;
      const waiting = reloadOnly ? navigator.serviceWorker.controller : registration?.waiting;
      if (!attached || !waiting || !trustedPwaWorker(waiting, location.origin)) {
        publish({ error: 'No trusted update is waiting. Check again when connected.' });
        return false;
      }
      applying = true;
      try {
        const { executePwaUpdate } = await import('./apply-update');
        return await executePwaUpdate(waiting, reloadOnly, guard, {
          isCurrent: () => current(start),
          waiting: () => registration?.waiting ?? null,
          requestedVersion: () => requestedVersion,
          rememberVersion: version => { requestedVersion = version; },
          publish, report,
        });
      } catch (cause) {
        publish({ updateState: requestedVersion ? 'reload-required' : registration?.waiting ? 'waiting' : 'none' });
        report('The update controls could not load. Your page was not reloaded. Reconnect and retry.', cause);
        return false;
      } finally { applying = false; }
    },
  };
  return controller;
}
