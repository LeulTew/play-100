# First-paint shell

The landing page paints before any JavaScript runs. `index.html` carries, inside
`#root`, static markup of exactly what React's first commit renders at `/`: the
skip link, header, hero, the loading collection and the mobile navigation. It is
hidden by default. A small inline boot script shows it only when React's first
commit will match it, and `createRoot()` replaces it in that commit, so the first
paint and the hydrated page never differ. The page below the loading collection
(films, workbook, footer) is React-only; the shell's `main` keeps the page as tall
as the viewport so no scrollbar appears at the handoff.

The boot script also starts the app. When it shows the shell, the app requests
nothing before the shell's first contentful paint, so the shell paints as soon as
the document arrives, in browsers and in Lighthouse's simulated load alike.
Everywhere else the app starts at once.

## Build pipeline

[`scripts/first-paint/plugin.ts`](../scripts/first-paint/plugin.ts) is a Vite
`transformIndexHtml` post hook. It runs only for builds, after Vite injected its
tags and before the PWA `writeBundle` records `index.html`:

1. It keeps the header variant React renders. `<!--shell:online-->` and
   `<!--shell:offline-->` blocks mirror `src/lib/online-availability.ts`: online
   tools configured (or the cloud-test emulators) render the online header,
   otherwise the offline one. When the first commit would show the online
   configuration banner (cloud-test only), the build ships no shell and leaves
   Vite's tags where Vite put them.
2. It moves every startup tag out of `<head>` into
   `<template id="p100-deferred">`: Vite's module entry, its modulepreloads and
   the entry stylesheet, and the Barlow Condensed 800 and `collection.json`
   preloads of the public-metadata plugin. Template content is inert, so none of
   them starts a request (Chromium's preload scanner skips it too). The tags are
   read with an HTML tokenizer, and anything the boot script could not recreate
   exactly fails the build: another head script, a startup link with a second
   `rel`, a `media` query or a URL outside the site.
3. It inlines one `<style>`, that template and one classic `<script>` at the end
   of `<head>`, after `<meta charset>` and the other metadata.
4. It fails the build unless `<meta charset>` is serialized completely within the
   document's first 1024 bytes, which is all the HTML encoding prescan reads; the
   build log names its byte offset and counts the deferred tags. This is why the
   design comment in `index.html` sits after the charset declaration:
   head-prepended tags already come before it.

The development server always serves an empty `#root` (no shell, no boot script)
with Vite's tags in place.

### The inline style

In this order:

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
  app never imports this file. The inline style declares no web font: the shell
  paints only in these fallback faces, and Barlow Condensed and Hanken Grotesk
  arrive with the full stylesheet and swap in without moving a line. The build
  fails if the shell renders a character outside the faces' `unicode-range`.
  `P100 DF Impact`, `P100 DF Arial` and
  `P100 Sans Fallback` are metric-adjusted aliases of widely installed local fonts
  (Impact, Arial and their Liberation or Arimo clones), not new typefaces; the
  design linter reports them as fonts outside DESIGN.md, which is expected.

### The boot script

[`src/first-paint/boot.js`](../src/first-paint/boot.js) ships with its comments
and indentation removed. It accepts the document only at `/` without
`view=table`, `game` or `catalogs=off`, derives the artifact caption state React
renders first (stored motion hint, reduced motion, constrained device, coarse
pointer), and measures three off-screen probes to confirm that the
metric-matched fallback faces are usable. Then it sets `data-boot="landing"` and
`data-boot-art` on `<html>`. Anything unexpected leaves the shell hidden.

Then it starts the app by inserting the template's tags into `<head>`, once:
the module entry as a `modulepreload`, the other modulepreloads, the entry
stylesheet (after the inline style, so it wins cascade ties, and before any lazy
chunk stylesheet Vite appends later) and the preloads. It adds the module entry
itself only after every stylesheet has loaded or failed and, like the
parser-inserted module it replaces, once the document is parsed, so React never
commits before the complete stylesheet applies or before `#root` exists.

When it shows the shell, it waits for the `first-contentful-paint` entry, which
Chromium reports once the shell's frame is presented; a second after the document
is parsed, a timer starts the app if that entry never came. It starts at once
when it keeps the shell hidden, when the document is hidden or prerendering
(neither paints yet), and when anything fails while it arranges to wait.
Starting at once in `<head>` inserts the stylesheet before `<body>` exists, which
Chromium still treats as render-blocking; either way React commits only after
the stylesheet has loaded.
On `/` the `load` event may fire before the app starts; nothing depends on it
(idle prefetching checks `document.readyState` first).

## Content Security Policy

`vercel.json` is the only policy source. Its main-document `script-src` allows
the boot script by its exact `sha256` hash. The build fails when that hash does
not match the stripped boot script, when a hash matches no inline script, when
a directive mixes `'unsafe-inline'` with a hash or nonce, or when a document has
an inline event handler. `style-src` is unchanged (`'self' 'unsafe-inline'`). A
strict `style-src` (no `'unsafe-inline'`) must list exactly the inline style
hashes of both shell variants, because one static `vercel.json` serves builds
with and without Firebase: the build computes the other variant's style too,
prints it, and fails on a missing or stale style hash or a `style=` attribute.
`check:csp` sees one variant only, so it checks missing style hashes but leaves
stale ones to the build.
After a build, `npm run check:csp` re-checks every document in `dist` against
`vercel.json` and against the policy `dist/pwa-assets.json` embeds for the
documents the service worker serves, and prints each inline block with its hash.
Changing `boot.js` therefore means updating the hash in `vercel.json`; the build
error names the source to add. Because the boot script starts the app, a policy
that blocked it would leave every route without React: the build hash sync,
`check:csp` and the browser spec, which loads `/` and `/?catalogs=off` under the
production policy and uses the page, guard against that.

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
- The emitted entry stylesheet must contain no `@import`. Vite inlines the relative `@import`
  partials of the source CSS manifests; one it leaves in place would load outside the first-paint
  template, and before the first paint if it reached the inline style. The build refuses it and
  names the file.
- The root `font-family` and `--display` stay on `:root` (or bare `html`), without `!important`.
  `shell.css` adds the metric-matched fallbacks to those stacks with `html[data-boot=landing]`
  (specificity 0,1,1), and the entry stylesheet loads after it. In the entry stylesheet the build
  refuses:
  - `--display` on any other selector;
  - `font` or `font-family` on the root element with more specificity (`html[lang]`,
    `:root:not(…)`);
  - `font` or `font-family` on an element that may be `html`, `body` or `#root`, unless it is
    `inherit` or `unset`.

  Each selector is judged by its subject compound, the element it styles. A subject counts as
  another element only if it has a type other than `html`, `body` or `div`, a class, an id other
  than `#root`, or an `:is()`/`:where()` whose every alternative does. So `:where(body)`,
  `:not(…)`, `:has(…)`, attribute-only selectors, `div` and `*` may only use `inherit` or `unset`.
  A namespace prefix is ignored, so `*|body` counts as `body`.
- Visible shell text follows the house marks (`…`, `·`, `—`). The fallback faces
  must cover every character the shell renders; the build refuses one they do not
  (`—` is outside their ranges today, so adding it means extending them).

[`tests/first-paint-shell.spec.ts`](../tests/first-paint-shell.spec.ts) checks a
built preview in a real browser under the production CSP, for the build's header
variant, on desktop and mobile. It holds the entry stylesheet, the module entry
and the web fonts to compare the shell under inline CSS only, the shell under the
full stylesheet and React's first commit, checks that the app's first requests
start after the shell's first contentful paint, and checks that the web fonts
swap in without layout shift. It needs the local fonts the probes measure
(Windows or macOS Impact/Arial, or Liberation Sans/Arimo on Linux).

## Budgets

The shell adds no file: no CSS asset, no script asset and no PWA core entry.
App CSS and the eager JS+CSS gate are unchanged: the budget check reads the
template's tags like any other, so they still count as eager. `index.html` grows
by the shell markup and the inline blocks; that is reported in the HTML totals
and counts toward the PWA core bytes.
