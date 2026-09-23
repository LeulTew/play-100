import { isConstrainedDevice } from './device-capabilities';

export function scheduleIdlePrefetch(load: () => Promise<unknown>): () => void {
  let canceled = false;
  let idle: number | undefined;
  let timer: number | undefined;
  const allowed = () => !canceled && !document.hidden && !isConstrainedDevice(navigator) &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const run = () => {
    idle = undefined;
    timer = undefined;
    if (!allowed()) return;
    void load().catch(() => {
      console.warn('Background page preloading failed. Opening the page will retry the normal load.');
    });
  };
  const schedule = () => {
    if (!allowed()) return;
    if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(run);
    else timer = window.setTimeout(run, 1200);
  };
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
  return () => {
    canceled = true;
    window.removeEventListener('load', schedule);
    if (idle !== undefined) window.cancelIdleCallback(idle);
    if (timer !== undefined) window.clearTimeout(timer);
  };
}
