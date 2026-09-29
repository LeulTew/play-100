import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Beasties from 'beasties';
import type { Logger as BeastiesLogger, Options as BeastiesOptions } from 'beasties';
import { Parser } from 'htmlparser2';
import { transform } from 'lightningcss';
import type { CustomAtRules, Declaration, Selector, SelectorComponent, UnicodeRange, Visitor } from 'lightningcss';
import { minifySync } from 'vite';
import type { Plugin, ResolvedConfig } from 'vite';
import { textDigest, writeFirstPaintRecord } from '../build-metadata.ts';
import type { FirstPaintRecord } from '../build-metadata.ts';
import {
  allowsInlineStyles,
  cspProblems,
  inlineBlocks,
  mainDocumentPolicy,
  sha256Source,
  withInlineHashes,
} from './csp.ts';
import {
  ROOT_OPEN,
  SHELL_OPEN,
  STYLESHEET_MARKER,
  bootNotice,
  normalizeShellWhitespace,
  removeShell,
  selectShellVariant,
  shellRegion,
  shellText,
} from './shell-html.ts';
import type { ShellVariant } from './shell-html.ts';

/**
 * Static first-paint shell (docs/first-paint-shell.md).
 *
 * index.html carries the markup of React's first commit at "/" inside #root. For a build this
 * plugin runs after Vite has injected its tags and:
 *  - keeps the header variant this build renders (online tools configured or not);
 *  - moves every startup tag from <head> into an inert <template id="p100-deferred">: Vite's
 *    module entry, its modulepreloads and the entry stylesheet, and the font and collection
 *    preloads. Template content starts no request (Chromium's preload scanner skips it as well);
 *  - inlines one <style>, that template and the classic boot script (src/first-paint/boot.js) at
 *    the end of <head>. The style holds the entry-stylesheet rules beasties selects for the shell
 *    and for the failure notice that follows it in #root, and src/first-paint/shell.css, whose
 *    metric-matched local faces are the only fonts it declares;
 *  - fails the build unless vercel.json allows the inline script by its exact hash (and, under a
 *    strict style-src, exactly the inline styles of both variants; npm run csp:write writes them
 *    there, scripts/first-paint/write-csp.ts), unless the <meta charset>
 *    declaration fits within the document's first 1024 bytes, unless each emitted entry
 *    stylesheet is free of @import and leaves the root font stacks to shell.css, and unless each
 *    font preload makes exactly the request an @font-face of the entry stylesheet makes;
 *  - records the inline style of both variants and the boot script beside the retained Vite
 *    manifest (.build-meta) once index.html is written, with that document's digest, and
 *    check:budgets gates their bytes.
 *
 * The boot script inserts the startup tags after the shell's first contentful paint when it shows
 * the shell, and at once otherwise. It runs the module entry only after the entry stylesheet has
 * loaded and the document is parsed, so React never commits before the complete stylesheet
 * applies. When the app cannot start, or the entry stylesheet does not load, it replaces the shell
 * with the failure notice.
 */

/** The inert <template> that holds the startup tags until the boot script inserts them. */
export const DEFERRED_TEMPLATE_ID = 'p100-deferred';

/**
 * Attributes that differ between the static shell and React's first commit, each with any name that continues it
 * after a hyphen (data-boot-art). src/main.tsx sets data-app-started on <html> just before that commit.
 */
const SHELL_DIVERGENT_ATTRIBUTES = [
  'inert',
  'style',
  'data-scene-status',
  'data-activation',
  'data-shell-art',
  'data-boot',
  'data-app-started',
];
/** The class that differs too: only the shell's wrapper carries it. */
const SHELL_DIVERGENT_CLASS = 'first-paint-shell';
const CHARSET_DECLARATION = '<meta charset="UTF-8" />';

/**
 * The HTML encoding prescan reads only the first 1024 bytes, so the whole charset declaration
 * must be serialized within them. Returns its UTF-8 byte offset.
 */
export function assertCharsetDeclaration(html: string): number {
  const index = html.indexOf('<meta charset');
  const offset = index === -1 ? -1 : Buffer.byteLength(html.slice(0, index), 'utf8');
  if (offset === -1) throw new Error('index.html has no <meta charset> declaration.');
  const limit = 1024 - CHARSET_DECLARATION.length;
  if (offset >= limit)
    throw new Error(
      `index.html declares <meta charset> at byte ${offset}; it must start before byte ${limit} to fit within the first 1024 bytes.`,
    );
  return offset;
}

/** Same inputs as src/lib/online-availability.ts: EMULATOR_MODE, ONLINE_CONFIG_ERROR and ONLINE_AVAILABLE. */
export function firstPaintVariant(
  mode: string,
  emulators: string | undefined,
  online: { readonly config: unknown; readonly error: string | null },
): ShellVariant | null {
  if (mode === 'cloud-test' && emulators === 'true') return 'online';
  if (online.error) return null;
  return online.config ? 'online' : 'offline';
}

/**
 * The syntax src/first-paint/boot.js is written in: ES2019, for its optional catch bindings. Minifying must not
 * introduce later syntax, since the script shows the failure notice where the app's ES2022 modules cannot run.
 */
const BOOT_SCRIPT_TARGET = 'es2019';

/**
 * Minifies src/first-paint/boot.js with Oxc, as Vite minifies the build's modules; the result is what the CSP hash
 * covers, and it is the same for the same Oxc version. Oxc parses the script, so its strings, templates and regular
 * expressions keep their values, and a script that is not valid JavaScript throws a SyntaxError. Line endings are
 * normalized first, so a checkout's line endings cannot change the hash.
 */
export function minifyBootScript(source: string): string {
  const { code, errors } = minifySync('boot.js', source.replace(/\r\n?/g, '\n'), {
    compress: { target: BOOT_SCRIPT_TARGET },
    mangle: true,
    codegen: { removeWhitespace: true },
  });
  if (errors.length)
    throw new SyntaxError(
      `The boot script is not valid JavaScript:\n${errors.map((error) => error.codeframe ?? error.message).join('\n')}`,
    );
  return code;
}

export function assertInlineSafe(kind: 'style' | 'script', content: string): void {
  if (new RegExp(`</${kind}|<!--`, 'i').test(content))
    throw new Error(`The inline first-paint ${kind} contains markup that would end the element early.`);
}

/**
 * Reads a stylesheet with Lightning CSS, which also minifies the build's stylesheets, so the checks see it as the
 * build does: comments, strings and escapes resolved, selectors and declarations parsed. A syntax error throws, and so
 * does an error the visitor throws.
 */
function readCss(filename: string, css: string, visitor: Visitor<CustomAtRules>): void {
  transform({ filename, code: Buffer.from(css), visitor });
}

const lowerCase = (name: string) => name.toLowerCase();

/** Whether a name is `base`, or `base` continued after a hyphen, in any case. */
function namedAfter(name: string, base: string): boolean {
  const value = lowerCase(name);
  return value === base || value.startsWith(`${base}-`);
}

/** The selectors a component takes: those of :is(), :where(), :not(), :has(), :nth-child(… of …) and :host(). */
function argumentSelectors(component: SelectorComponent): Selector[] {
  if (component.type !== 'pseudo-class') return [];
  switch (component.kind) {
    case 'is':
    case 'where':
    case 'any':
    case 'not':
    case 'has':
      return component.selectors;
    case 'nth-child':
    case 'nth-last-child':
      return component.of ?? [];
    case 'host':
      return component.selectors ? [component.selectors] : [];
    default:
      return [];
  }
}

/** A selector and every selector nested in it. */
function withNestedSelectors(selector: Selector): Selector[] {
  return [selector, ...selector.flatMap((component) => argumentSelectors(component).flatMap(withNestedSelectors))];
}

/** The entry stylesheet must not style what the shell and React's first commit render differently. */
export function assertShellNeutralCss(css: string): void {
  readCss('entry.css', css, {
    Selector(selector) {
      for (const component of withNestedSelectors(selector).flat()) {
        const divergent =
          component.type === 'attribute' && SHELL_DIVERGENT_ATTRIBUTES.some((name) => namedAfter(component.name, name))
            ? `[${component.name}]`
            : component.type === 'class' && namedAfter(component.name, SHELL_DIVERGENT_CLASS)
              ? `.${component.name}`
              : undefined;
        if (divergent)
          throw new Error(
            `The entry stylesheet targets "${divergent}", which differs between the first-paint shell and React's first commit (docs/first-paint-shell.md).`,
          );
      }
    },
  });
}

/** Inlined into index.html, a relative url() would resolve against the document instead of /assets/. */
export function assertRootRelativeUrls(css: string): void {
  readCss('inline.css', css, {
    Url({ url }) {
      if (!/^(?:\/(?!\/)|https:|data:|#)/i.test(url))
        throw new Error(
          `The inline first-paint CSS references "${url}", which would resolve against index.html instead of its stylesheet.`,
        );
    },
  });
}

/**
 * Vite inlines the relative @import partials of the source CSS manifests, so an @import left in an
 * emitted stylesheet loads from outside the build: it bypasses the first-paint template, and a copy
 * in the inline style would request it before the first paint. Lightning CSS reads at-keywords as
 * CSS does (escapes resolved, ASCII case ignored). An @import after other rules is invalid and
 * browsers ignore it, but it is refused all the same.
 */
export function assertNoCssImports(file: string, css: string): void {
  let imports = false;
  try {
    readCss(file, css, {
      Rule: {
        import() {
          imports = true;
        },
      },
    });
  } catch (error) {
    if ((error as { data?: { type?: unknown } }).data?.type !== 'UnexpectedImportRule') throw error;
    imports = true;
  }
  if (imports) {
    throw new Error(
      `The emitted stylesheet ${file} contains an @import, which would load outside the first-paint template (and before the first paint if it reached the inline style). Vite inlines only relative imports of source CSS: import that CSS through one, or from a module (docs/first-paint-shell.md).`,
    );
  }
}

/** The combinators that start a new compound selector. The others attach pseudo-elements and shadow parts. */
const COMBINATORS: ReadonlySet<string> = new Set([
  'child',
  'descendant',
  'next-sibling',
  'later-sibling',
  'deep',
  'deep-descendant',
]);

/** The subject compound of a selector, the element its declarations apply to, without namespace prefixes. */
function subjectCompound(selector: Selector): SelectorComponent[] {
  let start = 0;
  selector.forEach((component, index) => {
    if (component.type === 'combinator' && COMBINATORS.has(component.value)) start = index + 1;
  });
  return selector.slice(start).filter((component) => component.type !== 'namespace');
}

/** :root or html. */
function rootElement(component: SelectorComponent | undefined): boolean {
  return (
    (component?.type === 'type' && lowerCase(component.name) === 'html') ||
    (component?.type === 'pseudo-class' && component.kind === 'root')
  );
}

/**
 * Whether a compound selector matches only elements other than html, body and the #root div: it
 * has another type, a class or another id (the shell's html, body and #root carry none), or an
 * :is() or :where() whose every alternative does. :not(), :has(), attributes and * never qualify.
 */
function qualified(compound: SelectorComponent[]): boolean {
  const [first] = compound;
  if (
    rootElement(first) ||
    (first?.type === 'type' && lowerCase(first.name) === 'body') ||
    (first?.type === 'id' && lowerCase(first.name) === 'root')
  )
    return false;
  return compound.some((component) => {
    switch (component.type) {
      case 'type':
        return !['html', 'body', 'div'].includes(lowerCase(component.name));
      case 'class':
        return true;
      case 'id':
        return lowerCase(component.name) !== 'root';
      case 'pseudo-class':
        return (
          (component.kind === 'is' || component.kind === 'where' || component.kind === 'any') &&
          component.selectors.every((alternative) => qualified(subjectCompound(alternative)))
        );
      default:
        return false;
    }
  });
}

type FontProperty = 'font' | 'font-family' | '--display';

function fontProperty(declaration: Declaration): FontProperty | undefined {
  switch (declaration.property) {
    case 'font':
    case 'font-family':
      return declaration.property;
    case 'unparsed': {
      const id = declaration.value.propertyId.property;
      return id === 'font' || id === 'font-family' ? id : undefined;
    }
    case 'custom':
      return declaration.value.name === '--display' ? '--display' : undefined;
    default:
      return undefined;
  }
}

const INHERITING_KEYWORDS: ReadonlySet<string> = new Set(['inherit', 'unset']);

/** Whether a font or font-family declaration is inherit or unset, which Lightning CSS reads as a generic family. */
function inheritsFont(declaration: Declaration): boolean {
  if (declaration.property === 'font-family')
    return declaration.value.length === 1 && INHERITING_KEYWORDS.has(declaration.value[0] ?? '');
  if (declaration.property !== 'unparsed') return false;
  const tokens = declaration.value.value.filter(
    (token) => !(token.type === 'token' && token.value.type === 'white-space'),
  );
  const [only] = tokens;
  return (
    tokens.length === 1 &&
    only?.type === 'token' &&
    only.value.type === 'ident' &&
    INHERITING_KEYWORDS.has(lowerCase(only.value.value))
  );
}

function keepsShellFontStacks(
  property: FontProperty,
  subject: SelectorComponent[],
  important: boolean,
  inherits: boolean,
): boolean {
  if (subject.length === 1 && rootElement(subject[0])) return !important;
  if (property === '--display' || rootElement(subject[0])) return false;
  return qualified(subject) || inherits;
}

/** A selector as Lightning CSS prints it, for messages. */
function selectorText(selector: Selector): string {
  const block = '{color:red}';
  const { code } = transform({
    filename: 'selector.css',
    code: Buffer.from(`a${block}`),
    minify: true,
    visitor: { Rule: { style: (rule) => ({ ...rule, value: { ...rule.value, selectors: [selector] } }) } },
  });
  return new TextDecoder().decode(code).slice(0, -block.length);
}

/**
 * src/first-paint/shell.css adds the metric-matched fallbacks to the app's font stacks with
 * html[data-boot=landing] (0,1,1), and the entry stylesheet loads after it. So the entry stylesheet
 * may set the root font-family and --display only on :root (0,1,0) or bare html, without
 * !important. It must not declare --display anywhere else, where it would shadow the shell's value,
 * and a font or font-family on an element that may be html, body or #root (see qualified()) must be
 * inherit or unset. Each selector is judged by its subject compound, the element it styles.
 */
export function assertRootFontStacks(file: string, css: string): void {
  readCss(file, css, {
    Rule: {
      style({ value: { selectors, declarations } }) {
        const blocks = [
          [declarations?.declarations ?? [], false],
          [declarations?.importantDeclarations ?? [], true],
        ] as const;
        for (const [list, important] of blocks) {
          for (const declaration of list) {
            const property = fontProperty(declaration);
            if (!property) continue;
            const inherits = inheritsFont(declaration);
            for (const selector of selectors) {
              if (!keepsShellFontStacks(property, subjectCompound(selector), important, inherits))
                throw new Error(
                  `The entry stylesheet ${file} sets ${property} on "${selectorText(selector)}", where it would outrank or bypass the metric-matched fallbacks src/first-paint/shell.css adds to the root font stacks: keep font-family and --display on :root, without !important (docs/first-paint-shell.md).`,
                );
            }
          }
        }
      },
    },
  });
}

/**
 * Minifies src/first-paint/shell.css with Lightning CSS, as Vite minifies the entry stylesheet. Without browser
 * targets, its prefixes and syntax stay as written.
 */
export function minifyShellCss(css: string): string {
  const { code } = transform({ filename: 'src/first-paint/shell.css', code: Buffer.from(css), minify: true });
  return new TextDecoder().decode(code);
}

export function beastiesOptions(logger: BeastiesLogger): BeastiesOptions {
  return {
    // The entry stylesheet arrives as an inline <style> of a throwaway document, so beasties never
    // touches a real <link> (no preload, onload handler or loader script for the CSP to allow),
    // and it neither preloads nor inlines web fonts: their faces load with the full stylesheet.
    external: false,
    fonts: false,
    mergeStylesheets: true,
    reduceInlineStyles: true,
    keyframes: 'critical',
    compress: true,
    // A CSS syntax error fails the build instead of being repaired by a guess.
    safeParser: false,
    // beasties strips pseudo-classes before matching, which leaves nothing to match for :root,
    // :where(...), ::selection and similar selectors, so rules starting with one are always kept.
    allowRules: [/^:/],
    dedupeWarnings: false,
    logger,
  };
}

/** The entry-stylesheet rules that can apply inside the shell or the failure notice, as selected by beasties. */
export async function criticalAppCss(appCss: string, root: string): Promise<string> {
  assertInlineSafe('style', appCss);
  if (!root.startsWith(ROOT_OPEN + SHELL_OPEN))
    throw new Error(`The shell markup must start with ${ROOT_OPEN}${SHELL_OPEN}.`);
  // Matching stays inside the shell and the failure notice: after pseudo-classes are stripped,
  // selectors such as html:has(.toast-visible) would otherwise match the throwaway document itself.
  // Bare html, body and :root rules are always kept. beasties matches a selector with a combinator
  // only below its container (css-select reads .app-error a as :scope .app-error a), and the
  // notice's rules start at the notice itself, so its container is a wrapper that exists only in
  // this document. They keep the notice's layout and targets when the entry stylesheet fails too.
  const notice = bootNotice(root);
  const contain = (open: string) => open.replace(/>$/, ' data-beasties-container>');
  const marked = root.replace(ROOT_OPEN + SHELL_OPEN, ROOT_OPEN + contain(SHELL_OPEN));
  const container = marked.replace(notice, () => `<div data-beasties-container>${notice}</div>`);
  const problems: string[] = [];
  const logger: BeastiesLogger = {
    warn: (message) => {
      problems.push(message);
    },
    error: (message) => {
      problems.push(message);
    },
    // A rule beasties cannot evaluate is left out, so the shell would miss it.
    debug: (message) => {
      if (message.startsWith('Cannot statically evaluate selector')) problems.push(message);
    },
  };
  const output = await new Beasties(beastiesOptions(logger)).process(
    `<!doctype html><html lang="en" data-boot="landing" data-boot-art="ready"><head><style>${appCss}</style></head><body>${container}</body></html>`,
  );
  if (problems.length) throw new Error(`beasties could not select the first-paint CSS:\n${problems.join('\n')}`);
  const styles = [...output.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1] ?? '');
  const style = styles[0];
  if (styles.length !== 1 || style === undefined || !style.trim())
    throw new Error(`beasties returned ${styles.length} style elements instead of one with the shell's rules.`);
  return style;
}

interface FontFace {
  readonly family: string | undefined;
  readonly ranges: readonly UnicodeRange[] | undefined;
  /** Every URL its src requests, as written. */
  readonly urls: readonly string[];
}

/** The @font-face rules of a stylesheet, as Lightning CSS parses them. */
function fontFaces(filename: string, css: string): FontFace[] {
  const faces: FontFace[] = [];
  readCss(filename, css, {
    Rule: {
      'font-face'({ value: { properties } }) {
        let family: string | undefined;
        let ranges: UnicodeRange[] | undefined;
        const urls: string[] = [];
        for (const property of properties) {
          if (property.type === 'font-family') family = property.value;
          else if (property.type === 'unicode-range') ranges = property.value;
          else if (property.type === 'source')
            for (const source of property.value) if (source.type === 'url') urls.push(source.value.url.url);
        }
        faces.push({ family, ranges, urls });
      },
    },
  });
  return faces;
}

const hexadecimal = (code: number) => code.toString(16).toUpperCase();

/**
 * The shell paints only in the metric-matched local faces of src/first-paint/shell.css (the web
 * fonts arrive with the full stylesheet), so each of those faces must cover every character the
 * shell renders: anything outside their unicode-range would paint in an unmatched system font and
 * reflow when the web fonts swap in.
 */
export function assertFallbackCoverage(shellCss: string, text: string): void {
  const codepoints = [...new Set(Array.from(text, (char) => char.codePointAt(0) ?? 0))].filter((code) => code >= 0x20);
  const faces = fontFaces('src/first-paint/shell.css', shellCss);
  if (!faces.length) throw new Error('src/first-paint/shell.css declares no fallback faces for the first-paint shell.');
  for (const { family, ranges } of faces) {
    if (ranges === undefined) continue;
    const missing = codepoints.find((code) => !ranges.some(({ start, end }) => code >= start && code <= end));
    if (missing !== undefined) {
      const range = ranges
        .map(({ start, end }) => `U+${hexadecimal(start)}${end === start ? '' : `-${hexadecimal(end)}`}`)
        .join(', ');
      throw new Error(
        `The first-paint shell renders "${String.fromCodePoint(missing)}" (U+${hexadecimal(missing).padStart(4, '0')}), which the fallback face ${family === undefined ? '(unnamed)' : `'${family}'`} (unicode-range ${range}) does not cover; extend it in src/first-paint/shell.css.`,
      );
    }
  }
}

/** The order in which the boot script inserts the startup tags: the entry first, as a modulepreload. */
export const STARTUP_KINDS = ['entry', 'modulepreload', 'stylesheet', 'preload'] as const;
export type StartupKind = (typeof STARTUP_KINDS)[number];

export interface StartupTag {
  readonly kind: StartupKind;
  /** The tag as the build emitted it, with the entry's </script>. */
  readonly source: string;
  readonly url: string;
  readonly start: number;
  readonly end: number;
  readonly attributes: Readonly<Record<string, string>>;
}

const STARTUP_URLS: Readonly<Record<StartupKind, RegExp>> = {
  entry: /^\/assets\/[\w.-]+\.js$/,
  modulepreload: /^\/assets\/[\w.-]+\.js$/,
  stylesheet: /^\/assets\/[\w.-]+\.css$/,
  preload: /^\/(?!\/)[\w./-]+$/,
};

/**
 * Every tag in <head> that starts a request the app needs at startup, in document order, read with
 * an HTML tokenizer so comments and raw text never count. Whatever the boot script could not
 * recreate exactly fails the build: any head script but one empty module entry, or a startup link
 * with more than one rel, a media query or an unexpected URL.
 */
export function startupTags(html: string): StartupTag[] {
  const headEnd = html.indexOf('</head>');
  if (headEnd === -1) throw new Error('index.html has no </head>.');
  const head = html.slice(0, headEnd);
  const tags: StartupTag[] = [];
  let noscript = 0;
  const parser = new Parser({
    onopentag(name, attributes) {
      if (name === 'noscript') noscript += 1;
      if (noscript || (name !== 'script' && name !== 'link')) return;
      const start = parser.startIndex;
      let end = parser.endIndex + 1;
      const tag = head.slice(start, end);
      let kind: StartupKind;
      let url: string | undefined;
      if (name === 'script') {
        const names = Object.keys(attributes).sort().join(' ');
        if (
          attributes.type?.toLowerCase() !== 'module' ||
          !['crossorigin src type', 'src type'].includes(names) ||
          !head.startsWith('</script>', end)
        ) {
          throw new Error(
            `Unexpected <head> script ${tag}: only the empty module entry may come before the first-paint boot script.`,
          );
        }
        end += '</script>'.length;
        kind = 'entry';
        url = attributes.src;
      } else {
        // The boot script compares rel exactly, so a startup link must carry exactly one lowercase rel.
        const rel = attributes.rel ?? '';
        if (!rel.split(/\s+/).some((token) => ['stylesheet', 'modulepreload', 'preload'].includes(token.toLowerCase())))
          return;
        if (
          (rel !== 'stylesheet' && rel !== 'modulepreload' && rel !== 'preload') ||
          Object.hasOwn(attributes, 'media')
        ) {
          throw new Error(`Unexpected <head> startup link ${tag}.`);
        }
        kind = rel;
        url = attributes.href;
      }
      if (!tag.startsWith('<') || !tag.endsWith('>') || url === undefined || !STARTUP_URLS[kind].test(url))
        throw new Error(`Unexpected <head> startup tag ${tag}.`);
      tags.push({ kind, source: head.slice(start, end), url, start, end, attributes });
    },
    onclosetag(name) {
      if (name === 'noscript') noscript = Math.max(0, noscript - 1);
    },
  });
  parser.end(head);
  return tags;
}

/** Every URL the @font-face rules of a stylesheet request, exactly as written. */
function fontFaceUrls(css: string): Set<string> {
  return new Set(fontFaces('entry.css', css).flatMap((face) => face.urls));
}

/**
 * The browser reuses a font preload only for the request the @font-face makes: the same URL, as a
 * font, in CORS mode without credentials. Anything else downloads the font a second time while the
 * preload took bandwidth from the rest of the startup requests. So each font preload must carry
 * as="font", type="font/woff2" and crossorigin (anonymous), and name a URL that an @font-face of the
 * entry stylesheet requests, byte for byte.
 */
export function assertFontPreloads(preloads: readonly StartupTag[], css: string): void {
  const urls = fontFaceUrls(css);
  for (const tag of preloads) {
    const { as: destination, type, crossorigin } = tag.attributes;
    if (destination !== 'font' && !/\.(?:woff2?|ttf|otf)$/i.test(tag.url)) continue;
    const problems = [
      ...(destination === 'font' ? [] : ['as="font"']),
      ...(type === 'font/woff2' ? [] : ['type="font/woff2"']),
      ...(crossorigin === '' || crossorigin === 'anonymous'
        ? []
        : ['crossorigin (anonymous), as @font-face requests use CORS']),
      ...(urls.has(tag.url) ? [] : ['a URL an @font-face of the entry stylesheet requests']),
    ];
    if (problems.length)
      throw new Error(
        `The font preload ${tag.source} needs ${problems.join(', ')}; otherwise the font downloads twice.`,
      );
  }
}

/** Removes a tag, and its line when the tag stands alone on it. */
function removeTag(html: string, { start, end }: { readonly start: number; readonly end: number }): string {
  const lineStart = html.lastIndexOf('\n', start) + 1;
  const from = /^\s*$/.test(html.slice(lineStart, start)) ? lineStart : start;
  const to = html[end] === '\n' && from === lineStart ? end + 1 : end;
  return html.slice(0, from) + html.slice(to);
}

export interface InlineShellInput {
  /** index.html after Vite injected its tags; the shell markup must still carry its variant markers. */
  readonly html: string;
  readonly variant: ShellVariant;
  /** Reads a stylesheet emitted by the build, by its root-relative URL. */
  readonly readStylesheet: (href: string) => string;
  readonly shellCss: string;
  readonly bootScript: string;
}

export interface InlineShellResult {
  readonly html: string;
  readonly style: string;
  readonly script: string;
  /** The startup tags the template holds, in the order the boot script inserts them. */
  readonly startup: readonly StartupTag[];
}

export async function inlineFirstPaintShell(input: InlineShellInput): Promise<InlineShellResult> {
  let html = normalizeShellWhitespace(selectShellVariant(input.html, input.variant));
  const region = shellRegion(html);
  const root = html.slice(region.start, region.end);
  // The boot script shows it when the app cannot start (src/first-paint/boot.js).
  bootNotice(root);
  // The marker only delimits the shell markup.
  html = html.slice(0, region.end) + html.slice(region.end + STYLESHEET_MARKER.length);
  const tags = startupTags(html);
  const count = (kind: StartupKind) => tags.filter((tag) => tag.kind === kind).length;
  if (count('entry') !== 1 || !count('stylesheet')) {
    throw new Error(
      `The build must inject one module entry and an entry stylesheet into <head>, not ${count('entry')} and ${count('stylesheet')}.`,
    );
  }
  const appCss = tags
    .filter((tag) => tag.kind === 'stylesheet')
    .map((tag) => {
      const css = input.readStylesheet(tag.url);
      assertNoCssImports(tag.url, css);
      assertRootFontStacks(tag.url, css);
      return css;
    })
    .join('\n');
  assertFontPreloads(
    tags.filter((tag) => tag.kind === 'preload'),
    appCss,
  );
  for (const tag of [...tags].reverse()) html = removeTag(html, tag);
  const startup = STARTUP_KINDS.flatMap((kind) => tags.filter((tag) => tag.kind === kind));

  assertShellNeutralCss(appCss);
  assertFallbackCoverage(input.shellCss, shellText(root));
  const style = (await criticalAppCss(appCss, root)) + minifyShellCss(input.shellCss);
  assertRootRelativeUrls(style);
  const script = minifyBootScript(input.bootScript);
  assertInlineSafe('style', style);
  assertInlineSafe('script', script);

  const insertAt = html.indexOf('</head>');
  const lineStart = html.lastIndexOf('\n', insertAt) + 1;
  const indent = /^\s*$/.test(html.slice(lineStart, insertAt)) ? html.slice(lineStart, insertAt) : '';
  const template = `<template id="${DEFERRED_TEMPLATE_ID}">${startup.map((tag) => tag.source).join('')}</template>`;
  html = `${html.slice(0, insertAt)}<style>${style}</style>\n${indent}${template}\n${indent}<script>${script}</script>\n${indent}${html.slice(insertAt)}`;
  return { html, style, script, startup };
}

export interface FirstPaintShellOptions {
  /**
   * The header React's first commit renders: 'online' when Firebase or the emulators are
   * configured, 'offline' otherwise, and null when that commit shows something else (the
   * online configuration banner), which removes the shell from the build.
   */
  readonly variant: ShellVariant | null;
  /**
   * What the build does when vercel.json does not list the hashes of the shell's inline blocks. 'fail', the default,
   * fails the build. 'record', which only `npm run csp:write` sets (scripts/first-paint/write-csp.ts), checks the policy
   * as it would read with this build's hashes, so any other problem still fails, and records them for the writer.
   */
  readonly cspMismatch?: 'fail' | 'record';
}

export function firstPaintShell({ variant, cspMismatch = 'fail' }: FirstPaintShellOptions): Plugin {
  let root = process.cwd();
  let outDir = path.resolve('dist');
  let logger: ResolvedConfig['logger'] | undefined;
  // This build's inline blocks, recorded once Vite has written index.html.
  let inlined: Omit<FirstPaintRecord, 'indexHtml'> | undefined;
  return {
    name: 'play100-first-paint-shell',
    configResolved(config) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
      logger = config.logger;
    },
    transformIndexHtml: {
      order: 'post',
      async handler(html, context) {
        // The dev server never shows the shell (it serves no boot script), so #root starts empty.
        if (!context.bundle) return removeShell(html);
        if (!variant) {
          const output = removeShell(html);
          assertCharsetDeclaration(output);
          return output;
        }
        const bundle = context.bundle;
        const source = (file: string) => readFileSync(path.resolve(root, file), 'utf8');
        const input = {
          html,
          shellCss: source('src/first-paint/shell.css'),
          bootScript: source('src/first-paint/boot.js'),
          readStylesheet: (href: string) => {
            const asset = bundle[href.slice(1)];
            if (!asset || asset.type !== 'asset') throw new Error(`The stylesheet ${href} is not in the build output.`);
            return typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source);
          },
        };
        const result = await inlineFirstPaintShell({ ...input, variant });
        const charset = assertCharsetDeclaration(result.html);
        const committed = mainDocumentPolicy(JSON.parse(source('vercel.json')));
        // A strict style-src must list the other variant's inline style too (vercel.json serves both
        // kinds of build), and nothing else. check:budgets gates both variants' style as well.
        const other = variant === 'online' ? 'offline' : 'online';
        const otherStyle = (await inlineFirstPaintShell({ ...input, variant: other })).style;
        const styleOf = (name: ShellVariant) => (name === variant ? result.style : otherStyle);
        const policy =
          cspMismatch === 'record'
            ? withInlineHashes(committed, {
                script: [sha256Source(result.script)],
                style: [sha256Source(styleOf('online')), sha256Source(styleOf('offline'))],
              })
            : committed;
        const otherVariantStyles = allowsInlineStyles(policy) ? [] : [sha256Source(otherStyle)];
        const problems = cspProblems([{ name: 'index.html', html: result.html }], policy, { otherVariantStyles });
        if (problems.length)
          throw new Error(`The first-paint shell does not match vercel.json:\n${problems.join('\n')}`);
        const blocks = inlineBlocks(result.html).map(
          (block) => `inline ${block.kind} ${block.bytes} B ${block.source}`,
        );
        const others = otherVariantStyles.map((hash) => `; ${other} variant inline style ${hash}`).join('');
        const deferred = STARTUP_KINDS.map(
          (kind) => `${result.startup.filter((tag) => tag.kind === kind).length} ${kind}`,
        ).join(', ');
        const pending =
          policy === committed ? '' : '; vercel.json does not list these hashes yet, which csp:write writes';
        logger?.info(
          `first-paint shell: ${variant} header; <meta charset> at byte ${charset}; deferred ${deferred}; ${blocks.join('; ')}${others}${pending}`,
        );
        const style = (name: ShellVariant) => textDigest(styleOf(name));
        inlined = {
          format: 1,
          variant,
          script: textDigest(result.script),
          styles: { offline: style('offline'), online: style('online') },
        };
        return result.html;
      },
    },
    // check:budgets gates both variants' inline style and the boot script from this record, which the digest of the
    // written index.html binds to this build.
    async writeBundle() {
      if (!inlined) return;
      const indexHtml = textDigest(await readFile(path.join(outDir, 'index.html'), 'utf8'));
      await writeFirstPaintRecord(outDir, { ...inlined, indexHtml });
    },
  };
}
