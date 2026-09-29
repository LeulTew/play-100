# Install and offline access

Play 100 can be added to a supported browser's home screen or app launcher.
This is the website in standalone mode, not a native app, an account action,
or a request for push permission.

Installation is offered only when the browser supplies an install prompt.
The prompt opens only from the user's action and is used once. On iOS the UI
instead explains Safari's Share -> Add to Home Screen action. An accepted prompt
is not an assertion that the OS finished installing; the app-installed event or
standalone display mode supplies that indication.

## What offline access stores

User-facing instructions describe public files and storage limits, not workers
or an app shell. They still exclude private/account data, online-only pages,
sign-in details, live catalog results, films and workbooks from offline preparation.

Preparing offline access is explicit, not a first-visit download. The build
generates `sw.js` and `pwa-assets.json` from Vite's manifest. Named roots are the
main entry, Discover, CatalogDetail and MyGames (Library, Queue and Ranking),
the guarded update executor, deferred catalog/intent utilities and the Data use
disclosure body, including their static imports, CSS and WOFF2 fonts. The
disclosure body's presence does not make the Data use route an offline shell.
The deferred PWA controller has an explicit `client-entry.ts` root; its static
closure includes the client even when Vite emits that implementation as a shared chunk.
Its eager adapter captures browser install/connectivity events without registering
a worker. A failed client-entry import is terminal: Settings offers guarded reload
through the existing pending-edit guard, not another import or offline preparation.
The manifest, brand icons,
offline explanation and local collection/Discover metadata complete the core.

The tab, installed-app, apple-touch and social-card icons share the header's
33-by-34 skewed lime tile and upright 12-by-18 ink play triangle. The maskable
source scales the complete tile inside the central 80% safe circle, on opaque
chalk. Regenerate the five existing public PNGs with
`npx --no-install tsx scripts\pwa-icons.ts`, then regenerate the social card with
`npm run assets:social-card`. The icon command reports dimensions, byte counts
and SHA-256 values, and refuses a PNG over 24 KiB. The build uses the same icon
renderer; no extra core entries or runtime modules are added.
The same command also writes `/pwa/icon-32.png` and `/favicon.ico` for browsers
without SVG-favicon support. The ICO contains that exact 32px PNG, not a second
mark. These two browser fallbacks are outside the explicit PWA core inventory;
the installed-app icons retain their existing five paths. The static share
title, running collection title, card headline and image alt all use
"Good games. Great escapes." Neither first-paint template nor boot bytes change.

### Portable social artwork

`scripts/social-card-source.svg` is the editable, font-based composition.
`npm run assets:social-card` loads its existing Fontsource Latin faces in Chromium,
verifies every weight, and keeps the PNG renderer at 1200 by 630 and device scale 1.
It also converts the browser-shaped character positions to reusable glyph paths
in `public/social-card.svg`. No fonts, live text, CSS or external assets remain in
the public SVG; each outlined phrase retains its accessible label. This works
with the existing strict CSP without allowing embedded styles or data-URL fonts.

Outline generation uses Python with `fonttools[woff]` (verified with FontTools
4.63.0 and Brotli), in addition to the existing Node/Playwright dependencies.
If absent, install that authoring tool with `python -m pip install "fonttools[woff]==4.63.0"`;
it is not shipped to visitors or needed by the app build. Barlow and Hanken Grotesk
remain under their packages' SIL Open Font License 1.1; the SVG paths are a document
created with those fonts, not redistributed font software.

The command opens the result in a separate, style-free SVG document with
`font-src 'none'`, blocks dependent requests, and reports the pixel difference
against both its font-based render and the existing PNG. Path antialiasing can
differ from hinted/subpixel text without changing character positions or layout.
The public SVG has an 80 KiB size cap. `SOCIAL_CARD_EVIDENCE_DIR` optionally saves
the standalone screenshot outside the repository.

The core has hard build/install limits of 51 entries, including the online split's
shared chunks, 2 MiB decoded total and 1 MiB per file. Two entries and 32 KiB of
that total are reserved for bounded
readiness and page-version metadata. Public game images are requested only when used, with a generated
path/hash allowlist, at most 48 stored images, 4 MiB total and 192 KiB each.
Response type, byte length and SHA-256 are checked. Redirects, login pages,
private/no-store responses, authorization-bearing requests and unexpected data
cannot become offline public assets.

Core preparation runs at most four fetch/verify/store lanes at once. Readiness
is written only after all lanes succeed. On failure, no new assets are started;
already-started downloads retain their asset deadlines, and all started work
settles before the incomplete core is removed, so a late writer cannot escape
cleanup. Existing ready versions and their document-policy bindings are unchanged.

An uncached allowlisted image returns as soon as its response is verified;
its cache update runs under the fetch event's `waitUntil` lifetime rather than
holding the response behind earlier writes. Deletes, quota accounting, eviction
and puts still share one ordered queue. A failed write warns the app without
turning a verified image into a failed response, and later writes may proceed.
The cache's count/byte limits and hit behavior are unchanged.

Each verified asset download has one deadline covering headers, the entire body
and verification: `min(360 seconds, 60 seconds + ceil(declared bytes / 4096) seconds)`.
This allows a minute of startup time plus transfer at 4 KiB/s (316 seconds for
the maximum 1 MiB file), with a six-minute ceiling; slower connections can time
out and retry, so this is not a promise for arbitrarily slow networks. Timeout
aborts the request and cancels its reader without waiting for cancellation to
finish. Failed preparation removes only the incomplete new core, writes no
ready marker, preserves the working version and clears the preparing state so
Settings shows an error and enables retry when connected.

The build also embeds an allowlisted main-document security policy and includes
its digest in the worker version. Cached shell and offline fallback HTML retain
CSP and isolation headers, including across header-only deployments/rollbacks.
Previous-version HTML uses its own recorded policy, never newer critical CSS or
script hashes. Legacy headerless HTML returns a protected offline error instead
of being described as protected; correctly bound old JSON/chunks are unchanged.
No cookies or arbitrary/private response headers enter the embedded policy.

The worker never stores APIs (including enrichment), auth helpers, Firebase,
Google, account responses, user queries, private game state, passwords or forms.
Personal-workspace shell navigation accepts the Library's numeric `page`
parameter alongside `tab`: one integer from 1 through 9999, matching the URL
writer. Invalid, repeated or oversized page values, private keys and unknown
keys stay excluded. The cached shell remains `/index.html`, never a copy keyed
by the visitor's page query. Prepared offline Library reloads retain page 2
and later pages without persisting private state in the worker.
It never requests push permission or adds background sync/another IndexedDB
engine. Existing guest/account libraries, save validation, backups and consent
remain independent of CacheStorage. Signing in offline is not promised.
Uncached account/sharing pages show a connection-required explanation instead
of substituting private data or silently switching account scope.
Offline, a navigation to an unknown path (not an app route in `vercel.json`, and
not a file) gets the same not-found page Vercel serves online, `public/404.html`,
with status 404 and the embedded policy. The worker carries its own copy, so the
404 page adds no core file; a unit test keeps the copy identical. Both link
`/pwa/fallback.css` in source; the build points them at the app's entry
stylesheet, which is precached, so the page wears the app's fonts, wordmark and
buttons online and offline without adding CSS.

Videos, spreadsheets, 3D and the online controller are not precached. Existing
media/download behavior is unchanged. The public Data use page bypasses PWA
registration; it still does not bootstrap an account.

The conditional collection table, additional results and film UI share an
explicitly precached `CollectionExtras` entry. A prepared offline
`/?view=table` deep link and subsequent grid/table toggles can therefore load
without a network. The three existing sign-in/comparison intent roots keep
their source-keyed manifest entries; no offline root is removed or remapped.
Movie/poster files remain outside the core. The 51-file limit, including the
two metadata entries, remains unchanged and is enforced against emitted output.

Ordinary `/covers/` image responses use `public, max-age=86400,
stale-while-revalidate=604800`: one day fresh, then at most seven days of
stale-while-revalidate. Slug-based cover paths are not immutable, so a newly
replaced cover may remain in a browser cache for that freshness window.
This path-specific rule sets only Cache-Control; the catch-all CSP, HSTS,
isolation and other security headers still apply. Offline asset preparation
continues using network-only requests and exact manifest checksums rather than
trusting those browser-cache bytes. No cover paths, image bytes or PWA policy
are changed by this HTTP cache rule.

`/pwa/fallback.css` belongs to the standalone offline and not-found documents and the app's
`noscript` fallback, not the JavaScript-enabled app stylesheet graph. Its
separate byte gate does not exempt it from the core entry/byte budget. Active
app references to that stylesheet fail the build-budget check.

## Updates and recovery

Failed app-module imports are terminal for the current document, including
failures in shared JavaScript or CSS dependencies. Recovery never reloads
automatically: the visible action checks connectivity with a network-only
five-second `HEAD /` probe before replacing the current URL. The worker does
not intercept non-GET requests. Settings and credits restore their explicit
intent through `info=settings` or `info=credits`, preserving other URL parameters.
An offline or failed probe leaves the current app and recovery action available.
HTTP errors report an unavailable site rather than claiming the device is offline.
Browsers without `AbortSignal.timeout` use a cleared five-second abort timer.
Credits do not depend on account readiness. Settings opens with the current
library's existing busy/disabled controls rather than waiting for authentication
or a hint error to clear. Explicit panel requests survive account transitions;
URL-restored intents survive provisional authentication and adopt its first
settled scope. Only a later settled-scope switch cancels a still-pending intent;
an already-open panel stays open. Intents are consumed on close or cancellation,
and never reopen after Escape or navigation. Page-hosted errors have a touch-sized
dismiss action that returns focus to the visible Menu trigger.

Page-module failures stay inside the route, with the header and navigation
available; catalog-detail failures stay inside a closable dialog. Parser-module
failures use the same reload action, while catalog data failures still allow a
normal data retry. Failed update-control imports preserve the waiting worker and
require the existing edit guard plus the network probe before recovery reload.
Decorative 3D failures retain the illustrated fallback without a reload action
or repeated imports. Background module prefetch failures remain non-disruptive;
explicit use exposes the terminal failure and its recovery action.
When a URL panel intent accompanies an existing `game` link, its pending or
failed notice stays in a native dialog above the game, not in an inert page toast;
cancelling that intent retains the game URL.

The stable worker URL uses `updateViaCache: 'none'`. Installing a new version
first fills a separate bounded cache and writes its ready marker last. A failed
install preserves the working version. Quota or offline failures remain
explicit and retryable.

An explicit update check shows its busy state and then a result in Settings:
up to date, downloading, ready to review, or a check failure. It never applies
an update or reloads the page by itself.

First installation does not claim an already open, uncontrolled page of unknown
version. Ready means the files are complete; reopen the public page or installed
app to use that worker offline. There is no automatic reload or unconditional
`skipWaiting`. The Update action
must first pass the existing pending-editor flush and an integration-owned
current-scope/navigation/form guard. A false/rejected save, unsubmitted form,
new edit or changed scope does not reload the page. The worker accepts an exact
waiting version only when the requester is the sole same-origin top-level or
auxiliary window. Only a same-origin nested `/__/auth/iframe` document is excluded
from that count; other auth-prefix paths and unknown frame ownership refuse
activation. The worker repeats the sole-requester census immediately before
`skipWaiting`, after persistent cache writes. It does not assign that requester's
old version to other windows during activation. A newcomer arriving after the
last census has no inferred version and receives an unavailable response rather
than someone else's old metadata. Other tabs are never
reloaded. The initiating page verifies the new controller's
version and the guard again before reloading. Forms that mirror saved values,
such as the account name, declare their state with `data-unsaved`, so an
unedited saved value is never an unsubmitted form; any other form counts a
non-empty text field.

An activation acknowledgement can time out without canceling the worker's
accepted operation. Existing-controller status checks, controller changes and
reconnection reconcile the trusted active version with the persisted document
version. A confirmed mismatch offers a guarded reload even after a lost reply
or controller restart; it never reloads automatically or bypasses a fresh edit.

Two ready core versions are retained, allowing previous hashed lazy chunks to
finish safely. Before activation the requester is bound to its verified old
document version. Those bounded opaque client-ID/public-version pairs are
persisted in the worker's own cache: a new edit preventing reload still reads
the old unversioned HTML/JSON, even after worker restart. A subsequent public
navigation binds its new document to the new core. Unknown ownership returns
an explicit unavailable response instead of silently substituting newer JSON;
online-only navigations remain network-only. No client URLs, queries or user
records enter the binding map. Another update first requires the initiating
document to match its active worker; an older retained document must complete a
guarded reload before advancing again.

A third installing core is allowed; further staging is rejected
until the pending update is applied. Cleanup is restricted to this implementation's
exact `play100-pwa-v1-core-<hash>` and `play100-pwa-v1-images-<hash>` caches.
It never clears IndexedDB, unrelated CacheStorage, browser profiles or user files.
Internal readiness/client metadata uses only two fixed synthetic cache keys,
with at most 16 opaque window IDs, their public versions, observation flags and
reservation timestamps, not a new database or account namespace. Reserved
navigation IDs are not removed merely because `clients.matchAll` cannot yet see
their documents. Metadata writes are serialized; navigation promises protect
their active reservations until the HTML response is ready. Before releasing
that protection, a successful response renews its unobserved reservation
timestamp through the same serialized metadata queue. Its version and observed
flag do not change. If renewal fails or consumes the entire grace window, the
navigation returns the offline error rather than a shell with an expired
binding. Afterwards, the unobserved reservation has a fresh two-minute grace
period and can be reclaimed if
still absent; a confirmed closed document can be reclaimed immediately. There
is no polling or unbounded reservation table. If the hard cap is reached, the
new navigation fails explicitly without displacing an in-flight document.

## Storage failures

### Mixed application versions and private libraries

R22 opens `play100-personal` at IndexedDB version **3** without rewriting its
existing records. The version upgrade is independent of service-worker
installation or activation. It is necessary because Release 6 uses version 2
and does not check account-writer retirement markers; its unconditional delete
also bypasses an unreadable sentinel. Release 6's `versionchange` handler closes
its connection. Its next v2 read, save, restore or delete fails with the existing
newer-version message instead of recreating or deleting account data.

New-code writers still use the per-account generation checks: removing a device
copy retires its generation atomically; a fresh explicit account opening is
required to create the next copy. Ordinary sign-out keeps the current generation
and its drafts. Older-version drafts cannot be saved after the upgrade; finish
or copy them before opening the new release, and reload old tabs only after
preserving any unsaved text. No window is force-reloaded and no draft is moved
into the guest library.

A tab that does not close its connection can block the update. The library error
says "Close other Play 100 tabs to finish updating this device library, then retry.
Your saved data has not been changed." Close that tab and choose **Retry account
check**, which retries the local library before online work. A rejected upgrade request aborts when unblocked; only a fresh
successful opening completes the upgrade. Existing data is never cleared as a
recovery shortcut. See the **R22-or-later rollback floor** in
[release operations](release-operations.md#r22-indexeddb-compatibility-and-rollback-floor).

Offline readiness is committed only after every verified core file and the
final ready marker have been stored. A quota failure must not advertise
“Offline files ready” or leave a staging cache with a ready marker. A previous
complete version is kept; first-time preparation failure leaves the current
online page usable. Neither cache cleanup nor retry clears the private
IndexedDB library, its records or unsaved forms.

The client reports one of these exact source messages, depending on whether
the storage failure is delivered as a worker error, a redundant installation,
or a registration rejection:

- “Offline preparation or storage failed. Reconnect, free storage if needed, and retry.”
- “Offline preparation failed. The current version was not replaced. Retry when connected.”
- “Offline preparation could not start. Check the connection or available storage, then retry.”

After freeing storage, choose **Enable offline access** again. Only a complete
retry reaches **Offline files ready**. As with any first installation, reopen
a public page to use the worker offline; readiness does not reload the current
page automatically. Storage exhaustion is distinct from initial storage
permission denial, browser eviction or manually clearing site data.

[`tests/storage-quota.spec.ts`](../tests/storage-quota.spec.ts) is the focused,
Chromium-only production campaign on both configured desktop and mobile
projects. It uses a fresh synthetic guest profile on the integrator-owned
loopback preview, measures `navigator.storage.estimate()`, and applies actual
CDP `Storage.overrideQuotaForOrigin` quotas. The three cases cover a large
2,000-game backup import, an unsaved manual-game form, and preparation with
less space than the generated offline core. They assert failure feedback,
unchanged committed state, preserved open work, lifted-quota retries and
offline navigation after readiness. Exact quota/usage and cleanup receipts
are attached; overrides are always lifted in `finally`. No user profile,
deployed origin, real disk filler or private account is used.

With the matching production build already prepared by the integrator:

```powershell
$env:PLAY100_TEST_BUILD = 'production'
npm run test:e2e -- tests/storage-quota.spec.ts --project=desktop --project=mobile --workers=1
```

Keep the existing local-preview safety defaults and retain the result,
attachments and trace with the release receipt. This authored campaign is
**UNRUN until the parent/integrator records its execution**. It demonstrates
Chromium quota refusal, not physical full-disk or Safari behavior. The
[library storage contract](architecture.md#storage-failures) distinguishes
persisted snapshots from unsaved tab-only drafts.

## Build and integration

`play100Pwa()` from `scripts/pwa-build.ts` enables Vite's build manifest and
generates the worker, release allowlist/budget receipt and PNG icons in the build
directory. Icons are rendered from the existing first-party favicon and the
same padded ink mark in `public/pwa/icon-source.svg`; maskable artwork fits the
central 40%-radius safe circle. No third-party runtime PWA plugin is required.
Use the centrally approved Sharp version for icon generation; no protected
existing assets are re-encoded.

Vite's module manifest is build-only metadata. After consuming it, the PWA build
moves it from `dist/.vite/manifest.json` to the gitignored
`.build-meta/dist/vite-manifest.json` outside the deploy directory. The first-paint
build writes its record, `first-paint.json`, beside it. Budget checks
and chunk-loading tests read those retained copies through `scripts/build-metadata.ts`;
keep them with the matching build when running those checks, but never publish them.
The build and budget checks reject any remaining `.vite` directory or `*.map`
file in the deploy output, and reject metadata paths in the generated precache.
Worker, asset hashes and public precache contents do not include the retained manifest.

The root consumes `usePwa({ enabled })` once. A false gate prohibits registration/
prefetch/install handling and is required for the Data use bypass and explicit
performance-quiet contexts. Menu/Settings can render install, prepare/retry,
check-update and guarded-apply actions with the returned state/message/error.
These should not become automatic popups or an overlapping notification.

Guarded update execution is loaded from `src/pwa/apply-update.ts` only after an
explicit update request; synchronous install-prompt capture and `prompt()` stay
in the startup controller. The request lock is claimed before loading, and the
executor reads current registration/version/guard state after each await.
The build's explicit offline core roots must include this update module so that
a prepared offline app can still perform its guarded reload.

Required root HTML links point to `/manifest.webmanifest` and the generated
`/pwa/apple-touch-icon.png`. Add `worker-src 'self'; manifest-src 'self'` to
the non-auth CSP, no-store headers for `/sw.js` and `/pwa-assets.json`, and
revalidation for the web manifest. Do not broaden auth-helper permissions.

Focused source tests cover the build graph, icon pixels, cache budgets and
allow-deny rules, failed installs, old chunks, trusted updates, multi-tab refusal,
install availability and retained drafts.

`tests/pwa-offline.spec.ts` is defined in the local production-preview partition on both
Chromium profiles with an isolated, worker-enabled context. It exercises the
real Settings control, no pre-intent worker download, first-install no-claim/
no-reload behavior, offline fresh Library/Queue/Ranking/Discover navigation,
genre/include filters, Settings, preserved UI-created guest data, denied
API/auth cache paths and online recovery. With Node 24 active, use an external
evidence directory and the local production preview (not a development or
remote server):

```powershell
Remove-Item Env:PLAY100_BASE_URL, Env:PLAY100_REUSE_SERVER, Env:PLAY100_ALLOW_ONLY -ErrorAction SilentlyContinue
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }
$env:PLAY100_TEST_BUILD = 'production'
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = "$evidence\pwa-offline.json"
npm run test:e2e -- tests/pwa-offline.spec.ts --project=desktop --project=mobile --reporter=list,json
if ($LASTEXITCODE -ne 0) { throw 'PWA offline gate failed' }
Remove-Item Env:PLAYWRIGHT_JSON_OUTPUT_NAME, Env:PLAY100_TEST_BUILD
```

The config starts its own strict preview at `127.0.0.1:4187`. Retain the native
JSON, command/exit receipt and traces, and include the report as a repeated
`--playwright` input in the candidate's
[local release manifest](../README.md#portable-local-release-evidence).
This is a focused PWA receipt, not a claim that the complete e2e suite ran.
The test's existence is not evidence a particular release executed it; an
ancestor run must be labelled carry-forward with a reason. Hosted CI is
disabled. ServiceWorker-blocked timing tests are not offline evidence.

### Manual release checks

- After deployment, verify `GET /.vite/manifest.json` returns **404**, not 200,
  a redirect, or a fallback HTML page. The Vercel configuration has no SPA
  catch-all; 404 is the required result. Publish only `dist`, not `.build-meta`.

- Verify OS-level installation and launch/uninstall behavior with explicit user
  consent; automation does not install an OS app.
- Check physical iOS Safari's Share/Add to Home Screen flow and offline launch.
  Chromium mobile emulation does not certify Safari or a physical device.
- Exercise real multi-window/two-version update races and interrupted updates,
  including an unsubmitted form, failed save, changed scope and fresh edit
  after approval. The single-build offline spec does not manufacture an update
  or replace these campaigns; source mocks cover the guard logic separately.
