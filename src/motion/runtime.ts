import {
  copyPublicMotionVisual, createPublicMotionElement, fitMotionVisual, MOTION_EASING,
  MOTION_ORIGIN_TTL, MOTION_TIMINGS, motionTransform, visibleMotionRect,
} from './public-visual';
import type { MotionRect } from './public-visual';
import { originHintBrand, originLeaseBrand } from './types';
import type {
  MotionBoundary, MotionCancelReason, MotionChannel, MotionController, MotionGuard,
  MotionOriginHint, MotionOriginLease, MotionSession, MotionSnapshot, PublicMotionVisual,
} from './types';

export interface MotionEnvironment {
  supported(): boolean;
  hidden(): boolean;
  now(): number;
  subscribe(listener: (reason: MotionCancelReason) => void): () => void;
}

const browserEnvironment: MotionEnvironment = {
  supported: () => typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function',
  hidden: () => typeof document !== 'undefined' && document.hidden,
  now: () => performance.now(),
  subscribe(listener) {
    const hidden = () => { if (document.hidden) listener('hidden'); };
    const resize = () => listener('resize');
    const scroll = () => listener('scroll');
    const navigation = () => listener('navigation');
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('popstate', navigation);
    window.addEventListener('play100:navigate', navigation);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', scroll);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('popstate', navigation);
      window.removeEventListener('play100:navigate', navigation);
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', scroll);
    };
  },
};

interface OriginHint {
  source: WeakRef<HTMLElement>;
  trigger: WeakRef<HTMLElement>;
  visual: PublicMotionVisual;
  snapshot: MotionSnapshot;
  generation: number;
}

interface OriginLease {
  handle: MotionOriginLease;
  abort: AbortController;
  hint: OriginHint;
  requested: string;
  displayed: string;
  start: MotionRect;
  created: number;
  phase: 'pending' | 'open' | 'return';
  openedNavigation: number | null;
  guard?: MotionGuard;
  release?: () => void;
  sprite?: HTMLElement;
  interrupted?: MotionRect;
}

const interactive = 'a[href],button,input,textarea,select,summary,video,audio,iframe,[contenteditable]:not([contenteditable="false"])';

function publicTarget(element: HTMLElement | null): element is HTMLElement {
  return Boolean(element?.isConnected && !element.matches(interactive) && !element.querySelector(interactive) &&
    !element.closest('[hidden], [inert], dialog:not([open])'));
}

function measure(element: HTMLElement): MotionRect | null {
  if (!element.isConnected || getComputedStyle(element).visibility !== 'visible') return null;
  const { x, y, width, height } = element.getBoundingClientRect();
  const rect = { x, y, width, height };
  return visibleMotionRect(rect, window.innerWidth, window.innerHeight) ? rect : null;
}

function imageReady(element: HTMLElement, visual: PublicMotionVisual): boolean {
  if (visual.kind === 'jacket') return true;
  const image = element instanceof HTMLImageElement ? element : element.querySelector('img');
  return Boolean(image?.complete && image.naturalWidth > 0 &&
    (image.currentSrc || image.src) === new URL(visual.src, window.location.href).href);
}

function sameBoundary(left: MotionBoundary, right: MotionBoundary): boolean {
  return !right.blocked && left.scopeKey === right.scopeKey && left.generation === right.generation;
}

function guardCurrent(guard?: MotionGuard): boolean {
  try { return !guard || guard.isCurrent(); }
  catch {
    console.error('A motion guard could not confirm its current scope. Motion was skipped.');
    return false;
  }
}

function nativeSlot(dialog: HTMLDialogElement, slot: HTMLElement | null): slot is HTMLElement {
  if (!slot?.isConnected || slot.parentElement !== dialog) return false;
  const style = getComputedStyle(dialog);
  const viewport = window.visualViewport;
  return dialog.open && style.transform === 'none' && style.filter === 'none' &&
    style.perspective === 'none' && !/(paint|layout|strict|content)/.test(style.contain) &&
    getComputedStyle(slot).position === 'fixed' && (!viewport || viewport.scale === 1);
}

export function createMotionRuntime(
  read: () => MotionSnapshot,
  returnHost: () => HTMLElement | null,
  environment: MotionEnvironment = browserEnvironment,
): MotionController {
  let mounted = false;
  let generation = 0;
  let previous = read();
  let origin: OriginLease | null = null;
  let releaseEvents: (() => void) | null = null;
  let pendingHint: { handle: MotionOriginHint; value: OriginHint } | null = null;
  const sessions = new Map<MotionChannel, MotionSession>();
  const listeners = new Set<(reason: MotionCancelReason) => void>();
  const dialogs = new Set<HTMLDialogElement>();

  const eligible = () => mounted && read().policy.animate && !read().boundary.blocked &&
    !environment.hidden() && environment.supported();
  const notify = (reason: MotionCancelReason) => {
    for (const listener of [...listeners]) {
      try { listener(reason); }
      catch { console.error('A motion interruption listener failed. Remaining cleanup will continue.'); }
    }
  };
  const syncEvents = () => {
    const needed = mounted && (sessions.size > 0 || origin !== null || listeners.size > 0);
    if (needed && !releaseEvents) releaseEvents = environment.subscribe(interrupt);
    else if (!needed && releaseEvents) {
      const release = releaseEvents;
      releaseEvents = null;
      release();
    }
  };
  const clearOrigin = (reason: MotionCancelReason) => {
    const old = origin;
    origin = null;
    if (old) {
      old.abort.abort(reason);
      try { old.release?.(); }
      catch { console.error('A motion authority cleanup failed. Remaining cleanup will continue.'); }
      old.sprite?.remove();
      old.sprite = undefined;
    }
    syncEvents();
  };
  const cancelSessions = (reason: MotionCancelReason) => {
    for (const session of [...sessions.values()]) session.cancel(reason);
  };
  const snapshotSprite = () => {
    if (origin?.sprite?.isConnected) origin.interrupted = measure(origin.sprite) ?? undefined;
  };
  const cancelStaleNavigation = () => {
    const stale = [...sessions.values()].filter(session => !session.isCurrent());
    const flight = sessions.get('continuity');
    if (flight && stale.includes(flight)) snapshotSprite();
    for (const session of stale) session.cancel('navigation');
  };
  function interrupt(reason: MotionCancelReason) {
    if (reason === 'navigation') {
      generation += 1;
      pendingHint = null;
      // A native event may arrive after React already committed its new effect.
      cancelStaleNavigation();
      notify(reason);
    } else runtime.cancel(reason);
  }
  const currentOrigin = (entry: OriginLease) => origin === entry && !entry.handle.signal.aborted &&
    eligible() && sameBoundary(entry.hint.snapshot.boundary, read().boundary) &&
    entry.hint.snapshot.location.viewKey === read().location.viewKey &&
    entry.hint.snapshot.location.overlayKey === read().location.overlayKey && guardCurrent(entry.guard);
  const canReturn = (entry: OriginLease) => currentOrigin(entry) && entry.phase !== 'pending' &&
    read().location.requestedDetailKey === null && read().location.displayedDetailKey === null &&
    entry.openedNavigation !== null &&
    read().location.navigationGeneration === entry.openedNavigation + 1;
  const expectedOpen = (entry: OriginLease) => currentOrigin(entry) &&
    read().location.requestedDetailKey === entry.requested &&
    (read().location.displayedDetailKey === entry.displayed || read().location.displayedDetailKey === null) &&
    read().location.navigationGeneration === entry.hint.snapshot.location.navigationGeneration + 1;
  const finishOrigin = (entry: OriginLease) => {
    if (origin === entry) clearOrigin('unmount');
  };

  const runtime: MotionController = {
    mount() {
      mounted = true;
      previous = read();
      syncEvents();
    },
    update() {
      if (!mounted) return;
      const next = read();
      const prior = previous;
      previous = next;
      if (!sameBoundary(prior.boundary, next.boundary) || prior.boundary.blocked !== next.boundary.blocked) {
        runtime.cancel('scope');
        return;
      }
      if (next.policy.hidden || environment.hidden()) {
        runtime.cancel('hidden');
        return;
      }
      if (prior.policy.animate !== next.policy.animate || prior.policy.coarsePointer !== next.policy.coarsePointer ||
        prior.policy.reducedMotion !== next.policy.reducedMotion || prior.policy.constrained !== next.policy.constrained) {
        runtime.cancel('policy');
        return;
      }
      if (origin && !guardCurrent(origin.guard)) {
        runtime.cancel('authority');
        return;
      }
      if (prior.location.navigationGeneration !== next.location.navigationGeneration ||
        prior.location.viewKey !== next.location.viewKey || prior.location.overlayKey !== next.location.overlayKey ||
        prior.location.requestedDetailKey !== next.location.requestedDetailKey ||
        prior.location.displayedDetailKey !== next.location.displayedDetailKey) {
        cancelStaleNavigation();
        if (origin && !expectedOpen(origin) && !canReturn(origin)) clearOrigin('navigation');
        notify('navigation');
      }
    },
    dispose() {
      mounted = false;
      runtime.cancel('unmount');
      dialogs.clear();
      listeners.clear();
      syncEvents();
    },
    cancel(reason) {
      generation += 1;
      pendingHint = null;
      clearOrigin(reason);
      cancelSessions(reason);
      notify(reason);
      syncEvents();
    },
    subscribeInterrupt(listener) {
      listeners.add(listener);
      syncEvents();
      return () => { listeners.delete(listener); syncEvents(); };
    },
    forgetDialog(dialog) {
      dialogs.delete(dialog);
    },
    originHint(input) {
      if (!eligible() || typeof WeakRef === 'undefined' || !input.presentationId ||
        !publicTarget(input.source) || !input.trigger.isConnected) return null;
      const visual = copyPublicMotionVisual(input.visual);
      if (!visual) {
        console.error('A motion origin supplied an ineligible public visual. Motion was skipped.');
        return null;
      }
      const handle: MotionOriginHint = { [originHintBrand]: true, presentationId: input.presentationId };
      pendingHint = { handle, value: {
        source: new WeakRef(input.source), trigger: new WeakRef(input.trigger), visual, snapshot: read(), generation,
      } };
      return handle;
    },
    captureOrigin(hint, intent) {
      const candidate = pendingHint?.handle === hint ? pendingHint.value : null;
      if (candidate) pendingHint = null;
      if (!candidate || candidate.generation !== generation || !eligible() || hint.presentationId !== intent.displayedDetailKey ||
        (read().location.requestedDetailKey === intent.requestedDetailKey &&
          read().location.displayedDetailKey === intent.displayedDetailKey) ||
        !sameBoundary(candidate.snapshot.boundary, read().boundary) ||
        candidate.snapshot.location.viewKey !== read().location.viewKey ||
        candidate.snapshot.location.overlayKey !== read().location.overlayKey ||
        candidate.snapshot.location.navigationGeneration !== read().location.navigationGeneration ||
        !guardCurrent(intent.guard)) return null;
      const source = candidate.source.deref();
      const trigger = candidate.trigger.deref();
      if (!publicTarget(source ?? null) || !source || !trigger?.isConnected ||
        trigger.matches(':disabled') || !imageReady(source, candidate.visual)) return null;
      const sourceRect = measure(source);
      if (!sourceRect) return null;
      const carry = origin?.phase === 'return' && origin.displayed === intent.displayedDetailKey &&
        currentOrigin(origin) && origin.sprite ? measure(origin.sprite) : null;
      runtime.cancel('superseded');
      const abort = new AbortController();
      const handle: MotionOriginLease = { [originLeaseBrand]: true, presentationId: hint.presentationId, signal: abort.signal };
      const entry: OriginLease = {
        handle, abort, hint: candidate, requested: intent.requestedDetailKey, displayed: intent.displayedDetailKey,
        created: environment.now(), start: carry ?? fitMotionVisual(candidate.visual, sourceRect),
        phase: 'pending', openedNavigation: null, guard: intent.guard,
      };
      origin = entry;
      try {
        const release = intent.guard?.subscribe?.(() => {
          if (origin === entry && !guardCurrent(intent.guard)) runtime.cancel('authority');
        });
        if (origin === entry) entry.release = release;
        else release?.();
      } catch {
        console.error('A motion authority subscription failed. Motion was skipped.');
        runtime.cancel('authority');
      }
      syncEvents();
      return handle.signal.aborted ? null : handle;
    },
    startMotionSession({ channel, guard }) {
      if (!eligible() || (dialogs.size > 0 && channel !== 'dialog' && channel !== 'continuity') ||
        !guardCurrent(guard)) return null;
      sessions.get(channel)?.cancel('superseded');
      const snapshot = read();
      const abort = new AbortController();
      const cleanups = new Set<() => void>();
      const animations = new Map<Animation, () => void>();
      const dispose = (reason: MotionCancelReason | 'finished') => {
        if (abort.signal.aborted) return;
        abort.abort(reason);
        for (const release of [...animations.values()]) release();
        for (const cleanup of [...cleanups]) {
          try { cleanup(); }
          catch { console.error('A motion cleanup failed. Remaining cleanup will continue.'); }
        }
        cleanups.clear();
        if (sessions.get(channel) === session) sessions.delete(channel);
        syncEvents();
      };
      const session: MotionSession = {
        signal: abort.signal,
        isCurrent: () => !abort.signal.aborted && sessions.get(channel) === session && eligible() &&
          sameBoundary(snapshot.boundary, read().boundary) &&
          snapshot.location.navigationGeneration === read().location.navigationGeneration &&
          snapshot.location.viewKey === read().location.viewKey &&
          snapshot.location.overlayKey === read().location.overlayKey && guardCurrent(guard),
        addCleanup(cleanup) {
          if (abort.signal.aborted) cleanup();
          else cleanups.add(cleanup);
        },
        finish: () => dispose('finished'),
        cancel: (reason = 'unmount') => dispose(reason),
        animate(element, frames, timing) {
          if (!session.isCurrent()) { session.cancel('superseded'); return null; }
          if (frames.length < 2 || !Number.isFinite(timing.duration) || timing.duration <= 0 || timing.duration > 300) {
            console.error('A motion effect supplied invalid timing or keyframes. Motion was skipped.');
            session.finish();
            return null;
          }
          let animation: Animation;
          try {
            animation = element.animate(frames.map(frame => ({ ...frame })), {
              duration: timing.duration, easing: timing.easing ?? MOTION_EASING, fill: 'both',
            });
          } catch {
            console.error('A motion effect could not start. The current interface is unchanged.');
            session.finish();
            return null;
          }
          let released = false;
          const styled = element instanceof HTMLElement || element instanceof SVGElement ? element : null;
          const previousWillChange = styled?.style.willChange ?? '';
          if (styled) styled.style.willChange = 'transform, opacity';
          const release = () => {
            if (released) return;
            released = true;
            animations.delete(animation);
            animation.cancel();
            if (styled) styled.style.willChange = previousWillChange;
          };
          animations.set(animation, release);
          void animation.finished.then(() => {
            release();
            if (!animations.size) session.finish();
          }, (cause: unknown) => {
            release();
            if (!(cause instanceof Error && cause.name === 'AbortError')) {
              console.error('A motion effect stopped unexpectedly. The current interface is unchanged.');
            }
            if (!animations.size) session.finish();
          });
          return animation;
        },
      };
      sessions.set(channel, session);
      try {
        const unsubscribe = guard?.subscribe?.(() => {
          if (!guardCurrent(guard)) session.cancel('authority');
        });
        if (unsubscribe) session.addCleanup(unsubscribe);
      } catch {
        console.error('A motion authority subscription failed. Motion was skipped.');
        session.cancel('authority');
      }
      syncEvents();
      return session.signal.aborted ? null : session;
    },
    openDialog(dialog, inner, slot, options) {
      if (!mounted) return { prepareClose() {}, closed() {}, cancel() {} };
      runtime.update();
      const entry = origin && options && options.continuity?.lease === origin.handle ? origin : null;
      cancelSessions('modal');
      if (origin && origin !== entry) clearOrigin('modal');
      notify('modal');
      dialogs.add(dialog);
      let entrance: MotionSession | null = null;
      let pending: MotionSession | null = null;
      let prepared: MotionRect | null = null;
      let closed = false;
      const target = options ? options.continuity?.target.current ?? null : null;
      const nextFrame = (work: () => void) => {
        const session = runtime.startMotionSession({ channel: 'dialog', guard: entry?.guard });
        pending = session;
        if (!session) { if (entry) finishOrigin(entry); return; }
        const frame = requestAnimationFrame(() => {
          if (!session.isCurrent()) {
            session.cancel('superseded');
            if (entry) finishOrigin(entry);
            return;
          }
          session.finish();
          pending = null;
          try { work(); }
          catch {
            if (entry) finishOrigin(entry);
            console.error('Dialog motion failed. Native dialog behavior remains available.');
          }
        });
        session.addCleanup(() => cancelAnimationFrame(frame));
      };
      const localArrival = () => {
        if (!options || !eligible()) return;
        if (options.continuity) {
          if (!publicTarget(target ?? null) || !target) return;
          entrance = runtime.startMotionSession({ channel: 'dialog' });
          entrance?.animate(target, [{ transform: 'translateY(6px)', opacity: .92 }, { transform: 'none', opacity: 1 }], {
            duration: read().policy.coarsePointer ? MOTION_TIMINGS.localArtwork.coarse : MOTION_TIMINGS.localArtwork.fine,
          });
        } else if (options.preset === 'dialog') {
          entrance = runtime.startMotionSession({ channel: 'dialog' });
          entrance?.animate(inner, [{ transform: 'translateY(6px)', opacity: .96 }, { transform: 'none', opacity: 1 }], {
            duration: options.enterMs ?? MOTION_TIMINGS.dialog,
          });
        }
      };
      if (entry && expectedOpen(entry) && read().location.displayedDetailKey === entry.displayed &&
        environment.now() - entry.created <= MOTION_ORIGIN_TTL && publicTarget(target ?? null) && target) {
        entry.phase = 'open';
        entry.openedNavigation = read().location.navigationGeneration;
        nextFrame(() => {
          if (!dialog.open || !expectedOpen(entry)) { finishOrigin(entry); return; }
          const destination = nativeSlot(dialog, slot) && imageReady(target, entry.hint.visual) ? measure(target) : null;
          if (destination && slot) {
            const to = fitMotionVisual(entry.hint.visual, destination);
            entrance = fly(entry, slot, entry.start, to, 'enter');
          } else {
            finishOrigin(entry);
            localArrival();
          }
        });
      } else {
        if (entry) finishOrigin(entry);
        if (options && eligible()) nextFrame(localArrival);
      }
      return {
        cancel() {
          prepared = null;
          pending?.cancel('policy');
          entrance?.cancel('policy');
          if (entry) finishOrigin(entry);
        },
        prepareClose() {
          if (closed) return;
          pending?.cancel('unmount');
          if (entry && canReturn(entry)) {
            prepared = entry.interrupted ?? (entry.sprite ? measure(entry.sprite) : target ? measure(target) : null);
            if (prepared && !entry.interrupted && !entry.sprite) prepared = fitMotionVisual(entry.hint.visual, prepared);
          }
          entrance?.cancel('unmount');
        },
        closed() {
          if (closed) return;
          closed = true;
          pending?.cancel('unmount');
          entrance?.cancel('unmount');
          dialogs.delete(dialog);
          if (!entry || origin !== entry) return;
          const host = returnHost();
          const source = entry.hint.source.deref();
          if (prepared && canReturn(entry) && host?.isConnected && !dialogs.size &&
            !document.querySelector('dialog[open]') && publicTarget(source ?? null) && source &&
            imageReady(source, entry.hint.visual)) {
            const from = prepared;
            nextFrame(() => {
              if (!canReturn(entry) || !host.isConnected || dialogs.size || document.querySelector('dialog[open]') ||
                !publicTarget(source) || !imageReady(source, entry.hint.visual)) { finishOrigin(entry); return; }
              const destination = measure(source);
              if (destination) {
                entry.phase = 'return';
                fly(entry, host, from, fitMotionVisual(entry.hint.visual, destination), 'return');
              } else finishOrigin(entry);
            });
            return;
          }
          // StrictMode's connected teardown is not a semantic dismissal.
          if (dialog.isConnected && expectedOpen(entry)) {
            entry.phase = 'pending';
            entry.interrupted = undefined;
          } else finishOrigin(entry);
        },
      };
    },
  };

  function fly(entry: OriginLease, host: HTMLElement, from: MotionRect, to: MotionRect, phase: 'enter' | 'return'): MotionSession | null {
    const session = runtime.startMotionSession({ channel: 'continuity', guard: entry.guard });
    if (!session || !currentOrigin(entry)) { session?.cancel('authority'); finishOrigin(entry); return null; }
    const sprite = createPublicMotionElement(entry.hint.visual, to, phase);
    entry.sprite = sprite;
    entry.interrupted = undefined;
    host.append(sprite);
    session.addCleanup(() => {
      sprite.remove();
      if (entry.sprite === sprite) entry.sprite = undefined;
      if (phase === 'return' && origin === entry && entry.phase === 'return') finishOrigin(entry);
    });
    const timings = MOTION_TIMINGS.artwork[phase];
    session.animate(sprite, [
      { transform: motionTransform(from, to), opacity: .96 },
      { transform: 'none', opacity: .96, offset: .82 },
      { transform: 'none', opacity: 0 },
    ], { duration: read().policy.coarsePointer ? timings.coarse : timings.fine });
    return session;
  }
  return runtime;
}
