import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isConstrainedDevice } from './device-capabilities';
import type { DeviceHints } from './device-capabilities';
import { scheduleIdlePrefetch } from './idle-prefetch';

const hints: DeviceHints = {};
const documentState = { hidden: false, readyState: 'complete' };
let reducedMotion = false;
let events: EventTarget;
let idle: (() => void) | undefined;
const requestIdle = vi.fn((callback: () => void) => {
  idle = callback;
  return 1;
});
const cancelIdle = vi.fn(() => {
  idle = undefined;
});

beforeEach(() => {
  vi.useFakeTimers();
  events = new EventTarget();
  idle = undefined;
  reducedMotion = false;
  Object.assign(hints, { connection: undefined, deviceMemory: undefined, hardwareConcurrency: 8 });
  Object.assign(documentState, { hidden: false, readyState: 'complete' });
  vi.stubGlobal('navigator', hints);
  vi.stubGlobal('document', documentState);
  vi.stubGlobal('window', {
    requestIdleCallback: requestIdle,
    cancelIdleCallback: cancelIdle,
    matchMedia: () => ({ matches: reducedMotion }),
    setTimeout,
    clearTimeout,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('background-only module prefetch', () => {
  it.each([
    {},
    { connection: { saveData: false, effectiveType: '3g' } },
    { deviceMemory: 8, hardwareConcurrency: 3 },
    { hardwareConcurrency: 0 },
  ])('preserves unconstrained and unavailable-hint boundaries %j', (capable) => {
    expect(isConstrainedDevice(capable)).toBe(false);
  });

  it.each(['hidden', 'reduced motion'])('does not schedule while initially %s', (policy) => {
    documentState.hidden = policy === 'hidden';
    reducedMotion = policy === 'reduced motion';
    const load = vi.fn().mockResolvedValue({});
    const cancel = scheduleIdlePrefetch(load);
    expect(requestIdle).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    cancel();
  });

  it.each([
    { connection: { saveData: true } },
    { connection: { effectiveType: '2g' } },
    { connection: { effectiveType: 'slow-2g' } },
    { deviceMemory: 4 },
    { hardwareConcurrency: 2 },
  ])('does not schedule or load for constrained hints %j', (constrained) => {
    Object.assign(hints, constrained);
    const load = vi.fn().mockResolvedValue({});
    const cancel = scheduleIdlePrefetch(load);
    expect(isConstrainedDevice(hints)).toBe(true);
    expect(requestIdle).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    cancel();
  });

  it('waits for document load then idle without a forced timeout on capable devices', async () => {
    documentState.readyState = 'loading';
    const load = vi.fn().mockResolvedValue({});
    const cancel = scheduleIdlePrefetch(load);
    expect(requestIdle).not.toHaveBeenCalled();
    events.dispatchEvent(new Event('load'));
    expect(requestIdle).toHaveBeenCalledWith(expect.any(Function));
    expect(load).not.toHaveBeenCalled();
    idle?.();
    await Promise.resolve();
    expect(load).toHaveBeenCalledOnce();
    cancel();
  });

  it('rechecks live data-saving, reduced motion and visibility before starting the import', () => {
    const load = vi.fn().mockResolvedValue({});
    const cancel = scheduleIdlePrefetch(load);
    hints.connection = { saveData: true };
    idle?.();
    expect(load).not.toHaveBeenCalled();
    cancel();
    hints.connection = undefined;
    const stop = scheduleIdlePrefetch(load);
    documentState.hidden = true;
    idle?.();
    expect(load).not.toHaveBeenCalled();
    stop();
    documentState.hidden = false;
    const finish = scheduleIdlePrefetch(load);
    reducedMotion = true;
    idle?.();
    expect(load).not.toHaveBeenCalled();
    finish();
  });

  it('passes an explicit timeout without bypassing live policy checks', () => {
    const load = vi.fn().mockResolvedValue({});
    const cancel = scheduleIdlePrefetch(load, 1200);
    expect(requestIdle).toHaveBeenCalledWith(expect.any(Function), { timeout: 1200 });
    hints.connection = { saveData: true };
    idle?.();
    expect(load).not.toHaveBeenCalled();
    cancel();
  });

  it('warms Menu intent only after a paint and idle, even on low-memory/2g devices, but never Save-Data', () => {
    let frame: FrameRequestCallback | undefined;
    Object.assign(window, {
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        frame = callback;
        return 1;
      }),
      cancelAnimationFrame: vi.fn(),
    });
    hints.deviceMemory = 2;
    hints.connection = { effectiveType: '2g' };
    reducedMotion = true;
    const load = vi.fn().mockResolvedValue({});
    const stop = scheduleIdlePrefetch(load, 150, 'intent');
    expect(requestIdle).not.toHaveBeenCalled();
    frame?.(1);
    expect(requestIdle).not.toHaveBeenCalled();
    frame?.(2);
    expect(requestIdle).toHaveBeenCalledWith(expect.any(Function), { timeout: 150 });
    idle?.();
    expect(load).toHaveBeenCalledOnce();
    stop();
    load.mockClear();
    hints.connection.saveData = true;
    const cancel = scheduleIdlePrefetch(load, 150, 'intent');
    frame?.(3);
    idle?.();
    expect(load).not.toHaveBeenCalled();
    cancel();
  });

  it('cancels pending load/idle callbacks and stale invocations cannot import', () => {
    const load = vi.fn().mockResolvedValue({});
    const cancel = scheduleIdlePrefetch(load);
    const stale = idle;
    cancel();
    expect(cancelIdle).toHaveBeenCalledWith(1);
    stale?.();
    expect(load).not.toHaveBeenCalled();
    documentState.readyState = 'loading';
    const stop = scheduleIdlePrefetch(load);
    stop();
    events.dispatchEvent(new Event('load'));
    expect(requestIdle).toHaveBeenCalledOnce();
  });

  it('schedules essential PWA connection on all device classes, but still only after load/idle', () => {
    hints.connection = { saveData: true, effectiveType: '2g' };
    hints.deviceMemory = 1;
    documentState.hidden = true;
    documentState.readyState = 'loading';
    reducedMotion = true;
    const load = vi.fn().mockResolvedValue({});
    const stop = scheduleIdlePrefetch(load, 1200, 'essential');
    expect(requestIdle).not.toHaveBeenCalled();
    events.dispatchEvent(new Event('load'));
    expect(requestIdle).toHaveBeenCalledWith(expect.any(Function), { timeout: 1200 });
    expect(load).not.toHaveBeenCalled();
    idle?.();
    expect(load).toHaveBeenCalledOnce();
    stop();
  });

  it('uses a cancelable delayed fallback only when idle callbacks are unavailable', async () => {
    Reflect.deleteProperty(window, 'requestIdleCallback');
    const load = vi.fn().mockResolvedValue({});
    const cancel = scheduleIdlePrefetch(load);
    await vi.advanceTimersByTimeAsync(1199);
    expect(load).not.toHaveBeenCalled();
    cancel();
    await vi.advanceTimersByTimeAsync(1);
    expect(load).not.toHaveBeenCalled();
    const stop = scheduleIdlePrefetch(load);
    await vi.advanceTimersByTimeAsync(1200);
    expect(load).toHaveBeenCalledOnce();
    stop();
  });

  it('does not resurrect a canceled lifetime when a later eligible lifetime starts', () => {
    const oldLoad = vi.fn().mockResolvedValue({});
    const cancel = scheduleIdlePrefetch(oldLoad);
    const stale = idle;
    cancel();
    const newLoad = vi.fn().mockResolvedValue({});
    const stop = scheduleIdlePrefetch(newLoad);
    stale?.();
    expect(oldLoad).not.toHaveBeenCalled();
    expect(newLoad).not.toHaveBeenCalled();
    idle?.();
    expect(newLoad).toHaveBeenCalledOnce();
    stop();
  });

  it('reports failed speculation without swallowing the normal load failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const load = vi.fn().mockRejectedValue(new Error('Module unavailable'));
    const cancel = scheduleIdlePrefetch(load);
    idle?.();
    await Promise.resolve();
    expect(warn).toHaveBeenCalledOnce();
    await expect(load()).rejects.toThrow('Module unavailable');
    cancel();
  });
});
