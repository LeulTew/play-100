# Play 100

<!-- impeccable:product-schema 1 -->

## Platform

web

## Spec-driven development

Every expansion starts with a concrete implementation specification, including
UI/UX, before code. Keep it in the relevant existing product/feature document;
the operational interface remains concise.

The specification states the user's problem and job, scope and non-goals;
complete flows, navigation and loading/empty/error/offline/retry/revoked states;
data, API, permission and backwards-compatibility contracts; actual composition,
components, short copy, mobile/touch/keyboard behavior and reduced motion;
acceptance examples and measurable limits; and branch ownership/dependency
contracts when work runs in parallel.

Implement against that contract, then prove the new and preserved behavior with
focused functional/regression checks, real desktop/mobile interaction and visual
evidence, and one independent skeptical review of the integrated result. Fix
causal defects, record real limits, and publish only a verified candidate. Do not
substitute an expansive checklist, passing branch tests or repeated polish loops
for a working combined experience.

Preserve original feature semantics, private data, explicit sharing consent,
manual order, drafts and old links unless the user explicitly changes them.
Creativity belongs in coherent art, composition and useful interactions; actions
still need familiar labels, visible states and non-gesture alternatives. Treat
award-level quality as an ambition, never an award, perfect-score or zero-bug
claim.

## Users

Gamers choosing their next game, browsing a personal curated collection on mobile
or desktop, and sharing an interesting game or a filtered shortlist with friends.

## Product Purpose

Make a real 100-game spreadsheet useful as a readable, shareable website and an
improved downloadable workbook. The original main-sheet order is authoritative.

## Positioning

A finite, authored collection, not an algorithmic recommendation service or an
official best-games ranking. Every game retains its place, source rationale,
original genre and entered critic-score snapshot.

## Operating Context

Public and device-only by default, with no analytics or Supabase. A read-only,
stateless Vercel function looks up public catalog metadata. Optional Firebase
Google or verified email accounts enable explicitly consented cross-device
saving, while keeping the original guest library intact and separate.
IndexedDB remains the first durable write; account scopes add an atomic outbox,
versioned chunk snapshots, consent epochs and explicit conflict choices.
Export/import backups remain independent recovery tools. Motion preferences
stay per-device and are excluded from cloud transport.
Shareable collection URLs never contain private progress or opinions. A
separate, previewed publication creates a public profile/ranking snapshot.
Optional friendships add friends-only account projections and private comparison
groups. New eligible verified account setups default to sharing all saved game
metadata and rankings with accepted, nonblocked friends. Public publication and
directory listing remain separate choices. Legacy off/custom choices are retained
until one explicit, inline **Share all with friends** action.

## Capabilities and Constraints

- Exactly 100 canonical games: core ranks 1-50, essential ranks 51-100.
- Search, original-genre/year/tier filters, sortable native-scale ratings table,
  card/list views, selection mode and atomic bulk list/ranking actions.
- Discover's known local results use 24-item pages with direct page choice and
  truthful first/last ranges; the 845-result catalog has 36 pages and five games
  on its last page. Explicit page changes land on the results; typing and
  background loading do not move focus. Provider offsets and coverage remain
  separate. Pending ratings must save before replacing results, and failed or
  superseded page requests cannot discard their drafts.
- A separate private play queue with mouse/touch dragging, keyboard sorting and
  move buttons. Completed games may remain queued for replay.
- A separate personal-ranking page with optional scores and notes. Ranking a
  game does not imply playing or completing it; unplayed entries are allowed.
- My games brings Library, Queue and Ranking into one workspace while retaining
  independent data and the old deep links. Tabs preserve drafts and flush valid
  pending edits. A Compare tray holds at most six metadata-only game references;
  Pin, the visible grip and supported card/title dragging use the same scoped
  one-use drop contract. Touch uses deliberate hold-then-move, with normal
  scrolling, text selection and keyboard/tap alternatives preserved. Private
  Queue/Ranking reorder grips remain independent.
- Optional motion explains public card/detail continuity, native utility entry
  and accepted route/tab/page changes. It never delays input, native focus,
  closing or saving; clones no private or interactive content; and retains no
  closing form. Missing origins and unsafe scope/readiness use an immediate
  fallback. Existing Auto/Full/Lite and live reduced-motion/visibility rules
  remain the single policy, separate from essential drag input.
- A secondary Menu makes existing destinations findable without replacing the
  direct The 100, Discover, My games, Friends or Account/status entries. It uses
  the fifth mobile navigation slot, not a sixth item. Browse, My games, People
  & sharing, Account & tools, and Workbooks group ordinary links and actions.
  Library, Queue and Ranking use canonical `/my-games` links; legacy aliases
  remain valid but are not duplicate destinations. Person, profile and invite
  links still require their original context.
- Primary desktop and mobile destinations also use canonical anchors and
  `aria-current`, preserving modified clicks and the mobile The 100 scroll
  shortcut. In-tab primary navigation flushes pending edits before leaving and
  cancels an obsolete transition if the active scope or route changes.
- Menu links retain real hrefs and modified-click behavior. In-tab destination
  changes and Settings/About actions first flush pending editors; invalid or
  rejected writes keep the current page and draft, with a return-to-edit action.
  Return to edit focuses the exact visible failed editor after the dialog closes,
  including a rejected write without a validation marker. A hidden or unavailable
  target uses a visible page-heading fallback, never another game's input.
  Scope/navigation changes invalidate this focus request; ordinary Close/Escape
  still restores the Menu opener.
  Closing Menu cancels a pending navigation, not an already-started local save.
  Opening Menu itself requests no save, account bootstrap, publication or sharing.
  Data use keeps its separate-tab, no-private-bootstrap boundary; workbook
  downloads remain public files, not private backups.
- Online Menu destinations appear only in a configured build. Creator desk
  appears only when the already-loaded UI bridge confirms the current verified
  creator; Menu never performs a role read. Unknown roles use the existing
  Account destination. Settings & backups invokes the existing scoped dialog,
  retaining its confirmation, recovery and persistence behavior. Inline sharing
  audience, Stop and recovery controls remain in their existing pages.
- The comparison tray leads to friends' rankings, not an anonymous game-spec
  comparison. Its per-game Artwork credits disclosure retains the full original
  credit, license/source links, conversion notices and caveats.
  On mobile, an active dock compacts only collection-toolbar spacing so Explore
  keeps the first game identity clear of both the dock and navigation, without
  shrinking controls or artwork. An empty tray retains the ordinary spacing.
- Discover starts with 810 verified provider records and 220 illustrated
  records using licensed local images; unavailable art is labelled honestly.
  Seed browsing/search is public and independent of account/storage/provider
  readiness. Online lookup remains a bounded fallback, not an empty-page
  prerequisite. Exact source IDs, not similar titles, identify games.
- The 100 is authoritative when a Discover result has a reviewed matching
  provider identity. Discover defaults to games outside that authored list;
  matching searches offer canonical recovery links, and an explicit Include
  The 100 option retains full-collection browsing and legacy deep links.
  Matches reuse the original title/year/rank/author rating/cover, details and
  canonical action ID. Deduplicate before local pagination and remote append,
  retaining search aliases and explicit source provenance. Different games,
  remakes and unverified editions stay separate. The reviewed crosswalk lives
  outside the immutable collection/workbooks; it is not a fuzzy title merge.
  Existing saved provider copies, private scores, notes, order and progress
  remain intact and accessible, without migration or cloud/profile backfill.
  See `docs/discovery-sources.md` for the bounded implementation and evidence.
- An eligible noncanonical Discover detail may request public facts by exact
  source ID after opening. It never waits for enrichment to become usable and
  never sends private titles, opinions, progress or account identity. Source
  scores keep their original scale, platform, method and available dates;
  they are not averaged together or copied into a personal rating. Verified
  local art wins; new Commons rasters require complete reusable licensing and
  attribution, a patched bounded decoder and a separate untrusted-art type.
  Opt-out, offline, missing data and partial errors remain explicit.
- Browser installation and public offline preparation are explicit choices.
  The service worker caches only the generated public allowlist, not account,
  Firebase, authentication or API responses. Existing local databases/scopes
  remain separate. Updates require saved edits, a current invocation and one
  app window; no automatic reload may discard forms or switch account scope.
- Original and enhanced XLSX downloads, clearly distinguished from private data.
- Two optional collection films use first-party, content-hashed media after the
  collection, never an autoplaying landing-page takeover. MP4 requests begin only
  after Watch; native controls, text alternatives, captions and credits remain
  available. One player at a time; close/navigation unloads, hidden tabs pause.
- Broader, user-triggered catalog browsing/search/import from Wikidata and the
  documented FreeToGame API. Manual game entry is available. Coverage follows
  provider classifications and limits, not an exhaustive scrape of all sites.
- Main search includes saved additions and bounded, debounced public matches.
  Unranked source records remain separate from the author's 100. Saving or
  rating imports metadata and private state atomically; provider failures do
  not remove already saved games. Online lookup has a URL-persisted opt-out,
  requires 2-80 characters and pauses in curated-tier or saved/completed scopes.
- Public catalog queries leave the device; they never include private ratings,
  notes or progress. Account data leaves the device only through its consented
  saving/sharing flows. Empty searches do not launch background catalog crawls.
- Existing localStorage lists migrate only after IndexedDB commits. Corrupt data
  is preserved with an explicit recovery path. Failed writes are not reported as
  durable success. Backups are validated before atomic replacement.
- Missing scores remain unavailable, never zero. IGN and GameSpot use /10;
  Metacritic, Metacritic PC and PC Gamer use /100.
- The normalized average uses all available entered columns, including both
  Metacritic columns. It is not an official or independent-publications rating.
- Leul's original cached ratings belong to the public creator and are visible
  by default. Their original rank-based provenance, rounded values and notes
  must not be replaced by a reconstructed curve or confused with visitor ratings.
- Explicit AI/not-played source notes are preserved. No title starts completed.
- Visitor ratings reorder unpinned personal entries automatically. A manually
  moved game retains a persisted position until explicitly returned to automatic
  order. Existing orders are preserved during schema upgrades.
- One Played value is shared by every view; author notes never set visitor state.
- Played means tried/spent time, not finished. Completed implies Played, but
  marking Played never completes a game; clearing Completed retains Played.
  Clearing Played on a completed game requires a visible confirmation and keeps
  queue, scores, notes and manual positions. Private schema3 and existing data
  remain unchanged.
- Progress filters distinguish Not played, Played (not completed) and Completed,
  separately from Queue. An inclusive played filter names that inclusion. The
  historical `list=unplayed` URL retains its old Not completed meaning; new
  controls use `progress=`. Public share URLs omit private progress filters.
- Bulk Mark played and Mark completed are separate actions in collection,
  library and Discover. Save, Pin, rating and import never imply played.
- Sign-in does not upload or publish existing device data. Online saving
  requires reviewed source selection and creator-visibility consent.
- Public profiles contain only explicitly selected rankings and chosen
  identity metadata. Directory listing is opt-in; public snapshots do not
  automatically follow later private edits.
  Late public-profile reads prefill only untouched publication fields, including
  the existing listing choice. Explicit edits and clears remain; public identity
  takes precedence over a private member name. Account changes reset the draft,
  and an open consent preview keeps its exact frozen payload.
- The creator can inspect consenting member profiles/ranking summaries and
  moderate public reports, with server-enforced authorization. The creator UI
  does not load private notes or play queues.
- Account creatures use stable random descriptors and locally generated
  DiceBear Critters. No uploaded image, remote avatar API or Google photo is
  fetched; preview/re-roll never commits before Save.
- Sign-in can restore an active, prior-consented own cloud copy into an unchanged
  empty account cache. It never merges guests, replaces pending local work or
  restarts a stopped/deleted connection.
- Friend requests and invitations support acceptance, decline, cancellation,
  removal, private blocking and unblocking. Invitation links are one-use,
  revocable and expire after seven days; their capability stays in a fragment.
- All mode covers the full supported 10,000-record account library through
  bounded, incremental publication and paginated reads. New saved/ranked games
  are included automatically; notes, email, queue and play history stay private.
  Metadata and rankings have separate protected transport paths.
- New defaults apply only to eligible verified accounts with current private
  saving consent, never to guests or an unknown bootstrap state. Existing off,
  selected-only, deleted or revoked choices are not inferred from absent new
  fields. One prominent Friends/My games/Account action enables All coherently,
  without settings navigation or per-game picking.
- A short audience statement and Stop remain visible. Stop, old-client consent
  changes, block, unfriend, private-saving pause/deletion and account changes are
  authoritative. Restarting private saving cannot silently renew sharing consent.
- Legacy selected-mode sharing remains supported with its existing 200-record
  bounds and removal-review journal. All-mode remove/re-add instead follows
  current membership; it must not introduce a per-game review loop.
- Comparisons use exact game identities for two to six participants. Unrated
  differs from zero; unavailable rankings remain explicit. Named comparison
  groups are private participant selections, not chat or access grants.
- A resolved two-to-six-person comparison shows the chosen names and starts
  with its native Change people editor collapsed. An unresolved saved group
  is not an empty selection; a chooser opened deliberately stays open while
  people are checked. Falling below two reveals the chooser again.
  Coverage & loading keeps the existing participant readers mounted, with
  truthful partial/exact scope and named failures visible outside the
  disclosure. The single bounded comparison table retains both game identity
  and participant headers during native two-axis scrolling. Disclosure state
  is transient and never saves a group or alters its name draft.
- Unfetched pages are not missing or unrated games. Whole-cohort counts/statistics
  remain unknown while coverage is incomplete. The six-game tray uses bounded
  exact-game reads; opening Compare must not fetch six entire 10,000-game libraries.
- Friends management separates Incoming/Sent requests and filters only explicitly
  loaded names. Pagination never loses later rows on a live update. Shortcuts
  carry at most five selected friends plus self in account-bound private tab
  state, not public participant URLs. Named confirmations protect Remove/Block
  and invite revocation; only still-active links can be copied or shared.
- An older writer that cannot maintain the optional sharing-removal journal
  requires a refreshed selection review before friend updates. Private saving
  remains available and its established schema/keys stay unchanged.
- Account uses concise actions, one name editor and a visible Change icon entry.
  Full storage/sharing disclosures are available at Data use without interrupting
  the current form. Creator credit and both spreadsheet downloads remain visible.
- Original and imported details share the visitor's private rating editor.
  Valid pending rating/note edits flush when leaving their field's page or
  dialog; game changes never transfer a draft to a different record.
- Accidental private additions can be removed individually or in a selection,
  only after confirmation of the affected progress, ratings and notes. The
  original public 100 is never deleted by a visitor's library action.
- No invented platforms, playtimes, trailers, current reviews or cover art.
- One real, lazy-loaded Three.js enhancement with a useful original static
  fallback; all essential functionality is independent of WebGL.
- Respect reduced motion, document visibility, touch devices, data-saving
  preferences and constrained hardware, with a manual quality control.

## Brand Commitments

Working name: Play 100. A futuristic, thoughtfully animated, focused collection
without visual clutter, generic neon SaaS styling, fake features or performance
claims. Use actual customized React Bits source components with attribution.

## Evidence on Hand

The supplied `AAA_games_u_have_to_play_list_top_100.xlsx` main tab is authoritative.
The separate data workstream provides canonical JSON, 100 mapped cover images,
an enhanced workbook and reproducible generation material. Critic scores are
carried-over snapshots, not live or independently verified.

## Product Principles

- Browsing is the first action, not the reward for finishing an animation.
- Preserve authorship and distinguish collection facts from visitor state.
- Make sharing public and personal tracking explicitly private.
- Graceful enhancement, readable content and truthful controls beat spectacle.

## Accessibility & Inclusion

Keyboard operation, visible focus, semantic controls, 44px touch targets, readable
contrast, focus-managed dialogs, ordinary scrolling, responsive layouts and
mobile safe areas are required.

On mobile, public search and compact result/view controls precede games without
requiring a trip through expanded secondary filters. Native filter disclosures
show their active count, keep one copy of each labelled field and preserve
public-lookup choices. The original table keeps compact game/rank identity
visible during horizontal score reading. Focus scrolling clears the fixed
navigation and device safe areas.

## Authorized Implementation Decisions

The user explicitly delegated remaining decisions and requested autonomous
execution after an approval round. Vite, React and TypeScript are implementation
choices. A separate public Vercel project is authorized; unrelated projects and
the original workbook must not be modified.

## Public Creator and Repository

The user authorized public source publication under `LeulTew/play-100` and
visible site/enhanced-workbook attribution to Leul Tewodros Agonafer, with the
verified GitHub repository, LinkedIn and Telegram `@fabbin` links in `author.json`.
This does not authorize publishing private browser libraries, credentials, CI
workflows or an automatic Vercel Git integration. The original archive stays
byte-identical.
