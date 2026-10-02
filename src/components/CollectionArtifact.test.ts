import { createElement, useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CollectionArtifact, { DeferredArtifactStill } from './CollectionArtifact';

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, useEffect: vi.fn(), useState: vi.fn(react.useState) };
});

afterEach(() => {
  vi.doUnmock('./scene/ArtifactStill');
  vi.resetModules();
  vi.mocked(useEffect).mockReset();
  vi.mocked(useState).mockReset();
  vi.restoreAllMocks();
});

function LoadedStill({ fanned }: { fanned: boolean }) {
  return createElement('svg', { className: 'artifact-still', 'data-fanned': fanned });
}

function startLoading() {
  const onLoad = vi.fn<ComponentProps<typeof DeferredArtifactStill>['onLoad']>();
  renderToStaticMarkup(createElement(DeferredArtifactStill, { onLoad }));
  const effect = vi.mocked(useEffect).mock.lastCall?.[0];
  if (!effect) throw new Error('The illustration must load in its post-paint effect.');
  return { onLoad, dispose: effect() };
}

describe('deferred collection illustration', () => {
  it('waits for the post-paint effect and accepts the actual loaded component', async () => {
    const load = vi.fn(() => ({ default: LoadedStill }));
    vi.doMock('./scene/ArtifactStill', load);
    const onLoad = vi.fn();
    expect(renderToStaticMarkup(createElement(DeferredArtifactStill, { onLoad }))).toBe('');
    expect(load).not.toHaveBeenCalled();
    expect(onLoad).not.toHaveBeenCalled();
    const started = startLoading();
    await vi.dynamicImportSettled();
    expect(started.onLoad).toHaveBeenCalledExactlyOnceWith({ component: LoadedStill, failed: false });
    started.dispose?.();
  });

  it('reports a rejected import as failure rather than caching a successful empty component', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.doMock('./scene/ArtifactStill', () => {
      throw new Error('Synthetic unavailable illustration.');
    });
    const failed = startLoading();
    await vi.dynamicImportSettled();
    expect(failed.onLoad).toHaveBeenCalledExactlyOnceWith({ component: null, failed: true });
    expect(log).toHaveBeenCalledExactlyOnceWith(
      'The collection illustration could not load. A static sleeve motif is shown instead.',
      expect.any(Error),
    );
    failed.dispose?.();

    vi.doUnmock('./scene/ArtifactStill');
    vi.resetModules();
    vi.doMock('./scene/ArtifactStill', () => ({ default: LoadedStill }));
    const recovered = startLoading();
    await vi.dynamicImportSettled();
    expect(recovered.onLoad).toHaveBeenCalledExactlyOnceWith({ component: LoadedStill, failed: false });
    recovered.dispose?.();
  });

  it.each(['success', 'failure'] as const)('ignores a late %s after the loader unmounts', async (result) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.doMock('./scene/ArtifactStill', async () => {
      await gate;
      if (result === 'failure') throw new Error('Synthetic late illustration failure.');
      return { default: LoadedStill };
    });
    const started = startLoading();
    started.dispose?.();
    finish();
    await vi.dynamicImportSettled();
    expect(started.onLoad).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});

describe('collection illustration fallback', () => {
  it.each([
    { quality: 'lite', reducedMotion: false, constrained: false },
    { quality: 'full', reducedMotion: true, constrained: false },
    { quality: 'auto', reducedMotion: false, constrained: true },
  ] as const)('shows an honestly named, embedded sleeve motif in static $quality mode', (props) => {
    vi.mocked(useState).mockReturnValueOnce([{ component: null, failed: true }, vi.fn()]);
    const html = renderToStaticMarkup(createElement(CollectionArtifact, props));
    expect(html).toContain('aria-label="Static sleeve motif"');
    expect(html).toContain('class="artifact-caption-title">Static sleeve motif</span>');
    expect(html).toContain('class="artifact-status">Art unavailable</span>');
    expect(html).not.toContain('Illustrated view');
    expect(html).toContain('class="artifact-still" data-artifact-fallback=""');
    expect(html).toContain('viewBox="0 0 600 360"');
    expect(html).toContain('aria-hidden="true" focusable="false"');
    for (const token of ['ink', 'wash', 'paper', 'lime']) expect(html).toContain(`var(--${token})`);
    expect(html).not.toMatch(/<img\b|<image\b|<canvas\b|<text\b|class="artifact-control"/);
    expect(html).toContain('data-activation="static"');
  });

  it('replaces the failure caption when an illustration is available', () => {
    vi.mocked(useState).mockReturnValueOnce([{ component: LoadedStill, failed: false }, vi.fn()]);
    const html = renderToStaticMarkup(
      createElement(CollectionArtifact, { quality: 'lite', reducedMotion: false, constrained: false }),
    );
    expect(html).toContain('class="artifact-still"');
    expect(html).toContain('Illustrated view · Lite mode');
    expect(html).toContain('The 100 game sleeves');
    expect(html).not.toMatch(/data-artifact-fallback|Static sleeve motif|Art unavailable/);
  });

  it('allows a rendered 3D frame to supersede a failed still without mislabelling the scene', () => {
    vi.mocked(useState).mockReturnValueOnce([{ component: null, failed: true }, vi.fn()]);
    for (let index = 0; index < 5; index++) vi.mocked(useState).mockReturnValueOnce([false, vi.fn()]);
    vi.mocked(useState).mockReturnValueOnce([{ ready: true, status: 'ready', reason: null }, vi.fn()]);
    const html = renderToStaticMarkup(
      createElement(CollectionArtifact, { quality: 'full', reducedMotion: false, constrained: false }),
    );
    expect(html).toContain('data-render-mode="webgl"');
    expect(html).toContain('class="artifact-status">3D view</span>');
    expect(html).toContain('The 100 game sleeves');
    expect(html).toContain('aria-label="Fan out the collection sleeves"');
    expect(html).not.toMatch(/Static sleeve motif|Art unavailable/);
  });
});
