# Security release, rollback and ledger repair

This is an operator runbook, not executable Admin tooling. The parent and the
signed-in project owner perform production operations. The source lane adds no
Admin SDK, credentials, dependencies, scheduled cleanup or production writes.
At need, the operator writes and reviews repair tooling against the deployed SDK
and actual inventory; an example query below is not a command to run blindly.

**H5 remains a promotion gate until the complete candidate is reviewed and
emulator-verified.** A passing earlier stage, a completion marker, or an emulator
that ignores composite indexes is not that proof.

## Promotion order

1. Preserve the published rules bytes/full SHA, deployment ID, current client
   release and index readback. Add the verified owner UID to `_owner/config.uid`
   before publishing UID-based creator rules; retain the old email field during
   compatibility. Never infer an owner UID from an email match.
2. Run the integrator's exact candidate types, lint, units, full demo rules,
   migration and UI suites. Keep failures, selector-filtered runs and source-only
   tests distinct. Record synthetic serializer size outputs; do not call them
   real-user averages.
3. Inventory every ledger below and all orphan classes read-only. Record a zero
   when the result is zero. Classify legacy records explicitly and reserve their
   full schema envelopes in storage accounting. No implicit purge is authorized.
4. Read back existing production indexes and exemptions. Deploy additive indexes
   only, with explicit approval, and wait for **READY**. Never accept a CLI prompt
   to remove existing indexes. Extra deployed indexes change storage accounting.
5. Deploy and promote the current compatible client first. The old-rule window
   intentionally pauses full deletion at the unsupported deletion-mode LIST;
   it does not perform registry-only deletion and claim success.
6. Publish reviewed candidate rules, then read back and hash the exact deployed
   bytes. Record the client, rule and index versions together.
7. Run approved real Auth/online smoke on production after promotion. Preview
   and candidate origins are intentionally referrer-blocked by the web key.
   Synthetic local emulators remain the pre-promotion path, not a claim of
   production Auth success.
8. Only after evidence/review accept the candidate. Remove client-first
   compatibility branches in a later reviewed change once the window is closed.

Required additive query shapes, all `queryScope: COLLECTION`:

| Collection group | Exact index field sequence | Client query |
| --- | --- | --- |
| `entries` | `format ASC, epoch ASC, active ASC, entry.title ASC` | Head3 games: format=3, current epoch, active=true, order title then document ID, limit 25 |
| `entries` | `format ASC, epoch ASC, active ASC, entry.position ASC` | Head3 ranking: same filters, order position then document ID, limit 25 |
| `friendPairs` | `participants CONTAINS, creatorUid ASC, state ASC, updatedAt ASC` | Only at cap: caller in participants, creatorUid=caller, state in cancelled/removed/declined, oldest first, limit 20 |

`friend-all-indexes.test.ts` pins these shapes and reverse membership. Owner All
inventory retains its older epoch/active/document-ID query; no extra
equality-only index was added. The emulator does not prove a production index is
present. At-cap `FAILED_PRECONDITION` has plain retry copy and does not affect
ordinary under-cap requests.

Smoke includes report missing/existing confidentiality, new counted report
creation/review, cancelled verified registration removal, incoming/outgoing
identity direction, ordinary acceptance, mutual invitation acceptance, 29/31-day
decline behavior, handle rename/reserved legacy edits, generation cleanup,
All-sharing update/stop, and shared-device dirty-copy refusal. An unauthenticated
GET of missing `publicProfiles/{uid}` must deny, replacing live 270f's 404.
Deletion must resume after interruption and preserve Auth until all checked
steps and the final marker succeed.

## Rollback modes

Use these in order of preference:

1. **Roll forward:** repair the candidate while retaining its invariants.
2. **Client-only rollback, current rules retained (default):** backend bounds
   remain. The degradation matrix below is intentional; a compatible recent
   client is preferable to 270f once new formats exist.
3. **Write-frozen emergency rules:** keep authorization on reads and disable
   every positive write grant. Adding a separate `allow write: if false` does
   not override another allow. The parent must review the emergency artifact;
   the app is read-only and pending local edits must remain intact.
4. **Old rules `971b0fe6...`, last resort:** H5 bounds are suspended from this
   rollback until exact repair and verification finish. Preserve the full
   archived artifact, not a reconstructed approximation. The bundled 270f
   fixture's SHA-256 is
   `971b0fe6c7ec654bb21e72b70f7a431f71deff00612a9934ba02e851ae99243a`;
   that is archived source identity, not a new production readback.

### 270f client under current rules

No denied write may be reported as saved. Local changes and server records are
retained; restoring the current client is the normal recovery.

| Old-client operation | Expected limitation |
| --- | --- |
| New public publication/rename through a new generation | Denied: no public registry enrollment |
| Private/public/selected generation parent cleanup | Parent deletion denied without release/countdown proof; payload deletion may already have progressed, which the new client can finish |
| Private upload beyond eight registered snapshots | Denied; old allocation cap is too high |
| Private operations involving head3 All metadata or `cleanupEpoch` | Old parsers can reject new formats/fields; do not promise private-sync compatibility for these accounts |
| New comparison group or block | Denied without atomic registration. **A new block is a safety action that the old client cannot complete** |
| Group edit | Same legacy shape/revision remains allowed, enrolled or not; no implicit enrollment |
| Group/block deletion | Unenrolled legacy deletion remains allowed; counted deletion without slot release denies |
| New report or old creator “Mark resolved” | Denied: counted creation/release is required. **Reporting/review needs the current client** |
| New pair request | Denied: format2 plus creator count required |
| Accept/re-request an existing legacy pair | Denied without the caller's same-count proof touch; legacy passive decline/cancel/remove can still work |
| Manage a format2 pair | Old strict parsers may reject it before a request; do not claim full legacy-client social compatibility |
| Accept an invitation | Denied without the required pair/count proof |
| Create an invitation in a vacant slot | Existing shape can work; reuse/close/revoke using the old tombstone/status protocol denies. **Revoking a live link needs the current client** |
| All-mode format2 publication/job writes | Denied. Old viewers can read an unmigrated head2 but cannot parse/manage head3 |
| Existing sharing Stop | The unchanged compatible control write can still revoke access; it does not make old format2 writes valid |
| Full account deletion | Counted cleanup and completion requirements prevent a full-success claim; update the client |

### Why an old-rules rollback needs repair

This is not only an attacker case. When the current client's quota probe is
denied, its compatibility paths can create/delete without a newer ledger.
Old clients can also remove counted records without release, mark a counted
report resolved, or replace a job3 with job2 while format3 rows survive. Counts
can drift in both directions. A current client alone does not make old rules
safe against raw SDK writes.

After such a rollback:

1. Put current rules live first. Keep affected data contained; use a reviewed
   write-frozen maintenance variant if exact repair cannot run safely with live
   writers. Do not publish an inconsistent All head as ready.
2. The operator performs a **per-UID Admin transaction per ledger**: read the
   complete source query and ledger, reconcile markers as well as counts, and
   write only the ledger's valid schema. Do not trust a client-supplied count.
3. Re-read the same sources independently and verify each invariant below.
   Record exact counts, legacy counts/envelopes, rule/index SHA and time.
4. Inventory deleted-account data and parentless payload too. A counter recount
   is not an orphan purge. Purge needs separate approval and a dry-run count.
5. Only after all affected ledgers and orphan decisions are verified may H5
   bounds be claimed again. If a count exceeds its cap, contain/drain or approve
   an explicit legacy classification; do not silently truncate or set the cap
   value instead of the real count.

Use full projected queries, not the app's 20/100-row limit as a recount.
Transactions must remain within the platform's size, time and write limits. If
one exact transaction cannot fit, stop and have the parent approve a contained
repair strategy; a sequence of unlocked partial totals is not an equivalent
repair. Tooling is written at the time of need and is not shipped in this repo.

## Every quota ledger: invariant, verification and mismatch response

This inventory is derived from every owner-writable match in `firestore.rules`.
“Exact query” means all pages under that UID, with the stated field projection;
it never means a sample. Reading payload bytes is unnecessary for an ID/count
repair, but actual byte inventory must not trust a client-declared `bytes` field.

| Ledger and rules bound | Post-repair invariant | Exact per-UID verification read | Mismatch / safe next step |
| --- | --- | --- | --- |
| `accounts/{uid}/metadata/registry`, eight new/private generations | IDs equal the retained existing generation set after repair; current/previous references belong to it. An explicitly recorded over-cap legacy set may only drain | Read registry, `syncHeads/{uid}`, `creatorRanks/{uid}` and all `accounts/{uid}/generations`; project both manifests/status/released/epoch | Missing IDs waste slots; live unregistered parents or invalid manifests need containment and exact operator reconciliation. Never delete a retained copy to make an invented count fit |
| Private/creator chunk holders, at most 107/86 new positions per generation | Every live holder identifies a registered generation whose corresponding immutable manifest contains that digest. Every released prefix position is absent or no longer holds the generation | Full `accounts/{uid}/chunks` and `creatorRanks/{uid}/chunks`, projecting digest/holders/holder/bytes, cross-check all manifests and document IDs | Parentless/foreign-manifest holders are orphan inventory, not “zero.” Deletion-mode owner paging removes private payload only for explicit deletion; otherwise approve repair/purge separately |
| `publicProfiles/{uid}/metadata/registry`, four new generations | Listed IDs have existing registered parents; every candidate-created parent is enrolled. Full deletion removes the empty registry. Pre-cutover/rollback unregistered parents are explicitly classified legacy | Read registry, profile/control, all `publicProfiles/{uid}/generations`, and each parent's entry IDs/positions | Remove absent registry IDs transactionally or via approved repair. Do not label an unexplained unregistered generation “legacy” merely to make the check pass |
| Public `uploaded` countdown, at most 200 entries/parent | Non-deleting upload positions are contiguous through uploaded; deleting children are a subset of that range, and uploaded=0 implies no children | Enumerate each exact generation's entries and its status/count/uploaded | Any child beyond the accounted range invalidates the release proof. Keep parent/slot, contain writes, investigate/purge with approval |
| `friendShareRegistry/{uid}`, three; `friendShares/.../chunks`, at most 100 each | Registry equals extant tracked parents; valid current/previous pointers are preserved. Children stay within 0..uploaded-1, and zero means empty | Registry, share head/settings, full generations and each generation's chunk index/IDs | Missing parents or out-of-range chunks require reconciliation; never reset uploaded to zero while children remain |
| `friendShelfRegistry/{uid}`, three; `friendShelves/.../chunks`, at most 100 each | Same counted-parent and suffix-release invariant, with the shelf's own consent/source binding | Shelf registry/head/settings, full shelf generations and child chunks | Same response; a private-saving restart does not silently renew shelf consent |
| `friendInviteSlots/{uid}/slots/{0..19}`, twenty token positions | Each retained slot points to the matching owner/slot token; replacement cannot retain the old token. Extra historical tokens are explicitly inventoried | All 20 slot paths plus full `friendInvites` query `ownerUid == uid`, including closed/expired/consumed records | Missing/inconsistent slot targets or extra old tokens need owner cleanup or separately approved operator purge. No new unbounded tombstones |
| `friendAllJobs/{uid}/views/games` and `/ranking`, 10,000 physical format3 rows each | Job3 count equals ALL format3 rows for that UID/kind, across every epoch; every format3 row is active and valid. A job can be absent only if no format3 rows remain | Full `friendAllGames/{uid}/entries` or `friendAllRankings/{uid}/entries`, projecting format/epoch/active/token/step, plus job/head/policy | Job2/absent job with surviving row3 is a real mismatch. Do not reset to zero or resume automatic publishing. Contain/pulse heads unready, reconcile marker+physical count and valid progress/source, then verify before ready publication |
| `accountQuotas/{uid}/limits/groups`, 50 new IDs | Registry IDs exactly identify enrolled live groups; unenrolled legacy group IDs are recorded separately and may still be edited | Full `friendGroups/{uid}/items` ID set plus registry | Repair set difference for missing IDs. Do not enroll every legacy group. New full-deletion cleanup self-heals up to 20 missing IDs/pass; real retained items block completion |
| `accountQuotas/{uid}/limits/blocks`, 1,000 new IDs | Same registered/live set invariant; legacy unenrolled blocks remain separate | Full `friendBlocks/{uid}/items` IDs plus registry | Same set-difference repair. Creation can remain blocked by rollback orphans until cleanup releases them |
| `accountQuotas/{uid}/limits/reports`, 100 new counted reports | Counter equals counted markers; after an exact rollback repair every open report is counted and no resolved report is counted | Full `reports` query `reporterUid == uid`, project document ID/status/counted, plus counter | In ONE repair transaction reconcile markers AND count: enroll supported open records; unmark resolved counted records, or purge them only with separate approval. Count open records exactly. Unsupported legacy report-ID shapes or over-cap sets require an explicit parent decision before a bound claim |
| `accountQuotas/{uid}/limits/pairs`, 1,000 creator-attributed documents | Counter equals ALL format2 pairs with `creatorUid == uid`, in pending/accepted/declined/cancelled/removed states. Legacy format1 never counts or releases | Full `friendPairs` query `creatorUid == uid`, verify format and all five states, plus counter; separately inventory participant-scoped format1 | Never infer creator from `from` (invite creator is accepter), never count only accepted/pending, and never convert legacy pairs. Reconcile exact count; malformed attribution needs review. A zero ledger can be removed after proof |

For reports, setting a counter from only open rows without fixing `counted`
markers would make later deletions underflow. Unmarking means removing the
`counted` field, not setting it to false (that is not a valid legacy report).
For All, counting only the current
epoch or active old-format rows would recreate the original storage escape.
Every exact repair must preserve those distinctions.

Repair order is parent identity and generation/holder consistency first, then
public/selected registries and handles, then groups/blocks, reports, pairs and
finally job3/head3 consistency. Keep All heads unready while their rows/counts
are inconsistent. An ID registry with absent parents can now self-heal through
the current client: private cleanup removes absent **unretained** IDs, and full
public deletion checks its at-most-four IDs and removes only absent parents in
transactions. Present parents are never silently discarded.

`freePairCapacity` is not a general repair tool. It only runs at a new-allocation
cap, scans bounded creator-owned terminal pages, skips young declines, frees one
eligible slot and retries allocation once. It does not reclaim active/pending
pairs, repair a drifted count-only ledger, or periodically clean history. Those
limits, and proactive cleanup improvements, remain backlog; an index not READY
must not affect non-cap flows.

### Malformed-item repair

1. Enumerate by document ID, not solely by `createdAt`/`updatedAt` ordering:
   Firestore queries omit records missing an ordered field. Directly read every
   registry reference and distinguish an absent parent from a present malformed
   one. Record schema failures and exact counts privately.
2. Preserve a secure recovery export. If a current/previous pointer references
   the item, keep it and contain writes; an invented timestamp, digest, owner or
   zero counter is not a safe repair.
3. Restore only values proven from a trusted snapshot/receipt, or obtain separate
   approval to remove the malformed item and its descendants. A profile's
   missing/foreign handle requires a profile-and-claim consistency transaction;
   never take another user's handle. A stale unclaimed handle is a separate
   approved removal, not an automatic rename.
4. Reconcile the affected ledger in the same exact repair procedure and re-read
   it independently. Then let the current client finish cleanup. A present
   generation hidden by a missing `createdAt` must continue to block deletion
   until repaired; absence self-healing is not permission to delete it.

Shared pair release never grants a peer-counter GET. However, an authorized
counterparty learns the resulting count through Firestore `transformResults`.
Release does not bump revision, so that receipt does not reveal a revision
counter too. A zero-leak receipt inbox is backlog, not an implemented guarantee.

`cleanupEpoch` is a bounded **client-attested completion marker**, not a quota
ledger or an operator deletion proof. The parent must not trust it in inventory.
A matching deleted epoch drives the complete notice with no probe; an old marker
must not survive re-enable/re-delete as a completed current epoch.

## Remaining owner-writable paths

The quota inventory is not a blanket allow for other collections:

- `accountLifecycle`, `members`, `syncHeads`, `creatorRanks`, `publicControls`,
  `publicProfiles`, `friendSettings`, `friendIdentities`, `friendShelfSettings`,
  and `friendAllPolicies` have one document per UID. Heads/jobs have only the two
  fixed All view kinds. Selected heads are singletons. Their fixed schemas and
  the associated manifests/registries bound their fields.
- `handles/{handle}` is one current claim per ordinary owner under atomic
  rename and profile-delete rules. Old hoarded/unreferenced claims require the UID-based inventory
  query; they are not silently counted as one. A missing-handle availability
  read remains intentional.
- Avatar descriptors are bounded fields in member/friend/public records, not
  an upload collection. No Firebase Storage/file-upload grant is introduced.
- `_owner`, `ownerAccess` and `catalog/author` are not ordinary client-write
  surfaces. Configured creator moderation and Admin operations are privileged;
  the ordinary-UID storage ceiling does not constrain an operator.
- The recursive fallback denies all other document access. Do not infer write
  permission for parent documents whose subcollection paths are matched.

## Orphan inventory and containment

Run read-only first, including Auth-deleted UIDs. Save aggregate counts and
authorized private evidence, not report text, emails, invitation tokens or
library contents in a public issue or repository.

| Inventory | Criterion |
| --- | --- |
| Private chunks | Holder missing its generation/registry or absent from that generation's relevant manifest; include both private and creator summary collections |
| Public entries | `publicProfiles/{uid}/generations/{id}` parent missing, invalid, or unable to account for the entry position |
| Selected ranking/shelf chunks | Missing generation/registry, invalid index, or a child outside the parent's counted range |
| All rows | Format3/job3 mismatch, old epochs retained outside physical count, old format2 legacy footprint or invalid ready-head/source binding |
| Invites/handles | Token not represented by a valid slot; profile.handle missing or owned by another UID; or a handle whose owner's profile is absent or points elsewhere |
| Deleted-account residue | Any of the above plus nonempty quotas, remaining group/block/report/pair records and retained manifests for an absent Auth identity |

There is no client collection-group grant for public/shared orphan discovery.
The signed-in operator uses read-only collection-group inventory and records an
actual zero if no residue exists. Purge is a separate approval: dry-run exact
paths/counts/bytes, preserve required recovery exports, then delete in bounded
operator batches and re-inventory. Never purge a live retained copy or another
participant's data by a broad wildcard.

For abuse, disable the Auth account and revoke refresh sessions, then apply
appropriate write containment before purge. Existing ID tokens can remain valid
until expiration; preserve required deletion/revocation markers so removing a
parent does not let an old session bootstrap content again. If the privileged
creator itself is affected, remove/rotate that role through the operator before
assuming ordinary-user containment applies.

Spark's storage and 20,000 writes/day are project-wide. Finite per-account
attribution does not prevent Sybil verified accounts or guarantee service under
maximum legitimate/adversarial use. App Check/reCAPTCHA adoption remains a user
decision and follow-up, with the separate CSP/Data Use work described in
`security.md`; it is not silently enabled here.

## Receipt and mismatch discipline

Record source/client SHA, exact read-back rules SHA, indexes/READY evidence,
UTC times, complete versus sampled query scope, per-UID ledger and legacy
envelope counts, orphan counts, dry-run/purge approvals, and verification recount.
Do not put credentials or private content in those receipts. A mismatch means
the affected bound is **not established**; contain the writes, retain data and
escalate to the parent rather than calling a partial result success.

## Deletion recovery copy inventory

This is a copy-only consistency pass: no branch, query, retry limit, mutation,
error code, completion rule or navigation changed. Production deletion calls
`store.revoke(..., true)` and sets the deleted head on Account **before** private
cleanup, `deleteProfile`, All cleanup and selected/social cleanup. Until the
completion marker is written, Account therefore offers **Finish deleting**.
If its confirmation dialog is still open, closing it exposes that action; the
existing confirmation button can also retry. The label is not used for active
background GC, pre-confirmation guards, a changed account, or an already-finished
cloud cleanup that only needs recent Auth confirmation.

| Source / state | Before | After / action |
| --- | --- | --- |
| Private interrupted deletion, deleted head already reserved | “Check your connection, then choose Finish deleting.” | “Deletion stopped before it finished; your account is still here. Check your connection, then choose Finish deleting to continue.” |
| Private deletion service limit | “Your account is still here; try again later.” | “Deletion paused because the online service reached a limit. Wait a while, then choose Finish deleting to continue.” |
| Old-rule deletion LIST hold | Four short sentences ending “Try again in a few minutes.” | “Deletion is paused; no saved content has been removed and online saving and sharing are off. Wait a few minutes, then choose Finish deleting to continue.” |
| Private page/remaining-registry limit | “Choose Finish deleting again to continue.” | “There's more to delete. Choose Finish deleting to continue.” |
| Deletion protocol not yet available | “Refresh the page, then choose Finish deleting.” | Adds “to continue”; no fallback or automatic retry added |
| Public generation/registry still present (`deleteProfile` only) | “Try deleting again later.” | “Some public copies still need cleanup. Choose Finish deleting to continue.” |
| Public cleanup pass limit | “Retry deletion to continue safely.” | “Some older public copies are still stored. Choose Finish deleting to continue.” |
| Report page remains | “Retry deletion to finish the next batch.” | “Some reports are still stored. Choose Finish deleting to continue.” |
| Public registry still exists after final transaction | “Some publication settings still need removal. Try deleting again later.” | “Some publication settings remain. Choose Finish deleting to continue.” |
| Full social quota cleanup blocked/nonempty | “Some account settings could not be removed / still need removal. Try deleting again later.” | “Some account settings remain. Choose Finish deleting to continue.” |
| Controller All/shelf/relationship pass limits | “Retry deletion” / “Retry account deletion” | “Some shared copies / shared games / connections are still stored. Choose Finish deleting to continue.” |
| Account/session changed during any cleanup | “Cleanup stopped” or “Nothing was deleted” | “The signed-in account changed. Return to the same account before continuing.” Finish deleting may no longer belong to the visible account |
| Deleted epoch or retained copy changed | Technical state/snapshot wording | “Online saving changed” / “A saved copy changed. Refresh the page before continuing.” No instruction to continue a stale deletion |
| Final marker/last Auth guard changed | “The account changed. Deletion was not confirmed.” | Account/online-saving state changed; refresh. The final Auth guard also states the sign-in remains |
| Controller offline preflight | “Connect before deleting cloud data. No success is reported...” | “Connect to the internet before deleting online data.” No deleted head is assumed yet |
| Shared selected generation/registry errors, also used by active GC | Internal “generation registry” or “Retry deletion” | Shared copies/settings could not be checked; try later or refresh. No Finish deleting instruction when that control may not exist |
| Shared shelf deletion precondition | “Reserve full shelf deletion...” | “Shared-game deletion is not ready. Refresh the page, then confirm deletion.” |
| Social deletion precondition | “Reserve full social deletion...” | “Account deletion is not ready. Refresh the page, then confirm deletion.” |
| Automatic All count validation | “Shared data could not be counted safely.” | “Some shared copies could not be checked. Try again later.” This helper also runs outside deletion |
| Shared release engine exhausted/invalid state | Internal “payload / bounded release / generation” text | Saved copies need cleanup or could not be checked; refresh then retry. Shared active-GC callers are preserved |
| Publication/report metadata corruption | Internal metadata wording or “Nothing was changed” | Settings/copies could not be checked/read; try later. An operator repair may still be necessary; retry never means guaranteed completion |

Inventory unchanged by this pass: pending-edit, sign-in, password, Google-return,
verification and cancelled-registration guards run before destructive cleanup;
their real confirmation/sign-in actions remain. Shelf/All/friend store offline
guards already give connection guidance. Low-level parser/storage exceptions
still surface through the existing error adapter rather than being converted to
a false resumable result. After cloud completion, `requires-recent-login` still
asks for password/Google confirmation, not Finish deleting. Auth/local-device
cleanup exceptions are not a claim that the old deleted-account notice remains
visible.

The unit and emulator assertions retain the same predicates and now check the
new strings. The real UI source checks that the interrupted-deletion instruction
matches the visible Finish deleting action after closing its confirmation.
All changed-source execution remains the integrator's UNRUN work item.
