import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GlobalBanners } from './GlobalBanners';
import type { GlobalBannersProps } from './GlobalBanners';
import { RouteFallback } from './RouteFallback';
import { AppHeader } from './AppHeader';
import { MobileNav } from './MobileNav';
import { DialogHost } from './DialogHost';
import type { DialogHostProps } from './DialogHost';
import { TrayHost } from './TrayHost';
import { CompareTrayContext } from '../compare-tray/compare-tray-context';
import { discoveryFixture } from '../../lib/discovery-test-fixtures';

const dialogs = (): DialogHostProps => ({
  page: 'collection', game: null, catalog: null, loadingGame: false, canonicalError: null, missingGame: false,
  onCloseGame: vi.fn(), menu: null, about: null, settings: null, manualShare: null,
});

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
    expect(html).toContain(offlineReady ? 'Prepared app files and saved device games can work offline.' : 'Enable offline access in Settings when connected.');
    expect(html).toContain('Cloud saving and live lookups need a connection.');
    expect(html).toContain('Guest and account libraries stay separate.');
  });
});

describe('contextual tray host', () => {
  it.each(['collection', 'games', 'discover', 'compare'] as const)('forwards the current %s route without invoking or changing actions', page => {
    const onCompare = vi.fn();
    const value = {
      currentScope: 'guest', items: [discoveryFixture.record], persistent: true,
      warning: null, error: null, status: '', dragging: false,
      pin: vi.fn(() => true), unpin: vi.fn(() => true), clear: vi.fn(() => true), dismissError: vi.fn(),
    };
    const html = renderToStaticMarkup(createElement(CompareTrayContext.Provider, { value },
      createElement(TrayHost, { page, tray: { page: page === 'collection' ? 'games' : 'collection', onCompare } })));
    expect(html).toContain(`data-compact="${page !== 'collection'}"`);
    expect(html).toContain('Open Compare tray, 1 game');
    expect(onCompare).not.toHaveBeenCalled();
    expect(value.pin).not.toHaveBeenCalled();
  });
});

describe('route fallback host', () => {
  it.each([
    ['public-page', 'Loading My games…'],
    ['cloud-page', 'Loading My games…'],
    ['private-library', 'Waiting for the correct guest or account scope before allowing edits.'],
  ] as const)('retains a truthful %s status without guessing private contents', (kind, explanation) => {
    const html = renderToStaticMarkup(createElement(RouteFallback, { route: 'games', kind }));
    expect(html).toContain('class="app-page route-fallback" aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('<h1>My games</h1>');
    expect(html).toContain(explanation);
    expect(html).not.toContain('<dialog');
    expect(html).toContain('aria-hidden="true" inert=""');
    expect(html).not.toMatch(/<(input|button)\b/);
  });

  it('keeps cold sign-in in a native dialog with its existing focus target', () => {
    const onClose = vi.fn();
    const getReturnFocus = vi.fn(() => null);
    const html = renderToStaticMarkup(createElement(RouteFallback, { route: 'collection', kind: 'account-sheet', onClose, getReturnFocus }));
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-labelledby="loading-account-title"');
    expect(html).toContain('id="loading-account-title"');
    expect(html).toContain('data-autofocus="true" tabindex="-1">Sign in</h2>');
    expect(html).toContain('role="status">Loading sign-in…</p>');
    expect(html).not.toContain('<input');
    expect(onClose).not.toHaveBeenCalled();
    expect(getReturnFocus).not.toHaveBeenCalled();
  });
});

describe('navigation and dialog hosts', () => {
  it.each([0, 1, 2])('names the header queue count without repeating its purpose (%i)', savedCount => {
    const html = renderToStaticMarkup(createElement(AppHeader, {
      page: 'collection', onlineAvailable: false, libraryScope: 'guest', libraryLabel: 'Device only', syncStatus: 'device',
      headerIdentity: null, savedCount, animate: false, menuOpen: false,
      pageHref: page => `/${page}`, onNavigateLink: vi.fn(), onQueue: vi.fn(), onMenu: vi.fn(), onAccount: vi.fn(),
    }));
    expect(html).toContain(`aria-label="Play later, ${savedCount} ${savedCount === 1 ? 'game' : 'games'}"`);
    expect(html).not.toContain('in your queue');
  });

  it('retains header selectors, navigation order and verified display inputs', () => {
    const html = renderToStaticMarkup(createElement(AppHeader, {
      page: 'discover', onlineAvailable: true, libraryScope: 'guest', libraryLabel: 'Device only', syncStatus: 'device',
      headerIdentity: null, savedCount: 3, animate: false, menuOpen: true,
      pageHref: page => `/${page}`, onNavigateLink: vi.fn(), onQueue: vi.fn(), onMenu: vi.fn(), onAccount: vi.fn(),
    }));
    expect(html).toMatch(/^<header class="site-header site-header-online">/);
    expect(html).toContain('class="menu-nav" aria-haspopup="dialog" aria-expanded="true"');
    expect(html).toContain('href="/discover" aria-current="page"');
    expect(html.indexOf('>The 100</a>')).toBeLessThan(html.indexOf('>Discover</a>'));
    expect(html.indexOf('>Discover</a>')).toBeLessThan(html.indexOf('>My games</a>'));
    expect(html).toContain('aria-label="Account Device only"');
    expect(html).not.toContain('title="Device only"');
    expect(html).toContain('aria-label="Download enhanced Excel workbook"');
    expect(html).not.toContain('title="Download Excel"');
    expect(html).toContain('aria-label="Play later, 3 games"');
    expect(html).toContain('class="saved-count"><span class="sr-only">3</span>');
  });

  it.each([false, true])('retains mobile online navigation choice (online=%s)', onlineAvailable => {
    const html = renderToStaticMarkup(createElement(MobileNav, {
      page: 'games', personalPage: 'rankings', gamesView: 'ranking', onlineAvailable, menuOpen: false,
      pageHref: page => `/${page}`, onNavigateLink: vi.fn(), onBrowseLink: vi.fn(), onMenu: vi.fn(),
    }));
    expect(html).toMatch(/^<nav class="mobile-nav" aria-label="Mobile navigation">/);
    expect(html).toContain(onlineAvailable ? 'href="/friends"' : 'href="/rankings" aria-current="page"');
    expect(html).not.toContain(onlineAvailable ? 'href="/rankings"' : 'href="/friends"');
  });

  it('does not mount dialogs or wrappers for inactive branches', () => {
    expect(renderToStaticMarkup(createElement(DialogHost, dialogs()))).toBe('');
  });

  it('preserves separate missing-game scope copy and the native manual-share dialog', () => {
    const missing = renderToStaticMarkup(createElement(DialogHost, { ...dialogs(), page: 'games', missingGame: true }));
    expect(missing).toContain('Guest and account libraries stay separate.');
    expect(missing).toContain('id="missing-game-title"');
    const sharing = renderToStaticMarkup(createElement(DialogHost, {
      ...dialogs(), manualShare: { link: 'https://example.com/?game=one', onClose: vi.fn() },
    }));
    expect(sharing).toContain('aria-labelledby="share-title"');
    expect(sharing).toContain('id="share-link"');
    expect(sharing).toContain('Your private progress isn&#x27;t included.');
  });
});
