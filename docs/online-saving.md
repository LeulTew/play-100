# Optional online saving and published rankings

This is the implementation guide for the approved
[account/community contract](online-community-plan.md). Deployment readiness is
established by the executable checks below, not by the existence of these files.

## Three independent choices

Guests use the original `play100-personal` IndexedDB database without loading
Firebase on a fresh collection visit. Opening Account or Community loads the
online tools. Signing in identifies an account but does not copy its guest
library into an account.

Online saving requires verified identity, a reviewed starting copy and explicit
creator-visibility consent. A separate publication preview selects at most 200
ranked games. Directory listing is unchecked by default. Link-only publication
is public to anyone with its URL; it is not a private sharing mechanism.

No Supabase, analytics, anonymous account creation, uploaded avatars, remote
avatar service, feeds, comments, followers, likes, or paid Firebase features are
used.

## Local ownership and durable pending work

The existing database version remains **2** and the game-library schema remains
**3**. Its `library` object store retains the original guest `state` key.
Account entries use `account:<firebase-project>:<uid>` keys in that same store.
Only the dedicated production project and the isolated `demo-play100` test
project are accepted scopes.

Each account record contains its domain state, sync metadata, cached profile
and one local recovery copy. A domain mutation and its `dirty` marker commit
together in one IndexedDB transaction. There is no crash window between saving
an edit and recording the need to upload it.

`state.revision` is a local revision. `sync.dataRevision` tracks content edits
without treating per-device visual settings as new cloud content.
`baseRemoteRevision` and `epoch` are server concurrency and consent markers.
They are not compared to another browser's local revision.

An acknowledgement records exactly the submitted data revision. If a newer edit
arrived meanwhile, its dirty marker survives. The UI cannot show **Saved online**
while its current scope has pending content or an unfinished editor draft.
First-connect and remote-adoption operations validate the reviewed local
revision inside the IndexedDB transaction. Account and preview metadata are
tagged by UID; old asynchronous completions cannot populate a different account.

Ratings and notes retain the existing debounce/blur/exit-save behavior. Identity
transitions explicitly flush valid drafts. An invalid or rejected edit is not
silently retried in a background loop.

### Device visual preferences

Motion/quality and the local revision are excluded from the cloud library
payload. A receiving device keeps its own Auto/Full/Lite setting. New account
caches inherit that browser's guest preference, not a remote desktop's Full
setting. Explicit JSON backups still include preferences for compatibility.

## Chunked snapshots and recovery

A deterministic UTF-8 representation is limited to **20 MiB**, matching the
existing import envelope. The 10,000-record domain limit is unchanged.
Oversized data is retained locally and produces an actionable error; records
and notes are never silently truncated.

Raw chunks are at most **192 KiB**. Base64 encoding stays at or below 256 KiB
before the small document metadata, well below Firestore's 1 MiB document
limit. SHA-256 digests identify content and validate the complete snapshot.
Every chunk, decoded byte count, digest, envelope version and domain invariant
must pass before a downloaded library can replace local state.

Candidate generations are registered before their chunks are written. They
progress from staging to ready before a transaction compares the expected
remote revision and consent epoch and publishes a new head. The transaction
callback does not mutate React state. A no-op upload still requires a fresh
server acknowledgement; an old local head is never proof of current authority.

Unchanged chunk content is reused. Per-generation holder references are updated
transactionally so cleanup cannot remove data in a concurrently prepared
generation. Current and previous heads are retained. Cleanup first marks an
unreferenced generation as deleting, then releases its chunks and registry
entry. It is bounded, owner-scoped and retryable. Cleanup failure is distinct
from whether the new snapshot was successfully saved.

Firestore uses memory cache. Its persistent offline queue and default
last-write-wins behavior are not used as the account outbox or conflict policy.
Private head listeners are detached while hidden/offline. Cloud work is
coalesced after local edits, rather than issued on every keystroke.

For an already-enabled account, edits automatically save after a 2.5-second
quiet period. A single scope/consent-owned queue retries transient transport
failures with jittered exponential backoff (2 seconds to 1 minute). Quota
failures use a 1-minute to 30-minute cooldown that extra edits, focus events and
manual checks cannot bypass. Successful reconciliation resets backoff. Idle,
clean libraries are not polled. Online, visible, focus and page-return signals
coalesce recovery, including reattaching failed head/profile listeners.

Conflicts, revoked consent, manual stop, unverified identity, invalid snapshots
and permission errors do not become automatic overwrite attempts. Signing out,
stopping or changing account/consent lifetime cancels retry work and rejects old
results. A closed browser cannot sync, and free quotas can still delay saving.
First-time consent, manual stop and conflict choices remain explicit. The newer
continuity flow can restore a verified owner's complete, active, previously
consented cloud copy into an atomically unchanged empty/clean initial account
cache. It does not infer consent from a profile or checkbox, upload a guest copy,
overwrite pending/recovery data or restart an intentionally stopped connection.
Public sharing still requires its own choice. New eligible verified account
setups default to All sharing with accepted friends; existing off/custom
friend-sharing choices are retained until one inline All action.

The Firebase app/project and library namespaces remain stable across deploys.
SDK IndexedDB persistence has a supported localStorage fallback. An owned
IndexedDB loading marker lets a retained account be discovered when localStorage
is unavailable; no Firebase private storage format is inspected. Marker durability
is not represented as proof of authentication durability.

For [friends sharing](friendships-data-contract.md), an account-scoped removal
journal is updated in the same device transaction as ranked-game removals.
Rapid removal/re-addition cannot automatically reselect a formerly shared game.
Writes from older tabs that skip the journal require refreshing and reviewing
only the optional sharing selection; they do not disable private saving.

The independent [Shared games shelf](friend-shelf-contract.md) uses a second
account-scoped journal keyed `friends-shelf-selection:v1:<scope>`. Every advancing
saved-library revision records removed **record** IDs atomically, including
backup replacement and remote adoption. Removing only a ranking is not a shelf
removal. Metadata-only upload acknowledgements do not advance this journal.
Corrupt or older-writer journal state requires a shelf review without preventing
private saving. Account-cache deletion removes both optional journals.

Shelf consent binds to the private saving epoch. Only an explicit preview can
bind a new epoch; retries and automatic selection shrink cannot silently do so.
An ordinary pause may leave the last shelf visible, but old-client online-copy
deletion and later re-enable do not revive it. Shelf config changes atomically
update the head revision so an already-open friend's head listener is revoked.
The viewer also watches the actual relationship target for removal/block events;
it does not assume every dependent-rule change produces a head notification.

Account exports include only the owner's shelf/configuration. Reversible
online-copy deletion stops/clears shelf selection and cleans its generations,
without the permanent social-deletion tombstone. Full deletion reserves legacy
social and new shelf deletion first, completes both bounded cleanup paths, then
deletes Auth. Known-ACK failures retain their receipt and recover by read/cleanup,
never by blindly replaying the original publication.

## Conflicts

A clean client can adopt a fully validated newer snapshot. A dirty client, or
one with an uncommitted editor, keeps its current state and presents **Needs a
choice**. The user can download both copies, adopt the reviewed online copy
with local recovery retained, or explicitly replace the reviewed online copy.

Confirmation is bound to the displayed remote revision/epoch and local revision.
A newer intervening save requires another review, not silent last-write-wins.
Stopping sync increments the consent epoch. Deletion additionally removes head
references and marks the scope deleted, blocking old tabs from recreating data.

## Identity, profiles and permissions

Firebase provides same-tab Google authentication and verified email/password
authentication. Only basic Google identity scopes are requested. Email reset
and verification use Firebase's built-in service, with enumeration protection
and client resend cooldowns. No custom password handling or credential storage,
magic-link primary flow, SMS
or Identity Platform upgrade is introduced.

### Same-tab Google continuation

Google sign-in, account linking and Google reauthentication use Firebase's public
redirect APIs. A cold popup resolver can spend the browser's activation budget
loading GAPI before calling `window.open`; a synchronous click handler does not
prevent that failure. No popup is required by the new flow, including after a
slow network start. Browser privacy protections remain enabled.

The deployment implements [Firebase redirect option 3](https://firebase.google.com/docs/auth/web/redirect-best-practices#proxy-requests).
Seven fixed `/__/auth/` helper paths are transparently reverse-proxied by Vercel
to the dedicated project's `firebaseapp.com` origin, preserving GET/POST bodies
and query strings. They are not 302 redirects or an arbitrary-host proxy.
The browser `authDomain` is **`play-100-collection.vercel.app`**, so the helper
iframe and the app use first-party storage on the same origin. The Google OAuth
client must authorize `https://play-100-collection.vercel.app/__/auth/handler`
and the `https://play-100-collection.vercel.app` JavaScript origin. Keep the
previous Firebase callback valid for already-open older clients.

Only the helper routes allow same-origin framing and the upstream helper's
initialization-script nonce. The application retains `frame-ancestors 'none'`
and its existing script policy. Helper responses are private/no-store at both
browser and CDN layers; never cache OAuth callbacks. Verify real helper GET and
POST responses, framing, CSP and provider handoff on the built deployment.

Firebase owns OAuth state/CSRF verification and credential persistence. The
app keeps only a bounded, 15-minute, tab-scoped UI intent: action, random request
identifier, expected UID for linking/reauthentication, approved relative return
route, timestamp and deletion target/consent epoch when needed. It stores no
password, provider token, email or library contents there. Unknown fields,
expired intents and unapproved routes are rejected. Redirect results must match
the SDK operation, Google provider, expected UID and current signed-in UID.

Pending drafts flush before leaving. Account listeners and scoped editing wait
for redirect reconciliation. A browser-Back/bfcache return reinitializes the SDK
instead of retaining an indefinitely busy request. Cancellation is explicit and
non-destructive; unavailable temporary storage offers email/device use, never
instructions to weaken browser privacy.

Google reauthentication only restores an explicit deletion confirmation. It
never deletes on return. A short-lived in-memory approval is tied to the exact
UID, action, auth session and consent epoch, and requires a recent signed
`auth_time`. Refreshing or cancelling discards that approval; no persisted intent
alone can authorize deletion.

UI authorization comes from the signed `email_verified` claim. A cached user
profile saying verified while its token says otherwise triggers a bounded,
coalesced token refresh. It does not remove the verification controls or weaken
server rules.

Firestore rules deny access by default. Private chunks/heads are scoped to the
matching verified UID. Account profiles contain only chosen name, versioned
avatar descriptor, timestamps and bounded counts. Public entries are explicit
allowlists; they cannot carry notes, email, queue, play history, internal
revision fields or a forged author-rank field.

The protected `_owner/config` document is provisioned administratively with the
verified project owner's identity. It is never readable or writable by app
clients. Creator authority is evaluated by Security Rules, not a client flag or
the first signup. The creator UI reads a separately projected ranking summary
without private notes or queues. A project database operator can technically
access stored data; the privacy copy does not promise otherwise.

The Firebase browser key is public routing configuration, not an authorization
secret. Its API restrictions are limited to Identity Toolkit, Secure Token,
Firestore and Firebase Installations, with approved production/helper origins.
Google refresh tokens, administrative credentials and Vercel credentials never
belong in source, browser bundles or public configuration.

## Public snapshots, moderation and avatars

Publishing freezes the exact previewed name, handle, avatar and projected
entries. Later private edits do not alter that payload. One ranking belongs to
each profile; updating it is another explicit action.

Entries are uploaded in validated batches of at most eight. The generation's
uploaded counter advances only when the corresponding immutable entry
documents exist in the same atomic batch. The public head cannot point to an
incomplete generation. Handle claims and publication epochs commit together.
Canonical games are checked against trusted source metadata and rehydrated from
the original collection when imported by a reader. Another person's scores,
notes, played flags and manual slots are never copied into the reader's state.

Community loads 20 explicitly listed, published and non-hidden profiles at a
time. Prefix search is described as handle-prefix search, not full-text search.
The creator can review bounded, deduplicated reports and hide or restore
publishing permission. Moderation markers survive publication recreation;
restoring permission does not republish content automatically.

Creature avatars use pinned DiceBear core **10.7.0** and the single Critters
definition from styles **10.6.0**. The descriptor is version 1, a random
32-character lowercase hexadecimal seed, and one of five palette names.
Seeds are not derived from UID or email. SVG is generated locally and rendered
as an image; arbitrary SVG, HTML and URLs are not accepted descriptors.
The header uses the same current account creature and chosen name as Account,
with a UID-validated device cache while the profile loads. Rendering stays in
the lazy online bundle; fresh guest browsing does not load DiceBear or Firebase.
The header clears on sign-out/identity changes and follows committed profile
updates without importing a Google photo or overwriting another profile field.
The six-choice picker is a draft until Save. Its completion is bound to the
submitted identity session, not whichever account happens to be visible later.

## Sign-out and deletion

Sign-out stops account activity and returns to the untouched guest library.
Stopping online saving retains the existing online copy and local account
cache. Deleting the online copy unpublishes it, revokes old writers and removes
owned content while retaining the local recovery copy. Account deletion
reauthenticates, finishes cloud cleanup and then deletes the Firebase Auth user.
Failures remain visible and retryable.

Fresh unverified registrations can be cancelled without granting unverified
cloud-data access. A content-free UID lifecycle marker serializes cancellation
against the first verified cloud activity. An account with existing activity
cannot be treated as an unused typo registration.

Minimal content-free revocation/lifecycle markers may remain after deletion to
prevent old tokens or tabs from recreating deleted content. They contain no
library, email, display name or avatar.

## Free-tier operations and checks

The dedicated project is `play100-online-48823b32`, with the Standard default
Firestore database in `europe-west1`. Billing must remain disabled with no
linked billing account. Spark quotas are finite; quota exhaustion pauses online
work rather than enabling billing. No Cloud Functions, TTL cleanup, paid
storage, server database trial or automatic Vercel Git build is used.

Local checks:

```powershell
npm test
npm run lint
npm run build
npm run validate:data
npm run test:cloud
```

`test:cloud` starts actual Auth/Firestore emulators for `demo-play100` on
localhost-only ports. A supported Java runtime is required. For browser cloud
tests, build with `VITE_USE_FIREBASE_EMULATORS=true` and `--mode cloud-test`,
start those emulators and the preview on 4187, then run:

```powershell
node scripts\seed-cloud-emulators.mjs
npx playwright test --config playwright.cloud.config.ts
```

The seed script targets only the literal localhost demo endpoints; it never
creates production users or public sample content. Emulator tests are not proof
of a user's real Google credentials, MFA or email delivery. Production checks
must separately verify provider configuration, narrow CSP, rules, current
billing, a real managed-account data roundtrip, and the exact workbook hashes.

Deploy committed source through an isolated WSL staging copy, `vercel build
--prod --standalone`, and `vercel deploy --prebuilt --prod`. Never deploy a
`cloud-test` build to production. The normal site uses four primitive public
configuration values, avoiding JSON/newline quoting across environment tools:
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID`.
Production releases set `VITE_FIREBASE_REQUIRED=true`, so a missing or malformed
configuration fails the build before publication. The runtime also preserves
guest browsing with an explicit warning if optional online config is invalid.
No administrative credential is needed in Vercel.
