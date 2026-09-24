# Play 100: fast accounts, local-first sync, and a small social layer

Status: implementation contract, not a claim that the features are already live.

## Release-path amendment (2026-09-23)

Releases now use the remote-build/skip-domain/verify/promote path documented in
[Deploy to Vercel](../README.md#deploy-to-vercel). GitHub Actions CI runs quality
checks without deploying. This amendment supersedes the original local-prebuilt
release and no-hosted-CI requirements, including the historical quota statement
in Review output; the original contract text below is retained for provenance.

## 1. Outcome and scope

Keep the collection people already like. Add an account that travels between
devices and a considered way to discover other people's taste, without turning
Play 100 into a noisy social network.

The user explicitly requested a detailed senior-engineering plan, implementation,
and a functionality/UX evaluation. They delegated decisions after a focused
social-scope question. The selected scope below is an implementation decision,
not an additional answer invented on their behalf.

**Ship together:**

- Google sign-in as the fast path; verified email/password as the fallback.
- Existing IndexedDB-first editing, plus optional private cloud saving.
- An account page with understandable sync, backup, privacy, and deletion controls.
- A public profile and one deliberately published ranking per account.
- A small, paginated community directory of people who choose to appear there.
- Saving individual games or a selection from another person's published ranking.
- A protected creator view of consenting members and their ranking summaries,
  with basic public-content moderation.

**Do not ship in this release:** feeds, comments, messages, followers, likes,
  notifications, recommendations, avatar uploads, advertisements, analytics,
  Supabase, paid Firebase products, or a visual rebrand.

Existing guests must still find, rate, rank, save, reorder, and export games
without an account. Logging in must not silently publish or upload their library.

## 2. Ground truth and non-negotiables

Current source baseline: `244bb24f1d715b231292d6f9a6af64cb0b757176`.

The app is Vite + React + TypeScript. It already has a tested action reducer,
an IndexedDB database named `play100-personal` at database version 2, library
schema version 3, atomic read/write transactions, BroadcastChannel updates,
debounced rating/note editors with exit flushing, protected backup migration,
manual ranking slots, and a shared Played value.

Preserve these foundations; do not bolt a second competing library store onto
the UI. The local revision and the server revision are different concepts.

The following remain unchanged:

- Leul's exact original 100, source ratings, source notes, critic values, and order.
- Public creator metadata, attribution, and repository/contact links.
- Enhanced XLSX SHA-256:
  `bc24d79e467ee23378c5f86a8f927a64547131e4abc1a9d468e1892549cfbf93`.
- Original XLSX SHA-256:
  `301043fb513209b129586f617f1d205526c3c61785c48182760cf1aacaf29143`.
- Visitor scores never seed from Leul's ratings; ranking does not imply playing.
- Manual positions, tie behavior, played/completed/replay semantics, drafts,
  record identities, unranked imports, and remove/restore protections.
- The existing chalk/ink/lime identity and adaptive Three.js enhancement.
- Local builds and prebuilt Vercel deployment; no hosted CI or invented PR merge (superseded; see release-path amendment).

### Provisioned infrastructure

The dedicated Firebase project is `play100-online-48823b32`.
Standard Firebase Authentication is initialized with email/password enabled.
The default Firestore database is Standard / Native in `europe-west1`,
with `freeTier=true`. Its currently deployed rules deny all client access.
Billing is disabled and no billing account is linked.

The browser key is restricted to the needed Firebase APIs and approved origins.
Google sign-in is not enabled yet. Its documented console configuration is part
of this release, not an excuse to advertise a provider that does not work.

## 3. The product model: three separate decisions

| Decision | What it means | What it does not mean |
| --- | --- | --- |
| Continue on this device | Existing guest library and backups | No account or private-data upload |
| Enable online saving | Verified identity and private cross-device library | Not a public profile or a published ranking |
| Publish a ranking | A previewed, sanitized snapshot becomes readable by others | Not publication of notes, email, queue, or all future edits |

Community browsing and reading published profiles require no account.
Saving a game from a profile works for guests, using their existing local library.
Verification is required for cloud writes, claiming a public handle, and publishing.

The owner may inspect registered profiles and opted-in ranking summaries.
Explain that before online saving. Do not claim that a database operator is
technically incapable of accessing stored private data.

No cloud activity on a fresh guest visit: no anonymous Firebase signup, identity
tracking, Firestore polling, or authentication SDK download solely to browse
the original collection.

## 4. Fast login without fragile shortcuts

### Entry and account sheet

Use one Account entry in the existing shell. Avoid adding another crowded mobile
bottom-navigation item: retain the current primary destinations and expose
Community through Discover and the account/menu surface.

The sign-in sheet leads with:

> Your list. Wherever you play.
>
> Keep this device's library, or connect an account to save across devices.

Primary action: **Continue with Google**.
Secondary action: **Use email**.
Quiet exit: **Keep using this device**.

No forced profile wizard, password form before the Google option, automatic
popup on page load, or demand for a public handle before a person can save.
Use Google's approved button treatment and normal `openid`, `email`, and
`profile` identity scopes only. Do not request Gmail, Contacts, Drive, or Calendar.

Load the auth code when the sheet is opened or an existing connected account is
restored. The Google click must retain a genuine browser user gesture; do not
lose popup permission by waiting for a large dynamic import inside the click.

Use Firebase's supported popup flow as the initial implementation on this
Vercel-hosted app. Handle cancellation without an error toast. A blocked popup
offers a clear retry and email fallback, preserving the requested destination.
Do not add an untested redirect fallback: Firebase redirects on another hosting
domain need a documented same-origin helper/proxy arrangement to work when
third-party storage is blocked.

If a redirect flow is implemented, verify the helper proxy, authorized redirect
URI, CSP and iframe behavior on the actual Vercel domain. A 302 redirect to a
Firebase helper is not the required reverse proxy. Never tell visitors to turn
off browser privacy protections.

### Email fallback and recovery

- Visible labels, correct autocomplete attributes, password-manager support,
  paste allowed, accessible reveal-password control, and inline errors.
- Separate sign-in and create-account intent without silently creating accounts.
- Verification and password reset use Firebase's built-in emails.
- Resend has a cooldown and accurate quota/error feedback.
- Unverified accounts can retain local drafts but cannot upload or publish.
- Email enumeration protection stays enabled.
- Handle existing-account/provider conflicts through a legitimate sign-in/link
  flow, never by treating an unverified matching email as proof of ownership.

No magic-link sign-in or SMS: Spark's sign-in-email quota is too small for the
primary path, and SMS introduces a billing dependency.

## 5. First connection: preserve both sides

Authentication and adoption of a library must not be one destructive operation.

| Device state | Account state | Safe behavior |
| --- | --- | --- |
| No private device edits | No online library | Create an empty account library after sync consent |
| Device library exists | No online library | Preview its counts and offer to copy it online |
| No private device edits | Online library exists | Load the account library after sync consent |
| Both contain data | Online library exists | Explain the two libraries; let the person keep the online version or deliberately import the device copy |

The guest database remains intact. Switching to an account does not rename,
overwrite, or delete it. Never guess that a different account on the same
computer owns the previous account's cached records.

A first-connect import uses the existing domain identities. It must not
silently duplicate canonical games or conflate records from different public
catalog sources. When overlapping scores/orders need a decision, preview the
conflict and preserve a recovery copy before replacement. Do not invent a
"smart merge" that discards manual placements.

On returning visits, restore only the authenticated account's namespace.
Account switching waits for valid editor drafts to commit locally, invalidates
old in-flight callbacks, detaches old listeners, and then loads the next scope.

## 6. Local-first storage and sync protocol

### Ownership

Keep the domain library schema and reducer authoritative. Refactor the current
database adapter into explicit scopes with tests:

`guest` or `account:<firebase-project>:<uid>`.

Each scope has its own state, mutation queue, revision, notifications, and sync
metadata. A minimal storage-version migration may add scoped keys/stores, but
must preserve the original guest `state` and historical backup support.
Do not increment the domain schema merely to attach transport metadata.

Motion/render quality is a device preference, not a social or library fact.
Enabling Full on a desktop must not silently force Full onto a constrained phone.
Preserve the receiving device's visual preference when adopting cloud state,
and do not upload a new library solely because that preference changed.
Existing explicit backup import/export compatibility remains intact.

Every accepted user edit follows:

1. Validate through the existing domain action.
2. Atomically commit local state and the corresponding sync-dirty metadata.
3. Show **Saved on this device**.
4. Coalesce pending cloud work and send it in the background if enabled.
5. Show **Saved online** only after the remote commit is acknowledged.

There must be no crash window between saving the library and marking it dirty.
Pending work is a durable outbox, not a timer or an in-memory `useEffect` flag.
A successful older upload must not clear a newer local edit's pending status.

Keep temporary, nonpersistent-browser mode honest. It must not report a durable
offline outbox when IndexedDB is unavailable. Preserve export/recovery options.

### Atomic snapshots and Firestore's document limit

The existing local app allows 10,000 records and keeps each library within a
20 MiB budget, measured as its compact backup JSON.
Do not assume that its state fits in Firestore's 1 MiB document limit.

Use a small, versioned snapshot transport with immutable bounded chunks and an
atomic head pointer. A typical small library takes one or a few chunks; larger
valid libraries use the same protocol instead of being truncated.

- Serialize deterministically and calculate a digest.
- Bound each chunk well below the Firestore document limit; target 192 KiB of
  raw UTF-8 data, with a tested encoding-size allowance.
- Bound total decoded payload to the existing 20 MiB import envelope. Explain
  oversized-state errors and retain all local data; never silently omit records.
- Store transport format version, generation, digest, chunk count and server
  revision in a compact manifest.
- Upload a complete candidate generation before publishing its manifest.
- Commit the head with a transaction comparing the expected remote revision
  and consent epoch. Do not use an unconditional last-write-wins `set`.
- Download and validate every required chunk, digest, version and domain state
  before replacing any local account state.
- Keep the current and one previous complete generation for recovery, and
  clean stale staging generations in bounded owner-scoped batches.
- Never delete chunks still referenced by either retained head. Cleanup failure
  is visible and retryable; it cannot make a saved generation unreadable.

Avoid rewriting unchanged chunks unnecessarily. Test both a normal 100-game
library and large valid boundary fixtures. Bound concurrency and batches.
Do not turn a 20 MiB edge case into the normal per-keystroke network workload.

Firestore transactions can retry and fail offline. Their callbacks must not
mutate React state. Firebase's built-in persistent cache is not the outbox or
account-isolation mechanism; use memory cache unless a separately tested,
consented disk-cache policy is implemented.

### Concurrency and conflicts

Separate `localRevision`, `remoteRevision`, `baseRemoteRevision` and
`consentEpoch`. Never compare a local revision from device A to device B's
counter as though they formed a global clock.

A clean client can adopt a newer remote snapshot atomically. A dirty client
whose base has changed enters **Needs a choice**, without replacing either side.
Offer:

- Use the online copy, retaining/exporting the local recovery copy first.
- Keep this device's copy online, with an explicit replacement confirmation
  against the latest remote revision.
- Download both copies and decide later.

Do not enqueue public publication as an automatic side effect of private sync.
Unpublishing or disabling sync increments an epoch so stale tabs cannot
silently recreate the old state.

### Status vocabulary

`Device only` / `Saving online…` / `Saved online` /
`Offline · saved here` / `Needs a choice` / `Online saving paused`.

A compact, keyboard-accessible status control opens useful detail. Routine
status changes do not spam toasts or steal focus. Errors state what is safe,
what failed, and which action recovers it.

## 7. Cloud data boundaries and authorization

The exact collection names may follow implementation conventions; these
separations and permissions may not be weakened.

| Data class | Readers | Writers |
| --- | --- | --- |
| Account profile and sync consent | That verified user; authorized creator for disclosed fields | That user, with validated immutable UID |
| Private sync head/chunks | That user only through application rules | That user, with revision/epoch/size checks |
| Creator ranking summary | That user and the authorized creator | That user through the validated sync flow |
| Public profile/list head and entries | Anyone only while currently published and not hidden | Publisher; creator may hide/revoke |
| Handle ownership | Lookup only for a currently published profile; owner as needed | Atomic, verified handle-claim flow |
| Reports | Reporter for their own submission; creator for moderation | Verified reporter, bounded and deduplicated |
| Owner configuration / moderation / revocation markers | Rules or specifically authorized operations only | Project-admin provisioning or narrowly authorized moderation |

Deny by default. Firebase API keys are routing configuration, not access control.
Keep only the approved Firebase APIs/origins allowed. Never publish Google
refresh tokens, service-account private keys, or Vercel credentials.

Bootstrap creator authority using the already verified project owner through
server-provisioned configuration/claims. Never grant it to the first signup or
to a client-editable profile flag. A verified-email comparison in Security Rules
against a protected owner configuration is acceptable; a frontend email check
is not authorization. Do not put an unrequested private owner email in public
source or use an invented administrator password.

Rules must validate UID ownership, field allowlists, type/size bounds, legal
transitions, immutable identifiers and the active consent/publication epoch.
Tests must prove that a crafted direct SDK/REST request cannot bypass UI checks.
Treat all downloaded snapshots and public content as untrusted input.

## 8. The small social layer

### Public profile and ranking

A private account has no public profile by default.

The existing My rankings page gains **Publish a ranking**, which opens a preview
of exactly what will leave the private boundary. Choose an editable display name
and a short unique handle only when publishing for the first time.

One published ranking per account is sufficient for this release. A person can
select up to 200 ranked entries, retaining their existing order. The cap is
visible, applies only to publication, and does not reduce the local library.
Never silently publish only the first 200 of a longer selection.

Public entries contain only: publication position, safe game identity/title,
verified source attribution, optional year, and the chosen personal score.
Private notes, queue, email, internal revision fields and play history are
excluded by explicit projection and by public-entry field rules.

The preview says:

> Anyone with the link can read or copy this ranking.
> Your notes, email and play queue stay out of it.

An optional, initially unchecked **Show in Community** control determines
directory inclusion. Link-only means not listed; it does not mean private.
The entire published snapshot remains static until **Update published ranking**
is explicitly used. Unpublish stops new server reads; it cannot recall someone
else's screenshots or already imported games.

Use a stable `/u/<handle>` route with real links/back behavior and clear missing,
unpublished and unavailable states. Handle claims are transactionally unique,
normalized and bounded. Reserve system/creator impersonation handles. A verified
creator badge, if shown, must be server-authorized, not inferred from a name.

### Seeded creature avatars

The user subsequently requested a programmable, randomized avatar pack. Use
**DiceBear Critters**, rendered locally, instead of initials as the primary
avatar. Initials remain a safe loading/unavailable fallback.

The verified published versions are `@dicebear/core` **10.7.0** (MIT) and
`@dicebear/styles` **10.6.0**, whose exact packaged Critters definition is
**CC0 1.0**. The documentation's 10.7.0 banner does not mean a styles 10.7.0
package exists. Import only `@dicebear/styles/critters.json`; do not bundle the
entire styles collection. The current API is `Style` + `Avatar`, not the
removed pre-v10 `createAvatar` API.

Curate round, bear-like bodies/ears and friendly expressions, with restrained
lime, moss, clay and other compatible palette choices. Keep animation off in
lists. Chooser transitions may use the existing reduced-motion-aware motion
policy, but a page of avatars must not become a page of animation loops.

Persist a validated avatar descriptor in the account/public profile metadata:
format version, an opaque random seed, and a small palette identifier. Pin the
generator/style recipe behind that format version. Never derive the seed from
an email or authentication UID, and never rerandomize on render or sign-in.

The chooser offers six previews, **Shuffle**, palette choices, **Save avatar**,
and Cancel. Shuffle changes only the draft; Save commits the chosen descriptor.
The same saved descriptor must render consistently after reload and on a second
device. A future generator upgrade needs an explicit compatibility/migration
decision, not silently changed faces.

Generate SVG from the trusted local style definition and render it as a sized
image, not arbitrary HTML. Store no user SVG, remote avatar URL, or uploaded
image. Do not call a DiceBear/Gravatar API or fetch Google profile photos at
runtime. Validate descriptors in the client and access rules; account switches
must not leak another account's unsaved avatar draft.

The avatar is not an authentication identifier. Names/handles still distinguish
users when two random recipes happen to look alike. Preserve the core license
and include a concise DiceBear/Critters credit.

The isolated avatar component is implemented and checked; account/cloud
integration is still in progress. These are synthetic preview faces, not users:

![Implemented Critters avatars at three sizes and the desktop/mobile chooser](play100-avatar-preview.png)

### Community directory

Use compact, readable profile/list previews: chosen name, handle, list title,
entry count, three game titles, and a clear open action. Do not invent member
counts, trending scores, popularity or sample users in production.

Paginate 20 profiles with stable cursors. Show only explicitly listed and
currently published profiles. Handle-prefix search can be supported honestly;
do not label an incomplete client-side filter as full-text people search.

A useful empty state is **Be the first to share a ranking**, with a direct
publish action. No fake community activity.

### Saving from a ranking

Use the existing import/action pipeline. Save one or multiple games into the
viewer's own local or connected library. Preserve identities and provenance.
Never copy someone else's scores, private notes, Played values or manual slots
into the viewer's ranking without a separate explicit action. Canonical records
are rehydrated from trusted local collection data, not a stranger's assertion
that a title has Leul's rank.

### Minimal moderation

Publishing introduces user-generated content, so include a small protected
creator moderation surface. A verified user may report a profile once with a
bounded reason. Reporting does not automatically hide it.

The creator can hide/unpublish public content and view reports. A moderated user
cannot evade that state by deleting/recreating a publication. No public email
directory, automatic social surveillance, comment system or follower graph.

## 9. Page and interaction design

Inherit `DESIGN.md`: chalk `#f3f3e9`, ink `#20231e`, flat lime `#d3f36b`,
Barlow Condensed display and Hanken Grotesk body. Reuse the 48px controls,
44px minimum targets, visible labels, centered select chevrons, ruled rows,
focus-managed dialogs, subtle corners, and careful responsive spacing.

New pages should feel more deliberate, not more decorated. No new 3D canvases
on data-heavy account/community pages. Existing 3D stays unchanged.

| Surface | First viewport | Primary action |
| --- | --- | --- |
| Sign-in sheet | One short benefit, Google button, email fallback, device-only exit | Continue with Google |
| Account | Identity plus plain sync state; one useful next step | Enable saving / resolve current issue |
| My rankings | Existing editable ranking; clear Private/Published status | Edit ranking; publish is secondary |
| Publish preview | Exact public identity and selected list, privacy sentence | Publish this ranking |
| Community | Short title, real profiles or honest empty state, restrained search | Open a ranking |
| Public profile | Person, list title, first ranked games; no oversized hero | Save selected games |
| Creator view | Paginated members/reports, useful counts, no vanity charts | Inspect ranking / moderate report |

Illustrative layout, not a second visual identity:

```text
PUBLIC PROFILE
--------------------------------------------------
[monogram] Name @handle              [Share]
Their ranking title
Personal preferences, not an official ranking.
--------------------------------------------------
01  Game title                 9.5     [Save]
02  Game title                 9.2     [Save]
03  Game title                  -     [Save]
...
--------------------------------------------------
Source / publication details       Creator footer
```

On mobile, use one column, short headers, reachable controls and safe-area
clearance. Do not add a sixth crowded bottom-nav destination. Community belongs
inside Discover, with direct deep links also available from the account/menu.
Actions cannot disappear behind the keyboard or the bottom navigation.

Meaningful motion only: brief sheet transition, selection feedback, ordered-list
movement, and state changes. Honor reduced motion and Lite mode; avoid loading
shimmers that replace readable content or perpetual decorative motion.

All new forms need labels, autocomplete, password-manager support, paste,
visible focus, inline errors, and focus restoration. Do not autofocus the mobile
keyboard on page load. Long names, Unicode, large text and 200% zoom must fit.

## 10. Delete, disconnect, and recovery

Keep these distinct:

- **Sign out:** flush valid local drafts, stop account work, clear that session's
  account UI/cache exposure, and return to the untouched guest library.
- **Stop online saving:** revoke the current sync epoch and stop uploads; clearly
  state whether the existing online copy is retained.
- **Delete online copy:** unpublish as necessary, revoke stale writers, delete
  account-owned cloud content, and retain/export the local recovery copy.
- **Delete account:** reauthenticate, revoke public/private access, remove cloud
  data in bounded batches, then delete the Auth user. Partial failure remains
  visible and retryable; do not report success with user content still present.

A minimal revocation marker may be necessary to prevent old tokens/tabs from
recreating deleted data. It must contain no library content or unnecessary PII,
be documented honestly, and never be writable by a different user.

A Firebase account deletion is not proof that Firestore documents vanished.
Test both directions and interruption between them.

## 11. Free-tier and performance budget

Remain on Spark with billing disabled. No Cloud Functions, paid storage,
server-side TTL cleanup, SQL Connect trial, or paid Identity Platform features.

Current documented allowances are 1 GiB Firestore data, 50,000 reads/day,
20,000 writes/day, 20,000 deletes/day and 10 GiB outbound/month. They are quotas,
not an unlimited-production promise. Excess usage pauses cloud functionality;
the app must not enable billing or mislabel queued work as synced.

Practical controls:

- No Firebase runtime/request on a fresh guest visit to the original collection.
- Lazy account/community code; no new font family or global animation library.
- Coalesce cloud writes; listen only to the active account's small head while
  useful, not every game or every community member.
- Bounded public pages, selection/publish limits, and validated transport sizes.
- Pause nonessential listeners in hidden/offline states.
- No arbitrary image proxy, upload service, whole-catalog crawl or analytics.
- Explicit owner usage guidance, quota errors and export/manual recovery.

Measure actual guest, account and public-page payloads separately. Do not reuse
an earlier Lighthouse score as evidence for the new release. Treat emulated
device measurements as emulation, not a physical low-end-device guarantee.

## 12. Gauntlet: executable release gates

"Gauntlet" here means the following evidence-driven workflow, not an unavailable
tool mode. The user's production-review rules and current Web Interface
Guidelines apply. Implementation is authorized; discovered defects must be fixed.

| Gate | Required proof |
| --- | --- |
| A: scope and contracts | Explicit requirements/assumptions, real provider APIs, data boundaries and invariants mapped to code |
| B: storage and protocol | Legacy guest migration, atomic state/outbox, two-account separation, size/digest failures, revision conflicts and deletion epochs |
| C: access rules | Emulator direct requests for guest, unverified, A, B, creator, spoofed admin and malformed public/private payloads |
| D: authentication | Google configuration and actual flow where possible, email verification/recovery, cancellation, blocked popup, remembered session and sign-out |
| E: two-device workflows | Independent browsers, offline edits/restart, concurrent edit conflict, switching users mid-save, import/backup and quota failure |
| F: publication | Preview redaction, unique handle race, directory opt-in, atomic update/unpublish, stale reads/writers, safe copy and moderation |
| G: interface | Desktop/mobile/tablet, keyboard, 200% zoom, long text, focus/scroll/safe areas, axe plus manual interaction; avatar chooser and 32px/96px readability |
| H: regressions | Exact original data/workbook hashes, author/private score separation, manual ranks, Played, draft exit flush, imports and current 3D |
| I: release | Type/lint/build, focused and full relevant suites, staged/history secret scans, local prebuilt upload, real production checks (superseded; see release-path amendment) |
| J: re-review | Fresh read-only review of the final diff and affected lifecycles; repair real findings, rerun affected gates, record remaining limits |

Specific adversarial cases are mandatory:

- Type a valid score and immediately close/back/switch accounts.
- Finish upload N after edit N+1; N+1 must remain pending.
- Disconnect the network between chunk upload and head commit.
- Receive a newer remote head while a valid local draft is uncommitted.
- Fail a chunk, mismatch a digest, exceed size/quota, or read a future schema.
- Reuse an old signed-in tab after disconnect, unpublish or account deletion.
- Try to list/read/write another UID with direct SDK requests.
- Try to forge owner privileges, source rank, publication fields or handle claim.
- Race two handle claims and two publications from separate sessions.
- Confirm private notes/email/queue never appear in public data or link URLs.
- Import someone's game without overwriting an existing personal score/order.
- Shuffle an avatar and cancel, then save one and reopen it on a second device.
- Reject malformed avatar descriptors and prove no remote-avatar requests occur.

Do not reset a user's real browser for testing. Use isolated named profiles,
demo/emulator projects and clearly marked temporary production test identities,
then remove only those artifacts. Do not email unrelated people or disable real
verification to make a test pass. Distinguish emulator proof from real OAuth or
email-delivery proof.

### Review output

Apply the 16-phase contract to the actual implementation. Maintain a requirement
table with Complete / Partial / Missing / Contradictory / Cannot verify states,
file/line evidence, executed checks, known risks and a final verdict.
Use exact measured results, not an automatic 10/10 or an "award-winning" claim.
Hosted CI is intentionally not run under the user's quota constraint; report it
as not run, not passing. No merge approval is fabricated when no PR exists.

## 13. Execution and handoff

1. Verify Google provider/config on Spark and preserve deny-all rules until the
   replacement access contract is tested.
2. Implement scoped local persistence and transport/rule tests before wiring
   automatic account-side effects.
3. Add auth, first-connect and account UX; prove two-client saving and recovery.
4. Add sanitized public publishing, profiles, community and creator moderation.
5. Run the gauntlet, repair findings, inspect one batched desktop/mobile pass and
   a final confirmation pass, then freeze the release.
6. Commit/push the clean source with the existing attribution policy.
7. Build in the owned isolated release staging area and deploy prebuilt artifacts (superseded; see release-path amendment)
   to the existing Vercel project. Recheck provider billing and real live flows.
8. Deliver the URL, account/community/creator entry points, public-source commit,
   privacy behavior, measured evidence, honest limits, and clean helper status.

Prefer one coherent implementation owner. A bounded read-only final reviewer is
useful; overlapping source writers, repeated re-reviews without new evidence,
unbounded polish loops and speculative new services are not.

## 14. Evidence and references

- Current `PRODUCT.md`, `DESIGN.md`, `personal-types.ts`, `personal-db.ts`,
  `useLibrary.ts`, `useExitSave.ts`, `App.tsx` and existing regression contracts.
- [Firebase plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Firestore quotas](https://firebase.google.com/docs/firestore/quotas)
- [Firebase Auth limits](https://firebase.google.com/docs/auth/limits)
- [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin)
- [Redirect limitations and supported alternatives](https://firebase.google.com/docs/auth/web/redirect-best-practices)
- [Google button branding](https://developers.google.com/identity/branding-guidelines)
- [Transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Offline cache limitations](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Security Rules conditions](https://firebase.google.com/docs/firestore/security/rules-conditions)
- [Field-level data boundaries](https://firebase.google.com/docs/firestore/security/rules-fields)
- [Rules emulator testing](https://firebase.google.com/docs/firestore/security/test-rules-emulator)
- [Firebase API-key restrictions](https://firebase.google.com/docs/projects/api-keys)
- [DiceBear Critters, current options and license](https://www.dicebear.com/styles/critters/index.md)
- [DiceBear core, published version metadata](https://registry.npmjs.org/@dicebear/core/10.7.0)
- [DiceBear styles, verified published version](https://registry.npmjs.org/@dicebear/styles/10.6.0)
- [Current Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)

This plan deliberately does not promise unlimited free capacity, perpetual
availability, perfect scores, or that publication can be recalled from others.
It requires working code, preserved data, understandable choices, and evidence.
