import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readFirebaseConfiguration } from '../../src/lib/online-config.ts';
import {
  assertInlineSafe, assertRootRelativeUrls, assertShellNeutralCss, beastiesOptions, criticalAppCss, firstPaintShell,
  firstPaintVariant, fontFaceCopies, inlineFirstPaintShell, minifyShellCss, stripBootScript,
} from './plugin.ts';
import { removeShell, shellMarkup, shellText } from './shell-html.ts';

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
const FONT_COPIES_CSS = "@font-face{font-family:'P100 Barlow Condensed';font-display:swap;font-weight:700;src:url(/assets/barlow-condensed-latin-700-normal-v1xN8_Wq.woff2)format(\"woff2\")}" +
  "@font-face{font-family:'P100 Barlow Condensed';font-display:swap;font-weight:800;src:url(/assets/barlow-condensed-latin-800-normal-BKzMuPgK.woff2)format(\"woff2\")}" +
  "@font-face{font-family:'P100 Hanken Grotesk';font-display:swap;font-weight:100 900;src:url(/assets/hanken-grotesk-latin-wght-normal-CaVRRdDk.woff2)format(\"woff2-variations\")}";

/** index.html as Vite's build hands it to post hooks: entry script and stylesheet in <head>. */
function builtIndexHtml(): string {
  const built = indexHtml.replace('    <script type="module" src="/src/main.tsx"></script>\n', '')
    .replace('  </head>', '    <script type="module" crossorigin src="/assets/index-AAAAAAAA.js"></script>\n    <link rel="stylesheet" crossorigin href="/assets/index-BBBBBBBB.css">\n  </head>');
  expect(built).not.toContain('/src/main.tsx');
  expect(built).toContain('/assets/index-BBBBBBBB.css');
  return built;
}

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
    expect(script.startsWith('(function () {\ntry {\n')).toBe(true);
    expect(script.endsWith('\n})();')).toBe(true);
    expect(script).not.toMatch(/^\s*\/\/|\/\*/m);
    expect(script).toContain("root.setAttribute('data-boot', 'landing');");
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

describe('first-paint font copies', () => {
  it('copies the latin faces the shell renders under their own names, WOFF2 only', () => {
    expect(fontFaceCopies(FONT_FACES, shellText(offlineRoot))).toBe(FONT_COPIES_CSS);
    expect(fontFaceCopies(FONT_FACES, shellText(shellMarkup(indexHtml, 'online')))).toBe(FONT_COPIES_CSS);
  });

  it('covers every character of the shell text, including the house marks', () => {
    const text = shellText(offlineRoot);
    expect(text).toContain('Opening the collection…');
    expect(text).toContain('Illustrated view · Lite mode');
    expect([...new Set(text)].filter(char => char > '~').sort()).toEqual(['·', '…']);
  });

  it('refuses faces it cannot copy faithfully', () => {
    const text = shellText(offlineRoot);
    expect(() => fontFaceCopies(FONT_FACES.replaceAll('Hanken Grotesk Variable', 'Other Sans'), text)).toThrow('no @font-face for "Hanken Grotesk Variable"');
    expect(() => fontFaceCopies(FONT_FACES.replace('url(/assets/barlow-condensed-latin-700', 'url(barlow-condensed-latin-700'), text)).toThrow('needs a built /assets/ WOFF2 source');
    expect(() => fontFaceCopies(FONT_FACES.replace('unicode-range:U+??,', 'unicode-range:U+20-7E,U+2DE0-2DFF,'), text)).toThrow('covers only part of the shell text');
    expect(() => fontFaceCopies(FONT_FACES + FONT_FACES, text)).toThrow('same descriptors');
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
    expect(shell).toContain("font-family: 'Hanken Grotesk Variable','P100 Hanken Grotesk','P100 Sans Fallback','Segoe UI',sans-serif");
    expect(shell.match(/unicode-range: U\+20-7E,U\+B7,U\+2026\}/g)).toHaveLength(9);
    expect(() => assertInlineSafe('style', shell)).not.toThrow();
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
    expect(head).not.toContain('rel="stylesheet"');
    expect(head.match(/<style>/g)).toHaveLength(1);
    expect(head.indexOf('<style>')).toBeLessThan(head.indexOf(`<script>${result.script}</script>`));
    expect(head.indexOf(`<script>${result.script}</script>`)).toBeLessThan(head.indexOf('<script type="module"'));
    expect(head.indexOf('<meta charset="UTF-8" />')).toBeLessThan(head.indexOf('<style>'));
    expect(result.script).toBe(stripBootScript(bootJs));
    expect(result.style.startsWith(FONT_COPIES_CSS)).toBe(true);
    expect(result.style).toContain('.site-header{display:flex}');
    expect(result.style).not.toContain('.game-card');
    expect(result.style.endsWith(minifyShellCss(shellCss))).toBe(true);
    expect(result.html).toContain(`${shellMarkup(indexHtml, variant)}<link rel="stylesheet" crossorigin href="/assets/index-BBBBBBBB.css">\n    <noscript>`);
    expect(result.html).not.toMatch(/<!--\/?shell:|<!--p100:/);
    expect(result.html.includes('site-header-online')).toBe(variant === 'online');
    expect(result.html.includes('href="/my-games?tab=ranking"')).toBe(variant === 'offline');
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
    expect(logged[0]).toMatch(/^first-paint shell: offline header; inline style \d+ B 'sha256-[\w+/=]+'; inline script \d+ B 'sha256-[\w+/=]+'$/);
  });
});
