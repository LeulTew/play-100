# Testing and evidence

## Quality checks

See [iPhone Safari smoke](ios-safari.md) for real Mobile Safari simulator
coverage, retained candidate/production results, and physical-device limitations.

For the ordered operator procedure, candidate verification, promotion and
rollback/readback, use [Local release operations](release-operations.md).

`npm run lint` runs `npm run format:check` first, then
`eslint . --max-warnings 0`. Formatting is part of the gate, not an opt-in
check; `npm run format` applies the committed source-only Prettier policy: the
TypeScript and JavaScript sources, and the authored stylesheets under `src/`,
apart from the frozen files `.prettierignore` names with their reasons.

ESLint is type-aware: `typescript-eslint`'s `recommendedTypeChecked` rules run
with the project service, so every TypeScript file is linted against the
tsconfig project that builds it (`no-floating-promises` and
`no-misused-promises` included). Plain JavaScript files, which no project
covers, are linted without type information. Every rule in the set is on,
including the `no-unsafe-*` rules, so no `any` value reaches production code.
`eslint.config.js` lists the few test-only exceptions with their reasons. `tsconfig.node.json`, and the cloud and cloud-UI projects that
extend it, are as strict as the app's.
The supported application runtime is **Node 24.x**, matching the Vercel build
and Functions runtime and `package.json` engines. The release verification
runtime is **exactly Node 24.21.0**, pinned in `.nvmrc`, with that installation's
bundled npm. Use it for the candidate's complete release gate, build, release
tooling and manifest collection. The
[local release operations runbook](release-operations.md) is the single
authoritative procedure for selecting the runtime and collecting evidence.
`release:manifest` records the executing Node and npm versions; it does not
rerun older tests. Do not carry forward an older Node 24 receipt when release
tooling changed. A local gate on a newer Node is separately recorded coverage
expansion, not a replacement for the pinned release gate.

`npm run release:gate` is the committed local release runner; use
`npm run release:gate -- --dry-run` to inspect its ordered plan. The stale CI
workflow was removed. CodeQL, Dependency review and Secret scan remain in
`.github/workflows` but are **disabled by the owner**; nothing runs on pull
requests or pushes. Release gating uses the runner and review:

- unit/browser gate (`npm test`), the cloud emulator suite (`npm run test:cloud`),
  e2e production and development (`npm run test:e2e`) and the cloud-UI suite
  (`tests-cloud-ui`, `playwright.cloud.config.ts`);
- the three-engine floor smoke and the typed APB2 runner hook described in
  [Release operations](release-operations.md); the full gate blocks until that
  committed performance runner is available;
- `tsc -b`, `npm run lint`, `npm run build`, `npm run check:csp` and
  `npm run check:budgets`;
- `npm audit signatures`, followed by `npm audit --json --audit-level=info`
  in both installed checkouts, with native audit reports, exits and lockfile
  digests retained by the runner. Run `npm audit` after each install as well;
- checksum-pinned Gitleaks 8.30.1 over the candidate's full reachable history,
  with the scanned ref, tool version, commit counts and redacted native report.

Prepare the reviewed Gitleaks release archive before the gate and set
`PLAY100_GITLEAKS_ARCHIVE` to its path; the gate verifies its committed SHA-256
before extracting or executing it. See [Release operations](release-operations.md).
The native film download case runs separately under FLAKE-01's one-rerun
exception, retaining both attempts. All other partitions remain zero-retry.
The supported [lean mode](release-operations.md#lean-release-mode) schedules
the required evidence separately and binds it with
`npm run release:manifest -- OUTPUT --lean INDEX.json`; it is not a waiver.
Dependabot's version updates (`.github/dependabot.yml`) still run. They skip
major updates of `@types/node`, which follows the Node 24 runtime, and of
`typescript` until typescript-eslint supports TypeScript 7.

The disabled jobs, for reference if they are re-enabled: SHA-pinned GitHub
Actions with read-only repository access and no deployment credentials.

| Remaining disabled workflow | Checks |
| --- | --- |
| CodeQL | JavaScript/TypeScript analysis without running an application build |
| Dependency review (pull requests) | Moderate-or-higher advisories in runtime, development and unknown dependency scopes; no PR comments |
| Secret scan | Full checked-out Git history with redacted Gitleaks 8.30.1 findings; the pinned release checksum file and archive are SHA-256 verified before the binary is extracted |

`budget-report.json` has a deterministic schema: `sourceCommit` (from
`GITHUB_SHA`, falling back to local `git rev-parse HEAD`), a `dirty` flag for
tracked changes (`git status --porcelain --untracked-files=no`), each enforced
measurement/cap/headroom and pass result, reported-only totals and the eager
file list. Unavailable Git fields are `null`, with a warning, rather than a
false clean claim; untracked evidence files do not mark the report dirty. Failures before
measurements complete may leave no report, which is not a budget pass.

For a conservative, read-only unused CSS review, run
`npx --no-install tsx scripts/css-unused.ts`. It scans class/id rule selectors
against all source text (including tests, string literals, dynamic string
families, `index.html` and first-paint sources). It leaves attributes,
functional pseudos, escapes, nesting and shell/root rules alone. Results are
review candidates, not automatic deletion or proof against externally supplied
class names; trace dynamic usage before removing anything. First-paint styles
and their extracted shell hashes must remain unchanged.

Any Gitleaks history finding must be reviewed before landing; confirmed false
positives use narrowly scoped fingerprints, not disabled detection rules. For
private vulnerability reports and advisory triage, see [SECURITY.md](../SECURITY.md).

Local gate commands (choose the relevant checks for a change):

```powershell
npm ci
npm audit
npm audit signatures
npx playwright install --with-deps chromium
npm run lint
npx --no-install tsc -b
npm run typecheck:functions
npm test -- --maxWorkers=1
npm run build
npm run check:budgets -- --json budget-report.json
npm run check:csp
npm run validate:data
npm run validate:discovery
npm run test:e2e
$env:PLAY100_TEST_BUILD = 'development'
npm run test:e2e
Remove-Item Env:PLAY100_TEST_BUILD
npm run test:cloud
```

The Playwright configs fail closed without CI. `.only` is refused unless
`PLAY100_ALLOW_ONLY=1`. `npm run test:e2e` starts its own preview (or
development server) on 127.0.0.1:4187 and refuses to run when the port is
already taken, rather than testing a stale server; stop that server yourself
(nothing is killed) or opt in with `PLAY100_REUSE_SERVER=1` for local
iteration only. Neither opt-in is honoured when `CI` is set, and release runs
set neither. `PLAY100_TEST_BUILD=development` selects the source-fixture
partition and `PLAY100_BASE_URL` targets a deployment without a local server.
The cloud-UI suite uses the server you start (see
[online saving](online-saving.md)); its global setup refuses to run unless
127.0.0.1:4187 is the Vite development server in `cloud-test` mode with
emulators enabled.

The explicitly Chrome-based mounted, native-zoom and H.264 film tests need an
existing Chrome installation or
`npx playwright install chrome` (which installs at the platform's default location).
`test:cloud` needs Java 21 and uses the `firebase-tools` version resolved in
`package-lock.json`, not a global CLI or production project. Both data validators
read checked-in files only; no gate runs the online catalog collector.

### Portable local release evidence

`npm run release:manifest -- OUTPUT --vitest FILE --playwright FILE`
collects a JSON receipt from the **current** checkout and `dist`. Both reporter
kinds are required; repeat either flag for additional reports. `--mode MODE`
defaults to `production`; use the same Vite mode and environment as the build.
The output must be a new file in an existing directory. Keep evidence outside
the checkout and deployment output, and retain the raw reports beside it.
Unset `DEBUG`: collection refuses debug logging because Vite's environment
debugger can print raw configuration values.

The receipt records the Git SHA/tree/dirty state, lockfile hash, actual
collector Node/V8 and installed npm/Vite/Vitest/Playwright versions, OS,
effective `VITE_*` names and SHA-256 value fingerprints (including Vite's
mode-specific `.env` files and shell overrides), and hashes of `dist/index.html`,
`sw.js`, `pwa-assets.json`, `manifest.webmanifest` and its referenced entry chunk.
It never writes configuration values or raw test diagnostics. Fingerprints
are for **non-secret** build configuration, not secret storage.
Each native report has a portable relative path, SHA-256 and counts for files,
passed, failed, skipped and flaky tests. Vitest files are not describe-suite
counts; todo tests join skipped, and flaky is `null` because its native JSON
does not expose retries. Playwright flaky outcomes are separate from passes;
files are unique across projects within each report.

Generate a separate packet **on each candidate, runtime and build partition**,
immediately after its gate, without changing source, dependencies, environment
or `dist`. For example, with Node 24 active and an external `$evidence` directory:

```powershell
Remove-Item Env:PLAY100_BASE_URL, Env:PLAY100_REUSE_SERVER, Env:PLAY100_ALLOW_ONLY -ErrorAction SilentlyContinue
npm test -- --maxWorkers=1 --reporter=default --reporter=json --outputFile="$evidence\unit-browser.json"
if ($LASTEXITCODE -ne 0) { throw 'Unit/browser gate failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }
$env:PLAY100_TEST_BUILD = 'production'
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = "$evidence\e2e-production.json"
npm run test:e2e -- --reporter=list,json
if ($LASTEXITCODE -ne 0) { throw 'Production e2e gate failed' }
npm run release:manifest -- "$evidence\manifest.json" --vitest "$evidence\unit-browser.json" --playwright "$evidence\e2e-production.json"
if ($LASTEXITCODE -ne 0) { throw 'Release manifest failed' }
Remove-Item Env:PLAYWRIGHT_JSON_OUTPUT_NAME, Env:PLAY100_TEST_BUILD
```

This example is the unit/browser plus production-e2e partition, **not the whole
release gate** listed above. Retain the exact commands, exit codes and receipts
for types, lint, budgets, CSP, validators, audits, cloud, development and
cloud-UI partitions too. For additional native reporters, use Vitest's
`--reporter=json --outputFile=...` and Playwright's `--reporter=json` with
`PLAYWRIGHT_JSON_OUTPUT_NAME`; never overwrite a different partition's report.
Hashing an existing report does **not** prove its execution SHA/runtime or that
it tested these artifact bytes. The recorded runtime is the collector's, not
a retrospective measurement of each test process. Preserve runner logs and
exit codes: native JSON can omit runner-level failures. The manifest is an
evidence inventory, not automatic certification of complete gate coverage.

`--decisions FILE` accepts explicit `carryForward` and `waivers` arrays:

```json
{
  "carryForward": [
    {
      "check": "Ancestor production e2e",
      "reason": "Explain why the reviewed unchanged surface permits reuse",
      "sourceCommit": "0123456789abcdef0123456789abcdef01234567",
      "evidence": "ancestor/e2e-production.json"
    }
  ],
  "waivers": [
    { "check": "Omitted partition", "reason": "Record the release owner's decision and remaining risk" }
  ]
}
```

Without that input both lists are empty. Keep carried evidence separate from
current-candidate `--vitest`/`--playwright` inputs; reasons disclose reuse or
omissions but do not approve them. The decisions file is hashed too. Missing,
malformed or unreadable inputs, inconsistent counts, failing tests/suites,
expected failures, unfinished runs and empty/all-skipped reports fail closed.
Playwright retries that pass remain visible as flaky rather than disappearing.
A dirty tree also fails unless `--allow-dirty` is explicitly supplied and
recorded; that exception is diagnostic, not a clean release approval.
No waiver overrides failures, and an existing receipt is never overwritten.

### Coverage and limitations

The two browser partitions are disjoint; fixtures importing live `/src` modules
run in development rather than being skipped or changing their assertions.
Existing actor-gated Menu/account and sign-in-sheet UI cases still need dedicated
local emulator setup; the suites do not create those actors or enable production
accounts. The headed native-hidden-window case remains opt-in and is not a
headless proof. Profile-specific desktop/mobile skips retain their intent.
`check:budgets` reads the existing `dist` without rebuilding or network access;
`budgets.json` records the enforced eager JS+CSS/PWA caps and provisional
270f app-CSS/lazy limits, and [Performance budgets](performance.md) sets
how they move. App CSS is the Vite output under `assets`; standalone
`pwa` stylesheets have a separate measured cap and must be in the PWA core.
They may be linked only by the offline document or the app's `noscript` fallback,
not active app documents, chunk dependencies or CSS imports. Combined CSS
totals remain visible. `index.html` has raw and gzip9 caps, which include its
active inline critical CSS, without changing the emitted-CSS baseline series.
The [first-paint shell](first-paint-shell.md)'s inline style and boot script
have raw caps too. The style cap applies to the larger of the two header variants:
a build carries only one, so the build records both in `.build-meta`.
`largestRouteGzipBytes` caps the most expensive lazily loaded page or picker
root: its chunk, static imports and their CSS beyond the eager set; every route
is listed ([route costs](architecture.md#route-costs)).
`check:csp` also reads the existing `dist`: every built document must work under
the `vercel.json` main-document policy, including the
[first-paint shell](first-paint-shell.md) boot script by its exact hash, and
`pwa-assets.json` must embed that same policy. It prints each inline block's hash.
It fails without `404.html`, the not-found page Vercel serves for unknown paths,
which the service worker also serves offline for them.
The PWA browser spec checks explicit preparation and
offline local routes in isolated contexts, not OS installation or update races.
See [the remaining manual PWA release checks](pwa.md#manual-release-checks).

The browser suite covers desktop and mobile, pagination, exact source order,
search/filter/sort history, native-scale ratings tables, bulk actions, actual
mouse/touch dragging, keyboard reordering, game deep links, focus restoration,
legacy migration, IndexedDB denial/corruption, concurrent-tab changes, unplayed
rankings, private scores/notes, backup export/restore, catalog failure recovery,
sharing and both exact-byte Excel downloads. It also covers live reduced motion,
Lite/no-WebGL behavior, automated WCAG checks, every declared font face and
browser console/CSP errors.
Unified-search regressions cover debouncing, cancelled responses, source-page
retry, Unranked labels, atomic rating/import failures, saved additions during
provider outages, native-select alignment, and full browser close/relaunch with
the same isolated test profile.

To exercise an existing public deployment instead of the local preview:

```powershell
$env:PLAY100_BASE_URL = "https://your-production-domain.vercel.app"
npm run test:e2e
```

No benchmark score is implied by passing these checks. Synthetic browsers are not
a substitute for testing on physical low-end devices.
Test definitions are not evidence that a particular release ran them. Release
receipts distinguish executed focused cases, emulator journeys and omissions.
The reported other-PC search issue was not directly reproduced on that physical
device. Controlled fresh/returning/restricted-storage and provider-failure
journeys verify these specific fixes; no blanket device-compatibility claim is
made.
