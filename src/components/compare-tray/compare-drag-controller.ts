import { COMPARE_DRAG_TYPE } from '../../lib/compare-tray';
import type { CompareDragSession, CompareTrayStore } from '../../lib/compare-tray';
import type { LibraryRecord } from '../../lib/personal-types';
import type { MotionGuard, MotionRuntime, MotionSession } from '../../motion';
import type { CompareInteractionGate } from './compare-drag-types';

export const COMPARE_TOUCH_HOLD_MS = 280;
export const COMPARE_TOUCH_SLOP = 8;
export const COMPARE_CLICK_TAIL_MS = 350;

interface Point { x: number; y: number }
export interface CompareClickTail extends Point { until: number; pointerId?: number }
type ClickInput = Pick<MouseEvent, 'button' | 'detail' | 'clientX' | 'clientY' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'> & { pointerId?: number };
const modified = (event: Pick<MouseEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>) =>
  event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;

export function matchesCompareClick(event: ClickInput, tail: CompareClickTail | null, now: number): boolean {
  return Boolean(tail && now <= tail.until && event.button === 0 && event.detail > 0 && !modified(event) &&
    (event.pointerId === undefined || event.pointerId < 0 || tail.pointerId === undefined || event.pointerId === tail.pointerId) &&
    Math.hypot(event.clientX - tail.x, event.clientY - tail.y) <= COMPARE_TOUCH_SLOP);
}

export interface CompareSource {
  read(): { node: HTMLElement | null; record: LibraryRecord | undefined; disabled: boolean };
}

interface Gesture {
  source: CompareSource;
  node: HTMLElement;
  recordId: string;
  guard: MotionGuard;
  kind: 'mouse' | 'touch' | 'grip';
  pointerId?: number;
  touchId?: number;
  origin: Point;
  point: Point;
  ready: boolean;
  token: string | null;
  native: boolean;
  ghost: HTMLDivElement | null;
  frame: number | null;
  cleanups: (() => void)[];
}

interface Services {
  store: CompareTrayStore;
  drag: CompareDragSession;
  runtime: MotionRuntime;
  isCurrent(): boolean;
  interaction(): CompareInteractionGate | undefined;
}

const excluded = 'input,textarea,select,option,label,summary,details,p,[contenteditable]:not([contenteditable="false"]),audio,video,iframe,[data-compare-drag-ignore]';
const controls = 'button,a[href],[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="slider"],[role="textbox"],[role="combobox"],[role="listbox"],[role="menuitem"],[role="tab"],[tabindex]';
const unavailable = '[hidden],[inert]';
const hiddenSource = `${unavailable},[aria-hidden="true"]`;
const pointOf = (event: { clientX: number; clientY: number }): Point => ({ x: event.clientX, y: event.clientY });
const selecting = () => document.getSelection()?.isCollapsed === false;
const modalOpen = () => Boolean(document.querySelector('dialog[open]'));

export function compareSourceTarget(node: HTMLElement, event: Event): boolean {
  const path = event.composedPath();
  const end = path.indexOf(node);
  if (end < 0 || node.closest(hiddenSource)) return false;
  for (const target of path.slice(0, end + 1)) {
    if (!(target instanceof Element)) continue;
    if (target.matches(`${excluded},${unavailable},:disabled,[aria-disabled="true"]`)) return false;
    if (target.matches(controls) && !(target === node && node.hasAttribute('data-compare-drag-grip')) &&
      !(target.matches('a,button') && target.hasAttribute('data-compare-drag-title'))) return false;
  }
  return true;
}

export function createCompareDragController({ store, drag, runtime, isCurrent, interaction }: Services) {
  let alive = true;
  let active: Gesture | null = null;
  let dock: HTMLElement | null = null;
  let arrival: { id: string; node: HTMLElement } | null = null;
  let pendingSettle: { id: string; session: MotionSession } | null = null;
  let settleSession: MotionSession | null = null;
  let tail: CompareClickTail | null = null;
  let disposeTail = () => {};

  const inputReady = () => alive && isCurrent() && interaction()?.enabled === true && !document.hidden && !modalOpen();
  const current = (gesture: Gesture) => {
    const source = gesture.source.read();
    return inputReady() && gesture.guard.isCurrent() && !source.disabled && source.node === gesture.node &&
      source.node.isConnected && !source.node.closest(hiddenSource) && source.record?.id === gesture.recordId;
  };
  const clearTail = () => { disposeTail(); disposeTail = () => {}; tail = null; };
  const consumeClick = (event: ClickInput): boolean => {
    if (!matchesCompareClick(event, tail, Date.now())) return false;
    clearTail();
    return true;
  };
  const rememberTail = (point: Point, pointerId: number | undefined, touchId: number | undefined, terminal: boolean) => {
    clearTail();
    tail = terminal ? { ...point, pointerId, until: Date.now() + COMPARE_CLICK_TAIL_MS } : null;
    let timer: number | null = null;
    const ended = (point: Point) => {
      tail = { ...point, pointerId, until: Date.now() + COMPARE_CLICK_TAIL_MS };
      document.removeEventListener('pointerup', pointerEnd, true);
      document.removeEventListener('pointercancel', pointerEnd, true);
      document.removeEventListener('touchend', touchEnd, true);
      document.removeEventListener('touchcancel', touchEnd, true);
      document.addEventListener('click', click, true);
      timer = window.setTimeout(clearTail, COMPARE_CLICK_TAIL_MS);
    };
    const pointerEnd = (event: PointerEvent) => { if (event.pointerId === pointerId) ended(pointOf(event)); };
    const touchEnd = (event: TouchEvent) => {
      const finger = Array.from(event.changedTouches).find(item => item.identifier === touchId);
      if (finger) ended(pointOf(finger));
    };
    const click = (event: MouseEvent) => {
      if (consumeClick(event)) { event.preventDefault(); event.stopPropagation(); }
    };
    const hidden = () => { if (document.hidden) clearTail(); };
    document.addEventListener('pointerdown', clearTail, true);
    document.addEventListener('touchstart', clearTail, true);
    document.addEventListener('keydown', clearTail, true);
    if (terminal) {
      document.addEventListener('click', click, true);
      timer = window.setTimeout(clearTail, COMPARE_CLICK_TAIL_MS);
    }
    else {
      // Escape can precede pointer-up; start the bounded click tail at the actual end.
      document.addEventListener('pointerup', pointerEnd, true);
      document.addEventListener('pointercancel', pointerEnd, true);
      document.addEventListener('touchend', touchEnd, true);
      document.addEventListener('touchcancel', touchEnd, true);
    }
    window.addEventListener('blur', clearTail);
    window.addEventListener('pagehide', clearTail);
    document.addEventListener('visibilitychange', hidden);
    disposeTail = () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('click', click, true);
      document.removeEventListener('pointerdown', clearTail, true);
      document.removeEventListener('touchstart', clearTail, true);
      document.removeEventListener('keydown', clearTail, true);
      document.removeEventListener('pointerup', pointerEnd, true);
      document.removeEventListener('pointercancel', pointerEnd, true);
      document.removeEventListener('touchend', touchEnd, true);
      document.removeEventListener('touchcancel', touchEnd, true);
      window.removeEventListener('blur', clearTail);
      window.removeEventListener('pagehide', clearTail);
      document.removeEventListener('visibilitychange', hidden);
    };
  };
  const finish = (gesture: Gesture, endedSession = false, terminal = true) => {
    if (active !== gesture) return;
    active = null;
    if (gesture.frame !== null) window.cancelAnimationFrame(gesture.frame);
    gesture.ghost?.remove();
    gesture.node.removeAttribute('data-compare-dragging');
    dock?.removeAttribute('data-compare-drop-ready');
    for (const cleanup of gesture.cleanups) cleanup();
    if (gesture.token && !endedSession) drag.cancelDrag();
    if (gesture.token) rememberTail(gesture.point, gesture.pointerId, gesture.touchId, terminal);
  };
  const cancel = (terminal = true) => { if (active) finish(active, false, terminal); };
  const cancelSource = (source: CompareSource, terminal = true) => { if (active?.source === source) cancel(terminal); };
  const listen = <K extends keyof DocumentEventMap>(
    gesture: Gesture, type: K, listener: (event: DocumentEventMap[K]) => void, options?: AddEventListenerOptions | boolean,
  ) => {
    document.addEventListener(type, listener, options);
    gesture.cleanups.push(() => document.removeEventListener(type, listener, options));
  };
  const watch = (gesture: Gesture) => {
    const interrupt = runtime.subscribeInterrupt(reason => {
      if (active !== gesture || reason === 'drag' || reason === 'superseded') return;
      if (reason !== 'policy' || !current(gesture)) cancel();
    });
    if (active === gesture) gesture.cleanups.push(interrupt); else interrupt();
    const unsubscribe = gesture.guard.subscribe?.(() => {
      if (active === gesture && !current(gesture)) cancel();
    });
    if (unsubscribe) {
      if (active === gesture) gesture.cleanups.push(unsubscribe); else unsubscribe();
    }
    if (active !== gesture) return;
    listen(gesture, 'selectionchange', () => { if (selecting()) cancelSource(gesture.source); });
    listen(gesture, 'keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelSource(gesture.source, false); }
      else if (!['Shift', 'Control', 'Meta', 'Alt'].includes(event.key)) cancelSource(gesture.source);
    }, true);
    listen(gesture, 'pointerdown', () => { cancelSource(gesture.source); clearTail(); }, true);
    listen(gesture, 'touchstart', event => { if (event.touches.length > 1) cancelSource(gesture.source); }, true);
    const blur = () => cancelSource(gesture.source);
    window.addEventListener('blur', blur);
    window.addEventListener('pagehide', blur);
    gesture.cleanups.push(() => { window.removeEventListener('blur', blur); window.removeEventListener('pagehide', blur); });
  };
  const prepare = (source: CompareSource, event: Event, point: Point, kind: Gesture['kind']) => {
    const value = source.read();
    if (!value.node || !value.record || value.disabled || !inputReady() || selecting() || !compareSourceTarget(value.node, event)) return null;
    cancel();
    clearTail();
    const guard = interaction()?.captureCurrent();
    if (!guard?.isCurrent()) return null;
    const gesture: Gesture = {
      source, node: value.node, recordId: value.record.id, guard, kind,
      origin: point, point, ready: kind === 'mouse', token: null, native: false,
      ghost: null, frame: null, cleanups: [],
    };
    active = gesture;
    watch(gesture);
    if (active !== gesture || !current(gesture)) { cancelSource(source); return null; }
    if (kind !== 'mouse') {
      const timer = window.setTimeout(() => {
        if (active === gesture && current(gesture) && !selecting()) gesture.ready = true;
        else cancelSource(source);
      }, COMPARE_TOUCH_HOLD_MS);
      gesture.cleanups.push(() => window.clearTimeout(timer));
    }
    return gesture;
  };
  const makeGhost = (gesture: Gesture) => {
    const ghost = document.createElement('div');
    ghost.className = 'compare-drag-ghost';
    ghost.textContent = 'Pin to Compare';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    if (gesture.native) ghost.setAttribute('data-native', '');
    gesture.ghost = ghost;
    document.body.append(ghost);
    return ghost;
  };
  const activate = (gesture: Gesture, native: boolean): boolean => {
    if (active !== gesture || !current(gesture) || selecting()) { cancelSource(gesture.source); return false; }
    const record = gesture.source.read().record;
    if (!record) return false;
    runtime.cancel('drag');
    if (!current(gesture)) { cancelSource(gesture.source); return false; }
    const token = drag.beginDrag(record);
    if (!token) { finish(gesture); return false; }
    gesture.token = token;
    gesture.native = native;
    gesture.node.setAttribute('data-compare-dragging', '');
    makeGhost(gesture);
    return true;
  };
  const overDock = (point: Point) => {
    if (!dock?.isConnected || dock.closest(hiddenSource)) return false;
    const hit = document.elementFromPoint(point.x, point.y);
    return hit !== null && dock.contains(hit);
  };
  const scheduleMove = (gesture: Gesture) => {
    if (gesture.frame !== null) return;
    gesture.frame = window.requestAnimationFrame(() => {
      gesture.frame = null;
      if (active !== gesture) return;
      if (!current(gesture)) { cancel(); return; }
      const over = overDock(gesture.point);
      const x = Math.max(8, Math.min(window.innerWidth - 184, gesture.point.x + 12));
      const y = Math.max(8, Math.min(window.innerHeight - 52, gesture.point.y - 56));
      if (gesture.ghost) gesture.ghost.style.transform = `translate3d(${x}px,${y}px,0)`;
      if (dock) dock.dataset.compareDropReady = String(over);
    });
  };
  const moveTouch = (gesture: Gesture, event: Event, point: Point) => {
    if (active !== gesture) return;
    if (!current(gesture) || selecting()) { cancel(); return; }
    gesture.point = point;
    const distance = Math.hypot(point.x - gesture.origin.x, point.y - gesture.origin.y);
    if (!gesture.token) {
      if (!gesture.ready) { if (distance > COMPARE_TOUCH_SLOP) cancel(); return; }
      if (distance === 0) return;
      // Broad surfaces retain native panning; a hold cannot change touch-action.
      if (gesture.kind === 'touch' && !event.cancelable) { cancel(); return; }
      if (event.cancelable) event.preventDefault();
      if (gesture.kind === 'touch' && !event.defaultPrevented) { cancel(); return; }
      if (!activate(gesture, false)) return;
      if (gesture.kind === 'grip' && gesture.pointerId !== undefined) {
        try {
          gesture.node.setPointerCapture(gesture.pointerId);
        } catch {
          store.reportError('This drag was interrupted. Use Pin to compare instead.');
          cancel();
          return;
        }
        const id = gesture.pointerId;
        const lost = () => { if (active === gesture) cancel(false); };
        gesture.node.addEventListener('lostpointercapture', lost);
        gesture.cleanups.push(() => {
          gesture.node.removeEventListener('lostpointercapture', lost);
          if (gesture.node.hasPointerCapture(id)) gesture.node.releasePointerCapture(id);
        });
      }
    } else {
      if (gesture.kind === 'touch' && !event.cancelable) { cancel(); return; }
      if (event.cancelable) event.preventDefault();
      if (gesture.kind === 'touch' && !event.defaultPrevented) { cancel(); return; }
    }
    scheduleMove(gesture);
  };
  const startSettle = () => {
    const pending = pendingSettle;
    if (!pending || !arrival || pending.id !== arrival.id || !arrival.node.isConnected) return;
    pendingSettle = null;
    const animation = pending.session.animate(arrival.node, [
      { transform: 'translateY(-4px)', opacity: 0.7 }, { transform: 'translateY(0)', opacity: 1 },
    ], { duration: 150, easing: 'cubic-bezier(.16,1,.3,1)' });
    if (!animation) { pending.session.finish(); return; }
    const done = () => pending.session.finish();
    animation.addEventListener('finish', done, { once: true });
    pending.session.addCleanup(() => animation.removeEventListener('finish', done));
  };
  const added = (before: readonly LibraryRecord[]) => {
    const record = store.getSnapshot().items.find(item => !before.some(prior => prior.id === item.id));
    if (!record || !inputReady()) return;
    const session = runtime.startMotionSession({ channel: 'drag-settle', guard: interaction()?.captureCurrent() });
    if (!session) return;
    settleSession = session;
    const pending = { id: record.id, session };
    pendingSettle = pending;
    session.addCleanup(() => {
      if (pendingSettle === pending) pendingSettle = null;
      if (settleSession === session) settleSession = null;
    });
    startSettle();
    queueMicrotask(() => {
      if (pendingSettle === pending) { startSettle(); if (pendingSettle === pending) session.finish(); }
    });
  };
  const dropGame = (token: string): boolean => {
    const gesture = active;
    if (!gesture || !gesture.token || !current(gesture) || !dock) { cancel(); return false; }
    const before = store.getSnapshot().items;
    const accepted = drag.dropGame(token);
    finish(gesture, true);
    if (accepted) added(before);
    return accepted;
  };
  const release = (gesture: Gesture, point: Point) => {
    if (active !== gesture) return;
    gesture.point = point;
    if (gesture.token && current(gesture) && overDock(point) && dock) {
      const rect = dock.getBoundingClientRect();
      if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) {
        dropGame(gesture.token);
        return;
      }
    }
    finish(gesture);
  };
  return {
    resume() { alive = true; },
    dispose() { alive = false; cancel(); clearTail(); settleSession?.cancel('unmount'); pendingSettle = null; settleSession = null; dock = null; arrival = null; },
    refresh() { if (active && !current(active)) cancel(); },
    refreshSource(source: CompareSource) { if (active?.source === source && !current(active)) cancel(); },
    cancelSource, cancel, consumeClick,
    canPin() { return alive && isCurrent() && interaction()?.enabled !== false; },
    pin(record: LibraryRecord) {
      const before = store.getSnapshot().items;
      const accepted = store.pin(record);
      if (accepted) added(before);
      return accepted;
    },
    clear() { cancel(); settleSession?.cancel(); pendingSettle = null; return store.clear(); },
    setDock(node: HTMLElement | null) { if (dock && !node) cancel(); dock = node; },
    setArrivalTarget(id: string | undefined, node: HTMLElement | null) {
      if (node && id) arrival = { id, node };
      else if (!id || arrival?.id === id) arrival = null;
      startSettle();
    },
    pointerDown(source: CompareSource, event: PointerEvent) {
      if (event.button !== 0 || !event.isPrimary || modified(event)) return;
      const grip = source.read().node?.hasAttribute('data-compare-drag-grip');
      const mouse = event.pointerType === 'mouse' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      if (!mouse && !(grip && (event.pointerType === 'touch' || event.pointerType === 'pen'))) return;
      const gesture = prepare(source, event, pointOf(event), mouse ? 'mouse' : 'grip');
      if (!gesture) return;
      gesture.pointerId = event.pointerId;
      if (mouse) {
        const previous = gesture.node.getAttribute('draggable');
        gesture.node.draggable = true;
        gesture.cleanups.push(() => {
          if (previous === null) gesture.node.removeAttribute('draggable');
          else gesture.node.setAttribute('draggable', previous);
        });
      }
      listen(gesture, 'pointermove', move => {
        if (move.pointerId !== gesture.pointerId || gesture.native) return;
        if (modified(move) || !(move.buttons & 1)) { cancelSource(source); return; }
        gesture.point = pointOf(move);
        if (gesture.kind === 'grip') moveTouch(gesture, move, gesture.point);
        else if (!current(gesture) || selecting()) cancelSource(source);
      }, { passive: false });
      listen(gesture, 'pointerup', up => {
        if (up.pointerId === gesture.pointerId && !gesture.native) release(gesture, pointOf(up));
      }, true);
      // HTML drag deliberately cancels the pointer stream when the UA takes over.
      listen(gesture, 'pointercancel', canceled => {
        if (canceled.pointerId === gesture.pointerId && !gesture.native) cancelSource(source);
      });
    },
    touchStart(source: CompareSource, event: TouchEvent) {
      if (event.touches.length !== 1 || source.read().node?.hasAttribute('data-compare-drag-grip')) return;
      const touch = event.touches[0];
      if (!touch) return;
      const gesture = prepare(source, event, pointOf(touch), 'touch');
      if (!gesture) return;
      gesture.touchId = touch.identifier;
      listen(gesture, 'touchmove', move => {
        if (move.touches.length !== 1) { cancelSource(source); return; }
        const finger = Array.from(move.touches).find(item => item.identifier === gesture.touchId);
        if (finger) moveTouch(gesture, move, pointOf(finger));
      }, { capture: true, passive: false });
      listen(gesture, 'touchend', end => {
        const finger = Array.from(end.changedTouches).find(item => item.identifier === gesture.touchId);
        if (finger) release(gesture, pointOf(finger));
      }, true);
      listen(gesture, 'touchcancel', () => cancelSource(source));
    },
    nativeStart(source: CompareSource, event: DragEvent) {
      const gesture = active;
      if (!gesture || gesture.source !== source) return;
      if (gesture.kind !== 'mouse') {
        if (gesture.token) event.preventDefault();
        cancel();
        return;
      }
      if (event.defaultPrevented || modified(event) || selecting() || !compareSourceTarget(gesture.node, event)) {
        event.preventDefault();
        cancel();
        return;
      }
      if (!event.dataTransfer) {
        event.preventDefault();
        store.reportError('A safe drag could not be started. Use Pin to compare instead.');
        cancel();
        return;
      }
      if (!activate(gesture, true) || !gesture.token || !gesture.ghost) { event.preventDefault(); return; }
      try {
        event.dataTransfer.clearData();
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(COMPARE_DRAG_TYPE, gesture.token);
        event.dataTransfer.setDragImage(gesture.ghost, 16, 16);
      } catch {
        event.preventDefault();
        store.reportError('A safe drag could not be started. Use Pin to compare instead.');
        cancel();
      }
    },
    nativeEnd(source: CompareSource, event: DragEvent) {
      if (active?.source !== source || !active.native) return;
      active.point = pointOf(event);
      finish(active);
    },
    nativeOver(event: DragEvent) {
      if (!active?.native || !active.token || !current(active) || !dock ||
        !event.dataTransfer?.types.includes(COMPARE_DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      active.point = pointOf(event);
    },
    nativeDrop(event: DragEvent) {
      if (!active?.native || !current(active) || !dock || !overDock(pointOf(event)) ||
        !event.dataTransfer?.types.includes(COMPARE_DRAG_TYPE)) return;
      event.preventDefault();
      event.stopPropagation();
      active.point = pointOf(event);
      dropGame(event.dataTransfer.getData(COMPARE_DRAG_TYPE));
    },
  };
}

export type CompareDragController = ReturnType<typeof createCompareDragController>;
