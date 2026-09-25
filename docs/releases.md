# Release ledger

One entry per production promotion: what was promoted, how it was read back,
the post-promotion checks, known issues, and the owner actions still pending.
Record deployment **IDs** only. Deployment URLs embed a team slug derived from
the owner's email, so they stay out of this file. Operator steps follow the
[security release runbook](security-release-runbook.md#promotion-order).

## Release 1: 2026-09-25

| Field | Value |
| --- | --- |
| Commit | `2f727389a51ef02631f1a8f9352e5b6fbc83eefe` (tree `08a815bfaddfecb965afe19d231bfc2e59e82ff9`) |
| Merge | PR #1 (round3-integration) into `main`, a plain fast-forward from `270f4c74` |
| Build | Remote Vercel build from a clean export, Vercel CLI 59.16 |
| Production deployment | `dpl_2ELDj1D5cfmhJCJ7fBaoCT38mvcZ` |
| Promoted | 2026-09-25 07:28:36Z with `vercel promote` (CLI 59.16.0) |
| Rollback target | `dpl_4aEr5qiJiTLv4TuaW1Efsy1mfgQ9` (270f4c74) |
| Strict style-src hashes | online `sha256-sZ9CEo6in5N81MStay/+6i0vx6thMpY9zmHsXb/QFAs=`, offline `sha256-yNMatkEIxFHj625inbs8H3k1IZESJpNsNDS241IT7/E=` |

**Readback.**
- Alias `play-100-collection.vercel.app` resolves to
  `dpl_2ELDj1D5cfmhJCJ7fBaoCT38mvcZ`, confirmed by both the Vercel API and
  `vercel inspect`.
- Production `/` index.html SHA-256:
  `beb4a263b25ff3d7701440501c8185863f93d5f31f8a701c39c7e95ab3006401`.
- CSP header SHA-256:
  `207cd059e1b6af5274452bddcf95a9989cb8f8f435bbad521764261b2fb6944b`. It is
  identical to the candidate's.

**Post-promotion production checks: 39/39 passed** in one public pass.

| Group | Checks | Result |
| --- | --- | --- |
| Readback | alias, inspect id, index.html hash, CSP header | 4/4 |
| Document headers | `/` 200; style-src `'self'` plus the two hashes, with no `'unsafe-inline'`; connect-src includes `https://apis.google.com`; HSTS, nosniff, XFO DENY, COOP and CORP same-origin; `/.vite/manifest.json` 404; auth handler 200 twice with differing nonces; POST handler 405; POST `/api/catalog` 405; `/sw.js` and `/pwa-assets.json` 200 | 16/16 |
| Exposure | 404 for `/.vite/manifest.json`, the entry `.js.map`, `/package.json`, `/vercel.json`, `/firebase.json`, `/firestore.rules` and `/.git/HEAD`; `/.well-known/security.txt` 200 `text/plain` | 8/8 |
| Auth helper | `/__/auth/handler` and `/__/auth/iframe` 200 with exactly one nonce CSP (`frame-ancestors 'self'`), a fresh nonce on each GET, XFO SAMEORIGIN and `Cache-Control: private, no-store, max-age=0`; POST 405 with `Allow: GET, HEAD` | 10/10 |
| Catalog | FreeToGame search 200 | 1/1 |

**Promotion order deviation.** The client was promoted before runbook steps 1
(receipts and the owner UID) and 4 (indexes) because the owner's Firebase
console was unavailable. That opened a client-first compatibility window: the
candidate client runs under the archived 270f rules until the pending actions
below are done. The runbook's step 6 inventories cover the writes made in that
window.

**Rules emulator receipts (test:cloud at `2f727389`).** The initial full run was
248 passed and 1 failed in 11 files: `friend-all.test.ts` "converges a first
friend action and the automatic default on one default policy in either order"
was denied once. A single-file `friend-all.test.ts` rerun passed 38/38. Per-file
results: query-offsets 27, security-hardening 15, security-migration 63,
friendships 45, friend-shelf 28, social 16, sync 7, access 4,
rules-access-budget 2 and lifecycle 4, all passing. Evidence file
`rules-emulator.txt`, SHA-256
`7B76539A2DC7351C679FEA6BC1F70A6160B2590460257515FA40970FA960517A`.

**Known issue at release: R8-CAT-01.** Wikidata search returned 503
`unavailable`. Interactive Wikidata lookups sent `maxlag=5`, and Wikidata folds
query-service lag into maxlag, so every search and detail lookup failed while
the query service lagged. The live 270f deployment has the same defect. The fix
is in the next release.

### Pending owner actions

Do these in runbook order and record each readback.

1. **Owner UID.** In Firestore > Data > `_owner/config`, add the string field
   `uid` set to the verified owner UID from Authentication > Users. Keep the
   `email` field. Readback: reopen the document and confirm both fields.
2. **Composite indexes.** Create the 3 composite indexes exactly as listed in the
   [runbook table](security-release-runbook.md#promotion-order) and
   `firestore.indexes.json`, with scope **Collection**:
   - `entries`: `format ASC, epoch ASC, active ASC, entry.title ASC`
   - `entries`: `format ASC, epoch ASC, active ASC, entry.position ASC`
   - `friendPairs`: `participants CONTAINS, creatorUid ASC, state ASC, updatedAt ASC`

   Add nothing else and delete nothing. Readback: every one shows **Enabled**.
3. **Rules.** Publish `firestore.rules` from `2f727389`. Its SHA-256 is
   `37e55c7945cc35faa12e4279a58acda1a0d71ec977af25017321bdaa40b4f81b`.
   Readback: copy the published text back and confirm its SHA-256 equals that
   value, then record the version timestamp. The pre-release rollback archive is
   `971b0fe6c7ec654bb21e72b70f7a431f71deff00612a9934ba02e851ae99243a`.
4. **WAF.** Add the Vercel WAF rule `api-per-ip` from the
   [runbook](security-release-runbook.md#vercel-waf-rate-limit-for-api-and-the-auth-helper),
   covering both `/api/` and `/__/auth/` GET/HEAD. Run it in **Log** mode for 7 days, then switch it to 429. Readback: record the rule
   ID, the Log hits and the switch time.
5. **Google smoke.** Run a real Google sign-in, link and reauthentication on
   production, on desktop and mobile. Readback: each flow returns to the app
   signed in, and the Console shows no CSP violation.
