# Performance budgets

`npm run check:budgets` measures a finished build and fails when any figure exceeds its cap in
[`budgets.json`](../budgets.json). [`scripts/check-budgets.ts`](../scripts/check-budgets.ts) defines each metric:
eager JavaScript and CSS, app CSS, standalone CSS, the offline core, the largest lazy chunk and route, index.html,
and the first-paint shell's inline style and boot script. `budgets.json` `notes` records how each cap was set.

## How caps move

Caps only move down.

- **Lowering.** After a configured build of the integrated tree, each cap with room drops to
  `min(cap, measured + max(ceil(1% of measured), 256))`. The margin leaves room for ordinary changes without a cap
  edit, and the bytes a release removes lower the cap instead of becoming room for the next addition.
  `npm run budgets:record -- <report.json> --release <name>` does this from the `npm run check:budgets -- --json
  <report.json>` report of a clean, committed, configured build that passes. It writes the lowered caps and records the
  measurement, its commit and the caps set from it as `budgets.json` `release`; explain the lowered caps in `notes`.
- **Raising.** A change that needs a higher cap adds an entry to `budgets.json` `raises`: the metric, the new
  measurement and the reason the growth is accepted, which `notes` can expand on. The cap then rises to that
  measurement plus the same margin, no further. The next recorded release absorbs the raise and clears the list.
- **Offline worker limits.** `pwaCoreBytes` and `pwaCoreFiles` are the offline worker's install limits (`PWA_BUDGET`
  in [`src/pwa/worker.ts`](../src/pwa/worker.ts)), which the build also enforces. They change only with those
  constants.

[`scripts/budget-policy.test.ts`](../scripts/budget-policy.test.ts) holds the committed `budgets.json` to these rules
([`scripts/budget-policy.ts`](../scripts/budget-policy.ts)). It fails when a cap is above the cap set from the
release, or above the release's measurement plus the margin, unless a raise allows it; when a raise lacks its
measurement or reason, or lets a cap exceed that measurement plus the margin; and when the offline worker limits
differ from `PWA_BUDGET`. It also reads the commit of the latest release in [`docs/releases.md`](releases.md) and,
with `git show`, the `budgets.json` that release shipped: the committed `release` record must equal the shipped one, or
name a newer measurement of a commit in the repository, so the record the caps are judged against can't be quietly
edited. The same release may name another commit only as a provenance alias of the same tree: every other field must
match byte for byte, `release.tree` must be the alias's tree and the shipped commit's (or, when the shipped commit
isn't in the clone, a tree the latest release section of the ledger records), and the alias must be reachable from
HEAD. The test needs the full history, not a shallow clone.

## Keeping bytes down

- **CSS.** Before adding a rule, check whether one already sets the value: a base rule, a shorter media query that
  already covers the width, or a later rule in `shared-responsive.css`. Delete styles with the markup they style.
  `npx tsx scripts/css-unused.ts` lists classes that no source file produces.
- **Chunks.** Rolldown chooses the chunks. The `app-shared` group in [`vite.config.ts`](../vite.config.ts) keeps the
  entry's whole static closure in one chunk, so already-eager modules are not split into small chunks of their own,
  without adding steering imports to that eager closure.
  [`scripts/app-shared-chunk.ts`](../scripts/app-shared-chunk.ts) lists the modules that anchor it; dynamic imports
  stay separate, and the eager-module guard checks that boundary. A second group gives each idle-preloaded tool that the
  deferred online bridge also loads statically its own chunk (`google-intent`, `comparison-game-filter` and
  `friend-comparison-intent`), so the offline core can precache it; without it Rolldown folds them into an unnamed
  shared chunk. [`scripts/preloaded-tool-chunks.ts`](../scripts/preloaded-tool-chunks.ts) lists them and finds their
  facade-less manifest entries, and `online-bridge-closure.test.ts` fails when the bridge loads a preloaded tool it leaves out.
- **Lazy-only code.** A module in the entry's static closure ships in `app-shared` with every export that any chunk
  imports from it, so code that only lazily loaded pages use costs every page while it shares a module with code every
  page needs. Restoring a backup ([`backup-restore.ts`](../src/lib/backup-restore.ts)), Discover's result matching
  ([`catalog-matches.ts`](../src/lib/catalog-matches.ts)), the ranking picker
  ([`catalog-picker.ts`](../src/lib/catalog-picker.ts)), result paging
  ([`local-pagination.ts`](../src/lib/local-pagination.ts)) and My games' artwork
  ([`useDiscoveryArtwork.ts`](../src/hooks/useDiscoveryArtwork.ts)) are modules of their own for that reason. Each
  one's importers already share a lazy chunk, so it joins that chunk instead of adding a file to the offline core.
  [`deferred-module-policy.ts`](../src/lib/deferred-module-policy.ts) lists them with the other deferred modules: the
  build fails when one is eager, and a unit test follows the entry's static imports to find it before a build. Code
  only the online pages use stays in `app-shared` for now, since moving it adds it to the online routes, the largest of
  which is at its cap.

## Low-end phones

Firebase Test Lab ran Release 7 on a Galaxy A03s (2 GB, WebView Chrome 106, 412×785 at DPR 1.75, `deviceMemory` 2)
([docs/releases.md](releases.md)): React's first paint came at 8.0 and 8.2 s, scrolling ran at 32–45 fps, Discover
took about 3 s to open, and every route change logged a ResizeObserver loop error. `npx tsx scripts/low-end-profile.ts`
replays that visit locally ([`scripts/low-end-profile.ts`](../scripts/low-end-profile.ts)): Chromium at 412×785 and
DPR 1.75 with touch, 6× CPU throttling, `deviceMemory` 2 and DevTools' Slow 4G, against builds served over HTTP/2 with
Brotli and `vercel.json`'s headers. Its fallback-font probes fail, as two of the phone's did, so React's first paint
is the first contentful paint. Each visit is a first visit that follows the Test Lab harness, and visits alternate
between the builds it compares.

What changed for those phones (R24):

- **The first commit renders the first screen.** The decorative artifact still, a separate chunk now, and the
  landing's films, workbook and footer render once the first paint is out
  ([`AfterFirstPaint`](../src/components/AfterFirstPaint.tsx)); the collection's loading state, which the first-paint
  shell shares, stays in the first commit.
- **The landing renders in two passes on a constrained device.** Whenever The 100's cards render for a load or an
  app navigation, its first pass builds the first eight cards and holds every other card's place at the card's
  estimated size; the rest, with the films and workbook, follow once that pass has painted, in a transition React
  builds in slices ([`landing-passes.ts`](../src/components/landing-passes.ts)). On the Test Lab phone, opening The 100
  again ran as one task of 1.2 s. A back or forward visit still renders everything at once, so the browser can restore
  its scroll position into the cards.
- **The films load on use on a constrained device.** Their module and posters load only once the films are used,
  focused or opened, not when a scroll passes within 800 px of them; until then each poster frame shows a title card
  numbered like the game jackets, with its play mark ([`FilmPosterCard`](../src/components/FilmPosterCard.tsx)).
- **One style pass before the first paint.** With no tray to place, Compare's chrome heights are measured in the frame
  after the first paint instead of forcing a layout inside React's first commit and restyling the page for it
  (`scheduleTrayMetrics` in [`tray-metrics.ts`](../src/components/compare-tray/tray-metrics.ts)).
- **Discover loads in one round trip.** Its catalog and parser start with the page's chunk, not after it
  ([`discovery-loader.ts`](../src/lib/discovery-loader.ts)), and the loaded catalog renders as a transition.
- **Discover loads before it is opened.** Once a page is idle, Discover's code and catalog load in the background
  ([`discover-page-preload.ts`](../src/lib/discover-page-preload.ts)), on constrained devices too, since they wait
  longest, but not with Save-Data, on 2G, with reduced or Lite motion, or offline. Opening Discover joins those loads.
  The figures below predate this.
- **No ResizeObserver loop.** Card lists estimate a skipped card's height without `auto`
  ([`render-containment.css`](../src/render-containment.css)). To remember sizes, Chromium observes every such card with
  a ResizeObserver of its own. Chrome 106 delivered that observer in the page's observer loop, after the page's own
  observers, and the loop reports "ResizeObserver loop limit exceeded" for any observation it has to skip
  (`LocalFrameView::NotifyResizeObservers` in Chromium 106.0.5249). Later versions deliver it first, and a current
  Chromium does not report the error; Chromium 106 does (below).
- **Lighter paint where it costs most.** A constrained device draws game covers without their blurred shadow.
- **Game details on older browsers.** On the Test Lab phone a game card's link opened nothing. Its click handler had
  prevented the link's own navigation, and the detail's URL came out unchanged, because the app built queries with
  `URLSearchParams.size`. Browsers gained that only in Chrome 113, Firefox 112 and Safari 17, above the floor in the
  [README](../README.md), and it reads `undefined` in older ones. Discover's filters, My games' tabs and pages, the
  Friends views and the Google sign-in return path lost their queries the same way. `querySuffix`
  ([`query-suffix.ts`](../src/lib/query-suffix.ts)) builds them from the parameters' text instead, and
  `resize-observer-loop.spec.ts` replays the visit without `URLSearchParams.size`.

Measured on 2 October 2026 under that profile. Before is live production (Release 7); after is the integrated R24
build after the typed Windows PWA check repair (tree `7d23b21610e81728ae72a2764fb7d964a0756101`),
served locally with production headers. Playwright's Chromium gives medians of five first visits
per build; Chromium 106.0.5249, the phone's engine, driven over the DevTools protocol, one visit per build:

| Metric | Before | After | Change | Chromium 106, before → after |
| --- | ---: | ---: | ---: | ---: |
| React's first paint | 3,630 ms | 2,996 ms | −17% | 6,527 → 3,212 ms |
| Long tasks before the first commit | 312 ms | 171 ms | −45% | 367 → 180 ms |
| Blocking time before the first commit | 212 ms | 71 ms | −67% | 267 → 80 ms |
| From the entry to React's first paint | 366 ms | 228 ms | −38% | 619 → 425 ms |
| Opening Discover | 2,750 ms | 1,612 ms | −41% | 3,256 → 2,032 ms |
| Scrolling the landing | 60 fps | 60 fps | | 54 → 54 fps |
| Scrolling Discover | 60 fps | 60 fps | | 59 → 59 fps |
| The first game link opens its detail | 5 of 5 | 5 of 5 | | no → in 348 ms |
| ResizeObserver loop errors | 0 | 0 | | 4 → 0 |

The two builds reach the browser differently, production over the internet and the R24 build from the same machine,
both through Slow 4G, so the span from the entry to React's first paint is the like-for-like figure. Chromium 106
reproduces both of the phone's failures in Release 7 and neither in the R24 build. The replay understates the phone:
it spends 0.2–0.6 s between the entry and React's first paint, where the phone spent about 5 s, and CPU throttling
doesn't slow raster, so neither build drops below 54 fps where the phone ran at 32–45. Discover still takes 1.6 s to
open here and 2.0 s in Chromium 106, most of it network wait. In Chromium 106 the work moved past the first paint
runs as two tasks of 250–300 ms, about a second after it.

## R22 figures

Configured build of the R22 candidate (main commit `352117813fde9bf9233e3347abaed1eb2d7ee8c1`,
tree `63c5500d4de6a602954a10b686a3519c06095861`), the release figures, which `budgets.json`
records as `release`. Every figure was within its cap, 14 of 14. R23 applied the policy to them, lowering four caps:

| Metric | Measured | Cap at R22 | Cap from R23 |
| --- | ---: | ---: | ---: |
| `eagerCombinedGzipBytes` | 173,072 | 175,542 | 174,803 |
| `cssRawBytes` | 133,777 | 135,115 | 135,115 |
| `cssGzipBytes` | 27,969 | 28,249 | 28,249 |
| `standaloneCssRawBytes` | 574 | 603 | 603 |
| `standaloneCssGzipBytes` | 314 | 330 | 330 |
| `pwaCoreBytes` | 1,783,068 | 2,097,152 | 2,097,152 |
| `pwaCoreFiles` | 46 | 51 | 51 |
| `largestLazyRawBytes` | 571,597 | 577,308 | 577,308 |
| `largestLazyGzipBytes` | 144,991 | 146,453 | 146,441 |
| `indexHtmlRawBytes` | 32,776 | 33,399 | 33,104 |
| `indexHtmlGzipBytes` | 9,162 | 9,386 | 9,386 |
| `inlineStyleRawBytes` | 18,271 | 18,527 | 18,527 |
| `inlineScriptRawBytes` | 3,329 | 3,585 | 3,585 |
| `largestRouteGzipBytes` | 279,232 | 282,325 | 282,025 |

Eager is 155,764 bytes of JavaScript and 17,308 of CSS, gzip9; the offline build measures 172,978. The offline core is
44 public files plus 2 metadata entries.

R22 itself lowered the caps on the tree of main commit `64460f7aaab842e5fae295d19bc07fd79799d595`
(with the first `app-shared` group and the CSS
removals), where they stayed until R23. App CSS lost 1,731 bytes (180 gzip9) by removing rules and declarations that
never applied and merging rules written twice, and each cap with room dropped to its measurement there plus the
margin:

| Metric | Intermediate R22 build | Cap |
| --- | ---: | ---: |
| `eagerCombinedGzipBytes` | 176,221 | 175,542 |
| `cssRawBytes` | 133,777 | 135,115 |
| `cssGzipBytes` | 27,969 | 28,249 |
| `pwaCoreBytes` | 1,783,539 | 2,097,152 |
| `pwaCoreFiles` | 50 | 51 |
| `largestLazyRawBytes` | 571,592 | 577,308 |
| `largestLazyGzipBytes` | 145,002 | 146,453 |
| `indexHtmlRawBytes` | 33,068 | 33,399 |
| `indexHtmlGzipBytes` | 9,228 | 9,386 |
| `inlineStyleRawBytes` | 18,271 | 18,527 |
| `inlineScriptRawBytes` | 3,329 | 3,585 |
| `largestRouteGzipBytes` | 279,529 | 282,325 |

That tree's eager total was over its cap: R22 had added about 2.9 KB of eager JavaScript gzip9 (156,053 to 158,913).
The candidate brought it back under the unchanged cap with two changes in main
commit `69da09cc65b6e2027a362b0d6e311dfab78d5218`: deferred saved artwork and consolidated eager dependencies. Beyond The 100's saved additions
load their artwork through the existing dynamic catalog module instead of a static hook import. The `app-shared`
group takes the entry's whole static closure (`includeDependenciesRecursively`), so the eager code ships as the
entry, `app-shared` and the Rolldown runtime rather than as separate shared chunks. `budgets.json` `notes.r22` and
`notes.r22Release` record both measurements, and `notes.r23` the caps R23 lowered.
