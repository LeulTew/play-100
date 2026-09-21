import { describe, expect, it, vi } from 'vitest';
import { createMotionRuntime } from './runtime';
import type { MotionEnvironment } from './runtime';
import type { MotionCancelReason, MotionSnapshot } from './types';

function fixture(animate = true) {
  let snapshot: MotionSnapshot = {
    policy: { animate, reducedMotion: false, coarsePointer: false, hidden: false, constrained: false },
    boundary: { scopeKey: 'guest', generation: 0, blocked: false },
    location: { viewKey: '/', requestedDetailKey: null, displayedDetailKey: null, navigationGeneration: 0, overlayKey: null },
  };
  let listener: ((reason: MotionCancelReason) => void) | null = null;
  const release = vi.fn();
  const environment: MotionEnvironment = {
    supported: vi.fn(() => true),
    hidden: () => snapshot.policy.hidden,
    now: () => 0,
    subscribe: vi.fn(next => {
      listener = next;
      return () => { listener = null; release(); };
    }),
  };
  const runtime = createMotionRuntime(() => snapshot, () => null, environment);
  runtime.mount();
  return {
    runtime, environment, release,
    emit(reason: MotionCancelReason) { listener?.(reason); },
    update(change: (current: MotionSnapshot) => MotionSnapshot) { snapshot = change(snapshot); runtime.update(); },
  };
}

describe('bounded optional motion sessions', () => {
  it('does no feature probing, subscription or session setup when animation is disabled', () => {
    const { runtime, environment } = fixture(false);
    expect(runtime.startMotionSession({ channel: 'route' })).toBeNull();
    expect(environment.supported).not.toHaveBeenCalled();
    expect(environment.subscribe).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('does not subscribe a rejected guard', () => {
    const { runtime, environment } = fixture();
    const subscribe = vi.fn(() => vi.fn());
    expect(runtime.startMotionSession({ channel: 'route', guard: { isCurrent: () => false, subscribe } })).toBeNull();
    expect(subscribe).not.toHaveBeenCalled();
    expect(environment.subscribe).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it('cancels only the superseded handle, never a newer session from an old cleanup', () => {
    const { runtime, environment, release } = fixture();
    const oldCleanup = vi.fn();
    const newCleanup = vi.fn();
    const old = runtime.startMotionSession({ channel: 'route' });
    old?.addCleanup(oldCleanup);
    const next = runtime.startMotionSession({ channel: 'route' });
    next?.addCleanup(newCleanup);
    expect(old?.signal.aborted).toBe(true);
    expect(oldCleanup).toHaveBeenCalledTimes(1);
    old?.cancel();
    old?.finish();
    expect(next?.isCurrent()).toBe(true);
    expect(newCleanup).not.toHaveBeenCalled();
    expect(environment.subscribe).toHaveBeenCalledTimes(2);
    next?.finish();
    next?.cancel();
    expect(newCleanup).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(2);
    runtime.dispose();
  });

  it('keeps active essential input interruptions available with optional animation off', () => {
    const { runtime, emit, update, environment, release } = fixture(false);
    const interrupted = vi.fn();
    const unsubscribe = runtime.subscribeInterrupt(interrupted);
    expect(environment.subscribe).toHaveBeenCalledTimes(1);
    emit('resize');
    emit('navigation');
    update(current => ({ ...current, boundary: { ...current.boundary, generation: 1 } }));
    expect(interrupted.mock.calls.map(([reason]) => reason)).toEqual(['resize', 'navigation', 'scope']);
    expect(runtime.startMotionSession({ channel: 'drag-settle' })).toBeNull();
    unsubscribe();
    expect(release).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });

  it.each(['resize', 'scroll', 'hidden', 'modal', 'drag', 'authority'] as const)(
    'cleans up every active channel on %s without retaining event listeners',
    reason => {
      const { runtime, emit, release } = fixture();
      const clean = vi.fn();
      const first = runtime.startMotionSession({ channel: 'route' });
      const second = runtime.startMotionSession({ channel: 'drag-settle' });
      first?.addCleanup(clean);
      second?.addCleanup(clean);
      emit(reason);
      expect(first?.signal.aborted).toBe(true);
      expect(second?.signal.aborted).toBe(true);
      expect(clean).toHaveBeenCalledTimes(2);
      expect(release).toHaveBeenCalledTimes(1);
      runtime.dispose();
    },
  );

  it('cancels live policy changes and never replays on re-enable', () => {
    const { runtime, update, environment } = fixture();
    const session = runtime.startMotionSession({ channel: 'route' });
    update(current => ({ ...current, policy: { ...current.policy, animate: false, reducedMotion: true } }));
    expect(session?.signal.aborted).toBe(true);
    expect(runtime.startMotionSession({ channel: 'route' })).toBeNull();
    update(current => ({ ...current, policy: { ...current.policy, animate: true, reducedMotion: false } }));
    expect(environment.subscribe).toHaveBeenCalledTimes(1);
    expect(session?.isCurrent()).toBe(false);
    runtime.dispose();
  });

  it('listens to an active authority and releases the exact subscription once', () => {
    const { runtime } = fixture();
    let permitted = true;
    let changed: (() => void) | undefined;
    const unsubscribe = vi.fn();
    const session = runtime.startMotionSession({
      channel: 'route',
      guard: { isCurrent: () => permitted, subscribe: listener => { changed = listener; return unsubscribe; } },
    });
    permitted = false;
    changed?.();
    expect(session?.signal.aborted).toBe(true);
    expect(session?.signal.reason).toBe('authority');
    session?.cancel();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });

  it('invalidates scope boundaries before any new optional session can start', () => {
    const { runtime, update } = fixture();
    const session = runtime.startMotionSession({ channel: 'route' });
    update(current => ({ ...current, boundary: { scopeKey: 'account:fixture:two', generation: 1, blocked: true } }));
    expect(session?.isCurrent()).toBe(false);
    expect(session?.signal.aborted).toBe(true);
    expect(runtime.startMotionSession({ channel: 'route' })).toBeNull();
    runtime.dispose();
  });

  it('reports a failed authority subscription and releases the abandoned session', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { runtime, environment } = fixture();
    try {
      expect(runtime.startMotionSession({
        channel: 'route',
        guard: { isCurrent: () => true, subscribe: () => { throw new Error('Synthetic subscription failure.'); } },
      })).toBeNull();
      expect(report).toHaveBeenCalledOnce();
      expect(environment.subscribe).not.toHaveBeenCalled();
    } finally {
      runtime.dispose();
      report.mockRestore();
    }
  });

  it('supports StrictMode-style provider disposal and reattachment without reviving handles', () => {
    const { runtime, release } = fixture();
    const session = runtime.startMotionSession({ channel: 'route' });
    runtime.dispose();
    runtime.dispose();
    expect(release).toHaveBeenCalledTimes(1);
    runtime.mount();
    expect(session?.isCurrent()).toBe(false);
    const next = runtime.startMotionSession({ channel: 'route' });
    expect(next?.isCurrent()).toBe(true);
    runtime.dispose();
  });
});
