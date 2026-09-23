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

If adopted later, initialize App Check lazily on the online path with reCAPTCHA
Enterprise, ship that client first, observe verified-request ratios for at least
seven days, then enforce Firestore followed by Auth. Update CSP and Data Use
before enabling that traffic. Roll back by un-enforcing, not by weakening rules.
The per-instance API limiter is not global per-IP protection; Vercel WAF and
its deployment evidence remain with the parent/integrator.

## Stage 1 compatibility and validation

The new client still works with live 270f rules. Publish it before tightening
rules: the old client's outgoing-pending identity reads will be denied by the
new policy, and its immediate declined retry will be rejected. The report
transaction already reads only its own missing/existing report and needs no
client change. Cancelled recovery uses the existing lifecycle own-get permission
and deletes through Firebase Auth, not a new rule mutation.

Unrun source coverage: `tests-cloud/security-hardening.test.ts`,
`src/cloud/account-lifecycle.test.ts`, `src/lib/friend-manager-feed.test.ts`,
`tests-cloud-ui/cancelled-registration.spec.ts`, and the updated request
transition case in `tests-cloud/friendships.test.ts`.
Use the demo-only `npm run test:cloud` and separately configured local emulator
UI suite; never point these actors at production.

## Storage caps and legacy compatibility

The private snapshot envelope remains 20 MiB / 107 chunks to retain the existing
10,000-record and backup format. Its registry now admits eight generations, with
current/previous plus staging/retry headroom and the existing bounded cleanup
before allocation. At the cap, save failure is explicit and local edits remain.
Already oversized registries can shrink one retired generation per transaction;
they cannot allocate more until below the cap. Legacy chunk holder metadata
remains readable/removable while that cleanup proceeds.

New public generations require atomic enrollment in an owner-only
`publicProfiles/{uid}/metadata/registry` capped at four IDs. A generation is
removed from that registry in the same transaction that deletes its retired
metadata. Publication runs existing age/retained-pointer-aware cleanup before
staging. It never deletes the current published generation to make room.
Older unregistered generations predate this enforcement and require the existing
owner cleanup or operator inventory; rules cannot retroactively count subcollection
documents. Their cleanup remains allowed, and new generation creation cannot
bypass enrollment.

For client-first rollout only, a specific permission-denied on the new registry
get selects and logs the legacy publication protocol. Network/unreadable-state
errors do not. Once new rules are active, verified owner reads of the registry
are permitted and every new generation requires enrollment; falling back cannot
bypass the server cap.

These caps limit amplification against Spark's 1 GiB storage allowance; they are
not a global billing guarantee. Eight worst-case private and ranking manifests
at 20 MiB each can still require roughly 427 MiB after base64, before indexes and
metadata. Typical ranking summaries are much smaller. The operator must review
actual legacy use, billing/quota alerts and account-level abuse; no number of
accounts is guaranteed to fit within 1 GiB.

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
The publish transaction already deletes the old handle when changing it;
rules now require that atomic deletion. An existing handle resolves only while
its profile still points to it, including owner reads. Legacy orphan handles
do not redirect to unrelated current identities; owners/operators may remove
them, but no blanket public handle listing is enabled.

## Creator identity and shared devices

Creator authorization uses `_owner/config.uid`, not mutable/recycled email.
This protected document remains unreadable/unwritable by clients. Emulator
fixtures seed the UID and test same-email/different-UID denial.

Ordinary Sign out retains the scoped local cache. The separate confirmed
**Sign out and remove this device's copy** action blocks dirty changes and checks
the exact revision again inside the deletion transaction. A concurrent write
leaves the copy intact even after Auth sign-out. Other accounts and guest data
are untouched. Integration must preserve the newer P5 post-commit motion-hint
removal inside `deleteScopedLibrary`; this change adds a guard, not a namespace.
The password entry accepts up to Firebase's 4096-character policy maximum.

## Ordered parent-only rollout

1. Read/export the currently published rules and preserve their full SHA/source.
   Add the correct verified owner **UID** to `_owner/config` in the console,
   retaining its existing email field for live 270f rules. Verify the owner UID,
   do not infer it from an email match.
2. Run central unit/types/lint/build, the complete demo rules suite and the
   separately configured demo UI cases. Review legacy generation inventories,
   reserved/orphan handles, and the new-client/old-rules path before publication.
3. Deploy and promote the compatible client first. Verify report submission,
   outgoing request labels, cancelled recovery, publish/rename/cleanup and
   shared-device removal with owned test accounts. This lane never deploys.
4. Only the parent publishes the reviewed rules. Read them back and hash the
   exact bytes; record the full SHA and deployed release, not a truncated prefix.
5. Smoke-test owner access, reporter missing/existing symmetry, incoming/outgoing
   identity reads, declined-sender/decliner behavior, ordinary and cancelled
   deletion, public/missing/hidden profiles, handle rename, quota cleanup and
   shared-device dirty-copy refusal. An unauthenticated GET of a missing
   `publicProfiles/{uid}` must be denied (it was 404 on live 270f).
6. If a guard fails, stop promotion. Roll back with the retained previously
   published rules artifact identified by `971b0fe6…` (the parent must verify
   its full SHA). Do not reconstruct it or delete new registry/lifecycle data.
   Restore a compatible client only after reviewing lost protections; keep the
   `_owner/config.uid` addition, which old email rules ignore.

| Change | LIVE 270f client with new rules | Required sequence |
| --- | --- | --- |
| F1 report confidentiality | Own report transaction still works; third-party probes deny | Client unchanged for this path |
| H1 cancelled recovery | Old client still cannot self-remove a verified cancelled sign-in | Recovery client first |
| H2 pending identity | Old outgoing list reads are denied instead of a name/icon | Public-snapshot client first |
| H3 declined retry | Old immediate retry receives denial; no neutral precheck | New client first |
| H4 profile oracle | Old direct ownProfile calls may surface denial for missing peers | Null-mapping client first |
| H5 private registry eight | Old allocation can exceed client-side cap and receive denial; shrinking works | New cleanup/cap client first; inventory oversized data |
| H5 public registry four | Old generation creation lacks enrollment and is denied | New compatibility client first, then rules |
| H6 reserved/atomic handle | Old transaction already releases its old handle; old reserved claims are denied | New validation/read compatibility client first |
| H7 creator UID | Old client asks the same ownerAccess endpoint | Console UID addition before rules |
| H11 device removal | Old Sign out still retains its cache | New optional client action; no rule dependency |
| H13 password length | Old UI truncation remains | New client; no rule dependency |

Stage 2 adds `social-profile.test.ts`, legacy/cap/handle/UID emulator cases,
and scoped-cache deletion race tests. All are unrun in the source lane.

## Headers, auth proxy and supply chain

The main document uses COOP `same-origin` and CORP `same-origin`, without COEP.
Source Google sign-in, linking and reauthentication use redirect methods only;
no popup methods or window.opener flow were found. Its validated production
authDomain is the application origin. The now-redundant firebaseapp.com origin
is removed from main connect-src/frame-src; upstream proxy destinations and the
separate auth-helper policy are not changed by that removal.

CORP `cross-origin` overrides apply only to `/social-card.png`,
`/social-card.svg`, `/favicon.svg`, `/pwa/icon-192.png`, `/pwa/icon-512.png`,
`/pwa/icon-maskable-192.png`, `/pwa/icon-maskable-512.png` and
`/pwa/apple-touch-icon.png`. These are public social/launcher assets, not account
or API resources. The integrator must verify actual header override behavior,
scraper image access and redirect sign-in on the intended origin.

The auth proxy's static `firebase-auth-helper` nonce is an **accepted residual
risk**, not a random per-request nonce. A GET-only hash pin would become stale
when Google's served template changes, and POST/action behavior can vary its
inline content; shipping that pin without owning the upstream template can
break sign-in. No reflected injection point has been established, but the
same-origin Google template is not an absolute protection boundary.
The old proxy had seven fixed paths with no-store and no wildcard destinations.
The application uses password reset/verification, not email-link sign-in:
`sendSignInLinkToEmail` and `isSignInWithEmailLink` are absent. The unused
`/__/auth/links` and `/__/auth/links.js` rewrites are removed, leaving five fixed
handler/iframe/experiment paths. Their no-store headers and separate template
nonce/CSP remain; removal needs the integrator's auth-flow smoke checks.

Vercel installs with `npm ci`; each CI dependency install is followed by
`npm audit signatures`. Registry availability/signature failures remain real
failures for review, not reasons to bypass integrity. This does not replace
Dependabot, CodeQL or runtime testing.

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

| Remaining rollout item | LIVE 270f compatibility / owner |
| --- | --- |
| H8 nonce and five helper routes | Static nonce accepted risk; unused email-link paths removed, auth smoke required |
| H9 COOP/CORP and main auth-origin reduction | Redirect-only source compatible; verify final public headers and share-image override |
| Main strict style candidate | Not approved by source alone; retain only with exact-header browser proof |
| H10 instance limiter + WAF | Per-instance limits cannot stop distributed-instance abuse; parent/I per-IP WAF evidence required |
| H12 npm ci/signatures | Build/CI only; no runtime account change |
| H14 controls | Parent's dated black-box evidence above; App Check/reCAPTCHA accepted risks, not enforced. Authenticated console still required for UID setup and rules publication. |
