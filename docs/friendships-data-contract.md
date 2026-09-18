# Bounded friendship data contract

This is a separate Firestore data layer, not permission to turn sharing on.
Existing members, private snapshots, public publishing and creator access are
unchanged. The UI/scheduler/account-lifecycle integration belongs to the main
application. Do not treat a relationship-list row as authorization to load data.

## Client API

`new FriendStore(db: Firestore)` from `src/cloud/friend-store.ts`. Exported value
types and strict parsers live in `src/lib/friend-types.ts`. All timestamps returned
by the store are server-acknowledged milliseconds, never optimistic client times.
`FriendCursor` is an opaque SDK document cursor. Pages always contain at most 20
items and return `{ items, cursor }`; `cursor` is `undefined` on the final page.
Errors reject, including unavailable/forbidden/offline data; never convert them
to an empty successful ranking. Every watch returns `() => void`.

**Mutation acknowledgement is distinct from metadata refresh.** Successful
return shapes below are unchanged. If a transaction is acknowledged but its
subsequent readback (or post-publication cleanup) fails, the store throws
`FriendCommittedError`, not a generic operation failure. It has
`code: 'committed-refresh-failed'`, `committed: true`, `phase: 'refresh' | 'cleanup'`,
the original `cause`, and a `receipt` identifying the operation, owner and known
pair epoch / group ID / generation revision where applicable. It contains no
invented timestamps or invitation capability. Do not log raw errors/causes from
capability operations; SDK details can contain sensitive paths.

Callers must handle this class before ordinary errors: show **Saved; refresh
needed**, reload metadata without replaying the mutation, and clear stale
displayed data. An `accept-invite` receipt proves consumption was acknowledged,
so clear the resume secret and show the accepted outcome. For `create-invite`,
reload the bounded owner registry rather than issuing a replacement invite.
For settings or publication, read current settings/head before scheduling any
new write. A group receipt supplies `groupId` for recovery. Do not clear unrelated
newer local edits or a newly changed account scope in response to an old receipt.
The receipt is not authorization to read another person's scores.

Ordinary transaction rejection remains unqualified: the store does not invent
an acknowledgement when the SDK did not receive one. Network loss during a commit
can have an uncertain outcome; reconcile server state before manually retrying.
Void-returning graph helpers have no post-commit reads and resolve only on ACK.

Post-ACK document refreshes use a separate **read-only transaction**, bounded to
three SDK attempts. Its `tx.get` reads directly through the Datastore RPC path,
not the RemoteStore listener cache that may still report a previously missing
document. It writes nothing and returns only strictly parsed server metadata.
If this read fails, the same `FriendCommittedError` contract applies; the original
mutation is not replayed. This applies to settings initialization/update,
identity, request/response/invite metadata, groups and the publication head.
Public reads/listeners and `graphReady` retain their server-stream preflight,
so an explicitly disabled SDK network still blocks graph changes before writes.

```ts
initialize(uid: string): Promise<FriendSettings>
settings(uid: string): Promise<FriendSettings | null>
saveSettings(uid: string, input: { enabled: boolean; selectedIds: string[] },
  expected: FriendSettings): Promise<FriendSettings>
identity(uid: string): Promise<FriendIdentity | null>
saveIdentity(uid: string, input: { displayName: string; avatar: AvatarValue },
  expectedRevision: number): Promise<FriendIdentity> // 0 means create
pair(uid: string, otherUid: string): Promise<FriendPair | null>
sendRequest(uid: string, otherUid: string): Promise<FriendPair>
respond(uid: string, otherUid: string, action: 'accept' | 'decline' | 'cancel' | 'remove',
  expectedEpoch: number): Promise<FriendPair>
listRelations(uid: string, state?: FriendPairState, cursor?: FriendCursor): Promise<FriendPage<FriendPair>>
block(uid: string, otherUid: string): Promise<void>
unblock(uid: string, otherUid: string): Promise<void>
listBlocks(uid: string, cursor?: FriendCursor): Promise<FriendPage<FriendBlock>>
createInvite(uid: string): Promise<FriendInvitation>
previewInvite(token: string): Promise<FriendInvitePreview>
listInvites(uid: string, cursor?: FriendCursor): Promise<FriendPage<FriendInvitation>>
revokeInvite(uid: string, token: string): Promise<void>
acceptInvite(uid: string, token: string): Promise<FriendPair>
shareHead(ownerUid: string): Promise<FriendShareHead | null>
ranking(ownerUid: string): Promise<FriendRanking>
publishRanking(uid: string, entries: PublicEntry[], expected: FriendSettings,
  source: FriendSourceRevision, expectedHeadRevision: number,
  isCurrent?: () => boolean): Promise<{ changed: boolean; head: FriendShareHead }>
getGroup(uid: string, id: string): Promise<FriendGroup | null>
listGroups(uid: string, cursor?: FriendCursor): Promise<FriendPage<FriendGroup>>
saveGroup(uid: string, input: { id?: string; name: string; participantUids: string[] },
  expectedRevision: number): Promise<FriendGroup> // 0 means create
deleteGroup(uid: string, id: string, expectedRevision: number): Promise<void>
watchIdentity(uid: string, next: (value: FriendIdentity | null) => void, error: (cause: Error) => void): () => void
watchSettings(uid: string, next: (value: FriendSettings | null) => void, error: (cause: Error) => void): () => void
watchPair(uid: string, otherUid: string, next: (value: FriendPair | null) => void, error: (cause: Error) => void): () => void
watchShareHead(uid: string, next: (value: FriendShareHead | null) => void, error: (cause: Error) => void): () => void
watchRelations(uid: string, state: FriendPairState, next: (page: FriendPage<FriendPair>) => void, error: (cause: Error) => void): () => void
exportPage(uid: string, cursors?: { relations?: FriendCursor; groups?: FriendCursor; blocks?: FriendCursor }): Promise<FriendExportPage>
revokeForDeletion(uid: string): Promise<void>
cleanupSharing(uid: string): Promise<number>
pruneSharing(uid: string): Promise<number>
cleanupDeleted(uid: string): Promise<FriendCleanupResult>
```

`projectFriendRanking(state, selectedIds, games)` reuses the public projection,
supports an empty result and returns `{ entries, selectedIds }`, pruning removed
ranked games. Save that pruned selection with its expected settings revision
before publishing. Selection order remains stable when the personal ranking
reorders; the projection follows the actual ranking order. A later re-added game
is not automatically selected.

For first group creation, allocate and retain the intended UUID before calling
`saveGroup(uid, { id, name, participantUids }, 0)`. A supplied ID is supported for
creation; it does not imply update-only. If the SDK returns no commit ACK, keep
that same ID and reconcile with `getGroup(uid, id)` before any retry. A matching
server group confirms persistence using real server metadata. A conflicting
existing group must be shown for review, never overwritten by retrying revision
zero. If the lookup also fails, block Save until read-only recovery succeeds.
Only retry creation at the retained ID after a confirmed absent result. Never
allocate another UUID simply because the original response was lost.
As a further idempotency guard, `saveGroup` with an explicit ID and revision zero
returns an existing group without writing when its normalized name and ordered
participant IDs exactly match the requested payload. It returns that server
group's real revision/timestamps, not a newly synthesized acknowledgement.

## Integration order

### Versioned All mode: approved implementation contract

The automatic account-sharing extension is a separate v2 policy and transport,
not a larger selection string or a reinterpretation of existing documents.
`src/lib/friend-all.ts` owns default eligibility, policy bindings, the complete
10,000-record safe projections and incremental change planning. Legacy APIs and
formats below retain their current bounds and selected-mode semantics.

- Bootstrap must confirm the current verified account/cache and authoritative
  private-saving controls. Only absent policy **and both absent legacy controls**
  qualify for default All. Unknown reads never mean Off or consent.
- A v2 policy records default versus explicit origin, its epoch/revision, the
  private-saving epoch and both legacy control epoch/revision bindings. A changed
  legacy control invalidates All; it does not silently erase that legacy choice.
  Deleted/revoked scopes cannot be bootstrapped again. Saving restart needs an
  explicit new All action rather than automatic re-enablement.
- Existing users get one **Share all with friends** action on the working
  Friends/My games/Account surfaces. It changes both scopes coherently; no
  settings drill-down or per-game selection is required. New eligible defaults
  get a concise audience disclosure and a visible Stop.
- Saved-game projection permits only ID/title/year/source metadata. Ranking
  projection additionally permits position and nullable 0-10 score. No note,
  email, queue, played/completed value, imported studio/genre or private avatar
  data is transported with a game.
- The new store must use separate metadata/ranking permission paths, bounded
  documents, cursor pages of at most25 and exact-game lookup sets of at most6.
  Stable record identities and changed-record plans avoid a complete rewrite on
  an ordinary score edit. Source/consent CAS, verified progress and known-ACK
  recovery are required before reporting a complete publication.
- All10,000 supported records must remain reachable; more than200 is not a
  truncation point. The concrete atomic write group is gated by actual Standard
  Firestore SDK/rules expression/access-call proof. Initial upload and free-tier
  quotas remain explicit, resumable limits rather than false Saved states.
- Paged comparison tracks loaded coverage separately from membership. An
  unfetched record is not absent or unrated; full-cohort summary metrics remain
  unknown until complete, or are explicitly restricted to an exact game scope.
  No eager six-library fan-out is allowed merely to open Compare.

#### Concrete v2 transport and compatibility

`friendAllPolicies/{uid}` is owner-only and binds both unchanged v1 control
revisions plus private-saving consent. The `friendAllHeads/{uid}/views/{kind}`
documents carry a ready/updating state, count, digest and source revision, not a
selection array. Private `friendAllJobs/{uid}/views/{kind}` records store progress,
the target count, total changes (at most20,000), and only the last one or two IDs.
`friendAllGames/{uid}/entries/{id}` and `friendAllRankings/{uid}/entries/{id}`
hold strictly validated single-game metadata or metadata plus position/score.
Every create and update has ownership, required/exclusive fields, source,
length/type and mutation-progress guards.

Each atomic group writes at most two records and one job. Membership counts are
verified against the before/after rows; a ready head requires confirmed complete
progress. Removed rows are content-free tombstones and are pruned in bounded
owner batches. An interrupted job resumes from its server-confirmed inventory,
including a lost response after an actual commit. An ordinary warm score edit
uses one row mutation group rather than rewriting the inventory.

A cold unchanged publication first verifies head/source/digest, the policy and
both v1 bindings in a read-only transaction: **zero inventory queries and zero
writes**. A cold changed or interrupted publication needs cursor inventory reads
of at most100 rows per request; that cost is not disguised as a constant read.
Friend pages are at most25 rows; exact lookups check at most6 document identities
and recheck the head before returning. Composite indexes cover active epoch plus
title/position. The nested entry payload is exempt from unused single-field
indexes.

A first10,000-game metadata projection costs15,000 row/job writes; the ranking
projection costs another15,000, plus bounded control/head writes. This exceeds
Spark's20,000-write daily quota. An account-bound IndexedDB cooldown and server
progress survive reload. The UI labels each path's confirmed progress, and does
not say Up to date until both heads match the current private ACK. Browser
availability and the real quota still determine when unfinished work can run.
No billing change is made.

**Intentional client-version boundary:** dependency-only rule changes do not
reliably push listener updates. Current private source commits, Pause and Delete
atomically pulse every existing ready All head to updating. Rules require these
pulses only while the exact All consent is active. An older private writer is
denied before the source commit; durable local edits remain pending and a
refreshed current client can resume. Accounts without All, legacy selected/OFF,
disabled All and an old-client sharing Stop retain private-write compatibility.
An already-connected v2 viewer directly watches the empty v1 control documents,
so an unchanged old sharing Stop or control-epoch change immediately clears its
content. Private `syncHeads` documents are never made friend-readable.

All-mode private Pause intentionally revokes the shared views; it does not
silently opt in again after a saving restart. Legacy selected Pause retains its
previous last-snapshot semantics. Full deletion reserves v2 and v1 revocation
atomically before cleanup; an older client must refresh to clean v2 data before
removing Auth. Copy deletion uses the acknowledged v2 Stop once, not redundant
v1 mutations through potentially stale listener reads. Cleanup remains retryable
after the private head has already been deleted.

#### Focused acceptance evidence

These are actual scoped checks, not a full CI/performance campaign or a perfect
security claim. The new rule prototype was exercised with separate owner, friend
and stranger clients, malformed create/update fields, forged progress, replay,
missing authority, stale source, live revocation and quota/ACK failures.

| Requirement | Implementation boundary | Actual focused proof |
| --- | --- | --- |
| Default only after confirmed account readiness; preserve legacy choices | `friend-all.ts`, `useFriendAll`, atomic `setPolicy` | Fresh real browser: no All click, no guest adoption; legacy off remains off until one inline action |
| Complete supported size; no200 truncation | Per-record v2 paths, bounded jobs/pages | SDK publishes all10,000 games and all10,000 rankings; reads final identities without a full friend download |
| Cold unchanged and warm edits remain bounded | Transactional no-op before inventory; per-ID cache diff | Each new cold store: zero row queries/writes;205-entry warm score edit: one row group, no inventory scan |
| Unknown consent is never Off/default | Authoritative completion flag | Delayed then failed initial read of enabled policy remains Checking/Error; retry restores the actual state |
| Failed Stop does not strand work or replay consent | Read-confirmed Refresh and worker generation | Mounted hook: pre-ACK failure, same-policy refresh, new private ACK, both scopes ready; committed Stop stays off |
| Late canonical data wakes work without bypassing quota | Primitive readiness scheduling, persisted cooldown | Mounted hook exhausts its first attempt with no catalog, then publishes on arrival; quota case performs no publication |
| Partial comparisons are honest | Coverage model and exact-game loader |205 rows:25 initially loaded, Unknown whole-list metrics; tray performs bounded exact lookup, never a legacy full fetch |
| Private changes revoke then update safely | Source pulses, direct control watches, reader leases | Real private score update reaches the mounted comparison; old sharing Stop clears both views and an unsaved preview, retaining independent saved data and identity |
| Quota recovery survives reload | Server job and scoped IDB cooldown | Metadata52 ready/ranking50 of52 pending, no global Saved; reload retains deadline/progress and finishes remaining work |
| Old private writes do not claim success | Narrow rules boundary and existing outbox | Synthetic old wire commit denied atomically; local score remains dirty/durable, refresh resumes without sign-out or clearing |
| Export and cleanup remain complete | Controller/export/deletion integrations | Actual export, reversible copy deletion, fresh-Auth gate, full deletion and interrupted-cleanup retry on desktop and mobile |
| All source formats stay strict | Shared validators plus v2 mutation guards | Maximum-size collection/Wikidata/Steam/FreeToGame/manual records pass both paths; extra/private/oversized fields fail |

The parent-owned independent cross-lane review found four controller/read-cost
corners; each was repaired and covered above. The release receipt separately
records exact source/rule/index hashes, the scoped baseline lint limits, candidate
and production gates, and disposable fixture cleanup. No existing production
user's settings are bulk-migrated.

### Legacy selected-mode integration

On a deliberate friend action, read current settings and identity in parallel.
Only missing settings call `initialize`; existing settings must be nondeleted.
An independent identity read may overlap first-use lifecycle/settings creation,
but `saveIdentity` always waits for confirmed initialization and a current UID.
Project the committed member name/avatar only when it differs; do not
independently edit two names or repeat no-op initialization on warm actions.
Save the identity again after a committed account name/avatar edit, using its
revision. A request requires an already published target profile; the recipient
can initialize Friends before responding. Invitations need no public publication.

Initialize never opts in. Sharing setup calls `saveSettings` after an explicit
preview. The scheduler coalesces selected projection changes, reads the head and
calls `publishRanking` with the exact current settings, source and head revision.
`FriendSourceRevision` is `{ syncEpoch: number; remoteRevision: number }`, captured
from the clean, server-acknowledged account copy, not from a newly read head paired
with stale local state. Staging, every chunk, and head commit verify that exact
enabled, nondeleted private `syncHeads` epoch/revision. Pending private edits wait
for acknowledgement. The optional `isCurrent` callback cancels queued work at
transaction/chunk boundaries on logout or scope change; server CAS is authoritative.
Settings changes revoke the old projection until its replacement is published.
Unchanged content skips writes. Stop/logout/scope change must cancel scheduler
callbacks; stale revisions fail on the server. Pause private saving without
automatically deleting a previously shared projection.

Only attach watches for the active screen/current comparison participants.
On pair/settings/head listener errors or revocations clear displayed friend data;
never retain stale scores as an available participant. Detach all watches on
scope change. Ranking fetch verifies the current head again after fetching chunks.

The invite `token` is 32 cryptographically random bytes encoded as 64 lowercase
hex characters, used directly as the opaque capability document ID. It is NOT a
public identifier. UI puts it in the URL fragment only and never logs it, exports
it, forwards it through OAuth, or puts it in analytics/query parameters. Expiry is
seven days from server creation; preview hides all consumed recipient information.

Invite creation immediately opens an honest pending dialog, not a usable link.
The UI waits for the real commit and authoritative timestamp readback. Duplicate
clicks are locked; close/navigation cannot reopen a late result. Readback failures
require a successful Invite links refresh (including when already on that tab),
never an automatic replacement creation. The store reads identity and all 20 slots
in parallel, prefers a vacant slot, and reads occupied invitations only when all
slots are occupied. Full-capacity expiry/revocation reuse remains transactional.

A controlled synthetic-browser check adding 300 ms per Firestore HTTP request
measured warm confirmed-link time at 3,975 ms before and 1,639 ms after this path
change; first-use times were 4,634 ms and 4,466 ms. The pending dialog appeared
after 6 ms in the final run. These are single fixture observations, not production
latency guarantees. `invite-latency.spec.ts` preserves the measurement recipe;
`invite-feedback.spec.ts` covers first-use ordering, duplicate prevention, pending
close/focus, navigation cancellation and acknowledged-failure read recovery.

Before **full Auth account deletion**, call `revokeForDeletion` as the very first
reservation, before any social or legacy cleanup, then repeatedly call
`cleanupDeleted` until `done`. The existing immutable `accountLifecycle` active /
cancelled document remains unchanged; the irreversible social reservation is
`friendSettings.deleted`. Each cleanup call is bounded and resumable. Keep
authentication until cleanup finishes. The social deleted marker is irreversible,
even if an old tab later re-enables a legacy sync head. Export own identity and
settings plus the paginated relations/groups/blocks; omit invitation capabilities
and other people's ranking data. Continue each non-final page independently.

Ordinary sharing stop uses `saveSettings(uid, { enabled: false, selectedIds }, expected)`.
Delete-online-copy additionally clears `selectedIds` and runs `cleanupSharing`,
preserving relationships, identities, invitations and groups. Neither ordinary
operation calls `revokeForDeletion` or `cleanupDeleted`. Public Unpublish is
independent and does not change friend sharing.

Use **`pruneSharing(uid): Promise<number>`** for follow-up cleanup after a known
publication ACK. It retries only the bounded generation cleanup engine (at most
three registry generations), returning the number removed; it does not publish,
change settings, enable sharing, or update the head. Every retirement transaction
re-reads the head and **always preserves its latest current and previous IDs**,
even when consent is disabled or changed. A head race retries that transaction;
once a generation is marked deleting, existing rules prevent publishing it.
Failures remain visible and the caller retains its cleanup-pending marker.

Keep that marker after both `publish-ranking` committed-error phases: a failed
`refresh` occurs before post-publication cleanup has run, while `cleanup` means
cleanup itself failed. After read-only recovery, call `pruneSharing`, not another
publication. Do not substitute `cleanupSharing`: that separate operation may
deliberately remove inactive head generations after explicit stop/delete.

## Storage and rules

`friendSettings/{uid}` is private, versioned consent plus an irreversible deleted
marker. Selection is encoded on the wire as a validated pipe-delimited string:
IDs cannot contain pipes. This lets rules validate all 200 identities with a
bounded regular expression and enforce uniqueness without unchecked arrays.
The API always exposes `selectedIds: string[]`.

`friendIdentities/{uid}` contains only chosen display name, local avatar descriptor
and version/timestamp metadata. Reads require an active, nonblocked pending or
accepted pair; owners can read their own identity for cleanup/export.

`friendPairs/{lexicographicallySmallerUid}~{largerUid}` is one canonical state
machine. Its exact participants never change. Every transition increments the
epoch; pending acceptance is recipient-only. No reciprocal half-edge is possible.
Pair documents contain only relationship metadata, no identity, scores or tokens.
Participant-only gets and bounded queries may include inactive/deleted
relationship metadata until cleanup; they are not data-access grants. Keeping
this minimal metadata readable lets the surviving participant remove a deleted
friend even if that friend's account cleanup stopped halfway. Blocking always
changes an active/pending pair to the generic removed state atomically.

`friendBlocks/{uid}/items/{otherUid}` is private. Blocking atomically removes any
pending/accepted pair; unblocking deletes only the private block, never reconnects.

`friendInvites/{token}` holds the minimal invitation projection and terms. Its
name/avatar are the deliberate creation-time snapshot; later profile edits do
not silently change already-issued links. Revoke/recreate a link to update it.
`friendInviteSlots/{uid}/slots/{0..19}` is an owner-only fixed-slot registry.
An active invite must match its slot. At most 20 active capabilities can exist.
Expired/consumed slots can be reused; anonymous list/query is denied. Acceptance
atomically consumes the invitation and authorizes the canonical pair through
`getAfter`, referring only to the slot number in pair metadata. Cleanup replaces
used/revoked invites with an immutable `{ ownerUid, state: 'closed' } tombstone:
no name, avatar, recipient or timestamps. Tombstones prevent capability replay.

`friendShareHeads/{uid}` has current/previous manifests and monotonic revision.
`friendShareRegistry/{uid}` bounds generations to three (current, previous, one
staging/retiring). `friendShares/{uid}/generations/{uuid}` tracks strict incremental
upload progress and globally unique IDs; its `chunks/{0..99}` each contains at
most two individually validated `PublicEntry` values, ordered positions and IDs.
`FRIEND_CHUNK_SIZE = 2`, `FRIEND_CHUNK_LIMIT = 100`, and the selected-game maximum
remains 200. Every chunk is complete and immutable from creation; there is no
partial chunk or append protocol. The last chunk contains the exact remainder.
All selected entries are explicit, including zero scores and null scores.
Only the current, consent-matching generation is readable by friends. Previous
generation retention is for bounded cleanup, not a second friend-readable snapshot.
Failed staging generations are recoverable after a five-minute grace interval.

`friendGroups/{uid}/items/{uuid}` is owner-only name plus 2-6 unique participant
UIDs, revision and timestamps. Self is optional. Groups never grant access.

Rules additionally require active account lifecycle and nondeleted friend
settings on both sides for content/acceptance. No friend read path grants access
to members, private chunks, creator ranks or raw library state.

## Cost and operational limits

No Functions, paid TTL, polling, global presence or per-friend write fanout.
One ranking costs a head plus up to 100 packed chunk documents in one
generation-scoped query and a final head check. Rules authorize the whole known
owner/generation path and cap the query at 100; they do not filter documents.
This avoids repeating relationship authorization for 100 separate get requests.
Page size is 20. Invite allocation reads at most 20 slots plus their occupied
invites; fixed slots, not an unchecked counter, enforce the active limit.
Publishing stages one chunk and its progress record per atomic write and uses a
separate head-commit transaction. Reads of authorization documents are subject
to normal Firestore billing even when cached within a rules evaluation.

Schema-specific access-call accounting and executed evidence are recorded with
the implementation handoff. Free quota/network failures remain explicit errors.
Revocation prevents new server reads, not erasure of content already copied.

### Authorization-read budget

The following counts are a code-level inventory of distinct document states
looked up by one rule evaluation, including before/after states separately.
Firestore may cache repeated calls; the emulator cases exercise the real writes.
They are not a claim that a rules test ran when an execution slot is unavailable.

| Operation | Maximum per operation | Atomic union |
| --- | ---: | ---: |
| Send known-public-profile request | 8 | 8 |
| Accept pending request | 6 | 6 |
| Accept and consume invitation | 9 | 11 |
| Block and remove canonical pair | 3 | 4 |
| Friend identity get | 7 | Not applicable |
| Friend head / bounded current-chunk query | 8 | Not applicable |
| Stage generation + registry | 4 | 5 |
| Write two-entry chunk + progress (including canonical catalog) | 6 | 7 |
| Publish head + mark generation published | 5 | 6 |
| Delete one generation's 100 chunks | 3 | 3 |
| List 20 own relationship metadata rows | 0 | Not applicable |

Content reads do not perform a lookup for each shared entry. The canonical
collection source uses the existing single trusted `catalog/author` document.
The default 200-selection limit is enforced on the encoded string by regex plus
uniqueness; generation upload adds two strictly validated IDs at a time and
requires global uniqueness, so duplicate identities across chunks cannot commit.

The earlier ten-entry target exceeded Firestore's separate 1,000-expression
evaluation ceiling in an actual full-capacity publication, even after strict
aliasing/immutable-field optimizations. A subsequent five-entry attempt also
failed, including after conditional source dispatch. Its coverage reached about
three complete row validations before the next row exceeded the ceiling, with
the generation still at `uploaded: 0`. Three-entry immutable chunks subsequently
passed full 200-game Wikidata publication (6.89 seconds), but the mixed canonical /
Wikidata case exceeded the ceiling in its first chunk (2.4 seconds). The canonical
record checks must also fit, so two-entry immutable chunks trade up to 80
additional document reads per full ranking and up to 80 additional chunk/progress
write batches compared with the original ten-entry target. The same
200 games, all strict source/private-field checks, source/settings/lifecycle CAS
and atomic final head remain required. This is a measured failure motivating
the new shape, not a claim that the new expression budget has passed before its
coordinated runtime test.

Generation creation validates every metadata field. Subsequent updates constrain
the exact changed keys: upload progress validates complete chunk length, uploaded
count, accumulated IDs, global uniqueness, count bound and derived status;
publication/deletion change status only. Immutable metadata is inherited from
the validated creation rather than repeatedly evaluated on every upload.
Legacy private/public documents and rules are unchanged. Friend sharing has not
been deployed, so there is no production friend-data migration; old larger-chunk
friend writes fail the new exact chunk-size/position rules rather than silently
truncating content.

The five-entry diagnostic also failed on **chunk zero** (`uploaded: 0`), ruling
out a failure that only grows with previously uploaded IDs. Its expression
coverage reported evaluation across the legacy source-validation OR branches.
Friend chunks now use a separate conditional source dispatcher so only the
matching source predicate executes, cache canonical metadata once, and cache
entry fields before validation. Legacy `publicEntry` / `safeSource` are unchanged.
The friend predicate still requires exactly the same eight keys, strict numeric
types/ranges, source identities and URLs, and canonical title/year matches.
Position equality is against the validated chunk index and offset, which yields
an integer from 1 through 200. This removes redundant range checks, not the bound.
The full-capacity and mixed-source runtime cases remain the required budget
proof; static source parity alone is not a runtime-limit measurement.

The mixed 200-game case places all 100 canonical records first, followed by 100
Wikidata records. Its first 50 chunks each validate two canonical entries, rather
than only exercising one canonical lookup branch paired with a cheaper source.
The 199-game case separately verifies an odd one-entry final chunk.

## Focused verification

`src/lib/friend-types.test.ts` covers strict projection/identity/source parsers,
zero/null, unknown private fields, exact IDs, empty/pruned selections and bounds.
`tests-cloud/friendships.test.ts` exercises the real store with synthetic Auth
emulator clients, including canonical races, invitations, 200-entry packing,
direct forged writes, selected/source/settings CAS and resumable deletion.

Run only these named files with existing tooling. The cloud file respects
`FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST`; reserve the shared
emulator execution slot first. No hosted/local CI, production fixtures or rule
deployment is part of this isolated implementation.

### SDK network-disable and acknowledgement regression

The first runtime attempt exposed Node's navigator without `onLine`; only an
explicit `navigator.onLine === false` blocks a mutation. The next attempt proved
that `disableNetwork(db)` alone does not block this SDK's transaction RPCs: a
request committed, then its required server readback failed. The original
disable-network test still asserts rejection **and no server pair**, unchanged.
Graph mutations now perform a server-only own-settings preflight before any
transaction, so an already-disabled SDK stream fails before a graph write starts.
This is one additional document read per graph action, not part of the atomic
rules budget. It is not a guarantee that connectivity cannot change afterward.

The exact pinned Firebase 12.19.0 source explains the observed behavior:

- [`remoteStoreDisableNetwork`](https://github.com/firebase/firebase-js-sdk/blob/firebase%4012.19.0/packages/firestore/src/remote/remote_store.ts)
  stops the RemoteStore streams and changes online-state reporting.
- [`Transaction.lookup/commit`](https://github.com/firebase/firebase-js-sdk/blob/firebase%4012.19.0/packages/firestore/src/core/transaction.ts)
  use Datastore BatchGet/Commit RPCs, independent of the RemoteStore flag.
- [`TransactionRunner`](https://github.com/firebase/firebase-js-sdk/blob/firebase%4012.19.0/packages/firestore/src/core/transaction_runner.ts)
  resolves the callback result only after the commit RPC acknowledges.

`friend-mutations.test.ts` tests preflight rejection, acknowledgement timing,
raw transaction failure and typed post-ACK failures across graph, invitations,
settings, identity, groups and sharing. The cloud suite separately injects only
read-only transaction failures after real SDK graph/settings commits, then verifies their
server state from a fresh store. Explicit browser-offline coverage is additional,
not a replacement or weakening of the SDK-disable test.
