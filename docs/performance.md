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
- **Raising.** A change that needs a higher cap records its reason in `budgets.json` `notes`: the release, the measured
  value, what grew and why that growth is accepted. The cap then rises to the new measured value plus the same margin,
  no further. A cap is never raised to make a build pass without that record.
- **Offline worker limits.** `pwaCoreBytes` and `pwaCoreFiles` are the offline worker's install limits (`PWA_BUDGET`
  in [`src/pwa/worker.ts`](../src/pwa/worker.ts)), which the build also enforces. They change only with those
  constants.

## Keeping bytes down

- **CSS.** Before adding a rule, check whether one already sets the value: a base rule, a shorter media query that
  already covers the width, or a later rule in `shared-responsive.css`. Delete styles with the markup they style.
  `npx tsx scripts/css-unused.ts` lists classes that no source file produces.
- **Chunks.** Rolldown chooses the chunks. The `app-shared` group in [`vite.config.ts`](../vite.config.ts) keeps the
  entry's whole static closure in one chunk, so already-eager modules are not split into small chunks of their own,
  and no import exists only to steer chunking. [`scripts/app-shared-chunk.ts`](../scripts/app-shared-chunk.ts) lists
  the modules that anchor it; dynamic imports stay separate, and the eager-module guard checks that boundary.

## R22 figures

Configured build of the R22 candidate (tree `63c5500d`), the release figures. Every figure is within its cap, 14 of 14:

| Metric | Measured | Cap |
| --- | ---: | ---: |
| `eagerCombinedGzipBytes` | 173,072 | 175,542 |
| `cssRawBytes` | 133,777 | 135,115 |
| `cssGzipBytes` | 27,969 | 28,249 |
| `standaloneCssRawBytes` | 574 | 603 |
| `standaloneCssGzipBytes` | 314 | 330 |
| `pwaCoreBytes` | 1,783,068 | 2,097,152 |
| `pwaCoreFiles` | 46 | 51 |
| `largestLazyRawBytes` | 571,597 | 577,308 |
| `largestLazyGzipBytes` | 144,991 | 146,453 |
| `indexHtmlRawBytes` | 32,776 | 33,399 |
| `indexHtmlGzipBytes` | 9,162 | 9,386 |
| `inlineStyleRawBytes` | 18,271 | 18,527 |
| `inlineScriptRawBytes` | 3,329 | 3,585 |
| `largestRouteGzipBytes` | 279,232 | 282,325 |

Eager is 155,764 bytes of JavaScript and 17,308 of CSS, gzip9; the offline build measures 172,978. The offline core is
44 public files plus 2 metadata entries.

The caps were lowered on an intermediate tree (sim `db0ea42a` with the first `app-shared` group and the CSS removals)
and stayed there. App CSS lost 1,731 bytes (180 gzip9) by removing rules and declarations that never applied and
merging rules written twice, and each cap with room dropped to its measurement there plus the margin:

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
`notes.r22Release` record both measurements.
