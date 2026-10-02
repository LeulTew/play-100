# Local release operations

This is the procedure, not an executed release receipt. Hosted CI does not run
the gate; the dispatch-only [candidate CI runs](#candidate-ci-runs) add Linux
evidence beside it.
Every native command below must exit 0 before continuing. A deployment marked
Ready is not a passed gate. Stop on an uncertain mutation: inspect its result
before retrying; never repeat a deploy, promotion or rollback blindly.
Keep candidate URLs and raw operator logs private (deployment URLs contain a
team identifier). Publish deployment IDs and redacted evidence in the
[release ledger](releases.md), not credentials or candidate URLs.

## Prerequisites and unresolved manual gates

Use Node **24.21.0** (`.nvmrc`) and its bundled npm, Java 21 for the
emulators, Git, and the installed Playwright browsers (including Chrome for
the Chrome-only suites). Pin Vercel to **59.16.0**, as Release 2 records.
The authorized deployment shell is Ubuntu-24.04 WSL with fish and the existing
Vercel login; local gate examples use PowerShell 7. Do not install a different
CLI version or change project protection to make a check pass.

Run the release gate, build, release tooling and manifest collection on that
exact Node installation with its bundled npm, not a separately upgraded npm or
a newer Node. `release:manifest` records the executing Node version in
`versions.node` (`process.versions.node`, the version without the `v` prefix)
and the invoking npm package version in `versions.npm`. Retain those actual
versions with the command receipts. The gate must execute on this runtime for
the candidate: an older Node 24 receipt cannot be carried forward when release
tooling changed, including `release:verify`, `check:budgets` or the first-paint
plugin. Collecting a new manifest alone does not rerun or certify older tests.

Use project ID `prj_Mp6j1moxlfNXGV8nCcAC1tTDiCP7`, alias
`play-100-collection.vercel.app`, and the existing approved
`.vercel/project.json`. Obtain that file from the owner; check its `projectId`
and `orgId` against the dashboard before any mutation. Do not run a wizard
that creates or links a different project. Set `VERCEL_TEAM_SLUG` and
`VERCEL_TEAM_ID` from that approved team. `VERCEL_TOKEN` is an owner-authorized
API token; the CLI may instead use its existing login. Candidate verification
reads `VERCEL_AUTOMATION_BYPASS_SECRET` from the environment. These are **names**,
not values to paste into this file, a receipt or shell history. Use the owner's
secret manager, do not echo environment variables, and do not enable debug or
HTTP/header tracing. Never disable Deployment Protection or rotate its bypass.

These manual checks remain release gates or explicit owner-approved waivers.
Automation cannot mark them complete. Record owner, time, evidence and remaining
risk for each waiver; an earlier client-first exception is not standing approval.

| Manual check | Required readback / pending action |
| --- | --- |
| Firebase owner identity | Set `_owner/config.uid` to the verified owner UID while keeping `email`; reopen and confirm both fields. Do not publish the UID in receipts. |
| Three Firestore indexes | Collection scope: `entries`: `format ASC, epoch ASC, active ASC, entry.title ASC`; `entries`: `format ASC, epoch ASC, active ASC, entry.position ASC`; `friendPairs`: `participants CONTAINS, creatorUid ASC, state ASC, updatedAt ASC`. All three must show Enabled; delete nothing. |
| Firebase rules | Owner publishes reviewed `firestore.rules`; the R20 SHA-256 is `c6368628bcbc7a22896ab19ab569c20b24f2d6f33fdfcee2cad5b7e98754abb1` (111,757 bytes), and it may be published only while Release 7 or later is serving, so that the client explains the R13 refusals in plain text: a forced line break in a name or title, and a control or format character in a report reason, whose line breaks the client turns into spaces. R20 changes one statement from R13, so that a creator can still hide a live profile after its owner advanced the publication control alone; it refuses nothing new. The R12 title, name and cancel-hold refusals already need Release 6 or later, and handle claims Release 5 or later. It supersedes the unpublished R13 rules `75381577…`, R12 (Release 6) rules `8e645497…` and R11 (Release 5) rules `6c8ebcb2…`; publish none of them. Copy published text back, compare its hash, record publication time and retain the previous rules archive. A later changed rules file requires a new explicit reviewed hash, not reuse of this receipt. |
| Real Google Auth | Production desktop and mobile sign-in, link and reauthentication return signed in without CSP errors; emulator tests cannot certify real credentials, MFA or provider configuration. Reaching Google's sign-in page shows only that the redirect started; it is not a pass. |
| WAF `api-per-ip` | Review seven days of Log hits; switch Log to 429 **no earlier than 2026-10-02**. Record review, decision and switch time. Log mode records matches and blocks nothing, so the rule is not an active control before that switch. Do not invent a completed switch or modify the log-only OWASP rules. |
| Device and assistive technology | Physical low-end/mobile and iOS Safari, keyboard and screen-reader journeys, OS installation/launch/uninstall, real multi-window/two-version updates. Record devices and results or explicit waivers. Chromium emulation is not physical-device evidence. |
| Screen-reader speech receipt | Dispatch [Screen reader smoke](#screen-reader-smoke) against the candidate origin; retain the run URL, both `receipt.json` files (origin and served `index.html` SHA-256), the NVDA, VoiceOver, Chrome and runner versions, and the per-journey phrase logs. NVDA (a) compares the app's "dialog" and "heading" counts with the native-dialog control measured in the same job, because NVDA 2026.2 with Chrome 154 announces a plain native modal twice (control run [36967581972](https://github.com/LeulTew/play-100/actions/runs/36967581972) at `b541ca9d`). That repetition is the platform's behaviour, not the app's; name, role, heading, no "clickable", no automatic body read and focus return stay absolute. Any failed journey stays a failure or an explicit owner waiver. It does not replace the physical-device row above. |

See [iPhone Safari smoke](ios-safari.md) for the Mobile Safari simulator workflow,
its retained results and the remaining physical-device boundary.

### Screen reader smoke

`.github/workflows/screen-reader-smoke.yml` is dispatch-only. It drives real
NVDA with Chrome on `windows-2022` and real VoiceOver with Chrome on `macos-15`,
through Guidepup pinned by `scripts/screen-reader-smoke/package-lock.json`.
Input is keyboard only, sent through the screen reader; assertions read the
captured speech log, not the accessibility tree.

```sh
gh workflow run screen-reader-smoke.yml --ref <branch> -f target_origin=<https origin>
gh workflow run screen-reader-smoke.yml --ref <branch> -f sha=<full commit sha>
```

With `sha`, each job checks out that commit, runs `npm ci` and the configured
build with the repository's public `VITE_FIREBASE_*` variables, and serves
`dist` on `http://127.0.0.1:4173` through the commit's own
`scripts/vercel-static-server.ts` and `vercel.json`, so no tunnel is needed.
`receipt.json` then records `servedCommit` and the served `index.html` SHA-256.

`-f suite=control` runs, instead of journeys a–e, three minimal native-dialog
pages served by request interception on the target origin: a `showModal`
dialog with a short `aria-describedby` and autofocused heading, the same
without `aria-describedby`, and one autofocusing its Close button. They use
journey a's opening-speech checks with "dialog" and "heading" each at most
once. This separates app markup from generic browser and screen-reader
announcement behaviour.

Known platform behaviour: NVDA 2026.2 with Chrome 154 announces a native modal
dialog twice on open, in one spoken phrase, even on the plain control page with
no application code. The second pass uses browse-mode word order ("heading,
level 2, Control Game"). Control run
[36967581972](https://github.com/LeulTew/play-100/actions/runs/36967581972) at
`b541ca9d` heard "dialog" twice and "heading" twice for the control that
matches the app's dialog, with one DOM focus move; VoiceOver announced each
once. So in the product suite, the NVDA job first opens that control
(`control-heading-describedby`) in the same browser and records its counts.
Journey (a) then passes only if the app's "dialog" and "heading" counts are no
greater than the control's. A silent control records zero and fails (a). All
other checks stay absolute.
Each journal step also records the DOM `focusin`/`focusout` events since the
previous step, to tell DOM focus apart from the reader's virtual focus.

Journeys: (a) Tab to a The 100 card and press Enter: the opening speech, plus a
4-second settle, includes the dialog's name and role (and, in NVDA, its heading),
nothing is announced as "clickable", NVDA announces "dialog" and "heading" no
more often than the native control in the same job (see above), a short description is
allowed but the full body is not read automatically (the rationale's closing
words are not spoken), and Escape returns focus to the card, whose name is
spoken; (b) NVDA browse mode activates a card heading and
Escape returns focus to the card, not BODY; (c) Menu, Settings & backups, Lite
speaks "Visual preference saved." and closing returns focus to Menu;
(d) Discover search for `Portal` speaks the result count; (e) pinning a game for
comparison speaks the confirmation and the tray state. A job fails when any
journey fails. The `screen-reader-<reader>` artifact keeps the phrase logs,
versions, `receipt.json` and failure screenshots for 30 days whatever the
outcome. Release 7 is the failing baseline for NVDA (a): one DOM focus move
into the heading, yet NVDA speaks the dialog role, the whole body and the
heading twice. In CI, Release 7 (b)
returns focus to the card; the BODY loss seen with local NVDA did not
reproduce on hosted runners. The harness keeps Guidepup and its Playwright in
its own lockfile, so the root `npm ci`, `eslint .` and `tsconfig.node.json`
leave out `tests/` and `playwright.config.ts`; the pure `src/` modules and their
unit tests stay in the root lint and vitest `unit` project. Each workflow run
first runs a `harness` job that installs both lockfiles, runs
`npm run typecheck` in `scripts/screen-reader-smoke` against the pinned
Guidepup types, and lints the whole folder with
`SR_SMOKE_LINT=1 npx eslint scripts/screen-reader-smoke`; the reader jobs
type-check again after their own `npm ci`.

Before its journeys, the VoiceOver job runs `voiceover-preflight.sh`, because
`guidepup setup` grants Apple Events with `INSERT OR IGNORE`: a runner whose TCC
database already denies the client, or whose job starts under an unlisted parent
process, refuses with error -1743. The script upserts the grants for the job's
real process chain and Node, restarts `tccd`, and checks AppleScript control up
to four times. If control still fails, it stops the job with diagnostics in
`artifacts/voiceover/voiceover-preflight.txt`. It runs only on GitHub-hosted
runners, never on a workstation. Two consecutive runs of harness `e367b781`
against app `033daa99` passed every NVDA and VoiceOver journey:
[36977503773](https://github.com/LeulTew/play-100/actions/runs/36977503773) and
[36977530151](https://github.com/LeulTew/play-100/actions/runs/36977530151).
The GitHub-hosted-only guard was added after those runs.

### TalkBack smoke (Android, exploratory)

`.github/workflows/talkback-smoke.yml` runs TalkBack in an Android emulator on a Linux KVM runner and records its speech from logcat. Speech logging is at verbose level, and every `Actors: act() … action=SPEAK` line is kept. It drives Chrome with real `adb input` key events (Tab, Shift+Tab, Enter, Escape) and reads focus through a read-only CDP query.

Dispatch:

```
gh workflow run talkback-smoke.yml --repo LeulTew/play-100 --ref <branch with this workflow> -f target_origin=<origin>
```

Receipt from run [36975406748](https://github.com/LeulTew/play-100/actions/runs/36975406748) on production. The run concluded `failure` because (c) didn't complete. It ran the harness at commit `0e844f397478beeb082c59e686225bd82afaed48`. The following harness commit, which reuses Chrome between journeys and retries the CDP query, hasn't run yet.

- TalkBack 14.2.0.618048417, Chrome 113.0.5672.136;
- emulator API 34 `google_apis` x86_64;
- served `index.html` SHA-256 `1da5b6af…bd45e15`.

Proven for (a):

- the card is reached by Tab, and its name is spoken;
- Enter opens the detail dialog, and the name and "heading 2" are spoken;
- no "clickable", and no automatic body read;
- Escape closes it, and focus and speech return to the card.

Not proven:

- **The dialog role:** TalkBack doesn't speak "dialog", and the native control page didn't load in that run, so it isn't known whether the omission is TalkBack's or the app's.
- **(c):** Shift+Tab reached the Menu button, spoken as "collapsed, Menu, dialog pop up button", but the focus predicate didn't match, so the rest of (c) didn't run.

This is supporting evidence, not a release gate.

**VoiceOver on iPhone is blocked.** The iOS Simulator has no VoiceOver speech: VoiceOver isn't available in the Simulator ([Apple Developer Forums 83458](https://developer.apple.com/forums/thread/83458)), and [Accessibility Inspector](https://developer.apple.com/documentation/accessibility/accessibility-inspector) inspects without speaking. iPhone speech evidence needs a physical device. The XCUITest `performAccessibilityAudit()` substitute wasn't run.

For consented Windows OS evidence, run
`npm run release:pwa-os -- --url https://play-100-collection.vercel.app`
and retain its redacted receipt and SHA-256. See
[Windows OS installation companion](pwa.md#windows-os-installation-companion)
for the actual CDP installation/shortcut/removal checks and offline-emulation
boundary. The command honors the optional `PLAY100_HOST_LOCK` file and requires
at least 6 GiB free RAM by default;
each foreground PWA or screen-reader burst must remain under fifteen minutes.
Do not replace screen-reader evidence with an accessibility-tree snapshot:
record NVDA/Narrator version, Windows/Chrome versions, exact speech output,
keyboard steps and focus outcomes, with failures or omissions left visible.
Use a checksum-verified official portable NVDA, isolated configuration,
silent synthesis and input/output logging; remove its portable files and
configuration after the journeys. Do not change global audio settings or use
an owner's Chrome profile.

Use the [security promotion order](security-release-runbook.md#promotion-order)
for the owner operations and [manual PWA checks](pwa.md#manual-release-checks).
Client rollback does not revert Firestore rules, indexes, WAF or private data.

### R22 IndexedDB compatibility and rollback floor

**After R22 first opens a visitor's device library, every rollback target must
be R22 or later.** The database `play100-personal` advances from version 2 to 3.
This is a writer barrier, not a record-format migration: existing guest/account
libraries, recovery copies and store keys stay in place. Release 6 closes its
connection on `versionchange`, then refuses to reopen version 2 with
`PersonalLibraryVersionError`. This prevents both its marker-unaware saves and
its unconditional deletes from undoing account-copy removal or damaging a
newly opened writer generation.

A pre-R22 rollback cannot read these upgraded local libraries. Never delete or
rename the database, reduce the requested version, clear retirement markers,
or silently create a replacement store to make old code appear to work.
The safe recovery is a reviewed R22-or-later fix-forward deployment retaining
database version 3 and the writer-generation checks. Keep backups independent;
do not require visitors to destroy local data to recover the application.

Before the first R22 promotion, retain an approved R22-compatible recovery
candidate and its evidence. If the immediately previous production deployment
predates R22, the Hobby one-step rollback is **not an available safe recovery**;
use that approved compatible fix-forward with explicit owner authorization.
Record the integrated R22 barrier commit as the release's rollback floor.
Before upgrading, visitors should finish or copy drafts in older tabs: the
barrier preserves saved data but deliberately refuses those old tabs' later
writes. It does not forcibly reload them or migrate unsaved in-memory drafts.

An open connection that ignores `versionchange` blocks the upgrade. The UI
reports "Close other Play 100 tabs to finish updating this device library, then
retry. Your saved data has not been changed." Its **Try again** action reopens
the device library and remembered-account check without reloading the page or
clearing storage. A blocked account-hint read shares this notice instead of
repeating it. No **Use this device only** choice is needed: a remembered,
signed-in account resumes its own scope after the blocker closes. It stays focused
while pending and after another blocked attempt; successful recovery moves
focus to the current page heading only if the user has not focused elsewhere.
Close the blocking tab, then try again. If temporary edits have already been
made in this tab, retry refuses to replace them: export them in Settings, then
use **Discard tab changes and try again** and confirm. Only a successful reopen
discards those explicitly confirmed temporary changes; another blocked attempt
keeps them. A newer temporary edit requires a fresh confirmation. Previously
saved data is never cleared, and no copies are silently merged.
The recovery controls and retry/discard machinery load only after a blocked
state first appears; the original warning remains visible during that import.
The recovery chunk is included in offline preparation, not in startup's eager
graph. A failed import offers the existing guarded reload recovery and Settings
without clearing either copy.
The rejected open aborts if it later reaches the upgrade event, rather than
silently migrating after its caller has already shown an error. Retain the
mixed-version writer and blocked/retry browser-test receipts in the release gate.

## 1. Exact clean checkout and evidence directory

Choose the full reviewed commit already on `origin/main`. In a new operator
checkout (not a shared developer checkout), set the placeholders before running:

```powershell
$ErrorActionPreference = 'Stop'
$release = 'FULL_REVIEWED_COMMIT_SHA'
$checkout = 'C:\release\play100-source'
$evidence = 'C:\release\evidence-UNIQUE-RELEASE'
git clone https://github.com/LeulTew/play-100.git $checkout
if ($LASTEXITCODE -ne 0) { throw 'Clone failed' }
Set-Location $checkout
git switch --detach $release
if ($LASTEXITCODE -ne 0) { throw 'Checkout failed' }
if ((git rev-parse HEAD) -ne $release) { throw 'Wrong commit' }
git merge-base --is-ancestor $release origin/main
if ($LASTEXITCODE -ne 0) { throw 'Commit is not on origin/main' }
if (git status --porcelain) { throw 'Dirty checkout' }
New-Item -ItemType Directory $evidence -ErrorAction Stop | Out-Null
node --version
npm --version
if ((node -p "process.version") -ne 'v24.21.0') { throw 'Use Node 24.21.0 and its bundled npm' }
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Install failed' }
npm audit
if ($LASTEXITCODE -ne 0) { throw 'Review dependency audit before release' }
npm audit signatures
if ($LASTEXITCODE -ne 0) { throw 'Review package signatures before release' }
npx --no-install playwright install chromium
if ($LASTEXITCODE -ne 0) { throw 'Browser install failed' }
```

Use an existing Chrome installation or the documented owner-approved
`npx --no-install playwright install chrome` step. Retain the install audit and
Node/npm versions. The gate retains the full-history Gitleaks
scan described in [Quality checks](../README.md#quality-checks): the scanner's
redacted JSON report and command log, not only a summary of its result.

## 2. Candidate-bound local gate

The committed runner is the default entry point. It follows the release operator's
ordered local partitions, pins **Node 24.21.0**, refuses occupied suite ports
(including IPv6), and stops on the first failure without cleanup of evidence.
It sets `PLAY100_SOURCE_COMMIT` and `PLAY100_SOURCE_TREE` from the frozen
candidate, embeds them in Playwright reports and writes hash/command-bound
identity sidecars for native reports and generated command receipts.
Every partition is zero-retry except the isolated FLAKE-01 film-download
partition described below. The old, disabled hosted workflow was removed rather than kept as a
second, incomplete definition. No CI, push or deployment is performed.

### Lean release mode

The full `npm run release:gate` **remains the default**. Lean mode is supported
when the release operator schedules the required partitions separately to fit
shared-host, device-lab or foreground screen-reader windows. It is an evidence
collection mode, not a shorter list of checks or a deployment command. Every
required result must identify the same clean candidate commit and tree at
creation; neither an index assertion nor rebasing an unchanged tree replaces
that identity. Freeze
source, the lockfile and the intermittent register before collecting evidence.
Any change to them requires a new candidate and matching evidence.

Required evidence identifiers in the lean index:

| Identifier | Required evidence |
| --- | --- |
| `static` | TypeScript app and Functions checks, ESLint/Prettier, data and discovery validators; exact commands and exits |
| `units` | Relevant complete unit and mounted-browser suites, with native reports and no unexplained skips |
| `configured-build`, `configured-csp`, `configured-budgets` | Configured build and its `check:csp` / `check:budgets` reports |
| `offline-build`, `offline-csp`, `offline-budgets` | Separate unconfigured/offline build and its `check:csp` / `check:budgets` reports |
| `e2e-production`, `e2e-development`, `e2e-offline` | Production, source-fixture development and offline end-to-end partitions |
| `films-download` | The isolated native film case on desktop and mobile; retain both attempts if the sole rerun is needed |
| `cloud-rules` | Real emulator rules suite, tested rules digest, and required race/convergence repetitions |
| `cloud-ui-desktop`, `cloud-ui-mobile` | Both cloud UI projects, including one-worker rule-loading checks and required sync repetitions |
| `floor-smoke` | Browser-floor smoke receipt |
| `sw-probe` | Strict configured two-version service-worker campaign; validation-only mode is not release evidence |
| `rollback-drill` | Rollback rehearsal and its compatibility-floor checks |
| `apb2` | Complete APB2 startup/performance campaign and retained failures/limits |
| `test-lab`, `ios-safari` | Test Lab and iOS Safari receipts with device/runtime and tested-build identity |
| `screen-reader` | Real reader version, spoken output, keyboard/focus outcomes and tested-build identity |
| `gitleaks` | Full reachable-history scan, pinned scanner identity and redacted native result |
| `npm-audit`, `npm-signatures` | Audit and signature receipts for both installed build profiles; advisories remain visible for review |

Keep raw logs, native reports and artifacts outside the checkout. Before each
command, derive `PLAY100_SOURCE_COMMIT` and `PLAY100_SOURCE_TREE` from the clean
candidate's `HEAD`, never from a previously recorded report. All four
`playwright*.config.ts` configurations put them in `metadata`; Playwright's
native JSON contains them under `config.metadata`. Ordinary local runs without
these variables still work but do not produce identified release evidence.
Setting only one variable or an invalid SHA stops config loading.

For Vitest JSON and tools that cannot embed identity, run the creation command
through the committed wrapper. It reads and exports both values itself before
spawning, refuses existing report/sidecar paths, preserves the real exit code
and checks that source stayed clean and unchanged before issuing
`<report>.identity.json`. Each sidecar contains `schemaVersion: 1`, full
`commit` and `tree`, the exact report `sha256`, and the creation `command`
array. Failed reports get sidecars too; this does not turn failure into a pass.
There is intentionally no command to stamp an already-existing receipt.

```powershell
$env:PLAY100_SOURCE_COMMIT = (git rev-parse HEAD).Trim()
$env:PLAY100_SOURCE_TREE = (git rev-parse 'HEAD^{tree}').Trim()
if (git status --porcelain) { throw 'Freeze the candidate before collecting evidence' }

# Native Playwright metadata and a per-report sidecar, with zero retries.
$env:PLAYWRIGHT_JSON_OUTPUT_FILE = "$evidence\e2e-production.json"
$env:PLAY100_TEST_BUILD = 'production'
$filmCase = 'optional films stay unloaded until Watch, play and seek natively, switch without overlap and restore focus'
npm exec --no -- tsx scripts/release-evidence.ts --report "$evidence\e2e-production.json" -- npm exec --no -- playwright test --reporter=list,json --retries=0 --grep-invert "$filmCase"
if ($LASTEXITCODE -ne 0) { throw 'Production partition failed; preserve the evidence' }

# Vitest does not embed the source, so its sidecar is mandatory.
npm exec --no -- tsx scripts/release-evidence.ts --report "$evidence\unit-browser.json" -- npm exec --no -- vitest run --reporter=default --reporter=json --outputFile="$evidence\unit-browser.json"
if ($LASTEXITCODE -ne 0) { throw 'Unit/browser partition failed; preserve the evidence' }

# For stdout-only checks, the wrapper captures a log and binds it.
npm exec --no -- tsx scripts/release-evidence.ts --log "$evidence\types.log" -- npm exec --no -- tsc -b
if ($LASTEXITCODE -ne 0) { throw 'Type check failed; preserve the evidence' }
```

Apply the same wrapper to each separately scheduled creation command, naming
every output with repeatable `--report` arguments; `--log` optionally captures
stdout/stderr. Keep device reports, screenshots and archives together and
identify them when their actual device-test or archive command creates them.
An old iOS `results.json`, Test Lab or reader receipt without creation-time
identity cannot be admitted by relabelling it in the index. Device operators
must additionally verify the target build matches this candidate; the source
environment identifies the checkout, not a mutable remote origin.

At execution time record each file in a JSON index with its full tested tree, byte count,
SHA-256, UTC recording time and result. Include every evidence file; multiple
files may share an identifier. For the film partition, use one receipt bundle
per attempt (with its log, native report and artifacts inside), numbered 1 and
optionally 2. Neither edit a failed receipt into a pass nor relabel an old
receipt with the current tree.

```json
{
  "schemaVersion": 1,
  "tree": "FULL_40_CHARACTER_CANDIDATE_TREE",
  "evidence": [
    {
      "check": "static",
      "file": "static-receipt.json",
      "tree": "FULL_40_CHARACTER_TESTED_TREE",
      "sha256": "RECORDED_64_CHARACTER_SHA256",
      "bytes": 1234,
      "recordedAt": "2026-10-02T01:00:00.000Z",
      "result": "passed"
    }
  ]
}
```

This is a shape example, not an accepted complete index: all table identifiers
are mandatory. Paths resolve relative to the index. Allowed results are
`passed`; `failed` only for film attempt 1 followed by passed attempt 2; and
`review-required` only for `npm-audit`. A second film failure stops release.
Missing, blocked or not-yet-run reader/device checks cannot be encoded as passes.

```powershell
npm run release:manifest -- C:\release\evidence\lean-manifest.json --lean C:\release\evidence\index.json
if ($LASTEXITCODE -ne 0) { throw 'Lean evidence is incomplete, changed or belongs to another tree' }
```

This extends the existing typed `release:manifest` command; its native-report
mode stays available. Lean collection needs no `dist` or running server. It
binds the current commit/tree, `package-lock.json`, `docs/intermittents.md`, the
index and every listed file's digest, size and recorded tree, plus every used
identity sidecar's digest and size. It refuses
missing/changed files, other-tree evidence, dirty source, duplicate files,
in-checkout output and overwrite of an existing manifest. **Every evidence
category needs creation-time provenance**, even if the index row has the right
tree. Accepted native identities are a complete `commit`/`tree` pair at the
JSON root, `source` (`sha` is also accepted there), `metadata`, or Playwright's
`config.metadata`; text logs need both `commit:` and `tree:` headers. Otherwise
an adjacent `<file>.identity.json` must match the candidate and exact report
bytes. Missing, partial, conflicting or different-commit/tree declarations fail,
even when another identity source is valid.

Candidate CI's original downloaded artifacts contain `identity.json` with `commit`, `tree`,
`requestedSha`, `suite` and the workflow-run URL. Keep that artifact intact.
A sibling `identity.json` is discovered automatically; for nested reports set
the index row's optional `"identity": "candidate-ci/identity.json"` relative to
the index. Reports must remain beneath that identity's artifact directory and
the identity must name this repository's Candidate CI run and exact candidate.
The identity's `suite` must match the lean category: `checks` supplies `static`
and `units`; the other supported categories use the suite mapping in
[`LEAN_CI_CHECKS`](../scripts/candidate-ci/plan.ts). Other categories need their
own creation-time evidence, not a relabelled CI artifact.
When `files` is present, exactly one entry must match the report's
artifact-relative path (forward-slash separators), `bytes` and `sha256`.
An empty, malformed or nonmatching inventory is rejected, even if the report
also embeds matching commit/tree metadata. The manifest labels this binding
`candidate-ci-files` and binds the downloaded report and identity bytes.
Only identities **without** `files` retain legacy acceptance, explicitly labelled
`legacy-candidate-ci`: their association relies on the original workflow artifact,
not proof that a detached file came from that run. Verify the workflow URL and
artifact origin; do not mix files from different runs.

Creation-time metadata is not a cryptographic execution attestation. Review command headers, native
results, device build identity and completeness before accepting it. The
collector does not execute checks, approve audit advisories, reinterpret
performance failures or authorize deployment. `reviewRequired: true` must
receive an explicit advisory decision before promotion. A waiver or cross-tree
carry-forward needs separate owner review and is not a passing lean manifest.

### Isolated FLAKE-01 partition

The full runner excludes exactly the named native film playback/download case
from production e2e and runs it separately as `films-download` on desktop and
mobile. Other tests in `tests/films.spec.ts` stay in production e2e; development
fixtures are unchanged. Playwright itself always uses `--retries=0`.

The first run writes `films-download-attempt-1.*` and a distinct results
directory. On failure, keep every file and run that partition once more with
`films-download-attempt-2.*`. Stop on a second failure; never restart another
partition to obtain green. Playback, seek, switching, focus, native download
and byte-identical SHA-256 assertions are unchanged. The successful aggregate
receipt binds both attempts' log/exit/report bytes, including an explicitly
missing native report if the first runner failed before writing it. The
manifest includes the final native report and this exception receipt; it does
not erase or relabel the first failure. See [FLAKE-01](intermittents.md#flake-01-phase-2-conclusion).

### Full runner setup

Prepare a separate clean offline checkout at the **same full candidate SHA**,
with matching installed dependencies, as described in section 3. The runner
never installs dependencies or creates worktrees. Both checkouts must have no
`.env` files; load only the reviewed public Production configuration into the
calling environment. Java 21 and the installed browsers must already be available.
Use the pinned runtime's bundled npm. Do not invoke this full gate during another
job's bounded-check or quiet window.

Download the matching Gitleaks 8.30.1 release archive separately from
`https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1` and set
`PLAY100_GITLEAKS_ARCHIVE` to its absolute path. Windows x64, Linux x64 and macOS
x64/arm64 archives are pinned in `scripts/release-gitleaks.ts`; unreviewed
platforms or mismatched bytes stop the gate. `tar` must be available to extract
the verified executable into the new evidence directory. The gate neither
downloads nor installs a scanner and refuses shallow history.

```powershell
npm run release:gate -- --dry-run
npm run release:gate -- --evidence C:\release\evidence-NEW --offline-checkout C:\release\offline-CANDIDATE
if ($LASTEXITCODE -ne 0) { throw 'Gate stopped; investigate retained evidence before any new attempt' }
```

The evidence directory must not exist and must be outside both checkouts.
Dry-run prints the entire plan without starting servers, tests or builds.
The full plan includes the three-engine floor smoke and the APB2 hook below.
Before starting, set `PLAY100_FLOOR_CHROMIUM` to an installed, reviewed old
Chromium executable and install the matching Playwright Firefox/WebKit engines.
There is no two-engine substitute in the full gate. The runner also refuses to
start if the committed `release:apb2` package script is absent.
Execution first runs `npm audit signatures` against the installed tree in each
checkout, before any static check or test. Each signature check must succeed;
its log hash and exit receipt are bound into that checkout's release manifest.
Next, `npm audit --json --audit-level=info` runs in both checkouts. Native audit
JSON, its real exit code, UTC start/end, command-receipt hash and lockfile SHA-256
are retained in `*-dependency-audit.json` and bound through manifest
`--audit` inputs. Exit 1 with a valid advisory report is recorded as
`reviewRequired: true`, not relabelled as a clean audit or an automatic release
block for already-documented advisories. The owner must review changed/new
advisories before release and record any acceptance. Registry/network failures,
malformed reports and unexpected exits still stop the gate; the manifest refuses
audit evidence for another lockfile. It then runs
Gitleaks over the exact candidate SHA and its full ancestry, followed by
static checks, unit/browser tests, cloud rules and the handle
race x5 / convergence x20, both independent builds with CSP/budget checks,
production/development e2e, cloud-UI with freshly allocated comparison actors,
both cross-tab identity cases x20 on both projects (80 cases), and offline navigation plus
offline unit/browser tests. Every emulator partition owns a fresh config/log
directory. Native reports, exact-count loop checks, log hashes, exit receipts,
tested rules and both build fingerprints are retained; separate configured and
offline release manifests bind the results. No automatic carry-forward is used.
`gate-complete.json` exists only after both manifests succeed. The two-version
service-worker campaign and owner/live-provider checks remain separately
commissioned evidence, not something this single-candidate runner claims.

### Two-version service-worker companion

`npm run release:sw-probe -- --input <input.json>` runs the committed
`scripts/release-sw-probe.ts` companion on Node 24.21.0. It requires the host's
browser window/lock separately from the single-candidate gate. It does not build,
install, deploy, run emulators, use a visitor profile or contact production APIs.
Use the installed Playwright Chromium and a clean, committed source checkout;
the receipt records the runner commit, tree and script hashes. Prefer a short
evidence path on Windows for Chromium's persistent profile files.
Both archived builds must already exist;
the candidate must be the configured build bound to its passed gate receipt.

Prepare a JSON input outside the checkout, with this shape (all digests and
commits below are placeholders, not usable release evidence):

```json
{
  "version": 1,
  "port": 4290,
  "evidence": "fresh-sw-evidence",
  "baseline": {
    "commit": "<full baseline commit>",
    "receipt": "baseline-build-receipt.json",
    "receiptSha256": "<64 hex characters>",
    "vercel": "baseline-vercel.json",
    "vercelSha256": "<64 hex characters>"
  },
  "candidate": {
    "commit": "<full candidate commit>",
    "receipt": "candidate-build-receipt.json",
    "receiptSha256": "<64 hex characters>",
    "vercel": "candidate-vercel.json",
    "vercelSha256": "<64 hex characters>"
  }
}
```

Input paths are relative to the input file. Each build receipt uses the retained
archive contract: `Passed: true`, `Source` equal to the full commit, and
`Build.Archive.{Root,Path,SHA256}`. `Path` names a manifest with
`Files: [{File,SHA256}]`; `Root` names the archived dist. Relative archive paths
resolve beside the receipt. The candidate also requires
`Status: "CONFIGURED_BUILD_PASSED"`, `Build.{IndexHtml,SwJs,PwaVersion}`,
`Fingerprints.Archive`, and `Gate.ConfiguredIdentity.fingerprint`.
The latter two must equal the complete archive fingerprint made by the gate.
For an explicitly commissioned **tool shakeout only**, the input may set
`"purpose": "tool-validation"` (omission means `"gate"`). Its candidate receipt
must instead use `Status: "CONFIGURED_VALIDATION_BUILD_PASSED"` and
`Purpose: "tool-validation"`, omit `Gate`, and retain the same complete archive,
source-policy and build-identity bindings. Never fabricate a gate fingerprint for
a standalone build. The result is marked `gateEligible: false` and, if clean,
`VALIDATION_PASSED`, not `PASSED`. This runs every campaign check but cannot be
used as R23 gate evidence. Normal gate admission still requires the gated build.
As in the gate, fingerprint path separators are host-native: retain the same
host platform rather than reinterpreting an archived fingerprint.
The baseline must be Release 6 commit
`129e73eebbf6c8c7eef5fc3eda1d4ab45f8161fe`: the mixed-version phase runs that
actual version-2 client, not a reconstructed old app or the current source
with its database version changed. The candidate must include the blocked
library notice's **Try again** action. A candidate without it holds this
expanded campaign; the separate reload case is not a substitute.
The exact `vercel.json` bytes must belong to the supplied commit in local Git
history; the companion does not fetch. Baseline and candidate worker versions
and module-entry paths must differ. Missing, extra, changed or linked build
files fail admission. Inputs and full archives are checked again after execution.

The runner binds only `127.0.0.1` and refuses an occupied port. It exclusively
creates the evidence directory and persistent profiles, never reusing a
partial run. It serves A, enables offline access through the real app UI, checks
the documented initially uncontrolled page, reopens under A, and stops the
server before cold-offline `/` and `/my-games`. It then serves B on the same
port, observes A controlling the old document with B waiting, uses the app's
check/review/save-update controls, requires exactly one reload and B's controller
and document identity, and verifies old-image eviction with the two-core cache
contract. A separate fresh profile must have no preparation requests,
registration or caches before intent, including after relaunch. Finally it stops
B before cold-offline checks of both routes. Every phase retains CSP,
navigation, worker, cache and error observations; online and offline documents
must use their bound policy.

After that original SW sequence, three fresh profiles exercise the database
writer barrier without a service worker intercepting the two versions:

- **Mixed version:** a synthetic, script-free loopback setup page saves a valid
  two-game guest library in IndexedDB v2. Tab A then runs the actual Release 6
  ranking page, holds its real database connection and edits a note without
  leaving the field. A read-only snapshot proves it is still pending. The server
  switches to the candidate on the same origin while A stays open; new tab B
  opens the candidate and upgrades the database to v3. Native-call observation
  records the old connection's `versionchange` and its own `close()` call, and a
  read-only transaction attempt on that retained handle must throw
  `InvalidStateError`. The observer does not close connections or suppress events.
  B removes that game's ranking through the confirmation dialog and durably
  saves a different game's note. A then attempts its pending save by leaving
  the note field: its actual v2 reopen must fail with `VersionError`, the visible
  note error must invite retry/copy, and the pending text must stay in the editor.
  Every IndexedDB row after that failure must equal B's saved snapshot; the
  removed ranking cannot reappear and B's note cannot disappear.
- **Blocked upgrade with in-page retry:** a synthetic setup page deliberately
  retains a v2 connection and ignores `versionchange`. Candidate tab B must show
  the plain-language “Close other Play 100 tabs…” notice, explaining saved data
  is unchanged. Exactly one blocked notice must cover the whole opening,
  including the unread account hint. Do not choose **Use this device only**:
  recovery must retry opening without changing the intended library scope.
  Clicking its **Try again** button while still blocked must keep
  exactly one notice, focus and stored rows. After the synthetic connection closes, the
  same button must reopen v3, restore both saved rankings and dismiss the blocked
  notice without a document reload. No temporary edits are made during this
  recovery test.
- **Blocked upgrade with reload:** repeat from a separate fresh v2 profile,
  record the same blocked notice, close the synthetic connection, and explicitly
  reload the candidate. The v3 snapshot must contain all original rows unchanged.
  This records browser-reload recovery separately; it does not certify the
  in-page button by proxy.

All three are required checks (`mixedVersion`, `blockedUpgrade`, `blockedReload`).
The receipt retains full **synthetic** IndexedDB key/value snapshots before
upgrade, after upgrade, after B's changes, after A's failed save, while blocked
and after recovery, plus connection events, draft/error text and screenshots.
It never attaches to real visitor profiles. Each mode has its own retained
profile, and a failure remains `HOLD` with partial observations. Pure unit tests
reject false-positive evidence such as an unrelated connection closing, a close
before `versionchange`, a lost draft, an unattempted save, resurrected ranking,
changed candidate rows, a fabricated blocked condition or destructive recovery.
An isolated fake-indexeddb test also proves the observer itself cannot unblock
an ignored `versionchange`. These unit results do not claim real-browser proof:
the expanded campaign must run at GO against the final candidate archive.

`sw-probe.json` contains input/build identities, browser identity, all required
check results, failure details and server request records; update screenshots
and all five profiles remain alongside it. Missing checks or any captured
page/server/CSP error produce `HOLD` and a nonzero exit. There are no automatic
retries or deployments. Preserve an incomplete run; investigate and authorize
a new evidence directory rather than replacing it. Admission failures before
directory creation are reported on stderr and must be retained in the operator's
command log. Attach the receipt and its SHA-256 to the candidate release packet;
`gate-complete.json` alone does not certify this campaign.

**Porting boundary:** the companion preserves the R22 SW campaign's phase order
and assertions, consolidating its 39 checks into 27 required checks, then adding
the three mixed-version/blocked-recovery checks above (30 total). It derives
from the reviewed `r22-swl-probe.mjs` SHA-256
`8dfbc25f7475d3271078ed89326cd6923e6837a8b55a6a9f7080bc0cf3657eae`
and `r22-swl-tools.mjs`
`3e2d5312152302e8a6f0e9f2e0a8a16468800fe71beddd409eb183ecab602aaf`.
These are the port's source snapshots; reconcile them with the final R22 report
if its active campaign changes the source artifacts.
Release-specific paths and historical authority chains are replaced by explicit
pinned inputs. Unlike the historical external server, the committed local server
never proxies public API requests: those return an explicit 503; browser DNS is
restricted to loopback. It does not emulate Vercel Functions, compression, ranges
or conditional responses and is not a film-download transport probe.
It requires retaining the previous ready core (rather than allowing its absence),
and page errors now hold instead of producing `PASSED_WITH_FINDINGS`.
These are deliberate stronger acceptance checks, not historical receipt edits.
The cold-offline phases prove the browser uses the installed worker, not a
mocked response. The mixed-version phase covers one pending guest note in two
versioned tabs; it does not certify every multi-window/account edit or a deployed rollback.
Unit coverage exercises input/digest/source binding, archive integrity, local
serving and fail-closed check accounting; the browser campaign must be run in an
approved host window before claiming a two-version pass for this port.

### Local database-v3 recovery drill

Run `npm run release:rollback-drill` in both the candidate and the approved
R22-compatible recovery source checkout, retaining each native Vitest JSON report
with its full source commit and the release packet:

```powershell
npm run release:rollback-drill -- --reporter=json --outputFile="$evidence\recovery-drill.json"
if ($LASTEXITCODE -ne 0) { throw 'Database recovery drill failed' }
```

The isolated fake-indexeddb drill executes the actual product storage APIs. It
seeds guest, account and recovery-copy records in v2, opens them with the v3
client, proves the old connection closes and a version-2 reopen fails, and checks
that all saved rows remain unchanged. Compatible v3 reopening must read both
libraries and recovery data and commit a new edit. A second case proves account
retirement survives reopening, an old writer cannot save or delete a newly opened
generation, and explicit account reopening uses the new generation.
It never opens, deletes or renames real visitor storage. The old-client open is
modeled by its version-2 IndexedDB request, not a claim to execute Release 6's
bundle. This is a local storage/fix-forward rehearsal, **not** a Vercel rollback
or real-browser disk-persistence receipt. The eligibility/approval and live
readback requirements in §9 still apply.

### APB2 v3.2 campaign protocol

APB2 remains a separately frozen performance campaign, not a result implied by
`release:gate` or the SW probe. `npm run release:apb2` is the committed runner. It
drives the digest-pinned v3.2 measurement set, which stays outside the repository:
name its folder with `--protocol <dir>` or `PLAY100_APB2_PROTOCOL`, never by a
path in the repository. Before it loads any of that set, the runner checks all 145
files against `scripts/release-apb2-v32-files.ts` (plan-freeze-v3-2 `c6eba71b`),
and checks the pinned configuration's profiles, journey order and budgets against
`scripts/release-apb2-contract.ts`; any difference stops the run. Do not substitute
a smaller benchmark or claim a campaign pass from unit checks, and do not use files
still changing during the active gate.

```sh
npm run release:apb2 -- verify --protocol <dir>
npm run release:apb2 -- stage --protocol <dir> --profile fine1440cpu1 --dist dist \
  --evidence <evidence> --stage-id <name> --browser-version <Chrome> --quiet-attested
npm run release:apb2 -- stage --protocol <dir> --profile coarse393cpu4 --dist dist \
  --evidence <evidence> --stage-id <name> --browser-version <Chrome> --quiet-attested \
  --previous-runtime <protocol>/round4-apb2/<fine stage>/runtime.json
npm run release:apb2 -- collect --protocol <dir> --profile <id> --capture <capture> \
  --dist dist --evidence <evidence> --name <name>
```

A stage runs on the gate runtime. It binds the clean HEAD, every file of the build
and the hint-authority sources (`motion-hint`, `personal-db`, `scoped-library`,
`App`) into `<evidence>/<stage-id>/`, sets the fixture's IndexedDB version from the
committed `DB_VERSION`, serves the build read-only on `127.0.0.1:4199` and launches
stock Chrome, whose version must equal `--browser-version`. It proves the setup
guards and the ordinary-Pin preflight before timing, then the pinned adapter
captures the fixed 72-context population under a 19-minute lease. The capture stays
where the pinned adapter writes it (`<protocol>/round4-apb2/<stage-id>/capture`).
Afterwards the runner checks, for up to 15 seconds, that the owned Chrome's
processes and both ports are gone, then re-checks HEAD, the tree, the build and
the pinned set. A stage whose closure never holds, or that lacks this after-run
check, is held (HOLD, or a failed smoke). It writes one JSON record per
scheduled repetition, missing and failed ones included, with an index of SHA-256
digests, and `table.json`: the pinned aggregation's rows beside rows recomputed in
TypeScript from those records. The two must agree field by field, including
which rows are gated, and each profile's table must have exactly the contract's
29 gated rows, so a row relabelled informational cannot leave the gate.

Exit code 0 means a complete capture whose gated rows all pass, 2 a complete
capture with a gated row not passing, and 1 anything else; the receipts are kept in
every case. A campaign stage needs `--quiet-attested`, the operator's attestation
that no other test, server, emulator, build or WSL work runs on the host; the q40
admission wait, the coordination marker and host covariates stay with the
operator. `--smoke` runs the same path under a 3.5-minute lease, so it stops after
the first contexts: it shows the runner works end to end, needs no attestation and
makes no timing claim. `collect` re-collects a capture of the same HEAD, including
one taken by another harness of the same pinned protocol.

The gate's `apb2` step calls the runner's gate form,
`npm run release:apb2 -- --evidence NEW_DIRECTORY`, with
`PLAY100_APB2_SOURCE_COMMIT` and `PLAY100_APB2_SOURCE_TREE` set to the full
candidate identities. It also passes the operator's `PLAY100_APB2_PROTOCOL`,
`PLAY100_APB2_QUIET_ATTESTED=1` and `PLAY100_APB2_BROWSER_VERSION` through, which
the configured profile would otherwise strip. Before its first step the full gate
checks those three settings, as it checks `PLAY100_FLOOR_CHROMIUM`: an absolute
protocol folder that verifies against the committed digests, the attestation and
a four-part Chrome version. The gate form checks both
identities against HEAD, verifies the pinned set, captures `fine1440cpu1` and then
`coarse393cpu4` (with the fine runtime as its previous runtime) from the
configured `dist`, and collects both. It then writes `NEW_DIRECTORY/receipt.json`
conforming to `Apb2GateReceipt` in `scripts/release-gate.ts`: `schemaVersion: 1`,
`source: { sha, tree }`, and `status: "passed"` only when both profiles are
complete, their recomputed tables equal the pinned aggregation and all 29 gated
rows of each pass; otherwise `failed`, with its reasons. The receipt binds each
profile's stage receipt, `table.json`, record index and capture `run.json` by
SHA-256, with the runner's file digests and the pinned set's verification; it
never merely echoes the environment as proof. An operator who must admit the host
between the profiles runs the same sequence as `gate --step fine1440cpu1`,
`--step coarse393cpu4` and `--step receipt` against one evidence folder. The gate
verifies the exit and exact source identity and hashes the receipt in its final
configured manifest. Missing runner, receipt, wrong identity or failed status
blocks the gate; there is no skip, fabricated pass, or fallback to a smaller
benchmark.

The v3.2 amendment changes only fixture IndexedDB opens to the source-bound
`DB_VERSION` (3 for R22), read lazily through validated
`APB2_FIXTURE_DB_VERSION`. Both `seedGuest`/`guestState` and the hint-contract
seed/read paths use this value; the driver and startup call sites stay unchanged.
A version-2 fixture reopen against a v3 app is a fixture failure, not a measured
performance regression. Do not downgrade the product or wipe/reseed after the
measurement starts to make it pass.

Freeze the full fixture inventory after a clean dry run and before preview or
official validation. Retain hashes of protocol, collectors, source-export facts,
amendment and runner; pure-suite read traces must not leak imports from older
v3/v3.1 or unfrozen originals. The protocol JSON remains
`5c6a9739a0b7c464af44f2ca4850fe149c2577bd30a860aa0ee84dfd0c9045df`;
budgets, schedules, aggregation and the collector's 1 ms block-then-cancel window
are not changed by the database amendment.

Preserve eight repetitions and nearest-rank p75 (sixth of eight), native input,
the 1200 ms action / 160 ms drain / 500 ms quiet windows and zero retries or
replacement runs. Any failed run fails its cap. Profiles remain fine
1440×900/CPU1 and coarse 393×851/CPU4, with the inherited APB1 budgets.
Each block orders static control, first visit, dense-500 library, collection
title, discovery title, menu, queue, ready account, ordinary Pin, and the
informational returning-without-hint case when enabled. A stage has a 19-minute
cap and reserves 120 seconds before starting another run; a predeclared split
retains all eight repetitions. Do not extend a stage retrospectively.

Event Timing remains `FINITE`, `BELOW_THRESHOLD` or `UNKNOWN`.
`BELOW_THRESHOLD` requires the live 16 ms observer, exactly one completed native
interaction, trusted trigger identity, matching document and complete observation
window; it is not a fabricated zero. Preserve intervals through aggregation.
First-visit FCP/LCP and static controls are informational, with the frozen
500 ms quiet / 10 s hard-cap paint stop rule. FP–DCL gaps over 500 ms are labeled,
never removed or replaced. The startup gate still measures the first unhinted
app document; warm second-navigation deltas cannot replace it. Hint-on/off
populations retain P0–P3 read-only observations and require complete matching
eight-run cohorts before reporting a delta. These rules and the local v3 fixture
amendment must survive any future committed port.

### Gate evidence and diagnostic commands

Every command log starts with the full candidate commit and tree; emulator
debug logs receive the same header when that partition stops, even on failure.
Native JSON reports remain unmodified. `history-secret-scan-tool.json` retains
the archive/executable digests and version; `history-secret-scan-summary.json`
records the scanned ref, reachable commits and the scanner's own count.
Binary-only PNG commits have no text patch and do not enter that count (the
reviewed R21 history had 2 such commits among 910 reachable). The receipt lists
binary-only and no-file-patch commit IDs rather than assuming those historical
numbers still apply. Empty/merge commits and commits without additions can
also be absent from the scanner count; binary contents are not claimed as
text coverage. The native redacted report, summary and tool identity are bound
into the configured manifest. A nonzero scanner exit or nonempty findings
report stops the gate.

The explicit commands below document the partitions for diagnosis; running the
runner does not require copying them into additional terminals.

Keep a command/exit-code log in the private evidence directory; do not use a
transcript when loading credentials. Use a fresh report filename for every
partition or failed attempt. Investigate failures; a green retry does not erase
the first failure. Never use `PLAY100_ALLOW_ONLY` or `PLAY100_REUSE_SERVER`.

```powershell
Remove-Item Env:PLAY100_BASE_URL, Env:PLAY100_ALLOW_ONLY, Env:PLAY100_REUSE_SERVER -ErrorAction SilentlyContinue
function Invoke-RecordedCheck([string]$name, [scriptblock]$check) {
  $log = Join-Path $evidence "$name.log"
  $receipt = Join-Path $evidence "$name.json"
  if ((Test-Path $log) -or (Test-Path $receipt)) { throw "Use fresh evidence paths for $name" }
  & $check *> $log
  $code = $LASTEXITCODE
  $result = @{ exitCode = $code; log = "$name.log"; logSha256 = (Get-FileHash $log -Algorithm SHA256).Hash }
  [IO.File]::WriteAllText($receipt, ($result | ConvertTo-Json))
  if ($code -ne 0) { throw "$name failed; retain its log and receipt" }
}
Invoke-RecordedCheck types { npx --no-install tsc -b }
Invoke-RecordedCheck functions-types { npm run typecheck:functions }
Invoke-RecordedCheck lint { npm run lint }
Invoke-RecordedCheck data { npm run validate:data }
Invoke-RecordedCheck discovery { npm run validate:discovery }
npm test -- --maxWorkers=1 --reporter=default --reporter=json --outputFile="$evidence\unit-browser.json"
if ($LASTEXITCODE -ne 0) { throw 'Unit/browser gate failed' }
Copy-Item firestore.rules "$evidence\tested-firestore.rules" -ErrorAction Stop
npx --no-install firebase emulators:exec --project demo-play100 --only auth,firestore "vitest run --config vitest.cloud.config.ts --reporter=default --reporter=json --outputFile=$evidence\cloud.json"
if ($LASTEXITCODE -ne 0) { throw 'Cloud rules gate failed' }
if ((Get-FileHash firestore.rules).Hash -ne (Get-FileHash "$evidence\tested-firestore.rules").Hash) { throw 'Rules changed during cloud tests' }
```

Use an evidence path without spaces for the nested emulator command. It is the
same emulator/Vitest invocation as `test:cloud`, with native JSON reporting.
Keep its complete console/exit receipt as well as `cloud.json` and the rules
snapshot taken before the run; do not edit rules while it runs. The emulator
command owns startup/teardown; do not run cloud-UI emulators concurrently.

### Friend-default convergence loop

Review [known intermittents](intermittents.md) before accepting the candidate.
In addition to the full rules suite and handle-claim race evidence, run this
20-iteration convergence loop on the same candidate rules, before starting
cloud-UI emulators. Use the same no-spaces `$evidence` directory and rules
snapshot from above. Each iteration starts fresh demo emulators and retains
its own native JSON, exit receipt, console and Firestore debug log. This is a
required command, not a claim of a completed loop.

```powershell
$rulesHash = (Get-FileHash "$evidence\tested-firestore.rules" -Algorithm SHA256).Hash
for ($iteration = 1; $iteration -le 20; $iteration++) {
  $prefix = "$evidence\friend-default-$iteration"
  if (Test-Path "$prefix*") { throw 'Use fresh loop evidence paths' }
  if ((Get-FileHash firestore.rules -Algorithm SHA256).Hash -ne $rulesHash) { throw 'Candidate rules changed' }
  npx --no-install firebase emulators:exec --project demo-play100 --only auth,firestore "vitest run --config vitest.cloud.config.ts tests-cloud/friend-all.test.ts -t converges.a.first.friend.action.and.the.automatic.default.on.one.default.policy.in.either.order --reporter=default --reporter=json --outputFile=$prefix.json" *> "$prefix.log"
  $code = $LASTEXITCODE
  if (Test-Path firestore-debug.log) { Copy-Item firestore-debug.log "$prefix-firestore.log" }
  $receipt = @{ iteration = $iteration; exitCode = $code; rulesSha256 = $rulesHash }
  [IO.File]::WriteAllText("$prefix-exit.json", ($receipt | ConvertTo-Json))
  if ($code -ne 0) { throw "Convergence failed at iteration $iteration; investigate the retained interleaving" }
  if ((Get-FileHash firestore.rules -Algorithm SHA256).Hash -ne $rulesHash) { throw 'Rules changed during loop' }
  $result = Get-Content "$prefix.json" -Raw | ConvertFrom-Json
  if ($result.success -ne $true -or $result.numPassedTests -ne 1 -or $result.numFailedTests -ne 0) {
    throw 'Expected exactly one passing convergence test, not an empty or skipped run'
  }
}
```

Do not erase failed attempts or silently restart this loop. Section 4 binds
all 20 native reports using repeated `--vitest` arguments; retain the
exit/debug receipts and update the register with actual evidence.

## 3. Configured build, budgets and e2e partitions

Load only the owner's reviewed **public Production** values into the local
build environment: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, and
`VITE_FIREBASE_REQUIRED=true`. Do not guess those values. No admin credential
belongs in a Vite variable. Do not copy environment files into the deployment
stage. App Check stays at the reviewed Production setting.

```powershell
Remove-Item Env:VITE_USE_FIREBASE_EMULATORS, Env:PLAY100_TEST_BUILD, Env:DEBUG -ErrorAction SilentlyContinue
$env:VITE_FIREBASE_REQUIRED = 'true'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Configured build failed' }
Invoke-RecordedCheck csp { npm run check:csp }
Invoke-RecordedCheck budget-check { npm run check:budgets -- --json "$evidence\budgets.json" }
$env:PLAY100_TEST_BUILD = 'production'
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = "$evidence\e2e-production.json"
$filmCase = 'optional films stay unloaded until Watch, play and seek natively, switch without overlap and restore focus'
npm run test:e2e -- --reporter=list,json --retries=0 --grep-invert "$filmCase"
if ($LASTEXITCODE -ne 0) { throw 'Production e2e failed' }
$env:PLAY100_TEST_BUILD = 'development'
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = "$evidence\e2e-development.json"
npm run test:e2e -- --reporter=list,json
if ($LASTEXITCODE -ne 0) { throw 'Development e2e failed' }
Remove-Item Env:PLAY100_TEST_BUILD, Env:PLAYWRIGHT_JSON_OUTPUT_NAME
```

Each config starts its own strict server on 4187. Stop any other server first;
never adopt a stale server. Preserve `dist` and its environment after this build.
Any offline-build expansion must use a separate build/evidence directory and
manifest; never describe it as this configured candidate.

The production command deliberately excludes the native film case. Run and
record the [isolated film partition](#isolated-flake-01-partition) as well before
calling these diagnostic commands release coverage. `release:gate` handles its
two-project invocation, immutable attempt paths and one-rerun limit. For a lean
run, use `tests/films.spec.ts --grep "$filmCase"` with `--retries=0`, distinct
report/output paths for each attempt, and both desktop/mobile projects; retain
the two passing selected cases and any first failed attempt in the lean index.

**Browser-floor smoke.** The partitions above run current Chromium only. The
floor smoke (`tests/floor-smoke.spec.ts`, `playwright.floor.config.ts`) runs the
flows an older engine breaks first on Firefox, WebKit and, when
`PLAY100_FLOOR_CHROMIUM` names its `chrome.exe`, an old Chromium near the
README floor (Chrome 94). Each test also removes `URLSearchParams.prototype.size`.
It covers a game detail opened through its link (`?game=`), Discover filters and
paging keeping the query, the My games tabs, the outdated-browser boot notice and,
on a configured build, the Google sign-in return path. It is never part of
`test:e2e`. Install the two engines once, then run it against this same build
(`PLAY100_TEST_BUILD` unset or `production`):

```powershell
npx --no-install playwright install firefox webkit
$env:PLAY100_FLOOR_CHROMIUM = '<path to an old Chromium chrome.exe>'  # optional
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = "$evidence\e2e-floor.json"
npm run test:floor -- --reporter=list,json
if ($LASTEXITCODE -ne 0) { throw 'Floor smoke failed' }
Remove-Item Env:PLAYWRIGHT_JSON_OUTPUT_NAME, Env:PLAY100_FLOOR_CHROMIUM -ErrorAction SilentlyContinue
```

Without `PLAY100_FLOOR_CHROMIUM` this standalone command runs only
`floor-firefox` and `floor-webkit`. That is partial coverage, not the full
`release:gate` floor partition, which requires all three engines and all 15
configured cases with no skips.

For cloud-UI use three terminals in this **same checkout**. Terminal A:

```powershell
npx --no-install firebase emulators:start --project demo-play100 --only auth,firestore
```

Terminal B (only this shell gets the emulator flag; never use this build for
production):

```powershell
$env:VITE_USE_FIREBASE_EMULATORS = 'true'
npm run dev -- --mode cloud-test --host 127.0.0.1 --port 4187 --strictPort
```

Terminal C, with `$evidence` set to the same external directory, first
allocates the six-person comparison fixture, then runs the gate with it:

```powershell
Remove-Item Env:PLAY100_COMPARE_ORIGIN -ErrorAction SilentlyContinue
$env:PLAY100_COMPARE_FIXTURE = "$evidence\compare-fixture.json"
npx --no-install playwright test --config playwright.compare-fixture.config.ts
if ($LASTEXITCODE -ne 0) { throw 'Comparison fixture allocation failed' }
$env:PLAY100_RELEASE_GATE = '1'
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = "$evidence\cloud-ui.json"
npx --no-install playwright test --config playwright.cloud.config.ts --reporter=list,json
if ($LASTEXITCODE -ne 0) { throw 'Cloud-UI gate failed' }
Remove-Item Env:PLAYWRIGHT_JSON_OUTPUT_NAME, Env:PLAY100_RELEASE_GATE, Env:PLAY100_COMPARE_FIXTURE
```

The allocation creates six new synthetic, verified accounts in these emulators
through the 4187 app: an owner, four friends who share automatically, one legacy
friend who shares a selected ranking, and the owner's two- and six-person
groups. It takes several minutes, refuses to reuse or overwrite an existing
manifest, and records only labels, synthetic emails, UIDs and routes, never a
password or token. Keep Terminal A running until the gate finishes: restarting
the emulators discards the fixture, so allocate again into a new manifest path.
With `PLAY100_RELEASE_GATE` set, `compare-orientation.spec.ts` fails instead of
skipping when `PLAY100_COMPARE_FIXTURE` is missing, so the gate cannot pass
without its six cases; ordinary runs without these variables still skip them.
Expect no compare-orientation skip on desktop and one on mobile, whose
single-matrix pixel case runs only on desktop.

The configuration runs one worker, which the emulator's shared state needs:
`security-migration.spec.ts` and `cancelled-registration.spec.ts` load Firestore
rules for the whole `demo-play100` project. A faster run with `--workers=2` or
more skips those `@emulator-rules` cases before they load anything, so cover
them in a separate pass: `--workers=2 --grep-invert @emulator-rules`, then
`--workers=1 --grep @emulator-rules`. With `PLAY100_RELEASE_GATE` set they fail
instead of skipping.

The gate's Google redirect cases (`identity.spec.ts`, `review-repairs.spec.ts`
and `strict-style-csp.spec.ts`) use a controlled provider fixture,
`tests-cloud-ui/google-provider-fixture.ts`, so no public host decides them. On
a Google redirect, the Auth emulator's sign-in page loads assets from unpkg.com
and fonts.googleapis.com. On the return, Firebase Auth and the emulator's
helper iframe both load Google's loader script,
`https://apis.google.com/js/api.js`. The fixture serves empty stand-ins for
those assets and a local stand-in for the loader, and it refuses any other
request to a host outside this machine. The stand-in styles the helper iframe
through the CSS object model, so the gate's strict-style case checks the app
and Firebase Auth, not Google's own iframe code. A loader that never answers is
a gate case too: Firebase Auth gives it no timeout of its own, so the Account
stops at its 45-second restoration bound. It then says online tools couldn't
open, keeps the device library usable, and its reload shows the sign-in panel
without the loader.

The real Google service is a separately named check, outside the release gate.
It repeats the redirect-and-Back case and the strict-style Google case through
Google's own loader and iframe code. Run it in Terminal C with the same servers:

```powershell
$env:PLAY100_GOOGLE_LIVE = '1'
npx --no-install playwright test --config playwright.cloud.config.ts tests-cloud-ui/google-live.spec.ts
Remove-Item Env:PLAY100_GOOGLE_LIVE
```

The config includes this spec only with `PLAY100_GOOGLE_LIVE=1`, and never while
`PLAY100_RELEASE_GATE` is set. Classify a failure from its failed assertion,
network trace and CSP evidence; a timeout alone does not establish an external
outage. A verified external-availability failure, where Google's loader or
hosts did not answer and no application failure caused the block, is recorded
as an incomplete live check and does not block the deterministic release gate.
Once Google answers, a failed same-tab return, account UI, library-preservation,
identity, reauthentication, CSP or deletion assertion is an application or
compatibility regression to investigate before acceptance, not an availability
waiver. Unclassified failures also require investigation before acceptance.
Keep live external dependencies outside the deterministic gate. The real
sign-in, link and reauthentication smoke on production remains a separate owner
action (see [releases.md](releases.md#pending-owner-actions)).

Global setup of both configs seeds only the demo emulators and verifies
cloud-test mode. Stop the servers using Ctrl+C in their own terminals. Record
both projects' outcomes, including skips. Never point the emulator suite at
production.

### Offline guest-navigation characterization

Run `tests/root-navigation-guards.spec.ts` as a required, separate offline
characterization partition. It characterizes guest navigation guards on the
offline header: configured builds contain `site-header-online` and skip the
spec, and the development partition does not select it. Expect **36 tests
across desktop and mobile**, all passed, with no skips; retain failures and
investigate any count change rather than accepting an all-skipped report.
This is a gate definition, not a claim that these commands have been executed.

Use a **new PowerShell terminal**, the pinned Node 24.21.0 installation and its
bundled npm, and a separate clean worktree of the **same candidate SHA**.
Stop other test servers before using port 4187. Set `$checkout` to the
configured checkout from §1 and `$release` to that same full reviewed SHA.
Choose new paths below. Here `$evidence` deliberately names the offline
evidence directory, not the configured candidate's directory.

```powershell
$ErrorActionPreference = 'Stop'
$offlineCheckout = 'C:\release\play100-offline-UNIQUE-RELEASE'
$evidence = 'C:\release\evidence-UNIQUE-RELEASE-offline'
git -C $checkout worktree add --detach $offlineCheckout $release
if ($LASTEXITCODE -ne 0) { throw 'Offline worktree creation failed' }
Set-Location $offlineCheckout
if ((git rev-parse HEAD) -ne $release) { throw 'Wrong offline source commit' }
if (git status --porcelain) { throw 'Dirty offline checkout' }
New-Item -ItemType Directory $evidence -ErrorAction Stop | Out-Null
if ((node -p "process.version") -ne 'v24.21.0') { throw 'Use Node 24.21.0 and its bundled npm' }
npm --version
Get-ChildItem Env:VITE_FIREBASE_* | Remove-Item
Remove-Item Env:VITE_FIREBASE_REQUIRED, Env:VITE_USE_FIREBASE_EMULATORS, Env:DEBUG, Env:PLAY100_BASE_URL, Env:PLAY100_ALLOW_ONLY, Env:PLAY100_REUSE_SERVER, Env:PLAY100_TEST_BUILD, Env:PLAYWRIGHT_JSON_OUTPUT_NAME -ErrorAction SilentlyContinue
foreach ($file in '.env', '.env.local', '.env.production', '.env.production.local') {
  if (Test-Path $file) { throw 'Offline worktree must not load environment files; do not copy configured env files' }
}
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Offline install failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Offline build failed' }
$env:PLAY100_TEST_BUILD = 'production'
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = "$evidence\e2e-offline-root-navigation.json"
npx playwright test tests/root-navigation-guards.spec.ts --reporter=list,json
if ($LASTEXITCODE -ne 0) { throw 'Offline root-navigation characterization failed' }
Remove-Item Env:PLAY100_TEST_BUILD, Env:PLAYWRIGHT_JSON_OUTPUT_NAME
npm test -- --maxWorkers=1 --reporter=default --reporter=json --outputFile="$evidence\unit-browser-offline.json"
if ($LASTEXITCODE -ne 0) { throw 'Offline unit/browser evidence failed' }
npm run release:manifest -- "$evidence\manifest-offline.json" --vitest "$evidence\unit-browser-offline.json" --playwright "$evidence\e2e-offline-root-navigation.json"
if ($LASTEXITCODE -ne 0) { throw 'Offline manifest failed' }
```

Keep all `VITE_FIREBASE_*` variables, including `VITE_FIREBASE_REQUIRED`, absent
for this build and its manifest; the emulator flag must also be absent. Do not
copy or modify the configured `dist`. The additional unit/browser run supplies
the fresh Vitest report required alongside Playwright by `release:manifest`.
Retain the offline manifest, native reports, actual runtime and command exits
as a separately labelled evidence packet. The source SHA is the candidate's,
but the offline configuration and artifact hashes identify a different build.
Do not add this report to the configured manifest's report list or claim it
tested the configured candidate. Return to the original configured shell and
its unchanged environment, checkout, `dist` and `$evidence` for §4.

### Candidate CI runs

[`.github/workflows/candidate-ci.yml`](../.github/workflows/candidate-ci.yml)
runs one suite on a GitHub-hosted `ubuntu-24.04` runner against an exact
commit. It only runs on `workflow_dispatch`: nothing triggers it on push, and it
never deploys. Use it for loops and Linux cells that would otherwise occupy the
release machine.

**What a run proves.** The named specs passed, with zero retries and
`--forbid-only`, at the dispatched 40-character SHA, on Linux, the runner image
and the browser that `identity.json` records. The workflow checks out that SHA,
confirms `HEAD` and a clean tree, runs `npm ci` on Node 24.21.0 and copies the
gate's builds and environment:

- `e2e-prod` and `lighthouse` use the configured build (`VITE_FIREBASE_REQUIRED=true`
  and the public `VITE_FIREBASE_*` and `VITE_SITE_URL` repository variables);
- `e2e-offline` uses a build with every `VITE_FIREBASE_*` variable absent;
- `e2e-dev` uses the configured development server; `playwright.config.ts` then
  matches only its source-fixture specs (`menu.spec.ts`, `public-browsing.spec.ts`
  and the rest of that list), and other specs report "No tests found";
- `e2e-dev` and `e2e-offline` run headed under Xvfb. In headless Linux
  Chromium the tab that a modified click opens sometimes stalls before
  Playwright sees it: `menu.spec.ts` `:412` and `:532` on the dev server, and
  `root-navigation-guards.spec.ts` `:277` on the offline build (mobile: 3 of 10
  headless iterations failed in run 36968462436; 180 of 180 passed headed in
  36968465330). Disabling background throttling does not help. A Playwright
  invocation has one browser mode, so the whole suite runs headed; a full
  mobile offline pass failed the same tests headless and headed, apart from
  `:277` (36971706327, 36971709266), and took 14.5 rather than 12.3 minutes.
  `e2e-prod` stays headless: headed desktop added 33 motion, drag and
  breakpoint failures and took 35 rather than 24 minutes (36971172335 against
  36971170036). The `browser_env` input overrides this (`default`,
  `unthrottled`, `xvfb-headed`), and `identity.json` records the value used as
  `browserEnv`;
- `cloud-rules` and `cloud-ui` use Java 21 and the pinned `firebase-tools`
  emulators (`demo-play100`, auth and Firestore). `cloud-rules` starts a fresh
  `emulators:exec` for each repeat, as the convergence loop does. `cloud-ui`
  serves `vite --mode cloud-test` on 4187 and allocates the compare fixture
  first when the specs include `compare-orientation`.

Production builds are served by `scripts/low-end-profile.ts`, which applies
`vercel.json` headers and rewrites over HTTPS. `lighthouse` runs Lighthouse
12.8.2 (pinned by `.github/candidate-ci/lighthouse/package-lock.json`) with
three mobile and three desktop runs in each of two cells: `linux-liberation`
(the runner's fonts) and `linux-dejavu` (a fontconfig with only
`/usr/share/fonts/truetype/dejavu`, which fails the run if any other family is
visible). It writes the JSON and HTML reports, `fonts-<cell>.txt` and
`summary.json` with per-run scores and medians.

Each run uploads an evidence artifact, `candidate-ci-<suite>-<sha>-<run>-<attempt>`, for
30 days. It holds the Playwright JSON and JUnit reports or the per-iteration
Vitest reports, the console log, and the traces and `error-context.md` files of
failures. It also holds the emulator debug logs and `identity.json`, which records:

- commit, tree, the requested SHA and the inputs;
- the `package-lock.json` and built `dist/index.html` SHA-256;
- the runner image (`ImageOS`, `ImageVersion`), kernel, Node, npm, Java (cloud
  suites), Playwright, Vitest, firebase-tools, Lighthouse and Chromium versions;
- the run URL and the workflow commit;
- `fonts`: `fc-match sans-serif` and `serif`, and each Lighthouse font cell;
- `files`: the POSIX path (relative to the artifact root), bytes and SHA-256 of
  every other uploaded file. It is written last, so a detached report can be
  matched to its run.

When a test fails, the run also uploads a small `failures-<suite>-<sha>-<run>-<attempt>`
artifact for quick diagnosis: `failures.json` (each failed attempt's title,
`file:line`, project, repeat index, status and first error) and every failed
Playwright attempt's `error-context.md` and screenshots, without traces or
videos. It is a convenience copy outside `identity.json`'s `files`; cite the
full artifact as evidence. Fetch it with
`gh run download <run> --repo LeulTew/play-100 -p 'failures-*'`.

**What it does not prove.** A run is not a gate receipt. It does not replace
`npm run release:gate`, §3, the manifest or any manual gate. It runs one suite
on Linux Chromium only, with no Chrome channel, Windows or macOS fonts, WebKit,
real devices or deployment checks. Its builds are not the release `dist`: a CI
report counts in a lean manifest only for the Linux checks listed below, through
`npm run ci:collect`, and never in place of a local row the gate must record. Cite the run URL and
`identity.json`, check that `commit` equals the candidate, and record failures
as evidence (the `docs/intermittents.md` rows included); never re-dispatch until
green.

Dispatch from a branch that carries the workflow, with the full SHA. `specs` is
a space-separated path list, `project` is `desktop`, `mobile` or `both`, and
`repeat` is passed to `--repeat-each` (for `cloud-rules`, the count of fresh
emulator runs). `workers` overrides the suite default (3 for `e2e-*` suites, as in the local gate; 1 for
cloud suites), and the optional `grep` is passed as `--grep` or `-t`.

```bash
sha=FULL_40_CHARACTER_SHA
ref=BRANCH_WITH_THE_WORKFLOW
gh workflow run candidate-ci.yml --ref "$ref" -f sha="$sha" -f suite=e2e-prod -f project=both -f specs='tests/frequent-action-focus.spec.ts' -f repeat=3
gh workflow run candidate-ci.yml --ref "$ref" -f sha="$sha" -f suite=e2e-dev -f project=desktop -f specs='tests/menu.spec.ts' -f repeat=3
gh workflow run candidate-ci.yml --ref "$ref" -f sha="$sha" -f suite=e2e-offline -f project=both -f specs='tests/root-navigation-guards.spec.ts'
gh workflow run candidate-ci.yml --ref "$ref" -f sha="$sha" -f suite=cloud-rules -f specs='tests-cloud/friend-all.test.ts' -f repeat=20
gh workflow run candidate-ci.yml --ref "$ref" -f sha="$sha" -f suite=cloud-ui -f project=desktop -f specs='tests-cloud-ui/identity.spec.ts' -f grep='cross-tab identity change' -f repeat=20
gh workflow run candidate-ci.yml --ref "$ref" -f sha="$sha" -f suite=lighthouse
gh run download RUN_ID
```

#### Final-tip plan, dispatch and collect

[`scripts/candidate-ci/plan.json`](../scripts/candidate-ci/plan.json) lists the
full final-tip set, one entry per dispatch: `checks`, `csp-refresh`, `floor` and
`lighthouse`; full `e2e-prod`, `e2e-dev` and `e2e-offline` on both projects;
FLAKE-01 alone; every open `docs/intermittents.md` row at its loop count; the
R24 focus specs ×20; `cloud-rules` full ×3; `cloud-ui` full on each project; and
the cloud-ui loops. Long loops are split per project so no job nears its
180-minute timeout. Each entry has an `id`, a `purpose`, the workflow inputs
(`suite`, `specs`, `project`, `repeat`, `workers`, `grep`, `browserEnv`) and
optionally `lean` (the lean check it supplies) and `expectedPassed`. Edit the
plan when `docs/intermittents.md` changes.

```bash
npm run ci:dispatch -- --sha "$sha" --dry-run            # print each gh command
npm run ci:dispatch -- --sha "$sha" --out ../ci/runs.json # dispatch and record the runs
npm run ci:dispatch -- --sha "$sha" --only floor,lighthouse --out ../ci/runs-small.json
npm run ci:collect -- --runs ../ci/runs.json --out ../ci/evidence --wait
```

`ci:dispatch` dispatches from `--ref` (default `leultew-r24-candidate-ci`; it
must carry the workflow) and passes each entry a unique `request` id,
`<entry>.<sha8>.<nonce>`. The workflow puts it in the run name and in
`identity.json` as `requestId`. Dispatch replies are unordered and carry no run
id, so the script matches each run by its exact name and refuses ambiguity;
`ci:collect` then confirms the match from the artifact itself. `runs.json`
records each entry, request id, run id and URL.

Both tools poll GitHub no more than once every five minutes: `--poll-seconds`
defaults to 300 and anything lower is refused. `ci:dispatch` makes two API calls
per entry (workflow lookup and dispatch), then waits 300 s and matches every run
from one paged `gh run list` (one page per 100 runs; `--match-timeout`, default
1800 s, bounds the retries). `ci:collect --wait` checks every run with the same
single `gh run list` per poll, falling back to `gh run view` only for runs
outside that page, and downloads each artifact once, after completion (about
two calls per run). The dry run prints this budget.

`ci:collect` refuses an output inside the checkout and, with `--wait`, polls
until every run completes. For each run it downloads the artifact into
`<out>/<entry>/` and verifies `identity.json`: `commit` and `requestedSha` equal
the SHA, `tree` equals that commit's tree (when the commit is in the local
clone) and is the same for every run, `requestId` and `workflow.run` name this
run, the recorded inputs equal the entry, and `files[]` matches the downloaded
files exactly, by path, bytes and SHA-256, in both directions. Any mismatch
stops collection. It then writes:

- `summary.md` and `summary.json`: entry, suite, project, spec, repeat, passed,
  failed, skipped, result and run URL. An entry passes only if its run
  succeeded, it passed at least one test, nothing failed or was skipped, and the
  count equals `expectedPassed` when set. Vitest counts the tests a `-t` filter
  deselects as skipped, so a `cloud-rules` entry with `grep` tolerates skips.
  Playwright's `flaky` counts as failed;
  `lighthouse` has no counts and passes on the run's conclusion. Hidden files
  (Playwright's `test-results/.last-run.json`) are not uploaded or digested.
- `index.json`: a partial lean evidence index (`partial: true`) for
  `scripts/release-lean-manifest.ts`. Its rows are `e2e-production`,
  `e2e-development`, `e2e-offline`, `films-download` (attempt 1),
  `floor-smoke`, `cloud-rules`, `cloud-ui-desktop` and `cloud-ui-mobile`. Each
  points at the run's report and its `identity.json`, which the manifest's CI
  provenance check verifies. A failed run's row is omitted and listed under
  `omitted`, except FLAKE-01's, which is kept as `failed` so a local second
  attempt can follow it. `runs` repeats the summary.

The command exits 1 when any entry failed, after writing the files.

Caveats:

- The index is partial: the manifest still needs every local row, so merge the
  CI rows into the gate's index, keeping the `file` and `identity` paths
  relative to the merged index's directory.
- The CI `e2e-prod` full run includes the FLAKE-01 case, which the gate runs
  separately; a FLAKE-01 failure there drops the `e2e-production` row.
- `checks`, `csp-refresh`, `lighthouse` and the loops appear only in the summary.
  They are Linux evidence for the reviewers, not lean rows.

These runs do not replace `npm run release:gate`, §3 or any manual gate.

## 4. Manifest and complete evidence packet

Back in the configured-build shell, ensure the same public Production
environment and unchanged `dist`, lockfile and clean source. Create
`decisions.json` in `$evidence` with both arrays:
`{"carryForward":[],"waivers":[]}`. Replace empty arrays only with the explicit
reasoned records defined in [the manifest documentation](../README.md#portable-local-release-evidence).

The native-report command below illustrates collection of the named partitions,
not a complete release certificate. Use the full runner's generated manifests
or the complete [lean index](#lean-release-mode) to bind the isolated film
attempts, floor smoke, APB2 and every other required receipt as well.

```powershell
if (git status --porcelain) { throw 'Commit or investigate source changes before release' }
$loopReports = 1..20 | ForEach-Object { '--vitest'; "$evidence\friend-default-$_.json" }
npm run release:manifest -- "$evidence\manifest.json" --vitest "$evidence\unit-browser.json" --vitest-cloud "$evidence\cloud.json" --cloud-rules "$evidence\tested-firestore.rules" --playwright "$evidence\e2e-production.json" --playwright "$evidence\e2e-development.json" --playwright "$evidence\cloud-ui.json" --receipt "types=$evidence\types.json" --receipt "functions-types=$evidence\functions-types.json" --receipt "lint=$evidence\lint.json" --receipt "data=$evidence\data.json" --receipt "discovery=$evidence\discovery.json" --receipt "csp=$evidence\csp.json" --receipt "budget-check=$evidence\budget-check.json" --receipt "budgets=$evidence\budgets.json" --decisions "$evidence\decisions.json" @loopReports
if ($LASTEXITCODE -ne 0) { throw 'Manifest failed' }
```

Label the reports by partition: development/cloud-UI test source modules, not
the production `dist`. The manifest hashes cloud Vitest results and the tested
rules snapshot, which must match the candidate's `firestore.rules`. Repeated
`--vitest` already supports additional Vitest reports; `--vitest-cloud` labels
the rules partition and requires `--cloud-rules`. Named `--receipt NAME=FILE`
inputs bind static, budget and CSP evidence. JSON receipts record top-level
`exitCode` or `ExitCode` when present (nonzero or malformed codes are rejected);
text logs and JSON without a code record `null`, not an inferred pass. Retain
the hashed logs referenced by the command receipts, audits, manual decisions
and any investigation of failed attempts beside the native reports. These
hashes bind operator-supplied evidence, not proof that a runner used a snapshot.
The manifest records collector
runtime and current artifact hashes, not retrospective proof of every runner's
SHA/environment. It neither approves waivers nor certifies full coverage.

## 5. Clean export and protected candidate

Before staging, confirm the remote reviewed branch/PR and `origin/main` identify
the approved release; never force a push. If a fast-forward is required, the
owner separately authorizes it and reads back `git ls-remote origin refs/heads/main`.
Source publication is not production promotion.

In PowerShell, capture the rollback target **before** deploying. Use the existing
owner token without echoing it. These helpers return only selected identity
fields; never serialize an entire project response, which may include
protection credentials.

```powershell
$project = 'prj_Mp6j1moxlfNXGV8nCcAC1tTDiCP7'
$alias = 'play-100-collection.vercel.app'
function Read-Vercel([string]$route) {
  if (!$env:VERCEL_TOKEN -or !$env:VERCEL_TEAM_ID) { throw 'Owner API environment missing' }
  Invoke-RestMethod "https://api.vercel.com${route}?teamId=$($env:VERCEL_TEAM_ID)" -Headers @{ Authorization = "Bearer $env:VERCEL_TOKEN" }
}
function Confirm-Alias([string]$expected) {
  $value = Read-Vercel "/v4/aliases/$alias"
  $id = if ($value.deployment.id) { $value.deployment.id } else { $value.deployment.uid }
  if ($value.projectId -ne $project -or $id -ne $expected) { throw 'Alias readback mismatch' }
  [pscustomobject]@{ checkedAt = [DateTime]::UtcNow.ToString('o'); project = $project; deployment = $id }
}
$before = Read-Vercel "/v4/aliases/$alias"
if ($before.projectId -ne $project) { throw 'Wrong alias project' }
$previous = if ($before.deployment.id) { $before.deployment.id } else { $before.deployment.uid }
if ($previous -notmatch '^dpl_[A-Za-z0-9]+$') { throw 'Missing rollback target' }
Confirm-Alias $previous | ConvertTo-Json | Set-Content "$evidence\alias-before-deploy.json"
```

Preserve that deployment's clean source, manifest, index and verification
packet for rollback. If they are unavailable, resolve that gap before promotion.

Create a **new empty** export from the checkout, not from its working files:

```powershell
$stage = 'C:\release\stage-UNIQUE-RELEASE'
New-Item -ItemType Directory $stage -ErrorAction Stop | Out-Null
git archive --format=tar --output="$evidence\source.tar" $release
if ($LASTEXITCODE -ne 0) { throw 'Archive failed' }
tar -xf "$evidence\source.tar" -C $stage
if ($LASTEXITCODE -ne 0) { throw 'Export failed' }
New-Item -ItemType Directory "$stage\.vercel" | Out-Null
Copy-Item 'C:\owner-approved\project.json' "$stage\.vercel\project.json"
$link = Get-Content "$stage\.vercel\project.json" -Raw | ConvertFrom-Json
if ($link.projectId -ne 'prj_Mp6j1moxlfNXGV8nCcAC1tTDiCP7' -or $link.orgId -ne $env:VERCEL_TEAM_ID) { throw 'Wrong project/team' }
```

The only added stage file is `.vercel/project.json`; no `.env`, auth files,
`node_modules` or local `dist`. Vercel installs/builds remotely using Production
configuration. Do not use `--prebuilt`. Open WSL Ubuntu-24.04 fish in this export
(convert the Windows path with `wslpath`); set only the non-secret placeholders:

```fish
cd /mnt/c/release/stage-UNIQUE-RELEASE
set -l release FULL_REVIEWED_COMMIT_SHA
set -l team $VERCEL_TEAM_SLUG
test -n "$team"; or exit 1
npx --yes vercel@59.16.0 deploy --prod --skip-domain --archive=tgz --yes --meta sourceCommit=$release --scope $team
or exit 1
```

Keep the returned URL private. `--skip-domain` must leave the production alias
unchanged. Record the returned `dpl_...` ID after `inspect`, and review remote
client/Functions compilation. No automatic promotion follows deployment.

## 6. API readback and candidate verification

Return to the operator PowerShell shell from step 5, keeping its `$previous`
and API helpers. Inspect the candidate and prove the alias has not moved:

```powershell
$candidate = 'VERIFIED_CANDIDATE_DPL_ID'
$deployment = Read-Vercel "/v13/deployments/$candidate"
if ($deployment.projectId -ne $project -or $deployment.readyState -ne 'READY' -or $deployment.target -ne 'production' -or $deployment.meta.sourceCommit -ne $release) { throw 'Candidate identity mismatch' }
$candidateUrl = "https://$($deployment.url)"
Confirm-Alias $previous | ConvertTo-Json | Set-Content "$evidence\alias-before.json"
Set-Location $checkout
npm run release:verify -- --url $candidateUrl --bypass-env VERCEL_AUTOMATION_BYPASS_SECRET --expect-index dist/index.html --json "$evidence\candidate-verify.json"
if ($LASTEXITCODE -ne 0) { throw 'Candidate verification failed; do not promote' }
```

Stop if another release moved production. Local vs remote index mismatch
is a **hold**, not permission to remove `--expect-index`: reconcile environment,
dependencies, platform and remote build evidence before promotion.

The verifier uses Node fetch, manual redirects, 60-second request deadlines
and an 8 MiB response cap. It does not execute JavaScript or certify UI/Auth.
It ports the Release 2 HTTP checks, consolidating repeated requests/checks,
and adds the current headers, removed Google asset, PWA version and shell
guards. Since R24 it also covers the auth area as Vercel itself serves it:
each helper document reports CSP violations to `/api/csp-report`,
`/__/auth/unknown` answers 404 with the full main document headers, and
`/__/auth/handler.js` answers 200 JavaScript with its own rule's headers and
none of the main document's. It also fails a main CSP that lists
`https://accounts.google.com` in frame-src. It is not itself the historical
“42/42”: deployment/alias identity
checks remain these operator readbacks. An omitted `--expect-index` is recorded
as `compared: false`, not evidence of build identity. No raw bodies, cookies,
nonce values or bypass credentials enter the receipt. A new `--json` path is
required; existing evidence is never overwritten.

## 7. Promote, read back and verify public production

Only after reviewed gate/manual decisions and candidate verification, in the
same linked export's fish shell:

```fish
set -l candidate VERIFIED_CANDIDATE_DPL_ID
npx --yes vercel@59.16.0 inspect $candidate --scope $team
or exit 1
```

In PowerShell run `Confirm-Alias $previous` once more immediately before the
owner approves the following mutation, then continue in the fish shell:

```fish
npx --yes vercel@59.16.0 promote $candidate --scope $team --yes --timeout 3m
or exit 1
npx --yes vercel@59.16.0 inspect play-100-collection.vercel.app --scope $team
or exit 1
```

Record that inspect shows the candidate ID. A timeout may leave promotion
running: read `promote status` and the alias before deciding what to do.
Let the edge settle as described in [§9](#9-rollback-readback-and-undo).
Then in PowerShell, without a bypass on the public alias:

```powershell
Confirm-Alias $candidate | ConvertTo-Json | Set-Content "$evidence\alias-promoted.json"
npm run release:verify -- --url https://play-100-collection.vercel.app --expect-index dist/index.html --json "$evidence\production-verify.json"
if ($LASTEXITCODE -ne 0) { throw 'Production verification failed; hold and evaluate rollback' }
```

Compare public and candidate index/entry/worker hashes, CSP-header hashes and
PWA versions in the two receipts. Record the real Google smoke. A challenge or
unexpected status is a failure, never a reason to bypass the public test.

## 8. Two-version service-worker probe

Before promotion retain an open, prepared old-version tab, its worker version,
document version and a harmless unsaved test draft. After promotion verify a
second fresh tab, the old tab's retained resources, update refusal with dirty
work/multiple windows, and guarded update after saving and closing the other
window; check offline reload afterward. Do not clear storage to manufacture a
pass. Follow [manual PWA checks](pwa.md#manual-release-checks).

**Release 3 record:** the executed steps, exact refusal messages, versions and
receipt are in the [Release 3 ledger entry](releases.md#release-3-2026-09-26).
That run used headless Chromium with a persistent profile. It is not
physical-device evidence, so record devices or an explicit waiver.

## 9. Rollback, readback and undo

First apply the **R22 rollback floor** above. In the source checkout, verify the
recorded previous deployment's exact source commit descends from the integrated
R22 barrier commit; an unavailable or unproven source is not an eligible target:

```powershell
$r22Floor = 'FULL_INTEGRATED_R22_BARRIER_COMMIT'
$previousSource = 'RECORDED_PREVIOUS_DEPLOYMENT_SOURCE_COMMIT'
git merge-base --is-ancestor $r22Floor $previousSource
if ($LASTEXITCODE -ne 0) { throw 'Unsafe pre-R22 rollback: use an approved R22-or-later fix-forward' }
```

The rollback drill must use only an eligible R22-or-later target and include
an already-upgraded version-3 guest and account library: verify both remain
readable and that retired writers still cannot save, restore or delete.
Do not drill a Release 6 rollback against upgraded visitor data.

Rollback requires explicit owner approval and the recorded previous production
deployment. On Hobby, `vercel rollback` permits only the **immediately previous**
production deployment. Do not substitute an older ID or force an unsupported
rollback. In the linked export's fish shell:

```fish
set -l previous RECORDED_PREVIOUS_PRODUCTION_DPL_ID
npx --yes vercel@59.16.0 rollback $previous --scope $team --timeout 3m
or exit 1
npx --yes vercel@59.16.0 rollback status --scope $team --timeout 3m
or exit 1
npx --yes vercel@59.16.0 inspect play-100-collection.vercel.app --scope $team
or exit 1
```

Let the edge settle before each readback that follows `rollback` or `promote`.
Propagation is not instant: in the Release 3 drill, `/` still returned the
previous index 4.3 s after the first new response. Poll `/` about once a second
until five consecutive responses match the expected index, then read back and
verify. A stale response before those five matches is propagation, not a failed
mutation.

In PowerShell, confirm the previous ID and rerun the verifier from that release's
preserved clean checkout (so its `vercel.json` matches), using its index:

```powershell
Confirm-Alias $previous | ConvertTo-Json | Set-Content "$evidence\alias-rolled-back.json"
Set-Location 'C:\release\previous-source'
npm run release:verify -- --url https://play-100-collection.vercel.app --expect-index dist/index.html --json "$evidence\rollback-verify.json"
if ($LASTEXITCODE -ne 0) { throw 'Rollback verification failed; escalate' }
```

If the previous release predates `release:verify`, run the current verifier
against that previous release only after explicitly accounting for different
headers/HTML contracts; do not claim a pass by changing current pins. Preserve
the prior release's own verification procedure and packet before promotion.

After fixing the cause, undo rollback only with fresh approval and verification:

```fish
npx --yes vercel@59.16.0 promote $candidate --scope $team --yes --timeout 3m
or exit 1
npx --yes vercel@59.16.0 inspect play-100-collection.vercel.app --scope $team
or exit 1
```

`promote` re-enables automatic assignment of production domains after rollback.
Read back and verify again, using new receipt filenames:

```powershell
Confirm-Alias $candidate | ConvertTo-Json | Set-Content "$evidence\alias-restored.json"
Set-Location $checkout
npm run release:verify -- --url https://play-100-collection.vercel.app --expect-index dist/index.html --json "$evidence\restored-verify.json"
if ($LASTEXITCODE -ne 0) { throw 'Restored production verification failed; hold' }
```

Retain mutation exit codes, timestamps,
inspect and API readbacks; practice rollback only in an owner-approved window.
See Vercel's [rollback](https://vercel.com/docs/cli/rollback) and
[promote](https://vercel.com/docs/cli/promote) references.

## 10. Record the release

Only after execution, add a ledger entry with commit/tree, PR/main readback,
deployment ID, previous deployment ID, UTC promotion time, index/CSP/worker
hashes, PWA version, gate and verifier counts, failures, manual receipts and
explicit waivers. Record rollback/undo if performed. Release facts belong in
the ledger, not in this runbook, and a pending owner action is complete only
with the owner's readback.

## 11. Daily and post-deploy operational checks

Owner: project owner; check daily and after each authorized production deployment,
and review by 2026-10-02 with the WAF decision or immediately on an abuse signal.

**Automatic alert (owner's choice, 2026-10-01; hourly since R24).** The
`Production alert` workflow (`.github/workflows/production-alert.yml`) runs at
30 minutes past every hour. It requests the home page and the fixed
`/api/operational-probe` once each, without retries or query parameters. If
either fails, it opens one issue titled "Production alert: the production check
failed", labelled `production-check-failed` (it creates the label if needed),
or comments on the open one, and fails the run, so GitHub emails the owner. It
does so only when the failure is new or has changed: each report carries a
hidden state marker, and while the same failure persists the hourly runs only
warn. The next passing run closes the issue. To test the channel, run it
manually with **drill** checked; each drill reports a simulated failure. The
repository is public, so the runs use no Actions quota. GitHub pauses scheduled
workflows after 60 days without repository activity; if that happens, re-enable
the workflow in the Actions tab. The probe caches each result for 15 minutes,
so the hourly calls add at most 24 rounds of its four upstream requests a day.

Anyone can open an issue or comment on this public repository, so the workflow
trusts only its own posts. It uses only an open issue it opened itself, with
the label or one of its alert titles (including the old one, "the daily check
failed"), and reads state markers only from its own issue text and comments.
It locks every alert issue, so only collaborators can comment. GitHub doesn't
let the workflow's own account comment on a locked issue, so the workflow
unlocks the issue for each of its comments and locks it again.

**Client report alerts (R24).** The two report functions push their own alert
to one GitHub issue, labelled `client-report-spike`, when
`PRODUCTION_ALERT_GITHUB_TOKEN` is set (see the
[runbook](security-release-runbook.md#production-alert-token)); without it they
do nothing extra and log nothing extra. Each function instance counts the
reports it accepted over a rolling hour (`api/_lib/production-alert.ts`):
- five client error reports naming one error class and area: a page load sends
  at most four reports, so this needs at least two page loads;
- twenty client error reports of any category, so at least five page loads;
- three CSP violations in main documents, which the policy should never
  produce; three rather than one tolerate a stray extension script. The sign-in
  helper documents' violations are not counted.

The report that reaches a threshold tries to post, and its own 204 waits for
the post: that adds up to 5 s to that one report's response, at most once per
instance per hour. The senders are browser beacons and CSP reports, which don't
wait for the response. The instance then waits an hour before it can try again,
whether the post worked or not. Only the open labelled issue that the token's
owner opened counts, and only the owner's posts on it. A post comments on that
issue, or opens and locks a new one. It is skipped if the owner already posted
that exact text, or if the owner's newest spike post is under an hour old.
Without that hourly wait, every new or scaled-out instance could post once. It
contains the fixed categories and counts, the window and the deployment ID,
never a URL with a query, a user agent or an address. The report's own log line
gains `alert`: `created`, `commented`, `duplicate`, `cooldown` (the owner's
newest spike post is under an hour old), `unlocked` (opened the issue, but
GitHub refused to lock it, with its status in `alertStatus`; the workflow locks
it within the hour), or `failed` with `alertStatus` (the GitHub status, or 0
when the request failed or got no answer within 5 s); a failure is recorded
nowhere else. Counts are per instance and come from anonymous reports, so a
spread-out spike can stay under the thresholds, and forged reports can raise a
false alert. Instances together post about once an hour: two that reach a
threshold within the same second can both post. Admission still bounds each
endpoint. The functions post with the owner's token, and GitHub doesn't notify
people of their own activity, so the hourly workflow acknowledges each new
spike post with one comment and fails that run, which emails the owner. It
reads spike posts only from the owner's issue and posts, and its own
acknowledgements only from its own comments, and keeps the issue locked. It
closes the issue after 24 hours without a new spike. On a spike, open the
deployment's logs and compare the `client-error-count` or `csp-count` lines with
the categories in the issue, as in step 4 below.

The alerts cover availability, the probe's three checks and these report
spikes; the manual checks below still apply.

1. In the Vercel project, open **Settings → Cron Jobs**. Confirm the job is
   enabled and `/api/operational-probe` is scheduled at `0 6 * * *` (UTC; allow
   the plan's scheduling window). A committed cron definition alone is not
   evidence that the deployed job exists or ran.
2. Open the project's **Logs** runtime view, select the production environment
   and current deployment, and filter to `/api/operational-probe`. Check the
   latest invocation's time, HTTP status and structured `operational-probe`
   result. HTTP 503 / `FAIL`, function errors/timeouts or a missing daily run
   need investigation. Check the `auth`, `wikidata` and `freetogame` booleans to
   distinguish helper regressions from provider outages. Cached requests can
   return the same result without another structured log for 15 minutes.
3. After a deploy, request the fixed production `/api/operational-probe` once
   and inspect its status/JSON plus the invocation in Logs; do not add query
   parameters. Investigate failures rather than retrying in a tight loop.
   Confirm release readbacks and the rollback procedure above before attributing
   a fault to the new version; a dependency outage is not proof of an app regression.
4. In Logs, inspect `/api/csp-report` and `/api/client-error-report` for function
   failures and changes in `csp-count` / `client-error-count`. Compare fixed
   categories and the client build fingerprint with the current entry asset,
   not visitor identities. Since R24, `csp-count` rows for the
   `/__/auth/handler` and `/__/auth/iframe` routes come from the sign-in helper
   documents. A rejected body or 429 can be abuse or admission
   pressure; counts are untrusted hints, and absent reports do not prove health.
   Browsers can suppress beacons, and offline or unrecovered startup failures
   may never report. Google sign-in should add no `csp-count`: since R24 the
   main policy frames only its own origin, so a `frame-src` count for
   `https://accounts.google.com`, or any count for `https://apis.google.com`,
   means the policy blocked something sign-in needs (see
   [security](security.md#headers-auth-proxy-and-supply-chain)).

Record UTC, deployment/build identity, last observed probe status, affected
categories and the investigation/rollback decision in the release evidence;
do not copy raw request headers, URLs or private payloads. Runtime-log retention
and availability depend on the hosting plan: review within that window, and
record a missing observation as unknown, not passing. Build logs on deployment
pages are not a substitute for runtime/function logs.

References: [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
and [runtime logs](https://vercel.com/docs/logs/runtime).
