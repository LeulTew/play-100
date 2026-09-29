# Intermittent test register

Track a failed attempt even when its retry passes. "Host load" is a hypothesis
unless the receipt establishes the cause; a one-off pass is not loop evidence.
The release coordinator retains native reports, command exits and debug logs
outside the repository. Review open rows at every candidate gate, update them
on recurrence, and investigate rather than retrying until green.

| Test | First seen | Root cause or hypothesis | Status | Loop evidence |
| --- | --- | --- | --- | --- |
| `tests-cloud/friend-all.test.ts`: "converges a first friend action and the automatic default on one default policy in either order" | [Release 1, 2026-09-25](releases.md#release-1-2026-09-25), rules run at `2f727389` | Unresolved denial; the test races `startDefault` and `setPolicy` transactions with `Promise.all`. An interleaving defect is a hypothesis, not an established harness fault. | Open; candidate-rules loop required. G8 calls this Release 6 evidence, but the cited receipt is in the Release 1 ledger entry. | Original 248 passed / 1 failed; single-file rerun 38/38. No convergence loop receipt recorded here; run the 20-iteration gate below. |
| `tests-cloud-ui/review-repairs.spec.ts`: "verified unused Google registration returns from reauthentication without deleting until explicitly confirmed" (historical `:36`, desktop) | [Release 3, 2026-09-26](releases.md#release-3-2026-09-26) | Unreproduced; no root cause established in the ledger. | Open; do not classify as an external Google failure without evidence. | One rerun passed; no loop recorded. The adjacent `friend-all-review` 54/54 receipt covers a different spec. |
| `tests/compare-tray-context.spec.ts` | [Release 4, 2026-09-26](releases.md#release-4-2026-09-26) | Ledger identifies a test race; exact interleaving is not specified there. | Test-only repair recorded; monitor recurrence. | Whole repaired spec 12/12; no repeated loop recorded. |
| `tests-cloud-ui/friend-all.spec.ts` | Release 4, 2026-09-26 | Ledger identifies a test race; exact interleaving is not specified there. | Test-only repair recorded; monitor recurrence. | Whole repaired spec 14/14; no repeated loop recorded. |
| Queue touch-drag (`tests/queue-pagination.spec.ts`) | [Release 5, 2026-09-26](releases.md#release-5-2026-09-26) | Handle aimed at next row's centre; tall mobile rows could drop one row late under load. | Test targets changed to row centres. | No repeated loop recorded. |
| Native-zoom navigation / secondary Chrome context close | Release 5, 2026-09-26; recurred in Release 6 | Context close exceeded timeout on a busy host after assertions passed. | Timeout raised to 90 s; retain recurrence evidence. | Targeted one-worker rerun passed; no repeated loop recorded. |
| Browser-restart persistent-profile close | Release 5, 2026-09-26 | Close stalled at recorded 100% host CPU. | Unchanged test; monitor host-related recurrence. | One-worker rerun passed; no repeated loop recorded. |
| `scripts/check-budgets.test.ts` | [Release 6, 2026-09-27](releases.md#release-6-2026-09-27) | Timeout at recorded 100% host CPU; exact test not identified in ledger. | Open monitoring; retain both attempts. | Pre-authorized single rerun passed; no repeated loop recorded. |
| `tests/release-review.spec.ts`: cross-tab autosave | Release 6, 2026-09-27 | Ledger attributes a stall to host load; current dirty-draft test pauses autosave while observing remote updates. | Monitor recurrence; do not confuse with the online upload race below. | Targeted one-worker rerun passed; no repeated loop recorded in ledger. |
| `tests-cloud-ui/identity.spec.ts`: Google script loading | Release 6, 2026-09-27 | Host/load stall recorded; current gate uses a controlled provider fixture. | Monitor recurrence; real Google is a separate check. | Targeted one-worker rerun passed; no repeated loop recorded in ledger. |
| `tests-cloud-ui/identity.spec.ts`: two-window pending upload | Release 5 reproduced during Release 6 investigation | Both tabs uploaded identical pending content; loser displayed a recoverable conflict. This was a product race, not mere test noise. | Historical waiver; identical-payload convergence is now documented in [online saving](online-saving.md). Retain candidate loop evidence before closing. | Historical failures 2/10 on Release 5, 3/10 on Release 6. G8 reports a later identity 20-iteration run; consult its operator-held receipt rather than inferring the convergence-test outcome. |
| `tests-cloud-ui/compare-orientation.spec.ts`: "one-person chooser stays open through second-to-sixth checks and below-two revocation reopens it" (historical `:421`, failing at `:445`, desktop) | R18b cloud-UI gate, 2026-09-28 | Product race, found in the code. Compare reopened its "Change people" `<details>` for fewer than two people only when its React state said closed, but a user's close reaches that state only through the element's `toggle` event, which the browser delivers in a later task. A revocation that committed before a pending close's event found the state still open and did nothing; the late event then recorded the close, and nothing ran again, so the chooser stayed closed beside "Choose at least two people." Which came first depended on load. | Fixed in R19: when fewer than two people are chosen, the chooser also opens the element itself, in a layout effect, so the late event reports it open; a close made after that still sticks ([compare-disclosures](../src/cloud/compare-disclosures.ts)). The coverage details, which open themselves for a failed read or a review, had the same race and are fixed the same way. | Deterministic regression test instead of a loop: [compare-disclosures.browser.test.ts](../src/cloud/compare-disclosures.browser.test.ts) closes a disclosure and commits what reopens it with `flushSync` in one task, so the close's event is still queued. Pending its first run in the R19 gate. |

## R19–R22 recurrences

Historical line numbers below identify the failed attempt, not necessarily the
test's current line. A repair commit is not execution evidence.

| Test | Recurrence | Cause or current evidence | Status and retained checks |
| --- | --- | --- | --- |
| `tests/unified-search.spec.ts`: persistent browser restart | R19; recorded again in the G10 review | The case includes the persistent browser's full close/reopen lifecycle. `23049bb0` gives that case 90 s rather than the ordinary 45 s. Host contention alone is not established as the cause. | R21 pre-flight passed desktop and mobile on tree `9547ad9`; no repeated loop is claimed. |
| `tests/compare-tray-context.spec.ts:324` | R19 | Header geometry could be sampled before the dock settled after resize/drag/dialog close. `54c0380c` waits for two frame-separated readings to agree, preserving every original tolerance. | Repair recorded; no candidate-bound repetition receipt is claimed here. |
| `tests-cloud-ui/review-repairs.spec.ts:37` | R19 | Reauthentication recurrence recorded by G9/G10; no new cause proved by that receipt. The controlled Google fixture removes the external loader dependency but does not by itself explain this recurrence. | Open monitoring. Earlier single reruns do not close this recurrence. |
| `tests-cloud-ui/friend-all.spec.ts:534`: interrupted online-copy cleanup | R21 pre-flight | The dialog-close assertion waited 15 s for a long sequential deletion. `eaff3f94` waits up to 30 s for deletion's own success or refusal, fails with a refusal's text, then checks the dialog. | The isolated 3/3 result predates this repair. Repaired candidate verification remains required; do not relabel that earlier rerun. |
| `tests/films.spec.ts:73`: native film download (FLAKE-01) | R20–R21, both projects; 7/38 recorded failures in the G10 report | Pre-existing: exact R20 `2c15f1a4` on Node 24.21.0 failed 3/40; R22's unchanged film source failed 4/40 on that runtime. Chrome netlogs show `ERR_INVALID_HTTP_RESPONSE` and MP4 body bytes parsed as HTTP headers, but the cause remains open. Media-only `Connection: close` failed 2/40, all-preview close failed 4/40, and a distinct `?download=1` URL failed 8/40. Those unsuccessful workarounds were discarded. | Open investigation, not an R22 regression. Native browser download and byte-identical SHA-256 assertions remain unchanged. Raw coordinator-held receipts: `films-r20-node24-x20.txt` (37/40), `films-node24-baseline-x20.txt` (36/40), `films-node24-closeall-x20.txt` (36/40), `films-70ce-x20-receipt.txt` (38/40), `films-distinct-url-x20-receipt.txt` (32/40). The earlier Node 24 8/8 diagnostic did not establish a fix. |

## Candidate gate

FLAKE-01's final discriminating diagnostic on `2c15f1a4` explicitly paused the
video, removed its `src` and called `load()` before the native download click.
It still failed 2/40 (`films-r20-unload-x20.txt`, Node 24.21.0, 20 repeats on
each project, two workers), compared with the unchanged baseline's 3/40.
Active media loading is therefore not an established cause or a verified fix.
The diagnostic was removed; playback, switching, focus, native download and
SHA-256 checks are unchanged. No 40/40 repair receipt exists. The coordinator
permits one separately retained diagnostic rerun for this known pre-existing
test; it does not erase the failed attempt or make a stopped committed gate a
clean pass. All other failures still require investigation, not automatic retries.

Run the exact convergence test 20 times against the candidate rules using
[Release operations: convergence loop](release-operations.md#friend-default-convergence-loop).
This register adds no executed result. A failure must retain the emulator
debug log for the transaction interleaving; a later pass does not close it.
