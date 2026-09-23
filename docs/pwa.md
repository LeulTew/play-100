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

Preparing offline access is explicit, not a first-visit download. The build
generates `sw.js` and `pwa-assets.json` from Vite's manifest. Named roots are the
main entry, Discover, CatalogDetail and MyGames (Library, Queue and Ranking),
the guarded update executor, deferred catalog/intent utilities and the Data use
disclosure body, including their static imports, CSS and WOFF2 fonts. The
disclosure body's presence does not make the Data use route an offline shell.
The manifest, brand icons,
offline explanation and local collection/Discover metadata complete the core.

The core has hard build/install limits of 48 entries, 2 MiB decoded total and
1 MiB per file. Two entries and 32 KiB of that total are reserved for bounded
readiness and page-version metadata. Public game images are requested only when used, with a generated
path/hash allowlist, at most 48 stored images, 4 MiB total and 192 KiB each.
Response type, byte length and SHA-256 are checked. Redirects, login pages,
private/no-store responses, authorization-bearing requests and unexpected data
cannot become offline public assets.

The build also embeds an allowlisted main-document security policy and includes
its digest in the worker version. Cached shell and offline fallback HTML retain
CSP and isolation headers, including across header-only deployments/rollbacks.
Previous-version HTML uses its own recorded policy, never newer critical CSS or
script hashes. Legacy headerless HTML returns a protected offline error instead
of being described as protected; correctly bound old JSON/chunks are unchanged.
No cookies or arbitrary/private response headers enter the embedded policy.

The worker never stores APIs (including enrichment), auth helpers, Firebase,
Google, account responses, user queries, private game state, passwords or forms.
It never requests push permission or adds background sync/another IndexedDB
engine. Existing guest/account libraries, save validation, backups and consent
remain independent of CacheStorage. Signing in offline is not promised.
Uncached account/sharing pages show a connection-required explanation instead
of substituting private data or silently switching account scope.

Videos, spreadsheets, 3D and the online controller are not precached. Existing
media/download behavior is unchanged. The public Data use page bypasses PWA
registration; it still does not bootstrap an account.

`/pwa/fallback.css` belongs to the standalone offline document and the app's
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

The stable worker URL uses `updateViaCache: 'none'`. Installing a new version
first fills a separate bounded cache and writes its ready marker last. A failed
install preserves the working version. Quota or offline failures remain
explicit and retryable.

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
version and the guard again before reloading.

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
`.build-meta/dist/vite-manifest.json` outside the deploy directory. Budget checks
and chunk-loading tests read that retained copy through `scripts/build-metadata.ts`;
keep it with the matching build when running those checks, but never publish it.
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

`tests/pwa-offline.spec.ts` runs in the production-preview CI partition on both
Chromium profiles with an isolated, worker-enabled context. It exercises the
real Settings control, no pre-intent worker download, first-install no-claim/
no-reload behavior, offline fresh Library/Queue/Ranking/Discover navigation,
genre/include filters, Settings, preserved UI-created guest data, denied
API/auth cache paths and online recovery. Run it after building with
`npm run test:e2e -- tests/pwa-offline.spec.ts`.
Its existence is not evidence a particular release ran it; retain the actual
CI results. ServiceWorker-blocked timing tests are not offline evidence.

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
