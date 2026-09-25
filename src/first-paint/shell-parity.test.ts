import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ts from 'typescript';
import { sourceNodes, sourceTokens } from '../../scripts/source-contract';
import { NOTICE_OPEN, bootNotice, shellMarkup } from '../../scripts/first-paint/shell-html';
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
const appSyntax = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const VARIANTS = ['offline', 'online'] as const;
const STILL = /<svg class="artifact-still"[\s\S]*?<\/svg>/;

// Lower JSX without executing the app so React's text/space semantics, rather
// than the source layout, remain the contract.
function jsxCalls(source: string): ts.CallExpression[] {
  const emitted = ts.transpileModule(source, {
    fileName: 'contract.tsx',
    compilerOptions: { jsx: ts.JsxEmit.React, jsxFactory: 'jsx', target: ts.ScriptTarget.ESNext },
  }).outputText;
  const syntax = ts.createSourceFile('contract.js', emitted, ts.ScriptTarget.Latest, true);
  return sourceNodes(syntax, ts.isCallExpression).filter(
    (call) => ts.isIdentifier(call.expression) && call.expression.text === 'jsx',
  );
}

function property(object: ts.Node | undefined, name: string): ts.Expression | undefined {
  if (!object || !ts.isObjectLiteralExpression(object)) return undefined;
  return object.properties.find(
    (item): item is ts.PropertyAssignment =>
      ts.isPropertyAssignment(item) &&
      (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) &&
      item.name.text === name,
  )?.initializer;
}

function stringValue(node: ts.Node | undefined): string {
  if (!node || !ts.isStringLiteral(node))
    throw new Error('Expected a literal string in the first-paint source contract.');
  return node.text;
}

function firstBranch(node: ts.Expression | undefined, condition: string): string {
  if (!node || !ts.isConditionalExpression(node)) throw new Error('Expected the first-paint conditional.');
  expect(sourceTokens(node.condition.getText())).toBe(sourceTokens(condition));
  return stringValue(node.whenTrue);
}

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
  if (value === undefined)
    throw new Error(`${pattern} no longer matches; update the shell parity test and index.html together.`);
  return value;
}

/**
 * The shell disables the controls only the app can run, with a bare `disabled`, and React's first commit renders them
 * enabled. Pick for me, which React's first commit disables too, keeps React's own `disabled=""`.
 */
const withoutShellOnly = (markup: string) => markup.replace(/ disabled(?=[ >])/g, '');

/** The shell's artifact markup as one boot-art state shows it. */
function shellArtifact(state: string): string {
  return withoutShellOnly(
    element(shellMarkup(html, 'offline'), '<figure', '</figure>')
      .replace(/<span data-shell-art="([a-z]+)">([^<]*)<\/span>/g, (_, name: string, text: string) =>
        name === state ? text : '',
      )
      .replace(
        /<button([^>]*?) data-shell-art="([a-z ]+)"([^>]*)>[\s\S]*?<\/button>/g,
        (button, _before: string, states: string) =>
          states.split(' ').includes(state) ? button.replace(` data-shell-art="${states}"`, '') : '',
      )
      .split('"p100-shell-art-caption"')
      .join('"caption"'),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("first-paint shell parity with React's first commit", () => {
  it('ignores JSX source layout without erasing meaningful text spaces or wrapper arguments', () => {
    const compact = 'const view = <div key={scope}>{publicContent(content, route)}</div>;';
    const expanded = 'const view = <div\n key={scope}\n>\n {publicContent(\ncontent,\nroute,\n)}\n</div>;';
    const calls = (source: string) => jsxCalls(source).map((call) => sourceTokens(call.getText()));
    expect(calls(expanded)).toEqual(calls(compact));
    expect(calls(compact.replace('key={scope}', 'key={route}'))).not.toEqual(calls(compact));
    expect(calls('const view = <a>Skip to {name}</a>;')).not.toEqual(calls('const view = <a>Skip to{name}</a>;'));
  });

  it("keeps App's landing structure: skip link, header, main and the route wrapper", () => {
    const calls = jsxCalls(appSource);
    const skip = calls.find((call) => {
      const tag = call.arguments[0];
      const className = property(call.arguments[1], 'className');
      return (
        tag &&
        ts.isStringLiteral(tag) &&
        tag.text === 'a' &&
        className &&
        sourceTokens(className.getText()) === sourceTokens("'skip-link'")
      );
    });
    if (!skip) throw new Error('Missing the first-paint skip link.');
    const target = firstBranch(property(skip.arguments[1], 'href'), "page === 'collection'");
    expect(stringValue(skip.arguments[2])).toBe('Skip to ');
    const text = firstBranch(skip.arguments[3], "page === 'collection'");
    const main = calls.find(
      (call) => call.arguments[0] && ts.isStringLiteral(call.arguments[0]) && call.arguments[0].text === 'main',
    );
    expect(sourceTokens(`(${main?.arguments[1]?.getText() ?? ''})`)).toBe(
      sourceTokens('({ id: "page-main", ref: mainRef })'),
    );
    expect(jsxCalls(routeHostSource).map((call) => sourceTokens(call.getText()))).toContain(
      sourceTokens('jsx("div", { key: scope }, publicContent(content, route))'),
    );
    for (const variant of VARIANTS) {
      const shell = shellMarkup(html, variant);
      expect(
        shell.startsWith(
          `<div id="root"><div class="first-paint-shell" hidden><a class="skip-link" href="${target}">Skip to ${text}</a><header `,
        ),
      ).toBe(true);
      expect(shell).toContain('</header><main id="page-main"><div><section class="hero"');
      // The boot script's failure notice follows the shell, and React's first commit replaces both.
      expect(
        shell.endsWith(
          `</section></div></main>${element(shell, '<nav class="mobile-nav"', '</nav>')}</div>${bootNotice(shell)}</div>`,
        ),
      ).toBe(true);
    }
  });

  it.each(VARIANTS)('makes every %s shell control a working link or a disabled button, never inert', (variant) => {
    const markup = shellMarkup(html, variant);
    // Only the shell: the failure notice after it is hidden unless the app cannot start, and then works without it.
    const shell = markup.slice(0, markup.indexOf(NOTICE_OPEN));
    expect(shell).not.toMatch(/ inert(?=[ >=])/);
    const links = [...shell.matchAll(/<a\b[^>]*>/g)].map(([tag]) => tag);
    expect(links.filter((tag) => !/ href="[^"]+"/.test(tag))).toEqual([]);
    // Nothing in the static shell can run a button, so each one shows that it waits for the app: with React's own
    // `disabled=""` where its first commit disables it too, otherwise with the shell's bare `disabled`.
    const buttons = [...shell.matchAll(/<button\b[^>]*>/g)].map(([tag]) => tag);
    const shellOnly = buttons.filter((tag) => / disabled(?=[ >])/.test(tag));
    expect(buttons.filter((tag) => !/ disabled(?:="")?(?=[ >])/.test(tag))).toEqual([]);
    expect(buttons.filter((tag) => tag.includes(' disabled=""'))).toEqual([
      '<button class="button button-quiet" disabled="">',
    ]);
    expect(shellOnly.map((tag) => /\bclass="([^"]+)"/.exec(tag)?.[1] ?? 'mobile Menu')).toEqual([
      'saved-nav',
      'menu-nav',
      'artifact-control',
      'mobile Menu',
    ]);
  });

  it.each(VARIANTS)('renders the %s header exactly as AppHeader does', (variant) => {
    const online = variant === 'online';
    const react = renderToStaticMarkup(
      createElement(AppHeader, {
        page: 'collection',
        onlineAvailable: online,
        libraryScope: 'guest',
        // App's first commit is still opening the account whenever online tools exist.
        libraryLabel: online
          ? firstBranch(
              sourceNodes(appSyntax, ts.isPropertyAssignment).find(
                (item) =>
                  ts.isIdentifier(item.name) &&
                  item.name.text === 'label' &&
                  ts.isConditionalExpression(item.initializer) &&
                  sourceTokens(item.initializer.condition.getText()) === sourceTokens('onlineOpening'),
              )?.initializer,
              'onlineOpening',
            )
          : 'Device only',
        syncStatus: 'device',
        headerIdentity: null,
        savedCount: 0,
        animate: false,
        menuOpen: false,
        pageHref,
        onNavigateLink: vi.fn(),
        onQueue: vi.fn(),
        onMenu: vi.fn(),
        onAccount: vi.fn(),
      }),
    );
    expect(withoutShellOnly(element(shellMarkup(html, variant), '<header', '</header>'))).toBe(react);
  });

  it.each(VARIANTS)('renders the %s mobile navigation exactly as MobileNav does', (variant) => {
    const react = renderToStaticMarkup(
      createElement(MobileNav, {
        page: 'collection',
        personalPage: 'collection',
        gamesView: 'library',
        onlineAvailable: variant === 'online',
        menuOpen: false,
        pageHref,
        onNavigateLink: vi.fn(),
        onBrowseLink: vi.fn(),
        onMenu: vi.fn(),
      }),
    );
    expect(withoutShellOnly(element(shellMarkup(html, variant), '<nav class="mobile-nav"', '</nav>'))).toBe(react);
  });

  it.each(VARIANTS)('renders the %s hero copy and loading collection exactly as CollectionPage does', (variant) => {
    // The static markup omits the Magnet wrapper's inline transition, which changes nothing at rest.
    const react = renderToStaticMarkup(
      createElement(CollectionPage, {
        collection: { status: 'loading', data: null, error: null, retry: vi.fn() },
        state: emptyPersonalLibrary(),
        filters: defaultFilters,
        busy: true,
        motion: 'lite',
        animate: false,
        reducedMotion: false,
        coarsePointer: false,
        constrained: false,
        onFilters: vi.fn(),
        onAction: vi.fn(async () => true),
        onOpen: vi.fn(),
        onPreview: vi.fn(),
        onShare: vi.fn(),
        onFullLibrary: vi.fn(),
        notify: vi.fn(),
      }),
    ).replace(/ style="[^"]*"/g, '');
    const shell = shellMarkup(html, variant);
    for (const [start, end] of [
      ['<section class="hero"', '<div class="hero-art">'],
      ['<section class="collection-section"', '</section>'],
    ] as const) {
      expect(withoutShellOnly(element(shell, start, end))).toBe(element(react, start, end));
    }
  });

  it.each([
    ['reduced', { quality: 'full', reducedMotion: true, constrained: false }, false],
    ['lite', { quality: 'lite', reducedMotion: false, constrained: false }, false],
    ['saving', { quality: 'auto', reducedMotion: false, constrained: true }, false],
    ['tap', { quality: 'auto', reducedMotion: false, constrained: false }, true],
    ['ready', { quality: 'full', reducedMotion: false, constrained: false }, false],
  ] as const)(
    'shows the %s artifact caption and control that CollectionArtifact renders first',
    (state, props, coarsePointer) => {
      if (coarsePointer)
        vi.stubGlobal('window', { matchMedia: (query: string) => ({ matches: query === '(pointer: coarse)' }) });
      const react = renderToStaticMarkup(createElement(CollectionArtifact, props));
      const caption = captured(/aria-describedby="([^"]+)"/, react);
      // Only React paints the decorative still; it is absolutely positioned and moves nothing.
      expect(react).toMatch(STILL);
      expect(shellArtifact(state)).toBe(
        react
          .replace(STILL, '')
          .replace(/ data-scene-status="[^"]*"| data-activation="[^"]*"/g, '')
          .split(`"${caption}"`)
          .join('"caption"'),
      );
    },
  );
});
