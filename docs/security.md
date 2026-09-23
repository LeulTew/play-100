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

## Evidence still owned by the operator

App Check enforcement, API-key restrictions, email enumeration protection,
required password policy and minimal authorized domains need current console
evidence from the parent. No console state is inferred or changed here.
The per-instance API limiter is not a global per-IP limit; a Vercel WAF policy
and its evidence remain with the parent/integrator.

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
