import { StrictMode, useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { fixtureElement } from '../lib/browser-fixture';
import type { DialogMotionOptions, MotionController, MotionLocation, MotionOriginLease, MotionSnapshot } from './types';
import { Dialog } from '../components/Dialog.tsx';
import { DialogLayerContext } from '../components/dialog-layer.ts';
import { MotionProvider } from './index.ts';
import { useMotionController } from './useMotion';
import { createMotionRuntime } from './runtime.ts';
import '../styles.css';
import './motion.css';

let policy = { animate: true, reducedMotion: false, coarsePointer: false, hidden: false, constrained: false };
let boundary = { scopeKey: 'guest', generation: 0, blocked: false };
let route: MotionLocation = {
  viewKey: '/fixture',
  requestedDetailKey: null,
  displayedDetailKey: null,
  navigationGeneration: 0,
  overlayKey: null,
};
let detail = false,
  utility = false,
  nested = false,
  preferred = false;
let mode: 'anchored' | 'local' | 'static' = 'anchored';
let lease: MotionOriginLease | undefined;
let runtime: MotionController;
let permitted = true,
  paused = true,
  offset = 0,
  throwRelease = false;
const guards = new Set<() => void>();
const stats: Window['motionFixture']['stats'] = {
  renders: 0,
  sourceReads: 0,
  targetReads: 0,
  closeRequests: 0,
  effects: [],
};
const nativeNow = performance.now.bind(performance);
performance.now = () => nativeNow() + offset;
const nativeAnimate = Element.prototype.animate;
Element.prototype.animate = function (frames, options) {
  const animation = nativeAnimate.call(this, frames, options);
  const duration = typeof options === 'number' ? options : options?.duration;
  if (typeof duration !== 'number') throw new Error('Fixture animations must have numeric durations.');
  stats.effects.push({
    target: this.getAttribute('data-motion-visual')
      ? 'sprite:' + this.getAttribute('data-motion-phase')
      : this.id || this.className,
    duration,
  });
  if (paused) {
    animation.pause();
    animation.currentTime = 0;
  }
  return animation;
};
const nativeRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function () {
  if (this.id === 'source-art') stats.sourceReads += 1;
  if (this.id === 'public-target') stats.targetReads += 1;
  return nativeRect.call(this);
};
const root = createRoot(fixtureElement('mount'));
function prepare() {
  const hint = runtime.originHint({
    surface: 'collection',
    presentationId: 'game-one',
    source: fixtureElement('source-art'),
    trigger: fixtureElement('source-trigger'),
    visual: { kind: 'jacket', rank: 7, variant: 1 },
  });
  lease = hint
    ? (runtime.captureOrigin(hint, {
        requestedDetailKey: 'game-one',
        displayedDetailKey: 'game-one',
        guard: {
          isCurrent: () => permitted,
          subscribe(fn) {
            guards.add(fn);
            return () => {
              guards.delete(fn);
              if (throwRelease) throw new Error('Synthetic motion release failure.');
            };
          },
        },
      }) ?? undefined)
    : undefined;
}
function commit() {
  route = {
    ...route,
    requestedDetailKey: 'game-one',
    displayedDetailKey: 'game-one',
    navigationGeneration: route.navigationGeneration + 1,
  };
  detail = true;
  history.pushState({}, '', '/__motion-test?game=game-one');
  window.dispatchEvent(new Event('play100:navigate'));
  render();
}
function open(next: typeof mode) {
  mode = next;
  lease = undefined;
  if (mode === 'anchored') prepare();
  commit();
}
window.addEventListener('popstate', () => {
  route = {
    ...route,
    requestedDetailKey: null,
    displayedDetailKey: null,
    navigationGeneration: route.navigationGeneration + 1,
  };
  detail = false;
  nested = false;
  render();
});
function closeDetail() {
  stats.closeRequests += 1;
  history.back();
}
function closeUtility() {
  utility = false;
  route = { ...route, overlayKey: null };
  render();
}
function utilityOpen() {
  preferred = false;
  utility = true;
  route = { ...route, overlayKey: 'menu' };
  render();
}
export function Bindings() {
  useLayoutEffect(() => {
    stats.renders += 1;
  });
  const currentRuntime = useMotionController();
  useLayoutEffect(() => {
    runtime = currentRuntime;
  }, [currentRuntime]);
  const target = useRef<HTMLDivElement>(null);
  const motion: false | DialogMotionOptions =
    mode === 'static' ? false : { preset: 'sheet', continuity: { target, lease } };
  return (
    <main>
      <h1 id="page-heading" data-page-heading tabIndex={-1}>
        Public fixture
      </h1>
      <button id="source-trigger" onClick={() => open('anchored')}>
        <span id="source-art" aria-hidden>
          07
        </span>
        Open game
      </button>
      <label id="editor-group">
        Underlying editor
        <input id="editor" defaultValue="Unsaved fixture edit" />
      </label>
      <button id="utility-trigger" onClick={utilityOpen}>
        Open menu
      </button>
      {detail && (
        <Dialog open titleId="detail-title" onClose={closeDetail} className="info-dialog" motion={motion}>
          <h2 id="detail-title" tabIndex={-1} data-autofocus>
            Public game
          </h2>
          <div id="public-target" ref={target} aria-hidden>
            07
          </div>
          <label>
            Private fixture draft
            <input id="private-draft" defaultValue="Not part of the visual" />
          </label>
          <button
            id="nested-trigger"
            onClick={() => {
              nested = true;
              render();
            }}
          >
            Open confirmation
          </button>
          {nested && (
            <Dialog
              open
              titleId="nested-title"
              onClose={() => {
                nested = false;
                render();
              }}
              motion={false}
            >
              <h2 id="nested-title">Confirm fixture</h2>
              <button
                data-autofocus
                onClick={() => {
                  nested = false;
                  render();
                }}
              >
                Keep fixture
              </button>
            </Dialog>
          )}
        </Dialog>
      )}
      {utility && (
        <DialogLayerContext.Provider value={1}>
          <Dialog
            open
            titleId="utility-title"
            className="info-dialog"
            onClose={closeUtility}
            motion={{ preset: 'dialog', enterMs: 180 }}
            getReturnFocus={() => (preferred ? document.getElementById('editor') : null)}
          >
            <h2 id="utility-title" tabIndex={-1} data-autofocus>
              Fixture menu
            </h2>
            <label>
              Utility draft
              <input id="utility-draft" defaultValue="" />
            </label>
          </Dialog>
        </DialogLayerContext.Provider>
      )}
    </main>
  );
}
function render() {
  document.documentElement.dataset.motion = policy.animate ? 'on' : 'off';
  root.render(
    <StrictMode>
      <MotionProvider policy={policy} boundary={boundary} location={route}>
        <Bindings />
      </MotionProvider>
    </StrictMode>,
  );
}
window.motionFixture = {
  stats,
  prepare,
  commit,
  open,
  utility: utilityOpen,
  expire() {
    offset += 1501;
  },
  rerender: render,
  hold(value) {
    paused = value;
  },
  policy(patch) {
    policy = { ...policy, ...patch };
    render();
  },
  revoke() {
    permitted = false;
    for (const changed of guards) changed();
    detail = false;
    nested = false;
    route = { ...route, displayedDetailKey: null };
    render();
  },
  removeRecord() {
    detail = false;
    nested = false;
    route = { ...route, displayedDetailKey: null };
    render();
  },
  returnToEditor() {
    preferred = true;
    closeUtility();
  },
  scope() {
    boundary = { scopeKey: 'account:fixture:next', generation: boundary.generation + 1, blocked: true };
    detail = false;
    utility = false;
    nested = false;
    render();
  },
  navigate() {
    route = {
      ...route,
      viewKey: '/different',
      requestedDetailKey: null,
      displayedDetailKey: null,
      navigationGeneration: route.navigationGeneration + 1,
    };
    detail = false;
    utility = false;
    nested = false;
    window.dispatchEvent(new Event('play100:navigate'));
    render();
  },
  noopCapture() {
    const hint = runtime.originHint({
      surface: 'collection',
      presentationId: 'game-one',
      source: fixtureElement('source-art'),
      trigger: fixtureElement('source-trigger'),
      visual: { kind: 'jacket', rank: 7, variant: 1 },
    });
    return (
      hint !== null &&
      runtime.captureOrigin(hint, {
        requestedDetailKey: 'game-one',
        displayedDetailKey: 'game-one',
      }) === null
    );
  },
  routeAttempt() {
    const session = runtime.startMotionSession({ channel: 'route' });
    session?.finish();
    return session !== null;
  },
  failRelease() {
    throwRelease = true;
  },
  failOpen() {
    const original = runtime.openDialog;
    runtime.openDialog = () => {
      runtime.openDialog = original;
      throw new Error('Synthetic motion startup failure.');
    };
  },
  async staleFrame(change) {
    let snapshot: MotionSnapshot = {
      policy: { animate: true, reducedMotion: false, coarsePointer: false, hidden: false, constrained: false },
      boundary: { scopeKey: 'guest', generation: 0, blocked: false },
      location: {
        viewKey: '/isolated',
        requestedDetailKey: null,
        displayedDetailKey: null,
        navigationGeneration: 0,
        overlayKey: null,
      },
    };
    let subscriptions = 0;
    const isolated = createMotionRuntime(
      () => snapshot,
      () => null,
    );
    isolated.mount();
    const source = fixtureElement('source-art');
    const trigger = fixtureElement('source-trigger');
    const hint = isolated.originHint({
      surface: 'collection',
      presentationId: 'isolated-game',
      source,
      trigger,
      visual: { kind: 'jacket', rank: 7, variant: 1 },
    });
    if (!hint) throw new Error('The isolated visible source could not supply a motion hint.');
    const captured = isolated.captureOrigin(hint, {
      requestedDetailKey: 'isolated-game',
      displayedDetailKey: 'isolated-game',
      guard: {
        isCurrent: () => true,
        subscribe() {
          subscriptions += 1;
          return () => {
            subscriptions -= 1;
          };
        },
      },
    });
    if (!captured) throw new Error('The isolated source could not capture a lease.');
    snapshot = {
      ...snapshot,
      location: {
        ...snapshot.location,
        requestedDetailKey: 'isolated-game',
        displayedDetailKey: 'isolated-game',
        navigationGeneration: 1,
      },
    };
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog';
    const inner = document.createElement('div');
    inner.className = 'dialog-inner';
    const target = document.createElement('div');
    target.style.cssText = 'width:144px;height:108px';
    let targetReads = 0;
    target.getBoundingClientRect = () => {
      targetReads += 1;
      return nativeRect.call(target);
    };
    inner.append(target);
    const slot = document.createElement('div');
    slot.className = 'dialog-motion-slot';
    slot.inert = true;
    dialog.append(inner, slot);
    document.body.append(dialog);
    dialog.showModal();
    const handle = isolated.openDialog(dialog, inner, slot, {
      preset: 'sheet',
      continuity: { target: { current: target }, lease: captured },
    });
    // Change what read() sees without update()/an interruption eagerly clearing the lease.
    // This exercises the scheduled callback's own stale-session exit.
    snapshot =
      change === 'boundary'
        ? { ...snapshot, boundary: { ...snapshot.boundary, generation: 1 } }
        : { ...snapshot, policy: { ...snapshot.policy, animate: false } };
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return {
        aborted: captured.signal.aborted,
        subscriptions,
        targetReads,
        flights: slot.querySelectorAll('[data-motion-visual]').length,
        sourceVisible: getComputedStyle(source).visibility === 'visible' && source.getBoundingClientRect().width > 0,
      };
    } finally {
      handle.prepareClose();
      dialog.close();
      isolated.forgetDialog(dialog);
      handle.closed();
      isolated.dispose();
      dialog.remove();
    }
  },
};
render();
