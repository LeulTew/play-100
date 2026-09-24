# Play 100

A public, responsive collection of 100 games with an authored order, a sortable
ratings table, private libraries and personal rankings. Built with React,
TypeScript, Vite, native IndexedDB, dnd kit and one lazy Three.js sculpture.
A stateless Vercel function looks up public catalogs. Guest data stays in
IndexedDB; optional verified Firebase accounts add consented cross-device
saving, automatic or legacy selected friends-only sharing, private comparison groups and
deliberately published public snapshots. No analytics or Supabase is used.

**Live:** https://play-100-collection.vercel.app  
**Curated by:** Leul Tewodros Agonafer  
**Public source:** https://github.com/LeulTew/play-100  
**LinkedIn:** https://www.linkedin.com/in/leul-t-agonafer-861bb3336/  
**Telegram:** https://t.me/fabbin (@fabbin)
**Workbook:** https://play-100-collection.vercel.app/downloads/Play-100-Collection.xlsx
**Original Excel:** https://play-100-collection.vercel.app/downloads/AAA_games_u_have_to_play_list_top_100.xlsx  
**My games:** https://play-100-collection.vercel.app/my-games <br />
**Personal rankings:** https://play-100-collection.vercel.app/my-games?tab=ranking <br />
**Discover:** https://play-100-collection.vercel.app/discover
**Account:** https://play-100-collection.vercel.app/account
**Friends:** https://play-100-collection.vercel.app/friends  
**Compare:** https://play-100-collection.vercel.app/compare  
**Data use:** https://play-100-collection.vercel.app/data-use

**Films:** https://play-100-collection.vercel.app/#collection-films

**Community:** https://play-100-collection.vercel.app/community

**Creator desk:** https://play-100-collection.vercel.app/creator (authorized owner only)

Account sync, public sharing, scopes, rules, cleanup and local emulator setup
are documented in [Online saving](docs/online-saving.md). The
[approved implementation contract](docs/online-community-plan.md) records the
privacy and release gates.

[Friendships](docs/friendships-plan.md) and the
[datastore contract](docs/friendships-data-contract.md) cover requests, single-use
invitations, blocking, sharing and private groups. New eligible verified account
setups default to sharing saved game metadata and rankings with accepted friends.
Legacy off/custom choices stay unchanged until one inline **Share all with friends**
action in Friends, My games or Account. Public snapshots and directory listing
remain separate choices.
The existing local creature picker is available through **Change icon**.
Normal session restoration preserves account and guest separation. Storage
restrictions, revocation and intentional stops remain explicit conditions.

The Friends manager separates Incoming/Sent, filters and sorts loaded names, and
keeps later pages intact when live relationships change. Counts say when more
entries remain; **Refresh loaded** updates the requested page window. Select up
to five friends to compare with yourself, or use a person's Compare shortcut.
Cohorts and comparison controls stay in validated account-bound tab/history
state, never public participant URLs. Remove/Block and invite revocation require
confirmation; expired/used/revoked links have no copy/share action.

### My games, discovery and selected sharing

**My games** combines Library, Queue and Ranking navigation, not their data.
Saving a game does not rank, play or share it. Scores, private notes, manual
positions and queue replay remain independent. Existing `/my-library`,
`/my-library?list=later` and `/my-rankings` links still work. Workspace tabs keep
manual drafts and flush valid pending edits before switching.

The unordered **Library** renders 25 matching games per page, including when its
pane is hidden behind Ranking. Filtering searches the entire saved library;
Queue and Ranking keep their existing full-list order and editors. Selection
persists across Library pages: **Select all matching games** explicitly includes
every matching page. Filters and tabs clear it.
Zero- and one-page local result sets omit inactive paging controls while keeping
their result count. A genuinely empty, unfiltered Library leads with add/browse
choices rather than unavailable search or selection; filtered-empty recovery
and mounted manual-entry drafts remain available.

Library paging waits for pending edits before changing rows. Invalid or failed
edits keep the current page and draft; stale navigation/account transitions
cannot finish an old page request. A successful page change focuses **Your
library results**. Page/query/form state survives an in-place game detail and
Library/Ranking tab switches. The page is transient React state, not a private
URL or saved preference: Back keeps its route/tab/dialog meaning, while leaving
and remounting the workspace or reloading starts page 1. Entering Queue or changing
the effective Library filter resets the Library page. Paging never writes or
caps stored games, progress, notes or fixed positions.

**Played and Completed are different.** Played records that you tried a game;
Completed records finishing it and also implies Played. Unmarking Completed
keeps Played. Marking a completed game not played shows a visible confirmation
before clearing both flags; queue/replay membership, scores, notes and manual
positions stay unchanged. Cards, tables, details and My games expose separate
controls, and bulk Mark played never queues or completes a game.

The shared Progress filter offers Not played, Played (not completed), Completed
and an explicitly inclusive played view. It is independent of Queue. New links
use `progress=`; old `list=unplayed` links still mean Not completed. Public share
links omit these private view filters, and progress-filtered catalog views do
not send play history to providers. No stored-progress migration is needed.

**Discover** starts with a public, locally served snapshot of **810** provider
records. **220** records have licensed imagery from **215** local raster files;
the rest use an honest missing-art fallback. Most licensed images are logos,
not box covers. Compact title/alias search, including `Kingdomcome`, works
without sign-in, browser storage or a successful upstream request. Bounded
online fallback remains available with source-specific retry and explicit
opt-out. Search/filter/view URLs and game previews round-trip through Back and
reload. See [source, license and collection evidence](docs/discovery-sources.md);
every displayed asset's credit/license remains accessible.
Discover now defaults to games outside The 100. Exact known matches offer links
to their original entry rather than duplicate cards or enrichment; **Include
The 100** preserves explicit full-catalog browsing. Unknown editions and saved
private copies are not title-merged or migrated.
The primary native genre chooser offers 14 browsing families, based only on
explicit source terms. Original genres remain unchanged in metadata and in the
exact-source disclosure. `genreFamily=` is separate from legacy, case-sensitive
`genre=`; both filters intersect when present. Family changes clear the exact
genre and reset paging, while view, lookup opt-out and unrelated URL fields stay
intact. Providers still receive only the existing query/source/offset fields.
An exact-ID artwork-presence hint is generated from that same validated seed.
It carries no metadata, image paths or credits: already-known no-art Library
previews and pins can stay local, while licensed artwork, unresolved public
deep links and artwork-dependent friend/Compare surfaces retain the full
catalogue and provenance path. `npm run validate:discovery` rejects a stale
hint; regenerate it with
`npx --no-install tsx scripts\generate-discovery-artwork-presence.ts` when the
checked-in seed changes. This does not change provider collection or saved IDs.
Opening an eligible Discover detail can fetch separate public source scores
and licensed artwork by exact ID. Wikidata claims retain issuer, scale,
platform/method and supplied dates; Steam recommendations are labelled as user
feedback, not critic scores. Existing local artwork is reused first. New
Commons images need approved per-file rights and attribution, bounded raster
validation and patched server-only Sharp. Missing data stays unavailable;
external facts never overwrite your rating. Online opt-out and cached/offline
states remain explicit. See the source document for terms and current limits.

### Install and offline access

Menu → **Install & offline access** opens the existing Settings surface.
Installation uses a real browser prompt when offered, or truthful platform
instructions; it is not a native wrapper or push subscription. Explicit offline
preparation stores a hash-verified, bounded public core and recently viewed
bundled artwork. It does not automatically download films/workbooks or cache
private, authentication, Firebase or provider API responses.

After the first preparation, finish your edits and reopen the page/app to use
the worker offline. Library, Queue and Ranking retain their existing local
storage. Account/cloud operations still require a connection. Updates require
an explicit guarded choice, successful pending saves and no unsubmitted form,
new edit, changed scope or competing app window. See [PWA boundaries and
recovery](docs/pwa.md).

The **Compare tray** holds up to six game references, separately per guest or
account scope. Use native Pin, the fine-mouse handle, or a supported
card-artwork/title drag. Broad-surface touch dragging uses a deliberate hold followed by movement; ordinary
scrolling, text selection and nested controls keep their own behavior. Keyboard
and screen-reader users use the adjacent Pin control, not the pointer-only compact
grip, including in Lite or reduced motion. Add-only card Pins stay focused and
in the tab order after pinning; repeat activation does not add another item.
Pins do not change private library state or permissions.
The visible action says **Compare rankings with friends**. Its signed-out
destination explains that purpose before provider choices and retains the
device-only exit; ordinary Account sign-in is unchanged.
Declining a Compare-invoked sign-in restores the remounted Compare action when
the view, navigation and scope are still current. Cold loading does not consume
that origin; cancellation or an invalidated origin uses a current safe target.
Failed pending edits retain their exact usable field and do not open sign-in.
Notifications have independent measured clearance above the active tray,
including storage/error messages, without waiting for the toast to expire.
The tray feeds a private game filter into the existing comparison of two to six
people. It never supplies invented friend entries, scores or ranking positions.
Guest pins are not automatically adopted by an account. Starting another tray
comparison while Compare is already open resets its game mode/search/page as
one explicit transition while retaining the chosen people.

New public and selected-ranking publications reject source links longer than
2048 characters before writing, with an actionable error that leaves the
private library intact. The rules apply the same limit to new FreeToGame rows.
Previously stored oversized public/selected-ranking rows remain readable;
private-library and backup formats are unchanged. No truncation, backfill or
data migration is required. This write-policy change requires a separately
reviewed rules deployment before releasing the corresponding client.

**All sharing** follows the complete account library, including future additions,
up to its 10,000-game limit. Metadata and ranking scores use separate bounded
paths; notes, email, queue and play history stay private. Friends load25 rows at
a time; the six-game tray uses exact lookups. Unfetched rows never become fake
missing scores, and incomplete whole-list statistics stay unknown.

The first10,000 games plus10,000 rankings require at least30,000 document writes,
above Spark's20,000-write daily free quota. Progress and quota cooldown survive
reload; one completed path cannot make the whole operation say up to date.
An unchanged cold reload reads heads/controls rather than20,000 game rows.
See the [versioned transport and acceptance evidence](docs/friendships-data-contract.md).

Stopping All or private saving revokes All views; resuming requires an explicit
action. Older clients must refresh before changing a ready All source, or use
their existing sharing Stop first. Current clients atomically invalidate both
views with private changes. Accounts without active All keep their previous
private-write behavior. Legacy selected shelves retain their200-game limit,
separate review and removal protections in the [shelf contract](docs/friend-shelf-contract.md).

### Optional films

**The 100** introduces the authored collection; **Discover & compare** shows the
broader browsing and shortlisting workflow. The compact Watch films row comes
after the collection and before the workbook. No MP4 is requested before Watch,
and native Play starts the audio. One player stays open at a time; switching,
closing or navigating unloads it. Downloads, text alternatives, audio captions
and full media/source credits are available in the player. Demo interfaces are
editorial illustrations, not recordings of real accounts. See the
[playback and publication contract](docs/films.md).

## Run locally

Use Node.js 24 LTS, the major pinned in `package.json` `engines` and used by Vercel.

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

## Quality checks

The GitHub workflows (CI, CodeQL, Dependency review, Secret scan) remain in
`.github/workflows` but are **disabled by the owner**; nothing runs on pull
requests or pushes. Release gating is the local suites below plus review:

- unit/browser gate (`npm test`), the cloud emulator suite (`npm run test:cloud`),
  e2e production and development (`npm run test:e2e`) and the cloud-UI suite
  (`tests-cloud-ui`, `playwright.cloud.config.ts`);
- `tsc -b`, `npm run lint`, `npm run build`, `npm run check:csp` and
  `npm run check:budgets`;
- `npm audit` and `npm audit signatures`, run locally after each install.

A full-history Gitleaks scan by the maintainer remains a pre-merge step.
Dependabot's version-update configuration (`.github/dependabot.yml`) is unchanged.

The disabled jobs, for reference if they are re-enabled: SHA-pinned GitHub
Actions with read-only repository access and no deployment credentials.

| Disabled CI job | Checks |
| --- | --- |
| Quality | ESLint, project and Functions types, unit/mounted tests, production build, `check:budgets`, offline data validators |
| Browser (production) | Built preview on port 4187, desktop and mobile, including the real-worker `pwa-offline.spec.ts` |
| Browser (development) | Source-module fixtures on a Vite server at port 4187, desktop and mobile |
| Auth and Firestore | Java 21, the lockfile-pinned Firebase CLI, and credential-free `demo-play100` emulator tests |
| CodeQL | JavaScript/TypeScript analysis without running an application build |
| Dependency review (pull requests) | Moderate-or-higher advisories in runtime, development and unknown dependency scopes; no PR comments |
| Secret scan | Full checked-out Git history with redacted Gitleaks 8.30.1 findings; the pinned release checksum file and archive are SHA-256 verified before the binary is extracted |

`budget-report.json` has a deterministic schema: `sourceCommit` (from
`GITHUB_SHA`, so `null` in local runs), each enforced measurement/cap/headroom
and pass result, reported-only totals and the eager file list. Failures before
measurements complete may leave no report, which is not a budget pass.

Any Gitleaks history finding must be reviewed before landing; confirmed false
positives use narrowly scoped fingerprints, not disabled detection rules. For
private vulnerability reports and advisory triage, see [SECURITY.md](SECURITY.md).

Local gate commands (choose the relevant checks for a change):

```powershell
npm ci
npm audit
npm audit signatures
npx playwright install --with-deps chromium
npm run lint
npx --no-install tsc -b
npm run typecheck:functions
npm test -- --maxWorkers=1
npm run build
npm run check:budgets -- --json budget-report.json
npm run check:csp
npm run validate:data
npm run validate:discovery
npm run test:e2e
$env:PLAY100_TEST_BUILD = 'development'
npm run test:e2e
Remove-Item Env:PLAY100_TEST_BUILD
npm run test:cloud
```

The explicitly Chrome-based mounted, native-zoom and H.264 film tests need an
existing Chrome installation or
`npx playwright install chrome` (which installs at the platform's default location).
`test:cloud` needs Java 21 and uses the existing `firebase-tools` lockfile pin
(currently 15.30.1), not a global CLI or production project. Both data validators
read checked-in files only; no gate runs the online catalog collector.

The two browser partitions are disjoint; fixtures importing live `/src` modules
run in development rather than being skipped or changing their assertions.
Existing actor-gated Menu/account and sign-in-sheet UI cases still need dedicated
local emulator setup; the suites do not create those actors or enable production
accounts. The headed native-hidden-window case remains opt-in and is not a
headless proof. Profile-specific desktop/mobile skips retain their intent.
`check:budgets` reads the existing `dist` without rebuilding or network access;
`budgets.json` records the enforced eager JS+CSS/PWA caps and provisional
270f app-CSS/lazy limits. App CSS is the Vite output under `assets`; standalone
`pwa` stylesheets have a separate measured cap and must be in the PWA core.
They may be linked only by the offline document or the app's `noscript` fallback,
not active app documents, chunk dependencies or CSS imports. Combined CSS
totals remain visible. HTML bytes, including active inline critical CSS, are
reported separately rather than changing the emitted-CSS baseline series.
`check:csp` also reads the existing `dist`: every built document must work under
the `vercel.json` main-document policy, including the
[first-paint shell](docs/first-paint-shell.md) boot script by its exact hash, and
`pwa-assets.json` must embed that same policy. It prints each inline block's hash.
The PWA browser spec checks explicit preparation and
offline local routes in isolated contexts, not OS installation or update races.
See [the remaining manual PWA release checks](docs/pwa.md#manual-release-checks).

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
Test definitions are not evidence that a particular release ran them. Release
receipts distinguish executed focused cases, emulator journeys and omissions.
The reported other-PC search issue was not directly reproduced on that physical
device. Controlled fresh/returning/restricted-storage and provider-failure
journeys verify these specific fixes; no blanket device-compatibility claim is
made.

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
| `src\cloud` | Lazy managed identity, scoped sync, account/public/community/creator surfaces |
| `src\lib\scoped-library.ts` | Account keys, atomic pending metadata and local recovery in the existing DB |
| `src\lib\snapshot-transport.ts` | Deterministic bounded chunk transport and integrity checks |
| `firestore.rules`, `tests-cloud` | Server-enforced data boundaries and actual emulator regression gates |
| `src\components\avatar` | Locally generated, version-pinned Critters and controlled avatar picker |
| `api\catalog.ts` | Fixed-host, bounded, read-only catalog adapters |
| `src\components\scene` | Authored Three.js folios, static SVG, lifecycle and frame budget |
| `src\components\bits` | Customized, attributed React Bits components |
| `src\generated\cover-metadata.json` | Actual native artwork dimensions |
| `data` | Canonical source, workbook, originals, provenance and reproduction code |
| `public` | Deployable data, optimized covers, download, social card and notices |
| `tests` | Real-browser interaction and accessibility coverage |

Runtime composition, sources of truth and cross-boundary invariants are described in [Architecture](docs/architecture.md).

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

## Private library durability

Database `play100-personal`, version 2, contains the `library` object store and
the original guest `state` record with application schema version 3. Account
keys coexist without renaming or overwriting it. A complete domain snapshot keeps
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
The ranking page summarizes the current order; **How ranking order works**
opens the full instructions without hiding fixed-position recovery controls.

Removing a ranking requires a named confirmation: its rating, private note and
ranking position are deleted, but Library membership, Played, Completed and Queue
stay unchanged. **Keep ranking** receives initial focus; cancel or Escape keeps
the opinion and returns focus to its removal control before removal starts.
The pending-edit check remains cancellable; an already-submitted write waits
for its result. Confirmation flushes
pending editors, including retained hidden tabs, before removing that exact saved
ID once. Invalid or failed drafts block removal without discarding their input;
failed storage writes leave the confirmation open for retry. Navigation,
account/view changes and a removed target invalidate the pending confirmation.
Canonical games and saved provider copies retain independent opinions. Re-adding
an explicitly removed ranking starts with no score, note or fixed position;
there is no hidden archive, undo journal or schema change. Ranking has no bulk
removal control; selected private-library deletion remains a separate action.

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
For a connected account, the separate sync adapter uploads immutable bounded
chunks and publishes a revision/consent-epoch-checked head. A conflict never
silently chooses a winner. See the detailed online-saving guide for account
isolation, recovery, free quotas and deletion markers.
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
Owned HTTP error bodies are cancelled rather than read without a size bound.
If cancellation fails, bounded logging records only a fixed message and status;
the original HTTP/rate-limit error and no-store policy still reach the caller.

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

Eligible collection and Discover previews connect the existing public artwork
to the native detail using one temporary numbered sleeve or licensed catalog
image. The real fields stay in place and are usable immediately. A same-view
close may return that public visual to its still-visible source; deep links,
removed sources and interrupted navigation use the immediate fallback. No
interactive editor, private note, manual title or password is cloned or retained.
Canonical details present the complete workbook rationale and source note
before saved copies, progress controls and personal rating fields.
Public-artwork enter/return timing is 240/160ms for fine pointers and 220/160ms
for coarse pointers. Only coarse artwork travel was softened after a focused
perceptual assessment; easing, utility transitions, hero motion, the 300ms
rejection cap and gesture thresholds are unchanged. This is not a latency or
frame-rate improvement claim.

Menu, ready utility dialogs and committed route/tab/page changes have short,
targeted cues rather than page-wide reveals. The existing Auto/Full/Lite policy
also governs these effects. Reduced motion, hidden documents, unsafe account
readiness and changed permissions cancel optional work without replaying it
when the condition clears. Native opening, closing, focus and saves never wait
for an animation. Drag-to-Compare remains separate from private Queue/Ranking
reordering, and an empty drop target does not reflow the collection controls.

The 44px **Pin** control supports native touch, pen and keyboard activation; it
does not start a held drag or explicit pointer capture. The adjacent compact
grip is pointer-only, titled **Drag to tray**, and hidden on coarse pointers.
Fine-mouse grip dragging and ordinary clicks remain available without adding
a duplicate keyboard or screen-reader control. Coarse layouts show the Pin
control and allow native panning from the button.
Card/title touch-hold dragging is a separate interaction, not enabled by the
handle. This is an intentional capability fallback after a retained
post-touch-grip click failure, not a claim to have diagnosed or fixed its
underlying browser cause. It does not relax the performance qualification below.

These are bounded behavior and cleanup contracts, not a promise of zero cost,
physical-device certification or universal frame-rate improvement. Development
StrictMode rehearsals, production payload checks and paired performance evidence
must be reported separately.

The React Bits-derived queue badge uses a bounded native numeric spring rather
than loading the Motion scheduler for one number. Its accessible count is exact
immediately; initial, disabled and scope-reset values do not count up from zero.
Visible updates can retarget, while cancellation and unmount leave no idle frame
loop. Only the badge is scope-keyed, not the page or its editors.
The counter's native-visibility fixture is explicitly opt-in through
`PLAY100_COUNTER_HEADED=true`; a browser that remains visibly reported after
minimization does not establish hidden-window behavior.

### Qualified motion release: performance limitation

The user approved publication **after final release checks, with the performance
limitation documented**. Scoped motion functional/production checks and static
and observed-cold code-size budgets passed, but the paired interaction comparison
stopped early on a late detail-open observation. Numerical interaction
performance remains **inconclusive**; this is not a zero-added-lag, FPS,
physical-device, Safari or native-hidden-window certification.

<details>
<summary>Measured scope and retained limitation</summary>

- On the retained `94c6fe9` measurement build, complete eager JavaScript plus CSS
  grew from 163,283 to 165,322 gzip bytes:
  +2,039 bytes (+1.25%), within the unchanged 8,164.15-byte limit. All four
  declared observed-cold route/profile cells met their own limits, with three
  consistent request sets per build/cell. The only observed non-code raw-byte
  difference was four favicon line-ending bytes; no new resource path was added.
- The paired interaction run stopped after 90 of 720 planned observations.
  In pair `p044`, the candidate's 500-game Library at coarse 393px with configured
  4x CPU throttling opened the correct native detail, but sampled readiness
  arrived at 1,253.9 ms, beyond the fixed 1,200 ms window. The single paired
  baseline observation was 171.1 ms; this is not a regression confidence interval.
- One separately instrumented diagnostic did not reproduce that delay
  (approximately 202.3 ms candidate / 186.9 ms baseline). Its tracing overhead
  and invalid native CPU timing deltas prevent a stronger conclusion; it neither
  erases the original finding nor establishes a cause.
- The retained-prefix analysis applied no numerical gates or confidence
  intervals: at most one of eight required pairs was available per cell.
  All 648 metric/action records and all five overall profiles remain
  inconclusive. No failure was discarded as environmental noise, and no
  threshold was relaxed to support publication.

</details>

### Added functional-feature code allowance

The later PWA and on-demand enrichment request has a separate **10,240-byte
gzip-9 eager JavaScript/CSS increment allowance** above the current `cc2d82f`
local baseline of 165,302 bytes (limit 175,542). This was an explicit
scope-change acceptance **after** observing the new feature sizes, not the
original preregistered motion gate. The 173,978-byte intermediate feature build
still failed that older 8,192-byte gate by 484 bytes; that result is retained.
The selected simpler Settings variant measured 174,453 locally. Any deployed
build is measured separately. Moving optional update execution/detail parsing
out of the eager graph is not a claim that total code or first-use downloads
became smaller.

The offline core remains limited to 2 MiB/48 files, with an independent
4 MiB/48-entry runtime artwork cache. Historical cold, timing, noise-envelope
and incomplete paired results remain unchanged; no new FPS or zero-lag
certification follows from the feature allowance.

## Deploy to Vercel

`npm run build` checks both the browser app and the API dependency graph.
The root TypeScript options explicitly use strict NodeNext/ES2022 for Vercel
Functions; `tsconfig.functions.json` also checks that graph locally. Vercel's
function compiler does not follow TypeScript project references, so a passing
Vite build or a deployment marked Ready is not sufficient: review client and
function compilation before promotion.

This is a standalone project. Do not link it to an unrelated existing Vercel
project. The authorized environment used for publication is Ubuntu-24.04 WSL,
fish and the existing Vercel CLI login via `npx`. Pin the CLI to
`vercel@59.16.0`; never use `@latest` for a release.

Deploy only a reviewed commit already on `origin/main`, from an isolated stage
of exactly that committed tree. The source stage must contain no untracked
files, `node_modules`, environment files or authentication files. Add only the
existing ignored `.vercel/project.json` link metadata to target this same
project. Vercel installs dependencies and builds remotely on Linux using the
Node major pinned in `package.json` `engines`; do not build local prebuilt
artifacts for this release path.

Build-time configuration comes only from this project's Production environment
variables in Vercel: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, and
`VITE_FIREBASE_REQUIRED=true`. Missing required configuration fails the build;
see [online saving](docs/online-saving.md). Nothing is pulled into the stage.

From that staging directory in WSL fish, replace the placeholder with the full
reviewed commit SHA:

```fish
set -l source_commit REVIEWED_COMMIT_SHA
npx --yes vercel@59.16.0 deploy --prod --skip-domain --archive=tgz --yes --meta sourceCommit=$source_commit --scope leulman2-gmailcoms-projects
```

`--skip-domain` leaves the production alias on the current release. Verify the
exact new deployment before promotion while Deployment Protection stays on;
automated checks use the project's existing automation bypass. Never disable
protection or rotate or print its secret. Check response headers and CSP,
served entry/worker/manifest sizes against the budgets, and the key journeys.

Retain these additional release receipts:

- [ ] The local gate (see Quality checks) passed and was reviewed for the exact
  `sourceCommit` being promoted, and the Gitleaks full-history scan is clean.
- [ ] Record the local `budget-report.json` from that commit's build.
- [ ] Record the new deployment ID/URL together with its verified `sourceCommit`
  metadata.

Before promotion, record the deployment the production alias currently points
to as the rollback target. Replace both placeholders below with the verified
deployment URL and that recorded previous deployment URL, respectively:

```fish
set -l verified_deployment VERIFIED_DEPLOYMENT_URL
set -l previous_deployment RECORDED_PREVIOUS_DEPLOYMENT_URL
npx --yes vercel@59.16.0 promote $verified_deployment --scope leulman2-gmailcoms-projects --yes --timeout 3m
```

Confirm the production alias serves the same asset hashes as the verified
deployment, then run the production sign-in smoke. If rollback is needed,
promote the recorded previous deployment using the same path:

```fish
npx --yes vercel@59.16.0 promote $previous_deployment --scope leulman2-gmailcoms-projects --yes --timeout 3m
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
explicit HTTPS origin override. Local preview does not guess a public origin.
The shared social card describes the collection, not private visitor progress.

This remote-build, verify and promote path is separate from the quality checks above.
The source is now published on the public `LeulTew/play-100` repository. Its
initial `main` publication is not a PR merge. No workflow deploys, and no automatic
Vercel Git-build integration is installed; use the explicit remote-build path.

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
