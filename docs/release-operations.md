# Local release operations

This is the procedure, not an executed release receipt. Hosted CI is disabled.
Every native command below must exit 0 before continuing. A deployment marked
Ready is not a passed gate. Stop on an uncertain mutation: inspect its result
before retrying; never repeat a deploy, promotion or rollback blindly.
Keep candidate URLs and raw operator logs private (deployment URLs contain a
team identifier). Publish deployment IDs and redacted evidence in the
[release ledger](releases.md), not credentials or candidate URLs.

## Prerequisites and unresolved manual gates

Use Node **24.x** (`.nvmrc`), npm from that installation, Java 21 for the
emulators, Git, and the installed Playwright browsers (including Chrome for
the Chrome-only suites). Pin Vercel to **59.16.0**, as Release 2 records.
The authorized deployment shell is Ubuntu-24.04 WSL with fish and the existing
Vercel login; local gate examples use PowerShell 7. Do not install a different
CLI version or change project protection to make a check pass.

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
| Firebase rules | Owner publishes reviewed `firestore.rules`; R9 SHA-256 is `9458021a4accb75c5cb8e218a93246d93eeca672d3c867adcf40ba8b18e15f46`. Copy published text back, compare its hash, record publication time and retain the previous rules archive. A later changed rules file requires a new explicit reviewed hash, not reuse of this receipt. |
| Real Google Auth | Production desktop and mobile sign-in, link and reauthentication return signed in without CSP errors; emulator tests cannot certify real credentials, MFA or provider configuration. |
| WAF `api-per-ip` | Review seven days of Log hits; switch Log to 429 **no earlier than 2026-10-02**. Record review, decision and switch time. Do not invent a completed switch or modify the log-only OWASP rules. |
| Device and assistive technology | Physical low-end/mobile and iOS Safari, keyboard and screen-reader journeys, OS installation/launch/uninstall, real multi-window/two-version updates. Record devices and results or explicit waivers. Chromium emulation is not physical-device evidence. |

Use the [security promotion order](security-release-runbook.md#promotion-order)
for the owner operations and [manual PWA checks](pwa.md#manual-release-checks).
Client rollback does not revert Firestore rules, indexes, WAF or private data.

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
if ((node -p "process.versions.node.split('.')[0]") -ne '24') { throw 'Use Node 24' }
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
Node/npm versions. The maintainer must also retain the full-history Gitleaks
scan described in [Quality checks](../README.md#quality-checks).

## 2. Candidate-bound local gate

Keep a command/exit-code log in the private evidence directory; do not use a
transcript when loading credentials. Use a fresh report filename for every
partition or failed attempt. Investigate failures; a green retry does not erase
the first failure. Never use `PLAY100_ALLOW_ONLY` or `PLAY100_REUSE_SERVER`.

```powershell
Remove-Item Env:PLAY100_BASE_URL, Env:PLAY100_ALLOW_ONLY, Env:PLAY100_REUSE_SERVER -ErrorAction SilentlyContinue
npx --no-install tsc -b
if ($LASTEXITCODE -ne 0) { throw 'Types failed' }
npm run typecheck:functions
if ($LASTEXITCODE -ne 0) { throw 'Functions types failed' }
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'Lint failed' }
npm run validate:data
if ($LASTEXITCODE -ne 0) { throw 'Data validation failed' }
npm run validate:discovery
if ($LASTEXITCODE -ne 0) { throw 'Discovery validation failed' }
npm test -- --maxWorkers=1 --reporter=default --reporter=json --outputFile="$evidence\unit-browser.json"
if ($LASTEXITCODE -ne 0) { throw 'Unit/browser gate failed' }
npm run test:cloud
if ($LASTEXITCODE -ne 0) { throw 'Cloud rules gate failed' }
```

Keep the complete `test:cloud` console receipt. That script owns emulator
startup/teardown; do not run the cloud-UI emulators concurrently with it.

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
npm run check:csp
if ($LASTEXITCODE -ne 0) { throw 'CSP failed' }
npm run check:budgets -- --json "$evidence\budgets.json"
if ($LASTEXITCODE -ne 0) { throw 'Budgets failed' }
$env:PLAY100_TEST_BUILD = 'production'
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = "$evidence\e2e-production.json"
npm run test:e2e -- --reporter=list,json
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

Terminal C, with `$evidence` set to the same external directory:

```powershell
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = "$evidence\cloud-ui.json"
npx --no-install playwright test --config playwright.cloud.config.ts --reporter=list,json
if ($LASTEXITCODE -ne 0) { throw 'Cloud-UI gate failed' }
Remove-Item Env:PLAYWRIGHT_JSON_OUTPUT_NAME
```

Global setup seeds only the demo emulators and verifies cloud-test mode. Stop
the servers using Ctrl+C in their own terminals. Record both projects' outcomes,
including skips. Never point the emulator suite at production.

## 4. Manifest and complete evidence packet

Back in the configured-build shell, ensure the same public Production
environment and unchanged `dist`, lockfile and clean source. Create
`decisions.json` in `$evidence` with both arrays:
`{"carryForward":[],"waivers":[]}`. Replace empty arrays only with the explicit
reasoned records defined in [the manifest documentation](../README.md#portable-local-release-evidence).

```powershell
if (git status --porcelain) { throw 'Commit or investigate source changes before release' }
npm run release:manifest -- "$evidence\manifest.json" --vitest "$evidence\unit-browser.json" --playwright "$evidence\e2e-production.json" --playwright "$evidence\e2e-development.json" --playwright "$evidence\cloud-ui.json" --decisions "$evidence\decisions.json"
if ($LASTEXITCODE -ne 0) { throw 'Manifest failed' }
```

Label the reports by partition: development/cloud-UI test source modules, not
the production `dist`. Include cloud rules console/exit receipts, audits,
types/lint/validators, budgets, CSP, manual decisions and any investigation of
failed attempts beside the native reports. The manifest records collector
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
guards. It is not itself the historical “42/42”: deployment/alias identity
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

**Pending procedure/evidence:** the detailed Release 3 two-version probe and its
receipt have not yet been recorded in this base. Link the exact procedure from
the Release 3 ledger once the parent supplies it. Until then this is an explicit
manual hold/waiver, not a claimed executed or reproducible automated campaign.

## 9. Rollback, readback and undo

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
explicit waivers. Record rollback/undo if performed. This runbook intentionally
does **not** add Release 3 facts or mark any pending owner action complete.
