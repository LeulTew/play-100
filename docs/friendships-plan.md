# Play 100: durable sessions, friends and comparisons

Status: implementation specification, not a completion report.

This expands the existing online/community plan. It does not replace the
private-library, consent, public-publication, deletion or account-isolation
contracts. Decisions below were selected under the user's autonomous delegation.
Friend-sharing starts OFF: implementing the capability is not permission to
enable it on anyone's existing account.

## 1. Outcomes and priority

| Priority | Outcome | Acceptance |
| --- | --- | --- |
| 1 | Durable identity and personal data | A normal refresh, browser restart or deployment on the same origin restores the retained sign-in and correct account copy. No guest overwrite, forced Google round trip or lost pending edit. |
| 1 | Optional icon choice | The existing creature picker is obvious near the current account icon; Save/Cancel and header updates stay correct. |
| 1 | Real friendships | Requests, acceptance, decline, cancellation, removal and blocking are server-enforced, race-safe workflows. |
| 1 | Useful invitations | A revocable, expiring, single-use link works before login and safely resumes after same-tab Google/email sign-in. |
| 1 | Safe comparisons | A person can compare available friend rankings, choose several people and save a private named comparison group. |
| 2 | Clear UX | Identity, private online saving, friends-only sharing and public publication are distinct. Empty, loading, stale and failure states are actionable. |
| 3 | Coherent visual design | Extend chalk/ink/lime editorial layouts, with useful motion and mobile readability, not a new social-media dashboard. |
| 4 | Maintainable implementation | Reuse existing types, projection, avatar, dialog, retry and library helpers. No speculative services or gratuitous dependency upgrades. |

Do not run GitHub Actions, a local CI pipeline or a monolithic CI-equivalent
command. The user explicitly requests direct, targeted functional tests and
pragmatic review. Compilation needed to produce a deployment is still required.
Report actual evidence and omissions; never call skipped CI green or invent 10/10.

## 2. What the current account screen proves

The existing user-owned browser is on `/account`, serving `index-BSkGjBz5.js`.
Read-only inspection found a chosen header avatar, no sign-in form, no errors,
and both header and sync panel saying `Device only`. The only offered source
is the existing online copy; it is selected, and the consent checkbox is checked.
The existing creature chooser is already visible.

This is evidence of an authenticated identity with an unconnected local copy,
not evidence that Firebase signed the user out. It does not establish whether
the server head is active or intentionally stopped. Inspect the actual lifecycle
before changing behavior. The real account was not edited or reset.

The implementation owner's read-only intake confirms the source gap: a missing
account wrapper initializes disabled at epoch zero, saving requires that local
enabled flag, and active-account selection requires a positive epoch. A remote
copy populates the choices but there is no automatic own-copy adoption path.
No deployment drift was found in Firebase app/project/API-key identity or the
IndexedDB namespaces. The reason this browser lacks an activated wrapper remains
unknown; it was not inferred by inspecting the user's private rankings.

## 3. Durable session and copy-restoration contract

Keep the Firebase project, API key namespace, named app `play100-online`, stable
production origin and all existing library keys unchanged across releases.
Use SDK-managed local authentication persistence with a durable first-party
fallback when IndexedDB auth storage is unavailable. Memory-only operation must
be disclosed, not silently advertised as remembered sign-in.

An online-load hint is a boot optimization, not an authority to delete identity
or data. Version changes, lazy-chunk failures, transient network errors and
ordinary refreshes must not call sign-out or clear auth/library storage.
Initialization must settle before exposing an editable guest scope.

Restore an existing account cache without repeating first-connect consent when
its owner/project, valid prior consent, source epoch and server state agree.
On a new device, automatically download an existing active, previously consented
own online copy only into an atomically unchanged, empty, clean account cache.
Never upload guest data, merge accounts or overwrite local dirty/recovery data
as a side effect of login. If those preconditions do not hold, show the existing
source/recovery choice rather than guessing.

Manual stop, revoked consent, deletion, conflicts, invalid data and permission
failure remain protected states. Offline restoration retains the correct cached
account and pending work without falsely promising a server acknowledgement.
The Member consent version alone is not proof of prior sync consent: profile or
avatar creation may also create a Member. A checked UI checkbox is not a committed
permission either. Establish prior consent from the authoritative sync lifecycle.
Distinguish `Signed in`, `Restoring your account`, `Online saving paused`,
`Saved online`, `Changes waiting` and `Sign-in required` in truthful UI copy.

Normal token refresh remains the Firebase SDK's responsibility. Explicit logout,
administrative revocation, account deletion, cleared site data and browsers that
discard all storage can require login again. No promise of immortal sessions,
cross-domain persistence or persistence after site-data removal.

## 4. Optional icon choice

Reuse the current six-choice DiceBear Critters picker, shuffle, palettes and
explicit Save/Cancel. Make the current account avatar itself an accessible
change action and put a clear `Change icon` label beside it. Preserve the header
Account link and ordinary link behavior; do not add a second avatar system.

Keep identity-bound drafts, cryptographically random stable descriptors, local
SVG generation and committed header updates. Cancel, failed save, sign-out and
account switches must not change the saved creature. No Google photos, uploads,
remote avatar requests or animated avatar loops.

## 5. Four separate privacy decisions

| Surface | Who can see it | Trigger |
| --- | --- | --- |
| Device/account library | The user; private cloud access follows the existing consent/creator rules | Existing explicit online-saving flow |
| Friend identity | Accepted friends, intended request participants, or holders of a valid invite preview | A deliberate request/invitation/profile action |
| Friends-only ranking | Currently accepted, non-blocked friends | A separate previewed sharing opt-in |
| Public profile/ranking | Public, including anyone with a link; directory remains separately optional | Existing explicit Publish action |

Friendship does not grant access to private snapshot chunks, notes, email,
queue, play history or creator-only summaries. It does not publish a public
profile, enroll someone in the directory or expose their friend list.

Default friends-sharing is a selected set of at most 200 ranked game identities,
their relative order and optional scores. After the user reviews and enables it,
edits to that selection update its friends-only projection automatically.
Newly added, previously unselected games are NOT silently shared. Removing a
selected game/ranking removes it from the projection and selection; re-adding it
requires selection again. An empty result is an honest empty shared ranking,
not a stale list or a failed private save.

Public snapshots retain their existing manual-update behavior. Disabling
friends-sharing revokes new server reads immediately; prior viewers may already
have copied what they saw. Do not promise remote erasure of saved copies.

## 6. Friendship and invitation journeys

### Find and request

Start from public Community profiles or an invitation. Reuse public discovery;
do not introduce email search, private-account enumeration or contact harvesting.
An authenticated, verified account can send a request showing the exact chosen
name/icon the recipient will see. The recipient explicitly accepts or declines.
The sender can cancel. A duplicate click, retry or opposite-direction request
must not create duplicate friendships or silently overwrite an incoming request.

### Invite someone

Create a cryptographically unpredictable, 256-bit opaque link capability.
Default lifetime: seven days, one recipient, revocable by its owner. Expiration
is enforced from server creation time, not trusted device time. No paid TTL job.
Keep a bounded active-link registry; use 20 as the initial maximum.

Put the capability in a URL fragment, not a query parameter. Treat both the
token and any equivalent document identifier as secrets: no logs, analytics,
public listings, source fixtures or forwarding into OAuth parameters. Do not
pretend hashing alone removes a bearer capability's sensitivity.

The preview exposes only the inviter's deliberately chosen name/icon and the
invitation terms. It grants no ranking or friend-list access. A recipient signs
in if needed, returns to the same invitation and explicitly accepts as the
visible current account. Creating a link is the inviter's advance consent to
that one acceptance; login itself never consumes a link.

Acceptance and consumption are atomic. One concurrent recipient wins; another
gets a useful unavailable result, never a second connection. Self-invites,
already-friends, expired, revoked, malformed and already-used links have explicit
states. Do not disclose another recipient's identity in an unavailable message.
Copy/native-share failures retain a selectable link and a fresh Copy action.

### Return through login

Preserve only a validated, temporary invite-resume intent in session storage.
Keep the secret out of Google OAuth parameters and ordinary return-path URLs.
Extend existing same-tab sign-in handling without changing link, reauth, deletion
confirmation, cancellation or Back semantics. Clear stale/consumed intents.
An account change requires a fresh, visible acceptance as the new identity.

### Remove, block and recover

Either participant may remove a friendship. Show what changes and confirm the
action. Removal revokes friends-only access, clears active comparison data and
requires a new request/invitation to reconnect.

Blocking also prevents new requests, invite acceptance and friend-only reads
in either direction. The blocking list is private. Unblocking does not restore
a friendship. Use existing reporting/moderation where compatible; do not create
a public block badge or expose who blocked whom.

Relationship-changing transactions require connectivity. Do not show accepted,
removed or revoked success while the server operation has not succeeded.

## 7. Data and authorization design

Use separate versioned social documents rather than adding arbitrary fields to
strict existing Member, public-profile or private-library formats. The following
is the proposed model; verify exact paths/helpers against the repository before
implementation and record any justified adjustment in the repository plan.

| Logical record | Contents and ownership |
| --- | --- |
| Friend-facing identity | Sanitized projection of the account's chosen name/icon, not a competing identity source; no email or private counts |
| Request | Sender, recipient, state, server timestamps and lifecycle/version information; readable only by participants |
| Accepted connection | Mirrored owner-scoped edges or a demonstrably equivalent pair record; both participants and server rules agree on one connection epoch |
| Private block | Blocker/target and server timestamp; private to the blocker, usable by rules to deny access |
| Invitation and owner registry | Opaque capability, minimal preview, creation time, state and optional accepting UID; anonymous listing denied, active registry bounded |
| Friends-sharing control | Owner, enabled flag, selected identities, settings revision and consent epoch; owner-only writes |
| Friends-ranking head/generation | Only the strict ranking projection, metadata, immutable generation and current/previous pointers |
| Comparison group | Private owner, name, at most six distinct participants and timestamps; no copied friend scores or group-wide administrative roles |

Never authorize a relationship from a client-written `isFriend` flag alone.
Acceptance must prove an authorized pending request or valid invitation and
atomically create the consistent connection. Rules must prevent outsiders,
forged participants, self-connections, partial reciprocal writes, replay,
resurrection after removal/block and stale operations after account deletion.

All friends-ranking reads check current relationship, blocking, sharing consent,
generation and lifecycle state. Knowing a UID, generation or old URL is not
authorization. Own writes do not grant access to another person's library.
Queries must satisfy rules as queries: rules are not result filters.

Budget cross-document authorization reads explicitly: Firestore allows 10 per
single-document/query evaluation and 20 per atomic multi-document operation,
with the 10-per-operation limit still applying. Exercise the real batched/query
shape, not only isolated document reads.

Prefer bounded packed ranking chunks with strict per-entry validation over one
read per game. The initial ten-entry target exceeded Firestore's 1,000-expression
evaluation limit in the real 200-game test. Five entries still exceeded it;
three passed the catalog-only case but failed the canonical-source branch.
The implementation therefore uses two immutable entries per chunk, at most
100 chunks in one bounded current-generation query. This keeps
the full 200-game limit and strict validation without a multi-phase mutable
chunk protocol. It costs up to 100 content reads instead of the original target
of 20. Firestore rules have no arbitrary loops; use a bounded, tested validation
shape, not an invented map/all API.
Keep existing public snapshot formats unchanged. Reject unknown/private fields,
bad source identities, duplicate positions/identities and inconsistent manifests.

## 8. Automatic sharing without breaking automatic saving

Keep IndexedDB state and its account-bound outbox authoritative. Automatic
friends-sharing operates only on an explicitly selected, owned account scope.
No background adoption or publication of a guest scope. If account setup is
needed, explain and reuse the existing source/consent flow.

Connections/invitations do not themselves upload a private library. They remain
usable without public publication. A comparison may display the user's current
local ranking privately without publishing it; label an unshared device copy.

Coalesce projection work, reuse the retry/scope-guard infrastructure and skip
writes when only notes, unrelated games or device motion changed. Keep separate
truthful status for private saving and friend-sharing: a failed projection must
not discard data or turn a completed private save into a failure.

Protect settings/consent revisions, source revisions and connection lifetimes
against old-tab overwrites. A stale acknowledgement must not clear newer work.
Stop/logout/scope change invalidate queued callbacks. Stop online saving pauses
automatic sharing updates; explain that a previously shared projection remains
visible until friends-sharing is stopped. Never override an intentional stop.

Only keep social listeners needed by the active screen or enabled sharing
operation. Detach comparison listeners when not needed; coalesce focus/online
wakes. No idle polling, global presence, unread-feed service or fanout to every
friend on each score edit. Quota backoff stays bounded and survives edit bursts.

## 9. Comparisons that mean what they say

Allow two to six selected participants, with the current user selected by
default but optional. Save named groups privately for reuse across devices.
These are saved selections, not chat rooms, shared group administration or
implicit invitations to all members.

Match exact stable source identities, never fuzzy titles: collection slug,
Wikidata ID, FreeToGame ID, Steam ID if already supported, or the exact existing
manual record identity. Different editions/catalog identities remain separate
unless an already verified mapping exists. Importing an exact shared record
may preserve that identity; merely typing the same title does not establish it.

Use the actual personal/shared ordering, including manual choices. Ranking an
unplayed game is valid. Leul's original scores are not the visitor's scores.
Null is `Unrated`; zero is a real score. Unranked, unshared, unavailable and
unrated are different states.

The initial view offers common ranked games and all shared games. Pair view
shows each person's rank/score and score difference only where both rated.
Group view shows coverage, per-game mean and spread using only supplied scores,
plus individual values; always show the number of raters.

Summary metrics are descriptive, not judgments of people: shared-game count,
jointly rated count and average absolute score gap. Relative-order agreement,
if included, compares the order of common games and requires at least three;
it must be invariant to unshared games inserted elsewhere in either list.
Do not invent a universal taste-match percentage or treat missing ratings as zero.

A failed or unshared participant must remain visibly unavailable. Do not silently
replace them, count them as an empty score list or present partial results as a
complete six-person group. Label exactly which available people a result uses.
Show each friend's last successfully shared timestamp and stale/loading state.

Keep imported scores/notes/progress out of the user's library. Any `Save game`
or details action reuses existing metadata-only import and private-edit flows.
Opening a comparison is not a write to any participant's ranking.

## 10. Comparison implementation boundary

The calculation and presentation layer should have no Firebase dependency.
Inputs: participant identifier, display name, local avatar descriptor, self/friend
kind, availability/freshness metadata and validated ordered entries. Entries use
existing public-entry metadata fields, optional score and a positive position.
Own local entries may have positions beyond the public 200-entry cap; do not
misuse the strict public parser for a private 10,000-record list.

Implementation detail: the calculation DTO deliberately excludes avatars.
The view keeps a typed identity/avatar map keyed by the same participant UID
and constructs the strict engine input field by field. This keeps generated
images out of the arithmetic layer without dropping each person's visible
creature. Array bounds are consumed by indexed length, not custom iterators.

Validate at most six distinct participants, at most one local-self dataset,
at most 200 entries per received friend and the existing private-library bound
for self. Reject duplicate identities within a participant. Preserve input
arrays and numeric precision during calculations; round only for display.

Build maps once, derive deterministic results and render at most 25 game rows
per page. Pair metrics only inspect the bounded common subset. No quadratic
work over an entire 10,000-entry private ranking and no thousands of DOM rows.
The data/controller layer owns authorization, selection, fetching, lifecycle
invalidations, saving groups and routing; the table does not fetch private data.

## 11. Screens and interaction

| Surface | Primary job |
| --- | --- |
| Account | Obvious Change icon; separate identity, private-saving, friends-sharing and public-publication status/actions |
| Friends | Accepted friends and Requests; Invite as the clear primary action; paginated lists and contextual remove/block/report |
| Invite | Minimal inviter preview and terms; sign-in/resume; explicit acceptance; clear unavailable states |
| Friend detail | Chosen identity, relationship state, authorized shared ranking, Compare and metadata-only Save |
| Compare | Participant picker, pair/group view, common/all filter, game search, deterministic sort and saved-group controls |
| Sharing setup | Exact preview, selected count, what is excluded, opt-in/update/stop, pending/error state |

Friends and Compare are reachable from Account and appropriate Community/
Discover context. Preserve the current mobile navigation footprint rather than
adding an overloaded bottom bar. Private pages must not emit private metadata
into public SEO, preview tags or structured data.

Desktop uses open ruled rows and a readable comparison table. Mobile uses a
contained horizontally scrollable table with a sticky game label, or an equally
legible per-game layout. The whole page must not overflow. Keep controls at
least 44px, ordinarily 48px; names must wrap/truncate without covering actions.

Use existing fonts, palette, avatar renderer and focus-managed dialogs.
Semantic links/buttons, visible focus, labels, live status, keyboard alternatives,
safe areas and reduced motion are required. State animations are brief,
interruptible and transform/opacity based. No new WebGL scene, feed, glow,
glass dashboard, confetti loop or decorative performance burden.

URL state may contain safe filters or an opaque authenticated group identifier,
never ratings, notes or invitation capabilities in query parameters. Restore
selection safely through refresh/Back without leaking another account's group.

## 12. Backward compatibility, export and deletion

Preserve original collection JSON, original workbook, enhanced workbook, author
ratings and credits byte-for-byte unless a separately authorized change requires
otherwise. Preserve source catalog behavior, Played/replay/queue semantics,
manual ranking slots, editor-exit flushes, backup validation, recovery copies,
account isolation, creator moderation and public publication.

Do not change private library schema version 3 or IndexedDB keys merely to add
social features. Keep new metadata in its own versioned scope. Existing tabs
must not lose auth or corrupt new metadata; unsupported social operations should
fail safely while legacy library operations remain intact.

Wire all new own data into the appropriate account export/deletion flows.
Export the user's settings, groups and relationship metadata, not other people's
private ranking caches or active invite capabilities by default.

Account deletion first reserves the existing lifecycle boundary, immediately
denying social reads/acceptance. Then clean owned groups, sharing generations,
requests, invitations, identity and reciprocal relationship projections using
bounded resumable work. Partial cleanup or an old tab cannot revive access.
Retain only intentionally documented, content-free revocation markers.

## 13. Pragmatic gauntlet and proof

Run focused checks as implementation proceeds, not a full CI chain. One bounded
independent review follows the integrated candidate; fix real findings and
re-check the affected flows. Apply the established 16-phase review contract,
without claiming formal CI-backed approval when CI was explicitly skipped.

| Area | Required targeted evidence |
| --- | --- |
| Session persistence | Same browser profile across reload, close/reopen and old-to-new app assets on the same origin; same UID/scope, no login loop |
| Restoration safety | Active prior-consented cloud copy into empty clean cache; dirty cache, guest data, stale epoch, manual stop, conflict and deletion remain protected |
| Storage/network | Durable auth fallback, blocked storage disclosure, offline reload, transient token/network failure, delayed initialization and stale callbacks |
| Icon | Open, shuffle/palette, Cancel, Save, failed save, header update and account switch without changing real-user data |
| Relationships | Request/accept/decline/cancel, duplicates, opposite-direction race, unfriend, block/unblock and unauthorized forged edges |
| Invitations | Anonymous limited preview, login/Back/Cancel resume, self-use, expiry, revoke, concurrent consumption, replay and wrong-account/stale intent |
| Permission boundaries | Stranger/removed/blocked/revoked/deleted user cannot read friend generations or private snapshots; anonymous/global listing denied |
| Automatic sharing | Selected-only projection, exclusion of notes/email/queue/progress, removal/empty selection, revision races, cooldown, stop/logout and no-op edits |
| Comparison math | Zero/null, empty/disjoint/identical data, source/edition identity, exact manual imports, order invariance, cohort coverage, duplicates and six-person bound |
| Groups | Create/rename/update/delete, refresh/device restoration, ownership, unavailable/deleted members and no copied friend scores |
| Relevant legacy paths | Guest persistence, inline draft exit, manual order/Played, metadata-only imports, backup recovery, existing private sync and public publication |
| UX and appearance | Real desktop and narrow mobile journey, keyboard/focus/dialog behavior, long names, empty/error states, reduced motion and no page overflow |
| Release | Required TS/Vite build, correct live rules/indexes, candidate smoke, source/workbook preservation and actual production entry/deployment receipt |

Use synthetic isolated profiles/emulator identities for mutations and cleanup.
Do not sign out, change scores, switch avatars, accept test friends or delete
anything on the user's real signed-in account. A fresh empty browser context is
not a persistence test. Do not claim real human Google/MFA or email delivery
when only provider handoff or synthetic verification was exercised.

## 14. Cost and rollout

Stay on the existing Firebase Spark project with billing disabled and the
existing Vercel Hobby included build setup. No Supabase, paid Cloud Functions,
TTL deletes, new analytics, bulk email or paid upgrade. Re-check actual provider
configuration before deployment; do not infer current state from old receipts.

Page friends/requests/groups in bounded batches (initial page size 20).
Fetch only selected comparison participants and bounded ranking chunks. Cleanup
uses user-triggered/resumed bounded operations, not an always-running service.
Respect existing transient backoff and quota cooldown. Free limits and closed
browsers remain real limitations, not reasons to promise always-on processing.

Implement in this order: session/icon continuity; authorized friend lifecycle;
friends-only sharing; comparison/group integration; functional gauntlet;
UX/UI refinements; final code-quality pass and release. Pure comparison work
may proceed independently after its input contract is agreed.

Stage a candidate without replacing the primary alias, run the required
ordinary remote TS/Vite build, check it and apply additive rules/indexes in a
backward-compatible order. Promote only after the required scoped evidence is
available. Preserve rollback ability without reviving revoked access. Record
the actual commit, deployment, tested journeys, omissions and owned cleanup.

## 15. Updated copy direction: concise operational screens

The user's 22:43 instruction supersedes verbose visible explanations in this
plan's UI examples. This technical specification may be detailed; the application
must not read like it. Apply the direction to existing pages and new social UI.

| Replace or remove | Preferred presentation |
| --- | --- |
| Your list. Anywhere. / Your identity / Share your taste. | Account / Profile / Sharing |
| Two account-name inputs | One name editor with existing validation and draft safety |
| Avatar implementation paragraph | Change icon |
| Repeated consent/privacy/storage paragraphs | Short creator-visibility summary beside the action; optional Data use link |
| Checkbox followed by a separate consent button | One explicit Agree & enable action, if all source-preview and consent guards are preserved |
| Backups & recovery plus reassurance paragraph | Backups with short, distinct export actions |
| Operational-page slogans and repeated footer missions | Direct page titles and one compact credited footer |
| IndexedDB/Supabase/no-crawler/no-invented-data commentary | Remove from routine UI; retain accurate technical details in optional documentation |

Data use opens through a real native link in a new tab/window, without losing the
current form. No forced reading, scroll gate or unnecessary cookie banner.
The creator's access remains briefly visible beside consent. Do not precheck
consent, auto-accept on page load, bundle friends/public permission into it, or
hide overwrite/deletion consequences behind a policy link.

Retain meaningful source choice when copies differ; present a sole safe option
compactly. A one-click consent action still binds to the preview the person
actually reviewed. Moving the name field outside the connection form must not
remove name validation. Preserve identity-bound drafts and all existing actions.

The read-only live baseline has 153 words across eight visible explanatory blocks,
two nickname inputs, and a 1,044px Account section at a 957px-wide viewport.
The target is at least 50% less default explanatory copy in a comparable setup
state, without smaller fonts, clipped text or hiding important error states.
Do not compare an old setup form against a new already-connected screen.

Audit Auth, Account, Library, Rankings, Discover, Community, Publish, Creator,
settings, dialogs and footer. Keep original curator rationales/notes, score
provenance, required attribution, source links and both workbook downloads.
Keep Leul's full creator credit and social/repository links visible once.
Do not replace removed paragraphs with decorative filler.

## References verified for this plan

- Firebase auth persistence: https://firebase.google.com/docs/auth/web/auth-state-persistence
- Atomic operations: https://firebase.google.com/docs/firestore/manage-data/transactions
- Rules, access-call limits and query behavior: https://firebase.google.com/docs/firestore/security/rules-conditions
- Spark quotas and non-free TTL: https://firebase.google.com/docs/firestore/quotas
- Current interface guidance: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
- Repository contracts: PRODUCT.md, DESIGN.md, docs/online-saving.md,
  docs/online-community-plan.md, existing source and rules.

## 15. Direct interface copy

The subsequent user direction requires shorter operational pages without
removing features or material consequences. Account has one heading, one name
editor, a visible Change icon action, compact copy choices and an explicit
Agree & enable/replace action. The same transaction/revision checks still gate
the action; opening Data use never grants consent.

Detailed storage, operator, quota and sharing disclosures live at `/data-use`,
opened by a native accessible new-tab link. That page does not mount the private
application. Backups and deletion live in labelled disclosures, while actual
errors, conflicts and destructive consequences remain visible when relevant.
Public and friends-only publishing remain separate previewed choices.

Equivalent synthetic Account setup markup measured 145 helper words before and
34 after (76.6% fewer), with two nickname fields reduced to one. This is a
static comparable-state measurement, not a browser-layout or persistence claim.
Desktop/mobile functional inspection remains part of the targeted journeys.
Creator credit, source facts, original author rationale/ratings, both workbook
downloads and all licensing remain intact.
