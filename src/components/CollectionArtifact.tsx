import { useEffect, useId, useRef, useState } from 'react';
import ArtifactStill from './scene/ArtifactStill';
import type { CollectionSceneHandle } from './scene/CollectionScene';
import './scene/artifact.css';

export interface CollectionArtifactProps {
  quality: 'auto' | 'full' | 'lite';
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
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function hasCoarsePointer() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
}

export default function CollectionArtifact({
  quality,
  reducedMotion,
  constrained,
}: CollectionArtifactProps) {
  const captionId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CollectionSceneHandle | null>(null);
  const [fanned, setFanned] = useState(false);
  const fannedRef = useRef(false);
  const [systemReduced, setSystemReduced] = useState(systemReducesMotion);
  const [coarsePointer, setCoarsePointer] = useState(hasCoarsePointer);
  const [requested, setRequested] = useState(false);
  const [state, setState] = useState<SceneState>({ ready: false, status: 'waiting', reason: null });
  const motionReduced = reducedMotion || systemReduced;
  const needsInteraction = quality === 'auto' && coarsePointer && !requested;
  const canRender = !motionReduced && quality !== 'lite' && (quality === 'full' || !constrained) && !needsInteraction;
  const sceneQuality = quality === 'full' ? 'full' : 'auto';

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = window.matchMedia('(pointer: coarse)');
    const update = () => { setSystemReduced(preference.matches); setCoarsePointer(pointer.matches); };
    update();
    preference.addEventListener('change', update);
    pointer.addEventListener('change', update);
    return () => { preference.removeEventListener('change', update); pointer.removeEventListener('change', update); };
  }, []);

  useEffect(() => {
    fannedRef.current = fanned;
    sceneRef.current?.setFanned(fanned);
  }, [fanned]);

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
    let idleId: number | null = null;
    let timerId: number | null = null;
    let observer: IntersectionObserver | null = null;

    const isActive = () => visible && document.visibilityState !== 'hidden';

    function cancelScheduledLoad() {
      if (idleId !== null) window.cancelIdleCallback(idleId);
      if (timerId !== null) window.clearTimeout(timerId);
      idleId = null;
      timerId = null;
    }

    function fallback(reason: string) {
      if (cancelled || failed) return;
      failed = true;
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
      loading = true;
      setState({ ready: false, status: 'loading', reason: null });
      try {
        const { createCollectionScene } = await import('./scene/CollectionScene');
        if (cancelled || failed) return;
        if (!isActive()) {
          setState({ ready: false, status: 'waiting', reason: null });
          return;
        };
        scene = createCollectionScene(host, {
          quality: sceneQuality,
          fanned: fannedRef.current,
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
        fallback('3D is unavailable here. The illustrated view is ready.');
      } finally {
        loading = false;
      }
    }

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
      if (loading || idleId !== null || timerId !== null) return;
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(() => { void loadScene(); }, { timeout: 1200 });
      } else {
        timerId = window.setTimeout(() => { void loadScene(); }, 180);
      }
    }

    const checkPosition = () => {
      const rect = stage.getBoundingClientRect();
      visible = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
      reconcile();
    };

    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        const entry = entries[0];
        visible = entry?.isIntersecting === true && entry.intersectionRatio > 0;
        reconcile();
      }, { threshold: 0.01 });
      observer.observe(stage);
    } else {
      checkPosition();
      window.addEventListener('scroll', checkPosition, { passive: true });
      window.addEventListener('resize', checkPosition);
    }
    document.addEventListener('visibilitychange', reconcile);

    return () => {
      cancelled = true;
      cancelScheduledLoad();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', reconcile);
      window.removeEventListener('scroll', checkPosition);
      window.removeEventListener('resize', checkPosition);
      scene?.dispose();
      if (sceneRef.current === scene) sceneRef.current = null;
    };
  }, [canRender, sceneQuality]);

  const renderMode = canRender && state.ready ? 'webgl' : 'static';
  const status = !canRender ? 'static' : state.status;
  const explanation = motionReduced
    ? 'Illustrated view · reduced motion'
    : quality === 'lite'
      ? 'Illustrated view · Lite mode'
      : quality === 'auto' && constrained
        ? 'Illustrated view · saving resources'
        : needsInteraction
          ? 'Auto · tap Fan out to start 3D'
          : state.reason
          ?? (state.ready
            ? 'A small, interactive collection study.'
            : state.status === 'loading'
              ? 'Illustrated view · 3D is loading'
              : 'Illustrated view · ready to explore');

  return (
    <figure
      ref={rootRef}
      className="collection-artifact"
      data-render-mode={renderMode}
      data-scene-status={status}
      data-fanned={fanned}
      data-activation={needsInteraction ? 'on-demand' : 'automatic'}
      aria-describedby={captionId}
    >
      <div ref={stageRef} className="artifact-stage" aria-hidden="true">
        <ArtifactStill fanned={fanned} />
        <div ref={hostRef} className="artifact-canvas" />
      </div>
      <figcaption className="artifact-footer">
        <div id={captionId} className="artifact-caption">
          <span className="artifact-caption-title">Good things, collected.</span>
          <span className="artifact-status" role="status" aria-live="polite">{explanation}</span>
        </div>
        <button
          type="button"
          className="artifact-control"
          onClick={() => { setRequested(true); setFanned((value) => !value); }}
          aria-label={fanned ? 'Stack up the collection sleeves' : 'Fan out the collection sleeves'}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true" focusable="false">
            {fanned
              ? <path d="m3 7 7-4 7 4-7 4-7-4Zm0 3 7 4 7-4M3 13l7 4 7-4" />
              : <path d="m2 11 3-6 4 2M7 15 6 7l7-1 1 8-7 1Zm6-10 4 1-2 8" />}
          </svg>
          {fanned ? 'Stack up' : 'Fan out'}
        </button>
      </figcaption>
    </figure>
  );
}
