# Source data and development

## Data, images and source truth

`data\collection.json` is the canonical import. `public\data\collection.json`
is an exact copy served by the site. The authoritative source is the original
workbook's `AAA Top 50` main sheet, which actually contains **100** entries.
Core is ranks 1-50; Essential is ranks 51-100. Sorting never rewrites those ranks.

`data\Play-100-Collection.xlsx` and
`public\downloads\Play-100-Collection.xlsx` are the byte-identical enhanced
five-sheet workbook. The original source workbook was not changed.
The original, including its older derivative tabs, is also served unchanged as
`public\downloads\AAA_games_u_have_to_play_list_top_100.xlsx`.

- Critic scores are a carried-over snapshot, not live or independently verified.
- Metacritic / Metacritic PC / PC Gamer use 100-point scales; IGN / GameSpot use 10.
- The average normalizes all available entered columns, including both
  Metacritic columns. Missing values remain null and are excluded, never zero.
- **Leul's original rating** comes from source column L, headed
  `my rating(based on rank)`. Every cached number, rounded/text result, number
  format and source note is preserved in `authorRating`. For example, The
  Witcher 3 is **9.9** and Grand Theft Auto IV is **9.8**, not replacement curve
  values. The `rawValue` string retains the exact original XML cache text.
- The legacy `rankIndex` JSON field remains an internal compatibility value.
  It is not used as a substitute for Leul's recorded rating. Visitor ratings
  are separate private data and are never seeded from author or critic values.
- All 12 explicit source notes are preserved. No completion is inferred.
- The source excludes Nintendo and retains its premium non-AAA exceptions.

All 100 covers are user-supplied workbook thumbnails. Most are roughly 96 x 120
pixels; the nine larger source posters are only 150 pixels wide. The site uses
compact, native-resolution covers within original vector collection frames.
`sharp` converts to WebP without enlargement. There are no invented high-resolution
covers, scraped trailers, platforms, playtimes or contemporary review claims.
The source caveat for rank 73 is shown in details: the workbook's
**Hitman: World of Assassination**, year **2016**, and **HITMAN III**-branded image
are all preserved, not silently reconciled into an inferred edition.

Full provenance, original asset mappings and derivative-workbook repairs are in
`data\artifact-manifest.json` and `data\source-audit.json`. Cover packaging does
not establish exact editions, available platforms or an independent artwork
redistribution license.
The shared public `author.json` drives website credits and generated workbook
attribution. Each enhanced sheet has a bottom hyperlink block and print-footer
credit, outside the 100-record tables. The untouched original archive is not branded
or modified.

## Rebuild or update the source

The provided Python generator is retained, not reimplemented:

```powershell
python -m venv .venv-data
.\.venv-data\Scripts\python.exe -m pip install -r data\requirements.txt
.\.venv-data\Scripts\python.exe data\generate_collection.py --source "C:\path\to\original.xlsx" --output "C:\path\to\canonical-output"
npm run import:data -- "C:\path\to\canonical-output"
Copy-Item "C:\path\to\original.xlsx" "public\downloads\AAA_games_u_have_to_play_list_top_100.xlsx"
npm run prepare:assets
npm run assets:social-card
npm run validate:data
npm test
npm run build
```

Use a separate generator output directory, not the project root. Import copies
only the canonical files, original `assets` and generator/test material; it never
copies virtual environments, previews or caches. `prepare:assets` regenerates
native-size WebP thumbnails, actual image dimensions and public licenses. It
does not fetch external artwork or modify game records. `assets:social-card`
separately renders the 1200x630 social image using the installed Playwright
Chromium and embedded Barlow Condensed / Hanken Grotesk WOFF2 files. It refuses
missing or unloaded fonts instead of using system-font fallbacks. Keep the
existing social metadata URLs, alt text and dimensions unchanged when rendering.
Source updates must still contain the intended 100 author-ordered records.

## Implementation map

| Location | Responsibility |
| --- | --- |
| `src\App.tsx` | Browse-first page, navigation, collection state and dialogs |
| `src\lib` | Typed data validation, score semantics, URL and storage formats |
| `src\lib\personal-library.ts` | Pure private-library invariants, actions, migration and backups |
| `src\lib\personal-db.ts` | Atomic IndexedDB transactions and same-browser notifications |
| `src\hooks` | Collection loading, history, transactional UI state, sharing and capability hints |
| `src\components` | Controls, game jackets, game details, settings and methodology |
| `src\components\personal` | Ordered queue, personal rankings, manual entry and backups |
| `src\components\catalog` | Main-search catalog results and explicit discovery/import |
| `src\cloud` | Lazy managed identity, scoped sync, account/public/community/creator surfaces |
| `src\lib\scoped-library.ts` | Account keys, atomic pending metadata and local recovery in the existing DB |
| `src\lib\snapshot-transport.ts` | Deterministic bounded chunk transport and integrity checks |
| `firestore.rules`, `tests-cloud` | Server-enforced data boundaries and actual emulator regression gates |
| `src\components\avatar` | Locally generated, version-pinned Critters and controlled avatar picker |
| `api\catalog.ts`, `api\catalog-detail.ts` | Fixed-host, bounded, read-only catalog adapters |
| `api\auth-helper.ts` | Same-origin authentication helper with fresh CSP nonces |
| `api\csp-report.ts`, `api\client-error-report.ts`, `api\operational-probe.ts` | Privacy-bounded CSP/client-fault counts and cached dependency health |
| `src\pwa` | Versioned offline worker, caches, update/recovery flow and bounded downloads |
| `src\first-paint` | Early static-shell boot and font readiness |
| `src\motion` | Shared motion and reduced-motion behavior |
| `scripts` | Data preparation, first-paint build, CSP/budget checks and candidate-bound release evidence |
| `src\components\scene` | Authored Three.js folios, static SVG, lifecycle and frame budget |
| `src\components\bits` | Customized, attributed React Bits components |
| `src\generated\cover-metadata.json` | Actual native artwork dimensions |
| `data` | Canonical source, workbook, originals, provenance and reproduction code |
| `public` | Deployable data, optimized covers, download, social card and notices |
| `tests` | Real-browser interaction and accessibility coverage |

Runtime composition, sources of truth and cross-boundary invariants are described in [Architecture](architecture.md).

Public collection state is query-string based: `q`, `genre`, `year`, `tier`,
`sort`, `direction`, `view` (grid/list/table), `catalogs` (on/off) and `game`. `list` is a device-only
view filter and is stripped from shared URLs. Separate `/my-library`,
`/my-rankings` and `/discover` routes are rewritten to the app entry on Vercel.
Private library/ranking search stays out of URLs. A private-page URL opens each
visitor's active guest or authenticated account data, not another person's
library. Public `/u/<handle>` URLs expose only explicitly published snapshots;
Community includes only people who separately opted into directory listing.
Game dialogs preserve direct entry and Back/Forward behavior.
Unsaved catalog previews are held only in the current page session, not silently
imported. Save or rate an external entry before closing the page to retain its
metadata and allow its private detail link to reopen on that browser.
Social previews use the collection's common static card; game titles update in
the browser rather than requiring a server renderer.
