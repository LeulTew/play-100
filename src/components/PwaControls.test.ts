import { createElement } from 'react';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { initialPwaState } from '../pwa/client';
import PwaControls from './PwaControls';

describe('offline controls copy preserves readiness and privacy boundaries', () => {
  it.each(['idle', 'preparing', 'ready'] as const)('describes %s without offering an invented installation', offlineState => {
    const pwa: ComponentProps<typeof PwaControls>['pwa'] = {
      ...initialPwaState, offlineState, online: true,
      install: vi.fn(async () => 'unavailable' as const),
      prepareOffline: vi.fn(async () => true),
      checkForUpdate: vi.fn(async () => {}),
      applyUpdate: vi.fn(async () => false),
    };
    const html = renderToStaticMarkup(createElement(PwaControls, { pwa, open: true, onUpdate: vi.fn(async () => false) }));
    expect(html).toContain('Keep The 100 and this device&#x27;s library available offline.');
    expect(html).toContain('Account services and live catalog details need a connection.');
    expect(html).toContain('does not store private or account responses');
    expect(html).toContain('No install prompt is available here.');
    expect(html).toContain('Workbooks, films, cloud pages and live-provider responses are not downloaded');
    expect(html).toContain(offlineState === 'ready' ? 'Offline files ready' : offlineState === 'preparing' ? 'Preparing offline files…' : 'Enable offline access');
    expect(html.includes('disabled=""')).toBe(offlineState !== 'idle');
    expect(pwa.prepareOffline).not.toHaveBeenCalled();
    expect(html).toContain('<div role="status"></div>');
    const loading = renderToStaticMarkup(createElement(PwaControls, {
      pwa: { ...pwa, message: 'Loading offline controls…', error: 'Connection failed.' },
      open: true, onUpdate: vi.fn(async () => false),
    }));
    expect(loading).toContain('<div role="status"><p>Loading offline controls…</p></div>');
    expect(loading).toContain('<p class="inline-error" role="alert">Connection failed.</p>');
    expect(loading).not.toContain('aria-live="polite"');
    const recovery = renderToStaticMarkup(createElement(PwaControls, {
      pwa: { ...pwa, moduleError: true, error: "The update controls didn't load.", updateState: 'waiting' },
      onUpdate: vi.fn(async () => false),
    }));
    expect(recovery).toContain('role="alert"');
    expect(recovery).toContain('Reload this page');
    expect(recovery).not.toContain('Review app update');
  });
});
