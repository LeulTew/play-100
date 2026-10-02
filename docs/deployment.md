# Deployment procedure

## Deploy to Vercel

`npm run build` checks both the browser app and the API dependency graph.
The root TypeScript options explicitly use strict NodeNext/ES2022 for Vercel
Functions; `tsconfig.functions.json` also checks that graph locally. Vercel's
function compiler does not follow TypeScript project references, so a passing
Vite build or a deployment marked Ready is not sufficient: review client and
function compilation before promotion.

This is a standalone project. Do not link it to an unrelated existing Vercel
project. The authorized environment used for publication is Ubuntu-24.04 WSL,
fish and the existing Vercel CLI login via `npx`. Pin the CLI to
`vercel@59.16.0`; never use `@latest` for a release.

Deploy only a reviewed commit already on `origin/main`, from an isolated stage
of exactly that committed tree. The source stage must contain no untracked
files, `node_modules`, environment files or authentication files. Add only the
existing ignored `.vercel/project.json` link metadata to target this same
project. Vercel installs dependencies and builds remotely on Linux using the
Node major pinned in `package.json` `engines`; do not build local prebuilt
artifacts for this release path.

Build-time configuration comes only from this project's Production environment
variables in Vercel: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, and
`VITE_FIREBASE_REQUIRED=true`. Missing required configuration fails the build;
see [online saving](online-saving.md). Nothing is pulled into the stage.
Besides Vercel's system variables, the functions read one optional runtime
variable, the Sensitive, Production-only `PRODUCTION_ALERT_GITHUB_TOKEN` for
report spike alerts; see the
[runbook](security-release-runbook.md#production-alert-token).

From that staging directory in WSL fish, replace the placeholder with the full
reviewed commit SHA:

```fish
set -l source_commit REVIEWED_COMMIT_SHA
npx --yes vercel@59.16.0 deploy --prod --skip-domain --archive=tgz --yes --meta sourceCommit=$source_commit --scope leulman2-gmailcoms-projects
```

`--skip-domain` leaves the production alias on the current release. Verify the
exact new deployment before promotion while Deployment Protection stays on;
automated checks use the project's existing automation bypass. Never disable
protection or rotate or print its secret. Check response headers and CSP,
served entry/worker/manifest sizes against the budgets, and the key journeys.

Retain these additional release receipts:

- [ ] The local gate (see Quality checks) passed and was reviewed for the exact
  `sourceCommit` being promoted, and the Gitleaks full-history scan's redacted
  raw report shows no findings (a summary of the result is not the report).
- [ ] Record the local `budget-report.json` from that commit's build.
- [ ] Record the new deployment ID/URL together with its verified `sourceCommit`
  metadata.

Before promotion, record the deployment the production alias currently points
to as the rollback target. Replace both placeholders below with the verified
deployment URL and that recorded previous deployment URL, respectively:

```fish
set -l verified_deployment VERIFIED_DEPLOYMENT_URL
set -l previous_deployment RECORDED_PREVIOUS_DEPLOYMENT_URL
npx --yes vercel@59.16.0 promote $verified_deployment --scope leulman2-gmailcoms-projects --yes --timeout 3m
```

Confirm the production alias serves the same asset hashes as the verified
deployment, then run the production sign-in smoke. If rollback is needed,
use the runbook's approved rollback procedure. On Hobby, the target must be the
immediately previous production deployment:

```fish
npx --yes vercel@59.16.0 rollback $previous_deployment --scope leulman2-gmailcoms-projects --timeout 3m
npx --yes vercel@59.16.0 rollback status --scope leulman2-gmailcoms-projects --timeout 3m
```

Allow the edge to settle, confirm the production alias and run `release:verify`
against the retained previous build, as described in the runbook. Rollback does
not revert Firestore rules or data. Undo it with `promote` only after fresh owner
approval and candidate verification; never repeat a timed-out mutation blindly.

Keep `.vercel` and all environment files ignored. Never copy a token into the
project. `vercel.json` sets Vite output, conservative security headers, and the
correct XLSX MIME type/download disposition. `.vercelignore` excludes original
data/reproduction material from the upload; deployable copies live in `public`.
All font assets are emitted as same-origin files, including small language
subsets, so `font-src 'self'` stays strict without blocked data-URI fonts.
Check the production alias without an authenticated Vercel browser and run the
production browser suite before treating a deployment as delivered.

Hosted build environments provide `VERCEL_PROJECT_PRODUCTION_URL` for absolute
Open Graph image/URL and canonical metadata. `VITE_SITE_URL` is an optional
explicit HTTPS origin override. Local preview does not guess a public origin.
The shared social card describes the collection, not private visitor progress.

This remote-build, verify and promote path is separate from the quality checks above.
The source is now published on the public `LeulTew/play-100` repository. Its
initial `main` publication is not a PR merge. No workflow deploys, and no automatic
Vercel Git-build integration is installed; use the explicit remote-build path.
