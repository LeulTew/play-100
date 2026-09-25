# Security hardening and release gates

These rules and client changes are a prototype pending the integrator's actual
emulator, type, browser and rollout checks. Source assertions are not proof of
production protection or a numerical security score.

## Report confidentiality

Predictable report IDs do not authorize third-party existence reads. A missing
report can be read only by its verified reporter segment. An existing report
belongs to its reporter and the configured creator. Third parties must receive
permission-denied for both outcomes. List queries retain their owner/creator
constraints and 20-row cap.

The `targetUid_reporterUid` format requires both UIDs to be free of `_`; this is
the local report-path assumption for Firebase-assigned email/password and Google
provider UIDs, not a universal constraint on custom/imported accounts.
The report builder and create rule explicitly reject `_` in either UID: such an
account cannot create a new report or be its target, and is never misattributed.
Existing report access still checks its stored reporter field, not an inferred
suffix. Global UID validators and hyphenated demo identities are unchanged.
Introducing custom UIDs requires revisiting the report ID format first.

The parent reviewed the supported sign-in source paths: Firebase assigns IDs for
email/password and Google redirect, and the app has no custom-token, user-import,
Admin or anonymous-sign-in path. Custom/imported/Admin-created users would be
operator-only additions, not a supported app flow today. No existing-user export
was provided; this does not assert that every stored account has a particular
UID length or character set.

## Registration recovery

A cancelled lifecycle is immutable, including after email verification. It
cannot bootstrap member, sync, publication or friend content. A reclaimed,
verified sign-in can explicitly remove that cancelled Auth identity after recent
login confirmation and delete only its exact device cache; it does not create
cleanup content or reopen the cancelled lifecycle. The person can then register
again using the same email. Guests and other account scopes remain separate.

## Friend identity and request limits

An incoming recipient may read the requester's friend identity. A pending sender
may not read the recipient's private friend identity; outgoing rows use only the
recipient's already published snapshot. Accepted friendships keep their existing
identity access, and loaded-row scope/direction guards invalidate stale reads.

After a decline, the original sender waits 30 days before another request.
The decliner may initiate sooner. Firestore compares the existing server-written
`updatedAt` against `request.time`; the new timestamp must equal request.time.
The client says only that a request cannot be sent right now, not why.

## Cursor-only list-cost bounds (PRE-G2-H6)

All 19 permissive list grants require an absent or zero query offset, including
creator, owner, public-directory and accepted-friend reads. Existing visibility
predicates and limits remain unchanged: 3 selected generations, 20 metadata rows,
100 selected chunks, 200 public entries, and 100 owner / 25 peer All rows.
All 20 deny-only list clauses and both deny-only read clauses stay denied;
there are no unbounded owner-list exceptions.

The [Rules Request reference][rules-query-properties] describes `request.query`
as a map of query properties when present, including `offset`.
The guard uses `request.query.get('offset', 0) == 0`: [Map.get][rules-map-get]
supplies zero only when that property is absent. It does not dereference an
absent field or treat a positive offset as a cursor. First pages and `startAfter`
pagination remain allowed, including explicit zero-offset REST queries.

[Firestore charges a read for each offset-skipped document][offset-pricing].
This guard removes that skipped-read amplification path, not repeated-query,
index-scan, authorization-dependent-read or project-wide Spark quota costs.
It adds no document lookup and changes no index, schema or console setting.
IAM-authorized server/Admin requests bypass client Security Rules as before.
`tests-cloud/query-offsets.test.ts` covers direct REST denials, nonempty
zero/absent-offset and cursor pages, and unchanged limit checks. Its 27 cases
passed in `npm run test:cloud` at Release 1 (`2f727389`); receipts are in the
[release ledger](releases.md#release-1-2026-09-25).

[rules-query-properties]: https://firebase.google.com/docs/reference/rules/rules.firestore.Request#query
[rules-map-get]: https://firebase.google.com/docs/reference/rules/rules.Map#get
[offset-pricing]: https://firebase.google.com/docs/firestore/pricing#managing_large_result_sets

## Dated H14 black-box evidence and accepted risks

The parent performed read-only public-API probes on **2026-09-23**, using the
public web key from live 270f (redacted in the receipt). The console canvas was
signed out; no credentials were entered and no writes were made. This is
**black-box readback, not console readback**. Operator-held receipt:
`firebase-h14-evidence-20260923.json`, SHA-256
`9b10b5d1efc660b268faf7fdb1f5c370ea9e5cf9ff216e8a59b353ccb2f74f0f`.

- Referrer restriction: empty/foreign Referer returned
  `403 API_KEY_HTTP_REFERRER_BLOCKED`; the app origin returned 200. A Referer
  header is client-asserted, so this is browser-abuse friction, not authentication.
- API restriction: Books returned `403 API_KEY_SERVICE_BLOCKED`; Generative
  Language is disabled in the project.
- Enumeration protection: createAuthUri returned only kind/sessionId, without
  registered/provider enumeration fields.
- Password policy: ENFORCE, minimum 12 and maximum 4096, no character classes.
- Authorized domains: exactly `play-100-collection.vercel.app`,
  `play100-online-48823b32.firebaseapp.com`, and
  `play100-online-48823b32.web.app`; no localhost.
- reCAPTCHA email/password/phone protection was not enabled
  (`ENFORCEMENT_STATE_UNSPECIFIED`).
- App Check was not configured/enforced: no client SDK and requests without its
  token reached ordinary rule evaluation. This is not an App Check assurance.
- An unauthenticated missing publicProfiles get returned 404 under live 270f,
  independently confirming the H4 existence distinction.

App Check remains an **accepted risk with a plan**: Spark quotas bound cost,
while auth/ownership rules and the proposed caps constrain permitted writes.
Quota denial of service remains possible. reCAPTCHA would add third-party
scripts/cookies, widen CSP and require a Data Use disclosure change; it is not
silently enabled by this batch. reCAPTCHA Auth protection is likewise not adopted
now given enumeration protection, the password policy and rules controls; revisit
if abuse appears.

**Sign-up enumeration (accepted risk, R9).** Creating an account with an email
that is already registered fails with `auth/email-already-in-use`, which
`src/cloud/errors.ts` maps to its own message and `OnlineController`'s email
sign-up (`createUserWithEmailAndPassword`) shows, so the sign-up form reveals whether an email is registered. Firebase
email enumeration protection covers sign-in and `createAuthUri`, not account
creation, so it does not hide this. The copy is deliberately unchanged: a
generic message would leave real users unable to tell they should sign in
instead. The mitigation is reCAPTCHA Auth protection or App Check enforcement to
rate-limit automated probing; adopting either is an owner decision.

The authored client (`src/cloud/app-check-client.ts`) uses the **reCAPTCHA v3**
provider (`ReCaptchaV3Provider`), which works on Spark without billing, behind
the build flag `VITE_APP_CHECK_ENABLED` (default off; see
`src/lib/app-check-config.ts`). reCAPTCHA Enterprise is an unimplemented
alternative; switching would need a different provider class, key type and
review. If adopted, follow the runbook's App Check section: ship that client
first, observe verified-request ratios for at least seven days, then enforce
Firestore followed by Auth. Update CSP and Data Use before enabling that
traffic. Roll back by un-enforcing, not by weakening rules.
The API limiters are per instance, not global per-IP protection. One shared
bounded-admission helper (`api/_lib/admission.ts`) caps detail at 4 active and
30 uncached lookups per minute and search at 6 active and 90 upstream searches
per minute, releasing each slot in `finally` (success, failure or client abort).
Concurrent cold FreeToGame requests share one snapshot fill, and search upstream
responses must be `application/json`. The Vercel WAF rule in the runbook is the
global control; it and its deployment evidence remain with the parent/integrator.

### Preview referrers and production smoke

Preview and candidate origins are intentionally excluded from the browser
API-key referrer allowlist. The allowed referrers are the production origin
`https://play-100-collection.vercel.app/` and the existing
`https://play100-online-48823b32.firebaseapp.com/` helper origin. This is distinct
from the Auth authorized-domain list above. A blocked preview request is expected,
not a reason to broaden the key's restrictions or record an online/Auth pass.
Real online and Auth smoke tests therefore run on production only, after
promotion and with operator approval. Local demo-emulator tests use synthetic
configuration and remain the pre-promotion validation path.

**Promotion-time option, not performed:** after verifying the proxied
`/__/auth/*` sign-in, linking and reauthentication flows on production, the parent
may remove firebaseapp.com from the key's referrer allowlist if no legitimate
request still requires that origin. Recheck those production flows and retain
the prior allowlist for rollback. This option does not remove the proxy
destinations or change Auth authorized domains, and no allowlist write is made
by this source change.

**Caveat: the email action handler still needs firebaseapp.com.** Verification
and password-reset emails link to the default action URL
`https://play100-online-48823b32.firebaseapp.com/__/auth/action`. That page
calls Identity Toolkit with this key from the firebaseapp.com origin, so
removing that referrer breaks email verification and password reset unless the
console action URL is first customized to a production-origin handler. Parent
readback before taking the option: Firebase console → Authentication →
Templates → (any email template) → edit → **Customize action URL**; record the
current value. If it is empty or firebaseapp.com, keep the firebaseapp.com
referrer.

## Stage 1 compatibility and validation

The new client has an explicit client-first path for live 270f rules; the
migration cases below must be executed before relying on that compatibility.
The step order is the runbook's
[Promotion order](security-release-runbook.md#promotion-order).
Publish it before tightening rules: the old client's outgoing-pending identity reads will be denied by the
new policy, and its immediate declined retry will be rejected. The report
transaction already reads only its own missing/existing report and needs no
ID change for delimiter-safe UIDs; the client now rejects unsupported report IDs
before any persistence. Cancelled recovery uses the existing lifecycle own-get permission
and deletes through Firebase Auth, not a new rule mutation.

Coverage: `tests-cloud/security-hardening.test.ts`,
`src/cloud/account-lifecycle.test.ts`, `src/lib/friend-manager-feed.test.ts`,
`tests-cloud-ui/cancelled-registration.spec.ts`, and the updated request
transition case in `tests-cloud/friendships.test.ts`. The emulator files passed
in `npm run test:cloud` at Release 1 (`2f727389`): security-hardening 15 and
friendships 45; receipts are in the [release ledger](releases.md#release-1-2026-09-25).
Use the demo-only `npm run test:cloud` and separately configured local emulator
UI suite; never point these actors at production.

## Storage caps and legacy compatibility

**H5 remains a release gate until the integrator verifies the complete candidate
and the parent reviews its receipts.** The original metadata-only deletion loop
is retained in history as a reproduced counterexample, not an accepted risk.
Candidate rules now keep the generation/slot until its payload has been released:

- Private generations count released positions through immutable private and
  ranking manifests. Each two-position step proves the chunk absent or the
  generation removed from its holders. Parent deletion requires every position
  released; a deleting generation cannot gain new holders.
- Public entries and selected friend ranking/shelf chunks count `uploaded`
  down in steps of at most three, proving each suffix document absent after the
  write. Parent deletion requires zero; deleting parents cannot receive uploads.
- New public generations register atomically, up to four. Selected ranking and
  shelf registries stay at three each. Private registry capacity stays at eight.
  Current/previous copies occupy two positions; 30-second ready and five-minute
  staging grace mean a cap of three/four has not demonstrated burst-save liveness.
  No smaller private registry is part of this change.
- Format3 All-sharing jobs count physical rows across epochs, not just active
  rows in one epoch. A specific row deletion must release its count atomically;
  a job cannot be removed until zero. Legacy format2 rows remain owner-readable
  and deletable, with their separately inventoried footprint.

Groups, blocks and open reports have registered-new caps of 50, 1,000 and 100.
Pairs have a 1,000-document cap attributed to the actual creator, including an
invite's accepter. Every pair state counts until physical deletion. A declined
pair retains its slot and server timestamp for 30 days; ordinary early deletion
cannot bypass that cooldown. Legacy pairs retain their original shape and
in-place lifecycle, never acquire attribution, and never release a counted slot.
Legacy group edits likewise remain supported without enrollment. New records
cannot use the unenrolled legacy write path under candidate rules.

The private envelope remains 20 MiB / 107 chunks. A new ranking allocation is
limited to 16 MiB / 86 chunks. The real parser constants imply an upper JSON
bound of `10,000 * (42 + 200 + 6*200 + 5 + 32) + 1 = 14,790,001` bytes, below
16,777,216. The serializer fixture uses actual control characters and lone
surrogates, not already-escaped strings. Generic legacy 20 MiB manifests,
payload reads, previous heads and cleanup remain supported. No private source
URL limit was added.

Staging-to-ready remains a status-only transition and does not revalidate its
manifests. The creator summary's `current` write therefore separately requires
the 16 MiB envelope even for an older READY generation; `previous` deliberately
retains the generic <=20 MiB manifest check. The real generator's
14,790,001-byte upper bound fits, so no representable client ranking is excluded.

Client-first compatibility is narrow and temporary: unsupported quota GETs or
the first unsupported release/counting operation select the prior path for that
attempt. Offline/malformed data is not a compatibility success. Remove these
branches after the promotion window. In particular, full deletion on old rules
stops at the missing deletion-mode LIST permission rather than falling back to
registry-only deletion.

### Conditional per-account storage ceiling

The table below retains the accepted H5 index baseline from `67555a5`.
STORAGE-02 is a separate candidate, described afterward; its configuration must
not be treated as deployed merely because this branch contains it.

This is an ordinary verified account's **attributed** footprint, not all rows it
may receive from other accounts. The configured creator's cross-UID moderation
and Admin writes are privileged operator powers, not an untrusted-user quota.
Bounds assume current rules, reconciled ledgers, and the checked-in index policy
actually deployed. Existing legacy records are an additional term `L`: use their
full allowed envelopes, not just today's bytes, where an existing generation or
mutable legacy record can still grow within its schema.

Rules cannot verify base64 content against the declared digest/byte count.
Therefore private wire accounting uses `107 * 262144 = 26.75 MiB` per generation
and new ranking wire accounting uses `86 * 262144 = 21.5 MiB`, rather than only
the decoded byte labels. Eight combined generations allow **386 MiB** of encoded
payload. Old 20 MiB ranking generations can contribute up to another 42 MiB
across eight retained generations until replaced; over-cap legacy registries,
parentless payload and stale holders are separately included in `L`.

The following conservative reserves include document names/field overhead and
indexes, not just payload. They are analytical ceilings, not measured typical
usage. Names budget a UID of up to 128 UTF-8 characters; string reserves use up
to four UTF-8 bytes per permitted character. Private chunk `data` and selected
chunk `entries`, All-row `entry`, and selection strings use the existing index
exemptions. Single-field and ordered composite reserves are respectively 2 KiB
and 4 KiB unless the smaller global-document path is explicitly noted.

| Store / rule-enforced new count | Document/payload reserve | Index reserve and total ceiling |
| --- | --- | --- |
| Private/ranking chunks: `8*(107+86)=1544` | 386 MiB base64 + 8 KiB overhead/chunk | At most 8 live holders after reconciliation; 16 single-field entries/chunk at 2 KiB = 48.25 MiB indexes. Chunk subtotal 446.3125 MiB |
| Private generations (8), sync head (1), creator head (1), registry (1) | Opaque manifest metadata can approach the platform 1 MiB/document limit; do not assume its chunk-list elements are all small | Use the platform 8 MiB total-index limit for each of the ten opaque documents, plus 64 KiB registry reserve: subtotal 90.0625 MiB |
| Public entries: `4*200=800`, plus four generation docs/profile/control/handle/registry | 8 KiB/entry; 256 KiB combined metadata reserve | Up to 16 single-field entries at 4 KiB/entry-document: subtotal 56.5 MiB |
| Selected ranking and shelf: each `3*100` chunks | 8 KiB/chunk, 512 KiB including indexes per generation, 256 KiB controls/head/registry | Four single-field entries at 2 KiB/chunk: 6.4375 MiB per store, 12.875 MiB combined |
| All games and ranking: `2*10000` rows plus five policy/head/job docs | 8 KiB/row; 320 KiB combined control reserve | Ten scalar single-field entries at 2 KiB and up to five composites at 4 KiB/row: subtotal 937.8125 MiB |
| Groups: 50 plus ID registry | 2 KiB/group | 16 single-field entries at 2 KiB/group; 128 KiB registry reserve: 1.7852 MiB |
| Blocks: 1,000 plus ID registry | 1 KiB/block | Two single-field entries at 2 KiB/block; 2,176 KiB registry reserve including 1,000 ID indexes: 7.0079 MiB |
| Reports: 100 counted plus counter | 3 KiB/report | Twelve single-field entries at 2 KiB/report; 16 KiB counter reserve: 2.6524 MiB |
| Pairs: 1,000 attributed plus counter | 2 KiB/pair | Global paths fit 1 KiB/index entry: 22 single-field plus six array-expanded composite entries; 16 KiB counter reserve: 29.3125 MiB |
| Invitations: 20 current tokens + 20 slots | 2 KiB/token and 1 KiB/slot | Global token paths: 21 entries at 1 KiB/token; two at 1 KiB/slot: 0.5079 MiB |
| Remaining fixed account/member/identity markers | No unbounded child collection; avatar descriptors are fixed fields, not uploaded files | 1 MiB combined document/index reserve |

The rounded total is **less than 1,590 MiB + L** under those conservative
reserves. This deliberately loose ceiling exceeds Spark's 1 GiB project
allowance: finite per-account caps do **not** prove that even one pathological
maximum account fits, and are not an "exhaustion fixed" or billing guarantee.
Changing production indexes changes this accounting; unmatched indexes require
recalculation before claiming it. The independent platform fallback is the
bounded document count times the platform document/index limits, not an
assumption that index storage is free.

The fresh attributed document-count ceiling is 25,177, including chunks,
entries, generation documents, fixed heads/settings/markers, all four quota
records, invite slots and the current handle. Platform document/index ceilings
still supply a finite fallback if the detailed index inventory is unavailable,
but that much looser bound is not a useful promise about Spark capacity.

### STORAGE-02 candidate accounting, not a deployed saving

This candidate changes only 13 exact single-field overrides: `entries.token`,
`entries.step`; `chunks.digest`, `bytes`, `createdAt`, `holder`, `holders`;
`generations.private`, `generations.ranking`; `syncHeads.current`, `previous`;
and `creatorRanks.current`, `previous`. There are no wildcard overrides or
composite removals. The existing five exemptions remain unchanged.
`chunks.index ASC` and `generations.createdAt ASC` remain available.

The query/index audit enumerates `src/`, `api/` and `scripts/` (tests, declarations
and the audit pair excluded), immutable 270f query-source fixtures, and the
release runbook's formal operator-query contract. Admin method chains,
`runQuery`/`structuredQuery` bodies and REST `orderBy` fail closed until a
reviewed extractor exists; emulator-only test REST reads stay outside these
roots. Unknown query indirection also fails closed. Both field order and
array-CONTAINS support are checked, and none of the new exempt paths (including
descendants of map exemptions) may be queried. Rule get/getAfter comparisons
and field projections are not index-requiring queries.

| Changed reserve | Accepted H5 reserve | STORAGE-02 conditional reserve | Loose-model reduction |
| --- | ---: | ---: | ---: |
| Private/ranking chunk secondary indexes | 48.25 MiB | 0 for the listed secondary fields; document-ID storage remains | 48.25 MiB |
| Ten opaque generation/head documents' index reserve | 80 MiB | 172 KiB: 8 generation docs at 16 KiB (including optional released), sync head 28 KiB, creator head 16 KiB | 79.83203125 MiB |
| All-row token/step single-field indexes | 156.25 MiB | 0; format/epoch/active and every explicit composite remain | 156.25 MiB |

Thus the same deliberately loose model moves from about 1,585.828125 MiB to
**1,301.49609375 MiB + L** (round conservatively to **less than 1,305 MiB + L**).
This still exceeds Spark's 1 GiB. No private payload, cap, supported library size,
rule, schema or quota invariant changes. System document-name storage and
backfill/transitional occupancy are not counted as a saving.

For the documented constructible example with an illustrative 28-byte UID,
the same storage-size formulas give 31,360,000 bytes for All token/step indexes,
3,521,992 for the listed private-chunk indexes, and 514,787 for valid full
manifest-map indexes: **35,396,779 bytes, about 33.76 MiB** in that example.
These calculated example deltas are not the loose ceiling deltas, real-user
averages, measured billing savings or evidence of production index state.
Only the parent's before/after readback after READY/backfill may establish the
deployed result. Follow the runbook; all runtime commands remain with I.

`ranking-envelope.test.ts` emits exact serialized and base64 sizes for a
deterministic 100-record fixture, a 1,000-record fixture and the maximum escaping
fixture. These are synthetic examples, not observed user averages. Their current
execution receipts must be recorded by I; the source lane does not invent
measured sizes.

For the representative fixture's literal ASCII fields, source arithmetic predicts
the following totals. They are **calculated expectations, not executed results**:

| Records | Private JSON bytes | Ranking JSON bytes | Private base64 characters | Ranking base64 characters |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 35,831 | 7,737 | 47,776 | 10,316 |
| 1,000 | 363,588 | 80,280 | 484,784 | 107,040 |

The fixture includes progress, a quarter of records queued, scores or null, and
a 29-character note on every tenth record. The real serializer output must
confirm or correct these expectations before the release receipt calls them
measured; neither example substitutes for the representable-maximum case.

Spark's project-wide 20,000 writes/day and storage limits still permit disruption,
including from multiple verified accounts. App Check is not configured and
remains an explicit user follow-up, not an assumed protection. The operator
response is to contain writes, disable the abusive Auth user and revoke sessions,
then inventory and separately approve a purge. Disabling Auth alone does not
instantly invalidate every already-issued ID token. See the
[release and repair runbook](security-release-runbook.md) before either repair
or rollback; a rollback to the old rules suspends these invariants.

### Self-contained migration coverage

`tests-cloud/fixtures/live-270f4c7/firestore.rules` is the unchanged repository
snapshot from commit `270f4c743d3a9a89d5a64fe612e471ea045ebb47`, Git blob
`6e97647cb01106e2035edfd97a725e2b3e9538f7`, SHA-256
`971b0fe6c7ec654bb21e72b70f7a431f71deff00612a9934ba02e851ae99243a`.
The shared fixture loader verifies both digests before loading it. It does not
read a private evidence drive, invoke Git, or depend on CI fetching old history.
This identifies the archived source, not a fresh production rules readback.

`tests-cloud/security-migration.test.ts` uses real Auth/Firestore emulator
clients and current SocialStore, CloudStore, cancelled-recovery and Friends
methods. It covers new publish/rename/report on frozen old rules, the specific
registry-read permission-denied fallback (not offline errors), verified cancelled
identity/device removal without content cleanup, outgoing public-name selection,
and denied guest profile reads mapped to null. Candidate-only cases cover
valid expired 12-generation private state shrinking before an actual save and
readback, unregistered public cleanup then enrollment, and reserved legacy handles
unpublishing/renaming while same-handle republishing is rejected.

The original two-iteration counterexamples are retained in commit history.
Candidate cases now deny metadata-only deletion and slot reuse, then execute
honest cleanup. Additional sources exercise 107+107 legacy chunks, 100-chunk
selected snapshots, 200 public entries, stale deleting slots, physical All
counts, quota release proofs and the 20/21-access calibration. A passing narrow
case is not a full-candidate proof.

The existing `tests-cloud-ui/cancelled-registration.spec.ts` exercises the same
real UI removal against both frozen and candidate rules. The new
`tests-cloud-ui/security-migration.spec.ts` checks the actual sent-row published
label under old rules, and the unavailable-profile UI plus unauthenticated
missing-profile denial under new rules. No SDK responses are mocked to grant
compatibility. The Node removal case uses the existing fake IndexedDB backend
but executes the real scoped-storage transaction; UI cases use browser storage.

The 63 `tests-cloud/security-migration.test.ts` cases passed in `npm run test:cloud`
at Release 1 (`2f727389`); receipts are in the [release ledger](releases.md#release-1-2026-09-25).
Rerun `npm run test:cloud` and the two UI specs on the separately configured
local demo app after rule changes. These fixtures temporarily load old rules
into `demo-play100` and restore candidate rules in teardown: run with one worker and exclusive ownership of those emulator ports,
never alongside another validation or against production. No case inventories
real users or proves malformed/dangling legacy metadata recoverable. The
12-generation case deliberately has valid manifests, payload and expired
timestamps; young in-flight generations may need to age, and dangling registry
IDs or missing/corrupt payload still require operator preflight.

## Profile reads and handles

Missing publicProfiles documents are readable only by the verified owner.
Hidden/unpublished and missing profiles look unavailable to other readers.
`SocialStore.ownProfile` maps permission-denied to null; `SocialStore.profile`
already maps denied handle/resolved-profile reads to null. Other errors surface.
Call sites: OnlineController profile refresh and export; CreatorPage inspection;
FriendStore.publicIdentity (used by outgoing FriendManagerFeed and FriendDetailPage);
and PublicProfilePage's handle lookup. Owner-only mutation transactions do not
swallow authorization failures.

New handle claims reject reserved prefixes, including `leul_tew`,
`play100_official` and `support_team`. Existing syntax-valid legacy handles remain
readable so an owner can rename/unpublish; new publication requires a compliant
handle, and the publication UI shows the reserved reason before preview.
Prefix blocking deliberately also rejects benign names beginning `account`,
`system` or `creator`; that over-blocking is an anti-impersonation choice.
Since R9 the reserved prefixes also match their `1`/`l`/`i` and `0`/`o`
confusables (for example `p1ay100_fan`, `adm1n_x` and `0fficial`); the rules
alternation and `normalizeHandle` derive from the same word list, and a unit
test pins them together.

**Display names (R9).** Member, public-profile, friend-identity and invite
names must be 1-60 characters with no Unicode control or format character
(`\p{Cc}`/`\p{Cf}`: C0/C1 controls, bidi embeddings, overrides and isolates,
zero-width characters, U+FEFF) and no leading or trailing separator (`\p{Z}`).
Rules check this with RE2 `matches()`; the client applies the same rule after
trimming and shows plain error text. An update may keep an unchanged legacy name
(for example an icon-only change, invite consumption or unpublish), but any new
or changed name must be clean, and creating an invite requires a clean identity
name. Format characters include ZWJ and emoji tag characters, so some emoji
sequences are refused; that over-block is accepted. Other users' names render in
`<bdi>` so a right-to-left name cannot reorder the surrounding text.
The publish transaction already deletes the old handle when changing it;
rules now require that atomic deletion on both rename and profile deletion.
Deleting/recreating a profile cannot leave a new hoarded claim behind. Full
profile cleanup also removes and verifies its empty public-generation registry;
nonempty or inconsistent settings keep deletion incomplete. An existing handle resolves only while
its profile still points to it, including owner reads. Legacy orphan handles
do not redirect to unrelated current identities; owners/operators may remove
them, but no blanket public handle listing is enabled.

A profile can reference a missing or foreign-owned handle only after an
out-of-protocol/admin change: publishing requires the after-handle owner to equal
the profile UID, and handle deletion requires an absent or renamed profile.
Promotion inventory checks both those broken profile references and handles
whose owner's profile is absent or points elsewhere. Do not overwrite another
owner's claim to repair a malformed profile.

## Creator identity and shared devices

Creator authorization uses `_owner/config.uid`, not mutable/recycled email.
This protected document remains unreadable/unwritable by clients. Emulator
fixtures seed the UID and test same-email/different-UID denial. A missing owner
document or `uid` fails closed for creator powers only: ordinary publishing keeps
working, and the rules suite covers both states.

Ordinary Sign out retains the scoped local cache. The separate confirmed
**Sign out and remove this device's copy** action blocks dirty changes and checks
the exact revision again inside the deletion transaction. A dirty or unreadable
copy is refused before automatic sync and sharing are suspended; a refusal after
the final write drain restores the same still-signed-in sync and sharing
lifetimes, and never resumes them after an identity change or server revocation.
A concurrent write leaves the copy intact even after Auth sign-out. Other accounts and guest data
are untouched. Integration must preserve the newer P5 post-commit motion-hint
removal inside `deleteScopedLibrary`; this change adds a guard, not a namespace.
The password entry accepts up to Firebase's 4096-character policy maximum.

## Ordered parent-only rollout

The only authoritative promotion sequence is the runbook's
[Promotion order](security-release-runbook.md#promotion-order); this section
keeps no second numbered list. Its constraints, in brief: preserve the published
rules and verify the owner UID first; the compatible client ships before the
candidate rules; only the parent publishes rules and records the full SHA;
production smoke follows promotion; and rollback prefers roll-forward or a
client-only rollback, with the retained `971b0fe6...` rules as a last resort
that suspends H5 bounds. The table below explains why each change is client-first.
| Change | LIVE 270f client with new rules | Required sequence |
| --- | --- | --- |
| F1 report confidentiality | Own missing/existing reads remain compatible for delimiter-safe IDs; H5 now additionally denies old uncounted report writes | Counted-report client first; custom UID format support is not claimed |
| H1 cancelled recovery | Old client still cannot self-remove a verified cancelled sign-in | Recovery client first |
| H2 pending identity | Old outgoing list reads are denied instead of a name/icon | Public-snapshot client first |
| H3 declined retry | Old immediate retry receives denial; no neutral precheck | New client first |
| H4 profile oracle | Old direct ownProfile calls may surface denial for missing peers | Null-mapping client first |
| H5 private registry eight | Old allocation can exceed client-side cap and receive denial; shrinking works | New cleanup/cap client first; inventory oversized data |
| H5 public registry four | Old generation creation lacks enrollment and is denied | New compatibility client first, then rules |
| H5 verified release | Old parent deletion lacks release/countdown proof and is denied; new cleanup resumes safely | Current cleanup client before rules |
| H5 groups/blocks/reports/pairs | Old creates lack registration/counter proof; old pending acceptance and re-request lack own proof touches | Current client first; old-client safety-action limits are explicit in runbook |
| H5 counted All format3 | Old format2 row/job writes are denied, and old parsers cannot read the new format | Current sharing client and additive READY indexes first |
| H5 deletion marker | Old parsers cannot read a head carrying cleanupEpoch; old full-deletion flow cannot prove completion | Keep a compatible current client during repair; no old-client full-deletion claim |
| Ranking 16 MiB allocation | Normal old generator output fits; new oversized raw allocations are denied, old 20 MiB reads/cleanup remain | Cap is separately droppable; private remains 20 MiB |
| H6 reserved/atomic handle | Old transaction already releases its old handle; old reserved claims are denied | New validation/read compatibility client first |
| H7 creator UID | Old client asks the same ownerAccess endpoint | Console UID addition before rules |
| H11 device removal | Old Sign out still retains its cache | New optional client action; no rule dependency |
| H13 password length | Old UI truncation remains | New client; no rule dependency |

Stage 2 adds `social-profile.test.ts`, legacy/cap/handle/UID emulator cases,
and scoped-cache deletion race tests. The emulator cases passed in
`npm run test:cloud` at Release 1 (`2f727389`), including security-hardening 15
and security-migration 63; see the [release ledger](releases.md#release-1-2026-09-25).

## Headers, auth proxy and supply chain

The main document uses COOP `same-origin` and CORP `same-origin`, without COEP.
Source Google sign-in, linking and reauthentication use redirect methods only;
no popup methods or window.opener flow were found. Its validated production
authDomain is the application origin. The now-redundant firebaseapp.com origin
is removed from main connect-src/frame-src; upstream proxy destinations and the
separate auth-helper policy are not changed by that removal.

Main connect-src also lists `https://apis.google.com` (CSP-GAPI-01), the origin
script-src already trusts for gapi. Firebase Auth loads `gapi.iframes` from it
for its hidden auth iframe, and that module's gen204 logger sends a sampled
(rate 0.001 to 0.01) `fetch(<api.js origin>/js/gen_204?c=50:1, no-cors)`
whenever gapi's random helper mints an rpctoken for a child iframe. Blocking it
only drops Google telemetry, but it logs a connect-src violation. The
auth-helper policy is unchanged: the helper's handler.js and iframe.js bundle
their own iframes code with no gen204 logger, and the ping only runs where the
apis.google.com module opens a child iframe, which is the main document.

**CSP least privilege (R9).** Main connect-src no longer lists
`https://firebaseinstallations.googleapis.com`: `src` imports only
`firebase/app`, `firebase/app-check`, `firebase/auth` and `firebase/firestore`,
none of which calls Firebase Installations, and the optional App Check path
needs only the sources in `APP_CHECK_CSP_SOURCES` (added when it is enabled).
Two sources stay on purpose:
- `frame-src https://accounts.google.com`: Google sign-in, linking and
  reauthentication return through it, and that return flow cannot be verified
  until a real production Google sign-in. Remove it only after that smoke shows
  no frame of that origin.
- The offline-variant style hash: one vercel.json policy serves both the online
  and the offline build, and `check:csp` requires the other variant's inline
  style hash, so dropping it would break an offline deployment.

Trusted Types (`require-trusted-types-for 'script'`) was considered and
rejected: the Firebase Auth helper path loads gapi by assigning a script `src`
URL, which needs a policy we don't control, so enforcing it would break sign-in.

CORP `cross-origin` overrides apply only to `/social-card.png`,
`/social-card.svg`, `/favicon.svg`, `/pwa/icon-192.png`, `/pwa/icon-512.png`,
`/pwa/icon-maskable-192.png`, `/pwa/icon-maskable-512.png` and
`/pwa/apple-touch-icon.png`. These are public social/launcher assets, not account
or API resources. The integrator must verify actual header override behavior,
scraper image access and redirect sign-in on the intended origin.

**Client env exposure (R8-ENV-01).** Only the named public Firebase fields
(`VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID`, the legacy
`VITE_FIREBASE_CONFIG` check) and the App Check flag and site key are compiled
into the client; `scripts/client-env-guard.ts` fails the build if any emitted
chunk inlines the whole `import.meta.env` object (a `BASE_URL` property or a
`VITE_VERCEL_*` system variable).

**SEC-01: fresh per-response nonce on the auth helper documents.** The two HTML
helpers, `/__/auth/handler` and `/__/auth/iframe`, rewrite to
`api/auth-helper.ts` with a fixed `page`. The function GETs the fixed upstream
`https://play100-online-48823b32.firebaseapp.com/__/auth/<page>` with only
`Accept: text/html`: no client query, Cookie, Authorization or other header is
forwarded. It then replaces exactly the value in `nonce="firebase-auth-helper"`
with 16 random bytes (base64), and sends that nonce in its own CSP. All other
bytes are unchanged. The policy is otherwise the previous helper policy, with
`frame-ancestors 'self'`, X-Frame-Options SAMEORIGIN, private/CDN no-store,
nosniff, `no-referrer`, HSTS and Permissions-Policy. It fails closed with a
static no-store 502 and a counts-only log unless all of these hold:
- the literal count equals the attribute count, and is at least 1;
- no other `nonce=` attribute exists;
- the only `{{` is the handler's `{{POST_BODY}}` slot.

Also:
- upstream non-200, non-HTML, invalid UTF-8 and bodies over 256 KiB return 502;
- the 5 s upstream timeout returns 504;
- a client disconnect aborts the upstream fetch;
- a 3xx passes through only to a same-origin `/__/auth/` path.

Evidence: the parent's read-only capture recorded the handler (462 B) and
iframe (364 B). Each was byte-identical across query strings, with one nonce
attribute, one literal and one inline script, no style or `on*` handler, and
upstream `Cache-Control: max-age=1800` with no CSP or Set-Cookie. Tests use
synthetic fixtures with the same markers (`src/lib/auth-helper-proxy.test.ts`).

**GET/HEAD only.** Every other method gets 405 with `Allow: GET, HEAD` and is
never sent upstream. Firebase Hosting substitutes a POST body into the handler's
nonced `var POST_BODY = '{{POST_BODY}}'` script, and a fresh nonce cannot
protect an injection inside an already-nonced block. The app enables only
Google and Email/Password, with redirect flows that return via GET. **Provider
coupling:** adding a `form_post` provider (Apple, SAML, some OIDC) requires a
separately reviewed POST path first.

**Header precedence.** Vercel matches a `headers` `source` against each incoming
pathname (https://vercel.com/docs/project-configuration/vercel-json#headers).
Its docs do not define which value wins when a config rule and a function set
the same key. So no config rule matches the two helper documents:
- the main rule's `/((?!__/auth/).*)` excludes them;
- the static helper rule is narrowed to `/__/auth/(handler|iframe|experiments)\.js`;
- the only CSP there is the function's.

`security-headers.test.ts` pins this. The three script paths stay plain fixed
no-store rewrites; no configuration carries a static nonce any more. A direct
`/api/auth-helper` request also receives the main rule. Whichever CSP wins there is
either the fresh-nonce policy or the stricter main policy, which blocks the script.

The application uses password reset/verification, not email-link sign-in:
`sendSignInLinkToEmail` and `isSignInWithEmailLink` are absent, and the unused
`/__/auth/links` paths stay removed. Rollback is Vercel Instant Rollback to the
previous deployment, which restores the plain rewrites.

Vercel installs with `npm ci`. The GitHub workflows (CI, CodeQL, Dependency
review, Secret scan) remain in the repository but are disabled by the owner, so
`npm audit` and `npm audit signatures` run locally after each install as part of
the release gate (local suites plus review; README "Quality checks"), and the
maintainer's full-history Gitleaks scan remains a pre-merge step.
Registry availability/signature failures remain real failures for review, not
reasons to bypass integrity. This does not replace Dependabot, code scanning or
runtime testing.

Two dev-only advisories in the Firebase emulator tree are closed with scoped
root `overrides` in `package.json`, mirroring the ones firebase-tools declares
(npm ignores a dependency's own overrides): gaxios 6 gets `uuid@^11.1.1`
(GHSA-w5hq-g745-h8pq; gaxios only calls `v4()` through CommonJS `require`, which
uuid 11 still exports) and `@google-cloud/pubsub` gets `@opentelemetry/core@^2.8.0`
(GHSA-8988-4f7v-96qf; pubsub only constructs `W3CTraceContextPropagator`, which 2.x
keeps). `scripts/dependency-overrides.test.ts` fails if the lock resolves a
vulnerable version again. Remove an override once its consumer depends on the
patched version itself.

**Install scripts (R9).** npm 12 blocks dependency lifecycle scripts unless
`package.json` `allowScripts` approves them. Four packages in the lock have one,
and each is approved at its exact locked version:
- `esbuild@0.28.2` (dev, Vite's bundler): its postinstall checks that the
  platform-specific esbuild binary package was installed and works.
- `protobufjs@7.6.6` (through Firestore's gRPC loader, used by the Node SDK path):
  its postinstall only reads the parent `package.json` and warns if a dependent
  pins an incompatible version scheme; it writes and downloads nothing.
- `re2@1.26.1` (dev, optional, in the Firebase emulator tree): its install step
  fetches a prebuilt native RE2 binding from the project's GitHub releases, or
  builds it with node-gyp. It is not part of the client or API bundle.
- `@firebase/util@1.15.3` (runtime): its postinstall does nothing unless
  `FIREBASE_WEBAPP_CONFIG` is set (Firebase App Hosting auto-init); then it may
  fetch that app's web config and write it into the package as build-time
  defaults. The app never sets that variable and configures Firebase explicitly
  from the named `VITE_FIREBASE_*` fields.

Pinned approvals keep today's install behaviour and make npm refuse any new or
changed script. A version bump of any of these packages, or a new package with
an install script, needs a fresh review of its script before its entry is
updated; never approve with a wildcard.

Both the main rule and the auth-helper rule send
`Strict-Transport-Security: max-age=63072000; includeSubDomains` explicitly, so
HSTS does not depend on a platform default. `preload` is deliberately omitted:
`vercel.app` is already a preloaded public suffix, and preload submission only
makes sense for an owned apex domain. HSTS is not copied into the worker's
`documentPolicy`, because browsers ignore HSTS from service-worker responses.

### CSP style candidate: separate acceptance gate

Static source inspection found an inline noscript style in index.html and an
inline style block in the offline fallback. Public SVG assets use presentation
attributes, not style attributes/blocks. Application React style props, motion
objects and dnd-kit transforms use CSSOM; Three r186's canvas path uses
canvas.style width/height/display and a data-engine attribute. These are not
evidence of a successful strict-CSP browser run.

Firebase Auth 12.19.0 passes a style object to dynamically loaded gapi.iframes.
The inspected public gapi api.js loader contained no literal style setAttribute/
cssText write; platform.js contained two cssText assignments. The dynamically
loaded iframe module is not a pinned application asset. Browser compatibility
therefore remains uncertain and must be proved on the exact headers, including
the sign-in sheet, redirect flow, avatars, WebGL, dialogs, drag/reorder, noscript
and offline pages.

The live 270f worker rebuilt cached responses with only Content-Type and length,
dropping their security headers. SW-served HTML therefore lacked CSP and
isolation headers even when network HTML had them. Closing this defense-in-depth
gap is a **retained fix**, independent of whether strict style permission passes
its browser gate.

The build embeds an allowlisted `documentPolicy` from the final effective main
Vercel rule: CSP, COOP, CORP, referrer policy, nosniff, framing and permissions.
Its digest participates in the PWA version, so a header-only deploy or rollback
changes the worker/core identity. Cookies, auth-template policy and arbitrary
private headers are never copied into that policy. The worker verifies its
policy digest before installation and serves it on cached shell and offline
fallback documents instead of trusting whichever headers a fetch returned.

Each ready core records its own document policy. A retained old HTML response
keeps that old policy rather than a newer CSP containing incompatible critical
CSS/script hashes. Legacy headerless prior HTML is refused with a protected
offline error; its correctly bound JSON and hashed chunks remain available.
Already-open pre-update documents are not silently reloaded or retroactively
declared CSP-protected. An explicit new navigation loads the new protected shell.

Noscript/offline declarations are externalized to `/pwa/fallback.css`, included
in the bounded offline core, in the same retained change. These styles work under
the current policy and do not depend on removing `unsafe-inline`.

Only the final main-style policy change and its specific test are droppable.
I must retain that strict candidate only after an owned real browser records
**zero CSP violations** with the intended headers present. If it fails, omit
only that final candidate; keep security-header retention and fallback styling.
The Google-template helper policy is not included in main-style tightening.
The first-paint pipeline's inline critical CSS requires its exact sha256 in
style-src when strict style is used. Adding a hash or nonce can itself cause
`unsafe-inline` to be ignored, so merely leaving that keyword is not proof of an
unchanged allowance. First-paint HTML changes run only in a build-time post
`transformIndexHtml`, before the PWA `writeBundle`; there are no later HTML or
configuration writes. The committed root `vercel.json` is the sole policy source,
including the fixed boot-script hash. The read-only `check:csp` acceptance gate
then checks final HTML against that policy and the emitted document policy.
Whichever integration lands second must add the printed final critical-style
hash when applying strict style and keep those exact hashes aligned; a directive
mixing `unsafe-inline` with a hash/nonce is not an accepted intermediate policy.

SECURITY-01 (branch `leultew-sec-strict-style`) is the single droppable commit: main
`style-src 'self'` plus one `sha256` per first-paint variant, online (Firebase or
emulators configured) `'sha256-NGUjOxY76/cGN3gmM/YONiEbuC6rhQrQEr9XDkz0oxs='` and
offline `'sha256-yoYUnUqLaGmW5eJpbrdR7YmLQEZzKihnuFrDIgUKkdw='`, recomputed from the R9 chain
build (the values each release shipped are in [releases.md](releases.md)). Every build recomputes both variants' inline styles and fails, naming the
hash to add, unless `vercel.json` lists exactly those hashes, so any critical-CSS
change must update them in the same change. React `style={{}}` props and the app's
`el.style`/`setProperty` writes go through the CSSOM and are not governed by
`style-src`; `style=` attributes in built HTML are refused by the build check.
Static review of the pinned bundle (Firebase Auth/App Check/Firestore, dnd kit,
three, React DOM, DiceBear) found no style-attribute writes or runtime `<style>`
elements on paths the app uses; gapi's `gapi.iframes` applies Firebase's hidden
auth-iframe style object through `iframe.style`. `tests/strict-style-csp.spec.ts`
(every main route, dialogs, and a legacy-versus-strict layout comparison) and
`tests-cloud-ui/strict-style-csp.spec.ts` (Account sign-in, Google redirect and
reauthentication on the Auth emulator's development server, which injects its own
CSS elements, so it enforces `style-src-attr 'none'` and records any other added
`<style>` element) must record zero violations on desktop and mobile before
adoption; otherwise drop the commit.

| Remaining rollout item | LIVE 270f compatibility / owner |
| --- | --- |
| H8 nonce and five helper routes | SEC-01 fresh per-response nonce via `api/auth-helper.ts`, GET/HEAD only; production auth smoke required |
| H9 COOP/CORP and main auth-origin reduction | Redirect-only source compatible; verify final public headers and share-image override |
| Main strict style candidate | Not approved by source alone; retain only with exact-header browser proof |
| H10 instance limiter + WAF | Per-instance limits cannot stop distributed-instance abuse; parent/I per-IP WAF evidence required |
| H12 npm ci/signatures | Local install/build gate only; no runtime account change |
| H14 controls | Parent's dated black-box evidence above; App Check/reCAPTCHA accepted risks, not enforced. Authenticated console still required for UID setup and rules publication. |
