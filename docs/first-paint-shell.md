# First-paint shell

The landing page paints before any JavaScript runs. `index.html` carries, inside
`#root`, static markup of exactly what React's first commit renders at `/`: the
skip link, header, hero, the loading collection and the mobile navigation. It is
hidden by default. A small inline boot script shows it only when React's first
commit will match it, and `createRoot()` replaces it in that commit, so the first
paint and the hydrated page never differ. The page below the loading collection
(films, workbook, footer) is React-only; the shell's `main` keeps the page as tall
as the viewport so no scrollbar appears at the handoff.

## Build pipeline

[`scripts/first-paint/plugin.ts`](../scripts/first-paint/plugin.ts) is a Vite
`transformIndexHtml` post hook. It runs only for builds, after Vite injected its
tags and before the PWA `writeBundle` records `index.html`:

1. It keeps the header variant React renders. `<!--shell:online-->` and
   `<!--shell:offline-->` blocks mirror `src/lib/online-availability.ts`: online
   tools configured (or the cloud-test emulators) render the online header,
   otherwise the offline one. When the first commit would show the online
   configuration banner (cloud-test only), the build ships no shell.
2. It moves the entry stylesheet `<link>` from `<head>` to right after `#root`.
   A body stylesheet does not block painting the content before it, but it is a
   script-blocking style sheet, so the deferred module entry (React) still runs
   only after the complete stylesheet applied.
3. It inlines one `<style>` and one classic `<script>` before the first head
   script, after `<meta charset>` and the other metadata.

The development server always serves an empty `#root` (no shell, no boot script).

### The inline style

In this order:

- **Font copies.** The app's latin `@font-face` rules for Barlow Condensed and
  Hanken Grotesk Variable, copied under the names `P100 Barlow Condensed` and
  `P100 Hanken Grotesk`, WOFF2 only and without `unicode-range`. They load the
  same built files as the app, so the shell starts the web-font downloads before
  the full stylesheet arrives. The separate names keep `document.fonts.check()`
  true for the real families.
- **Critical app rules**, selected from the compiled entry stylesheet (Vite's
  emitted `assets/index-*.css`, never source CSS) by
  [beasties](https://github.com/danielroe/beasties) 0.5.4. Beasties receives the
  stylesheet as an inline `<style>` of a throwaway document whose body is the
  shell with `data-beasties-container` on the wrapper, so only rules that match
  inside the shell are kept. Options: `external: false` and `fonts: false`
  (beasties never touches a real `<link>`: no preload, `onload` handler or loader
  script for the CSP to allow), `allowRules: [/^:/]` (selectors starting with a
  pseudo-class, such as `:root`, `:where()` and `::selection`, cannot be matched
  after beasties strips pseudo-classes, so they are kept), `safeParser: false`
  (a CSS syntax error fails the build), `keyframes: 'critical'`, `compress: true`.
  Any beasties warning or error, including an unparseable selector, fails the build.
- **[`src/first-paint/shell.css`](../src/first-paint/shell.css)**, minified: the
  metric-matched local fallback faces, the font stacks that add them, the rule
  that shows the shell, the artifact-caption state rules and the font probes. The
  app never imports this file.

### The boot script

[`src/first-paint/boot.js`](../src/first-paint/boot.js) ships with its comments
and indentation removed. It accepts the document only at `/` without
`view=table`, `game` or `catalogs=off`, derives the artifact caption state React
renders first (stored motion hint, reduced motion, constrained device, coarse
pointer), and measures three off-screen probes to confirm that the
metric-matched fallback faces are usable. Then it sets `data-boot="landing"` and
`data-boot-art` on `<html>`. Anything unexpected leaves the shell hidden.

## Content Security Policy

`vercel.json` is the only policy source. Its main-document `script-src` allows
the boot script by its exact `sha256` hash. The build fails when that hash does
not match the stripped boot script, when a hash matches no inline script, when
a directive mixes `'unsafe-inline'` with a hash or nonce, or when a document has
an inline event handler. `style-src` is unchanged (`'self' 'unsafe-inline'`); a
strict `style-src` must add the printed hash of the inline style instead.
After a build, `npm run check:csp` re-checks every document in `dist` against
`vercel.json` and against the policy `dist/pwa-assets.json` embeds for the
documents the service worker serves, and prints each inline block with its hash.
Changing `boot.js` therefore means updating the hash in `vercel.json`; the build
error names the source to add.

## Keeping the shell exact

- Edit the shell markup together with the components it copies (`AppHeader`,
  `MobileNav`, the hero and loading collection in `CollectionPage`,
  `CollectionArtifact`). [`src/first-paint/shell-parity.test.ts`](../src/first-paint/shell-parity.test.ts)
  compares both variants with their server-rendered markup.
- Intended differences: the static buttons are `inert`, the artifact caption holds
  every state (shell.css shows one), the artifact omits `data-scene-status`,
  `data-activation` and the React-only decorative still (absolutely positioned),
  and the Magnet wrapper omits its inline transition. None changes layout.
- The entry stylesheet must not select what differs between the shell and React:
  `[inert]`, `[style]`, `[data-scene-status]`, `[data-activation]`,
  `[data-shell-art]`, `[data-boot…]` or `.first-paint-shell`. The build refuses them.
- Rules that reach shell elements only through an ancestor outside the shell
  (`#root`, `body` or `html` with more than a bare type selector) are not kept.
- Inlined CSS must use root-relative, `data:`, `https:` or fragment URLs.
- Visible shell text follows the house marks (`…`, `·`, `—`). The fallback faces
  cover every character the shell renders.

[`tests/first-paint-shell.spec.ts`](../tests/first-paint-shell.spec.ts) checks a
built preview in a real browser under the production CSP, for the build's header
variant, on desktop and mobile. It holds the entry stylesheet, the module entry
and the web fonts to compare the shell under inline CSS only, the shell under the
full stylesheet and React's first commit, and it checks that the web fonts swap
in without layout shift. It needs the local fonts the probes measure (Windows or
macOS Impact/Arial, or Liberation Sans/Arimo on Linux).

## Budgets

The shell adds no file: no CSS asset, no script asset and no PWA core entry.
App CSS and the eager JS+CSS gate are unchanged. `index.html` grows by the shell
markup and the inline blocks; that is reported in the HTML totals and counts
toward the PWA core bytes.
