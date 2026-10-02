# Product behavior

Account sync, public sharing, scopes, rules, cleanup and local emulator setup
are documented in [Online saving](online-saving.md). The
[approved implementation contract](online-community-plan.md) records the
privacy and release gates.

[Friendships](friendships-plan.md) and the
[datastore contract](friendships-data-contract.md) cover requests, single-use
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

Library paging waits for pending edits before changing rows. With nothing
pending, the rows change within the same tap, without first disabling the
workspace controls. Invalid or failed edits keep the current page and draft;
stale navigation/account transitions cannot finish an old page request. A
successful page change focuses **Your library results** once the new rows have
rendered. Page/query/form state survives an in-place game detail and
Library/Ranking tab switches. On My games routes, the numeric Library page is
stored in `?page=` (omitted for page 1). Page changes create history entries;
Back, Forward and reload restore the bounded 25-game page. Entering Queue or
changing the effective Library filter resets it; removals clamp it with replace.
Private Library search text and saved opinions stay out of the URL. When embedded
outside a My games route, the Library pager uses local state without rewriting
the host URL. Paging never writes or caps stored games, progress, notes or fixed
positions.

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
reload. See [source, license and collection evidence](discovery-sources.md);
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
recovery](pwa.md).

The **Compare tray** holds up to six game references, separately per guest or
account scope. Click Pin, drag that same button with a mouse, or use a supported
card-artwork/title drag. Broad-surface touch dragging uses a deliberate hold followed by movement; ordinary
scrolling, text selection and nested controls keep their own behavior. Keyboard
and screen-reader users use the same Pin toggle, including in Lite or reduced
motion. It stays focused and in the tab order after pinning; **Pinned** and
`aria-pressed` indicate that another activation will remove the pin.
Pins do not change private library state or permissions.
The visible action says **Compare rankings with friends**. Its signed-out
destination explains that purpose before provider choices, names how many games
the tray holds, and retains the device-only exit; ordinary Account sign-in is
unchanged. The sheet opens over the current page, whose URL and title stay as
they are, so declining it returns to the same action.
Declining a Compare-invoked sign-in restores the remounted Compare action when
the view, navigation and scope are still current. Cold loading does not consume
that origin; cancellation or an invalidated origin uses a current safe target.
Signing in from that sheet, by email or through Google's redirect and return,
continues the comparison once the account has opened: the tray's own checks then
open Compare with the device's pins as its game filter, or Account when the
account cannot compare yet. It continues only if nothing has changed while the
account opened: a navigation (including Back), a changed view, an open panel or
another sign-in session drops it. A cancelled Google return reopens the sheet
with its purpose once; a sign-in from it uses it up.
Failed pending edits retain their exact usable field and do not open sign-in.
Notifications have independent measured clearance above the active tray,
including storage/error messages, without waiting for the toast to expire.
The tray feeds a private game filter into the existing comparison of two to six
people. It never supplies invented friend entries, scores or ranking positions.
Guest pins are not automatically adopted by an account: a continued comparison
uses them as its filter, and they stay in the device's tray. Starting another tray
comparison while Compare is already open resets its game mode/search/page as
one explicit transition while retaining the chosen people.

New public and selected-ranking publications reject source links longer than
2048 characters before writing, with an actionable error that leaves the
private library intact. The rules apply the same limit to new FreeToGame rows.
Previously stored oversized public/selected-ranking rows remain readable;
private-library and backup formats are unchanged. No truncation, backfill or
data migration is required. The rules half of this limit is already in the live
270f rules, so it needs no separate rules release; the candidate follows the one
[promotion order](security-release-runbook.md#promotion-order).

**All sharing** follows the complete account library, including future additions,
up to its 10,000-game limit. Metadata and ranking scores use separate bounded
paths; notes, email, queue and play history stay private. Friends load 25 rows at
a time; the six-game tray uses exact lookups. Unfetched rows never become fake
missing scores, and incomplete whole-list statistics stay unknown.

The first 10,000 games plus 10,000 rankings require at least 30,000 document writes,
above Spark's 20,000-write daily free quota. Progress and quota cooldown survive
reload; one completed path cannot make the whole operation say up to date.
An unchanged cold reload reads heads/controls rather than 20,000 game rows.
See the [versioned transport and acceptance evidence](friendships-data-contract.md).

Stopping All or private saving revokes All views; resuming requires an explicit
action. Older clients must refresh before changing a ready All source, or use
their existing sharing Stop first. Current clients atomically invalidate both
views with private changes. Accounts without active All keep their previous
private-write behavior. Legacy selected shelves retain their 200-game limit,
separate review and removal protections in the [shelf contract](friend-shelf-contract.md).

### Optional films

**The 100** introduces the authored collection; **Discover & compare** shows the
broader browsing and shortlisting workflow. The compact Watch films row comes
after the collection and before the workbook. No MP4 is requested before Watch,
and native Play starts the audio. One player stays open at a time; switching,
closing or navigating unloads it. Downloads, text alternatives, audio captions
and full media/source credits are available in the player. Demo interfaces are
editorial illustrations, not recordings of real accounts. See the
[playback and publication contract](films.md).

## Private library durability

Database `play100-personal`, version 3, contains the `library` object store and
the original guest `state` record with application schema version 3. Account
keys coexist without renaming or overwriting it. A complete domain snapshot keeps
queue order, record metadata, independent played/completed/later flags, personal
rank order, optional 0-10 scores, notes and preferences in one atomic transaction.
Writes read the latest snapshot inside a read-write transaction and report
success only after commit. Concurrent tabs do not replace each other's unrelated
updates. Ordering commands use IDs against the latest order, not stale arrays.
The version-3 writer barrier prevents older clients from recreating removed
account data; blocked upgrades retain saved data and ask visitors to close other
tabs and retry. Rollbacks must retain this barrier: see the
[R22-or-later rollback floor](release-operations.md#r22-indexeddb-compatibility-and-rollback-floor)
and [mixed-version behavior](pwa.md#mixed-application-versions-and-private-libraries).

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

Settings exports a versioned, compact JSON backup with all private data. Import
validates the complete file, previews counts and requires explicit replacement
approval; invalid files never partially modify the database. One 20 MB (20 MiB)
byte budget covers the whole library: it is the exact UTF-8 size of that compact
backup. Changes that would grow a library past it are refused with nothing
saved, while removals, dequeues and reorders always work. Export never produces a
larger file, and import rejects a larger library after parsing; files above
24 MB are refused before parsing, leaving room for pretty-printed older
backups. Libraries are also limited to 10,000 records and notes to 2,000
characters. Browser
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
**Ranking in My games** without marking it played, replacing existing notes, or releasing
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
- **Steam catalog search:** not enabled. Working keyless Store endpoints are not
  equivalent to a demonstrated permission to scrape or redistribute them.
  Eligible game-detail lookups may show separately labelled user-recommendation
  totals through an unambiguous public app identifier.

Only source/query/offset are accepted. Upstream hosts are fixed, redirects
rejected, responses bounded to 4 MiB and requests timed out after nine seconds.
HTTP/JSON source errors and rate limits are surfaced. Discover searches are
explicitly submitted and client-throttled; main searches use the debounce above,
not a request on every keystroke. Stale searches are cancelled, and each source
has an independent retry and user-requested pagination. A failed next page
retains existing results and retries that page, not the first page. Anonymous
Wikidata requests ask for public 300-second caching; normalized responses use
short CDN caching. The FreeToGame snapshot also has a bounded per-instance
cache, filled once for concurrent cold requests; this is not a durable database.
Search admission is per instance (6 active, 90 upstream searches per minute).
The Vercel WAF rule is the intended global rate limit, but it runs in Log mode,
which records matches and blocks nothing, until its scheduled switch to 429.
Search upstreams must return JSON.
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
