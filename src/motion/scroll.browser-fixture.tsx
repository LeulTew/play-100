import { createMotionRuntime } from './runtime.ts';
import { fixtureElement } from '../lib/browser-fixture';
import type { MotionSession, MotionOriginLease } from './types';
const snapshot = {
  policy: { animate: true, reducedMotion: false, coarsePointer: false, hidden: false, constrained: false },
  boundary: { scopeKey: 'guest', generation: 0, blocked: false },
  location: {
    viewKey: '/',
    requestedDetailKey: null,
    displayedDetailKey: null,
    navigationGeneration: 0,
    overlayKey: null,
  },
};
const runtime = createMotionRuntime(
  () => snapshot,
  () => null,
);
runtime.mount();
const events: { target: string; trusted: boolean }[] = [];
window.addEventListener(
  'scroll',
  (event) => {
    const target = event.target;
    if (target !== document && !(target instanceof Element)) throw new Error('Unexpected fixture scroll target.');
    events.push({ target: target instanceof Element ? target.id : 'document', trusted: event.isTrusted });
  },
  true,
);
let session: MotionSession | null, lease: MotionOriginLease | null, animation: Animation | null;
window.motionScrollFixture = {
  start() {
    const source = fixtureElement('origin');
    const hint = runtime.originHint({
      surface: 'collection',
      presentationId: 'game',
      source,
      trigger: fixtureElement('trigger'),
      visual: { kind: 'jacket', rank: 7 },
    });
    if (!hint) throw new Error('Visible origin did not produce a hint.');
    lease = runtime.captureOrigin(hint, { requestedDetailKey: 'game', displayedDetailKey: 'game' });
    session = runtime.startMotionSession({ channel: 'dialog' });
    if (!lease || !session) throw new Error('Motion fixture did not start.');
    animation = session.animate(source, [{ opacity: 1 }, { opacity: 0.5 }], { duration: 180 });
    if (!animation) throw new Error('Motion fixture did not animate.');
    animation.pause();
    animation.currentTime = 0;
  },
  state() {
    if (!session || !lease || !animation) throw new Error('Motion fixture has not started.');
    return {
      active: session.isCurrent(),
      originAborted: lease.signal.aborted,
      reason: session.signal.reason ?? null,
      originReason: lease.signal.reason ?? null,
      animation: animation.playState,
      events,
    };
  },
};
