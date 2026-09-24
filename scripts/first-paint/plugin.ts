import { readFileSync } from 'node:fs';
import path from 'node:path';
import Beasties from 'beasties';
import type { Logger as BeastiesLogger, Options as BeastiesOptions } from 'beasties';
import type { Plugin, ResolvedConfig } from 'vite';
import { allowsInlineStyles, cspProblems, inlineBlocks, mainDocumentPolicy, sha256Source } from './csp.ts';
import { ROOT_OPEN, SHELL_OPEN, STYLESHEET_MARKER, normalizeShellWhitespace, removeShell, selectShellVariant, shellRegion, shellText } from './shell-html.ts';
import type { ShellVariant } from './shell-html.ts';

/**
 * Static first-paint shell (docs/first-paint-shell.md).
 *
 * index.html carries the markup of React's first commit at "/" inside #root. For a build this
 * plugin runs after Vite has injected its tags and:
 *  - keeps the header variant this build renders (online tools configured or not);
 *  - inlines one <style> and the classic boot script (src/first-paint/boot.js) before the first
 *    head script. The style holds copies of the app's latin web-font faces under names of their
 *    own, the entry-stylesheet rules beasties selects for the shell, and src/first-paint/shell.css;
 *  - moves the entry stylesheet <link> from <head> to right after #root;
 *  - fails the build unless vercel.json allows the inline script by its exact hash (and, under a
 *    strict style-src, exactly the inline styles of both variants), and unless the <meta charset>
 *    declaration fits within the document's first 1024 bytes.
 *
 * A parser-inserted stylesheet in <body> does not block painting the content before it, but it
 * still blocks deferred and module scripts (HTML "script-blocking style sheet"; Chromium also
 * pauses the parser on it). React therefore starts only after the complete stylesheet has
 * applied, while the shell can paint as soon as the document arrives.
 */

/** The app's latin web-font faces that the shell loads under names of their own (shell.css). */
export const FONT_COPIES: Readonly<Record<string, string>> = {
  'Barlow Condensed': 'P100 Barlow Condensed',
  'Hanken Grotesk Variable': 'P100 Hanken Grotesk',
};

/** Attributes and classes that differ between the static shell and React's first commit. */
const SHELL_DIVERGENT_SELECTOR = /\[\s*(?:inert|style|data-scene-status|data-activation|data-shell-art|data-boot)\b|\.first-paint-shell\b/i;
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
  if (offset >= limit) throw new Error(`index.html declares <meta charset> at byte ${offset}; it must start before byte ${limit} to fit within the first 1024 bytes.`);
  return offset;
}

/** Same inputs as src/lib/online-availability.ts: EMULATOR_MODE, ONLINE_CONFIG_ERROR and ONLINE_AVAILABLE. */
export function firstPaintVariant(mode: string, emulators: string | undefined, online: { readonly config: unknown; readonly error: string | null }): ShellVariant | null {
  if (mode === 'cloud-test' && emulators === 'true') return 'online';
  if (online.error) return null;
  return online.config ? 'online' : 'offline';
}

/** Drops comments and indentation from src/first-paint/boot.js; the result is what the CSP hash covers. */
export function stripBootScript(source: string): string {
  const script = source.replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('//')).join('\n');
  // Throws on a syntax error, for example a "/*" in a string that the comment removal cut short.
  new Function(script);
  return script;
}

export function assertInlineSafe(kind: 'style' | 'script', content: string): void {
  if (new RegExp(`</${kind}|<!--`, 'i').test(content)) throw new Error(`The inline first-paint ${kind} contains markup that would end the element early.`);
}

/** The entry stylesheet must not style what the shell and React's first commit render differently. */
export function assertShellNeutralCss(css: string): void {
  const match = SHELL_DIVERGENT_SELECTOR.exec(css);
  if (match) throw new Error(`The entry stylesheet targets "${match[0]}", which differs between the first-paint shell and React's first commit (docs/first-paint-shell.md).`);
}

/** Inlined into index.html, a relative url() would resolve against the document instead of /assets/. */
export function assertRootRelativeUrls(css: string): void {
  for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/gi)) {
    const url = match[1] ?? match[2] ?? match[3] ?? '';
    if (!/^(?:\/(?!\/)|https:|data:|#)/i.test(url)) throw new Error(`The inline first-paint CSS references "${url}", which would resolve against index.html instead of its stylesheet.`);
  }
}

/** Removes comments and optional whitespace from src/first-paint/shell.css, whose strings contain none of {};, */
export function minifyShellCss(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,])\s*/g, '$1').replace(/;\}/g, '}').trim();
}

export function beastiesOptions(logger: BeastiesLogger): BeastiesOptions {
  return {
    // The entry stylesheet arrives as an inline <style> of a throwaway document, so beasties never
    // touches a real <link> (no preload, onload handler or loader script for the CSP to allow),
    // and web fonts are neither preloaded nor inlined: the shell adds its own font copies.
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

/** The entry-stylesheet rules that can apply inside the shell, as selected by beasties. */
export async function criticalAppCss(appCss: string, root: string): Promise<string> {
  assertInlineSafe('style', appCss);
  if (!root.startsWith(ROOT_OPEN + SHELL_OPEN)) throw new Error(`The shell markup must start with ${ROOT_OPEN}${SHELL_OPEN}.`);
  // Matching stays inside the shell: after pseudo-classes are stripped, selectors such as
  // html:has(.toast-visible) would otherwise match the throwaway document itself. Bare html, body
  // and :root rules are always kept.
  const container = `${ROOT_OPEN}${SHELL_OPEN.replace(/>$/, ' data-beasties-container>')}${root.slice(ROOT_OPEN.length + SHELL_OPEN.length)}`;
  const problems: string[] = [];
  const logger: BeastiesLogger = {
    warn: message => { problems.push(message); },
    error: message => { problems.push(message); },
    // A rule beasties cannot evaluate is left out, so the shell would miss it.
    debug: message => { if (message.startsWith('Cannot statically evaluate selector')) problems.push(message); },
  };
  const output = await new Beasties(beastiesOptions(logger)).process(
    `<!doctype html><html lang="en" data-boot="landing" data-boot-art="ready"><head><style>${appCss}</style></head><body>${container}</body></html>`,
  );
  if (problems.length) throw new Error(`beasties could not select the first-paint CSS:\n${problems.join('\n')}`);
  const styles = [...output.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1] ?? '');
  const style = styles[0];
  if (styles.length !== 1 || style === undefined || !style.trim()) throw new Error(`beasties returned ${styles.length} style elements instead of one with the shell's rules.`);
  return style;
}

interface Declaration { readonly name: string; readonly value: string }

function declarations(body: string): Declaration[] {
  return body.split(';').map(part => part.trim()).filter(Boolean).map(part => {
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
  return parts.map(part => part.trim());
}

function unicodeRanges(value: string): Array<readonly [number, number]> {
  return splitTopLevel(value).map(part => {
    const match = /^U\+([0-9A-F]{1,6}|[0-9A-F]{0,5}\?{1,6})(?:-([0-9A-F]{1,6}))?$/i.exec(part);
    const first = match?.[1];
    if (!match || !first || (first.includes('?') && (match[2] !== undefined || first.length > 6))) throw new Error(`Unsupported unicode-range "${value}".`);
    if (first.includes('?')) return [Number.parseInt(first.replaceAll('?', '0'), 16), Number.parseInt(first.replaceAll('?', 'F'), 16)] as const;
    return [Number.parseInt(first, 16), Number.parseInt(match[2] ?? first, 16)] as const;
  });
}

/**
 * Copies of the entry stylesheet's @font-face rules for FONT_COPIES under their new names. Only
 * faces whose unicode-range covers the shell text are copied, as WOFF2 only and without the
 * range: each subset file holds just its own glyphs, so nothing that renders changes.
 */
export function fontFaceCopies(appCss: string, text: string): string {
  const codepoints = [...new Set(Array.from(text, char => char.codePointAt(0) ?? 0))];
  const copies: string[] = [];
  const faces = new Set<string>();
  for (const match of appCss.matchAll(/@font-face\s*\{([^{}]*)\}/gi)) {
    const list = declarations(match[1] ?? '');
    const value = (name: string) => list.find(declaration => declaration.name === name)?.value;
    const family = (value('font-family') ?? '').replace(/^(["'])(.*)\1$/, '$2');
    const copy = Object.hasOwn(FONT_COPIES, family) ? FONT_COPIES[family] : undefined;
    if (copy === undefined) continue;
    const range = value('unicode-range');
    if (range !== undefined) {
      const ranges = unicodeRanges(range);
      const covered = codepoints.filter(code => ranges.some(([from, to]) => code >= from && code <= to)).length;
      if (!covered) continue;
      if (covered !== codepoints.length) throw new Error(`@font-face "${family}" (${range}) covers only part of the shell text, so its first-paint copy cannot drop the range.`);
    }
    const face = [family, value('font-weight') ?? 'normal', value('font-style') ?? 'normal', value('font-stretch') ?? 'normal'].join('|');
    if (faces.has(face)) throw new Error(`Two @font-face rules for "${family}" cover the shell text with the same descriptors.`);
    faces.add(face);
    const body = list.flatMap(({ name, value: declared }) => {
      if (name === 'font-family') return [`font-family:'${copy}'`];
      if (name === 'unicode-range' || (name === 'font-style' && declared === 'normal')) return [];
      if (name !== 'src') return [`${name}:${declared}`];
      const woff2 = splitTopLevel(declared).filter(source => /format\(\s*["']?woff2/i.test(source));
      if (!woff2.length || woff2.some(source => !/^url\(\s*["']?\/assets\/[\w.-]+\.woff2["']?\s*\)/i.test(source))) {
        throw new Error(`@font-face "${family}" needs a built /assets/ WOFF2 source for its first-paint copy: ${declared}`);
      }
      return [`src:${woff2.join(',')}`];
    });
    copies.push(`@font-face{${body.join(';')}}`);
  }
  for (const family of Object.keys(FONT_COPIES)) {
    if (![...faces].some(face => face.startsWith(`${family}|`))) throw new Error(`The entry stylesheet has no @font-face for "${family}" that covers the shell text.`);
  }
  return copies.join('');
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
}

export async function inlineFirstPaintShell(input: InlineShellInput): Promise<InlineShellResult> {
  let html = normalizeShellWhitespace(selectShellVariant(input.html, input.variant));
  const region = shellRegion(html);
  const root = html.slice(region.start, region.end);
  const headEnd = html.indexOf('</head>');
  if (headEnd === -1) throw new Error('index.html has no </head>.');
  const links = [...html.slice(0, headEnd).matchAll(/<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi)].map(match => ({ tag: match[0], index: match.index }));
  if (!links.length) throw new Error('The build injected no entry stylesheet into <head>.');
  const appCss = links.map(({ tag }) => {
    const href = /\bhref=["']?([^"'\s>]+)/i.exec(tag)?.[1];
    if (!href || !href.startsWith('/assets/') || /\bmedia=/i.test(tag)) throw new Error(`Unexpected head stylesheet ${tag}.`);
    return input.readStylesheet(href);
  }).join('\n');
  for (const { tag, index } of [...links].reverse()) {
    const lineStart = html.lastIndexOf('\n', index) + 1;
    const removeFrom = /^\s*$/.test(html.slice(lineStart, index)) ? lineStart : index;
    const after = index + tag.length;
    const removeTo = html[after] === '\n' && removeFrom === lineStart ? after + 1 : after;
    html = html.slice(0, removeFrom) + html.slice(removeTo);
  }
  html = html.replace(STYLESHEET_MARKER, links.map(({ tag }) => tag).join(''));

  assertShellNeutralCss(appCss);
  const style = fontFaceCopies(appCss, shellText(root)) + await criticalAppCss(appCss, root) + minifyShellCss(input.shellCss);
  assertRootRelativeUrls(style);
  const script = stripBootScript(input.bootScript);
  assertInlineSafe('style', style);
  assertInlineSafe('script', script);

  const head = html.slice(0, html.indexOf('</head>'));
  const firstScript = head.search(/<script\b/i);
  const insertAt = firstScript === -1 ? head.length : firstScript;
  const lineStart = html.lastIndexOf('\n', insertAt) + 1;
  const indent = /^\s*$/.test(html.slice(lineStart, insertAt)) ? html.slice(lineStart, insertAt) : '';
  html = `${html.slice(0, insertAt)}<style>${style}</style>\n${indent}<script>${script}</script>\n${indent}${html.slice(insertAt)}`;
  return { html, style, script };
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
        const otherVariantStyles = allowsInlineStyles(policy) ? [] : [sha256Source((await inlineFirstPaintShell({ ...input, variant: other })).style)];
        const problems = cspProblems([{ name: 'index.html', html: result.html }], policy, { otherVariantStyles });
        if (problems.length) throw new Error(`The first-paint shell does not match vercel.json:\n${problems.join('\n')}`);
        const blocks = inlineBlocks(result.html).map(block => `inline ${block.kind} ${block.bytes} B ${block.source}`);
        const others = otherVariantStyles.map(hash => `; ${other} variant inline style ${hash}`).join('');
        logger?.info(`first-paint shell: ${variant} header; <meta charset> at byte ${charset}; ${blocks.join('; ')}${others}`);
        return result.html;
      },
    },
  };
}
