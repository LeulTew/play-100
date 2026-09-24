import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shellMarkup } from '../../scripts/first-paint/shell-html';
import { AppHeader } from '../components/app/AppHeader';
import { MobileNav } from '../components/app/MobileNav';
import CollectionArtifact from '../components/CollectionArtifact';
import CollectionPage from '../components/CollectionPage';
import { pageDestination } from '../lib/page-navigation';
import { emptyPersonalLibrary } from '../lib/personal-library';
import type { AppPage } from '../lib/types';
import { defaultFilters } from '../lib/url';

// The static shell in index.html must equal what React's first commit renders at "/", so the
// first paint and the hydrated page never differ (docs/first-paint-shell.md).
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const html = read('../../index.html');
const appSource = read('../App.tsx');
const routeHostSource = read('../components/app/RouteHost.tsx');
const VARIANTS = ['offline', 'online'] as const;
const STILL = /<svg class="artifact-still"[\s\S]*?<\/svg>/;

const pageHref = (page: AppPage) => {
  const destination = pageDestination(page, defaultFilters);
  return `${destination.path}${destination.search}`;
};

function element(markup: string, start: string, end: string): string {
  const from = markup.indexOf(start);
  const to = from === -1 ? -1 : markup.indexOf(end, from);
  if (to === -1) throw new Error(`Missing ${start}…${end}.`);
  return markup.slice(from, to + end.length);
}

function captured(pattern: RegExp, source: string): string {
  const value = pattern.exec(source)?.[1];
  if (value === undefined) throw new Error(`${pattern} no longer matches; update the shell parity test and index.html together.`);
  return value;
}

/** The shell makes its static controls inert; React's first commit renders them live. */
const withoutShellOnly = (markup: string) => markup.replace(/ inert(?=[ >])/g, '');

/** The shell's artifact markup as one boot-art state shows it. */
function shellArtifact(state: string): string {
  return withoutShellOnly(element(shellMarkup(html, 'offline'), '<figure', '</figure>')
    .replace(/<span data-shell-art="([a-z]+)">([^<]*)<\/span>/g, (_, name: string, text: string) => name === state ? text : '')
    .replace(/<button([^>]*?) data-shell-art="([a-z ]+)"([^>]*)>[\s\S]*?<\/button>/g, (button, _before: string, states: string) =>
      states.split(' ').includes(state) ? button.replace(` data-shell-art="${states}"`, '') : '')
    .split('"p100-shell-art-caption"').join('"caption"'));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('first-paint shell parity with React\'s first commit', () => {
  it('keeps App\'s landing structure: skip link, header, main and the route wrapper', () => {
    const target = captured(/className="skip-link" href=\{page === 'collection' \? '([^']+)'/, appSource);
    const text = captured(/>Skip to \{page === 'collection' \? '([^']+)'/, appSource);
    expect(appSource).toContain('<main id="page-main" ref={mainRef}>');
    expect(routeHostSource).toContain('<div key={scope}>{publicContent(content, route)}</div>');
    for (const variant of VARIANTS) {
      const shell = shellMarkup(html, variant);
      expect(shell.startsWith(`<div id="root"><div class="first-paint-shell" hidden><a class="skip-link" href="${target}">Skip to ${text}</a><header `)).toBe(true);
      expect(shell).toContain('</header><main id="page-main"><div><section class="hero"');
      expect(shell.endsWith(`</section></div></main>${element(shell, '<nav class="mobile-nav"', '</nav>')}</div></div>`)).toBe(true);
    }
  });

  it.each(VARIANTS)('renders the %s header exactly as AppHeader does', variant => {
    const online = variant === 'online';
    const react = renderToStaticMarkup(createElement(AppHeader, {
      page: 'collection', onlineAvailable: online, libraryScope: 'guest',
      // App's first commit is still opening the account whenever online tools exist.
      libraryLabel: online ? captured(/label: onlineOpening \? '([^']+)'/, appSource) : 'Device only',
      syncStatus: 'device', headerIdentity: null, savedCount: 0, animate: false, menuOpen: false, pageHref,
      onNavigateLink: vi.fn(), onQueue: vi.fn(), onMenu: vi.fn(), onAccount: vi.fn(),
    }));
    expect(withoutShellOnly(element(shellMarkup(html, variant), '<header', '</header>'))).toBe(react);
  });

  it.each(VARIANTS)('renders the %s mobile navigation exactly as MobileNav does', variant => {
    const react = renderToStaticMarkup(createElement(MobileNav, {
      page: 'collection', personalPage: 'collection', gamesView: 'library', onlineAvailable: variant === 'online', menuOpen: false,
      pageHref, onNavigateLink: vi.fn(), onBrowseLink: vi.fn(), onMenu: vi.fn(),
    }));
    expect(withoutShellOnly(element(shellMarkup(html, variant), '<nav class="mobile-nav"', '</nav>'))).toBe(react);
  });

  it.each(VARIANTS)('renders the %s hero copy and loading collection exactly as CollectionPage does', variant => {
    // The static markup omits the Magnet wrapper's inline transition, which changes nothing at rest.
    const react = renderToStaticMarkup(createElement(CollectionPage, {
      collection: { status: 'loading', data: null, error: null, retry: vi.fn() },
      state: emptyPersonalLibrary(), filters: defaultFilters, busy: true, motion: 'lite', animate: false,
      reducedMotion: false, coarsePointer: false, constrained: false,
      onFilters: vi.fn(), onAction: vi.fn(async () => true), onOpen: vi.fn(), onPreview: vi.fn(), onShare: vi.fn(),
      onFullLibrary: vi.fn(), notify: vi.fn(),
    })).replace(/ style="[^"]*"/g, '');
    const shell = shellMarkup(html, variant);
    for (const [start, end] of [['<section class="hero"', '<div class="hero-art">'], ['<section class="collection-section"', '</section>']] as const) {
      expect(withoutShellOnly(element(shell, start, end))).toBe(element(react, start, end));
    }
  });

  it.each([
    ['reduced', { quality: 'full', reducedMotion: true, constrained: false }, false],
    ['lite', { quality: 'lite', reducedMotion: false, constrained: false }, false],
    ['saving', { quality: 'auto', reducedMotion: false, constrained: true }, false],
    ['tap', { quality: 'auto', reducedMotion: false, constrained: false }, true],
    ['ready', { quality: 'full', reducedMotion: false, constrained: false }, false],
  ] as const)('shows the %s artifact caption and control that CollectionArtifact renders first', (state, props, coarsePointer) => {
    if (coarsePointer) vi.stubGlobal('window', { matchMedia: (query: string) => ({ matches: query === '(pointer: coarse)' }) });
    const react = renderToStaticMarkup(createElement(CollectionArtifact, props));
    const caption = captured(/aria-describedby="([^"]+)"/, react);
    // Only React paints the decorative still; it is absolutely positioned and moves nothing.
    expect(react).toMatch(STILL);
    expect(shellArtifact(state)).toBe(react.replace(STILL, '').replace(/ data-scene-status="[^"]*"| data-activation="[^"]*"/g, '')
      .split(`"${caption}"`).join('"caption"'));
  });
});
