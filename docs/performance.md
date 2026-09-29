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
- **Chunks.** Rolldown chooses the chunks. When it splits modules the entry shares with lazy chunks into small chunks
  of their own, the `app-shared` group in [`vite.config.ts`](../vite.config.ts) keeps them in one chunk instead of
  adding imports that only steer chunking. [`scripts/app-shared-chunk.ts`](../scripts/app-shared-chunk.ts) lists
  them.

## R22 figures

Configured build of the R22 integration tree:

| Metric | Measured | Cap |
| --- | ---: | ---: |
| `eagerCombinedGzipBytes` | 176,221 | 175,542 |
| `cssRawBytes` | 133,777 | 135,115 |
| `cssGzipBytes` | 27,969 | 28,249 |
| `standaloneCssRawBytes` | 574 | 603 |
| `standaloneCssGzipBytes` | 314 | 330 |
| `pwaCoreBytes` | 1,783,539 | 2,097,152 |
| `pwaCoreFiles` | 50 | 51 |
| `largestLazyRawBytes` | 571,592 | 577,308 |
| `largestLazyGzipBytes` | 145,002 | 146,453 |
| `indexHtmlRawBytes` | 33,068 | 33,399 |
| `indexHtmlGzipBytes` | 9,228 | 9,386 |
| `inlineStyleRawBytes` | 18,271 | 18,527 |
| `inlineScriptRawBytes` | 3,329 | 3,585 |
| `largestRouteGzipBytes` | 279,529 | 282,325 |

App CSS lost 1,731 bytes (180 gzip9) by removing rules and declarations that never applied and merging rules written
twice. Eager JavaScript grew by about 2.9 KB gzip9 in R22 (156,053 to 158,913), which puts the eager total over its
cap; `budgets.json` `notes.r22` records where it grew.
