import { isConstrainedDevice, prefersLightData } from './device-capabilities';
import type { DeviceHints } from './device-capabilities';

/**
 * Runs `load` once the page has loaded and gone idle, if its mode still allows it then:
 * - `background`: not on a hidden page, with reduced motion, or on a constrained device;
 * - `navigation`, a likely next page: as `background`, except that only Save-Data or 2G rules a device out, since
 *   waiting for that page later costs a slow device most; and not offline, since a failed module load stays failed
 *   until a reload;
 * - `intent`, after a paint: not on a hidden page or with Save-Data;
 * - `essential`: always.
 */
export function scheduleIdlePrefetch(
  load: () => Promise<unknown>,
  timeout?: number,
  mode: 'background' | 'navigation' | 'intent' | 'essential' = 'background',
): () => void {
  let canceled = false;
  let idle: number | undefined;
  let timer: number | undefined;
  let frame: number | undefined;
  const permitted = () => {
    if (mode === 'essential') return true;
    if (document.hidden) return false;
    if (mode === 'intent') return !(navigator as DeviceHints).connection?.saveData;
    if (mode === 'navigation' && (navigator as { onLine?: boolean }).onLine === false) return false;
    const light = mode === 'navigation' ? prefersLightData(navigator) : isConstrainedDevice(navigator);
    return !light && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };
  const allowed = () => !canceled && permitted();
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
    } else timer = window.setTimeout(run, timeout ?? 1200);
  };
  const afterLoad = () => {
    if (!allowed()) return;
    if (mode === 'intent') {
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => {
          frame = undefined;
          schedule();
        });
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
