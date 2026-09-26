# Release ledger

One entry per production promotion: what was promoted, how it was read back,
the post-promotion checks, known issues, and the owner actions still pending.
Record deployment **IDs** only. Deployment URLs embed a team slug derived from
the owner's email, so they stay out of this file. Operator steps follow the
[local release operations](release-operations.md), including verification,
rollback and readback, and the
[security release runbook](security-release-runbook.md#promotion-order).

## Release 4: 2026-09-26

| Field | Value |
| --- | --- |
| Commit | `c877a04b65788fabf2e9ec947053f20b463d6462` (tree `0f1276bc4b2e7ba8a9314e0974d9b320e91f6d70`) |
| Merge | PR #7 (`leultew-r10-integration`) into `main`, a plain fast-forward of 26 commits from `f8ba8549`, merged 2026-09-26 05:29:24Z |
| Build | Remote Vercel build from a clean export (1153 files), Vercel CLI 59.16 |
| Production deployment | `dpl_sUKWmFGu6PR8zLtxyk2pCbqpLP7Y` |
| Promoted | 2026-09-26 05:34:29Z with `vercel promote` (CLI 59.16.0), started 05:34:21Z |
| Rollback target | `dpl_BnyHdn9pZrbyqRDWtviezBUQZRsE` (Release 3) |
| Strict inline hashes | Unchanged from Release 3: style-src online `sha256-NGUjOxY76/cGN3gmM/YONiEbuC6rhQrQEr9XDkz0oxs=`, offline `sha256-yoYUnUqLaGmW5eJpbrdR7YmLQEZzKihnuFrDIgUKkdw=`; script-src boot script `sha256-lnIuzuWpXjWnhP9WtHbq+pqsr31w1FLaZQt7yvTYivQ=` |
| Release manifest | SHA-256 `ce99aa089fbaf01633a606cf6a03fd81efbde0d4277335044e6ee65b001ba561`, with 6 recorded decisions and no waivers |

**What shipped.** The remaining 10/10 requirements from the G2 review; PR #7
has the details. This closes Release 3's four known issues.
- Offline: every verified offline download has a deadline, and a stalled
  response aborts while the working copy stays, with a retry in Settings.
- Budgets: `check:budgets` also gates index.html, the first-paint inline
  blocks and the largest whole route. The idle warm-up fetches only what a
  page opens without navigating, and dead footer CSS is gone.
- Dialogs: the sticky Close rail also covers short landscape windows, and
  Settings and About set the page title.
- Release operations: `npm run release:verify`, the
  [local release operations](release-operations.md) runbook and the Release 3
  entry below.
- Storage: a refused manual save shows an error, and a retried restore clears
  the old one. Quota campaigns cover large imports, unsaved manual games and
  offline preparation.
- Account lifecycle: deletion, the Google return and session, and identity are
  narrowly owned, unit-tested modules, with no behavior change.

**Readback.**
- Alias `play-100-collection.vercel.app` resolves to
  `dpl_sUKWmFGu6PR8zLtxyk2pCbqpLP7Y`, confirmed by both the Vercel API and
  `vercel inspect`.
- Before the readback, five consecutive public `/` responses matched the
  candidate's index, with no stale response (05:34:37Z to 05:34:42Z).
- Production `/` index.html SHA-256:
  `061415fe7e4484a4d0aa0b403d5d05911b9eac56f4075db02d308d4bd504bd06`, the
  candidate's and the local configured build's. Entry
  `/assets/index-C97IdQ8R.js`, SHA-256
  `eeae373a1fc36761b2be926d33314da9c7457c21ec09ca9f7d9c4941d85d5a46`.
- CSP header SHA-256:
  `418cd3ad834ca07094c130525d1afbc7bf222fc39be77e68273d584aea0dc3a2`,
  unchanged from Release 3.
- `/sw.js` SHA-256
  `19c9b7d5f3e67111668962cd381feb4739640b74a2918a80ec90c830c5347bf2`.
  `/pwa-assets.json` SHA-256
  `3762423f2041716601d5d1726ac60d34d867be66de306efdc55f61116707d0e2`, PWA
  version `b972762946f9c768ec01bbd37c90ed5dd3ee622978adf937629b6bd728e077e6`.

**Post-promotion production checks.** `npm run release:verify` passed 43/43,
and the integrator's cross-check passed 47/47 (the Release 3 set). They agree
on the index, the worker, the PWA assets and the version. No rollback rule
triggered.

**Service-worker update probe: passed, no findings.** One pass on the public
alias with no bypass, in headless Chromium with a persistent profile, across
the promotion:

1. Armed on Release 3: offline files ready in 7.1 s, with the controller, the
   active worker and the page on Release 3's PWA version `f7355aa7…`, and no
   CSP violations.
2. After promotion, the waiting Release 4 worker was applied through the app
   with exactly one reload. The controller and the page moved to `b9727629…`,
   Release 4's `/pwa-assets.json` version.
3. Cold offline launch: `/` and `/my-games` loaded from the worker on Release
   4's entry.
4. No `securitypolicyviolation` events or CSP console messages on the updated
   page or either offline page.

The multi-window and unsaved-form refusals were probed for Release 3 and not
repeated.

**Pre-promotion evidence.** The release manifest binds each report or records
its decision.
- Gate: 182 files, 2,605 passed, 1 skipped. Development partition: 186 in 11
  (181 passed, 5 skipped).
- The full production partition (760 on `92033f6f`: 672 passed, 87 skipped,
  1 failed) and the full cloud-UI run (228 on `720082df`: 215 passed, 12
  skipped, 1 failed) are recorded as superseded. Each failure was a test race,
  and its fixed spec then passed whole: `compare-tray-context.spec.ts` 12/12
  and `friend-all.spec.ts` 14/14. The 12 skips are the opt-in
  `compare-orientation.spec.ts`, which needs an allocated fixture.
- The Node 24 gate and the Firestore emulator suite (256) are carried
  forward: R10 changes no dependency, rules or rules-emulator test.
- The last three commits change only those spec files, and a fresh configured
  build of `c877a04b` matched the earlier dist file for file.
- Candidate verification: 43/43 and 47/47. The first candidate,
  `dpl_FQWRzCpyXNm2rNfRQohV9gSSrv9o` (built from `720082df`), was superseded
  and never promoted.
- Gitleaks 8.30.1 over `f8ba8549..c877a04b` (26 commits): 0 findings. An
  independent review of the runtime commits found no issues.

**Validation stops.** Each was root-caused, and none was a product defect.
- The configured-build harness read the budget rows through a field the report
  doesn't have, so it stopped on a passing report. The condition was corrected
  and the report re-read without a rebuild.
- `compare-tray-context.spec.ts` measured page-end geometry before the lazy My
  games page rendered. It now waits for the page's own heading.
- A cloud-UI helper navigated 2 ms after Sign out, before the asynchronous
  sign-out finished. Two specs now wait for the home page first.

**Receipts,** kept outside the repository:

| Receipt | SHA-256 |
| --- | --- |
| Promotion receipt (binds 9 evidence files, including these) | `3717ca7b028ff7e56be339b3d3c0f0b0c0f56f9f2f35407c3d00ec7e4999de0e` |
| Push and PR | `156b704e46840eda43bbfe02678e0e874daa020f6efe489da88171e8de874fee` |
| Promotion and public checks | `a243219e3ce70c39b1cbb975b1961232c5d2982510bd120b814327b30aeb2f66` |
| Production `release:verify` JSON | `b7d86e5879a3411caa00ab97d6f2115d98fd1941e0eb5484e8faf0cc331f8b4b` |
| Service-worker arm | `17bba2cbf6ac7b6632387de1984d5bfee3e528ebdebed05a5e49444fa68247a0` |
| Service-worker probe | `e9041906772e9521df358a81afafeae88970f174bc5918ae3c8213d36c19700f` |

**Rules.** Unchanged from Release 3, so the pending publish is still
`firestore.rules` SHA-256
`9458021a4accb75c5cb8e218a93246d93eeca672d3c867adcf40ba8b18e15f46`
(pending action 3), and the client-first window continues.

**Waivers.** As for Release 3: no physical-device, iOS Safari, screen-reader
or OS install and launch runs; the release coordinator waived them. The real
Google smoke is still pending action 5.

**Known issues at release.** None known.

## Release 3: 2026-09-26

| Field | Value |
| --- | --- |
| Commit | `f8ba85491225bf0ca7625af291de8b9bc2247e8c` (tree `475430a0ec60ef2c31dea9dd1ec112d7f88422a6`) |
| Merge | PR #6 (`leultew-r9-integration`) into `main`, a plain fast-forward of 59 commits from `80df63f9`, merged 2026-09-26 02:16:09Z |
| Build | Remote Vercel build from a clean export (1139 files), Vercel CLI 59.16 |
| Production deployment | `dpl_BnyHdn9pZrbyqRDWtviezBUQZRsE` |
| Promoted | 2026-09-26 02:47:42Z with `vercel promote` (CLI 59.16.0), started 02:47:34Z |
| Rollback target | `dpl_CJLQPhvsibvtH2UsZGdhX4hpyFY8` (Release 2) |
| Strict inline hashes | style-src online `sha256-NGUjOxY76/cGN3gmM/YONiEbuC6rhQrQEr9XDkz0oxs=`, offline `sha256-yoYUnUqLaGmW5eJpbrdR7YmLQEZzKihnuFrDIgUKkdw=`; script-src boot script `sha256-lnIuzuWpXjWnhP9WtHbq+pqsr31w1FLaZQt7yvTYivQ=` (all three changed from Release 2) |
| Release manifest | SHA-256 `59eec478fff04c9fb02e10a531a5dc750f7e40fd154cd87d7d0d6d755ba456f0`, with 11 recorded carry-forwards and no waivers |

**What shipped.** Fixes for the independent G2 review of production; PR #6 has
the details.
- Dialogs: a sticky 44 px Close rail on long mobile dialogs; stacked dialogs
  keep the right one in front and return focus to it; one Escape closes only
  the top dialog; Settings announces saves inside the modal; recovery reloads
  never discard unsaved work.
- My games: rejected edits stay focused through Previous/Next and view
  changes; the Library page is restorable through `?page=`; the narrow compare
  dock and pager no longer break inside a word; the Ranking mounts 25 rows per
  page with a "Move to position" control.
- Cards and Discover: failed-cover captions stay clear of the rank; card
  actions share a baseline; the collection is a list; Discover no longer
  claims "no ratings" when a rating source failed.
- First paint: shell-only buttons are disabled until the app starts; the
  collection reserves its viewport (desktop CLS 0.021 to 0); a notice appears
  if the app script can't load.
- Online loading: 14 page and picker roots load on demand, so the largest lazy
  chunk drops from 282 KB to 144 KB gzip; the Google mark is inline.
- Reliability: a raced default friend setup settles on the setup that won
  instead of failing, and a stale read can't overwrite newer controls.
- Security: display names reject control and format characters, confusable
  reserved handles are refused, other users' names render isolated, the unused
  Firebase Installations origin is gone from connect-src, and reviewed install
  scripts are pinned.
- Readiness: the share card uses the brand fonts, the missing licence notices
  are added, and `npm run release:manifest` records each release's evidence.

**Readback.**
- Alias `play-100-collection.vercel.app` resolves to
  `dpl_BnyHdn9pZrbyqRDWtviezBUQZRsE`, confirmed by both the Vercel API and
  `vercel inspect`.
- Production `/` index.html SHA-256:
  `542311b8ce1ca17c2be12be6652a70e63721060197846030b32b9e9464c2661d`, the
  candidate's. Entry `/assets/index-qeqF93gg.js`, SHA-256
  `dfa4ec0ce42fc68895c8ef8513c013f2f60444f04dffb43dccd0a2b02acf4584`.
- CSP header SHA-256:
  `418cd3ad834ca07094c130525d1afbc7bf222fc39be77e68273d584aea0dc3a2`,
  byte-identical to the release tree's `vercel.json`. It carries the three
  hashes above and no `firebaseinstallations` origin.
- `/sw.js` SHA-256
  `7793a31f3fcf4e624967472dc5a66041ffad64924783042e31553b7bd8d647ff`.
  `/pwa-assets.json` SHA-256
  `ee13a8ad05a866098dc29f353763ed8868dec0757be65778c80ad4bcd174b096`, PWA
  version `f7355aa722c439e7480931f8485d463d4af95c4ce471b964b41e34ff4a5635e6`.

**Post-promotion production checks: 47/47 passed** in one public pass with no
bypass: the 42 Release 2 checks, 2 CSP checks (script-src and style-src carry
the three hashes; connect-src has no `firebaseinstallations`), and 3 first-paint
checks (`/provider/google.svg` 404; the five shell buttons are `disabled` and
none is `inert`; `#p100-boot-error` stays hidden on a normal desktop and mobile
load).

**Two-version service-worker probe: passed, no findings.** One pass on the
public alias with no bypass, in headless Chromium with a persistent profile,
across the promotion
([procedure](release-operations.md#8-two-version-service-worker-probe)):

1. Armed on Release 2: offline files ready in 7.2 s, with the controller, the
   active worker and the page on Release 2's PWA version
   `f145694333f3d1e36c6f3d95363a3698f016b607b978e1269fe9a27f7d81f7a8`, and no
   CSP violations.
2. After promotion, Release 3's worker (`f7355aa7…`) was waiting within 12 s,
   without a manual update check.
3. Two tabs open, Update pressed in one: refused with "Close other Play 100
   tabs or windows before updating. No tab was reloaded." Neither tab
   reloaded.
4. One tab with an unsaved manual-game title: refused with "Finish or clear
   unsubmitted forms, or return to The 100 before updating. Nothing was
   reloaded." The draft stayed.
5. After saving the game: accepted with exactly one reload. The controller and
   the page moved to `f7355aa7…`, and the saved game is shown.
6. Cold offline launch, with the network off from the start: `/` and
   `/my-games` loaded from the worker on Release 3's entry, with the saved game
   on My games.
7. No `securitypolicyviolation` events or CSP console messages on the updated
   page or either offline page.

The probe used no account; its test game exists only in the probe's own
browser profile.

**Rollback drill: completed, with one readback miss.** Practised once after the
probe. The release coordinator approved it in the Release 3 GO, acting under
the owner's standing delegation; the owner did not approve it individually.

| UTC | Step | Result |
| --- | --- | --- |
| 02:49:54–02:50:03Z | `vercel rollback dpl_CJLQPhvsibvtH2UsZGdhX4hpyFY8` | exit 0 |
| 02:50:03–02:50:08Z | `vercel rollback status` | exit 0 |
| 02:50:11–02:50:15Z | Alias API, `vercel inspect` and `/` | Release 2, index `39d15973…` |
| 02:50:15–02:50:24Z | `vercel promote dpl_BnyHdn9pZrbyqRDWtviezBUQZRsE` | exit 0 |
| 02:50:26–02:50:31Z | Alias API, `vercel inspect` and `/` | The candidate, but `/` still served Release 2 (the miss) |
| 02:50:31–02:51:00Z | The 47 public checks | 47/47, index `542311b8…` |

Release 2 served production for 24.7 s as seen by a 1 s poller (first Release 2
response 02:50:02.247Z, first Release 3 response 02:50:26.932Z; bounds 13.5 to
32.1 s).

**The miss.** The single `/` readback after the re-promote, at 02:50:31.222Z,
still returned Release 2's index, 4.3 s after the poller first saw Release 3.
The next request and every one since returned Release 3, including 30 of 30
samples from 02:52:55Z to 02:54:25Z, with the alias on Release 3 before and
after. The coordinator ruled it edge propagation, not a failed promotion.
[Release operations §9](release-operations.md#9-rollback-readback-and-undo)
now waits for consecutive matching responses before that readback.

**Pre-promotion evidence.** The release manifest records each report or
carry-forward.
- Gate: 176 files, 2,478 passed, 1 skipped. Firestore emulator suite: 256
  passed in 11 files.
- End-to-end production partition: 744 in 57 files (660 passed, 84 skipped by
  project). Development partition: 186 in 11 (181 passed, 5 skipped).
- Cloud UI: 228 in 27 files, 225 passed on `764275cb`. After a test-only fix,
  the page-loading file passed whole on `f8ba8549` (36/36), and
  `review-repairs:36` passed its one re-run (an unreproduced desktop
  intermittent). `friend-all-review` three times: 54/54.
- Ranking with 2,000 games: opens in 82 ms with 25 rows mounted.
- Candidate verification: 47/47. Gitleaks 8.30.1 over `80df63f9..f8ba8549`
  (59 commits): 0 findings.

**Receipts,** kept outside the repository:

| Receipt | SHA-256 |
| --- | --- |
| Promotion receipt (binds 14 evidence files, including these) | `06685d70d0c5ff0e165ec5734a3f37ebeb9fee8aca7eeaba27da2e79f6652454` |
| Promotion and public checks | `fb3051dffe815f462f1c46b01d577585df90a0b6549aeb16777c6847822de0c6` |
| Service-worker probe | `8fc61cd438865465667b9e6fdc8e2e4f5a509fa0cc745cc55362e0da06ccd7fe` |
| Rollback drill | `5c26a79d8f09857972c69abcc2527e85010602ae7fe58f37b404a27ad432b885` |
| Post-drill stability | `6a0a3cfc9fd03b4b88b0223afff25b8cbe06bf8b107cdafd80d8c7e67b6d39cf` |

**Rules.** This release ships `firestore.rules` SHA-256
`9458021a4accb75c5cb8e218a93246d93eeca672d3c867adcf40ba8b18e15f46`
(105,057 bytes). They are not published yet, so production still runs the
archived 270f rules and the client-first window from Release 1 continues. As
PR #6 records, the client works with the published rules. Pending action 3 now
names these rules.

**Waivers.** No physical-device, iOS Safari, screen-reader or OS install and
launch runs were made for this release; the release coordinator waived them.
The probe above ran in headless Chromium, which is not physical-device
evidence. The real Google smoke is still pending action 5.

**Known issues at release.** Each is fixed in the next release:
- Offline preparation had no per-asset deadline, so a stalled response could
  keep it from finishing.
- In short landscape windows, a long dialog's Close could scroll out of reach.
- With Settings or About open, the page title still named the page or game
  underneath.
- A manual game that storage refused (for example, when the quota is full)
  showed no error, and a restore error stayed on screen when the restore was
  retried.

## Release 2: 2026-09-25

| Field | Value |
| --- | --- |
| Commit | `80df63f9d143e21f7ce8312fbff78e75c5f893e9` (tree `e7bcb3dae143137e119a75f271bf3943e7f36465`) |
| Merge | PR #5 (`leultew-r8-catalog-env`) into `main`, a plain fast-forward from `2f727389`, merged 2026-09-25 09:27:56Z |
| Build | Remote Vercel build from a clean export (1109 files), Vercel CLI 59.16 |
| Production deployment | `dpl_CJLQPhvsibvtH2UsZGdhX4hpyFY8` |
| Promoted | 2026-09-25 09:31:07Z with `vercel promote` (CLI 59.16.0) |
| Rollback target | `dpl_2ELDj1D5cfmhJCJ7fBaoCT38mvcZ` (Release 1) |
| Strict style-src hashes | online `sha256-sZ9CEo6in5N81MStay/+6i0vx6thMpY9zmHsXb/QFAs=`, offline `sha256-yNMatkEIxFHj625inbs8H3k1IZESJpNsNDS241IT7/E=` (unchanged from Release 1) |

**What shipped.**
- R8-CAT-01: interactive Wikidata requests no longer send `maxlag`. This closes
  Release 1's known issue.
- R8-ENV-01: the client compiles only the named public env keys, and the build
  fails on a whole-env literal.

**Readback.**
- Alias `play-100-collection.vercel.app` resolves to
  `dpl_CJLQPhvsibvtH2UsZGdhX4hpyFY8`, confirmed by both the Vercel API and
  `vercel inspect`.
- Production `/` index.html SHA-256:
  `39d15973f99074fcd6d273ab015ec2960ba4e04ce3f4bba0e6036e87c4222bbe`.
- CSP header SHA-256:
  `207cd059e1b6af5274452bddcf95a9989cb8f8f435bbad521764261b2fb6944b`,
  unchanged from Release 1.

**Post-promotion production checks: 42/42 passed.** These are the Release 1
groups (readback 4, document headers 16, exposure 8, auth helper 10, FreeToGame
1) plus three checks, all passing:

- Catalog: Wikidata search 200 with 5 items (total 66).
- Catalog: a Wikidata detail lookup 200.
- Client env: the served entry chunk has no `BASE_URL:` literal and no
  `VITE_VERCEL_` name.

**Rules.** Unchanged from Release 1, so the pending publish is still
`firestore.rules` SHA-256
`37e55c7945cc35faa12e4279a58acda1a0d71ec977af25017321bdaa40b4f81b`. The R9
rules will be recorded with the release that ships them.

**WAF (pending action 4, partly done).** Vercel Firewall rule
`rule_api_per_ip_xpgBNf` ("api-per-ip") was created through the Vercel API on
2026-09-25 (config updated 09:49:22Z) and has run in **Log** mode since then
(parent ruling WAF-01). Its conditions are (path starts with `/api/` AND method
GET) OR (path starts with `/__/auth/` AND method GET or HEAD), fixed window
60 s, 60 requests, key IP. Creating the project's first firewall config also
enabled Vercel's default OWASP rule set (gen, rce, xss, sqli) in **log mode
only**; it is kept as monitoring and cannot block (ruling WAF-01-CRS).
Remaining: review the Log hits, then switch the rule to 429 no earlier than
2026-10-02 and record the switch time.

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
3. **Rules.** Publish `firestore.rules` from `f8ba8549` (Release 3). Its
   SHA-256 is
   `9458021a4accb75c5cb8e218a93246d93eeca672d3c867adcf40ba8b18e15f46`
   (105,057 bytes). It supersedes the unpublished Release 1 rules
   (`37e55c79…`). Readback: copy the published text back and confirm its
   SHA-256 equals that value, then record the version timestamp. The
   pre-release rollback archive is
   `971b0fe6c7ec654bb21e72b70f7a431f71deff00612a9934ba02e851ae99243a`.
4. **WAF.** Switch `api-per-ip` (`rule_api_per_ip_xpgBNf`, in **Log** mode since
   2026-09-25 09:49:22Z; see
   [Release 2](#release-2-2026-09-25) and the
   [runbook](security-release-runbook.md#vercel-waf-rate-limit-for-api-and-the-auth-helper))
   from Log to 429 after 7 clean days, no earlier than 2026-10-02. Readback:
   record the reviewed Log hits and the switch time.
5. **Google smoke.** Run a real Google sign-in, link and reauthentication on
   production, on desktop and mobile. Readback: each flow returns to the app
   signed in, and the Console shows no CSP violation.
