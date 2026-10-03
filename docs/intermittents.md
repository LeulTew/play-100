# Intermittent test register

**ID scope:** `REL-nn` IDs belong to this register, not to the G12 tech review.
Here, REL-11 is the cloud-UI development-server stall, REL-12 is the
`friend-all.spec.ts:430` emulator cleanup refusal and REL-13 is the
`friend-all.spec.ts:538` doubled withdrawal commit. G12's **REL-11** instead
means "a backup chosen while busy is dropped" (fixed in `eaf5e510`), and G12's
**REL-12** means module service-worker registration on Firefox below 147
(support detection and accurate offline copy fixed in `219e6e39`).

Track a failed attempt even when its retry passes. "Host load" is a hypothesis
unless the receipt establishes the cause; a one-off pass is not loop evidence.
The release operator retains native reports, command exits and debug logs
outside the repository. Review open rows at every candidate gate, update them
on recurrence, and investigate rather than retrying until green.

Historical rows retain the evidence available at that release. The
[R24 intermediate CI inventory](#r24-intermediate-candidate-ci-loops) adds the
subsequent repetitions for every covered row; an older "no loop recorded"
statement is not the current evidence inventory.

| Test | First seen | Root cause or hypothesis | Status | Loop evidence |
| --- | --- | --- | --- | --- |
| `tests-cloud/friend-all.test.ts`: "converges a first friend action and the automatic default on one default policy in either order" | [Release 1, 2026-09-25](releases.md#release-1-2026-09-25), rules run at `2f727389` | Unresolved denial; the test races `startDefault` and `setPolicy` transactions with `Promise.all`. An interleaving defect is a hypothesis, not an established harness fault. | Open; candidate-rules loop required. G8 calls this Release 6 evidence, but the cited receipt is in the Release 1 ledger entry. | Original 248 passed / 1 failed; single-file rerun 38/38. No convergence loop receipt recorded here; run the 20-iteration gate below. |
| `tests-cloud-ui/review-repairs.spec.ts`: "verified unused Google registration returns from reauthentication without deleting until explicitly confirmed" (historical `:36`, desktop) | [Release 3, 2026-09-26](releases.md#release-3-2026-09-26) | Unreproduced; no root cause established in the ledger. The same test failed the same way in R19 and R23; see REL-10 below, whose cause is likely here too, though no artifact of this failure is retained to confirm it. | Open; do not classify as an external Google failure without evidence. Covered by the REL-10 repair. | One rerun passed; no loop recorded. The adjacent `friend-all-review` 54/54 receipt covers a different spec. |
| `tests/compare-tray-context.spec.ts` | [Release 4, 2026-09-26](releases.md#release-4-2026-09-26) | Ledger identifies a test race; exact interleaving is not specified there. | Test-only repair recorded; monitor recurrence. | Whole repaired spec 12/12; no repeated loop recorded. |
| `tests-cloud-ui/friend-all.spec.ts` | Release 4, 2026-09-26 | Ledger identifies a test race; exact interleaving is not specified there. | Test-only repair recorded; monitor recurrence. | Whole repaired spec 14/14; no repeated loop recorded. |
| Queue touch-drag (`tests/queue-pagination.spec.ts`) | [Release 5, 2026-09-26](releases.md#release-5-2026-09-26) | Handle aimed at next row's centre; tall mobile rows could drop one row late under load. | Test targets changed to row centres. | No repeated loop recorded. |
| Native-zoom navigation / secondary Chrome context close | Release 5, 2026-09-26; recurred in Release 6 | Context close exceeded timeout on a busy host after assertions passed. | Timeout raised to 90 s; retain recurrence evidence. | Targeted one-worker rerun passed; no repeated loop recorded. |
| Browser-restart persistent-profile close | Release 5, 2026-09-26 | Close stalled at recorded 100% host CPU. | Unchanged test; monitor host-related recurrence. | One-worker rerun passed; no repeated loop recorded. |
| `scripts/check-budgets.test.ts` | [Release 6, 2026-09-27](releases.md#release-6-2026-09-27) | Timeout at recorded 100% host CPU; exact original case was not identified in the ledger. R24 measured the real source-tree census at 1,580.8 ms, much larger than the tiny build fixtures. | Timeout-hardening item closed in R24: fixture directories are created once and independent writes run together; the source-census test alone has a 20 s timeout (>10x measured baseline). Route fixtures remain shared. Every budget, failure, route and byte assertion is unchanged. Reopen on recurrence; no guarantee under arbitrary host starvation. | Five fresh runner invocations passed 170/170 budget cases (34 each), plus 20/20 OS-companion pure cases. Source-census times 42.8–155.5 ms; these warm repetitions are not a claimed 100%-CPU stress run. Archived evidence: `r24-budgets-before.json` and `r24-budget-loop-1.json` through `r24-budget-loop-5.json`; see the SHA-256 digests in [archived evidence](#archived-evidence). No browser/build workload was used. |
| `tests/release-review.spec.ts`: cross-tab autosave | Release 6, 2026-09-27 | Ledger attributes a stall to host load; current dirty-draft test pauses autosave while observing remote updates. | Monitor recurrence; do not confuse with the online upload race below. | Targeted one-worker rerun passed; no repeated loop recorded in ledger. |
| `tests-cloud-ui/identity.spec.ts`: Google script loading | Release 6, 2026-09-27 | Host/load stall recorded; current gate uses a controlled provider fixture. | Monitor recurrence; real Google is a separate check. | Targeted one-worker rerun passed; no repeated loop recorded in ledger. |
| `tests-cloud-ui/identity.spec.ts`: two-window pending upload | Release 5 reproduced during Release 6 investigation | Both tabs uploaded identical pending content; loser displayed a recoverable conflict. This was a product race, not mere test noise. | Historical waiver; identical-payload convergence is now documented in [online saving](online-saving.md). Retain candidate loop evidence before closing. | Historical failures 2/10 on Release 5, 3/10 on Release 6. G8 reports a later identity 20-iteration run; consult its operator-held receipt rather than inferring the convergence-test outcome. |
| `tests-cloud-ui/compare-orientation.spec.ts`: "one-person chooser stays open through second-to-sixth checks and below-two revocation reopens it" (historical `:421`, failing at `:445`, desktop) | R18b cloud-UI gate, 2026-09-28 | Product race, found in the code. Compare reopened its "Change people" `<details>` for fewer than two people only when its React state said closed, but a user's close reaches that state only through the element's `toggle` event, which the browser delivers in a later task. A revocation that committed before a pending close's event found the state still open and did nothing; the late event then recorded the close, and nothing ran again, so the chooser stayed closed beside "Choose at least two people." Which came first depended on load. | Fixed in R19: when fewer than two people are chosen, the chooser also opens the element itself, in a layout effect, so the late event reports it open; a close made after that still sticks ([compare-disclosures](../src/cloud/compare-disclosures.ts)). The coverage details, which open themselves for a failed read or a review, had the same race and are fixed the same way. | Deterministic regression test instead of a loop: [compare-disclosures.browser.test.ts](../src/cloud/compare-disclosures.browser.test.ts) closes a disclosure and commits what reopens it with `flushSync` in one task, so the close's event is still queued. Pending its first run in the R19 gate. |

## Known CI-only stall

The `resize-observer-loop` renderer hang is **environment-specific to software-GL
CI; not reproducible on GPU hosts**. The main thread waits synchronously on
Chrome's GPU process running SwiftShader. The affected GPU-less runners use
Playwright's `--enable-unsafe-swiftshader` launch flag. This is not a
ResizeObserver loop and is not the normal cost of the author footer or sprite.

The investigation reproduced two stalls in 440 instrumented desktop visits
under four-worker load. In the retained 412 px failure from
[run 36971358578](https://github.com/LeulTew/play-100/actions/runs/36971358578),
synchronous request beacons recorded native context creation in 48 ms, renderer
construction in 38 ms, and the first scene render from 1,712 to 2,221 ms
(509 ms). A heartbeat arrived at 2,259 ms. After a 502 ms task and the scroll-start
message, all heartbeats stopped for the 45 s deadline: the scene had finished
starting and our code had returned before this stall. The earlier failure
stalled within the scene-building task. Ordinary console/binding notifications
cannot locate the blocking call because Blink flushes them when the current task
ends; synchronous request beacons were needed.

Retained beacon receipt: `diag3-contention/failed-visit.json`, SHA-256
`f2b1c4054be7f92148287584b460538c6c76941576749e208670eff451618d24`.
The aggregate count and this signature describe the software-GL investigation,
not a new product fix or a guarantee under arbitrary host starvation.

Constrained devices do not start the scene in Auto. Ordinary Chrome 138+ without
the unsafe opt-in refuses SwiftShader WebGL fallback; hardware-GPU hangs are
bounded by Chrome's GPU watchdog instead of taking this CI-only software path.
See Chromium's [SwiftShader opt-in documentation](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md).
The classification is about this reproduced environment, not every possible
browser or driver failure.

**Candidate CI attribution:** list a matching failure as a "known CI-only stall"
only when the receipt identifies software GL, the first double-rAF scroll
`page.evaluate` times out before its loop-error assertion, the renderer/heartbeat
stops responding, and no ResizeObserver error is recorded. Keep the failed
attempt and its trace visible; do not retry, auto-pass or suppress it. A different
signature remains a new investigation. The spec, traversal, device-memory
setting, timeouts and assertions are unchanged.

## R19–R24 recurrences and first sightings

Historical line numbers below identify the failed attempt, not necessarily the
test's current line. A repair commit is not execution evidence.

| Test | Recurrence | Cause or current evidence | Status and retained checks |
| --- | --- | --- | --- |
| `tests/discover-card-layout.spec.ts:90`: Pin/Pinned viewport position, desktop at 1920 px | First sighting, 2026-10-02, [full production run 36972598816](https://github.com/LeulTew/play-100/actions/runs/36972598816), exact commit `1f4e444e2dc4b599af96106b2e67456ca3af5697`, tree `ccb6e800dd8b3b9e1d500d440bafe2812359995c`. The vertical movement was 2 px against the unchanged 1 px tolerance. | The retained trace establishes viewport scrolling, not card reflow: all 16 document-coordinate boxes (four cards and their action targets) are identical before/after Pin in `call@14043` and `call@14063`. Pin remains at document y `970.921875`, height `44`. Root `scrollTop` changes `23` to `21` between the pre-Enter snapshot `call@14051` and the action snapshot of forced-colors `press('Enter')`, `call@14055`. That accounts for the 2 px viewport-coordinate difference; the timing trigger remains unproven. An audit of all 28 removed responsive declarations found no differing intermediate-breakpoint override. | Not reproduced in either unchanged two-spec loop (`discover-card-layout.spec.ts` and `compare-tray-context.spec.ts`), 10 repetitions, both projects, two workers: [run 36975571643](https://github.com/LeulTew/play-100/actions/runs/36975571643) on integrated commit `1f4e444e2dc4b599af96106b2e67456ca3af5697`, tree `ccb6e800dd8b3b9e1d500d440bafe2812359995c`, containing CSS consolidation `1e3ea59afffe1b0cfb20ef29c71303083d9ce202`; and [run 36975575008](https://github.com/LeulTew/play-100/actions/runs/36975575008) on pre-consolidation commit `ca00d6d106ddc4909635e610b0a615fee0eb0e7e`, tree `e025d834abcb4c92334b2f805a53bcc98ab17766`. **Each loop: 1,160 passed, 20 skipped, 0 failed.** No CSS, spec or tolerance change; retain and monitor. Passing loops do not erase the first sighting or prove its timing trigger. Original trace, native reports and extracted geometry digests are recorded below. |
| `tests/resize-observer-loop.spec.ts:31`, desktop at 320 px | R24 batch attribution on `d68c011b`, 2026-10-02, [run 36962999320](https://github.com/LeulTew/play-100/actions/runs/36962999320); the same timeout recurred in the full production run on `6a88e91b` ([36964477878](https://github.com/LeulTew/play-100/actions/runs/36964477878)). | CI-only renderer stall: a synchronous wait on Chrome's GPU process running SwiftShader; no ResizeObserver error recorded. The 45 s deadline expired inside the first double-rAF scroll, before the loop-error assertion. A passing whole visit took 4.1 s before the author batch (`a6a57ed8`, [36963006900](https://github.com/LeulTew/play-100/actions/runs/36963006900)) and 4.8 s after (`75c6bfb0`, [36963126559](https://github.com/LeulTew/play-100/actions/runs/36963126559)); the added page content does not normally consume the deadline. In the failing `6a88e91b` trace, the author sprite finished with HTTP 200 about 121 ms before the stalled evaluate. The scene module finished about 94 ms after it; two following cover requests and subsequent DOM/screenshot capture never completed. The subsequent synchronous-beacon investigation reproduced 2/440 instrumented desktop visits under four-worker load, including a 412 px failure after scene startup completed; see [known CI-only stall](#known-ci-only-stall). | Environment-specific to software-GL CI; not reproducible on GPU hosts. No product, traversal, device-memory, timeout, assertion or retry-policy change. Unchanged spec: 40/40 on `75c6bfb0` ([36965919550](https://github.com/LeulTew/play-100/actions/runs/36965919550)) and 40/40 on `6a88e91b` ([36965919008](https://github.com/LeulTew/play-100/actions/runs/36965919008)). It also passed in the full production runs on `75c6bfb0` ([36963126559](https://github.com/LeulTew/play-100/actions/runs/36963126559)) and `a49f27a6` ([36963126988](https://github.com/LeulTew/play-100/actions/runs/36963126988)), and full offline on `6a88e91b` ([36964478715](https://github.com/LeulTew/play-100/actions/runs/36964478715)); those full jobs had other failures. Timing-only instrumentation on `c339c15d` passed 80/80 ([36967033207](https://github.com/LeulTew/play-100/actions/runs/36967033207)): desktop 320 first scroll 810.7–1677.9 ms, median 867.6 ms, 24 steps, final height 7589 px; worst frame wait 840.6 ms. All measured scrolls were visible; no hidden event was recorded. Native WebGL context creation max 94.5 ms, first compile/link/draw calls each at most 7.4 ms, longest observed long task 466 ms. Later beacons measured context 48 ms and the full first render 509 ms before a post-return stall ([36971358578](https://github.com/LeulTew/play-100/actions/runs/36971358578)). Passing loops do not erase the recurrence or establish a fix. |
| `tests/unified-search.spec.ts`: persistent browser restart | R19; recorded again in the G10 review | The case includes the persistent browser's full close/reopen lifecycle. The persistent-restart timeout repair gives that case 90 s rather than the ordinary 45 s. Host contention alone is not established as the cause. | R21 pre-flight passed desktop and mobile on tree `9547ad9`; no repeated loop is claimed. |
| `tests/compare-tray-context.spec.ts:324` (historical; navigation-height assertion at `:327`) | R19; one desktop recurrence on `c36eaffd`, 2026-10-02, [full run 36970595447](https://github.com/LeulTew/play-100/actions/runs/36970595447) | The earlier dock-slot repair waits for two frame-separated readings to agree after resize/drag/dialog close. The later navigation case still measures directly: the recurrence reported control 0 changing height by 2 px with the chip at 768 px, against its unchanged 0.5 px tolerance. The original sample does not establish whether that was settling or a persistent layout change. | Not reproduced in the unchanged whole-spec loop on exact commit `1f4e444e2dc4b599af96106b2e67456ca3af5697`, tree `ccb6e800dd8b3b9e1d500d440bafe2812359995c`: [run 36972970524](https://github.com/LeulTew/play-100/actions/runs/36972970524), 20 repetitions, both projects, two workers, zero retries. **1,920 passed, 40 existing skips, zero failures/flaky cases** (desktop 980 passes; mobile 940 passes and 40 skips). The reported navigation case passed **20/20 desktop** repetitions; its 20 mobile instances retain the existing desktop-only skip. The other 20 skips are the fine-pointer dock-slot case. All geometry assertions and tolerances are unchanged. No new product or test repair is claimed; retain the original recurrence and monitor. Native report identity and digests are recorded below. |
| `tests-cloud-ui/review-repairs.spec.ts:37` | R19 | Reauthentication recurrence recorded by G9/G10; no new cause proved by that receipt. The controlled Google fixture removes the external loader dependency but does not by itself explain this recurrence. The retained desktop failure (`error-context.md` and `trace.zip`, identified by SHA-256 in [archived evidence](#archived-evidence), 2026-09-29) shows the frozen-rules signature of REL-10 below: after "Confirm deletion" Account read "Deletion is paused because the online service needs an update". | Cause found in R23 (REL-10) and repaired there. |
| `tests-cloud-ui/friend-all.spec.ts:534`: interrupted online-copy cleanup | R21 pre-flight | The dialog-close assertion waited 15 s for a long sequential deletion. The deletion-completion assertion repair waits up to 30 s for deletion's own success or refusal, fails with a refusal's text, then checks the dialog. | The isolated 3/3 result predates this repair. Repaired candidate verification remains required; do not relabel that earlier rerun. R23 loop (REL-07): 40/40, 20 on each project with two workers, Node 24.21.0, on the intermediate R23 publication-convergence build (tree `31a80f38`), 2026-09-30 (cloud-UI receipt `r23-go-2c012012/rel07-friend-all-534.txt`). That tree is not the final candidate. |
| `tests/films.spec.ts:73`: native film download (FLAKE-01) | R20–R21, both projects; 7/38 recorded failures in the G10 report | Environment-level (Chrome network service or Windows loopback under automation), not the product or test servers; the exact responsible layer remains unresolved. Phase 1 established receive-side HTTP framing failure: `ERR_INVALID_HTTP_RESPONSE`, with interior MP4 bytes where headers belong. Phase 2: no Windows variant eliminates it across 510 executions. Failures/executions: preview 13/270, different static server 1/40, no-store 1/40, cleanup 2/40, flush 1/40, Chrome IOCP 1/80. Linux Candidate CI subsequently passed the same native case 80/80 (40 per project), zero failures/skips/retries, [run 36955185166](https://github.com/LeulTew/play-100/actions/runs/36955185166): intermediate tree a6a57ed8, not the final candidate. This supports the Windows-specific hypothesis, not a demonstrated fix. See [phase-2 evidence and limits](#flake-01-phase-2-conclusion). | Registered environment-level intermittent. Playback, switching, focus, native browser download and byte-identical SHA-256 assertions remain unchanged. Gate rule: re-run the isolated film partition once, retain both attempts, and stop if it fails twice. The exact WSL + Google Chrome comparison and WFP filter enumeration remain untried. Historical raw receipts: `films-r20-node24-x20.txt` (37/40), `films-node24-baseline-x20.txt` (36/40), `films-node24-closeall-x20.txt` (36/40), `films-70ce-x20-receipt.txt` (38/40), `films-distinct-url-x20-receipt.txt` (32/40). Linux artifact and the 2,049-file phase-2 manifest are identified by digest below. |
| `tests-cloud-ui/friendships.spec.ts:49` (REL-08): the receiver's `enableSelectedSharing` failed at `:46`, where "Sharing saved" never appeared (mobile; desktop passed) | R22 gate attempt 2, 2026-09-30 (first seen) | An overlap between two devices of one account, in the app; not a test race and not a seeding effect. The test signs the receiver in on two browser contexts (`other`, and the invitation's `receiving` context), and every signed-in device runs the sharing scheduler 1.2 s after a settings change. After "Agree & share" on `other` (02:02:53 local), both contexts published the same selection at once. Each context's generation cleanup, before its upload and again after publishing, re-checks the other context's new generation, the head and `friendSettings/<uid>` in a transaction. Meanwhile the other context's chunk batch writes that generation, and its rules read `friendSettings/<uid>` (`firestore.rules:590`). Under the emulator's pessimistic locks the two commits waited on each other. At 02:02:56 `other`'s cleanup commit aborted with "Transaction lock timeout", and the SDK retried it. At 02:02:58 `receiving`'s cleanup commit aborted the same way, and `other`'s chunk batch was denied because the rules `get()` failed with "Service call error". A denied write is not retried, so `other` showed "Sharing error" and "The server did not authorize this action", although `receiving` had already published the same ranking. Web SDK transactions hold no locks in production, so that denial is specific to the emulator. In production, the device that lost the race still reported "A newer shared ranking is already available", then published the same content again on retry. | Fixed in R23 (`friend-ranking-share.ts`). A publication takes the same content, already published under the same settings, as its result at every step. A denied step reads the settings, head and source again: identical content ends the publication, a change is a retryable conflict, and unchanged ones get one retry before the denial is reported as it came. The shared-games shelf, whose scheduler also runs on every device, settles its publication the same way (`friend-shelf-store.ts`). Regressions: `src/cloud/friend-publication-race.test.ts` for both publications, and cases in `tests-cloud/friendships.test.ts` and `tests-cloud/friend-shelf.test.ts` that hold one device's head commit until another device of the account has published. Evidence: the release operator's `r22-attempt2-stop.json`, and the trace and emulator excerpt in `r22-attempt2-cloud-ui-failures`. Loop on the intermediate R23 publication-convergence build (tree `31a80f38`), 2026-09-30: `friendships.spec.ts` ×20 on each project with two workers, both of its tests, 80/80. The full `tests-cloud` suite passed 283/283 there, including the two new two-device cases (cloud-UI receipts `r23-go-2c012012/rel08-friendships.txt` and `tests-cloud.txt`). |
| `tests-cloud-ui/review-repairs.spec.ts:312` (REL-09): "a clean failed online check stays paused after a fresh unchanged head and a later edit until manual retry", failing at `:341`, where `.sync-state` read "Saved online" right after the test restored the valid head (mobile; desktop passed) | R22 gate attempt 2, 2026-09-30 (first seen) | A test race; restoring the head does not resume saving on its own. After a failed head check, saving is blocked until a manual retry: the head listener is detached, the work queue is blocked, and focus, online and visibility wake-ups return early. In the failing run the page's head listener rejected the invalid head before the test's "Sync now" click landed. The trace's DOM snapshots read "Saved online" at 23:17:25.647Z and "Online saving paused" at 25.843Z, just before the click was dispatched, so the assertion at `:336` passed at once. Sync now's own check was still running: its button stayed disabled from 25.917Z until after the failure, and that retry refreshes the device copy (since the legacy-writer version-barrier repair) and then waits 200 ms before checking. The test restored the head at 26.081–26.086Z, so the retry read the valid, unchanged head and correctly reported "Saved online". On desktop the click evidently landed before the listener's failure, which then cancelled the queued check, so the pause held. | Test repaired in R23: after clicking Sync now, the test waits for the button to be enabled again before it asserts the pause and restores the head. By then the retry has settled on a failed check, and a later read cannot report success over it. Every assertion is unchanged. Evidence: the release operator's `r22-attempt2-stop.json`, and the trace and emulator excerpt in `r22-attempt2-cloud-ui-failures` (no lock timeout or service-call error in that window). Loop on the intermediate R23 publication-convergence build (tree `31a80f38`), 2026-09-30: `review-repairs.spec.ts:312` ×20 on each project with two workers, 40/40 (cloud-UI receipt `r23-go-2c012012/rel09-review-repairs-312.txt`). |
| `tests-cloud-ui/review-repairs.spec.ts:39` (REL-10): "verified unused Google registration returns from reauthentication without deleting until explicitly confirmed", failing at `:65`, where the page stayed on `/account` after "Confirm deletion" (desktop; mobile passed) | R23 pre-flight after the phase-two environment report, 2026-09-30; the same test failed the same way in Release 3 and R19 (rows above) | Test isolation, not the product and not R23's deletion changes. `security-migration.spec.ts` and `cancelled-registration.spec.ts` load Firestore rules into the emulator for the whole `demo-play100` project: the frozen `live-270f` rules, then the candidate rules again. [Security](security.md) requires one worker for them, and the gate's emulator steps use one, but the pre-flight ran with `--workers=2`. Its desktop log shows `security-migration`'s `live-270f` group (tests 117–118) starting in the other worker just after `:39` (116), and `:39` failing once the candidate group (119) had begun. `:39` fully deletes a verified account, whose cleanup lists its online chunks. The frozen rules deny that list once the head is deleted, which is what `security-migration.spec.ts:43` asserts, so the deletion stops at "Deletion is paused because the online service needs an update" and Account never navigates; the retained R19 failure shows that alert. On mobile `:39` (114) had finished before the frozen rules were loaded (118). R23's account-identity deletion guard fails only when the signed-in uid changes, and the test confirms it did not; the R19 failure predates that guard. The mobile run overwrote the desktop run's trace, so the pre-flight's own page state is not retained. | Repaired in R23 ([emulator-rules](../tests-cloud-ui/emulator-rules.ts)). Both rule-loading specs carry the `@emulator-rules` tag and check the run's worker count before loading any rules. With more than one worker they skip themselves, or fail inside the release gate, so no other test can run against rules they loaded; a multi-worker run covers them in a one-worker pass (`--workers=1 --grep @emulator-rules`). A throwaway two-group probe loaded and restored nothing with two workers, and ran both groups as before with one. The emulator reproduction and loops are pending. |
| `tests-cloud-ui/identity.spec.ts:10` (REL-11): "a cross-tab identity change flushes the old account draft without exposing it to the next account", failing at `:52`, where `signIn` waited 15 s for `.account-heading` (mobile; desktop passed) | R24 pre-flight cloud-UI run on `44c228ab`, 2026-10-02 (first seen) | The harness, not the test or the product: the cloud-test development server on 4187 stopped answering mid-run. The trace shows that the sign-in succeeded (the header reads "Account for Player Saved online") but Account stayed at "Loading Account…": its lazy `/src/cloud/AccountPage.tsx` request at 23:31:37.069Z never got a response. The last answer from 4187 came at 23:31:36.356Z, while the Auth (9199) and Firestore (8188) emulators kept answering. From the next test on, every navigation to 4187 failed with `net::ERR_ABORTED` after 90 s, in 15 more tests across seven specs, until the run was stopped at test 63 of 131. The server stopped because nothing read its output. The operator's runner starts Vite with piped stdout and stderr, drains them only from its own event loop, and runs each Playwright pass with `spawnSync`, which blocks that loop for the whole pass and, in its synchronous loop, between passes too. On Windows a Node process writes to a pipe synchronously (Node's "A note on process I/O"), so once unread output filled the pipe, Vite's next log line blocked its event loop. The development server does log during tests: its catalog middleware runs the API handlers, which log each verified artwork transformation and each upstream failure. This run's server had served the 10 emulator-rules tests, the 131-test desktop pass and about 45 mobile tests when it stalled; the mobile run that passed on `abb9736c` (124 passed, 7 skipped) ran its 131 tests on a fresh server. A 6 s reproduction on the same host, with a child HTTP server that logs 1 KB every 10 ms: while the parent waited in `spawnSync`, the child answered for about a second and then never again (the parent had read 11 bytes); with an awaited asynchronous `spawn` it answered throughout (403 KB drained). The committed release gate is not affected: it runs Vite in its own process and awaits each Playwright command, streaming its output to a log file. | Registered harness defect; the test and the product are unchanged. The repair belongs in the operator's runner, outside this repository: await an asynchronous `spawn` for each Playwright pass instead of `spawnSync`, or send the server's stdout and stderr to a log file instead of pipes. The `abb9736c` run's first mobile attempt stopped in global setup with "Nothing answers" moments after the runner's own probe had succeeded; its server log was empty, so that cause is not established. Loop pending: `identity.spec.ts:10` ×20 on each project after the runner repair. Evidence: `cloud-ui-44c228ab.txt.live.txt`, the mobile failure's `error-context.md` and `trace.zip`, both `abb9736c` mobile logs and the reproduction scripts, identified by SHA-256 in [archived evidence](#archived-evidence). |
| `tests-cloud-ui/friend-all.spec.ts:430` (REL-12): "All export and reversible then full deletion retain the device copy and require fresh Auth before re-enabling", failing at `:513`, where "Your online copy was deleted" never appeared (desktop) | Candidate CI run `36955254560` on `a6a57ed8`, repetition 9 of 10, 2026-10-02 (first seen; [below](#all-cleanup-denial-rel-12)) | The final step of the All cleanup was refused although nothing had changed what it deleted. That transaction reads the games job and head and deletes both. At 02:42:00.093Z it read the job (count 0) and the head; its commit at .098Z named their update times as preconditions and got HTTP 403. The emulator evaluated the job's delete rule with `resource` null (`firestore.rules:1482:54` is `resource.data…`; "Null value error"), and the head's rule, which is only `aCleanup(uid)` (it reads `friendAllPolicies/{uid}`, and `friendSettings/{uid}` while the policy is on), first as an error and then as `false`. No state of this account after 02:41:59.767Z, when Account turned the All policy off, gives those results: the job had existed since 02:41:59.061Z and the off policy passes `aCleanup`. They fit older states, before the job existed and while the default policy was on. Nothing else wrote those documents: the page was the run's only client (one worker), its trace shows no other write to the job, head, policy or settings, and the same verified token on every request. Unlike REL-08, the emulator log has no lock timeout, abort or service-call error anywhere in the run. So the emulator (v1.22.0, firebase-tools 15.31.0) judged the commit against stale documents. That is an emulator fault, not a product or test race. Just before the commit, the SDK resumed the cleanup's row query and resolved a limbo document; that this triggered the fault is not established. A real race ends the same way: when another tab's cleanup deletes the view between this tab's reads and its commit, the emulator evaluates the rules before the read preconditions, so it refuses the stale commit, with this same null, instead of letting the SDK retry it. | Fixed in R24 (`friend-all-store.ts`). A refused final cleanup reads the job and head again, as R23's publications settle a refused step (REL-08). If both are gone, another tab has finished the view, and so has this cleanup. If either changed (by document version), it reports a conflict. If both are unchanged, it tries once more, and a second refusal is reported as it came. Regressions in `tests-cloud/friend-all.test.ts`, "a refused final All cleanup": one tab's final transaction is held between its reads and its commit while another tab finishes the view; the held commit is refused with "permission-denied", and the cleanup now finishes. A refusal of an unchanged view is retried once, and a persistent one is reported. A view published again during the hold is a conflict and stays published. Against the previous cleanup all three regressions fail, and with the repair they pass; `friend-all.spec.ts` ×20 on desktop passed 140/140 with the repair's product code ([verification](#all-cleanup-denial-rel-12); intermediate commits, not the final candidate). |
| `tests-cloud-ui/friend-all.spec.ts:538` (REL-13): "interrupted online-copy cleanup resumes after private deletion without dropping the retained account copy", failing at `:591`, where the alert read "This publication changed. Reload before unpublishing." instead of the injected cleanup interruption (mobile). The historical `:534` row above is the same test with a different failure. | Candidate CI [run 37080786198](https://github.com/LeulTew/play-100/actions/runs/37080786198) on `3bf7b513`, `friend-all.spec.ts` ×10 on mobile with one worker: the fifth repetition, 2026-10-03 (first seen). The full mobile run on the same commit passed it. | The deletion's own public-copy withdrawal was applied once and then refused as a duplicate of itself; the sharing scheduler was not involved. Deleting the online copy turns the All policy off, then withdraws the public profile with `social.unpublish(uid, await social.control(uid), true)`. That transaction read `publicControls/<uid>` and `publicProfiles/<uid>` as missing (00:23:07.362–.366Z) and committed at .369Z: create the control `{epoch: 1, hidden: false, deleted: true}` with precondition `exists: false`, and verify that the profile is still missing. At .384Z the answer was HTTP 409 ALREADY_EXISTS for that control. The SDK retries that code, so after its backoff it ran the transaction again (08.838Z) and read a control holding exactly the commit's fields, created at 07.372554Z, inside the commit's own 15 ms. Nothing else could have written it. Only the publish, unpublish, permission-restore and creator-moderation transactions write that document, and the page sent no other commit touching it. The run had one worker and only the Auth and Firestore emulators, and this is the run's only ALREADY_EXISTS (its 20 other emulator refusals are `:353`'s expected denials). So the one commit was executed twice, either by the emulator (v1.22.0) or by Chrome resending the POST on a reused keep-alive connection. The emulator logged exactly the seven new connections the trace shows in that second, so a resend could only have used an open connection. Which layer repeated it is not established; the SDK removed its listener on the public profile while the commit was in flight. The second run read its own withdrawal, and `unpublish` compared the control's epoch (now 1) with the one Account had read (0) before checking whether the copy was already withdrawn, so it refused. The same second run happens in production whenever a client is told that an applied commit failed with a code the SDK retries, such as `unavailable` after a dropped connection. | Hardened in R24 (`social-publication.ts`). A deleting unpublish first checks whether the public copy is already withdrawn (control deleted, profile missing or unpublished), and if so it finishes, whatever the epoch: the copy was withdrawn by its own applied commit or by another tab's deletion. Every other unpublish still refuses on a changed epoch, and so does a deleting one that finds a live publication at a newer epoch. Regressions in `tests-cloud/social.test.ts`, "a deleting unpublish run again after its commit applied": the transaction commits and then runs again, as the SDK runs it after such an answer, for an account that never published (this failure) and for a live publication. Each is withdrawn once (epoch + 1) and finishes. A third case keeps the refusal of a publication that changed after it was read. Other compare-and-set steps would refuse their own second run the same way; `setPolicy`, which this deletion runs first, is one. Only this step is hardened, because the emulator log shows no other ALREADY_EXISTS, FAILED_PRECONDITION or ABORTED in the run. Against the previous `unpublish` both second-run regressions fail with this refusal; with the repair all three pass, and `friend-all.spec.ts` ×10 passed 70/70 on each project ([verification](#doubled-withdrawal-commit-rel-13); intermediate commits, not the final candidate). |
| `tests/root-navigation-guards.spec.ts:277`: "primary modified and nonprimary clicks retain native defaults and the current draft", desktop, `e2e-offline` | First sighting, 2026-10-02, [full offline run 36981023398](https://github.com/LeulTew/play-100/actions/runs/36981023398), exact commit `260cca2c36ab9be1d1e2e67e36333dc52e0970ec`, the first run with the desktop project headless (`browser_env=xvfb-headed-mobile`); the only failure in that run. | Headless Linux Chromium background-tab popup stall, the same mechanism as the mobile headless failures (3/10 in [36968462436](https://github.com/LeulTew/play-100/actions/runs/36968462436)). The Control-click lands (the page snapshot shows Discover focused and the draft intact), but `context.waitForEvent('page')` at `:286` never resolves within 45 s; in a minority of failures the popup arrives but stays on `about:blank` and its `toHaveURL` times out at 10 s. Environment, not product. | **Measured rate 10/20 headless** (8 page-event timeouts, 2 `about:blank`), desktop, one test, auto: [run 36983920198](https://github.com/LeulTew/play-100/actions/runs/36983920198). **Headed under Xvfb 20/20**, same test and commit: [run 36984473196](https://github.com/LeulTew/play-100/actions/runs/36984473196). Assertions and timeouts unchanged. Gate rule: if it fails in `e2e-offline`, rerun that one test once with `browser_env=xvfb-headed`, `project=desktop`, `specs=tests/root-navigation-guards.spec.ts`; retain both attempts, and stop if the headed rerun also fails. Linux CI only; local gate evidence is unaffected. Follow-up: per-spec headed desktop for the popup specs after Release 8. |

## R24 intermediate Candidate CI loops

All runs in this table identify commit
`a6a57ed8ca8b5e61c2e73238e152c6ab54db1352`, Git tree
`eaa2a3a77bf92f5cc63eba014ccdd8082611550b`:
**intermediate tree a6a57ed8, not the final candidate**.
They do not certify later changes. Final-tip loops must be added at release.
`P / F / S` means passed / failed / skipped test executions; skips are never
counted as passes. Both means desktop and mobile were requested. Repeats are
per selected test and project, not retries; every run used zero test retries.
Names below are `.spec.ts` files under `tests/` or `tests-cloud-ui/` according
to suite, and `.test.ts` files under `tests-cloud/` for rules.

| Register coverage / scope | Suite and specs | Projects | Repeat | P / F / S | Run | Artifact archive SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| Frequent action focus | prod: `frequent-action-focus` | Both | 20 | 2520 / 0 / 0 | [36955118958](https://github.com/LeulTew/play-100/actions/runs/36955118958) | `ddfa5e3d4a72b8d83544b5299b500ea3654bbf8defca33a12e06144b202a292b` |
| Catalog retry focus | prod: `catalog-retry-focus` | Both | 20 | 560 / 0 / 0 | [36955140212](https://github.com/LeulTew/play-100/actions/runs/36955140212) | `b5e7c4793c069e18736d07177151ccf3301907ae50784c8c0eea12fbe441aa4a` |
| Release 4 and R19 compare-tray geometry | prod: `compare-tray-context` | Both | 20 | 1920 / 0 / 40 | [36955147545](https://github.com/LeulTew/play-100/actions/runs/36955147545) | `b51fa21f020d0667f5d983c6f3313c7459b08459c24b3af5034d61a46394b9dc` |
| Queue touch drag | prod: `queue-pagination` | Both | 20 | 360 / 0 / 0 | [36955152920](https://github.com/LeulTew/play-100/actions/runs/36955152920) | `6dbc43e56aacf9352d9d24e3f8474b9828c2f8fb9e64f1a130015bdaa1ed9f84` |
| Cross-tab autosave | prod: `release-review`, grep `another tab` | Both | 20 | 120 / 0 / 0 | [36955158398](https://github.com/LeulTew/play-100/actions/runs/36955158398) | `01fddab498314963081f7171473616d191c235af3e8cd6ac21eb9ce36b35f2ef` |
| Browser restart / persistent-profile close | prod: `unified-search`, restart case | Both | 10 | 20 / 0 / 0 | [36955164032](https://github.com/LeulTew/play-100/actions/runs/36955164032) | `415548477acf6c916de7fe42175eb050ff32ec60ac407a7833285752d5c302af` |
| Native-zoom navigation / secondary context close | prod: `native-zoom`, navigation case | Both; mobile skips | 10 | 10 / 0 / 10 | [36957671562](https://github.com/LeulTew/play-100/actions/runs/36957671562) | `7e07c917a3525e41ddce6a91edc6baf4a48912bcbaad394b69382af47b2c1a3d` |
| First-paint shell; failed, not a green receipt | prod: `first-paint-shell` | Both | 10 | 160 / 130 / 10 | [36955174758](https://github.com/LeulTew/play-100/actions/runs/36955174758) | `320c481a1883d95828ffdd8187411fd988853d34ccf3e7f8983cc4e1de02923f` |
| Dialog and detail lifecycle | prod: `dialog-screen-reader`, `dialog-close`, `dialog-lifecycle`, `restored-dialog-stack`, `secondary-dialog-loading`, `detail-navigation` | Both | 5 | 670 / 0 / 70 | [36955179898](https://github.com/LeulTew/play-100/actions/runs/36955179898) | `d15dbade219c94657380730464b8bded44bdca38bb509b65b4c325413bb8314e` |
| FLAKE-01 native playback/download, one worker | prod: `films`, native playback/download case | Both | 40 | 80 / 0 / 0 | [36955185166](https://github.com/LeulTew/play-100/actions/runs/36955185166) | `82a397168d746bfc9ec46b682c36647e4a8bc1db04b36884837464db797cac52` |
| Menu, including modified-link failures | dev: `menu` | Both | 10 | 329 / 11 / 0 | [36955190309](https://github.com/LeulTew/play-100/actions/runs/36955190309) | `198194d0f60cebad163526d9307fd9ddb7450ae47a3f708329310d6329333872` |
| Menu modified-link discriminator, one worker | dev: `menu`, grep `modified` | Both | 10 | 34 / 6 / 0 | [36958514072](https://github.com/LeulTew/play-100/actions/runs/36958514072) | `3c3b71807c2b059d27360c3b14268ca763ec0f4fa04f683296c0c6f5490d3fb5` |
| Offline-build full-suite attempt 1 | offline: all specs | Both | 1 | 1371 / 14 / 99 | [36955195560](https://github.com/LeulTew/play-100/actions/runs/36955195560) | `edecf72a72b1478c3945b5a08ed4f73a5d41fb89936e345617dc592a1406443e` |
| Offline-build full-suite attempt 2 | offline: all specs | Both | 1 | 1370 / 15 / 99 | [36955201044](https://github.com/LeulTew/play-100/actions/runs/36955201044) | `77aa0a05f601dd16c46a4208bd8f1d70f83819ffef9d4c7b636616e9866ceb67` |
| Offline-build full-suite attempt 3 | offline: all specs | Both | 1 | 1369 / 16 / 99 | [36955206101](https://github.com/LeulTew/play-100/actions/runs/36955206101) | `cf06fd3804560942eb26e14a1d8d5c5a2c1e759a46272352f8b522805f807270` |
| First friend action / default-policy convergence | rules: `friend-all`, grep `converges a first friend action` | N/A | 20 fresh-emulator iterations | 20 / 0 / 820 filtered-out cases | [36955211192](https://github.com/LeulTew/play-100/actions/runs/36955211192) | `89fab8bfbc5e1256d5a82b8a1f85a8c312882eebd7efa59cb4ab4080eaa03859` |
| REL-08 ranking and shelf publication | rules: `friendships`, `friend-shelf` | N/A | 10 fresh-emulator iterations | 770 / 0 / 0 | [36955216282](https://github.com/LeulTew/play-100/actions/runs/36955216282) | `a8af9409c24772bbcd9dc99334051eb0517b82e4648f9faa254e2b33c0e185bd` |
| Full rules regression, including convergence and publication | rules: all `tests-cloud` | N/A | 3 fresh-emulator iterations | 849 / 0 / 0 | [36955222066](https://github.com/LeulTew/play-100/actions/runs/36955222066) | `a7e0b8ae73710380bd000ac9d86200b590fa782454d4f0de287f5eba1561829b` |
| Release 3 / R19 reauthentication, REL-09 and REL-10 | cloud UI: `review-repairs` | Desktop | 20 | 140 / 0 / 0 | [36955227877](https://github.com/LeulTew/play-100/actions/runs/36955227877) | `a132cee16307f8d9d2890f0dd65710adb3ab892495da01ec6be3ba8dc080df28` |
| Release 3 / R19 reauthentication, REL-09 and REL-10 | cloud UI: `review-repairs` | Mobile | 20 | 140 / 0 / 0 | [36955234168](https://github.com/LeulTew/play-100/actions/runs/36955234168) | `040dec8852f335d0f2921d8cb87b2d14612d34272240478057d127f4cc8e6263` |
| Identity, Google fixture, pending upload and REL-11 | cloud UI: `identity`, all cases | Both | 20 | 160 / 0 / 0 | [36955239299](https://github.com/LeulTew/play-100/actions/runs/36955239299) | `ebb8736c52e970eaf2103f1ae1f933ef2f6764a4560e53fd2f0b0477583058c3` |
| Compare chooser toggle/revocation race | cloud UI: `compare-orientation`, grep `one-person chooser` | Both | 20 | 40 / 0 / 0 | [36955244679](https://github.com/LeulTew/play-100/actions/runs/36955244679) | `564c3df279d67a84006873a03858f27158b76beef65960894da69a6d7bb0b128` |
| REL-08 receiver sharing | cloud UI: `friendships` | Both | 20 | 80 / 0 / 0 | [36955249719](https://github.com/LeulTew/play-100/actions/runs/36955249719) | `174ad3275020ee85aa3d4b56fb25aafeb29903f1154b70e676d5d6099ad46e58` |
| Release 4 All sharing / REL-07 cleanup; REL-12 denial below | cloud UI: `friend-all` | Desktop | 10 | 69 / 1 / 0 | [36955254560](https://github.com/LeulTew/play-100/actions/runs/36955254560) | `351a15d799ed05f27c00da670cfb1e68ed47887af18358ead584bbd32689d13f` |
| Release 4 All sharing / REL-07 cleanup | cloud UI: `friend-all` | Mobile | 10 | 70 / 0 / 0 | [36955259647](https://github.com/LeulTew/play-100/actions/runs/36955259647) | `cd3f9cc75d93fa7a373a13ec91febc9774eb56decdd32d59246b794a2926ee51` |
| REL-10 isolation and REL-11 server lifetime, one server | cloud UI: full suite | Both | 1 | 271 / 0 / 1 | [36955265267](https://github.com/LeulTew/play-100/actions/runs/36955265267) | `313f0a540338ae39d966f365be593a7ee6633db887189870e05752ba48c2fa3c` |

The compare-chooser and full cloud-UI runs each also report one successful
preparation-fixture test, excluded from their main-suite counts above. The
native-zoom replacement run is the evidence: run `36955169576` stopped on a CI
environment error before tests ran and is not a failed test repetition.
First-paint and Menu failures remain failed attempts, not accepted retries.
The three offline-build runs are also failed full gates, even where a particular
registered test passed. None of these loops repeats the budget unit tests.

### All cleanup denial (REL-12)

`tests-cloud-ui/friend-all.spec.ts:430` declares the export/reversible/full
deletion journey. Run `36955254560`, desktop repetition 9, failed its success
status assertion at `:513`; the whole file was **69 passed / 1 failed**, not
70 executions of that one case. The trace and `firestore-debug.log` establish
an actual server refusal, not a transient message or a slow close:

- At `02:42:00.093Z`, the transaction read an existing games job with `count: 0`
  and an existing games head. Its preceding row cleanup had succeeded.
- At `02:42:00.098Z`, the commit deleting that job and head with their recorded
  update-time preconditions returned HTTP **403 PERMISSION_DENIED**.
  The emulator reports a **"Null value error"** at `firestore.rules:1482:54`
  (`resource.data` in the job-delete condition), also rejecting the head delete
  at `:1428`.
- Account displayed **"Deletion isn't finished"**, **"Some online data is still
  stored."**, and **"The server did not authorize this action. Check email
  verification and refresh Account. Your local copy remains safe."**

**Diagnosis (R24).** The rule at `:1482` reads `resource`, the job itself; the
head's rule at `:1428` is `aCleanup(uid)`, which reads `friendAllPolicies/{uid}`
(and `friendSettings/{uid}` while the policy is on). The emulator evaluated the
job's `resource` as null and the head's `aCleanup` as an error and then `false`.
No state of this account after `02:41:59.767Z`, when Account turned the policy
off, gives those results: the job had existed since `02:41:59.061Z`, and an off
policy passes `aCleanup`. Nothing else changed those documents:

- the page was the run's only client (one worker), and its trace shows no other
  write to the job, head, policy or settings between the reads and the commit;
- every request carried the same verified token;
- unlike REL-08, the emulator log has no lock timeout, abort or service-call
  error anywhere in the run.

The emulator judged the commit against stale documents: an emulator fault, not
a product race or a test race. Its trigger is not established. Just before the
commit the SDK resumed the cleanup's row query and resolved a limbo document.

The same refusal is also what a real race produces. When another tab's cleanup
deletes the view between this tab's reads and its commit, the emulator evaluates
the rules before the read preconditions and refuses the stale commit, with the
same null at `:1482:54`, instead of letting the SDK retry it.

**Repair (R24).** The cleanup's final step now settles a refusal as R23's
publications do (REL-08), without widening any rule:

- it reads the job and head again;
- if both are gone, the view is finished;
- if either changed (by document version), it reports a conflict;
- if neither changed, it tries once more, and reports a second refusal as it
  came.

It never accepts a refusal of a view that still exists as success. The
`tests-cloud` regressions are described in the REL-12 row above.

**Verification (R24 Candidate CI).** These runs identify intermediate commits,
not the final candidate, and used zero retries. `eddf0d15` (the repair) and
`eee4c13b` differ only in `tests-cloud/friend-all.test.ts`, so the cloud-UI
loop ran the repair's product code. The probe `58ddf4ee` runs the final
regressions against the previous `cleanupPage`; it was never merged. A
recurrence of the `:513` failure stops the gate.

| Check | Commit | P / F / S | Run | Artifact archive SHA-256 |
| --- | --- | --- | --- | --- |
| rules: `friend-all`, grep `a refused final All cleanup`, against the previous cleanup (fails by design) | `58ddf4ee` | 0 / 3 / 42 filtered-out cases | [36967071247](https://github.com/LeulTew/play-100/actions/runs/36967071247) | `151d9b8552c9639375310ccb0f440d2c2011238ef8891583d3e14cce1f9e14b5` |
| rules: the same grep with the repair, 5 fresh-emulator iterations | `eee4c13b` | 15 / 0 / 210 filtered-out cases | [36967058267](https://github.com/LeulTew/play-100/actions/runs/36967058267) | `8e2a7bb635edabad891ab59d57d70581c556a7f4fc0ab440631f6851c28e29f2` |
| rules: `friend-all`, whole file | `eee4c13b` | 45 / 0 / 0 | [36967064514](https://github.com/LeulTew/play-100/actions/runs/36967064514) | `3b0b3bb004c95b61ad7f52a3700f46825620aa720d0e0cacfc72808e3d520c10` |
| cloud UI: `friend-all` ×20, desktop, one worker | `eddf0d15` | 140 / 0 / 0 | [36965245885](https://github.com/LeulTew/play-100/actions/runs/36965245885) | `05bd87ae71e58ccf3725bee161dd2e8b0458b7f78b07259ff15fcd8790f570a1` |
| checks: tsc, functions tsc, ESLint, Prettier, unit, browser | `eee4c13b` | unit 3601 / 0 / 1; browser 296 / 0 / 1 | [36967077706](https://github.com/LeulTew/play-100/actions/runs/36967077706) | `651aaad46842d4e5e710c5ec7025a7e72b581039e45619a38194c445e64526dd` |

### Doubled withdrawal commit (REL-13)

The cause and the repair are in the REL-13 row above. These Candidate CI runs
identify intermediate commits on the sim at `0ba32551`, not the final candidate,
and used zero retries. `fb4ea64f` is the repair; `5b9fc25b` only moves the copy
inventory's references to the lines the repair shifted, so the cloud-UI loops
ran the repair's product code. `checks` on `fb4ea64f`
([37085260567](https://github.com/LeulTew/play-100/actions/runs/37085260567))
failed only that stale inventory. The probe `1a4d4eae` runs the regressions
against the previous `unpublish`; it was never merged. A recurrence of the
`:591` refusal stops the gate.

| Check | Commit | P / F / S | Run | Artifact archive SHA-256 |
| --- | --- | --- | --- | --- |
| rules: `social`, grep `a deleting unpublish run again`, against the previous unpublish (both second-run cases fail by design) | `1a4d4eae` | 1 / 2 / 22 filtered-out cases | [37085284440](https://github.com/LeulTew/play-100/actions/runs/37085284440) | `bb84f4f85f2133993c13ac4656689c1b9d1fafbdd072e418df55e1c078c90009` |
| rules: `social`, whole file with the repair, 3 fresh-emulator iterations | `fb4ea64f` | 75 / 0 / 0 | [37085265954](https://github.com/LeulTew/play-100/actions/runs/37085265954) | `7107044b9e3594103ca68d793dc50072d047da76039e2856ecd6e04867cda5aa` |
| rules: all `tests-cloud` | `fb4ea64f` | 289 / 0 / 0 | [37085291649](https://github.com/LeulTew/play-100/actions/runs/37085291649) | `fd31dcd60d4eff91f264392082f1deb2898cf625b2cf56f296f3a96f3af3aea8` |
| cloud UI: `friend-all` ×10, desktop, one worker | `fb4ea64f` | 70 / 0 / 0 | [37085250110](https://github.com/LeulTew/play-100/actions/runs/37085250110) | `261222b198ced7fc906ebdcda19d797444890a59093eed3af83ed9636b6a3ffc` |
| cloud UI: `friend-all` ×10, mobile, one worker | `fb4ea64f` | 70 / 0 / 0 | [37085255198](https://github.com/LeulTew/play-100/actions/runs/37085255198) | `e7131dd2b95a5b52cde99bd675c5675860912cb1cff987e3847feacd24b6bde0` |
| checks: tsc, functions tsc, ESLint, Prettier, unit, browser | `5b9fc25b` | unit 3769 / 0 / 1; browser 296 / 0 / 1 | [37085423261](https://github.com/LeulTew/play-100/actions/runs/37085423261) | `781f6327da7b09332b1a1b2c7df8fa8ab4b0e3a44cbacf454b50f5f0aabbdb13` |

### Collection bulk selection: test-scope race

Native reports correct the initial "one desktop failure" summary:

| Offline-build run | Desktop bulk case | Mobile bulk case |
| --- | --- | --- |
| `36955195560` | Passed | Passed |
| `36955201044` | Timed out at `personal.spec.ts:98` | Ranking length **5**, expected **3**, at `:100` |
| `36955206101` | Timed out at `:98` | Timed out at `:98` |

That is **four failures in six executions** of this case. The test waited for
three `.game-card` elements but left **Search public catalogs** checked.
Late successful Wikidata responses added **Mass Effect Legendary Edition** and
**Mass Effect: Andromeda** beside the three collection games. Each timeout
snapshot shows **"0 selected"** and **"Select all 5 in this view"** while the
test waits for **"Select all 3 in this view"**. The mobile ranking failure shows
those same extra games saved to My games. The collection count never bounded
the entire selectable result set.

This is a test-scope race, not evidence of a broken selection reducer or
IndexedDB corruption. The repair starts this collection-only journey at
`/?catalogs=off`, verifies that public-catalog search is unchecked, and checks
all three selected collection checkboxes before each bulk action. Queue,
completion, ranking, retained completion and original author-rank assertions
remain unchanged. No product code, timing allowance or retry changed.
The repair's repeated execution evidence must be retained separately from
these failed intermediate-tree attempts.

## FLAKE-01 phase-2 conclusion

On 2026-09-30, the release operator reconstructed the phase-2 result from 41 batches
after the investigator stopped before writing its report. The evidence is archived outside the repository under
`flake01`, with the source summaries identified by SHA-256 in
[archived evidence](#archived-evidence). The archive contains `phase2-summary.md`, phase-1 `analysis.md`, `batch-summary.json`,
`matrix-flushclean.jsonl` and the per-batch `receipt.json` files.

The matrix covers `tests/films.spec.ts:73` on the R23 candidate after its first-paint style hashes were allowed, Node 24.21.0,
Chrome 154, desktop and mobile projects, with two workers:

| Variant | Change from control | Executions | Failures | Failure rate |
| --- | --- | --- | --- | --- |
| Preview | Vite preview / sirv control | 270 | 13 | 4.8% |
| Different static server | Node HTTP server with its own Range handling | 40 | 1 | 2.5% |
| No-store | MP4/VTT no-store; no validators or conditionals reach the server | 40 | 1 | 2.5% |
| Cleanup | Destroy the MP4 source stream when the response closes | 40 | 2 | 5.0% |
| Flush | Investigator's flush variant | 40 | 1 | 2.5% |
| IOCP | Chrome `TcpSocketIoCompletionPortWin` receive path | 80 | 1 | 1.25% |

No Windows variant eliminates the failure. The lower observed rates are not evidence of
a fix or a statistically established improvement over control. Failures retained
the known native `download.path: canceled` or transient media-stall signatures.
Phase 1 established a receive-side HTTP framing failure: a fresh cache-disabled
download GET, without Range or conditional headers, received interior MP4 bytes
instead of HTTP headers, including on sockets whose only prior traffic was a
clean caption 304. Together with the different-server and socket-path results,
the conclusion is **environment-level (Chrome network service or Windows
loopback under automation), not the product or test servers**. Which environment
layer is responsible, and a reliable fix, remain unproved; the netlog is not an
independent packet capture.

On 2026-10-02, Linux Candidate CI ran the exact native playback/download case
with `--repeat-each=40` on both desktop and mobile:
[run 36955185166](https://github.com/LeulTew/play-100/actions/runs/36955185166)
passed **80/80**, with zero unexpected failures, skips or flaky retries.
Its identity records Chromium `153.0.8010.12` on the hosted Linux runner and
commit `a6a57ed8ca8b5e61c2e73238e152c6ab54db1352`
(Git tree `eaa2a3a77bf92f5cc63eba014ccdd8082611550b`):
**intermediate tree a6a57ed8, not the final candidate**.
This is discriminating evidence in favor of the Windows loopback/network-service
hypothesis. It is not proof of the precise layer or elimination of the Windows
failure: the OS, Chromium version and candidate differ from the Windows matrix.
The original artifact is
`candidate-ci-e2e-prod-a6a57ed8ca8b5e61c2e73238e152c6ab54db1352-36955185166-1`
(artifact ID `11205358974`), archive SHA-256
`82a397168d746bfc9ec46b682c36647e4a8bc1db04b36884837464db797cac52`.
The archived `flake01-manifest.json` binds **2,049 phase-2 evidence files**;
its own SHA-256 is
`f53d3de69cd8de2394adff15be11ee7491e356150d9d72702e50fc7eba927b72`.

No product or test-server workaround is retained. Playback, switching, focus,
native download and SHA-256 assertions stay unchanged. The release runner now
isolates that named native-download case from the rest of production e2e as
`films-download`, with both browser projects. Re-run that partition once,
retain both attempts, and stop if it fails twice; do not retry until green.
Every other partition remains zero-retry. See the
[partition and receipt contract](release-operations.md#isolated-flake-01-partition).
Two narrower discriminators remain **untried**: a matched Google Chrome run
under WSL on the affected Windows host, and elevated WFP filter enumeration
(`netsh wfp show filters`). The hosted Linux Chromium result above is not that
same-host, same-browser comparison.
`winsock-catalog.txt` lists only Microsoft base providers; that does not
substitute for inspecting WFP filters.

## Archived evidence

The release operator retains these artifacts outside the repository. Names and
SHA-256 digests identify the exact evidence without publishing workstation paths.
The R19 `error-context.md` and `trace.zip` are the retained desktop reauthentication
failure from 2026-09-29, not the overwritten R23 pre-flight trace.

The `header-navigation-1f4e444e/` entries are the native files from
[Candidate CI run 36972970524](https://github.com/LeulTew/play-100/actions/runs/36972970524),
artifact `candidate-ci-e2e-prod-1f4e444e2dc4b599af96106b2e67456ca3af5697-36972970524-1`.
Its identity records the configured build, Node 24.21.0, Playwright 1.63.0 and
Chromium 153.0.8010.12 on Ubuntu 24.04.5 LTS. The loop ran from
2026-10-02 06:20:25Z to 07:11:48Z; no local browser run or changed assertion is
substituted for those results.

The `pin-original-trace/` entries are the native files from the first sighting,
[Candidate CI run 36972598816](https://github.com/LeulTew/play-100/actions/runs/36972598816),
artifact `candidate-ci-e2e-prod-1f4e444e2dc4b599af96106b2e67456ca3af5697-36972598816-1`.
The trace entry retains its artifact-relative path.
`pin-original-geometry-evidence.json` is a derived extraction of the two complete
document-geometry readings and the root scroll attributes at the call IDs above;
it supplements, rather than replaces, the native trace.

| Artifact | SHA-256 |
| --- | --- |
| `pin-original-trace/identity.json` | `c20111406e4df3336bcf83e9b38739f2dd588f66356a7b2c5065e8c0d87462db` |
| `pin-original-trace/playwright.json` | `15f12e3354d0fa4f5bb77debd1929533c4c80b60e011fb69dcb88f95ad451d2e` |
| `pin-original-trace/playwright.junit.xml` | `b5beeceedc254b36ea99815fd87d2d14502aa0f32e116fb541474789a292d9f3` |
| `pin-original-trace/playwright.log` | `85991d546741dd4a4690bdcc3471cdc05838d69c1333101e02faaa3776497162` |
| `pin-original-trace/test-results/discover-card-layout-Disco-5934a--same-action-rows-at-1920px-desktop/trace.zip` | `b3779c8aa7d127c671b94eaffda71b7e218014b7653608ab813dc1b894fd84ea` |
| `pin-original-geometry-evidence.json` | `b2b03bd42faf19e0e951c5354fd3843ad69d3a32418a02fa74b66ef6ac292ab2` |
| `header-navigation-1f4e444e/identity.json` | `36e4cc2eae341f0212bbfc63101e4b545f4f13cdcf408827d6223d1bbc6b859d` |
| `header-navigation-1f4e444e/playwright.json` | `10284fba3889be1c0a54b59676e2f68bbc7518977af60439ae9d9ee61b71dc11` |
| `header-navigation-1f4e444e/playwright.junit.xml` | `a34cc534eca2edcdf2ce149c86303d7882c23ef537d4cfcb904fa2f07b961de9` |
| `header-navigation-1f4e444e/playwright.log` | `569efebcffa2cbb1d59679a0f4e3ee9de15591742340aa93bbcec37badffb6d5` |
| `r24-budgets-before.json` | `a4e5ed20ef92b9305fe130ff2be12dd72b00d8e760b266d0862a9ad48eb77f21` |
| `r24-budget-loop-1.json` | `f81f6fc843f790bda2d3b0392a5d67745b92e107fa7d204141301b8fdbc851ab` |
| `r24-budget-loop-2.json` | `6314f04b3688253876680b64adf57c8293ea3e1ce7e85c55f625830513857230` |
| `r24-budget-loop-3.json` | `09f799e819a759846b26c210a75f800bb374a66dbbe7956f8be6b343a44f47c6` |
| `r24-budget-loop-4.json` | `d837ec05fd3278cd6d3a0a630d7acc4c83e2b105f36a98363e3a952761524c37` |
| `r24-budget-loop-5.json` | `299d736207844a08fde8dbab05bde0da1f54bb3b7bf3c60dd6cb7a0e6d230564` |
| `error-context.md` (R19) | `3617bf505f2db96d4227b8b36cf075abee3dc8bc07ac888e0dc88d1184cf64c6` |
| `trace.zip` (R19) | `deaac4ac38b77d88e12a63181f9dec9914968c757affa2624d89810d10ebf20a` |
| `flake01/phase2-summary.md` | `7f1810acfe4b68bab2df0b4a7a8ba013444b84ef32f145c63becca004ad5d1088` |
| `flake01/analysis.md` | `0145d9e62e7810fd8bfd83409b254cdfbba86477215604b019f377ea42faf785` |
| `flake01/batch-summary.json` | `4f6a1fb1f1aa7509d1fdfb3a2582af9a9ff7265e941ce256245d081b77ed813c` |
| `flake01/matrix-flushclean.jsonl` | `cc780158d9369b94b21b26d611396ebd774f8439f83ef85f044db83421fcd787` |
| `flake01/winsock-catalog.txt` | `91be12c91e9e88c79ff87be2f1baaa4a2ab7e8c6c0251cbb288821be15505ad4` |
| `flake01-manifest.json` (2,049 phase-2 files) | `f53d3de69cd8de2394adff15be11ee7491e356150d9d72702e50fc7eba927b72` |
| Candidate CI film-loop artifact `11205358974` (run `36955185166`, archive digest) | `82a397168d746bfc9ec46b682c36647e4a8bc1db04b36884837464db797cac52` |
| `films-r20-node24-x20.txt` | `713f15b92451002b2dff5a0bde42822e258d23b2faf2a71be9b417014c1ab77d` |
| `films-node24-baseline-x20.txt` | `10d16af555176afb39d9be5e33636de631aaa37cef626851a9245ce5a11b31a6` |
| `films-node24-closeall-x20.txt` | `5c9d618d2afea31a89c200b04fcd381651df2fae9b036f31c0dc5e78a0c4afd8` |
| `films-70ce-x20-receipt.txt` | `0e0fb6032c4be9b2337f4ded518a65588c829e91058f00693d0789245eda92a1` |
| `films-distinct-url-x20-receipt.txt` | `49ac516fb8161b101240282df0a32004b76dd82883faa5028b97e08036b38c46` |
| `films-r20-unload-x20.txt` | `6ae97967daa5ca2f2b91d345124a4cb3244eed3ed157d2f37de3f96bf2f09326` |
| `r22-attempt2-stop.json` | `0e275ba1d5809c08bb4e735cce71d4af3ad12e9a28bddb1347241c75e1d57dcf` |
| `rel07-friend-all-534.txt` (R23, tree `31a80f38`, 2026-09-30) | `9bff06daef90e03e7289ad7bcb04b4e0215eed2bdeea4a597ee78eac27dd0b34` |
| `rel08-friendships.txt` (same R23 run) | `998e0f5cb30b93c8d4f04b00656b4e2b633f248e139d7a7d3638504251aeb1ae` |
| `rel09-review-repairs-312.txt` (same R23 run) | `96739052626677b92b9b6aed87cf796574a570061957e68244e88518ec913f2f` |
| `tests-cloud.txt` (same R23 run) | `24c7ab514421abb89eadd66fa52906bf696c2c37f74de3d3da3a3e0227779c40` |
| `cloud-ui-44c228ab.txt.live.txt` (R24 pre-flight, 2026-10-02) | `cb37e473de825838e4c0bec45cbe19a58858a404c9e5b9c8b2a57b002faef87e` |
| `error-context.md` (REL-11, `44c228ab` mobile) | `9cfc2b3ab57e5af938002e9ffbe3661dcf731ad39d28bfbe9d2dd093111997d9` |
| `trace.zip` (REL-11, `44c228ab` mobile) | `e591c2a20d7f278c996ed1411e7666c7d055082df316a8c451c30103be9773ae` |
| `cloud-ui-mobile-abb9736c.txt` (first mobile attempt) | `ed2ca525f0f6887c530a0d554b001000cf81a97678e9b7cee69de57897c1e2a2` |
| `cloud-ui-mobile2-abb9736c.txt` (passing mobile run) | `50fb55a8fb60fb1fa52231e7af0db489bb31fa76069973c67c3d18c1d6914082` |
| `rel11-pipe/parent.mjs` (`spawnSync` reproduction) | `e4db336bbbbc4c57fed12f860105fe87330a714468ded96195891048d5fea844` |
| `rel11-pipe/parent-fixed.mjs` (asynchronous `spawn` control) | `2d62e522265790c4007bcd276d704faeac4be707f81c17c474a7fb9164e687a8` |
| `rel11-pipe/child.mjs` | `530b4bb0614bd93c9c9a4966437e70c36e74f162e865ee135119a8380dabb197` |
| `rel11-pipe/probe.mjs` | `21ac4f55e41f4d16fd637de3825b606e27267e4a3fbafe3f70357dfe02b6b326` |
| `error-context.md` (REL-12, run `36955254560` desktop repetition 9) | `466a970605f0ffe29572fd434969dab0cf24199610edb9542ababba6051138d0` |
| `trace.zip` (REL-12, same failure) | `ddf5e1aeedc7a8e41fc747f1a8bf6e24e5c7936a829e1cd93b8d8b7e24d1f10b` |
| `firestore-debug.log` (REL-12, run `36955254560`) | `8852e032aacbbe1528937ca871c6a93b0fae67b48bfb4a213eb633e947b32ff4` |
| `error-context.md` (REL-13, run `37080786198` mobile, fifth repetition) | `8bc3e3f92635a7e6b0fd37afc2982b497d19f78d84a70141510ee98492c1508f` |
| `trace.zip` (REL-13, same failure) | `abe773be2efc41cfe787d9f13ee27dbce4419cd669656cdc5e51d82d971ae826` |
| `firestore-debug.log` (REL-13, run `37080786198`) | `c04bf53a8f37b4f190e11bad8f050993a85e342dede9098b881fb8cdd49a3009` |

## Candidate gate

FLAKE-01's earlier R22 discriminating diagnostic on the R22 corrupt-copy sign-out recovery build explicitly paused the
video, removed its `src` and called `load()` before the native download click.
It still failed 2/40 (`films-r20-unload-x20.txt`, Node 24.21.0, 20 repeats on
each project, two workers), compared with the unchanged baseline's 3/40.
That attempt did not resolve the cause. Active media loading is not an established cause or a verified fix.
The diagnostic was removed; playback, switching, focus, native download and
SHA-256 checks are unchanged. No 40/40 repair receipt exists. The release operator
permits one separately retained spec rerun for this known pre-existing
test, then stops if it fails twice; it does not erase the failed attempt or make a stopped committed gate a
clean pass. All other failures still require investigation, not automatic retries.

Further retained diagnostics on the R20 app:

- `films-closeall-netlog/run2.txt` stopped after two captured failures.
  Both downloads had one ordinary GET, no `Range`/`If-Range` retry, and
  `ERR_INVALID_HTTP_RESPONSE` (-370). In `net-12.json` and `net-16.json`,
  the socket previously served a VTT 304 with `Connection: keep-alive`;
  the next MP4 request received body bytes from offsets 177792 and 195312
  instead of headers. Vite's `preview.headers` callback is bypassed by
  sirv's early 304 response, so that "close-all" experiment did not isolate
  every connection. `two-failure-transactions.json` retains the extracted
  request/response sequence. No download-progress events were emitted to
  the passive CDP listener, and those netlogs contain no `DOWNLOAD_*` events.
- A separate `maxRequestsPerSocket = 1` preview-hook experiment passed its
  wire check: 200, conditional 304 and 206 all carried `Connection: close`,
  with three requests on three distinct sockets (`films-socketguard-wire.json`).
  Nevertheless the unchanged film test failed 5/40
  (`films-r20-socketguard-x20-a.txt`, Node 24.21.0, two workers).
  The conditional second 40-case run was not started. The guard and its
  throwaway wire regression were removed; this is not a verified fix.
  That attempt did not resolve the cause; the later environment-level conclusion
  and its remaining uncertainty are recorded above.

Run the exact convergence test 20 times against the candidate rules using
[Release operations: convergence loop](release-operations.md#friend-default-convergence-loop).
This register adds no executed result. A failure must retain the emulator
debug log for the transaction interleaving; a later pass does not close it.
