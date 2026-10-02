import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { AfterFirstPaint } from './AfterFirstPaint';
import type { CollectionSceneHandle } from './scene/CollectionScene';
import { createMemoizedModule } from '../lib/memoized-module';
import { createScrollSettle } from '../lib/scroll-settle';
import './scene/artifact.css';

const sceneModule = createMemoizedModule(() => import('./scene/CollectionScene'));

interface IllustrationState {
  component: ComponentType<{ fanned: boolean }> | null;
  failed: boolean;
}

export function DeferredArtifactStill({ onLoad }: { onLoad: (state: IllustrationState) => void }) {
  useEffect(() => {
    let current = true;
    void import('./scene/ArtifactStill').then(
      ({ default: component }) => {
        if (current) onLoad({ component, failed: false });
      },
      (error: unknown) => {
        if (!current) return;
        console.error('The collection illustration could not load. A static sleeve motif is shown instead.', error);
        onLoad({ component: null, failed: true });
      },
    );
    return () => {
      current = false;
    };
  }, [onLoad]);
  return null;
}

function SleeveMotif() {
  return (
    <svg
      className="artifact-still"
      data-artifact-fallback=""
      viewBox="0 0 600 360"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round">
        <path d="m112 236 220-62 154 84-220 62Z" fill="var(--wash)" />
        <path d="m112 216 220-62 154 84-220 62Z" fill="var(--paper)" />
        <path d="m112 196 220-62 154 84-220 62Z" fill="var(--lime)" />
        <path d="m246 206 61-18-22 43Z" fill="var(--ink)" stroke="none" />
      </g>
    </svg>
  );
}

const REQUESTED_SCENE_IDLE_TIMEOUT_MS = 150;

export interface CollectionArtifactProps {
  quality: 'auto' | 'full' | 'lite';
  /**
   * No visual preference is known yet: before the library opens, without a stored hint, quality is a provisional
   * 'lite' (src/lib/motion-hint.ts). It behaves as Lite, but its caption names no mode.
   */
  pending?: boolean;
  reducedMotion: boolean;
  constrained: boolean;
}

type SceneStatus = 'static' | 'waiting' | 'loading' | 'ready' | 'paused' | 'fallback';

interface SceneState {
  ready: boolean;
  status: SceneStatus;
  reason: string | null;
}

function systemReducesMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function hasCoarsePointer() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

export default function CollectionArtifact({
  quality,
  pending = false,
  reducedMotion,
  constrained,
}: CollectionArtifactProps) {
  const captionId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const releaseFooterRef = useRef<(() => void) | null>(null);
  const sceneRef = useRef<CollectionSceneHandle | null>(null);
  const [illustration, setIllustration] = useState<IllustrationState>({ component: null, failed: false });
  const [fanned, setFanned] = useState(false);
  const fannedRef = useRef(false);
  // The pose the illustration shows and a new scene first renders. A request made before a scene is on screen is left
  // to that scene, which starts in this pose and then animates to the request, so the first Fan out on touch Auto fans
  // rather than snapping (MOT-002). A scene that is taken down leaves the illustration in the pose it was headed for.
  const [stillFanned, setStillFanned] = useState(false);
  const stillFannedRef = useRef(false);
  const [systemReduced, setSystemReduced] = useState(systemReducesMotion);
  const [coarsePointer, setCoarsePointer] = useState(hasCoarsePointer);
  const [requested, setRequested] = useState(false);
  const requestedRef = useRef(false);
  const requestSceneRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<SceneState>({ ready: false, status: 'waiting', reason: null });
  const motionReduced = reducedMotion || systemReduced;
  const motionAllowed = !motionReduced && quality !== 'lite' && (quality === 'full' || !constrained);
  const needsInteraction = quality === 'auto' && coarsePointer && !requested;
  const canRender = motionAllowed && !needsInteraction;
  const canInteract = motionAllowed && state.status !== 'fallback';
  const showing = canRender && state.ready;
  const sceneQuality = quality === 'full' ? 'full' : 'auto';

  // A shorter fallback caption or removed Fan out control must not shift the collection below it.
  const holdFooterHeight = useCallback(() => {
    const footer = footerRef.current;
    if (!footer) return;
    const height = footer.getBoundingClientRect().height;
    releaseFooterRef.current?.();
    footer.style.minHeight = `${height}px`;
    const heldWidth = window.innerWidth;
    const release = () => {
      window.removeEventListener('resize', resize);
      footer.style.minHeight = '';
      releaseFooterRef.current = null;
    };
    const resize = () => {
      if (heldWidth !== window.innerWidth) release();
    };
    window.addEventListener('resize', resize);
    releaseFooterRef.current = release;
  }, []);

  const onIllustrationLoad = useCallback(
    (next: IllustrationState) => {
      if (next.failed) holdFooterHeight();
      setIllustration(next);
    },
    [holdFooterHeight],
  );

  useEffect(() => () => releaseFooterRef.current?.(), []);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = window.matchMedia('(pointer: coarse)');
    const update = () => {
      setSystemReduced(preference.matches);
      setCoarsePointer(pointer.matches);
    };
    update();
    preference.addEventListener('change', update);
    pointer.addEventListener('change', update);
    return () => {
      preference.removeEventListener('change', update);
      pointer.removeEventListener('change', update);
    };
  }, []);

  useEffect(() => {
    fannedRef.current = fanned;
    // Only once its first frame is on screen, so the fold starts from the pose that frame shares with the illustration.
    if (showing) sceneRef.current?.setFanned(fanned);
  }, [fanned, showing]);

  useEffect(() => {
    const root = rootRef.current;
    const host = hostRef.current;
    const stage = stageRef.current;
    if (!root || !host || !stage) return;
    root.dataset.frameCount = '0';
    setState({ ready: false, status: canRender ? 'waiting' : 'static', reason: null });
    if (!canRender) return;

    let cancelled = false;
    let failed = false;
    let visible = false;
    let loading = false;
    let hasFrame = false;
    let scene: CollectionSceneHandle | null = null;
    let createScene: (typeof import('./scene/CollectionScene'))['createCollectionScene'] | null = null;
    let idleId: number | null = null;
    let timerId: number | null = null;
    let settleCancel: (() => void) | null = null;
    let observer: IntersectionObserver | null = null;
    // Each start-up turn is a long task (loading the module, then building the scene and its first frame), and one
    // that lands mid-scroll holds the frames the scroll needs: automatic starts wait for scrolling to pause.
    const scrolling = createScrollSettle(window);
    const mayStart = () => requestedRef.current || scrolling.quiet();

    const isActive = () => visible && document.visibilityState !== 'hidden';

    function cancelScheduledLoad() {
      if (idleId !== null) window.cancelIdleCallback(idleId);
      if (timerId !== null) window.clearTimeout(timerId);
      settleCancel?.();
      idleId = null;
      timerId = null;
      settleCancel = null;
    }

    function fallback(reason: string) {
      if (cancelled || failed) return;
      failed = true;
      holdFooterHeight();
      cancelScheduledLoad();
      scene?.dispose();
      scene = null;
      sceneRef.current = null;
      setState({ ready: false, status: 'fallback', reason });
    }

    const loadScene = async () => {
      idleId = null;
      timerId = null;
      if (cancelled || failed || loading || !isActive()) return;
      // A scroll that began after this turn was scheduled defers it again.
      if (!mayStart()) {
        reconcile();
        return;
      }
      loading = true;
      setState({ ready: false, status: 'loading', reason: null });
      try {
        if (!createScene) {
          // Plain marks here, as in scene-timing.ts, which ships with the scene rather than in every page's bundle.
          performance.mark('p100:scene:module-start');
          const module = await sceneModule.load();
          performance.mark('p100:scene:module-end');
          if (cancelled || failed) return;
          createScene = module.createCollectionScene;
          if (!isActive()) setState({ ready: false, status: 'waiting', reason: null });
          // WebGL construction gets its own visible idle turn after module evaluation.
          return;
        }
        scene = createScene(host, {
          quality: sceneQuality,
          fanned: stillFannedRef.current,
          active: isActive(),
          onFirstFrame() {
            if (cancelled || failed) return;
            hasFrame = true;
            setState({ ready: true, status: isActive() ? 'ready' : 'paused', reason: null });
          },
          onFrame(count) {
            if (!cancelled) root.dataset.frameCount = String(count);
          },
          onFallback: fallback,
        });
        sceneRef.current = scene;
      } catch {
        fallback('Illustrated view · 3D unavailable');
      } finally {
        loading = false;
        if (!scene) reconcile();
      }
    };

    function reconcile() {
      if (cancelled || failed) return;
      const active = isActive();
      if (scene) {
        scene.setActive(active);
        if (hasFrame) setState({ ready: true, status: active ? 'ready' : 'paused', reason: null });
        return;
      }
      if (!active) {
        cancelScheduledLoad();
        return;
      }
      if (loading || idleId !== null || timerId !== null || settleCancel !== null) return;
      if (!mayStart()) {
        settleCancel = scrolling.whenQuiet(() => {
          settleCancel = null;
          reconcile();
        });
        return;
      }
      if (typeof window.requestIdleCallback === 'function') {
        idleId = requestedRef.current
          ? window.requestIdleCallback(
              () => {
                void loadScene();
              },
              { timeout: REQUESTED_SCENE_IDLE_TIMEOUT_MS },
            )
          : window.requestIdleCallback(() => {
              void loadScene();
            });
      } else {
        timerId = window.setTimeout(
          () => {
            void loadScene();
          },
          requestedRef.current ? REQUESTED_SCENE_IDLE_TIMEOUT_MS : 1200,
        );
      }
    }

    requestSceneRef.current = () => {
      cancelScheduledLoad();
      reconcile();
    };

    const checkPosition = () => {
      const rect = stage.getBoundingClientRect();
      visible = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
      reconcile();
    };

    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          visible = entry?.isIntersecting === true && entry.intersectionRatio > 0;
          reconcile();
        },
        { threshold: 0.01 },
      );
      observer.observe(stage);
    } else {
      checkPosition();
      window.addEventListener('scroll', checkPosition, { passive: true });
      window.addEventListener('resize', checkPosition);
    }
    document.addEventListener('visibilitychange', reconcile);

    return () => {
      cancelled = true;
      releaseFooterRef.current?.();
      requestSceneRef.current = null;
      cancelScheduledLoad();
      scrolling.dispose();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', reconcile);
      window.removeEventListener('scroll', checkPosition);
      window.removeEventListener('resize', checkPosition);
      scene?.dispose();
      if (sceneRef.current === scene) sceneRef.current = null;
      if (hasFrame) {
        stillFannedRef.current = fannedRef.current;
        setStillFanned(fannedRef.current);
      }
    };
  }, [canRender, sceneQuality, holdFooterHeight]);

  const renderMode = showing ? 'webgl' : 'static';
  const status = !canRender ? 'static' : state.status;
  const Still = illustration.component;
  const motifShown = illustration.failed && !showing;
  // One caption until the view settles: waiting for and loading the 3D scene both read as the illustration they show.
  const explanation = motionReduced
    ? 'Illustrated view · reduced motion'
    : quality === 'lite'
      ? pending
        ? 'Illustrated view'
        : 'Illustrated view · Lite mode'
      : quality === 'auto' && constrained
        ? 'Illustrated view · saving resources'
        : needsInteraction
          ? 'Illustrated view · tap Fan out for 3D'
          : (state.reason ?? (state.ready ? '3D view' : 'Illustrated view'));

  return (
    <figure
      ref={rootRef}
      className="collection-artifact"
      data-render-mode={renderMode}
      data-scene-status={status}
      data-fanned={canInteract && fanned}
      data-activation={canInteract ? (needsInteraction ? 'on-demand' : 'automatic') : 'static'}
      aria-label={motifShown ? 'Static sleeve motif' : undefined}
      aria-describedby={captionId}
    >
      <div ref={stageRef} className="artifact-stage" aria-hidden="true">
        {/* Decorative and absolutely positioned: it paints after the first screen's text, and moves nothing. */}
        <AfterFirstPaint>
          <DeferredArtifactStill onLoad={onIllustrationLoad} />
          {Still ? <Still fanned={canInteract && stillFanned} /> : illustration.failed ? <SleeveMotif /> : null}
        </AfterFirstPaint>
        <div ref={hostRef} className="artifact-canvas" />
      </div>
      <figcaption ref={footerRef} className="artifact-footer">
        <div id={captionId} className="artifact-caption">
          <span className="artifact-caption-title">{motifShown ? 'Static sleeve motif' : 'The 100 game sleeves'}</span>
          <span className="artifact-status">{motifShown ? 'Art unavailable' : explanation}</span>
        </div>
        {canInteract && (
          <button
            type="button"
            className="artifact-control"
            onClick={() => {
              if (!requestedRef.current) {
                requestedRef.current = true;
                setRequested(true);
                requestSceneRef.current?.();
              }
              setFanned((value) => !value);
            }}
            aria-label={fanned ? 'Stack up the collection sleeves' : 'Fan out the collection sleeves'}
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              aria-hidden="true"
              focusable="false"
            >
              {fanned ? (
                <path d="m3 7 7-4 7 4-7 4-7-4Zm0 3 7 4 7-4M3 13l7 4 7-4" />
              ) : (
                <path d="m2 11 3-6 4 2M7 15 6 7l7-1 1 8-7 1Zm6-10 4 1-2 8" />
              )}
            </svg>
            {fanned ? 'Stack up' : 'Fan out'}
          </button>
        )}
      </figcaption>
    </figure>
  );
}
