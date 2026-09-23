import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GlobalBanners } from './GlobalBanners';
import type { GlobalBannersProps } from './GlobalBanners';
import { RouteFallback } from './RouteFallback';

const bannerProps = (): GlobalBannersProps => ({
  warning: null, onlineConfigError: null, offline: false, offlineReady: false, hintError: '',
  onSettings: vi.fn(), onAccount: vi.fn(), onDeviceOnly: vi.fn(),
});

describe('app status host', () => {
  it('adds no wrapper or status when there is nothing to report', () => {
    expect(renderToStaticMarkup(createElement(GlobalBanners, bannerProps()))).toBe('');
  });

  it('preserves independent alert/status branches and their order', () => {
    const props = { ...bannerProps(), warning: 'Device warning', onlineConfigError: 'Configuration warning', offline: true, hintError: 'Account warning' };
    const html = renderToStaticMarkup(createElement(GlobalBanners, props));
    expect(html.match(/class="global-storage"/g)).toHaveLength(4);
    expect(html.match(/role="alert"/g)).toHaveLength(3);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html.indexOf('Device warning')).toBeLessThan(html.indexOf('Configuration warning'));
    expect(html.indexOf('Configuration warning')).toBeLessThan(html.indexOf('You are offline.'));
    expect(html.indexOf('You are offline.')).toBeLessThan(html.indexOf('Account warning'));
    expect(html).toContain('Open Account');
    expect(html).toContain('Use this device only');
    expect(html).toContain('Your libraries have not been cleared.');
    expect(props.onAccount).not.toHaveBeenCalled();
    expect(props.onDeviceOnly).not.toHaveBeenCalled();
  });

  it.each([false, true])('retains offline preparation and scope distinctions (ready=%s)', offlineReady => {
    const html = renderToStaticMarkup(createElement(GlobalBanners, { ...bannerProps(), offline: true, offlineReady }));
    expect(html).toContain(offlineReady ? 'Prepared public files' : 'prepare offline access when connected');
    expect(html).toContain('Cloud saving and live source lookups need a connection.');
    expect(html).toContain('Account and guest libraries remain separate.');
  });
});

describe('route fallback host', () => {
  it.each([
    ['public-page', '<h2>Opening your page...</h2>', 'Your games stay right where you left them.'],
    ['cloud-page', '<h1>Loading...</h1>', 'Loading...'],
    ['private-library', '<h2>Opening your saved library...</h2>', 'Waiting for the correct guest or account scope before allowing edits.'],
  ] as const)('retains the %s status markup', (kind, heading, explanation) => {
    const html = renderToStaticMarkup(createElement(RouteFallback, { route: 'games', kind }));
    expect(html).toContain('class="page-loading" role="status"');
    expect(html).toContain(heading);
    expect(html).toContain(explanation);
    expect(html).not.toContain('<dialog');
  });

  it('keeps cold sign-in in a native dialog with its existing focus target', () => {
    const onClose = vi.fn();
    const getReturnFocus = vi.fn(() => null);
    const html = renderToStaticMarkup(createElement(RouteFallback, { route: 'collection', kind: 'account-sheet', onClose, getReturnFocus }));
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-labelledby="loading-account-title"');
    expect(html).toContain('id="loading-account-title"');
    expect(html).toContain('data-autofocus="true" tabindex="-1">Opening sign-in...</h2>');
    expect(onClose).not.toHaveBeenCalled();
    expect(getReturnFocus).not.toHaveBeenCalled();
  });
});
