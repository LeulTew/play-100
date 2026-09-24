import { preparePwaUpdate, sendPwaRequest, trustedPwaWorker } from './client';
import type { PwaState, PwaUpdateGuard } from './types';

interface PwaUpdateAccess {
  isCurrent(): boolean;
  waiting(): ServiceWorker | null;
  requestedVersion(): string | null;
  rememberVersion(version: string): void;
  publish(patch: Partial<PwaState>): void;
  report(message: string, cause?: unknown): void;
}

export async function executePwaUpdate(
  worker: ServiceWorker,
  reloadOnly: boolean,
  guard: PwaUpdateGuard,
  access: PwaUpdateAccess,
): Promise<boolean> {
  let stopWaiting = () => {};
  try {
    if (!access.isCurrent() || !guard.isCurrent()) {
      access.publish({ error: 'Your edit or page changed. Keep editing, or correct the failed save before updating.' });
      return false;
    }
    if (reloadOnly ? navigator.serviceWorker.controller !== worker : access.waiting() !== worker) {
      throw new Error('The waiting update or current edit changed. Review it again.');
    }
    if (!(await preparePwaUpdate(guard)) || !access.isCurrent()) {
      access.publish({ error: 'Your edit or page changed. Keep editing, or correct the failed save before updating.' });
      return false;
    }
    const status = await sendPwaRequest(worker, 'STATUS');
    if (
      !status.ready ||
      (reloadOnly
        ? status.version !== access.requestedVersion() || navigator.serviceWorker.controller !== worker
        : access.waiting() !== worker) ||
      !guard.isCurrent() ||
      !guard.canReload() ||
      !access.isCurrent()
    ) {
      throw new Error('The waiting update or current edit changed. Review it again.');
    }
    if (reloadOnly) {
      location.reload();
      return true;
    }
    const priorController = navigator.serviceWorker.controller;
    if (!priorController || !trustedPwaWorker(priorController, location.origin)) {
      throw new Error('Reopen The 100 before applying an offline update. This page has not changed.');
    }
    const prior = await sendPwaRequest(priorController, 'STATUS');
    if (
      !prior.ready ||
      !prior.clientVersion ||
      navigator.serviceWorker.controller !== priorController ||
      access.waiting() !== worker ||
      !access.isCurrent() ||
      !guard.isCurrent() ||
      !guard.canReload()
    ) {
      throw new Error('This page version or edit could not be confirmed. Reopen The 100 after saving your work.');
    }
    if (prior.clientVersion !== prior.version) {
      // An earlier approved update retained this older page's data version.
      location.reload();
      return true;
    }
    access.publish({ updateState: 'applying', error: '', message: 'Applying the requested update…' });
    const changed = new Promise<boolean>((resolve) => {
      const done = (value: boolean) => {
        clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener('controllerchange', change);
        resolve(value);
      };
      const change = () => done(true);
      const timeout = window.setTimeout(() => done(false), 10000);
      stopWaiting = () => done(false);
      navigator.serviceWorker.addEventListener('controllerchange', change);
    });
    const result = await sendPwaRequest(worker, 'ACTIVATE', status.version, prior.version);
    if (!result.accepted || result.version !== status.version) {
      throw new Error(
        result.reason === 'other-tabs'
          ? 'Close other Play 100 tabs or windows before updating. No tab was reloaded.'
          : 'The update is not ready. The working version was kept.',
      );
    }
    access.rememberVersion(result.version);
    if (!(await changed)) throw new Error('The updated worker did not take control. Your page was not reloaded.');
    const active = navigator.serviceWorker.controller;
    if (!active || !trustedPwaWorker(active, location.origin))
      throw new Error('The new controller could not be verified.');
    const activated = await sendPwaRequest(active, 'STATUS');
    if (activated.version !== status.version || !activated.ready)
      throw new Error('The active update version did not match.');
    if (!access.isCurrent() || !guard.isCurrent() || !guard.canReload()) {
      access.publish({
        updateState: 'reload-required',
        message: 'The update is ready, but this page changed. Finish or save your edit before reloading.',
      });
      return false;
    }
    location.reload();
    return true;
  } catch (cause) {
    access.publish({
      updateState: access.requestedVersion() ? 'reload-required' : access.waiting() ? 'waiting' : 'none',
    });
    access.report(
      cause instanceof Error ? cause.message : 'The requested update failed. Your page was not reloaded.',
      cause,
    );
    return false;
  } finally {
    stopWaiting();
  }
}
