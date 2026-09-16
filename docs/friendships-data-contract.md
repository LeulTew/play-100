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
cleanupDeleted(uid: string): Promise<FriendCleanupResult>
```

`projectFriendRanking(state, selectedIds, games)` reuses the public projection,
supports an empty result and returns `{ entries, selectedIds }`, pruning removed
ranked games. Save that pruned selection with its expected settings revision
before publishing. A later re-added game is not automatically selected.

## Integration order

On a deliberate friend action, call `initialize`, then project the committed
member name/avatar through `saveIdentity`; do not independently edit two names.
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
upload progress and globally unique IDs; its `chunks/{0..19}` each contains at
most ten individually validated `PublicEntry` values, ordered positions and IDs.
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
One ranking costs a head plus up to 20 packed chunk reads and a final head check.
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
| Friend head / current chunk get | 8 | Not applicable |
| Stage generation + registry | 4 | 5 |
| Write ten-entry chunk + progress (including canonical catalog) | 6 | 7 |
| Publish head + mark generation published | 5 | 6 |
| Delete one generation's 20 chunks | 3 | 3 |
| List 20 own relationship metadata rows | 0 | Not applicable |

Content reads do not perform a lookup for each shared entry. The canonical
collection source uses the existing single trusted `catalog/author` document.
The default 200-selection limit is enforced on the encoded string by regex plus
uniqueness; generation upload adds ten strictly validated IDs at a time and
requires global uniqueness, so duplicate identities across chunks cannot commit.

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
