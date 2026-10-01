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
differ from `PWA_BUDGET`.

## Keeping bytes down

- **CSS.** Before adding a rule, check whether one already sets the value: a base rule, a shorter media query that
  already covers the width, or a later rule in `shared-responsive.css`. Delete styles with the markup they style.
  `npx tsx scripts/css-unused.ts` lists classes that no source file produces.
- **Chunks.** Rolldown chooses the chunks. The `app-shared` group in [`vite.config.ts`](../vite.config.ts) keeps the
  entry's whole static closure in one chunk, so already-eager modules are not split into small chunks of their own,
  and no import exists only to steer chunking. [`scripts/app-shared-chunk.ts`](../scripts/app-shared-chunk.ts) lists
  the modules that anchor it; dynamic imports stay separate, and the eager-module guard checks that boundary.

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
- **One style pass before the first paint.** With no tray to place, Compare's chrome heights are measured in the frame
  after the first paint instead of forcing a layout inside React's first commit and restyling the page for it
  (`scheduleTrayMetrics` in [`tray-metrics.ts`](../src/components/compare-tray/tray-metrics.ts)).
- **Discover loads in one round trip.** Its catalog and parser start with the page's chunk, not after it
  ([`discovery-loader.ts`](../src/lib/discovery-loader.ts)), and the loaded catalog renders as a transition.
- **No ResizeObserver loop.** Card lists estimate a skipped card's height without `auto`
  ([`render-containment.css`](../src/render-containment.css)). To remember sizes, Chromium observes every such card with
  a ResizeObserver of its own. Chrome 106 delivered that observer in the page's observer loop, after the page's own
  observers, and the loop reports "ResizeObserver loop limit exceeded" for any observation it has to skip
  (`LocalFrameView::NotifyResizeObservers` in Chromium 106.0.5249). Later versions deliver it first, and a current
  Chromium does not report the error, so the replay checks it in a Chromium 106 build.
- **Lighter paint where it costs most.** A constrained device draws game covers without their blurred shadow.
- **Game details on older browsers.** On the Test Lab phone a game card's link opened nothing. Its click handler had
  prevented the link's own navigation, and the detail's URL came out unchanged, because the app built queries with
  `URLSearchParams.size`. Browsers gained that only in Chrome 113, Firefox 112 and Safari 17, above the floor in the
  [README](../README.md), and it reads `undefined` in older ones. Discover's filters, My games' tabs and pages, the
  Friends views and the Google sign-in return path lost their queries the same way. `querySuffix`
  ([`query-suffix.ts`](../src/lib/query-suffix.ts)) builds them from the parameters' text instead, and
  `resize-observer-loop.spec.ts` replays the visit without `URLSearchParams.size`.

## R22 figures

Configured build of the R22 candidate (commit `5b6dadd8`, tree `63c5500d`), the release figures, which `budgets.json`
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

R22 itself lowered the caps on an intermediate tree (sim `db0ea42a` with the first `app-shared` group and the CSS
removals), where they stayed until R23. App CSS lost 1,731 bytes (180 gzip9) by removing rules and declarations that
never applied and merging rules written twice, and each cap with room dropped to its measurement there plus the
margin:

| Metric | Intermediate `db0ea42a` | Cap |
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
The candidate brought it back under the unchanged cap with two changes in `ae1dd74d`. Beyond The 100's saved additions
load their artwork through the existing dynamic catalog module instead of a static hook import. The `app-shared`
group takes the entry's whole static closure (`includeDependenciesRecursively`), so the eager code ships as the
entry, `app-shared` and the Rolldown runtime rather than as separate shared chunks. `budgets.json` `notes.r22` and
`notes.r22Release` record both measurements, and `notes.r23` the caps R23 lowered.
