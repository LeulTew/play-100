# Release ledger

One entry per production promotion: what was promoted, how it was read back,
the post-promotion checks, known issues, and the owner actions still pending.
Record deployment **IDs** only. Deployment URLs embed a team slug derived from
the owner's email, so they stay out of this file. Operator steps follow the
[local release operations](release-operations.md), including verification,
rollback and readback, and the
[security release runbook](security-release-runbook.md#promotion-order).

## Release 7: 2026-09-30

| Field | Value |
| --- | --- |
| Commit | `b08efa853977255795d32d15fce41b7ed7e5af8c` (tree `f8080b53409edfb44551601304a1c1afe4655e59`) |
| Merge | PR #12 (`leultew-r23-candidate`) into `main`, a plain fast-forward of 410 commits from `129e73ee`, merged 2026-09-30 21:05:33Z. `main` then fast-forwarded to the verifier fixes `815759102e365aff02c3c311b5cc65060ae45e03` and `d107420bc22722adf377f89d512c5f8a8d7f11ea` and this ledger commit, which change only tools and docs; the deployment is built from `b08efa85` |
| Build | Remote Vercel build from a clean export, Vercel CLI 59.16 |
| Production deployment | `dpl_7hhPp9x8WdEfSghV278GpSvbE4wz` |
| Promoted | 2026-09-30 21:07:08Z with `vercel promote` (CLI 59.16.0), started 21:06:59Z |
| Previous production | `dpl_9Hh23osGZT4xU51H5iw3dHNK5ZSr` (Release 6). **Not a safe rollback target**: it predates the R22 device-library barrier (see [release operations](release-operations.md#r22-indexeddb-compatibility-and-rollback-floor)) |
| Rollback target | `dpl_8SCr4VKs5FdnW8m8ay8y61VVyM45`: the approved R22-compatible recovery deployment of `352117813fde9bf9233e3347abaed1eb2d7ee8c1` (tree `63c5500d4de6a602954a10b686a3519c06095861`), deployed with `--skip-domain` and never promoted. Recovery is `vercel promote` of this ID with the owner's approval; the Hobby `vercel rollback` would pick Release 6 |
| Rollback floor | The R22 barrier commit `da8e4623f537c0b4b527cc67697c2bf18eba4c92`, an ancestor of both `35211781` and `b08efa85` |
| Strict inline hashes | Against Release 6, all three changed: style-src online `sha256-OacfOkjAw9OUAck+TQpYFF2s+FkEgqPI4t1v2slL10E=` (18,271 B), offline `sha256-+BwkV9HHDm2yb6YFzDgoK5/tZNyMAJCnYrUIsgE5XGo=`; script-src boot script `sha256-5tbIxOoix2rQeTWRkLG3C7Wy3wXZkuMmDMCEEeJAVuo=` (3,329 B, unchanged since R22) |
| Release manifest | None: an owner-authorized lean release path replaced the committed gate and its manifest (below) |

**What shipped.** The R13–R23 work; PR #12 has the summary.
- Device library: `play100-personal` moves to version 3 as a writer barrier.
  Release 6 tabs close on `versionchange` and can't write again, and a blocked
  upgrade explains how to recover without clearing saved data.
- Online saving, sync, friends and sharing: an identical upload from another
  writer settles instead of asking for a choice, a publication made on another
  device settles cleanly, and a deleted online copy stays deleted for older
  sessions.
- Rules: expression-limit fixes for saves and moderation, and name and title
  hygiene.
- Performance, accessibility and first paint: optional code loads when needed
  under lower bundle caps, contrast and busy-state fixes, and a failure notice
  when the entry stylesheet fails.
- Release operations: the committed local release gate with a Gitleaks history
  scan, two-version worker companions, CSP counts, health probes and bounded
  anonymous fault reports.

**Readback.**
- Alias `play-100-collection.vercel.app` resolves to
  `dpl_7hhPp9x8WdEfSghV278GpSvbE4wz`, confirmed by both the Vercel API and
  `vercel inspect`.
- Five consecutive public `/` responses matched the release's index from
  21:07:17Z, with no stale response.
- Production `/` index.html SHA-256:
  `1da5b6af8221ce80f349ab0ccb8fa93e5650985b85a15b7ba78ce7552bd45e15`, the
  candidate's and the local configured build's. Entry `/assets/index-CXM-K923.js`.
- CSP header SHA-256:
  `8a075117d371a1ffdddb2744f9f57737f1042ce1254142f3f8dc419801139f4d`.
- `/sw.js` SHA-256
  `2cde7a9a0bd78b8bc18ca64309befdbac26ccc1e4cceab20ebbb0176e1bb0dee`.
  `/pwa-assets.json` SHA-256
  `5a92639493c545e6acc9c19e30bb8814641e5bf67a1bf3e608d339e5b17c5c45`, PWA
  version `a3158d3e06e2728b1301b15724935b331f1c6815acbe578a4ef027b5588814db`.

**Post-promotion production checks.** With the first verifier fix, the
integrator's `npm run release:verify` (Node 24.21.0) passed 43 of 44 and the
integrator's cross-check 49 of 50. Both missed only the source-map row:
`/assets/index-CXM-K923.js.map` answered 403 instead of 404. The project has
Vercel's protected source maps on (`protectedSourcemaps`), so every public
`*.map` path answers the same 1-byte 403, even for files that don't exist,
while other missing paths answer 404; the build contains no source maps. The
coordinator checked production independently, ruled the 403 not an exposure and
fixed the verifier forward in `d107420b`: the row now passes on a 404, or when
the entry map and a random absent map return an identical 403 body of 64 bytes
or less, and still fails on a 200, a large body or a 403 unlike the absent
map's. From `d107420b`, the coordinator's production `release:verify` passed
44/44, with the map row measuring 403 for both. The verifiers agree on the
index, the worker, the PWA assets and the version.

**Service-worker update probe: passed.** One pass on the public alias with no
bypass, in headless Chromium with a persistent profile, across the promotion:

1. Armed on Release 6: offline files ready in 12.8 s, with the controller on
   Release 6's PWA version `b3036a0b…`, and no CSP violations.
2. After promotion, the waiting Release 7 worker was applied through the app
   with exactly one reload. The controller moved to `a3158d3e…`, Release 7's
   `/pwa-assets.json` version.
3. Cold offline launch: `/` and `/my-games` loaded from the worker on Release
   7's entry. No CSP violations.

The probe uses one tab. An old Release 6 tab held open across the upgrade (the
blocked-upgrade path) is covered by the gate's browser tests, not by this probe.

**Verifier fixes.** On `b08efa85`, `release:verify` failed two rows on correct
HTML: "Boot error initially hidden" and "Shell buttons disabled without inert".
Its tokenizer read `d<n.length` in the minified inline boot script as a tag
whose quoted "attributes" ran past the real `</script>`, so it skipped the rest
of the page. A spec parser found one hidden boot notice and five disabled shell
buttons, and the coordinator reproduced the fault independently (changing only
`d<n.length` to `d< n.length` made both rows pass) and ruled the two rows false
negatives. The fix `81575910` makes raw-text elements jump to their literal end
tag and adds a regression test. With it, the candidate passed 44/44 (42/44
before). The R22 recovery deployment passed 44/44 from R22's own checkout with
exactly the fix's verifier patch applied, because the verifier reads the
checkout's `vercel.json` and R22's header group and CSP hashes differ (42/44
before); the coordinator accepted that deviation. The second fix, `d107420b`,
is described under the production checks above.

**Pre-promotion evidence: owner-authorized deviation.** The owner's release
order of 2026-09-30 replaced the committed gate with this lean path.
- The coordinator's pre-flight on the identical tree (Node 24.21.0): static
  checks pass; unit 3,323; browser 249 (one load-timing miss passed 3 of 3 on
  re-run); configured and offline builds with `check:csp` and budgets 14/14;
  production e2e 1,282 passed, 0 failed; development 189/0; offline 36/36;
  cloud-UI desktop 0 failures and mobile 124/0 (a first mobile run lost its dev
  server mid-run); emulator rules 10/10.
- The integrator's configured build of `b08efa85`: build, `check:csp` and
  `check:budgets` pass, and the Vercel build printed the same first-paint
  hashes.
- Candidate verification: 44/44 with the fixed verifier, and the 50-row
  cross-check 50/50, including a real-browser boot on desktop and mobile.
- Not run: the sync-20 partition, the APB2 v3.2 campaign, the rollback drill and
  the release manifest.

**Validation stops.**
- The R22 committed gate stopped twice on intermittents: FLAKE-01's seek-stall
  variant (`films.spec.ts:73`), and in cloud-UI a Firestore-emulator
  transaction-lock contention in `friendships.spec.ts:49` (REL-08) plus
  `review-repairs.spec.ts:312` (REL-09). All three are registered in
  [intermittents](intermittents.md).
- Harness faults in the integrator's own scripts: a cold WSL start timed out the
  first owner-API readback before the candidate deployment, a CSP lookup used
  Release 6's rule source, and a status comparison expected an untrimmed
  string. None changed a result or a deployment.

**Receipts,** kept outside the repository:

| Receipt | SHA-256 |
| --- | --- |
| Promotion receipt (binds every step's receipt and the coordinator's messages) | `7719a193aa04429fddbfdd46b4eeaf99e8232922c7cf92206eafa85fb9838e09` |
| Push and PR | `4f91be24b6a5d6ef5280457bf8c9c4997b8166c7ba8dbba8047bcb436579c05a` |
| Push of the second verifier fix | `a011a8fdc4649e9bf04ab069690afb47fbd4031e962abf27ff3ab78c7e50b921` |
| Release deployment | `999ea930fd55251b59865f8e6a18d0912c14f4afe5c651e07b126acb8a42a1b2` |
| Recovery deployment (R22) | `d178173e2b6b89e90482aba7098764a5cafa74d98a36c5b182ee587b00146815` |
| Candidate `release:verify`, fixed verifier | `fd57ff75c23e366a01e154cc02b381b7ed70d26d739d8b6f97bc23a064e8ac03` |
| Candidate cross-check | `169409353e31af89f48d6483d0ccf7d53324690f64f88cb4a638ddfb39d77152` |
| Recovery deployment `release:verify`, fixed verifier | `7fbb17ea928409165b6552fa837af33543dfef1edc753c8cee5ca8a8d161b740` |
| Verifier defect record | `a824540aeee3eed018fb5974d13fac71f37e036cd174210de67249832abf0804` |
| Promotion, readback and settle | `2542be6fe63517f1faa1d572c8413aac6e071f9a336dc39665f6e86ba4e095bd` |
| Production `release:verify` (first fix, 43/44) | `969845d7d16a0d76fafe3345dc2f46ca70fad23e85c1f67cf30040504f336049` |
| Production `release:verify` (`d107420b`, 44/44, the coordinator's) | `806be219664e5746f04f4e1b6b9d43e331714a3fe7a7ed540ebe55f59d38afd6` |
| Production cross-check (49/50) | `96278b7925dfa879b2df21e10ed8a6efc7b48b1a19819533815ac95880024e19` |
| Service-worker arm | `868618fca2df03b8bd69a170eae3fb85eeb1ffec791f7b5ea22c70126e630864` |
| Service-worker probe | `b3ccba96a5ae39356d1913bc3efb727bb1efaf0d8abefc08c534ba4c2f740bde` |

**Rules: published.** The owner's signed-in Firebase console published
`firestore.rules` at 2026-09-30 21:11:28Z, while Release 7 was serving
(project `play100-online-48823b32`, default database). The console loaded the
reviewed file from a local server and checked its hash before inserting it,
and the editor showed no errors or warnings. Readback after a full reload:
SHA-256 `c6368628bcbc7a22896ab19ab569c20b24f2d6f33fdfcee2cad5b7e98754abb1`
(111,757 bytes), the reviewed R20 hash, as a new top history entry. The
previously published rules were the 270f baseline
`971b0fe6c7ec654bb21e72b70f7a431f71deff00612a9934ba02e851ae99243a`
(85,444 bytes, published 2026-09-22 21:37Z). Both files are archived outside
the repository. Indexes are unchanged. Pending action 3 is done; don't publish
any other rules hash.

**Waivers.** As for Release 6: no physical-device, iOS Safari, screen-reader or
OS install and launch runs; the release coordinator waived them. The real
Google smoke is still pending action 5.

**Known issues at release.**
- FLAKE-01 (`tests/films.spec.ts:73`) is an open test intermittent in the native
  film download and seek.
- REL-08 and REL-09 are open cloud-UI test intermittents from the R22 gate.

All three are registered in [intermittents](intermittents.md).

## Release 6: 2026-09-27

| Field | Value |
| --- | --- |
| Commit | `129e73eebbf6c8c7eef5fc3eda1d4ab45f8161fe` (tree `a4137a9a7d9f18072ddd7c473c0d3fd2560b1bf3`) |
| Merge | PR #9 (`leultew-r12-integration`) into `main`, a plain fast-forward of 30 commits from `228493e8`, merged 2026-09-27 02:30:46Z |
| Build | Remote Vercel build from a clean export, Vercel CLI 59.16 |
| Production deployment | `dpl_9Hh23osGZT4xU51H5iw3dHNK5ZSr` |
| Promoted | 2026-09-27 02:32:44Z with `vercel promote` (CLI 59.16.0), started 02:32:27Z |
| Rollback target | `dpl_5qytNVicHAZc9eo2KEqmEkSw29Me` (Release 5) |
| Strict inline hashes | All three **changed**: style-src online `sha256-+GHL56F8oAQk/PYCqUBh1Zke2G+BD97jtTBHXwfrOwk=` (16,714 B), offline `sha256-JxBfcuqoj5AiCu4Iygik/+XCjyi3/wle7sZrYKDci8w=`; script-src boot script `sha256-/9qVKVqdtFFoDgAr7bGIaXKtVqd+2ULyuMo34F44Jq4=` (4,808 B; budget 4,856) |
| Release manifest | SHA-256 `b89b1c44eedb59f5bb810e16eebff258840d2818b1785c0b76c4963be5183a96`, with 3 bound reports, 2 recorded carry-forwards, 1 decision and 1 waiver (the known issue below) |

**What shipped.** The G4 review findings that need no console step; PR #9 has
the details.
- Reliability: the catalog detail's **Your rank** shortcut goes through the
  pending-edit guard. A cold catalog detail opens an "Opening game…" dialog
  with Close once its code has taken 300 ms, and a late chunk can't reopen a
  closed detail.
- Performance: the Queue mounts at most 25 rows per page and keeps global
  order; moves cross pages and follow the game.
- UX and copy: the Queue's trash control is **Remove from queue**, which
  clears only queue membership. One-game removal and a single unqueried
  Discover result read in the singular. A rejected backup explains how to
  recover. On mobile the Ratings table's Compare strip keeps clear of the save
  toast. The Discover filter row uses one control treatment, and wrapped
  titles top-align.
- Accessibility and motion: under forced colours the select chevrons follow
  the field text colour. A first-time visitor sees "Illustrated view" instead
  of "Lite mode" before their preference is known.
- Security: the auth helper answers HEAD without an upstream fetch. Public
  and shared titles refuse control and format characters, display names
  refuse blank-looking fillers, and a cancelled friend request is held for
  ten minutes against its sender. The docs no longer overstate the key
  allowlist, scan summaries, WAF Log mode or a started Google redirect.
- Release operations: an offline characterization partition runs
  `tests/root-navigation-guards.spec.ts`, which skips itself on configured
  builds. Every static check keeps its own exit-code receipt and log.

**Readback.**
- Alias `play-100-collection.vercel.app` resolves to
  `dpl_9Hh23osGZT4xU51H5iw3dHNK5ZSr`, confirmed by both the Vercel API and
  `vercel inspect`.
- Before the readback, five consecutive public `/` responses matched the
  candidate's index, with no stale response (02:33:00Z to 02:33:05Z).
- Production `/` index.html SHA-256:
  `0c8ece7303d0d51c273b16467df30d3ef14f481e9f28caeccf424b47f6818e81`, the
  candidate's and the local configured build's. Entry
  `/assets/index-92E_lsiE.js`.
- CSP header SHA-256:
  `c35e705911e8dbe37da0e61a531c54b60c9c0ff1672b20de14ff0d260923aa7d`. It
  changed with the three inline hashes.
- `/sw.js` SHA-256
  `1d31b01a3b8a404c14eba56cea402ae114fde3eda2d6eb63ec74941c42cabc62`.
  `/pwa-assets.json` SHA-256
  `32eef18fa6ccd46cecf5a439c9616dec316ef075c1900735f6042538ef27e64f`, PWA
  version `b3036a0bbcb6b183459e0517efbc481e2f745378c1b97acbb8f4a97b9e2f1cf4`.

**Post-promotion production checks.** `npm run release:verify` passed 43/43
on Node 24.21.0. The integrator's cross-check passed 50/50: the Release 5 set
plus the offline style hash, with every hash and `Permissions-Policy` checked
against `vercel.json`. They agree on the index, the worker, the PWA assets and
the version. No rollback rule triggered.

**Service-worker update probe: passed.** One pass on the public alias with no
bypass, in headless Chromium with a persistent profile, across the promotion:

1. Armed on Release 5: offline files ready in 23.4 s, with the controller on
   Release 5's PWA version `8ea0c046…`, and no CSP violations.
2. After promotion, the waiting Release 6 worker was applied through the app
   with exactly one reload. The controller moved to `b3036a0b…`, Release 6's
   `/pwa-assets.json` version.
3. Cold offline launch: `/` and `/my-games` loaded from the worker on Release
   6's entry.
4. Under the updated worker, a single unqueried Discover result read
   "1 game · Illustrated first". A fresh profile's landing caption never read
   "Lite mode" before it settled.
5. No CSP violations. The fresh-profile check first recorded a failure because
   the probe read a violation counter that exists only in the persistent
   profile; that page's own violation listener and its console both showed 0.
   The receipt keeps the recorded status and the corrected reading.

**Pre-promotion evidence.** The release manifest binds each report or records
its carry-forward or waiver.
- Static checks on `129e73ee`: types, Functions types, Prettier, ESLint and the
  data and discovery validators, each with its own exit-code receipt and log.
- Gate on `129e73ee` (Node 24.21.0): 184 files, 2,689 passed, 1 skipped (unit
  171 / 2,530; browser 13 files, 159 plus 1 skip). The first run timed out one
  budget-script test at 100% host CPU; the pre-authorized single re-run
  passed, and both runs are kept.
- Firestore emulator suite: 265/265, plus the handle-claim race case 5/5, on
  rules `8e645497…`.
- Configured build: `check:csp` clean, budgets 14/14.
- Production partition, full, 852: 851 green. Development partition, full,
  194: 189 passed, 5 skipped. Cloud-UI, full: 227 of 228, with the compare
  fixture allocated and required.
- Offline characterization partition: `root-navigation-guards` 36/36 on an
  unconfigured build of the same commit, with its own manifest.
- Candidate verification: 43/43 and 50/50.
- Gitleaks 8.30.1 over `228493e8..129e73ee` (30 commits): the parent's receipt
  records no leaks found; the scanner's redacted JSON report and log are kept
  with it.

**Validation stops.** Two were product defects in this release's own changes,
fixed before promotion; the rest were test, host or harness issues.
- The first R12 rules hit Firestore's limit of 1,000 evaluated expressions on
  `publicProfiles` writes, so three emulator tests were denied. The rules now
  use literal patterns and check cheap and unchanged values first, and a
  heaviest-write test guards the limit.
- The cancellable-detail dialog opened during React's one-commit lazy
  suspension and took the card-to-detail motion, so `discover-motion` failed
  on both projects. The dialog now waits 300 ms.
- A stale assertion in `root-navigation-guards.spec.ts` had failed unnoticed
  since 2026-09-25 because no partition ran the spec. It is fixed, and the new
  offline partition runs it.
- Host-load stalls, each passing on a targeted one-worker re-run: the
  native-zoom test's context close, a cross-tab autosave race in
  `release-review.spec.ts`, a Google script load in the cloud-UI identity
  spec, and a budget-script unit test.
- Harness defects in the integrator's own scripts: an extra dist-identity check
  assumed an offline header class, and the fresh-profile CSP probe read the
  wrong profile's counter. Neither changed a result.

**Receipts,** kept outside the repository:

| Receipt | SHA-256 |
| --- | --- |
| Promotion receipt (binds every step's receipt) | `3d48788ed8cc00f9910e8384aed2af05641fa6cbfa5c648e41900be1c5334f9c` |
| Push and PR | `ac5521438554c7b9e3d22c630263b4a063cfe7a718bfdd4cb01edf5e18fd6b21` |
| Promotion and public checks | `1dd692961707c073917020dabcfee733df0c965bf485acf20dbaacea5fb56d3e` |
| Production `release:verify` JSON | `ce2cccf163559a05696b004c9417de1fd8f2220b4046ff5a3647cdfd502a8a1e` |
| Service-worker arm | `ed995a6184b7223d81e9494b11e46eb53c7aa5084b3934c67b9259694e1581d3` |
| Service-worker probe | `9af9dac37c238a5dc3be4106bc7eb11ccaf2d38b234e83072aa6bbdf891195fa` |
| Probe harness defect record | `cc9dffd378c83fee6694e573ee3f0c059b82aa59f9c60599425cf0362be192bc` |

**Rules.** Changed: title and name hygiene, the post-cancel hold and the
evaluation-limit fix. At release the pending publish was `firestore.rules`
SHA-256 `8e645497aaec7898e2e11f41d9985b7608fedf82c77305ac5b24b0fbf7bedb10`,
to be published only while Release 6 or later is serving. The R13 rules
supersede it, and pending action 3 names the rules to publish. Don't publish
the Release 5 rules `6c8ebcb2…` either.

Correction (R13): this entry first said that, in a repeat run of the cloud-UI
identity test under the Release 5 rules, a legitimate sync-head update hit the
1,000-expression limit. The refused save was a stale commit from the tab that
lost the two-tab race. The limit in the emulator's denial came from a first,
commit-wide pass that doesn't decide the outcome; see the save-commit
evaluation limit in [security](security.md).

**Waivers.** As for Release 5: no physical-device, iOS Safari, screen-reader
or OS install and launch runs; the release coordinator waived them. The real
Google smoke is still pending action 5.

**Known issues at release.**
- Two visible windows of one signed-in account can both upload the same pending
  edit. The one that finishes second then shows "Needs a choice", a
  recoverable conflict prompt. Both uploads hold identical content, and no data
  crosses accounts. The race has existed since online saving shipped: the
  cloud-UI identity test fails 2 of 10 on Release 5 and 3 of 10 on this
  release, with the same signature. It is recorded as the manifest's waiver,
  and the fix is scheduled next.

## Release 5: 2026-09-26

| Field | Value |
| --- | --- |
| Commit | `228493e8222483ac3aa50f95784ff30486fe21c5` (tree `e79b3c5d1dd2795a58f3668005a4c67b9cdbdc55`) |
| Merge | PR #8 (`leultew-r11-integration`) into `main`, a plain fast-forward of 33 commits from `c877a04b`, merged 2026-09-26 15:18:21Z |
| Build | Remote Vercel build from a clean export, Vercel CLI 59.16 |
| Production deployment | `dpl_5qytNVicHAZc9eo2KEqmEkSw29Me` |
| Promoted | 2026-09-26 15:20:58Z with `vercel promote` (CLI 59.16.0), started 15:20:44Z |
| Rollback target | `dpl_sUKWmFGu6PR8zLtxyk2pCbqpLP7Y` (Release 4) |
| Strict inline hashes | style-src unchanged: online `sha256-NGUjOxY76/cGN3gmM/YONiEbuC6rhQrQEr9XDkz0oxs=`, offline `sha256-yoYUnUqLaGmW5eJpbrdR7YmLQEZzKihnuFrDIgUKkdw=`. script-src boot script **changed** to `sha256-4Wv/e6hEDgM3I5UMpDdRqcY2V6b9Vkh/EO/11lmGUMw=` (4,760 B; budget 4,856) |
| Release manifest | SHA-256 `210e14801cd920f1cfa308053e968126347e7deaaead848e4ab1474be6f4061f`, with 7 bound reports, 6 recorded carry-forwards, 1 decision and no waivers |

**What shipped.** The G3 review findings that need no console step; PR #8 has
the details.
- Offline and reliability: the offline shell accepts one bounded Library
  `page`. Header and detail shortcuts share one navigation guard. The deletion
  screen names the service update it needs instead of a time. Cold detail
  lookups of one game share a single upstream run. The Data use page no
  longer preloads collection data, which a prepared worker refused with a 503.
- Security: handle reads deny missing handles, and claims happen by create
  write. `Permissions-Policy` also denies payment, USB, serial, HID,
  Bluetooth and display capture.
- UX and copy: keyboard browsing continues into appended games. In Table
  view the Compare tray sits after the table. Update checks report their
  outcome, and pins toggle alike in every view. Counts of one are singular.
  The Settings heading names its destination, and offline limits are
  explained in plain words.
- Accessibility: saving Played keeps keyboard focus on the checkbox.
- Visual: the mobile Compare sheet spans the viewport. Artwork credits are
  prose with separate Source image and license links. A WebGL fallback no
  longer moves the page.
- Code and release: authored CSS is under the Prettier gate. The gate is
  pinned to Node 24.21.0, and the cloud-UI recipe requires the compare
  fixture.

**Readback.**
- Alias `play-100-collection.vercel.app` resolves to
  `dpl_5qytNVicHAZc9eo2KEqmEkSw29Me`, confirmed by both the Vercel API and
  `vercel inspect`.
- Before the readback, five consecutive public `/` responses matched the
  candidate's index, with no stale response (15:21:16Z to 15:21:21Z).
- Production `/` index.html SHA-256:
  `8363abde7d238f03f2e160acc951a07dd71a3d7ac1ff72c149e230641a8f31a1`, the
  candidate's and the local configured build's. Entry
  `/assets/index-D-8B5VOL.js`.
- CSP header SHA-256:
  `332badf23629566d859bcf36e78d494f7c0706f56d4c96a792a1ab1ccb16982f`. It
  changed with the boot-script hash.
- `/sw.js` SHA-256
  `1987b6f0efa45b3d8c72bfad65b5e309a6cfac4ea458a324faad55fd22db7ebd`.
  `/pwa-assets.json` SHA-256
  `7263af72caea02ab75d641f6dd05bfd2aeb643b19ee88b11b40deb54235667b6`, PWA
  version `8ea0c046f28c917c575e78661327069da8b1b79deba6a4e3e681e32ebb556f7b`.

**Post-promotion production checks.** `npm run release:verify` passed 43/43
on Node 24.21.0. The integrator's cross-check passed 49/49: the Release 4 set
plus `Permissions-Policy` and the boot-script hash, both checked against
`vercel.json`. They agree on the index, the worker, the PWA assets and the
version. No rollback rule triggered.

**Service-worker update probe: passed, no findings.** One pass on the public
alias with no bypass, in headless Chromium with a persistent profile, across
the promotion:

1. Armed on Release 4: offline files ready in 10.1 s, with the controller on
   Release 4's PWA version `b9727629…`, and no CSP violations.
2. After promotion, the waiting Release 5 worker was applied through the app
   with exactly one reload. The controller moved to `8ea0c046…`, Release 5's
   `/pwa-assets.json` version.
3. Cold offline launch: `/` and `/my-games` loaded from the worker on Release
   5's entry.
4. Under the updated worker, `/data-use` loaded readable, with no
   `/data/collection.json` request and no 4xx or 5xx response.
5. No CSP violations on any probed page.

**Pre-promotion evidence.** The release manifest binds each report or records
its carry-forward.
- Gate on `ca1d447c` (Node 24.21.0): unit 169 files / 2,507 tests; browser 13
  files, 149 passed, 1 skipped. On the final code: unit 170 / 2,511, and the
  restore-preview browser test 30/30.
- Firestore emulator suite: 258/258, plus the handle-claim race case 5/5, on
  rules `6c8ebcb2…`.
- Configured build: `check:csp` clean, budgets 14/14.
- Production partition, full, 808 on `51a85354`: 807 green; the one failure
  is below. Development partition, full, 186 on `228493e8`: 184 green; the two
  failures are below. Cloud-UI, full, on `ca1d447c`: desktop 114/114; mobile
  113, plus the opt-in skip. The compare fixture was allocated and required.
- Targeted re-runs on the final tip: `personal.spec.ts` 36/36,
  `mobile-nav-readability.spec.ts` 3/3 (plus its 3 skips by design),
  `played-ranking.spec.ts` 14/14, and the progress-sync cloud-UI test 2/2.
- Candidate verification: 43/43 and 49/49.
- Gitleaks 8.30.1 over `c877a04b..228493e8` (33 commits): the parent's receipt
  records no leaks found. That receipt summarizes the result; it is not the
  scanner's raw report.

**Validation stops.** Each was root-caused, and none was a product defect.
- The queue touch-drag test aimed its handle at the next row's centre, so on
  tall mobile rows the drop landed one row late under host load. It now aims
  by row centres.
- The native-zoom navigation test ran out of time closing its own second
  Chrome on a busy host, after every check had passed. It now allows 90 s.
- The browser-restart test hung closing its persistent profile while the host
  was at 100% CPU. It passed on a one-worker re-run and is unchanged.
- The cross-check still expected Release 4's 47 rows after two were added.
  The count was raised to 49 and the check re-run.
- The push script ran under Windows PowerShell 5.1, which stopped on git's
  `remote:` output after the branch push had succeeded. The integrator
  confirmed the push with `ls-remote` and continued steps 2–3 under
  PowerShell 7 without pushing again.

**Receipts,** kept outside the repository:

| Receipt | SHA-256 |
| --- | --- |
| Promotion receipt (binds every step's receipt) | `9c4097898cc8b297195d470f95ee83d758d382e53953254367fb33def4903d70` |
| Push and PR | `c15b6314d01c055b452cc8e0b5310be4b68924459e5e9df4d0a26cd97977dcf1` |
| Push harness defect record | `9ced3779a9609f7f4a86caeeee8c61ceb3755976c06a30fdb9f50304a271d516` |
| Promotion and public checks | `c817929bcc0bf3f5c888ce3ce14848427eb72d16b0a9020fe1aca4cc607601dc` |
| Production `release:verify` JSON | `7c708f6a5ab182ed61dabc946fe0c02bf3c0d384f254f888cf6e6ea741532f72` |
| Service-worker arm | `c44a449c0a844849aae0323b621aa3f467acb489bdb7845c2b63a15afdace7ba` |
| Service-worker probe | `8a1f167243887707ecfd31493cc0cbd04f9ec8cffc090e642451021406958e4e` |

**Rules.** Changed: handle claims now use a create write. The pending publish
is now `firestore.rules` SHA-256
`6c8ebcb2e8147753b8976eb8fedf739057c0469d6fda1f351e1c0fd887f3440d`
(pending action 3). Release 4 clients can't claim a new handle under these
rules, so publish them only while Release 5 or later is serving.

**Waivers.** As for Release 4: no physical-device, iOS Safari, screen-reader
or OS install and launch runs; the release coordinator waived them. The real
Google smoke is still pending action 5.

**Known issues at release.** None known.

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
- Gitleaks 8.30.1 over `f8ba8549..c877a04b` (26 commits): the parent's receipt
  records no leaks found. That receipt summarizes the result; it is not the
  scanner's raw report. An independent review of the runtime commits found no
  issues.

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
  scripts are recorded in `allowScripts`. The npm 11 used for this release only
  warns about unapproved scripts, so that list is advisory
  ([install scripts](security.md#headers-auth-proxy-and-supply-chain)).
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
  (59 commits): the parent's receipt records no leaks found. That receipt
  summarizes the result; it is not the scanner's raw report.

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
3. **Rules.** Done: published 2026-09-30 21:11:28Z while Release 7 was serving;
   readback SHA-256 `c6368628bcbc7a22896ab19ab569c20b24f2d6f33fdfcee2cad5b7e98754abb1`
   (111,757 bytes). See [Release 7](#release-7-2026-09-30). The instruction as
   written before publication:

   Publish `firestore.rules` from the R20 tree, and only while
   Release 7 or later is serving. Its SHA-256 is
   `c6368628bcbc7a22896ab19ab569c20b24f2d6f33fdfcee2cad5b7e98754abb1`
   (111,757 bytes). It supersedes the unpublished R13 rules (`75381577…`),
   Release 6 rules (`8e645497…`), Release 5 rules (`6c8ebcb2…`), Release 3
   rules (`9458021a…`) and Release 1 rules (`37e55c79…`); don't publish any of
   them.

   R20 changes one statement from R13: a creator can hide or unpublish a live
   profile, and its owner can unpublish it, after the owner advanced the
   publication control on its own (see
   [security](security.md#profile-reads-and-handles)). Nothing becomes newly
   refused, so no client needs to change.

   The R13 rules keep a deleted online copy deleted for sessions older than
   the deletion. They refuse forced line breaks in names and titles,
   whitespace-only public entry titles, and control, format or line-break
   characters in report reasons, and they lower the cost of every save. A
   Release 6 client gets the generic authorization message in these cases
   only:
   - pausing an online copy that another session deleted, before its sync
     engine sees the deletion;
   - saving a name, or publishing or selected-sharing a title, that contains
     U+2028 or U+2029;
   - sending a report whose reason contains a line break, a tab or another
     control or format character, since Release 6 sends a multi-line reason as
     typed.

   A Release 5 client meets those cases and the three R12 ones: publishing or
   selected-sharing a title with a control or format character; saving a new
   or changed name that contains a Hangul filler or U+2800, or holds only
   marks and spaces; and re-requesting, or at the 1,000-pair cap releasing,
   within 10 minutes of its own cancel.

   Readback: copy the published text back and confirm its SHA-256 equals that
   value, then record the version timestamp. The pre-release rollback archive
   is `971b0fe6c7ec654bb21e72b70f7a431f71deff00612a9934ba02e851ae99243a`.
4. **WAF.** Switch `api-per-ip` (`rule_api_per_ip_xpgBNf`, in **Log** mode since
   2026-09-25 09:49:22Z; see
   [Release 2](#release-2-2026-09-25) and the
   [runbook](security-release-runbook.md#vercel-waf-rate-limit-for-api-and-the-auth-helper))
   from Log to 429 after 7 clean days, no earlier than 2026-10-02. Readback:
   record the reviewed Log hits and the switch time.
5. **Google smoke.** Run a real Google sign-in, link and reauthentication on
   production, on desktop and mobile. Readback: each flow returns to the app
   signed in, and the Console shows no CSP violation.
