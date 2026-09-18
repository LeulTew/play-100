# Selected shared games shelf

This describes the preserved v1 **selected** mode. The newer
[automatic-All mode](friendships-data-contract.md#versioned-all-mode-approved-implementation-contract)
has separate v2 policy/transport, includes future account additions without
selection, and does not use this removal-review journal.

This is an independent, explicitly selected **saved-library** projection for
accepted friends. It does not add games to a ranking or change existing ranking
sharing, public snapshots, manager groups, creator access or private version 3.
Adding a game never selects it in v1. A successfully confirmed missing v1 shelf
configuration means **off** for that selected mode; an unknown/failed read never
establishes off or eligibility for a new All default.

## Exact data and store API

`FriendShelfEntry` has exactly six fields:

```ts
interface FriendShelfEntry {
  id: string;
  title: string;
  year: number | null;
  source: 'collection' | 'wikidata' | 'steam' | 'freetogame' | 'manual';
  sourceId: string;
  sourceUrl: string | null;
}
interface FriendShelfConfig {
  format: 1;
  enabled: boolean;
  deleted: boolean;
  consentSyncEpoch: number | null;
  selectedIds: string[];
  epoch: number;
  revision: number;
  updatedAt: number;
}
```

No position, score (not even null), notes, email, progress, queue, arbitrary image
URLs, SVG, studio or genre is transported. The maximum is 200 saved identities.
Canonical title/year facts are checked against `catalog/author` by rules; public
catalog artwork is resolved separately by the main application. API source IDs
and links are allowlisted; source URLs are at most 2,048 characters.

`projectFriendShelf(state, selectedIds, games, removed?)` uses only saved
`state.records`, never `state.ranking`. It preserves the explicit selection order
(not ranking order) and returns `{ entries, selectedIds }`, pruning missing or
journal-suppressed records. `recordFromFriendShelf(entry, games)` produces only
safe `LibraryRecord` metadata for Save/Pin. It creates no personal state.

`new FriendShelfStore(db)` in `src/cloud/friend-shelf-store.ts`:

```ts
initialize(uid): Promise<FriendShelfConfig> // creates off, never opts in
config(uid): Promise<FriendShelfConfig | null>
watchConfig(uid, next, error): () => void
saveConfig(uid, { enabled, selectedIds, consentSyncEpoch }, expected, isCurrent?): Promise<FriendShelfConfig>
head(uid): Promise<FriendShelfHead | null>
watchHead(uid, next, error): () => void
shelf(uid): Promise<{ head: FriendShelfHead; entries: FriendShelfEntry[] }>
publish(uid, entries, expectedConfig, source, expectedHeadRevision, isCurrent):
  Promise<{ changed: boolean; head: FriendShelfHead }>
prune(uid): Promise<number>
cleanupSharing(uid): Promise<number>
revokeForDeletion(uid): Promise<void>
cleanupDeleted(uid): Promise<{ deleted: number; done: boolean }>
exportOwn(uid): Promise<{ format: 1; config: FriendShelfConfig | null; shelf: FriendShelf | null }>
```

The head/generation/registry parsers, manifests, source revision type and retention
helper reuse the existing strict friendship primitives. The shelf has separate
collections, configuration, chunk parser and mutation receipts. No legacy strict
parser is made permissive. All returned timestamps are confirmed server metadata.
`exportOwn` returns only the owner's current consent-matching shelf/configuration,
not retained or partially staged generations, friend identities, invitations or
other people's games. Read failures reject; they are not successful empty exports.

## Epoch consent and publication

Only an explicit saved-selection preview may bind `consentSyncEpoch` to the clean
account copy's current `sync.epoch`. Off/deleted configurations use null. The
source passed to publication is exactly
`{ syncEpoch: local.sync.epoch, remoteRevision: local.sync.baseRemoteRevision }`
from that same clean, saved scoped library. Do not pair a fresh remote head with
stale local records. Each stage, chunk and atomic head publication verifies
enabled/nondeleted private source CAS and current shelf settings/consent.

An ordinary private-saving pause does not hide a previously shared shelf. A
restart changes the private epoch and requires a new explicit shelf preview,
even if the previous selected IDs are unchanged. This conservative boundary
prevents a legacy tab's Delete online copy followed by re-enable from silently
resurrecting an old shelf. Old clients cannot update the new shelf configuration:
rules also deny reads when `syncHeads.deleted`, `friendSettings.deleted` or either
account lifecycle is cancelled. An old full-account tombstone is sufficient to
deny publication, even if a private head is later re-enabled.

Automatic selection shrink keeps the existing `consentSyncEpoch`; it must never
adopt a new one. `FriendShelfConsentError` is an explicit review-required outcome.
Ordinary `conflict` errors remain transient, not permanent scheduler blocks.

Every configuration change also pulses an existing head's `revision` and
`updatedAt` in the same transaction, leaving both manifests/source untouched.
Rules require the pulse and prove the simultaneous control revision increment.
This makes Stop/selection changes update the actual listener target: dependency
changes alone need not produce an immediate head-listener error. Blocking instead
updates the canonical pair target, which the read hook explicitly watches.
Always read the current head revision after saving config; do not predict it from
the last publication. The optional `saveConfig` guard is used by the hook for
explicit selection, automatic shrink and Stop transactions, including retries.

## Main-owned orchestration and atomic journal

Mount once under the current account controller:

```ts
useFriendShelf(uid, scope, snapshot, verified, games, visibleTools, authGeneration, journal)
```

It returns `{ store, config, ready, status, error, acceptConfig, saveSelection,
stopSharing, stop, retry }`. `acceptConfig(next, explicitThroughRevision?)` is
asynchronous; await it where durable local acknowledgement is required.
`saveSelection(ids, expectedConfig, reviewedStateRevision)` captures the clean
current saving epoch, rejects changed or dirty state, saves explicit consent and
acknowledges only that reviewed local revision. `stop()` cancels the running
generation synchronously. Main must call it before logout, owner/project changes,
online-copy deletion or full-account deletion, not only after a render.

The injected stable `FriendShelfJournal` interface is:

```ts
update(scope, settingsRevision, selectedIds, explicitThroughRevision?, initialStateRevision?): Promise<void>
pending(scope, currentStateRevision): Promise<ReadonlySet<string>>
```

Main owns `personal-db.ts`, `scoped-library.ts` and the adapter
`friend-shelf-selection-cache.ts`. The independent key is
`friends-shelf-selection:v1:${scope}`. Never reuse `friends-selection:v1:${scope}`.
The new pure reducer exports in `friend-shelf-selection.ts` are:

- `rememberShelfSelection(value, settingsRevision, ids, initialStateRevision, explicitThroughRevision?)`
- `applyShelfRemovals(value, removedIds, previousStateRevision, nextStateRevision)`
- `pendingShelfRemovals(value, currentStateRevision)`
- `parseShelfSelectionCache(value)` and `friendShelfSelectionKey(scope)`

In the **same IndexedDB transaction** as every advancing private state revision,
compute the old/new saved-record key difference and run `applyShelfRemovals`,
including empty differences. Ranking removal alone does not remove a shelf game.
Metadata-only private ACKs do not advance the state and must not call this reducer.
Apply the same rule to backups, adoption, replacement/reset and removal, not just
the ordinary action reducer. Delete both independent journal keys with a scoped
cache deletion.

Removed IDs stay suppressed across immediate re-add and stale settings ACKs.
If a removal happens before the first shelf configuration/journal arrives, its
transaction stores a conservative review marker with the removal revision.
Later configuration loading and private-save acknowledgement cannot erase it;
only an explicit review through that revision can establish selection again.
An older writer's observed-revision gap remains blocked across newer writes.
Only an explicit review through the removal revision clears it. Malformed or
missing journals block optional sharing. Main's atomic callback must catch
malformed optional data, log its standard explicit notice and write a blocked
marker without rejecting the private library save. An actual IndexedDB
transaction failure still rolls back library and journal together. A stale ACK
must never clear a newer removal, selection or scope.

The scheduler reuses `SyncWorkQueue`: coalesced work, jittered transient retry,
quota cooldown, no idle polling/friend fanout. It checks exact current UID, Firebase
app/project, scope, auth generation, saving epoch, clean source and selection at
asynchronous boundaries. Pending field editors/private saves wait independently.
Its error/status is optional-sharing status, not a failure of private saving.
Before the first configuration is confirmed, status remains Checking or Error,
never Off. Off requires a confirmed missing/disabled configuration.
The initial config read explicitly depends on the primitive matching-cache-ready
state, so a verified account arriving before IndexedDB hydration does not remain
stuck checking. Ordinary private edits do not rebind that bootstrap subscription.

## ACK versus recovery

`FriendShelfCommittedError` has `code: 'committed-refresh-failed'`,
`committed: true`, `receipt: { operation, uid, epoch?, revision?, generation? }`,
`phase: 'refresh' | 'cleanup'` and the original `cause`.
Operations are `initialize-shelf`, `save-shelf-config`, `publish-shelf`.
Only a resolved SDK commit can produce this error. Rejected/uncertain commits
never fabricate a receipt or a timestamp.

Post-ACK readback is a separate read-only transaction with at most three attempts.
Recover metadata through `config`/`head`; a publication receipt also requires
`prune`, not another publication. Both refresh and cleanup failure phases retain
cleanup work. `prune` always preserves the latest current/previous head IDs even
after consent changes. `cleanupSharing` is the separate deliberate stop/delete
cleanup. A failed Stop remains paused locally; read-only refresh either confirms
it and resumes cleanup, or reports that sharing is still on and requires another
explicit Stop. It does not quietly resume the old scheduler.

## Main-owned component wiring

`FriendShelfEditor` props:
`{ state, games, config, identity: { displayName, avatar }, connected, status,
error, onPrepare, onSave, onStop, onRetry, renderArtwork? }`.

`onPrepare` deliberately prepares the existing friend identity and calls
`shelf.store.initialize(uid)`, returning its configuration. Bind `onSave`,
`onStop`, `onRetry` to the corresponding hook methods. Mount the editor keyed by
the full account scope/auth generation to discard account-bound drafts. The
editor lists saved games (including unranked ones), previews exact names/count,
then requires **Share these games**. Neither initialization nor rendering opts in.
Stop remains available while private saving is paused.

`useFriendShelfRead(store, friendStore, uid, peer, authGeneration, active = true,
accessRevision = 0)` returns `{ entries, status, error, retry }`.
Main passes `active=false` when the surface is not active, and increments
`accessRevision` for row/block-scope invalidation. The hook manages only pair/head
watches, clears in-flight/displayed entries on revocation and discards stale
responses. It does not clear separately authorized existing friend identity.

`FriendShelfCards` props:
`{ entries, status: 'loading' | 'ready' | 'unavailable', error?, onSave, onPin,
onOpen?, savedIds?, renderArtwork? }`.
The callbacks receive a `FriendShelfEntry`; main calls `recordFromFriendShelf`
before metadata-only Save/Pin/open. Key by owner/viewer scope. Existing ranking
cards, comparison inputs and independent ranked order remain unchanged.
Transient shelf previews also carry a typed owner/viewer/auth-generation grant.
App subscribes to that grant and closes an unsaved, unpinned preview when the
source shelf is stopped or the relationship is revoked. A disappearing dialog
cannot flush an unauthorized draft into the library. Independently saved games
and unrelated public previews retain their own authority.

`renderArtwork(entry)` resolves only the main public catalog/local assets, with
known dimensions/lazy raster loading. No artwork URL is read from cloud shelf
metadata. Scoped CSS preserves existing chalk/ink controls and typography.
The design detector's 14/16/20px flags are incumbent UI values present in
`friends-ui.css`, `cloud-ui.css` and `personal.css`, not new typography systems;
the 28px mobile heading is a local reduced 32px heading, not a global redesign.
No detector waivers or unrelated design files are changed.

## Deletion recipes

**Ordinary online-copy deletion:** synchronously stop the shelf scheduler; if a
nondeleted config exists, save
`{ enabled: false, selectedIds: [], consentSyncEpoch: null }` with its exact
revision; await its ACK or recover read-only; run `cleanupSharing`. Continue the
existing private/public cleanup. Preserve relationships, identities, groups and
the shelf configuration. Later explicit preview can share again. Do not call
`revokeForDeletion`/`cleanupDeleted` for this reversible operation.

**Full account deletion:** first reserve the existing irreversible legacy social
tombstone (`FriendStore.revokeForDeletion`) so old clients cannot publish. Before
Auth deletion, also call `FriendShelfStore.revokeForDeletion` (works after the
legacy marker), then `cleanupDeleted` until it resolves with `done: true`.
It removes at most three registered generations, up to 100 chunks each, plus head
and empty registry. Keep the minimal irreversible shelf config tombstone.
Interrupted operations are resumable/idempotent; any rejection retains Auth for
retry. Then complete the existing public/private/social cleanup and finally
delete Auth. Never delete Auth first and strand owner-authorized cleanup.

## Rules, indexes and evidence

New paths are `friendShelfSettings/{uid}`, `friendShelfHeads/{uid}`,
`friendShelfRegistry/{uid}`, and
`friendShelves/{uid}/generations/{uuid}/chunks/{0..99}`. The index change exempts
only the new configuration's selection field. Existing `chunks.entries`
exemption is reused; the ascending `index` query uses its ordinary single-field
index. No composite index, Function, paid TTL or provider change is added.

Each immutable chunk has exactly `{ index, entries, ids }`, at most **two**
individually validated entries. Progress grows only with the corresponding
atomic chunk, checks uniqueness and reaches the exact selected count. The registry
holds at most three generations; staging has a five-minute abandoned-upload
grace. A single atomic head switches visibility; only its current generation is
friend-readable. One bounded ordered query loads at most 100 chunks, then a second
head check and digest verify the result.

The maximum unique friend-read authorization documents are ten: pair, two account
lifecycles, two legacy friend settings, two block documents, shelf settings, shelf
head and private head. Staging/chunk/head writes remain under ten access calls per
operation and twenty per atomic operation: a chunk/progress pair shares config,
source, generation and lifecycle reads; canonical entries reuse one author
catalog document. This design intentionally does not add another read grant.
The shelf-specific accepted-pair predicate uses GET-only friend settings, rather
than mixing `exists` and `get` for those same documents; the first actual SDK run
exposed that redundant legacy checks exceeded the read budget. The existing
legacy predicate is unchanged.

Local focused validation covers 23 DTO/projection/journal, SSR UI, offline guard,
retry classification/cooldown, cancellation primitive and delayed-cache bootstrap
cases, plus TypeScript and scoped ESLint. The bootstrap cases run the actual hook
through a dependency-driven effect harness; they do not claim real browser
hydration coverage. These checks are not browser or live-account approval.
`tests-cloud/friend-shelf.test.ts` supplies raw SDK denials, every full-200 source
branch at maximum IDs/titles/URL bounds, real public-100 plus 100 additions,
bounded queries/cleanup, legacy deletion/re-enable, current-generation revocation,
ACK/readback, lifecycle and listener cases.

**Measured SDK result, 2026-09-17:** the sole integrator ran
`vitest run --config vitest.cloud.config.ts tests-cloud/friend-shelf.test.ts`
against its fresh, owned local Auth/Firestore emulator group. **28/28 cases
passed in 27.67 seconds**, including all five maximum-200 source branches,
100-chunk reads, atomic Stop pulses, pair revocation, old-client copy deletion
and re-enable consent, ACK recovery and bounded cleanup. Tested backend commit:
`f98677e2b5b608fa6ba89f6363343b24ca5cc9e2`. Exact `firestore.rules` SHA-256:
`CEF64B284486093420D9DEDD86327109DF17A8A0A556245056AD747B9302C65E`.
The worker read the integrator's `overnight-shelf-sdk-final.log` and independently
matched this hash. This demonstrates the tested read/access and expression
budgets with the actual SDK, not source inspection or mocked authorization.

The earlier dependency-only head-listener test exposed a provider timing
assumption; it was replaced with actual pair-target revocation plus fresh-read
denial, and a separate target-pulse Stop test. A timed-out prior listener also
caused emulator `clearFirestore` infrastructure failure before any test case;
the integrator restarted only its owned group rather than changing policy to
mask that failure. The final receipt above is from the fresh successful run.

Main must additionally execute the real atomic IDB adapter cases (rollback,
backup/adoption, stale tabs, ACKs, remove/re-add, account isolation and deletion),
then the integrated browser journeys: explicit preview/opt-in, private Add not
shared, saved unranked cards, metadata-only Save/Pin, both account scopes, live
blocked/removed/disabled invalidation and separate identity retention, offline and
quota UI, pending field edits, pause/restart consent and deletion/export. Main
owns one batched desktop/mobile accessibility/visual pass. This worker starts no
emulator/browser/server and creates no production fixtures or deployment.
