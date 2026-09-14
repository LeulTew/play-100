# Play 100

A public, responsive collection of 100 games with an authored order, a sortable
ratings table, private libraries and personal rankings. Built with React,
TypeScript, Vite, native IndexedDB, dnd kit and one lazy Three.js sculpture.
A stateless Vercel function looks up public catalogs; private data never uses a
server database, accounts, analytics or Supabase.

**Live:** https://play-100-collection.vercel.app  
**Curated by:** Leul Tewodros Agonafer  
**Public source:** https://github.com/LeulTew/play-100  
**LinkedIn:** https://www.linkedin.com/in/leul-t-agonafer-861bb3336/  
**Telegram:** https://t.me/fabbin (@fabbin)
**Workbook:** https://play-100-collection.vercel.app/downloads/Play-100-Collection.xlsx
**Original Excel:** https://play-100-collection.vercel.app/downloads/AAA_games_u_have_to_play_list_top_100.xlsx  
**Private library:** https://play-100-collection.vercel.app/my-library  
**Personal rankings:** https://play-100-collection.vercel.app/my-rankings  
**Discover:** https://play-100-collection.vercel.app/discover

## Run locally

Use Node.js 22.12 or later.

```powershell
npm ci
npm run dev
```

For the production build and the dedicated preview port:

```powershell
npm run build
npm run preview -- --port 4187 --strictPort
```

The preview is at `http://127.0.0.1:4187`. A strict port avoids accidentally
replacing another project's server. Ordinary `npm run dev` prints its own URL.

## Checks

```powershell
npm run validate:data
npm test
npm run lint
npm run build
npx playwright install chromium --only-shell
npm run test:e2e
```

The browser suite covers desktop and mobile, pagination, exact source order,
search/filter/sort history, native-scale ratings tables, bulk actions, actual
mouse/touch dragging, keyboard reordering, game deep links, focus restoration,
legacy migration, IndexedDB denial/corruption, concurrent-tab changes, unplayed
rankings, private scores/notes, backup export/restore, catalog failure recovery,
sharing and both exact-byte Excel downloads. It also covers live reduced motion,
Lite/no-WebGL behavior, automated WCAG checks, every declared font face and
browser console/CSP errors.
Unified-search regressions cover debouncing, cancelled responses, source-page
retry, Unranked labels, atomic rating/import failures, saved additions during
provider outages, native-select alignment, and full browser close/relaunch with
the same isolated test profile.

To exercise an existing public deployment instead of the local preview:

```powershell
$env:PLAY100_BASE_URL = "https://your-production-domain.vercel.app"
npm run test:e2e
```

No benchmark score is implied by passing these checks. Synthetic browsers are not
a substitute for testing on physical low-end devices.

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
npm run validate:data
npm test
npm run build
```

Use a separate generator output directory, not the project root. Import copies
only the canonical files, original `assets` and generator/test material; it never
copies virtual environments, previews or caches. `prepare:assets` regenerates
native-size WebP thumbnails, actual image dimensions, the original social card
and public licenses. It does not fetch external artwork or modify game records.
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
| `api\catalog.ts` | Fixed-host, bounded, read-only catalog adapters |
| `src\components\scene` | Authored Three.js folios, static SVG, lifecycle and frame budget |
| `src\components\bits` | Customized, attributed React Bits components |
| `src\generated\cover-metadata.json` | Actual native artwork dimensions |
| `data` | Canonical source, workbook, originals, provenance and reproduction code |
| `public` | Deployable data, optimized covers, download, social card and notices |
| `tests` | Real-browser interaction and accessibility coverage |

Public collection state is query-string based: `q`, `genre`, `year`, `tier`,
`sort`, `direction`, `view` (grid/list/table), `catalogs` (on/off) and `game`. `list` is a device-only
view filter and is stripped from shared URLs. Separate `/my-library`,
`/my-rankings` and `/discover` routes are rewritten to the app entry on Vercel.
Private library/ranking search stays out of URLs. A private-page URL opens each
visitor's own local data; it does not publish the original visitor's ranking.
Game dialogs preserve direct entry and Back/Forward behavior.
Unsaved catalog previews are held only in the current page session, not silently
imported. Save or rate an external entry before closing the page to retain its
metadata and allow its private detail link to reopen on that browser.
Social previews use the collection's common static card; game titles update in
the browser rather than requiring a server renderer.

## Private library durability

Database `play100-personal`, version 2, contains the `library` object store and
one `state` record with application schema version 3. A complete snapshot keeps
queue order, record metadata, independent played/completed/later flags, personal
rank order, optional 0-10 scores, notes and preferences in one atomic transaction.
Writes read the latest snapshot inside a read-write transaction and report
success only after commit. Concurrent tabs do not replace each other's unrelated
updates. Ordering commands use IDs against the latest order, not stale arrays.

Played status uses one shared persisted value across cards, list/table views,
details, the library, personal rankings and catalog entries. Unchecking Played
also clears Completed, while leaving the play-later/replay queue intact.

Personal rankings automatically put higher visitor ratings first, with unrated
entries last and stable ties. Moving an entry with drag or arrow controls records
its `manualPosition`; that slot remains fixed during later rating changes.
Other manually positioned entries shift only when an explicit drag/removal
displaces them. Per-game and whole-list **Use rating order** controls release
these overrides. Valid ratings save after a 650ms pause or on field exit; failed
autosaves retain the prior value and do not retry in a background loop.

Earlier version-two snapshots/backups did not record drag intent. Their saved
orders are therefore preserved as manual positions, never guessed or silently
reset. The visible automatic-order control enables rating sorting when desired.
Version-three backups retain ratings, order, manual positions and played flags.

Existing `play100.library.v1` localStorage lists migrate once the canonical
records are available. The old key is removed only after a successful IndexedDB
commit. Invalid legacy data is preserved, not silently coerced. Completion
implies played; ranking does not. A completed game may remain queued for replay.

IndexedDB denial can leave the UI in an explicitly labeled temporary-tab mode;
it never claims cloud or durable saving. Later quota/transaction failures retain
the previously committed state and surface an error. BroadcastChannel plus
focus/visibility refresh synchronize tabs of the same origin, not devices.
Temporary edits are not discarded by a later successful collection reload;
save a backup and explicitly restore or reset when storage becomes available.
Focused ranking fields follow peer-tab updates unless the user actually edited
them. Dirty drafts are retained until an intentional save, invalid native number
input does not clear a saved score, and unsaved drafts warn before page unload.
Valid pending ratings and notes also flush when their editor disappears, such
as browser Back, dialog Escape or next-game navigation. Each detail editor is
keyed to its game, so an outgoing draft cannot become the next game's rating.
An already-failed save is not silently retried on exit; committed data stays
unchanged and the storage warning remains explicit.

Both original and imported game details provide **Your rating**, using the same
private state as My rankings. The original creator's rating stays separately
labeled and is never overwritten or used as a personal default.

My library supports individual and selected-game removal, with a focused
confirmation listing the affected titles and explaining loss of their private
progress, queue membership, ratings and notes. The cancellation button receives
initial focus. Removal is atomic and only touches selected IDs; other records
and their relative ordering are retained. Removing a canonical game from a
private library does not remove it from the public 100. This action has no
undo, so export a Settings backup first when needed. All my games and Completed
use plain lists instead of showing disabled drag controls for unordered views.

Settings exports a versioned JSON backup with all private data. Import validates
the complete file, previews counts and requires explicit replacement approval;
invalid files never partially modify the database. Imports are limited to
20 MB, libraries to 10,000 records and notes to 2,000 characters. Browser
eviction protection can be requested, but clearing site data can still erase
everything. A downloaded backup is the portable recovery path.

Reordering is available on the full play queue and full personal ranking.
Search, the played-only filter or selection mode intentionally disables dragging
where hidden items would make order ambiguous. Clear those filters to reorder.
Mouse, touch, keyboard and explicit move-up/down controls are supported.
Bulk selection affects the current view and clears when its filters/page change.

## Public catalog integration

The main collection search immediately searches the original 100 plus saved
additions. With **Search public catalogs** enabled, a 2-80-character query also
searches Wikidata and FreeToGame after a 750ms pause. Empty or one-character
queries do not fetch catalogs. Core/Essential and Play later/Completed scopes
pause online lookup; locally saved additions still follow applicable filters.
The explicit `catalogs=off` URL choice survives reload, Back/Forward and in-app
navigation, and is preserved by Reset filters.

External results appear in a separate **Unranked** section, never with an
invented author rank, rating or critic score. Source IDs remain the identity;
editions and source duplicates are not guessed into one game. Source-search
aliases can match even when absent from the imported English title. Year/genre
and device-state filters still apply. Title/year sorts apply within this section;
author/critic sorts cannot compare missing public scores and use title order
there instead. Result counts describe currently loaded matches, not every game
on the internet.

Saving, marking played/completed, or rating a result imports its metadata and
requested private state in one IndexedDB transaction. A rating adds it to
**My rankings** without marking it played, replacing existing notes, or releasing
manual positions. Saved additions stay in the collection and search after a
reload or browser restart, including when a catalog request fails. The Excel
downloads always remain the author's unchanged 100-game collection, not a
visitor's additions or progress.

`GET /api/catalog?source=wikidata&q=Hades&offset=0` and
`GET /api/catalog?source=freetogame&q=Palia&offset=0` return normalized facts.
An empty query is an explicit paginated browse operation, not a background crawl.
The Vite dev/preview middleware uses the same handler as the Vercel function.

- **Wikidata:** CC0 structured data. Search requires direct `P31 = Q7889`;
  matching entities are independently type-checked and fetched in batches of
  five. English/multilingual labels are supported. Preferred date claims take
  precedence, but the year remains null if selected source dates disagree.
  Developer/genre entity IDs are resolved to labels. API limits and this
  conservative classification can omit games; counts are indexed source
  matches, not a census of all unique products.
- **FreeToGame:** its documented API expressly allows personal/commercial use
  with an active attribution link. The general website terms still apply and
  are not a blanket license to reproduce its site. The app is an attributed
  metadata integration: no artwork, descriptions, prices or review scores are
  copied. Its roughly 400-item free-to-play dataset is fetched as a bounded
  snapshot, filtered locally in the proxy and displayed in pages of 20.
- **Steam:** not enabled. Working keyless Store endpoints are not equivalent to
  a demonstrated permission to scrape or redistribute them.

Only source/query/offset are accepted. Upstream hosts are fixed, redirects
rejected, responses bounded to 4 MiB and requests timed out after nine seconds.
HTTP/JSON source errors and rate limits are surfaced. Discover searches are
explicitly submitted and client-throttled; main searches use the debounce above,
not a request on every keystroke. Stale searches are cancelled, and each source
has an independent retry and user-requested pagination. A failed next page
retains existing results and retries that page, not the first page. Anonymous
Wikidata requests ask for public 300-second caching; normalized responses use
short CDN caching. The FreeToGame snapshot also has a bounded per-instance
cache; this is not a durable database or a globally enforced rate limiter.

Catalog search necessarily sends the typed query to the selected providers.
Private library state, opinions and backups are never sent to the proxy.
Imported records retain source IDs/links; title similarity never silently
merges editions. Manual entry covers missing titles without inventing metadata.

References: [Wikidata access](https://www.wikidata.org/wiki/Wikidata:Data_access),
[FreeToGame API](https://www.freetogame.com/api-doc),
[FreeToGame general terms](https://www.freetogame.com/terms-of-use).

## Adaptive graphics and accessibility

The complete collection is independent of the sculpture. The static original
SVG is visible before WebGL is loaded and remains the fallback. The Three.js
module is a separate chunk, loaded after visibility/idle checks. Auto considers
available device/connection hints; Full requests the enhancement; Lite removes
effects. The operating system's reduced-motion preference takes priority and
is observed while the page is open.
On touch/coarse-pointer devices, Auto keeps the original illustration until the
visitor presses Fan out; only then is the real WebGL module fetched. Full still
loads the scene automatically. This keeps optional shader/texture initialization
off the mobile startup path without removing the interaction.

Only one canvas is used. Pixel ratio and geometry are bounded, there is no
postprocessing, animation settles instead of looping indefinitely, offscreen
and hidden-tab work pauses, and measured frame pressure can lower quality.
All essential controls work without dragging, fine pointers or WebGL.

Native dialogs trap focus, close with Escape, restore the initiating focus and
support deep-linked entry. Buttons/touch controls are at least 44px. The UI keeps
normal page scrolling, visible focus and mobile safe areas. Asset dimensions are
reserved; covers load lazily and results are paginated in groups of 24.

## Deploy to Vercel

This is a standalone project. Do not link it to an unrelated existing Vercel
project. The authorized environment used for publication is Ubuntu-24.04 WSL,
fish and the existing Vercel CLI login via `npx`.

Use a clean, isolated staging copy of committed source with Linux-installed
dependencies, not the Windows checkout's `node_modules`. Copy only the existing
ignored `.vercel\project.json` link metadata to target this same project; do not
copy authentication files. From that staging directory in WSL fish:

```fish
npm ci --no-fund --no-audit
npx --yes vercel@latest pull --yes --environment=production --scope leulman2-gmailcoms-projects
set -lx VITE_SITE_URL https://play-100-collection.vercel.app
npx --yes vercel@latest build --prod --standalone
npx --yes vercel@latest deploy --prebuilt --prod --yes --scope leulman2-gmailcoms-projects
```

Keep `.vercel` and all environment files ignored. Never copy a token into the
project. `vercel.json` sets Vite output, conservative security headers, and the
correct XLSX MIME type/download disposition. `.vercelignore` excludes original
data/reproduction material from the upload; deployable copies live in `public`.
All font assets are emitted as same-origin files, including small language
subsets, so `font-src 'self'` stays strict without blocked data-URI fonts.
Check the production alias without an authenticated Vercel browser and run the
production browser suite before treating a deployment as delivered.

Hosted build environments provide `VERCEL_PROJECT_PRODUCTION_URL` for absolute
Open Graph image/URL and canonical metadata. `VITE_SITE_URL` is an optional
explicit HTTPS origin override; set it as above for the local prebuilt release,
where Vercel system variables may be unavailable. Local preview does not guess a public origin.
The shared social card describes the collection, not private visitor progress.

This local/prebuilt path avoids hosted application builds and CI usage. Keep
pulled environment files private and out of source archives, and remove only
the staging copy's `.vercel\.env.production.local` after publication.
The source is now published on the public `LeulTew/play-100` repository. Its
initial `main` publication is not a PR merge. No hosted CI workflows or automatic
Vercel Git-build integration are installed; use the local/prebuilt path.

## Credits and design

`PRODUCT.md` records product truth; `DESIGN.md` records the implemented visual
system. Original numbered jacket drawings, icons, social card and folding
collection sculpture belong to this implementation. Supplied game artwork
remains with its rights holders.

React Bits sources are pinned to
`3a1c7f2f9f94ed833934ab5c2635760b9e644583` and retained in
`third-party\react-bits`, including the complete MIT + Commons Clause license.
CountUp, Magnet and AnimatedContent are actual customized derivatives.
The application does not sell or redistribute a component library.
`public\credits.txt` and `public\licenses` provide public notices, including
React, Three.js, Motion and the SIL-licensed Barlow Condensed / Hanken Grotesk
fonts, which are self-hosted.
