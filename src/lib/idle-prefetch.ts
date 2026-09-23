import { isConstrainedDevice } from './device-capabilities';
import type { DeviceHints } from './device-capabilities';

export function scheduleIdlePrefetch(
  load: () => Promise<unknown>, timeout?: number, mode: 'background' | 'intent' = 'background',
): () => void {
  let canceled = false;
  let idle: number | undefined;
  let timer: number | undefined;
  let frame: number | undefined;
  const allowed = () => !canceled && !document.hidden && (
    mode === 'intent' ? !(navigator as DeviceHints).connection?.saveData :
      !isConstrainedDevice(navigator) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const run = () => {
    idle = undefined;
    timer = undefined;
    if (!allowed()) return;
    void load().catch(() => {
      console.warn('Background page preloading failed. Explicit use will offer reload recovery.');
    });
  };
  const schedule = () => {
    if (!allowed()) return;
    if (typeof window.requestIdleCallback === 'function') {
      idle = timeout === undefined ? window.requestIdleCallback(run) : window.requestIdleCallback(run, { timeout });
    }
    else timer = window.setTimeout(run, timeout ?? 1200);
  };
  const afterLoad = () => {
    if (!allowed()) return;
    if (mode === 'intent') {
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => { frame = undefined; schedule(); });
      });
    } else schedule();
  };
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });
  return () => {
    canceled = true;
    window.removeEventListener('load', afterLoad);
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    if (idle !== undefined) window.cancelIdleCallback(idle);
    if (timer !== undefined) window.clearTimeout(timer);
  };
}
