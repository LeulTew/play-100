/**
 * Markup helpers for the first-paint shell (docs/first-paint-shell.md). #root in index.html holds a placeholder,
 * which the build replaces with React's first commit at "/" rendered from the landing components
 * (src/first-paint/shell-render.tsx), followed by the failure notice.
 * They have no build dependencies, so tests can read the exact #root markup the build ships.
 */

export const SHELL_CLASS = 'first-paint-shell';
/** Ends the #root markup in index.html; builds drop it (its name dates from when the entry stylesheet moved there). */
export const STYLESHEET_MARKER = '<!--p100:stylesheets-->';
/** Marks the place of the rendered shell in #root of index.html. */
export const SHELL_PLACEHOLDER = '<!--p100:shell-->';
export type ShellVariant = 'online' | 'offline';

export const ROOT_OPEN = '<div id="root">';
/** Opens the shell as react-dom/server renders it. */
export const SHELL_OPEN = `<div class="${SHELL_CLASS}" hidden="">`;
/** Opens the failure notice the boot script shows in place of the shell when the app cannot start. */
export const NOTICE_OPEN = '<main class="app-error" id="p100-boot-error" hidden>';
// An element name no markup uses, standing in for the shell while the comments of #root are removed.
const SHELL_SENTINEL = '<p100-shell>';
const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function shellRegion(html: string): { start: number; end: number } {
  const start = html.indexOf(ROOT_OPEN);
  const end = html.indexOf(STYLESHEET_MARKER);
  if (start === -1 || end === -1 || end < start || html.indexOf(STYLESHEET_MARKER, end + 1) !== -1) {
    throw new Error(
      `index.html must contain ${ROOT_OPEN}, the first-paint shell and exactly one ${STYLESHEET_MARKER} after it.`,
    );
  }
  return { start, end };
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
      const ends = [markup.indexOf('-->', body), markup.indexOf('--!>', body)].filter((index) => index !== -1);
      if (!ends.length) throw new Error('The first-paint shell has an unterminated comment.');
      const end = Math.min(...ends);
      from = end + (markup.startsWith('-->', end) ? 3 : 4);
    }
  }
  output += markup.slice(from);
  if (output.includes('<!--'))
    throw new Error('Removing the first-paint shell comments left a comment opening behind.');
  return output;
}

/**
 * index.html with a rendered shell in place of its placeholder. The comments of #root and the indentation between its
 * tags go, so the failure notice after the shell matches React's markup too; the shell itself stays as rendered.
 */
export function withShell(html: string, shell: string): string {
  if (!shell.startsWith(SHELL_OPEN) || shell.includes('<!--') || shell.includes(SHELL_SENTINEL))
    throw new Error(`The rendered first-paint shell must start with ${SHELL_OPEN} and hold no comments.`);
  const { start, end } = shellRegion(html);
  const region = html.slice(start, end);
  if (
    html.split(SHELL_PLACEHOLDER).length !== 2 ||
    !region.includes(SHELL_PLACEHOLDER) ||
    region.includes(SHELL_SENTINEL)
  )
    throw new Error(`index.html must hold exactly one ${SHELL_PLACEHOLDER}, inside #root.`);
  const marked = withoutComments(region.replace(SHELL_PLACEHOLDER, SHELL_SENTINEL)).replace(/>\s*\n\s*</g, '><');
  // A placeholder inside a comment goes with it.
  if (marked.split(SHELL_SENTINEL).length !== 2)
    throw new Error(`The ${SHELL_PLACEHOLDER} of index.html must stand outside every comment.`);
  return html.slice(0, start) + marked.replace(SHELL_SENTINEL, () => shell) + html.slice(end);
}

/** The #root markup of index.html with a rendered shell, exactly as the build ships it. */
export function shellMarkup(html: string, shell: string): string {
  const shipped = withShell(html, shell);
  const { start, end } = shellRegion(shipped);
  const markup = shipped.slice(start, end);
  if (!markup.startsWith(ROOT_OPEN + SHELL_OPEN)) throw new Error(`#root must start with ${SHELL_OPEN}.`);
  return markup;
}

/**
 * The failure notice in the #root markup of one variant. It is the last child of #root, after the shell, so it can
 * show on every route, and React's first commit replaces the shell and the notice with the app.
 */
export function bootNotice(markup: string): string {
  const start = markup.indexOf(NOTICE_OPEN);
  const end = start === -1 ? -1 : markup.indexOf('</main>', start);
  const notice = end === -1 ? '' : markup.slice(start, end + '</main>'.length);
  if (!notice || markup.includes(NOTICE_OPEN, start + 1) || !markup.endsWith(`</div>${notice}</div>`))
    throw new Error(`#root must end with one failure notice, ${NOTICE_OPEN}…</main>, after the shell.`);
  return notice;
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
    if (body.startsWith('#'))
      return String.fromCodePoint(
        body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10),
      );
    const named = NAMED_ENTITIES[body];
    if (named === undefined) throw new Error(`The first-paint shell text contains an unsupported entity "${entity}".`);
    return named;
  });
}
