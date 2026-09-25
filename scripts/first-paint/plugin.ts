import { readFileSync } from 'node:fs';
import path from 'node:path';
import Beasties from 'beasties';
import type { Logger as BeastiesLogger, Options as BeastiesOptions } from 'beasties';
import { Parser } from 'htmlparser2';
import type { Plugin, ResolvedConfig } from 'vite';
import { allowsInlineStyles, cspProblems, inlineBlocks, mainDocumentPolicy, sha256Source } from './csp.ts';
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
 *    strict style-src, exactly the inline styles of both variants), unless the <meta charset>
 *    declaration fits within the document's first 1024 bytes, unless each emitted entry
 *    stylesheet is free of @import and leaves the root font stacks to shell.css, and unless each
 *    font preload makes exactly the request an @font-face of the entry stylesheet makes.
 *
 * The boot script inserts the startup tags after the shell's first contentful paint when it shows
 * the shell, and at once otherwise. It runs the module entry only after the entry stylesheet has
 * loaded or failed and the document is parsed, so React never commits before the complete
 * stylesheet applies. When the app cannot start, it replaces the shell with the failure notice.
 */

/** The inert <template> that holds the startup tags until the boot script inserts them. */
export const DEFERRED_TEMPLATE_ID = 'p100-deferred';

/**
 * Attributes and classes that differ between the static shell and React's first commit; src/main.tsx sets
 * data-app-started on <html> just before that commit.
 */
const SHELL_DIVERGENT_SELECTOR =
  /\[\s*(?:inert|style|data-scene-status|data-activation|data-shell-art|data-boot|data-app-started)\b|\.first-paint-shell\b/i;
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

/** Drops comments and indentation from src/first-paint/boot.js; the result is what the CSP hash covers. */
export function stripBootScript(source: string): string {
  const script = source
    .replace(/\r\n?/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'))
    .join('\n');
  // Throws on a syntax error, for example a "/*" in a string that the comment removal cut short.
  new Function(script);
  return script;
}

export function assertInlineSafe(kind: 'style' | 'script', content: string): void {
  if (new RegExp(`</${kind}|<!--`, 'i').test(content))
    throw new Error(`The inline first-paint ${kind} contains markup that would end the element early.`);
}

/** The entry stylesheet must not style what the shell and React's first commit render differently. */
export function assertShellNeutralCss(css: string): void {
  const match = SHELL_DIVERGENT_SELECTOR.exec(css);
  if (match)
    throw new Error(
      `The entry stylesheet targets "${match[0]}", which differs between the first-paint shell and React's first commit (docs/first-paint-shell.md).`,
    );
}

/** Inlined into index.html, a relative url() would resolve against the document instead of /assets/. */
export function assertRootRelativeUrls(css: string): void {
  for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/gi)) {
    const url = match[1] ?? match[2] ?? match[3] ?? '';
    if (!/^(?:\/(?!\/)|https:|data:|#)/i.test(url))
      throw new Error(
        `The inline first-paint CSS references "${url}", which would resolve against index.html instead of its stylesheet.`,
      );
  }
}

/** CSS with its comments blanked and every string emptied, so only tokens outside strings remain. */
function cssOutsideStrings(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\[\s\S])*"|'(?:[^'\\\n]|\\[\s\S])*'/g, (match) =>
    match.startsWith('/*') ? ' ' : '""',
  );
}

/**
 * Vite inlines the relative @import partials of the source CSS manifests, so an @import left in an
 * emitted stylesheet loads from outside the build: it bypasses the first-paint template, and a copy
 * in the inline style would request it before the first paint. At-keywords are compared as CSS
 * reads them: escapes resolved, ASCII case ignored.
 */
export function assertNoCssImports(file: string, css: string): void {
  for (const match of cssOutsideStrings(css).matchAll(
    /@((?:[\w\u0080-\uffff-]|\\[0-9a-fA-F]{1,6}(?:\r\n|[ \t\r\n\f])?|\\[^\r\n\f0-9a-fA-F])+)/g,
  )) {
    const name = (match[1] ?? '').replace(
      /\\([0-9a-fA-F]{1,6})(?:\r\n|[ \t\r\n\f])?|\\(.)/gs,
      (_, hex: string | undefined, char: string | undefined) => {
        if (hex === undefined) return char ?? '';
        const code = Number.parseInt(hex, 16);
        return code < 0x80 ? String.fromCharCode(code) : '\uFFFD';
      },
    );
    if (name.toLowerCase() === 'import') {
      throw new Error(
        `The emitted stylesheet ${file} contains an @import, which would load outside the first-paint template (and before the first paint if it reached the inline style). Vite inlines only relative imports of source CSS: import that CSS through one, or from a module (docs/first-paint-shell.md).`,
      );
    }
  }
}

const ROOT_SUBJECT = /^(?::root|html)(?![\w-])/i;
const BODY_OR_ROOT_DIV = /^(?:body|#root)(?![\w-])/i;
const MATCHES_ALTERNATIVES = /^(?:is|where|matches|-webkit-any|-moz-any)$/i;
const INHERITS = /^(?:inherit|unset)(?:\s*!\s*important)?$/i;

/** The subject compound of a selector: the element its declarations apply to. */
function subjectCompound(selector: string): string {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (char === '>' || char === '+' || char === '~' || /\s/.test(char))) start = index + 1;
  }
  return selector.slice(start);
}

function closingParenthesis(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    else if (text[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** A compound selector without its namespace prefix: svg|a, *|body and |html become a, body and html. */
function withoutNamespace(compound: string): string {
  return compound.replace(/^(?:[\w-]+|\*)?\|/, '');
}

/**
 * Whether a compound selector matches only elements other than html, body and the #root div: it
 * has another type, a class or another id (the shell's html, body and #root carry none), or an
 * :is() or :where() whose every alternative does. :not(), :has(), attributes and * never qualify.
 */
function qualified(selector: string): boolean {
  const compound = withoutNamespace(selector);
  if (ROOT_SUBJECT.test(compound) || BODY_OR_ROOT_DIV.test(compound)) return false;
  const type = /^[a-z][\w-]*/i.exec(compound)?.[0];
  if (type !== undefined && !/^(?:html|body|div)$/i.test(type)) return true;
  for (let index = 0; index < compound.length; index += 1) {
    const char = compound[index];
    if (char === '.' || (char === '#' && !BODY_OR_ROOT_DIV.test(compound.slice(index)))) return true;
    if (char === '[') {
      const end = compound.indexOf(']', index);
      if (end === -1) return false;
      index = end;
    } else if (char === ':') {
      const pseudo = /^::?([\w-]+)(\()?/.exec(compound.slice(index));
      if (!pseudo) return false;
      if (pseudo[2] === undefined) {
        index += pseudo[0].length - 1;
        continue;
      }
      const open = index + pseudo[0].length - 1;
      const close = closingParenthesis(compound, open);
      if (close === -1) return false;
      if (
        MATCHES_ALTERNATIVES.test(pseudo[1] ?? '') &&
        splitTopLevel(compound.slice(open + 1, close)).every((alternative) => qualified(subjectCompound(alternative)))
      )
        return true;
      index = close;
    }
  }
  return false;
}

function keepsShellFontStacks(property: string, subject: string, value: string): boolean {
  const compound = withoutNamespace(subject);
  if (/^(?::root|html)$/i.test(compound)) return !/!\s*important$/i.test(value);
  if (property === '--display' || ROOT_SUBJECT.test(compound)) return false;
  return qualified(compound) || INHERITS.test(value);
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
  const code = cssOutsideStrings(css);
  for (const match of code.matchAll(/(?:^|[{;])\s*(font-family|font|--display)\s*:([^;{}]*)/gi)) {
    const name = match[1] ?? '';
    // Custom property names are case-sensitive: --Display is another property.
    const property = name.startsWith('--') ? name : name.toLowerCase();
    if (property !== 'font' && property !== 'font-family' && property !== '--display') continue;
    const open = code.lastIndexOf('{', match.index);
    if (open === -1) continue;
    const prelude = code
      .slice(
        Math.max(code.lastIndexOf('}', open), code.lastIndexOf('{', open - 1), code.lastIndexOf(';', open)) + 1,
        open,
      )
      .trim();
    // At-rule blocks such as @font-face declare font properties of their own.
    if (prelude.startsWith('@')) continue;
    const value = (match[2] ?? '').trim();
    for (const selector of splitTopLevel(prelude)) {
      if (!keepsShellFontStacks(property, subjectCompound(selector), value)) {
        throw new Error(
          `The entry stylesheet ${file} sets ${property} on "${selector}", where it would outrank or bypass the metric-matched fallbacks src/first-paint/shell.css adds to the root font stacks: keep font-family and --display on :root, without !important (docs/first-paint-shell.md).`,
        );
      }
    }
  }
}

/** Removes comments and optional whitespace from src/first-paint/shell.css, whose strings contain none of {};, */
export function minifyShellCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,])\s*/g, '$1')
    .replace(/;\}/g, '}')
    .trim();
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

interface Declaration {
  readonly name: string;
  readonly value: string;
}

function declarations(body: string): Declaration[] {
  return body
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const colon = part.indexOf(':');
      const name = part.slice(0, Math.max(colon, 0)).trim().toLowerCase();
      if (colon < 1 || !/^[a-z-]+$/.test(name)) throw new Error(`Unexpected @font-face declaration "${part}".`);
      return { name, value: part.slice(colon + 1).trim() };
    });
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map((part) => part.trim());
}

function unicodeRanges(value: string): Array<readonly [number, number]> {
  return splitTopLevel(value).map((part) => {
    const match = /^U\+([0-9A-F]{1,6}|[0-9A-F]{0,5}\?{1,6})(?:-([0-9A-F]{1,6}))?$/i.exec(part);
    const first = match?.[1];
    if (!match || !first || (first.includes('?') && (match[2] !== undefined || first.length > 6)))
      throw new Error(`Unsupported unicode-range "${value}".`);
    if (first.includes('?'))
      return [
        Number.parseInt(first.replaceAll('?', '0'), 16),
        Number.parseInt(first.replaceAll('?', 'F'), 16),
      ] as const;
    return [Number.parseInt(first, 16), Number.parseInt(match[2] ?? first, 16)] as const;
  });
}

/**
 * The shell paints only in the metric-matched local faces of src/first-paint/shell.css (the web
 * fonts arrive with the full stylesheet), so each of those faces must cover every character the
 * shell renders: anything outside their unicode-range would paint in an unmatched system font and
 * reflow when the web fonts swap in.
 */
export function assertFallbackCoverage(shellCss: string, text: string): void {
  const codepoints = [...new Set(Array.from(text, (char) => char.codePointAt(0) ?? 0))].filter((code) => code >= 0x20);
  const faces = [...shellCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@font-face\s*\{([^{}]*)\}/gi)].map((match) =>
    declarations(match[1] ?? ''),
  );
  if (!faces.length) throw new Error('src/first-paint/shell.css declares no fallback faces for the first-paint shell.');
  for (const list of faces) {
    const family = list.find((declaration) => declaration.name === 'font-family')?.value ?? '(unnamed)';
    const range = list.find((declaration) => declaration.name === 'unicode-range')?.value;
    if (range === undefined) continue;
    const ranges = unicodeRanges(range);
    const missing = codepoints.find((code) => !ranges.some(([from, to]) => code >= from && code <= to));
    if (missing !== undefined) {
      throw new Error(
        `The first-paint shell renders "${String.fromCodePoint(missing)}" (U+${missing.toString(16).toUpperCase().padStart(4, '0')}), which the fallback face ${family} (unicode-range ${range}) does not cover; extend it in src/first-paint/shell.css.`,
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
  const urls = new Set<string>();
  for (const face of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@font-face\s*\{([^{}]*)\}/gi)) {
    for (const url of (face[1] ?? '').matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^'"()\s]*))\s*\)/gi))
      urls.add(url[1] ?? url[2] ?? url[3] ?? '');
  }
  return urls;
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
  const script = stripBootScript(input.bootScript);
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
}

export function firstPaintShell({ variant }: FirstPaintShellOptions): Plugin {
  let root = process.cwd();
  let logger: ResolvedConfig['logger'] | undefined;
  return {
    name: 'play100-first-paint-shell',
    configResolved(config) {
      root = config.root;
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
        const policy = mainDocumentPolicy(JSON.parse(source('vercel.json')));
        // A strict style-src must list the other variant's inline style too (vercel.json serves both
        // kinds of build), and nothing else.
        const other = variant === 'online' ? 'offline' : 'online';
        const otherVariantStyles = allowsInlineStyles(policy)
          ? []
          : [sha256Source((await inlineFirstPaintShell({ ...input, variant: other })).style)];
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
        logger?.info(
          `first-paint shell: ${variant} header; <meta charset> at byte ${charset}; deferred ${deferred}; ${blocks.join('; ')}${others}`,
        );
        return result.html;
      },
    },
  };
}
