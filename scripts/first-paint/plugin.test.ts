import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readFirebaseConfiguration } from '../../src/lib/online-config.ts';
import {
  assertCharsetDeclaration, assertFallbackCoverage, assertInlineSafe, assertNoCssImports, assertRootFontStacks, assertRootRelativeUrls, assertShellNeutralCss,
  beastiesOptions, criticalAppCss, DEFERRED_TEMPLATE_ID, firstPaintShell, firstPaintVariant, inlineFirstPaintShell, minifyShellCss, startupTags, stripBootScript,
} from './plugin.ts';
import { cspProblems, sha256Source } from './csp.ts';
import { removeShell, shellMarkup, shellText } from './shell-html.ts';
import { eagerHtmlFiles } from '../check-budgets.ts';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const indexHtml = read('index.html');
const bootJs = read('src/first-paint/boot.js');
const shellCss = read('src/first-paint/shell.css');
const offlineRoot = shellMarkup(indexHtml, 'offline');

// The entry stylesheet's font faces as Vite and Lightning CSS emit them.
const FONT_FACES = [
  '@font-face{font-family:Barlow Condensed;font-style:normal;font-display:swap;font-weight:700;src:url(/assets/barlow-condensed-latin-700-normal-v1xN8_Wq.woff2)format("woff2"),url(/assets/barlow-condensed-latin-700-normal-Dmwat-ge.woff)format("woff")}',
  '@font-face{font-family:Barlow Condensed;font-style:normal;font-display:swap;font-weight:800;src:url(/assets/barlow-condensed-latin-800-normal-BKzMuPgK.woff2)format("woff2"),url(/assets/barlow-condensed-latin-800-normal-e9GbPXiK.woff)format("woff")}',
  '@font-face{font-family:Hanken Grotesk Variable;font-style:normal;font-display:swap;font-weight:100 900;src:url(/assets/hanken-grotesk-latin-ext-wght-normal-Dg-wlmqe.woff2)format("woff2-variations");unicode-range:U+100-2BA,U+2BD-2C5,U+2C7-2CC,U+2CE-2D7,U+2DD-2FF,U+304,U+308,U+329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}',
  '@font-face{font-family:Hanken Grotesk Variable;font-style:normal;font-display:swap;font-weight:100 900;src:url(/assets/hanken-grotesk-latin-wght-normal-CaVRRdDk.woff2)format("woff2-variations");unicode-range:U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}',
].join('');

// The tags the public-metadata plugin adds with Vite's default head-prepend placement.
const VITE_HEAD_TAGS = '\n    <meta name="author" content="Leul Tewodros Agonafer">' +
  '\n    <link rel="preload" href="/assets/barlow-condensed-latin-800-normal-BKzMuPgK.woff2" as="font" type="font/woff2" crossorigin="anonymous">' +
  '\n    <link rel="preload" href="/data/collection.json" as="fetch" type="application/json" crossorigin="anonymous">\n';
// Vite's own tags, which it injects before </head>: the module entry, its modulepreloads and the entry stylesheet.
const VITE_ENTRY_TAGS = '    <script type="module" crossorigin src="/assets/index-AAAAAAAA.js"></script>\n' +
  '    <link rel="modulepreload" crossorigin href="/assets/vendor-CCCCCCCC.js">\n' +
  '    <link rel="stylesheet" crossorigin href="/assets/index-BBBBBBBB.css">\n';

/** index.html as Vite's build hands it to post hooks: prepended tags, entry script, modulepreload and stylesheet in <head>. */
function builtIndexHtml(): string {
  const built = indexHtml.replace('  <head>', `  <head>${VITE_HEAD_TAGS}`).replace('    <script type="module" src="/src/main.tsx"></script>\n', '')
    .replace('  </head>', `${VITE_ENTRY_TAGS}  </head>`);
  expect(built).not.toContain('/src/main.tsx');
  expect(built).toContain('/assets/index-BBBBBBBB.css');
  return built;
}

/** The startup tags in the order the boot script inserts them, as the template holds them. */
const TEMPLATE_CONTENT = '<script type="module" crossorigin src="/assets/index-AAAAAAAA.js"></script>' +
  '<link rel="modulepreload" crossorigin href="/assets/vendor-CCCCCCCC.js">' +
  '<link rel="stylesheet" crossorigin href="/assets/index-BBBBBBBB.css">' +
  '<link rel="preload" href="/assets/barlow-condensed-latin-800-normal-BKzMuPgK.woff2" as="font" type="font/woff2" crossorigin="anonymous">' +
  '<link rel="preload" href="/data/collection.json" as="fetch" type="application/json" crossorigin="anonymous">';

describe('first-paint boot script', () => {
  it('drops comments and indentation but keeps every statement', () => {
    const source = '/* global window */\r\n// leading note\r\n(function () {\r\n  // inner note\r\n  var a = 1; /* inline */\r\n  return a;\r\n})();\r\n';
    expect(stripBootScript(source)).toBe('(function () {\nvar a = 1;\nreturn a;\n})();');
    expect(stripBootScript(source.replaceAll('\r\n', '\n'))).toBe(stripBootScript(source));
  });

  it('refuses a script that comment stripping would break', () => {
    expect(() => stripBootScript("var a = '/*'; var b = 1; /* note */")).toThrow(SyntaxError);
  });

  it('ships src/first-paint/boot.js as a small comment-free classic script', () => {
    const script = stripBootScript(bootJs);
    expect(script.startsWith('(function () {\nvar accept = function () {\n')).toBe(true);
    expect(script.endsWith('\n})();')).toBe(true);
    expect(script).not.toMatch(/^\s*\/\/|\/\*/m);
    expect(script).toContain("root.setAttribute('data-boot', 'landing');");
    // The loader reads the template the build writes.
    expect(script).toContain(`document.getElementById('${DEFERRED_TEMPLATE_ID}')`);
    expect(/^[\x20-\x7e\n]*$/.test(script)).toBe(true);
    expect(() => assertInlineSafe('script', script)).not.toThrow();
  });
});

describe('inline safety', () => {
  it.each([
    ['style', 'a{content:"</style>"}'], ['style', 'a{content:"</STYLE"}'], ['style', '<!--a{}'],
    ['script', 'var a = "</script>";'], ['script', '<!-- var a;'],
  ] as const)('rejects %s content that would end the element early: %s', (kind, content) => {
    expect(() => assertInlineSafe(kind, content)).toThrow('would end the element early');
  });

  it('accepts ordinary CSS and scripts', () => {
    expect(() => assertInlineSafe('style', '.a>b{color:red}')).not.toThrow();
    expect(() => assertInlineSafe('script', 'if (a < b && c > d) e();')).not.toThrow();
  });

  it('refuses entry-stylesheet selectors that differ between the shell and React', () => {
    for (const css of ['[inert]{opacity:.5}', '.a[style*=x]{}', '.collection-artifact[data-activation=automatic] b{}',
      '.collection-artifact[data-scene-status=ready]{}', '[data-shell-art]{}', 'html[data-boot-art=lite] a{}', '.first-paint-shell{}']) {
      expect(() => assertShellNeutralCss(css), css).toThrow('differs between the first-paint shell');
    }
    expect(() => assertShellNeutralCss('.collection-artifact[data-render-mode=webgl] .artifact-canvas{visibility:visible}')).not.toThrow();
  });

  it('allows only URLs that resolve the same from index.html', () => {
    expect(() => assertRootRelativeUrls('a{background:url(/assets/a.png)}b{mask:url("data:image/svg+xml,%3Csvg%3E")}c{fill:url(#g)}d{b:url(https://example.com/a)}')).not.toThrow();
    for (const url of ['url(a.png)', 'url(../assets/a.png)', "url('./a.png')", 'url(//cdn.example/a.png)']) {
      expect(() => assertRootRelativeUrls(`a{background:${url}}`), url).toThrow('would resolve against index.html');
    }
  });
});

describe('charset declaration', () => {
  const at = (offset: number) => `<!--${'x'.repeat(offset - 7)}--><meta charset="UTF-8" />`;

  it('passes documents whose declaration fits within the first 1024 bytes and reports its byte offset', () => {
    expect(assertCharsetDeclaration(indexHtml)).toBe(46);
    expect(assertCharsetDeclaration(builtIndexHtml())).toBe(359);
    expect(assertCharsetDeclaration(at(999))).toBe(999);
  });

  it('fails the build when the declaration would end beyond the first 1024 bytes, naming its byte offset', () => {
    expect(() => assertCharsetDeclaration(at(1000))).toThrow('at byte 1000;');
    expect(() => assertCharsetDeclaration(at(1127))).toThrow('index.html declares <meta charset> at byte 1127; it must start before byte 1000');
    // Bytes, not UTF-16 code units: 340 characters before the declaration are 1006 bytes.
    expect(() => assertCharsetDeclaration(`<!--${'…'.repeat(333)}--><meta charset="UTF-8" />`)).toThrow('at byte 1006;');
    expect(() => assertCharsetDeclaration('<!doctype html><html><head><title>Play 100</title></head></html>')).toThrow('no <meta charset>');
  });
});

describe('first-paint variant', () => {
  it.each([
    ['production', undefined, {}, 'offline'],
    ['production', undefined, { VITE_FIREBASE_API_KEY: 'incomplete' }, null],
    ['cloud-test', 'true', {}, 'online'],
    ['cloud-test', 'true', { VITE_FIREBASE_API_KEY: 'incomplete' }, 'online'],
    ['cloud-test', 'false', { VITE_FIREBASE_API_KEY: 'incomplete' }, null],
    ['cloud-test', undefined, {}, 'offline'],
    ['development', 'true', {}, 'offline'],
  ] as const)('%s with emulators=%s and %j renders the %s header', (mode, emulators, environment, expected) => {
    expect(firstPaintVariant(mode, emulators, readFirebaseConfiguration(environment))).toBe(expected);
  });

  it('renders the online header when the public Firebase configuration is complete', () => {
    expect(firstPaintVariant('production', undefined, { config: { apiKey: 'set' }, error: null })).toBe('online');
  });
});

describe('beasties critical CSS', () => {
  it('uses the reviewed options', () => {
    const options = beastiesOptions({});
    expect(options).toMatchObject({
      external: false, fonts: false, mergeStylesheets: true, reduceInlineStyles: true, keyframes: 'critical',
      compress: true, safeParser: false, dedupeWarnings: false,
    });
    expect(options.allowRules).toEqual([/^:/]);
    expect(options).not.toHaveProperty('preload');
    expect(options).not.toHaveProperty('inlineFonts');
    expect(options).not.toHaveProperty('preloadFonts');
  });

  it('keeps the rules that can apply inside the shell and drops the rest', async () => {
    const css = [
      ':root{--ink:#20231e}', ':where(button,a){scroll-margin-block:8px}', 'body{margin:0}',
      '.hero-copy h1{font-size:64px}', '.button-dark:hover{color:red}', '.game-card{color:blue}', '#root .wordmark{color:green}',
      '@media (max-width:760px){.mobile-nav{display:flex}.games-grid{gap:1px}}',
      '@keyframes pulse{0%{opacity:0}to{opacity:1}}', '.loading-jackets span{animation:pulse 1s}', '@keyframes unused{0%{opacity:0}to{opacity:1}}',
      '@font-face{font-family:Barlow Condensed;src:url(/assets/b.woff2)format("woff2")}',
    ].join('');
    const critical = await criticalAppCss(css, offlineRoot);
    for (const kept of [':root{--ink:#20231e}', ':where(button,a){scroll-margin-block:8px}', 'body{margin:0}', '.hero-copy h1{font-size:64px}',
      '.button-dark:hover{color:red}', '.mobile-nav{display:flex}', '@keyframes pulse', '.loading-jackets span{animation:pulse 1s}']) {
      expect(critical).toContain(kept);
    }
    for (const dropped of ['.game-card', '#root .wordmark', '.games-grid', '@keyframes unused', '@font-face']) expect(critical).not.toContain(dropped);
  });

  it('fails the build on a CSS syntax error instead of repairing it', async () => {
    await expect(criticalAppCss('.hero{color:red', offlineRoot)).rejects.toThrow('Unclosed block');
  });

  it('fails the build on any beasties warning', async () => {
    await expect(criticalAppCss('.hero-actions{color:red;& .button{color:blue}}', offlineRoot)).rejects.toThrow('beasties could not select');
    await expect(criticalAppCss('.game-card{color:blue}', offlineRoot)).rejects.toThrow('beasties could not select');
  });

  it('refuses a stylesheet that would end the throwaway document early', async () => {
    await expect(criticalAppCss('a{content:"</style>"}', offlineRoot)).rejects.toThrow('would end the element early');
  });
});

describe('first-paint fallback faces', () => {
  it('cover every character of the shell text, including the house marks', () => {
    for (const variant of ['offline', 'online'] as const) {
      const text = shellText(shellMarkup(indexHtml, variant));
      expect(text).toContain('Opening the collection…');
      expect(text).toContain('Illustrated view · Lite mode');
      expect([...new Set(text)].filter(char => char > '~').sort()).toEqual(['·', '…']);
      expect(() => assertFallbackCoverage(shellCss, text)).not.toThrow();
    }
  });

  it('fail the build when the shell renders a character the fallback faces do not cover', () => {
    expect(() => assertFallbackCoverage(shellCss, 'Less choosing — more playing')).toThrow(
      "renders \"—\" (U+2014), which the fallback face 'P100 DF Impact' (unicode-range U+20-7E, U+B7, U+2026) does not cover",
    );
    expect(() => assertFallbackCoverage('@font-face { font-family: A; src: local("A"); unicode-range: U+41; }', 'AB')).toThrow('"B" (U+0042)');
    expect(() => assertFallbackCoverage('@font-face { font-family: A; src: local("A"); }', 'anything — at all')).not.toThrow();
    expect(() => assertFallbackCoverage('/* @font-face { unicode-range: U+41; } */ .a { color: red; }', 'A')).toThrow('declares no fallback faces');
  });
});

describe('first-paint shell stylesheet', () => {
  it('minifies without changing selectors, strings or values', () => {
    expect(minifyShellCss("/* note */\n.a > b,\n.c {\n  color: red;\n  font: 800 100px 'P100 DF Impact', monospace;\n}\n"))
      .toBe(".a > b,.c{color: red;font: 800 100px 'P100 DF Impact',monospace}");
    const shell = minifyShellCss(shellCss);
    expect(shell).not.toContain('/*');
    expect(shell).toContain('html[data-boot=landing] .first-paint-shell{display: contents}');
    expect(shell).toContain('.first-paint-shell > main{min-height: 100vh}');
    expect(shell).toContain("font-family: 'Hanken Grotesk Variable','P100 Sans Fallback','Segoe UI',sans-serif");
    expect(shell).toContain("--display: 'Barlow Condensed','P100 DF Impact','P100 DF Arial',Impact,'Arial Narrow',sans-serif");
    expect(shell.match(/unicode-range: U\+20-7E,U\+B7,U\+2026\}/g)).toHaveLength(9);
    expect(() => assertInlineSafe('style', shell)).not.toThrow();
  });
});

describe('emitted entry stylesheets', () => {
  it('accept compiled CSS without @import, whatever strings, comments and other at-rules contain', () => {
    const css = `@charset "UTF-8";${FONT_FACES}@media (min-width:761px){.hero{display:grid}}@supports (display:grid){.a{color:red}}` +
      '.b::before{content:"@import url(/x.css)"}.c::after{content:\'@import\'}/* @import "y.css"; */@importance{}';
    expect(() => assertNoCssImports('/assets/index-A.css', css)).not.toThrow();
  });

  it.each([
    '@import "./styles/tokens.css";.a{color:red}',
    '@import url(/assets/partial-B.css) screen;',
    '.a{color:red}@IMPORT url("https://fonts.example/css");',
    '@\\69mport "x.css";',
  ])('refuse an @import left in an emitted stylesheet, naming the file: %s', css => {
    expect(() => assertNoCssImports('/assets/index-A.css', css)).toThrow('The emitted stylesheet /assets/index-A.css contains an @import');
  });

  it('accept root font stacks the shell\'s fallbacks outrank, and font rules of their own elsewhere', () => {
    const css = ':root{font-family:Hanken Grotesk Variable,Segoe UI,sans-serif;color:#20231e;--display:Barlow Condensed,Impact,Arial Narrow,sans-serif}' +
      `${FONT_FACES}@media (max-width:760px){:root{--display:Impact}}html{font-family:Arial}:root{font-family:inherit}` +
      '.hero-copy h1{font-family:var(--display)}.sheet-head{font:800 28px/1 var(--display)}button,input,select,textarea{font:inherit}' +
      '.google-signin{font-family:Arial,sans-serif}body{font:inherit}#root{font-family:unset!important}*{font-family:inherit}' +
      '.a::before{content:"--display:Impact;font-family:x"}@supports (font-family:x){.b{color:red}}@font-palette-values --p{font-family:Barlow Condensed}' +
      '.c{--Display:Impact;font-size:12px;font-weight:700}:is(h1,h2){font-family:Arial}:where(.game-card) button{font-family:Arial}' +
      '.discovery-cards-list :is(.discovery-card,.discovery-card-skeleton){font:650 19px/1.25 Hanken Grotesk Variable,sans-serif}' +
      'div.card{font-family:Arial}#other{font-family:Arial}*.x{font-family:Arial}:where(body){font:inherit}*|html{font-family:Arial}svg|text{font-family:Arial}';
    expect(() => assertRootFontStacks('/assets/index-A.css', css)).not.toThrow();
  });

  it.each([
    ['body{font-family:Hanken Grotesk Variable,sans-serif}', 'font-family', 'body'],
    ['html body{font:16px Arial}', 'font', 'html body'],
    ['@media print{#root{font-family:serif}}', 'font-family', '#root'],
    ['*{font-family:system-ui}', 'font-family', '*'],
    ['html[lang]{font-family:Arial}', 'font-family', 'html[lang]'],
    [':root:not(.lite){--display:Impact}', '--display', ':root:not(.lite)'],
    ['.hero{--display:Impact}', '--display', '.hero'],
    ['.a{color:red}:root{--display:Impact !important}', '--display', ':root'],
    ['h1,html.dark{font-family:inherit}', 'font-family', 'html.dark'],
    [':where(body){font-family:Hanken Grotesk Variable,sans-serif}', 'font-family', ':where(body)'],
    [':is(html,#root){font-family:Arial}', 'font-family', ':is(html,#root)'],
    ['div{font-family:Arial}', 'font-family', 'div'],
    [':not(.lite){font-family:Arial}', 'font-family', ':not(.lite)'],
    [':has(.hero){font-family:Arial}', 'font-family', ':has(.hero)'],
    ['[lang]{font:12px serif}', 'font', '[lang]'],
    ['*|body{font-family:Arial}', 'font-family', '*|body'],
    ['*|html[lang]{font-family:Arial}', 'font-family', '*|html[lang]'],
    [':is(*|html,h1){font-family:Arial}', 'font-family', ':is(*|html,h1)'],
  ])('refuse %s, which would outrank or bypass the shell\'s fallback stacks', (css, property, selector) => {
    expect(() => assertRootFontStacks('/assets/index-A.css', css)).toThrow(`The entry stylesheet /assets/index-A.css sets ${property} on "${selector}"`);
  });

  it('are checked one by one before the shell\'s rules are selected', async () => {
    const input = { html: builtIndexHtml(), variant: 'offline' as const, shellCss, bootScript: bootJs };
    await expect(inlineFirstPaintShell({ ...input, readStylesheet: () => '@import "./styles/tokens.css";.site-header{display:flex}' }))
      .rejects.toThrow('The emitted stylesheet /assets/index-BBBBBBBB.css contains an @import');
    await expect(inlineFirstPaintShell({ ...input, readStylesheet: () => '.site-header{display:flex}body{font-family:Arial}' }))
      .rejects.toThrow('The entry stylesheet /assets/index-BBBBBBBB.css sets font-family on "body"');
  });
});

describe('first-paint startup tags', () => {
  it('reads every startup tag in <head>, in document order, with an HTML tokenizer', () => {
    const html = builtIndexHtml();
    const tags = startupTags(html);
    expect(tags.map(tag => [tag.kind, tag.url])).toEqual([
      ['preload', '/assets/barlow-condensed-latin-800-normal-BKzMuPgK.woff2'],
      ['preload', '/data/collection.json'],
      ['entry', '/assets/index-AAAAAAAA.js'],
      ['modulepreload', '/assets/vendor-CCCCCCCC.js'],
      ['stylesheet', '/assets/index-BBBBBBBB.css'],
    ]);
    for (const tag of tags) expect(html.slice(tag.start, tag.end)).toBe(tag.source);
    expect(tags[2]?.source).toBe('<script type="module" crossorigin src="/assets/index-AAAAAAAA.js"></script>');
  });

  it('ignores comments, raw text, noscript content, other links and <body>', () => {
    expect(startupTags('<head><!-- <script src="/a.js"></script><link rel="stylesheet" href="/assets/a.css"> --><title><link rel="preload" href="/x"></title>' +
      '<noscript><link rel="stylesheet" href="/pwa/fallback.css"></noscript><link rel="icon" href="/favicon.svg"><link rel="canonical" href="https://play.example/">' +
      '<link rel="manifest" href="/manifest.webmanifest"></head><body><link rel="stylesheet" href="/pwa/fallback.css"><script src="/b.js"></script></body>')).toEqual([]);
    expect(() => startupTags('<html><body></body></html>')).toThrow('no </head>');
  });

  it.each([
    ['<script src="/assets/a.js"></script>', 'Unexpected <head> script'],
    ['<script>window.a = 1;</script>', 'Unexpected <head> script'],
    ['<script type="module" src="/assets/a.js">import "/assets/b.js";</script>', 'Unexpected <head> script'],
    ['<script type="module" async src="/assets/a.js"></script>', 'Unexpected <head> script'],
    ['<link rel="stylesheet" href="/assets/a.css" media="print">', 'Unexpected <head> startup link'],
    ['<link rel="Stylesheet" href="/assets/a.css">', 'Unexpected <head> startup link'],
    ['<link rel="preload stylesheet" href="/assets/a.css">', 'Unexpected <head> startup link'],
    ['<link rel="stylesheet" href="https://cdn.example/a.css">', 'Unexpected <head> startup tag'],
    ['<link rel="modulepreload" href="/vendor.js">', 'Unexpected <head> startup tag'],
    ['<link rel="preload" href="//cdn.example/font.woff2" as="font">', 'Unexpected <head> startup tag'],
    ['<link rel="preload" as="fetch">', 'Unexpected <head> startup tag'],
  ])('refuses a startup tag the boot script could not recreate exactly: %s', (tag, message) => {
    expect(() => startupTags(`<head>${tag}</head>`)).toThrow(message);
  });
});

describe('first-paint index.html', () => {
  it.each(['offline', 'online'] as const)('inlines the %s shell, its style and its boot script', async variant => {
    const appCss = `${FONT_FACES}:root{--ink:#20231e}.site-header{display:flex}.game-card{color:blue}`;
    const result = await inlineFirstPaintShell({
      html: builtIndexHtml(), variant, shellCss, bootScript: bootJs,
      readStylesheet: href => {
        expect(href).toBe('/assets/index-BBBBBBBB.css');
        return appCss;
      },
    });
    const head = result.html.slice(0, result.html.indexOf('</head>'));
    const template = `<template id="${DEFERRED_TEMPLATE_ID}">${TEMPLATE_CONTENT}</template>`;
    // Every startup tag moved into the inert template, in the order the boot script inserts them.
    expect(head).toContain(template);
    expect(head.match(/<template\b/g)).toHaveLength(1);
    expect(result.startup.map(tag => tag.source).join('')).toBe(TEMPLATE_CONTENT);
    expect(head.replace(template, '')).not.toMatch(/rel="(?:stylesheet|modulepreload|preload)"|<script type="module"/);
    // Nor does <body> link one: after #root it would follow the lazy chunk stylesheets Vite appends to <head> and
    // win their equal-specificity ties. <noscript> content never loads with scripting on.
    expect(result.html.replace(template, '').replace(/<noscript>[\s\S]*?<\/noscript>/g, '')).not.toMatch(/rel="stylesheet"/);
    expect(head.match(/<style>/g)).toHaveLength(1);
    expect(head.indexOf('<meta charset="UTF-8" />')).toBeLessThan(head.indexOf('<style>'));
    expect(head.indexOf('<style>')).toBeLessThan(head.indexOf(template));
    expect(head.endsWith(`${template}\n  <script>${result.script}</script>\n  `)).toBe(true);
    // The head-prepended preloads left, so the charset declaration moved up; the budget gate still counts the template's tags as eager.
    expect(assertCharsetDeclaration(result.html)).toBe(105);
    expect(eagerHtmlFiles(result.html)).toEqual(['assets/index-AAAAAAAA.js', 'assets/index-BBBBBBBB.css', 'assets/vendor-CCCCCCCC.js']);
    expect(eagerHtmlFiles(result.html)).toEqual(eagerHtmlFiles(builtIndexHtml()));
    expect(cspProblems([{ name: 'index.html', html: result.html }], `default-src 'self'; script-src 'self' ${sha256Source(result.script)}; style-src 'self' 'unsafe-inline'`)).toEqual([]);
    expect(result.script).toBe(stripBootScript(bootJs));
    // No web font face reaches the inline style; the only faces are shell.css's local fallbacks.
    expect(result.style.slice(0, -minifyShellCss(shellCss).length)).not.toContain('@font-face');
    expect(result.style).not.toMatch(/P100 Barlow Condensed|P100 Hanken Grotesk/);
    expect(result.style.startsWith(':root{--ink:#20231e}')).toBe(true);
    expect(result.style).toContain('.site-header{display:flex}');
    expect(result.style).not.toContain('.game-card');
    expect(result.style.endsWith(minifyShellCss(shellCss))).toBe(true);
    expect(result.html).toContain(`${shellMarkup(indexHtml, variant)}\n    <noscript>`);
    expect(result.html).not.toMatch(/<!--\/?shell:|<!--p100:/);
    expect(result.html.includes('site-header-online')).toBe(variant === 'online');
    expect(result.html.includes('href="/my-games?tab=ranking"')).toBe(variant === 'offline');
  });

  it('needs exactly one module entry and an entry stylesheet', async () => {
    const input = { variant: 'offline' as const, shellCss, bootScript: bootJs, readStylesheet: () => ':root{--ink:#20231e}' };
    await expect(inlineFirstPaintShell({ ...input, html: builtIndexHtml().replace(/ {4}<link rel="stylesheet"[^\n]*\n/, '') })).rejects.toThrow('not 1 and 0.');
    await expect(inlineFirstPaintShell({
      ...input, html: builtIndexHtml().replace('  </head>', '    <script type="module" crossorigin src="/assets/other-DDDDDDDD.js"></script>\n  </head>'),
    })).rejects.toThrow('not 2 and 1.');
  });

  it('serves an empty #root in development and in builds without a shell', async () => {
    for (const [variant, context] of [['offline', { path: '/', filename: 'index.html' }], [null, { path: '/', filename: 'index.html', bundle: {} }]] as const) {
      const hook = firstPaintShell({ variant }).transformIndexHtml;
      if (!hook || typeof hook === 'function') throw new Error('The shell plugin must use an ordered transformIndexHtml hook.');
      expect(hook.order).toBe('post');
      expect(await hook.handler.call({} as never, indexHtml, context as never)).toBe(removeShell(indexHtml));
    }
    expect(removeShell(indexHtml)).toContain('<div id="root"></div>\n    <noscript>');
  });

  it('builds with the committed vercel.json, whose script-src carries the boot script hash', async () => {
    const plugin = firstPaintShell({ variant: 'offline' });
    const logged: string[] = [];
    if (typeof plugin.configResolved !== 'function') throw new Error('The shell plugin must read the resolved root.');
    await plugin.configResolved.call({} as never, { root: repository, logger: { info: (message: string) => logged.push(message) } } as never);
    const hook = plugin.transformIndexHtml;
    if (!hook || typeof hook === 'function') throw new Error('The shell plugin must use an ordered transformIndexHtml hook.');
    const bundle = { 'assets/index-BBBBBBBB.css': { type: 'asset', fileName: 'assets/index-BBBBBBBB.css', source: `${FONT_FACES}.site-header{display:flex}` } };
    const html = await hook.handler.call({} as never, builtIndexHtml(), { path: '/', filename: 'index.html', bundle } as never);
    expect(typeof html === 'string' && html.includes(`<script>${stripBootScript(bootJs)}</script>`)).toBe(true);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/^first-paint shell: offline header; <meta charset> at byte 105; deferred 1 entry, 1 modulepreload, 1 stylesheet, 2 preload; inline style \d+ B 'sha256-[\w+/=]+'; inline script \d+ B 'sha256-[\w+/=]+'$/);
  });

  it('under a strict style-src requires exactly the inline styles of both shell variants', async () => {
    const appCss = `${FONT_FACES}.site-header{display:flex}.site-header-online{color:red}`;
    const styles = Object.fromEntries(await Promise.all((['offline', 'online'] as const).map(async variant => [variant, sha256Source((await inlineFirstPaintShell({
      html: builtIndexHtml(), variant, shellCss, bootScript: bootJs, readStylesheet: () => appCss,
    })).style)] as const)));
    expect(styles.offline).not.toBe(styles.online);
    const root = await mkdtemp(path.join(tmpdir(), 'play100-strict-style-'));
    try {
      await mkdir(path.join(root, 'src', 'first-paint'), { recursive: true });
      await writeFile(path.join(root, 'src', 'first-paint', 'shell.css'), shellCss);
      await writeFile(path.join(root, 'src', 'first-paint', 'boot.js'), bootJs);
      const build = async (styleSources: string) => {
        const csp = `default-src 'self'; script-src 'self' ${sha256Source(stripBootScript(bootJs))}; style-src 'self' ${styleSources}`;
        await writeFile(path.join(root, 'vercel.json'), JSON.stringify({ headers: [{ source: '/((?!__/auth/).*)', headers: [{ key: 'Content-Security-Policy', value: csp }] }] }));
        const plugin = firstPaintShell({ variant: 'offline' });
        const logged: string[] = [];
        if (typeof plugin.configResolved !== 'function') throw new Error('The shell plugin must read the resolved root.');
        await plugin.configResolved.call({} as never, { root, logger: { info: (message: string) => logged.push(message) } } as never);
        const hook = plugin.transformIndexHtml;
        if (!hook || typeof hook === 'function') throw new Error('The shell plugin must use an ordered transformIndexHtml hook.');
        const bundle = { 'assets/index-BBBBBBBB.css': { type: 'asset', fileName: 'assets/index-BBBBBBBB.css', source: appCss } };
        await hook.handler.call({} as never, builtIndexHtml(), { path: '/', filename: 'index.html', bundle } as never);
        return logged;
      };
      expect((await build(`${styles.offline} ${styles.online}`))[0]).toContain(`; online variant inline style ${styles.online}`);
      await expect(build(styles.offline!)).rejects.toThrow(`other shell variant's inline style ${styles.online}`);
      await expect(build(styles.online!)).rejects.toThrow(`add ${styles.offline} to style-src`);
      await expect(build(`${styles.offline} ${styles.online} ${sha256Source('old{}')}`)).rejects.toThrow(`${sha256Source('old{}')}, which matches no inline style`);
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5 });
    }
  });
});
