/**
 * Markup helpers for the static first-paint shell in index.html (docs/first-paint-shell.md).
 * They have no build dependencies, so tests can read the exact shell markup the build ships.
 */

export const SHELL_CLASS = 'first-paint-shell';
export const STYLESHEET_MARKER = '<!--p100:stylesheets-->';
export type ShellVariant = 'online' | 'offline';

export const ROOT_OPEN = '<div id="root">';
export const SHELL_OPEN = `<div class="${SHELL_CLASS}" hidden>`;
const VARIANT_BLOCK = /<!--shell:(online|offline)-->([\s\S]*?)<!--\/shell:\1-->/g;
const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function shellRegion(html: string): { start: number; end: number } {
  const start = html.indexOf(ROOT_OPEN);
  const end = html.indexOf(STYLESHEET_MARKER);
  if (start === -1 || end === -1 || end < start || html.indexOf(STYLESHEET_MARKER, end + 1) !== -1) {
    throw new Error(`index.html must contain ${ROOT_OPEN}, the first-paint shell and exactly one ${STYLESHEET_MARKER} after it.`);
  }
  return { start, end };
}

/** Keeps the markup of one header variant and drops the variant markers. */
export function selectShellVariant(html: string, variant: ShellVariant): string {
  const selected = html.replace(VARIANT_BLOCK, (_, name: string, content: string) => name === variant ? content : '');
  if (/<!--\/?shell:/.test(selected)) throw new Error('index.html has an unbalanced first-paint shell variant marker.');
  return selected;
}

/**
 * Removes the HTML comments of a markup fragment by scanning it as the HTML tokenizer does: a
 * comment opened by `<!--` ends at the first `-->` or `--!>`, or at once for `<!-->` and `<!--->`.
 */
function withoutComments(markup: string): string {
  let output = '';
  let from = 0;
  for (let start = markup.indexOf('<!--'); start !== -1; start = markup.indexOf('<!--', from)) {
    output += markup.slice(from, start);
    const body = start + 4;
    if (markup.startsWith('>', body)) from = body + 1;
    else if (markup.startsWith('->', body)) from = body + 2;
    else {
      const ends = [markup.indexOf('-->', body), markup.indexOf('--!>', body)].filter(index => index !== -1);
      if (!ends.length) throw new Error('The first-paint shell has an unterminated comment.');
      const end = Math.min(...ends);
      from = end + (markup.startsWith('-->', end) ? 3 : 4);
    }
  }
  output += markup.slice(from);
  if (output.includes('<!--')) throw new Error('Removing the first-paint shell comments left a comment opening behind.');
  return output;
}

/** Removes comments and the indentation between tags inside #root, matching React's markup. */
export function normalizeShellWhitespace(html: string): string {
  const { start, end } = shellRegion(html);
  const region = withoutComments(html.slice(start, end)).replace(/>\s*\n\s*</g, '><');
  return html.slice(0, start) + region + html.slice(end);
}

/** The #root markup of index.html for one variant, exactly as the build ships it. */
export function shellMarkup(html: string, variant: ShellVariant): string {
  const normalized = normalizeShellWhitespace(selectShellVariant(html, variant));
  const { start, end } = shellRegion(normalized);
  const markup = normalized.slice(start, end);
  if (!markup.startsWith(ROOT_OPEN + SHELL_OPEN)) throw new Error(`#root must start with ${SHELL_OPEN}.`);
  return markup;
}

/** index.html without the shell, for development and for builds whose first commit differs. */
export function removeShell(html: string): string {
  const { start, end } = shellRegion(html);
  return `${html.slice(0, start)}${ROOT_OPEN}</div>${html.slice(end + STYLESHEET_MARKER.length)}`;
}

/** The text between tags: each `<` up to the next `>` is markup (the shell has no raw-text elements). */
function withoutTags(markup: string): string {
  let text = '';
  let from = 0;
  for (let open = markup.indexOf('<'); open !== -1; open = markup.indexOf('<', from)) {
    const close = markup.indexOf('>', open + 1);
    if (close === -1) break;
    text += markup.slice(from, open);
    from = close + 1;
  }
  return text + markup.slice(from);
}

/** The characters of the shell's text nodes, so font subsets can be chosen for them. */
export function shellText(markup: string): string {
  return withoutTags(markup).replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);|&/g, (entity, body: string | undefined) => {
    if (body === undefined) return '&';
    if (body.startsWith('#')) return String.fromCodePoint(body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10));
    const named = NAMED_ENTITIES[body];
    if (named === undefined) throw new Error(`The first-paint shell text contains an unsupported entity "${entity}".`);
    return named;
  });
}
