import { createRetryableModule } from '../lib/retryable-module';
import { scheduleIdlePrefetch } from '../lib/idle-prefetch';
import { guardedReload, isModuleLoadFailure, offlineRecoveryMessage, unavailableRecoveryMessage } from '../lib/chunk-recovery';
import type { PwaController, PwaState } from './types';

export const initialDeferredPwaState: PwaState = {
  installState: 'unavailable',
  offlineState: 'idle',
  updateState: 'none',
  online: true,
  message: '',
  error: '',
};

export const pwaClientModule = createRetryableModule(() => import('./client-entry'));

interface DeferredPwaController extends PwaController {
  isConnected(): boolean;
  connectNow(): void;
}

export function createDeferredPwaController(
  loadClient = pwaClientModule.load,
): DeferredPwaController {
  let state = initialDeferredPwaState;
  let controller: PwaController | null = null;
  let active = false;
  let generation = 0;
  let pending: Promise<PwaController | null> | null = null;
  let recovering = false;
  let prompt: Event | null = null;
  let installed = false;
  let disconnect: (() => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  let stopIdle: (() => void) | undefined;
  let media: MediaQueryList | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: PwaState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const capturePrompt = (event: Event) => {
    if (!('prompt' in event) || typeof event.prompt !== 'function' ||
      !('userChoice' in event) || !(event.userChoice instanceof Promise)) return;
    event.preventDefault();
    prompt = event;
  };
  const availability = () => {
    const standalone = installed || media?.matches || ('standalone' in navigator && navigator.standalone === true);
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
    publish({ ...state, installState: standalone ? 'installed' : ios ? 'ios-instructions' : 'unavailable' });
  };
  const captureInstalled = () => {
    installed = true; prompt = null;
    publish({ ...state, installState: 'installed', message: 'Play 100 was added by this browser.' });
  };
  const online = () => {
    publish({ ...state, online: navigator.onLine });
    if (!navigator.onLine) void ensure();
  };
  const stopCapture = () => {
    window.removeEventListener('beforeinstallprompt', capturePrompt);
    window.removeEventListener('appinstalled', captureInstalled);
    window.removeEventListener('online', online);
    window.removeEventListener('offline', online);
    media?.removeEventListener('change', availability);
  };
  const ensure = (): Promise<PwaController | null> => {
    if (controller) return Promise.resolve(controller);
    if (pending) return pending;
    if (!active || state.moduleError) return Promise.resolve(null);
    const request = generation;
    const operation = Promise.resolve().then(loadClient).then(module => {
      if (!active || generation !== request) return null;
      const next = module.createPwaController();
      controller = next;
      unsubscribe = next.subscribe(() => publish(next.getSnapshot()));
      disconnect = next.connect();
      stopCapture();
      // Replay the original browser event, retaining its prompt() method.
      if (prompt) {
        const saved = prompt;
        prompt = null;
        window.dispatchEvent(saved);
      }
      if (installed) window.dispatchEvent(new Event('appinstalled'));
      publish(next.getSnapshot());
      return next;
    }).catch(error => {
      console.error('Offline controls could not load.', error instanceof Error ? error.message : 'Unknown module error.');
      if (active && generation === request) {
        const moduleError = isModuleLoadFailure(error);
        if (moduleError) {
          stopCapture(); stopIdle?.();
          prompt = null; media = undefined; stopIdle = undefined;
        }
        publish({ ...state, moduleError, error: "Offline controls didn't load." });
      }
      return null;
    }).finally(() => { if (pending === operation) pending = null; });
    pending = operation;
    return operation;
  };
  return {
    isConnected: () => controller !== null,
    connectNow: () => { void ensure(); },
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    connect() {
      if (active || !window.isSecureContext || /^\/(?:data-use|__|api)(?:\/|$)/.test(location.pathname)) return () => {};
      active = true;
      generation += 1;
      publish({ ...initialDeferredPwaState, online: navigator.onLine });
      media = window.matchMedia('(display-mode: standalone)');
      media.addEventListener('change', availability);
      availability();
      window.addEventListener('beforeinstallprompt', capturePrompt);
      window.addEventListener('appinstalled', captureInstalled);
      window.addEventListener('online', online);
      window.addEventListener('offline', online);
      stopIdle = scheduleIdlePrefetch(ensure, 1200, 'essential');
      if (!navigator.onLine) void ensure();
      return () => {
        active = false;
        generation += 1;
        stopIdle?.();
        stopCapture();
        unsubscribe?.();
        disconnect?.();
        unsubscribe = disconnect = undefined;
        controller = null;
        pending = null;
        prompt = null;
        installed = false;
      };
    },
    install() {
      // Do not insert an await before the existing controller's prompt().
      if (controller) return controller.install();
      publish({ ...state, message: 'Install controls are loading. Choose Install again when your browser offers it.' });
      void ensure();
      return Promise.resolve('unavailable');
    },
    async prepareOffline() {
      const request = generation;
      const next = await ensure();
      return active && generation === request && next ? next.prepareOffline() : false;
    },
    async checkForUpdate() {
      const request = generation;
      const next = await ensure();
      if (active && generation === request) await next?.checkForUpdate();
    },
    async applyUpdate(guard) {
      const request = generation;
      if (!guard.isCurrent()) return false;
      if (!controller && state.moduleError) {
        if (recovering) return false;
        recovering = true;
        const current = () => active && generation === request && guard.isCurrent() && guard.canReload();
        try {
          if (!await guard.prepare() || !current()) {
            if (active && generation === request) publish({ ...state, message: 'Your edit or page changed. Save or correct it before reloading.' });
            return false;
          }
          publish({ ...state, message: 'Checking your connection…' });
          const result = await guardedReload({ isCurrent: current });
          if (active && generation === request) publish({ ...state, message: result === 'offline' ? offlineRecoveryMessage : result === 'unavailable' ? unavailableRecoveryMessage : '' });
          return result === 'navigating';
        } catch (error) {
          console.error('Offline controls recovery could not finish.', error);
          if (active && generation === request) publish({ ...state, message: 'This page could not reload. Save your changes before reloading when connected.' });
          return false;
        } finally { recovering = false; }
      }
      const next = await ensure();
      return next && active && generation === request && guard.isCurrent() ? next.applyUpdate(guard) : false;
    },
  };
}
