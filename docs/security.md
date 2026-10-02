# Security hardening and release gates

## Anonymous operational signals

The main document policy reports to the first-party `/api/csp-report` endpoint
using `Reporting-Endpoints`/`report-to`, with `report-uri` as a fallback. Since
R24 the sign-in helper documents (`/__/auth/handler`, `/__/auth/iframe`) report
there the same way, from their own policy. Their URLs carry the sign-in query:
the public API key, the return URL and, on the way back from the provider, its
one-time state and code. The endpoint keeps only their route template, as it
does for every other document.
Only POSTs with CSP report media types
are accepted, with a 16 KiB body cap, a three-second read deadline, at most 16
reports per batch and per-instance admission (4 active / 30 per minute). The
handler emits one structured counts line containing only a known directive,
an exact allow-listed app, Google/Firebase or catalog origin (or
`inline`/`eval`/`other`/`other-origin`) and a fixed route template. Unrecognised
hostnames, including arbitrary subdomains of allowed providers, become `other-origin`.
Paths, queries, fragments, samples, IP literals, user agents and account/visitor
identifiers are not logged. Raw reports are discarded, not persisted. Browsers
and hosting infrastructure necessarily handle the original network request;
this does not change the provider's own request logging or retention policy.

A credential-free daily Vercel cron (06:00 UTC, subject to the hosting plan's
scheduling precision) calls `/api/operational-probe`. Its fixed destinations are
the production auth handler twice, Wikidata site information and FreeToGame game
1. It requires HTTP 200 and a single fresh nonce CSP on each auth response, using
the same nonce checks as `release:verify`, and bounded valid catalog responses.
It logs one structured OK/FAIL result, never response bodies, URLs or credentials.
Public callers cannot choose destinations or query parameters. Both success and
failure are cached for 15 minutes per instance. Cached replies do not consume
admission; uncached calls share a probe and are capped at 4 active / 12 per
minute. Per-instance limits do not replace the global WAF control. These checks
report faults, not successful real-user sign-in.

Production error boundaries also send anonymous counts to the first-party
`/api/client-error-report` endpoint. The only fields are a fixed error class,
component area (`app`, `route`, `online`, `chunk`, `dialog`), route template, count and a
build fingerprint (`entry:<content hash>` from the same-origin entry script).
No message, stack, full URL, query, IP, user agent or account identifier is
included or logged. Dialog render faults use `dialog`, separate from routed-page
faults; the endpoint still accepts all four earlier areas for older clients.
Unknown classes/routes become fixed categories. Missing
or invalid fingerprints disable sending; development does not send reports.
An eager shim snapshots only the error class, component area and current
pathname; the reporter loads on the first fault, reduces that pathname to a
fixed route template and drains at most 20 queued counts. Error objects,
messages and stacks are not retained by the import queue. Failed imports are
not retried. The client batches with `sendBeacon` after five seconds or when the page hides,
with at most 20 errors and four attempted batches per page, no storage and no
retry. The endpoint rejects extra fields, caps the JSON body at 8 KiB and each
batch at 20 counts, and shares the CSP reader's three-second deadline with its
own per-instance admission (4 active / 30 per minute). Beacons are best-effort
and are not visitor analytics or a complete error census. Counts can be spoofed;
they are diagnostic hints, not trusted security evidence.

The project owner reviews these signals on a fault or abuse signal and by
2026-10-02 with the WAF decision, following the
[daily and post-deploy checks](release-operations.md#11-daily-and-post-deploy-operational-checks).
Endpoint code and the cron definition are
pending the ordinary release/deployment gate; their presence is not evidence
that production reporting or a scheduled run has occurred.

These rules and client changes are a prototype pending the release operator's actual
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

The release operator reviewed the supported sign-in source paths: Firebase assigns IDs for
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

**Invitation links: keep it private.** A valid invitation read includes the
inviter's `ownerUid`, needed for acceptance, so a link holder can connect the
inviter's friend identity to their public profile, if published.

After a decline, the original sender waits 30 days before another request.
The decliner may initiate sooner. Firestore compares the existing server-written
`updatedAt` against `request.time`; the new timestamp must equal request.time.
The client says only that a request cannot be sent right now, not why.

After cancelling their own request, a sender waits 10 minutes (R12) before
requesting the same person again, with the same server-time comparison. They
also cannot delete the cancelled pair sooner, which would otherwise let them
create a fresh request at once; the other person may request, or release the
pair, immediately, and account deletion is unaffected. Ten minutes turns a
request-and-cancel loop into a few requests an hour, while a sender who
cancelled by mistake waits only briefly. The client says so in plain text and
skips such a pair when freeing pair capacity, so at the 1,000-pair cap a fresh
cancellation frees its slot after those ten minutes. **Accepted residual:** a
sender who withdraws by blocking and then unblocking the recipient leaves the
pair `removed`, which has no hold, because a hold there would also delay every
re-request after an unfriend. Each such cycle needs a block and an unblock, and
the recipient's own block stops all requests from that sender.

**Accepted residual: block status is inferable (R12).** A block is private, but
its effect shows to the blocked person. Their request to someone whose profile
is published and live fails only on the block check (`fUnblocked` in the pair
quota's `pairQuotaAuthority`), while their requests to other people succeed;
the client shows only the generic authorization message. A signed-in read of
the blocker's current invitation is denied ("This invite is no longer
available."), while the same link read signed out succeeds (the invitation
rule's `fUnblocked`, which applies only to signed-in readers). Either comparison
tells the blocked person that the other person blocked them. This is accepted:
hiding it would need a request that looks sent but is never delivered and
signed-in invitation reads that look like signed-out ones, which is a lifecycle
redesign with extra reads. The block's protections do not depend on secrecy:
no request, pair, identity read, invitation acceptance or shared data gets
through, and the invitation's name and icon are what anyone holding the link
sees signed out anyway.

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

The release operator performed read-only public-API probes on **2026-09-23**, using the
public web key from live 270f (redacted in the receipt). The console canvas was
signed out; no credentials were entered and no writes were made. This is
**black-box readback, not console readback**. Operator-held receipt:
`firebase-h14-evidence-20260923.json`, SHA-256
`9b10b5d1efc660b268faf7fdb1f5c370ea9e5cf9ff216e8a59b353ccb2f74f0f`.

- Referrer restriction: empty/foreign Referer returned
  `403 API_KEY_HTTP_REFERRER_BLOCKED`; the app origin returned 200. A Referer
  header is client-asserted, so this is browser-abuse friction, not authentication.
- API restriction: Books returned `403 API_KEY_SERVICE_BLOCKED`, so on that
  date the key refused at least that one API. Generative Language is disabled
  in the project, which says nothing about the key.
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

**2026-09-27 re-probe (G5 readback, carried into G8).** The same nine probes ran again
(operator-held receipt `firebase-settings-readback.json`, SHA-256
`c7089f627227b6515a6d6ce60e03cf73a15effd4b09b53ad63fb55ea2b4f25db`). With the
production origin as Referer, Books and Generative Language both returned
`403 SERVICE_DISABLED`: those services are disabled in the project. That neither
renews nor contradicts the 2026-09-23 result, and a black-box `SERVICE_DISABLED`
is not evidence of the key's API allowlist. The intended allowlist is Identity
Toolkit API, Token Service API and Cloud Firestore API; Firebase App Check API
would be added only once App Check is enabled. The client calls no Installations
endpoint.

**2026-09-28 Authentication console readback (G8 supplement 1, 06:40:52Z).**
The owner-authorised receipt `firebase-console-readback-20260928.json` recorded
Email/Password and Google enabled, with sign-up, account deletion and email
enumeration protection enabled. Authorized domains were exactly
`play-100-collection.vercel.app`, `play100-online-48823b32.firebaseapp.com` and
`play100-online-48823b32.web.app`; localhost was absent. The console offered
deletion only for the custom production domain, not the two default domains.
Fraud-prevention reCAPTCHA was **not set up**; that page covered SMS defense.
The project remained on **Spark**, without the **Identity Platform** upgrade
required for email/password reCAPTCHA protection. No setting was changed.

**2026-09-28 console readback (G8 supplement 2, approximately 07:15Z).** The
owner-authorised readback of **Browser key (auto created by Firebase)** recorded
**Restrict key, 4 APIs**: Cloud Firestore, Firebase Installations, Identity
Toolkit and Token Service. The key is restricted, not unrestricted. The intended
least-privilege list remains the three APIs above. No key setting was changed
then. The operator-held receipt is `firebase-predeploy-console-20260928.json`;
follow the [readback runbook](security-release-runbook.md#firebase-browser-key-readback).

**2026-10-01 owner decision (04:25:52Z).** Firebase Installations was removed,
leaving exactly Cloud Firestore, Identity Toolkit and Token Service. The console
readback shows "HTTP referrers, 3 APIs". With the production origin as Referer,
an Installations request now returns `403` ("Requests to this API … are
blocked"), Identity Toolkit returns 200 and Token Service rejects an invalid
refresh token with `400 INVALID_REFRESH_TOKEN`, so the key still serves the app.

**Risk owner: project owner. Review by 2026-10-02 with the planned WAF switch,
or on any abuse signal, whichever comes first.** This review covers App Check
off, reCAPTCHA Auth protection not set up and Spark quota denial of service;
the date is a review commitment, not a claim of enforcement.

App Check remains an **accepted risk with a plan**: Spark quotas bound cost,
while auth/ownership rules and the proposed caps constrain permitted writes.
Quota denial of service remains possible. reCAPTCHA would add third-party
scripts/cookies, widen CSP and require a Data Use disclosure change; it is not
silently enabled by this batch. Email/password reCAPTCHA Auth protection also
requires the Identity Platform upgrade, which this project has not adopted;
that prerequisite and enabling protection remain owner decisions. Existing
enumeration protection, password policy and rules controls do not remove the
accepted abuse risk.

**Review decision, 2026-10-02 (the review due above).** App Check stays off
and reCAPTCHA Auth protection stays not set up: the accepted risk above is
renewed, still owned by the project owner. The WAF switch is tracked
separately, in the runbook. Readback, about 00:43Z (operator-held receipt
`firebase-config-readback-20261002.txt`, secrets redacted, SHA-256
`0d5b16534dee4620b7f3279181f28de97383834e3d13ed56a40380b991c8b576`):
- App Check is not enabled: the Firebase App Check API has no enabled
  service in the project. No production client can send a token either: the
  build refuses `VITE_APP_CHECK_ENABLED` while the main CSP lacks App Check's
  sources, which it does.
- The project is on Spark, so abuse can exhaust the free quotas, a denial of
  service, but cannot run up a bill.
- The browser key allows only Cloud Firestore, Identity Toolkit and Token
  Service, and only from the production and `firebaseapp.com` referrers. It is
  unchanged since the 2026-10-01 owner decision. Email enumeration protection
  is on.

Rationale: the rules admit writes only from signed-in accounts, almost all only
from verified ones, to their own documents or through per-account quotas. So
automated abuse needs many accounts and gains only what each account may do
anyway; what it can still cause is the quota denial of service above.
Enforcing App Check would refuse every request without a token, which today is
every client, including installed and cached older versions, until each
updates. The runbook's monitor-first path, a token-sending client observed for
at least seven days before enforcement, therefore comes first. reCAPTCHA v3
would also add Google scripts and cookies, widen the CSP that R24 just
narrowed, and need a Data Use change. Email/password Auth protection needs the
Identity Platform upgrade as well.

Revisit when any of these happens:
- an abuse signal: unexplained growth in sign-ups, sign-ins, reads or writes, a
  Spark quota warning or exhaustion, or rule denials at unusual volume;
- the project moves to Blaze, where quota abuse becomes cost;
- a new Firebase product or API is added to the browser key, or a new write
  path opens to accounts;
- the owner adopts the Identity Platform upgrade.

Otherwise review again by 2027-01-02.

**Sign-up enumeration (accepted risk, R9).** Creating an account with an email
that is already registered fails with `auth/email-already-in-use`, which
`src/cloud/errors.ts` maps to its own message and the online session's email
sign-up (`useOnlineSession`, `createUserWithEmailAndPassword`) shows, so the sign-up form reveals whether an email is registered. Firebase
email enumeration protection covers sign-in and `createAuthUri`, not account
creation, so it does not hide this. The copy is deliberately unchanged: a
generic message would leave real users unable to tell they should sign in
instead. Potential mitigations are reCAPTCHA Auth protection (requiring the
not-yet-adopted Identity Platform upgrade for email/password) or App Check
enforcement to limit automated probing; adopting either is an owner decision.

The authored client (`src/cloud/app-check-client.ts`) uses the **reCAPTCHA v3**
provider (`ReCaptchaV3Provider`), which works on Spark without billing, behind
the build flag `VITE_APP_CHECK_ENABLED` (default off; see
`src/lib/app-check-config.ts`). reCAPTCHA Enterprise is an unimplemented
alternative; switching would need a different provider class, key type and
review. If adopted, follow the runbook's App Check section: ship that client
first, observe verified-request ratios for at least seven days, then enforce
Firestore followed by Auth. Update CSP and Data Use before enabling that
traffic. Roll back by un-enforcing, not by weakening rules.
The API limiters are per instance, not global per-IP protection, and only work
that reaches upstream takes a slot: a FreeToGame detail lookup, or one during
Wikidata's rate-limit cooldown, takes none, since it fetches nothing. One shared
bounded-admission helper (`api/_lib/admission.ts`) caps detail at 4 active and
30 uncached lookups per minute, search at 6 active and 90 upstream searches
per minute, and the Firebase sign-in helper at 8 active and 120 upstream
template refreshes per minute, releasing each slot in `finally` (success,
failure or client abort). A refused request gets 429 with `Retry-After`. The
sign-in helper takes a slot only to refresh its cached template (SEC-01's
template cache), so page loads and HEAD take none.
Concurrent cold FreeToGame requests share one snapshot fill, and search upstream
responses must be `application/json`. The Vercel WAF rule in the runbook is the
intended global control, but it runs in Log mode, which records matches and
blocks nothing, until its scheduled switch to 429; until then only these
per-instance limiters bound requests. The rule and its deployment evidence
remain with the release operator.

### Preview referrers and production smoke

Preview and candidate origins are intentionally excluded from the browser
API-key referrer allowlist. The 2026-09-28 console readback recorded a
**Websites (HTTP referrers)** restriction with three entries:
`https://play-100-collection.vercel.app/*`,
`https://play100-online-48823b32.firebaseapp.com/*`, and
`https://play100-online-48823b32.web.app/*`. The first is the production origin;
the second is the existing Firebase helper origin. The third is Firebase's
default hosting domain, not used by the app's production origin. **The owner
removed it on 2026-10-01 (04:25:52Z)**, leaving the first two. A request with the
`web.app` Referer now returns `403` ("Requests from referer … are blocked"); the
production and `firebaseapp.com` Referers still return 200. The previous
three-entry list above is the rollback value. This restriction is distinct
from the Auth authorized-domain list above. A blocked preview request is expected,
not a reason to broaden the key's restrictions or record an online/Auth pass.
Real online and Auth smoke tests therefore run on production only, after
promotion and with operator approval. Local demo-emulator tests use synthetic
configuration and remain the pre-promotion validation path.

**Promotion-time option, not performed:** after verifying the proxied
`/__/auth/*` sign-in, linking and reauthentication flows on production, the release operator
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

**H5 remains a release gate until the release operator verifies the complete candidate
and the release operator reviews its receipts.** The original metadata-only deletion loop
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
cannot bypass that cooldown. A cancelled pair is held against its sender the
same way for 10 minutes (R12). Legacy pairs retain their original shape and
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

The table below retains the accepted H5 index baseline recorded with the account-only deletion recovery action.
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

### STORAGE-02 accounting (deployed 2026-10-01)

**Deployed** 2026-10-01 between 20:53 and 20:55Z: the release operator added the 13
overrides below one by one with `gcloud firestore indexes fields update
--disable-indexes`, changing no composite and no other override. All 18 field
operations finished SUCCESSFUL by 21:03Z. Readback: the ten composites are
READY and the 18 overrides equal `firestore.indexes.json` exactly. A read-only
production query smoke on empty parent paths passed 13/13: ten client query
shapes, including the format-2 rollback pages, returned results without an
index error, and three negative controls on exempted fields (`entries.token`,
`chunks.holder`, `generations.ranking`) were refused with
`FAILED_PRECONDITION`. The figures below remain calculations, not measured
storage.

This change covers only 13 exact single-field overrides: `entries.token`,
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
Only the release operator's before/after readback after READY/backfill may establish the
deployed result. Follow the runbook; all runtime commands remain with the release operator.

`ranking-envelope.test.ts` emits exact serialized and base64 sizes for a
deterministic 100-record fixture, a 1,000-record fixture and the maximum escaping
fixture. These are synthetic examples, not observed user averages. Their current
execution receipts must be recorded by the release operator; source changes do not establish
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
never alongside another validation or against production. The two UI specs
enforce the worker count themselves: in a run with more than one worker they skip
before loading any rules (the release gate fails them instead), and their
`@emulator-rules` tag lets such a run cover them in a one-worker pass,
`--workers=1 --grep @emulator-rules` (REL-10 in the
[intermittent register](intermittents.md)). No case inventories
real users or proves malformed/dangling legacy metadata recoverable. The
12-generation case deliberately has valid manifests, payload and expired
timestamps; young in-flight generations may need to age, and dangling registry
IDs or missing/corrupt payload still require operator preflight.

## Profile reads and handles

Missing publicProfiles documents are readable only by the verified owner.
Hidden/unpublished and missing profiles look unavailable to other readers.
`SocialStore.ownProfile` maps permission-denied to null; `SocialStore.profile`
already maps denied handle/resolved-profile reads to null. Other errors surface.
Call sites: the online account's profile refresh (useOnlineAccount) and the
account export (useAccountActions); CreatorPage inspection;
FriendStore.publicIdentity (used by outgoing FriendManagerFeed and FriendDetailPage);
and PublicProfilePage's handle lookup. Owner-only mutation transactions do not
swallow authorization failures.

**Handle existence (R11 S1).** A handle document resolves only for its verified
owner while the owner's profile still points to it, or for any reader while that
profile is published and not hidden. A never-claimed handle is denied to every
reader, its eventual claimant included, exactly like another account's
unpublished (retained) or hidden handle, so a raw read cannot tell a retained
handle from a free one. Publication therefore claims its handle by writing it in
the final publication transaction without reading it first: the rules create a
free handle or keep this account's own and refuse a handle another account
holds. `SocialStore.publish` reports that refusal as "That handle is already
taken" only for a handle new to the profile and only while the other inputs the
rules judge (publication control, released old handle and creator flag) still
hold; any other denial stays an authorization error. One narrow disclosure
remains by design, because handles are unique: a verified account that can
publish learns from a refused claim that someone holds the handle (not who, or
whether it is published), and the same attempt claims a free handle rather than
merely testing it. Published handles are public anyway. Handle secrecy is
therefore not absolute: the rules make reads indistinguishable and claim nothing
about other Firestore error surfaces.

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
Rules check this with RE2 `matches()`, listing every Unicode 17.0 format
character explicitly as well as `\p{Cf}` (a unit test keeps the list equal to
the JavaScript engine's `\p{Cf}`), because an engine with older Unicode tables
misses newer ones (the Firestore emulator accepted the U+2066-U+2069 isolates
through `\p{Cf}` alone); the client applies the same rule after
trimming and shows plain error text. An update may keep an unchanged legacy name
(for example an icon-only change, invite consumption or unpublish), but any new
or changed name must be clean, and creating an invite requires a clean identity
name. Format characters include ZWJ and emoji tag characters, so some emoji
sequences are refused; that over-block is accepted. Other users' names render in
`<bdi>` so a right-to-left name cannot reorder the surrounding text.

**Blank-looking names (R12).** A new or changed name also cannot contain the
Hangul fillers U+115F, U+1160, U+3164 and U+FFA0 or the blank Braille pattern
U+2800 anywhere: they are letters and symbols that render as nothing, so no
separator or format rule caught them. It must also contain at least one
character that is not a combining mark or space, so a name made only of marks
such as U+034F cannot look empty either. The rules list those five code points
explicitly and a unit test keeps the client's list equal; the client shows
plain text. Rejecting U+2800 anywhere also refuses the word space in a
Braille-pattern name, an accepted over-block. Unchanged legacy names stay valid
until edited: an icon change, and publication's re-save of an existing member
name (which writes nothing), keep them without a refusal.

**Public and shared ranking titles (R12).** The control and format characters
that names refuse (`cleanTitle`'s class, with C0/C1 through `\p{Cc}`, but not
the blank fillers above)
are refused anywhere in a new public entry title, public profile title and
preview title, and in a selected-ranking chunk title. As for names, an update
may keep an unchanged legacy profile title or preview, so a legacy profile can
still be republished unchanged, unpublished or moderated; new entries and
chunks are create-only and must be clean. The client refuses these titles
first with plain text: the publish form and `SocialStore.publish` for the
profile title, and `parsePublicationEntry` for every published or shared entry,
naming the game by its visible title. Reading historical entries is unchanged.
No title in the shipped collection or discovery catalog contains one of these
characters, so the refusal reaches only manual, imported or provider titles
that do. Friend-only shelf and All rows keep their C0/DEL rule: they mirror the
whole library automatically, so a stricter rule would stop all automatic
sharing for a library holding one such title.
Friend shelf and All-row Save/Pin announcements and Pin accessible names use
the existing `stripControlOrFormat` display helper, so a title's bidi or format
characters cannot reorder the surrounding action text. The standalone `<h3>`
title, stored entry and metadata sent to Save/Pin remain unchanged.

**Forced line breaks and blank entry titles (R13).** The shared class also
refuses the line and paragraph separators U+2028 and U+2029 (`\p{Zl}`,
`\p{Zp}`) anywhere in a new name or title, because a forced line break could
fake a second line, such as a role or badge, under someone else's name. Names
already refused them only at either end. The client's check refuses them too,
and a unit test pins the rules' class. A new public entry title also cannot be
only whitespace, as friend shelf and All rows already require. Library records
cannot hold such a title, so that refusal reaches only direct writes.

**Report reasons (R13).** A new report reason also passes `cleanTitle`, so it
cannot carry bidi, zero-width, control or line-break characters into the
creator's review list. The client turns line breaks and tabs into spaces, since
that list shows each reason on one line anyway, and refuses other control or
format characters with plain text. The list renders each reason in `<bdi>`.

**Rules evaluation limit (R12).** Firestore stops evaluating a request after
1,000 expressions, counted across every `allow` statement it tries, and then
denies it. The first R12 rules crossed that on profile unpublish, where both
`publicProfiles` update statements evaluated the whole profile shape. So each
statement now tests its cheap discriminators first (a publication fails the
unpublish statement at once and an unpublish or moderation step fails the
publication statement at once), the profile shape compares an unchanged name,
title or preview before running its pattern, and the name and title patterns
are single string literals, since each concatenation also counts. The accepted
and refused sets are unchanged. Unit tests keep the pattern copies equal, and
emulator tests cover the heaviest writes: a 200-entry publication, a rename
that runs every pattern, unpublishing and moderation with a saved online copy.

**Rules size and structure (R22).** Firebase refuses a rules source over
256 KiB, a compiled ruleset over 250 KiB, a function with more than 7
arguments or 10 `let` bindings, a call chain deeper than 20 rule-defined
functions, recursion, match nesting deeper than 10 and more than 20 path
captures in a chain of nested matches. The compiled size can't be measured
locally, so `scripts/firestore-rules-limits.test.ts` holds the source to a
project ceiling of 192 KiB (196,608 bytes), three quarters of its own limit, and
checks the rest from the source with comments and strings removed. In R22 the
source is 111,757 bytes, with 181 functions: at most 6 arguments and 9 `let`
bindings, a deepest call chain of 7, match nesting of 2 and at most 4
captures. The per-request limits, 1,000 evaluated expressions and the document
lookups a request may make, apply at runtime instead:
`tests-cloud/rules-expression-budget.test.ts` and `rules-access-budget.test.ts`
calibrate how the emulator enforces them, and the emulator suites run the
heaviest real writes against them (see the R12 note above).

**Save-commit evaluation limit (R13).** Since R9, emulator denials of private
saves have named the 1,000-expression limit. That includes the losing tab's
save in a Release 5 two-tab race, and refusals that should be cheap, such as an
old writer's save without its All view pulses or a resume of a deleted online
copy without a fresh sign-in. The calibration below shows that this text comes
from a first, commit-wide pass that does not decide the outcome. The Release 5
save was a stale commit, which the upload now settles (see
[online saving](online-saving.md#conflicts)). The `syncHeads` update is still
the heaviest statement of a save, and Firebase documents the limit per request,
so R13 lowers its cost as headroom in case production counts a whole commit:

- Publish, stop and resume are separate statements, each testing its cheap
  discriminators first.
- A publication looks up its generation and creator summary once each. Its
  new manifest must equal its ready generation's private manifest, which
  passed the same `manifest()` when the generation was created and can never
  change, so it is not validated again. A kept manifest is compared with the
  stored one, which passed `manifest()` when it was published.
- The pulse check runs before the consent lookups.
- The creator summary compares an unchanged previous summary first.
- A save's member write changes only the counts and the time, so it no
  longer re-validates the other fields.

The accepted and refused sets are unchanged.

An emulator calibration test pins how the emulator applies the limit: it
decides each write of a commit within its own limit and refuses a write over it
with the limit named in the message. The same message can also name the limit
from a first, commit-wide pass that does not decide the outcome, so denial text
cannot show which check refused a write. Emulator tests therefore commit the
heaviest save (the largest admissible snapshots, with both All views pulsed),
and pair each refusal they rely on with an otherwise identical write that is
accepted: the unpulsed save with the pulsed one, and a resume without a fresh
sign-in with the resume after one.

**Deletion marker (R13).** A deleted online copy stays deleted for sessions
older than the deletion. The R12 rules let such a session pause a deleted head,
which cleared `deleted` because its manifests were already null, and then
resume it, which skipped the fresh-sign-in check that guards a direct resume.
The pause alone also made a shelf the deletion hid readable again. The stop
transition now refuses to clear `deleted`, and `CloudStore.revoke` refuses to
pause a deleted copy. Emulator tests cover the refused pause, the shelf staying
unreadable, and a fresh sign-in's resume.

**Moderation after a control-epoch lead (R20).** A publisher could make its
live profile immune to creator moderation. `publicControls` lets the owner
advance its own epoch by one per write with `hidden` unchanged, with no
profile write alongside. That's needed to restore publication permission after
a deletion, and a crafted write can do it at any time. Each such write left the
profile's epoch further behind the control's. The unpublish and moderation
statement required the profile's new epoch to equal both the control's new
epoch and the profile's own epoch plus one, which no request could satisfy once
the control led by one or more. Only an Admin SDK edit could then take the
profile down. That statement now requires the new epoch to equal the control's
new epoch and to be greater than the profile's current one. The profile's
epoch therefore still only rises and never passes the control's. Its `hidden`
flag still follows the control's, which only the creator can change, so the
owner can't reverse a moderation. Refusing standalone owner bumps would not
have been enough: an owner can also move the control ahead by setting
`deleted` and clearing it again while the profile stays live, and restoring
permission needs a standalone bump. Emulator tests cover moderation after one
and two standalone bumps, the owner's refused un-hide, and an owner unpublish
after a bump.

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
Since G6-SEC2 F2, the same post-commit step also removes the account's saved
Compare tray pins (`play100:compare-tray:v1:<scope>`), which can hold manual
titles. So this action removes the account's copy, recovery data, sharing
journals, motion hint and pins. The only thing it leaves is a content-free
retirement record, the account's writer marker marked retired, which keeps
older sessions from bringing deleted data back, as Data use says. A refused
removal keeps everything with the copy. Account deletion removes the same data
through `deleteAccountCopy` (see below), and leaves the same retirement record.
Since G8-SEC-AUDIT F1, localStorage refusing those keys after the transaction is
reported rather than swallowed: the removal still removes the other key and
returns an incomplete result, and the sign-out or deletion stands without being
undone. The signed-out Account page then says some of the account's data is
still on this device and offers Try again, bound to that account's scope. A
refused retry points to clearing the site's data in the browser settings. Any
sign-in withdraws the offer. When only localStorage refused, the retry removes
that account's pins and motion hint, whichever path removed the copy. When the
device database refused an account deletion's removal, the retry repeats the
whole removal (below). Neither touches guest or another account's data.
Since G10 SEC-F1 (R22), the account's three sharing journals (the friends
selection, the shared-games selection and the automatic sharing retry state)
follow the same writer retirement as the copy. Each journal read or write
carries the writer of the copy its tab opened, and checks that writer against
the account's row and writer marker in the journal's own transaction. So a
journal write another tab started before a removal, but whose transaction runs
after it, is refused rather than recreating the journal. A copy that was
removed or never opened starts no journal, and a copy reopened since belongs to
its new writer. Clearing the retry state is only cleanup and stays allowed on a
removed copy. Removing a copy that is already removed deletes any journal an
earlier release left behind.
Account deletion (G10 SEC2 item 8) removes the account's copy at whichever
generation it reached, even when the copy did not open or has become
unreadable: its sign-in is gone, so nothing can open that copy again. The
removal uses `deleteAccountCopy`, through `removeDeletedAccountCopy`, not
`deleteScopedLibrary`. A removal the device database refuses is reported on
Account like the localStorage case, and its Try again repeats the whole
removal: the copy's database row and journals as well as its localStorage keys.
The password entry accepts up to Firebase's 4096-character policy maximum.

## Ordered operator-only rollout

The only authoritative promotion sequence is the runbook's
[Promotion order](security-release-runbook.md#promotion-order); this section
keeps no second numbered list. Its constraints, in brief: preserve the published
rules and verify the owner UID first; the compatible client ships before the
candidate rules; only the release operator publishes rules and records the full SHA;
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
| S1 handle existence | Old publish reads the proposed handle before claiming it, so a new handle's read is denied and it cannot claim one; republishing an unchanged handle still works | Write-claim client first, then rules |
| R12 title characters | An older publish or selected share of a title with a control or format character is denied with the generic authorization message; other titles are unaffected | Client with the plain-text refusal first, then rules |
| R12 blank-looking names | An older client saving a new name with a Hangul filler, U+2800 or only marks gets the generic authorization message; other names are unaffected | Client with the plain-text refusal first, then rules |
| R12 cancel hold | An older client re-requesting, or freeing pair capacity by releasing, within 10 minutes of its own cancel gets the generic authorization message | Client with the plain-text refusal and capacity skip first, then rules |
| H7 creator UID | Old client asks the same ownerAccess endpoint | Console UID addition before rules |
| H11 device removal | Old Sign out still retains its cache | New optional client action; no rule dependency |
| H13 password length | Old UI truncation remains | New client; no rule dependency |

Stage 2 adds `social-profile.test.ts`, legacy/cap/handle/UID emulator cases,
and scoped-cache deletion race tests. The emulator cases passed in
`npm run test:cloud` at Release 1 (`2f727389`), including security-hardening 15
and security-migration 63; see the [release ledger](releases.md#release-1-2026-09-25).

## Headers, auth proxy and supply chain

The main document uses COOP `same-origin` and CORP `same-origin`, without COEP.
Both the main rule and the auth helper (its `vercel.json` rule and
`api/auth-helper.ts`) send `Permissions-Policy: camera=(), microphone=(),
geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(),
display-capture=()`; the app uses none of these features.
Source Google sign-in, linking and reauthentication use redirect methods only;
no popup methods or window.opener flow were found. Its validated production
authDomain is the application origin. The now-redundant firebaseapp.com origin
is removed from main connect-src/frame-src; upstream proxy destinations and the
separate auth-helper policy are not changed by that removal.

**Google hosts (R24).** The main policy names Google only in script-src.
`https://apis.google.com` serves gapi's loader (`/js/api.js`) and its
`gapi.iframes` module, which Firebase Auth loads when it reads a pending
redirect result (`src/cloud/redirect-resolver.ts`). R24 removed the other two
Google allowances, `connect-src https://apis.google.com` and
`frame-src https://accounts.google.com`. The evidence is the parent's real
Google sign-in and reauthentication on production (Release 7, 2026-10-02
about 00:50–00:55Z, receipt `google-signin-reauth-production-20261002.json`).
After each return, the main document had loaded only those two scripts from
`apis.google.com`, made no fetch or XHR there, and framed only its own
`/__/auth/iframe`. The trip to `accounts.google.com` is a top-level navigation,
which frame-src does not govern. The helper documents keep their own policy,
which still allows framing and form posts to `accounts.google.com`.
`release:verify` fails a deployment whose CSP lists either host in those
directives again, even if `vercel.json` does.

This reverses CSP-GAPI-01 (R5), which allowed `connect-src
https://apis.google.com` for one telemetry ping. `gapi.iframes` has a gen204
logger: each time its random helper mints a value, such as the auth iframe's
rpctoken, it may send `fetch(<api.js origin>/js/gen_204?c=50:<n>, {mode:
'no-cors'})`, with the probability set by the loader (`rate: 0.01` in the
`api.js` read on 2026-10-02; the module's default is 0.001), and it catches the
failure. Blocking it drops only that telemetry. An occasional redirect return
therefore logs one `connect-src` violation for `https://apis.google.com`,
in the console and as a `csp-count`, and nothing else changes. That violation
is expected; any other is a regression. The helper documents never send the
ping: their handler.js and iframe.js bundle their own iframes code without the
logger. Both Google origins stay on the CSP report endpoint's diagnostic list,
so a blocked use of either is counted by name.

**CSP least privilege (R9).** Main connect-src no longer lists
`https://firebaseinstallations.googleapis.com`: `src` imports only
`firebase/app`, `firebase/app-check`, `firebase/auth` and `firebase/firestore`,
none of which calls Firebase Installations, and the optional App Check path
needs only the sources in `APP_CHECK_CSP_SOURCES` (added when it is enabled).
`frame-src https://accounts.google.com` stayed until a real production Google
sign-in could show that no frame of that origin is used; R24 removed it
(above). One source stays on purpose: the offline-variant style hash. One
vercel.json policy serves both the online and the offline build, and
`check:csp` requires the other variant's inline style hash, so dropping it
would break an offline deployment.

Trusted Types (`require-trusted-types-for 'script'`) was considered and
rejected: the Firebase Auth helper path loads gapi by assigning a script `src`
URL, which needs a policy we don't control, so enforcing it would break sign-in.

CORP `cross-origin` overrides apply only to `/social-card.png`,
`/social-card.svg`, `/favicon.svg`, `/pwa/icon-192.png`, `/pwa/icon-512.png`,
`/pwa/icon-maskable-192.png`, `/pwa/icon-maskable-512.png` and
`/pwa/apple-touch-icon.png`. These are public social/launcher assets, not account
or API resources. The release operator must verify actual header override behavior,
scraper image access and redirect sign-in on the intended origin.

**Client env exposure (R8-ENV-01).** Only the named public Firebase fields
(`VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID`, the legacy
`VITE_FIREBASE_CONFIG` check) and the App Check flag and site key are compiled
into the client; `scripts/client-env-guard.ts` fails the build if any emitted
chunk inlines the whole `import.meta.env` object (a `BASE_URL` property or a
`VITE_VERCEL_*` system variable).

**SEC-01: fresh per-response nonce on the auth helper documents.** The two HTML
helpers, `/__/auth/handler` and `/__/auth/iframe`, rewrite to
`api/auth-helper.ts` with a fixed `page`. For a GET, the function serves the
fixed upstream
`https://play100-online-48823b32.firebaseapp.com/__/auth/<page>`, which it
fetches with only `Accept: text/html`: no client query, Cookie, Authorization
or other header is forwarded. For each response it replaces exactly the value
in `nonce="firebase-auth-helper"` with 16 random bytes (base64), and sends that
nonce in its own CSP. All other bytes are unchanged. The policy is otherwise
the previous helper policy, with
`frame-ancestors 'self'`, X-Frame-Options SAMEORIGIN, private/CDN no-store,
nosniff, `no-referrer`, HSTS and Permissions-Policy. Since R24 it also ends with
`report-to csp; report-uri /api/csp-report`, and the response sends
`Reporting-Endpoints: csp="/api/csp-report"`, the main rule's endpoint (before
that, a violation in a sign-in document was invisible). Reports count under the
`/__/auth/handler` and `/__/auth/iframe` routes. The plain-text answers
(redirects, and the 404, 405, 429, 502 and 504 refusals) keep their own
non-reporting policy. `style-src
'unsafe-inline'` stays: the Firebase helper scripts insert style attributes and
style elements at run time (G12-SEC2's capture). It fails closed with a
static no-store 502 and a counts-only log unless all of these hold:
- the literal count equals the attribute count, and is at least 1;
- no other `nonce=` attribute exists;
- the only `{{` is the handler's `{{POST_BODY}}` slot.

Also:
- upstream non-200, non-HTML, invalid UTF-8 and bodies over 256 KiB return 502;
- the 5 s upstream timeout returns 504;
- a 3xx passes through only to a same-origin `/__/auth/` path.

**Template cache (G6-SEC2 F1).** The template is the same for every user, so
each instance keeps the last one that passed these checks, per page, in memory,
and every response still gets its own nonce and no-store headers. It refreshes a
page's template once it is 10 minutes old, and one refresh per page at a time
serves every request waiting for it. A client that disconnects gets nothing
written, but the refresh is not aborted: other requests may share it, and the
timeout bounds it. If a refresh fails, the instance keeps serving the previous
template while it is under 30 minutes old, which is upstream's own
`max-age=1800`, and waits 15 s before the next refresh. Without such a template
it repeats the failure's 502 or 504 until then, without asking upstream again.
It also repeats an upstream redirect for those 15 s. Only a refresh takes an
admission slot, so page loads, however many or from whom, never meet the limit.

Evidence: the release operator's read-only capture recorded the handler (462 B) and
iframe (364 B). Each was byte-identical across query strings, with one nonce
attribute, one literal and one inline script, no style or `on*` handler, and
upstream `Cache-Control: max-age=1800` with no CSP or Set-Cookie. Tests use
synthetic fixtures with the same markers (`src/lib/auth-helper-proxy.test.ts`).

**GET/HEAD only.** Every other method gets 405 with `Allow: GET, HEAD` and is
never sent upstream. Since R12, HEAD is never sent upstream either: it answers
200 with the success headers and its own fresh-nonce CSP, `Content-Type:
text/html; charset=utf-8` and no body. It omits `Content-Length`, which only the
fetched template determines (RFC 9110 lets a HEAD response omit such a field,
and forbids a `Content-Length` other than the GET's). A HEAD request therefore
costs no upstream fetch, and it also no longer shows that the upstream template
loads; only a GET does. HEAD stays supported rather than refused with 405 so
that `curl -I` checks of the helper's own header policy keep working. Firebase
Hosting substitutes a POST body into the handler's
nonced `var POST_BODY = '{{POST_BODY}}'` script, and a fresh nonce cannot
protect an injection inside an already-nonced block. The app enables only
Google and Email/Password, with redirect flows that return via GET. **Provider
coupling:** adding a `form_post` provider (Apple, SAML, some OIDC) requires a
separately reviewed POST path first.

**Header precedence.** Vercel matches a `headers` `source` against each incoming
pathname (https://vercel.com/docs/project-configuration/vercel-json#headers).
Its docs do not define which value wins when a config rule and a function set
the same key. So no config rule matches the two helper documents:
- the main rule's `/((?!__/auth/(?:handler|iframe|handler[.]js|iframe[.]js|experiments[.]js)$).*)` excludes them;
- the static helper rule is narrowed to `/__/auth/(handler|iframe|experiments)\.js`;
- the only CSP there is the function's.

`security-headers.test.ts` pins this. The three script paths stay plain fixed
no-store rewrites; no configuration carries a static nonce any more. A direct
`/api/auth-helper` request also receives the main rule. Whichever CSP wins there is
either the fresh-nonce policy or the stricter main policy, which blocks the script.

**On the deployment (R24).** Vercel compiles these sources with path-to-regexp,
not a JavaScript `RegExp`, so neither those tests nor `check:csp` prove what
production does. Plain `curl` GET and HEAD requests to production (Release 7,
2026-10-02) did:
- `/__/auth/unknown` answered 404 with the 404 page and the full main header
  set, its CSP byte-identical to `/`'s.
- `/__/auth/handler.js`, the external rewrite to Firebase Hosting, answered 200
  `text/javascript` with its own rule's headers (nosniff, `no-referrer`,
  SAMEORIGIN, `private, no-store, max-age=0`, `CDN-Cache-Control: no-store`,
  Permissions-Policy, HSTS and its CSP) and none of the main rule's. Vercel does
  apply header rules to that external rewrite, unlike the local production
  emulation G12-SEC2 used. It does not send the two directives addressed to its
  own CDN, `Vercel-CDN-Cache-Control` and `x-vercel-enable-rewrite-caching`.

`release:verify` now checks both paths on every candidate and production
deployment, against the rules in `vercel.json`.

The application uses password reset/verification, not email-link sign-in:
`sendSignInLinkToEmail` and `isSignInWithEmailLink` are absent, and the unused
`/__/auth/links` paths stay removed. Every release since Release 1 ships
`api/auth-helper.ts`, so a Vercel Instant Rollback to any Release 1 or later
deployment keeps the fresh-nonce helper. Only the pre-Release-1 `270f`
deployment served the plain rewrites with a static nonce; rolling back past
Release 1 is not a supported target.

Vercel installs with `npm ci`. The stale CI workflow was removed; CodeQL,
Dependency review and Secret scan remain disabled by the owner. The committed
local `release:gate` runner verifies `npm audit signatures` in both installed
checkouts before other checks and retains hashed exit receipts. It then records
native `npm audit --json --audit-level=info` results from each checkout, including
the real exit code, UTC dates and lockfile digest, in the release manifest.
Valid advisory reports remain visible as requiring owner review; they are not
silently converted to a clean audit. Registry failures and malformed reports
stop the gate. Run `npm audit` locally after each install as well (README
"Quality checks"). The gate also runs checksum-pinned Gitleaks 8.30.1 against
the full candidate ancestry. Its evidence includes the scanned ref, tool
version, reachable and scanned commit counts, redacted JSON report and command
log; binary-only commits without a text patch are identified separately.
A summary of the result is a reading of the scan, not the scanner's output.
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

A third scoped override closes the grpc-js advisories GHSA-m9gg-hp2v-232j
(high) and GHSA-f596-whhp-79r4 (low), fixed in 1.13.6 and 1.14.5. The newest
`@firebase/firestore` (4.17.2, in firebase 12.19.0) still pins
`@grpc/grpc-js` to `~1.9.0`, and 1.9.16 is the last 1.9 release, so
`@firebase/firestore` gets `@grpc/grpc-js@^1.14.5`. The lock then holds a single
grpc-js 1.14.5, which the emulator tree's google-gax and Cloud SQL connector
already accept within their own ranges. Both advisories concern grpc-js servers
(peer certificates from `getAuthContext`, handler errors in status messages);
Play 100 only uses grpc-js as a Firestore client, and only in Node. The browser
bundle never loads it, because Firestore's browser build uses WebChannel, and
no API function imports Firestore. It runs only for the Firestore Node SDK under
Vitest's Node environment and `tests-cloud`, and in the emulator tooling.
grpc-js keeps its 1.x API, and Firestore still loads its protos with its own
`@grpc/proto-loader` 0.7. The `tests-cloud` emulator run is the end-to-end
check of that path. Remove the override once `@firebase/firestore` depends on a
patched grpc-js itself.

A fourth scoped override closes basic-ftp GHSA-c475-qrg2-pj4r (high, published
2026-10-01: quadratic-time parsing of a Unix directory listing in
`Client.list()`), fixed only in 6.2.1. basic-ftp is dev-only, reached through
firebase-tools' proxy support (`proxy-agent`, `pac-proxy-agent`, then
`get-uri` 6.0.5, which declares `^5.0.2`), and even the newest get-uri (8.0.1)
stays on 5.x, so `get-uri` gets `basic-ftp@^6.2.1`. get-uri only calls
`access`, `lastMod`, `list`, `downloadTo` and `close`, which 6.x keeps; the only
breaking change in 6.0.0 refuses a separate data-transfer host unless a client
allows it, as protection against FTP bounce attacks. The code runs only if the
emulator tooling fetches a proxy auto-configuration file from an `ftp://` URL.
Remove the override once get-uri depends on a patched basic-ftp.

**Install scripts (R9).** `package.json` `allowScripts` records the reviewed
dependency lifecycle scripts at their exact locked versions. Only npm 12 and
later enforce it by blocking scripts that are not approved. The recorded
installs used npm 11 (11.16.0 at R9; the Release 5 audit ran 11.19.0), which
only warns, and npm is not pinned locally or on Vercel, so on npm 11 the list is
advisory documentation, not a control, and no release gate counts it as one.
Five packages in the lock have an install script; the first four are approved:
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
- `fsevents@2.3.3` (dev, optional, `os: darwin`, through chokidar, tsx and
  Vite's file watcher): the native macOS file-watching binding. npm skips it on
  the Windows and Linux builds, including Vercel's, so no recorded install ran
  its script and it has no `allowScripts` entry. A macOS install under npm 12
  would block it until its script is reviewed and approved.

On npm 12 and later, pinned approvals keep today's install behaviour and make
npm refuse any new or changed script. A version bump of any of these packages, or a new package with
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
The release operator must retain that strict candidate only after an owned real browser records
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
adoption; otherwise drop the commit. Its Google case runs in the release gate
against the controlled Google provider fixture, whose loader stand-in also styles
the auth iframe through `iframe.style`; the live Google check,
`tests-cloud-ui/google-live.spec.ts`, repeats it with Google's own `gapi.iframes`
outside the gate ([release-operations.md](release-operations.md)).

| Remaining rollout item | LIVE 270f compatibility / owner |
| --- | --- |
| H8 nonce and five helper routes | SEC-01 fresh per-response nonce via `api/auth-helper.ts`, GET/HEAD only; production auth smoke required |
| H9 COOP/CORP and main auth-origin reduction | Redirect-only source compatible; verify final public headers and share-image override |
| Main strict style candidate | Not approved by source alone; retain only with exact-header browser proof |
| H10 instance limiter + WAF | Per-instance limits cannot stop distributed-instance abuse; the per-IP WAF rule runs in Log mode until its 429 switch, so operator enforcement evidence is required |
| H12 npm ci/signatures | Local install/build gate only; no runtime account change |
| H14 controls | Parent's dated black-box evidence above; App Check/reCAPTCHA accepted risks, not enforced. Authenticated console still required for UID setup and rules publication. |
