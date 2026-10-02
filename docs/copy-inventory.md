# User-facing copy inventory

Source-derived read-through inventory for Play 100. Regenerate with
`npx tsx scripts/copy-inventory.ts`; verify with `--check`.
The unit-test gate regenerates this inventory and rejects stale content or source references.

## Scope and reading convention

Scanned 383 production TS/TSX/JS files and standalone HTML fallbacks; 3783 source entries.
This is a deliberately inclusive inventory of rendered text, accessible labels,
message outputs, message constants and validation/error strings. It includes the
Discover help/source notes, Settings/backups/PWA, empty states, confirmations,
toasts and live regions. Console-only diagnostics, tests, fixtures, generated
data, imports, CSS selectors and protocol/URL strings are excluded.

`${expression}` is source interpolation, not literal visitor copy. Conditional
templates retain both alternatives; fragments are also listed so assembled
messages can be read with their output site. Conditions show the owning function
and enclosing source branches; they are not claims that every branch was visited
in a browser. Error/validation entries include lower-level failures passed to UI
error handlers; internal format keys are not proposed wording changes.

Preserved workbook rationales, source annotations, provider-returned game facts
and user-entered text are data, not editorial UI copy, and are not rewritten.
Policy-related wording must be updated with any documentation quoting it.
Numeric rating scales (for example /10), URLs, source-supplied genre labels and
the established all-caps hero/artwork are not slash-pair or sentence-case prose defects.
Operational/admin-only validation errors are retained for traceability, not
represented as visitor toasts. Third-party default announcements are not authored
in this source tree; dynamic output sites identify where data-derived copy appears.

## Read-through conventions

- Name the game and direction in individual library/progress/ranking messages.
- Use Play later and About & credits consistently.
- Keep visitor messages free of worker/controller/provider/payload implementation terms.
- Use sentence case, plain conjunctions rather than slash pairs, and one action name.
- Keep sibling notices in the same tense; state the result and useful recovery.
- Keep privacy, deletion and storage consequences explicit and unchanged in meaning.

The review replaced visitor-facing provider/worker terms with catalog/source or
offline-access language; rating/note and reviews/ratings became conjunctions.
Ranking additions share Add to my ranking; completion reversal is Mark not
completed. Empty-state headings and fallback success messages now use the same
plain voice. Existing privacy exclusions, storage guarantees and original scores
are preserved. Single-game messages retain the game name and authoritative
transaction feedback; bulk actions retain accurate changed/unchanged counts.

## api/_lib/catalog-detail-data.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [api/_lib/catalog-detail-data.ts:184](../api/_lib/catalog-detail-data.ts#L184) | Error/validation | Steam returned no usable review summary. | steamRating(); root?.success !== 1 &#124;&#124; !summary is true |
| [api/_lib/catalog-detail-data.ts:195](../api/_lib/catalog-detail-data.ts#L195) | Error/validation | Steam returned inconsistent review counts. | steamRating(); typeof positive !== 'number' &#124;&#124; typeof negative !== 'number' &#124;&#124; typeof total !== 'number' &#124;&#124; ![positive, negative, total].every( (value) =&gt; Number.isSafeInteger(value) &amp;&amp; value &gt;= 0 &amp;&amp; value &lt;= 1_000_000_000, ) &#124;&#124; positive + negative !== total is true |
| [api/_lib/catalog-detail-data.ts:202](../api/_lib/catalog-detail-data.ts#L202) | Message/fragment | Steam | steamRating(); when its owning surface/operation is used |
| [api/_lib/catalog-detail-data.ts:205](../api/_lib/catalog-detail-data.ts#L205) | Message/fragment | Steam | steamRating(); when its owning surface/operation is used |
| [api/_lib/catalog-detail-data.ts:206](../api/_lib/catalog-detail-data.ts#L206) | Message/fragment | Steam purchases; all languages; off-topic activity excluded | steamRating(); when its owning surface/operation is used |
## api/_lib/commons-raster.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [api/_lib/commons-raster.ts:52](../api/_lib/commons-raster.ts#L52) | Message/fragment | Commons did not return one exact image. | commonsRasterPermission(); values.length !== 1 is true |
| [api/_lib/commons-raster.ts:59](../api/_lib/commons-raster.ts#L59) | Message/fragment | Commons returned a different file identity. No replacement image was chosen. | commonsRasterPermission(); expectedFile &amp;&amp; (typeof page?.title !== 'string' &#124;&#124; page.title.normalize('NFC').replaceAll('_', ' ') !== &#96;File:${expectedFile}&#96;.normalize('NFC').replaceAll('_', ' ')) is true |
| [api/_lib/commons-raster.ts:63](../api/_lib/commons-raster.ts#L63) | Message/fragment | No local Commons image information is available. | commonsRasterPermission(); !info &#124;&#124; page?.imagerepository !== 'local' is true |
| [api/_lib/commons-raster.ts:66](../api/_lib/commons-raster.ts#L66) | Message/fragment | LicenseShortName | license(); when its owning surface/operation is used |
| [api/_lib/commons-raster.ts:67](../api/_lib/commons-raster.ts#L67) | Message/fragment | Artist | artist(); when its owning surface/operation is used |
| [api/_lib/commons-raster.ts:68](../api/_lib/commons-raster.ts#L68) | Message/fragment | Restrictions | restrictions(); when its owning surface/operation is used |
| [api/_lib/commons-raster.ts:70](../api/_lib/commons-raster.ts#L70) | Message/fragment | This image needs a clear reusable license and complete attribution. | commonsRasterPermission(); !license &#124;&#124; !artist &#124;&#124; (restrictions &amp;&amp; restrictions !== 'trademarked') is true |
| [api/_lib/commons-raster.ts:76](../api/_lib/commons-raster.ts#L76) | Message/fragment | Copyrighted | licenseUrl(); cc is false; license === 'CC0' is false; license === 'Public domain' &amp;&amp; |
| [api/_lib/commons-raster.ts:76](../api/_lib/commons-raster.ts#L76) | Message/fragment | False | licenseUrl(); cc is false; license === 'CC0' is false; license === 'Public domain' &amp;&amp; |
| [api/_lib/commons-raster.ts:76](../api/_lib/commons-raster.ts#L76) | Message/fragment | Public domain | licenseUrl(); cc is false; license === 'CC0' is false |
| [api/_lib/commons-raster.ts:79](../api/_lib/commons-raster.ts#L79) | Message/fragment | LicenseUrl | declaredUrl(); when its owning surface/operation is used |
| [api/_lib/commons-raster.ts:80](../api/_lib/commons-raster.ts#L80) | Message/fragment | Public domain | commonsRasterPermission(); !licenseUrl &#124;&#124; |
| [api/_lib/commons-raster.ts:81](../api/_lib/commons-raster.ts#L81) | Message/fragment | This image license is not approved for reuse here. | commonsRasterPermission(); !licenseUrl &#124;&#124; (license !== 'Public domain' &amp;&amp; declaredUrl?.replace(/\/$/, '') !== licenseUrl.replace(/\/$/, '')) is true |
| [api/_lib/commons-raster.ts:93](../api/_lib/commons-raster.ts#L93) | Message/fragment | Commons did not supply verified original image dimensions. | commonsRasterPermission(); typeof info.width !== 'number' &#124;&#124; typeof info.height !== 'number' &#124;&#124; !Number.isSafeInteger(info.width) &#124;&#124; !Number.isSafeInteger(info.height) &#124;&#124; info.width &lt; 1 &#124;&#124; info.height &lt; 1 &#124;&#124; info.width * info.height &gt; 25_000_000 is true |
| [api/_lib/commons-raster.ts:106](../api/_lib/commons-raster.ts#L106) | Message/fragment | Commons did not supply a bounded original or permitted thumbnail. | commonsRasterPermission(); !original &amp;&amp; !text(info.thumburl) is true |
| [api/_lib/commons-raster.ts:128](../api/_lib/commons-raster.ts#L128) | Message/fragment | Commons did not supply a bounded supported raster image. | commonsRasterPermission(); !sourceUrl.pathname.startsWith('/wiki/File:') &#124;&#124; !originalUrl.pathname.startsWith('/wikipedia/commons/') &#124;&#124; !downloadUrl.pathname.startsWith('/wikipedia/commons/') &#124;&#124; !/\.(?:png&#124;jpe?g&#124;webp)$/i.test(downloadUrl.pathname) &#124;&#124; typeof mime !== 'string' &#124;&#124; !RASTER_TYPES.includes(mime) &#124;&#124; typeof width !== 'number' &#124;&#124; typeof height !== 'number' &#124;&#124; !Number.isSafeInteger(width) &#124;&#124; !Number.isSafeInteger(height) &#124;&#124; width &lt; 1 &#124;&#124; height &lt; 1 &#124;&#124; width &gt; 640 &#124;&#124; height &gt; 640 is true |
| [api/_lib/commons-raster.ts:131](../api/_lib/commons-raster.ts#L131) | Message/fragment | Attribution | parts(); when its owning surface/operation is used |
| [api/_lib/commons-raster.ts:131](../api/_lib/commons-raster.ts#L131) | Message/fragment | Credit | parts(); when its owning surface/operation is used |
| [api/_lib/commons-raster.ts:133](../api/_lib/commons-raster.ts#L133) | Message/fragment | Resized and converted to WebP; original license retained. | commonsRasterPermission(); when its owning surface/operation is used |
| [api/_lib/commons-raster.ts:134](../api/_lib/commons-raster.ts#L134) | Message/fragment | Trademark rights are not granted by the copyright license. | commonsRasterPermission(); restrictions === 'trademarked' is true |
| [api/_lib/commons-raster.ts:137](../api/_lib/commons-raster.ts#L137) | Message/fragment | The complete image credit exceeds the supported length; the image was not copied. | commonsRasterPermission(); credit.length &gt; ENRICHMENT_LIMITS.creditLength is true |
| [api/_lib/commons-raster.ts:211](../api/_lib/commons-raster.ts#L211) | Error/validation | A patched image decoder is required before new artwork can be loaded. Existing artwork is unchanged. | fetchCommonsRaster(); !patchedDecoder(sharp.versions.sharp) is true |
| [api/_lib/commons-raster.ts:224](../api/_lib/commons-raster.ts#L224) | Error/validation | The original image byte length did not match its verified metadata. | fetchCommonsRaster(); permission.bytes !== null &amp;&amp; input.length !== permission.bytes is true |
| [api/_lib/commons-raster.ts:227](../api/_lib/commons-raster.ts#L227) | Error/validation | The image was not a supported single-frame raster matching its declared type. | fetchCommonsRaster(); !verifiedRaster(input, contentType) is true |
| [api/_lib/commons-raster.ts:240](../api/_lib/commons-raster.ts#L240) | Error/validation | Image processing was cancelled. | stop(); signal.reason ?? |
| [api/_lib/commons-raster.ts:240](../api/_lib/commons-raster.ts#L240) | Message output | signal.reason ?? new CatalogError('Image processing was cancelled.', 504, 'timeout') | stop(); when its owning surface/operation is used |
| [api/_lib/commons-raster.ts:245](../api/_lib/commons-raster.ts#L245) | Message output | new CatalogError('The reusable image took too long to process.', 504, 'timeout') | timeout(); when its owning surface/operation is used |
| [api/_lib/commons-raster.ts:245](../api/_lib/commons-raster.ts#L245) | Error/validation | The reusable image took too long to process. | timeout(); when its owning surface/operation is used |
| [api/_lib/commons-raster.ts:259](../api/_lib/commons-raster.ts#L259) | Error/validation | The image dimensions or page count did not match its public metadata. | encode(); !['png', 'jpeg', 'webp'].includes(metadata.format ?? '') &#124;&#124; !metadata.width &#124;&#124; !metadata.height &#124;&#124; metadata.width &gt; 640 &#124;&#124; metadata.height &gt; 640 &#124;&#124; (metadata.pages ?? 1) !== 1 &#124;&#124; metadata.width !== permission.width &#124;&#124; metadata.height !== permission.height is true |
| [api/_lib/commons-raster.ts:269](../api/_lib/commons-raster.ts#L269) | Error/validation | The reusable image exceeded the detail image budget. | encode(); data.length &gt; ENRICHMENT_LIMITS.imageBytes is true |
| [api/_lib/commons-raster.ts:292](../api/_lib/commons-raster.ts#L292) | Message/fragment | Licensed game artwork from Wikimedia Commons | encode(); when its owning surface/operation is used |
## api/_lib/production-alert.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [api/_lib/production-alert.ts:14](../api/_lib/production-alert.ts#L14) | Message/fragment | LeulTew | ALERT_OWNER(); when its owning surface/operation is used |
| [api/_lib/production-alert.ts:17](../api/_lib/production-alert.ts#L17) | Message/fragment | Production alert: client error or CSP report spike | ALERT_TITLE(); when its owning surface/operation is used |
| [api/_lib/production-alert.ts:40](../api/_lib/production-alert.ts#L40) | Message/fragment | more categories | OVERFLOW(); when its owning surface/operation is used |
| [api/_lib/production-alert.ts:120](../api/_lib/production-alert.ts#L120) | Message/fragment | ${new Date(Math.floor(at / MINUTE_MS) * MINUTE_MS).toISOString().slice(0, 16)}Z | minute(); when its owning surface/operation is used |
| [api/_lib/production-alert.ts:127](../api/_lib/production-alert.ts#L127) | Message/fragment | - Window: one function instance's last hour, ${minute(time - ALERT_WINDOW_MS)} to ${minute(time)} | alertBody(); when its owning surface/operation is used |
| [api/_lib/production-alert.ts:135](../api/_lib/production-alert.ts#L135) | Message/fragment | Only fixed report categories and counts are included. The &#96;client-error-count&#96; and &#96;csp-count&#96; log lines of this deployment have the detail. | alertBody(); when its owning surface/operation is used |
| [api/_lib/production-alert.ts:141](../api/_lib/production-alert.ts#L141) | Message/fragment | GitHub refused the alert. | module-defined copy; when its owning surface/operation is used |
| [api/_lib/production-alert.ts:157](../api/_lib/production-alert.ts#L157) | Message/fragment | Bearer ${token} | response(); when its owning surface/operation is used |
| [api/_lib/production-alert.ts:271](../api/_lib/production-alert.ts#L271) | Message/fragment | ${plural(top, 'report')} named one error class and area (the alert is at ${ALERT_THRESHOLDS.sameClassAndArea}) | reasons(); top &gt;= ALERT_THRESHOLDS.sameClassAndArea is true |
| [api/_lib/production-alert.ts:275](../api/_lib/production-alert.ts#L275) | Message/fragment | ${plural(total, 'client error report')} in all (the alert is at ${ALERT_THRESHOLDS.clientErrorReports}) | reasons(); total &gt;= ALERT_THRESHOLDS.clientErrorReports is true |
| [api/_lib/production-alert.ts:280](../api/_lib/production-alert.ts#L280) | Message/fragment | Client error reports crossed an alert threshold: ${reasons.join('; ')}. | createClientErrorAlert(); when its owning surface/operation is used |
| [api/_lib/production-alert.ts:281](../api/_lib/production-alert.ts#L281) | Message/fragment | Client error reports in the window: ${total} | createClientErrorAlert(); when its owning surface/operation is used |
| [api/_lib/production-alert.ts:304](../api/_lib/production-alert.ts#L304) | Message/fragment | Main documents reported ${plural(total, 'CSP violation')} in the last hour (the alert is at ${ALERT_THRESHOLDS.mainDocumentCspViolations}). | createCspAlert(); when its owning surface/operation is used |
| [api/_lib/production-alert.ts:305](../api/_lib/production-alert.ts#L305) | Message/fragment | Main-document CSP violations in the window: ${total} | createCspAlert(); when its owning surface/operation is used |
## api/_lib/public-http.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [api/_lib/public-http.ts:1](../api/_lib/public-http.ts#L1) | Message/fragment | Play100Catalog/2.0 (https://play-100-collection.vercel.app; public game metadata lookup) | USER_AGENT(); when its owning surface/operation is used |
| [api/_lib/public-http.ts:30](../api/_lib/public-http.ts#L30) | Error/validation | The public source URL is invalid. | requirePublicUrl(); operation rejected or threw |
| [api/_lib/public-http.ts:41](../api/_lib/public-http.ts#L41) | Error/validation | The public source URL is not allowed. | requirePublicUrl(); url.protocol !== 'https:' &#124;&#124; !hosts.includes(url.hostname) &#124;&#124; url.username &#124;&#124; url.password &#124;&#124; url.port &#124;&#124; url.hash &#124;&#124; /[\s\\]/.test(raw) is true |
| [api/_lib/public-http.ts:66](../api/_lib/public-http.ts#L66) | Error/validation | The public source took too long to reply. Try again later. | timeout(); when its owning surface/operation is used |
| [api/_lib/public-http.ts:101](../api/_lib/public-http.ts#L101) | Error/validation | This catalog is receiving too many requests. Wait a moment and try again. | read(); response.status === 429 is true |
| [api/_lib/public-http.ts:110](../api/_lib/public-http.ts#L110) | Error/validation | The source catalog is unavailable (${response.status}). Try again later or add a game manually. | read(); !response.ok is true |
| [api/_lib/public-http.ts:117](../api/_lib/public-http.ts#L117) | Error/validation | The public source returned an unsupported content type. | read(); options.contentTypes &amp;&amp; !options.contentTypes.includes(contentType) is true |
| [api/_lib/public-http.ts:121](../api/_lib/public-http.ts#L121) | Error/validation | The source response was too large to import safely. Try a more specific search. | read(); Number(response.headers.get('content-length')) &gt; maxBytes is true |
| [api/_lib/public-http.ts:123](../api/_lib/public-http.ts#L123) | Error/validation | The catalog returned no data. | read(); !response.body is true |
| [api/_lib/public-http.ts:138](../api/_lib/public-http.ts#L138) | Error/validation | The source response was too large to import safely. Try a more specific search. | read(); size &gt; maxBytes is true |
| [api/_lib/public-http.ts:161](../api/_lib/public-http.ts#L161) | Error/validation | The public catalog could not be reached. Please try again later. | publicBytes(); operation rejected or threw |
| [api/_lib/public-http.ts:188](../api/_lib/public-http.ts#L188) | Error/validation | The source returned something other than readable catalog data. | upstreamJson(); operation rejected or threw |
| [api/_lib/public-http.ts:201](../api/_lib/public-http.ts#L201) | Error/validation | The public source is temporarily busy or rejected the request. Please try again later. | upstreamJson(); payload &amp;&amp; typeof payload === 'object' &amp;&amp; !Array.isArray(payload) &amp;&amp; 'error' in payload &amp;&amp; payload.error &amp;&amp; typeof payload.error === 'object' &amp;&amp; !Array.isArray(payload.error) is true |
## api/_lib/report-body.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [api/_lib/report-body.ts:5](../api/_lib/report-body.ts#L5) | Message/fragment | Operational report rejected. | module-defined copy; when its owning surface/operation is used |
## api/_lib/report-handler.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [api/_lib/report-handler.ts:46](../api/_lib/report-handler.ts#L46) | Message/fragment | Allow | createReportHandler(); request.method !== 'POST' is true |
## api/auth-helper.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [api/auth-helper.ts:39](../api/auth-helper.ts#L39) | Message/fragment | connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com | authHelperCsp(); when its owning surface/operation is used |
| [api/auth-helper.ts:45](../api/auth-helper.ts#L45) | Message/fragment | report-to csp | authHelperCsp(); when its owning surface/operation is used |
| [api/auth-helper.ts:99](../api/auth-helper.ts#L99) | Message/fragment | SAMEORIGIN | baseHeaders(); when its owning surface/operation is used |
| [api/auth-helper.ts:124](../api/auth-helper.ts#L124) | Message/fragment | auth helper upstream failure | module-defined copy; when its owning surface/operation is used |
| [api/auth-helper.ts:269](../api/auth-helper.ts#L269) | Message/fragment | The sign-in helper is unavailable. Please try again later. | sendTemplate(); rewritten === null is true |
| [api/auth-helper.ts:283](../api/auth-helper.ts#L283) | Message/fragment | Allow | createAuthHelperHandler(); request.method !== 'GET' &amp;&amp; request.method !== 'HEAD' is true |
| [api/auth-helper.ts:284](../api/auth-helper.ts#L284) | Message/fragment | Only GET and HEAD are supported for this sign-in helper. | createAuthHelperHandler(); request.method !== 'GET' &amp;&amp; request.method !== 'HEAD' is true |
| [api/auth-helper.ts:291](../api/auth-helper.ts#L291) | Message/fragment | Not found. | createAuthHelperHandler(); !AUTH_HELPER_PAGES.includes(page as AuthHelperPage) is true |
| [api/auth-helper.ts:327](../api/auth-helper.ts#L327) | Message/fragment | Location | createAuthHelperHandler(); result.kind === 'template' is false; result.kind === 'redirect' is true |
| [api/auth-helper.ts:332](../api/auth-helper.ts#L332) | Message/fragment | The sign-in helper is busy. Please wait a few seconds and try again. | createAuthHelperHandler(); result.kind === 'template' is false; result.kind === 'redirect' is false; usable is false; result.kind === 'busy' is true |
| [api/auth-helper.ts:339](../api/auth-helper.ts#L339) | Message/fragment | The sign-in helper took too long to load. Please try again. | createAuthHelperHandler(); result.kind === 'template' is false; result.kind === 'redirect' is false; usable is false; result.kind === 'busy' is false; result.failure.status === 504 is true |
| [api/auth-helper.ts:340](../api/auth-helper.ts#L340) | Message/fragment | The sign-in helper is unavailable. Please try again later. | createAuthHelperHandler(); result.kind === 'template' is false; result.kind === 'redirect' is false; usable is false; result.kind === 'busy' is false; result.failure.status === 504 is false |
## api/catalog-detail.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [api/catalog-detail.ts:69](../api/catalog-detail.ts#L69) | Message/fragment | This source is receiving too many requests. Try again after the indicated delay. | cooledDown(); remaining &gt; 0 is true |
| [api/catalog-detail.ts:91](../api/catalog-detail.ts#L91) | Message/fragment | This public source could not be read. Other available details are unchanged. | message(); operation rejected or threw; error instanceof CatalogError is false |
| [api/catalog-detail.ts:103](../api/catalog-detail.ts#L103) | Error/validation | This game is already in The 100. Open its original collection entry. | getCatalogDetail(); canonicalCatalogId(id) !== id is true |
| [api/catalog-detail.ts:107](../api/catalog-detail.ts#L107) | Error/validation | Choose an exact public catalog game ID, not a title, private record or URL. | getCatalogDetail(); !identity is true |
| [api/catalog-detail.ts:122](../api/catalog-detail.ts#L122) | Error/validation | Public detail lookups are busy. Please wait before retrying. | getCatalogDetail(); !entry is true; !release is true |
| [api/catalog-detail.ts:127](../api/catalog-detail.ts#L127) | Error/validation | Public game details took too long to load. Try again later. | deadline(); !entry is true |
| [api/catalog-detail.ts:193](../api/catalog-detail.ts#L193) | Message/fragment | FreeToGame does not document review scores or a reusable image grant for this lookup. Its game data and source link remain available. | freeToGameDetail(); when its owning surface/operation is used |
| [api/catalog-detail.ts:213](../api/catalog-detail.ts#L213) | Message/fragment | No verified Steam ID is available while the game source is unavailable. | withoutEntity(); when its owning surface/operation is used |
| [api/catalog-detail.ts:219](../api/catalog-detail.ts#L219) | Message/fragment | Existing bundled artwork is unchanged. No new image was verified. | withoutEntity(); when its owning surface/operation is used |
| [api/catalog-detail.ts:242](../api/catalog-detail.ts#L242) | Error/validation | Wikidata did not return this exact video-game identity. No replacement was chosen. | entityResult(); !entity is true |
| [api/catalog-detail.ts:263](../api/catalog-detail.ts#L263) | Error/validation | Wikidata issuer or platform names could not be read. | [names, steamResult, imageResult](); !entities is true |
| [api/catalog-detail.ts:316](../api/catalog-detail.ts#L316) | Message/fragment | Reported review scores from Wikidata; not independently verified or blended. | sources(); names.error ??; ratings.some((rating) =&gt; rating.source === 'wikidata') is true |
| [api/catalog-detail.ts:317](../api/catalog-detail.ts#L317) | Message/fragment | Wikidata supplied no supported score with an unambiguous issuer and scale. | sources(); names.error ??; ratings.some((rating) =&gt; rating.source === 'wikidata') is false |
| [api/catalog-detail.ts:325](../api/catalog-detail.ts#L325) | Message/fragment | Steam user recommendations, not a critic rating. Steam purchases, all languages, off-topic activity excluded. | sources(); steamResult.error ??; steamResult.value is true |
| [api/catalog-detail.ts:331](../api/catalog-detail.ts#L331) | Message/fragment | More than one Steam app is listed; no rating was chosen. | sources(); steamResult.error ??; steamResult.value is false; steam.ambiguous is true |
| [api/catalog-detail.ts:333](../api/catalog-detail.ts#L333) | Message/fragment | Steam supplied no user recommendations for this query. | sources(); steamResult.error ??; steamResult.value is false; steam.ambiguous is false; steam.id is true |
| [api/catalog-detail.ts:334](../api/catalog-detail.ts#L334) | Message/fragment | No unambiguous Steam app ID is listed for this game. | sources(); steamResult.error ??; steamResult.value is false; steam.ambiguous is false; steam.id is false |
| [api/catalog-detail.ts:339](../api/catalog-detail.ts#L339) | Message/fragment | A licensed Commons raster was verified; full credit and license are shown. | sources(); imageResult.error ??; imageResult.value is true |
| [api/catalog-detail.ts:341](../api/catalog-detail.ts#L341) | Message/fragment | The existing licensed bundled artwork is used. | sources(); imageResult.error ??; imageResult.value is false; hasKnownDiscoveryArtwork(id) is true |
| [api/catalog-detail.ts:342](../api/catalog-detail.ts#L342) | Message/fragment | No unambiguous reusable Commons image was verified. | sources(); imageResult.error ??; imageResult.value is false; hasKnownDiscoveryArtwork(id) is false |
| [api/catalog-detail.ts:356](../api/catalog-detail.ts#L356) | Error/validation | The public detail response exceeded its size budget. | lookupDetail(); new TextEncoder().encode(JSON.stringify(result)).byteLength &gt; ENRICHMENT_LIMITS.responseBytes is true |
| [api/catalog-detail.ts:370](../api/catalog-detail.ts#L370) | Message/fragment | Allow | handler(); request.method !== 'GET' is true |
| [api/catalog-detail.ts:373](../api/catalog-detail.ts#L373) | Message/fragment | Only public game-detail GET requests are supported. | handler(); request.method !== 'GET' is true |
| [api/catalog-detail.ts:379](../api/catalog-detail.ts#L379) | Message/fragment | Provide one exact public game ID only. | handler(); !id &#124;&#124; id.length &gt; 40 &#124;&#124; url.searchParams.size !== 1 &#124;&#124; url.searchParams.getAll('id').length !== 1 is true |
| [api/catalog-detail.ts:385](../api/catalog-detail.ts#L385) | Error/validation | Public game details took too long to load. Try again later. | timeout(); when its owning surface/operation is used |
| [api/catalog-detail.ts:406](../api/catalog-detail.ts#L406) | Error/validation | Public game details could not be loaded. Your saved data is unchanged. | error(); operation rejected or threw; controller.signal.reason instanceof CatalogError is false; cause instanceof CatalogError is false |
## api/catalog.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [api/catalog.ts:101](../api/catalog.ts#L101) | Error/validation | Wikidata returned an unexpected search format. | wikidataPage(); !Array.isArray(hits) &#124;&#124; typeof total !== 'number' &#124;&#124; !Number.isSafeInteger(total) is true |
| [api/catalog.ts:124](../api/catalog.ts#L124) | Error/validation | Wikidata could not supply the matching game records. | wikidataPage(); !entities is true |
| [api/catalog.ts:151](../api/catalog.ts#L151) | Error/validation | Wikidata could not resolve studio and genre labels. | wikidataPage(); related.length is true; !labelEntities is true |
| [api/catalog.ts:173](../api/catalog.ts#L173) | Message/fragment | Wikidata lists many games, not all. This search includes entries classified as video games. Its structured data is CC0. | wikidataPage(); when its owning surface/operation is used |
| [api/catalog.ts:174](../api/catalog.ts#L174) | Message/fragment | A year appears only when the sources agree on one. | wikidataPage(); when its owning surface/operation is used |
| [api/catalog.ts:176](../api/catalog.ts#L176) | Message/fragment | Some search hits lacked a usable title or current video-game classification and were not imported. | wikidataPage(); validated.length &lt; ids.length is true |
| [api/catalog.ts:190](../api/catalog.ts#L190) | Error/validation | Public catalog searches are busy. Please wait before retrying. | admit(); !release is true |
| [api/catalog.ts:214](../api/catalog.ts#L214) | Error/validation | FreeToGame returned an unexpected catalog format. | fillFreeCatalog(); !Array.isArray(payload) is true |
| [api/catalog.ts:251](../api/catalog.ts#L251) | Error/validation | FreeToGame did not return usable game records. | fillFreeCatalog(); payload.length &amp;&amp; !records.length is true |
| [api/catalog.ts:281](../api/catalog.ts#L281) | Message/fragment | Game data from FreeToGame.com. This source covers its free-to-play catalog, not every commercial game. No artwork or review scores are copied. | freeToGamePage(); when its owning surface/operation is used |
| [api/catalog.ts:306](../api/catalog.ts#L306) | Message/fragment | Allow | handler(); request.method !== 'GET' is true |
| [api/catalog.ts:307](../api/catalog.ts#L307) | Message/fragment | Only catalog lookup GET requests are supported. | handler(); request.method !== 'GET' is true |
| [api/catalog.ts:329](../api/catalog.ts#L329) | Message/fragment | Choose a supported source, a search of up to 80 characters and a valid page offset. | handler(); (source !== 'wikidata' &amp;&amp; source !== 'freetogame') &#124;&#124; query.length &gt; 80 &#124;&#124; [...query].some((character) =&gt; character.charCodeAt(0) &lt; 32) &#124;&#124; !/^\d+$/.test(rawOffset) &#124;&#124; !Number.isSafeInteger(offset) &#124;&#124; offset &lt; 0 &#124;&#124; offset &gt; 10000 &#124;&#124; [...url.searchParams.keys()].some( (key) =&gt; !['source', 'q', 'offset'].includes(key) &#124;&#124; url.searchParams.getAll(key).length !== 1, ) is true |
| [api/catalog.ts:349](../api/catalog.ts#L349) | Message/fragment | The source took too long to reply. Try again later or add a game manually. | message(); operation rejected or threw; controller.signal.aborted is true |
| [api/catalog.ts:352](../api/catalog.ts#L352) | Message/fragment | The public catalog could not be reached. Please try again later. | message(); operation rejected or threw; controller.signal.aborted is false; error instanceof CatalogError is false |
## api/csp-report.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [api/csp-report.ts:79](../api/csp-report.ts#L79) | Error/validation | Invalid CSP report count. | cspCounts(); !Array.isArray(rows) &#124;&#124; !rows.length &#124;&#124; rows.length &gt; MAX_REPORTS is true |
| [api/csp-report.ts:84](../api/csp-report.ts#L84) | Error/validation | Invalid CSP report. | cspCounts(); !body &#124;&#124; (batch &amp;&amp; entry?.type !== 'csp-violation') is true |
| [api/csp-report.ts:87](../api/csp-report.ts#L87) | Error/validation | Invalid CSP directive. | cspCounts(); typeof directive !== 'string' &#124;&#124; !directives.has(directive.split(' ')[0]!) is true |
## api/operational-probe.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [api/operational-probe.ts:70](../api/operational-probe.ts#L70) | Message/fragment | Allow | createOperationalProbe(); request.method !== 'GET' &#124;&#124; request.url?.includes('?') is true |
| [api/operational-probe.ts:97](../api/operational-probe.ts#L97) | Message/fragment | FAIL | createOperationalProbe(); Object.values(result).every(Boolean) is false |
| [api/operational-probe.ts:97](../api/operational-probe.ts#L97) | Message/fragment | OK | createOperationalProbe(); Object.values(result).every(Boolean) is true |
## index.html

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [index.html:100](../index.html#L100) | HTML fallback | Play 100 A curated collection of 100 games. Enable JavaScript for search, filters and your private Play later list, or explore the complete downloadable workbook. Download the 100-game workbook | JavaScript unavailable (noscript) |
## public/404.html

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [public/404.html:14](../public/404.html#L14) | HTML fallback | PLAY 100 . Home | Unknown page static fallback |
| [public/404.html:19](../public/404.html#L19) | HTML fallback | This page doesn't exist. | Unknown page static fallback |
| [public/404.html:20](../public/404.html#L20) | HTML fallback | The link may be old or mistyped. All 100 games, Discover and your games are still here. | Unknown page static fallback |
| [public/404.html:23](../public/404.html#L23) | HTML fallback | Open The 100 Open Discover Open My games | Unknown page static fallback |
## public/pwa/offline.html

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [public/pwa/offline.html:12](../public/pwa/offline.html#L12) | HTML fallback | This page needs a connection. | Navigation unavailable while offline |
| [public/pwa/offline.html:13](../public/pwa/offline.html#L13) | HTML fallback | Accounts, sharing and online game searches need a connection. Offline preparation does not save account details or private forms. | Navigation unavailable while offline |
| [public/pwa/offline.html:14](../public/pwa/offline.html#L14) | HTML fallback | After offline access finishes preparing, the public collection and your available device library can open without a connection. Your existing guest and account libraries remain separate. | Navigation unavailable while offline |
| [public/pwa/offline.html:15](../public/pwa/offline.html#L15) | HTML fallback | Open The 100 Open My games Try this page again | Navigation unavailable while offline |
## src/App.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/App.tsx:149](../src/App.tsx#L149) | Message output | 'Sign in to compare with friends. Device pins stay separate from account pins.' | accountEntry(); currentOnline.current?.identity &#124;&#124; page === 'account' is false; opened === 'compare' is true |
| [src/App.tsx:149](../src/App.tsx#L149) | Message/fragment | Sign in to compare with friends. Device pins stay separate from account pins. | accountEntry(); currentOnline.current?.identity &#124;&#124; page === 'account' is false; opened === 'compare' is true |
| [src/App.tsx:174](../src/App.tsx#L174) | Message/fragment | Play 100 — a collection worth playing | title(); slug &amp;&amp; selectedGame is false |
## src/cloud/account-deletion-action.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/account-deletion-action.ts:72](../src/cloud/account-deletion-action.ts#L72) | Error/validation | The signed-in account changed. Nothing was deleted. | deletedAccountCopy(); scopeUid(scope) !== uid is true |
| [src/cloud/account-deletion-action.ts:107](../src/cloud/account-deletion-action.ts#L107) | Message output | 'Finish the open edit before deleting online data.' | createAccountDeletion(); hasPendingEdits() is true |
| [src/cloud/account-deletion-action.ts:107](../src/cloud/account-deletion-action.ts#L107) | Message/fragment | Finish the open edit before deleting online data. | createAccountDeletion(); hasPendingEdits() is true |
| [src/cloud/account-deletion-action.ts:115](../src/cloud/account-deletion-action.ts#L115) | Error/validation | Sign in to the account you want to delete. | createAccountDeletion(); !signedIn &#124;&#124; signedIn.uid !== identityRef.current?.uid &#124;&#124; !scope is true |
| [src/cloud/account-deletion-action.ts:122](../src/cloud/account-deletion-action.ts#L122) | Message output | null | createAccountDeletion(); when its owning surface/operation is used |
| [src/cloud/account-deletion-action.ts:125](../src/cloud/account-deletion-action.ts#L125) | Error/validation | Connect to the internet before deleting online data. | createAccountDeletion(); !navigator.onLine is true |
| [src/cloud/account-deletion-action.ts:127](../src/cloud/account-deletion-action.ts#L127) | Error/validation | Confirm your password before deleting. | createAccountDeletion(); hasProvider(identity, EmailAuthProvider.PROVIDER_ID) is true; !password is true |
| [src/cloud/account-deletion-action.ts:144](../src/cloud/account-deletion-action.ts#L144) | Error/validation | Google confirmation is no longer current. Review the account and confirm again. | createAccountDeletion(); hasProvider(identity, EmailAuthProvider.PROVIDER_ID) is false; typeof token.claims.auth_time !== 'number' &#124;&#124; token.claims.auth_time * 1000 &lt; approval.startedAt - 5000 is true |
| [src/cloud/account-deletion-action.ts:151](../src/cloud/account-deletion-action.ts#L151) | Error/validation | The signed-in account changed. Return to the same account before continuing. | createAccountDeletion(); cloudAuth.currentUser?.uid !== signedIn.uid &#124;&#124; identityRef.current?.uid !== signedIn.uid &#124;&#124; authSessionEpochRef.current !== session is true |
| [src/cloud/account-deletion-action.ts:179](../src/cloud/account-deletion-action.ts#L179) | Error/validation | This account is now verified. Review its online data before using full account deletion. | createAccountDeletion(); removeAccount &amp;&amp; !identityRef.current.verified is true; token.claims.email_verified === true is true |
| [src/cloud/account-deletion-action.ts:190](../src/cloud/account-deletion-action.ts#L190) | Error/validation | Verify this account before deleting existing online data. | createAccountDeletion(); !identityRef.current?.verified &#124;&#124; !sync.store is true |
| [src/cloud/account-deletion-action.ts:238](../src/cloud/account-deletion-action.ts#L238) | Error/validation | The signed-in account changed. Return to the same account before continuing. | createAccountDeletion(); !deletionOwnerMatches( user.uid, cloudAuth.currentUser?.uid, identityRef.current?.uid, session, authSessionEpochRef.current, ) is true |
| [src/cloud/account-deletion-action.ts:253](../src/cloud/account-deletion-action.ts#L253) | Message output | 'Deleting your online library…' | createAccountDeletion(); when its owning surface/operation is used |
| [src/cloud/account-deletion-action.ts:253](../src/cloud/account-deletion-action.ts#L253) | Message/fragment | Deleting your online library… | createAccountDeletion(); when its owning surface/operation is used |
| [src/cloud/account-deletion-action.ts:259](../src/cloud/account-deletion-action.ts#L259) | Error/validation | The signed-in account changed. Return to the same account before continuing. | createAccountDeletion(); !ownsDeletion() is true |
| [src/cloud/account-deletion-action.ts:260](../src/cloud/account-deletion-action.ts#L260) | Message/fragment | Deleting your online library… | createAccountDeletion(); kind === 'private' is true |
| [src/cloud/account-deletion-action.ts:260](../src/cloud/account-deletion-action.ts#L260) | Message/fragment | Deleting your ranking summary… | createAccountDeletion(); kind === 'private' is false |
| [src/cloud/account-deletion-action.ts:260](../src/cloud/account-deletion-action.ts#L260) | Message output | kind === 'private' ? 'Deleting your online library…' : 'Deleting your ranking summary…' | createAccountDeletion(); when its owning surface/operation is used |
| [src/cloud/account-deletion-action.ts:263](../src/cloud/account-deletion-action.ts#L263) | Message output | 'Deleting shared and public copies…' | createAccountDeletion(); when its owning surface/operation is used |
| [src/cloud/account-deletion-action.ts:263](../src/cloud/account-deletion-action.ts#L263) | Message/fragment | Deleting shared and public copies… | createAccountDeletion(); when its owning surface/operation is used |
| [src/cloud/account-deletion-action.ts:274](../src/cloud/account-deletion-action.ts#L274) | Error/validation | The signed-in account changed. Return to the same account before continuing. | createAccountDeletion(); await automatic.store.policy(user.uid) is true; cloudAuth.currentUser?.uid !== user.uid &#124;&#124; authSessionEpochRef.current !== session is true |
| [src/cloud/account-deletion-action.ts:277](../src/cloud/account-deletion-action.ts#L277) | Message output | 'Deleting shared and public copies…' | createAccountDeletion(); await automatic.store.policy(user.uid) is true |
| [src/cloud/account-deletion-action.ts:277](../src/cloud/account-deletion-action.ts#L277) | Message/fragment | Deleting shared and public copies… | createAccountDeletion(); await automatic.store.policy(user.uid) is true |
| [src/cloud/account-deletion-action.ts:279](../src/cloud/account-deletion-action.ts#L279) | Error/validation | Some shared copies are still stored. Choose Finish deleting to continue. | createAccountDeletion(); await automatic.store.policy(user.uid) is true; index === 249 is true |
| [src/cloud/account-deletion-action.ts:285](../src/cloud/account-deletion-action.ts#L285) | Error/validation | Some shared games are still stored. Choose Delete account to continue. | createAccountDeletion(); removeAccount is true; !shelfCleanup.done is true |
| [src/cloud/account-deletion-action.ts:290](../src/cloud/account-deletion-action.ts#L290) | Error/validation | Some connections are still stored. Choose Delete account to continue. | createAccountDeletion(); removeAccount is true; index === 99 is true |
| [src/cloud/account-deletion-action.ts:303](../src/cloud/account-deletion-action.ts#L303) | Error/validation | The account or online saving state changed. Refresh the page before continuing; your sign-in remains. | createAccountDeletion(); removeAccount is true; !ownsDeletion() &#124;&#124; !finalHead?.deleted &#124;&#124; finalHead.epoch !== deleting.epoch &#124;&#124; finalHead.cleanupEpoch !== deleting.epoch is true |
| [src/cloud/account-deletion-action.ts:312](../src/cloud/account-deletion-action.ts#L312) | Message/fragment | Your online data is deleted. To delete your sign-in, confirm your password again. | createAccountDeletion(); removeAccount is true; operation rejected or threw; cause &amp;&amp; typeof cause === 'object' &amp;&amp; 'code' in cause &amp;&amp; cause.code === 'auth/requires-recent-login' is true; hasProvider(identityRef.current, EmailAuthProvider.PROVIDER_ID) is true |
| [src/cloud/account-deletion-action.ts:313](../src/cloud/account-deletion-action.ts#L313) | Message/fragment | Your online data is deleted. Confirm with Google again to delete your sign-in. | createAccountDeletion(); removeAccount is true; operation rejected or threw; cause &amp;&amp; typeof cause === 'object' &amp;&amp; 'code' in cause &amp;&amp; cause.code === 'auth/requires-recent-login' is true; hasProvider(identityRef.current, EmailAuthProvider.PROVIDER_ID) is false |
| [src/cloud/account-deletion-action.ts:331](../src/cloud/account-deletion-action.ts#L331) | Message output | { key, state: 'complete' } | createAccountDeletion(); removeAccount is false |
| [src/cloud/account-deletion-action.ts:332](../src/cloud/account-deletion-action.ts#L332) | Message output | 'Your online copy was deleted. The copy on this device is still here.' | createAccountDeletion(); removeAccount is false |
| [src/cloud/account-deletion-action.ts:332](../src/cloud/account-deletion-action.ts#L332) | Message/fragment | Your online copy was deleted. The copy on this device is still here. | createAccountDeletion(); removeAccount is false |
| [src/cloud/account-deletion-action.ts:338](../src/cloud/account-deletion-action.ts#L338) | Message output | { key, state: 'incomplete' } | createAccountDeletion(); !success &amp;&amp; deletionStarted &amp;&amp; !deletionMarked is true |
## src/cloud/account-deletion.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/account-deletion.ts:128](../src/cloud/account-deletion.ts#L128) | Message output | null | useDeletionProbe(); !key is true |
| [src/cloud/account-deletion.ts:136](../src/cloud/account-deletion.ts#L136) | Message output | { key, state } | useDeletionProbe(); alive &amp;&amp; deletionProbeRef.current === probe is true |
## src/cloud/account-lifecycle.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/account-lifecycle.ts:10](../src/cloud/account-lifecycle.ts#L10) | Message/fragment | This sign-in belongs to a cancelled registration. Remove this sign-in from Account to start fresh with the same email. | CANCELLED_REGISTRATION_MESSAGE(); when its owning surface/operation is used |
| [src/cloud/account-lifecycle.ts:17](../src/cloud/account-lifecycle.ts#L17) | Error/validation | The account registration state could not be read. Nothing was changed. | readAccountLifecycle(); Object.keys(value).join() !== 'state' &#124;&#124; (value.state !== 'active' &amp;&amp; value.state !== 'cancelled') is true |
| [src/cloud/account-lifecycle.ts:34](../src/cloud/account-lifecycle.ts#L34) | Error/validation | The signed-in account changed. Nothing was deleted. | removeCancelledRegistration(); scopeUid(scope) !== user.uid &#124;&#124; !isCurrent() is true |
| [src/cloud/account-lifecycle.ts:36](../src/cloud/account-lifecycle.ts#L36) | Error/validation | The signed-in account changed. Nothing was deleted. | removeCancelledRegistration(); !isCurrent() is true |
| [src/cloud/account-lifecycle.ts:38](../src/cloud/account-lifecycle.ts#L38) | Error/validation | The signed-in account changed. Nothing was deleted. | removeCancelledRegistration(); !isCurrent() is true |
| [src/cloud/account-lifecycle.ts:64](../src/cloud/account-lifecycle.ts#L64) | Error/validation | This account has online activity. Verify its email before using full data and account deletion. | cancelUnusedRegistration(); current.exists() is true; current.data().state !== 'cancelled' is true |
## src/cloud/account-quota.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/account-quota.ts:20](../src/cloud/account-quota.ts#L20) | Message/fragment | You've reached 50 groups. Remove one to add another. | module-defined copy; when its owning surface/operation is used |
| [src/cloud/account-quota.ts:21](../src/cloud/account-quota.ts#L21) | Message/fragment | You've reached 1,000 blocked people. Unblock someone before adding another. | module-defined copy; when its owning surface/operation is used |
| [src/cloud/account-quota.ts:22](../src/cloud/account-quota.ts#L22) | Message/fragment | You've reached 100 reports. Wait for a review before sending another. | module-defined copy; when its owning surface/operation is used |
| [src/cloud/account-quota.ts:24](../src/cloud/account-quota.ts#L24) | Message/fragment | You've reached 1,000 connections and requests. Cancel a request, remove a connection, or try again later. | module-defined copy; when its owning surface/operation is used |
| [src/cloud/account-quota.ts:27](../src/cloud/account-quota.ts#L27) | Message/fragment | AccountQuotaFull | module-defined copy; when its owning surface/operation is used |
| [src/cloud/account-quota.ts:61](../src/cloud/account-quota.ts#L61) | Error/validation | Account limits could not be read. Nothing was changed. Try again later. | readQuotaSlots(); Object.keys(value).sort().join() !== 'ids,revision' &#124;&#124; !isUnknownArray(value.ids) &#124;&#124; new Set(value.ids).size !== value.ids.length &#124;&#124; !isSafeInteger(value.revision) &#124;&#124; value.revision &lt; 1 is true |
| [src/cloud/account-quota.ts:73](../src/cloud/account-quota.ts#L73) | Error/validation | This saved item is already counted. Refresh before trying again. | occupyQuotaSlot(); slots.ids.includes(id) is true |
| [src/cloud/account-quota.ts:93](../src/cloud/account-quota.ts#L93) | Error/validation | The saved list could not be counted. Refresh before adding another item. | requireVisibleCapacity(); !Number.isSafeInteger(scanned) &#124;&#124; scanned &lt; page.items.length &#124;&#124; (scanned === 0 &amp;&amp; page.cursor) is true |
## src/cloud/account-session.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/account-session.ts:111](../src/cloud/account-session.ts#L111) | Message/fragment | Account restoration timed out. Reload when connected, or keep using the device library. | timeout(); alive is true |
| [src/cloud/account-session.ts:197](../src/cloud/account-session.ts#L197) | Message output | 'Google is linked to this existing account.' | applyGoogleReturn(); transition.kind === 'sign-in' is false; transition.kind === 'link' is true |
| [src/cloud/account-session.ts:197](../src/cloud/account-session.ts#L197) | Message/fragment | Google is linked to this existing account. | applyGoogleReturn(); transition.kind === 'sign-in' is false; transition.kind === 'link' is true |
| [src/cloud/account-session.ts:199](../src/cloud/account-session.ts#L199) | Message output | 'This account changed while Google was open. Nothing was deleted. Review the account before confirming again.' | applyGoogleReturn(); transition.kind === 'sign-in' is false; transition.kind === 'link' is false; transition.kind === 'changed' is true |
| [src/cloud/account-session.ts:200](../src/cloud/account-session.ts#L200) | Message/fragment | This account changed while Google was open. Nothing was deleted. Review the account before confirming again. | applyGoogleReturn(); transition.kind === 'sign-in' is false; transition.kind === 'link' is false; transition.kind === 'changed' is true |
| [src/cloud/account-session.ts:204](../src/cloud/account-session.ts#L204) | Message output | 'Google confirmed this account. Nothing has been deleted; review and confirm the deletion below.' | applyGoogleReturn(); transition.kind === 'sign-in' is false; transition.kind === 'link' is false; transition.kind === 'changed' is false; transition.kind === 'approved' is true |
| [src/cloud/account-session.ts:204](../src/cloud/account-session.ts#L204) | Message/fragment | Google confirmed this account. Nothing has been deleted; review and confirm the deletion below. | applyGoogleReturn(); transition.kind === 'sign-in' is false; transition.kind === 'link' is false; transition.kind === 'changed' is false; transition.kind === 'approved' is true |
## src/cloud/AccountConfirmation.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/AccountConfirmation.tsx:22](../src/cloud/AccountConfirmation.tsx#L22) | Rendered copy | ${confirmation === 'signout-device' ? "Remove this device's account copy?" : confirmation === 'pause' ? 'Stop online saving?' : confirmation === 'remote' ? 'Use the online copy?' : confirmation === 'local' ? 'Replace the online copy?' : confirmation === 'delete-copy' ? 'Delete your online copy?' : cancelledRegistration ? 'Remove cancelled sign-in?' : identity.verified ? 'Delete your account?' : 'Cancel this registration?'} | AccountConfirmation(); confirmation &amp;&amp; |
| [src/cloud/AccountConfirmation.tsx:24](../src/cloud/AccountConfirmation.tsx#L24) | Message/fragment | Remove this device's account copy? | AccountConfirmation(); confirmation &amp;&amp;; confirmation === 'signout-device' is true |
| [src/cloud/AccountConfirmation.tsx:26](../src/cloud/AccountConfirmation.tsx#L26) | Message/fragment | Stop online saving? | AccountConfirmation(); confirmation &amp;&amp;; confirmation === 'signout-device' is false; confirmation === 'pause' is true |
| [src/cloud/AccountConfirmation.tsx:28](../src/cloud/AccountConfirmation.tsx#L28) | Message/fragment | Use the online copy? | AccountConfirmation(); confirmation &amp;&amp;; confirmation === 'signout-device' is false; confirmation === 'pause' is false; confirmation === 'remote' is true |
| [src/cloud/AccountConfirmation.tsx:30](../src/cloud/AccountConfirmation.tsx#L30) | Message/fragment | Replace the online copy? | AccountConfirmation(); confirmation &amp;&amp;; confirmation === 'signout-device' is false; confirmation === 'pause' is false; confirmation === 'remote' is false; confirmation === 'local' is true |
| [src/cloud/AccountConfirmation.tsx:32](../src/cloud/AccountConfirmation.tsx#L32) | Message/fragment | Delete your online copy? | AccountConfirmation(); confirmation &amp;&amp;; confirmation === 'signout-device' is false; confirmation === 'pause' is false; confirmation === 'remote' is false; confirmation === 'local' is false; confirmation === 'delete-copy' is true |
| [src/cloud/AccountConfirmation.tsx:34](../src/cloud/AccountConfirmation.tsx#L34) | Message/fragment | Remove cancelled sign-in? | AccountConfirmation(); confirmation &amp;&amp;; confirmation === 'signout-device' is false; confirmation === 'pause' is false; confirmation === 'remote' is false; confirmation === 'local' is false; confirmation === 'delete-copy' is false; cancelledRegistration is true |
| [src/cloud/AccountConfirmation.tsx:36](../src/cloud/AccountConfirmation.tsx#L36) | Message/fragment | Delete your account? | AccountConfirmation(); confirmation &amp;&amp;; confirmation === 'signout-device' is false; confirmation === 'pause' is false; confirmation === 'remote' is false; confirmation === 'local' is false; confirmation === 'delete-copy' is false; cancelledRegistration is false; identity.verified is true |
| [src/cloud/AccountConfirmation.tsx:37](../src/cloud/AccountConfirmation.tsx#L37) | Message/fragment | Cancel this registration? | AccountConfirmation(); confirmation &amp;&amp;; confirmation === 'signout-device' is false; confirmation === 'pause' is false; confirmation === 'remote' is false; confirmation === 'local' is false; confirmation === 'delete-copy' is false; cancelledRegistration is false; identity.verified is false |
| [src/cloud/AccountConfirmation.tsx:40](../src/cloud/AccountConfirmation.tsx#L40) | Rendered copy | This removes the cancelled sign-in and its account copy on this device. You can then register again with the same email. Your guest library stays here. | AccountConfirmation(); confirmation &amp;&amp;; cancelledRegistration &amp;&amp; confirmation === 'delete-account' &amp;&amp; |
| [src/cloud/AccountConfirmation.tsx:46](../src/cloud/AccountConfirmation.tsx#L46) | Rendered copy | If deletion is interrupted, your account stays and you can finish from this page later. | AccountConfirmation(); confirmation &amp;&amp;; identity.verified &amp;&amp; !cancelledRegistration &amp;&amp; confirmation.startsWith('delete') &amp;&amp; |
| [src/cloud/AccountConfirmation.tsx:48](../src/cloud/AccountConfirmation.tsx#L48) | Rendered copy | ${confirmation === 'signout-device' ? 'Sign out and remove only this account copy, its recovery data and sharing caches from this device. Your guest library and online copy are not deleted. Unsynced or newly changed data prevents removal.' : confirmation === 'pause' ? 'Uploads stop on all devices. Your saved copies remain available.' : confirmation === 'remote' ? "Replace this account's device library with the online copy. A recovery copy stays here." : confirmation === 'local' ? 'Replace the online library with this device copy. A newer update will require another choice.' : !identity.verified ? 'Cancel only if this registration has no prior online activity. Your device-only library stays here.' : 'Remove online profile and library data, unpublish its ranking and stop older sessions from restoring it. Export a backup first. Your guest library stays here.'} | AccountConfirmation(); confirmation &amp;&amp; |
| [src/cloud/AccountConfirmation.tsx:50](../src/cloud/AccountConfirmation.tsx#L50) | Message/fragment | Sign out and remove only this account copy, its recovery data and sharing caches from this device. Your guest library and online copy are not deleted. Unsynced or newly changed data prevents removal. | AccountConfirmation(); confirmation &amp;&amp;; confirmation === 'signout-device' is true |
| [src/cloud/AccountConfirmation.tsx:52](../src/cloud/AccountConfirmation.tsx#L52) | Message/fragment | Uploads stop on all devices. Your saved copies remain available. | AccountConfirmation(); confirmation &amp;&amp;; confirmation === 'signout-device' is false; confirmation === 'pause' is true |
| [src/cloud/AccountConfirmation.tsx:54](../src/cloud/AccountConfirmation.tsx#L54) | Message/fragment | Replace this account's device library with the online copy. A recovery copy stays here. | AccountConfirmation(); confirmation &amp;&amp;; confirmation === 'signout-device' is false; confirmation === 'pause' is false; confirmation === 'remote' is true |
| [src/cloud/AccountConfirmation.tsx:56](../src/cloud/AccountConfirmation.tsx#L56) | Message/fragment | Replace the online library with this device copy. A newer update will require another choice. | AccountConfirmation(); confirmation &amp;&amp;; confirmation === 'signout-device' is false; confirmation === 'pause' is false; confirmation === 'remote' is false; confirmation === 'local' is true |
| [src/cloud/AccountConfirmation.tsx:58](../src/cloud/AccountConfirmation.tsx#L58) | Message/fragment | Cancel only if this registration has no prior online activity. Your device-only library stays here. | AccountConfirmation(); confirmation &amp;&amp;; confirmation === 'signout-device' is false; confirmation === 'pause' is false; confirmation === 'remote' is false; confirmation === 'local' is false; !identity.verified is true |
| [src/cloud/AccountConfirmation.tsx:59](../src/cloud/AccountConfirmation.tsx#L59) | Message/fragment | Remove online profile and library data, unpublish its ranking and stop older sessions from restoring it. Export a backup first. Your guest library stays here. | AccountConfirmation(); confirmation &amp;&amp;; confirmation === 'signout-device' is false; confirmation === 'pause' is false; confirmation === 'remote' is false; confirmation === 'local' is false; !identity.verified is false |
| [src/cloud/AccountConfirmation.tsx:64](../src/cloud/AccountConfirmation.tsx#L64) | Rendered copy | Confirm your password | AccountConfirmation(); confirmation &amp;&amp;; (confirmation === 'delete-copy' &#124;&#124; confirmation === 'delete-account') &amp;&amp; hasProvider(identity, EmailAuthProvider.PROVIDER_ID) &amp;&amp; |
| [src/cloud/AccountConfirmation.tsx:77](../src/cloud/AccountConfirmation.tsx#L77) | Rendered copy | ${googleConfirmed ? 'Google confirmed this account. Confirm below to delete.' : 'Confirm with Google in this tab, then return here. Returning does not delete anything.'} | AccountConfirmation(); confirmation &amp;&amp;; googleConfirmation &amp;&amp; |
| [src/cloud/AccountConfirmation.tsx:79](../src/cloud/AccountConfirmation.tsx#L79) | Message/fragment | Google confirmed this account. Confirm below to delete. | AccountConfirmation(); confirmation &amp;&amp;; googleConfirmation &amp;&amp;; googleConfirmed is true |
| [src/cloud/AccountConfirmation.tsx:80](../src/cloud/AccountConfirmation.tsx#L80) | Message/fragment | Confirm with Google in this tab, then return here. Returning does not delete anything. | AccountConfirmation(); confirmation &amp;&amp;; googleConfirmation &amp;&amp;; googleConfirmed is false |
| [src/cloud/AccountConfirmation.tsx:84](../src/cloud/AccountConfirmation.tsx#L84) | Live region | ${error} | AccountConfirmation(); confirmation &amp;&amp;; error &amp;&amp; |
| [src/cloud/AccountConfirmation.tsx:89](../src/cloud/AccountConfirmation.tsx#L89) | Rendered copy | Keep my data | AccountConfirmation(); confirmation &amp;&amp; |
| [src/cloud/AccountConfirmation.tsx:92](../src/cloud/AccountConfirmation.tsx#L92) | Rendered copy | ${busy ? 'Working…' : confirmation === 'signout-device' ? 'Sign out and remove copy' : googleConfirmation &amp;&amp; !googleConfirmed ? 'Continue in this tab' : confirmation.startsWith('delete') ? 'Confirm deletion' : 'Confirm this choice'} | AccountConfirmation(); confirmation &amp;&amp; |
| [src/cloud/AccountConfirmation.tsx:100](../src/cloud/AccountConfirmation.tsx#L100) | Message/fragment | Working… | AccountConfirmation(); confirmation &amp;&amp;; busy is true |
| [src/cloud/AccountConfirmation.tsx:102](../src/cloud/AccountConfirmation.tsx#L102) | Message/fragment | Sign out and remove copy | AccountConfirmation(); confirmation &amp;&amp;; busy is false; confirmation === 'signout-device' is true |
| [src/cloud/AccountConfirmation.tsx:104](../src/cloud/AccountConfirmation.tsx#L104) | Message/fragment | Continue in this tab | AccountConfirmation(); confirmation &amp;&amp;; busy is false; confirmation === 'signout-device' is false; googleConfirmation &amp;&amp; !googleConfirmed is true |
| [src/cloud/AccountConfirmation.tsx:106](../src/cloud/AccountConfirmation.tsx#L106) | Message/fragment | Confirm deletion | AccountConfirmation(); confirmation &amp;&amp;; busy is false; confirmation === 'signout-device' is false; googleConfirmation &amp;&amp; !googleConfirmed is false; confirmation.startsWith('delete') is true |
| [src/cloud/AccountConfirmation.tsx:107](../src/cloud/AccountConfirmation.tsx#L107) | Message/fragment | Confirm this choice | AccountConfirmation(); confirmation &amp;&amp;; busy is false; confirmation === 'signout-device' is false; googleConfirmation &amp;&amp; !googleConfirmed is false; confirmation.startsWith('delete') is false |
## src/cloud/AccountLibrarySection.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/AccountLibrarySection.tsx:46](../src/cloud/AccountLibrarySection.tsx#L46) | Rendered copy | Online saving | AccountLibrarySection(); when its owning surface/operation is used |
| [src/cloud/AccountLibrarySection.tsx:47](../src/cloud/AccountLibrarySection.tsx#L47) | Live region | ${identity.verified ? SYNC_LABELS[status] : identity.verificationPending ? 'Sign-in needs attention' : 'Verify your email'} | AccountLibrarySection(); when its owning surface/operation is used |
| [src/cloud/AccountLibrarySection.tsx:51](../src/cloud/AccountLibrarySection.tsx#L51) | Message/fragment | Sign-in needs attention | AccountLibrarySection(); identity.verified is false; identity.verificationPending is true |
| [src/cloud/AccountLibrarySection.tsx:52](../src/cloud/AccountLibrarySection.tsx#L52) | Message/fragment | Verify your email | AccountLibrarySection(); identity.verified is false; identity.verificationPending is false |
| [src/cloud/AccountLibrarySection.tsx:56](../src/cloud/AccountLibrarySection.tsx#L56) | Rendered copy | Retry sign-in check | AccountLibrarySection(); identity.verificationPending is true |
| [src/cloud/AccountLibrarySection.tsx:67](../src/cloud/AccountLibrarySection.tsx#L67) | Rendered copy | ${resendIn ? &#96;Resend in ${resendIn}s&#96; : 'Send verification email'} | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is true |
| [src/cloud/AccountLibrarySection.tsx:74](../src/cloud/AccountLibrarySection.tsx#L74) | Message/fragment | Resend in ${resendIn}s | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is true; resendIn is true |
| [src/cloud/AccountLibrarySection.tsx:74](../src/cloud/AccountLibrarySection.tsx#L74) | Message/fragment | Send verification email | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is true; resendIn is false |
| [src/cloud/AccountLibrarySection.tsx:76](../src/cloud/AccountLibrarySection.tsx#L76) | Rendered copy | I verified my email | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is true |
| [src/cloud/AccountLibrarySection.tsx:94](../src/cloud/AccountLibrarySection.tsx#L94) | Rendered copy | ${head.deleted ? ( &lt;&gt; Online saving is off because you deleted your online copy. Turning it on starts a new online copy. {deletionState !== 'complete' &amp;&amp; " It doesn't finish the earlier deletion."} &lt;/&gt; ) : ( 'Online saving is stopped. Turn it on below when you want to save online again.' )} | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is true; head &amp;&amp; (!head.enabled &#124;&#124; head.deleted) &amp;&amp; |
| [src/cloud/AccountLibrarySection.tsx:98](../src/cloud/AccountLibrarySection.tsx#L98) | Message/fragment | It doesn't finish the earlier deletion. | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is true; head &amp;&amp; (!head.enabled &#124;&#124; head.deleted) &amp;&amp;; head.deleted is true; deletionState !== 'complete' &amp;&amp; |
| [src/cloud/AccountLibrarySection.tsx:101](../src/cloud/AccountLibrarySection.tsx#L101) | Message/fragment | Online saving is stopped. Turn it on below when you want to save online again. | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is true; head &amp;&amp; (!head.enabled &#124;&#124; head.deleted) &amp;&amp;; head.deleted is false |
| [src/cloud/AccountLibrarySection.tsx:106](../src/cloud/AccountLibrarySection.tsx#L106) | Live region | Checking saved copies… | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is true; !remoteReady is true |
| [src/cloud/AccountLibrarySection.tsx:109](../src/cloud/AccountLibrarySection.tsx#L109) | Rendered copy | ${choices[0]?.label} | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is true; !remoteReady is false; choices.length === 1 is true |
| [src/cloud/AccountLibrarySection.tsx:110](../src/cloud/AccountLibrarySection.tsx#L110) | Rendered copy | ${choices[0]?.detail} | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is true; !remoteReady is false; choices.length === 1 is true |
| [src/cloud/AccountLibrarySection.tsx:114](../src/cloud/AccountLibrarySection.tsx#L114) | Rendered copy | Start with | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is true; !remoteReady is false; choices.length === 1 is false |
| [src/cloud/AccountLibrarySection.tsx:125](../src/cloud/AccountLibrarySection.tsx#L125) | Rendered copy | ${item.label} | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is true; !remoteReady is false; choices.length === 1 is false |
| [src/cloud/AccountLibrarySection.tsx:126](../src/cloud/AccountLibrarySection.tsx#L126) | Rendered copy | ${item.detail} | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is true; !remoteReady is false; choices.length === 1 is false |
| [src/cloud/AccountLibrarySection.tsx:133](../src/cloud/AccountLibrarySection.tsx#L133) | Live region | That source changed. Choose a copy again. | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is true; !validChoice &amp;&amp; remoteReady &amp;&amp; |
| [src/cloud/AccountLibrarySection.tsx:138](../src/cloud/AccountLibrarySection.tsx#L138) | Rendered copy | This replaces your online library. The device original stays here. | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is true; replacing &amp;&amp; |
| [src/cloud/AccountLibrarySection.tsx:140](../src/cloud/AccountLibrarySection.tsx#L140) | Rendered copy | The creator can see your profile and ranking summary. | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is true |
| [src/cloud/AccountLibrarySection.tsx:143](../src/cloud/AccountLibrarySection.tsx#L143) | Rendered copy | New setups share saved games and rankings with accepted friends. Existing sharing choices stay unchanged; notes, Play later and history stay private. | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is true |
| [src/cloud/AccountLibrarySection.tsx:147](../src/cloud/AccountLibrarySection.tsx#L147) | Rendered copy | ${busy ? 'Connecting…' : replacing ? 'Agree &amp; replace online' : 'Agree &amp; enable'} | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is true |
| [src/cloud/AccountLibrarySection.tsx:152](../src/cloud/AccountLibrarySection.tsx#L152) | Message/fragment | Agree &amp; replace online | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is true; busy is false; replacing is true |
| [src/cloud/AccountLibrarySection.tsx:152](../src/cloud/AccountLibrarySection.tsx#L152) | Message/fragment | Connecting… | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is true; busy is true |
| [src/cloud/AccountLibrarySection.tsx:158](../src/cloud/AccountLibrarySection.tsx#L158) | Rendered copy | ${localGames} ${localGames === 1 ? 'game' : 'games'} · ${cache?.state.queueOrder.length ?? 0} in Play later · ${cache?.state.ranking.length ?? 0} ranked | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is false |
| [src/cloud/AccountLibrarySection.tsx:163](../src/cloud/AccountLibrarySection.tsx#L163) | Rendered copy | Last saved: ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format( cache.sync.lastSyncedAt, )} | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is false; cache?.sync.lastSyncedAt &amp;&amp; |
| [src/cloud/AccountLibrarySection.tsx:171](../src/cloud/AccountLibrarySection.tsx#L171) | Rendered copy | Sync now | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is false |
| [src/cloud/AccountLibrarySection.tsx:181](../src/cloud/AccountLibrarySection.tsx#L181) | Rendered copy | Stop online saving | AccountLibrarySection(); identity.verificationPending is false; !identity.verified is false; !active is false |
| [src/cloud/AccountLibrarySection.tsx:188](../src/cloud/AccountLibrarySection.tsx#L188) | Live region | ${error} | AccountLibrarySection(); error &amp;&amp; |
| [src/cloud/AccountLibrarySection.tsx:193](../src/cloud/AccountLibrarySection.tsx#L193) | Live region | ${message} | AccountLibrarySection(); message &amp;&amp; |
| [src/cloud/AccountLibrarySection.tsx:198](../src/cloud/AccountLibrarySection.tsx#L198) | Rendered copy | Retry account check | AccountLibrarySection(); error &amp;&amp; !active &amp;&amp; identity.verified &amp;&amp; |
| [src/cloud/AccountLibrarySection.tsx:210](../src/cloud/AccountLibrarySection.tsx#L210) | Rendered copy | Choose a copy | AccountLibrarySection(); status === 'conflict' &amp;&amp; |
| [src/cloud/AccountLibrarySection.tsx:211](../src/cloud/AccountLibrarySection.tsx#L211) | Rendered copy | Both copies are kept until you choose. Download them before replacing either. | AccountLibrarySection(); status === 'conflict' &amp;&amp; |
| [src/cloud/AccountLibrarySection.tsx:213](../src/cloud/AccountLibrarySection.tsx#L213) | Rendered copy | Download device copy | AccountLibrarySection(); status === 'conflict' &amp;&amp; |
| [src/cloud/AccountLibrarySection.tsx:222](../src/cloud/AccountLibrarySection.tsx#L222) | Rendered copy | Download online copy | AccountLibrarySection(); status === 'conflict' &amp;&amp; |
| [src/cloud/AccountLibrarySection.tsx:233](../src/cloud/AccountLibrarySection.tsx#L233) | Rendered copy | Use online copy | AccountLibrarySection(); status === 'conflict' &amp;&amp; |
| [src/cloud/AccountLibrarySection.tsx:245](../src/cloud/AccountLibrarySection.tsx#L245) | Rendered copy | Use device copy online | AccountLibrarySection(); status === 'conflict' &amp;&amp; |
| [src/cloud/AccountLibrarySection.tsx:262](../src/cloud/AccountLibrarySection.tsx#L262) | Live region | ${cleanupWarning} | AccountLibrarySection(); cleanupWarning &amp;&amp; |
| [src/cloud/AccountLibrarySection.tsx:263](../src/cloud/AccountLibrarySection.tsx#L263) | Rendered copy | Retry cleanup | AccountLibrarySection(); cleanupWarning &amp;&amp; |
| [src/cloud/AccountLibrarySection.tsx:276](../src/cloud/AccountLibrarySection.tsx#L276) | Rendered copy | Backups | AccountLibrarySection(); when its owning surface/operation is used |
| [src/cloud/AccountLibrarySection.tsx:278](../src/cloud/AccountLibrarySection.tsx#L278) | Rendered copy | Export account data | AccountLibrarySection(); expanded "Backups" disclosure |
| [src/cloud/AccountLibrarySection.tsx:288](../src/cloud/AccountLibrarySection.tsx#L288) | Rendered copy | Export device-only library | AccountLibrarySection(); expanded "Backups" disclosure |
## src/cloud/AccountPage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/AccountPage.tsx:82](../src/cloud/AccountPage.tsx#L82) | Rendered copy | ${avatar} Change icon | AccountPage(); when its owning surface/operation is used |
| [src/cloud/AccountPage.tsx:84](../src/cloud/AccountPage.tsx#L84) | Label/help | Change icon | AccountPage(); when its owning surface/operation is used |
| [src/cloud/AccountPage.tsx:89](../src/cloud/AccountPage.tsx#L89) | Rendered copy | Change icon | AccountPage(); when its owning surface/operation is used |
| [src/cloud/AccountPage.tsx:93](../src/cloud/AccountPage.tsx#L93) | Rendered copy | Account | AccountPage(); when its owning surface/operation is used |
| [src/cloud/AccountPage.tsx:96](../src/cloud/AccountPage.tsx#L96) | Rendered copy | ${identity.email} Signed in ${identity.verificationPending ? ' · checking access' : identity.verified ? '' : ' · verify your email'} | AccountPage(); when its owning surface/operation is used |
| [src/cloud/AccountPage.tsx:98](../src/cloud/AccountPage.tsx#L98) | Rendered copy | Signed in ${identity.verificationPending ? ' · checking access' : identity.verified ? '' : ' · verify your email'} | AccountPage(); when its owning surface/operation is used |
| [src/cloud/AccountPage.tsx:100](../src/cloud/AccountPage.tsx#L100) | Message/fragment | · checking access | AccountPage(); identity.verificationPending is true |
| [src/cloud/AccountPage.tsx:100](../src/cloud/AccountPage.tsx#L100) | Message/fragment | · verify your email | AccountPage(); identity.verificationPending is false; identity.verified is false |
| [src/cloud/AccountPage.tsx:104](../src/cloud/AccountPage.tsx#L104) | Rendered copy | Sign out | AccountPage(); when its owning surface/operation is used |
| [src/cloud/AccountPage.tsx:117](../src/cloud/AccountPage.tsx#L117) | Rendered copy | Sign out and remove this device's copy | AccountPage(); onSignOutAndRemove &amp;&amp; |
| [src/cloud/AccountPage.tsx:125](../src/cloud/AccountPage.tsx#L125) | Rendered copy | Unsynced changes are on this device. Save or export them first; ordinary Sign out keeps the copy. | AccountPage(); onSignOutAndRemove &amp;&amp;; cache?.sync.dirty &amp;&amp; |
| [src/cloud/AccountPage.tsx:130](../src/cloud/AccountPage.tsx#L130) | Live region | ${CANCELLED_REGISTRATION_MESSAGE} Remove cancelled sign-in | AccountPage(); cancelledRegistration &amp;&amp; |
| [src/cloud/AccountPage.tsx:131](../src/cloud/AccountPage.tsx#L131) | Rendered copy | ${CANCELLED_REGISTRATION_MESSAGE} | AccountPage(); cancelledRegistration &amp;&amp; |
| [src/cloud/AccountPage.tsx:132](../src/cloud/AccountPage.tsx#L132) | Rendered copy | Remove cancelled sign-in | AccountPage(); cancelledRegistration &amp;&amp; |
| [src/cloud/AccountPage.tsx:139](../src/cloud/AccountPage.tsx#L139) | Rendered copy | ${deletionState === 'complete' ? 'Online copy deleted' : deletionState === 'incomplete' ? "Deletion isn't finished" : 'Deletion was requested'} | AccountPage(); head?.deleted &amp;&amp; |
| [src/cloud/AccountPage.tsx:141](../src/cloud/AccountPage.tsx#L141) | Message/fragment | Online copy deleted | AccountPage(); head?.deleted &amp;&amp;; deletionState === 'complete' is true |
| [src/cloud/AccountPage.tsx:143](../src/cloud/AccountPage.tsx#L143) | Message/fragment | Deletion isn't finished | AccountPage(); head?.deleted &amp;&amp;; deletionState === 'complete' is false; deletionState === 'incomplete' is true |
| [src/cloud/AccountPage.tsx:144](../src/cloud/AccountPage.tsx#L144) | Message/fragment | Deletion was requested | AccountPage(); head?.deleted &amp;&amp;; deletionState === 'complete' is false; deletionState === 'incomplete' is false |
| [src/cloud/AccountPage.tsx:146](../src/cloud/AccountPage.tsx#L146) | Live region | ${deletionState === 'complete' ? 'Online saving and sharing are off. The copy on this device is still here.' : deletionState === 'incomplete' ? 'Some online data is still stored.' : deletionState === 'checking' ? "Checking what's still stored online…" : 'Removal of all online data could not be confirmed.'} | AccountPage(); head?.deleted &amp;&amp; |
| [src/cloud/AccountPage.tsx:148](../src/cloud/AccountPage.tsx#L148) | Message/fragment | Online saving and sharing are off. The copy on this device is still here. | AccountPage(); head?.deleted &amp;&amp;; deletionState === 'complete' is true |
| [src/cloud/AccountPage.tsx:150](../src/cloud/AccountPage.tsx#L150) | Message/fragment | Some online data is still stored. | AccountPage(); head?.deleted &amp;&amp;; deletionState === 'complete' is false; deletionState === 'incomplete' is true |
| [src/cloud/AccountPage.tsx:152](../src/cloud/AccountPage.tsx#L152) | Message/fragment | Checking what's still stored online… | AccountPage(); head?.deleted &amp;&amp;; deletionState === 'complete' is false; deletionState === 'incomplete' is false; deletionState === 'checking' is true |
| [src/cloud/AccountPage.tsx:153](../src/cloud/AccountPage.tsx#L153) | Message/fragment | Removal of all online data could not be confirmed. | AccountPage(); head?.deleted &amp;&amp;; deletionState === 'complete' is false; deletionState === 'incomplete' is false; deletionState === 'checking' is false |
| [src/cloud/AccountPage.tsx:157](../src/cloud/AccountPage.tsx#L157) | Rendered copy | Finish deleting | AccountPage(); head?.deleted &amp;&amp;; deletionState !== 'complete' &amp;&amp; |
| [src/cloud/AccountPage.tsx:162](../src/cloud/AccountPage.tsx#L162) | Rendered copy | Delete account | AccountPage(); head?.deleted &amp;&amp;; (deletionState === 'complete' &#124;&#124; deletionState === 'incomplete') &amp;&amp; |
| [src/cloud/AccountPage.tsx:167](../src/cloud/AccountPage.tsx#L167) | Rendered copy | To use online saving again, turn it on below; this starts a new online copy. | AccountPage(); head?.deleted &amp;&amp; |
## src/cloud/AccountSidebar.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/AccountSidebar.tsx:39](../src/cloud/AccountSidebar.tsx#L39) | Rendered copy | Profile | AccountSidebar(); when its owning surface/operation is used |
| [src/cloud/AccountSidebar.tsx:51](../src/cloud/AccountSidebar.tsx#L51) | Rendered copy | Name | AccountSidebar(); when its owning surface/operation is used |
| [src/cloud/AccountSidebar.tsx:70](../src/cloud/AccountSidebar.tsx#L70) | Live region | ${nameError} | AccountSidebar(); nameError &amp;&amp; |
| [src/cloud/AccountSidebar.tsx:74](../src/cloud/AccountSidebar.tsx#L74) | Rendered copy | Save name | AccountSidebar(); when its owning surface/operation is used |
| [src/cloud/AccountSidebar.tsx:79](../src/cloud/AccountSidebar.tsx#L79) | Rendered copy | Link Google | AccountSidebar(); !hasProvider(identity, GoogleAuthProvider.PROVIDER_ID) &amp;&amp; |
| [src/cloud/AccountSidebar.tsx:91](../src/cloud/AccountSidebar.tsx#L91) | Rendered copy | Sharing | AccountSidebar(); when its owning surface/operation is used |
| [src/cloud/AccountSidebar.tsx:95](../src/cloud/AccountSidebar.tsx#L95) | Rendered copy | Friends | AccountSidebar(); onFriends &amp;&amp; |
| [src/cloud/AccountSidebar.tsx:101](../src/cloud/AccountSidebar.tsx#L101) | Rendered copy | Compare rankings | AccountSidebar(); onCompare &amp;&amp; |
| [src/cloud/AccountSidebar.tsx:106](../src/cloud/AccountSidebar.tsx#L106) | Rendered copy | Publish ranking | AccountSidebar(); when its owning surface/operation is used |
| [src/cloud/AccountSidebar.tsx:110](../src/cloud/AccountSidebar.tsx#L110) | Rendered copy | Community | AccountSidebar(); when its owning surface/operation is used |
| [src/cloud/AccountSidebar.tsx:115](../src/cloud/AccountSidebar.tsx#L115) | Rendered copy | Creator desk | AccountSidebar(); isCreator &amp;&amp; |
| [src/cloud/AccountSidebar.tsx:123](../src/cloud/AccountSidebar.tsx#L123) | Rendered copy | ${identity.verified ? 'Delete data or account' : 'Cancel registration'} | AccountSidebar(); !head?.deleted &amp;&amp; |
| [src/cloud/AccountSidebar.tsx:123](../src/cloud/AccountSidebar.tsx#L123) | Message/fragment | Cancel registration | AccountSidebar(); !head?.deleted &amp;&amp;; identity.verified is false |
| [src/cloud/AccountSidebar.tsx:123](../src/cloud/AccountSidebar.tsx#L123) | Message/fragment | Delete data or account | AccountSidebar(); !head?.deleted &amp;&amp;; identity.verified is true |
| [src/cloud/AccountSidebar.tsx:125](../src/cloud/AccountSidebar.tsx#L125) | Rendered copy | Delete online copy | AccountSidebar(); !head?.deleted &amp;&amp;; expanded "${identity.verified ? 'Delete data or account' : 'Cancel registration'}" disclosure; identity.verified &amp;&amp; |
| [src/cloud/AccountSidebar.tsx:129](../src/cloud/AccountSidebar.tsx#L129) | Rendered copy | ${identity.verified ? 'Delete account' : 'Delete unused registration'} | AccountSidebar(); !head?.deleted &amp;&amp;; expanded "${identity.verified ? 'Delete data or account' : 'Cancel registration'}" disclosure |
| [src/cloud/AccountSidebar.tsx:130](../src/cloud/AccountSidebar.tsx#L130) | Message/fragment | Delete account | AccountSidebar(); !head?.deleted &amp;&amp;; expanded "${identity.verified ? 'Delete data or account' : 'Cancel registration'}" disclosure; identity.verified is true |
| [src/cloud/AccountSidebar.tsx:130](../src/cloud/AccountSidebar.tsx#L130) | Message/fragment | Delete unused registration | AccountSidebar(); !head?.deleted &amp;&amp;; expanded "${identity.verified ? 'Delete data or account' : 'Cancel registration'}" disclosure; identity.verified is false |
## src/cloud/AuthPanel.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/AuthPanel.tsx:13](../src/cloud/AuthPanel.tsx#L13) | Message/fragment | Sign in to save your games and rankings online and use them on your other devices. Your library stays on this device until you turn on online saving. | pagePurposes(); when its owning surface/operation is used |
| [src/cloud/AuthPanel.tsx:15](../src/cloud/AuthPanel.tsx#L15) | Message/fragment | Add friends with an invite link, see the games they share and compare your rankings. Sign in so your friends can find you. | pagePurposes(); when its owning surface/operation is used |
| [src/cloud/AuthPanel.tsx:17](../src/cloud/AuthPanel.tsx#L17) | Message/fragment | Publish your ranking as a public page that anyone with its link can see, and choose whether Community lists it. Sign in so the page belongs to you. | pagePurposes(); when its owning surface/operation is used |
| [src/cloud/AuthPanel.tsx:19](../src/cloud/AuthPanel.tsx#L19) | Message/fragment | Choose the ranked games, with their order and scores, that your friends can see. Sign in to share them with friends. | pagePurposes(); when its owning surface/operation is used |
| [src/cloud/AuthPanel.tsx:20](../src/cloud/AuthPanel.tsx#L20) | Message/fragment | Choose saved games from your library for your friends to see. Sign in to share them with friends. | pagePurposes(); when its owning surface/operation is used |
| [src/cloud/AuthPanel.tsx:22](../src/cloud/AuthPanel.tsx#L22) | Message/fragment | The collection creator can review consenting members and moderate public rankings here. Sign in with the creator account to continue. | pagePurposes(); when its owning surface/operation is used |
| [src/cloud/AuthPanel.tsx:40](../src/cloud/AuthPanel.tsx#L40) | Live region | ${leftovers.state === 'removed' ? "That account's data is now removed from this device." : leftovers.after === 'sign-out' ? "Signed out, but some of this account's data is still on this device." : 'Your account is deleted, but some of its data is still on this device.'} ${leftovers.state === 'still-left' &amp;&amp; " Trying again didn't work. To remove it, clear this site's data in your browser settings."} ${leftovers.state !== 'removed' &amp;&amp; ( &lt;button className="button button-outline" type="button" onClick={retry}&gt; Try again &lt;/button&gt; )} | DeviceLeftoverNotice(); when its owning surface/operation is used |
| [src/cloud/AuthPanel.tsx:41](../src/cloud/AuthPanel.tsx#L41) | Rendered copy | ${leftovers.state === 'removed' ? "That account's data is now removed from this device." : leftovers.after === 'sign-out' ? "Signed out, but some of this account's data is still on this device." : 'Your account is deleted, but some of its data is still on this device.'} ${leftovers.state === 'still-left' &amp;&amp; " Trying again didn't work. To remove it, clear this site's data in your browser settings."} | DeviceLeftoverNotice(); when its owning surface/operation is used |
| [src/cloud/AuthPanel.tsx:43](../src/cloud/AuthPanel.tsx#L43) | Message/fragment | That account's data is now removed from this device. | DeviceLeftoverNotice(); leftovers.state === 'removed' is true |
| [src/cloud/AuthPanel.tsx:45](../src/cloud/AuthPanel.tsx#L45) | Message/fragment | Signed out, but some of this account's data is still on this device. | DeviceLeftoverNotice(); leftovers.state === 'removed' is false; leftovers.after === 'sign-out' is true |
| [src/cloud/AuthPanel.tsx:46](../src/cloud/AuthPanel.tsx#L46) | Message/fragment | Your account is deleted, but some of its data is still on this device. | DeviceLeftoverNotice(); leftovers.state === 'removed' is false; leftovers.after === 'sign-out' is false |
| [src/cloud/AuthPanel.tsx:48](../src/cloud/AuthPanel.tsx#L48) | Message/fragment | Trying again didn't work. To remove it, clear this site's data in your browser settings. | DeviceLeftoverNotice(); leftovers.state === 'still-left' &amp;&amp; |
| [src/cloud/AuthPanel.tsx:51](../src/cloud/AuthPanel.tsx#L51) | Rendered copy | Try again | DeviceLeftoverNotice(); leftovers.state !== 'removed' &amp;&amp; |
| [src/cloud/AuthPanel.tsx:94](../src/cloud/AuthPanel.tsx#L94) | Rendered copy | Compare friends' rankings | AuthPanel(); purpose === 'compare' is true |
| [src/cloud/AuthPanel.tsx:95](../src/cloud/AuthPanel.tsx#L95) | Rendered copy | ${games ? &#96;Sign in to compare your ${games === 1 ? 'pinned game' : &#96;${games} pinned games&#96;} with friends.&#96; : 'Sign in to compare rankings shared by your friends.'} Pins select games for comparison; they do not share your library. | AuthPanel(); purpose === 'compare' is true |
| [src/cloud/AuthPanel.tsx:97](../src/cloud/AuthPanel.tsx#L97) | Message/fragment | Sign in to compare your ${games === 1 ? 'pinned game' : &#96;${games} pinned games&#96;} with friends. | AuthPanel(); purpose === 'compare' is true; games is true |
| [src/cloud/AuthPanel.tsx:98](../src/cloud/AuthPanel.tsx#L98) | Message/fragment | Sign in to compare rankings shared by your friends. | AuthPanel(); purpose === 'compare' is true; games is false |
| [src/cloud/AuthPanel.tsx:106](../src/cloud/AuthPanel.tsx#L106) | Rendered copy | ${pagePurposes[purpose]} | AuthPanel(); purpose === 'compare' is false; purpose &amp;&amp; |
| [src/cloud/AuthPanel.tsx:111](../src/cloud/AuthPanel.tsx#L111) | Rendered copy | Local test preview: use synthetic accounts only. Authentication and cloud data stay in the local emulators. | AuthPanel(); EMULATOR_MODE &amp;&amp; |
| [src/cloud/AuthPanel.tsx:115](../src/cloud/AuthPanel.tsx#L115) | Rendered copy | Continue with Google | AuthPanel(); when its owning surface/operation is used |
| [src/cloud/AuthPanel.tsx:126](../src/cloud/AuthPanel.tsx#L126) | Live region | Connecting… | AuthPanel(); busy &amp;&amp; |
| [src/cloud/AuthPanel.tsx:131](../src/cloud/AuthPanel.tsx#L131) | Rendered copy | Use email | AuthPanel(); !emailMode is true |
| [src/cloud/AuthPanel.tsx:151](../src/cloud/AuthPanel.tsx#L151) | Label/help | Email account action | AuthPanel(); !emailMode is false |
| [src/cloud/AuthPanel.tsx:152](../src/cloud/AuthPanel.tsx#L152) | Rendered copy | Sign in | AuthPanel(); !emailMode is false |
| [src/cloud/AuthPanel.tsx:163](../src/cloud/AuthPanel.tsx#L163) | Rendered copy | Create account | AuthPanel(); !emailMode is false |
| [src/cloud/AuthPanel.tsx:175](../src/cloud/AuthPanel.tsx#L175) | Rendered copy | Email | AuthPanel(); !emailMode is false |
| [src/cloud/AuthPanel.tsx:189](../src/cloud/AuthPanel.tsx#L189) | Label/help | you@example.com | AuthPanel(); !emailMode is false |
| [src/cloud/AuthPanel.tsx:193](../src/cloud/AuthPanel.tsx#L193) | Rendered copy | Password${creating &amp;&amp; &lt;span&gt;At least 12 characters; a passphrase works well.&lt;/span&gt;} | AuthPanel(); !emailMode is false; !resetMode &amp;&amp; |
| [src/cloud/AuthPanel.tsx:194](../src/cloud/AuthPanel.tsx#L194) | Rendered copy | At least 12 characters; a passphrase works well. | AuthPanel(); !emailMode is false; !resetMode &amp;&amp;; creating &amp;&amp; |
| [src/cloud/AuthPanel.tsx:209](../src/cloud/AuthPanel.tsx#L209) | Rendered copy | ${revealed ? 'Hide' : 'Show'} | AuthPanel(); !emailMode is false; !resetMode &amp;&amp; |
| [src/cloud/AuthPanel.tsx:212](../src/cloud/AuthPanel.tsx#L212) | Label/help | {revealed ? 'Hide password' : 'Show password'} | AuthPanel(); !emailMode is false; !resetMode &amp;&amp; |
| [src/cloud/AuthPanel.tsx:212](../src/cloud/AuthPanel.tsx#L212) | Message/fragment | Hide password | AuthPanel(); !emailMode is false; !resetMode &amp;&amp;; revealed is true |
| [src/cloud/AuthPanel.tsx:212](../src/cloud/AuthPanel.tsx#L212) | Message/fragment | Show password | AuthPanel(); !emailMode is false; !resetMode &amp;&amp;; revealed is false |
| [src/cloud/AuthPanel.tsx:216](../src/cloud/AuthPanel.tsx#L216) | Message/fragment | Hide | AuthPanel(); !emailMode is false; !resetMode &amp;&amp;; revealed is true |
| [src/cloud/AuthPanel.tsx:216](../src/cloud/AuthPanel.tsx#L216) | Message/fragment | Show | AuthPanel(); !emailMode is false; !resetMode &amp;&amp;; revealed is false |
| [src/cloud/AuthPanel.tsx:221](../src/cloud/AuthPanel.tsx#L221) | Rendered copy | ${busy ? 'Please wait…' : resetMode ? 'Send reset email' : creating ? 'Create account with email' : 'Sign in with email'} | AuthPanel(); !emailMode is false |
| [src/cloud/AuthPanel.tsx:223](../src/cloud/AuthPanel.tsx#L223) | Message/fragment | Please wait… | AuthPanel(); !emailMode is false; busy is true |
| [src/cloud/AuthPanel.tsx:225](../src/cloud/AuthPanel.tsx#L225) | Message/fragment | Send reset email | AuthPanel(); !emailMode is false; busy is false; resetMode is true |
| [src/cloud/AuthPanel.tsx:227](../src/cloud/AuthPanel.tsx#L227) | Message/fragment | Create account with email | AuthPanel(); !emailMode is false; busy is false; resetMode is false; creating is true |
| [src/cloud/AuthPanel.tsx:228](../src/cloud/AuthPanel.tsx#L228) | Message/fragment | Sign in with email | AuthPanel(); !emailMode is false; busy is false; resetMode is false; creating is false |
| [src/cloud/AuthPanel.tsx:232](../src/cloud/AuthPanel.tsx#L232) | Rendered copy | ${resetMode ? 'Back to sign in' : 'Reset password'} | AuthPanel(); !emailMode is false; !creating &amp;&amp; |
| [src/cloud/AuthPanel.tsx:241](../src/cloud/AuthPanel.tsx#L241) | Message/fragment | Back to sign in | AuthPanel(); !emailMode is false; !creating &amp;&amp;; resetMode is true |
| [src/cloud/AuthPanel.tsx:241](../src/cloud/AuthPanel.tsx#L241) | Message/fragment | Reset password | AuthPanel(); !emailMode is false; !creating &amp;&amp;; resetMode is false |
| [src/cloud/AuthPanel.tsx:247](../src/cloud/AuthPanel.tsx#L247) | Live region | ${error} | AuthPanel(); error &amp;&amp; |
| [src/cloud/AuthPanel.tsx:252](../src/cloud/AuthPanel.tsx#L252) | Live region | ${message} | AuthPanel(); message &amp;&amp; |
| [src/cloud/AuthPanel.tsx:256](../src/cloud/AuthPanel.tsx#L256) | Rendered copy | Signing in does not publish your library. | AuthPanel(); when its owning surface/operation is used |
| [src/cloud/AuthPanel.tsx:259](../src/cloud/AuthPanel.tsx#L259) | Rendered copy | Keep using this device | AuthPanel(); when its owning surface/operation is used |
## src/cloud/cloud-store.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/cloud-store.ts:45](../src/cloud/cloud-store.ts#L45) | Message/fragment | Deletion paused because the online service reached a limit. Wait a while, then choose Finish deleting to continue. | module-defined copy; code === 'resource-exhausted' is true |
| [src/cloud/cloud-store.ts:46](../src/cloud/cloud-store.ts#L46) | Message/fragment | Deletion stopped before it finished; your account is still here. Check your connection, then choose Finish deleting to continue. | module-defined copy; code === 'resource-exhausted' is false |
| [src/cloud/cloud-store.ts:49](../src/cloud/cloud-store.ts#L49) | Message/fragment | DeletionCleanupInterrupted | module-defined copy; when its owning surface/operation is used |
| [src/cloud/cloud-store.ts:56](../src/cloud/cloud-store.ts#L56) | Message/fragment | Deletion is paused because the online service needs an update; no saved content has been removed and online saving and sharing are off. Once the service is updated, choose Finish deleting to continue. | module-defined copy; when its owning surface/operation is used |
| [src/cloud/cloud-store.ts:59](../src/cloud/cloud-store.ts#L59) | Message/fragment | DeletionListPermissionPending | module-defined copy; when its owning surface/operation is used |
| [src/cloud/cloud-store.ts:65](../src/cloud/cloud-store.ts#L65) | Message/fragment | There's more to delete. Choose Finish deleting to continue. | module-defined copy; when its owning surface/operation is used |
| [src/cloud/cloud-store.ts:66](../src/cloud/cloud-store.ts#L66) | Message/fragment | DeletionNeedsAnotherPass | module-defined copy; when its owning surface/operation is used |
| [src/cloud/cloud-store.ts:73](../src/cloud/cloud-store.ts#L73) | Message/fragment | The online copy changed on another device. Both copies are safe; choose which to keep. | module-defined copy; when its owning surface/operation is used |
| [src/cloud/cloud-store.ts:74](../src/cloud/cloud-store.ts#L74) | Message/fragment | RemoteConflict | module-defined copy; when its owning surface/operation is used |
| [src/cloud/cloud-store.ts:81](../src/cloud/cloud-store.ts#L81) | Message/fragment | Online saving was stopped or deleted from another session. Your local copy is safe; reconnect explicitly. | module-defined copy; when its owning surface/operation is used |
| [src/cloud/cloud-store.ts:82](../src/cloud/cloud-store.ts#L82) | Message/fragment | SyncRevoked | module-defined copy; when its owning surface/operation is used |
| [src/cloud/cloud-store.ts:105](../src/cloud/cloud-store.ts#L105) | Error/validation | The online copy uses an unsupported format. Your local data has not been replaced. | parseHead(); Object.keys(value).sort().join() !== fields.sort().join() &#124;&#124; value.format !== 1 &#124;&#124; !isSafeInteger(value.epoch) &#124;&#124; value.epoch &lt; 1 &#124;&#124; !isSafeInteger(value.revision) &#124;&#124; value.revision &lt; 0 &#124;&#124; typeof value.enabled !== 'boolean' &#124;&#124; typeof value.deleted !== 'boolean' &#124;&#124; !(value.updatedAt instanceof Timestamp) &#124;&#124; !isSafeInteger(cleanupEpoch) &#124;&#124; cleanupEpoch &lt; 1 is true |
| [src/cloud/cloud-store.ts:139](../src/cloud/cloud-store.ts#L139) | Error/validation | Unsupported online account identity. | module-defined copy; !/^[A-Za-z0-9_-]{1,128}$/.test(uid) is true |
| [src/cloud/cloud-store.ts:174](../src/cloud/cloud-store.ts#L174) | Error/validation | The deletion check could not read its saved state. | probeDeletedCopy(); !isUnknownArray(ids) is true |
| [src/cloud/cloud-store.ts:190](../src/cloud/cloud-store.ts#L190) | Error/validation | The account or online saving state changed. Refresh the page before continuing. | markCleanupComplete(); !isCurrent() &#124;&#124; !head?.deleted &#124;&#124; head.epoch !== epoch is true |
| [src/cloud/cloud-store.ts:205](../src/cloud/cloud-store.ts#L205) | Error/validation | Online state is unreadable. | watch(); operation rejected or threw; error instanceof Error is false |
| [src/cloud/cloud-store.ts:221](../src/cloud/cloud-store.ts#L221) | Error/validation | The account session changed before downloading. | error(); !isCurrent() is true |
| [src/cloud/cloud-store.ts:222](../src/cloud/cloud-store.ts#L222) | Message/fragment | SyncSessionEnded | download(); !isCurrent() is true |
| [src/cloud/cloud-store.ts:238](../src/cloud/cloud-store.ts#L238) | Error/validation | The member ranking summary is invalid. | ranking(); !Array.isArray(data) &#124;&#124; data.length &gt; MAX_LIBRARY_RECORDS is true |
| [src/cloud/cloud-store.ts:255](../src/cloud/cloud-store.ts#L255) | Error/validation | The member ranking contains unsupported fields. It was not displayed. | ranking(); !entry &#124;&#124; typeof entry !== 'object' &#124;&#124; Object.keys(entry).sort().join() !== 'id,position,score,title' &#124;&#124; !('position' in entry) &#124;&#124; entry.position !== index + 1 &#124;&#124; !('id' in entry) &#124;&#124; typeof entry.id !== 'string' &#124;&#124; !('title' in entry) &#124;&#124; typeof entry.title !== 'string' &#124;&#124; entry.title.length &gt; MAX_LIBRARY_TITLE_CHARACTERS &#124;&#124; !('score' in entry) &#124;&#124; (entry.score !== null &amp;&amp; (typeof entry.score !== 'number' &#124;&#124; !Number.isFinite(entry.score) &#124;&#124; entry.score &lt; 0 &#124;&#124; entry.score &gt; 10)) is true |
| [src/cloud/cloud-store.ts:268](../src/cloud/cloud-store.ts#L268) | Error/validation | Online saving changed. Refresh before connecting. | enable(); (current?.revision ?? 0) !== (expected?.revision ?? 0) &#124;&#124; (current?.epoch ?? 0) !== (expected?.epoch ?? 0) is true |
| [src/cloud/cloud-store.ts:303](../src/cloud/cloud-store.ts#L303) | Error/validation | Eight older saved copies are still stored online. Wait for cleanup or run it from Account, then retry. Local edits are safe. | register(); !isUnknownArray(ids) &#124;&#124; ids.length &gt;= 8 is true |
| [src/cloud/cloud-store.ts:331](../src/cloud/cloud-store.ts#L331) | Error/validation | Part of the online copy could not be read. Your device copy is unchanged. | putChunk(); current.exists() is true; saved.data !== chunk.data &#124;&#124; saved.bytes !== chunk.bytes &#124;&#124; saved.digest !== chunk.digest &#124;&#124; !isUnknownArray(saved.holders) is true |
| [src/cloud/cloud-store.ts:346](../src/cloud/cloud-store.ts#L346) | Error/validation | This online session ended. Its local copy remains pending. | error(); !isCurrent() is true |
| [src/cloud/cloud-store.ts:347](../src/cloud/cloud-store.ts#L347) | Message/fragment | SyncSessionEnded | guard(); !isCurrent() is true |
| [src/cloud/cloud-store.ts:355](../src/cloud/cloud-store.ts#L355) | Error/validation | This ranking summary is too large for online saving. Your device copy is unchanged. | upload(); summary.manifest.bytes &gt; MAX_RANKING_SNAPSHOT_BYTES is true |
| [src/cloud/cloud-store.ts:425](../src/cloud/cloud-store.ts#L425) | Error/validation | The online copy being saved is no longer available. Your device changes are still waiting to save online. | published(); !current &#124;&#124; !generation.exists() &#124;&#124; generation.data().status !== 'staging' is true |
| [src/cloud/cloud-store.ts:448](../src/cloud/cloud-store.ts#L448) | Error/validation | The complete online copy could not be saved. Retry online saving. | publishHead(); !generation.exists() &#124;&#124; generation.data().status !== 'ready' is true |
| [src/cloud/cloud-store.ts:553](../src/cloud/cloud-store.ts#L553) | Error/validation | The signed-in account changed. Return to the same account before continuing. | purgeDeletedPayload(); options.isCurrent?.() === false is true |
| [src/cloud/cloud-store.ts:578](../src/cloud/cloud-store.ts#L578) | Error/validation | Online saving changed. Refresh the page before continuing. | purgeDeletedPayload(); options.isCurrent?.() === false &#124;&#124; !head?.deleted &#124;&#124; head.epoch !== epoch is true |
| [src/cloud/cloud-store.ts:597](../src/cloud/cloud-store.ts#L597) | Error/validation | Online saving changed. Refresh the page before continuing. | cleanup(); options.expectedDeletionEpoch !== undefined &amp;&amp; deletionEpoch !== options.expectedDeletionEpoch is true |
| [src/cloud/cloud-store.ts:602](../src/cloud/cloud-store.ts#L602) | Error/validation | The signed-in account changed. Return to the same account before continuing. | guardDeletion(); options.isCurrent?.() === false is true |
| [src/cloud/cloud-store.ts:606](../src/cloud/cloud-store.ts#L606) | Error/validation | Online saving changed. Refresh the page before continuing. | guardDeletion(); deletionEpoch !== null is true; !head?.deleted &#124;&#124; head.epoch !== deletionEpoch is true |
| [src/cloud/cloud-store.ts:617](../src/cloud/cloud-store.ts#L617) | Error/validation | Your online data couldn't be read, so deletion stopped. Try again later. | cleanup(); !Array.isArray(ids) &#124;&#124; !ids.every((id): id is string =&gt; typeof id === 'string') is true |
| [src/cloud/cloud-store.ts:624](../src/cloud/cloud-store.ts#L624) | Error/validation | The signed-in account changed. Return to the same account before continuing. | generation(); options.isCurrent?.() === false is true |
| [src/cloud/cloud-store.ts:629](../src/cloud/cloud-store.ts#L629) | Error/validation | Online saving changed. Refresh the page before continuing. | generation(); deletionEpoch !== null is true; !head.exists() &#124;&#124; !head.data().deleted &#124;&#124; head.data().epoch !== deletionEpoch is true |
| [src/cloud/cloud-store.ts:644](../src/cloud/cloud-store.ts#L644) | Error/validation | Your online data couldn't be read. Try again later. | generation(); !candidate.exists() is true; !Array.isArray(currentIds) &#124;&#124; !currentIds.every((value): value is string =&gt; typeof value === 'string') &#124;&#124; !Number.isSafeInteger(current.revision) &#124;&#124; current.revision &lt; 1 is true |
| [src/cloud/cloud-store.ts:655](../src/cloud/cloud-store.ts#L655) | Error/validation | Your online data couldn't be read. Try again later. | generation(); !(data.createdAt instanceof Timestamp) is true |
| [src/cloud/cloud-store.ts:674](../src/cloud/cloud-store.ts#L674) | Error/validation | Your online data couldn't be checked, so cleanup stopped. Try again later. | releaseHeld(); !Array.isArray(holders) &#124;&#124; !holders.every((holder) =&gt; typeof holder === 'string') is true |
| [src/cloud/cloud-store.ts:691](../src/cloud/cloud-store.ts#L691) | Error/validation | The account or online saving state changed. Refresh the page before continuing. | result(); options.isCurrent?.() === false &#124;&#124; (deletionEpoch !== null &amp;&amp; (!head.exists() &#124;&#124; !head.data().deleted &#124;&#124; head.data().epoch !== deletionEpoch)) is true |
| [src/cloud/cloud-store.ts:703](../src/cloud/cloud-store.ts#L703) | Error/validation | Your online data couldn't be checked, so deletion stopped. Try again later. | result(); !data &#124;&#124; data.status !== 'deleting' &#124;&#124; typeof released !== 'number' &#124;&#124; !Number.isSafeInteger(released) &#124;&#124; released &lt; 0 &#124;&#124; released &gt; parts.length is true |
| [src/cloud/cloud-store.ts:732](../src/cloud/cloud-store.ts#L732) | Error/validation | This version of the app can't finish deleting. Refresh the page, then choose Finish deleting to continue. | cleanup(); deletionEpoch !== null is true |
| [src/cloud/cloud-store.ts:752](../src/cloud/cloud-store.ts#L752) | Error/validation | The signed-in account changed. Return to the same account before continuing. | cleanup(); options.isCurrent?.() === false is true |
| [src/cloud/cloud-store.ts:757](../src/cloud/cloud-store.ts#L757) | Error/validation | Online saving changed. Refresh the page before continuing. | cleanup(); deletionEpoch !== null is true; !head.exists() &#124;&#124; !head.data().deleted &#124;&#124; head.data().epoch !== deletionEpoch is true |
| [src/cloud/cloud-store.ts:760](../src/cloud/cloud-store.ts#L760) | Error/validation | A saved copy changed. Refresh the page before continuing. | cleanup(); retained.has(id) is true |
| [src/cloud/cloud-store.ts:779](../src/cloud/cloud-store.ts#L779) | Error/validation | The account or online saving state changed. Refresh the page before continuing. | cleanup(); deletionEpoch !== null is true; options.isCurrent?.() === false &#124;&#124; !head.exists() &#124;&#124; !head.data().deleted &#124;&#124; head.data().epoch !== deletionEpoch is true |
| [src/cloud/cloud-store.ts:784](../src/cloud/cloud-store.ts#L784) | Error/validation | There's more to delete. Choose Finish deleting to continue. | cleanup(); deletionEpoch !== null is true; registry.exists() is true; !isUnknownArray(ids) &#124;&#124; ids.length is true |
## src/cloud/CommunityPage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/CommunityPage.tsx:47](../src/cloud/CommunityPage.tsx#L47) | Message output | onlineError(cause) | load(); operation rejected or threw; current === generation.current is true |
| [src/cloud/CommunityPage.tsx:75](../src/cloud/CommunityPage.tsx#L75) | Message output | onlineError(cause) | CommunityPage(); !disposed is true |
| [src/cloud/CommunityPage.tsx:88](../src/cloud/CommunityPage.tsx#L88) | Rendered copy | Community | CommunityPage(); when its owning surface/operation is used |
| [src/cloud/CommunityPage.tsx:91](../src/cloud/CommunityPage.tsx#L91) | Rendered copy | Browse rankings people chose to list publicly. | CommunityPage(); when its owning surface/operation is used |
| [src/cloud/CommunityPage.tsx:93](../src/cloud/CommunityPage.tsx#L93) | Rendered copy | Publish ranking | CommunityPage(); when its owning surface/operation is used |
| [src/cloud/CommunityPage.tsx:105](../src/cloud/CommunityPage.tsx#L105) | Rendered copy | Handle prefix | CommunityPage(); when its owning surface/operation is used |
| [src/cloud/CommunityPage.tsx:118](../src/cloud/CommunityPage.tsx#L118) | Label/help | Start of a handle… | CommunityPage(); when its owning surface/operation is used |
| [src/cloud/CommunityPage.tsx:121](../src/cloud/CommunityPage.tsx#L121) | Rendered copy | Find handles | CommunityPage(); when its owning surface/operation is used |
| [src/cloud/CommunityPage.tsx:125](../src/cloud/CommunityPage.tsx#L125) | Rendered copy | Search listed handles. | CommunityPage(); when its owning surface/operation is used |
| [src/cloud/CommunityPage.tsx:128](../src/cloud/CommunityPage.tsx#L128) | Live region | ${error} Try again | CommunityPage(); error &amp;&amp; |
| [src/cloud/CommunityPage.tsx:129](../src/cloud/CommunityPage.tsx#L129) | Rendered copy | ${error} | CommunityPage(); error &amp;&amp; |
| [src/cloud/CommunityPage.tsx:130](../src/cloud/CommunityPage.tsx#L130) | Rendered copy | Try again | CommunityPage(); error &amp;&amp; |
| [src/cloud/CommunityPage.tsx:142](../src/cloud/CommunityPage.tsx#L142) | Live region | Opening shared rankings… | CommunityPage(); busy &amp;&amp; |
| [src/cloud/CommunityPage.tsx:164](../src/cloud/CommunityPage.tsx#L164) | Rendered copy | @${profile.handle} ${profile.creator ? ' · Collection creator' : ''} | CommunityPage(); results.length &gt; 0 &amp;&amp; |
| [src/cloud/CommunityPage.tsx:166](../src/cloud/CommunityPage.tsx#L166) | Message/fragment | · Collection creator | CommunityPage(); results.length &gt; 0 &amp;&amp;; profile.creator is true |
| [src/cloud/CommunityPage.tsx:169](../src/cloud/CommunityPage.tsx#L169) | Rendered copy | ${profile.title} | CommunityPage(); results.length &gt; 0 &amp;&amp; |
| [src/cloud/CommunityPage.tsx:170](../src/cloud/CommunityPage.tsx#L170) | Rendered copy | ${profile.preview.join(' · ')} | CommunityPage(); results.length &gt; 0 &amp;&amp; |
| [src/cloud/CommunityPage.tsx:172](../src/cloud/CommunityPage.tsx#L172) | Rendered copy | ${profile.count} ranked Open ${profile.displayName}'s ranking | CommunityPage(); results.length &gt; 0 &amp;&amp; |
| [src/cloud/CommunityPage.tsx:184](../src/cloud/CommunityPage.tsx#L184) | Rendered copy | Open ${profile.displayName}'s ranking | CommunityPage(); results.length &gt; 0 &amp;&amp; |
| [src/cloud/CommunityPage.tsx:193](../src/cloud/CommunityPage.tsx#L193) | Rendered copy | ${term ? 'No matching handles' : 'No listed rankings'} | CommunityPage(); !busy &amp;&amp; !error &amp;&amp; !results.length &amp;&amp; |
| [src/cloud/CommunityPage.tsx:193](../src/cloud/CommunityPage.tsx#L193) | Message/fragment | No listed rankings | CommunityPage(); !busy &amp;&amp; !error &amp;&amp; !results.length &amp;&amp;; term is false |
| [src/cloud/CommunityPage.tsx:193](../src/cloud/CommunityPage.tsx#L193) | Message/fragment | No matching handles | CommunityPage(); !busy &amp;&amp; !error &amp;&amp; !results.length &amp;&amp;; term is true |
| [src/cloud/CommunityPage.tsx:194](../src/cloud/CommunityPage.tsx#L194) | Rendered copy | Try a shorter prefix. | CommunityPage(); !busy &amp;&amp; !error &amp;&amp; !results.length &amp;&amp;; term &amp;&amp; |
| [src/cloud/CommunityPage.tsx:196](../src/cloud/CommunityPage.tsx#L196) | Rendered copy | Show listed profiles | CommunityPage(); !busy &amp;&amp; !error &amp;&amp; !results.length &amp;&amp;; term &amp;&amp; |
| [src/cloud/CommunityPage.tsx:210](../src/cloud/CommunityPage.tsx#L210) | Rendered copy | ${results.length} listed profiles loaded | CommunityPage(); cursor &amp;&amp; |
| [src/cloud/CommunityPage.tsx:211](../src/cloud/CommunityPage.tsx#L211) | Rendered copy | Load next 20 | CommunityPage(); cursor &amp;&amp; |
## src/cloud/CreatorPage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/CreatorPage.tsx:72](../src/cloud/CreatorPage.tsx#L72) | Message output | onlineError(cause) | CreatorPage(); !canceled is true |
| [src/cloud/CreatorPage.tsx:85](../src/cloud/CreatorPage.tsx#L85) | Message/fragment | Opening profile… | openTarget(); known?.displayName ?? |
| [src/cloud/CreatorPage.tsx:103](../src/cloud/CreatorPage.tsx#L103) | Message/fragment | Removed profile | openTarget(); member?.displayName ?? publication?.displayName ?? |
| [src/cloud/CreatorPage.tsx:122](../src/cloud/CreatorPage.tsx#L122) | Message/fragment | Removed profile | openTarget(); request === selectedRequest.current is true; member?.displayName ?? publication?.displayName ?? |
| [src/cloud/CreatorPage.tsx:130](../src/cloud/CreatorPage.tsx#L130) | Message output | onlineError(cause) | openTarget(); operation rejected or threw; request === selectedRequest.current is true |
| [src/cloud/CreatorPage.tsx:138](../src/cloud/CreatorPage.tsx#L138) | Rendered copy | Creator access only. | CreatorPage(); !allowed is true |
| [src/cloud/CreatorPage.tsx:141](../src/cloud/CreatorPage.tsx#L141) | Rendered copy | ${verified ? 'This verified account is not authorized for the creator desk. Private member information is protected by server rules.' : 'Sign in and verify the owner account before accessing member information.'} | CreatorPage(); !allowed is true |
| [src/cloud/CreatorPage.tsx:143](../src/cloud/CreatorPage.tsx#L143) | Message/fragment | This verified account is not authorized for the creator desk. Private member information is protected by server rules. | CreatorPage(); !allowed is true; verified is true |
| [src/cloud/CreatorPage.tsx:144](../src/cloud/CreatorPage.tsx#L144) | Message/fragment | Sign in and verify the owner account before accessing member information. | CreatorPage(); !allowed is true; verified is false |
| [src/cloud/CreatorPage.tsx:146](../src/cloud/CreatorPage.tsx#L146) | Rendered copy | Open Account | CreatorPage(); !allowed is true |
| [src/cloud/CreatorPage.tsx:155](../src/cloud/CreatorPage.tsx#L155) | Rendered copy | Creator desk | CreatorPage(); when its owning surface/operation is used |
| [src/cloud/CreatorPage.tsx:161](../src/cloud/CreatorPage.tsx#L161) | Rendered copy | Members | CreatorPage(); when its owning surface/operation is used |
| [src/cloud/CreatorPage.tsx:164](../src/cloud/CreatorPage.tsx#L164) | Rendered copy | Reports | CreatorPage(); when its owning surface/operation is used |
| [src/cloud/CreatorPage.tsx:169](../src/cloud/CreatorPage.tsx#L169) | Live region | ${error} | CreatorPage(); error &amp;&amp; |
| [src/cloud/CreatorPage.tsx:174](../src/cloud/CreatorPage.tsx#L174) | Live region | Loading protected records… | CreatorPage(); busy &amp;&amp; |
| [src/cloud/CreatorPage.tsx:188](../src/cloud/CreatorPage.tsx#L188) | Rendered copy | ${member.rankCount} synced ranks · Updated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(member.updatedAt)} | CreatorPage(); tab === 'members' is true; members.length is true |
| [src/cloud/CreatorPage.tsx:193](../src/cloud/CreatorPage.tsx#L193) | Rendered copy | View ranking for ${member.displayName} | CreatorPage(); tab === 'members' is true; members.length is true |
| [src/cloud/CreatorPage.tsx:201](../src/cloud/CreatorPage.tsx#L201) | Rendered copy | for ${member.displayName} | CreatorPage(); tab === 'members' is true; members.length is true |
| [src/cloud/CreatorPage.tsx:210](../src/cloud/CreatorPage.tsx#L210) | Rendered copy | No members | CreatorPage(); tab === 'members' is true; members.length is false; !busy &amp;&amp; !error &amp;&amp; |
| [src/cloud/CreatorPage.tsx:219](../src/cloud/CreatorPage.tsx#L219) | Rendered copy | ${report.status === 'open' ? 'Needs review' : 'Resolved'} | CreatorPage(); tab === 'members' is false; reports.length is true |
| [src/cloud/CreatorPage.tsx:219](../src/cloud/CreatorPage.tsx#L219) | Message/fragment | Needs review | CreatorPage(); tab === 'members' is false; reports.length is true; report.status === 'open' is true |
| [src/cloud/CreatorPage.tsx:219](../src/cloud/CreatorPage.tsx#L219) | Message/fragment | Resolved | CreatorPage(); tab === 'members' is false; reports.length is true; report.status === 'open' is false |
| [src/cloud/CreatorPage.tsx:223](../src/cloud/CreatorPage.tsx#L223) | Rendered copy | ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(report.createdAt)} | CreatorPage(); tab === 'members' is false; reports.length is true |
| [src/cloud/CreatorPage.tsx:226](../src/cloud/CreatorPage.tsx#L226) | Rendered copy | Inspect profile | CreatorPage(); tab === 'members' is false; reports.length is true |
| [src/cloud/CreatorPage.tsx:234](../src/cloud/CreatorPage.tsx#L234) | Rendered copy | ${report.status === 'resolved' ? 'Remove resolved report' : 'Resolve and remove'} | CreatorPage(); tab === 'members' is false; reports.length is true |
| [src/cloud/CreatorPage.tsx:248](../src/cloud/CreatorPage.tsx#L248) | Message output | onlineError(cause) | CreatorPage(); tab === 'members' is false; reports.length is true; onClick |
| [src/cloud/CreatorPage.tsx:252](../src/cloud/CreatorPage.tsx#L252) | Message/fragment | Remove resolved report | CreatorPage(); tab === 'members' is false; reports.length is true; report.status === 'resolved' is true |
| [src/cloud/CreatorPage.tsx:252](../src/cloud/CreatorPage.tsx#L252) | Message/fragment | Resolve and remove | CreatorPage(); tab === 'members' is false; reports.length is true; report.status === 'resolved' is false |
| [src/cloud/CreatorPage.tsx:262](../src/cloud/CreatorPage.tsx#L262) | Rendered copy | No reports to review. | CreatorPage(); tab === 'members' is false; reports.length is false; !busy &amp;&amp; !error &amp;&amp; |
| [src/cloud/CreatorPage.tsx:263](../src/cloud/CreatorPage.tsx#L263) | Rendered copy | Members can keep one report per public profile open. Reporting alone never hides it. | CreatorPage(); tab === 'members' is false; reports.length is false; !busy &amp;&amp; !error &amp;&amp; |
| [src/cloud/CreatorPage.tsx:268](../src/cloud/CreatorPage.tsx#L268) | Rendered copy | Load next 20 | CreatorPage(); cursor &amp;&amp; |
| [src/cloud/CreatorPage.tsx:284](../src/cloud/CreatorPage.tsx#L284) | Message output | onlineError(cause) | CreatorPage(); cursor &amp;&amp;; onClick |
| [src/cloud/CreatorPage.tsx:310](../src/cloud/CreatorPage.tsx#L310) | Rendered copy | ${selected.publicOnly ? 'Published ranking snapshot.' : 'Private ranking summary.'} No notes or play history. | CreatorPage(); selected &amp;&amp; |
| [src/cloud/CreatorPage.tsx:311](../src/cloud/CreatorPage.tsx#L311) | Message/fragment | Private ranking summary. | CreatorPage(); selected &amp;&amp;; selected.publicOnly is false |
| [src/cloud/CreatorPage.tsx:311](../src/cloud/CreatorPage.tsx#L311) | Message/fragment | Published ranking snapshot. | CreatorPage(); selected &amp;&amp;; selected.publicOnly is true |
| [src/cloud/CreatorPage.tsx:316](../src/cloud/CreatorPage.tsx#L316) | Live region | Loading… | CreatorPage(); selected &amp;&amp;; busy &amp;&amp; |
| [src/cloud/CreatorPage.tsx:318](../src/cloud/CreatorPage.tsx#L318) | Live region | ${error} | CreatorPage(); selected &amp;&amp;; error &amp;&amp; |
| [src/cloud/CreatorPage.tsx:325](../src/cloud/CreatorPage.tsx#L325) | Rendered copy | ${entry.position}. ${entry.title} | CreatorPage(); selected &amp;&amp; |
| [src/cloud/CreatorPage.tsx:328](../src/cloud/CreatorPage.tsx#L328) | Rendered copy | ${entry.score ?? '—'} | CreatorPage(); selected &amp;&amp; |
| [src/cloud/CreatorPage.tsx:333](../src/cloud/CreatorPage.tsx#L333) | Rendered copy | No current ranking snapshot is available. Moderation still applies to this account. | CreatorPage(); selected &amp;&amp;; !busy &amp;&amp; !ranking.length &amp;&amp; |
| [src/cloud/CreatorPage.tsx:336](../src/cloud/CreatorPage.tsx#L336) | Rendered copy | Show more ranked games | CreatorPage(); selected &amp;&amp;; limit &lt; ranking.length &amp;&amp; |
| [src/cloud/CreatorPage.tsx:342](../src/cloud/CreatorPage.tsx#L342) | Rendered copy | Public-content moderation | CreatorPage(); selected &amp;&amp;; control &amp;&amp; |
| [src/cloud/CreatorPage.tsx:343](../src/cloud/CreatorPage.tsx#L343) | Rendered copy | ${control.hidden ? 'Publishing is paused for this account. Restoring permission does not republish a list automatically.' : 'Hiding removes the public list from new reads and prevents this account from republishing until you restore permission.'} | CreatorPage(); selected &amp;&amp;; control &amp;&amp; |
| [src/cloud/CreatorPage.tsx:345](../src/cloud/CreatorPage.tsx#L345) | Message/fragment | Publishing is paused for this account. Restoring permission does not republish a list automatically. | CreatorPage(); selected &amp;&amp;; control &amp;&amp;; control.hidden is true |
| [src/cloud/CreatorPage.tsx:346](../src/cloud/CreatorPage.tsx#L346) | Message/fragment | Hiding removes the public list from new reads and prevents this account from republishing until you restore permission. | CreatorPage(); selected &amp;&amp;; control &amp;&amp;; control.hidden is false |
| [src/cloud/CreatorPage.tsx:350](../src/cloud/CreatorPage.tsx#L350) | Rendered copy | Cancel moderation | CreatorPage(); selected &amp;&amp;; control &amp;&amp;; confirmHide is true |
| [src/cloud/CreatorPage.tsx:353](../src/cloud/CreatorPage.tsx#L353) | Rendered copy | ${control.hidden ? 'Restore publishing permission' : 'Hide and pause publishing'} | CreatorPage(); selected &amp;&amp;; control &amp;&amp;; confirmHide is true |
| [src/cloud/CreatorPage.tsx:364](../src/cloud/CreatorPage.tsx#L364) | Message output | onlineError(cause) | CreatorPage(); selected &amp;&amp;; control &amp;&amp;; confirmHide is true; onClick |
| [src/cloud/CreatorPage.tsx:368](../src/cloud/CreatorPage.tsx#L368) | Message/fragment | Hide and pause publishing | CreatorPage(); selected &amp;&amp;; control &amp;&amp;; confirmHide is true; control.hidden is false |
| [src/cloud/CreatorPage.tsx:368](../src/cloud/CreatorPage.tsx#L368) | Message/fragment | Restore publishing permission | CreatorPage(); selected &amp;&amp;; control &amp;&amp;; confirmHide is true; control.hidden is true |
| [src/cloud/CreatorPage.tsx:372](../src/cloud/CreatorPage.tsx#L372) | Rendered copy | ${control.hidden ? 'Restore publishing permission' : 'Hide public profile'} | CreatorPage(); selected &amp;&amp;; control &amp;&amp;; confirmHide is false |
| [src/cloud/CreatorPage.tsx:373](../src/cloud/CreatorPage.tsx#L373) | Message/fragment | Hide public profile | CreatorPage(); selected &amp;&amp;; control &amp;&amp;; confirmHide is false; control.hidden is false |
| [src/cloud/CreatorPage.tsx:373](../src/cloud/CreatorPage.tsx#L373) | Message/fragment | Restore publishing permission | CreatorPage(); selected &amp;&amp;; control &amp;&amp;; confirmHide is false; control.hidden is true |
## src/cloud/errors.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/errors.ts:5](../src/cloud/errors.ts#L5) | Message/fragment | The sign-in details were not accepted. Check them or reset your password. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:6](../src/cloud/errors.ts#L6) | Message/fragment | Enter a valid email address. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:7](../src/cloud/errors.ts#L7) | Message/fragment | This email already has an account. Sign in with the method you used before. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:8](../src/cloud/errors.ts#L8) | Message/fragment | Choose a longer password or passphrase. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:9](../src/cloud/errors.ts#L9) | Message/fragment | Choose a password or passphrase with at least 12 characters. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:10](../src/cloud/errors.ts#L10) | Message/fragment | Too many attempts. Wait a little before trying again. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:11](../src/cloud/errors.ts#L11) | Message/fragment | The sign-in service could not be reached. Check your connection and try again. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:12](../src/cloud/errors.ts#L12) | Message/fragment | Google could not open a separate window. Continue with Google in this tab, or use email. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:14](../src/cloud/errors.ts#L14) | Message/fragment | Google sign-in could not start. Try again when connected, or use email. Your library is unchanged. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:16](../src/cloud/errors.ts#L16) | Message/fragment | Google could not use temporary storage in this tab. Use email or keep using this device; your library is unchanged. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:18](../src/cloud/errors.ts#L18) | Message/fragment | Choose the Google identity already linked to this account. Nothing has been deleted or copied. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:20](../src/cloud/errors.ts#L20) | Message/fragment | Sign in with your existing email method first, then link Google from Account. Matching an email alone does not grant access. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:22](../src/cloud/errors.ts#L22) | Message/fragment | That Google identity is already connected to another account. Sign in to that account instead. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:24](../src/cloud/errors.ts#L24) | Message/fragment | For this sensitive action, sign in again and retry. Your remaining data has not been silently deleted. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:26](../src/cloud/errors.ts#L26) | Message/fragment | Your sign-in expired. Sign in again; local changes remain in this account's copy on this device. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:27](../src/cloud/errors.ts#L27) | Message/fragment | This email link expired. Request a fresh verification or reset email. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:29](../src/cloud/errors.ts#L29) | Message/fragment | This action is not allowed right now. Check email verification and refresh Account. Your device copy remains safe. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:31](../src/cloud/errors.ts#L31) | Message/fragment | The online service has reached a limit. Changes remain on this device; try again later. Billing is not enabled automatically. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:32](../src/cloud/errors.ts#L32) | Message/fragment | Online storage is temporarily unreachable. Local changes remain pending; retry when connected. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:34](../src/cloud/errors.ts#L34) | Message/fragment | Online storage needs attention before this action can finish. Your local data is safe; try again later. | messages(); when its owning surface/operation is used |
| [src/cloud/errors.ts:38](../src/cloud/errors.ts#L38) | Message/fragment | The online action could not finish. Your local data is retained. | onlineError(); messages[code] ??; error instanceof Error is false |
## src/cloud/firebase-client.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/firebase-client.ts:16](../src/cloud/firebase-client.ts#L16) | Error/validation | Online saving is not configured on this deployment. Device-only browsing still works. | module-defined copy; !config is true |
| [src/cloud/firebase-client.ts:41](../src/cloud/firebase-client.ts#L41) | Error/validation | Test authentication cannot run on a public origin. | module-defined copy; EMULATOR_MODE is true; !['127.0.0.1', 'localhost'].includes(location.hostname) is true |
## src/cloud/friend-all-store.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/friend-all-store.ts:80](../src/cloud/friend-all-store.ts#L80) | Message/fragment | The sharing change was acknowledged. Refresh its status instead of repeating the change. | module-defined copy; when its owning surface/operation is used |
| [src/cloud/friend-all-store.ts:85](../src/cloud/friend-all-store.ts#L85) | Message/fragment | The account or sharing controls changed. Refresh before continuing. | conflict(); when its owning surface/operation is used |
| [src/cloud/friend-all-store.ts:90](../src/cloud/friend-all-store.ts#L90) | Error/validation | Reconnect before changing automatic friend sharing. | online(); typeof navigator !== 'undefined' &amp;&amp; navigator.onLine === false is true |
| [src/cloud/friend-all-store.ts:202](../src/cloud/friend-all-store.ts#L202) | Message output | 'Another tab advanced the sharing update.' | contended(); operation rejected or threw; after &amp;&amp; (after.revision !== before.revision &#124;&#124; after.token !== before.token &#124;&#124; after.applied !== before.applied) is true |
| [src/cloud/friend-all-store.ts:202](../src/cloud/friend-all-store.ts#L202) | Message/fragment | Another tab advanced the sharing update. | contended(); operation rejected or threw; after &amp;&amp; (after.revision !== before.revision &#124;&#124; after.token !== before.token &#124;&#124; after.applied !== before.applied) is true |
| [src/cloud/friend-all-store.ts:220](../src/cloud/friend-all-store.ts#L220) | Error/validation | Automatic sharing could not be read. | watch(); operation rejected or threw; cause instanceof Error is false |
| [src/cloud/friend-all-store.ts:275](../src/cloud/friend-all-store.ts#L275) | Error/validation | Default sharing can only initialize an eligible new setup. | setPolicy(); origin === 'default' &amp;&amp; !enabled is true |
| [src/cloud/friend-all-store.ts:304](../src/cloud/friend-all-store.ts#L304) | Error/validation | This account has been revoked. Automatic sharing cannot be enabled. | changed(); old.policy?.deleted &#124;&#124; old.ranking?.deleted &#124;&#124; old.shelf?.deleted &#124;&#124; (next &amp;&amp; sync?.deleted) is true |
| [src/cloud/friend-all-store.ts:308](../src/cloud/friend-all-store.ts#L308) | Error/validation | Turn on account saving before sharing its games. | changed(); next &amp;&amp; !saving is true |
| [src/cloud/friend-all-store.ts:310](../src/cloud/friend-all-store.ts#L310) | Error/validation | This account does not have a saving consent to share. | changed(); !epoch is true |
| [src/cloud/friend-all-store.ts:409](../src/cloud/friend-all-store.ts#L409) | Error/validation | This shared account view is still updating or unavailable. | page(); !head &#124;&#124; head.status !== 'ready' is true |
| [src/cloud/friend-all-store.ts:411](../src/cloud/friend-all-store.ts#L411) | Message output | 'The shared list changed. Refresh its first page.' | page(); expectedRevision !== undefined &amp;&amp; head.revision !== expectedRevision is true |
| [src/cloud/friend-all-store.ts:411](../src/cloud/friend-all-store.ts#L411) | Message/fragment | The shared list changed. Refresh its first page. | page(); expectedRevision !== undefined &amp;&amp; head.revision !== expectedRevision is true |
| [src/cloud/friend-all-store.ts:427](../src/cloud/friend-all-store.ts#L427) | Error/validation | The shared page contains an invalid entry. | entries(); !value.active &#124;&#124; !value.entry &#124;&#124; value.epoch !== head.epoch &#124;&#124; value.format !== head.format is true |
| [src/cloud/friend-all-store.ts:439](../src/cloud/friend-all-store.ts#L439) | Error/validation | Choose one to six distinct game identities. | exact(); !input.length &#124;&#124; input.length &gt; FRIEND_ALL_EXACT_LIMIT &#124;&#124; new Set(input).size !== input.length is true |
| [src/cloud/friend-all-store.ts:443](../src/cloud/friend-all-store.ts#L443) | Error/validation | This shared account view is still updating or unavailable. | exact(); !head &#124;&#124; head.status !== 'ready' is true |
| [src/cloud/friend-all-store.ts:450](../src/cloud/friend-all-store.ts#L450) | Error/validation | The shared lookup contains an invalid entry. | entries(); !value.entry &#124;&#124; value.epoch !== head.epoch &#124;&#124; value.format !== head.format &#124;&#124; !ids.includes(value.entry.id) is true |
| [src/cloud/friend-all-store.ts:465](../src/cloud/friend-all-store.ts#L465) | Message output | 'The shared account view changed while reading. Refresh it.' | requireSameHead(); !latest &#124;&#124; latest.status !== 'ready' &#124;&#124; latest.revision !== expected.revision &#124;&#124; latest.epoch !== expected.epoch &#124;&#124; latest.digest !== expected.digest is true |
| [src/cloud/friend-all-store.ts:465](../src/cloud/friend-all-store.ts#L465) | Message/fragment | The shared account view changed while reading. Refresh it. | requireSameHead(); !latest &#124;&#124; latest.status !== 'ready' &#124;&#124; latest.revision !== expected.revision &#124;&#124; latest.epoch !== expected.epoch &#124;&#124; latest.digest !== expected.digest is true |
| [src/cloud/friend-all-store.ts:490](../src/cloud/friend-all-store.ts#L490) | Error/validation | The sharing inventory is inconsistent. | inventory(); !row.entry &#124;&#124; !row.active &#124;&#124; row.epoch !== epoch is true |
| [src/cloud/friend-all-store.ts:494](../src/cloud/friend-all-store.ts#L494) | Error/validation | The shared account inventory exceeds its supported limit. | inventory(); entries.length &gt; FRIEND_ALL_LIMIT is true |
| [src/cloud/friend-all-store.ts:498](../src/cloud/friend-all-store.ts#L498) | Message output | 'Another tab is updating this sharing inventory.' | inventory(); !sameJob(before, after) is true |
| [src/cloud/friend-all-store.ts:498](../src/cloud/friend-all-store.ts#L498) | Message/fragment | Another tab is updating this sharing inventory. | inventory(); !sameJob(before, after) is true |
| [src/cloud/friend-all-store.ts:500](../src/cloud/friend-all-store.ts#L500) | Error/validation | The sharing count does not match its stored inventory. | inventory(); entries.length !== (after?.epoch === epoch ? after.count : 0) is true |
| [src/cloud/friend-all-store.ts:524](../src/cloud/friend-all-store.ts#L524) | Error/validation | Some shared copies could not be checked. Try again later. | releaseRows(); !job &#124;&#124; job.format !== 3 &#124;&#124; job.count &lt; 1 is true |
| [src/cloud/friend-all-store.ts:561](../src/cloud/friend-all-store.ts#L561) | Error/validation | Older shared copies still need cleanup. Refresh sharing status to continue. | pruneLegacy(); when its owning surface/operation is used |
| [src/cloud/friend-all-store.ts:577](../src/cloud/friend-all-store.ts#L577) | Error/validation | This sharing policy belongs to another account. | publish(); policy.uid !== uid is true |
| [src/cloud/friend-all-store.ts:584](../src/cloud/friend-all-store.ts#L584) | Error/validation | Automatic sharing supports 10,000 distinct account games without truncation. | publish(); entries.length &gt; FRIEND_ALL_LIMIT &#124;&#124; new Set(entries.map((entry) =&gt; entry.id)).size !== entries.length is true |
| [src/cloud/friend-all-store.ts:600](../src/cloud/friend-all-store.ts#L600) | Message output | 'Wait for the current account copy to finish saving before sharing.' | checkSource(); !head?.enabled &#124;&#124; head.deleted &#124;&#124; head.epoch !== source.syncEpoch &#124;&#124; head.revision !== source.remoteRevision is true |
| [src/cloud/friend-all-store.ts:600](../src/cloud/friend-all-store.ts#L600) | Message/fragment | Wait for the current account copy to finish saving before sharing. | checkSource(); !head?.enabled &#124;&#124; head.deleted &#124;&#124; head.epoch !== source.syncEpoch &#124;&#124; head.revision !== source.remoteRevision is true |
| [src/cloud/friend-all-store.ts:684](../src/cloud/friend-all-store.ts#L684) | Message output | 'Another tab advanced the sharing update.' | begin(); !sameJob(old, initial.job) is true |
| [src/cloud/friend-all-store.ts:684](../src/cloud/friend-all-store.ts#L684) | Message/fragment | Another tab advanced the sharing update. | begin(); !sameJob(old, initial.job) is true |
| [src/cloud/friend-all-store.ts:748](../src/cloud/friend-all-store.ts#L748) | Error/validation | Sharing could not start. Refresh the page, then try again. | publish(); operation rejected or threw; operation rejected or threw; fallback &amp;&amp; typeof fallback === 'object' &amp;&amp; 'code' in fallback &amp;&amp; fallback.code === 'permission-denied' is true |
| [src/cloud/friend-all-store.ts:903](../src/cloud/friend-all-store.ts#L903) | Message output | 'This shared view changed while it was being deleted. Refresh sharing status to continue.' | settle(); !seen &#124;&#124; !snapshotEqual(seen[0], job) &#124;&#124; !snapshotEqual(seen[1], head) is true |
| [src/cloud/friend-all-store.ts:903](../src/cloud/friend-all-store.ts#L903) | Message/fragment | This shared view changed while it was being deleted. Refresh sharing status to continue. | settle(); !seen &#124;&#124; !snapshotEqual(seen[0], job) &#124;&#124; !snapshotEqual(seen[1], head) is true |
## src/cloud/friend-cleanup.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/friend-cleanup.ts:50](../src/cloud/friend-cleanup.ts#L50) | Error/validation | The account changed before export completed. | exportPages(); !isCurrent() is true |
| [src/cloud/friend-cleanup.ts:56](../src/cloud/friend-cleanup.ts#L56) | Error/validation | This account export is too large to download at once. Save a library backup in Settings before deleting anything. | exportPages(); when its owning surface/operation is used |
| [src/cloud/friend-cleanup.ts:111](../src/cloud/friend-cleanup.ts#L111) | Error/validation | Some shared copies could not be checked. Try again later. | removable(); !generation.exists() is true |
| [src/cloud/friend-cleanup.ts:136](../src/cloud/friend-cleanup.ts#L136) | Error/validation | Sharing settings changed during cleanup. Refresh the page, then try again. | cleanupGenerations(); !current.exists() is true |
| [src/cloud/friend-cleanup.ts:160](../src/cloud/friend-cleanup.ts#L160) | Error/validation | Account settings could not be read. Try again later. | releaseMissingQuotaIds(); !Array.isArray(ids) &#124;&#124; !ids.every((id): id is string =&gt; typeof id === 'string') is true |
| [src/cloud/friend-cleanup.ts:177](../src/cloud/friend-cleanup.ts#L177) | Error/validation | Account settings could not be read. Try again later. | releaseMissingQuotaIds(); !isUnknownArray(left) is true |
| [src/cloud/friend-cleanup.ts:183](../src/cloud/friend-cleanup.ts#L183) | Error/validation | Account deletion is not ready. Refresh the page, then confirm deletion. | cleanupDeleted(); !settings?.deleted is true |
| [src/cloud/friend-cleanup.ts:260](../src/cloud/friend-cleanup.ts#L260) | Message/fragment | Some account settings remain. Choose Delete account to continue. | cleanupDeleted(); relations.size &lt; 20 &amp;&amp; groups.items.length &lt; 20 &amp;&amp; blocks.items.length &lt; 20 is true; result === 'blocked' is true |
| [src/cloud/friend-cleanup.ts:276](../src/cloud/friend-cleanup.ts#L276) | Message/fragment | Some account settings remain. Choose Delete account to continue. | cleanupDeleted(); relations.size &lt; 20 &amp;&amp; groups.items.length &lt; 20 &amp;&amp; blocks.items.length &lt; 20 is true; remaining.some((value) =&gt; value.exists()) is true |
| [src/cloud/friend-cleanup.ts:280](../src/cloud/friend-cleanup.ts#L280) | Message/fragment | Some account settings remain. Choose Delete account to continue. | cleanupDeleted(); relations.size &lt; 20 &amp;&amp; groups.items.length &lt; 20 &amp;&amp; blocks.items.length &lt; 20 is true; operation rejected or threw; groupsCounted &#124;&#124; blocksCounted &#124;&#124; pairsCounted is true |
## src/cloud/friend-groups.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/friend-groups.ts:78](../src/cloud/friend-groups.ts#L78) | Message output | 'This saved group changed. Reload before saving.' | existing(); (current?.revision ?? 0) !== expectedRevision is true |
| [src/cloud/friend-groups.ts:78](../src/cloud/friend-groups.ts#L78) | Message/fragment | This saved group changed. Reload before saving. | existing(); (current?.revision ?? 0) !== expectedRevision is true |
| [src/cloud/friend-groups.ts:114](../src/cloud/friend-groups.ts#L114) | Message output | 'This saved group changed or was already deleted.' | deleteGroup(); !snap.exists() &#124;&#124; parseFriendGroup(id, snap.data()).revision !== expectedRevision is true |
| [src/cloud/friend-groups.ts:114](../src/cloud/friend-groups.ts#L114) | Message/fragment | This saved group changed or was already deleted. | deleteGroup(); !snap.exists() &#124;&#124; parseFriendGroup(id, snap.data()).revision !== expectedRevision is true |
## src/cloud/friend-invites.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/friend-invites.ts:40](../src/cloud/friend-invites.ts#L40) | Error/validation | This invite is no longer available. | unavailableInvite(); cause &amp;&amp; typeof cause === 'object' &amp;&amp; 'code' in cause &amp;&amp; (cause.code === 'permission-denied' &#124;&#124; cause.code === 'not-found') is true |
| [src/cloud/friend-invites.ts:64](../src/cloud/friend-invites.ts#L64) | Error/validation | Save your friend-facing name and icon before creating a link. | create(); !identity.exists() is true |
| [src/cloud/friend-invites.ts:69](../src/cloud/friend-invites.ts#L69) | Error/validation | Your friend-facing name has invisible, control or text-direction characters. Change your name before creating a link. | create(); displayNameProblem(chosen.displayName) is true |
| [src/cloud/friend-invites.ts:87](../src/cloud/friend-invites.ts#L87) | Error/validation | You already have 20 active invitation links. Revoke one before creating another. | create(); index &lt; 0 is true |
| [src/cloud/friend-invites.ts:90](../src/cloud/friend-invites.ts#L90) | Error/validation | The invitation slot is invalid. | create(); !slotRef is true |
| [src/cloud/friend-invites.ts:133](../src/cloud/friend-invites.ts#L133) | Error/validation | This invite is no longer available. | previewInvite(); !snap.exists() &#124;&#124; snap.data().state !== 'active' is true |
| [src/cloud/friend-invites.ts:136](../src/cloud/friend-invites.ts#L136) | Error/validation | This invitation has expired. Ask for a new link. | previewInvite(); invite.expiresAt &lt;= Date.now() is true |
| [src/cloud/friend-invites.ts:171](../src/cloud/friend-invites.ts#L171) | Error/validation | This invite is no longer available. | revoke(); !snap.exists() &#124;&#124; snap.data().ownerUid !== uid is true |
| [src/cloud/friend-invites.ts:212](../src/cloud/friend-invites.ts#L212) | Error/validation | This invite is no longer available. | acceptInvite(); !snap.exists() &#124;&#124; snap.data().state !== 'active' is true |
| [src/cloud/friend-invites.ts:215](../src/cloud/friend-invites.ts#L215) | Error/validation | You cannot accept your own invitation. | acceptInvite(); uid === ownerUid is true |
| [src/cloud/friend-invites.ts:217](../src/cloud/friend-invites.ts#L217) | Error/validation | This invitation has expired. Ask for a new link. | acceptInvite(); invite.expiresAt &lt;= Date.now() is true |
| [src/cloud/friend-invites.ts:225](../src/cloud/friend-invites.ts#L225) | Message output | 'You are already friends.' | acceptInvite(); current?.state === 'accepted' is true |
| [src/cloud/friend-invites.ts:225](../src/cloud/friend-invites.ts#L225) | Message/fragment | You are already friends. | acceptInvite(); current?.state === 'accepted' is true |
| [src/cloud/friend-invites.ts:269](../src/cloud/friend-invites.ts#L269) | Error/validation | The invitation could not be checked. Try again later. | acceptInvite(); operation rejected or threw; operation rejected or threw |
| [src/cloud/friend-invites.ts:276](../src/cloud/friend-invites.ts#L276) | Error/validation | This invite is no longer available. | acceptInvite(); operation rejected or threw; !latest.exists() &#124;&#124; latest.data().state !== 'active' &#124;&#124; parseFriendInvite(token, latest.data()).expiresAt &lt;= Date.now() is true |
| [src/cloud/friend-invites.ts:280](../src/cloud/friend-invites.ts#L280) | Error/validation | The invitation could not be accepted. Refresh the page, then try again. | acceptInvite(); operation rejected or threw |
## src/cloud/friend-outcomes.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/friend-outcomes.ts:12](../src/cloud/friend-outcomes.ts#L12) | Message/fragment | Friend settings confirmed. Reconnect to continue. | committedFriendMessage(); case 'initialize' |
| [src/cloud/friend-outcomes.ts:14](../src/cloud/friend-outcomes.ts#L14) | Message/fragment | Profile saved. Reconnect to refresh it. | committedFriendMessage(); case 'save-identity' |
| [src/cloud/friend-outcomes.ts:16](../src/cloud/friend-outcomes.ts#L16) | Message/fragment | Sharing choice saved. Reconnect to refresh its status. | committedFriendMessage(); case 'save-settings' |
| [src/cloud/friend-outcomes.ts:18](../src/cloud/friend-outcomes.ts#L18) | Message/fragment | Request sent. Reconnect to refresh Friends. | committedFriendMessage(); case 'send-request' |
| [src/cloud/friend-outcomes.ts:20](../src/cloud/friend-outcomes.ts#L20) | Message/fragment | Connection updated. Reconnect to refresh Friends. | committedFriendMessage(); case 'respond' |
| [src/cloud/friend-outcomes.ts:22](../src/cloud/friend-outcomes.ts#L22) | Message/fragment | Invitation created. Reconnect and open Invite links to retrieve it. | committedFriendMessage(); case 'create-invite' |
| [src/cloud/friend-outcomes.ts:24](../src/cloud/friend-outcomes.ts#L24) | Message/fragment | Invitation accepted. Reconnect to open Friends. | committedFriendMessage(); case 'accept-invite' |
| [src/cloud/friend-outcomes.ts:26](../src/cloud/friend-outcomes.ts#L26) | Message/fragment | Shared ranking saved. Refresh or cleanup is still pending. | committedFriendMessage(); case 'publish-ranking' |
| [src/cloud/friend-outcomes.ts:28](../src/cloud/friend-outcomes.ts#L28) | Message/fragment | Group saved. Refresh groups before editing it again. | committedFriendMessage(); case 'save-group' |
| [src/cloud/friend-outcomes.ts:34](../src/cloud/friend-outcomes.ts#L34) | Message/fragment | The change could not be confirmed. Reconnect and refresh its status before trying again. | friendMutationError(); kind === 'transient' is true |
| [src/cloud/friend-outcomes.ts:36](../src/cloud/friend-outcomes.ts#L36) | Message/fragment | The online service has reached a limit. Wait, then refresh to check whether the change was saved. | friendMutationError(); kind === 'quota' is true |
## src/cloud/friend-page-actions.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/friend-page-actions.ts:7](../src/cloud/friend-page-actions.ts#L7) | Error/validation | This player link is invalid. | navigateFriend(); !/^[A-Za-z0-9_-]{1,128}$/.test(uid) is true |
| [src/cloud/friend-page-actions.ts:20](../src/cloud/friend-page-actions.ts#L20) | Error/validation | Verify your signed-in account before continuing. | prepareFriendIdentity(); !identity.verified &#124;&#124; cloudAuth.currentUser?.uid !== identity.uid is true |
| [src/cloud/friend-page-actions.ts:24](../src/cloud/friend-page-actions.ts#L24) | Error/validation | The account changed. Review before continuing. | [settings, previous](); !current() is true |
| [src/cloud/friend-page-actions.ts:29](../src/cloud/friend-page-actions.ts#L29) | Error/validation | The account changed. Review before continuing. | [settings, previous](); !current() is true |
| [src/cloud/friend-page-actions.ts:34](../src/cloud/friend-page-actions.ts#L34) | Error/validation | The account changed. Review before continuing. | prepareFriendIdentity(); cloudAuth.currentUser?.uid !== identity.uid is true |
| [src/cloud/friend-page-actions.ts:35](../src/cloud/friend-page-actions.ts#L35) | Error/validation | This account is being deleted. | prepareFriendIdentity(); settings.deleted is true |
## src/cloud/friend-pairs.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/friend-pairs.ts:43](../src/cloud/friend-pairs.ts#L43) | Message/fragment | You can't send this person a request right now. | requestUnavailable(); when its owning surface/operation is used |
| [src/cloud/friend-pairs.ts:44](../src/cloud/friend-pairs.ts#L44) | Message/fragment | You cancelled a request to this person a moment ago. Try again in a few minutes. | recentlyCancelled(); when its owning surface/operation is used |
| [src/cloud/friend-pairs.ts:96](../src/cloud/friend-pairs.ts#L96) | Error/validation | Your connection count could not be read. Refresh the page, then try again. | touchPairCount(); !isSafeInteger(value.count) &#124;&#124; value.count &lt; 0 &#124;&#124; !isSafeInteger(value.revision) &#124;&#124; value.revision &lt; 0 is true |
| [src/cloud/friend-pairs.ts:133](../src/cloud/friend-pairs.ts#L133) | Message output | 'You are already friends.' | epoch(); current?.state === 'accepted' is true |
| [src/cloud/friend-pairs.ts:133](../src/cloud/friend-pairs.ts#L133) | Message/fragment | You are already friends. | epoch(); current?.state === 'accepted' is true |
| [src/cloud/friend-pairs.ts:135](../src/cloud/friend-pairs.ts#L135) | Message output | current.from === uid ? 'Your request is already waiting for a response.' : 'This person already sent you a request. Accept or decline that request instead.' | epoch(); current?.state === 'pending' is true |
| [src/cloud/friend-pairs.ts:137](../src/cloud/friend-pairs.ts#L137) | Message/fragment | Your request is already waiting for a response. | epoch(); current?.state === 'pending' is true; current.from === uid is true |
| [src/cloud/friend-pairs.ts:138](../src/cloud/friend-pairs.ts#L138) | Message/fragment | This person already sent you a request. Accept or decline that request instead. | epoch(); current?.state === 'pending' is true; current.from === uid is false |
| [src/cloud/friend-pairs.ts:199](../src/cloud/friend-pairs.ts#L199) | Message output | 'That relationship no longer has this action available.' | respond(); action === 'remove' ? current.state !== 'accepted' : current.state !== 'pending' is true |
| [src/cloud/friend-pairs.ts:199](../src/cloud/friend-pairs.ts#L199) | Message/fragment | That relationship no longer has this action available. | respond(); action === 'remove' ? current.state !== 'accepted' : current.state !== 'pending' is true |
| [src/cloud/friend-pairs.ts:201](../src/cloud/friend-pairs.ts#L201) | Message output | 'Only the recipient can respond to this request.' | respond(); (action === 'accept' &#124;&#124; action === 'decline') &amp;&amp; current.from === uid is true |
| [src/cloud/friend-pairs.ts:201](../src/cloud/friend-pairs.ts#L201) | Message/fragment | Only the recipient can respond to this request. | respond(); (action === 'accept' &#124;&#124; action === 'decline') &amp;&amp; current.from === uid is true |
| [src/cloud/friend-pairs.ts:202](../src/cloud/friend-pairs.ts#L202) | Message output | 'Only the sender can cancel this request.' | respond(); action === 'cancel' &amp;&amp; current.from !== uid is true |
| [src/cloud/friend-pairs.ts:202](../src/cloud/friend-pairs.ts#L202) | Message/fragment | Only the sender can cancel this request. | respond(); action === 'cancel' &amp;&amp; current.from !== uid is true |
## src/cloud/friend-profile.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/friend-profile.ts:56](../src/cloud/friend-profile.ts#L56) | Error/validation | Choose whether friends-only sharing is enabled. | saveSettings(); typeof input.enabled !== 'boolean' is true |
| [src/cloud/friend-profile.ts:109](../src/cloud/friend-profile.ts#L109) | Message output | 'Your friend profile changed. Reload before saving its name or icon.' | saveIdentity(); (current?.revision ?? 0) !== expectedRevision is true |
| [src/cloud/friend-profile.ts:109](../src/cloud/friend-profile.ts#L109) | Message/fragment | Your friend profile changed. Reload before saving its name or icon. | saveIdentity(); (current?.revision ?? 0) !== expectedRevision is true |
## src/cloud/friend-ranking-share.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/friend-ranking-share.ts:56](../src/cloud/friend-ranking-share.ts#L56) | Error/validation | This person has not shared a ranking. | ranking(); !head?.current is true |
| [src/cloud/friend-ranking-share.ts:68](../src/cloud/friend-ranking-share.ts#L68) | Error/validation | This shared ranking is incomplete. Reload it. | ranking(); current.count is true; chunks.size !== Math.ceil(current.count / FRIEND_CHUNK_SIZE) is true |
| [src/cloud/friend-ranking-share.ts:71](../src/cloud/friend-ranking-share.ts#L71) | Error/validation | Parts of this shared ranking are out of order. Reload it. | ranking(); current.count is true; snap.id !== String(index) is true |
| [src/cloud/friend-ranking-share.ts:79](../src/cloud/friend-ranking-share.ts#L79) | Error/validation | This shared ranking failed its integrity check. | ranking(); new Set(entries.map((entry) =&gt; entry.id)).size !== entries.length &#124;&#124; (await contentDigest(entries)) !== current.digest is true |
| [src/cloud/friend-ranking-share.ts:82](../src/cloud/friend-ranking-share.ts#L82) | Message output | 'This shared ranking changed while loading. Reload it.' | ranking(); !latest &#124;&#124; latest.revision !== head.revision &#124;&#124; latest.current?.generation !== current.generation is true |
| [src/cloud/friend-ranking-share.ts:82](../src/cloud/friend-ranking-share.ts#L82) | Message/fragment | This shared ranking changed while loading. Reload it. | ranking(); !latest &#124;&#124; latest.revision !== head.revision &#124;&#124; latest.current?.generation !== current.generation is true |
| [src/cloud/friend-ranking-share.ts:95](../src/cloud/friend-ranking-share.ts#L95) | Error/validation | Enable friends-only sharing before publishing. | publishRanking(); !expected.enabled is true |
| [src/cloud/friend-ranking-share.ts:99](../src/cloud/friend-ranking-share.ts#L99) | Message output | 'The active account changed. The sharing update was cancelled.' | guard(); isCurrent &amp;&amp; !isCurrent() is true |
| [src/cloud/friend-ranking-share.ts:99](../src/cloud/friend-ranking-share.ts#L99) | Message/fragment | The active account changed. The sharing update was cancelled. | guard(); isCurrent &amp;&amp; !isCurrent() is true |
| [src/cloud/friend-ranking-share.ts:104](../src/cloud/friend-ranking-share.ts#L104) | Message output | 'The private online copy changed or paused. Wait for it to save before sharing.' | checkSource(); !sync?.enabled &#124;&#124; sync.deleted &#124;&#124; sync.epoch !== source.syncEpoch &#124;&#124; sync.revision !== source.remoteRevision is true |
| [src/cloud/friend-ranking-share.ts:104](../src/cloud/friend-ranking-share.ts#L104) | Message/fragment | The private online copy changed or paused. Wait for it to save before sharing. | checkSource(); !sync?.enabled &#124;&#124; sync.deleted &#124;&#124; sync.epoch !== source.syncEpoch &#124;&#124; sync.revision !== source.remoteRevision is true |
| [src/cloud/friend-ranking-share.ts:119](../src/cloud/friend-ranking-share.ts#L119) | Message output | 'A newer shared ranking is already available. Reload before replacing it.' | prior(); !publishedAlready(current, expected, digest) &amp;&amp; (current?.revision ?? 0) !== expectedHeadRevision is true |
| [src/cloud/friend-ranking-share.ts:119](../src/cloud/friend-ranking-share.ts#L119) | Message/fragment | A newer shared ranking is already available. Reload before replacing it. | prior(); !publishedAlready(current, expected, digest) &amp;&amp; (current?.revision ?? 0) !== expectedHeadRevision is true |
| [src/cloud/friend-ranking-share.ts:143](../src/cloud/friend-ranking-share.ts#L143) | Message output | 'A newer shared ranking is already available. Reload before replacing it.' | settle(); (current?.revision ?? 0) !== expectedHeadRevision is true |
| [src/cloud/friend-ranking-share.ts:143](../src/cloud/friend-ranking-share.ts#L143) | Message/fragment | A newer shared ranking is already available. Reload before replacing it. | settle(); (current?.revision ?? 0) !== expectedHeadRevision is true |
| [src/cloud/friend-ranking-share.ts:167](../src/cloud/friend-ranking-share.ts#L167) | Error/validation | Another sharing update is in progress. Retry after it finishes or after five minutes. | registered(); ids.length &gt;= 3 is true |
## src/cloud/friend-shelf-store.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/friend-shelf-store.ts:49](../src/cloud/friend-shelf-store.ts#L49) | Message/fragment | Shared games changed elsewhere. Refresh before trying again. | conflict(); when its owning surface/operation is used |
| [src/cloud/friend-shelf-store.ts:54](../src/cloud/friend-shelf-store.ts#L54) | Error/validation | Reconnect before changing shared games. | online(); typeof navigator !== 'undefined' &amp;&amp; navigator.onLine === false is true |
| [src/cloud/friend-shelf-store.ts:57](../src/cloud/friend-shelf-store.ts#L57) | Error/validation | Preview shared games before enabling the shelf. | active(); !value is true |
| [src/cloud/friend-shelf-store.ts:59](../src/cloud/friend-shelf-store.ts#L59) | Error/validation | This account is being deleted. Shared games cannot be enabled. | active(); value.deleted is true |
| [src/cloud/friend-shelf-store.ts:68](../src/cloud/friend-shelf-store.ts#L68) | Error/validation | Shared games could not be refreshed. | errorValue(); cause instanceof Error is false |
| [src/cloud/friend-shelf-store.ts:165](../src/cloud/friend-shelf-store.ts#L165) | Error/validation | Choose whether to share these games. | saveConfig(); typeof input.enabled !== 'boolean' is true |
| [src/cloud/friend-shelf-store.ts:168](../src/cloud/friend-shelf-store.ts#L168) | Message output | 'This shelf action was cancelled because its account or consent changed.' | guard(); !isCurrent() is true |
| [src/cloud/friend-shelf-store.ts:168](../src/cloud/friend-shelf-store.ts#L168) | Message/fragment | This shelf action was cancelled because its account or consent changed. | guard(); !isCurrent() is true |
| [src/cloud/friend-shelf-store.ts:187](../src/cloud/friend-shelf-store.ts#L187) | Error/validation | Stopped sharing must clear its saving consent. | saveConfig(); input.enabled is false; input.consentSyncEpoch !== null is true |
| [src/cloud/friend-shelf-store.ts:219](../src/cloud/friend-shelf-store.ts#L219) | Error/validation | No shared games are available. | shelf(); !head?.current is true |
| [src/cloud/friend-shelf-store.ts:231](../src/cloud/friend-shelf-store.ts#L231) | Error/validation | The shared shelf is incomplete. Refresh it. | shelf(); manifest.count is true; chunks.size !== Math.ceil(manifest.count / FRIEND_SHELF_CHUNK_SIZE) is true |
| [src/cloud/friend-shelf-store.ts:234](../src/cloud/friend-shelf-store.ts#L234) | Error/validation | Parts of these shared games do not match. Refresh them. | shelf(); manifest.count is true; chunk.id !== String(index) is true |
| [src/cloud/friend-shelf-store.ts:242](../src/cloud/friend-shelf-store.ts#L242) | Error/validation | Shared games failed their integrity check. | shelf(); new Set(entries.map((entry) =&gt; entry.id)).size !== entries.length &#124;&#124; (await friendShelfDigest(entries)) !== manifest.digest is true |
| [src/cloud/friend-shelf-store.ts:245](../src/cloud/friend-shelf-store.ts#L245) | Message output | 'Shared games changed while loading. Refresh them.' | shelf(); latest?.revision !== head.revision &#124;&#124; latest.current?.generation !== manifest.generation is true |
| [src/cloud/friend-shelf-store.ts:245](../src/cloud/friend-shelf-store.ts#L245) | Message/fragment | Shared games changed while loading. Refresh them. | shelf(); latest?.revision !== head.revision &#124;&#124; latest.current?.generation !== manifest.generation is true |
| [src/cloud/friend-shelf-store.ts:256](../src/cloud/friend-shelf-store.ts#L256) | Error/validation | Preview and enable shared games first. | publish(); !active(expected).enabled is true |
| [src/cloud/friend-shelf-store.ts:262](../src/cloud/friend-shelf-store.ts#L262) | Message output | 'This account or selection changed. The shelf update was cancelled.' | guard(); !isCurrent() is true |
| [src/cloud/friend-shelf-store.ts:262](../src/cloud/friend-shelf-store.ts#L262) | Message/fragment | This account or selection changed. The shelf update was cancelled. | guard(); !isCurrent() is true |
| [src/cloud/friend-shelf-store.ts:267](../src/cloud/friend-shelf-store.ts#L267) | Message output | 'Wait for the current private online copy to finish saving.' | checkSource(); !sync?.enabled &#124;&#124; sync.deleted &#124;&#124; sync.epoch !== source.syncEpoch &#124;&#124; sync.revision !== source.remoteRevision is true |
| [src/cloud/friend-shelf-store.ts:267](../src/cloud/friend-shelf-store.ts#L267) | Message/fragment | Wait for the current private online copy to finish saving. | checkSource(); !sync?.enabled &#124;&#124; sync.deleted &#124;&#124; sync.epoch !== source.syncEpoch &#124;&#124; sync.revision !== source.remoteRevision is true |
| [src/cloud/friend-shelf-store.ts:329](../src/cloud/friend-shelf-store.ts#L329) | Error/validation | A shelf update is still pending. Shared games will retry after the upload expires. | registered(); ids.length &gt;= 3 is true |
| [src/cloud/friend-shelf-store.ts:445](../src/cloud/friend-shelf-store.ts#L445) | Error/validation | Some shared-game copies could not be checked. Try again later. | removable(); !generation.exists() is true |
| [src/cloud/friend-shelf-store.ts:505](../src/cloud/friend-shelf-store.ts#L505) | Message output | 'Shared-game deletion is not ready. Refresh the page, then confirm deletion.' | cleanupDeleted(); !(await this.config(uid))?.deleted is true |
| [src/cloud/friend-shelf-store.ts:505](../src/cloud/friend-shelf-store.ts#L505) | Message/fragment | Shared-game deletion is not ready. Refresh the page, then confirm deletion. | cleanupDeleted(); !(await this.config(uid))?.deleted is true |
## src/cloud/friend-store-core.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/friend-store-core.ts:7](../src/cloud/friend-store-core.ts#L7) | Message/fragment | This changed elsewhere. Reload before trying again. | conflict(); when its owning surface/operation is used |
| [src/cloud/friend-store-core.ts:12](../src/cloud/friend-store-core.ts#L12) | Error/validation | Reconnect before changing friendships or sharing. | online(); typeof navigator !== 'undefined' &amp;&amp; navigator.onLine === false is true |
| [src/cloud/friend-store-core.ts:15](../src/cloud/friend-store-core.ts#L15) | Error/validation | Open Friends to prepare your friend profile first. | activeSettings(); !value is true |
| [src/cloud/friend-store-core.ts:17](../src/cloud/friend-store-core.ts#L17) | Error/validation | This account is being deleted. Friendship changes are disabled. | activeSettings(); value.deleted is true |
| [src/cloud/friend-store-core.ts:23](../src/cloud/friend-store-core.ts#L23) | Message output | 'Sharing settings changed. Reload the selection before publishing.' | expectedSettings(); current.epoch !== expected.epoch &#124;&#124; current.revision !== expected.revision is true |
| [src/cloud/friend-store-core.ts:23](../src/cloud/friend-store-core.ts#L23) | Message/fragment | Sharing settings changed. Reload the selection before publishing. | expectedSettings(); current.epoch !== expected.epoch &#124;&#124; current.revision !== expected.revision is true |
| [src/cloud/friend-store-core.ts:71](../src/cloud/friend-store-core.ts#L71) | Error/validation | Friend data could not be read. Try again. | errorValue(); cause instanceof Error is false |
## src/cloud/friend-store.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/friend-store.ts:178](../src/cloud/friend-store.ts#L178) | Error/validation | This friend identity belongs to a different account. | identity(); identity.uid !== uid is true |
| [src/cloud/friend-store.ts:241](../src/cloud/friend-store.ts#L241) | Error/validation | Connection cleanup is not ready yet. Try again later. | rows(); cause &amp;&amp; typeof cause === 'object' &amp;&amp; 'code' in cause &amp;&amp; cause.code === 'failed-precondition' is true |
## src/cloud/FriendComparisonCoverage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendComparisonCoverage.tsx:47](../src/cloud/FriendComparisonCoverage.tsx#L47) | Live region | ${unavailable.map((person) =&gt; ( &lt;li key={person.id}&gt; &lt;strong&gt; &lt;bdi&gt;{person.displayName}&lt;/bdi&gt;: &lt;/strong&gt;{' '} {person.availability === 'error' ? 'Rankings could not load.' : 'Rankings are unavailable.'} &lt;/li&gt; ))} Review coverage and recovery | FriendComparisonCoverage(); unavailable.length &gt; 0 &amp;&amp; |
| [src/cloud/FriendComparisonCoverage.tsx:51](../src/cloud/FriendComparisonCoverage.tsx#L51) | Rendered copy | ${person.displayName}: | FriendComparisonCoverage(); unavailable.length &gt; 0 &amp;&amp; |
| [src/cloud/FriendComparisonCoverage.tsx:54](../src/cloud/FriendComparisonCoverage.tsx#L54) | Message/fragment | Rankings are unavailable. | FriendComparisonCoverage(); unavailable.length &gt; 0 &amp;&amp;; person.availability === 'error' is false |
| [src/cloud/FriendComparisonCoverage.tsx:54](../src/cloud/FriendComparisonCoverage.tsx#L54) | Message/fragment | Rankings could not load. | FriendComparisonCoverage(); unavailable.length &gt; 0 &amp;&amp;; person.availability === 'error' is true |
| [src/cloud/FriendComparisonCoverage.tsx:58](../src/cloud/FriendComparisonCoverage.tsx#L58) | Rendered copy | Review coverage and recovery | FriendComparisonCoverage(); unavailable.length &gt; 0 &amp;&amp; |
| [src/cloud/FriendComparisonCoverage.tsx:70](../src/cloud/FriendComparisonCoverage.tsx#L70) | Rendered copy | Coverage &amp; loading ${comparison &amp;&amp; ( &lt;span className="compare-coverage-summary" role="status"&gt; {filtered ? 'Only the chosen games are checked. Overall totals are unknown.' : comparison.cohort.incomplete ? datasets.some((person) =&gt; person.availability === 'loading') ? 'Loading chosen rankings… Overall totals are unknown.' : 'Loaded games only. Overall totals are unknown.' : &#96;${comparison.summary.sharedGameCount ?? 'Unknown'} games in common.&#96;} &lt;/span&gt; )} | FriendComparisonCoverage(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonCoverage.tsx:73](../src/cloud/FriendComparisonCoverage.tsx#L73) | Live region | ${filtered ? 'Only the chosen games are checked. Overall totals are unknown.' : comparison.cohort.incomplete ? datasets.some((person) =&gt; person.availability === 'loading') ? 'Loading chosen rankings… Overall totals are unknown.' : 'Loaded games only. Overall totals are unknown.' : &#96;${comparison.summary.sharedGameCount ?? 'Unknown'} games in common.&#96;} | FriendComparisonCoverage(); comparison &amp;&amp; |
| [src/cloud/FriendComparisonCoverage.tsx:75](../src/cloud/FriendComparisonCoverage.tsx#L75) | Message/fragment | Only the chosen games are checked. Overall totals are unknown. | FriendComparisonCoverage(); comparison &amp;&amp;; filtered is true |
| [src/cloud/FriendComparisonCoverage.tsx:78](../src/cloud/FriendComparisonCoverage.tsx#L78) | Message/fragment | Loading chosen rankings… Overall totals are unknown. | FriendComparisonCoverage(); comparison &amp;&amp;; filtered is false; comparison.cohort.incomplete is true; datasets.some((person) =&gt; person.availability === 'loading') is true |
| [src/cloud/FriendComparisonCoverage.tsx:79](../src/cloud/FriendComparisonCoverage.tsx#L79) | Message/fragment | Loaded games only. Overall totals are unknown. | FriendComparisonCoverage(); comparison &amp;&amp;; filtered is false; comparison.cohort.incomplete is true; datasets.some((person) =&gt; person.availability === 'loading') is false |
| [src/cloud/FriendComparisonCoverage.tsx:80](../src/cloud/FriendComparisonCoverage.tsx#L80) | Message/fragment | ${comparison.summary.sharedGameCount ?? 'Unknown'} games in common. | FriendComparisonCoverage(); comparison &amp;&amp;; filtered is false; comparison.cohort.incomplete is false |
| [src/cloud/FriendComparisonCoverage.tsx:100](../src/cloud/FriendComparisonCoverage.tsx#L100) | Rendered copy | ${comparison.summary.sharedGameCount ?? 'Unknown'} games in common. ${comparison.summary.pairs.length === 1 &amp;&amp; comparison.summary.pairs[0]?.meanAbsoluteScoreGap != null ? &#96; Mean score gap ${comparison.summary.pairs[0].meanAbsoluteScoreGap.toFixed(2)} across ${comparison.summary.pairs[0].jointlyRatedCount} jointly rated games.&#96; : ''} | FriendComparisonCoverage(); expanded "Coverage &amp; loading ${comparison &amp;&amp; ( &lt;span className="compare-coverage-summary" role="status"&gt; {filtered ? 'Only the chosen games are checked. Overall totals are unknown.' : comparison.cohort.incomplete ? datasets.some((person) =&gt; person.availability === 'loading') ? 'Loading chosen rankings… Overall totals are unknown.' : 'Loaded games only. Overall totals are unknown.' : &#96;${comparison.summary.sharedGameCount ?? 'Unknown'} games in common.&#96;} &lt;/span&gt; )}" disclosure; comparison &amp;&amp; !filtered &amp;&amp; |
| [src/cloud/FriendComparisonCoverage.tsx:101](../src/cloud/FriendComparisonCoverage.tsx#L101) | Message/fragment | Unknown | FriendComparisonCoverage(); expanded "Coverage &amp; loading ${comparison &amp;&amp; ( &lt;span className="compare-coverage-summary" role="status"&gt; {filtered ? 'Only the chosen games are checked. Overall totals are unknown.' : comparison.cohort.incomplete ? datasets.some((person) =&gt; person.availability === 'loading') ? 'Loading chosen rankings… Overall totals are unknown.' : 'Loaded games only. Overall totals are unknown.' : &#96;${comparison.summary.sharedGameCount ?? 'Unknown'} games in common.&#96;} &lt;/span&gt; )}" disclosure; comparison &amp;&amp; !filtered &amp;&amp;; comparison.summary.sharedGameCount ?? |
| [src/cloud/FriendComparisonCoverage.tsx:103](../src/cloud/FriendComparisonCoverage.tsx#L103) | Message/fragment | Mean score gap ${comparison.summary.pairs[0].meanAbsoluteScoreGap.toFixed(2)} across ${comparison.summary.pairs[0].jointlyRatedCount} jointly rated games. | FriendComparisonCoverage(); expanded "Coverage &amp; loading ${comparison &amp;&amp; ( &lt;span className="compare-coverage-summary" role="status"&gt; {filtered ? 'Only the chosen games are checked. Overall totals are unknown.' : comparison.cohort.incomplete ? datasets.some((person) =&gt; person.availability === 'loading') ? 'Loading chosen rankings… Overall totals are unknown.' : 'Loaded games only. Overall totals are unknown.' : &#96;${comparison.summary.sharedGameCount ?? 'Unknown'} games in common.&#96;} &lt;/span&gt; )}" disclosure; comparison &amp;&amp; !filtered &amp;&amp;; comparison.summary.pairs.length === 1 &amp;&amp; comparison.summary.pairs[0]?.meanAbsoluteScoreGap != null is true |
## src/cloud/FriendComparisonFilters.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendComparisonFilters.tsx:29](../src/cloud/FriendComparisonFilters.tsx#L29) | Rendered copy | Games Ranked by everyone All available games | FriendComparisonFilters(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonFilters.tsx:32](../src/cloud/FriendComparisonFilters.tsx#L32) | Label/help | Games | FriendComparisonFilters(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonFilters.tsx:40](../src/cloud/FriendComparisonFilters.tsx#L40) | Rendered copy | Ranked by everyone | FriendComparisonFilters(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonFilters.tsx:41](../src/cloud/FriendComparisonFilters.tsx#L41) | Rendered copy | All available games | FriendComparisonFilters(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonFilters.tsx:44](../src/cloud/FriendComparisonFilters.tsx#L44) | Rendered copy | Search games | FriendComparisonFilters(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonFilters.tsx:59](../src/cloud/FriendComparisonFilters.tsx#L59) | Label/help | Games chosen for comparison | FriendComparisonFilters(); filteredGames.value &amp;&amp; |
| [src/cloud/FriendComparisonFilters.tsx:61](../src/cloud/FriendComparisonFilters.tsx#L61) | Rendered copy | ${filteredGames.value.records.length} ${filteredGames.value.records.length === 1 ? 'game' : 'games'} from your tray | FriendComparisonFilters(); filteredGames.value &amp;&amp; |
| [src/cloud/FriendComparisonFilters.tsx:65](../src/cloud/FriendComparisonFilters.tsx#L65) | Rendered copy | Clear game filter | FriendComparisonFilters(); filteredGames.value &amp;&amp; |
| [src/cloud/FriendComparisonFilters.tsx:79](../src/cloud/FriendComparisonFilters.tsx#L79) | Rendered copy | ${record.title} | FriendComparisonFilters(); filteredGames.value &amp;&amp; |
## src/cloud/FriendComparisonGroups.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendComparisonGroups.tsx:53](../src/cloud/FriendComparisonGroups.tsx#L53) | Rendered copy | Private groups | FriendComparisonGroups(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonGroups.tsx:69](../src/cloud/FriendComparisonGroups.tsx#L69) | Message output | 'Group saved.' | FriendComparisonGroups(); onSubmit |
| [src/cloud/FriendComparisonGroups.tsx:69](../src/cloud/FriendComparisonGroups.tsx#L69) | Message/fragment | Group saved. | FriendComparisonGroups(); onSubmit |
| [src/cloud/FriendComparisonGroups.tsx:73](../src/cloud/FriendComparisonGroups.tsx#L73) | Rendered copy | Group name | FriendComparisonGroups(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonGroups.tsx:84](../src/cloud/FriendComparisonGroups.tsx#L84) | Rendered copy | Save group | FriendComparisonGroups(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonGroups.tsx:91](../src/cloud/FriendComparisonGroups.tsx#L91) | Rendered copy | New group | FriendComparisonGroups(); group &amp;&amp; |
| [src/cloud/FriendComparisonGroups.tsx:106](../src/cloud/FriendComparisonGroups.tsx#L106) | Rendered copy | Delete group | FriendComparisonGroups(); group &amp;&amp; |
| [src/cloud/FriendComparisonGroups.tsx:117](../src/cloud/FriendComparisonGroups.tsx#L117) | Message output | 'Group deleted.' | FriendComparisonGroups(); group &amp;&amp;; onClick |
| [src/cloud/FriendComparisonGroups.tsx:117](../src/cloud/FriendComparisonGroups.tsx#L117) | Message/fragment | Group deleted. | FriendComparisonGroups(); group &amp;&amp;; onClick |
| [src/cloud/FriendComparisonGroups.tsx:127](../src/cloud/FriendComparisonGroups.tsx#L127) | Rendered copy | Refresh groups | FriendComparisonGroups(); refreshGroupId &amp;&amp; |
| [src/cloud/FriendComparisonGroups.tsx:141](../src/cloud/FriendComparisonGroups.tsx#L141) | Message output | 'Groups refreshed.' | FriendComparisonGroups(); refreshGroupId &amp;&amp;; onClick |
| [src/cloud/FriendComparisonGroups.tsx:141](../src/cloud/FriendComparisonGroups.tsx#L141) | Message/fragment | Groups refreshed. | FriendComparisonGroups(); refreshGroupId &amp;&amp;; onClick |
| [src/cloud/FriendComparisonGroups.tsx:151](../src/cloud/FriendComparisonGroups.tsx#L151) | Rendered copy | ${item.name} | FriendComparisonGroups(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonGroups.tsx:159](../src/cloud/FriendComparisonGroups.tsx#L159) | Rendered copy | More groups | FriendComparisonGroups(); groupCursor &amp;&amp; |
## src/cloud/FriendComparisonLoader.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendComparisonLoader.tsx:61](../src/cloud/FriendComparisonLoader.tsx#L61) | Message/fragment | Unavailable player | basic(); person?.displayName ?? |
| [src/cloud/FriendComparisonLoader.tsx:93](../src/cloud/FriendComparisonLoader.tsx#L93) | Message/fragment | Player | FriendComparisonLoader(); person?.displayName ?? |
| [src/cloud/FriendComparisonLoader.tsx:96](../src/cloud/FriendComparisonLoader.tsx#L96) | Message/fragment | ${view.exactIds.length} chosen ${view.exactIds.length === 1 ? 'game' : 'games'} checked | FriendComparisonLoader(); view.status === 'ready' is true; view.exactIds is true |
| [src/cloud/FriendComparisonLoader.tsx:97](../src/cloud/FriendComparisonLoader.tsx#L97) | Message/fragment | ${view.entries.length} / ${view.total} rankings loaded | FriendComparisonLoader(); view.status === 'ready' is true; view.exactIds is false |
| [src/cloud/FriendComparisonLoader.tsx:100](../src/cloud/FriendComparisonLoader.tsx#L100) | Rendered copy | Load next 25 for ${person?.displayName ?? 'player'} | FriendComparisonLoader(); view.status === 'ready' &amp;&amp; !view.complete &amp;&amp; |
| [src/cloud/FriendComparisonLoader.tsx:112](../src/cloud/FriendComparisonLoader.tsx#L112) | Rendered copy | ${view.error} | FriendComparisonLoader(); view.error &amp;&amp; |
| [src/cloud/FriendComparisonLoader.tsx:113](../src/cloud/FriendComparisonLoader.tsx#L113) | Rendered copy | Refresh ${person?.displayName ?? 'player'} | FriendComparisonLoader(); view.error &amp;&amp; |
## src/cloud/FriendComparisonPage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendComparisonPage.tsx:95](../src/cloud/FriendComparisonPage.tsx#L95) | Message output | &#96;A friend profile is unavailable. ${onlineError(cause)}&#96; | addChoices(); currentUid.current === uid &amp;&amp; cloudAuth.currentUser?.uid === uid is true |
| [src/cloud/FriendComparisonPage.tsx:95](../src/cloud/FriendComparisonPage.tsx#L95) | Message/fragment | A friend profile is unavailable. ${onlineError(cause)} | addChoices(); currentUid.current === uid &amp;&amp; cloudAuth.currentUser?.uid === uid is true |
| [src/cloud/FriendComparisonPage.tsx:133](../src/cloud/FriendComparisonPage.tsx#L133) | Message output | onlineError(cause) | FriendComparisonPage(); alive is true |
| [src/cloud/FriendComparisonPage.tsx:144](../src/cloud/FriendComparisonPage.tsx#L144) | Message output | onlineError(cause) | FriendComparisonPage(); alive is true |
| [src/cloud/FriendComparisonPage.tsx:151](../src/cloud/FriendComparisonPage.tsx#L151) | Error/validation | This group is no longer available. | FriendComparisonPage(); requestedGroup is true; !saved is true |
| [src/cloud/FriendComparisonPage.tsx:159](../src/cloud/FriendComparisonPage.tsx#L159) | Message output | onlineError(cause) | FriendComparisonPage(); requestedGroup is true; alive &amp;&amp; request === generation.current is true |
| [src/cloud/FriendComparisonPage.tsx:231](../src/cloud/FriendComparisonPage.tsx#L231) | Message output | 'A player is no longer a friend and was removed from this comparison.' | removeParticipant(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonPage.tsx:231](../src/cloud/FriendComparisonPage.tsx#L231) | Message/fragment | A player is no longer a friend and was removed from this comparison. | removeParticipant(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonPage.tsx:250](../src/cloud/FriendComparisonPage.tsx#L250) | Message/fragment | Loading player… | datasets(); id === uid is false; participants[id] ??; identities[id]?.displayName ?? |
| [src/cloud/FriendComparisonPage.tsx:320](../src/cloud/FriendComparisonPage.tsx#L320) | Message output | committedFriendMessage(committed) | run(); operation rejected or threw; committed is true |
| [src/cloud/FriendComparisonPage.tsx:324](../src/cloud/FriendComparisonPage.tsx#L324) | Message output | friendMutationError(cause) | run(); operation rejected or threw; committed is false |
| [src/cloud/FriendComparisonPage.tsx:334](../src/cloud/FriendComparisonPage.tsx#L334) | Rendered copy | Compare rankings | FriendComparisonPage(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonPage.tsx:337](../src/cloud/FriendComparisonPage.tsx#L337) | Rendered copy | Friends | FriendComparisonPage(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonPage.tsx:342](../src/cloud/FriendComparisonPage.tsx#L342) | Live region | ${filteredGames.warning} | FriendComparisonPage(); filteredGames.warning &amp;&amp; |
| [src/cloud/FriendComparisonPage.tsx:372](../src/cloud/FriendComparisonPage.tsx#L372) | Live region | ${error} | FriendComparisonPage(); error &amp;&amp; |
| [src/cloud/FriendComparisonPage.tsx:376](../src/cloud/FriendComparisonPage.tsx#L376) | Live region | ${message} | FriendComparisonPage(); message &amp;&amp; |
| [src/cloud/FriendComparisonPage.tsx:408](../src/cloud/FriendComparisonPage.tsx#L408) | Rendered copy | Choose at least two people. | FriendComparisonPage(); result is false; viewReady &amp;&amp; |
## src/cloud/FriendComparisonPeople.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendComparisonPeople.tsx:46](../src/cloud/FriendComparisonPeople.tsx#L46) | Label/help | Chosen people | FriendComparisonPeople(); viewReady is true |
| [src/cloud/FriendComparisonPeople.tsx:47](../src/cloud/FriendComparisonPeople.tsx#L47) | Rendered copy | ${selected.length} ${selected.length === 1 ? 'person' : 'people'}: ${datasets.map((person, index) =&gt; ( &lt;span key={person.id}&gt; {index &gt; 0 &amp;&amp; ', '} {person.id === uid ? &#96;You (${identity.displayName})&#96; : &lt;bdi&gt;{person.displayName}&lt;/bdi&gt;} &lt;/span&gt; ))} | FriendComparisonPeople(); viewReady is true |
| [src/cloud/FriendComparisonPeople.tsx:48](../src/cloud/FriendComparisonPeople.tsx#L48) | Rendered copy | ${selected.length} ${selected.length === 1 ? 'person' : 'people'}: | FriendComparisonPeople(); viewReady is true |
| [src/cloud/FriendComparisonPeople.tsx:52](../src/cloud/FriendComparisonPeople.tsx#L52) | Rendered copy | ${index &gt; 0 &amp;&amp; ', '} ${person.id === uid ? &#96;You (${identity.displayName})&#96; : &lt;bdi&gt;{person.displayName}&lt;/bdi&gt;} | FriendComparisonPeople(); viewReady is true |
| [src/cloud/FriendComparisonPeople.tsx:60](../src/cloud/FriendComparisonPeople.tsx#L60) | Live region | Opening comparison group… | FriendComparisonPeople(); viewReady is false |
| [src/cloud/FriendComparisonPeople.tsx:65](../src/cloud/FriendComparisonPeople.tsx#L65) | Rendered copy | Change people | FriendComparisonPeople(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonPeople.tsx:67](../src/cloud/FriendComparisonPeople.tsx#L67) | Rendered copy | Wait for this group to finish opening before changing people. | FriendComparisonPeople(); expanded "Change people" disclosure; !viewReady is true |
| [src/cloud/FriendComparisonPeople.tsx:71](../src/cloud/FriendComparisonPeople.tsx#L71) | Rendered copy | Choose 2–6 people | FriendComparisonPeople(); expanded "Change people" disclosure; !viewReady is false |
| [src/cloud/FriendComparisonPeople.tsx:76](../src/cloud/FriendComparisonPeople.tsx#L76) | Rendered copy | ${id === uid ? ( &lt;Avatar descriptor={identity.avatar} size={32} /&gt; ) : identities[id] ? ( &lt;Avatar descriptor={identities[id].avatar} size={32} /&gt; ) : null} ${id === uid ? ( 'You (private device copy)' ) : ( &lt;bdi&gt;{identities[id]?.displayName ?? 'Unavailable player'}&lt;/bdi&gt; )} | FriendComparisonPeople(); expanded "Change people" disclosure; !viewReady is false |
| [src/cloud/FriendComparisonPeople.tsx:91](../src/cloud/FriendComparisonPeople.tsx#L91) | Rendered copy | ${id === uid ? ( 'You (private device copy)' ) : ( &lt;bdi&gt;{identities[id]?.displayName ?? 'Unavailable player'}&lt;/bdi&gt; )} | FriendComparisonPeople(); expanded "Change people" disclosure; !viewReady is false |
| [src/cloud/FriendComparisonPeople.tsx:93](../src/cloud/FriendComparisonPeople.tsx#L93) | Message/fragment | You (private device copy) | FriendComparisonPeople(); expanded "Change people" disclosure; !viewReady is false; id === uid is true |
| [src/cloud/FriendComparisonPeople.tsx:95](../src/cloud/FriendComparisonPeople.tsx#L95) | Message/fragment | Unavailable player | FriendComparisonPeople(); expanded "Change people" disclosure; !viewReady is false; id === uid is false; identities[id]?.displayName ?? |
| [src/cloud/FriendComparisonPeople.tsx:102](../src/cloud/FriendComparisonPeople.tsx#L102) | Rendered copy | More friends | FriendComparisonPeople(); expanded "Change people" disclosure; !viewReady is false; cursor &amp;&amp; |
## src/cloud/FriendComparisonTable.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendComparisonTable.tsx:40](../src/cloud/FriendComparisonTable.tsx#L40) | Label/help | Ranking comparison table | FriendComparisonTable(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonTable.tsx:49](../src/cloud/FriendComparisonTable.tsx#L49) | Rendered copy | ${person.id === uid ? ( &lt;Avatar descriptor={identity.avatar} size={32} /&gt; ) : profile &amp;&amp; person.availability === 'ready' ? ( &lt;Avatar descriptor={profile.avatar} size={32} /&gt; ) : null} ${person.displayName} | FriendComparisonTable(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonTable.tsx:69](../src/cloud/FriendComparisonTable.tsx#L69) | Rendered copy | ${row.game.title} | FriendComparisonTable(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonTable.tsx:75](../src/cloud/FriendComparisonTable.tsx#L75) | Message output | onlineError(cause) | FriendComparisonTable(); onClick; operation rejected or threw |
| [src/cloud/FriendComparisonTable.tsx:81](../src/cloud/FriendComparisonTable.tsx#L81) | Rendered copy | ${row.game.source} · ${row.game.year ?? 'Year unknown'} | FriendComparisonTable(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonTable.tsx:82](../src/cloud/FriendComparisonTable.tsx#L82) | Message/fragment | Year unknown | FriendComparisonTable(); row.game.year ?? |
| [src/cloud/FriendComparisonTable.tsx:89](../src/cloud/FriendComparisonTable.tsx#L89) | Rendered copy | ${cell.score === null ? 'Unrated' : cell.score.toFixed(1)} | FriendComparisonTable(); cell.status === 'ranked' is true |
| [src/cloud/FriendComparisonTable.tsx:89](../src/cloud/FriendComparisonTable.tsx#L89) | Message/fragment | Unrated | FriendComparisonTable(); cell.status === 'ranked' is true; cell.score === null is true |
| [src/cloud/FriendComparisonTable.tsx:90](../src/cloud/FriendComparisonTable.tsx#L90) | Rendered copy | Rank ${cell.position} | FriendComparisonTable(); cell.status === 'ranked' is true |
| [src/cloud/FriendComparisonTable.tsx:93](../src/cloud/FriendComparisonTable.tsx#L93) | Rendered copy | ${unrankedCellLabel(cell.status)} | FriendComparisonTable(); cell.status === 'ranked' is false |
| [src/cloud/FriendComparisonTable.tsx:99](../src/cloud/FriendComparisonTable.tsx#L99) | Message/fragment | Incomplete | FriendComparisonTable(); row.cells.some((cell) =&gt; cell.status === 'unfetched') is true |
| [src/cloud/FriendComparisonTable.tsx:101](../src/cloud/FriendComparisonTable.tsx#L101) | Message/fragment | Unrated | FriendComparisonTable(); row.cells.some((cell) =&gt; cell.status === 'unfetched') is false; row.meanScore === null is true |
| [src/cloud/FriendComparisonTable.tsx:103](../src/cloud/FriendComparisonTable.tsx#L103) | Rendered copy | ${row.raterCount} ${row.raterCount === 1 ? 'rater' : 'raters'} · ${row.scoreSpread === null ? 'No spread' : row.scoreSpread.toFixed(2)} ${row.scoreDifference === null ? '' : &#96; · difference ${row.scoreDifference.toFixed(2)}&#96;} | FriendComparisonTable(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonTable.tsx:105](../src/cloud/FriendComparisonTable.tsx#L105) | Message/fragment | No spread | FriendComparisonTable(); row.scoreSpread === null is true |
| [src/cloud/FriendComparisonTable.tsx:106](../src/cloud/FriendComparisonTable.tsx#L106) | Message/fragment | · difference ${row.scoreDifference.toFixed(2)} | FriendComparisonTable(); row.scoreDifference === null is false |
| [src/cloud/FriendComparisonTable.tsx:115](../src/cloud/FriendComparisonTable.tsx#L115) | Rendered copy | ${filtered ? 'No chosen games match the available rankings and filters. Unshared rankings cannot contribute scores.' : 'No matching games in this view.'} | FriendComparisonTable(); !result.rows.length &amp;&amp; |
| [src/cloud/FriendComparisonTable.tsx:117](../src/cloud/FriendComparisonTable.tsx#L117) | Message/fragment | No chosen games match the available rankings and filters. Unshared rankings cannot contribute scores. | FriendComparisonTable(); !result.rows.length &amp;&amp;; filtered is true |
| [src/cloud/FriendComparisonTable.tsx:118](../src/cloud/FriendComparisonTable.tsx#L118) | Message/fragment | No matching games in this view. | FriendComparisonTable(); !result.rows.length &amp;&amp;; filtered is false |
| [src/cloud/FriendComparisonTable.tsx:122](../src/cloud/FriendComparisonTable.tsx#L122) | Rendered copy | Previous | FriendComparisonTable(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonTable.tsx:125](../src/cloud/FriendComparisonTable.tsx#L125) | Rendered copy | ${result.totalRows ? result.page : 0} / ${result.pageCount} | FriendComparisonTable(); when its owning surface/operation is used |
| [src/cloud/FriendComparisonTable.tsx:128](../src/cloud/FriendComparisonTable.tsx#L128) | Rendered copy | Next 25 | FriendComparisonTable(); when its owning surface/operation is used |
## src/cloud/FriendDetailPage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendDetailPage.tsx:86](../src/cloud/FriendDetailPage.tsx#L86) | Message output | 'Connect to view this player.' | FriendDetailPage(); watched?.uid !== uid &#124;&#124; watched.peer !== peer &#124;&#124; watched.store !== store &#124;&#124; watched.visible !== visible is true; !visible is true |
| [src/cloud/FriendDetailPage.tsx:86](../src/cloud/FriendDetailPage.tsx#L86) | Message/fragment | Connect to view this player. | FriendDetailPage(); watched?.uid !== uid &#124;&#124; watched.peer !== peer &#124;&#124; watched.store !== store &#124;&#124; watched.visible !== visible is true; !visible is true |
| [src/cloud/FriendDetailPage.tsx:105](../src/cloud/FriendDetailPage.tsx#L105) | Message output | onlineError(cause) | FriendDetailPage(); alive is true |
| [src/cloud/FriendDetailPage.tsx:129](../src/cloud/FriendDetailPage.tsx#L129) | Message output | onlineError(cause) | release(); value?.state === 'accepted' is false; value?.state !== 'pending' &#124;&#124; value.from !== peer is true; alive &amp;&amp; request === version.current is true |
| [src/cloud/FriendDetailPage.tsx:140](../src/cloud/FriendDetailPage.tsx#L140) | Message output | onlineError(cause) | release(); alive is true |
| [src/cloud/FriendDetailPage.tsx:158](../src/cloud/FriendDetailPage.tsx#L158) | Error/validation | The account changed. Review before sending. | requestFriend(); cloudAuth.currentUser?.uid !== uid is true |
| [src/cloud/FriendDetailPage.tsx:161](../src/cloud/FriendDetailPage.tsx#L161) | Message output | 'Request sent.' | requestFriend(); when its owning surface/operation is used |
| [src/cloud/FriendDetailPage.tsx:161](../src/cloud/FriendDetailPage.tsx#L161) | Message/fragment | Request sent. | requestFriend(); when its owning surface/operation is used |
| [src/cloud/FriendDetailPage.tsx:166](../src/cloud/FriendDetailPage.tsx#L166) | Message output | committedFriendMessage(committed) | requestFriend(); operation rejected or threw; committed is true |
| [src/cloud/FriendDetailPage.tsx:168](../src/cloud/FriendDetailPage.tsx#L168) | Message output | friendMutationError(cause) | requestFriend(); operation rejected or threw; committed is false |
| [src/cloud/FriendDetailPage.tsx:176](../src/cloud/FriendDetailPage.tsx#L176) | Rendered copy | Friends | FriendDetailPage(); when its owning surface/operation is used |
| [src/cloud/FriendDetailPage.tsx:181](../src/cloud/FriendDetailPage.tsx#L181) | Message/fragment | Player | FriendDetailPage(); person?.displayName ?? |
| [src/cloud/FriendDetailPage.tsx:184](../src/cloud/FriendDetailPage.tsx#L184) | Live region | Loading… | FriendDetailPage(); busy &amp;&amp; |
| [src/cloud/FriendDetailPage.tsx:186](../src/cloud/FriendDetailPage.tsx#L186) | Live region | ${error} | FriendDetailPage(); error &amp;&amp; |
| [src/cloud/FriendDetailPage.tsx:190](../src/cloud/FriendDetailPage.tsx#L190) | Live region | ${notice} | FriendDetailPage(); notice &amp;&amp; |
| [src/cloud/FriendDetailPage.tsx:192](../src/cloud/FriendDetailPage.tsx#L192) | Rendered copy | Compare rankings | FriendDetailPage(); pair?.state === 'accepted' is true |
| [src/cloud/FriendDetailPage.tsx:196](../src/cloud/FriendDetailPage.tsx#L196) | Rendered copy | ${pair.from === uid ? 'Your request is pending.' : 'An incoming request is waiting in Friends.'} | FriendDetailPage(); pair?.state === 'accepted' is false; pair?.state === 'pending' is true |
| [src/cloud/FriendDetailPage.tsx:196](../src/cloud/FriendDetailPage.tsx#L196) | Message/fragment | An incoming request is waiting in Friends. | FriendDetailPage(); pair?.state === 'accepted' is false; pair?.state === 'pending' is true; pair.from === uid is false |
| [src/cloud/FriendDetailPage.tsx:196](../src/cloud/FriendDetailPage.tsx#L196) | Message/fragment | Your request is pending. | FriendDetailPage(); pair?.state === 'accepted' is false; pair?.state === 'pending' is true; pair.from === uid is true |
| [src/cloud/FriendDetailPage.tsx:200](../src/cloud/FriendDetailPage.tsx#L200) | Rendered copy | Send friend request | FriendDetailPage(); pair?.state === 'accepted' is false; pair?.state === 'pending' is false; person &amp;&amp; uid !== peer &amp;&amp; |
| [src/cloud/FriendDetailPage.tsx:210](../src/cloud/FriendDetailPage.tsx#L210) | Rendered copy | Refresh connection | FriendDetailPage(); requestNeedsRefresh &amp;&amp; |
| [src/cloud/FriendDetailPage.tsx:221](../src/cloud/FriendDetailPage.tsx#L221) | Message output | onlineError(cause) | FriendDetailPage(); requestNeedsRefresh &amp;&amp;; onClick |
| [src/cloud/FriendDetailPage.tsx:229](../src/cloud/FriendDetailPage.tsx#L229) | Rendered copy | Shared ranking | FriendDetailPage(); pair?.state === 'accepted' &amp;&amp; |
| [src/cloud/FriendDetailPage.tsx:231](../src/cloud/FriendDetailPage.tsx#L231) | Live region | ${rankingView.status === 'ready' ? &#96;${entries.length} loaded / ${rankingView.total} shared rankings&#96; : rankingView.status === 'loading' ? 'Loading shared rankings…' : 'Shared ranking unavailable.'} | FriendDetailPage(); pair?.state === 'accepted' &amp;&amp; |
| [src/cloud/FriendDetailPage.tsx:233](../src/cloud/FriendDetailPage.tsx#L233) | Message/fragment | ${entries.length} loaded / ${rankingView.total} shared rankings | FriendDetailPage(); pair?.state === 'accepted' &amp;&amp;; rankingView.status === 'ready' is true |
| [src/cloud/FriendDetailPage.tsx:235](../src/cloud/FriendDetailPage.tsx#L235) | Message/fragment | Loading shared rankings… | FriendDetailPage(); pair?.state === 'accepted' &amp;&amp;; rankingView.status === 'ready' is false; rankingView.status === 'loading' is true |
| [src/cloud/FriendDetailPage.tsx:236](../src/cloud/FriendDetailPage.tsx#L236) | Message/fragment | Shared ranking unavailable. | FriendDetailPage(); pair?.state === 'accepted' &amp;&amp;; rankingView.status === 'ready' is false; rankingView.status === 'loading' is false |
| [src/cloud/FriendDetailPage.tsx:240](../src/cloud/FriendDetailPage.tsx#L240) | Live region | ${rankingView.error} Refresh ranking | FriendDetailPage(); rankingView.error &amp;&amp; |
| [src/cloud/FriendDetailPage.tsx:242](../src/cloud/FriendDetailPage.tsx#L242) | Rendered copy | Refresh ranking | FriendDetailPage(); rankingView.error &amp;&amp; |
| [src/cloud/FriendDetailPage.tsx:250](../src/cloud/FriendDetailPage.tsx#L250) | Rendered copy | ${entry.position} | FriendDetailPage(); when its owning surface/operation is used |
| [src/cloud/FriendDetailPage.tsx:251](../src/cloud/FriendDetailPage.tsx#L251) | Rendered copy | ${entry.title} | FriendDetailPage(); when its owning surface/operation is used |
| [src/cloud/FriendDetailPage.tsx:257](../src/cloud/FriendDetailPage.tsx#L257) | Message output | onlineError(cause) | FriendDetailPage(); onClick; operation rejected or threw |
| [src/cloud/FriendDetailPage.tsx:263](../src/cloud/FriendDetailPage.tsx#L263) | Rendered copy | ${entry.score === null ? 'Unrated' : entry.score} | FriendDetailPage(); when its owning surface/operation is used |
| [src/cloud/FriendDetailPage.tsx:263](../src/cloud/FriendDetailPage.tsx#L263) | Message/fragment | Unrated | FriendDetailPage(); entry.score === null is true |
| [src/cloud/FriendDetailPage.tsx:268](../src/cloud/FriendDetailPage.tsx#L268) | Rendered copy | Next 25 games | FriendDetailPage(); limit &lt; entries.length &amp;&amp; |
| [src/cloud/FriendDetailPage.tsx:273](../src/cloud/FriendDetailPage.tsx#L273) | Rendered copy | Load next 25 rankings | FriendDetailPage(); !rankingView.complete &amp;&amp; rankingView.status === 'ready' &amp;&amp; limit &gt;= entries.length &amp;&amp; |
| [src/cloud/FriendDetailPage.tsx:292](../src/cloud/FriendDetailPage.tsx#L292) | Rendered copy | Connect with ${person.displayName}? | FriendDetailPage(); confirmRequest &amp;&amp; person &amp;&amp; |
| [src/cloud/FriendDetailPage.tsx:297](../src/cloud/FriendDetailPage.tsx#L297) | Rendered copy | They'll see ${identity.displayName}. | FriendDetailPage(); confirmRequest &amp;&amp; person &amp;&amp; |
| [src/cloud/FriendDetailPage.tsx:299](../src/cloud/FriendDetailPage.tsx#L299) | Rendered copy | Accepted friends see the games and rankings allowed by your sharing mode. Notes, email, Play later and play history stay private. | FriendDetailPage(); confirmRequest &amp;&amp; person &amp;&amp; |
| [src/cloud/FriendDetailPage.tsx:304](../src/cloud/FriendDetailPage.tsx#L304) | Rendered copy | Cancel | FriendDetailPage(); confirmRequest &amp;&amp; person &amp;&amp; |
| [src/cloud/FriendDetailPage.tsx:312](../src/cloud/FriendDetailPage.tsx#L312) | Rendered copy | Send request | FriendDetailPage(); confirmRequest &amp;&amp; person &amp;&amp; |
| [src/cloud/FriendDetailPage.tsx:323](../src/cloud/FriendDetailPage.tsx#L323) | Live region | ${error} | FriendDetailPage(); confirmRequest &amp;&amp; person &amp;&amp;; error &amp;&amp; |
## src/cloud/FriendInvitesAndBlocks.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendInvitesAndBlocks.tsx:27](../src/cloud/FriendInvitesAndBlocks.tsx#L27) | Rendered copy | ${status} | FriendInviteList(); when its owning surface/operation is used |
| [src/cloud/FriendInvitesAndBlocks.tsx:28](../src/cloud/FriendInvitesAndBlocks.tsx#L28) | Rendered copy | Created ${dateFormat.format(invite.createdAt)} ${status === 'Expired' ? 'Expired' : 'Expiry'} ${dateFormat.format(invite.expiresAt)} | FriendInviteList(); when its owning surface/operation is used |
| [src/cloud/FriendInvitesAndBlocks.tsx:32](../src/cloud/FriendInvitesAndBlocks.tsx#L32) | Message/fragment | Expired | FriendInviteList(); status === 'Expired' is true |
| [src/cloud/FriendInvitesAndBlocks.tsx:32](../src/cloud/FriendInvitesAndBlocks.tsx#L32) | Message/fragment | Expiry | FriendInviteList(); status === 'Expired' is false |
| [src/cloud/FriendInvitesAndBlocks.tsx:36](../src/cloud/FriendInvitesAndBlocks.tsx#L36) | Message/fragment | Active | FriendInviteList(); when its owning surface/operation is used |
| [src/cloud/FriendInvitesAndBlocks.tsx:38](../src/cloud/FriendInvitesAndBlocks.tsx#L38) | Rendered copy | Copy link | FriendInviteList(); status === 'Active' &amp;&amp; |
| [src/cloud/FriendInvitesAndBlocks.tsx:47](../src/cloud/FriendInvitesAndBlocks.tsx#L47) | Rendered copy | Share | FriendInviteList(); status === 'Active' &amp;&amp; |
| [src/cloud/FriendInvitesAndBlocks.tsx:56](../src/cloud/FriendInvitesAndBlocks.tsx#L56) | Rendered copy | Revoke | FriendInviteList(); status === 'Active' &amp;&amp; |
| [src/cloud/FriendInvitesAndBlocks.tsx:86](../src/cloud/FriendInvitesAndBlocks.tsx#L86) | Rendered copy | Blocked account …${block.uid.slice(-6)} | FriendBlockList(); when its owning surface/operation is used |
| [src/cloud/FriendInvitesAndBlocks.tsx:87](../src/cloud/FriendInvitesAndBlocks.tsx#L87) | Rendered copy | Unblocking will not restore friendship. | FriendBlockList(); when its owning surface/operation is used |
| [src/cloud/FriendInvitesAndBlocks.tsx:89](../src/cloud/FriendInvitesAndBlocks.tsx#L89) | Rendered copy | Unblock | FriendBlockList(); when its owning surface/operation is used |
## src/cloud/FriendMoreActions.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendMoreActions.tsx:86](../src/cloud/FriendMoreActions.tsx#L86) | Message/fragment | Escape | escape(); when its owning surface/operation is used |
| [src/cloud/FriendMoreActions.tsx:100](../src/cloud/FriendMoreActions.tsx#L100) | Rendered copy | More | FriendMoreActions(); when its owning surface/operation is used |
| [src/cloud/FriendMoreActions.tsx:104](../src/cloud/FriendMoreActions.tsx#L104) | Label/help | {&#96;More actions for ${name}&#96;} | FriendMoreActions(); when its owning surface/operation is used |
| [src/cloud/FriendMoreActions.tsx:104](../src/cloud/FriendMoreActions.tsx#L104) | Message/fragment | More actions for ${name} | FriendMoreActions(); when its owning surface/operation is used |
| [src/cloud/FriendMoreActions.tsx:110](../src/cloud/FriendMoreActions.tsx#L110) | Message/fragment | ArrowDown | FriendMoreActions(); onKeyDown |
| [src/cloud/FriendMoreActions.tsx:110](../src/cloud/FriendMoreActions.tsx#L110) | Message/fragment | ArrowUp | FriendMoreActions(); onKeyDown; event.key === 'ArrowDown' &#124;&#124; |
| [src/cloud/FriendMoreActions.tsx:112](../src/cloud/FriendMoreActions.tsx#L112) | Message/fragment | ArrowUp | FriendMoreActions(); onKeyDown; event.key === 'ArrowDown' &#124;&#124; event.key === 'ArrowUp' is true |
| [src/cloud/FriendMoreActions.tsx:124](../src/cloud/FriendMoreActions.tsx#L124) | Label/help | {&#96;Actions for ${name}&#96;} | FriendMoreActions(); when its owning surface/operation is used |
| [src/cloud/FriendMoreActions.tsx:124](../src/cloud/FriendMoreActions.tsx#L124) | Message/fragment | Actions for ${name} | FriendMoreActions(); when its owning surface/operation is used |
| [src/cloud/FriendMoreActions.tsx:128](../src/cloud/FriendMoreActions.tsx#L128) | Message/fragment | Escape | FriendMoreActions(); onKeyDown |
| [src/cloud/FriendMoreActions.tsx:128](../src/cloud/FriendMoreActions.tsx#L128) | Message/fragment | Tab | FriendMoreActions(); onKeyDown; event.key === 'Escape' &#124;&#124; |
| [src/cloud/FriendMoreActions.tsx:129](../src/cloud/FriendMoreActions.tsx#L129) | Message/fragment | Escape | FriendMoreActions(); onKeyDown; event.key === 'Escape' &#124;&#124; event.key === 'Tab' is true |
| [src/cloud/FriendMoreActions.tsx:136](../src/cloud/FriendMoreActions.tsx#L136) | Message/fragment | ArrowDown | next(); onKeyDown |
| [src/cloud/FriendMoreActions.tsx:138](../src/cloud/FriendMoreActions.tsx#L138) | Message/fragment | ArrowUp | next(); onKeyDown; event.key === 'ArrowDown' is false |
| [src/cloud/FriendMoreActions.tsx:140](../src/cloud/FriendMoreActions.tsx#L140) | Message/fragment | Home | next(); onKeyDown; event.key === 'ArrowDown' is false; event.key === 'ArrowUp' is false |
| [src/cloud/FriendMoreActions.tsx:142](../src/cloud/FriendMoreActions.tsx#L142) | Message/fragment | End | next(); onKeyDown; event.key === 'ArrowDown' is false; event.key === 'ArrowUp' is false; event.key === 'Home' is false |
| [src/cloud/FriendMoreActions.tsx:152](../src/cloud/FriendMoreActions.tsx#L152) | Rendered copy | Remove friend | FriendMoreActions(); accepted &amp;&amp; |
| [src/cloud/FriendMoreActions.tsx:163](../src/cloud/FriendMoreActions.tsx#L163) | Rendered copy | Block player | FriendMoreActions(); when its owning surface/operation is used |
## src/cloud/FriendRelationList.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendRelationList.tsx:48](../src/cloud/FriendRelationList.tsx#L48) | Label/help | {&#96;Select ${name} for comparison&#96;} | FriendRelationList(); pair.state === 'accepted' &amp;&amp; |
| [src/cloud/FriendRelationList.tsx:48](../src/cloud/FriendRelationList.tsx#L48) | Message/fragment | Select ${name} for comparison | FriendRelationList(); pair.state === 'accepted' &amp;&amp; |
| [src/cloud/FriendRelationList.tsx:69](../src/cloud/FriendRelationList.tsx#L69) | Rendered copy | Published profile | FriendRelationList(); pair.state === 'pending' &amp;&amp; pair.from === uid &amp;&amp; person &amp;&amp; |
| [src/cloud/FriendRelationList.tsx:70](../src/cloud/FriendRelationList.tsx#L70) | Live region | Loading profile… | FriendRelationList(); (!profile &#124;&#124; profile.status === 'loading') &amp;&amp; |
| [src/cloud/FriendRelationList.tsx:71](../src/cloud/FriendRelationList.tsx#L71) | Rendered copy | Profile unavailable | FriendRelationList(); profile?.status === 'unavailable' &amp;&amp; |
| [src/cloud/FriendRelationList.tsx:73](../src/cloud/FriendRelationList.tsx#L73) | Rendered copy | Profile could not be loaded. ${onlineError(profile.cause)} | FriendRelationList(); profile?.status === 'error' &amp;&amp; |
| [src/cloud/FriendRelationList.tsx:76](../src/cloud/FriendRelationList.tsx#L76) | Rendered copy | Retry profile | FriendRelationList(); (profile?.status === 'error' &#124;&#124; profile?.status === 'unavailable') &amp;&amp; |
| [src/cloud/FriendRelationList.tsx:90](../src/cloud/FriendRelationList.tsx#L90) | Label/help | {&#96;View ${name}&#96;} | FriendRelationList(); when its owning surface/operation is used |
| [src/cloud/FriendRelationList.tsx:90](../src/cloud/FriendRelationList.tsx#L90) | Rendered copy | View | FriendRelationList(); when its owning surface/operation is used |
| [src/cloud/FriendRelationList.tsx:90](../src/cloud/FriendRelationList.tsx#L90) | Message/fragment | View ${name} | FriendRelationList(); when its owning surface/operation is used |
| [src/cloud/FriendRelationList.tsx:94](../src/cloud/FriendRelationList.tsx#L94) | Rendered copy | Compare | FriendRelationList(); pair.state === 'accepted' is true |
| [src/cloud/FriendRelationList.tsx:97](../src/cloud/FriendRelationList.tsx#L97) | Label/help | {&#96;Compare with ${name}&#96;} | FriendRelationList(); pair.state === 'accepted' is true |
| [src/cloud/FriendRelationList.tsx:97](../src/cloud/FriendRelationList.tsx#L97) | Message/fragment | Compare with ${name} | FriendRelationList(); pair.state === 'accepted' is true |
| [src/cloud/FriendRelationList.tsx:105](../src/cloud/FriendRelationList.tsx#L105) | Rendered copy | Cancel request | FriendRelationList(); pair.state === 'accepted' is false; pair.from === uid is true |
| [src/cloud/FriendRelationList.tsx:109](../src/cloud/FriendRelationList.tsx#L109) | Message/fragment | Request cancelled. | FriendRelationList(); pair.state === 'accepted' is false; pair.from === uid is true; onClick |
| [src/cloud/FriendRelationList.tsx:116](../src/cloud/FriendRelationList.tsx#L116) | Rendered copy | Accept | FriendRelationList(); pair.state === 'accepted' is false; pair.from === uid is false |
| [src/cloud/FriendRelationList.tsx:120](../src/cloud/FriendRelationList.tsx#L120) | Message/fragment | Friend added. | FriendRelationList(); pair.state === 'accepted' is false; pair.from === uid is false; onClick |
| [src/cloud/FriendRelationList.tsx:125](../src/cloud/FriendRelationList.tsx#L125) | Rendered copy | Decline | FriendRelationList(); pair.state === 'accepted' is false; pair.from === uid is false |
| [src/cloud/FriendRelationList.tsx:129](../src/cloud/FriendRelationList.tsx#L129) | Message/fragment | Request declined. | FriendRelationList(); pair.state === 'accepted' is false; pair.from === uid is false; onClick |
## src/cloud/friends-page-invite.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/friends-page-invite.ts:75](../src/cloud/friends-page-invite.ts#L75) | Message output | 'Invitation created. Find it in Invite links.' | createInvitation(); inviteVisible.current is false |
| [src/cloud/friends-page-invite.ts:75](../src/cloud/friends-page-invite.ts#L75) | Message/fragment | Invitation created. Find it in Invite links. | createInvitation(); inviteVisible.current is false |
| [src/cloud/friends-page-invite.ts:80](../src/cloud/friends-page-invite.ts#L80) | Message output | committed ? committedFriendMessage(committed) : friendMutationError(cause) | createInvitation(); operation rejected or threw |
| [src/cloud/friends-page-invite.ts:95](../src/cloud/friends-page-invite.ts#L95) | Message output | 'Creation may still finish. Check Invite links before making another.' | closeInvite(); creatingInvite is true |
| [src/cloud/friends-page-invite.ts:95](../src/cloud/friends-page-invite.ts#L95) | Message/fragment | Creation may still finish. Check Invite links before making another. | closeInvite(); creatingInvite is true |
| [src/cloud/friends-page-invite.ts:99](../src/cloud/friends-page-invite.ts#L99) | Message/fragment | Active | shareLink(); when its owning surface/operation is used |
| [src/cloud/friends-page-invite.ts:100](../src/cloud/friends-page-invite.ts#L100) | Message output | 'This invitation is no longer active. Refresh the links.' | shareLink(); invitationStatus(invite, Date.now()) !== 'Active' is true |
| [src/cloud/friends-page-invite.ts:100](../src/cloud/friends-page-invite.ts#L100) | Message/fragment | This invitation is no longer active. Refresh the links. | shareLink(); invitationStatus(invite, Date.now()) !== 'Active' is true |
| [src/cloud/friends-page-invite.ts:108](../src/cloud/friends-page-invite.ts#L108) | Message/fragment | Link copied. | shareLink(); native &amp;&amp; navigator.share is false; current() is true |
| [src/cloud/friends-page-invite.ts:115](../src/cloud/friends-page-invite.ts#L115) | Message/fragment | Copy the invitation from the field below. | shareLink(); operation rejected or threw |
## src/cloud/friends-page-selection.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/friends-page-selection.ts:62](../src/cloud/friends-page-selection.ts#L62) | Message output | 'A connection changed. Your comparison selection was updated.' | bind(); pair?.state !== 'accepted' is true |
| [src/cloud/friends-page-selection.ts:62](../src/cloud/friends-page-selection.ts#L62) | Message/fragment | A connection changed. Your comparison selection was updated. | bind(); pair?.state !== 'accepted' is true |
| [src/cloud/friends-page-selection.ts:72](../src/cloud/friends-page-selection.ts#L72) | Message output | 'A selected connection is no longer available.' | bind(); cause &amp;&amp; typeof cause === 'object' &amp;&amp; 'code' in cause &amp;&amp; cause.code === 'permission-denied' is true |
| [src/cloud/friends-page-selection.ts:72](../src/cloud/friends-page-selection.ts#L72) | Message/fragment | A selected connection is no longer available. | bind(); cause &amp;&amp; typeof cause === 'object' &amp;&amp; 'code' in cause &amp;&amp; cause.code === 'permission-denied' is true |
## src/cloud/FriendSharedGames.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendSharedGames.tsx:79](../src/cloud/FriendSharedGames.tsx#L79) | Message/fragment | This shared game is no longer available. Choose Refresh shared games. | currentRecord(); !live.current &#124;&#124; cloudAuth.currentUser?.uid !== uid &#124;&#124; latest.current.status !== 'ready' &#124;&#124; !entry is true; latest.current.status === 'unavailable' is true |
| [src/cloud/FriendSharedGames.tsx:80](../src/cloud/FriendSharedGames.tsx#L80) | Message/fragment | This shared game is no longer available. | currentRecord(); !live.current &#124;&#124; cloudAuth.currentUser?.uid !== uid &#124;&#124; latest.current.status !== 'ready' &#124;&#124; !entry is true; latest.current.status === 'unavailable' is false |
| [src/cloud/FriendSharedGames.tsx:90](../src/cloud/FriendSharedGames.tsx#L90) | Label/help | {view.error} | FriendSharedGames(); when its owning surface/operation is used |
| [src/cloud/FriendSharedGames.tsx:97](../src/cloud/FriendSharedGames.tsx#L97) | Error/validation | This game could not be saved. Your existing library is unchanged. | FriendSharedGames(); onSave; !(await library.perform({ type: 'add-records', records: [record] })) is true |
| [src/cloud/FriendSharedGames.tsx:101](../src/cloud/FriendSharedGames.tsx#L101) | Error/validation | This game was not pinned. Check the Compare tray limit or account status. | FriendSharedGames(); onPin; !onPin?.(currentRecord(entry.id)) is true |
| [src/cloud/FriendSharedGames.tsx:109](../src/cloud/FriendSharedGames.tsx#L109) | Rendered copy | Refresh shared games | FriendSharedGames(); view.status === 'unavailable' &amp;&amp; |
| [src/cloud/FriendSharedGames.tsx:115](../src/cloud/FriendSharedGames.tsx#L115) | Rendered copy | ${view.entries.length} loaded / ${view.total} shared games${view.complete ? '' : ' · more available'} | FriendSharedGames(); view.status === 'ready' &amp;&amp; |
| [src/cloud/FriendSharedGames.tsx:116](../src/cloud/FriendSharedGames.tsx#L116) | Message/fragment | · more available | FriendSharedGames(); view.status === 'ready' &amp;&amp;; view.complete is false |
| [src/cloud/FriendSharedGames.tsx:120](../src/cloud/FriendSharedGames.tsx#L120) | Rendered copy | ${view.loadingMore ? 'Loading games…' : 'Load next 25 shared games'} | FriendSharedGames(); view.status === 'ready' &amp;&amp; !view.complete &amp;&amp; |
| [src/cloud/FriendSharedGames.tsx:127](../src/cloud/FriendSharedGames.tsx#L127) | Message/fragment | Load next 25 shared games | FriendSharedGames(); view.status === 'ready' &amp;&amp; !view.complete &amp;&amp;; view.loadingMore is false |
| [src/cloud/FriendSharedGames.tsx:127](../src/cloud/FriendSharedGames.tsx#L127) | Message/fragment | Loading games… | FriendSharedGames(); view.status === 'ready' &amp;&amp; !view.complete &amp;&amp;; view.loadingMore is true |
## src/cloud/FriendSharingPage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendSharingPage.tsx:78](../src/cloud/FriendSharingPage.tsx#L78) | Message output | committedFriendMessage(committed) | run(); operation rejected or threw; committed is true |
| [src/cloud/FriendSharingPage.tsx:81](../src/cloud/FriendSharingPage.tsx#L81) | Message output | friendMutationError(cause) | run(); operation rejected or threw; committed is false |
| [src/cloud/FriendSharingPage.tsx:90](../src/cloud/FriendSharingPage.tsx#L90) | Rendered copy | Friend sharing | FriendSharingPage(); when its owning surface/operation is used |
| [src/cloud/FriendSharingPage.tsx:93](../src/cloud/FriendSharingPage.tsx#L93) | Rendered copy | Account | FriendSharingPage(); when its owning surface/operation is used |
| [src/cloud/FriendSharingPage.tsx:98](../src/cloud/FriendSharingPage.tsx#L98) | Rendered copy | Only accepted friends see these selected games, order and scores. Edits update them automatically. | FriendSharingPage(); when its owning surface/operation is used |
| [src/cloud/FriendSharingPage.tsx:102](../src/cloud/FriendSharingPage.tsx#L102) | Live region | ${settings?.enabled ? &#96;Sharing ${status}&#96; : 'Off'} | FriendSharingPage(); when its owning surface/operation is used |
| [src/cloud/FriendSharingPage.tsx:102](../src/cloud/FriendSharingPage.tsx#L102) | Message/fragment | Off | FriendSharingPage(); settings?.enabled is false |
| [src/cloud/FriendSharingPage.tsx:102](../src/cloud/FriendSharingPage.tsx#L102) | Message/fragment | Sharing ${status} | FriendSharingPage(); settings?.enabled is true |
| [src/cloud/FriendSharingPage.tsx:105](../src/cloud/FriendSharingPage.tsx#L105) | Rendered copy | Enable account saving before sharing an account ranking. Existing shared rankings stay visible until you turn sharing off. | FriendSharingPage(); !connected is true |
| [src/cloud/FriendSharingPage.tsx:109](../src/cloud/FriendSharingPage.tsx#L109) | Rendered copy | Account saving | FriendSharingPage(); !connected is true |
| [src/cloud/FriendSharingPage.tsx:115](../src/cloud/FriendSharingPage.tsx#L115) | Rendered copy | ${selected.size} / 200 selected | FriendSharingPage(); !connected is false |
| [src/cloud/FriendSharingPage.tsx:117](../src/cloud/FriendSharingPage.tsx#L117) | Rendered copy | Select all | FriendSharingPage(); !connected is false |
| [src/cloud/FriendSharingPage.tsx:127](../src/cloud/FriendSharingPage.tsx#L127) | Rendered copy | Clear | FriendSharingPage(); !connected is false |
| [src/cloud/FriendSharingPage.tsx:157](../src/cloud/FriendSharingPage.tsx#L157) | Rendered copy | ${row.title} | FriendSharingPage(); !connected is false |
| [src/cloud/FriendSharingPage.tsx:159](../src/cloud/FriendSharingPage.tsx#L159) | Rendered copy | ${row.score ?? 'Unrated'} | FriendSharingPage(); !connected is false |
| [src/cloud/FriendSharingPage.tsx:159](../src/cloud/FriendSharingPage.tsx#L159) | Message/fragment | Unrated | FriendSharingPage(); !connected is false; row.score ?? |
| [src/cloud/FriendSharingPage.tsx:164](../src/cloud/FriendSharingPage.tsx#L164) | Rendered copy | Next 50 games | FriendSharingPage(); !connected is false; limit &lt; rows.length &amp;&amp; |
| [src/cloud/FriendSharingPage.tsx:168](../src/cloud/FriendSharingPage.tsx#L168) | Rendered copy | Preview friend sharing | FriendSharingPage(); !connected is false |
| [src/cloud/FriendSharingPage.tsx:177](../src/cloud/FriendSharingPage.tsx#L177) | Error/validation | Your ranking changed. Review your selected games. | FriendSharingPage(); !connected is false; onClick; projected.selectedIds.length !== selected.size is true |
| [src/cloud/FriendSharingPage.tsx:192](../src/cloud/FriendSharingPage.tsx#L192) | Rendered copy | Stop friend sharing | FriendSharingPage(); settings?.enabled &amp;&amp; |
| [src/cloud/FriendSharingPage.tsx:203](../src/cloud/FriendSharingPage.tsx#L203) | Message output | 'Friend sharing stopped.' | FriendSharingPage(); settings?.enabled &amp;&amp;; onClick |
| [src/cloud/FriendSharingPage.tsx:203](../src/cloud/FriendSharingPage.tsx#L203) | Message/fragment | Friend sharing stopped. | FriendSharingPage(); settings?.enabled &amp;&amp;; onClick |
| [src/cloud/FriendSharingPage.tsx:211](../src/cloud/FriendSharingPage.tsx#L211) | Rendered copy | Refresh sharing status | FriendSharingPage(); refreshRequired &amp;&amp; |
| [src/cloud/FriendSharingPage.tsx:231](../src/cloud/FriendSharingPage.tsx#L231) | Message output | 'Sharing status refreshed.' | FriendSharingPage(); refreshRequired &amp;&amp;; onClick |
| [src/cloud/FriendSharingPage.tsx:231](../src/cloud/FriendSharingPage.tsx#L231) | Message/fragment | Sharing status refreshed. | FriendSharingPage(); refreshRequired &amp;&amp;; onClick |
| [src/cloud/FriendSharingPage.tsx:239](../src/cloud/FriendSharingPage.tsx#L239) | Live region | ${error &#124;&#124; operationError} | FriendSharingPage(); (error &#124;&#124; operationError) &amp;&amp; |
| [src/cloud/FriendSharingPage.tsx:243](../src/cloud/FriendSharingPage.tsx#L243) | Live region | ${notice} | FriendSharingPage(); notice &amp;&amp; |
| [src/cloud/FriendSharingPage.tsx:253](../src/cloud/FriendSharingPage.tsx#L253) | Rendered copy | Share with friends? | FriendSharingPage(); preview &amp;&amp; |
| [src/cloud/FriendSharingPage.tsx:254](../src/cloud/FriendSharingPage.tsx#L254) | Rendered copy | Accepted friends can view and copy these games and scores. Notes, email, Play later and play history are excluded. Later edits update only these selected games. | FriendSharingPage(); preview &amp;&amp; |
| [src/cloud/FriendSharingPage.tsx:261](../src/cloud/FriendSharingPage.tsx#L261) | Rendered copy | ${entry.position}. ${entry.title} | FriendSharingPage(); preview &amp;&amp; |
| [src/cloud/FriendSharingPage.tsx:264](../src/cloud/FriendSharingPage.tsx#L264) | Rendered copy | ${entry.score ?? 'Unrated'} | FriendSharingPage(); preview &amp;&amp; |
| [src/cloud/FriendSharingPage.tsx:264](../src/cloud/FriendSharingPage.tsx#L264) | Message/fragment | Unrated | FriendSharingPage(); preview &amp;&amp;; entry.score ?? |
| [src/cloud/FriendSharingPage.tsx:268](../src/cloud/FriendSharingPage.tsx#L268) | Rendered copy | This shares an empty ranking. | FriendSharingPage(); preview &amp;&amp;; !preview.entries.length &amp;&amp; |
| [src/cloud/FriendSharingPage.tsx:270](../src/cloud/FriendSharingPage.tsx#L270) | Live region | ${error} | FriendSharingPage(); preview &amp;&amp;; error &amp;&amp; |
| [src/cloud/FriendSharingPage.tsx:275](../src/cloud/FriendSharingPage.tsx#L275) | Rendered copy | Keep editing | FriendSharingPage(); preview &amp;&amp; |
| [src/cloud/FriendSharingPage.tsx:278](../src/cloud/FriendSharingPage.tsx#L278) | Rendered copy | Agree &amp; share with friends | FriendSharingPage(); preview &amp;&amp; |
| [src/cloud/FriendSharingPage.tsx:288](../src/cloud/FriendSharingPage.tsx#L288) | Error/validation | Your account or ranking changed. Review the preview again. | FriendSharingPage(); preview &amp;&amp;; onClick; ownState.revision !== preview.sourceRevision &#124;&#124; cloudAuth.currentUser?.uid !== identity.uid &#124;&#124; !connected is true |
| [src/cloud/FriendSharingPage.tsx:304](../src/cloud/FriendSharingPage.tsx#L304) | Message output | 'Friend sharing enabled.' | FriendSharingPage(); preview &amp;&amp;; onClick |
| [src/cloud/FriendSharingPage.tsx:304](../src/cloud/FriendSharingPage.tsx#L304) | Message/fragment | Friend sharing enabled. | FriendSharingPage(); preview &amp;&amp;; onClick |
## src/cloud/FriendShelf.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendShelf.tsx:87](../src/cloud/FriendShelf.tsx#L87) | Message output | shelfError(cause) | run(); operation rejected or threw |
| [src/cloud/FriendShelf.tsx:97](../src/cloud/FriendShelf.tsx#L97) | Rendered copy | Shared games | FriendShelfEditor(); when its owning surface/operation is used |
| [src/cloud/FriendShelf.tsx:98](../src/cloud/FriendShelf.tsx#L98) | Live region | ${status === 'off' ? 'Off' : status} | FriendShelfEditor(); when its owning surface/operation is used |
| [src/cloud/FriendShelf.tsx:98](../src/cloud/FriendShelf.tsx#L98) | Message/fragment | Off | FriendShelfEditor(); status === 'off' is true |
| [src/cloud/FriendShelf.tsx:100](../src/cloud/FriendShelf.tsx#L100) | Rendered copy | Choose saved games for accepted friends. New additions stay private. | FriendShelfEditor(); when its owning surface/operation is used |
| [src/cloud/FriendShelf.tsx:106](../src/cloud/FriendShelf.tsx#L106) | Rendered copy | Find a saved game | FriendShelfEditor(); connected is true |
| [src/cloud/FriendShelf.tsx:118](../src/cloud/FriendShelf.tsx#L118) | Rendered copy | ${selected.size} / 200 selected | FriendShelfEditor(); connected is true |
| [src/cloud/FriendShelf.tsx:119](../src/cloud/FriendShelf.tsx#L119) | Rendered copy | Clear selection | FriendShelfEditor(); connected is true |
| [src/cloud/FriendShelf.tsx:152](../src/cloud/FriendShelf.tsx#L152) | Rendered copy | ${record.title} | FriendShelfEditor(); connected is true |
| [src/cloud/FriendShelf.tsx:153](../src/cloud/FriendShelf.tsx#L153) | Rendered copy | ${record.year ?? 'Year not listed'} | FriendShelfEditor(); connected is true |
| [src/cloud/FriendShelf.tsx:153](../src/cloud/FriendShelf.tsx#L153) | Message/fragment | Year not listed | FriendShelfEditor(); connected is true; record.year ?? |
| [src/cloud/FriendShelf.tsx:159](../src/cloud/FriendShelf.tsx#L159) | Rendered copy | Save a game to your library to choose it here. | FriendShelfEditor(); connected is true; !rows.length &amp;&amp; |
| [src/cloud/FriendShelf.tsx:160](../src/cloud/FriendShelf.tsx#L160) | Rendered copy | No saved games match this search. | FriendShelfEditor(); connected is true; rows.length &gt; 0 &amp;&amp; !visible.length &amp;&amp; |
| [src/cloud/FriendShelf.tsx:162](../src/cloud/FriendShelf.tsx#L162) | Rendered copy | Show 50 more saved games | FriendShelfEditor(); connected is true; visible.length &gt; count &amp;&amp; |
| [src/cloud/FriendShelf.tsx:167](../src/cloud/FriendShelf.tsx#L167) | Rendered copy | Preview shared games | FriendShelfEditor(); connected is true |
| [src/cloud/FriendShelf.tsx:175](../src/cloud/FriendShelf.tsx#L175) | Error/validation | A selected game was removed. Choose it again before sharing. | FriendShelfEditor(); connected is true; onClick; projected.selectedIds.length !== selected.size is true |
| [src/cloud/FriendShelf.tsx:185](../src/cloud/FriendShelf.tsx#L185) | Rendered copy | Turn on account saving to choose games for this shelf. | FriendShelfEditor(); connected is false |
| [src/cloud/FriendShelf.tsx:188](../src/cloud/FriendShelf.tsx#L188) | Rendered copy | Stop sharing | FriendShelfEditor(); config?.enabled &amp;&amp; |
| [src/cloud/FriendShelf.tsx:197](../src/cloud/FriendShelf.tsx#L197) | Message output | 'Shared games stopped.' | FriendShelfEditor(); config?.enabled &amp;&amp;; onClick |
| [src/cloud/FriendShelf.tsx:197](../src/cloud/FriendShelf.tsx#L197) | Message/fragment | Shared games stopped. | FriendShelfEditor(); config?.enabled &amp;&amp;; onClick |
| [src/cloud/FriendShelf.tsx:205](../src/cloud/FriendShelf.tsx#L205) | Live region | ${error &#124;&#124; operationError} Refresh shared games | FriendShelfEditor(); (error &#124;&#124; operationError) &amp;&amp; |
| [src/cloud/FriendShelf.tsx:206](../src/cloud/FriendShelf.tsx#L206) | Rendered copy | ${error &#124;&#124; operationError} | FriendShelfEditor(); (error &#124;&#124; operationError) &amp;&amp; |
| [src/cloud/FriendShelf.tsx:207](../src/cloud/FriendShelf.tsx#L207) | Rendered copy | Refresh shared games | FriendShelfEditor(); (error &#124;&#124; operationError) &amp;&amp; |
| [src/cloud/FriendShelf.tsx:218](../src/cloud/FriendShelf.tsx#L218) | Live region | ${notice} | FriendShelfEditor(); notice &amp;&amp; |
| [src/cloud/FriendShelf.tsx:228](../src/cloud/FriendShelf.tsx#L228) | Rendered copy | ${preview.entries.length} shared ${preview.entries.length === 1 ? 'game' : 'games'} | FriendShelfEditor(); preview &amp;&amp; |
| [src/cloud/FriendShelf.tsx:233](../src/cloud/FriendShelf.tsx#L233) | Rendered copy | ${identity.displayName} | FriendShelfEditor(); preview &amp;&amp; |
| [src/cloud/FriendShelf.tsx:235](../src/cloud/FriendShelf.tsx#L235) | Rendered copy | Accepted friends see these names, years and sources. Scores stay in your separately shared ranking. | FriendShelfEditor(); preview &amp;&amp; |
| [src/cloud/FriendShelf.tsx:241](../src/cloud/FriendShelf.tsx#L241) | Rendered copy | ${entry.title} | FriendShelfEditor(); preview &amp;&amp; |
| [src/cloud/FriendShelf.tsx:248](../src/cloud/FriendShelf.tsx#L248) | Rendered copy | Back to selection | FriendShelfEditor(); preview &amp;&amp; |
| [src/cloud/FriendShelf.tsx:251](../src/cloud/FriendShelf.tsx#L251) | Rendered copy | ${busy ? 'Saving selection…' : config?.enabled ? 'Update shared games' : 'Share these games'} | FriendShelfEditor(); preview &amp;&amp; |
| [src/cloud/FriendShelf.tsx:263](../src/cloud/FriendShelf.tsx#L263) | Message output | 'Selection saved. Shared games update after your private save.' | FriendShelfEditor(); preview &amp;&amp;; onClick |
| [src/cloud/FriendShelf.tsx:263](../src/cloud/FriendShelf.tsx#L263) | Message/fragment | Selection saved. Shared games update after your private save. | FriendShelfEditor(); preview &amp;&amp;; onClick |
| [src/cloud/FriendShelf.tsx:267](../src/cloud/FriendShelf.tsx#L267) | Message/fragment | Saving selection… | FriendShelfEditor(); preview &amp;&amp;; busy is true |
| [src/cloud/FriendShelf.tsx:267](../src/cloud/FriendShelf.tsx#L267) | Message/fragment | Share these games | FriendShelfEditor(); preview &amp;&amp;; busy is false; config?.enabled is false |
| [src/cloud/FriendShelf.tsx:267](../src/cloud/FriendShelf.tsx#L267) | Message/fragment | Update shared games | FriendShelfEditor(); preview &amp;&amp;; busy is false; config?.enabled is true |
## src/cloud/FriendShelfCards.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendShelfCards.tsx:52](../src/cloud/FriendShelfCards.tsx#L52) | Message output | null | save(); when its owning surface/operation is used |
| [src/cloud/FriendShelfCards.tsx:56](../src/cloud/FriendShelfCards.tsx#L56) | Message output | { entries: request, text: &#96;${stripControlOrFormat(entry.title)} added to My games.&#96; } | save(); current.current === request is true |
| [src/cloud/FriendShelfCards.tsx:56](../src/cloud/FriendShelfCards.tsx#L56) | Message/fragment | ${stripControlOrFormat(entry.title)} added to My games. | save(); current.current === request is true |
| [src/cloud/FriendShelfCards.tsx:58](../src/cloud/FriendShelfCards.tsx#L58) | Message output | shelfError(cause) | save(); operation rejected or threw; current.current === request is true |
| [src/cloud/FriendShelfCards.tsx:66](../src/cloud/FriendShelfCards.tsx#L66) | Rendered copy | Shared games | FriendShelfCards(); when its owning surface/operation is used |
| [src/cloud/FriendShelfCards.tsx:68](../src/cloud/FriendShelfCards.tsx#L68) | Rendered copy | ${entries.length} ${paged ? &#96; / ${total ?? '?'} loaded&#96; : ' games'} | FriendShelfCards(); status === 'ready' &amp;&amp; |
| [src/cloud/FriendShelfCards.tsx:75](../src/cloud/FriendShelfCards.tsx#L75) | Live region | Loading shared games… | FriendShelfCards(); status === 'loading' is true |
| [src/cloud/FriendShelfCards.tsx:77](../src/cloud/FriendShelfCards.tsx#L77) | Rendered copy | Shared games are unavailable. | FriendShelfCards(); status === 'loading' is false; status === 'unavailable' is true |
| [src/cloud/FriendShelfCards.tsx:79](../src/cloud/FriendShelfCards.tsx#L79) | Rendered copy | No games are shared in this view. | FriendShelfCards(); status === 'loading' is false; status === 'unavailable' is false; !entries.length is true |
| [src/cloud/FriendShelfCards.tsx:87](../src/cloud/FriendShelfCards.tsx#L87) | Rendered copy | ${onOpen ? ( &lt;button className="text-button" onClick={() =&gt; { try { onOpen(entry); } catch (cause) { setError(shelfError(cause)); } }} &gt; {entry.title} &lt;/button&gt; ) : ( entry.title )} | FriendShelfCards(); status === 'loading' is false; status === 'unavailable' is false; !entries.length is false |
| [src/cloud/FriendShelfCards.tsx:89](../src/cloud/FriendShelfCards.tsx#L89) | Rendered copy | ${entry.title} | FriendShelfCards(); status === 'loading' is false; status === 'unavailable' is false; !entries.length is false; onOpen is true |
| [src/cloud/FriendShelfCards.tsx:95](../src/cloud/FriendShelfCards.tsx#L95) | Message output | shelfError(cause) | FriendShelfCards(); status === 'loading' is false; status === 'unavailable' is false; !entries.length is false; onOpen is true; onClick; operation rejected or threw |
| [src/cloud/FriendShelfCards.tsx:107](../src/cloud/FriendShelfCards.tsx#L107) | Rendered copy | View source | FriendShelfCards(); status === 'loading' is false; status === 'unavailable' is false; !entries.length is false; entry.sourceUrl &amp;&amp; |
| [src/cloud/FriendShelfCards.tsx:112](../src/cloud/FriendShelfCards.tsx#L112) | Rendered copy | ${savedIds?.has(entry.id) ? 'Saved' : saving === entry.id ? 'Saving…' : 'Save'} | FriendShelfCards(); status === 'loading' is false; status === 'unavailable' is false; !entries.length is false |
| [src/cloud/FriendShelfCards.tsx:119](../src/cloud/FriendShelfCards.tsx#L119) | Message/fragment | Save | FriendShelfCards(); status === 'loading' is false; status === 'unavailable' is false; !entries.length is false; savedIds?.has(entry.id) is false; saving === entry.id is false |
| [src/cloud/FriendShelfCards.tsx:119](../src/cloud/FriendShelfCards.tsx#L119) | Message/fragment | Saved | FriendShelfCards(); status === 'loading' is false; status === 'unavailable' is false; !entries.length is false; savedIds?.has(entry.id) is true |
| [src/cloud/FriendShelfCards.tsx:119](../src/cloud/FriendShelfCards.tsx#L119) | Message/fragment | Saving… | FriendShelfCards(); status === 'loading' is false; status === 'unavailable' is false; !entries.length is false; savedIds?.has(entry.id) is false; saving === entry.id is true |
| [src/cloud/FriendShelfCards.tsx:121](../src/cloud/FriendShelfCards.tsx#L121) | Rendered copy | Pin | FriendShelfCards(); status === 'loading' is false; status === 'unavailable' is false; !entries.length is false |
| [src/cloud/FriendShelfCards.tsx:123](../src/cloud/FriendShelfCards.tsx#L123) | Label/help | {&#96;Pin ${stripControlOrFormat(entry.title)}&#96;} | FriendShelfCards(); status === 'loading' is false; status === 'unavailable' is false; !entries.length is false |
| [src/cloud/FriendShelfCards.tsx:123](../src/cloud/FriendShelfCards.tsx#L123) | Message/fragment | Pin ${stripControlOrFormat(entry.title)} | FriendShelfCards(); status === 'loading' is false; status === 'unavailable' is false; !entries.length is false |
| [src/cloud/FriendShelfCards.tsx:127](../src/cloud/FriendShelfCards.tsx#L127) | Message output | { entries, text: &#96;${stripControlOrFormat(entry.title)} pinned.&#96; } | FriendShelfCards(); status === 'loading' is false; status === 'unavailable' is false; !entries.length is false; onClick |
| [src/cloud/FriendShelfCards.tsx:129](../src/cloud/FriendShelfCards.tsx#L129) | Message output | shelfError(cause) | FriendShelfCards(); status === 'loading' is false; status === 'unavailable' is false; !entries.length is false; onClick; operation rejected or threw |
| [src/cloud/FriendShelfCards.tsx:141](../src/cloud/FriendShelfCards.tsx#L141) | Rendered copy | Show 24 more shared games | FriendShelfCards(); status === 'loading' is false; status === 'unavailable' is false; !entries.length is false; !paged &amp;&amp; count &lt; entries.length &amp;&amp; |
| [src/cloud/FriendShelfCards.tsx:148](../src/cloud/FriendShelfCards.tsx#L148) | Live region | ${error &#124;&#124; operationError} | FriendShelfCards(); (error &#124;&#124; operationError) &amp;&amp; |
| [src/cloud/FriendShelfCards.tsx:152](../src/cloud/FriendShelfCards.tsx#L152) | Live region | ${notice.text} | FriendShelfCards(); notice?.entries === entries &amp;&amp; status === 'ready' &amp;&amp; |
## src/cloud/FriendShelfPage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendShelfPage.tsx:20](../src/cloud/FriendShelfPage.tsx#L20) | Rendered copy | Shared games | FriendShelfPage(); when its owning surface/operation is used |
| [src/cloud/FriendShelfPage.tsx:23](../src/cloud/FriendShelfPage.tsx#L23) | Rendered copy | Account | FriendShelfPage(); when its owning surface/operation is used |
## src/cloud/FriendsPage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendsPage.tsx:144](../src/cloud/FriendsPage.tsx#L144) | Message output | success | run(); when its owning surface/operation is used |
| [src/cloud/FriendsPage.tsx:152](../src/cloud/FriendsPage.tsx#L152) | Message output | committedFriendMessage(committed) | run(); operation rejected or threw; committed is true |
| [src/cloud/FriendsPage.tsx:154](../src/cloud/FriendsPage.tsx#L154) | Message output | onlineError(committed.cause) | run(); operation rejected or threw; committed is true |
| [src/cloud/FriendsPage.tsx:156](../src/cloud/FriendsPage.tsx#L156) | Message output | friendMutationError(cause) | run(); operation rejected or threw; committed is false |
| [src/cloud/FriendsPage.tsx:181](../src/cloud/FriendsPage.tsx#L181) | Error/validation | A connection changed. Review the selected friends before comparing. | compare(); pairs.some((pair) =&gt; pair?.state !== 'accepted') is true |
| [src/cloud/FriendsPage.tsx:186](../src/cloud/FriendsPage.tsx#L186) | Message output | onlineError(cause) | compare(); operation rejected or threw; owns() is true |
| [src/cloud/FriendsPage.tsx:212](../src/cloud/FriendsPage.tsx#L212) | Message/fragment | Invitation revoked. | confirmChange(); confirmation.action === 'revoke' is true |
| [src/cloud/FriendsPage.tsx:214](../src/cloud/FriendsPage.tsx#L214) | Message/fragment | Player blocked. | confirmChange(); confirmation.action === 'revoke' is false; confirmation.action === 'block' is true |
| [src/cloud/FriendsPage.tsx:215](../src/cloud/FriendsPage.tsx#L215) | Message/fragment | Friend removed. | confirmChange(); confirmation.action === 'revoke' is false; confirmation.action === 'block' is false |
| [src/cloud/FriendsPage.tsx:234](../src/cloud/FriendsPage.tsx#L234) | Rendered copy | Friends | FriendsPage(); when its owning surface/operation is used |
| [src/cloud/FriendsPage.tsx:237](../src/cloud/FriendsPage.tsx#L237) | Rendered copy | ${creatingInvite ? 'Creating invite…' : 'Invite someone'} | FriendsPage(); when its owning surface/operation is used |
| [src/cloud/FriendsPage.tsx:244](../src/cloud/FriendsPage.tsx#L244) | Message/fragment | Creating invite… | FriendsPage(); creatingInvite is true |
| [src/cloud/FriendsPage.tsx:244](../src/cloud/FriendsPage.tsx#L244) | Message/fragment | Invite someone | FriendsPage(); creatingInvite is false |
| [src/cloud/FriendsPage.tsx:261](../src/cloud/FriendsPage.tsx#L261) | Label/help | {message} | FriendsPage(); when its owning surface/operation is used |
| [src/cloud/FriendsPage.tsx:281](../src/cloud/FriendsPage.tsx#L281) | Rendered copy | Sharing details | FriendsPage(); view.view === 'friends' &amp;&amp; onSharedGames &amp;&amp; |
| [src/cloud/FriendsPage.tsx:318](../src/cloud/FriendsPage.tsx#L318) | Live region | ${copyState} | FriendsPage(); copyState &amp;&amp; !link &amp;&amp; |
| [src/cloud/FriendsPage.tsx:324](../src/cloud/FriendsPage.tsx#L324) | Message/fragment | Unblocked. Friendship was not restored. | FriendsPage(); view.view === 'blocked' &amp;&amp;; onUnblock |
| [src/cloud/FriendsPage.tsx:339](../src/cloud/FriendsPage.tsx#L339) | Rendered copy | Load next 20${view.view === 'incoming' &#124;&#124; view.view === 'sent' ? ' requests' : ''} | FriendsPage(); cursor &amp;&amp; |
| [src/cloud/FriendsPage.tsx:355](../src/cloud/FriendsPage.tsx#L355) | Label/help | {error} | FriendsPage(); confirmation &amp;&amp; |
| [src/cloud/FriendsPage.tsx:367](../src/cloud/FriendsPage.tsx#L367) | Label/help | {error} | FriendsPage(); inviteOpen &amp;&amp; |
## src/cloud/FriendsPageControls.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendsPageControls.tsx:7](../src/cloud/FriendsPageControls.tsx#L7) | Message/fragment | Friends | viewLabels(); when its owning surface/operation is used |
| [src/cloud/FriendsPageControls.tsx:8](../src/cloud/FriendsPageControls.tsx#L8) | Message/fragment | Incoming | viewLabels(); when its owning surface/operation is used |
| [src/cloud/FriendsPageControls.tsx:9](../src/cloud/FriendsPageControls.tsx#L9) | Message/fragment | Sent | viewLabels(); when its owning surface/operation is used |
| [src/cloud/FriendsPageControls.tsx:10](../src/cloud/FriendsPageControls.tsx#L10) | Message/fragment | Invite links | viewLabels(); when its owning surface/operation is used |
| [src/cloud/FriendsPageControls.tsx:11](../src/cloud/FriendsPageControls.tsx#L11) | Message/fragment | Blocked | viewLabels(); when its owning surface/operation is used |
| [src/cloud/FriendsPageControls.tsx:27](../src/cloud/FriendsPageControls.tsx#L27) | Label/help | Friends view | FriendViewControls(); when its owning surface/operation is used |
| [src/cloud/FriendsPageControls.tsx:29](../src/cloud/FriendsPageControls.tsx#L29) | Rendered copy | ${viewLabels[value]} | FriendViewControls(); when its owning surface/operation is used |
| [src/cloud/FriendsPageControls.tsx:42](../src/cloud/FriendsPageControls.tsx#L42) | Rendered copy | Filter loaded ${view.view === 'friends' ? 'friends' : 'requests'} | FriendViewControls(); relationView &amp;&amp; |
| [src/cloud/FriendsPageControls.tsx:51](../src/cloud/FriendsPageControls.tsx#L51) | Rendered copy | Order Recent first Name A-Z | FriendViewControls(); relationView &amp;&amp; |
| [src/cloud/FriendsPageControls.tsx:54](../src/cloud/FriendsPageControls.tsx#L54) | Label/help | Order | FriendViewControls(); relationView &amp;&amp; |
| [src/cloud/FriendsPageControls.tsx:58](../src/cloud/FriendsPageControls.tsx#L58) | Rendered copy | Recent first | FriendViewControls(); relationView &amp;&amp; |
| [src/cloud/FriendsPageControls.tsx:59](../src/cloud/FriendsPageControls.tsx#L59) | Rendered copy | Name A-Z | FriendViewControls(); relationView &amp;&amp; |
| [src/cloud/FriendsPageControls.tsx:98](../src/cloud/FriendsPageControls.tsx#L98) | Live region | ${loading ? ready ? 'Updating loaded entries…' : 'Loading…' : ready ? &#96;${relationView ? &#96;${shown} shown / &#96; : ''}${loaded} loaded${cursor ? ' · more available' : ''}&#96; : 'List unavailable'} | FriendListStatus(); when its owning surface/operation is used |
| [src/cloud/FriendsPageControls.tsx:101](../src/cloud/FriendsPageControls.tsx#L101) | Message/fragment | Updating loaded entries… | FriendListStatus(); loading is true; ready is true |
| [src/cloud/FriendsPageControls.tsx:102](../src/cloud/FriendsPageControls.tsx#L102) | Message/fragment | Loading… | FriendListStatus(); loading is true; ready is false |
| [src/cloud/FriendsPageControls.tsx:104](../src/cloud/FriendsPageControls.tsx#L104) | Message/fragment | ${relationView ? &#96;${shown} shown / &#96; : ''}${loaded} loaded${cursor ? ' · more available' : ''} | FriendListStatus(); loading is false; ready is true |
| [src/cloud/FriendsPageControls.tsx:105](../src/cloud/FriendsPageControls.tsx#L105) | Message/fragment | List unavailable | FriendListStatus(); loading is false; ready is false |
| [src/cloud/FriendsPageControls.tsx:107](../src/cloud/FriendsPageControls.tsx#L107) | Rendered copy | Refresh loaded | FriendListStatus(); when its owning surface/operation is used |
| [src/cloud/FriendsPageControls.tsx:112](../src/cloud/FriendsPageControls.tsx#L112) | Live region | The list changed. Refresh loaded entries before loading more. | FriendListStatus(); relationView &amp;&amp; changed &amp;&amp; |
| [src/cloud/FriendsPageControls.tsx:116](../src/cloud/FriendsPageControls.tsx#L116) | Live region | Reconnect or return to this tab to manage friends. | FriendListStatus(); relationView &amp;&amp; !active &amp;&amp; |
| [src/cloud/FriendsPageControls.tsx:118](../src/cloud/FriendsPageControls.tsx#L118) | Live region | ${problem} | FriendListStatus(); problem &amp;&amp; |
| [src/cloud/FriendsPageControls.tsx:122](../src/cloud/FriendsPageControls.tsx#L122) | Live region | ${message} | FriendListStatus(); message &amp;&amp; |
| [src/cloud/FriendsPageControls.tsx:154](../src/cloud/FriendsPageControls.tsx#L154) | Rendered copy | ${selected.length} / 5 friends selected | FriendSelectionBar(); selected.length &gt; 0 &amp;&amp; |
| [src/cloud/FriendsPageControls.tsx:156](../src/cloud/FriendsPageControls.tsx#L156) | Rendered copy | Compare selected | FriendSelectionBar(); selected.length &gt; 0 &amp;&amp; |
| [src/cloud/FriendsPageControls.tsx:159](../src/cloud/FriendsPageControls.tsx#L159) | Rendered copy | Clear | FriendSelectionBar(); selected.length &gt; 0 &amp;&amp; |
| [src/cloud/FriendsPageControls.tsx:164](../src/cloud/FriendsPageControls.tsx#L164) | Live region | ${selectionError?.status === 'error' ? &#96;A selected connection could not be confirmed. ${onlineError(selectionError.cause)}&#96; : 'Checking selected connections…'} ${selectionError &amp;&amp; ( &lt;button className="text-button" disabled={working} onClick={onRetry}&gt; Retry selected connections &lt;/button&gt; )} | FriendSelectionBar(); selected.length &gt; 0 &amp;&amp;; !selectionReady &amp;&amp; |
| [src/cloud/FriendsPageControls.tsx:166](../src/cloud/FriendsPageControls.tsx#L166) | Message/fragment | A selected connection could not be confirmed. ${onlineError(selectionError.cause)} | FriendSelectionBar(); selected.length &gt; 0 &amp;&amp;; !selectionReady &amp;&amp;; selectionError?.status === 'error' is true |
| [src/cloud/FriendsPageControls.tsx:167](../src/cloud/FriendsPageControls.tsx#L167) | Message/fragment | Checking selected connections… | FriendSelectionBar(); selected.length &gt; 0 &amp;&amp;; !selectionReady &amp;&amp;; selectionError?.status === 'error' is false |
| [src/cloud/FriendsPageControls.tsx:169](../src/cloud/FriendsPageControls.tsx#L169) | Rendered copy | Retry selected connections | FriendSelectionBar(); selected.length &gt; 0 &amp;&amp;; !selectionReady &amp;&amp;; selectionError &amp;&amp; |
| [src/cloud/FriendsPageControls.tsx:178](../src/cloud/FriendsPageControls.tsx#L178) | Rendered copy | Choose up to five friends to compare with you. Open comparisons &amp; groups | FriendSelectionBar(); friendsView &amp;&amp; !selected.length &amp;&amp; |
| [src/cloud/FriendsPageControls.tsx:180](../src/cloud/FriendsPageControls.tsx#L180) | Rendered copy | Open comparisons &amp; groups | FriendSelectionBar(); friendsView &amp;&amp; !selected.length &amp;&amp; |
| [src/cloud/FriendsPageControls.tsx:206](../src/cloud/FriendsPageControls.tsx#L206) | Rendered copy | ${view.name &amp;&amp; relationView ? 'No loaded names match' : view.view === 'friends' ? 'No friends loaded' : view.view === 'incoming' ? 'No incoming requests loaded' : view.view === 'sent' ? 'No sent requests loaded' : view.view === 'invites' ? 'No invite links' : 'No blocked accounts'} | FriendsEmptyState(); when its owning surface/operation is used |
| [src/cloud/FriendsPageControls.tsx:208](../src/cloud/FriendsPageControls.tsx#L208) | Message/fragment | No loaded names match | FriendsEmptyState(); view.name &amp;&amp; relationView is true |
| [src/cloud/FriendsPageControls.tsx:210](../src/cloud/FriendsPageControls.tsx#L210) | Message/fragment | No friends loaded | FriendsEmptyState(); view.name &amp;&amp; relationView is false; view.view === 'friends' is true |
| [src/cloud/FriendsPageControls.tsx:212](../src/cloud/FriendsPageControls.tsx#L212) | Message/fragment | No incoming requests loaded | FriendsEmptyState(); view.name &amp;&amp; relationView is false; view.view === 'friends' is false; view.view === 'incoming' is true |
| [src/cloud/FriendsPageControls.tsx:214](../src/cloud/FriendsPageControls.tsx#L214) | Message/fragment | No sent requests loaded | FriendsEmptyState(); view.name &amp;&amp; relationView is false; view.view === 'friends' is false; view.view === 'incoming' is false; view.view === 'sent' is true |
| [src/cloud/FriendsPageControls.tsx:216](../src/cloud/FriendsPageControls.tsx#L216) | Message/fragment | No invite links | FriendsEmptyState(); view.name &amp;&amp; relationView is false; view.view === 'friends' is false; view.view === 'incoming' is false; view.view === 'sent' is false; view.view === 'invites' is true |
| [src/cloud/FriendsPageControls.tsx:217](../src/cloud/FriendsPageControls.tsx#L217) | Message/fragment | No blocked accounts | FriendsEmptyState(); view.name &amp;&amp; relationView is false; view.view === 'friends' is false; view.view === 'incoming' is false; view.view === 'sent' is false; view.view === 'invites' is false |
| [src/cloud/FriendsPageControls.tsx:220](../src/cloud/FriendsPageControls.tsx#L220) | Rendered copy | ${view.view === 'incoming' &#124;&#124; view.view === 'sent' ? 'Incoming and sent requests share these pages. Load more to check further.' : 'More entries are available below.'} | FriendsEmptyState(); cursor is true |
| [src/cloud/FriendsPageControls.tsx:222](../src/cloud/FriendsPageControls.tsx#L222) | Message/fragment | Incoming and sent requests share these pages. Load more to check further. | FriendsEmptyState(); cursor is true; view.view === 'incoming' &#124;&#124; view.view === 'sent' is true |
| [src/cloud/FriendsPageControls.tsx:223](../src/cloud/FriendsPageControls.tsx#L223) | Message/fragment | More entries are available below. | FriendsEmptyState(); cursor is true; view.view === 'incoming' &#124;&#124; view.view === 'sent' is false |
| [src/cloud/FriendsPageControls.tsx:226](../src/cloud/FriendsPageControls.tsx#L226) | Rendered copy | Find players in Community | FriendsEmptyState(); cursor is false; view.view === 'friends' &amp;&amp; !view.name &amp;&amp; !changed is true |
| [src/cloud/FriendsPageControls.tsx:231](../src/cloud/FriendsPageControls.tsx#L231) | Rendered copy | Clear filter | FriendsEmptyState(); view.name &amp;&amp; relationView &amp;&amp; |
## src/cloud/FriendsPageDialogs.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/FriendsPageDialogs.tsx:36](../src/cloud/FriendsPageDialogs.tsx#L36) | Rendered copy | ${confirmation.action === 'revoke' ? ( 'Revoke this invitation?' ) : ( &lt;&gt; {confirmation.action === 'block' ? 'Block' : 'Remove'} &lt;bdi&gt;{confirmation.name}&lt;/bdi&gt;? &lt;/&gt; )} | FriendChangeDialog(); when its owning surface/operation is used |
| [src/cloud/FriendsPageDialogs.tsx:38](../src/cloud/FriendsPageDialogs.tsx#L38) | Message/fragment | Revoke this invitation? | FriendChangeDialog(); confirmation.action === 'revoke' is true |
| [src/cloud/FriendsPageDialogs.tsx:41](../src/cloud/FriendsPageDialogs.tsx#L41) | Message/fragment | Block | FriendChangeDialog(); confirmation.action === 'revoke' is false; confirmation.action === 'block' is true |
| [src/cloud/FriendsPageDialogs.tsx:41](../src/cloud/FriendsPageDialogs.tsx#L41) | Message/fragment | Remove | FriendChangeDialog(); confirmation.action === 'revoke' is false; confirmation.action === 'block' is false |
| [src/cloud/FriendsPageDialogs.tsx:46](../src/cloud/FriendsPageDialogs.tsx#L46) | Rendered copy | The link created ${dateFormat.format(confirmation.invite.createdAt)} will stop working. Existing friendships stay connected. | FriendChangeDialog(); confirmation.action === 'revoke' is true |
| [src/cloud/FriendsPageDialogs.tsx:51](../src/cloud/FriendsPageDialogs.tsx#L51) | Rendered copy | Friends-only rankings become unavailable in both directions. ${confirmation.action === 'block' ? 'New requests and invitations will be blocked. Unblocking does not restore friendship.' : 'A new request is needed to reconnect.'} | FriendChangeDialog(); confirmation.action === 'revoke' is false |
| [src/cloud/FriendsPageDialogs.tsx:54](../src/cloud/FriendsPageDialogs.tsx#L54) | Message/fragment | New requests and invitations will be blocked. Unblocking does not restore friendship. | FriendChangeDialog(); confirmation.action === 'revoke' is false; confirmation.action === 'block' is true |
| [src/cloud/FriendsPageDialogs.tsx:55](../src/cloud/FriendsPageDialogs.tsx#L55) | Message/fragment | A new request is needed to reconnect. | FriendChangeDialog(); confirmation.action === 'revoke' is false; confirmation.action === 'block' is false |
| [src/cloud/FriendsPageDialogs.tsx:59](../src/cloud/FriendsPageDialogs.tsx#L59) | Rendered copy | Cancel | FriendChangeDialog(); when its owning surface/operation is used |
| [src/cloud/FriendsPageDialogs.tsx:62](../src/cloud/FriendsPageDialogs.tsx#L62) | Rendered copy | ${confirmation.action === 'revoke' ? 'Revoke invitation' : confirmation.action === 'block' ? 'Block player' : 'Remove friend'} | FriendChangeDialog(); when its owning surface/operation is used |
| [src/cloud/FriendsPageDialogs.tsx:70](../src/cloud/FriendsPageDialogs.tsx#L70) | Message/fragment | Revoke invitation | FriendChangeDialog(); confirmation.action === 'revoke' is true |
| [src/cloud/FriendsPageDialogs.tsx:72](../src/cloud/FriendsPageDialogs.tsx#L72) | Message/fragment | Block player | FriendChangeDialog(); confirmation.action === 'revoke' is false; confirmation.action === 'block' is true |
| [src/cloud/FriendsPageDialogs.tsx:73](../src/cloud/FriendsPageDialogs.tsx#L73) | Message/fragment | Remove friend | FriendChangeDialog(); confirmation.action === 'revoke' is false; confirmation.action === 'block' is false |
| [src/cloud/FriendsPageDialogs.tsx:77](../src/cloud/FriendsPageDialogs.tsx#L77) | Live region | ${error} | FriendChangeDialog(); error &amp;&amp; |
| [src/cloud/FriendsPageDialogs.tsx:108](../src/cloud/FriendsPageDialogs.tsx#L108) | Rendered copy | ${creating ? 'Creating invite…' : link ? invitationStatus(link, now) === 'Active' ? 'Invite link' : 'Invitation expired' : 'Check invite links'} | InviteLinkDialog(); when its owning surface/operation is used |
| [src/cloud/FriendsPageDialogs.tsx:110](../src/cloud/FriendsPageDialogs.tsx#L110) | Message/fragment | Creating invite… | InviteLinkDialog(); creating is true |
| [src/cloud/FriendsPageDialogs.tsx:112](../src/cloud/FriendsPageDialogs.tsx#L112) | Message/fragment | Active | InviteLinkDialog(); creating is false; link is true |
| [src/cloud/FriendsPageDialogs.tsx:113](../src/cloud/FriendsPageDialogs.tsx#L113) | Message/fragment | Invite link | InviteLinkDialog(); creating is false; link is true; invitationStatus(link, now) === 'Active' is true |
| [src/cloud/FriendsPageDialogs.tsx:114](../src/cloud/FriendsPageDialogs.tsx#L114) | Message/fragment | Invitation expired | InviteLinkDialog(); creating is false; link is true; invitationStatus(link, now) === 'Active' is false |
| [src/cloud/FriendsPageDialogs.tsx:115](../src/cloud/FriendsPageDialogs.tsx#L115) | Message/fragment | Check invite links | InviteLinkDialog(); creating is false; link is false |
| [src/cloud/FriendsPageDialogs.tsx:118](../src/cloud/FriendsPageDialogs.tsx#L118) | Live region | Making your one-use link. It appears after the server confirms it. | InviteLinkDialog(); creating is true |
| [src/cloud/FriendsPageDialogs.tsx:120](../src/cloud/FriendsPageDialogs.tsx#L120) | Message/fragment | Active | InviteLinkDialog(); creating is false; link is true |
| [src/cloud/FriendsPageDialogs.tsx:122](../src/cloud/FriendsPageDialogs.tsx#L122) | Rendered copy | One use. Expires ${dateFormat.format(link.expiresAt)}. Share only with the person you want to invite. | InviteLinkDialog(); creating is false; link is true; invitationStatus(link, now) === 'Active' is true |
| [src/cloud/FriendsPageDialogs.tsx:123](../src/cloud/FriendsPageDialogs.tsx#L123) | Rendered copy | Invitation link | InviteLinkDialog(); creating is false; link is true; invitationStatus(link, now) === 'Active' is true |
| [src/cloud/FriendsPageDialogs.tsx:131](../src/cloud/FriendsPageDialogs.tsx#L131) | Rendered copy | Copy link | InviteLinkDialog(); creating is false; link is true; invitationStatus(link, now) === 'Active' is true |
| [src/cloud/FriendsPageDialogs.tsx:139](../src/cloud/FriendsPageDialogs.tsx#L139) | Rendered copy | Share | InviteLinkDialog(); creating is false; link is true; invitationStatus(link, now) === 'Active' is true |
| [src/cloud/FriendsPageDialogs.tsx:148](../src/cloud/FriendsPageDialogs.tsx#L148) | Live region | ${copyState} | InviteLinkDialog(); creating is false; link is true; invitationStatus(link, now) === 'Active' is true; copyState &amp;&amp; |
| [src/cloud/FriendsPageDialogs.tsx:151](../src/cloud/FriendsPageDialogs.tsx#L151) | Rendered copy | This link is no longer active. Create a new invitation when you need one. | InviteLinkDialog(); creating is false; link is true; invitationStatus(link, now) === 'Active' is false |
| [src/cloud/FriendsPageDialogs.tsx:155](../src/cloud/FriendsPageDialogs.tsx#L155) | Live region | ${error &#124;&#124; 'The result could not be confirmed. Refresh your links before trying again.'} | InviteLinkDialog(); creating is false; link is false |
| [src/cloud/FriendsPageDialogs.tsx:156](../src/cloud/FriendsPageDialogs.tsx#L156) | Message/fragment | The result could not be confirmed. Refresh your links before trying again. | InviteLinkDialog(); creating is false; link is false; error &#124;&#124; |
| [src/cloud/FriendsPageDialogs.tsx:158](../src/cloud/FriendsPageDialogs.tsx#L158) | Rendered copy | Open invite links | InviteLinkDialog(); creating is false; link is false |
## src/cloud/generation-cleanup.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/generation-cleanup.ts:39](../src/cloud/generation-cleanup.ts#L39) | Error/validation | Some saved copies still need cleanup. Refresh the page, then try again. | runPayloadCleanup(); when its owning surface/operation is used |
| [src/cloud/generation-cleanup.ts:59](../src/cloud/generation-cleanup.ts#L59) | Error/validation | Some saved copies could not be checked. Refresh the page, then try again. | remaining(); !data &#124;&#124; data.status !== 'deleting' &#124;&#124; !isSafeInteger(data.uploaded) &#124;&#124; data.uploaded &lt; 0 &#124;&#124; data.uploaded &gt; maximum is true |
## src/cloud/google-auth.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/google-auth.ts:24](../src/cloud/google-auth.ts#L24) | Error/validation | Connect before continuing to Google. Your device library is unchanged. | startGoogleRedirect(); !navigator.onLine is true |
| [src/cloud/google-auth.ts:26](../src/cloud/google-auth.ts#L26) | Error/validation | The signed-in account changed. Start the Google action again from Account. | startGoogleRedirect(); (auth.currentUser?.uid ?? null) !== request.uid is true |
| [src/cloud/google-auth.ts:39](../src/cloud/google-auth.ts#L39) | Error/validation | The account changed before Google could open. | startGoogleRedirect(); request.kind === 'sign-in' is false; !user &#124;&#124; user.uid !== request.uid is true |
| [src/cloud/google-auth.ts:43](../src/cloud/google-auth.ts#L43) | Error/validation | Google did not open in this tab. Try again when connected, or use email. | startGoogleRedirect(); when its owning surface/operation is used |
| [src/cloud/google-auth.ts:70](../src/cloud/google-auth.ts#L70) | Message/fragment | Google returned without a matching request in this tab. Review Account; nothing was deleted or copied. | task(); result is true; !stored.intent is true; stored.error &#124;&#124; |
| [src/cloud/google-auth.ts:83](../src/cloud/google-auth.ts#L83) | Message/fragment | Google confirmation was not completed. Nothing has been deleted. | task(); result is false; stored.intent is true; stored.intent.kind === 'reauthenticate' is true |
| [src/cloud/google-auth.ts:85](../src/cloud/google-auth.ts#L85) | Message/fragment | Google linking was not completed. Your existing account is unchanged. | task(); result is false; stored.intent is true; stored.intent.kind === 'reauthenticate' is false; stored.intent.kind === 'link' is true |
| [src/cloud/google-auth.ts:86](../src/cloud/google-auth.ts#L86) | Message/fragment | Google sign-in was not completed. Your device library is unchanged. | task(); result is false; stored.intent is true; stored.intent.kind === 'reauthenticate' is false; stored.intent.kind === 'link' is false |
| [src/cloud/google-auth.ts:90](../src/cloud/google-auth.ts#L90) | Message/fragment | Google sign-in was cancelled. Your library is unchanged. | task(); operation rejected or threw; popupCancelled(cause) is true |
## src/cloud/InvitationPage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/InvitationPage.tsx:82](../src/cloud/InvitationPage.tsx#L82) | Message output | invitation.error | InvitationPage(); previewing?.store !== store &#124;&#124; previewing.capability !== invitation.capability &#124;&#124; previewing.error !== invitation.error &#124;&#124; previewing.uid !== identity?.uid &#124;&#124; previewing.retry !== retry is true |
| [src/cloud/InvitationPage.tsx:94](../src/cloud/InvitationPage.tsx#L94) | Message output | onlineError(cause) | InvitationPage(); when its owning surface/operation is used |
| [src/cloud/InvitationPage.tsx:122](../src/cloud/InvitationPage.tsx#L122) | Error/validation | The account or invitation changed. Review it again. | accept(); activeUid.current !== uid &#124;&#124; cloudAuth.currentUser?.uid !== uid &#124;&#124; activeCapability.current !== capability &#124;&#124; acceptanceLease.current !== lease is true |
| [src/cloud/InvitationPage.tsx:138](../src/cloud/InvitationPage.tsx#L138) | Message output | committed ? committedFriendMessage(committed) : friendMutationError(cause) | accept(); operation rejected or threw; committed?.receipt.operation === 'accept-invite' is false |
| [src/cloud/InvitationPage.tsx:148](../src/cloud/InvitationPage.tsx#L148) | Rendered copy | Invitation | InvitationPage(); when its owning surface/operation is used |
| [src/cloud/InvitationPage.tsx:152](../src/cloud/InvitationPage.tsx#L152) | Live region | Opening invitation… | InvitationPage(); busy is true |
| [src/cloud/InvitationPage.tsx:155](../src/cloud/InvitationPage.tsx#L155) | Rendered copy | You're connected | InvitationPage(); busy is false; done is true |
| [src/cloud/InvitationPage.tsx:156](../src/cloud/InvitationPage.tsx#L156) | Rendered copy | Open Friends | InvitationPage(); busy is false; done is true |
| [src/cloud/InvitationPage.tsx:168](../src/cloud/InvitationPage.tsx#L168) | Rendered copy | Invites you to connect. | InvitationPage(); busy is false; done is false; preview is true |
| [src/cloud/InvitationPage.tsx:171](../src/cloud/InvitationPage.tsx#L171) | Rendered copy | One use. Expires ${new Date(preview.expiresAt).toLocaleString()}. Accepted friends see games and rankings allowed by your sharing mode; notes and play history stay private. | InvitationPage(); busy is false; done is false; preview is true |
| [src/cloud/InvitationPage.tsx:179](../src/cloud/InvitationPage.tsx#L179) | Rendered copy | Accept as ${identity.displayName} | InvitationPage(); busy is false; done is false; preview is true; identity is true |
| [src/cloud/InvitationPage.tsx:182](../src/cloud/InvitationPage.tsx#L182) | Rendered copy | This is your own invitation. | InvitationPage(); busy is false; done is false; preview is true; identity is true; identity.uid === preview.ownerUid is true |
| [src/cloud/InvitationPage.tsx:184](../src/cloud/InvitationPage.tsx#L184) | Rendered copy | ${accepting ? 'Accepting…' : 'Accept invitation'} | InvitationPage(); busy is false; done is false; preview is true; identity is true; identity.uid === preview.ownerUid is false; identity.verified is true |
| [src/cloud/InvitationPage.tsx:191](../src/cloud/InvitationPage.tsx#L191) | Message/fragment | Accept invitation | InvitationPage(); busy is false; done is false; preview is true; identity is true; identity.uid === preview.ownerUid is false; identity.verified is true; accepting is false |
| [src/cloud/InvitationPage.tsx:191](../src/cloud/InvitationPage.tsx#L191) | Message/fragment | Accepting… | InvitationPage(); busy is false; done is false; preview is true; identity is true; identity.uid === preview.ownerUid is false; identity.verified is true; accepting is true |
| [src/cloud/InvitationPage.tsx:194](../src/cloud/InvitationPage.tsx#L194) | Rendered copy | Verify your account | InvitationPage(); busy is false; done is false; preview is true; identity is true; identity.uid === preview.ownerUid is false; identity.verified is false |
| [src/cloud/InvitationPage.tsx:201](../src/cloud/InvitationPage.tsx#L201) | Rendered copy | Sign in, then choose whether to accept. | InvitationPage(); busy is false; done is false; preview is true; identity is false |
| [src/cloud/InvitationPage.tsx:203](../src/cloud/InvitationPage.tsx#L203) | Rendered copy | Retry invitation storage | InvitationPage(); busy is false; done is false; preview is true; identity is false; invitation.capability &amp;&amp; invitation.error &amp;&amp; |
| [src/cloud/InvitationPage.tsx:210](../src/cloud/InvitationPage.tsx#L210) | Message output | onlineError(cause) | InvitationPage(); busy is false; done is false; preview is true; identity is false; invitation.capability &amp;&amp; invitation.error &amp;&amp;; onClick; operation rejected or threw |
| [src/cloud/InvitationPage.tsx:223](../src/cloud/InvitationPage.tsx#L223) | Rendered copy | Invitation unavailable | InvitationPage(); busy is false; done is false; preview is false |
| [src/cloud/InvitationPage.tsx:224](../src/cloud/InvitationPage.tsx#L224) | Rendered copy | It may have expired, been used or been revoked. Ask for a new link. | InvitationPage(); busy is false; done is false; preview is false |
| [src/cloud/InvitationPage.tsx:225](../src/cloud/InvitationPage.tsx#L225) | Rendered copy | Try again | InvitationPage(); busy is false; done is false; preview is false |
| [src/cloud/InvitationPage.tsx:231](../src/cloud/InvitationPage.tsx#L231) | Live region | ${error} | InvitationPage(); error &amp;&amp; |
## src/cloud/online-bridge.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/online-bridge.ts:50](../src/cloud/online-bridge.ts#L50) | Message/fragment | Device copy unavailable | onlineBridge(); cacheUnavailable is true |
| [src/cloud/online-bridge.ts:53](../src/cloud/online-bridge.ts#L53) | Message/fragment | Finishing local edits… | onlineBridge(); cacheUnavailable is false; active is true; pendingEdits is true |
| [src/cloud/online-bridge.ts:55](../src/cloud/online-bridge.ts#L55) | Message/fragment | Device only | onlineBridge(); cacheUnavailable is false; active is false |
## src/cloud/OnlineController.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/OnlineController.tsx:250](../src/cloud/OnlineController.tsx#L250) | Label/help | {visibleError} | renderAuthPanel(); when its owning surface/operation is used |
| [src/cloud/OnlineController.tsx:251](../src/cloud/OnlineController.tsx#L251) | Label/help | {visibleMessage} | renderAuthPanel(); when its owning surface/operation is used |
| [src/cloud/OnlineController.tsx:280](../src/cloud/OnlineController.tsx#L280) | Live region | ${openInvitation.error} | OnlineController(); page === 'invite' &amp;&amp; openInvitation.error &amp;&amp; |
| [src/cloud/OnlineController.tsx:285](../src/cloud/OnlineController.tsx#L285) | Rendered copy | Local emulator preview — no production account or cloud data connection. | OnlineController(); cloudPage &amp;&amp; EMULATOR_MODE &amp;&amp; |
| [src/cloud/OnlineController.tsx:290](../src/cloud/OnlineController.tsx#L290) | Live region | Signed in. Persistence across refresh has not yet been confirmed. | OnlineController(); cloudPage &amp;&amp; identity &amp;&amp; session.sessionUnconfirmed &amp;&amp; |
| [src/cloud/OnlineController.tsx:311](../src/cloud/OnlineController.tsx#L311) | Label/help | {visibleError} | OnlineController(); cloudPage &amp;&amp; |
| [src/cloud/OnlineController.tsx:312](../src/cloud/OnlineController.tsx#L312) | Label/help | {visibleMessage} | OnlineController(); cloudPage &amp;&amp; |
| [src/cloud/OnlineController.tsx:330](../src/cloud/OnlineController.tsx#L330) | Rendered copy | Sign in | OnlineController(); signInOpen &amp;&amp; |
## src/cloud/OnlinePages.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/OnlinePages.tsx:132](../src/cloud/OnlinePages.tsx#L132) | Live region | Restoring account… | OnlinePages(); restoring is true |
| [src/cloud/OnlinePages.tsx:133](../src/cloud/OnlinePages.tsx#L133) | Rendered copy | Restoring account… | OnlinePages(); restoring is true |
| [src/cloud/OnlinePages.tsx:161](../src/cloud/OnlinePages.tsx#L161) | Rendered copy | ${signInPageTitle(page)} | OnlinePages(); restoring is false; page === 'community' is false; page === 'profile' is false; page === 'invite' is false; !identity is true |
| [src/cloud/OnlinePages.tsx:207](../src/cloud/OnlinePages.tsx#L207) | Live region | Loading games… Retry the collection download if this does not finish. Open collection | OnlinePages(); restoring is false; page === 'community' is false; page === 'profile' is false; page === 'invite' is false; !identity is false; page === 'friends' &amp;&amp; friendIdentity is false; page === 'friend' &amp;&amp; friendIdentity is false; (page === 'compare' &#124;&#124; page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; !games.length is true |
| [src/cloud/OnlinePages.tsx:208](../src/cloud/OnlinePages.tsx#L208) | Rendered copy | Loading games… | OnlinePages(); restoring is false; page === 'community' is false; page === 'profile' is false; page === 'invite' is false; !identity is false; page === 'friends' &amp;&amp; friendIdentity is false; page === 'friend' &amp;&amp; friendIdentity is false; (page === 'compare' &#124;&#124; page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; !games.length is true |
| [src/cloud/OnlinePages.tsx:209](../src/cloud/OnlinePages.tsx#L209) | Rendered copy | Retry the collection download if this does not finish. | OnlinePages(); restoring is false; page === 'community' is false; page === 'profile' is false; page === 'invite' is false; !identity is false; page === 'friends' &amp;&amp; friendIdentity is false; page === 'friend' &amp;&amp; friendIdentity is false; (page === 'compare' &#124;&#124; page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; !games.length is true |
| [src/cloud/OnlinePages.tsx:210](../src/cloud/OnlinePages.tsx#L210) | Rendered copy | Open collection | OnlinePages(); restoring is false; page === 'community' is false; page === 'profile' is false; page === 'invite' is false; !identity is false; page === 'friends' &amp;&amp; friendIdentity is false; page === 'friend' &amp;&amp; friendIdentity is false; (page === 'compare' &#124;&#124; page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; !games.length is true |
| [src/cloud/OnlinePages.tsx:229](../src/cloud/OnlinePages.tsx#L229) | Rendered copy | Shared with friends | OnlinePages(); restoring is false; page === 'community' is false; page === 'profile' is false; page === 'invite' is false; !identity is false; page === 'friends' &amp;&amp; friendIdentity is false; page === 'friend' &amp;&amp; friendIdentity is false; (page === 'compare' &#124;&#124; page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; !games.length is false; page === 'compare' &amp;&amp; friendIdentity is false; (page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; sharingView === 'automatic' is true |
| [src/cloud/OnlinePages.tsx:233](../src/cloud/OnlinePages.tsx#L233) | Rendered copy | Friends | OnlinePages(); restoring is false; page === 'community' is false; page === 'profile' is false; page === 'invite' is false; !identity is false; page === 'friends' &amp;&amp; friendIdentity is false; page === 'friend' &amp;&amp; friendIdentity is false; (page === 'compare' &#124;&#124; page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; !games.length is false; page === 'compare' &amp;&amp; friendIdentity is false; (page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; sharingView === 'automatic' is true |
| [src/cloud/OnlinePages.tsx:239](../src/cloud/OnlinePages.tsx#L239) | Rendered copy | ${page === 'friend-shelf' ? 'Shared games' : 'Friend sharing'} | OnlinePages(); restoring is false; page === 'community' is false; page === 'profile' is false; page === 'invite' is false; !identity is false; page === 'friends' &amp;&amp; friendIdentity is false; page === 'friend' &amp;&amp; friendIdentity is false; (page === 'compare' &#124;&#124; page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; !games.length is false; page === 'compare' &amp;&amp; friendIdentity is false; (page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; sharingView === 'automatic' is false; (page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; sharingView === 'checking' is true |
| [src/cloud/OnlinePages.tsx:240](../src/cloud/OnlinePages.tsx#L240) | Message/fragment | Friend sharing | OnlinePages(); restoring is false; page === 'community' is false; page === 'profile' is false; page === 'invite' is false; !identity is false; page === 'friends' &amp;&amp; friendIdentity is false; page === 'friend' &amp;&amp; friendIdentity is false; (page === 'compare' &#124;&#124; page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; !games.length is false; page === 'compare' &amp;&amp; friendIdentity is false; (page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; sharingView === 'automatic' is false; (page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; sharingView === 'checking' is true; page === 'friend-shelf' is false |
| [src/cloud/OnlinePages.tsx:240](../src/cloud/OnlinePages.tsx#L240) | Message/fragment | Shared games | OnlinePages(); restoring is false; page === 'community' is false; page === 'profile' is false; page === 'invite' is false; !identity is false; page === 'friends' &amp;&amp; friendIdentity is false; page === 'friend' &amp;&amp; friendIdentity is false; (page === 'compare' &#124;&#124; page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; !games.length is false; page === 'compare' &amp;&amp; friendIdentity is false; (page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; sharingView === 'automatic' is false; (page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; sharingView === 'checking' is true; page === 'friend-shelf' is true |
| [src/cloud/OnlinePages.tsx:247](../src/cloud/OnlinePages.tsx#L247) | Label/help | {automatic.error} | OnlinePages(); restoring is false; page === 'community' is false; page === 'profile' is false; page === 'invite' is false; !identity is false; page === 'friends' &amp;&amp; friendIdentity is false; page === 'friend' &amp;&amp; friendIdentity is false; (page === 'compare' &#124;&#124; page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; !games.length is false; page === 'compare' &amp;&amp; friendIdentity is false; (page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; sharingView === 'automatic' is false; (page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; sharingView === 'checking' is true |
| [src/cloud/OnlinePages.tsx:265](../src/cloud/OnlinePages.tsx#L265) | Label/help | {friends.error} | OnlinePages(); restoring is false; page === 'community' is false; page === 'profile' is false; page === 'invite' is false; !identity is false; page === 'friends' &amp;&amp; friendIdentity is false; page === 'friend' &amp;&amp; friendIdentity is false; (page === 'compare' &#124;&#124; page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; !games.length is false; page === 'compare' &amp;&amp; friendIdentity is false; (page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; sharingView === 'automatic' is false; (page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; sharingView === 'checking' is false; page === 'friend-sharing' &amp;&amp; friendIdentity is true |
| [src/cloud/OnlinePages.tsx:319](../src/cloud/OnlinePages.tsx#L319) | Label/help | {error &#124;&#124; account.error &#124;&#124; sync.error} | OnlinePages(); restoring is false; page === 'community' is false; page === 'profile' is false; page === 'invite' is false; !identity is false; page === 'friends' &amp;&amp; friendIdentity is false; page === 'friend' &amp;&amp; friendIdentity is false; (page === 'compare' &#124;&#124; page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; !games.length is false; page === 'compare' &amp;&amp; friendIdentity is false; (page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; sharingView === 'automatic' is false; (page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; sharingView === 'checking' is false; page === 'friend-sharing' &amp;&amp; friendIdentity is false; page === 'friend-shelf' &amp;&amp; friendIdentity is false; page === 'creator' is false; page === 'publish' is false |
| [src/cloud/OnlinePages.tsx:320](../src/cloud/OnlinePages.tsx#L320) | Label/help | {message} | OnlinePages(); restoring is false; page === 'community' is false; page === 'profile' is false; page === 'invite' is false; !identity is false; page === 'friends' &amp;&amp; friendIdentity is false; page === 'friend' &amp;&amp; friendIdentity is false; (page === 'compare' &#124;&#124; page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; !games.length is false; page === 'compare' &amp;&amp; friendIdentity is false; (page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; sharingView === 'automatic' is false; (page === 'friend-sharing' &#124;&#124; page === 'friend-shelf') &amp;&amp; sharingView === 'checking' is false; page === 'friend-sharing' &amp;&amp; friendIdentity is false; page === 'friend-shelf' &amp;&amp; friendIdentity is false; page === 'creator' is false; page === 'publish' is false |
## src/cloud/PublicProfilePage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/PublicProfilePage.tsx:22](../src/cloud/PublicProfilePage.tsx#L22) | Rendered copy | ${score ?? '—'} ${score !== null &amp;&amp; &lt;small&gt; / 10&lt;/small&gt;} | PublicScore(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:26](../src/cloud/PublicProfilePage.tsx#L26) | Rendered copy | ${score === null ? 'No personal score' : &#96;Publisher rating ${score} out of 10&#96;} | PublicScore(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:26](../src/cloud/PublicProfilePage.tsx#L26) | Message/fragment | No personal score | PublicScore(); score === null is true |
| [src/cloud/PublicProfilePage.tsx:26](../src/cloud/PublicProfilePage.tsx#L26) | Message/fragment | Publisher rating ${score} out of 10 | PublicScore(); score === null is false |
| [src/cloud/PublicProfilePage.tsx:86](../src/cloud/PublicProfilePage.tsx#L86) | Message output | onlineError(cause) | PublicProfilePage(); !canceled is true |
| [src/cloud/PublicProfilePage.tsx:101](../src/cloud/PublicProfilePage.tsx#L101) | Message output | &#96;${feedback.message ?? actionMessage(action, library.state)} The publisher's scores were not copied.&#96; | save(); await library.perform(action, feedback) is true |
| [src/cloud/PublicProfilePage.tsx:102](../src/cloud/PublicProfilePage.tsx#L102) | Message/fragment | ${feedback.message ?? actionMessage(action, library.state)} The publisher's scores were not copied. | save(); await library.perform(action, feedback) is true |
| [src/cloud/PublicProfilePage.tsx:105](../src/cloud/PublicProfilePage.tsx#L105) | Message output | 'These games could not be saved. Your previous library is unchanged; check the storage warning.' | save(); await library.perform(action, feedback) is false |
| [src/cloud/PublicProfilePage.tsx:105](../src/cloud/PublicProfilePage.tsx#L105) | Message/fragment | These games could not be saved. Your previous library is unchanged; check the storage warning. | save(); await library.perform(action, feedback) is false |
| [src/cloud/PublicProfilePage.tsx:107](../src/cloud/PublicProfilePage.tsx#L107) | Message output | onlineError(cause) | save(); operation rejected or threw |
| [src/cloud/PublicProfilePage.tsx:113](../src/cloud/PublicProfilePage.tsx#L113) | Rendered copy | This ranking link isn't valid. | PublicProfilePage(); invalidHandle is true |
| [src/cloud/PublicProfilePage.tsx:116](../src/cloud/PublicProfilePage.tsx#L116) | Rendered copy | Check the link or browse Community. | PublicProfilePage(); invalidHandle is true |
| [src/cloud/PublicProfilePage.tsx:117](../src/cloud/PublicProfilePage.tsx#L117) | Rendered copy | Browse Community | PublicProfilePage(); invalidHandle is true |
| [src/cloud/PublicProfilePage.tsx:125](../src/cloud/PublicProfilePage.tsx#L125) | Live region | Opening this ranking… Only explicitly published content is requested. | PublicProfilePage(); busy &amp;&amp; !profile is true |
| [src/cloud/PublicProfilePage.tsx:126](../src/cloud/PublicProfilePage.tsx#L126) | Rendered copy | Opening this ranking… | PublicProfilePage(); busy &amp;&amp; !profile is true |
| [src/cloud/PublicProfilePage.tsx:127](../src/cloud/PublicProfilePage.tsx#L127) | Rendered copy | Only explicitly published content is requested. | PublicProfilePage(); busy &amp;&amp; !profile is true |
| [src/cloud/PublicProfilePage.tsx:133](../src/cloud/PublicProfilePage.tsx#L133) | Rendered copy | ${error ? "This ranking couldn't load." : 'This ranking is not available.'} | PublicProfilePage(); !profile is true |
| [src/cloud/PublicProfilePage.tsx:134](../src/cloud/PublicProfilePage.tsx#L134) | Message/fragment | This ranking couldn't load. | PublicProfilePage(); !profile is true; error is true |
| [src/cloud/PublicProfilePage.tsx:134](../src/cloud/PublicProfilePage.tsx#L134) | Message/fragment | This ranking is not available. | PublicProfilePage(); !profile is true; error is false |
| [src/cloud/PublicProfilePage.tsx:136](../src/cloud/PublicProfilePage.tsx#L136) | Rendered copy | ${error &#124;&#124; 'This link may be wrong, or the ranking may no longer be public. You can only see rankings their owners have published, not their private libraries.'} | PublicProfilePage(); !profile is true |
| [src/cloud/PublicProfilePage.tsx:138](../src/cloud/PublicProfilePage.tsx#L138) | Message/fragment | This link may be wrong, or the ranking may no longer be public. You can only see rankings their owners have published, not their private libraries. | PublicProfilePage(); !profile is true; error &#124;&#124; |
| [src/cloud/PublicProfilePage.tsx:141](../src/cloud/PublicProfilePage.tsx#L141) | Rendered copy | Try again | PublicProfilePage(); !profile is true; error &amp;&amp; |
| [src/cloud/PublicProfilePage.tsx:145](../src/cloud/PublicProfilePage.tsx#L145) | Rendered copy | Back to Community | PublicProfilePage(); !profile is true |
| [src/cloud/PublicProfilePage.tsx:156](../src/cloud/PublicProfilePage.tsx#L156) | Rendered copy | ${profile.displayName} @${profile.handle} ${profile.creator &amp;&amp; &lt;strong className="creator-badge"&gt;Collection creator&lt;/strong&gt;} | PublicProfilePage(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:157](../src/cloud/PublicProfilePage.tsx#L157) | Rendered copy | @${profile.handle} | PublicProfilePage(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:158](../src/cloud/PublicProfilePage.tsx#L158) | Rendered copy | Collection creator | PublicProfilePage(); profile.creator &amp;&amp; |
| [src/cloud/PublicProfilePage.tsx:160](../src/cloud/PublicProfilePage.tsx#L160) | Rendered copy | ${profile.title} | PublicProfilePage(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:163](../src/cloud/PublicProfilePage.tsx#L163) | Rendered copy | Personal preferences, not an official ranking. Published ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(profile.updatedAt)}. | PublicProfilePage(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:168](../src/cloud/PublicProfilePage.tsx#L168) | Rendered copy | Share | PublicProfilePage(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:171](../src/cloud/PublicProfilePage.tsx#L171) | Message/fragment | ${profile.title} by ${profile.displayName} | PublicProfilePage(); onClick |
| [src/cloud/PublicProfilePage.tsx:179](../src/cloud/PublicProfilePage.tsx#L179) | Rendered copy | ${entries.length} games in this published snapshot. Saving adds games to your library, not their ratings or play history. | PublicProfilePage(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:184](../src/cloud/PublicProfilePage.tsx#L184) | Rendered copy | ${selected.size === entries.length ? 'Clear selection' : &#96;Select all ${entries.length}&#96;} | PublicProfilePage(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:190](../src/cloud/PublicProfilePage.tsx#L190) | Message/fragment | Clear selection | PublicProfilePage(); selected.size === entries.length is true |
| [src/cloud/PublicProfilePage.tsx:190](../src/cloud/PublicProfilePage.tsx#L190) | Message/fragment | Select all ${entries.length} | PublicProfilePage(); selected.size === entries.length is false |
| [src/cloud/PublicProfilePage.tsx:192](../src/cloud/PublicProfilePage.tsx#L192) | Rendered copy | Save ${selected.size &#124;&#124; 'selected'} for later | PublicProfilePage(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:205](../src/cloud/PublicProfilePage.tsx#L205) | Live region | ${error} | PublicProfilePage(); error &amp;&amp; |
| [src/cloud/PublicProfilePage.tsx:210](../src/cloud/PublicProfilePage.tsx#L210) | Live region | ${message} | PublicProfilePage(); message &amp;&amp; |
| [src/cloud/PublicProfilePage.tsx:220](../src/cloud/PublicProfilePage.tsx#L220) | Label/help | {&#96;Select ${entry.title}&#96;} | PublicProfilePage(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:220](../src/cloud/PublicProfilePage.tsx#L220) | Message/fragment | Select ${entry.title} | PublicProfilePage(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:232](../src/cloud/PublicProfilePage.tsx#L232) | Rendered copy | ${String(entry.position).padStart(2, '0')} | PublicProfilePage(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:234](../src/cloud/PublicProfilePage.tsx#L234) | Rendered copy | ${entry.title} | PublicProfilePage(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:240](../src/cloud/PublicProfilePage.tsx#L240) | Message output | onlineError(cause) | PublicProfilePage(); onClick; operation rejected or threw |
| [src/cloud/PublicProfilePage.tsx:246](../src/cloud/PublicProfilePage.tsx#L246) | Rendered copy | ${entry.year ?? 'Year not supplied'} ${entry.source === 'collection' ? ' · From the original 100' : &#96; · ${entry.source === 'manual' ? 'Added by the publisher' : entry.source}&#96;} | PublicProfilePage(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:247](../src/cloud/PublicProfilePage.tsx#L247) | Message/fragment | Year not supplied | PublicProfilePage(); entry.year ?? |
| [src/cloud/PublicProfilePage.tsx:249](../src/cloud/PublicProfilePage.tsx#L249) | Message/fragment | · From the original 100 | PublicProfilePage(); entry.source === 'collection' is true |
| [src/cloud/PublicProfilePage.tsx:250](../src/cloud/PublicProfilePage.tsx#L250) | Message/fragment | · ${entry.source === 'manual' ? 'Added by the publisher' : entry.source} | PublicProfilePage(); entry.source === 'collection' is false |
| [src/cloud/PublicProfilePage.tsx:253](../src/cloud/PublicProfilePage.tsx#L253) | Rendered copy | Source | PublicProfilePage(); entry.sourceUrl &amp;&amp; |
| [src/cloud/PublicProfilePage.tsx:263](../src/cloud/PublicProfilePage.tsx#L263) | Label/help | {&#96;${library.state.progress[entry.id]?.later ? 'Already saved' : 'Save for later'}: ${entry.title}&#96;} | PublicProfilePage(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:263](../src/cloud/PublicProfilePage.tsx#L263) | Message/fragment | ${library.state.progress[entry.id]?.later ? 'Already saved' : 'Save for later'}: ${entry.title} | PublicProfilePage(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:274](../src/cloud/PublicProfilePage.tsx#L274) | Rendered copy | Show ${Math.min(30, entries.length - visible)} more games | PublicProfilePage(); visible &lt; entries.length &amp;&amp; |
| [src/cloud/PublicProfilePage.tsx:280](../src/cloud/PublicProfilePage.tsx#L280) | Rendered copy | Published snapshots update only when their owner chooses. | PublicProfilePage(); when its owning surface/operation is used |
| [src/cloud/PublicProfilePage.tsx:283](../src/cloud/PublicProfilePage.tsx#L283) | Rendered copy | Connect with this player | PublicProfilePage(); identity?.uid !== profile.uid &amp;&amp; |
| [src/cloud/PublicProfilePage.tsx:286](../src/cloud/PublicProfilePage.tsx#L286) | Rendered copy | Report profile | PublicProfilePage(); identity?.uid !== profile.uid &amp;&amp; |
| [src/cloud/PublicProfilePage.tsx:300](../src/cloud/PublicProfilePage.tsx#L300) | Rendered copy | Report this profile | PublicProfilePage(); reporting &amp;&amp; |
| [src/cloud/PublicProfilePage.tsx:303](../src/cloud/PublicProfilePage.tsx#L303) | Rendered copy | The creator can review one report per account and profile. A report does not automatically hide anyone. | PublicProfilePage(); reporting &amp;&amp; |
| [src/cloud/PublicProfilePage.tsx:309](../src/cloud/PublicProfilePage.tsx#L309) | Message output | identity.uid, profile.uid, reason | PublicProfilePage(); reporting &amp;&amp;; onSubmit |
| [src/cloud/PublicProfilePage.tsx:313](../src/cloud/PublicProfilePage.tsx#L313) | Message output | 'Your report was submitted for the creator to review.' | PublicProfilePage(); reporting &amp;&amp;; onSubmit |
| [src/cloud/PublicProfilePage.tsx:313](../src/cloud/PublicProfilePage.tsx#L313) | Message/fragment | Your report was submitted for the creator to review. | PublicProfilePage(); reporting &amp;&amp;; onSubmit |
| [src/cloud/PublicProfilePage.tsx:315](../src/cloud/PublicProfilePage.tsx#L315) | Message output | onlineError(cause) | PublicProfilePage(); reporting &amp;&amp;; onSubmit |
| [src/cloud/PublicProfilePage.tsx:319](../src/cloud/PublicProfilePage.tsx#L319) | Rendered copy | What needs attention? | PublicProfilePage(); reporting &amp;&amp; |
| [src/cloud/PublicProfilePage.tsx:330](../src/cloud/PublicProfilePage.tsx#L330) | Rendered copy | Do not include private contact details or sensitive information. | PublicProfilePage(); reporting &amp;&amp; |
| [src/cloud/PublicProfilePage.tsx:332](../src/cloud/PublicProfilePage.tsx#L332) | Live region | ${error} | PublicProfilePage(); reporting &amp;&amp;; error &amp;&amp; |
| [src/cloud/PublicProfilePage.tsx:336](../src/cloud/PublicProfilePage.tsx#L336) | Rendered copy | Submit report | PublicProfilePage(); reporting &amp;&amp; |
## src/cloud/publish-fields.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/publish-fields.ts:39](../src/cloud/publish-fields.ts#L39) | Message/fragment | My games, my order | values(); when its owning surface/operation is used |
## src/cloud/PublishPage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/PublishPage.tsx:85](../src/cloud/PublishPage.tsx#L85) | Message output | onlineError(cause) | PublishDraft(); identity.verified is true; active is true |
| [src/cloud/PublishPage.tsx:101](../src/cloud/PublishPage.tsx#L101) | Error/validation | Wait for publication permissions before previewing. | buildPreview(); !control is true |
| [src/cloud/PublishPage.tsx:103](../src/cloud/PublishPage.tsx#L103) | Error/validation | Choose a public name up to 60 characters and a ranking title up to 80 characters. | buildPreview(); !name.trim() &#124;&#124; name.trim().length &gt; 60 &#124;&#124; !title.trim() &#124;&#124; title.trim().length &gt; 80 is true |
| [src/cloud/PublishPage.tsx:120](../src/cloud/PublishPage.tsx#L120) | Message output | onlineError(cause) | buildPreview(); operation rejected or threw |
| [src/cloud/PublishPage.tsx:136](../src/cloud/PublishPage.tsx#L136) | Message output | onlineError(cause) | publish(); operation rejected or threw |
| [src/cloud/PublishPage.tsx:144](../src/cloud/PublishPage.tsx#L144) | Rendered copy | Verify before publishing. | PublishDraft(); !identity.verified is true |
| [src/cloud/PublishPage.tsx:147](../src/cloud/PublishPage.tsx#L147) | Rendered copy | Your current ranking is still private. Verify your sign-in email before making a public profile. | PublishDraft(); !identity.verified is true |
| [src/cloud/PublishPage.tsx:148](../src/cloud/PublishPage.tsx#L148) | Rendered copy | Open Account | PublishDraft(); !identity.verified is true |
| [src/cloud/PublishPage.tsx:157](../src/cloud/PublishPage.tsx#L157) | Rendered copy | ${existing?.published ? 'Update public ranking' : 'Publish ranking'} | PublishDraft(); when its owning surface/operation is used |
| [src/cloud/PublishPage.tsx:158](../src/cloud/PublishPage.tsx#L158) | Message/fragment | Publish ranking | PublishDraft(); existing?.published is false |
| [src/cloud/PublishPage.tsx:158](../src/cloud/PublishPage.tsx#L158) | Message/fragment | Update public ranking | PublishDraft(); existing?.published is true |
| [src/cloud/PublishPage.tsx:164](../src/cloud/PublishPage.tsx#L164) | Live region | The creator has paused publishing for this profile. Deleting or renaming it will not remove that restriction. | PublishDraft(); control?.hidden &amp;&amp; |
| [src/cloud/PublishPage.tsx:169](../src/cloud/PublishPage.tsx#L169) | Live region | This account's online content was deleted. Reconnect from Account before publishing again. | PublishDraft(); control?.deleted &amp;&amp; |
| [src/cloud/PublishPage.tsx:175](../src/cloud/PublishPage.tsx#L175) | Rendered copy | No ranked games yet | PublishDraft(); !rows.length is true |
| [src/cloud/PublishPage.tsx:176](../src/cloud/PublishPage.tsx#L176) | Rendered copy | Add games and optional ratings in My games, under Ranking. Nothing has been published. | PublishDraft(); !rows.length is true |
| [src/cloud/PublishPage.tsx:177](../src/cloud/PublishPage.tsx#L177) | Rendered copy | Open my ranking | PublishDraft(); !rows.length is true |
| [src/cloud/PublishPage.tsx:184](../src/cloud/PublishPage.tsx#L184) | Rendered copy | Public name | PublishDraft(); !rows.length is false |
| [src/cloud/PublishPage.tsx:196](../src/cloud/PublishPage.tsx#L196) | Rendered copy | Unique handle3–24 letters, numbers or underscores; starts with a letter. | PublishDraft(); !rows.length is false |
| [src/cloud/PublishPage.tsx:197](../src/cloud/PublishPage.tsx#L197) | Rendered copy | 3–24 letters, numbers or underscores; starts with a letter. | PublishDraft(); !rows.length is false |
| [src/cloud/PublishPage.tsx:209](../src/cloud/PublishPage.tsx#L209) | Label/help | your_handle | PublishDraft(); !rows.length is false |
| [src/cloud/PublishPage.tsx:212](../src/cloud/PublishPage.tsx#L212) | Rendered copy | Ranking title | PublishDraft(); !rows.length is false |
| [src/cloud/PublishPage.tsx:226](../src/cloud/PublishPage.tsx#L226) | Live region | ${handleIssue} | PublishDraft(); !rows.length is false; handleIssue &amp;&amp; |
| [src/cloud/PublishPage.tsx:231](../src/cloud/PublishPage.tsx#L231) | Rendered copy | ${selected.size} of ${PUBLIC_LIMIT} selected | PublishDraft(); !rows.length is false |
| [src/cloud/PublishPage.tsx:235](../src/cloud/PublishPage.tsx#L235) | Rendered copy | Select all ranked games | PublishDraft(); !rows.length is false |
| [src/cloud/PublishPage.tsx:242](../src/cloud/PublishPage.tsx#L242) | Rendered copy | Clear selection | PublishDraft(); !rows.length is false |
| [src/cloud/PublishPage.tsx:265](../src/cloud/PublishPage.tsx#L265) | Rendered copy | #${index + 1} ${row.title} | PublishDraft(); !rows.length is false |
| [src/cloud/PublishPage.tsx:266](../src/cloud/PublishPage.tsx#L266) | Rendered copy | #${index + 1} | PublishDraft(); !rows.length is false |
| [src/cloud/PublishPage.tsx:270](../src/cloud/PublishPage.tsx#L270) | Rendered copy | ${row.score ?? '—'} ${row.score !== null &amp;&amp; &lt;small&gt; / 10&lt;/small&gt;} | PublishDraft(); !rows.length is false |
| [src/cloud/PublishPage.tsx:278](../src/cloud/PublishPage.tsx#L278) | Rendered copy | Show next ${Math.min(30, rows.length - limit)} ranked games | PublishDraft(); !rows.length is false; limit &lt; rows.length &amp;&amp; |
| [src/cloud/PublishPage.tsx:283](../src/cloud/PublishPage.tsx#L283) | Rendered copy | Show in Community | PublishDraft(); !rows.length is false |
| [src/cloud/PublishPage.tsx:292](../src/cloud/PublishPage.tsx#L292) | Rendered copy | Anyone with the link can view this, listed or not. | PublishDraft(); !rows.length is false |
| [src/cloud/PublishPage.tsx:293](../src/cloud/PublishPage.tsx#L293) | Rendered copy | Preview public snapshot | PublishDraft(); !rows.length is false |
| [src/cloud/PublishPage.tsx:304](../src/cloud/PublishPage.tsx#L304) | Rendered copy | Unpublish current ranking | PublishDraft(); existing?.published &amp;&amp; |
| [src/cloud/PublishPage.tsx:313](../src/cloud/PublishPage.tsx#L313) | Live region | ${error} | PublishDraft(); error &amp;&amp; |
| [src/cloud/PublishPage.tsx:326](../src/cloud/PublishPage.tsx#L326) | Rendered copy | Public preview | PublishDraft(); preview &amp;&amp; |
| [src/cloud/PublishPage.tsx:332](../src/cloud/PublishPage.tsx#L332) | Rendered copy | ${preview.displayName} | PublishDraft(); preview &amp;&amp; |
| [src/cloud/PublishPage.tsx:333](../src/cloud/PublishPage.tsx#L333) | Rendered copy | @${preview.handle} | PublishDraft(); preview &amp;&amp; |
| [src/cloud/PublishPage.tsx:334](../src/cloud/PublishPage.tsx#L334) | Rendered copy | ${preview.title} | PublishDraft(); preview &amp;&amp; |
| [src/cloud/PublishPage.tsx:337](../src/cloud/PublishPage.tsx#L337) | Rendered copy | Anyone with the link can view or copy these games and scores. | PublishDraft(); preview &amp;&amp; |
| [src/cloud/PublishPage.tsx:341](../src/cloud/PublishPage.tsx#L341) | Rendered copy | ${row.position}. ${row.title} ${row.year ?? 'Year not supplied'} · ${row.source} ${row.sourceUrl &amp;&amp; ( &lt;a href={row.sourceUrl} target="_blank" rel="noreferrer"&gt; Source &lt;Icon name="up-right" width="13" height="13" /&gt; &lt;/a&gt; )} | PublishDraft(); preview &amp;&amp; |
| [src/cloud/PublishPage.tsx:343](../src/cloud/PublishPage.tsx#L343) | Rendered copy | ${row.year ?? 'Year not supplied'} · ${row.source} ${row.sourceUrl &amp;&amp; ( &lt;a href={row.sourceUrl} target="_blank" rel="noreferrer"&gt; Source &lt;Icon name="up-right" width="13" height="13" /&gt; &lt;/a&gt; )} | PublishDraft(); preview &amp;&amp; |
| [src/cloud/PublishPage.tsx:344](../src/cloud/PublishPage.tsx#L344) | Message/fragment | Year not supplied | PublishDraft(); preview &amp;&amp;; row.year ?? |
| [src/cloud/PublishPage.tsx:346](../src/cloud/PublishPage.tsx#L346) | Rendered copy | Source | PublishDraft(); preview &amp;&amp;; row.sourceUrl &amp;&amp; |
| [src/cloud/PublishPage.tsx:353](../src/cloud/PublishPage.tsx#L353) | Rendered copy | ${row.score ?? '—'} | PublishDraft(); preview &amp;&amp; |
| [src/cloud/PublishPage.tsx:357](../src/cloud/PublishPage.tsx#L357) | Rendered copy | ${preview.listed ? 'This profile will also appear in Community.' : 'This is link-only and will not be listed in Community.'} This preview is frozen; later private edits are not added to it automatically. | PublishDraft(); preview &amp;&amp; |
| [src/cloud/PublishPage.tsx:359](../src/cloud/PublishPage.tsx#L359) | Message/fragment | This profile will also appear in Community. | PublishDraft(); preview &amp;&amp;; preview.listed is true |
| [src/cloud/PublishPage.tsx:360](../src/cloud/PublishPage.tsx#L360) | Message/fragment | This is link-only and will not be listed in Community. | PublishDraft(); preview &amp;&amp;; preview.listed is false |
| [src/cloud/PublishPage.tsx:370](../src/cloud/PublishPage.tsx#L370) | Rendered copy | I want this selected snapshot to be public. | PublishDraft(); preview &amp;&amp; |
| [src/cloud/PublishPage.tsx:373](../src/cloud/PublishPage.tsx#L373) | Live region | ${error} | PublishDraft(); preview &amp;&amp;; error &amp;&amp; |
| [src/cloud/PublishPage.tsx:378](../src/cloud/PublishPage.tsx#L378) | Rendered copy | Keep editing | PublishDraft(); preview &amp;&amp; |
| [src/cloud/PublishPage.tsx:381](../src/cloud/PublishPage.tsx#L381) | Rendered copy | ${busy ? 'Publishing snapshot…' : existing?.published ? 'Update published ranking' : 'Publish this ranking'} | PublishDraft(); preview &amp;&amp; |
| [src/cloud/PublishPage.tsx:389](../src/cloud/PublishPage.tsx#L389) | Message/fragment | Publishing snapshot… | PublishDraft(); preview &amp;&amp;; busy is true |
| [src/cloud/PublishPage.tsx:391](../src/cloud/PublishPage.tsx#L391) | Message/fragment | Update published ranking | PublishDraft(); preview &amp;&amp;; busy is false; existing?.published is true |
| [src/cloud/PublishPage.tsx:392](../src/cloud/PublishPage.tsx#L392) | Message/fragment | Publish this ranking | PublishDraft(); preview &amp;&amp;; busy is false; existing?.published is false |
| [src/cloud/PublishPage.tsx:406](../src/cloud/PublishPage.tsx#L406) | Rendered copy | Unpublish this ranking? | PublishDraft(); confirmUnpublish &amp;&amp; |
| [src/cloud/PublishPage.tsx:407](../src/cloud/PublishPage.tsx#L407) | Rendered copy | New server reads stop, including the Community listing. This cannot recall screenshots or games others already saved. | PublishDraft(); confirmUnpublish &amp;&amp; |
| [src/cloud/PublishPage.tsx:412](../src/cloud/PublishPage.tsx#L412) | Rendered copy | Keep published | PublishDraft(); confirmUnpublish &amp;&amp; |
| [src/cloud/PublishPage.tsx:420](../src/cloud/PublishPage.tsx#L420) | Rendered copy | Unpublish now | PublishDraft(); confirmUnpublish &amp;&amp; |
| [src/cloud/PublishPage.tsx:429](../src/cloud/PublishPage.tsx#L429) | Message output | onlineError(cause) | PublishDraft(); confirmUnpublish &amp;&amp;; onClick |
| [src/cloud/PublishPage.tsx:437](../src/cloud/PublishPage.tsx#L437) | Live region | ${error} | PublishDraft(); confirmUnpublish &amp;&amp;; error &amp;&amp; |
## src/cloud/ShelfArtworkCredits.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/ShelfArtworkCredits.tsx:22](../src/cloud/ShelfArtworkCredits.tsx#L22) | Rendered copy | Artwork credits | ShelfArtworkCredits(); when its owning surface/operation is used |
| [src/cloud/ShelfArtworkCredits.tsx:26](../src/cloud/ShelfArtworkCredits.tsx#L26) | Rendered copy | ${record.title} | ShelfArtworkCredits(); expanded "Artwork credits" disclosure |
## src/cloud/ShelfMetadata.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/ShelfMetadata.tsx:6](../src/cloud/ShelfMetadata.tsx#L6) | Rendered copy | ${entry.year ?? 'Year not listed'} / ${entry.source === 'manual' ? 'Manual addition' : SOURCE_LABELS[entry.source]} | ShelfMetadata(); when its owning surface/operation is used |
| [src/cloud/ShelfMetadata.tsx:7](../src/cloud/ShelfMetadata.tsx#L7) | Message/fragment | Year not listed | ShelfMetadata(); entry.year ?? |
| [src/cloud/ShelfMetadata.tsx:9](../src/cloud/ShelfMetadata.tsx#L9) | Message/fragment | Manual addition | ShelfMetadata(); entry.source === 'manual' is true |
## src/cloud/sign-in-page-title.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/sign-in-page-title.ts:6](../src/cloud/sign-in-page-title.ts#L6) | Message/fragment | Account | titles(); when its owning surface/operation is used |
| [src/cloud/sign-in-page-title.ts:7](../src/cloud/sign-in-page-title.ts#L7) | Message/fragment | Publish ranking | titles(); when its owning surface/operation is used |
| [src/cloud/sign-in-page-title.ts:8](../src/cloud/sign-in-page-title.ts#L8) | Message/fragment | Creator desk | titles(); when its owning surface/operation is used |
| [src/cloud/sign-in-page-title.ts:9](../src/cloud/sign-in-page-title.ts#L9) | Message/fragment | Friends | titles(); when its owning surface/operation is used |
| [src/cloud/sign-in-page-title.ts:10](../src/cloud/sign-in-page-title.ts#L10) | Message/fragment | Friend | titles(); when its owning surface/operation is used |
| [src/cloud/sign-in-page-title.ts:11](../src/cloud/sign-in-page-title.ts#L11) | Message/fragment | Compare rankings | titles(); when its owning surface/operation is used |
| [src/cloud/sign-in-page-title.ts:12](../src/cloud/sign-in-page-title.ts#L12) | Message/fragment | Friend sharing | titles(); when its owning surface/operation is used |
| [src/cloud/sign-in-page-title.ts:13](../src/cloud/sign-in-page-title.ts#L13) | Message/fragment | Shared games | titles(); when its owning surface/operation is used |
| [src/cloud/sign-in-page-title.ts:18](../src/cloud/sign-in-page-title.ts#L18) | Message/fragment | Sign in | signInPageTitle(); titles[page] ?? |
## src/cloud/sign-out-transition.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/sign-out-transition.ts:5](../src/cloud/sign-out-transition.ts#L5) | Message/fragment | This device has unsynced changes. Save or export them before removing its copy. Ordinary Sign out keeps them. | UNSYNCED_DEVICE_COPY(); when its owning surface/operation is used |
| [src/cloud/sign-out-transition.ts:6](../src/cloud/sign-out-transition.ts#L6) | Message/fragment | The signed-in account changed. Nothing was removed. | CHANGED_ACCOUNT(); when its owning surface/operation is used |
| [src/cloud/sign-out-transition.ts:8](../src/cloud/sign-out-transition.ts#L8) | Message/fragment | This device's account copy isn't open, so nothing was removed. Ordinary Sign out keeps it. | UNOPENED_DEVICE_COPY(); when its owning surface/operation is used |
## src/cloud/social-publication.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/social-publication.ts:51](../src/cloud/social-publication.ts#L51) | Error/validation | Publication permissions are unreadable. | parseControl(); Object.keys(value).sort().join() !== 'deleted,epoch,hidden' &#124;&#124; !isSafeInteger(value.epoch) &#124;&#124; value.epoch &lt; 0 &#124;&#124; typeof value.hidden !== 'boolean' &#124;&#124; typeof value.deleted !== 'boolean' is true |
| [src/cloud/social-publication.ts:63](../src/cloud/social-publication.ts#L63) | Error/validation | Some publication settings could not be read. Try again later. | publicationRegistry(); Object.keys(value).sort().join() !== 'ids,revision' &#124;&#124; !isStringArray(value.ids) &#124;&#124; !value.ids.every((id) =&gt; /^[a-f0-9-]{36}$/.test(id)) &#124;&#124; new Set(value.ids).size !== value.ids.length &#124;&#124; !isSafeInteger(value.revision) &#124;&#124; value.revision &lt; 1 is true |
| [src/cloud/social-publication.ts:106](../src/cloud/social-publication.ts#L106) | Error/validation | This ranking changed or is incomplete. Reload it before saving games. | entries(); entries.length !== profile.count &#124;&#124; entries.some((entry, index) =&gt; entry.position !== index + 1) &#124;&#124; new Set(entries.map((entry) =&gt; entry.id)).size !== entries.length is true |
| [src/cloud/social-publication.ts:113](../src/cloud/social-publication.ts#L113) | Error/validation | Search by the start of a handle, using letters, numbers or underscores. | directory(); normalized &amp;&amp; !/^[a-z][a-z0-9_]{0,23}$/.test(normalized) is true |
| [src/cloud/social-publication.ts:147](../src/cloud/social-publication.ts#L147) | Error/validation | Use a name up to 60 characters and a ranking title up to 80. | publish(); !displayName &#124;&#124; displayName.length &gt; 60 &#124;&#124; !title &#124;&#124; title.length &gt; 80 is true |
| [src/cloud/social-publication.ts:153](../src/cloud/social-publication.ts#L153) | Error/validation | Choose 1-200 games; no entries are automatically omitted. | publish(); !input.entries.length &#124;&#124; input.entries.length &gt; PUBLIC_LIMIT is true |
| [src/cloud/social-publication.ts:159](../src/cloud/social-publication.ts#L159) | Error/validation | Review the publication order and remove duplicate games. | publish(); new Set(entries.map((entry) =&gt; entry.id)).size !== entries.length &#124;&#124; entries.some((entry, index) =&gt; entry.position !== index + 1) is true |
| [src/cloud/social-publication.ts:183](../src/cloud/social-publication.ts#L183) | Error/validation | Publication permission changed. Refresh the preview; hidden or deleted profiles cannot publish. | publish(); current.epoch !== expected.epoch &#124;&#124; current.hidden &#124;&#124; current.deleted is true |
| [src/cloud/social-publication.ts:190](../src/cloud/social-publication.ts#L190) | Error/validation | Four publication snapshots are still retained. Wait for cleanup and retry; your published ranking is unchanged. | publish(); quotaSupported is true; value.ids.length &gt;= 4 is true |
| [src/cloud/social-publication.ts:234](../src/cloud/social-publication.ts#L234) | Error/validation | The public ranking changed elsewhere. Your private ranking is safe; refresh the preview before replacing it. | publish(); current.epoch !== expected.epoch &#124;&#124; current.hidden &#124;&#124; current.deleted &#124;&#124; !generation.exists() &#124;&#124; generation.data().epoch !== current.epoch &#124;&#124; generation.data().status !== 'ready' is true |
| [src/cloud/social-publication.ts:266](../src/cloud/social-publication.ts#L266) | Error/validation | That handle is already taken. Choose another one. | publish(); operation rejected or threw |
| [src/cloud/social-publication.ts:293](../src/cloud/social-publication.ts#L293) | Error/validation | This publication changed. Reload before unpublishing. | unpublish(); current.epoch !== expected.epoch is true |
| [src/cloud/social-publication.ts:323](../src/cloud/social-publication.ts#L323) | Error/validation | Use 1-400 characters to describe a problem with another profile. | report(); reporterUid === targetUid is true |
| [src/cloud/social-publication.ts:349](../src/cloud/social-publication.ts#L349) | Error/validation | You already reported this profile. The creator can review your existing report. | report(); report.exists() is true |
| [src/cloud/social-publication.ts:353](../src/cloud/social-publication.ts#L353) | Error/validation | Your report count could not be read. Nothing was sent. | report(); counted is true; !isSafeInteger(value.count) &#124;&#124; value.count &lt; 0 &#124;&#124; !isSafeInteger(value.revision) &#124;&#124; value.revision &lt; 0 is true |
| [src/cloud/social-publication.ts:399](../src/cloud/social-publication.ts#L399) | Error/validation | A report has invalid fields. | reports(); typeof data.reporterUid !== 'string' &#124;&#124; typeof data.targetUid !== 'string' &#124;&#124; typeof data.reason !== 'string' &#124;&#124; data.reason.length &gt; 400 &#124;&#124; (data.status !== 'open' &amp;&amp; data.status !== 'resolved') is true |
| [src/cloud/social-publication.ts:415](../src/cloud/social-publication.ts#L415) | Error/validation | This report is no longer available. | withdrawReport(); !report.exists() is true |
| [src/cloud/social-publication.ts:459](../src/cloud/social-publication.ts#L459) | Error/validation | Some public copies could not be checked. Try again later. | count(); !Number.isInteger(data.count) &#124;&#124; data.count &lt; 1 &#124;&#124; data.count &gt; PUBLIC_LIMIT &#124;&#124; !(data.createdAt instanceof Timestamp) is true |
| [src/cloud/social-publication.ts:496](../src/cloud/social-publication.ts#L496) | Error/validation | Some public copies still need cleanup. Choose Finish deleting to continue. | releaseAbsentPublicIds(); value.ids.length &gt; 4 is true |
| [src/cloud/social-publication.ts:513](../src/cloud/social-publication.ts#L513) | Error/validation | Some older public copies are still stored. Choose Finish deleting to continue. | deleteProfile(); pass === 19 is true |
| [src/cloud/social-publication.ts:518](../src/cloud/social-publication.ts#L518) | Error/validation | Some reports are still stored. Choose Finish deleting to continue. | deleteProfile(); ownReports.size is true; ownReports.size === 20 is true |
| [src/cloud/social-publication.ts:534](../src/cloud/social-publication.ts#L534) | Error/validation | Some public copies still need cleanup. Choose Finish deleting to continue. | deleteProfile(); registry?.exists() is true; publicationRegistry(registry.data()).ids.length is true |
| [src/cloud/social-publication.ts:538](../src/cloud/social-publication.ts#L538) | Error/validation | Some report settings could not be checked. Try again later. | deleteProfile(); usage?.exists() is true; usage.data().count !== 0 is true |
| [src/cloud/social-publication.ts:547](../src/cloud/social-publication.ts#L547) | Error/validation | Some publication settings remain. Choose Finish deleting to continue. | deleteProfile(); publicationsCounted &amp;&amp; (await getDocFromServer(publicRegistry)).exists() is true |
## src/cloud/social-store.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/social-store.ts:13](../src/cloud/social-store.ts#L13) | Error/validation | An online profile has an invalid update time. | timestamp(); !(value instanceof Timestamp) is true |
| [src/cloud/social-store.ts:32](../src/cloud/social-store.ts#L32) | Error/validation | This online member profile has an unsupported format. | parseMember(); Object.keys(value).sort().join() !== 'avatar,consentVersion,createdAt,displayName,gameCount,rankCount,uid,updatedAt' &#124;&#124; typeof value.uid !== 'string' &#124;&#124; typeof value.displayName !== 'string' &#124;&#124; value.displayName.length &lt; 1 &#124;&#124; value.displayName.length &gt; 60 &#124;&#124; value.consentVersion !== 1 &#124;&#124; !isInteger(value.rankCount) &#124;&#124; value.rankCount &lt; 0 &#124;&#124; value.rankCount &gt; 10000 &#124;&#124; !isInteger(value.gameCount) &#124;&#124; value.gameCount &lt; 0 &#124;&#124; value.gameCount &gt; 10000 is true |
| [src/cloud/social-store.ts:72](../src/cloud/social-store.ts#L72) | Error/validation | This published profile contains unsupported fields. | parseProfile(); Object.keys(value).sort().join() !== 'avatar,count,creator,displayName,epoch,generation,handle,hidden,listed,preview,published,title,uid,updatedAt' &#124;&#124; typeof value.uid !== 'string' &#124;&#124; typeof value.handle !== 'string' &#124;&#124; parseHandle(value.handle) !== value.handle &#124;&#124; typeof value.displayName !== 'string' &#124;&#124; value.displayName.length &lt; 1 &#124;&#124; value.displayName.length &gt; 60 &#124;&#124; typeof value.title !== 'string' &#124;&#124; value.title.length &lt; 1 &#124;&#124; value.title.length &gt; 80 &#124;&#124; !isInteger(value.count) &#124;&#124; value.count &lt; 1 &#124;&#124; value.count &gt; PUBLIC_LIMIT &#124;&#124; !isStringArray(value.preview) &#124;&#124; value.preview.length &gt; 3 &#124;&#124; !value.preview.every((title) =&gt; title.length &lt;= 200) &#124;&#124; !isSafeInteger(value.epoch) &#124;&#124; value.epoch &lt; 1 &#124;&#124; typeof value.generation !== 'string' &#124;&#124; !/^[a-f0-9-]{36}$/.test(value.generation) &#124;&#124; typeof value.published !== 'boolean' &#124;&#124; typeof value.listed !== 'boolean' &#124;&#124; typeof value.hidden !== 'boolean' &#124;&#124; typeof value.creator !== 'boolean' is true |
| [src/cloud/social-store.ts:106](../src/cloud/social-store.ts#L106) | Error/validation | The online profile does not match this account. | member(); member &amp;&amp; member.uid !== uid is true |
| [src/cloud/social-store.ts:117](../src/cloud/social-store.ts#L117) | Error/validation | The online profile does not match this account. | watchMember(); member &amp;&amp; member.uid !== uid is true |
| [src/cloud/social-store.ts:120](../src/cloud/social-store.ts#L120) | Error/validation | This account profile is unreadable. | watchMember(); operation rejected or threw; cause instanceof Error is false |
| [src/cloud/social-store.ts:143](../src/cloud/social-store.ts#L143) | Error/validation | Choose a name between 1 and 60 characters. A nickname is welcome. | changeMember(); !displayName &#124;&#124; displayName.length &gt; 60 is true |
| [src/cloud/social-store.ts:208](../src/cloud/social-store.ts#L208) | Message output | reporterUid, targetUid, reason | report(); when its owning surface/operation is used |
## src/cloud/useAccountActions.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/useAccountActions.ts:68](../src/cloud/useAccountActions.ts#L68) | Error/validation | Finish or correct the open edit before connecting. | connect(); !(await flushPendingEdits()) is true |
| [src/cloud/useAccountActions.ts:79](../src/cloud/useAccountActions.ts#L79) | Error/validation | The online library changed since this preview. Review the available copies before connecting. | connect(); headSnapshot?.uid !== user.uid &#124;&#124; (before?.revision ?? 0) !== (head?.revision ?? 0) &#124;&#124; (before?.epoch ?? 0) !== (head?.epoch ?? 0) is true |
| [src/cloud/useAccountActions.ts:84](../src/cloud/useAccountActions.ts#L84) | Error/validation | An online library already exists. Choose it or explicitly choose a replacement; an empty start is not available. | connect(); choice === 'empty' &amp;&amp; before?.current is true |
| [src/cloud/useAccountActions.ts:87](../src/cloud/useAccountActions.ts#L87) | Error/validation | The guest copy changed and is now empty. Review the available starting copies. | connect(); choice === 'guest' &amp;&amp; Object.keys(guest.state.records).length === 0 is true |
| [src/cloud/useAccountActions.ts:89](../src/cloud/useAccountActions.ts#L89) | Error/validation | This account has no previous device copy to use. | connect(); choice === 'cached' &amp;&amp; local.sync.epoch === 0 &amp;&amp; Object.keys(local.state.records).length === 0 is true |
| [src/cloud/useAccountActions.ts:94](../src/cloud/useAccountActions.ts#L94) | Error/validation | This online copy was deleted. Sign out and sign in again before creating a new online copy. | connect(); before?.deleted is true; typeof token.claims.auth_time !== 'number' &#124;&#124; token.claims.auth_time * 1000 &lt;= before.updatedAt is true |
| [src/cloud/useAccountActions.ts:106](../src/cloud/useAccountActions.ts#L106) | Error/validation | There is no complete online copy to adopt. Choose another starting library. | connect(); !chosen is true |
| [src/cloud/useAccountActions.ts:108](../src/cloud/useAccountActions.ts#L108) | Error/validation | The signed-in account changed. No device copy was imported. | connect(); identityRef.current?.uid !== user.uid is true |
| [src/cloud/useAccountActions.ts:123](../src/cloud/useAccountActions.ts#L123) | Message output | 'Online saving enabled.' | connect(); when its owning surface/operation is used |
| [src/cloud/useAccountActions.ts:123](../src/cloud/useAccountActions.ts#L123) | Message/fragment | Online saving enabled. | connect(); when its owning surface/operation is used |
| [src/cloud/useAccountActions.ts:129](../src/cloud/useAccountActions.ts#L129) | Error/validation | Finish or correct the open edit before linking Google. | linkGoogle(); !(await flushPendingEdits()) is true |
| [src/cloud/useAccountActions.ts:132](../src/cloud/useAccountActions.ts#L132) | Error/validation | The account changed. No other account was linked. | linkGoogle(); cloudAuth.currentUser?.uid !== user.uid &#124;&#124; authSessionEpochRef.current !== session is true |
| [src/cloud/useAccountActions.ts:142](../src/cloud/useAccountActions.ts#L142) | Error/validation | Correct the pending edit before signing out. | signOutAccount(); !(await flushPendingEdits()) is true |
| [src/cloud/useAccountActions.ts:145](../src/cloud/useAccountActions.ts#L145) | Error/validation | The signed-in account changed. Review Account before signing out. | signOutAccount(); !user &#124;&#124; !current() is true |
| [src/cloud/useAccountActions.ts:167](../src/cloud/useAccountActions.ts#L167) | Error/validation | Connect before stopping online saving on all devices. Offline edits are retained here. | pause(); !navigator.onLine is true |
| [src/cloud/useAccountActions.ts:177](../src/cloud/useAccountActions.ts#L177) | Message output | "Online saving is stopped. The online copy and this account's copy on this device are kept; your guest library is separate." | pause(); when its owning surface/operation is used |
| [src/cloud/useAccountActions.ts:178](../src/cloud/useAccountActions.ts#L178) | Message/fragment | Online saving is stopped. The online copy and this account's copy on this device are kept; your guest library is separate. | pause(); when its owning surface/operation is used |
| [src/cloud/useAccountActions.ts:183](../src/cloud/useAccountActions.ts#L183) | Error/validation | Correct the pending edit before exporting. | downloadData(); !(await flushPendingEdits()) is true |
| [src/cloud/useAccountActions.ts:188](../src/cloud/useAccountActions.ts#L188) | Error/validation | Sign in before exporting account data. | downloadData(); !scope &#124;&#124; !sync.store &#124;&#124; !identity is true |
| [src/cloud/useAccountActions.ts:198](../src/cloud/useAccountActions.ts#L198) | Error/validation | The account device copy is unavailable. Export the online copy instead. | downloadData(); source === 'local' is true; !local is true |
| [src/cloud/useAccountActions.ts:205](../src/cloud/useAccountActions.ts#L205) | Error/validation | There is no complete online copy to export yet. | downloadData(); source === 'online' is true; !remoteLibrary is true |
| [src/cloud/useAccountActions.ts:217](../src/cloud/useAccountActions.ts#L217) | Error/validation | The account changed before export completed. | downloadData(); cloudAuth.currentUser?.uid !== identity.uid is true |
| [src/cloud/useAccountActions.ts:246](../src/cloud/useAccountActions.ts#L246) | Message output | 'Online account data was exported. The unreadable copy on this device is marked unavailable in the export; it was not replaced or deleted.' | downloadData(); cacheError is true |
| [src/cloud/useAccountActions.ts:247](../src/cloud/useAccountActions.ts#L247) | Message/fragment | Online account data was exported. The unreadable copy on this device is marked unavailable in the export; it was not replaced or deleted. | downloadData(); cacheError is true |
| [src/cloud/useAccountActions.ts:256](../src/cloud/useAccountActions.ts#L256) | Message output | 'Eligible old snapshots were cleaned. Current and previous private copies remain intact.' | cleanup(); when its owning surface/operation is used |
| [src/cloud/useAccountActions.ts:256](../src/cloud/useAccountActions.ts#L256) | Message/fragment | Eligible old snapshots were cleaned. Current and previous private copies remain intact. | cleanup(); when its owning surface/operation is used |
## src/cloud/useAccountPage.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/useAccountPage.ts:25](../src/cloud/useAccountPage.ts#L25) | Message/fragment | Player | currentName(); member?.displayName &#124;&#124; cache?.profile?.displayName &#124;&#124; identity.displayName &#124;&#124; |
| [src/cloud/useAccountPage.ts:46](../src/cloud/useAccountPage.ts#L46) | Message/fragment | Online library | useAccountPage(); head?.current is true |
| [src/cloud/useAccountPage.ts:49](../src/cloud/useAccountPage.ts#L49) | Message/fragment | Existing saved copy | useAccountPage(); head?.current is true; member is false |
| [src/cloud/useAccountPage.ts:54](../src/cloud/useAccountPage.ts#L54) | Message/fragment | Device-only library | useAccountPage(); guestGames is true |
| [src/cloud/useAccountPage.ts:60](../src/cloud/useAccountPage.ts#L60) | Message/fragment | Account copy on this device | useAccountPage(); localGames &#124;&#124; (cache?.sync.epoch ?? 0) &gt; 0 is true |
| [src/cloud/useAccountPage.ts:64](../src/cloud/useAccountPage.ts#L64) | Message/fragment | Empty library | useAccountPage(); remoteReady &amp;&amp; !head?.current is true |
| [src/cloud/useAccountPage.ts:64](../src/cloud/useAccountPage.ts#L64) | Message/fragment | No device games uploaded | useAccountPage(); remoteReady &amp;&amp; !head?.current is true |
| [src/cloud/useAccountPage.ts:80](../src/cloud/useAccountPage.ts#L80) | Message output | problem | validName(); when its owning surface/operation is used |
## src/cloud/useCloudSync.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/useCloudSync.ts:71](../src/cloud/useCloudSync.ts#L71) | Error/validation | The online copy is not visible to this tab yet. | staleHeadRead(); when its owning surface/operation is used |
| [src/cloud/useCloudSync.ts:127](../src/cloud/useCloudSync.ts#L127) | Message output | enabled ? 'loading' : scope ? 'paused' : 'device' | useCloudSync(); started !== lifetime is true |
| [src/cloud/useCloudSync.ts:159](../src/cloud/useCloudSync.ts#L159) | Message/fragment | SyncSessionEnded | failed(); cause instanceof Error &amp;&amp; |
| [src/cloud/useCloudSync.ts:160](../src/cloud/useCloudSync.ts#L160) | Message output | navigator.onLine ? 'pending' : 'offline' | failed(); cause instanceof Error &amp;&amp; cause.name === 'SyncSessionEnded' is true |
| [src/cloud/useCloudSync.ts:170](../src/cloud/useCloudSync.ts#L170) | Message output | 'conflict' | failed(); cause instanceof RemoteConflict &#124;&#124; (cause instanceof Error &amp;&amp; cause.name === 'PersonalLibraryConflictError') is true |
| [src/cloud/useCloudSync.ts:179](../src/cloud/useCloudSync.ts#L179) | Message output | 'paused' | failed(); cause instanceof RemoteConflict &#124;&#124; (cause instanceof Error &amp;&amp; cause.name === 'PersonalLibraryConflictError') is false; cause instanceof SyncRevoked is true |
| [src/cloud/useCloudSync.ts:182](../src/cloud/useCloudSync.ts#L182) | Message output | onlineError(failure) | failed(); cause instanceof RemoteConflict &#124;&#124; (cause instanceof Error &amp;&amp; cause.name === 'PersonalLibraryConflictError') is false; cause instanceof SyncRevoked is true; writer is true; owns() is true |
| [src/cloud/useCloudSync.ts:191](../src/cloud/useCloudSync.ts#L191) | Message output | !navigator.onLine ? 'offline' : block === 'transient' ? 'retrying' : block === 'quota' ? 'quota' : 'error' | failed(); cause instanceof RemoteConflict &#124;&#124; (cause instanceof Error &amp;&amp; cause.name === 'PersonalLibraryConflictError') is false; cause instanceof SyncRevoked is false |
| [src/cloud/useCloudSync.ts:195](../src/cloud/useCloudSync.ts#L195) | Message output | &#96;${onlineError(cause)}${lifetime.block === 'transient' ? ' Retrying automatically while this page is visible and connected.' : lifetime.block === 'quota' ? ' Retrying automatically at longer intervals while this page is visible and connected.' : ''}&#96; | failed(); when its owning surface/operation is used |
| [src/cloud/useCloudSync.ts:196](../src/cloud/useCloudSync.ts#L196) | Message/fragment | ${onlineError(cause)}${lifetime.block === 'transient' ? ' Retrying automatically while this page is visible and connected.' : lifetime.block === 'quota' ? ' Retrying automatically at longer intervals while this page is visible and connected.' : ''} | failed(); when its owning surface/operation is used |
| [src/cloud/useCloudSync.ts:205](../src/cloud/useCloudSync.ts#L205) | Message output | navigator.onLine ? (lifetime.block === 'quota' ? 'quota' : 'retrying') : 'offline' | succeeded(); enabled &amp;&amp; !lifetime.watchAlive &amp;&amp; (lifetime.block === 'transient' &#124;&#124; lifetime.block === 'quota') is true |
| [src/cloud/useCloudSync.ts:211](../src/cloud/useCloudSync.ts#L211) | Message output | next | succeeded(); when its owning surface/operation is used |
| [src/cloud/useCloudSync.ts:231](../src/cloud/useCloudSync.ts#L231) | Message output | 'paused' | receive(); !local.sync.enabled is true |
| [src/cloud/useCloudSync.ts:252](../src/cloud/useCloudSync.ts#L252) | Error/validation | The newer online copy has no saved library. Your local copy is retained. | receive(); head.revision &gt; local.sync.baseRemoteRevision is true; local.sync.dirty is false; !incoming is true |
| [src/cloud/useCloudSync.ts:267](../src/cloud/useCloudSync.ts#L267) | Message output | navigator.onLine ? (lifetime.block === 'quota' ? 'quota' : 'retrying') : 'offline' | receive(); !local.sync.dirty &amp;&amp; !hasPendingEdits() is false; lifetime.block === 'transient' &#124;&#124; lifetime.block === 'quota' is true |
| [src/cloud/useCloudSync.ts:269](../src/cloud/useCloudSync.ts#L269) | Message output | navigator.onLine ? 'pending' : 'offline' | receive(); !local.sync.dirty &amp;&amp; !hasPendingEdits() is false; lifetime.block === 'transient' &#124;&#124; lifetime.block === 'quota' is false |
| [src/cloud/useCloudSync.ts:284](../src/cloud/useCloudSync.ts#L284) | Message output | 'offline' | sync(); !navigator.onLine is true |
| [src/cloud/useCloudSync.ts:320](../src/cloud/useCloudSync.ts#L320) | Message output | 'saving' | sync(); when its owning surface/operation is used |
| [src/cloud/useCloudSync.ts:348](../src/cloud/useCloudSync.ts#L348) | Message/fragment | The library is saved, but removing older saved copies needs a retry. ${onlineError(cleanupError)} | sync(); operation rejected or threw; owns() is true |
| [src/cloud/useCloudSync.ts:394](../src/cloud/useCloudSync.ts#L394) | Message output | 'offline' | observe(); !available is true; !navigator.onLine &amp;&amp; (enabled &#124;&#124; initialProbe) is true |
| [src/cloud/useCloudSync.ts:447](../src/cloud/useCloudSync.ts#L447) | Error/validation | Sign in before resolving a cloud conflict. | useRemote(); !store &#124;&#124; !writer &#124;&#124; !owns() is true |
| [src/cloud/useCloudSync.ts:456](../src/cloud/useCloudSync.ts#L456) | Error/validation | The online copy changed again. Review the fresh versions before choosing. | useRemote(); !latest &#124;&#124; latest.revision !== expected.revision &#124;&#124; latest.epoch !== expected.epoch &#124;&#124; !latest.enabled &#124;&#124; latest.deleted is true |
| [src/cloud/useCloudSync.ts:458](../src/cloud/useCloudSync.ts#L458) | Error/validation | There is no complete online copy to use. | useRemote(); !state is true |
| [src/cloud/useCloudSync.ts:472](../src/cloud/useCloudSync.ts#L472) | Error/validation | Sign in before resolving a cloud conflict. | useLocal(); !store &#124;&#124; !writer &#124;&#124; !owns() is true |
| [src/cloud/useCloudSync.ts:481](../src/cloud/useCloudSync.ts#L481) | Error/validation | Online saving changed. Review the current state before replacing anything. | useLocal(); !latest &#124;&#124; latest.revision !== expected.revision &#124;&#124; latest.epoch !== expected.epoch &#124;&#124; !latest.enabled &#124;&#124; latest.deleted is true |
| [src/cloud/useCloudSync.ts:496](../src/cloud/useCloudSync.ts#L496) | Error/validation | Review the available copies or reconnect explicitly before resuming online saving. | retry(); lifetime.block === 'conflict' &#124;&#124; lifetime.block === 'revoked' is true |
| [src/cloud/useCloudSync.ts:499](../src/cloud/useCloudSync.ts#L499) | Message output | 'offline' | retry(); !navigator.onLine is true |
| [src/cloud/useCloudSync.ts:509](../src/cloud/useCloudSync.ts#L509) | Message output | 'paused' | suspend(); when its owning surface/operation is used |
| [src/cloud/useCloudSync.ts:515](../src/cloud/useCloudSync.ts#L515) | Message output | (value) =&gt; (value === 'paused' ? prior.status : value) | suspend(); when its owning surface/operation is used |
## src/cloud/useFriendAll.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/useFriendAll.ts:330](../src/cloud/useFriendAll.ts#L330) | Message/fragment | The next sharing retry time could not be saved. ${onlineError(storageError)} | work(); failure === 'quota' &amp;&amp; opened is true; alive &amp;&amp; owns() is true; old?.key === key is true |
| [src/cloud/useFriendAll.ts:413](../src/cloud/useFriendAll.ts#L413) | Error/validation | Wait for the current account before changing sharing. | change(); !uid &#124;&#124; !owns() &#124;&#124; changing.current is true |
| [src/cloud/useFriendAll.ts:433](../src/cloud/useFriendAll.ts#L433) | Error/validation | Wait for the current account before refreshing sharing. | refresh(); !uid &#124;&#124; !owns() is true |
## src/cloud/useFriendSharedView.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/useFriendSharedView.ts:84](../src/cloud/useFriendSharedView.ts#L84) | Message/fragment | Sharing is no longer available. | controlsOff(); cause is false |
| [src/cloud/useFriendSharedView.ts:258](../src/cloud/useFriendSharedView.ts#L258) | Error/validation | The shared list changed. Refresh it. | useFriendSharedView(); new Set(entries.map((entry) =&gt; entry.id)).size !== entries.length &#124;&#124; entries.length &gt; result.head.count is true |
## src/cloud/useFriendSharing.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/useFriendSharing.ts:74](../src/cloud/useFriendSharing.ts#L74) | Message output | 'error' | acceptSettings(); next &amp;&amp; local &amp;&amp; local.scope === current.current.scope is true; current.current.uid === owner is true |
| [src/cloud/useFriendSharing.ts:93](../src/cloud/useFriendSharing.ts#L93) | Message output | 'error' | useFriendSharing(); current.current.uid === uid is true |
| [src/cloud/useFriendSharing.ts:105](../src/cloud/useFriendSharing.ts#L105) | Message output | 'error' | failed(); alive &amp;&amp; cloudAuth.currentUser?.uid === uid is true |
| [src/cloud/useFriendSharing.ts:214](../src/cloud/useFriendSharing.ts#L214) | Message output | 'saved' | retry(); fingerprint === signature &amp;&amp; !retry.reason is true |
| [src/cloud/useFriendSharing.ts:234](../src/cloud/useFriendSharing.ts#L234) | Message output | 'saved' | retry(); fingerprint === &#96;${control.epoch}:${control.revision}:${JSON.stringify(projected.entries)}&#96; is true |
| [src/cloud/useFriendSharing.ts:237](../src/cloud/useFriendSharing.ts#L237) | Message output | 'saving' | retry(); when its owning surface/operation is used |
| [src/cloud/useFriendSharing.ts:259](../src/cloud/useFriendSharing.ts#L259) | Message output | 'saved' | retry(); when its owning surface/operation is used |
| [src/cloud/useFriendSharing.ts:267](../src/cloud/useFriendSharing.ts#L267) | Message output | committed.receipt.operation === 'publish-ranking' ? 'saved' : 'pending' | retry(); committed is true |
| [src/cloud/useFriendSharing.ts:273](../src/cloud/useFriendSharing.ts#L273) | Message output | kind === 'transient' ? 'retrying' : kind === 'quota' ? 'quota' : 'error' | retry(); when its owning surface/operation is used |
| [src/cloud/useFriendSharing.ts:276](../src/cloud/useFriendSharing.ts#L276) | Message/fragment | ${onlineError(cause)}${kind === 'blocked' ? '' : ' Friend sharing will retry automatically.'} | retry(); when its owning surface/operation is used |
| [src/cloud/useFriendSharing.ts:361](../src/cloud/useFriendSharing.ts#L361) | Message output | 'paused' | useFriendSharing(); when its owning surface/operation is used |
| [src/cloud/useFriendSharing.ts:372](../src/cloud/useFriendSharing.ts#L372) | Message output | (value) =&gt; (value === 'paused' ? prior : value) | useFriendSharing(); when its owning surface/operation is used |
## src/cloud/useFriendShelf.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/useFriendShelf.ts:130](../src/cloud/useFriendShelf.ts#L130) | Error/validation | Sharing is still on. Choose Stop sharing again to confirm the stop. | recover(); pending?.cleanup === 'stop' &amp;&amp; fresh?.enabled is true |
| [src/cloud/useFriendShelf.ts:146](../src/cloud/useFriendShelf.ts#L146) | Message output | 'error' | failed(); when its owning surface/operation is used |
| [src/cloud/useFriendShelf.ts:190](../src/cloud/useFriendShelf.ts#L190) | Message output | 'error' | useFriendShelf(); owns() is true |
| [src/cloud/useFriendShelf.ts:249](../src/cloud/useFriendShelf.ts#L249) | Message output | 'saved' | work(); signature === fingerprint is true |
| [src/cloud/useFriendShelf.ts:261](../src/cloud/useFriendShelf.ts#L261) | Message output | 'saving' | work(); when its owning surface/operation is used |
| [src/cloud/useFriendShelf.ts:274](../src/cloud/useFriendShelf.ts#L274) | Message output | 'saved' | work(); when its owning surface/operation is used |
| [src/cloud/useFriendShelf.ts:283](../src/cloud/useFriendShelf.ts#L283) | Message output | acknowledged ? 'saved' : kind === 'transient' ? 'retrying' : kind === 'quota' ? 'quota' : 'error' | work(); when its owning surface/operation is used |
| [src/cloud/useFriendShelf.ts:343](../src/cloud/useFriendShelf.ts#L343) | Message output | 'paused' | stop(); when its owning surface/operation is used |
| [src/cloud/useFriendShelf.ts:347](../src/cloud/useFriendShelf.ts#L347) | Message output | (value) =&gt; (value === 'paused' ? prior : value) | stop(); when its owning surface/operation is used |
| [src/cloud/useFriendShelf.ts:353](../src/cloud/useFriendShelf.ts#L353) | Error/validation | Refresh shared games before saving this selection. | saveSelection(); !owns() &#124;&#124; !uid &#124;&#124; !scope &#124;&#124; recovery.current?.key === key &#124;&#124; hasPendingEdits() is true |
| [src/cloud/useFriendShelf.ts:356](../src/cloud/useFriendShelf.ts#L356) | Error/validation | Your library changed or is still saving. Preview the saved games again. | saveSelection(); !owns() &#124;&#124; local.state.revision !== reviewedStateRevision &#124;&#124; !local.sync.enabled &#124;&#124; local.sync.dirty is true |
| [src/cloud/useFriendShelf.ts:359](../src/cloud/useFriendShelf.ts#L359) | Error/validation | A selected game was removed. Preview the selection again. | saveSelection(); projected.selectedIds.length !== ids.length is true |
| [src/cloud/useFriendShelf.ts:372](../src/cloud/useFriendShelf.ts#L372) | Error/validation | This selection was superseded. Review the current shelf. | saveSelection(); !mutationCurrent() is true |
| [src/cloud/useFriendShelf.ts:398](../src/cloud/useFriendShelf.ts#L398) | Message/fragment | The selection could not be confirmed. Refresh before trying again. | saveSelection(); operation rejected or threw; mutationCurrent() is true; cause instanceof FriendShelfCommittedError is false |
| [src/cloud/useFriendShelf.ts:408](../src/cloud/useFriendShelf.ts#L408) | Error/validation | Sign in to the shelf owner account before stopping sharing. | stopSharing(); !owns() &#124;&#124; !uid is true |
| [src/cloud/useFriendShelf.ts:415](../src/cloud/useFriendShelf.ts#L415) | Error/validation | The account changed before sharing could stop. | stopSharing(); !mutationCurrent() is true |
| [src/cloud/useFriendShelf.ts:430](../src/cloud/useFriendShelf.ts#L430) | Message/fragment | Sharing stop needs confirmation. Refresh to check its current status. | stopSharing(); operation rejected or threw; mutationCurrent() is true |
## src/cloud/useFriendShelfRead.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/useFriendShelfRead.ts:91](../src/cloud/useFriendShelfRead.ts#L91) | Message output | cause | attach(); valid() &amp;&amp; request === serial &amp;&amp; access.permits(lease) is true |
## src/cloud/useOnlineAccount.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/useOnlineAccount.ts:85](../src/cloud/useOnlineAccount.ts#L85) | Message output | onlineError(cause) | useOnlineAccount(); uid is true; current &amp;&amp; cloudAuth.currentUser?.uid === uid is true |
| [src/cloud/useOnlineAccount.ts:115](../src/cloud/useOnlineAccount.ts#L115) | Error/validation | The online copy is incomplete. Choose a copy or try again. | restoreInitial(); !incoming is true |
| [src/cloud/useOnlineAccount.ts:127](../src/cloud/useOnlineAccount.ts#L127) | Error/validation | The online copy changed during restoration. Checking again automatically. | restoreInitial(); !fresh?.enabled &#124;&#124; fresh.deleted &#124;&#124; fresh.epoch !== savedHead.epoch &#124;&#124; fresh.revision !== savedHead.revision &#124;&#124; fresh.current?.digest !== savedHead.current.digest is true |
| [src/cloud/useOnlineAccount.ts:133](../src/cloud/useOnlineAccount.ts#L133) | Message output | 'Online library restored.' | restoreInitial(); isCurrent() is true |
| [src/cloud/useOnlineAccount.ts:133](../src/cloud/useOnlineAccount.ts#L133) | Message/fragment | Online library restored. | restoreInitial(); isCurrent() is true |
| [src/cloud/useOnlineAccount.ts:190](../src/cloud/useOnlineAccount.ts#L190) | Message output | &#96;Online profile loaded, but its copy on this device could not update. ${onlineError(cause)}&#96; | refresh(); nextMember &amp;&amp; cacheWriter &amp;&amp; cacheReady.current &amp;&amp; version === memberReadVersion.current is true; operation rejected or threw; identityRef.current?.uid === user.uid is true |
| [src/cloud/useOnlineAccount.ts:190](../src/cloud/useOnlineAccount.ts#L190) | Message/fragment | Online profile loaded, but its copy on this device could not update. ${onlineError(cause)} | refresh(); nextMember &amp;&amp; cacheWriter &amp;&amp; cacheReady.current &amp;&amp; version === memberReadVersion.current is true; operation rejected or threw; identityRef.current?.uid === user.uid is true |
| [src/cloud/useOnlineAccount.ts:204](../src/cloud/useOnlineAccount.ts#L204) | Message output | onlineError(cause) | useOnlineAccount(); syncFailure(cause) !== 'blocked' is false |
| [src/cloud/useOnlineAccount.ts:267](../src/cloud/useOnlineAccount.ts#L267) | Message output | &#96;Your online profile loaded, but its copy on this device could not update. ${onlineError(cause)}&#96; | unsubscribe(); alive &amp;&amp; cloudAuth.currentUser?.uid === uid is true |
| [src/cloud/useOnlineAccount.ts:268](../src/cloud/useOnlineAccount.ts#L268) | Message/fragment | Your online profile loaded, but its copy on this device could not update. ${onlineError(cause)} | unsubscribe(); alive &amp;&amp; cloudAuth.currentUser?.uid === uid is true |
| [src/cloud/useOnlineAccount.ts:303](../src/cloud/useOnlineAccount.ts#L303) | Error/validation | Verify this account and wait for its device copy to open before continuing. | verifiedIdentity(); !user &#124;&#124; !identityRef.current?.verified &#124;&#124; !scope &#124;&#124; !sync.store &#124;&#124; !account.snapshot &#124;&#124; user.uid !== identityRef.current?.uid is true |
## src/cloud/useOnlineFriends.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/useOnlineFriends.ts:71](../src/cloud/useOnlineFriends.ts#L71) | Message output | &#96;Friend profile update pending. ${onlineError(cause)}&#96; | useOnlineFriends(); alive &amp;&amp; cloudAuth.currentUser?.uid === uid is true |
| [src/cloud/useOnlineFriends.ts:71](../src/cloud/useOnlineFriends.ts#L71) | Message/fragment | Friend profile update pending. ${onlineError(cause)} | useOnlineFriends(); alive &amp;&amp; cloudAuth.currentUser?.uid === uid is true |
| [src/cloud/useOnlineFriends.ts:95](../src/cloud/useOnlineFriends.ts#L95) | Error/validation | The account changed. Preview these games again. | prepareShelf(); cloudAuth.currentUser?.uid !== owner.uid &#124;&#124; authSessionEpochRef.current !== session is true |
| [src/cloud/useOnlineFriends.ts:99](../src/cloud/useOnlineFriends.ts#L99) | Error/validation | The account changed. Preview these games again. | prepareShelf(); cloudAuth.currentUser?.uid !== owner.uid &#124;&#124; authSessionEpochRef.current !== session is true |
## src/cloud/useOnlinePublication.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/useOnlinePublication.ts:66](../src/cloud/useOnlinePublication.ts#L66) | Message/fragment | Player | headerIdentity(); identity is true; member?.displayName &#124;&#124; cachedProfile?.displayName &#124;&#124; identity.displayName &#124;&#124; |
| [src/cloud/useOnlinePublication.ts:78](../src/cloud/useOnlinePublication.ts#L78) | Message output | 'Name saved.' | saveName(); when its owning surface/operation is used |
| [src/cloud/useOnlinePublication.ts:78](../src/cloud/useOnlinePublication.ts#L78) | Message/fragment | Name saved. | saveName(); when its owning surface/operation is used |
| [src/cloud/useOnlinePublication.ts:83](../src/cloud/useOnlinePublication.ts#L83) | Message output | &#96;Name saved. Reconnect to refresh the profile. ${onlineError(cause)}&#96; | saveName(); operation rejected or threw; cloudAuth.currentUser?.uid === user.uid is true |
| [src/cloud/useOnlinePublication.ts:83](../src/cloud/useOnlinePublication.ts#L83) | Message/fragment | Name saved. Reconnect to refresh the profile. ${onlineError(cause)} | saveName(); operation rejected or threw; cloudAuth.currentUser?.uid === user.uid is true |
| [src/cloud/useOnlinePublication.ts:98](../src/cloud/useOnlinePublication.ts#L98) | Error/validation | The account changed. Your new account was not modified. | saved(); cloudAuth.currentUser?.uid !== uid &#124;&#124; !identityRef.current?.verified &#124;&#124; currentEpoch.current !== epoch &#124;&#124; authSessionEpochRef.current !== sessionEpoch is true |
| [src/cloud/useOnlinePublication.ts:99](../src/cloud/useOnlinePublication.ts#L99) | Message/fragment | Player | saved(); member?.displayName &#124;&#124; owner.displayName &#124;&#124; |
| [src/cloud/useOnlinePublication.ts:111](../src/cloud/useOnlinePublication.ts#L111) | Message output | &#96;Icon saved. Reconnect to refresh the profile. ${onlineError(cause)}&#96; | saved(); identityRef.current?.uid === uid &amp;&amp; currentEpoch.current === epoch &amp;&amp; authSessionEpochRef.current === sessionEpoch is true; operation rejected or threw; cloudAuth.currentUser?.uid === uid is true |
| [src/cloud/useOnlinePublication.ts:111](../src/cloud/useOnlinePublication.ts#L111) | Message/fragment | Icon saved. Reconnect to refresh the profile. ${onlineError(cause)} | saved(); identityRef.current?.uid === uid &amp;&amp; currentEpoch.current === epoch &amp;&amp; authSessionEpochRef.current === sessionEpoch is true; operation rejected or threw; cloudAuth.currentUser?.uid === uid is true |
| [src/cloud/useOnlinePublication.ts:115](../src/cloud/useOnlinePublication.ts#L115) | Error/validation | The creature could not be saved. Your previous choice is unchanged. | saveAvatar(); !saved is true |
## src/cloud/useOnlineSession.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/useOnlineSession.ts:154](../src/cloud/useOnlineSession.ts#L154) | Message output | onlineError(cause) | useOnlineSession(); when its owning surface/operation is used |
| [src/cloud/useOnlineSession.ts:158](../src/cloud/useOnlineSession.ts#L158) | Message output | onlineError(cause) | useOnlineSession(); when its owning surface/operation is used |
| [src/cloud/useOnlineSession.ts:187](../src/cloud/useOnlineSession.ts#L187) | Message output | committedFriendMessage(committed) | run(); operation rejected or threw; identityChange &#124;&#124; identityRef.current?.uid === startedUid is true; committed is true |
| [src/cloud/useOnlineSession.ts:188](../src/cloud/useOnlineSession.ts#L188) | Message output | 'The remaining steps have not finished. Refresh before continuing this action.' | run(); operation rejected or threw; identityChange &#124;&#124; identityRef.current?.uid === startedUid is true; committed is true |
| [src/cloud/useOnlineSession.ts:188](../src/cloud/useOnlineSession.ts#L188) | Message/fragment | The remaining steps have not finished. Refresh before continuing this action. | run(); operation rejected or threw; identityChange &#124;&#124; identityRef.current?.uid === startedUid is true; committed is true |
| [src/cloud/useOnlineSession.ts:189](../src/cloud/useOnlineSession.ts#L189) | Message output | onlineError(cause) | run(); operation rejected or threw; identityChange &#124;&#124; identityRef.current?.uid === startedUid is true; committed is false; !popupCancelled(cause) is true |
| [src/cloud/useOnlineSession.ts:214](../src/cloud/useOnlineSession.ts#L214) | Error/validation | Finish or correct the open rating or note before signing in. | google(); !(await flushPendingEdits()) is true |
| [src/cloud/useOnlineSession.ts:216](../src/cloud/useOnlineSession.ts#L216) | Error/validation | The signed-in account changed. Review Account before continuing. | google(); authSessionEpochRef.current !== session &#124;&#124; cloudAuth.currentUser is true |
| [src/cloud/useOnlineSession.ts:229](../src/cloud/useOnlineSession.ts#L229) | Error/validation | Finish or correct the open edit before signing in. | email(); !(await flushPendingEdits()) is true |
| [src/cloud/useOnlineSession.ts:238](../src/cloud/useOnlineSession.ts#L238) | Error/validation | Sign in before requesting verification. | sendVerification(); !user is true |
| [src/cloud/useOnlineSession.ts:241](../src/cloud/useOnlineSession.ts#L241) | Message output | next.verified ? 'Your email is verified. You can continue with this account.' : 'The signed-in session could not yet confirm verification. Use I verified my email to retry.' | sendVerification(); user.emailVerified is true |
| [src/cloud/useOnlineSession.ts:243](../src/cloud/useOnlineSession.ts#L243) | Message/fragment | Your email is verified. You can continue with this account. | sendVerification(); user.emailVerified is true; next.verified is true |
| [src/cloud/useOnlineSession.ts:244](../src/cloud/useOnlineSession.ts#L244) | Message/fragment | The signed-in session could not yet confirm verification. Use I verified my email to retry. | sendVerification(); user.emailVerified is true; next.verified is false |
| [src/cloud/useOnlineSession.ts:248](../src/cloud/useOnlineSession.ts#L248) | Error/validation | Wait for the resend countdown before requesting another email. | sendVerification(); Date.now() &lt; cooldown is true |
| [src/cloud/useOnlineSession.ts:252](../src/cloud/useOnlineSession.ts#L252) | Message output | 'Verification email requested. Check your inbox and spam folder, then return here.' | sendVerification(); when its owning surface/operation is used |
| [src/cloud/useOnlineSession.ts:252](../src/cloud/useOnlineSession.ts#L252) | Message/fragment | Verification email requested. Check your inbox and spam folder, then return here. | sendVerification(); when its owning surface/operation is used |
| [src/cloud/useOnlineSession.ts:256](../src/cloud/useOnlineSession.ts#L256) | Error/validation | Enter your email before requesting a reset. | resetEmail(); !address is true |
| [src/cloud/useOnlineSession.ts:257](../src/cloud/useOnlineSession.ts#L257) | Error/validation | Wait a minute before requesting another email. | resetEmail(); Date.now() &lt; cooldown is true |
| [src/cloud/useOnlineSession.ts:261](../src/cloud/useOnlineSession.ts#L261) | Message output | 'If this account can receive password reset emails, one has been requested. Check your inbox and spam folder.' | resetEmail(); when its owning surface/operation is used |
| [src/cloud/useOnlineSession.ts:262](../src/cloud/useOnlineSession.ts#L262) | Message/fragment | If this account can receive password reset emails, one has been requested. Check your inbox and spam folder. | resetEmail(); when its owning surface/operation is used |
| [src/cloud/useOnlineSession.ts:272](../src/cloud/useOnlineSession.ts#L272) | Message output | next.verified ? 'Email verified. You can choose online saving or publishing.' : 'Verification is not confirmed yet. Open the latest email link, then try again.' | refreshIdentity(); when its owning surface/operation is used |
| [src/cloud/useOnlineSession.ts:274](../src/cloud/useOnlineSession.ts#L274) | Message/fragment | Email verified. You can choose online saving or publishing. | refreshIdentity(); next.verified is true |
| [src/cloud/useOnlineSession.ts:275](../src/cloud/useOnlineSession.ts#L275) | Message/fragment | Verification is not confirmed yet. Open the latest email link, then try again. | refreshIdentity(); next.verified is false |
## src/cloud/useOnlineSharing.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/cloud/useOnlineSharing.tsx:84](../src/cloud/useOnlineSharing.tsx#L84) | Label/help | {automatic.error} | automaticSummary(); signedIn is true |
## src/components/AboutDialog.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/AboutDialog.tsx:25](../src/components/AboutDialog.tsx#L25) | Rendered copy | About &amp; credits | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:28](../src/components/AboutDialog.tsx#L28) | Rendered copy | This is a personal collection of 100 games, not an official ranking. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:29](../src/components/AboutDialog.tsx#L29) | Label/help | Collection author | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:33](../src/components/AboutDialog.tsx#L33) | Rendered copy | Original order | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:34](../src/components/AboutDialog.tsx#L34) | Rendered copy | The Core 50 are ranks 1–50; the Essential 50 are ranks 51–100. Both follow the workbook's main sheet, including its manual changes. Sorting changes only the order shown; each game keeps its original rank. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:35](../src/components/AboutDialog.tsx#L35) | Rendered copy | Core 50 | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:35](../src/components/AboutDialog.tsx#L35) | Rendered copy | Essential 50 | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:41](../src/components/AboutDialog.tsx#L41) | Rendered copy | ${author.shortName}'s ratings | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:42](../src/components/AboutDialog.tsx#L42) | Rendered copy | ${author.fullName}'s rank-based scores come from the workbook column "my rating(based on rank)". Cards, tables and details preserve its saved numbers, rounding and text, without recalculation. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:46](../src/components/AboutDialog.tsx#L46) | Rendered copy | For example, The Witcher 3's original rating is 9.9, and Grand Theft Auto IV's is 9.8. Source notes stay attached. Your editable ratings are separate and never prefilled from these scores. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:52](../src/components/AboutDialog.tsx#L52) | Rendered copy | Critic scores | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:53](../src/components/AboutDialog.tsx#L53) | Rendered copy | Workbook critic scores are not live, newly researched or independently verified. Metacritic and PC Gamer use 100-point scales; IGN and GameSpot use 10. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:57](../src/components/AboutDialog.tsx#L57) | Rendered copy | Critic averages use entered scores converted to 100. Both Metacritic columns count; missing scores don't. This isn't an official aggregate or count of independent publications. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:63](../src/components/AboutDialog.tsx#L63) | Rendered copy | Source notes &amp; artwork | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:64](../src/components/AboutDialog.tsx#L64) | Rendered copy | Details preserve source notes about AI or games not played. A missing note doesn't mean the game was played. Your personal list starts empty. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:68](../src/components/AboutDialog.tsx#L68) | Rendered copy | The source excludes Nintendo but keeps premium non-AAA exceptions. No platforms, playtimes or scores have been invented. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:72](../src/components/AboutDialog.tsx#L72) | Rendered copy | Supplied cover thumbnails stay at native size in collection frames. Rank 73 keeps "Hitman: World of Assassination", the year 2016 and its HITMAN III-branded cover. That packaging does not identify an exact edition or platform. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:79](../src/components/AboutDialog.tsx#L79) | Rendered copy | Data &amp; privacy | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:80](../src/components/AboutDialog.tsx#L80) | Rendered copy | Guest games, progress, ratings and notes stay in browser storage. Optional Google or verified email accounts use Firebase Authentication and Firestore at no cost. Each account has a separate device copy. Sign-in never uploads guest data automatically; online saving needs separate consent. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:85](../src/components/AboutDialog.tsx#L85) | Rendered copy | Online-saving consent lets the creator view your profile and ranking summary, not notes or Play later. Database operators can access stored data. No analytics scripts, ad trackers, anonymous accounts or remote avatar services are used. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:90](../src/components/AboutDialog.tsx#L90) | Rendered copy | Rankings can include unplayed games; ranking never marks them played or completed. Publishing shares only the previewed profile and selected ratings, not email, notes or play history. Community listing needs separate consent. Link-only rankings are public to anyone with the link. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:95](../src/components/AboutDialog.tsx#L95) | Rendered copy | Settings lets you export or import backups and request protection from automatic storage cleanup. Clearing site data can erase edits not yet uploaded. Service limits can pause online saving; errors and conflicts never silently replace device copies. In Account, you can sign out, stop online saving, export or delete data. Small records with no library content remain so that old sessions can't bring deleted data back. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:103](../src/components/AboutDialog.tsx#L103) | Rendered copy | Public catalogs | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:104](../src/components/AboutDialog.tsx#L104) | Rendered copy | Discover includes a built-in catalog and optional online facts from Wikidata (CC0) and the documented FreeToGame API. FreeToGame data retains credit and source links. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:108](../src/components/AboutDialog.tsx#L108) | Label/help | Public catalog sources | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:109](../src/components/AboutDialog.tsx#L109) | Rendered copy | Wikidata (CC0) | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:118](../src/components/AboutDialog.tsx#L118) | Rendered copy | FreeToGame API | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:122](../src/components/AboutDialog.tsx#L122) | Rendered copy | FreeToGame | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:127](../src/components/AboutDialog.tsx#L127) | Rendered copy | Online search sends your query to your chosen catalog through this site's read-only service, never your private library, notes or rankings. Pages load on request. Wikidata includes entries classified as video games; FreeToGame covers its free-to-play catalog. Neither covers every game. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:132](../src/components/AboutDialog.tsx#L132) | Rendered copy | Searches import facts, not descriptions, prices or reviews. With online lookup on, eligible Discover details can also load labelled public ratings and licensed, credited artwork. The 100 keeps its original artwork and scores. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:137](../src/components/AboutDialog.tsx#L137) | Rendered copy | Dates may identify editions, not first worldwide releases. You don't need an account or API key. Failed sources show errors, not empty results. You can also add a game title manually. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:143](../src/components/AboutDialog.tsx#L143) | Rendered copy | Sources &amp; credits | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:144](../src/components/AboutDialog.tsx#L144) | Rendered copy | The source is the "AAA Top 50" tab of AAA_games_u_have_to_play_list_top_100.xlsx, which contains 100 entries. The enhanced download aligns the other sheets with it. The untouched original is also available; its older derived tabs don't define the order. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:146](../src/components/AboutDialog.tsx#L146) | Rendered copy | AAA_games_u_have_to_play_list_top_100.xlsx | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:150](../src/components/AboutDialog.tsx#L150) | Rendered copy | All 100 covers came with the workbook; owners retain rights. Fallback jackets and the folding 3D collection are original supporting art, not official covers. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:154](../src/components/AboutDialog.tsx#L154) | Rendered copy | Play 100 uses React, Three.js, dnd kit, IndexedDB and customized React Bits CountUp, Magnet and AnimatedContent. React Bits is copyright 2026 David Haz, used under MIT + Commons Clause. Barlow Condensed and Hanken Grotesk use the SIL Open Font License. Creature avatars are generated locally with DiceBear Critters (CC0 1.0) and DiceBear core (MIT); no Google photo is fetched. | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:160](../src/components/AboutDialog.tsx#L160) | Label/help | Project sources and notices | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:161](../src/components/AboutDialog.tsx#L161) | Rendered copy | React Bits | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:165](../src/components/AboutDialog.tsx#L165) | Rendered copy | Creature avatar notices | AboutDialog(); when its owning surface/operation is used |
| [src/components/AboutDialog.tsx:169](../src/components/AboutDialog.tsx#L169) | Rendered copy | Read third-party notices | AboutDialog(); when its owning surface/operation is used |
## src/components/app/AppHeader.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/app/AppHeader.tsx:55](../src/components/app/AppHeader.tsx#L55) | Rendered copy | PLAY100 . Home | AppHeader(); when its owning surface/operation is used |
| [src/components/app/AppHeader.tsx:61](../src/components/app/AppHeader.tsx#L61) | Rendered copy | Home | AppHeader(); when its owning surface/operation is used |
| [src/components/app/AppHeader.tsx:63](../src/components/app/AppHeader.tsx#L63) | Label/help | Main navigation | AppHeader(); when its owning surface/operation is used |
| [src/components/app/AppHeader.tsx:64](../src/components/app/AppHeader.tsx#L64) | Rendered copy | The 100 | AppHeader(); when its owning surface/operation is used |
| [src/components/app/AppHeader.tsx:72](../src/components/app/AppHeader.tsx#L72) | Rendered copy | Discover | AppHeader(); when its owning surface/operation is used |
| [src/components/app/AppHeader.tsx:80](../src/components/app/AppHeader.tsx#L80) | Rendered copy | My games | AppHeader(); when its owning surface/operation is used |
| [src/components/app/AppHeader.tsx:88](../src/components/app/AppHeader.tsx#L88) | Rendered copy | Friends | AppHeader(); onlineAvailable &amp;&amp; |
| [src/components/app/AppHeader.tsx:101](../src/components/app/AppHeader.tsx#L101) | Rendered copy | Play later | AppHeader(); when its owning surface/operation is used |
| [src/components/app/AppHeader.tsx:103](../src/components/app/AppHeader.tsx#L103) | Label/help | {&#96;Play later, ${savedCount} ${savedCount === 1 ? 'game' : 'games'}&#96;} | AppHeader(); when its owning surface/operation is used |
| [src/components/app/AppHeader.tsx:103](../src/components/app/AppHeader.tsx#L103) | Message/fragment | Play later, ${savedCount} ${savedCount === 1 ? 'game' : 'games'} | AppHeader(); when its owning surface/operation is used |
| [src/components/app/AppHeader.tsx:107](../src/components/app/AppHeader.tsx#L107) | Rendered copy | Play later | AppHeader(); when its owning surface/operation is used |
| [src/components/app/AppHeader.tsx:115](../src/components/app/AppHeader.tsx#L115) | Label/help | Download the Excel workbook | AppHeader(); when its owning surface/operation is used |
| [src/components/app/AppHeader.tsx:116](../src/components/app/AppHeader.tsx#L116) | Label/help | Download the Excel workbook | AppHeader(); when its owning surface/operation is used |
| [src/components/app/AppHeader.tsx:120](../src/components/app/AppHeader.tsx#L120) | Rendered copy | Menu | AppHeader(); when its owning surface/operation is used |
| [src/components/app/AppHeader.tsx:134](../src/components/app/AppHeader.tsx#L134) | Label/help | {&#96;Account${headerIdentity ? &#96; for ${headerIdentity.name}&#96; : ''}${libraryLabel ? &#96; ${libraryLabel}&#96; : ''}&#96;} | AppHeader(); onlineAvailable &amp;&amp; |
| [src/components/app/AppHeader.tsx:134](../src/components/app/AppHeader.tsx#L134) | Message/fragment | Account${headerIdentity ? &#96; for ${headerIdentity.name}&#96; : ''}${libraryLabel ? &#96; ${libraryLabel}&#96; : ''} | AppHeader(); onlineAvailable &amp;&amp; |
| [src/components/app/AppHeader.tsx:142](../src/components/app/AppHeader.tsx#L142) | Rendered copy | ${headerIdentity ? ( &lt;img src={headerIdentity.avatarSrc} width="32" height="32" alt="" draggable={false} /&gt; ) : ( &lt;Icon name="user" width="20" height="20" /&gt; )} | AppHeader(); onlineAvailable &amp;&amp; |
| [src/components/app/AppHeader.tsx:149](../src/components/app/AppHeader.tsx#L149) | Rendered copy | ${headerIdentity?.name ?? 'Account'} ${libraryLabel &amp;&amp; ( &lt;&gt; {' '} &lt;small&gt;{libraryLabel}&lt;/small&gt; &lt;/&gt; )} | AppHeader(); onlineAvailable &amp;&amp; |
| [src/components/app/AppHeader.tsx:150](../src/components/app/AppHeader.tsx#L150) | Rendered copy | ${headerIdentity?.name ?? 'Account'} | AppHeader(); onlineAvailable &amp;&amp; |
| [src/components/app/AppHeader.tsx:150](../src/components/app/AppHeader.tsx#L150) | Message/fragment | Account | AppHeader(); onlineAvailable &amp;&amp;; headerIdentity?.name ?? |
| [src/components/app/AppHeader.tsx:154](../src/components/app/AppHeader.tsx#L154) | Rendered copy | ${libraryLabel} | AppHeader(); onlineAvailable &amp;&amp;; libraryLabel &amp;&amp; |
## src/components/app/AppShell.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/app/AppShell.tsx:48](../src/components/app/AppShell.tsx#L48) | Message output | 'Wait for the correct account before pinning a game.' | pin(); !commands.pinAllowed() is true |
| [src/components/app/AppShell.tsx:48](../src/components/app/AppShell.tsx#L48) | Message/fragment | Wait for the correct account before pinning a game. | pin(); !commands.pinAllowed() is true |
| [src/components/app/AppShell.tsx:87](../src/components/app/AppShell.tsx#L87) | Label/help | {app.panelFailure === 'about' ? "About &amp; credits didn't load." : "Settings didn't load."} | panelRecovery(); app.panelFailure &amp;&amp; |
| [src/components/app/AppShell.tsx:87](../src/components/app/AppShell.tsx#L87) | Message/fragment | About &amp; credits didn't load. | panelRecovery(); app.panelFailure &amp;&amp;; app.panelFailure === 'about' is true |
| [src/components/app/AppShell.tsx:87](../src/components/app/AppShell.tsx#L87) | Message/fragment | Settings didn't load. | panelRecovery(); app.panelFailure &amp;&amp;; app.panelFailure === 'about' is false |
| [src/components/app/AppShell.tsx:89](../src/components/app/AppShell.tsx#L89) | Label/help | {app.panelFailure === 'about' ? 'Reload and open About &amp; credits' : 'Reload and open Settings'} | panelRecovery(); app.panelFailure &amp;&amp; |
| [src/components/app/AppShell.tsx:89](../src/components/app/AppShell.tsx#L89) | Message/fragment | Reload and open About &amp; credits | panelRecovery(); app.panelFailure &amp;&amp;; app.panelFailure === 'about' is true |
| [src/components/app/AppShell.tsx:89](../src/components/app/AppShell.tsx#L89) | Message/fragment | Reload and open Settings | panelRecovery(); app.panelFailure &amp;&amp;; app.panelFailure === 'about' is false |
| [src/components/app/AppShell.tsx:113](../src/components/app/AppShell.tsx#L113) | Rendered copy | Skip to ${page === 'collection' ? 'the collection' : 'page content'} | AppShell(); when its owning surface/operation is used |
| [src/components/app/AppShell.tsx:114](../src/components/app/AppShell.tsx#L114) | Message/fragment | page content | AppShell(); page === 'collection' is false |
| [src/components/app/AppShell.tsx:114](../src/components/app/AppShell.tsx#L114) | Message/fragment | the collection | AppShell(); page === 'collection' is true |
| [src/components/app/AppShell.tsx:157](../src/components/app/AppShell.tsx#L157) | Label/help | The comparison tools didn't load. | AppShell(); app.toolFailure?.scope === app.libraryScope &amp;&amp; app.toolFailure.page === page &amp;&amp; |
| [src/components/app/AppShell.tsx:204](../src/components/app/AppShell.tsx#L204) | Live region | Opening sharing options… | AppShell(); app.sharing &amp;&amp; |
## src/components/app/AppToast.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/app/AppToast.tsx:23](../src/components/app/AppToast.tsx#L23) | Live region | ${toastRecovery ? ( &lt;&gt; {toastRecovery} &lt;button className="icon-button" aria-label="Dismiss loading error" onClick={() =&gt; { commands.dismissPanelMessage(); visibleMenuTrigger()?.focus({ preventScroll: true }); }} &gt; &lt;Icon name="close" width="17" height="17" /&gt; &lt;/button&gt; &lt;/&gt; ) : ( currentNotice &amp;&amp; ( &lt;&gt; &lt;Icon name="info" width="19" height="19" /&gt; &lt;span&gt;{currentNotice}&lt;/span&gt; &lt;button className="icon-button" aria-label="Dismiss notification" onClick={() =&gt; { if (trayError) onDismissTrayError(); else { app.notices.clear(); if (!panelRecovery) commands.dismissPanelMessage(); } }} &gt; &lt;Icon name="close" width="17" height="17" /&gt; &lt;/button&gt; &lt;/&gt; ) )} | AppToast(); when its owning surface/operation is used |
| [src/components/app/AppToast.tsx:34](../src/components/app/AppToast.tsx#L34) | Label/help | Dismiss loading error | AppToast(); toastRecovery is true |
| [src/components/app/AppToast.tsx:47](../src/components/app/AppToast.tsx#L47) | Rendered copy | ${currentNotice} | AppToast(); toastRecovery is false; currentNotice &amp;&amp; |
| [src/components/app/AppToast.tsx:50](../src/components/app/AppToast.tsx#L50) | Label/help | Dismiss notification | AppToast(); toastRecovery is false; currentNotice &amp;&amp; |
## src/components/app/DialogHost.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/app/DialogHost.tsx:91](../src/components/app/DialogHost.tsx#L91) | Rendered copy | Game details | DetailLoadFailure(); when its owning surface/operation is used |
| [src/components/app/DialogHost.tsx:94](../src/components/app/DialogHost.tsx#L94) | Label/help | These game details didn't load. | DetailLoadFailure(); when its owning surface/operation is used |
| [src/components/app/DialogHost.tsx:101](../src/components/app/DialogHost.tsx#L101) | Error/validation | About &amp; credits must finish loading before it opens. | ReadyAbout(); !About is true |
| [src/components/app/DialogHost.tsx:107](../src/components/app/DialogHost.tsx#L107) | Error/validation | Settings must finish loading before they open. | ReadySettings(); !Settings is true |
| [src/components/app/DialogHost.tsx:123](../src/components/app/DialogHost.tsx#L123) | Rendered copy | Opening game… | PendingCatalogDialog(); when its owning surface/operation is used |
| [src/components/app/DialogHost.tsx:126](../src/components/app/DialogHost.tsx#L126) | Live region | Loading its details. | PendingCatalogDialog(); when its owning surface/operation is used |
| [src/components/app/DialogHost.tsx:193](../src/components/app/DialogHost.tsx#L193) | Message/fragment | Game details | DialogHost(); detailOpen &amp;&amp;; onFailure |
| [src/components/app/DialogHost.tsx:214](../src/components/app/DialogHost.tsx#L214) | Rendered copy | Game details | DialogHost(); detailOpen &amp;&amp;; metadataFailure &amp;&amp; |
| [src/components/app/DialogHost.tsx:217](../src/components/app/DialogHost.tsx#L217) | Label/help | The catalog tools didn't load. | DialogHost(); detailOpen &amp;&amp;; metadataFailure &amp;&amp; |
| [src/components/app/DialogHost.tsx:228](../src/components/app/DialogHost.tsx#L228) | Rendered copy | Opening game… | DialogHost(); detailOpen &amp;&amp;; loadingGame &amp;&amp; |
| [src/components/app/DialogHost.tsx:231](../src/components/app/DialogHost.tsx#L231) | Live region | Looking up its public catalog metadata. | DialogHost(); detailOpen &amp;&amp;; loadingGame &amp;&amp; |
| [src/components/app/DialogHost.tsx:242](../src/components/app/DialogHost.tsx#L242) | Rendered copy | The original game could not load. | DialogHost(); detailOpen &amp;&amp;; canonicalError &amp;&amp; |
| [src/components/app/DialogHost.tsx:245](../src/components/app/DialogHost.tsx#L245) | Rendered copy | ${canonicalError.message} Your saved records have not changed. | DialogHost(); detailOpen &amp;&amp;; canonicalError &amp;&amp; |
| [src/components/app/DialogHost.tsx:246](../src/components/app/DialogHost.tsx#L246) | Rendered copy | Reload The 100 | DialogHost(); detailOpen &amp;&amp;; canonicalError &amp;&amp; |
| [src/components/app/DialogHost.tsx:259](../src/components/app/DialogHost.tsx#L259) | Rendered copy | ${page === 'collection' ? "That game isn't in this collection." : "That game isn't in the active library."} | DialogHost(); detailOpen &amp;&amp;; missingGame &amp;&amp; |
| [src/components/app/DialogHost.tsx:261](../src/components/app/DialogHost.tsx#L261) | Message/fragment | That game isn't in this collection. | DialogHost(); detailOpen &amp;&amp;; missingGame &amp;&amp;; page === 'collection' is true |
| [src/components/app/DialogHost.tsx:262](../src/components/app/DialogHost.tsx#L262) | Message/fragment | That game isn't in the active library. | DialogHost(); detailOpen &amp;&amp;; missingGame &amp;&amp;; page === 'collection' is false |
| [src/components/app/DialogHost.tsx:264](../src/components/app/DialogHost.tsx#L264) | Rendered copy | ${page === 'collection' ? 'This link may be old or incomplete. All 100 games are still here.' : 'Guest and account libraries stay separate. Open the correct account, import your backup, or add this game from Discover.'} | DialogHost(); detailOpen &amp;&amp;; missingGame &amp;&amp; |
| [src/components/app/DialogHost.tsx:266](../src/components/app/DialogHost.tsx#L266) | Message/fragment | This link may be old or incomplete. All 100 games are still here. | DialogHost(); detailOpen &amp;&amp;; missingGame &amp;&amp;; page === 'collection' is true |
| [src/components/app/DialogHost.tsx:267](../src/components/app/DialogHost.tsx#L267) | Message/fragment | Guest and account libraries stay separate. Open the correct account, import your backup, or add this game from Discover. | DialogHost(); detailOpen &amp;&amp;; missingGame &amp;&amp;; page === 'collection' is false |
| [src/components/app/DialogHost.tsx:269](../src/components/app/DialogHost.tsx#L269) | Rendered copy | Back to the collection | DialogHost(); detailOpen &amp;&amp;; missingGame &amp;&amp; |
| [src/components/app/DialogHost.tsx:279](../src/components/app/DialogHost.tsx#L279) | Message/fragment | Menu | DialogHost(); menu &amp;&amp;; onFailure |
| [src/components/app/DialogHost.tsx:297](../src/components/app/DialogHost.tsx#L297) | Message/fragment | Settings | DialogHost(); settings &amp;&amp;; onFailure |
| [src/components/app/DialogHost.tsx:304](../src/components/app/DialogHost.tsx#L304) | Message/fragment | The notice | DialogHost(); panelNotice &amp;&amp;; onFailure |
| [src/components/app/DialogHost.tsx:306](../src/components/app/DialogHost.tsx#L306) | Rendered copy | ${panelNotice.title} | DialogHost(); panelNotice &amp;&amp; |
| [src/components/app/DialogHost.tsx:314](../src/components/app/DialogHost.tsx#L314) | Message/fragment | Sharing | DialogHost(); manualShare &amp;&amp;; onFailure |
| [src/components/app/DialogHost.tsx:316](../src/components/app/DialogHost.tsx#L316) | Rendered copy | Copy this link | DialogHost(); manualShare &amp;&amp; |
| [src/components/app/DialogHost.tsx:319](../src/components/app/DialogHost.tsx#L319) | Rendered copy | This browser couldn't share or copy automatically. Select this public link and copy it to send to a friend. Your private progress isn't included. | DialogHost(); manualShare &amp;&amp; |
| [src/components/app/DialogHost.tsx:323](../src/components/app/DialogHost.tsx#L323) | Rendered copy | Shareable link | DialogHost(); manualShare &amp;&amp; |
| [src/components/app/DialogHost.tsx:325](../src/components/app/DialogHost.tsx#L325) | Rendered copy | Select link to copy | DialogHost(); manualShare &amp;&amp; |
| [src/components/app/DialogHost.tsx:343](../src/components/app/DialogHost.tsx#L343) | Label/help | Dialog recovery | DialogHost(); failure?.scope === scope &amp;&amp; failure.page === page &amp;&amp; |
| [src/components/app/DialogHost.tsx:345](../src/components/app/DialogHost.tsx#L345) | Label/help | {&#96;${failure.label} ran into a problem. The rest of Play 100 is still available.&#96;} | DialogHost(); failure?.scope === scope &amp;&amp; failure.page === page &amp;&amp; |
| [src/components/app/DialogHost.tsx:345](../src/components/app/DialogHost.tsx#L345) | Message/fragment | ${failure.label} ran into a problem. The rest of Play 100 is still available. | DialogHost(); failure?.scope === scope &amp;&amp; failure.page === page &amp;&amp; |
| [src/components/app/DialogHost.tsx:348](../src/components/app/DialogHost.tsx#L348) | Rendered copy | Dismiss | DialogHost(); failure?.scope === scope &amp;&amp; failure.page === page &amp;&amp; |
## src/components/app/GlobalBanners.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/app/GlobalBanners.tsx:15](../src/components/app/GlobalBanners.tsx#L15) | Live region | ${props.warning ?? props.hintError} ${failed ? ( &lt;ChunkRecovery message="Device recovery tools didn't load. Your data is unchanged." /&gt; ) : ( &lt;span role="status"&gt;Loading recovery controls…&lt;/span&gt; )} Settings | fallback(); when its owning surface/operation is used |
| [src/components/app/GlobalBanners.tsx:17](../src/components/app/GlobalBanners.tsx#L17) | Rendered copy | ${props.warning ?? props.hintError} | fallback(); when its owning surface/operation is used |
| [src/components/app/GlobalBanners.tsx:19](../src/components/app/GlobalBanners.tsx#L19) | Label/help | Device recovery tools didn't load. Your data is unchanged. | fallback(); failed is true |
| [src/components/app/GlobalBanners.tsx:21](../src/components/app/GlobalBanners.tsx#L21) | Live region | Loading recovery controls… | fallback(); failed is false |
| [src/components/app/GlobalBanners.tsx:23](../src/components/app/GlobalBanners.tsx#L23) | Rendered copy | Settings | fallback(); when its owning surface/operation is used |
| [src/components/app/GlobalBanners.tsx:55](../src/components/app/GlobalBanners.tsx#L55) | Rendered copy | Open Account | accountActions(); when its owning surface/operation is used |
| [src/components/app/GlobalBanners.tsx:58](../src/components/app/GlobalBanners.tsx#L58) | Rendered copy | Use this device only | accountActions(); when its owning surface/operation is used |
| [src/components/app/GlobalBanners.tsx:63](../src/components/app/GlobalBanners.tsx#L63) | Message/fragment | Choose an account check or continue with this device explicitly. | accountChoice(); when its owning surface/operation is used |
| [src/components/app/GlobalBanners.tsx:71](../src/components/app/GlobalBanners.tsx#L71) | Live region | ${warning} ${sharedDenial &amp;&amp; &#96; ${accountChoice}&#96;} Settings ${sharedDenial &amp;&amp; accountActions} | GlobalBanners(); props.onRetryLibrary is false; warning &amp;&amp; |
| [src/components/app/GlobalBanners.tsx:73](../src/components/app/GlobalBanners.tsx#L73) | Rendered copy | ${warning} ${sharedDenial &amp;&amp; &#96; ${accountChoice}&#96;} | GlobalBanners(); props.onRetryLibrary is false; warning &amp;&amp; |
| [src/components/app/GlobalBanners.tsx:77](../src/components/app/GlobalBanners.tsx#L77) | Rendered copy | Settings | GlobalBanners(); props.onRetryLibrary is false; warning &amp;&amp; |
| [src/components/app/GlobalBanners.tsx:88](../src/components/app/GlobalBanners.tsx#L88) | Live region | ${onlineConfigError} | GlobalBanners(); onlineConfigError &amp;&amp; |
| [src/components/app/GlobalBanners.tsx:90](../src/components/app/GlobalBanners.tsx#L90) | Rendered copy | ${onlineConfigError} | GlobalBanners(); onlineConfigError &amp;&amp; |
| [src/components/app/GlobalBanners.tsx:96](../src/components/app/GlobalBanners.tsx#L96) | Live region | You are offline. ${offlineReady ? 'Prepared app files and saved device games can work offline.' : 'The loaded page and saved device games can still work. Enable offline access in Settings when connected.'} Online saving and live lookups need a connection. | GlobalBanners(); offline &amp;&amp; |
| [src/components/app/GlobalBanners.tsx:98](../src/components/app/GlobalBanners.tsx#L98) | Rendered copy | You are offline. ${offlineReady ? 'Prepared app files and saved device games can work offline.' : 'The loaded page and saved device games can still work. Enable offline access in Settings when connected.'} Online saving and live lookups need a connection. | GlobalBanners(); offline &amp;&amp; |
| [src/components/app/GlobalBanners.tsx:101](../src/components/app/GlobalBanners.tsx#L101) | Message/fragment | Prepared app files and saved device games can work offline. | GlobalBanners(); offline &amp;&amp;; offlineReady is true |
| [src/components/app/GlobalBanners.tsx:102](../src/components/app/GlobalBanners.tsx#L102) | Message/fragment | The loaded page and saved device games can still work. Enable offline access in Settings when connected. | GlobalBanners(); offline &amp;&amp;; offlineReady is false |
| [src/components/app/GlobalBanners.tsx:110](../src/components/app/GlobalBanners.tsx#L110) | Live region | ${hintError} ${!hasStorageSafetyNotice(hintError) &amp;&amp; ' Your libraries have not been cleared.'} ${accountChoice} ${accountActions} | GlobalBanners(); hintError &amp;&amp; !sharedDenial &amp;&amp; !hintBlocked &amp;&amp; |
| [src/components/app/GlobalBanners.tsx:112](../src/components/app/GlobalBanners.tsx#L112) | Rendered copy | ${hintError} ${!hasStorageSafetyNotice(hintError) &amp;&amp; ' Your libraries have not been cleared.'} ${accountChoice} | GlobalBanners(); hintError &amp;&amp; !sharedDenial &amp;&amp; !hintBlocked &amp;&amp; |
| [src/components/app/GlobalBanners.tsx:114](../src/components/app/GlobalBanners.tsx#L114) | Message/fragment | Your libraries have not been cleared. | GlobalBanners(); hintError &amp;&amp; !sharedDenial &amp;&amp; !hintBlocked &amp;&amp;; !hasStorageSafetyNotice(hintError) &amp;&amp; |
## src/components/app/MobileNav.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/app/MobileNav.tsx:37](../src/components/app/MobileNav.tsx#L37) | Label/help | Mobile navigation | MobileNav(); when its owning surface/operation is used |
| [src/components/app/MobileNav.tsx:45](../src/components/app/MobileNav.tsx#L45) | Rendered copy | The 100 | MobileNav(); when its owning surface/operation is used |
| [src/components/app/MobileNav.tsx:54](../src/components/app/MobileNav.tsx#L54) | Rendered copy | Discover | MobileNav(); when its owning surface/operation is used |
| [src/components/app/MobileNav.tsx:66](../src/components/app/MobileNav.tsx#L66) | Rendered copy | My games | MobileNav(); when its owning surface/operation is used |
| [src/components/app/MobileNav.tsx:78](../src/components/app/MobileNav.tsx#L78) | Rendered copy | Friends | MobileNav(); onlineAvailable is true |
| [src/components/app/MobileNav.tsx:87](../src/components/app/MobileNav.tsx#L87) | Rendered copy | Ranking | MobileNav(); onlineAvailable is false |
| [src/components/app/MobileNav.tsx:92](../src/components/app/MobileNav.tsx#L92) | Rendered copy | Menu | MobileNav(); when its owning surface/operation is used |
## src/components/app/RouteBoundary.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/app/RouteBoundary.tsx:28](../src/components/app/RouteBoundary.tsx#L28) | Rendered copy | This page ran into a problem. | render(); when its owning surface/operation is used |
| [src/components/app/RouteBoundary.tsx:31](../src/components/app/RouteBoundary.tsx#L31) | Rendered copy | Your saved data hasn't changed, and the rest of Play 100 still works. | render(); when its owning surface/operation is used |
| [src/components/app/RouteBoundary.tsx:33](../src/components/app/RouteBoundary.tsx#L33) | Rendered copy | Try again | render(); when its owning surface/operation is used |
| [src/components/app/RouteBoundary.tsx:37](../src/components/app/RouteBoundary.tsx#L37) | Label/help | If it happens again, reload this page. | render(); when its owning surface/operation is used |
## src/components/app/RouteFallback.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/app/RouteFallback.tsx:13](../src/components/app/RouteFallback.tsx#L13) | Message/fragment | My games | titles(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:14](../src/components/app/RouteFallback.tsx#L14) | Message/fragment | My games | titles(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:15](../src/components/app/RouteFallback.tsx#L15) | Message/fragment | My games | titles(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:16](../src/components/app/RouteFallback.tsx#L16) | Message/fragment | Discover | titles(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:17](../src/components/app/RouteFallback.tsx#L17) | Message/fragment | Account | titles(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:18](../src/components/app/RouteFallback.tsx#L18) | Message/fragment | Publish ranking | titles(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:19](../src/components/app/RouteFallback.tsx#L19) | Message/fragment | Community | titles(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:20](../src/components/app/RouteFallback.tsx#L20) | Message/fragment | A shared ranking | titles(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:21](../src/components/app/RouteFallback.tsx#L21) | Message/fragment | Creator desk | titles(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:22](../src/components/app/RouteFallback.tsx#L22) | Message/fragment | Friends | titles(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:23](../src/components/app/RouteFallback.tsx#L23) | Message/fragment | Player | titles(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:24](../src/components/app/RouteFallback.tsx#L24) | Message/fragment | Invitation | titles(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:25](../src/components/app/RouteFallback.tsx#L25) | Message/fragment | Compare rankings | titles(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:26](../src/components/app/RouteFallback.tsx#L26) | Message/fragment | Friend sharing | titles(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:27](../src/components/app/RouteFallback.tsx#L27) | Message/fragment | Shared games | titles(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:41](../src/components/app/RouteFallback.tsx#L41) | Rendered copy | ${blank} | row(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:53](../src/components/app/RouteFallback.tsx#L53) | Rendered copy | ${blank} | DiscoverControls(); narrow is false |
| [src/components/app/RouteFallback.tsx:58](../src/components/app/RouteFallback.tsx#L58) | Rendered copy | ${blank} | DiscoverControls(); narrow is false |
| [src/components/app/RouteFallback.tsx:65](../src/components/app/RouteFallback.tsx#L65) | Rendered copy | ${blank} | DiscoverControls(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:66](../src/components/app/RouteFallback.tsx#L66) | Rendered copy | ${blank} | DiscoverControls(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:82](../src/components/app/RouteFallback.tsx#L82) | Message/fragment | My games | games(); !sheet &amp;&amp; |
| [src/components/app/RouteFallback.tsx:94](../src/components/app/RouteFallback.tsx#L94) | Rendered copy | ${line} | content(); form is false; cards is true |
| [src/components/app/RouteFallback.tsx:95](../src/components/app/RouteFallback.tsx#L95) | Rendered copy | ${line} ${line} | content(); form is false; cards is true |
| [src/components/app/RouteFallback.tsx:110](../src/components/app/RouteFallback.tsx#L110) | Rendered copy | ${line} | content(); form is false; cards is false |
| [src/components/app/RouteFallback.tsx:129](../src/components/app/RouteFallback.tsx#L129) | Live region | ${props.kind === 'private-library' ? 'Opening your guest or account library before allowing edits.' : &#96;Loading ${title}…&#96;} | status(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:131](../src/components/app/RouteFallback.tsx#L131) | Message/fragment | Opening your guest or account library before allowing edits. | status(); props.kind === 'private-library' is true |
| [src/components/app/RouteFallback.tsx:132](../src/components/app/RouteFallback.tsx#L132) | Message/fragment | Loading ${title}… | status(); props.kind === 'private-library' is false |
| [src/components/app/RouteFallback.tsx:145](../src/components/app/RouteFallback.tsx#L145) | Rendered copy | Sign in | RouteFallback(); sheet is true |
| [src/components/app/RouteFallback.tsx:155](../src/components/app/RouteFallback.tsx#L155) | Rendered copy | ${title} | RouteFallback(); when its owning surface/operation is used |
| [src/components/app/RouteFallback.tsx:159](../src/components/app/RouteFallback.tsx#L159) | Rendered copy | ${blank} | RouteFallback(); cards &amp;&amp; |
| [src/components/app/RouteFallback.tsx:168](../src/components/app/RouteFallback.tsx#L168) | Rendered copy | ${blank} | RouteFallback(); games &amp;&amp; |
## src/components/app/RouteHost.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/app/RouteHost.tsx:74](../src/components/app/RouteHost.tsx#L74) | Rendered copy | Online tools are not configured in this build. | RouteHost(); content?.kind === 'unconfigured' is true |
| [src/components/app/RouteHost.tsx:75](../src/components/app/RouteHost.tsx#L75) | Rendered copy | Your device library and the original collection remain available. | RouteHost(); content?.kind === 'unconfigured' is true |
| [src/components/app/RouteHost.tsx:76](../src/components/app/RouteHost.tsx#L76) | Rendered copy | Open the collection | RouteHost(); content?.kind === 'unconfigured' is true |
## src/components/app/SettingsPanel.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/app/SettingsPanel.tsx:21](../src/components/app/SettingsPanel.tsx#L21) | Message/fragment | Loading offline controls… | controls(); offline is true; offline.pwa.controlsReady === false &amp;&amp; !offline.pwa.error is true |
## src/components/app/StorageRecovery.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/app/StorageRecovery.tsx:70](../src/components/app/StorageRecovery.tsx#L70) | Live region | ${storageWarning} ${onRetryLibrary &amp;&amp; ( &lt;button ref={retryRef} type="button" className="text-button" aria-disabled={retryBusy &#124;&#124; undefined} aria-busy={retryBusy} onClick={() =&gt; { if (!retryBusy) { setRetryWarning(storageWarning); void onRetryLibrary(); } }} &gt; Try again &lt;/button&gt; )} Settings | StorageRecovery(); storageWarning &amp;&amp; |
| [src/components/app/StorageRecovery.tsx:72](../src/components/app/StorageRecovery.tsx#L72) | Rendered copy | ${storageWarning} | StorageRecovery(); storageWarning &amp;&amp; |
| [src/components/app/StorageRecovery.tsx:74](../src/components/app/StorageRecovery.tsx#L74) | Rendered copy | Try again | StorageRecovery(); storageWarning &amp;&amp;; onRetryLibrary &amp;&amp; |
| [src/components/app/StorageRecovery.tsx:90](../src/components/app/StorageRecovery.tsx#L90) | Rendered copy | Settings | StorageRecovery(); storageWarning &amp;&amp; |
| [src/components/app/StorageRecovery.tsx:96](../src/components/app/StorageRecovery.tsx#L96) | Label/help | Temporary library recovery | StorageRecovery(); storageWarning &amp;&amp;; (onDiscardTemporary &#124;&#124; (retryBusy &amp;&amp; discardRevision !== null)) &amp;&amp; |
| [src/components/app/StorageRecovery.tsx:97](../src/components/app/StorageRecovery.tsx#L97) | Rendered copy | Discard tab changes and try again | StorageRecovery(); storageWarning &amp;&amp;; (onDiscardTemporary &#124;&#124; (retryBusy &amp;&amp; discardRevision !== null)) &amp;&amp; |
| [src/components/app/StorageRecovery.tsx:111](../src/components/app/StorageRecovery.tsx#L111) | Rendered copy | Export a backup in Settings first. If reopening succeeds, only changes made in this tab while device storage was unavailable will be discarded, including temporary games, progress, ratings and notes. Your previously saved library and other tabs are not changed. If storage is still blocked, this tab's changes stay here. | StorageRecovery(); storageWarning &amp;&amp;; (onDiscardTemporary &#124;&#124; (retryBusy &amp;&amp; discardRevision !== null)) &amp;&amp;; discardRevision !== null &amp;&amp; |
| [src/components/app/StorageRecovery.tsx:118](../src/components/app/StorageRecovery.tsx#L118) | Rendered copy | Keep tab changes | StorageRecovery(); storageWarning &amp;&amp;; (onDiscardTemporary &#124;&#124; (retryBusy &amp;&amp; discardRevision !== null)) &amp;&amp;; discardRevision !== null &amp;&amp; |
| [src/components/app/StorageRecovery.tsx:131](../src/components/app/StorageRecovery.tsx#L131) | Rendered copy | Discard and try again | StorageRecovery(); storageWarning &amp;&amp;; (onDiscardTemporary &#124;&#124; (retryBusy &amp;&amp; discardRevision !== null)) &amp;&amp;; discardRevision !== null &amp;&amp; |
## src/components/AuthorLinks.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/AuthorLinks.tsx:6](../src/components/AuthorLinks.tsx#L6) | Rendered copy | Curated by ${author.fullName} | AuthorLinks(); when its owning surface/operation is used |
| [src/components/AuthorLinks.tsx:7](../src/components/AuthorLinks.tsx#L7) | Rendered copy | ${author.fullName} | AuthorLinks(); when its owning surface/operation is used |
| [src/components/AuthorLinks.tsx:9](../src/components/AuthorLinks.tsx#L9) | Label/help | Author links | AuthorLinks(); when its owning surface/operation is used |
| [src/components/AuthorLinks.tsx:15](../src/components/AuthorLinks.tsx#L15) | Label/help | {title} | AuthorLinks(); when its owning surface/operation is used |
| [src/components/AuthorLinks.tsx:16](../src/components/AuthorLinks.tsx#L16) | Label/help | {title} | AuthorLinks(); when its owning surface/operation is used |
## src/components/avatar/Avatar.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/avatar/Avatar.tsx:18](../src/components/avatar/Avatar.tsx#L18) | Error/validation | Avatar size must be an integer from 1 to 4096. | Avatar(); !Number.isInteger(size) &#124;&#124; size &lt; 1 &#124;&#124; size &gt; 4096 is true |
| [src/components/avatar/Avatar.tsx:19](../src/components/avatar/Avatar.tsx#L19) | Label/help | {label} | Avatar(); when its owning surface/operation is used |
## src/components/avatar/AvatarPicker.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/avatar/AvatarPicker.tsx:35](../src/components/avatar/AvatarPicker.tsx#L35) | Message/fragment | Could not generate new faces. ${error instanceof Error ? error.message : 'Try Shuffle again.'} Your current avatar is still available. | initialDraft(); operation rejected or threw |
| [src/components/avatar/AvatarPicker.tsx:63](../src/components/avatar/AvatarPicker.tsx#L63) | Message output | 'editing' | edit(); when its owning surface/operation is used |
| [src/components/avatar/AvatarPicker.tsx:80](../src/components/avatar/AvatarPicker.tsx#L80) | Message/fragment | Could not shuffle avatars. ${error instanceof Error ? error.message : 'Try again.'} Your choice is unchanged. | shuffle(); operation rejected or threw |
| [src/components/avatar/AvatarPicker.tsx:88](../src/components/avatar/AvatarPicker.tsx#L88) | Message output | 'saving' | save(); when its owning surface/operation is used |
| [src/components/avatar/AvatarPicker.tsx:92](../src/components/avatar/AvatarPicker.tsx#L92) | Message output | 'saved' | save(); active.current is true |
| [src/components/avatar/AvatarPicker.tsx:95](../src/components/avatar/AvatarPicker.tsx#L95) | Message output | &#96;Could not save avatar. ${error instanceof Error ? &#96;${error.message} &#96; : ''}Your choice is still here. Try saving again.&#96; | save(); operation rejected or threw; active.current is true |
| [src/components/avatar/AvatarPicker.tsx:96](../src/components/avatar/AvatarPicker.tsx#L96) | Message/fragment | Could not save avatar. ${error instanceof Error ? &#96;${error.message} &#96; : ''}Your choice is still here. Try saving again. | save(); operation rejected or threw; active.current is true |
| [src/components/avatar/AvatarPicker.tsx:98](../src/components/avatar/AvatarPicker.tsx#L98) | Message output | 'editing' | save(); operation rejected or threw; active.current is true |
| [src/components/avatar/AvatarPicker.tsx:107](../src/components/avatar/AvatarPicker.tsx#L107) | Rendered copy | Pick your avatar. | AvatarPickerDraft(); when its owning surface/operation is used |
| [src/components/avatar/AvatarPicker.tsx:110](../src/components/avatar/AvatarPicker.tsx#L110) | Rendered copy | Choose a face and a color. Nothing changes until you save. | AvatarPickerDraft(); when its owning surface/operation is used |
| [src/components/avatar/AvatarPicker.tsx:112](../src/components/avatar/AvatarPicker.tsx#L112) | Rendered copy | Choose a face | AvatarPickerDraft(); when its owning surface/operation is used |
| [src/components/avatar/AvatarPicker.tsx:113](../src/components/avatar/AvatarPicker.tsx#L113) | Rendered copy | Shuffle | AvatarPickerDraft(); when its owning surface/operation is used |
| [src/components/avatar/AvatarPicker.tsx:133](../src/components/avatar/AvatarPicker.tsx#L133) | Label/help | {&#96;Avatar option ${index + 1}&#96;} | AvatarPickerDraft(); when its owning surface/operation is used |
| [src/components/avatar/AvatarPicker.tsx:133](../src/components/avatar/AvatarPicker.tsx#L133) | Message/fragment | Avatar option ${index + 1} | AvatarPickerDraft(); when its owning surface/operation is used |
| [src/components/avatar/AvatarPicker.tsx:138](../src/components/avatar/AvatarPicker.tsx#L138) | Rendered copy | ${selected &amp;&amp; &lt;Icon name="check" width="14" height="14" /&gt;} ${selected ? 'Selected' : &#96;Option ${index + 1}&#96;} | AvatarPickerDraft(); when its owning surface/operation is used |
| [src/components/avatar/AvatarPicker.tsx:140](../src/components/avatar/AvatarPicker.tsx#L140) | Message/fragment | Option ${index + 1} | AvatarPickerDraft(); selected is false |
| [src/components/avatar/AvatarPicker.tsx:140](../src/components/avatar/AvatarPicker.tsx#L140) | Message/fragment | Selected | AvatarPickerDraft(); selected is true |
| [src/components/avatar/AvatarPicker.tsx:146](../src/components/avatar/AvatarPicker.tsx#L146) | Rendered copy | Color | AvatarPickerDraft(); when its owning surface/operation is used |
| [src/components/avatar/AvatarPicker.tsx:151](../src/components/avatar/AvatarPicker.tsx#L151) | Error/validation | Unsupported avatar palette in the picker. | AvatarPickerDraft(); !isAvatarPalette(palette) is true |
| [src/components/avatar/AvatarPicker.tsx:160](../src/components/avatar/AvatarPicker.tsx#L160) | Label/help | {colors.label} | AvatarPickerDraft(); when its owning surface/operation is used |
| [src/components/avatar/AvatarPicker.tsx:164](../src/components/avatar/AvatarPicker.tsx#L164) | Rendered copy | ${selected &amp;&amp; &lt;Icon name="check" width="13" height="13" /&gt;} | AvatarPickerDraft(); when its owning surface/operation is used |
| [src/components/avatar/AvatarPicker.tsx:167](../src/components/avatar/AvatarPicker.tsx#L167) | Rendered copy | ${colors.label} | AvatarPickerDraft(); when its owning surface/operation is used |
| [src/components/avatar/AvatarPicker.tsx:173](../src/components/avatar/AvatarPicker.tsx#L173) | Live region | ${error &#124;&#124; generationError} | AvatarPickerDraft(); (error &#124;&#124; generationError) &amp;&amp; |
| [src/components/avatar/AvatarPicker.tsx:177](../src/components/avatar/AvatarPicker.tsx#L177) | Live region | ${pending ? 'Saving your avatar…' : status === 'saved' ? 'Avatar saved.' : ''} | AvatarPickerDraft(); when its owning surface/operation is used |
| [src/components/avatar/AvatarPicker.tsx:178](../src/components/avatar/AvatarPicker.tsx#L178) | Message/fragment | Avatar saved. | AvatarPickerDraft(); pending is false; status === 'saved' is true |
| [src/components/avatar/AvatarPicker.tsx:178](../src/components/avatar/AvatarPicker.tsx#L178) | Message/fragment | Saving your avatar… | AvatarPickerDraft(); pending is true |
| [src/components/avatar/AvatarPicker.tsx:181](../src/components/avatar/AvatarPicker.tsx#L181) | Rendered copy | Cancel | AvatarPickerDraft(); when its owning surface/operation is used |
| [src/components/avatar/AvatarPicker.tsx:184](../src/components/avatar/AvatarPicker.tsx#L184) | Rendered copy | ${pending ? 'Saving…' : 'Save avatar'} | AvatarPickerDraft(); when its owning surface/operation is used |
| [src/components/avatar/AvatarPicker.tsx:192](../src/components/avatar/AvatarPicker.tsx#L192) | Message/fragment | Save avatar | AvatarPickerDraft(); pending is false |
| [src/components/avatar/AvatarPicker.tsx:192](../src/components/avatar/AvatarPicker.tsx#L192) | Message/fragment | Saving… | AvatarPickerDraft(); pending is true |
## src/components/bits/CountUp.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/bits/CountUp.tsx:47](../src/components/bits/CountUp.tsx#L47) | Rendered copy | ${to} | CountUp(); when its owning surface/operation is used |
| [src/components/bits/CountUp.tsx:48](../src/components/bits/CountUp.tsx#L48) | Rendered copy | ${initial} | CountUp(); when its owning surface/operation is used |
## src/components/BrowseFilters.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/BrowseFilters.tsx:8](../src/components/BrowseFilters.tsx#L8) | Message/fragment | Filters | BrowseFilters(); when its owning surface/operation is used |
| [src/components/BrowseFilters.tsx:20](../src/components/BrowseFilters.tsx#L20) | Message/fragment | None active | status(); activeCount is false |
| [src/components/BrowseFilters.tsx:37](../src/components/BrowseFilters.tsx#L37) | Label/help | {&#96;${label}, ${status}&#96;} | BrowseFilters(); when its owning surface/operation is used |
| [src/components/BrowseFilters.tsx:37](../src/components/BrowseFilters.tsx#L37) | Rendered copy | ${label} ${status} | BrowseFilters(); when its owning surface/operation is used |
| [src/components/BrowseFilters.tsx:38](../src/components/BrowseFilters.tsx#L38) | Rendered copy | ${status} | BrowseFilters(); when its owning surface/operation is used |
## src/components/catalog/CatalogEnrichment.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/catalog/CatalogEnrichment.tsx:13](../src/components/catalog/CatalogEnrichment.tsx#L13) | Rendered copy | Artwork could not load | ExternalCatalogArtwork(); failed === artwork.src is true |
| [src/components/catalog/CatalogEnrichment.tsx:20](../src/components/catalog/CatalogEnrichment.tsx#L20) | Label/help | {artwork.alt} | ExternalCatalogArtwork(); failed === artwork.src is false |
| [src/components/catalog/CatalogEnrichment.tsx:31](../src/components/catalog/CatalogEnrichment.tsx#L31) | Rendered copy | Original file · Retrieved ${artwork.retrievedAt.slice(0, 10)}. Reusable under the linked license; no publisher endorsement. | ExternalCatalogArtworkCredit(); when its owning surface/operation is used |
| [src/components/catalog/CatalogEnrichment.tsx:32](../src/components/catalog/CatalogEnrichment.tsx#L32) | Rendered copy | Original file | ExternalCatalogArtworkCredit(); when its owning surface/operation is used |
| [src/components/catalog/CatalogEnrichment.tsx:43](../src/components/catalog/CatalogEnrichment.tsx#L43) | Message/fragment | Steam | source(); rating.source === 'steam' is true |
| [src/components/catalog/CatalogEnrichment.tsx:43](../src/components/catalog/CatalogEnrichment.tsx#L43) | Message/fragment | Wikidata | source(); rating.source === 'steam' is false |
| [src/components/catalog/CatalogEnrichment.tsx:52](../src/components/catalog/CatalogEnrichment.tsx#L52) | Message/fragment | Reported review score | compactRatingContext(); rating.kind === 'user-recommendations' is false |
| [src/components/catalog/CatalogEnrichment.tsx:52](../src/components/catalog/CatalogEnrichment.tsx#L52) | Message/fragment | User recommendations | compactRatingContext(); rating.kind === 'user-recommendations' is true |
| [src/components/catalog/CatalogEnrichment.tsx:53](../src/components/catalog/CatalogEnrichment.tsx#L53) | Message/fragment | via ${source} | compactRatingContext(); rating.source === 'steam' is false |
| [src/components/catalog/CatalogEnrichment.tsx:92](../src/components/catalog/CatalogEnrichment.tsx#L92) | Rendered copy | Ratings from other sites | CatalogEnrichment(); when its owning surface/operation is used |
| [src/components/catalog/CatalogEnrichment.tsx:95](../src/components/catalog/CatalogEnrichment.tsx#L95) | Rendered copy | Source scores stay separate. They do not change the original collection or your rating. | CatalogEnrichment(); when its owning surface/operation is used |
| [src/components/catalog/CatalogEnrichment.tsx:99](../src/components/catalog/CatalogEnrichment.tsx#L99) | Rendered copy | Online lookup is off. Only bundled or previously loaded public details are shown. Enable online details | CatalogEnrichment(); !lookup.online &amp;&amp; |
| [src/components/catalog/CatalogEnrichment.tsx:101](../src/components/catalog/CatalogEnrichment.tsx#L101) | Rendered copy | Enable online details | CatalogEnrichment(); !lookup.online &amp;&amp; |
| [src/components/catalog/CatalogEnrichment.tsx:114](../src/components/catalog/CatalogEnrichment.tsx#L114) | Live region | You appear to be offline. Previously loaded public details remain available. | CatalogEnrichment(); !connected &amp;&amp; |
| [src/components/catalog/CatalogEnrichment.tsx:119](../src/components/catalog/CatalogEnrichment.tsx#L119) | Live region | Loading public ratings and licensed artwork… | CatalogEnrichment(); status === 'loading' &amp;&amp; |
| [src/components/catalog/CatalogEnrichment.tsx:124](../src/components/catalog/CatalogEnrichment.tsx#L124) | Live region | ${error} | CatalogEnrichment(); error &amp;&amp; |
| [src/components/catalog/CatalogEnrichment.tsx:130](../src/components/catalog/CatalogEnrichment.tsx#L130) | Rendered copy | ${cached ? 'Cached public details' : 'Public details'} retrieved ${data.fetchedAt.slice(0, 10)}. Source dates may be older. | CatalogEnrichment(); data &amp;&amp; |
| [src/components/catalog/CatalogEnrichment.tsx:131](../src/components/catalog/CatalogEnrichment.tsx#L131) | Message/fragment | Cached public details | CatalogEnrichment(); data &amp;&amp;; cached is true |
| [src/components/catalog/CatalogEnrichment.tsx:131](../src/components/catalog/CatalogEnrichment.tsx#L131) | Message/fragment | Public details | CatalogEnrichment(); data &amp;&amp;; cached is false |
| [src/components/catalog/CatalogEnrichment.tsx:135](../src/components/catalog/CatalogEnrichment.tsx#L135) | Label/help | Separate external game ratings | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true |
| [src/components/catalog/CatalogEnrichment.tsx:139](../src/components/catalog/CatalogEnrichment.tsx#L139) | Rendered copy | ${rating.publisher} | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true |
| [src/components/catalog/CatalogEnrichment.tsx:140](../src/components/catalog/CatalogEnrichment.tsx#L140) | Rendered copy | ${formatExternalScore(rating.score.text)} | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true |
| [src/components/catalog/CatalogEnrichment.tsx:142](../src/components/catalog/CatalogEnrichment.tsx#L142) | Rendered copy | ${compactRatingContext(rating)} | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true |
| [src/components/catalog/CatalogEnrichment.tsx:144](../src/components/catalog/CatalogEnrichment.tsx#L144) | Rendered copy | Source details for ${rating.publisher} | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true |
| [src/components/catalog/CatalogEnrichment.tsx:145](../src/components/catalog/CatalogEnrichment.tsx#L145) | Rendered copy | Original score: ${rating.score.text} | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true; expanded "Source details for ${rating.publisher}" disclosure |
| [src/components/catalog/CatalogEnrichment.tsx:146](../src/components/catalog/CatalogEnrichment.tsx#L146) | Rendered copy | ${rating.platforms.length ? rating.platforms.join(' / ') : 'Platform not specified'} ${rating.method ? &#96; · ${rating.method}&#96; : ' · Review method not specified'} | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true; expanded "Source details for ${rating.publisher}" disclosure |
| [src/components/catalog/CatalogEnrichment.tsx:147](../src/components/catalog/CatalogEnrichment.tsx#L147) | Message/fragment | Platform not specified | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true; expanded "Source details for ${rating.publisher}" disclosure; rating.platforms.length is false |
| [src/components/catalog/CatalogEnrichment.tsx:148](../src/components/catalog/CatalogEnrichment.tsx#L148) | Message/fragment | · Review method not specified | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true; expanded "Source details for ${rating.publisher}" disclosure; rating.method is false |
| [src/components/catalog/CatalogEnrichment.tsx:150](../src/components/catalog/CatalogEnrichment.tsx#L150) | Rendered copy | ${rating.count === null ? 'Review count not supplied' : &#96;${rating.count.toLocaleString()} ${rating.source === 'steam' ? 'Steam reviews' : 'source reviews or ratings'}&#96;} · ${rating.asOf ? ( &lt;&gt; As of &lt;time dateTime={rating.asOf}&gt;{rating.asOf}&lt;/time&gt; &lt;/&gt; ) : ( 'Score date not supplied' )} | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true; expanded "Source details for ${rating.publisher}" disclosure |
| [src/components/catalog/CatalogEnrichment.tsx:152](../src/components/catalog/CatalogEnrichment.tsx#L152) | Message/fragment | Review count not supplied | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true; expanded "Source details for ${rating.publisher}" disclosure; rating.count === null is true |
| [src/components/catalog/CatalogEnrichment.tsx:153](../src/components/catalog/CatalogEnrichment.tsx#L153) | Message/fragment | ${rating.count.toLocaleString()} ${rating.source === 'steam' ? 'Steam reviews' : 'source reviews or ratings'} | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true; expanded "Source details for ${rating.publisher}" disclosure; rating.count === null is false |
| [src/components/catalog/CatalogEnrichment.tsx:160](../src/components/catalog/CatalogEnrichment.tsx#L160) | Message/fragment | Score date not supplied | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true; expanded "Source details for ${rating.publisher}" disclosure; rating.asOf is false |
| [src/components/catalog/CatalogEnrichment.tsx:164](../src/components/catalog/CatalogEnrichment.tsx#L164) | Rendered copy | Source reference retrieved ${rating.referenceDate}. | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true; expanded "Source details for ${rating.publisher}" disclosure; rating.referenceDate &amp;&amp; |
| [src/components/catalog/CatalogEnrichment.tsx:168](../src/components/catalog/CatalogEnrichment.tsx#L168) | Rendered copy | Retrieved ${rating.retrievedAt.slice(0, 10)}. | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true; expanded "Source details for ${rating.publisher}" disclosure |
| [src/components/catalog/CatalogEnrichment.tsx:172](../src/components/catalog/CatalogEnrichment.tsx#L172) | Rendered copy | ${rating.source === 'steam' ? 'View Steam reviews' : 'View Wikidata score claims'} | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true; expanded "Source details for ${rating.publisher}" disclosure |
| [src/components/catalog/CatalogEnrichment.tsx:173](../src/components/catalog/CatalogEnrichment.tsx#L173) | Message/fragment | View Steam reviews | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true; expanded "Source details for ${rating.publisher}" disclosure; rating.source === 'steam' is true |
| [src/components/catalog/CatalogEnrichment.tsx:173](../src/components/catalog/CatalogEnrichment.tsx#L173) | Message/fragment | View Wikidata score claims | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true; expanded "Source details for ${rating.publisher}" disclosure; rating.source === 'steam' is false |
| [src/components/catalog/CatalogEnrichment.tsx:177](../src/components/catalog/CatalogEnrichment.tsx#L177) | Rendered copy | Cited source | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is true; expanded "Source details for ${rating.publisher}" disclosure; rating.referenceUrl &amp;&amp; |
| [src/components/catalog/CatalogEnrichment.tsx:189](../src/components/catalog/CatalogEnrichment.tsx#L189) | Rendered copy | ${ratingSourceFailed ? "We couldn't check every rating source. Retry to check for scores." : 'No supported external ratings are available for this exact game.'} Missing scores are not zero. | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is false; status !== 'loading' &amp;&amp; |
| [src/components/catalog/CatalogEnrichment.tsx:191](../src/components/catalog/CatalogEnrichment.tsx#L191) | Message/fragment | We couldn't check every rating source. Retry to check for scores. | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is false; status !== 'loading' &amp;&amp;; ratingSourceFailed is true |
| [src/components/catalog/CatalogEnrichment.tsx:192](../src/components/catalog/CatalogEnrichment.tsx#L192) | Message/fragment | No supported external ratings are available for this exact game. | CatalogEnrichment(); data &amp;&amp;; data.ratings.length is false; status !== 'loading' &amp;&amp;; ratingSourceFailed is false |
| [src/components/catalog/CatalogEnrichment.tsx:198](../src/components/catalog/CatalogEnrichment.tsx#L198) | Rendered copy | Coverage and sources | CatalogEnrichment(); data &amp;&amp; |
| [src/components/catalog/CatalogEnrichment.tsx:199](../src/components/catalog/CatalogEnrichment.tsx#L199) | Rendered copy | Wikidata structured claims are CC0 and may be incomplete. Steam user recommendations are not critic scores. No scores are averaged together. | CatalogEnrichment(); data &amp;&amp;; expanded "Coverage and sources" disclosure |
| [src/components/catalog/CatalogEnrichment.tsx:201](../src/components/catalog/CatalogEnrichment.tsx#L201) | Rendered copy | CC0 | CatalogEnrichment(); data &amp;&amp;; expanded "Coverage and sources" disclosure |
| [src/components/catalog/CatalogEnrichment.tsx:207](../src/components/catalog/CatalogEnrichment.tsx#L207) | Rendered copy | ${source.source === 'commons' ? 'Wikimedia Commons' : source.source === 'freetogame' ? 'FreeToGame' : source.source === 'steam' ? 'Steam' : 'Wikidata'} : ${source.message} ${source.retryAfter &gt; 0 ? &#96; Retry after at least ${source.retryAfter} seconds.&#96; : ''} | CatalogEnrichment(); data &amp;&amp;; expanded "Coverage and sources" disclosure |
| [src/components/catalog/CatalogEnrichment.tsx:208](../src/components/catalog/CatalogEnrichment.tsx#L208) | Rendered copy | ${source.source === 'commons' ? 'Wikimedia Commons' : source.source === 'freetogame' ? 'FreeToGame' : source.source === 'steam' ? 'Steam' : 'Wikidata'} : | CatalogEnrichment(); data &amp;&amp;; expanded "Coverage and sources" disclosure |
| [src/components/catalog/CatalogEnrichment.tsx:210](../src/components/catalog/CatalogEnrichment.tsx#L210) | Message/fragment | Wikimedia Commons | CatalogEnrichment(); data &amp;&amp;; expanded "Coverage and sources" disclosure; source.source === 'commons' is true |
| [src/components/catalog/CatalogEnrichment.tsx:212](../src/components/catalog/CatalogEnrichment.tsx#L212) | Message/fragment | FreeToGame | CatalogEnrichment(); data &amp;&amp;; expanded "Coverage and sources" disclosure; source.source === 'commons' is false; source.source === 'freetogame' is true |
| [src/components/catalog/CatalogEnrichment.tsx:214](../src/components/catalog/CatalogEnrichment.tsx#L214) | Message/fragment | Steam | CatalogEnrichment(); data &amp;&amp;; expanded "Coverage and sources" disclosure; source.source === 'commons' is false; source.source === 'freetogame' is false; source.source === 'steam' is true |
| [src/components/catalog/CatalogEnrichment.tsx:215](../src/components/catalog/CatalogEnrichment.tsx#L215) | Message/fragment | Wikidata | CatalogEnrichment(); data &amp;&amp;; expanded "Coverage and sources" disclosure; source.source === 'commons' is false; source.source === 'freetogame' is false; source.source === 'steam' is false |
| [src/components/catalog/CatalogEnrichment.tsx:219](../src/components/catalog/CatalogEnrichment.tsx#L219) | Message/fragment | Retry after at least ${source.retryAfter} seconds. | CatalogEnrichment(); data &amp;&amp;; expanded "Coverage and sources" disclosure; source.retryAfter &gt; 0 is true |
| [src/components/catalog/CatalogEnrichment.tsx:226](../src/components/catalog/CatalogEnrichment.tsx#L226) | Live region | ${source.source === 'steam' ? 'Steam' : source.source === 'commons' ? 'Artwork' : 'Review source'}: ${source.message} | CatalogEnrichment(); data &amp;&amp; |
| [src/components/catalog/CatalogEnrichment.tsx:227](../src/components/catalog/CatalogEnrichment.tsx#L227) | Message/fragment | Artwork | CatalogEnrichment(); data &amp;&amp;; source.source === 'steam' is false; source.source === 'commons' is true |
| [src/components/catalog/CatalogEnrichment.tsx:227](../src/components/catalog/CatalogEnrichment.tsx#L227) | Message/fragment | Review source | CatalogEnrichment(); data &amp;&amp;; source.source === 'steam' is false; source.source === 'commons' is false |
| [src/components/catalog/CatalogEnrichment.tsx:227](../src/components/catalog/CatalogEnrichment.tsx#L227) | Message/fragment | Steam | CatalogEnrichment(); data &amp;&amp;; source.source === 'steam' is true |
| [src/components/catalog/CatalogEnrichment.tsx:237](../src/components/catalog/CatalogEnrichment.tsx#L237) | Label/help | Retry public details | CatalogEnrichment(); when its owning surface/operation is used |
## src/components/catalog/CatalogSourceStatus.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/catalog/CatalogSourceStatus.tsx:42](../src/components/catalog/CatalogSourceStatus.tsx#L42) | Rendered copy | ${label} | CatalogRetry(); when its owning surface/operation is used |
| [src/components/catalog/CatalogSourceStatus.tsx:78](../src/components/catalog/CatalogSourceStatus.tsx#L78) | Live region | ${SOURCE_LABELS[source.source]} ${source.status === 'loading' ? 'Loading…' : source.status === 'error' ? source.failure === 'timeout' ? 'Timed out' : source.failure === 'rate-limited' ? 'Rate limited' : source.failure === 'offline' ? 'Offline' : 'Source unavailable' : count === 0 ? 'No new online matches' : &#96;${count} new online ${count === 1 ? 'match' : 'matches'}&#96;} | SourceStatus(); when its owning surface/operation is used |
| [src/components/catalog/CatalogSourceStatus.tsx:79](../src/components/catalog/CatalogSourceStatus.tsx#L79) | Rendered copy | ${SOURCE_LABELS[source.source]} | SourceStatus(); when its owning surface/operation is used |
| [src/components/catalog/CatalogSourceStatus.tsx:90](../src/components/catalog/CatalogSourceStatus.tsx#L90) | Rendered copy | ${source.status === 'loading' ? 'Loading…' : source.status === 'error' ? source.failure === 'timeout' ? 'Timed out' : source.failure === 'rate-limited' ? 'Rate limited' : source.failure === 'offline' ? 'Offline' : 'Source unavailable' : count === 0 ? 'No new online matches' : &#96;${count} new online ${count === 1 ? 'match' : 'matches'}&#96;} | SourceStatus(); when its owning surface/operation is used |
| [src/components/catalog/CatalogSourceStatus.tsx:92](../src/components/catalog/CatalogSourceStatus.tsx#L92) | Message/fragment | Loading… | SourceStatus(); source.status === 'loading' is true |
| [src/components/catalog/CatalogSourceStatus.tsx:95](../src/components/catalog/CatalogSourceStatus.tsx#L95) | Message/fragment | Timed out | SourceStatus(); source.status === 'loading' is false; source.status === 'error' is true; source.failure === 'timeout' is true |
| [src/components/catalog/CatalogSourceStatus.tsx:97](../src/components/catalog/CatalogSourceStatus.tsx#L97) | Message/fragment | Rate limited | SourceStatus(); source.status === 'loading' is false; source.status === 'error' is true; source.failure === 'timeout' is false; source.failure === 'rate-limited' is true |
| [src/components/catalog/CatalogSourceStatus.tsx:99](../src/components/catalog/CatalogSourceStatus.tsx#L99) | Message/fragment | Offline | SourceStatus(); source.status === 'loading' is false; source.status === 'error' is true; source.failure === 'timeout' is false; source.failure === 'rate-limited' is false; source.failure === 'offline' is true |
| [src/components/catalog/CatalogSourceStatus.tsx:100](../src/components/catalog/CatalogSourceStatus.tsx#L100) | Message/fragment | Source unavailable | SourceStatus(); source.status === 'loading' is false; source.status === 'error' is true; source.failure === 'timeout' is false; source.failure === 'rate-limited' is false; source.failure === 'offline' is false |
| [src/components/catalog/CatalogSourceStatus.tsx:102](../src/components/catalog/CatalogSourceStatus.tsx#L102) | Message/fragment | No new online matches | SourceStatus(); source.status === 'loading' is false; source.status === 'error' is false; count === 0 is true |
| [src/components/catalog/CatalogSourceStatus.tsx:103](../src/components/catalog/CatalogSourceStatus.tsx#L103) | Message/fragment | ${count} new online ${count === 1 ? 'match' : 'matches'} | SourceStatus(); source.status === 'loading' is false; source.status === 'error' is false; count === 0 is false |
| [src/components/catalog/CatalogSourceStatus.tsx:107](../src/components/catalog/CatalogSourceStatus.tsx#L107) | Live region | ${source.error} | SourceStatus(); source.error &amp;&amp; |
| [src/components/catalog/CatalogSourceStatus.tsx:112](../src/components/catalog/CatalogSourceStatus.tsx#L112) | Rendered copy | Previous from ${SOURCE_LABELS[source.source]} | SourceStatus(); onPrevious &amp;&amp; source.requestOffset &gt; 0 &amp;&amp; |
| [src/components/catalog/CatalogSourceStatus.tsx:125](../src/components/catalog/CatalogSourceStatus.tsx#L125) | Label/help | {&#96;Retry ${SOURCE_LABELS[source.source]}&#96;} | SourceStatus(); when its owning surface/operation is used |
| [src/components/catalog/CatalogSourceStatus.tsx:125](../src/components/catalog/CatalogSourceStatus.tsx#L125) | Message/fragment | Retry ${SOURCE_LABELS[source.source]} | SourceStatus(); when its owning surface/operation is used |
| [src/components/catalog/CatalogSourceStatus.tsx:130](../src/components/catalog/CatalogSourceStatus.tsx#L130) | Rendered copy | More from ${SOURCE_LABELS[source.source]} | SourceStatus(); source.status !== 'error' &amp;&amp; source.nextOffset !== null &amp;&amp; |
| [src/components/catalog/CatalogSourceStatus.tsx:142](../src/components/catalog/CatalogSourceStatus.tsx#L142) | Label/help | {&#96;Source details for ${SOURCE_LABELS[source.source]}&#96;} | SourceStatus(); source.notices.length &gt; 0 &amp;&amp; |
| [src/components/catalog/CatalogSourceStatus.tsx:142](../src/components/catalog/CatalogSourceStatus.tsx#L142) | Rendered copy | Source details | SourceStatus(); source.notices.length &gt; 0 &amp;&amp; |
| [src/components/catalog/CatalogSourceStatus.tsx:142](../src/components/catalog/CatalogSourceStatus.tsx#L142) | Message/fragment | Source details for ${SOURCE_LABELS[source.source]} | SourceStatus(); source.notices.length &gt; 0 &amp;&amp; |
| [src/components/catalog/CatalogSourceStatus.tsx:144](../src/components/catalog/CatalogSourceStatus.tsx#L144) | Rendered copy | ${notice} | SourceStatus(); source.notices.length &gt; 0 &amp;&amp;; expanded "Source details" disclosure |
| [src/components/catalog/CatalogSourceStatus.tsx:154](../src/components/catalog/CatalogSourceStatus.tsx#L154) | Label/help | Online catalog status | CatalogSourceStatus(); when its owning surface/operation is used |
## src/components/catalog/DiscoverControls.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/catalog/DiscoverControls.tsx:56](../src/components/catalog/DiscoverControls.tsx#L56) | Rendered copy | Find a game | DiscoverFilters(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:64](../src/components/catalog/DiscoverControls.tsx#L64) | Label/help | Search games, studios or aliases… | DiscoverFilters(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:80](../src/components/catalog/DiscoverControls.tsx#L80) | Label/help | Clear search | DiscoverFilters(); filters.q &amp;&amp; |
| [src/components/catalog/DiscoverControls.tsx:88](../src/components/catalog/DiscoverControls.tsx#L88) | Rendered copy | ${showCollection ? 'Including original entries from The 100 once, alongside other games.' : 'Discover games beyond The 100. Matches already in the collection open their original entry.'} | DiscoverFilters(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:90](../src/components/catalog/DiscoverControls.tsx#L90) | Message/fragment | Including original entries from The 100 once, alongside other games. | DiscoverFilters(); showCollection is true |
| [src/components/catalog/DiscoverControls.tsx:91](../src/components/catalog/DiscoverControls.tsx#L91) | Message/fragment | Discover games beyond The 100. Matches already in the collection open their original entry. | DiscoverFilters(); showCollection is false |
| [src/components/catalog/DiscoverControls.tsx:94](../src/components/catalog/DiscoverControls.tsx#L94) | Rendered copy | Include The 100 | DiscoverFilters(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:117](../src/components/catalog/DiscoverControls.tsx#L117) | Label/help | Genre family | DiscoverFilters(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:129](../src/components/catalog/DiscoverControls.tsx#L129) | Rendered copy | All families | DiscoverFilters(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:131](../src/components/catalog/DiscoverControls.tsx#L131) | Rendered copy | ${label} | DiscoverFilters(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:139](../src/components/catalog/DiscoverControls.tsx#L139) | Label/help | Year | DiscoverFilters(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:143](../src/components/catalog/DiscoverControls.tsx#L143) | Rendered copy | Any year | DiscoverFilters(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:144](../src/components/catalog/DiscoverControls.tsx#L144) | Rendered copy | ${filters.year} | DiscoverFilters(); filters.year &amp;&amp; !years.includes(Number(filters.year)) &amp;&amp; |
| [src/components/catalog/DiscoverControls.tsx:146](../src/components/catalog/DiscoverControls.tsx#L146) | Rendered copy | ${year} | DiscoverFilters(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:152](../src/components/catalog/DiscoverControls.tsx#L152) | Label/help | Source | DiscoverFilters(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:169](../src/components/catalog/DiscoverControls.tsx#L169) | Rendered copy | All sources | DiscoverFilters(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:170](../src/components/catalog/DiscoverControls.tsx#L170) | Rendered copy | The 100 | DiscoverFilters(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:171](../src/components/catalog/DiscoverControls.tsx#L171) | Rendered copy | Wikidata | DiscoverFilters(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:172](../src/components/catalog/DiscoverControls.tsx#L172) | Rendered copy | FreeToGame | DiscoverFilters(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:175](../src/components/catalog/DiscoverControls.tsx#L175) | Rendered copy | A game can belong to more than one family. | DiscoverFilters(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:179](../src/components/catalog/DiscoverControls.tsx#L179) | Rendered copy | Exact source genre | DiscoverFilters(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:180](../src/components/catalog/DiscoverControls.tsx#L180) | Rendered copy | Families group the genres supplied by each source. Other includes unclear or missing genres. Changing family clears the exact source genre below. | DiscoverFilters(); expanded "Exact source genre" disclosure |
| [src/components/catalog/DiscoverControls.tsx:185](../src/components/catalog/DiscoverControls.tsx#L185) | Rendered copy | Exact source genre Any source genre ${filters.genre &amp;&amp; !genres.includes(filters.genre) &amp;&amp; &lt;option&gt;{filters.genre}&lt;/option&gt;} ${genres.map((genre) =&gt; ( &lt;option key={genre}&gt;{genre}&lt;/option&gt; ))} | DiscoverFilters(); expanded "Exact source genre" disclosure |
| [src/components/catalog/DiscoverControls.tsx:191](../src/components/catalog/DiscoverControls.tsx#L191) | Rendered copy | Any source genre | DiscoverFilters(); expanded "Exact source genre" disclosure |
| [src/components/catalog/DiscoverControls.tsx:192](../src/components/catalog/DiscoverControls.tsx#L192) | Rendered copy | ${filters.genre} | DiscoverFilters(); expanded "Exact source genre" disclosure; filters.genre &amp;&amp; !genres.includes(filters.genre) &amp;&amp; |
| [src/components/catalog/DiscoverControls.tsx:194](../src/components/catalog/DiscoverControls.tsx#L194) | Rendered copy | ${genre} | DiscoverFilters(); expanded "Exact source genre" disclosure |
| [src/components/catalog/DiscoverControls.tsx:199](../src/components/catalog/DiscoverControls.tsx#L199) | Rendered copy | Original labels are unchanged. An exact genre narrows the selected family; choose All families to search every exact label. | DiscoverFilters(); expanded "Exact source genre" disclosure |
| [src/components/catalog/DiscoverControls.tsx:205](../src/components/catalog/DiscoverControls.tsx#L205) | Rendered copy | Clear filters | DiscoverFilters(); activeFilters &gt; 0 &amp;&amp; |
| [src/components/catalog/DiscoverControls.tsx:245](../src/components/catalog/DiscoverControls.tsx#L245) | Rendered copy | Showing entries from The 100. Choose another source to look beyond the collection. | DiscoverSources(); filters.source === 'collection' is true |
| [src/components/catalog/DiscoverControls.tsx:247](../src/components/catalog/DiscoverControls.tsx#L247) | Rendered copy | Online lookup is paused for this progress view. Your play history is not sent to catalog sources. | DiscoverSources(); filters.source === 'collection' is false; progressView !== 'all' is true |
| [src/components/catalog/DiscoverControls.tsx:249](../src/components/catalog/DiscoverControls.tsx#L249) | Rendered copy | Online lookup is off. Search online | DiscoverSources(); filters.source === 'collection' is false; progressView !== 'all' is false; filters.catalogs === 'off' is true |
| [src/components/catalog/DiscoverControls.tsx:251](../src/components/catalog/DiscoverControls.tsx#L251) | Rendered copy | Search online | DiscoverSources(); filters.source === 'collection' is false; progressView !== 'all' is false; filters.catalogs === 'off' is true |
| [src/components/catalog/DiscoverControls.tsx:257](../src/components/catalog/DiscoverControls.tsx#L257) | Rendered copy | Search online | DiscoverSources(); filters.source === 'collection' is false; progressView !== 'all' is false; filters.catalogs === 'off' is false; !remoteEnabled &amp;&amp; |
| [src/components/catalog/DiscoverControls.tsx:264](../src/components/catalog/DiscoverControls.tsx#L264) | Rendered copy | Back to catalog | DiscoverSources(); filters.online === 'on' &amp;&amp; progressView === 'all' &amp;&amp; |
| [src/components/catalog/DiscoverControls.tsx:276](../src/components/catalog/DiscoverControls.tsx#L276) | Rendered copy | Search options &amp; sources | DiscoverSources(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverControls.tsx:277](../src/components/catalog/DiscoverControls.tsx#L277) | Rendered copy | Look online when local matches are limited | DiscoverSources(); expanded "Search options &amp; sources" disclosure |
| [src/components/catalog/DiscoverControls.tsx:286](../src/components/catalog/DiscoverControls.tsx#L286) | Rendered copy | Verified matches link to the original entry from The 100, including when found through Wikidata. Include The 100 to browse those entries here once. Other editions stay separate; titles alone are never merged. Source counts show new matches after local filters and duplicate matching. | DiscoverSources(); expanded "Search options &amp; sources" disclosure |
| [src/components/catalog/DiscoverControls.tsx:291](../src/components/catalog/DiscoverControls.tsx#L291) | Rendered copy | Only public search terms and exact public game IDs are sent to catalog sources, not your saved progress, ratings or notes. Opening an eligible game can load separately labelled ratings and licensed artwork while online lookup is on. Metadata from Wikidata (CC0) and FreeToGame. Image credits are under each game's More actions or in its details. | DiscoverSources(); expanded "Search options &amp; sources" disclosure |
| [src/components/catalog/DiscoverControls.tsx:297](../src/components/catalog/DiscoverControls.tsx#L297) | Label/help | Public catalog sources | DiscoverSources(); expanded "Search options &amp; sources" disclosure |
| [src/components/catalog/DiscoverControls.tsx:298](../src/components/catalog/DiscoverControls.tsx#L298) | Rendered copy | Wikidata (CC0) | DiscoverSources(); expanded "Search options &amp; sources" disclosure |
| [src/components/catalog/DiscoverControls.tsx:307](../src/components/catalog/DiscoverControls.tsx#L307) | Rendered copy | FreeToGame | DiscoverSources(); expanded "Search options &amp; sources" disclosure |
## src/components/catalog/DiscoverPage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/catalog/DiscoverPage.tsx:135](../src/components/catalog/DiscoverPage.tsx#L135) | Message/fragment | ${localPage.start}–${localPage.end} of ${local.length} catalog games | localRange(); localReady &amp;&amp; filters.online === 'auto' &amp;&amp; local.length &gt; DISCOVERY_PAGE_SIZE is true |
| [src/components/catalog/DiscoverPage.tsx:137](../src/components/catalog/DiscoverPage.tsx#L137) | Message/fragment | ${records.length} catalog ${records.length === 1 ? 'match' : 'matches'} shown | localRange(); localReady &amp;&amp; filters.online === 'auto' &amp;&amp; local.length &gt; DISCOVERY_PAGE_SIZE is false; filters.q.trim() &#124;&#124; filters.online === 'on' is true |
| [src/components/catalog/DiscoverPage.tsx:138](../src/components/catalog/DiscoverPage.tsx#L138) | Message/fragment | ${local.length} ${local.length === 1 ? 'game' : 'games'} · Illustrated first | localRange(); localReady &amp;&amp; filters.online === 'auto' &amp;&amp; local.length &gt; DISCOVERY_PAGE_SIZE is false; filters.q.trim() &#124;&#124; filters.online === 'on' is false |
| [src/components/catalog/DiscoverPage.tsx:140](../src/components/catalog/DiscoverPage.tsx#L140) | Message/fragment | Loading the catalog… | catalogStatus(); catalogLoading is true |
| [src/components/catalog/DiscoverPage.tsx:142](../src/components/catalog/DiscoverPage.tsx#L142) | Message/fragment | Catalog unavailable | catalogStatus(); catalogLoading is false; collection.status === 'error' is true |
| [src/components/catalog/DiscoverPage.tsx:144](../src/components/catalog/DiscoverPage.tsx#L144) | Message/fragment | Catalog incomplete | catalogStatus(); catalogLoading is false; collection.status === 'error' is false; seed.error &amp;&amp; filters.source !== 'collection' is true |
| [src/components/catalog/DiscoverPage.tsx:149](../src/components/catalog/DiscoverPage.tsx#L149) | Rendered copy | Discover | DiscoverPage(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverPage.tsx:152](../src/components/catalog/DiscoverPage.tsx#L152) | Rendered copy | My games | DiscoverPage(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverPage.tsx:168](../src/components/catalog/DiscoverPage.tsx#L168) | Rendered copy | Catalog games | DiscoverPage(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverPage.tsx:171](../src/components/catalog/DiscoverPage.tsx#L171) | Live region | ${catalogStatus} | DiscoverPage(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverPage.tsx:175](../src/components/catalog/DiscoverPage.tsx#L175) | Label/help | Catalog view | DiscoverPage(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverPage.tsx:178](../src/components/catalog/DiscoverPage.tsx#L178) | Label/help | Grid view | DiscoverPage(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverPage.tsx:186](../src/components/catalog/DiscoverPage.tsx#L186) | Label/help | List view | DiscoverPage(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverPage.tsx:193](../src/components/catalog/DiscoverPage.tsx#L193) | Rendered copy | ${selecting ? 'Done selecting' : 'Select games'} | DiscoverPage(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverPage.tsx:202](../src/components/catalog/DiscoverPage.tsx#L202) | Message/fragment | Done selecting | DiscoverPage(); selecting is true |
| [src/components/catalog/DiscoverPage.tsx:202](../src/components/catalog/DiscoverPage.tsx#L202) | Message/fragment | Select games | DiscoverPage(); selecting is false |
| [src/components/catalog/DiscoverPage.tsx:207](../src/components/catalog/DiscoverPage.tsx#L207) | Live region | ${navigationError} | DiscoverPage(); navigationError &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:212](../src/components/catalog/DiscoverPage.tsx#L212) | Live region | Saving your rating before changing results… | DiscoverPage(); saving &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:218](../src/components/catalog/DiscoverPage.tsx#L218) | Rendered copy | Already in The 100 | DiscoverPage(); !showCollection &amp;&amp; filters.q.trim() &amp;&amp; collectionMatches.length &gt; 0 &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:219](../src/components/catalog/DiscoverPage.tsx#L219) | Rendered copy | Open the original collection entry. Its artwork, original scores and your existing opinions are unchanged. | DiscoverPage(); !showCollection &amp;&amp; filters.q.trim() &amp;&amp; collectionMatches.length &gt; 0 &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:225](../src/components/catalog/DiscoverPage.tsx#L225) | Rendered copy | ${record.title} | DiscoverPage(); !showCollection &amp;&amp; filters.q.trim() &amp;&amp; collectionMatches.length &gt; 0 &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:249](../src/components/catalog/DiscoverPage.tsx#L249) | Rendered copy | Show all ${collectionMatches.length} collection matches | DiscoverPage(); !showCollection &amp;&amp; filters.q.trim() &amp;&amp; collectionMatches.length &gt; 0 &amp;&amp;; collectionMatches.length &gt; 8 &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:256](../src/components/catalog/DiscoverPage.tsx#L256) | Rendered copy | Selection applies to this page. Changing pages or filters clears the selection. | DiscoverPage(); selecting &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:274](../src/components/catalog/DiscoverPage.tsx#L274) | Live region | The 100 could not load. ${collection.error} Reload it before browsing so matching catalog games use the original entry. Reload The 100 | DiscoverPage(); collection.status === 'error' &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:275](../src/components/catalog/DiscoverPage.tsx#L275) | Rendered copy | The 100 could not load. ${collection.error} Reload it before browsing so matching catalog games use the original entry. | DiscoverPage(); collection.status === 'error' &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:279](../src/components/catalog/DiscoverPage.tsx#L279) | Rendered copy | Reload The 100 | DiscoverPage(); collection.status === 'error' &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:285](../src/components/catalog/DiscoverPage.tsx#L285) | Label/help | The catalog tools didn't load. | DiscoverPage(); seed.moduleError is true |
| [src/components/catalog/DiscoverPage.tsx:288](../src/components/catalog/DiscoverPage.tsx#L288) | Live region | ${seed.error} The 100 remains searchable. ${!connected ? 'Reconnect before reloading the catalog or searching online.' : filters.catalogs === 'off' ? 'Online lookup is off.' : remoteEnabled ? remote.loading ? 'Trying online catalogs instead.' : 'Online catalog results and source status are below.' : 'Change your search or filters to look online.'} Reload local catalog | DiscoverPage(); seed.moduleError is false; seed.error &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:289](../src/components/catalog/DiscoverPage.tsx#L289) | Rendered copy | ${seed.error} The 100 remains searchable. ${!connected ? 'Reconnect before reloading the catalog or searching online.' : filters.catalogs === 'off' ? 'Online lookup is off.' : remoteEnabled ? remote.loading ? 'Trying online catalogs instead.' : 'Online catalog results and source status are below.' : 'Change your search or filters to look online.'} | DiscoverPage(); seed.moduleError is false; seed.error &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:292](../src/components/catalog/DiscoverPage.tsx#L292) | Message/fragment | Reconnect before reloading the catalog or searching online. | DiscoverPage(); seed.moduleError is false; seed.error &amp;&amp;; !connected is true |
| [src/components/catalog/DiscoverPage.tsx:294](../src/components/catalog/DiscoverPage.tsx#L294) | Message/fragment | Online lookup is off. | DiscoverPage(); seed.moduleError is false; seed.error &amp;&amp;; !connected is false; filters.catalogs === 'off' is true |
| [src/components/catalog/DiscoverPage.tsx:297](../src/components/catalog/DiscoverPage.tsx#L297) | Message/fragment | Trying online catalogs instead. | DiscoverPage(); seed.moduleError is false; seed.error &amp;&amp;; !connected is false; filters.catalogs === 'off' is false; remoteEnabled is true; remote.loading is true |
| [src/components/catalog/DiscoverPage.tsx:298](../src/components/catalog/DiscoverPage.tsx#L298) | Message/fragment | Online catalog results and source status are below. | DiscoverPage(); seed.moduleError is false; seed.error &amp;&amp;; !connected is false; filters.catalogs === 'off' is false; remoteEnabled is true; remote.loading is false |
| [src/components/catalog/DiscoverPage.tsx:299](../src/components/catalog/DiscoverPage.tsx#L299) | Message/fragment | Change your search or filters to look online. | DiscoverPage(); seed.moduleError is false; seed.error &amp;&amp;; !connected is false; filters.catalogs === 'off' is false; remoteEnabled is false |
| [src/components/catalog/DiscoverPage.tsx:301](../src/components/catalog/DiscoverPage.tsx#L301) | Rendered copy | Reload local catalog | DiscoverPage(); seed.moduleError is false; seed.error &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:335](../src/components/catalog/DiscoverPage.tsx#L335) | Label/help | Discovered games | DiscoverPage(); records.length &gt; 0 &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:368](../src/components/catalog/DiscoverPage.tsx#L368) | Rendered copy | ${remote.loading ? 'Looking online…' : failed ? 'Online search is incomplete' : seed.error ? 'The catalog could not load' : filters.offset &gt; 0 ? 'No games on this page' : !showCollection &amp;&amp; collectionMatches.length &amp;&amp; filters.q.trim() ? 'No additional games outside The 100' : 'No matching games'} | DiscoverPage(); collection.status === 'ready' &amp;&amp; localReady &amp;&amp; !records.length &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:370](../src/components/catalog/DiscoverPage.tsx#L370) | Message/fragment | Looking online… | DiscoverPage(); collection.status === 'ready' &amp;&amp; localReady &amp;&amp; !records.length &amp;&amp;; remote.loading is true |
| [src/components/catalog/DiscoverPage.tsx:372](../src/components/catalog/DiscoverPage.tsx#L372) | Message/fragment | Online search is incomplete | DiscoverPage(); collection.status === 'ready' &amp;&amp; localReady &amp;&amp; !records.length &amp;&amp;; remote.loading is false; failed is true |
| [src/components/catalog/DiscoverPage.tsx:374](../src/components/catalog/DiscoverPage.tsx#L374) | Message/fragment | The catalog could not load | DiscoverPage(); collection.status === 'ready' &amp;&amp; localReady &amp;&amp; !records.length &amp;&amp;; remote.loading is false; failed is false; seed.error is true |
| [src/components/catalog/DiscoverPage.tsx:376](../src/components/catalog/DiscoverPage.tsx#L376) | Message/fragment | No games on this page | DiscoverPage(); collection.status === 'ready' &amp;&amp; localReady &amp;&amp; !records.length &amp;&amp;; remote.loading is false; failed is false; seed.error is false; filters.offset &gt; 0 is true |
| [src/components/catalog/DiscoverPage.tsx:378](../src/components/catalog/DiscoverPage.tsx#L378) | Message/fragment | No additional games outside The 100 | DiscoverPage(); collection.status === 'ready' &amp;&amp; localReady &amp;&amp; !records.length &amp;&amp;; remote.loading is false; failed is false; seed.error is false; filters.offset &gt; 0 is false; !showCollection &amp;&amp; collectionMatches.length &amp;&amp; filters.q.trim() is true |
| [src/components/catalog/DiscoverPage.tsx:379](../src/components/catalog/DiscoverPage.tsx#L379) | Message/fragment | No matching games | DiscoverPage(); collection.status === 'ready' &amp;&amp; localReady &amp;&amp; !records.length &amp;&amp;; remote.loading is false; failed is false; seed.error is false; filters.offset &gt; 0 is false; !showCollection &amp;&amp; collectionMatches.length &amp;&amp; filters.q.trim() is false |
| [src/components/catalog/DiscoverPage.tsx:381](../src/components/catalog/DiscoverPage.tsx#L381) | Rendered copy | ${failed ? 'Retry a source below or change your search.' : 'Try a shorter title, clear a filter, or add a game manually.'} | DiscoverPage(); collection.status === 'ready' &amp;&amp; localReady &amp;&amp; !records.length &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:383](../src/components/catalog/DiscoverPage.tsx#L383) | Message/fragment | Retry a source below or change your search. | DiscoverPage(); collection.status === 'ready' &amp;&amp; localReady &amp;&amp; !records.length &amp;&amp;; failed is true |
| [src/components/catalog/DiscoverPage.tsx:384](../src/components/catalog/DiscoverPage.tsx#L384) | Message/fragment | Try a shorter title, clear a filter, or add a game manually. | DiscoverPage(); collection.status === 'ready' &amp;&amp; localReady &amp;&amp; !records.length &amp;&amp;; failed is false |
| [src/components/catalog/DiscoverPage.tsx:386](../src/components/catalog/DiscoverPage.tsx#L386) | Rendered copy | Reset search and filters | DiscoverPage(); collection.status === 'ready' &amp;&amp; localReady &amp;&amp; !records.length &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:396](../src/components/catalog/DiscoverPage.tsx#L396) | Label/help | Catalog pages | DiscoverPage(); filters.online === 'auto' &amp;&amp; localReady &amp;&amp; localPage.pageCount &gt; 1 &amp;&amp; |
| [src/components/catalog/DiscoverPage.tsx:417](../src/components/catalog/DiscoverPage.tsx#L417) | Label/help | Add to My games | DiscoverPage(); when its owning surface/operation is used |
| [src/components/catalog/DiscoverPage.tsx:421](../src/components/catalog/DiscoverPage.tsx#L421) | Rendered copy | Explore shared rankings | DiscoverPage(); onCommunity &amp;&amp; |
## src/components/catalog/DiscoveryCard.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/catalog/DiscoveryCard.tsx:121](../src/components/catalog/DiscoveryCard.tsx#L121) | Label/help | {artwork.alt} | DiscoveryCard(); game is false; artwork &amp;&amp; failedSrc !== artwork.src is true |
| [src/components/catalog/DiscoveryCard.tsx:128](../src/components/catalog/DiscoveryCard.tsx#L128) | Rendered copy | ${record.year} | DiscoveryCard(); game is false; artwork &amp;&amp; failedSrc !== artwork.src is false; record.year !== null &amp;&amp; |
| [src/components/catalog/DiscoveryCard.tsx:129](../src/components/catalog/DiscoveryCard.tsx#L129) | Rendered copy | ${record.title} | DiscoveryCard(); game is false; artwork &amp;&amp; failedSrc !== artwork.src is false; artwork &amp;&amp; failedSrc === artwork.src &amp;&amp; |
| [src/components/catalog/DiscoveryCard.tsx:139](../src/components/catalog/DiscoveryCard.tsx#L139) | Label/help | {&#96;Select ${record.title}&#96;} | DiscoveryCard(); selecting &amp;&amp; onSelect &amp;&amp; |
| [src/components/catalog/DiscoveryCard.tsx:139](../src/components/catalog/DiscoveryCard.tsx#L139) | Message/fragment | Select ${record.title} | DiscoveryCard(); selecting &amp;&amp; onSelect &amp;&amp; |
| [src/components/catalog/DiscoveryCard.tsx:145](../src/components/catalog/DiscoveryCard.tsx#L145) | Rendered copy | ${onPreview ? ( &lt;button {...compare.titleProps} type="button" onClick={preview}&gt; {record.title} &lt;/button&gt; ) : ( record.title )} | DiscoveryCard(); when its owning surface/operation is used |
| [src/components/catalog/DiscoveryCard.tsx:147](../src/components/catalog/DiscoveryCard.tsx#L147) | Rendered copy | ${record.title} | DiscoveryCard(); onPreview is true |
| [src/components/catalog/DiscoveryCard.tsx:155](../src/components/catalog/DiscoveryCard.tsx#L155) | Rendered copy | From The 100 · #${game.rank} ${author.shortName}'s rating ${authorRatingText(game.authorRating)} ${game.authorRating ? ' / 10' : ''} | DiscoveryCard(); game &amp;&amp; |
| [src/components/catalog/DiscoveryCard.tsx:157](../src/components/catalog/DiscoveryCard.tsx#L157) | Rendered copy | ${author.shortName}'s rating ${authorRatingText(game.authorRating)} ${game.authorRating ? ' / 10' : ''} | DiscoveryCard(); game &amp;&amp; |
| [src/components/catalog/DiscoveryCard.tsx:159](../src/components/catalog/DiscoveryCard.tsx#L159) | Label/help | {game.authorRating?.rawValue} | DiscoveryCard(); game &amp;&amp; |
| [src/components/catalog/DiscoveryCard.tsx:159](../src/components/catalog/DiscoveryCard.tsx#L159) | Rendered copy | ${authorRatingText(game.authorRating)} ${game.authorRating ? ' / 10' : ''} | DiscoveryCard(); game &amp;&amp; |
| [src/components/catalog/DiscoveryCard.tsx:166](../src/components/catalog/DiscoveryCard.tsx#L166) | Rendered copy | ${[ CATALOG_EDITION_HINTS.get(record.id) ?? record.year, catalogGenreLabel(record), showSource ? SOURCE_LABELS[record.source] : null, ] .filter((value) =&gt; value !== null) .join(' · ') &#124;&#124; 'Game'} | DiscoveryCard(); when its owning surface/operation is used |
| [src/components/catalog/DiscoveryCard.tsx:173](../src/components/catalog/DiscoveryCard.tsx#L173) | Message/fragment | Game | DiscoveryCard(); [ CATALOG_EDITION_HINTS.get(record.id) ?? record.year, catalogGenreLabel(record), showSource ? SOURCE_LABELS[record.source] : null, ] .filter((value) =&gt; value !== null) .join(' · ') &#124;&#124; |
| [src/components/catalog/DiscoveryCard.tsx:176](../src/components/catalog/DiscoveryCard.tsx#L176) | Rendered copy | ${saved ? 'In My games' : 'Add to My games'} | DiscoveryCard(); when its owning surface/operation is used |
| [src/components/catalog/DiscoveryCard.tsx:179](../src/components/catalog/DiscoveryCard.tsx#L179) | Label/help | {&#96;${saved ? 'In My games' : 'Add to My games'}: ${record.title}&#96;} | DiscoveryCard(); when its owning surface/operation is used |
| [src/components/catalog/DiscoveryCard.tsx:179](../src/components/catalog/DiscoveryCard.tsx#L179) | Message/fragment | ${saved ? 'In My games' : 'Add to My games'}: ${record.title} | DiscoveryCard(); when its owning surface/operation is used |
| [src/components/catalog/DiscoveryCard.tsx:185](../src/components/catalog/DiscoveryCard.tsx#L185) | Message/fragment | Add to My games | DiscoveryCard(); saved is false |
| [src/components/catalog/DiscoveryCard.tsx:185](../src/components/catalog/DiscoveryCard.tsx#L185) | Message/fragment | In My games | DiscoveryCard(); saved is true |
| [src/components/catalog/DiscoveryCard.tsx:193](../src/components/catalog/DiscoveryCard.tsx#L193) | Label/help | {&#96;More actions for ${record.title}&#96;} | DiscoveryCard(); when its owning surface/operation is used |
| [src/components/catalog/DiscoveryCard.tsx:193](../src/components/catalog/DiscoveryCard.tsx#L193) | Rendered copy | More actions | DiscoveryCard(); when its owning surface/operation is used |
| [src/components/catalog/DiscoveryCard.tsx:193](../src/components/catalog/DiscoveryCard.tsx#L193) | Message/fragment | More actions for ${record.title} | DiscoveryCard(); when its owning surface/operation is used |
| [src/components/catalog/DiscoveryCard.tsx:198](../src/components/catalog/DiscoveryCard.tsx#L198) | Label/help | {record.title} | DiscoveryCard(); expanded "More actions" disclosure |
| [src/components/catalog/DiscoveryCard.tsx:207](../src/components/catalog/DiscoveryCard.tsx#L207) | Label/help | {record.title} | DiscoveryCard(); expanded "More actions" disclosure |
| [src/components/catalog/DiscoveryCard.tsx:214](../src/components/catalog/DiscoveryCard.tsx#L214) | Rendered copy | Play later | DiscoveryCard(); expanded "More actions" disclosure |
| [src/components/catalog/DiscoveryCard.tsx:217](../src/components/catalog/DiscoveryCard.tsx#L217) | Label/help | {&#96;Play later: ${record.title}&#96;} | DiscoveryCard(); expanded "More actions" disclosure |
| [src/components/catalog/DiscoveryCard.tsx:217](../src/components/catalog/DiscoveryCard.tsx#L217) | Message/fragment | Play later: ${record.title} | DiscoveryCard(); expanded "More actions" disclosure |
| [src/components/catalog/DiscoveryCard.tsx:226](../src/components/catalog/DiscoveryCard.tsx#L226) | Rendered copy | ${ranking ? 'In your ranking' : 'Add to my ranking'} | DiscoveryCard(); expanded "More actions" disclosure |
| [src/components/catalog/DiscoveryCard.tsx:234](../src/components/catalog/DiscoveryCard.tsx#L234) | Message/fragment | Add to my ranking | DiscoveryCard(); expanded "More actions" disclosure; ranking is false |
| [src/components/catalog/DiscoveryCard.tsx:234](../src/components/catalog/DiscoveryCard.tsx#L234) | Message/fragment | In your ranking | DiscoveryCard(); expanded "More actions" disclosure; ranking is true |
| [src/components/catalog/DiscoveryCard.tsx:238](../src/components/catalog/DiscoveryCard.tsx#L238) | Label/help | {record.title} | DiscoveryCard(); expanded "More actions" disclosure |
| [src/components/catalog/DiscoveryCard.tsx:245](../src/components/catalog/DiscoveryCard.tsx#L245) | Rendered copy | ${record.studio} | DiscoveryCard(); expanded "More actions" disclosure; record.studio &amp;&amp; |
| [src/components/catalog/DiscoveryCard.tsx:247](../src/components/catalog/DiscoveryCard.tsx#L247) | Rendered copy | Source classification: ${record.genre ?? 'Not provided'} | DiscoveryCard(); expanded "More actions" disclosure; record.source !== 'collection' &amp;&amp; record.source !== 'manual' &amp;&amp; |
| [src/components/catalog/DiscoveryCard.tsx:248](../src/components/catalog/DiscoveryCard.tsx#L248) | Message/fragment | Not provided | DiscoveryCard(); expanded "More actions" disclosure; record.source !== 'collection' &amp;&amp; record.source !== 'manual' &amp;&amp;; record.genre ?? |
| [src/components/catalog/DiscoveryCard.tsx:248](../src/components/catalog/DiscoveryCard.tsx#L248) | Rendered copy | Source classification: | DiscoveryCard(); expanded "More actions" disclosure; record.source !== 'collection' &amp;&amp; record.source !== 'manual' &amp;&amp; |
| [src/components/catalog/DiscoveryCard.tsx:252](../src/components/catalog/DiscoveryCard.tsx#L252) | Rendered copy | Game data: ${SOURCE_LABELS[record.source]} | DiscoveryCard(); expanded "More actions" disclosure; record.sourceUrl is true |
| [src/components/catalog/DiscoveryCard.tsx:257](../src/components/catalog/DiscoveryCard.tsx#L257) | Rendered copy | ${SOURCE_LABELS[record.source]} | DiscoveryCard(); expanded "More actions" disclosure; record.sourceUrl is false |
| [src/components/catalog/DiscoveryCard.tsx:260](../src/components/catalog/DiscoveryCard.tsx#L260) | Rendered copy | Original collection metadata and workbook artwork. | DiscoveryCard(); expanded "More actions" disclosure; game is true |
| [src/components/catalog/DiscoveryCard.tsx:264](../src/components/catalog/DiscoveryCard.tsx#L264) | Rendered copy | ${artwork.credit} | DiscoveryCard(); expanded "More actions" disclosure; game is false; artwork &amp;&amp; |
| [src/components/catalog/DiscoveryCard.tsx:265](../src/components/catalog/DiscoveryCard.tsx#L265) | Rendered copy | Image source | DiscoveryCard(); expanded "More actions" disclosure; game is false; artwork &amp;&amp; |
| [src/components/catalog/DiscoveryCard.tsx:269](../src/components/catalog/DiscoveryCard.tsx#L269) | Rendered copy | ${artwork.license} | DiscoveryCard(); expanded "More actions" disclosure; game is false; artwork &amp;&amp; |
## src/components/catalog/ExtendedResults.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/catalog/ExtendedResults.tsx:90](../src/components/catalog/ExtendedResults.tsx#L90) | Label/help | Unranked games in this view | content(); records.length &gt; 0 &amp;&amp; |
| [src/components/catalog/ExtendedResults.tsx:111](../src/components/catalog/ExtendedResults.tsx#L111) | Label/help | Saved game artwork couldn't load. Your games are still available. | content(); artworkFailed &amp;&amp; missingArtworkIds.length &gt; 0 &amp;&amp; |
| [src/components/catalog/ExtendedResults.tsx:114](../src/components/catalog/ExtendedResults.tsx#L114) | Rendered copy | Show ${Math.min(24, records.length - limit)} more games | content(); records.length &gt; limit &amp;&amp; |
| [src/components/catalog/ExtendedResults.tsx:121](../src/components/catalog/ExtendedResults.tsx#L121) | Live region | ${online.seedError} Saved games remain available. Reload local catalog | content(); online.eligible &amp;&amp;; online.seedError &amp;&amp; |
| [src/components/catalog/ExtendedResults.tsx:122](../src/components/catalog/ExtendedResults.tsx#L122) | Rendered copy | ${online.seedError} Saved games remain available. | content(); online.eligible &amp;&amp;; online.seedError &amp;&amp; |
| [src/components/catalog/ExtendedResults.tsx:123](../src/components/catalog/ExtendedResults.tsx#L123) | Rendered copy | Reload local catalog | content(); online.eligible &amp;&amp;; online.seedError &amp;&amp; |
| [src/components/catalog/ExtendedResults.tsx:129](../src/components/catalog/ExtendedResults.tsx#L129) | Rendered copy | Search online | content(); online.eligible &amp;&amp;; !online.remoteEnabled &amp;&amp; |
| [src/components/catalog/ExtendedResults.tsx:142](../src/components/catalog/ExtendedResults.tsx#L142) | Live region | ${online.loading ? 'Searching catalogs…' : failed ? 'Online search is incomplete. Retry a source or search your saved games.' : 'No additional matches. Try a shorter title or broader filters.'} | content(); !records.length &amp;&amp; |
| [src/components/catalog/ExtendedResults.tsx:144](../src/components/catalog/ExtendedResults.tsx#L144) | Message/fragment | Searching catalogs… | content(); !records.length &amp;&amp;; online.loading is true |
| [src/components/catalog/ExtendedResults.tsx:146](../src/components/catalog/ExtendedResults.tsx#L146) | Message/fragment | Online search is incomplete. Retry a source or search your saved games. | content(); !records.length &amp;&amp;; online.loading is false; failed is true |
| [src/components/catalog/ExtendedResults.tsx:147](../src/components/catalog/ExtendedResults.tsx#L147) | Message/fragment | No additional matches. Try a shorter title or broader filters. | content(); !records.length &amp;&amp;; online.loading is false; failed is false |
| [src/components/catalog/ExtendedResults.tsx:157](../src/components/catalog/ExtendedResults.tsx#L157) | Rendered copy | Beyond The 100 | ExtendedResults(); embedded is false |
| [src/components/catalog/ExtendedResults.tsx:158](../src/components/catalog/ExtendedResults.tsx#L158) | Rendered copy | ${extendedResultCount(records.length, queryKey, online.loading)} | ExtendedResults(); embedded is false |
## src/components/catalog/SavedCatalogCopies.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/catalog/SavedCatalogCopies.tsx:18](../src/components/catalog/SavedCatalogCopies.tsx#L18) | Rendered copy | ${copies.some((copy) =&gt; copy.id === canonicalId) ? 'You also have a separate saved catalog copy.' : 'Progress and ratings use your existing saved catalog copy.'} | SavedCatalogCopies(); when its owning surface/operation is used |
| [src/components/catalog/SavedCatalogCopies.tsx:20](../src/components/catalog/SavedCatalogCopies.tsx#L20) | Message/fragment | You also have a separate saved catalog copy. | SavedCatalogCopies(); copies.some((copy) =&gt; copy.id === canonicalId) is true |
| [src/components/catalog/SavedCatalogCopies.tsx:21](../src/components/catalog/SavedCatalogCopies.tsx#L21) | Message/fragment | Progress and ratings use your existing saved catalog copy. | SavedCatalogCopies(); copies.some((copy) =&gt; copy.id === canonicalId) is false |
| [src/components/catalog/SavedCatalogCopies.tsx:24](../src/components/catalog/SavedCatalogCopies.tsx#L24) | Rendered copy | Open saved copy${legacy.length &gt; 1 ? &#96; (${SOURCE_LABELS[copy.source]})&#96; : ''} | SavedCatalogCopies(); when its owning surface/operation is used |
| [src/components/catalog/SavedCatalogCopies.tsx:29](../src/components/catalog/SavedCatalogCopies.tsx#L29) | Label/help | {&#96;Open saved copy (${SOURCE_LABELS[copy.source]}) of ${copy.title}&#96;} | SavedCatalogCopies(); when its owning surface/operation is used |
| [src/components/catalog/SavedCatalogCopies.tsx:29](../src/components/catalog/SavedCatalogCopies.tsx#L29) | Message/fragment | Open saved copy (${SOURCE_LABELS[copy.source]}) of ${copy.title} | SavedCatalogCopies(); when its owning surface/operation is used |
## src/components/ChunkRecovery.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/ChunkRecovery.tsx:15](../src/components/ChunkRecovery.tsx#L15) | Message/fragment | Reload this page | ChunkRecovery(); when its owning surface/operation is used |
| [src/components/ChunkRecovery.tsx:38](../src/components/ChunkRecovery.tsx#L38) | Live region | ${message} | ChunkRecovery(); when its owning surface/operation is used |
| [src/components/ChunkRecovery.tsx:39](../src/components/ChunkRecovery.tsx#L39) | Live region | ${notice} | ChunkRecovery(); when its owning surface/operation is used |
| [src/components/ChunkRecovery.tsx:40](../src/components/ChunkRecovery.tsx#L40) | Rendered copy | ${label} | ChunkRecovery(); when its owning surface/operation is used |
| [src/components/ChunkRecovery.tsx:50](../src/components/ChunkRecovery.tsx#L50) | Message output | 'Checking saved work and your connection…' | ChunkRecovery(); onClick |
| [src/components/ChunkRecovery.tsx:50](../src/components/ChunkRecovery.tsx#L50) | Message/fragment | Checking saved work and your connection… | ChunkRecovery(); onClick |
| [src/components/ChunkRecovery.tsx:63](../src/components/ChunkRecovery.tsx#L63) | Message output | kept ? unsavedRecoveryMessage : result === 'offline' ? offlineRecoveryMessage : result === 'unavailable' ? unavailableRecoveryMessage : '' | ChunkRecovery(); onClick; active.current is true |
| [src/components/ChunkRecovery.tsx:78](../src/components/ChunkRecovery.tsx#L78) | Message output | unsavedRecoveryMessage | ChunkRecovery(); onClick; active.current is true |
| [src/components/ChunkRecovery.tsx:90](../src/components/ChunkRecovery.tsx#L90) | Rendered copy | Keep editing | ChunkRecovery(); blocked &amp;&amp; |
| [src/components/ChunkRecovery.tsx:95](../src/components/ChunkRecovery.tsx#L95) | Message output | 'Reload cancelled. Your work is unchanged.' | ChunkRecovery(); blocked &amp;&amp;; onClick |
| [src/components/ChunkRecovery.tsx:95](../src/components/ChunkRecovery.tsx#L95) | Message/fragment | Reload cancelled. Your work is unchanged. | ChunkRecovery(); blocked &amp;&amp;; onClick |
## src/components/CollectionArtifact.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/CollectionArtifact.tsx:254](../src/components/CollectionArtifact.tsx#L254) | Message/fragment | Illustrated view · 3D unavailable | loadScene(); operation rejected or threw |
| [src/components/CollectionArtifact.tsx:347](../src/components/CollectionArtifact.tsx#L347) | Message/fragment | Illustrated view · reduced motion | explanation(); motionReduced is true |
| [src/components/CollectionArtifact.tsx:350](../src/components/CollectionArtifact.tsx#L350) | Message/fragment | Illustrated view | explanation(); motionReduced is false; quality === 'lite' is true; pending is true |
| [src/components/CollectionArtifact.tsx:351](../src/components/CollectionArtifact.tsx#L351) | Message/fragment | Illustrated view · Lite mode | explanation(); motionReduced is false; quality === 'lite' is true; pending is false |
| [src/components/CollectionArtifact.tsx:353](../src/components/CollectionArtifact.tsx#L353) | Message/fragment | Illustrated view · saving resources | explanation(); motionReduced is false; quality === 'lite' is false; quality === 'auto' &amp;&amp; constrained is true |
| [src/components/CollectionArtifact.tsx:355](../src/components/CollectionArtifact.tsx#L355) | Message/fragment | Illustrated view · tap Fan out for 3D | explanation(); motionReduced is false; quality === 'lite' is false; quality === 'auto' &amp;&amp; constrained is false; needsInteraction is true |
| [src/components/CollectionArtifact.tsx:356](../src/components/CollectionArtifact.tsx#L356) | Message/fragment | Illustrated view | explanation(); motionReduced is false; quality === 'lite' is false; quality === 'auto' &amp;&amp; constrained is false; needsInteraction is false; state.reason ??; state.ready is false |
| [src/components/CollectionArtifact.tsx:366](../src/components/CollectionArtifact.tsx#L366) | Label/help | {motifShown ? 'Static sleeve motif' : undefined} | CollectionArtifact(); when its owning surface/operation is used |
| [src/components/CollectionArtifact.tsx:366](../src/components/CollectionArtifact.tsx#L366) | Message/fragment | Static sleeve motif | CollectionArtifact(); motifShown is true |
| [src/components/CollectionArtifact.tsx:379](../src/components/CollectionArtifact.tsx#L379) | Rendered copy | ${motifShown ? 'Static sleeve motif' : 'The 100 game sleeves'} | CollectionArtifact(); when its owning surface/operation is used |
| [src/components/CollectionArtifact.tsx:379](../src/components/CollectionArtifact.tsx#L379) | Message/fragment | Static sleeve motif | CollectionArtifact(); motifShown is true |
| [src/components/CollectionArtifact.tsx:379](../src/components/CollectionArtifact.tsx#L379) | Message/fragment | The 100 game sleeves | CollectionArtifact(); motifShown is false |
| [src/components/CollectionArtifact.tsx:380](../src/components/CollectionArtifact.tsx#L380) | Rendered copy | ${motifShown ? 'Art unavailable' : explanation} | CollectionArtifact(); when its owning surface/operation is used |
| [src/components/CollectionArtifact.tsx:380](../src/components/CollectionArtifact.tsx#L380) | Message/fragment | Art unavailable | CollectionArtifact(); motifShown is true |
| [src/components/CollectionArtifact.tsx:383](../src/components/CollectionArtifact.tsx#L383) | Rendered copy | ${fanned ? ( &lt;path d="m3 7 7-4 7 4-7 4-7-4Zm0 3 7 4 7-4M3 13l7 4 7-4" /&gt; ) : ( &lt;path d="m2 11 3-6 4 2M7 15 6 7l7-1 1 8-7 1Zm6-10 4 1-2 8" /&gt; )} ${fanned ? 'Stack up' : 'Fan out'} | CollectionArtifact(); canInteract &amp;&amp; |
| [src/components/CollectionArtifact.tsx:394](../src/components/CollectionArtifact.tsx#L394) | Label/help | {fanned ? 'Stack up the collection sleeves' : 'Fan out the collection sleeves'} | CollectionArtifact(); canInteract &amp;&amp; |
| [src/components/CollectionArtifact.tsx:394](../src/components/CollectionArtifact.tsx#L394) | Message/fragment | Fan out the collection sleeves | CollectionArtifact(); canInteract &amp;&amp;; fanned is false |
| [src/components/CollectionArtifact.tsx:394](../src/components/CollectionArtifact.tsx#L394) | Message/fragment | Stack up the collection sleeves | CollectionArtifact(); canInteract &amp;&amp;; fanned is true |
| [src/components/CollectionArtifact.tsx:410](../src/components/CollectionArtifact.tsx#L410) | Message/fragment | Fan out | CollectionArtifact(); canInteract &amp;&amp;; fanned is false |
| [src/components/CollectionArtifact.tsx:410](../src/components/CollectionArtifact.tsx#L410) | Message/fragment | Stack up | CollectionArtifact(); canInteract &amp;&amp;; fanned is true |
## src/components/CollectionControls.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/CollectionControls.tsx:115](../src/components/CollectionControls.tsx#L115) | Label/help | The collection, 100 | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:117](../src/components/CollectionControls.tsx#L117) | Rendered copy | · 100 games | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:121](../src/components/CollectionControls.tsx#L121) | Rendered copy | Share this view | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:127](../src/components/CollectionControls.tsx#L127) | Rendered copy | Search games, studios or genres | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:137](../src/components/CollectionControls.tsx#L137) | Label/help | Game, studio or genre… | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:149](../src/components/CollectionControls.tsx#L149) | Label/help | Clear search | CollectionControls(); filters.q is true |
| [src/components/CollectionControls.tsx:157](../src/components/CollectionControls.tsx#L157) | Label/help | Filters &amp; sort | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:158](../src/components/CollectionControls.tsx#L158) | Label/help | Your collection views | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:159](../src/components/CollectionControls.tsx#L159) | Rendered copy | All games ${games.length + addedCount} | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:161](../src/components/CollectionControls.tsx#L161) | Label/help | {&#96;All games, ${games.length + addedCount}&#96;} | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:161](../src/components/CollectionControls.tsx#L161) | Message/fragment | All games, ${games.length + addedCount} | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:165](../src/components/CollectionControls.tsx#L165) | Rendered copy | ${games.length + addedCount} | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:167](../src/components/CollectionControls.tsx#L167) | Rendered copy | Play later ${savedCount} | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:169](../src/components/CollectionControls.tsx#L169) | Label/help | {&#96;Play later, ${savedCount}&#96;} | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:169](../src/components/CollectionControls.tsx#L169) | Message/fragment | Play later, ${savedCount} | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:173](../src/components/CollectionControls.tsx#L173) | Rendered copy | ${savedCount} | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:175](../src/components/CollectionControls.tsx#L175) | Rendered copy | Completed ${completedCount} | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:177](../src/components/CollectionControls.tsx#L177) | Label/help | {&#96;Completed, ${completedCount}&#96;} | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:181](../src/components/CollectionControls.tsx#L181) | Rendered copy | ${completedCount} | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:187](../src/components/CollectionControls.tsx#L187) | Rendered copy | Your progress, including games you added beyond The 100. | CollectionControls(); (filters.list !== 'all' &#124;&#124; progress !== 'all') &amp;&amp; |
| [src/components/CollectionControls.tsx:189](../src/components/CollectionControls.tsx#L189) | Rendered copy | Open my full library | CollectionControls(); (filters.list !== 'all' &#124;&#124; progress !== 'all') &amp;&amp;; onFullLibrary &amp;&amp; |
| [src/components/CollectionControls.tsx:199](../src/components/CollectionControls.tsx#L199) | Label/help | Genre | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:203](../src/components/CollectionControls.tsx#L203) | Rendered copy | All genres | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:205](../src/components/CollectionControls.tsx#L205) | Rendered copy | ${label} | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:212](../src/components/CollectionControls.tsx#L212) | Label/help | Year | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:217](../src/components/CollectionControls.tsx#L217) | Rendered copy | All years | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:219](../src/components/CollectionControls.tsx#L219) | Rendered copy | ${filters.year} (not loaded) | CollectionControls(); filters.year &amp;&amp; !years.includes(Number(filters.year)) &amp;&amp; |
| [src/components/CollectionControls.tsx:222](../src/components/CollectionControls.tsx#L222) | Rendered copy | ${year} | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:227](../src/components/CollectionControls.tsx#L227) | Label/help | Collection | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:234](../src/components/CollectionControls.tsx#L234) | Rendered copy | All games | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:235](../src/components/CollectionControls.tsx#L235) | Rendered copy | Core 50 · #1–50 | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:236](../src/components/CollectionControls.tsx#L236) | Rendered copy | Essential 50 · #51–100 | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:241](../src/components/CollectionControls.tsx#L241) | Label/help | Sort | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:248](../src/components/CollectionControls.tsx#L248) | Rendered copy | Collection rank | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:249](../src/components/CollectionControls.tsx#L249) | Rendered copy | Title | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:250](../src/components/CollectionControls.tsx#L250) | Rendered copy | Newest first | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:251](../src/components/CollectionControls.tsx#L251) | Rendered copy | Oldest first | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:252](../src/components/CollectionControls.tsx#L252) | Rendered copy | Critic snapshot average | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:253](../src/components/CollectionControls.tsx#L253) | Rendered copy | ${author.shortName}'s original rating | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:255](../src/components/CollectionControls.tsx#L255) | Rendered copy | ${label} score | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:259](../src/components/CollectionControls.tsx#L259) | Rendered copy | Legacy rank-derived index | CollectionControls(); filters.sort === 'rank-index' &amp;&amp; |
| [src/components/CollectionControls.tsx:263](../src/components/CollectionControls.tsx#L263) | Rendered copy | Exact source genre | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:266](../src/components/CollectionControls.tsx#L266) | Label/help | Exact genre label | CollectionControls(); expanded "Exact source genre" disclosure |
| [src/components/CollectionControls.tsx:270](../src/components/CollectionControls.tsx#L270) | Rendered copy | All source labels | CollectionControls(); expanded "Exact source genre" disclosure |
| [src/components/CollectionControls.tsx:272](../src/components/CollectionControls.tsx#L272) | Rendered copy | ${filters.genre} (not loaded) | CollectionControls(); expanded "Exact source genre" disclosure; filters.genre &amp;&amp; ![...genres.curated, ...genres.saved].includes(filters.genre) &amp;&amp; |
| [src/components/CollectionControls.tsx:275](../src/components/CollectionControls.tsx#L275) | Rendered copy | ${genre} | CollectionControls(); expanded "Exact source genre" disclosure |
| [src/components/CollectionControls.tsx:278](../src/components/CollectionControls.tsx#L278) | Label/help | Saved additions | CollectionControls(); expanded "Exact source genre" disclosure; genres.saved.length &gt; 0 &amp;&amp; |
| [src/components/CollectionControls.tsx:280](../src/components/CollectionControls.tsx#L280) | Rendered copy | ${genre} | CollectionControls(); expanded "Exact source genre" disclosure; genres.saved.length &gt; 0 &amp;&amp; |
| [src/components/CollectionControls.tsx:287](../src/components/CollectionControls.tsx#L287) | Rendered copy | Search public catalogs | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:297](../src/components/CollectionControls.tsx#L297) | Rendered copy | ${!onlineScope ? 'Online lookup is paused in this view. Matching saved games still appear.' : filters.catalogs === 'off' ? 'Online lookup is off. Only The 100 and saved additions are searched.' : filters.q.trim().length &gt; 80 ? 'Online lookup: 80 characters maximum. Local games are still searched.' : 'Enter 2+ characters to search Wikidata and FreeToGame. Only your query is sent.'} | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:299](../src/components/CollectionControls.tsx#L299) | Message/fragment | Online lookup is paused in this view. Matching saved games still appear. | CollectionControls(); !onlineScope is true |
| [src/components/CollectionControls.tsx:301](../src/components/CollectionControls.tsx#L301) | Message/fragment | Online lookup is off. Only The 100 and saved additions are searched. | CollectionControls(); !onlineScope is false; filters.catalogs === 'off' is true |
| [src/components/CollectionControls.tsx:303](../src/components/CollectionControls.tsx#L303) | Message/fragment | Online lookup: 80 characters maximum. Local games are still searched. | CollectionControls(); !onlineScope is false; filters.catalogs === 'off' is false; filters.q.trim().length &gt; 80 is true |
| [src/components/CollectionControls.tsx:304](../src/components/CollectionControls.tsx#L304) | Message/fragment | Enter 2+ characters to search Wikidata and FreeToGame. Only your query is sent. | CollectionControls(); !onlineScope is false; filters.catalogs === 'off' is false; filters.q.trim().length &gt; 80 is false |
| [src/components/CollectionControls.tsx:310](../src/components/CollectionControls.tsx#L310) | Live region | ${count - unrankedCount} in The 100 ${unrankedCount &gt; 0 ? ( &lt;&gt; · {unrankedCount} beyond The 100&lt;/&gt; ) : !activeFilters &amp;&amp; filters.sort === 'rank' &amp;&amp; filters.direction !== 'desc' ? ( &#96;, in ${author.shortName}'s order&#96; ) : ( '' )} ${searching &amp;&amp; &lt;span className="result-breakdown"&gt;Searching public catalogs…&lt;/span&gt;} | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:311](../src/components/CollectionControls.tsx#L311) | Rendered copy | ${count - unrankedCount} | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:315](../src/components/CollectionControls.tsx#L315) | Message/fragment | , in ${author.shortName}'s order | CollectionControls(); unrankedCount &gt; 0 is false; !activeFilters &amp;&amp; filters.sort === 'rank' &amp;&amp; filters.direction !== 'desc' is true |
| [src/components/CollectionControls.tsx:319](../src/components/CollectionControls.tsx#L319) | Rendered copy | Searching public catalogs… | CollectionControls(); searching &amp;&amp; |
| [src/components/CollectionControls.tsx:322](../src/components/CollectionControls.tsx#L322) | Rendered copy | Reset filters | CollectionControls(); activeFilters &amp;&amp; |
| [src/components/CollectionControls.tsx:334](../src/components/CollectionControls.tsx#L334) | Label/help | Display layout | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:337](../src/components/CollectionControls.tsx#L337) | Label/help | Grid view | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:345](../src/components/CollectionControls.tsx#L345) | Label/help | List view | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:353](../src/components/CollectionControls.tsx#L353) | Label/help | Ratings table view | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:366](../src/components/CollectionControls.tsx#L366) | Rendered copy | ${selecting ? 'Done selecting' : 'Select multiple games'} | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:368](../src/components/CollectionControls.tsx#L368) | Message/fragment | Done selecting | CollectionControls(); selecting is true |
| [src/components/CollectionControls.tsx:368](../src/components/CollectionControls.tsx#L368) | Message/fragment | Select multiple games | CollectionControls(); selecting is false |
| [src/components/CollectionControls.tsx:370](../src/components/CollectionControls.tsx#L370) | Rendered copy | Download Excel | CollectionControls(); when its owning surface/operation is used |
| [src/components/CollectionControls.tsx:375](../src/components/CollectionControls.tsx#L375) | Rendered copy | Workbook snapshot, not live scores. | CollectionControls(); filters.sort === 'score' &amp;&amp; |
## src/components/CollectionExtrasFallback.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/CollectionExtrasFallback.tsx:19](../src/components/CollectionExtrasFallback.tsx#L19) | Message/fragment | Rank | columns(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:20](../src/components/CollectionExtrasFallback.tsx#L20) | Message/fragment | Game | columns(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:21](../src/components/CollectionExtrasFallback.tsx#L21) | Message/fragment | Year | columns(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:24](../src/components/CollectionExtrasFallback.tsx#L24) | Message/fragment | Average | columns(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:28](../src/components/CollectionExtrasFallback.tsx#L28) | Live region | Loading ratings table… | TableFallback(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:32](../src/components/CollectionExtrasFallback.tsx#L32) | Rendered copy | ${author.shortName}'s rank-based workbook ratings are separate from critic scores. — means unavailable. Critic averages include both Metacritic columns. Edit your own ratings in My games → Ranking. | TableFallback(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:35](../src/components/CollectionExtrasFallback.tsx#L35) | Rendered copy | My games → Ranking | TableFallback(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:51](../src/components/CollectionExtrasFallback.tsx#L51) | Rendered copy | ${label} ${scale &amp;&amp; &lt;small&gt;{scale}&lt;/small&gt;} | TableFallback(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:53](../src/components/CollectionExtrasFallback.tsx#L53) | Rendered copy | ${scale} | TableFallback(); scale &amp;&amp; |
| [src/components/CollectionExtrasFallback.tsx:79](../src/components/CollectionExtrasFallback.tsx#L79) | Rendered copy | #${String(game.rank).padStart(2, '0')} | TableFallback(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:80](../src/components/CollectionExtrasFallback.tsx#L80) | Rendered copy | ${game.title} | TableFallback(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:82](../src/components/CollectionExtrasFallback.tsx#L82) | Rendered copy | ${game.genre} · ${game.tier === 'core' ? 'Core 50' : 'Essential 50'} | TableFallback(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:99](../src/components/CollectionExtrasFallback.tsx#L99) | Rendered copy | Played | TableFallback(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:101](../src/components/CollectionExtrasFallback.tsx#L101) | Rendered copy | Completed | TableFallback(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:136](../src/components/CollectionExtrasFallback.tsx#L136) | Live region | Loading additional games… | ExtendedFallback(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:145](../src/components/CollectionExtrasFallback.tsx#L145) | Rendered copy | ${record.year ?? 'Game'} | ExtendedFallback(); !online.artwork.has(record.id) &amp;&amp; |
| [src/components/CollectionExtrasFallback.tsx:145](../src/components/CollectionExtrasFallback.tsx#L145) | Message/fragment | Game | ExtendedFallback(); !online.artwork.has(record.id) &amp;&amp;; record.year ?? |
| [src/components/CollectionExtrasFallback.tsx:146](../src/components/CollectionExtrasFallback.tsx#L146) | Rendered copy | Artwork unavailable | ExtendedFallback(); !online.artwork.has(record.id) &amp;&amp; |
| [src/components/CollectionExtrasFallback.tsx:152](../src/components/CollectionExtrasFallback.tsx#L152) | Rendered copy | ${record.title} | ExtendedFallback(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:154](../src/components/CollectionExtrasFallback.tsx#L154) | Rendered copy | ${[record.year, catalogGenreLabel(record)].filter((value) =&gt; value !== null).join(' · ') &#124;&#124; 'Game'} | ExtendedFallback(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:155](../src/components/CollectionExtrasFallback.tsx#L155) | Message/fragment | Game | ExtendedFallback(); [record.year, catalogGenreLabel(record)].filter((value) =&gt; value !== null).join(' · ') &#124;&#124; |
| [src/components/CollectionExtrasFallback.tsx:158](../src/components/CollectionExtrasFallback.tsx#L158) | Rendered copy | ${state.records[record.id] ? 'In My games' : 'Add to My games'} | ExtendedFallback(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:160](../src/components/CollectionExtrasFallback.tsx#L160) | Message/fragment | Add to My games | ExtendedFallback(); state.records[record.id] is false |
| [src/components/CollectionExtrasFallback.tsx:160](../src/components/CollectionExtrasFallback.tsx#L160) | Message/fragment | In My games | ExtendedFallback(); state.records[record.id] is true |
| [src/components/CollectionExtrasFallback.tsx:163](../src/components/CollectionExtrasFallback.tsx#L163) | Rendered copy | Pin | ExtendedFallback(); onPin &amp;&amp; |
| [src/components/CollectionExtrasFallback.tsx:170](../src/components/CollectionExtrasFallback.tsx#L170) | Rendered copy | More actions | ExtendedFallback(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:178](../src/components/CollectionExtrasFallback.tsx#L178) | Rendered copy | Search online | ExtendedFallback(); online.eligible &amp;&amp; !online.remoteEnabled &amp;&amp; |
| [src/components/CollectionExtrasFallback.tsx:188](../src/components/CollectionExtrasFallback.tsx#L188) | Rendered copy | Loading additional games… | ExtendedFallback(); !records.length &amp;&amp; |
| [src/components/CollectionExtrasFallback.tsx:194](../src/components/CollectionExtrasFallback.tsx#L194) | Message/fragment | The original order, ratings and workbook. | filmSummaries(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:198](../src/components/CollectionExtrasFallback.tsx#L198) | Message/fragment | Find games, pin a shortlist and compare shared rankings. | filmSummaries(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:216](../src/components/CollectionExtrasFallback.tsx#L216) | Rendered copy | ${film.title} | FilmsFallback(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:217](../src/components/CollectionExtrasFallback.tsx#L217) | Rendered copy | ${film.description} | FilmsFallback(); when its owning surface/operation is used |
| [src/components/CollectionExtrasFallback.tsx:218](../src/components/CollectionExtrasFallback.tsx#L218) | Rendered copy | 0:22 · Watch film | FilmsFallback(); when its owning surface/operation is used |
## src/components/CollectionFilms.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/CollectionFilms.tsx:18](../src/components/CollectionFilms.tsx#L18) | Error/validation | Listing thumbnails are missing for ${film.id}. | FilmPoster(); !smallest is true |
| [src/components/CollectionFilms.tsx:20](../src/components/CollectionFilms.tsx#L20) | Rendered copy | ${failed ? ( &lt;span className="film-poster-fallback"&gt;Poster unavailable&lt;/span&gt; ) : enabled ? ( &lt;img src={smallest.src} srcSet={candidates.map((candidate) =&gt; &#96;${candidate.src} ${candidate.width}w&#96;).join(', ')} sizes={POSTER_SIZES} width={film.poster.width} height={film.poster.height} loading="lazy" decoding="async" alt="" onError={() =&gt; setFailed(true)} /&gt; ) : null} | FilmPoster(); when its owning surface/operation is used |
| [src/components/CollectionFilms.tsx:22](../src/components/CollectionFilms.tsx#L22) | Rendered copy | Poster unavailable | FilmPoster(); failed is true |
| [src/components/CollectionFilms.tsx:73](../src/components/CollectionFilms.tsx#L73) | Label/help | {&#96;${film.title} film&#96;} | FilmVideo(); when its owning surface/operation is used |
| [src/components/CollectionFilms.tsx:82](../src/components/CollectionFilms.tsx#L82) | Label/help | English (sound) | FilmVideo(); when its owning surface/operation is used |
| [src/components/CollectionFilms.tsx:85](../src/components/CollectionFilms.tsx#L85) | Live region | Buffering film… | FilmVideo(); waiting &amp;&amp; !failed &amp;&amp; |
| [src/components/CollectionFilms.tsx:87](../src/components/CollectionFilms.tsx#L87) | Live region | The film could not load. Check your connection or download it instead. Retry film | FilmVideo(); failed &amp;&amp; |
| [src/components/CollectionFilms.tsx:88](../src/components/CollectionFilms.tsx#L88) | Rendered copy | The film could not load. Check your connection or download it instead. | FilmVideo(); failed &amp;&amp; |
| [src/components/CollectionFilms.tsx:89](../src/components/CollectionFilms.tsx#L89) | Rendered copy | Retry film | FilmVideo(); failed &amp;&amp; |
| [src/components/CollectionFilms.tsx:167](../src/components/CollectionFilms.tsx#L167) | Rendered copy | ${film.title} ${film.description} ${filmDuration(film.durationSeconds)} · Watch film | content(); when its owning surface/operation is used |
| [src/components/CollectionFilms.tsx:168](../src/components/CollectionFilms.tsx#L168) | Rendered copy | ${film.description} | content(); when its owning surface/operation is used |
| [src/components/CollectionFilms.tsx:168](../src/components/CollectionFilms.tsx#L168) | Rendered copy | ${film.title} | content(); when its owning surface/operation is used |
| [src/components/CollectionFilms.tsx:169](../src/components/CollectionFilms.tsx#L169) | Rendered copy | ${filmDuration(film.durationSeconds)} · Watch film | content(); when its owning surface/operation is used |
| [src/components/CollectionFilms.tsx:177](../src/components/CollectionFilms.tsx#L177) | Rendered copy | ${active.title} | content(); active &amp;&amp; |
| [src/components/CollectionFilms.tsx:180](../src/components/CollectionFilms.tsx#L180) | Rendered copy | ${filmDuration(active.durationSeconds)}. Native playback controls. Instrumental music and interface sounds; no narration. | content(); active &amp;&amp; |
| [src/components/CollectionFilms.tsx:186](../src/components/CollectionFilms.tsx#L186) | Rendered copy | Download film (${(active.video.bytes / 1000000).toFixed(1)} MB) | content(); active &amp;&amp; |
| [src/components/CollectionFilms.tsx:188](../src/components/CollectionFilms.tsx#L188) | Rendered copy | (${(active.video.bytes / 1000000).toFixed(1)} MB) | content(); active &amp;&amp; |
| [src/components/CollectionFilms.tsx:193](../src/components/CollectionFilms.tsx#L193) | Rendered copy | Watch ${film.title} | content(); active &amp;&amp; |
| [src/components/CollectionFilms.tsx:207](../src/components/CollectionFilms.tsx#L207) | Rendered copy | Text alternative &amp; credits | content(); active &amp;&amp; |
| [src/components/CollectionFilms.tsx:208](../src/components/CollectionFilms.tsx#L208) | Rendered copy | ${active.context} | content(); active &amp;&amp;; expanded "Text alternative &amp; credits" disclosure |
| [src/components/CollectionFilms.tsx:217](../src/components/CollectionFilms.tsx#L217) | Rendered copy | Curated by Leul Tewodros Agonafer. Original instrumental music; Kenney UI Audio clicks (CC0). Game names and imagery belong to their respective owners; no endorsement is implied. | content(); active &amp;&amp;; expanded "Text alternative &amp; credits" disclosure |
| [src/components/CollectionFilms.tsx:222](../src/components/CollectionFilms.tsx#L222) | Rendered copy | Download text alternative | content(); active &amp;&amp;; expanded "Text alternative &amp; credits" disclosure |
| [src/components/CollectionFilms.tsx:226](../src/components/CollectionFilms.tsx#L226) | Rendered copy | Full source &amp; media credits | content(); active &amp;&amp;; expanded "Text alternative &amp; credits" disclosure |
| [src/components/CollectionFilms.tsx:241](../src/components/CollectionFilms.tsx#L241) | Rendered copy | Watch films | CollectionFilms(); embedded is false |
| [src/components/CollectionFilms.tsx:244](../src/components/CollectionFilms.tsx#L244) | Rendered copy | Short tours. Play only when you choose. | CollectionFilms(); embedded is false |
## src/components/CollectionPage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/CollectionPage.tsx:125](../src/components/CollectionPage.tsx#L125) | Rendered copy | GOOD GAMES. GREAT ESCAPES. | CollectionPage(); filters.view !== 'table' &amp;&amp; |
| [src/components/CollectionPage.tsx:128](../src/components/CollectionPage.tsx#L128) | Rendered copy | GREAT ESCAPES. | CollectionPage(); filters.view !== 'table' &amp;&amp; |
| [src/components/CollectionPage.tsx:130](../src/components/CollectionPage.tsx#L130) | Rendered copy | One hundred games worth making time for. Find your next world. | CollectionPage(); filters.view !== 'table' &amp;&amp; |
| [src/components/CollectionPage.tsx:135](../src/components/CollectionPage.tsx#L135) | Rendered copy | Explore all 100 | CollectionPage(); filters.view !== 'table' &amp;&amp; |
| [src/components/CollectionPage.tsx:148](../src/components/CollectionPage.tsx#L148) | Rendered copy | Pick for me | CollectionPage(); filters.view !== 'table' &amp;&amp; |
| [src/components/CollectionPage.tsx:158](../src/components/CollectionPage.tsx#L158) | Rendered copy | Leul's 100: the Core 50 and 50 more essentials. | CollectionPage(); filters.view !== 'table' &amp;&amp; |
| [src/components/CollectionPage.tsx:183](../src/components/CollectionPage.tsx#L183) | Live region | This collection copy does not include ${author.shortName}'s original ratings yet. No substitute values are shown. Refresh original ratings | CollectionPage(); collection.status === 'ready' is true; !collection.data.collection.authorRatingsAreOriginal &amp;&amp; |
| [src/components/CollectionPage.tsx:184](../src/components/CollectionPage.tsx#L184) | Rendered copy | This collection copy does not include ${author.shortName}'s original ratings yet. No substitute values are shown. | CollectionPage(); collection.status === 'ready' is true; !collection.data.collection.authorRatingsAreOriginal &amp;&amp; |
| [src/components/CollectionPage.tsx:188](../src/components/CollectionPage.tsx#L188) | Rendered copy | Refresh original ratings | CollectionPage(); collection.status === 'ready' is true; !collection.data.collection.authorRatingsAreOriginal &amp;&amp; |
| [src/components/CollectionPage.tsx:263](../src/components/CollectionPage.tsx#L263) | Label/help | Games in this view | CollectionPage(); collection.status === 'ready' is true; results.length is true; filters.view === 'table' is false |
| [src/components/CollectionPage.tsx:291](../src/components/CollectionPage.tsx#L291) | Rendered copy | ${results.length &gt; 1 ? 'Showing ' : ''} ${formatResultRange(results.length, 1, Math.min(visibleCount, results.length))} from The 100 | CollectionPage(); collection.status === 'ready' is true; results.length is true |
| [src/components/CollectionPage.tsx:296](../src/components/CollectionPage.tsx#L296) | Rendered copy | Show ${Math.min(PAGE_SIZE, results.length - visibleCount)} more | CollectionPage(); collection.status === 'ready' is true; results.length is true; visibleCount &lt; results.length is true |
| [src/components/CollectionPage.tsx:311](../src/components/CollectionPage.tsx#L311) | Rendered copy | ${showExtended ? 'End of the curated matches.' : "You're at the end of this view."} | CollectionPage(); collection.status === 'ready' is true; results.length is true; visibleCount &lt; results.length is false |
| [src/components/CollectionPage.tsx:313](../src/components/CollectionPage.tsx#L313) | Message/fragment | End of the curated matches. | CollectionPage(); collection.status === 'ready' is true; results.length is true; visibleCount &lt; results.length is false; showExtended is true |
| [src/components/CollectionPage.tsx:313](../src/components/CollectionPage.tsx#L313) | Message/fragment | You're at the end of this view. | CollectionPage(); collection.status === 'ready' is true; results.length is true; visibleCount &lt; results.length is false; showExtended is false |
| [src/components/CollectionPage.tsx:319](../src/components/CollectionPage.tsx#L319) | Rendered copy | No matches in ${author.shortName}'s original 100 for this view. | CollectionPage(); collection.status === 'ready' is true; results.length is false; showExtended is true |
| [src/components/CollectionPage.tsx:325](../src/components/CollectionPage.tsx#L325) | Rendered copy | ${filters.list === 'later' &amp;&amp; savedCount === 0 ? 'Play later is empty' : filters.list === 'completed' &amp;&amp; completedCount === 0 ? 'No completed games yet' : 'No matching games'} | CollectionPage(); collection.status === 'ready' is true; results.length is false; showExtended is false |
| [src/components/CollectionPage.tsx:327](../src/components/CollectionPage.tsx#L327) | Message/fragment | Play later is empty | CollectionPage(); collection.status === 'ready' is true; results.length is false; showExtended is false; filters.list === 'later' &amp;&amp; savedCount === 0 is true |
| [src/components/CollectionPage.tsx:329](../src/components/CollectionPage.tsx#L329) | Message/fragment | No completed games yet | CollectionPage(); collection.status === 'ready' is true; results.length is false; showExtended is false; filters.list === 'later' &amp;&amp; savedCount === 0 is false; filters.list === 'completed' &amp;&amp; completedCount === 0 is true |
| [src/components/CollectionPage.tsx:330](../src/components/CollectionPage.tsx#L330) | Message/fragment | No matching games | CollectionPage(); collection.status === 'ready' is true; results.length is false; showExtended is false; filters.list === 'later' &amp;&amp; savedCount === 0 is false; filters.list === 'completed' &amp;&amp; completedCount === 0 is false |
| [src/components/CollectionPage.tsx:332](../src/components/CollectionPage.tsx#L332) | Rendered copy | ${filters.list === 'later' &amp;&amp; savedCount === 0 ? 'Choose a bookmark to add a game to Play later, including games from other catalogs.' : filters.list === 'completed' &amp;&amp; completedCount === 0 ? 'Open a game and mark it completed. Your personal progress never changes its place in the collection.' : 'Try a shorter search or loosen a filter. Your saved additions are searched alongside the original 100.'} | CollectionPage(); collection.status === 'ready' is true; results.length is false; showExtended is false |
| [src/components/CollectionPage.tsx:334](../src/components/CollectionPage.tsx#L334) | Message/fragment | Choose a bookmark to add a game to Play later, including games from other catalogs. | CollectionPage(); collection.status === 'ready' is true; results.length is false; showExtended is false; filters.list === 'later' &amp;&amp; savedCount === 0 is true |
| [src/components/CollectionPage.tsx:336](../src/components/CollectionPage.tsx#L336) | Message/fragment | Open a game and mark it completed. Your personal progress never changes its place in the collection. | CollectionPage(); collection.status === 'ready' is true; results.length is false; showExtended is false; filters.list === 'later' &amp;&amp; savedCount === 0 is false; filters.list === 'completed' &amp;&amp; completedCount === 0 is true |
| [src/components/CollectionPage.tsx:337](../src/components/CollectionPage.tsx#L337) | Message/fragment | Try a shorter search or loosen a filter. Your saved additions are searched alongside the original 100. | CollectionPage(); collection.status === 'ready' is true; results.length is false; showExtended is false; filters.list === 'later' &amp;&amp; savedCount === 0 is false; filters.list === 'completed' &amp;&amp; completedCount === 0 is false |
| [src/components/CollectionPage.tsx:339](../src/components/CollectionPage.tsx#L339) | Rendered copy | Browse all 100 | CollectionPage(); collection.status === 'ready' is true; results.length is false; showExtended is false |
| [src/components/CollectionPage.tsx:372](../src/components/CollectionPage.tsx#L372) | Live region | The collection couldn't load. ${collection.error} Try again Download the workbook | CollectionPage(); collection.status === 'ready' is false; collection.status === 'error' is true |
| [src/components/CollectionPage.tsx:373](../src/components/CollectionPage.tsx#L373) | Rendered copy | The collection couldn't load. | CollectionPage(); collection.status === 'ready' is false; collection.status === 'error' is true |
| [src/components/CollectionPage.tsx:374](../src/components/CollectionPage.tsx#L374) | Rendered copy | ${collection.error} | CollectionPage(); collection.status === 'ready' is false; collection.status === 'error' is true |
| [src/components/CollectionPage.tsx:376](../src/components/CollectionPage.tsx#L376) | Rendered copy | Try again | CollectionPage(); collection.status === 'ready' is false; collection.status === 'error' is true |
| [src/components/CollectionPage.tsx:380](../src/components/CollectionPage.tsx#L380) | Rendered copy | Download the workbook | CollectionPage(); collection.status === 'ready' is false; collection.status === 'error' is true |
| [src/components/CollectionPage.tsx:386](../src/components/CollectionPage.tsx#L386) | Live region | Opening the collection… One hundred games. Just a moment. | CollectionPage(); collection.status === 'ready' is false; collection.status === 'error' is false |
| [src/components/CollectionPage.tsx:387](../src/components/CollectionPage.tsx#L387) | Rendered copy | Opening the collection… | CollectionPage(); collection.status === 'ready' is false; collection.status === 'error' is false |
| [src/components/CollectionPage.tsx:388](../src/components/CollectionPage.tsx#L388) | Rendered copy | One hundred games. Just a moment. | CollectionPage(); collection.status === 'ready' is false; collection.status === 'error' is false |
| [src/components/CollectionPage.tsx:412](../src/components/CollectionPage.tsx#L412) | Rendered copy | PLAY 100 | CollectionPage(); secondPass is true |
| [src/components/CollectionPage.tsx:418](../src/components/CollectionPage.tsx#L418) | Rendered copy | Red Dead Redemption 2 | CollectionPage(); secondPass is true |
| [src/components/CollectionPage.tsx:423](../src/components/CollectionPage.tsx#L423) | Rendered copy | Mass Effect 2 | CollectionPage(); secondPass is true |
| [src/components/CollectionPage.tsx:428](../src/components/CollectionPage.tsx#L428) | Rendered copy | The Witcher 3 | CollectionPage(); secondPass is true |
| [src/components/CollectionPage.tsx:432](../src/components/CollectionPage.tsx#L432) | Rendered copy | THE COMPLETE COLLECTION / .XLSX | CollectionPage(); secondPass is true |
| [src/components/CollectionPage.tsx:436](../src/components/CollectionPage.tsx#L436) | Rendered copy | THE WORKBOOK. ALL 100 TO KEEP. | CollectionPage(); secondPass is true |
| [src/components/CollectionPage.tsx:441](../src/components/CollectionPage.tsx#L441) | Rendered copy | Take all 100 with you. The enhanced workbook keeps the original order, complete score snapshots and notes in one filterable collection. | CollectionPage(); secondPass is true |
| [src/components/CollectionPage.tsx:445](../src/components/CollectionPage.tsx#L445) | Rendered copy | Download the workbook XLSX | CollectionPage(); secondPass is true |
| [src/components/CollectionPage.tsx:449](../src/components/CollectionPage.tsx#L449) | Label/help | Download the workbook, XLSX | CollectionPage(); secondPass is true |
| [src/components/CollectionPage.tsx:452](../src/components/CollectionPage.tsx#L452) | Rendered copy | XLSX | CollectionPage(); secondPass is true |
| [src/components/CollectionPage.tsx:454](../src/components/CollectionPage.tsx#L454) | Rendered copy | The curated collection, not your personal progress. | CollectionPage(); secondPass is true |
| [src/components/CollectionPage.tsx:455](../src/components/CollectionPage.tsx#L455) | Rendered copy | Or download the untouched original Excel | CollectionPage(); secondPass is true |
## src/components/compare-tray/compare-drag-controller.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/compare-tray/compare-drag-controller.ts:269](../src/components/compare-tray/compare-drag-controller.ts#L269) | Message/fragment | Escape | watch(); when its owning surface/operation is used |
| [src/components/compare-tray/compare-drag-controller.ts:273](../src/components/compare-tray/compare-drag-controller.ts#L273) | Message/fragment | Alt | watch(); event.key === 'Escape' is false |
| [src/components/compare-tray/compare-drag-controller.ts:273](../src/components/compare-tray/compare-drag-controller.ts#L273) | Message/fragment | Control | watch(); event.key === 'Escape' is false |
| [src/components/compare-tray/compare-drag-controller.ts:273](../src/components/compare-tray/compare-drag-controller.ts#L273) | Message/fragment | Meta | watch(); event.key === 'Escape' is false |
| [src/components/compare-tray/compare-drag-controller.ts:273](../src/components/compare-tray/compare-drag-controller.ts#L273) | Message/fragment | Shift | watch(); event.key === 'Escape' is false |
| [src/components/compare-tray/compare-drag-controller.ts:350](../src/components/compare-tray/compare-drag-controller.ts#L350) | Message/fragment | Pin for comparison | makeGhost(); when its owning surface/operation is used |
| [src/components/compare-tray/compare-drag-controller.ts:431](../src/components/compare-tray/compare-drag-controller.ts#L431) | Message/fragment | This drag was interrupted. Use Pin for comparison instead. | moveTouch(); !gesture.token is true; gesture.kind === 'grip' &amp;&amp; gesture.pointerId !== undefined is true; operation rejected or threw |
| [src/components/compare-tray/compare-drag-controller.ts:666](../src/components/compare-tray/compare-drag-controller.ts#L666) | Message/fragment | A safe drag could not be started. Use Pin for comparison instead. | createCompareDragController(); !event.dataTransfer is true |
| [src/components/compare-tray/compare-drag-controller.ts:681](../src/components/compare-tray/compare-drag-controller.ts#L681) | Message/fragment | A safe drag could not be started. Use Pin for comparison instead. | createCompareDragController(); operation rejected or threw |
## src/components/compare-tray/compare-tray-context.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/compare-tray/compare-tray-context.ts:16](../src/components/compare-tray/compare-tray-context.ts#L16) | Error/validation | Compare tray controls must be inside CompareTrayProvider. | useCompareTray(); !context is true |
## src/components/compare-tray/ComparePinButton.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/compare-tray/ComparePinButton.tsx:41](../src/components/compare-tray/ComparePinButton.tsx#L41) | Rendered copy | ${showLabel &amp;&amp; (pinned ? 'Pinned' : 'Pin')} | ComparePinButton(); when its owning surface/operation is used |
| [src/components/compare-tray/ComparePinButton.tsx:49](../src/components/compare-tray/ComparePinButton.tsx#L49) | Label/help | {&#96;${pinned ? 'Pinned' : 'Pin'} for comparison: ${record.title}&#96;} | ComparePinButton(); when its owning surface/operation is used |
| [src/components/compare-tray/ComparePinButton.tsx:49](../src/components/compare-tray/ComparePinButton.tsx#L49) | Message/fragment | ${pinned ? 'Pinned' : 'Pin'} for comparison: ${record.title} | ComparePinButton(); when its owning surface/operation is used |
| [src/components/compare-tray/ComparePinButton.tsx:50](../src/components/compare-tray/ComparePinButton.tsx#L50) | Label/help | {compact ? (pinned ? 'Remove pin' : 'Pin for comparison') : undefined} | ComparePinButton(); when its owning surface/operation is used |
| [src/components/compare-tray/ComparePinButton.tsx:50](../src/components/compare-tray/ComparePinButton.tsx#L50) | Message/fragment | Pin for comparison | ComparePinButton(); compact is true; pinned is false |
| [src/components/compare-tray/ComparePinButton.tsx:50](../src/components/compare-tray/ComparePinButton.tsx#L50) | Message/fragment | Remove pin | ComparePinButton(); compact is true; pinned is true |
| [src/components/compare-tray/ComparePinButton.tsx:60](../src/components/compare-tray/ComparePinButton.tsx#L60) | Message/fragment | Pin | ComparePinButton(); showLabel &amp;&amp;; pinned is false |
| [src/components/compare-tray/ComparePinButton.tsx:60](../src/components/compare-tray/ComparePinButton.tsx#L60) | Message/fragment | Pinned | ComparePinButton(); showLabel &amp;&amp;; pinned is true |
## src/components/compare-tray/CompareTray.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/compare-tray/CompareTray.tsx:181](../src/components/compare-tray/CompareTray.tsx#L181) | Message/fragment | Compare tray | label(); persistent is true |
| [src/components/compare-tray/CompareTray.tsx:181](../src/components/compare-tray/CompareTray.tsx#L181) | Message/fragment | Temporary tray | label(); persistent is false |
| [src/components/compare-tray/CompareTray.tsx:188](../src/components/compare-tray/CompareTray.tsx#L188) | Label/help | Pinned games for comparison | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:198](../src/components/compare-tray/CompareTray.tsx#L198) | Rendered copy | Drop to pin for comparison | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp;; dragging &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:207](../src/components/compare-tray/CompareTray.tsx#L207) | Label/help | {&#96;${items.length} ${items.length === 1 ? 'game' : 'games'} in ${label}&#96;} | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:207](../src/components/compare-tray/CompareTray.tsx#L207) | Message/fragment | ${items.length} ${items.length === 1 ? 'game' : 'games'} in ${label} | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:208](../src/components/compare-tray/CompareTray.tsx#L208) | Label/help | {&#96;Open ${label}&#96;} | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:208](../src/components/compare-tray/CompareTray.tsx#L208) | Message/fragment | Open ${label} | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:213](../src/components/compare-tray/CompareTray.tsx#L213) | Rendered copy | ${items.slice(-3).map((record) =&gt; ( &lt;span className="compare-tray-jacket" key={record.id}&gt; &lt;span className="compare-tray-jacket-arrival" ref={record.id === newestId ? arrivalRef : undefined}&gt; &lt;GameArtwork record={record} artwork={resolveArtwork?.(record)} /&gt; &lt;/span&gt; &lt;/span&gt; ))} | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:222](../src/components/compare-tray/CompareTray.tsx#L222) | Rendered copy | ${items.length} ${items.length === 1 ? 'game' : 'games'} in ${label} | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:223](../src/components/compare-tray/CompareTray.tsx#L223) | Rendered copy | ${items.length} ${items.length === 1 ? 'game' : 'games'} | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:225](../src/components/compare-tray/CompareTray.tsx#L225) | Rendered copy | ${items.length === 1 ? 'game' : 'games'} | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:229](../src/components/compare-tray/CompareTray.tsx#L229) | Rendered copy | in ${label} | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:236](../src/components/compare-tray/CompareTray.tsx#L236) | Label/help | Compare rankings with friends | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:240](../src/components/compare-tray/CompareTray.tsx#L240) | Rendered copy | Compare rankings with friends | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:241](../src/components/compare-tray/CompareTray.tsx#L241) | Rendered copy | with friends | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:249](../src/components/compare-tray/CompareTray.tsx#L249) | Label/help | Tray storage needs attention | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp;; warning &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:250](../src/components/compare-tray/CompareTray.tsx#L250) | Label/help | Open the tray to review its storage warning | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp;; warning &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:257](../src/components/compare-tray/CompareTray.tsx#L257) | Rendered copy | ${error} | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp;; error &amp;&amp; layout === 'inline' &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:261](../src/components/compare-tray/CompareTray.tsx#L261) | Label/help | Dismiss Compare tray message | ScopedCompareTray(); hasTray &amp;&amp; !hidden &amp;&amp;; error &amp;&amp; layout === 'inline' &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:280](../src/components/compare-tray/CompareTray.tsx#L280) | Rendered copy | Compare tray | ScopedCompareTray(); when its owning surface/operation is used |
| [src/components/compare-tray/CompareTray.tsx:283](../src/components/compare-tray/CompareTray.tsx#L283) | Rendered copy | ${items.length ? &#96;${items.length} of 6 games. Choose friends to compare their rankings of these games.&#96; : 'Pin a game while browsing to hold it here.'} Pinning does not save, rate or share a game. | ScopedCompareTray(); when its owning surface/operation is used |
| [src/components/compare-tray/CompareTray.tsx:285](../src/components/compare-tray/CompareTray.tsx#L285) | Message/fragment | ${items.length} of 6 games. Choose friends to compare their rankings of these games. | ScopedCompareTray(); items.length is true |
| [src/components/compare-tray/CompareTray.tsx:286](../src/components/compare-tray/CompareTray.tsx#L286) | Message/fragment | Pin a game while browsing to hold it here. | ScopedCompareTray(); items.length is false |
| [src/components/compare-tray/CompareTray.tsx:290](../src/components/compare-tray/CompareTray.tsx#L290) | Live region | ${warning} Reset saved tray | ScopedCompareTray(); warning &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:291](../src/components/compare-tray/CompareTray.tsx#L291) | Rendered copy | ${warning} | ScopedCompareTray(); warning &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:292](../src/components/compare-tray/CompareTray.tsx#L292) | Rendered copy | Reset saved tray | ScopedCompareTray(); warning &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:306](../src/components/compare-tray/CompareTray.tsx#L306) | Rendered copy | ${error} | ScopedCompareTray(); error &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:310](../src/components/compare-tray/CompareTray.tsx#L310) | Label/help | Dismiss Compare tray message | ScopedCompareTray(); error &amp;&amp; |
| [src/components/compare-tray/CompareTray.tsx:320](../src/components/compare-tray/CompareTray.tsx#L320) | Label/help | Pinned games | ScopedCompareTray(); when its owning surface/operation is used |
| [src/components/compare-tray/CompareTray.tsx:326](../src/components/compare-tray/CompareTray.tsx#L326) | Rendered copy | ${record.title} | ScopedCompareTray(); onPreview is true |
| [src/components/compare-tray/CompareTray.tsx:337](../src/components/compare-tray/CompareTray.tsx#L337) | Rendered copy | ${record.title} | ScopedCompareTray(); onPreview is false |
| [src/components/compare-tray/CompareTray.tsx:339](../src/components/compare-tray/CompareTray.tsx#L339) | Rendered copy | ${SOURCE_LABELS[record.source]} ${record.year !== null ? &#96; · ${record.year}&#96; : ''} | ScopedCompareTray(); when its owning surface/operation is used |
| [src/components/compare-tray/CompareTray.tsx:352](../src/components/compare-tray/CompareTray.tsx#L352) | Label/help | {&#96;Unpin ${record.title} from comparison&#96;} | ScopedCompareTray(); when its owning surface/operation is used |
| [src/components/compare-tray/CompareTray.tsx:352](../src/components/compare-tray/CompareTray.tsx#L352) | Message/fragment | Unpin ${record.title} from comparison | ScopedCompareTray(); when its owning surface/operation is used |
| [src/components/compare-tray/CompareTray.tsx:361](../src/components/compare-tray/CompareTray.tsx#L361) | Rendered copy | Clear all | ScopedCompareTray(); when its owning surface/operation is used |
| [src/components/compare-tray/CompareTray.tsx:372](../src/components/compare-tray/CompareTray.tsx#L372) | Rendered copy | Choose friends | ScopedCompareTray(); when its owning surface/operation is used |
## src/components/compare-tray/CompareTrayProvider.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/compare-tray/CompareTrayProvider.tsx:49](../src/components/compare-tray/CompareTrayProvider.tsx#L49) | Live region | ${snapshot.status} | CompareTrayProvider(); when its owning surface/operation is used |
## src/components/CompletedToggle.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/CompletedToggle.tsx:15](../src/components/CompletedToggle.tsx#L15) | Rendered copy | Completed | CompletedToggle(); when its owning surface/operation is used |
| [src/components/CompletedToggle.tsx:20](../src/components/CompletedToggle.tsx#L20) | Label/help | {&#96;Completed: ${title}&#96;} | CompletedToggle(); when its owning surface/operation is used |
## src/components/DataUseContent.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/DataUseContent.tsx:4](../src/components/DataUseContent.tsx#L4) | Rendered copy | Device-only libraries | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:5](../src/components/DataUseContent.tsx#L5) | Rendered copy | Browser storage keeps games, ratings, notes, Play later, play history, display settings and your account-loading preference. Clearing site data can erase them. Download a backup from Settings or Account. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:9](../src/components/DataUseContent.tsx#L9) | Rendered copy | Compare keeps up to six pins per device or account. Pinning never adds, rates or shares games; sign-in never copies guest pins. Your comparison filters and chosen people stay in this tab's private history. Public links do not include those choices. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:14](../src/components/DataUseContent.tsx#L14) | Rendered copy | Installation and offline access | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:15](../src/components/DataUseContent.tsx#L15) | Rendered copy | Install through your browser. Offline preparation downloads public app files, collection details and recently viewed app artwork within storage limits. It excludes private data, account data, online-only pages, sign-in details and online game search results, and never replaces your device library. Films and workbooks are not downloaded automatically. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:21](../src/components/DataUseContent.tsx#L21) | Rendered copy | Online features need a connection; account and guest libraries stay separate. Updates wait until you choose to apply them and your edits have saved. Other app windows or unfinished forms can block reload. This page never enables offline access. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:26](../src/components/DataUseContent.tsx#L26) | Rendered copy | Sign-in | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:27](../src/components/DataUseContent.tsx#L27) | Rendered copy | Firebase handles sign-in with Google or an email address and password; Play 100 stores no passwords. Google requests basic identity, email and profile access, not contacts or files. Sign-in identifies an account, not a verified person. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:32](../src/components/DataUseContent.tsx#L32) | Rendered copy | Browsers keep you signed in until you sign out or access is revoked, unless private browsing, blocked or cleared storage, or sign-in service restrictions require you to sign in again. App releases never intentionally clear accounts or libraries. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:37](../src/components/DataUseContent.tsx#L37) | Rendered copy | Online saving | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:38](../src/components/DataUseContent.tsx#L38) | Rendered copy | Online-saving consent lets the creator see your chosen profile and ranking summary, not notes, Play later or play history. Private library data is stored under your verified account; database operators can access it. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:42](../src/components/DataUseContent.tsx#L42) | Rendered copy | After sign-in, the app can restore your account's online library if online saving is active. Its copy on this device must still be empty and unchanged. Guest data never merges or uploads automatically. Pending device edits, stopped saving, deletion or conflicts require your choice before replacement. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:47](../src/components/DataUseContent.tsx#L47) | Rendered copy | Edits save locally before uploading. Visible, connected browsers retry temporary failures; closed browsers cannot. If the service reaches its free limit, online saving pauses; billing is never turned on. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:51](../src/components/DataUseContent.tsx#L51) | Rendered copy | Profiles and icons | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:52](../src/components/DataUseContent.tsx#L52) | Rendered copy | Your profile stores your name and locally generated creature, never uploaded or Google photos. Icon changes leave published rankings unchanged. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:56](../src/components/DataUseContent.tsx#L56) | Rendered copy | Friends and comparisons | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:57](../src/components/DataUseContent.tsx#L57) | Rendered copy | Connections share your name and icon. Accepted, unblocked friends see allowed games and rankings. Requests need acceptance. Invitations are revocable, single-use and expire after seven days. Anyone with the link can preview it; keep it private. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:62](../src/components/DataUseContent.tsx#L62) | Rendered copy | New verified accounts with online saving share all saved game details and rankings with accepted friends by default, including future additions. Notes, email, Play later and play history stay excluded. Public profiles and Community listing need separate consent. Guest data never transfers automatically. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:67](../src/components/DataUseContent.tsx#L67) | Rendered copy | If you previously turned sharing off or chose specific games, that choice stays in place. You can choose Share all with friends in Friends, My games or Account without selecting games individually, and stop at any time. Selected-only sharing allows up to 200 games and asks you to review removals. Sharing everything follows library additions, removals and re-additions. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:73](../src/components/DataUseContent.tsx#L73) | Rendered copy | Sharing everything supports the 10,000-game account limit. Games are shared in small batches that resume after interruptions. Large libraries may take over a day. Games on pages not yet loaded aren't treated as missing or unrated; whole-list results stay unknown until every page is loaded. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:78](../src/components/DataUseContent.tsx#L78) | Rendered copy | Unfriending, blocking, stopping sharing or deleting the account ends access, but cannot recall copies. When you share everything with friends, stopping online saving also ends sharing. Choose Share all with friends to restart it. If you share selected games, pausing online saving can retain the last shared copy until you stop sharing. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:84](../src/components/DataUseContent.tsx#L84) | Rendered copy | When sharing everything with friends is active, older app versions cannot save online or stop online saving. Refresh the app, or first choose Stop in Friend sharing. Accounts that aren't sharing everything are unaffected; pending device edits are never discarded. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:89](../src/components/DataUseContent.tsx#L89) | Rendered copy | Comparison groups save private people selections, not chats, permissions or others' scores. Unavailable rankings are labelled. Account exports exclude active invitation links and others' rankings. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:93](../src/components/DataUseContent.tsx#L93) | Rendered copy | The app privately counts your groups, blocks and reports to enforce account limits. Deleting your account removes those counts. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:97](../src/components/DataUseContent.tsx#L97) | Rendered copy | Public rankings | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:98](../src/components/DataUseContent.tsx#L98) | Rendered copy | Publishing requires a separate preview and your consent. Links publicly show selected games, order and scores. Community listing is a separate choice. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:102](../src/components/DataUseContent.tsx#L102) | Rendered copy | Only your updates change published copies. Email, notes, Play later and play history stay excluded. Unpublishing or moderation stops new access, not existing screenshots, downloads or copies. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:106](../src/components/DataUseContent.tsx#L106) | Rendered copy | Export, stop and delete | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:107](../src/components/DataUseContent.tsx#L107) | Rendered copy | Sign out keeps the account's separate device copy. Sign out and remove this device's copy also deletes its local, recovery and saved sharing data, unless edits are waiting to upload or the copy changes. Guest and online copies remain. Stopping online saving keeps copies but stops uploads. Deleting an online copy removes its profile and library and unpublishes its ranking, keeping device recovery data. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:113](../src/components/DataUseContent.tsx#L113) | Rendered copy | Account deletion needs recent sign-in. Your online library, ranking summary and shared and public copies are deleted before your sign-in account. If deletion is interrupted, the account stays. Choose Finish deleting in Account later, even another day; sign-in may be required again. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:118](../src/components/DataUseContent.tsx#L118) | Rendered copy | Some older shared copies need the site owner's separate review and removal. Small records with no library content remain so that old sessions can't bring deleted data back. Device-only guest libraries are unaffected. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:122](../src/components/DataUseContent.tsx#L122) | Rendered copy | Services and essential storage | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:123](../src/components/DataUseContent.tsx#L123) | Rendered copy | Vercel hosts the site. Firebase provides sign-in and online storage. Google handles Google sign-in. These services use essential storage or cookies as needed. The app uses no advertising analytics, contact scraping or bulk invitation emails. Catalog records keep their source links. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:128](../src/components/DataUseContent.tsx#L128) | Rendered copy | Browser security reports count known blocked sites, security rules and page types, never full URLs, queries, IP addresses, browser details or account IDs. Scheduled checks record whether the sign-in service and public catalogs respond. They do not use account credentials. Error screens may send batched counts by error type, component, page type and app build, never messages or stack traces. Counts use no device storage or visitor ID. Reporting is limited to 20 errors and four send attempts per page. These are service checks, not visitor analytics. Hosts process normal requests under their own policies. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:136](../src/components/DataUseContent.tsx#L136) | Rendered copy | For eligible Discover games, online lookup uses the exact public game ID to request public ratings and licensed artwork. Wikidata scores retain credit; Steam recommendations require an unambiguous app ID. Wikimedia Commons art needs license, creator and image-size checks, with full credit. These lookups never change The 100. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:141](../src/components/DataUseContent.tsx#L141) | Rendered copy | Requests exclude private titles, ratings, notes, progress and account IDs. Disable online lookup anytime; fetched public facts may remain in session memory, labelled with retrieval dates. External scores are neither combined nor treated as yours. Missing data is not zero. | DataUseContent(); when its owning surface/operation is used |
| [src/components/DataUseContent.tsx:146](../src/components/DataUseContent.tsx#L146) | Rendered copy | Use Account to export or delete your data. For questions, use the creator links below. | DataUseContent(); when its owning surface/operation is used |
## src/components/DataUseLink.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/DataUseLink.tsx:5](../src/components/DataUseLink.tsx#L5) | Rendered copy | Data use (opens in a new tab) | DataUseLink(); when its owning surface/operation is used |
| [src/components/DataUseLink.tsx:7](../src/components/DataUseLink.tsx#L7) | Rendered copy | (opens in a new tab) | DataUseLink(); when its owning surface/operation is used |
## src/components/DataUsePage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/DataUsePage.tsx:11](../src/components/DataUsePage.tsx#L11) | Message/fragment | Data use &#124; Play 100 | DataUsePage(); when its owning surface/operation is used |
| [src/components/DataUsePage.tsx:15](../src/components/DataUsePage.tsx#L15) | Rendered copy | Skip to data use | DataUsePage(); when its owning surface/operation is used |
| [src/components/DataUsePage.tsx:19](../src/components/DataUsePage.tsx#L19) | Rendered copy | PLAY100 . | DataUsePage(); when its owning surface/operation is used |
| [src/components/DataUsePage.tsx:23](../src/components/DataUsePage.tsx#L23) | Rendered copy | Account | DataUsePage(); when its owning surface/operation is used |
| [src/components/DataUsePage.tsx:28](../src/components/DataUsePage.tsx#L28) | Rendered copy | Data use | DataUsePage(); when its owning surface/operation is used |
| [src/components/DataUsePage.tsx:29](../src/components/DataUsePage.tsx#L29) | Rendered copy | Device storage, account saving and public sharing are separate choices. This page does not open your private library or start online saving. | DataUsePage(); when its owning surface/operation is used |
## src/components/DeferredCollection.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/DeferredCollection.tsx:116](../src/components/DeferredCollection.tsx#L116) | Message/fragment | The films didn't load. | failureMessage(); input.kind === 'films' is true |
| [src/components/DeferredCollection.tsx:116](../src/components/DeferredCollection.tsx#L116) | Message/fragment | These collection tools didn't load. | failureMessage(); input.kind === 'films' is false |
| [src/components/DeferredCollection.tsx:119](../src/components/DeferredCollection.tsx#L119) | Label/help | {failureMessage} | body(); failed is true |
| [src/components/DeferredCollection.tsx:154](../src/components/DeferredCollection.tsx#L154) | Rendered copy | Watch films | DeferredCollection(); input.kind === 'films' is true |
| [src/components/DeferredCollection.tsx:157](../src/components/DeferredCollection.tsx#L157) | Rendered copy | Short tours. Play only when you choose. | DeferredCollection(); input.kind === 'films' is true |
| [src/components/DeferredCollection.tsx:168](../src/components/DeferredCollection.tsx#L168) | Rendered copy | Beyond The 100 | DeferredCollection(); input.kind === 'films' is false; input.kind === 'extended' is true |
| [src/components/DeferredCollection.tsx:171](../src/components/DeferredCollection.tsx#L171) | Rendered copy | ${extendedResultCount(input.props.records.length, input.props.queryKey, input.props.online.loading)} | DeferredCollection(); input.kind === 'films' is false; input.kind === 'extended' is true |
## src/components/Dialog.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/Dialog.tsx:170](../src/components/Dialog.tsx#L170) | Message/fragment | Escape | Dialog(); onKeyDown |
| [src/components/Dialog.tsx:189](../src/components/Dialog.tsx#L189) | Label/help | Close dialog | Dialog(); when its owning surface/operation is used |
## src/components/ErrorBoundary.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/ErrorBoundary.tsx:18](../src/components/ErrorBoundary.tsx#L18) | Rendered copy | Let's get you back to the games. | render(); this.state.failed is true |
| [src/components/ErrorBoundary.tsx:19](../src/components/ErrorBoundary.tsx#L19) | Rendered copy | The page ran into a problem. Your saved device data has not been cleared. | render(); this.state.failed is true |
| [src/components/ErrorBoundary.tsx:20](../src/components/ErrorBoundary.tsx#L20) | Rendered copy | Reload the collection | render(); this.state.failed is true |
| [src/components/ErrorBoundary.tsx:23](../src/components/ErrorBoundary.tsx#L23) | Rendered copy | Or download the workbook | render(); this.state.failed is true |
## src/components/FriendSharingSummary.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/FriendSharingSummary.tsx:30](../src/components/FriendSharingSummary.tsx#L30) | Message/fragment | Up to date | labels(); when its owning surface/operation is used |
| [src/components/FriendSharingSummary.tsx:31](../src/components/FriendSharingSummary.tsx#L31) | Message/fragment | Waiting for saved edits… | labels(); when its owning surface/operation is used |
| [src/components/FriendSharingSummary.tsx:32](../src/components/FriendSharingSummary.tsx#L32) | Message/fragment | Updating… | labels(); when its owning surface/operation is used |
| [src/components/FriendSharingSummary.tsx:33](../src/components/FriendSharingSummary.tsx#L33) | Message/fragment | Checking… | labels(); when its owning surface/operation is used |
| [src/components/FriendSharingSummary.tsx:34](../src/components/FriendSharingSummary.tsx#L34) | Message/fragment | Paused | labels(); when its owning surface/operation is used |
| [src/components/FriendSharingSummary.tsx:35](../src/components/FriendSharingSummary.tsx#L35) | Message/fragment | Retrying… | labels(); when its owning surface/operation is used |
| [src/components/FriendSharingSummary.tsx:36](../src/components/FriendSharingSummary.tsx#L36) | Message/fragment | Continuing later | labels(); when its owning surface/operation is used |
| [src/components/FriendSharingSummary.tsx:37](../src/components/FriendSharingSummary.tsx#L37) | Message/fragment | Needs attention | labels(); when its owning surface/operation is used |
| [src/components/FriendSharingSummary.tsx:46](../src/components/FriendSharingSummary.tsx#L46) | Message/fragment | Sharing could not be confirmed. Refresh its status. | change(); operation rejected or threw; cause instanceof Error is false |
| [src/components/FriendSharingSummary.tsx:55](../src/components/FriendSharingSummary.tsx#L55) | Label/help | Friend sharing | FriendSharingSummary(); when its owning surface/operation is used |
| [src/components/FriendSharingSummary.tsx:57](../src/components/FriendSharingSummary.tsx#L57) | Live region | ${mode === 'checking' ? ( 'Checking friend sharing…' ) : mode === 'all' ? ( &lt;&gt; Sharing all saved games and rankings with friends. &lt;strong&gt;{labels[status] ?? status}&lt;/strong&gt; &lt;/&gt; ) : mode === 'legacy' ? ( 'Your previous sharing choice is unchanged.' ) : mode === 'paused' ? ( 'Automatic friend sharing is paused.' ) : mode === 'revoked' ? ( 'Friend sharing is revoked.' ) : ( 'Automatic friend sharing is off.' )} | FriendSharingSummary(); when its owning surface/operation is used |
| [src/components/FriendSharingSummary.tsx:59](../src/components/FriendSharingSummary.tsx#L59) | Message/fragment | Checking friend sharing… | FriendSharingSummary(); mode === 'checking' is true |
| [src/components/FriendSharingSummary.tsx:62](../src/components/FriendSharingSummary.tsx#L62) | Rendered copy | ${labels[status] ?? status} | FriendSharingSummary(); mode === 'checking' is false; mode === 'all' is true |
| [src/components/FriendSharingSummary.tsx:65](../src/components/FriendSharingSummary.tsx#L65) | Message/fragment | Your previous sharing choice is unchanged. | FriendSharingSummary(); mode === 'checking' is false; mode === 'all' is false; mode === 'legacy' is true |
| [src/components/FriendSharingSummary.tsx:67](../src/components/FriendSharingSummary.tsx#L67) | Message/fragment | Automatic friend sharing is paused. | FriendSharingSummary(); mode === 'checking' is false; mode === 'all' is false; mode === 'legacy' is false; mode === 'paused' is true |
| [src/components/FriendSharingSummary.tsx:69](../src/components/FriendSharingSummary.tsx#L69) | Message/fragment | Friend sharing is revoked. | FriendSharingSummary(); mode === 'checking' is false; mode === 'all' is false; mode === 'legacy' is false; mode === 'paused' is false; mode === 'revoked' is true |
| [src/components/FriendSharingSummary.tsx:71](../src/components/FriendSharingSummary.tsx#L71) | Message/fragment | Automatic friend sharing is off. | FriendSharingSummary(); mode === 'checking' is false; mode === 'all' is false; mode === 'legacy' is false; mode === 'paused' is false; mode === 'revoked' is false |
| [src/components/FriendSharingSummary.tsx:75](../src/components/FriendSharingSummary.tsx#L75) | Rendered copy | Share all with friends | FriendSharingSummary(); canEnable &amp;&amp; |
| [src/components/FriendSharingSummary.tsx:86](../src/components/FriendSharingSummary.tsx#L86) | Rendered copy | Stop friend sharing | FriendSharingSummary(); enabled &amp;&amp; |
| [src/components/FriendSharingSummary.tsx:97](../src/components/FriendSharingSummary.tsx#L97) | Rendered copy | Accepted friends only. Notes, email, Play later and play history stay private. Public sharing is separate. | FriendSharingSummary(); when its owning surface/operation is used |
| [src/components/FriendSharingSummary.tsx:102](../src/components/FriendSharingSummary.tsx#L102) | Live region | ${alertText} | FriendSharingSummary(); alertText &amp;&amp; |
| [src/components/FriendSharingSummary.tsx:106](../src/components/FriendSharingSummary.tsx#L106) | Rendered copy | ${FRIEND_ALL_QUOTA_MESSAGE} | FriendSharingSummary(); quota &amp;&amp; |
| [src/components/FriendSharingSummary.tsx:108](../src/components/FriendSharingSummary.tsx#L108) | Rendered copy | Refresh sharing status | FriendSharingSummary(); (problem &#124;&#124; error &#124;&#124; status === 'error' &#124;&#124; quota &#124;&#124; status === 'retrying') &amp;&amp; |
## src/components/GameCard.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/GameCard.tsx:82](../src/components/GameCard.tsx#L82) | Rendered copy | Number ${game.rank} in ${author.shortName}'s collection. | GameCard(); when its owning surface/operation is used |
| [src/components/GameCard.tsx:88](../src/components/GameCard.tsx#L88) | Rendered copy | ${game.year} | GameCard(); when its owning surface/operation is used |
| [src/components/GameCard.tsx:90](../src/components/GameCard.tsx#L90) | Rendered copy | ${game.tier === 'core' ? 'Core 50' : 'Essential 50'} | GameCard(); when its owning surface/operation is used |
| [src/components/GameCard.tsx:92](../src/components/GameCard.tsx#L92) | Rendered copy | ${game.title} | GameCard(); when its owning surface/operation is used |
| [src/components/GameCard.tsx:96](../src/components/GameCard.tsx#L96) | Rendered copy | ${author.shortName}'s rating ${authorRatingText(game.authorRating)} ${game.authorRating &amp;&amp; &lt;span&gt; / 10&lt;/span&gt;} | GameCard(); when its owning surface/operation is used |
| [src/components/GameCard.tsx:98](../src/components/GameCard.tsx#L98) | Label/help | { game.authorRating ? &#96;Original workbook rating: ${game.authorRating.rawValue}&#96; : 'The original author rating is unavailable in this copy.' } | GameCard(); when its owning surface/operation is used |
| [src/components/GameCard.tsx:100](../src/components/GameCard.tsx#L100) | Message/fragment | Original workbook rating: ${game.authorRating.rawValue} | GameCard(); game.authorRating is true |
| [src/components/GameCard.tsx:101](../src/components/GameCard.tsx#L101) | Message/fragment | The original author rating is unavailable in this copy. | GameCard(); game.authorRating is false |
| [src/components/GameCard.tsx:104](../src/components/GameCard.tsx#L104) | Rendered copy | ${authorRatingText(game.authorRating)} | GameCard(); when its owning surface/operation is used |
| [src/components/GameCard.tsx:107](../src/components/GameCard.tsx#L107) | Rendered copy | ${game.genre} | GameCard(); when its owning surface/operation is used |
| [src/components/GameCard.tsx:108](../src/components/GameCard.tsx#L108) | Rendered copy | ${formatAverage(game.criticAverage)} critic avg. | GameCard(); when its owning surface/operation is used |
| [src/components/GameCard.tsx:110](../src/components/GameCard.tsx#L110) | Rendered copy | critic avg. | GameCard(); when its owning surface/operation is used |
| [src/components/GameCard.tsx:113](../src/components/GameCard.tsx#L113) | Rendered copy | Completed | GameCard(); state?.completed &amp;&amp; |
| [src/components/GameCard.tsx:122](../src/components/GameCard.tsx#L122) | Label/help | {game.title} | GameCard(); when its owning surface/operation is used |
| [src/components/GameCard.tsx:130](../src/components/GameCard.tsx#L130) | Label/help | {game.title} | GameCard(); when its owning surface/operation is used |
| [src/components/GameCard.tsx:144](../src/components/GameCard.tsx#L144) | Label/help | {&#96;Select ${game.title}&#96;} | GameCard(); selecting &amp;&amp; |
| [src/components/GameCard.tsx:144](../src/components/GameCard.tsx#L144) | Message/fragment | Select ${game.title} | GameCard(); selecting &amp;&amp; |
| [src/components/GameCard.tsx:151](../src/components/GameCard.tsx#L151) | Label/help | {&#96;Play later: ${game.title}&#96;} | GameCard(); when its owning surface/operation is used |
| [src/components/GameCard.tsx:151](../src/components/GameCard.tsx#L151) | Message/fragment | Play later: ${game.title} | GameCard(); when its owning surface/operation is used |
| [src/components/GameCard.tsx:152](../src/components/GameCard.tsx#L152) | Label/help | Play later | GameCard(); when its owning surface/operation is used |
## src/components/GameCover.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/GameCover.tsx:62](../src/components/GameCover.tsx#L62) | Rendered copy | PLAY / ${String(game.rank).padStart(3, '0')} | GameCover(); when its owning surface/operation is used |
| [src/components/GameCover.tsx:65](../src/components/GameCover.tsx#L65) | Rendered copy | ${game.year} | GameCover(); when its owning surface/operation is used |
| [src/components/GameCover.tsx:82](../src/components/GameCover.tsx#L82) | Rendered copy | Cover unavailable · collection artwork | GameCover(); failed &amp;&amp; |
| [src/components/GameCover.tsx:83](../src/components/GameCover.tsx#L83) | Rendered copy | ${String(game.rank).padStart(2, '0')} | GameCover(); when its owning surface/operation is used |
## src/components/GameDetail.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/GameDetail.tsx:100](../src/components/GameDetail.tsx#L100) | Message/fragment | Your edit has not saved. Correct the highlighted rating or note before changing games. | changeGame(); saved is false |
| [src/components/GameDetail.tsx:103](../src/components/GameDetail.tsx#L103) | Message/fragment | Your edit could not be saved. Keep this game open and retry. | changeGame(); operation rejected or threw; isCurrent() is true |
| [src/components/GameDetail.tsx:129](../src/components/GameDetail.tsx#L129) | Rendered copy | #${String(game.rank).padStart(2, '0')} in the collection | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:130](../src/components/GameDetail.tsx#L130) | Rendered copy | ${game.tier === 'core' ? 'Core 50' : 'Essential 50'} | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:132](../src/components/GameDetail.tsx#L132) | Rendered copy | ${game.title} | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:135](../src/components/GameDetail.tsx#L135) | Rendered copy | ${game.year} / ${game.studio} | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:143](../src/components/GameDetail.tsx#L143) | Rendered copy | ${author.shortName}'s original rating | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:144](../src/components/GameDetail.tsx#L144) | Rendered copy | Original workbook score, based on the game's rank. | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:146](../src/components/GameDetail.tsx#L146) | Rendered copy | ${authorRatingText(game.authorRating)} ${game.authorRating &amp;&amp; &lt;small&gt; / 10&lt;/small&gt;} | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:147](../src/components/GameDetail.tsx#L147) | Label/help | {game.authorRating ? &#96;Original workbook rating: ${game.authorRating.value.toFixed(2)}&#96; : undefined} | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:147](../src/components/GameDetail.tsx#L147) | Message/fragment | Original workbook rating: ${game.authorRating.value.toFixed(2)} | GameDetail(); game.authorRating is true |
| [src/components/GameDetail.tsx:157](../src/components/GameDetail.tsx#L157) | Rendered copy | ${game.artwork ? 'Workbook thumbnail' : 'Play 100 artwork'} | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:157](../src/components/GameDetail.tsx#L157) | Message/fragment | Workbook thumbnail | GameDetail(); game.artwork is true |
| [src/components/GameDetail.tsx:160](../src/components/GameDetail.tsx#L160) | Rendered copy | ${game.genre} | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:162](../src/components/GameDetail.tsx#L162) | Rendered copy | Why it made the list | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:163](../src/components/GameDetail.tsx#L163) | Rendered copy | ${game.rationale} | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:165](../src/components/GameDetail.tsx#L165) | Rendered copy | Source caveat: the workbook calls this "Hitman: World of Assassination", lists 2016 and supplies HITMAN III-branded artwork. We preserve all three rather than infer a release or edition. | GameDetail(); game.slug === 'hitman-world-of-assassination' &amp;&amp; |
| [src/components/GameDetail.tsx:173](../src/components/GameDetail.tsx#L173) | Rendered copy | From the source workbook ${game.sourceNote} | GameDetail(); game.sourceNote &amp;&amp; |
| [src/components/GameDetail.tsx:174](../src/components/GameDetail.tsx#L174) | Rendered copy | From the source workbook | GameDetail(); game.sourceNote &amp;&amp; |
| [src/components/GameDetail.tsx:183](../src/components/GameDetail.tsx#L183) | Rendered copy | Play later | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:194](../src/components/GameDetail.tsx#L194) | Rendered copy | Completed | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:205](../src/components/GameDetail.tsx#L205) | Label/help | {&#96;Share ${game.title}&#96;} | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:205](../src/components/GameDetail.tsx#L205) | Message/fragment | Share ${game.title} | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:211](../src/components/GameDetail.tsx#L211) | Rendered copy | ${mode.scope === 'guest' ? 'Guest progress stays on this device.' : 'Account progress. See Account for sync status.'} | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:213](../src/components/GameDetail.tsx#L213) | Message/fragment | Guest progress stays on this device. | GameDetail(); mode.scope === 'guest' is true |
| [src/components/GameDetail.tsx:214](../src/components/GameDetail.tsx#L214) | Message/fragment | Account progress. See Account for sync status. | GameDetail(); mode.scope === 'guest' is false |
| [src/components/GameDetail.tsx:221](../src/components/GameDetail.tsx#L221) | Label/help | {game.title} | GameDetail(); onRank &amp;&amp;; onPlayed &amp;&amp; |
| [src/components/GameDetail.tsx:228](../src/components/GameDetail.tsx#L228) | Rendered copy | ${rankingPosition ? &#96;Your rank: #${rankingPosition}&#96; : 'Add to my ranking'} | GameDetail(); onRank &amp;&amp; |
| [src/components/GameDetail.tsx:236](../src/components/GameDetail.tsx#L236) | Message/fragment | Add to my ranking | GameDetail(); onRank &amp;&amp;; rankingPosition is false |
| [src/components/GameDetail.tsx:236](../src/components/GameDetail.tsx#L236) | Message/fragment | Your rank: #${rankingPosition} | GameDetail(); onRank &amp;&amp;; rankingPosition is true |
| [src/components/GameDetail.tsx:243](../src/components/GameDetail.tsx#L243) | Label/help | {game.title} | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:248](../src/components/GameDetail.tsx#L248) | Rendered copy | Your rating ranks this game; it doesn't mark it played. | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:251](../src/components/GameDetail.tsx#L251) | Live region | ${shareFeedback} | GameDetail(); shareFeedback &amp;&amp; |
| [src/components/GameDetail.tsx:258](../src/components/GameDetail.tsx#L258) | Rendered copy | Critic scores | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:260](../src/components/GameDetail.tsx#L260) | Rendered copy | ${formatAverage(game.criticAverage)} | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:264](../src/components/GameDetail.tsx#L264) | Rendered copy | Workbook snapshot. Not live or independently verified. | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:271](../src/components/GameDetail.tsx#L271) | Rendered copy | Unavailable | GameDetail(); game.critics[key] === null is true |
| [src/components/GameDetail.tsx:274](../src/components/GameDetail.tsx#L274) | Rendered copy | ${game.critics[key]} | GameDetail(); game.critics[key] === null is false |
| [src/components/GameDetail.tsx:275](../src/components/GameDetail.tsx#L275) | Rendered copy | / ${scale} | GameDetail(); game.critics[key] === null is false |
| [src/components/GameDetail.tsx:283](../src/components/GameDetail.tsx#L283) | Rendered copy | Score sources &amp; method | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:287](../src/components/GameDetail.tsx#L287) | Rendered copy | The displayed average normalizes every available entered score to 100, then averages those columns. General and PC Metacritic each count when both are present. Missing scores are excluded. This is not an official aggregate or an average of independent publications. | GameDetail(); expanded "Score sources &amp; method" disclosure |
| [src/components/GameDetail.tsx:292](../src/components/GameDetail.tsx#L292) | Rendered copy | ${author.shortName}'s ratings come from the workbook's "my rating(based on rank)" column and stay separate from critics' scores. ${game.authorRating &amp;&amp; ( &lt;&gt; Original workbook rating: &lt;strong&gt;{game.authorRating.value.toFixed(2)}&lt;/strong&gt;, shown as{' '} {authorRatingText(game.authorRating)} / 10. &lt;/&gt; )} | GameDetail(); expanded "Score sources &amp; method" disclosure |
| [src/components/GameDetail.tsx:297](../src/components/GameDetail.tsx#L297) | Rendered copy | ${game.authorRating.value.toFixed(2)} | GameDetail(); expanded "Score sources &amp; method" disclosure; game.authorRating &amp;&amp; |
| [src/components/GameDetail.tsx:302](../src/components/GameDetail.tsx#L302) | Rendered copy | Your rating belongs to the active library, never prefilled from ${author.shortName}'s. Public sharing requires a separate preview and publish action. | GameDetail(); expanded "Score sources &amp; method" disclosure |
| [src/components/GameDetail.tsx:309](../src/components/GameDetail.tsx#L309) | Live region | ${navigationError} | GameDetail(); navigationError &amp;&amp; |
| [src/components/GameDetail.tsx:313](../src/components/GameDetail.tsx#L313) | Label/help | Games in the collection | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:314](../src/components/GameDetail.tsx#L314) | Rendered copy | Previous game | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:324](../src/components/GameDetail.tsx#L324) | Rendered copy | ${position ? &#96;${position.current} of ${position.total}&#96; : 'Not in these results'} | GameDetail(); when its owning surface/operation is used |
| [src/components/GameDetail.tsx:324](../src/components/GameDetail.tsx#L324) | Message/fragment | ${position.current} of ${position.total} | GameDetail(); position is true |
| [src/components/GameDetail.tsx:324](../src/components/GameDetail.tsx#L324) | Message/fragment | Not in these results | GameDetail(); position is false |
| [src/components/GameDetail.tsx:325](../src/components/GameDetail.tsx#L325) | Rendered copy | Next game | GameDetail(); when its owning surface/operation is used |
## src/components/games/GameArtwork.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/games/GameArtwork.tsx:41](../src/components/games/GameArtwork.tsx#L41) | Rendered copy | ${src &amp;&amp; src !== failedSrc ? ( &lt;img src={src} width={validArtwork?.width ?? 48} height={validArtwork?.height ?? 60} alt="" loading="lazy" decoding="async" onError={() =&gt; setFailedSrc(src)} /&gt; ) : ( &lt;span className="game-artwork-fallback" title="No artwork available"&gt; &lt;Icon name="stack" width="22" height="22" /&gt; &lt;/span&gt; )} | GameArtwork(); when its owning surface/operation is used |
| [src/components/games/GameArtwork.tsx:53](../src/components/games/GameArtwork.tsx#L53) | Label/help | No artwork available | GameArtwork(); src &amp;&amp; src !== failedSrc is false |
| [src/components/games/GameArtwork.tsx:61](../src/components/games/GameArtwork.tsx#L61) | Message/fragment | Resized and converted to WebP; original license retained. | conversionNotice(); when its owning surface/operation is used |
| [src/components/games/GameArtwork.tsx:62](../src/components/games/GameArtwork.tsx#L62) | Message/fragment | Trademark rights are not granted by the copyright license. | trademarkNotice(); when its owning surface/operation is used |
| [src/components/games/GameArtwork.tsx:84](../src/components/games/GameArtwork.tsx#L84) | Message/fragment | Original art | creditLines(); vector.length === 2 &amp;&amp; creator.startsWith('Original: ') is true |
| [src/components/games/GameArtwork.tsx:85](../src/components/games/GameArtwork.tsx#L85) | Message/fragment | Vector | creditLines(); vector.length === 2 &amp;&amp; creator.startsWith('Original: ') is true |
| [src/components/games/GameArtwork.tsx:89](../src/components/games/GameArtwork.tsx#L89) | Message/fragment | Art | creditLines(); vector.length === 2 &amp;&amp; creator.startsWith('Original: ') is false |
| [src/components/games/GameArtwork.tsx:93](../src/components/games/GameArtwork.tsx#L93) | Message/fragment | Own work | creditLines(); conversion === 2 is true |
| [src/components/games/GameArtwork.tsx:94](../src/components/games/GameArtwork.tsx#L94) | Message/fragment | Original source | creditLines(); conversion === 2 is true |
| [src/components/games/GameArtwork.tsx:96](../src/components/games/GameArtwork.tsx#L96) | Message/fragment | Conversion | creditLines(); when its owning surface/operation is used |
| [src/components/games/GameArtwork.tsx:97](../src/components/games/GameArtwork.tsx#L97) | Message/fragment | Trademark | creditLines(); parts[conversion + 1] === trademarkNotice is true |
| [src/components/games/GameArtwork.tsx:124](../src/components/games/GameArtwork.tsx#L124) | Rendered copy | ${new URL(href).hostname} | CreditText(); repeated &amp;&amp; repeated[2] === repeated[3] &amp;&amp; safeCreditLink(repeated[2]!, httpsOnly) is true |
| [src/components/games/GameArtwork.tsx:138](../src/components/games/GameArtwork.tsx#L138) | Rendered copy | ${named[1]} ${!wikimedia &amp;&amp; &#96; (${host})&#96;} | CreditText(); named &amp;&amp; safeCreditLink(named[2]!, httpsOnly) is true |
| [src/components/games/GameArtwork.tsx:150](../src/components/games/GameArtwork.tsx#L150) | Rendered copy | ${new URL(href).hostname} | CreditText(); single &amp;&amp; !/https?:\/\//.test(single[1]!) &amp;&amp; safeCreditLink(single[2]!, httpsOnly) is true |
| [src/components/games/GameArtwork.tsx:188](../src/components/games/GameArtwork.tsx#L188) | Rendered copy | Source image | credit(); safeCreditLink(artwork.sourceUrl, httpsOnly) is true |
| [src/components/games/GameArtwork.tsx:200](../src/components/games/GameArtwork.tsx#L200) | Rendered copy | ${artwork.license} | credit(); safeCreditLink(artwork.licenseUrl, httpsOnly) is true |
| [src/components/games/GameArtwork.tsx:211](../src/components/games/GameArtwork.tsx#L211) | Rendered copy | Full supplied credit | credit(); lines &amp;&amp; |
| [src/components/games/GameArtwork.tsx:212](../src/components/games/GameArtwork.tsx#L212) | Rendered copy | ${artwork.credit} | credit(); lines &amp;&amp;; expanded "Full supplied credit" disclosure |
| [src/components/games/GameArtwork.tsx:219](../src/components/games/GameArtwork.tsx#L219) | Label/help | {disclosureLabel} | GameArtworkCredit(); disclosureLabel is true |
| [src/components/games/GameArtwork.tsx:219](../src/components/games/GameArtwork.tsx#L219) | Rendered copy | Artwork credits | GameArtworkCredit(); disclosureLabel is true |
## src/components/LocalPager.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/LocalPager.tsx:22](../src/components/LocalPager.tsx#L22) | Message/fragment | Result pages | LocalPager(); when its owning surface/operation is used |
| [src/components/LocalPager.tsx:30](../src/components/LocalPager.tsx#L30) | Label/help | {label} | LocalPager(); when its owning surface/operation is used |
| [src/components/LocalPager.tsx:32](../src/components/LocalPager.tsx#L32) | Rendered copy | First | LocalPager(); when its owning surface/operation is used |
| [src/components/LocalPager.tsx:40](../src/components/LocalPager.tsx#L40) | Rendered copy | Previous | LocalPager(); when its owning surface/operation is used |
| [src/components/LocalPager.tsx:48](../src/components/LocalPager.tsx#L48) | Rendered copy | Page ${Array.from({ length: current.pageCount }, (_, index) =&gt; ( &lt;option key={index + 1} value={index + 1}&gt; {index + 1} of {current.pageCount} &lt;/option&gt; ))} | LocalPager(); when its owning surface/operation is used |
| [src/components/LocalPager.tsx:51](../src/components/LocalPager.tsx#L51) | Label/help | {&#96;${label}: page&#96;} | LocalPager(); when its owning surface/operation is used |
| [src/components/LocalPager.tsx:57](../src/components/LocalPager.tsx#L57) | Rendered copy | ${index + 1} of ${current.pageCount} | LocalPager(); when its owning surface/operation is used |
| [src/components/LocalPager.tsx:63](../src/components/LocalPager.tsx#L63) | Rendered copy | Next | LocalPager(); when its owning surface/operation is used |
| [src/components/LocalPager.tsx:71](../src/components/LocalPager.tsx#L71) | Rendered copy | Last | LocalPager(); when its owning surface/operation is used |
| [src/components/LocalPager.tsx:80](../src/components/LocalPager.tsx#L80) | Rendered copy | ${formatResultRange(total, current.start, current.end, itemLabel)} | LocalPager(); when its owning surface/operation is used |
## src/components/MenuDialog.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/MenuDialog.tsx:86](../src/components/MenuDialog.tsx#L86) | Message output | visibleFocusTarget(blockedTarget) ? 'Your edit has not saved. Return to the highlighted rating or note to correct it or retry.' : 'Your edit has not saved. Its editor is not visible in this view. Return to the original editor to correct it or retry.' | activate(); saved is false |
| [src/components/MenuDialog.tsx:88](../src/components/MenuDialog.tsx#L88) | Message/fragment | Your edit has not saved. Return to the highlighted rating or note to correct it or retry. | activate(); saved is false; visibleFocusTarget(blockedTarget) is true |
| [src/components/MenuDialog.tsx:89](../src/components/MenuDialog.tsx#L89) | Message/fragment | Your edit has not saved. Its editor is not visible in this view. Return to the original editor to correct it or retry. | activate(); saved is false; visibleFocusTarget(blockedTarget) is false |
| [src/components/MenuDialog.tsx:95](../src/components/MenuDialog.tsx#L95) | Message output | 'Your edit could not be saved. Return to your edit and retry before leaving this page.' | activate(); operation rejected or threw; active.current &amp;&amp; isCurrent() is true |
| [src/components/MenuDialog.tsx:95](../src/components/MenuDialog.tsx#L95) | Message/fragment | Your edit could not be saved. Return to your edit and retry before leaving this page. | activate(); operation rejected or threw; active.current &amp;&amp; isCurrent() is true |
| [src/components/MenuDialog.tsx:116](../src/components/MenuDialog.tsx#L116) | Rendered copy | ${label} ${current &amp;&amp; &lt;small aria-hidden="true"&gt;Current&lt;/small&gt;} | link(); when its owning surface/operation is used |
| [src/components/MenuDialog.tsx:126](../src/components/MenuDialog.tsx#L126) | Rendered copy | ${label} | link(); when its owning surface/operation is used |
| [src/components/MenuDialog.tsx:127](../src/components/MenuDialog.tsx#L127) | Rendered copy | Current | link(); current &amp;&amp; |
| [src/components/MenuDialog.tsx:143](../src/components/MenuDialog.tsx#L143) | Rendered copy | Menu | MenuDialog(); when its owning surface/operation is used |
| [src/components/MenuDialog.tsx:147](../src/components/MenuDialog.tsx#L147) | Live region | ${saving ? 'Saving your open edit…' : moduleRecovery ? '' : status} | MenuDialog(); when its owning surface/operation is used |
| [src/components/MenuDialog.tsx:148](../src/components/MenuDialog.tsx#L148) | Message/fragment | Saving your open edit… | MenuDialog(); saving is true |
| [src/components/MenuDialog.tsx:152](../src/components/MenuDialog.tsx#L152) | Live region | ${error} Return to edit | MenuDialog(); error &amp;&amp; |
| [src/components/MenuDialog.tsx:153](../src/components/MenuDialog.tsx#L153) | Rendered copy | ${error} | MenuDialog(); error &amp;&amp; |
| [src/components/MenuDialog.tsx:154](../src/components/MenuDialog.tsx#L154) | Rendered copy | Return to edit | MenuDialog(); error &amp;&amp; |
| [src/components/MenuDialog.tsx:168](../src/components/MenuDialog.tsx#L168) | Label/help | All navigation | MenuDialog(); when its owning surface/operation is used |
| [src/components/MenuDialog.tsx:171](../src/components/MenuDialog.tsx#L171) | Rendered copy | Browse | MenuDialog(); when its owning surface/operation is used |
| [src/components/MenuDialog.tsx:174](../src/components/MenuDialog.tsx#L174) | Message/fragment | Discover | MenuDialog(); when its owning surface/operation is used |
| [src/components/MenuDialog.tsx:178](../src/components/MenuDialog.tsx#L178) | Rendered copy | My games | MenuDialog(); when its owning surface/operation is used |
| [src/components/MenuDialog.tsx:180](../src/components/MenuDialog.tsx#L180) | Message/fragment | Library | MenuDialog(); when its owning surface/operation is used |
| [src/components/MenuDialog.tsx:181](../src/components/MenuDialog.tsx#L181) | Message/fragment | Play later | MenuDialog(); when its owning surface/operation is used |
| [src/components/MenuDialog.tsx:182](../src/components/MenuDialog.tsx#L182) | Message/fragment | Ranking | MenuDialog(); when its owning surface/operation is used |
| [src/components/MenuDialog.tsx:187](../src/components/MenuDialog.tsx#L187) | Rendered copy | Online sharing | MenuDialog(); onlineAvailable &amp;&amp; |
| [src/components/MenuDialog.tsx:188](../src/components/MenuDialog.tsx#L188) | Rendered copy | An account is needed to share or compare with friends. | MenuDialog(); onlineAvailable &amp;&amp; |
| [src/components/MenuDialog.tsx:190](../src/components/MenuDialog.tsx#L190) | Message/fragment | Friends | MenuDialog(); onlineAvailable &amp;&amp; |
| [src/components/MenuDialog.tsx:191](../src/components/MenuDialog.tsx#L191) | Message/fragment | Compare | MenuDialog(); onlineAvailable &amp;&amp; |
| [src/components/MenuDialog.tsx:192](../src/components/MenuDialog.tsx#L192) | Message/fragment | Community | MenuDialog(); onlineAvailable &amp;&amp; |
| [src/components/MenuDialog.tsx:193](../src/components/MenuDialog.tsx#L193) | Message/fragment | Publish ranking | MenuDialog(); onlineAvailable &amp;&amp; |
| [src/components/MenuDialog.tsx:194](../src/components/MenuDialog.tsx#L194) | Message/fragment | Friend sharing | MenuDialog(); onlineAvailable &amp;&amp; |
| [src/components/MenuDialog.tsx:195](../src/components/MenuDialog.tsx#L195) | Message/fragment | Shared games | MenuDialog(); onlineAvailable &amp;&amp; |
| [src/components/MenuDialog.tsx:200](../src/components/MenuDialog.tsx#L200) | Rendered copy | Account &amp; tools | MenuDialog(); when its owning surface/operation is used |
| [src/components/MenuDialog.tsx:202](../src/components/MenuDialog.tsx#L202) | Message/fragment | Account | MenuDialog(); onlineAvailable &amp;&amp; |
| [src/components/MenuDialog.tsx:203](../src/components/MenuDialog.tsx#L203) | Message/fragment | Creator desk | MenuDialog(); onlineAvailable &amp;&amp; creator &amp;&amp; |
| [src/components/MenuDialog.tsx:205](../src/components/MenuDialog.tsx#L205) | Rendered copy | Settings &amp; backups | MenuDialog(); when its owning surface/operation is used |
| [src/components/MenuDialog.tsx:216](../src/components/MenuDialog.tsx#L216) | Rendered copy | Install &amp; offline access | MenuDialog(); onOffline &amp;&amp; |
| [src/components/MenuDialog.tsx:230](../src/components/MenuDialog.tsx#L230) | Rendered copy | About &amp; credits | MenuDialog(); when its owning surface/operation is used |
| [src/components/MenuDialog.tsx:242](../src/components/MenuDialog.tsx#L242) | Rendered copy | Workbooks | MenuDialog(); when its owning surface/operation is used |
| [src/components/MenuDialog.tsx:245](../src/components/MenuDialog.tsx#L245) | Rendered copy | Enhanced spreadsheet | MenuDialog(); when its owning surface/operation is used |
| [src/components/MenuDialog.tsx:251](../src/components/MenuDialog.tsx#L251) | Rendered copy | Original spreadsheet | MenuDialog(); when its owning surface/operation is used |
## src/components/OnlineBoundary.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/OnlineBoundary.tsx:34](../src/components/OnlineBoundary.tsx#L34) | Rendered copy | Online tools couldn't open. | render(); this.state.failed is true |
| [src/components/OnlineBoundary.tsx:35](../src/components/OnlineBoundary.tsx#L35) | Rendered copy | Your device library is still available. | render(); this.state.failed is true |
| [src/components/OnlineBoundary.tsx:36](../src/components/OnlineBoundary.tsx#L36) | Label/help | These online tools didn't load. | render(); this.state.failed is true |
| [src/components/OnlineBoundary.tsx:37](../src/components/OnlineBoundary.tsx#L37) | Rendered copy | Keep using this device | render(); this.state.failed is true |
## src/components/personal/AddGamesPanel.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/personal/AddGamesPanel.tsx:63](../src/components/personal/AddGamesPanel.tsx#L63) | Rendered copy | ${expanded ? 'Close game picker' : 'Add games'} | AddGamesPanel(); when its owning surface/operation is used |
| [src/components/personal/AddGamesPanel.tsx:69](../src/components/personal/AddGamesPanel.tsx#L69) | Message/fragment | Add games | AddGamesPanel(); expanded is false |
| [src/components/personal/AddGamesPanel.tsx:69](../src/components/personal/AddGamesPanel.tsx#L69) | Message/fragment | Close game picker | AddGamesPanel(); expanded is true |
| [src/components/personal/AddGamesPanel.tsx:73](../src/components/personal/AddGamesPanel.tsx#L73) | Rendered copy | Find a game from The 100 or your library | AddGamesPanel(); (expanded &#124;&#124; manualDraft.title.length &gt; 0 &#124;&#124; manualDraft.year.length &gt; 0) &amp;&amp; |
| [src/components/personal/AddGamesPanel.tsx:81](../src/components/personal/AddGamesPanel.tsx#L81) | Label/help | Search your available games… | AddGamesPanel(); (expanded &#124;&#124; manualDraft.title.length &gt; 0 &#124;&#124; manualDraft.year.length &gt; 0) &amp;&amp; |
| [src/components/personal/AddGamesPanel.tsx:91](../src/components/personal/AddGamesPanel.tsx#L91) | Rendered copy | ${record.title} | AddGamesPanel(); (expanded &#124;&#124; manualDraft.title.length &gt; 0 &#124;&#124; manualDraft.year.length &gt; 0) &amp;&amp; |
| [src/components/personal/AddGamesPanel.tsx:92](../src/components/personal/AddGamesPanel.tsx#L92) | Rendered copy | ${SOURCE_LABELS[record.source]} ${record.year ? &#96; · ${record.year}&#96; : ''} ${existing ? (kind === 'ranking' ? ' · Already ranked' : ' · Already in library') : ''} | AddGamesPanel(); (expanded &#124;&#124; manualDraft.title.length &gt; 0 &#124;&#124; manualDraft.year.length &gt; 0) &amp;&amp; |
| [src/components/personal/AddGamesPanel.tsx:95](../src/components/personal/AddGamesPanel.tsx#L95) | Message/fragment | · Already in library | AddGamesPanel(); (expanded &#124;&#124; manualDraft.title.length &gt; 0 &#124;&#124; manualDraft.year.length &gt; 0) &amp;&amp;; existing is true; kind === 'ranking' is false |
| [src/components/personal/AddGamesPanel.tsx:95](../src/components/personal/AddGamesPanel.tsx#L95) | Message/fragment | · Already ranked | AddGamesPanel(); (expanded &#124;&#124; manualDraft.title.length &gt; 0 &#124;&#124; manualDraft.year.length &gt; 0) &amp;&amp;; existing is true; kind === 'ranking' is true |
| [src/components/personal/AddGamesPanel.tsx:100](../src/components/personal/AddGamesPanel.tsx#L100) | Label/help | {existing ? &#96;Already in ${kind}: ${record.title}&#96; : &#96;Add ${record.title} to ${kind}&#96;} | AddGamesPanel(); (expanded &#124;&#124; manualDraft.title.length &gt; 0 &#124;&#124; manualDraft.year.length &gt; 0) &amp;&amp; |
| [src/components/personal/AddGamesPanel.tsx:100](../src/components/personal/AddGamesPanel.tsx#L100) | Message/fragment | Add ${record.title} to ${kind} | AddGamesPanel(); (expanded &#124;&#124; manualDraft.title.length &gt; 0 &#124;&#124; manualDraft.year.length &gt; 0) &amp;&amp;; existing is false |
| [src/components/personal/AddGamesPanel.tsx:100](../src/components/personal/AddGamesPanel.tsx#L100) | Message/fragment | Already in ${kind}: ${record.title} | AddGamesPanel(); (expanded &#124;&#124; manualDraft.title.length &gt; 0 &#124;&#124; manualDraft.year.length &gt; 0) &amp;&amp;; existing is true |
| [src/components/personal/AddGamesPanel.tsx:112](../src/components/personal/AddGamesPanel.tsx#L112) | Rendered copy | No match in these games. Discover more or add your own title below. | AddGamesPanel(); (expanded &#124;&#124; manualDraft.title.length &gt; 0 &#124;&#124; manualDraft.year.length &gt; 0) &amp;&amp;; !choices.length &amp;&amp; |
| [src/components/personal/AddGamesPanel.tsx:113](../src/components/personal/AddGamesPanel.tsx#L113) | Rendered copy | Up to six suggestions. Search to find another title. | AddGamesPanel(); (expanded &#124;&#124; manualDraft.title.length &gt; 0 &#124;&#124; manualDraft.year.length &gt; 0) &amp;&amp;; !query &amp;&amp; |
| [src/components/personal/AddGamesPanel.tsx:114](../src/components/personal/AddGamesPanel.tsx#L114) | Rendered copy | Discover games beyond The 100 | AddGamesPanel(); (expanded &#124;&#124; manualDraft.title.length &gt; 0 &#124;&#124; manualDraft.year.length &gt; 0) &amp;&amp; |
| [src/components/personal/AddGamesPanel.tsx:123](../src/components/personal/AddGamesPanel.tsx#L123) | Label/help | {kind === 'ranking' ? 'Add to my ranking' : 'Add to My games'} | AddGamesPanel(); (expanded &#124;&#124; manualDraft.title.length &gt; 0 &#124;&#124; manualDraft.year.length &gt; 0) &amp;&amp; |
| [src/components/personal/AddGamesPanel.tsx:123](../src/components/personal/AddGamesPanel.tsx#L123) | Message/fragment | Add to My games | AddGamesPanel(); (expanded &#124;&#124; manualDraft.title.length &gt; 0 &#124;&#124; manualDraft.year.length &gt; 0) &amp;&amp;; kind === 'ranking' is false |
| [src/components/personal/AddGamesPanel.tsx:123](../src/components/personal/AddGamesPanel.tsx#L123) | Message/fragment | Add to my ranking | AddGamesPanel(); (expanded &#124;&#124; manualDraft.title.length &gt; 0 &#124;&#124; manualDraft.year.length &gt; 0) &amp;&amp;; kind === 'ranking' is true |
## src/components/personal/BackupPanel.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/personal/BackupPanel.tsx:64](../src/components/personal/BackupPanel.tsx#L64) | Message output | 'Your backup was restored and saved on this device.' | restoreBackup(); success is true |
| [src/components/personal/BackupPanel.tsx:64](../src/components/personal/BackupPanel.tsx#L64) | Message/fragment | Your backup was restored and saved on this device. | restoreBackup(); success is true |
| [src/components/personal/BackupPanel.tsx:65](../src/components/personal/BackupPanel.tsx#L65) | Message output | 'Restore failed. Your existing library was not replaced.' | restoreBackup(); success is false |
| [src/components/personal/BackupPanel.tsx:65](../src/components/personal/BackupPanel.tsx#L65) | Message/fragment | Restore failed. Your existing library was not replaced. | restoreBackup(); success is false |
| [src/components/personal/BackupPanel.tsx:68](../src/components/personal/BackupPanel.tsx#L68) | Message output | 'Restore failed. Your existing library was not replaced.' | restoreBackup(); operation rejected or threw; active.current is true |
| [src/components/personal/BackupPanel.tsx:68](../src/components/personal/BackupPanel.tsx#L68) | Message/fragment | Restore failed. Your existing library was not replaced. | restoreBackup(); operation rejected or threw; active.current is true |
| [src/components/personal/BackupPanel.tsx:83](../src/components/personal/BackupPanel.tsx#L83) | Message output | 'This browser could not check storage protection. Keep a downloaded backup.' | BackupPanel(); !canceled is true |
| [src/components/personal/BackupPanel.tsx:83](../src/components/personal/BackupPanel.tsx#L83) | Message/fragment | This browser could not check storage protection. Keep a downloaded backup. | BackupPanel(); !canceled is true |
| [src/components/personal/BackupPanel.tsx:95](../src/components/personal/BackupPanel.tsx#L95) | Message output | backup.message | exportBackup(); !backup.ok is true |
| [src/components/personal/BackupPanel.tsx:111](../src/components/personal/BackupPanel.tsx#L111) | Message output | 'Backup download started. It includes My games, Play later, rankings, notes and preferences.' | exportBackup(); when its owning surface/operation is used |
| [src/components/personal/BackupPanel.tsx:111](../src/components/personal/BackupPanel.tsx#L111) | Message/fragment | Backup download started. It includes My games, Play later, rankings, notes and preferences. | exportBackup(); when its owning surface/operation is used |
| [src/components/personal/BackupPanel.tsx:128](../src/components/personal/BackupPanel.tsx#L128) | Message output | tooLarge | readBackup(); tooLarge is true |
| [src/components/personal/BackupPanel.tsx:136](../src/components/personal/BackupPanel.tsx#L136) | Message output | cause instanceof Error &amp;&amp; cause.name === 'PersonalLibraryBudgetError' ? cause.message : cause instanceof Error &amp;&amp; cause.name === 'PersonalLibraryValidationError' ? "This isn't a supported Play 100 backup. Choose a JSON file made with Export my library. Your existing data hasn't changed." : "This backup could not be read as JSON. Choose a file made with Export my library, then try again. Your existing data hasn't changed." | readBackup(); operation rejected or threw |
| [src/components/personal/BackupPanel.tsx:140](../src/components/personal/BackupPanel.tsx#L140) | Message/fragment | This isn't a supported Play 100 backup. Choose a JSON file made with Export my library. Your existing data hasn't changed. | readBackup(); operation rejected or threw; cause instanceof Error &amp;&amp; cause.name === 'PersonalLibraryBudgetError' is false; cause instanceof Error &amp;&amp; cause.name === 'PersonalLibraryValidationError' is true |
| [src/components/personal/BackupPanel.tsx:141](../src/components/personal/BackupPanel.tsx#L141) | Message/fragment | This backup could not be read as JSON. Choose a file made with Export my library, then try again. Your existing data hasn't changed. | readBackup(); operation rejected or threw; cause instanceof Error &amp;&amp; cause.name === 'PersonalLibraryBudgetError' is false; cause instanceof Error &amp;&amp; cause.name === 'PersonalLibraryValidationError' is false |
| [src/components/personal/BackupPanel.tsx:150](../src/components/personal/BackupPanel.tsx#L150) | Message output | 'This browser does not support requesting storage protection. Keep a downloaded backup.' | protectStorage(); !navigator.storage?.persist is true |
| [src/components/personal/BackupPanel.tsx:150](../src/components/personal/BackupPanel.tsx#L150) | Message/fragment | This browser does not support requesting storage protection. Keep a downloaded backup. | protectStorage(); !navigator.storage?.persist is true |
| [src/components/personal/BackupPanel.tsx:156](../src/components/personal/BackupPanel.tsx#L156) | Message output | granted ? 'Storage protection was granted.' : 'This browser did not grant storage protection. Your library is still saved on this device; keep a downloaded backup.' | protectStorage(); when its owning surface/operation is used |
| [src/components/personal/BackupPanel.tsx:158](../src/components/personal/BackupPanel.tsx#L158) | Message/fragment | Storage protection was granted. | protectStorage(); granted is true |
| [src/components/personal/BackupPanel.tsx:159](../src/components/personal/BackupPanel.tsx#L159) | Message/fragment | This browser did not grant storage protection. Your library is still saved on this device; keep a downloaded backup. | protectStorage(); granted is false |
| [src/components/personal/BackupPanel.tsx:162](../src/components/personal/BackupPanel.tsx#L162) | Message output | 'The browser could not request storage protection. Keep a downloaded backup.' | protectStorage(); operation rejected or threw |
| [src/components/personal/BackupPanel.tsx:162](../src/components/personal/BackupPanel.tsx#L162) | Message/fragment | The browser could not request storage protection. Keep a downloaded backup. | protectStorage(); operation rejected or threw |
| [src/components/personal/BackupPanel.tsx:167](../src/components/personal/BackupPanel.tsx#L167) | Rendered copy | Backups | BackupPanel(); when its owning surface/operation is used |
| [src/components/personal/BackupPanel.tsx:168](../src/components/personal/BackupPanel.tsx#L168) | Live region | ${loading ? ( 'Opening your library…' ) : persistent ? ( 'Download a backup to move or recover your library.' ) : ( &lt;&gt; &lt;strong&gt;Device storage is unavailable.&lt;/strong&gt; Your changes are temporary. Export them before closing this tab. &lt;/&gt; )} | BackupPanel(); when its owning surface/operation is used |
| [src/components/personal/BackupPanel.tsx:170](../src/components/personal/BackupPanel.tsx#L170) | Message/fragment | Opening your library… | BackupPanel(); loading is true |
| [src/components/personal/BackupPanel.tsx:172](../src/components/personal/BackupPanel.tsx#L172) | Message/fragment | Download a backup to move or recover your library. | BackupPanel(); loading is false; persistent is true |
| [src/components/personal/BackupPanel.tsx:175](../src/components/personal/BackupPanel.tsx#L175) | Rendered copy | Device storage is unavailable. | BackupPanel(); loading is false; persistent is false |
| [src/components/personal/BackupPanel.tsx:181](../src/components/personal/BackupPanel.tsx#L181) | Rendered copy | Export my library | BackupPanel(); when its owning surface/operation is used |
| [src/components/personal/BackupPanel.tsx:185](../src/components/personal/BackupPanel.tsx#L185) | Rendered copy | ${reading ? 'Reading backup…' : 'Import backup'} | BackupPanel(); when its owning surface/operation is used |
| [src/components/personal/BackupPanel.tsx:196](../src/components/personal/BackupPanel.tsx#L196) | Message/fragment | Import backup | BackupPanel(); reading is false |
| [src/components/personal/BackupPanel.tsx:196](../src/components/personal/BackupPanel.tsx#L196) | Message/fragment | Reading backup… | BackupPanel(); reading is true |
| [src/components/personal/BackupPanel.tsx:205](../src/components/personal/BackupPanel.tsx#L205) | Label/help | Import personal library backup file | BackupPanel(); when its owning surface/operation is used |
| [src/components/personal/BackupPanel.tsx:213](../src/components/personal/BackupPanel.tsx#L213) | Rendered copy | ${describeLibraryBackup(incoming)} | BackupPanel(); incoming &amp;&amp; |
| [src/components/personal/BackupPanel.tsx:215](../src/components/personal/BackupPanel.tsx#L215) | Rendered copy | Restoring replaces the active library and device preferences. ${mode.scope !== 'guest' &amp;&amp; 'This replacement will sync to the account if online saving is enabled. The guest library stays separate.'} Export your current library first if you want to keep both. | BackupPanel(); incoming &amp;&amp; |
| [src/components/personal/BackupPanel.tsx:218](../src/components/personal/BackupPanel.tsx#L218) | Message/fragment | This replacement will sync to the account if online saving is enabled. The guest library stays separate. | BackupPanel(); incoming &amp;&amp;; mode.scope !== 'guest' &amp;&amp; |
| [src/components/personal/BackupPanel.tsx:222](../src/components/personal/BackupPanel.tsx#L222) | Rendered copy | Replace with this backup | BackupPanel(); incoming &amp;&amp; |
| [src/components/personal/BackupPanel.tsx:231](../src/components/personal/BackupPanel.tsx#L231) | Rendered copy | Cancel import | BackupPanel(); incoming &amp;&amp; |
| [src/components/personal/BackupPanel.tsx:247](../src/components/personal/BackupPanel.tsx#L247) | Rendered copy | ${storageStatus === 'granted' ? 'Protection from automatic storage cleanup is enabled.' : 'Ask your browser for protection from automatic storage cleanup.'} Clearing site data can still remove your library. | BackupPanel(); persistent &amp;&amp; |
| [src/components/personal/BackupPanel.tsx:249](../src/components/personal/BackupPanel.tsx#L249) | Message/fragment | Protection from automatic storage cleanup is enabled. | BackupPanel(); persistent &amp;&amp;; storageStatus === 'granted' is true |
| [src/components/personal/BackupPanel.tsx:250](../src/components/personal/BackupPanel.tsx#L250) | Message/fragment | Ask your browser for protection from automatic storage cleanup. | BackupPanel(); persistent &amp;&amp;; storageStatus === 'granted' is false |
| [src/components/personal/BackupPanel.tsx:254](../src/components/personal/BackupPanel.tsx#L254) | Rendered copy | Ask browser to protect saved data | BackupPanel(); persistent &amp;&amp;; storageStatus !== 'granted' &amp;&amp; |
| [src/components/personal/BackupPanel.tsx:267](../src/components/personal/BackupPanel.tsx#L267) | Live region | ${message} | BackupPanel(); message &amp;&amp; |
| [src/components/personal/BackupPanel.tsx:272](../src/components/personal/BackupPanel.tsx#L272) | Live region | ${error} | BackupPanel(); error &amp;&amp; |
## src/components/personal/CatalogDetail.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/personal/CatalogDetail.tsx:101](../src/components/personal/CatalogDetail.tsx#L101) | Message/fragment | This change could not be saved. Your library is unchanged. Try again. | failure(); result === 'failed' is true; error &#124;&#124; feedback &#124;&#124; |
| [src/components/personal/CatalogDetail.tsx:103](../src/components/personal/CatalogDetail.tsx#L103) | Message/fragment | Saving changes… | status(); result === 'pending' is true |
| [src/components/personal/CatalogDetail.tsx:115](../src/components/personal/CatalogDetail.tsx#L115) | Rendered copy | ${record.title} | CatalogDetail(); when its owning surface/operation is used |
| [src/components/personal/CatalogDetail.tsx:118](../src/components/personal/CatalogDetail.tsx#L118) | Rendered copy | ${SOURCE_LABELS[record.source]} ${record.collectionRank !== null ? &#96; · original rank #${record.collectionRank}&#96; : &#96; · Unranked in ${author.shortName}'s collection&#96;} | CatalogDetail(); when its owning surface/operation is used |
| [src/components/personal/CatalogDetail.tsx:121](../src/components/personal/CatalogDetail.tsx#L121) | Message/fragment | · original rank #${record.collectionRank} | CatalogDetail(); record.collectionRank !== null is true |
| [src/components/personal/CatalogDetail.tsx:122](../src/components/personal/CatalogDetail.tsx#L122) | Message/fragment | · Unranked in ${author.shortName}'s collection | CatalogDetail(); record.collectionRank !== null is false |
| [src/components/personal/CatalogDetail.tsx:124](../src/components/personal/CatalogDetail.tsx#L124) | Rendered copy | ${CATALOG_EDITION_HINTS.get(record.id)} | CatalogDetail(); CATALOG_EDITION_HINTS.has(record.id) &amp;&amp; |
| [src/components/personal/CatalogDetail.tsx:137](../src/components/personal/CatalogDetail.tsx#L137) | Rendered copy | Artwork unavailable | CatalogDetail(); !artwork &amp;&amp; !externalArtwork &amp;&amp; |
| [src/components/personal/CatalogDetail.tsx:148](../src/components/personal/CatalogDetail.tsx#L148) | Message/fragment | Not provided | CatalogDetail(); record.year ?? |
| [src/components/personal/CatalogDetail.tsx:152](../src/components/personal/CatalogDetail.tsx#L152) | Message/fragment | Not provided | CatalogDetail(); record.studio ?? |
| [src/components/personal/CatalogDetail.tsx:156](../src/components/personal/CatalogDetail.tsx#L156) | Message/fragment | Not provided | CatalogDetail(); catalogGenreLabel(record) ?? |
| [src/components/personal/CatalogDetail.tsx:161](../src/components/personal/CatalogDetail.tsx#L161) | Rendered copy | Source classification | CatalogDetail(); record.source !== 'collection' &amp;&amp; record.source !== 'manual' &amp;&amp; |
| [src/components/personal/CatalogDetail.tsx:162](../src/components/personal/CatalogDetail.tsx#L162) | Rendered copy | ${record.genre ?? 'Not provided'} | CatalogDetail(); record.source !== 'collection' &amp;&amp; record.source !== 'manual' &amp;&amp;; expanded "Source classification" disclosure |
| [src/components/personal/CatalogDetail.tsx:162](../src/components/personal/CatalogDetail.tsx#L162) | Message/fragment | Not provided | CatalogDetail(); record.source !== 'collection' &amp;&amp; record.source !== 'manual' &amp;&amp;; expanded "Source classification" disclosure; record.genre ?? |
| [src/components/personal/CatalogDetail.tsx:166](../src/components/personal/CatalogDetail.tsx#L166) | Rendered copy | View on ${SOURCE_LABELS[record.source]} | CatalogDetail(); record.sourceUrl &amp;&amp; |
| [src/components/personal/CatalogDetail.tsx:171](../src/components/personal/CatalogDetail.tsx#L171) | Rendered copy | Source metadata is not independently verified. | CatalogDetail(); when its owning surface/operation is used |
| [src/components/personal/CatalogDetail.tsx:174](../src/components/personal/CatalogDetail.tsx#L174) | Rendered copy | ${saved ? 'In My games' : 'Add to My games'} | CatalogDetail(); canAddToLibrary &amp;&amp; |
| [src/components/personal/CatalogDetail.tsx:177](../src/components/personal/CatalogDetail.tsx#L177) | Label/help | {&#96;${saved ? 'In My games' : 'Add to My games'}: ${record.title}&#96;} | CatalogDetail(); canAddToLibrary &amp;&amp; |
| [src/components/personal/CatalogDetail.tsx:177](../src/components/personal/CatalogDetail.tsx#L177) | Message/fragment | ${saved ? 'In My games' : 'Add to My games'}: ${record.title} | CatalogDetail(); canAddToLibrary &amp;&amp; |
| [src/components/personal/CatalogDetail.tsx:183](../src/components/personal/CatalogDetail.tsx#L183) | Message/fragment | Add to My games | CatalogDetail(); canAddToLibrary &amp;&amp;; saved is false |
| [src/components/personal/CatalogDetail.tsx:183](../src/components/personal/CatalogDetail.tsx#L183) | Message/fragment | In My games | CatalogDetail(); canAddToLibrary &amp;&amp;; saved is true |
| [src/components/personal/CatalogDetail.tsx:186](../src/components/personal/CatalogDetail.tsx#L186) | Rendered copy | Play later | CatalogDetail(); when its owning surface/operation is used |
| [src/components/personal/CatalogDetail.tsx:197](../src/components/personal/CatalogDetail.tsx#L197) | Rendered copy | Completed | CatalogDetail(); when its owning surface/operation is used |
| [src/components/personal/CatalogDetail.tsx:212](../src/components/personal/CatalogDetail.tsx#L212) | Label/help | {record.title} | CatalogDetail(); when its owning surface/operation is used |
| [src/components/personal/CatalogDetail.tsx:220](../src/components/personal/CatalogDetail.tsx#L220) | Rendered copy | ${rankingPosition === null ? ( &lt;&gt; &lt;Icon name="rank" width="18" height="18" /&gt; Add to my ranking &lt;/&gt; ) : ( &lt;&gt; Your rank: #{rankingPosition} &lt;Icon name="arrow" width="17" height="17" /&gt; &lt;/&gt; )} | CatalogDetail(); when its owning surface/operation is used |
| [src/components/personal/CatalogDetail.tsx:244](../src/components/personal/CatalogDetail.tsx#L244) | Label/help | {record.title} | CatalogDetail(); when its owning surface/operation is used |
| [src/components/personal/CatalogDetail.tsx:249](../src/components/personal/CatalogDetail.tsx#L249) | Rendered copy | Your rating ranks this game; it doesn't mark it played. | CatalogDetail(); when its owning surface/operation is used |
| [src/components/personal/CatalogDetail.tsx:251](../src/components/personal/CatalogDetail.tsx#L251) | Rendered copy | ${saved ? 'Saved in My games.' : canAddToLibrary ? 'Preview only. Add to My games to keep this game without changing your progress, Play later or ranking.' : 'Preview only. Rate or mark progress here to keep this game.'} The 100 stays unchanged. | CatalogDetail(); when its owning surface/operation is used |
| [src/components/personal/CatalogDetail.tsx:253](../src/components/personal/CatalogDetail.tsx#L253) | Message/fragment | Saved in My games. | CatalogDetail(); saved is true |
| [src/components/personal/CatalogDetail.tsx:255](../src/components/personal/CatalogDetail.tsx#L255) | Message/fragment | Preview only. Add to My games to keep this game without changing your progress, Play later or ranking. | CatalogDetail(); saved is false; canAddToLibrary is true |
| [src/components/personal/CatalogDetail.tsx:256](../src/components/personal/CatalogDetail.tsx#L256) | Message/fragment | Preview only. Rate or mark progress here to keep this game. | CatalogDetail(); saved is false; canAddToLibrary is false |
| [src/components/personal/CatalogDetail.tsx:261](../src/components/personal/CatalogDetail.tsx#L261) | Live region | ${failure} | CatalogDetail(); failure is true |
| [src/components/personal/CatalogDetail.tsx:265](../src/components/personal/CatalogDetail.tsx#L265) | Live region | ${status} | CatalogDetail(); failure is false; status is true |
## src/components/personal/LibraryPage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/personal/LibraryPage.tsx:107](../src/components/personal/LibraryPage.tsx#L107) | Rendered copy | ${workspaceView === 'queue' ? 'Play later' : 'Library'} | LibraryPage(); embedded is true |
| [src/components/personal/LibraryPage.tsx:108](../src/components/personal/LibraryPage.tsx#L108) | Message/fragment | Library | LibraryPage(); embedded is true; workspaceView === 'queue' is false |
| [src/components/personal/LibraryPage.tsx:108](../src/components/personal/LibraryPage.tsx#L108) | Message/fragment | Play later | LibraryPage(); embedded is true; workspaceView === 'queue' is true |
| [src/components/personal/LibraryPage.tsx:113](../src/components/personal/LibraryPage.tsx#L113) | Rendered copy | My library | LibraryPage(); embedded is false |
| [src/components/personal/LibraryPage.tsx:117](../src/components/personal/LibraryPage.tsx#L117) | Rendered copy | Find more games | LibraryPage(); embedded is false |
| [src/components/personal/LibraryPage.tsx:124](../src/components/personal/LibraryPage.tsx#L124) | Label/help | Personal library views | LibraryPage(); !embedded &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:125](../src/components/personal/LibraryPage.tsx#L125) | Rendered copy | Play later ${state.queueOrder.length} | LibraryPage(); !embedded &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:126](../src/components/personal/LibraryPage.tsx#L126) | Label/help | {&#96;Play later, ${state.queueOrder.length}&#96;} | LibraryPage(); !embedded &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:126](../src/components/personal/LibraryPage.tsx#L126) | Message/fragment | Play later, ${state.queueOrder.length} | LibraryPage(); !embedded &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:130](../src/components/personal/LibraryPage.tsx#L130) | Rendered copy | ${state.queueOrder.length} | LibraryPage(); !embedded &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:132](../src/components/personal/LibraryPage.tsx#L132) | Rendered copy | Completed ${completedCount} | LibraryPage(); !embedded &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:133](../src/components/personal/LibraryPage.tsx#L133) | Label/help | {&#96;Completed, ${completedCount}&#96;} | LibraryPage(); !embedded &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:137](../src/components/personal/LibraryPage.tsx#L137) | Rendered copy | ${completedCount} | LibraryPage(); !embedded &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:139](../src/components/personal/LibraryPage.tsx#L139) | Rendered copy | All my games ${Object.keys(state.records).length} | LibraryPage(); !embedded &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:140](../src/components/personal/LibraryPage.tsx#L140) | Label/help | {&#96;All my games, ${Object.keys(state.records).length}&#96;} | LibraryPage(); !embedded &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:140](../src/components/personal/LibraryPage.tsx#L140) | Message/fragment | All my games, ${Object.keys(state.records).length} | LibraryPage(); !embedded &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:144](../src/components/personal/LibraryPage.tsx#L144) | Rendered copy | ${Object.keys(state.records).length} | LibraryPage(); !embedded &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:152](../src/components/personal/LibraryPage.tsx#L152) | Rendered copy | ${tab === 'later' ? 'Search Play later' : 'Search your library'} | LibraryPage(); !firstRunEmpty &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:153](../src/components/personal/LibraryPage.tsx#L153) | Message/fragment | Search Play later | LibraryPage(); !firstRunEmpty &amp;&amp;; tab === 'later' is true |
| [src/components/personal/LibraryPage.tsx:153](../src/components/personal/LibraryPage.tsx#L153) | Message/fragment | Search your library | LibraryPage(); !firstRunEmpty &amp;&amp;; tab === 'later' is false |
| [src/components/personal/LibraryPage.tsx:158](../src/components/personal/LibraryPage.tsx#L158) | Label/help | {tab === 'later' ? 'Search Play later…' : 'Search your library…'} | LibraryPage(); !firstRunEmpty &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:158](../src/components/personal/LibraryPage.tsx#L158) | Message/fragment | Search Play later… | LibraryPage(); !firstRunEmpty &amp;&amp;; tab === 'later' is true |
| [src/components/personal/LibraryPage.tsx:158](../src/components/personal/LibraryPage.tsx#L158) | Message/fragment | Search your library… | LibraryPage(); !firstRunEmpty &amp;&amp;; tab === 'later' is false |
| [src/components/personal/LibraryPage.tsx:164](../src/components/personal/LibraryPage.tsx#L164) | Rendered copy | ${selecting ? 'Done selecting' : 'Select games'} | LibraryPage(); !firstRunEmpty &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:172](../src/components/personal/LibraryPage.tsx#L172) | Message/fragment | Done selecting | LibraryPage(); !firstRunEmpty &amp;&amp;; selecting is true |
| [src/components/personal/LibraryPage.tsx:172](../src/components/personal/LibraryPage.tsx#L172) | Message/fragment | Select games | LibraryPage(); !firstRunEmpty &amp;&amp;; selecting is false |
| [src/components/personal/LibraryPage.tsx:177](../src/components/personal/LibraryPage.tsx#L177) | Live region | ${records.length} ${records.length === 1 ? 'game matches' : 'games match'} this progress view. Clear progress filter | LibraryPage(); progressView !== 'all' &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:178](../src/components/personal/LibraryPage.tsx#L178) | Message/fragment | game matches | LibraryPage(); progressView !== 'all' &amp;&amp;; records.length === 1 is true |
| [src/components/personal/LibraryPage.tsx:178](../src/components/personal/LibraryPage.tsx#L178) | Message/fragment | games match | LibraryPage(); progressView !== 'all' &amp;&amp;; records.length === 1 is false |
| [src/components/personal/LibraryPage.tsx:179](../src/components/personal/LibraryPage.tsx#L179) | Rendered copy | Clear progress filter | LibraryPage(); progressView !== 'all' &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:185](../src/components/personal/LibraryPage.tsx#L185) | Rendered copy | ${canReorder ? 'Drag within this page, or use the arrows to move across pages.' : 'Clear search, progress filters and selection to reorder.'} | LibraryPage(); tab === 'later' &amp;&amp; records.length &gt; 0 &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:187](../src/components/personal/LibraryPage.tsx#L187) | Message/fragment | Drag within this page, or use the arrows to move across pages. | LibraryPage(); tab === 'later' &amp;&amp; records.length &gt; 0 &amp;&amp;; canReorder is true |
| [src/components/personal/LibraryPage.tsx:188](../src/components/personal/LibraryPage.tsx#L188) | Message/fragment | Clear search, progress filters and selection to reorder. | LibraryPage(); tab === 'later' &amp;&amp; records.length &gt; 0 &amp;&amp;; canReorder is false |
| [src/components/personal/LibraryPage.tsx:192](../src/components/personal/LibraryPage.tsx#L192) | Live region | Finish or retry your unsaved edit to update the Play later results. | LibraryPage(); tab === 'later' &amp;&amp; pendingEdits &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:213](../src/components/personal/LibraryPage.tsx#L213) | Rendered copy | ${tab === 'later' ? 'Play later results' : 'Your library results'} | LibraryPage(); when its owning surface/operation is used |
| [src/components/personal/LibraryPage.tsx:214](../src/components/personal/LibraryPage.tsx#L214) | Message/fragment | Play later results | LibraryPage(); tab === 'later' is true |
| [src/components/personal/LibraryPage.tsx:214](../src/components/personal/LibraryPage.tsx#L214) | Message/fragment | Your library results | LibraryPage(); tab === 'later' is false |
| [src/components/personal/LibraryPage.tsx:216](../src/components/personal/LibraryPage.tsx#L216) | Live region | ${records.length &gt; 1 ? 'Showing ' : ''} ${formatResultRange( records.length, page.start, page.end, tab === 'later' ? 'Play later game' : 'matching game', )} | LibraryPage(); when its owning surface/operation is used |
| [src/components/personal/LibraryPage.tsx:222](../src/components/personal/LibraryPage.tsx#L222) | Message/fragment | matching game | LibraryPage(); tab === 'later' is false |
| [src/components/personal/LibraryPage.tsx:222](../src/components/personal/LibraryPage.tsx#L222) | Message/fragment | Play later game | LibraryPage(); tab === 'later' is true |
| [src/components/personal/LibraryPage.tsx:230](../src/components/personal/LibraryPage.tsx#L230) | Label/help | {tab === 'later' ? 'Play later pages' : 'Library pages'} | LibraryPage(); when its owning surface/operation is used |
| [src/components/personal/LibraryPage.tsx:230](../src/components/personal/LibraryPage.tsx#L230) | Message/fragment | Library pages | LibraryPage(); tab === 'later' is false |
| [src/components/personal/LibraryPage.tsx:230](../src/components/personal/LibraryPage.tsx#L230) | Message/fragment | Play later pages | LibraryPage(); tab === 'later' is true |
| [src/components/personal/LibraryPage.tsx:236](../src/components/personal/LibraryPage.tsx#L236) | Live region | ${moveError} | LibraryPage(); moveError &amp;&amp; tab === 'later' &amp;&amp; |
| [src/components/personal/LibraryPage.tsx:263](../src/components/personal/LibraryPage.tsx#L263) | Label/help | Your games | LibraryPage(); visibleRecords.length is true; tab === 'later' is false |
| [src/components/personal/LibraryPage.tsx:274](../src/components/personal/LibraryPage.tsx#L274) | Rendered copy | ${filtered ? 'No matches' : tab === 'later' ? 'Play later is empty' : 'No games yet'} | LibraryPage(); visibleRecords.length is false |
| [src/components/personal/LibraryPage.tsx:274](../src/components/personal/LibraryPage.tsx#L274) | Message/fragment | No games yet | LibraryPage(); visibleRecords.length is false; filtered is false; tab === 'later' is false |
| [src/components/personal/LibraryPage.tsx:274](../src/components/personal/LibraryPage.tsx#L274) | Message/fragment | No matches | LibraryPage(); visibleRecords.length is false; filtered is true |
| [src/components/personal/LibraryPage.tsx:274](../src/components/personal/LibraryPage.tsx#L274) | Message/fragment | Play later is empty | LibraryPage(); visibleRecords.length is false; filtered is false; tab === 'later' is true |
| [src/components/personal/LibraryPage.tsx:275](../src/components/personal/LibraryPage.tsx#L275) | Rendered copy | ${filtered ? 'Try another progress filter or clear your search. Your saved games are unchanged.' : tab === 'later' ? 'Choose Play later on a game to add it here.' : 'Add games from The 100 or Discover, or choose Add a game manually below.'} | LibraryPage(); visibleRecords.length is false |
| [src/components/personal/LibraryPage.tsx:277](../src/components/personal/LibraryPage.tsx#L277) | Message/fragment | Try another progress filter or clear your search. Your saved games are unchanged. | LibraryPage(); visibleRecords.length is false; filtered is true |
| [src/components/personal/LibraryPage.tsx:279](../src/components/personal/LibraryPage.tsx#L279) | Message/fragment | Choose Play later on a game to add it here. | LibraryPage(); visibleRecords.length is false; filtered is false; tab === 'later' is true |
| [src/components/personal/LibraryPage.tsx:280](../src/components/personal/LibraryPage.tsx#L280) | Message/fragment | Add games from The 100 or Discover, or choose Add a game manually below. | LibraryPage(); visibleRecords.length is false; filtered is false; tab === 'later' is false |
| [src/components/personal/LibraryPage.tsx:283](../src/components/personal/LibraryPage.tsx#L283) | Rendered copy | ${filtered ? 'Clear search and progress filter' : 'Choose from The 100'} | LibraryPage(); visibleRecords.length is false |
| [src/components/personal/LibraryPage.tsx:284](../src/components/personal/LibraryPage.tsx#L284) | Message/fragment | Choose from The 100 | LibraryPage(); visibleRecords.length is false; filtered is false |
| [src/components/personal/LibraryPage.tsx:284](../src/components/personal/LibraryPage.tsx#L284) | Message/fragment | Clear search and progress filter | LibraryPage(); visibleRecords.length is false; filtered is true |
| [src/components/personal/LibraryPage.tsx:286](../src/components/personal/LibraryPage.tsx#L286) | Rendered copy | Discover more games | LibraryPage(); visibleRecords.length is false |
| [src/components/personal/LibraryPage.tsx:297](../src/components/personal/LibraryPage.tsx#L297) | Label/help | {tab === 'later' ? 'Play later pages, end of list' : 'Library pages, end of list'} | LibraryPage(); when its owning surface/operation is used |
| [src/components/personal/LibraryPage.tsx:297](../src/components/personal/LibraryPage.tsx#L297) | Message/fragment | Library pages, end of list | LibraryPage(); tab === 'later' is false |
| [src/components/personal/LibraryPage.tsx:297](../src/components/personal/LibraryPage.tsx#L297) | Message/fragment | Play later pages, end of list | LibraryPage(); tab === 'later' is true |
| [src/components/personal/LibraryPage.tsx:303](../src/components/personal/LibraryPage.tsx#L303) | Label/help | {tab === 'later' ? 'Add to Play later' : 'Add to My games'} | LibraryPage(); when its owning surface/operation is used |
| [src/components/personal/LibraryPage.tsx:303](../src/components/personal/LibraryPage.tsx#L303) | Message/fragment | Add to My games | LibraryPage(); tab === 'later' is false |
| [src/components/personal/LibraryPage.tsx:303](../src/components/personal/LibraryPage.tsx#L303) | Message/fragment | Add to Play later | LibraryPage(); tab === 'later' is true |
## src/components/personal/LibraryRecordRow.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/personal/LibraryRecordRow.tsx:86](../src/components/personal/LibraryRecordRow.tsx#L86) | Label/help | {&#96;Select ${record.title}&#96;} | LibraryRecordRow(); selecting &amp;&amp; |
| [src/components/personal/LibraryRecordRow.tsx:86](../src/components/personal/LibraryRecordRow.tsx#L86) | Message/fragment | Select ${record.title} | LibraryRecordRow(); selecting &amp;&amp; |
| [src/components/personal/LibraryRecordRow.tsx:104](../src/components/personal/LibraryRecordRow.tsx#L104) | Label/help | {record.title} | LibraryRecordRow(); when its owning surface/operation is used |
| [src/components/personal/LibraryRecordRow.tsx:114](../src/components/personal/LibraryRecordRow.tsx#L114) | Label/help | {record.title} | LibraryRecordRow(); when its owning surface/operation is used |
| [src/components/personal/LibraryRecordRow.tsx:126](../src/components/personal/LibraryRecordRow.tsx#L126) | Label/help | {&#96;Play later: ${record.title}&#96;} | LibraryRecordRow(); tab !== 'later' &amp;&amp; |
| [src/components/personal/LibraryRecordRow.tsx:126](../src/components/personal/LibraryRecordRow.tsx#L126) | Message/fragment | Play later: ${record.title} | LibraryRecordRow(); tab !== 'later' &amp;&amp; |
| [src/components/personal/LibraryRecordRow.tsx:127](../src/components/personal/LibraryRecordRow.tsx#L127) | Label/help | Play later | LibraryRecordRow(); tab !== 'later' &amp;&amp; |
| [src/components/personal/LibraryRecordRow.tsx:140](../src/components/personal/LibraryRecordRow.tsx#L140) | Rendered copy | ${rankingPosition ? ( &lt;a ref={rankedLink} className="text-button" href={&#96;/my-games?tab=ranking#${new URLSearchParams({ rank: record.id })}&#96;} aria-label={&#96;Ranked #${rankingPosition}: ${record.title}. Open in Ranking&#96;} aria-disabled={busy &#124;&#124; undefined} onClick={(event) =&gt; { if (busy) { event.preventDefault(); return; } if (event.button !== 0 &#124;&#124; event.ctrlKey &#124;&#124; event.metaKey &#124;&#124; event.altKey &#124;&#124; event.shiftKey) return; event.preventDefault(); const destination = event.currentTarget.href; void onPresentationChange(() =&gt; location.assign(destination)); }} &gt; Ranked #{rankingPosition} &lt;/a&gt; ) : ( &lt;button className="text-button" aria-disabled={busy &#124;&#124; undefined} aria-label={&#96;Add ${record.title} to my ranking&#96;} onClick={(event) =&gt; void addToRanking(event.currentTarget)} &gt; &lt;Icon name="rank" width="20" height="20" /&gt; Rank &lt;/button&gt; )} | LibraryRecordRow(); when its owning surface/operation is used |
| [src/components/personal/LibraryRecordRow.tsx:142](../src/components/personal/LibraryRecordRow.tsx#L142) | Rendered copy | Ranked #${rankingPosition} | LibraryRecordRow(); rankingPosition is true |
| [src/components/personal/LibraryRecordRow.tsx:146](../src/components/personal/LibraryRecordRow.tsx#L146) | Label/help | {&#96;Ranked #${rankingPosition}: ${record.title}. Open in Ranking&#96;} | LibraryRecordRow(); rankingPosition is true |
| [src/components/personal/LibraryRecordRow.tsx:146](../src/components/personal/LibraryRecordRow.tsx#L146) | Message/fragment | Ranked #${rankingPosition}: ${record.title}. Open in Ranking | LibraryRecordRow(); rankingPosition is true |
| [src/components/personal/LibraryRecordRow.tsx:162](../src/components/personal/LibraryRecordRow.tsx#L162) | Rendered copy | Rank | LibraryRecordRow(); rankingPosition is false |
| [src/components/personal/LibraryRecordRow.tsx:165](../src/components/personal/LibraryRecordRow.tsx#L165) | Label/help | {&#96;Add ${record.title} to my ranking&#96;} | LibraryRecordRow(); rankingPosition is false |
| [src/components/personal/LibraryRecordRow.tsx:165](../src/components/personal/LibraryRecordRow.tsx#L165) | Message/fragment | Add ${record.title} to my ranking | LibraryRecordRow(); rankingPosition is false |
| [src/components/personal/LibraryRecordRow.tsx:175](../src/components/personal/LibraryRecordRow.tsx#L175) | Label/help | { tab === 'later' ? &#96;Remove from Play later: ${record.title}&#96; : &#96;Remove ${record.title} from my library&#96; } | LibraryRecordRow(); when its owning surface/operation is used |
| [src/components/personal/LibraryRecordRow.tsx:176](../src/components/personal/LibraryRecordRow.tsx#L176) | Message/fragment | Remove ${record.title} from my library | LibraryRecordRow(); tab === 'later' is false |
| [src/components/personal/LibraryRecordRow.tsx:176](../src/components/personal/LibraryRecordRow.tsx#L176) | Message/fragment | Remove from Play later: ${record.title} | LibraryRecordRow(); tab === 'later' is true |
| [src/components/personal/LibraryRecordRow.tsx:178](../src/components/personal/LibraryRecordRow.tsx#L178) | Label/help | {tab === 'later' ? 'Remove from Play later' : undefined} | LibraryRecordRow(); when its owning surface/operation is used |
| [src/components/personal/LibraryRecordRow.tsx:178](../src/components/personal/LibraryRecordRow.tsx#L178) | Message/fragment | Remove from Play later | LibraryRecordRow(); tab === 'later' is true |
| [src/components/personal/LibraryRecordRow.tsx:190](../src/components/personal/LibraryRecordRow.tsx#L190) | Rendered copy | ${state.progress[record.id]?.completed ? 'Completed' : state.progress[record.id]?.played ? 'Played, not completed' : 'Not played'} | LibraryRecordRow(); when its owning surface/operation is used |
| [src/components/personal/LibraryRecordRow.tsx:192](../src/components/personal/LibraryRecordRow.tsx#L192) | Message/fragment | Completed | LibraryRecordRow(); state.progress[record.id]?.completed is true |
| [src/components/personal/LibraryRecordRow.tsx:195](../src/components/personal/LibraryRecordRow.tsx#L195) | Message/fragment | Not played | LibraryRecordRow(); state.progress[record.id]?.completed is false; state.progress[record.id]?.played is false |
## src/components/personal/ManualGameForm.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/personal/ManualGameForm.tsx:16](../src/components/personal/ManualGameForm.tsx#L16) | Message/fragment | Add game | ManualGameForm(); when its owning surface/operation is used |
| [src/components/personal/ManualGameForm.tsx:69](../src/components/personal/ManualGameForm.tsx#L69) | Message output | 'Enter a game title.' | submit(); !trimmed is true |
| [src/components/personal/ManualGameForm.tsx:69](../src/components/personal/ManualGameForm.tsx#L69) | Message/fragment | Enter a game title. | submit(); !trimmed is true |
| [src/components/personal/ManualGameForm.tsx:74](../src/components/personal/ManualGameForm.tsx#L74) | Message output | 'Use a four-digit year between 1900 and 2100, or leave it blank.' | submit(); enteredYear !== null &amp;&amp; (!Number.isInteger(enteredYear) &#124;&#124; enteredYear &lt; 1900 &#124;&#124; enteredYear &gt; 2100) is true |
| [src/components/personal/ManualGameForm.tsx:74](../src/components/personal/ManualGameForm.tsx#L74) | Message/fragment | Use a four-digit year between 1900 and 2100, or leave it blank. | submit(); enteredYear !== null &amp;&amp; (!Number.isInteger(enteredYear) &#124;&#124; enteredYear &lt; 1900 &#124;&#124; enteredYear &gt; 2100) is true |
| [src/components/personal/ManualGameForm.tsx:103](../src/components/personal/ManualGameForm.tsx#L103) | Message output | 'The game could not be added. Your entry is unchanged; try again.' | submit(); operation rejected or threw; mounted.current is true |
| [src/components/personal/ManualGameForm.tsx:103](../src/components/personal/ManualGameForm.tsx#L103) | Message/fragment | The game could not be added. Your entry is unchanged; try again. | submit(); operation rejected or threw; mounted.current is true |
| [src/components/personal/ManualGameForm.tsx:114](../src/components/personal/ManualGameForm.tsx#L114) | Message output | 'The game could not be added. Your entry is unchanged; try again.' | submit(); mounted.current &amp;&amp; !added is true |
| [src/components/personal/ManualGameForm.tsx:114](../src/components/personal/ManualGameForm.tsx#L114) | Message/fragment | The game could not be added. Your entry is unchanged; try again. | submit(); mounted.current &amp;&amp; !added is true |
| [src/components/personal/ManualGameForm.tsx:140](../src/components/personal/ManualGameForm.tsx#L140) | Rendered copy | Add a game manually | ManualGameForm(); when its owning surface/operation is used |
| [src/components/personal/ManualGameForm.tsx:149](../src/components/personal/ManualGameForm.tsx#L149) | Rendered copy | Adding a game does not mark it played or completed. | ManualGameForm(); expanded "Add a game manually" disclosure |
| [src/components/personal/ManualGameForm.tsx:151](../src/components/personal/ManualGameForm.tsx#L151) | Rendered copy | Game title | ManualGameForm(); expanded "Add a game manually" disclosure |
| [src/components/personal/ManualGameForm.tsx:165](../src/components/personal/ManualGameForm.tsx#L165) | Rendered copy | Year (optional) | ManualGameForm(); expanded "Add a game manually" disclosure |
| [src/components/personal/ManualGameForm.tsx:166](../src/components/personal/ManualGameForm.tsx#L166) | Rendered copy | (optional) | ManualGameForm(); expanded "Add a game manually" disclosure |
| [src/components/personal/ManualGameForm.tsx:181](../src/components/personal/ManualGameForm.tsx#L181) | Live region | ${error} | ManualGameForm(); expanded "Add a game manually" disclosure; error &amp;&amp; |
| [src/components/personal/ManualGameForm.tsx:185](../src/components/personal/ManualGameForm.tsx#L185) | Rendered copy | ${actionLabel} | ManualGameForm(); expanded "Add a game manually" disclosure |
## src/components/personal/MyGamesPage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/personal/MyGamesPage.tsx:136](../src/components/personal/MyGamesPage.tsx#L136) | Message output | 'Your edit has not saved. Fix the highlighted field or retry before changing views.' | change(); !saved is true |
| [src/components/personal/MyGamesPage.tsx:136](../src/components/personal/MyGamesPage.tsx#L136) | Message/fragment | Your edit has not saved. Fix the highlighted field or retry before changing views. | change(); !saved is true |
| [src/components/personal/MyGamesPage.tsx:143](../src/components/personal/MyGamesPage.tsx#L143) | Message output | 'Your edit could not be saved. Keep this view open and retry.' | change(); operation rejected or threw; ownsRequest() is true |
| [src/components/personal/MyGamesPage.tsx:143](../src/components/personal/MyGamesPage.tsx#L143) | Message/fragment | Your edit could not be saved. Keep this view open and retry. | change(); operation rejected or threw; ownsRequest() is true |
| [src/components/personal/MyGamesPage.tsx:157](../src/components/personal/MyGamesPage.tsx#L157) | Message/fragment | Library | titles(); when its owning surface/operation is used |
| [src/components/personal/MyGamesPage.tsx:157](../src/components/personal/MyGamesPage.tsx#L157) | Message/fragment | Play later | titles(); when its owning surface/operation is used |
| [src/components/personal/MyGamesPage.tsx:157](../src/components/personal/MyGamesPage.tsx#L157) | Message/fragment | Ranking | titles(); when its owning surface/operation is used |
| [src/components/personal/MyGamesPage.tsx:178](../src/components/personal/MyGamesPage.tsx#L178) | Rendered copy | My games | MyGamesWorkspace(); when its owning surface/operation is used |
| [src/components/personal/MyGamesPage.tsx:181](../src/components/personal/MyGamesPage.tsx#L181) | Rendered copy | Find games | MyGamesWorkspace(); when its owning surface/operation is used |
| [src/components/personal/MyGamesPage.tsx:188](../src/components/personal/MyGamesPage.tsx#L188) | Label/help | My games views | MyGamesWorkspace(); when its owning surface/operation is used |
| [src/components/personal/MyGamesPage.tsx:190](../src/components/personal/MyGamesPage.tsx#L190) | Rendered copy | ${titles[value]} ${counts[value]} | MyGamesWorkspace(); when its owning surface/operation is used |
| [src/components/personal/MyGamesPage.tsx:192](../src/components/personal/MyGamesPage.tsx#L192) | Label/help | {&#96;${titles[value]}, ${counts[value]}&#96;} | MyGamesWorkspace(); when its owning surface/operation is used |
| [src/components/personal/MyGamesPage.tsx:202](../src/components/personal/MyGamesPage.tsx#L202) | Rendered copy | ${counts[value]} | MyGamesWorkspace(); when its owning surface/operation is used |
| [src/components/personal/MyGamesPage.tsx:219](../src/components/personal/MyGamesPage.tsx#L219) | Live region | ${error} | MyGamesWorkspace(); error &amp;&amp; |
| [src/components/personal/MyGamesPage.tsx:254](../src/components/personal/MyGamesPage.tsx#L254) | Live region | ${switching ? 'Saving your edit before changing view…' : ''} | MyGamesWorkspace(); when its owning surface/operation is used |
| [src/components/personal/MyGamesPage.tsx:255](../src/components/personal/MyGamesPage.tsx#L255) | Message/fragment | Saving your edit before changing view… | MyGamesWorkspace(); switching is true |
## src/components/personal/PersonalRatingInput.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/personal/PersonalRatingInput.tsx:36](../src/components/personal/PersonalRatingInput.tsx#L36) | Message output | 'Enter a rating from 0 to 10, or clear the field to remove your rating. Your saved rating is unchanged.' | save(); badInput.current is true |
| [src/components/personal/PersonalRatingInput.tsx:37](../src/components/personal/PersonalRatingInput.tsx#L37) | Message/fragment | Enter a rating from 0 to 10, or clear the field to remove your rating. Your saved rating is unchanged. | save(); badInput.current is true |
| [src/components/personal/PersonalRatingInput.tsx:43](../src/components/personal/PersonalRatingInput.tsx#L43) | Message output | 'Use a rating from 0 to 10, or leave it blank.' | save(); next !== null &amp;&amp; (!Number.isFinite(next) &#124;&#124; next &lt; 0 &#124;&#124; next &gt; 10) is true |
| [src/components/personal/PersonalRatingInput.tsx:43](../src/components/personal/PersonalRatingInput.tsx#L43) | Message/fragment | Use a rating from 0 to 10, or leave it blank. | save(); next !== null &amp;&amp; (!Number.isFinite(next) &#124;&#124; next &lt; 0 &#124;&#124; next &gt; 10) is true |
| [src/components/personal/PersonalRatingInput.tsx:61](../src/components/personal/PersonalRatingInput.tsx#L61) | Message output | 'The rating could not be saved. Your previous rating is unchanged. Press Enter in this field to retry.' | task(); when its owning surface/operation is used |
| [src/components/personal/PersonalRatingInput.tsx:61](../src/components/personal/PersonalRatingInput.tsx#L61) | Message/fragment | The rating could not be saved. Your previous rating is unchanged. Press Enter in this field to retry. | task(); when its owning surface/operation is used |
| [src/components/personal/PersonalRatingInput.tsx:107](../src/components/personal/PersonalRatingInput.tsx#L107) | Rendered copy | Your rating / 10 | PersonalRatingInput(); when its owning surface/operation is used |
| [src/components/personal/PersonalRatingInput.tsx:120](../src/components/personal/PersonalRatingInput.tsx#L120) | Label/help | {&#96;Your rating / 10 for ${title}&#96;} | PersonalRatingInput(); when its owning surface/operation is used |
| [src/components/personal/PersonalRatingInput.tsx:120](../src/components/personal/PersonalRatingInput.tsx#L120) | Message/fragment | Your rating / 10 for ${title} | PersonalRatingInput(); when its owning surface/operation is used |
| [src/components/personal/PersonalRatingInput.tsx:137](../src/components/personal/PersonalRatingInput.tsx#L137) | Message/fragment | Enter | PersonalRatingInput(); onKeyDown |
| [src/components/personal/PersonalRatingInput.tsx:144](../src/components/personal/PersonalRatingInput.tsx#L144) | Live region | ${error} | PersonalRatingInput(); error &amp;&amp; |
## src/components/personal/RankingRow.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/personal/RankingRow.tsx:88](../src/components/personal/RankingRow.tsx#L88) | Message/fragment | The note could not be saved. Keep this field open to retry or copy your text. | task(); when its owning surface/operation is used |
| [src/components/personal/RankingRow.tsx:120](../src/components/personal/RankingRow.tsx#L120) | Label/help | {record.title} | RankingRow(); when its owning surface/operation is used |
| [src/components/personal/RankingRow.tsx:128](../src/components/personal/RankingRow.tsx#L128) | Label/help | {record.title} | RankingRow(); when its owning surface/operation is used |
| [src/components/personal/RankingRow.tsx:137](../src/components/personal/RankingRow.tsx#L137) | Label/help | {record.title} | RankingRow(); when its owning surface/operation is used |
| [src/components/personal/RankingRow.tsx:145](../src/components/personal/RankingRow.tsx#L145) | Label/help | {&#96;Remove ${record.title} from my ranking&#96;} | RankingRow(); when its owning surface/operation is used |
| [src/components/personal/RankingRow.tsx:145](../src/components/personal/RankingRow.tsx#L145) | Message/fragment | Remove ${record.title} from my ranking | RankingRow(); when its owning surface/operation is used |
| [src/components/personal/RankingRow.tsx:150](../src/components/personal/RankingRow.tsx#L150) | Rendered copy | ${entry.manualPosition !== null ? &#96;Fixed at #${entry.manualPosition}&#96; : 'Follows your rating'} | RankingRow(); (entry.manualPosition !== null &#124;&#124; releasedPosition) &amp;&amp; |
| [src/components/personal/RankingRow.tsx:150](../src/components/personal/RankingRow.tsx#L150) | Message/fragment | Fixed at #${entry.manualPosition} | RankingRow(); (entry.manualPosition !== null &#124;&#124; releasedPosition) &amp;&amp;; entry.manualPosition !== null is true |
| [src/components/personal/RankingRow.tsx:150](../src/components/personal/RankingRow.tsx#L150) | Message/fragment | Follows your rating | RankingRow(); (entry.manualPosition !== null &#124;&#124; releasedPosition) &amp;&amp;; entry.manualPosition !== null is false |
| [src/components/personal/RankingRow.tsx:151](../src/components/personal/RankingRow.tsx#L151) | Rendered copy | Use rating order | RankingRow(); (entry.manualPosition !== null &#124;&#124; releasedPosition) &amp;&amp; |
| [src/components/personal/RankingRow.tsx:154](../src/components/personal/RankingRow.tsx#L154) | Label/help | {&#96;Use rating order for ${record.title}&#96;} | RankingRow(); (entry.manualPosition !== null &#124;&#124; releasedPosition) &amp;&amp; |
| [src/components/personal/RankingRow.tsx:154](../src/components/personal/RankingRow.tsx#L154) | Message/fragment | Use rating order for ${record.title} | RankingRow(); (entry.manualPosition !== null &#124;&#124; releasedPosition) &amp;&amp; |
| [src/components/personal/RankingRow.tsx:168](../src/components/personal/RankingRow.tsx#L168) | Label/help | {record.title} | RankingRow(); when its owning surface/operation is used |
| [src/components/personal/RankingRow.tsx:175](../src/components/personal/RankingRow.tsx#L175) | Rendered copy | ${entry.note ? 'Your note' : 'Add a note'} | RankingRow(); when its owning surface/operation is used |
| [src/components/personal/RankingRow.tsx:176](../src/components/personal/RankingRow.tsx#L176) | Message/fragment | Add a note | RankingRow(); entry.note is false |
| [src/components/personal/RankingRow.tsx:176](../src/components/personal/RankingRow.tsx#L176) | Message/fragment | Your note | RankingRow(); entry.note is true |
| [src/components/personal/RankingRow.tsx:179](../src/components/personal/RankingRow.tsx#L179) | Rendered copy | Your note for ${record.title} | RankingRow(); expanded "${entry.note ? 'Your note' : 'Add a note'}" disclosure |
| [src/components/personal/RankingRow.tsx:202](../src/components/personal/RankingRow.tsx#L202) | Label/help | Why this game belongs here… | RankingRow(); expanded "${entry.note ? 'Your note' : 'Add a note'}" disclosure |
| [src/components/personal/RankingRow.tsx:204](../src/components/personal/RankingRow.tsx#L204) | Rendered copy | Saves on exit. Not included in published rankings. | RankingRow(); expanded "${entry.note ? 'Your note' : 'Add a note'}" disclosure |
| [src/components/personal/RankingRow.tsx:207](../src/components/personal/RankingRow.tsx#L207) | Live region | ${noteError} | RankingRow(); noteError &amp;&amp; |
| [src/components/personal/RankingRow.tsx:238](../src/components/personal/RankingRow.tsx#L238) | Message output | 'Apply this position or clear it before leaving the editor.' | RankingPosition(); when its owning surface/operation is used |
| [src/components/personal/RankingRow.tsx:238](../src/components/personal/RankingRow.tsx#L238) | Message/fragment | Apply this position or clear it before leaving the editor. | RankingPosition(); when its owning surface/operation is used |
| [src/components/personal/RankingRow.tsx:255](../src/components/personal/RankingRow.tsx#L255) | Rendered copy | Move to position | RankingPosition(); when its owning surface/operation is used |
| [src/components/personal/RankingRow.tsx:262](../src/components/personal/RankingRow.tsx#L262) | Message output | &#96;Choose a position from 1 to ${total}.&#96; | RankingPosition(); expanded "Move to position" disclosure; onSubmit; !Number.isInteger(next) &#124;&#124; next &lt; 1 &#124;&#124; next &gt; total is true |
| [src/components/personal/RankingRow.tsx:262](../src/components/personal/RankingRow.tsx#L262) | Message/fragment | Choose a position from 1 to ${total}. | RankingPosition(); expanded "Move to position" disclosure; onSubmit; !Number.isInteger(next) &#124;&#124; next &lt; 1 &#124;&#124; next &gt; total is true |
| [src/components/personal/RankingRow.tsx:273](../src/components/personal/RankingRow.tsx#L273) | Rendered copy | Position | RankingPosition(); expanded "Move to position" disclosure |
| [src/components/personal/RankingRow.tsx:281](../src/components/personal/RankingRow.tsx#L281) | Label/help | {&#96;Position for ${title}&#96;} | RankingPosition(); expanded "Move to position" disclosure |
| [src/components/personal/RankingRow.tsx:281](../src/components/personal/RankingRow.tsx#L281) | Message/fragment | Position for ${title} | RankingPosition(); expanded "Move to position" disclosure |
| [src/components/personal/RankingRow.tsx:283](../src/components/personal/RankingRow.tsx#L283) | Label/help | {String(position)} | RankingPosition(); expanded "Move to position" disclosure |
| [src/components/personal/RankingRow.tsx:295](../src/components/personal/RankingRow.tsx#L295) | Rendered copy | Move | RankingPosition(); expanded "Move to position" disclosure |
| [src/components/personal/RankingRow.tsx:299](../src/components/personal/RankingRow.tsx#L299) | Live region | ${error} | RankingPosition(); expanded "Move to position" disclosure; error &amp;&amp; |
## src/components/personal/RankingsPage.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/personal/RankingsPage.tsx:96](../src/components/personal/RankingsPage.tsx#L96) | Rendered copy | Ranking | RankingsPage(); embedded is true |
| [src/components/personal/RankingsPage.tsx:100](../src/components/personal/RankingsPage.tsx#L100) | Rendered copy | My rankings | RankingsPage(); embedded is false |
| [src/components/personal/RankingsPage.tsx:110](../src/components/personal/RankingsPage.tsx#L110) | Message/fragment | Private · saved on this device | RankingsPage(); persistent is true; mode.scope === 'guest' is true |
| [src/components/personal/RankingsPage.tsx:112](../src/components/personal/RankingsPage.tsx#L112) | Message/fragment | Private · temporary tab data | RankingsPage(); persistent is false |
| [src/components/personal/RankingsPage.tsx:115](../src/components/personal/RankingsPage.tsx#L115) | Rendered copy | Publish a ranking | RankingsPage(); onPublish &amp;&amp; |
| [src/components/personal/RankingsPage.tsx:136](../src/components/personal/RankingsPage.tsx#L136) | Rendered copy | ${manualCount ? &#96;${manualCount} fixed ${manualCount === 1 ? 'position' : 'positions'}.&#96; : 'Highest ratings first.'} ${manualCount ? 'Other games follow ratings.' : 'Unrated last, not zero.'} ${!canReorder &amp;&amp; 'Clear search and filters to reorder.'} | RankingsPage(); state.ranking.length &gt; 0 &amp;&amp; |
| [src/components/personal/RankingsPage.tsx:137](../src/components/personal/RankingsPage.tsx#L137) | Rendered copy | ${manualCount ? &#96;${manualCount} fixed ${manualCount === 1 ? 'position' : 'positions'}.&#96; : 'Highest ratings first.'} | RankingsPage(); state.ranking.length &gt; 0 &amp;&amp; |
| [src/components/personal/RankingsPage.tsx:139](../src/components/personal/RankingsPage.tsx#L139) | Message/fragment | ${manualCount} fixed ${manualCount === 1 ? 'position' : 'positions'}. | RankingsPage(); state.ranking.length &gt; 0 &amp;&amp;; manualCount is true |
| [src/components/personal/RankingsPage.tsx:140](../src/components/personal/RankingsPage.tsx#L140) | Message/fragment | Highest ratings first. | RankingsPage(); state.ranking.length &gt; 0 &amp;&amp;; manualCount is false |
| [src/components/personal/RankingsPage.tsx:142](../src/components/personal/RankingsPage.tsx#L142) | Message/fragment | Other games follow ratings. | RankingsPage(); state.ranking.length &gt; 0 &amp;&amp;; manualCount is true |
| [src/components/personal/RankingsPage.tsx:142](../src/components/personal/RankingsPage.tsx#L142) | Message/fragment | Unrated last, not zero. | RankingsPage(); state.ranking.length &gt; 0 &amp;&amp;; manualCount is false |
| [src/components/personal/RankingsPage.tsx:143](../src/components/personal/RankingsPage.tsx#L143) | Message/fragment | Clear search and filters to reorder. | RankingsPage(); state.ranking.length &gt; 0 &amp;&amp;; !canReorder &amp;&amp; |
| [src/components/personal/RankingsPage.tsx:146](../src/components/personal/RankingsPage.tsx#L146) | Rendered copy | How ranking order works | RankingsPage(); state.ranking.length &gt; 0 &amp;&amp; |
| [src/components/personal/RankingsPage.tsx:147](../src/components/personal/RankingsPage.tsx#L147) | Rendered copy | Games without a fixed position follow scores, highest first. Unrated comes last, not zero. Drag or use arrows to set a position when search and filters are clear. Manual positions stay fixed until you choose Use rating order for a game or for all. Scores save automatically. Ranking or rating never marks a game played. Drag within this page, or use the arrows to move across pages. | RankingsPage(); state.ranking.length &gt; 0 &amp;&amp;; expanded "How ranking order works" disclosure |
| [src/components/personal/RankingsPage.tsx:156](../src/components/personal/RankingsPage.tsx#L156) | Rendered copy | Use rating order for all | RankingsPage(); state.ranking.length &gt; 0 &amp;&amp;; manualCount &gt; 0 &amp;&amp; |
| [src/components/personal/RankingsPage.tsx:164](../src/components/personal/RankingsPage.tsx#L164) | Rendered copy | Search your ranking | RankingsPage(); state.ranking.length &gt; 0 &amp;&amp; |
| [src/components/personal/RankingsPage.tsx:172](../src/components/personal/RankingsPage.tsx#L172) | Label/help | Search your ranking… | RankingsPage(); state.ranking.length &gt; 0 &amp;&amp; |
| [src/components/personal/RankingsPage.tsx:175](../src/components/personal/RankingsPage.tsx#L175) | Live region | ${searchHeld ? ( 'Search waits for your unsaved edit. Fix the highlighted field or retry.' ) : ( &lt;&gt; {records.length} ranked {records.length === 1 ? 'game' : 'games'} in this view &lt;/&gt; )} | RankingsPage(); state.ranking.length &gt; 0 &amp;&amp; |
| [src/components/personal/RankingsPage.tsx:178](../src/components/personal/RankingsPage.tsx#L178) | Message/fragment | Search waits for your unsaved edit. Fix the highlighted field or retry. | RankingsPage(); state.ranking.length &gt; 0 &amp;&amp;; searchHeld is true |
| [src/components/personal/RankingsPage.tsx:189](../src/components/personal/RankingsPage.tsx#L189) | Live region | ${error} | RankingsPage(); error &amp;&amp; |
| [src/components/personal/RankingsPage.tsx:194](../src/components/personal/RankingsPage.tsx#L194) | Rendered copy | Your ranking results | RankingsPage(); when its owning surface/operation is used |
| [src/components/personal/RankingsPage.tsx:197](../src/components/personal/RankingsPage.tsx#L197) | Live region | ${records.length &gt; 1 ? 'Showing ' : ''} ${formatResultRange(records.length, page.start, page.end, 'ranked game')} | RankingsPage(); when its owning surface/operation is used |
| [src/components/personal/RankingsPage.tsx:199](../src/components/personal/RankingsPage.tsx#L199) | Message/fragment | ranked game | RankingsPage(); when its owning surface/operation is used |
| [src/components/personal/RankingsPage.tsx:202](../src/components/personal/RankingsPage.tsx#L202) | Label/help | Ranking pages | RankingsPage(); when its owning surface/operation is used |
| [src/components/personal/RankingsPage.tsx:264](../src/components/personal/RankingsPage.tsx#L264) | Rendered copy | ${state.ranking.length ? 'No matches' : 'No ranked games yet'} | RankingsPage(); visibleRecords.length is false |
| [src/components/personal/RankingsPage.tsx:264](../src/components/personal/RankingsPage.tsx#L264) | Message/fragment | No matches | RankingsPage(); visibleRecords.length is false; state.ranking.length is true |
| [src/components/personal/RankingsPage.tsx:264](../src/components/personal/RankingsPage.tsx#L264) | Message/fragment | No ranked games yet | RankingsPage(); visibleRecords.length is false; state.ranking.length is false |
| [src/components/personal/RankingsPage.tsx:265](../src/components/personal/RankingsPage.tsx#L265) | Rendered copy | ${state.ranking.length ? 'Clear search or change the progress filter.' : 'Open Add games to start. You can rank games you have not played.'} | RankingsPage(); visibleRecords.length is false |
| [src/components/personal/RankingsPage.tsx:267](../src/components/personal/RankingsPage.tsx#L267) | Message/fragment | Clear search or change the progress filter. | RankingsPage(); visibleRecords.length is false; state.ranking.length is true |
| [src/components/personal/RankingsPage.tsx:268](../src/components/personal/RankingsPage.tsx#L268) | Message/fragment | Open Add games to start. You can rank games you have not played. | RankingsPage(); visibleRecords.length is false; state.ranking.length is false |
| [src/components/personal/RankingsPage.tsx:271](../src/components/personal/RankingsPage.tsx#L271) | Rendered copy | Show my full ranking | RankingsPage(); visibleRecords.length is false; state.ranking.length &gt; 0 &amp;&amp; |
| [src/components/personal/RankingsPage.tsx:285](../src/components/personal/RankingsPage.tsx#L285) | Live region | Device storage is unavailable. Export these temporary changes from Settings before closing this tab. | RankingsPage(); !persistent &amp;&amp; |
| [src/components/personal/RankingsPage.tsx:286](../src/components/personal/RankingsPage.tsx#L286) | Rendered copy | Device storage is unavailable. | RankingsPage(); !persistent &amp;&amp; |
## src/components/personal/RecordIdentity.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/personal/RecordIdentity.tsx:23](../src/components/personal/RecordIdentity.tsx#L23) | Rendered copy | ${record.title} | RecordIdentity(); when its owning surface/operation is used |
| [src/components/personal/RecordIdentity.tsx:33](../src/components/personal/RecordIdentity.tsx#L33) | Rendered copy | ${record.year ?? 'Year not provided'} · ${SOURCE_LABELS[record.source]} ${record.collectionRank !== null &amp;&amp; &#96; #${record.collectionRank}&#96;} | RecordIdentity(); when its owning surface/operation is used |
| [src/components/personal/RecordIdentity.tsx:34](../src/components/personal/RecordIdentity.tsx#L34) | Message/fragment | Year not provided | RecordIdentity(); record.year ?? |
## src/components/personal/RemoveGamesDialog.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/personal/RemoveGamesDialog.tsx:26](../src/components/personal/RemoveGamesDialog.tsx#L26) | Message/fragment | Remove ${remaining.length} games? | title(); remaining.length === 1 is false |
| [src/components/personal/RemoveGamesDialog.tsx:26](../src/components/personal/RemoveGamesDialog.tsx#L26) | Message/fragment | Remove this game? | title(); remaining.length === 1 is true |
| [src/components/personal/RemoveGamesDialog.tsx:49](../src/components/personal/RemoveGamesDialog.tsx#L49) | Rendered copy | ${remaining.length ? title : 'Already removed.'} | RemoveGamesDialog(); when its owning surface/operation is used |
| [src/components/personal/RemoveGamesDialog.tsx:49](../src/components/personal/RemoveGamesDialog.tsx#L49) | Message/fragment | Already removed. | RemoveGamesDialog(); remaining.length is false |
| [src/components/personal/RemoveGamesDialog.tsx:50](../src/components/personal/RemoveGamesDialog.tsx#L50) | Rendered copy | ${remaining.length === 1 ? 'This deletes its saved entry, Play later position, Played and Completed marks, personal rating and note from this browser. The original 100 and its ratings never change.' : remaining.length ? 'This deletes their saved entries, Play later positions, Played and Completed marks, personal ratings and notes from this browser. The original 100 and its ratings never change.' : 'These games are no longer in your private library. No other games will be removed.'} | RemoveGamesDialog(); when its owning surface/operation is used |
| [src/components/personal/RemoveGamesDialog.tsx:52](../src/components/personal/RemoveGamesDialog.tsx#L52) | Message/fragment | This deletes its saved entry, Play later position, Played and Completed marks, personal rating and note from this browser. The original 100 and its ratings never change. | RemoveGamesDialog(); remaining.length === 1 is true |
| [src/components/personal/RemoveGamesDialog.tsx:54](../src/components/personal/RemoveGamesDialog.tsx#L54) | Message/fragment | This deletes their saved entries, Play later positions, Played and Completed marks, personal ratings and notes from this browser. The original 100 and its ratings never change. | RemoveGamesDialog(); remaining.length === 1 is false; remaining.length is true |
| [src/components/personal/RemoveGamesDialog.tsx:55](../src/components/personal/RemoveGamesDialog.tsx#L55) | Message/fragment | These games are no longer in your private library. No other games will be removed. | RemoveGamesDialog(); remaining.length === 1 is false; remaining.length is false |
| [src/components/personal/RemoveGamesDialog.tsx:58](../src/components/personal/RemoveGamesDialog.tsx#L58) | Rendered copy | This account-library removal will sync while online saving is enabled. Any separately published snapshot stays unchanged until you update or unpublish it. | RemoveGamesDialog(); mode.scope !== 'guest' &amp;&amp; |
| [src/components/personal/RemoveGamesDialog.tsx:71](../src/components/personal/RemoveGamesDialog.tsx#L71) | Rendered copy | ${remaining.length === 1 ? 'This cannot be undone. To keep a copy, choose Keep game and export a backup from Settings first.' : 'This cannot be undone. To keep a copy, choose Keep games and export a backup from Settings first.'} | RemoveGamesDialog(); remaining.length &gt; 0 &amp;&amp; |
| [src/components/personal/RemoveGamesDialog.tsx:73](../src/components/personal/RemoveGamesDialog.tsx#L73) | Message/fragment | This cannot be undone. To keep a copy, choose Keep game and export a backup from Settings first. | RemoveGamesDialog(); remaining.length &gt; 0 &amp;&amp;; remaining.length === 1 is true |
| [src/components/personal/RemoveGamesDialog.tsx:74](../src/components/personal/RemoveGamesDialog.tsx#L74) | Message/fragment | This cannot be undone. To keep a copy, choose Keep games and export a backup from Settings first. | RemoveGamesDialog(); remaining.length &gt; 0 &amp;&amp;; remaining.length === 1 is false |
| [src/components/personal/RemoveGamesDialog.tsx:79](../src/components/personal/RemoveGamesDialog.tsx#L79) | Live region | Nothing was removed. Your saved data is unchanged. Check the storage warning and try again. | RemoveGamesDialog(); failed &amp;&amp; |
| [src/components/personal/RemoveGamesDialog.tsx:84](../src/components/personal/RemoveGamesDialog.tsx#L84) | Rendered copy | ${remaining.length === 1 ? 'Keep game' : remaining.length ? 'Keep games' : 'Close'} | RemoveGamesDialog(); when its owning surface/operation is used |
| [src/components/personal/RemoveGamesDialog.tsx:85](../src/components/personal/RemoveGamesDialog.tsx#L85) | Message/fragment | Close | RemoveGamesDialog(); remaining.length === 1 is false; remaining.length is false |
| [src/components/personal/RemoveGamesDialog.tsx:85](../src/components/personal/RemoveGamesDialog.tsx#L85) | Message/fragment | Keep game | RemoveGamesDialog(); remaining.length === 1 is true |
| [src/components/personal/RemoveGamesDialog.tsx:85](../src/components/personal/RemoveGamesDialog.tsx#L85) | Message/fragment | Keep games | RemoveGamesDialog(); remaining.length === 1 is false; remaining.length is true |
| [src/components/personal/RemoveGamesDialog.tsx:88](../src/components/personal/RemoveGamesDialog.tsx#L88) | Rendered copy | ${removing ? 'Removing…' : &#96;Remove ${remaining.length} ${remaining.length === 1 ? 'game' : 'games'}&#96;} | RemoveGamesDialog(); remaining.length &gt; 0 &amp;&amp; |
| [src/components/personal/RemoveGamesDialog.tsx:96](../src/components/personal/RemoveGamesDialog.tsx#L96) | Message/fragment | Remove ${remaining.length} ${remaining.length === 1 ? 'game' : 'games'} | RemoveGamesDialog(); remaining.length &gt; 0 &amp;&amp;; removing is false |
| [src/components/personal/RemoveGamesDialog.tsx:96](../src/components/personal/RemoveGamesDialog.tsx#L96) | Message/fragment | Removing… | RemoveGamesDialog(); remaining.length &gt; 0 &amp;&amp;; removing is true |
## src/components/personal/RemoveRankingDialog.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/personal/RemoveRankingDialog.tsx:70](../src/components/personal/RemoveRankingDialog.tsx#L70) | Message output | 'This ranking is no longer available. Close this dialog and review your current ranking.' | submit(); !targetExists() is true |
| [src/components/personal/RemoveRankingDialog.tsx:70](../src/components/personal/RemoveRankingDialog.tsx#L70) | Message/fragment | This ranking is no longer available. Close this dialog and review your current ranking. | submit(); !targetExists() is true |
| [src/components/personal/RemoveRankingDialog.tsx:74](../src/components/personal/RemoveRankingDialog.tsx#L74) | Message output | 'Your edit has not saved. Keep this ranking, then correct the highlighted field or retry the edit before removing it.' | submit(); !saved is true |
| [src/components/personal/RemoveRankingDialog.tsx:75](../src/components/personal/RemoveRankingDialog.tsx#L75) | Message/fragment | Your edit has not saved. Keep this ranking, then correct the highlighted field or retry the edit before removing it. | submit(); !saved is true |
| [src/components/personal/RemoveRankingDialog.tsx:87](../src/components/personal/RemoveRankingDialog.tsx#L87) | Message output | 'This ranking was not removed. Check the storage warning and try again, or keep it.' | submit(); success is false |
| [src/components/personal/RemoveRankingDialog.tsx:87](../src/components/personal/RemoveRankingDialog.tsx#L87) | Message/fragment | This ranking was not removed. Check the storage warning and try again, or keep it. | submit(); success is false |
| [src/components/personal/RemoveRankingDialog.tsx:92](../src/components/personal/RemoveRankingDialog.tsx#L92) | Message output | 'This ranking could not be removed. Keep it and retry after checking the storage warning.' | submit(); operation rejected or threw; ownsReview() is true |
| [src/components/personal/RemoveRankingDialog.tsx:92](../src/components/personal/RemoveRankingDialog.tsx#L92) | Message/fragment | This ranking could not be removed. Keep it and retry after checking the storage warning. | submit(); operation rejected or threw; ownsReview() is true |
| [src/components/personal/RemoveRankingDialog.tsx:108](../src/components/personal/RemoveRankingDialog.tsx#L108) | Rendered copy | Remove ${record.title} from ranking? | RemoveRankingDialog(); when its owning surface/operation is used |
| [src/components/personal/RemoveRankingDialog.tsx:109](../src/components/personal/RemoveRankingDialog.tsx#L109) | Rendered copy | This removes its rating, note and ranking position. The game stays in your Library. Played, Completed and Play later stay unchanged. | RemoveRankingDialog(); when its owning surface/operation is used |
| [src/components/personal/RemoveRankingDialog.tsx:113](../src/components/personal/RemoveRankingDialog.tsx#L113) | Rendered copy | This cannot be undone. To keep a copy, choose Keep ranking and export a backup from Settings first. | RemoveRankingDialog(); when its owning surface/operation is used |
| [src/components/personal/RemoveRankingDialog.tsx:117](../src/components/personal/RemoveRankingDialog.tsx#L117) | Live region | ${error} | RemoveRankingDialog(); error &amp;&amp; |
| [src/components/personal/RemoveRankingDialog.tsx:122](../src/components/personal/RemoveRankingDialog.tsx#L122) | Rendered copy | Keep ranking | RemoveRankingDialog(); when its owning surface/operation is used |
| [src/components/personal/RemoveRankingDialog.tsx:125](../src/components/personal/RemoveRankingDialog.tsx#L125) | Rendered copy | ${stage === 'checking' ? 'Checking edits…' : stage === 'removing' ? 'Removing…' : 'Remove from ranking'} | RemoveRankingDialog(); when its owning surface/operation is used |
| [src/components/personal/RemoveRankingDialog.tsx:133](../src/components/personal/RemoveRankingDialog.tsx#L133) | Message/fragment | Checking edits… | RemoveRankingDialog(); stage === 'checking' is true |
| [src/components/personal/RemoveRankingDialog.tsx:133](../src/components/personal/RemoveRankingDialog.tsx#L133) | Message/fragment | Remove from ranking | RemoveRankingDialog(); stage === 'checking' is false; stage === 'removing' is false |
| [src/components/personal/RemoveRankingDialog.tsx:133](../src/components/personal/RemoveRankingDialog.tsx#L133) | Message/fragment | Removing… | RemoveRankingDialog(); stage === 'checking' is false; stage === 'removing' is true |
## src/components/personal/ReorderList.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/personal/ReorderList.tsx:86](../src/components/personal/ReorderList.tsx#L86) | Label/help | {kind === 'queue' ? 'Your Play later games' : 'Your ranked games'} | ReorderList(); when its owning surface/operation is used |
| [src/components/personal/ReorderList.tsx:86](../src/components/personal/ReorderList.tsx#L86) | Message/fragment | Your Play later games | ReorderList(); kind === 'queue' is true |
| [src/components/personal/ReorderList.tsx:86](../src/components/personal/ReorderList.tsx#L86) | Message/fragment | Your ranked games | ReorderList(); kind === 'queue' is false |
| [src/components/personal/ReorderList.tsx:91](../src/components/personal/ReorderList.tsx#L91) | Label/help | {record.title} | ReorderList(); when its owning surface/operation is used |
| [src/components/personal/ReorderList.tsx:163](../src/components/personal/ReorderList.tsx#L163) | Label/help | {&#96;Drag ${title} to reorder ${kind === 'queue' ? 'Play later' : 'your ranking'}&#96;} | ReorderRow(); when its owning surface/operation is used |
| [src/components/personal/ReorderList.tsx:163](../src/components/personal/ReorderList.tsx#L163) | Message/fragment | Drag ${title} to reorder ${kind === 'queue' ? 'Play later' : 'your ranking'} | ReorderRow(); when its owning surface/operation is used |
| [src/components/personal/ReorderList.tsx:170](../src/components/personal/ReorderList.tsx#L170) | Rendered copy | ${String(position).padStart(2, '0')} | ReorderRow(); position !== null &amp;&amp; |
| [src/components/personal/ReorderList.tsx:171](../src/components/personal/ReorderList.tsx#L171) | Rendered copy | ${&#96;Position ${position}&#96;} | ReorderRow(); position !== null &amp;&amp; |
| [src/components/personal/ReorderList.tsx:171](../src/components/personal/ReorderList.tsx#L171) | Message/fragment | Position ${position} | ReorderRow(); position !== null &amp;&amp; |
| [src/components/personal/ReorderList.tsx:180](../src/components/personal/ReorderList.tsx#L180) | Label/help | {&#96;Move ${title} up in ${kind === 'queue' ? 'Play later' : kind}&#96;} | ReorderRow(); when its owning surface/operation is used |
| [src/components/personal/ReorderList.tsx:180](../src/components/personal/ReorderList.tsx#L180) | Message/fragment | Move ${title} up in ${kind === 'queue' ? 'Play later' : kind} | ReorderRow(); when its owning surface/operation is used |
| [src/components/personal/ReorderList.tsx:191](../src/components/personal/ReorderList.tsx#L191) | Label/help | {&#96;Move ${title} down in ${kind === 'queue' ? 'Play later' : kind}&#96;} | ReorderRow(); when its owning surface/operation is used |
| [src/components/personal/ReorderList.tsx:191](../src/components/personal/ReorderList.tsx#L191) | Message/fragment | Move ${title} down in ${kind === 'queue' ? 'Play later' : kind} | ReorderRow(); when its owning surface/operation is used |
## src/components/personal/useLibraryPage.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/personal/useLibraryPage.ts:299](../src/components/personal/useLibraryPage.ts#L299) | Message/fragment | The game could not be removed from Play later. Your list is unchanged; retry. | removeFromQueue(); operation rejected or threw; isCurrent() is true |
| [src/components/personal/useLibraryPage.ts:365](../src/components/personal/useLibraryPage.ts#L365) | Message/fragment | That Play later position is no longer available. Choose a current position and retry. | move(); from &lt; 0 &#124;&#124; to &lt; 0 is true |
| [src/components/personal/useLibraryPage.ts:372](../src/components/personal/useLibraryPage.ts#L372) | Message/fragment | The position could not be saved. Play later has not changed; retry. | move(); !moved is true |
| [src/components/personal/useLibraryPage.ts:387](../src/components/personal/useLibraryPage.ts#L387) | Message/fragment | Play later could not be changed. Your current view is still open; retry. | move(); operation rejected or threw; isCurrent() is true |
## src/components/personal/useRankingsPage.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/personal/useRankingsPage.ts:246](../src/components/personal/useRankingsPage.ts#L246) | Message output | 'Your edit has not saved. Correct the highlighted field or retry before changing this ranking.' | change(); !saved is true |
| [src/components/personal/useRankingsPage.ts:246](../src/components/personal/useRankingsPage.ts#L246) | Message/fragment | Your edit has not saved. Correct the highlighted field or retry before changing this ranking. | change(); !saved is true |
| [src/components/personal/useRankingsPage.ts:252](../src/components/personal/useRankingsPage.ts#L252) | Message output | 'The ranking could not be changed. Your current view is still open; retry.' | change(); operation rejected or threw; isCurrent() is true |
| [src/components/personal/useRankingsPage.ts:252](../src/components/personal/useRankingsPage.ts#L252) | Message/fragment | The ranking could not be changed. Your current view is still open; retry. | change(); operation rejected or threw; isCurrent() is true |
| [src/components/personal/useRankingsPage.ts:276](../src/components/personal/useRankingsPage.ts#L276) | Message output | 'That ranking position is no longer available. Choose a current position and retry.' | move(); from &lt; 0 &#124;&#124; !target &#124;&#124; !Number.isInteger(to) is true |
| [src/components/personal/useRankingsPage.ts:276](../src/components/personal/useRankingsPage.ts#L276) | Message/fragment | That ranking position is no longer available. Choose a current position and retry. | move(); from &lt; 0 &#124;&#124; !target &#124;&#124; !Number.isInteger(to) is true |
| [src/components/personal/useRankingsPage.ts:288](../src/components/personal/useRankingsPage.ts#L288) | Message output | 'The position could not be saved. Your ranking has not moved; retry.' | move(); !saved is true |
| [src/components/personal/useRankingsPage.ts:288](../src/components/personal/useRankingsPage.ts#L288) | Message/fragment | The position could not be saved. Your ranking has not moved; retry. | move(); !saved is true |
| [src/components/personal/useRankingsPage.ts:314](../src/components/personal/useRankingsPage.ts#L314) | Message output | 'Rating order could not be saved. Your current order is unchanged; retry.' | applyRatingOrder(); isCurrent() &amp;&amp; !saved is true |
| [src/components/personal/useRankingsPage.ts:314](../src/components/personal/useRankingsPage.ts#L314) | Message/fragment | Rating order could not be saved. Your current order is unchanged; retry. | applyRatingOrder(); isCurrent() &amp;&amp; !saved is true |
## src/components/PlayedToggle.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/PlayedToggle.tsx:28](../src/components/PlayedToggle.tsx#L28) | Message/fragment | Played | label(); when its owning surface/operation is used |
| [src/components/PlayedToggle.tsx:42](../src/components/PlayedToggle.tsx#L42) | Label/help | {&#96;${label}: ${title}&#96;} | PlayedToggle(); when its owning surface/operation is used |
| [src/components/PlayedToggle.tsx:44](../src/components/PlayedToggle.tsx#L44) | Rendered copy | ${label} | PlayedToggle(); when its owning surface/operation is used |
| [src/components/PlayedToggle.tsx:48](../src/components/PlayedToggle.tsx#L48) | Rendered copy | Mark ${title} not played? | PlayedToggle(); review.key === key &amp;&amp; review.open &amp;&amp; eligible &amp;&amp; |
| [src/components/PlayedToggle.tsx:49](../src/components/PlayedToggle.tsx#L49) | Rendered copy | This also clears Completed. Play later, rating, notes and ranking position stay unchanged. | PlayedToggle(); review.key === key &amp;&amp; review.open &amp;&amp; eligible &amp;&amp; |
| [src/components/PlayedToggle.tsx:51](../src/components/PlayedToggle.tsx#L51) | Rendered copy | Keep completed | PlayedToggle(); review.key === key &amp;&amp; review.open &amp;&amp; eligible &amp;&amp; |
| [src/components/PlayedToggle.tsx:54](../src/components/PlayedToggle.tsx#L54) | Rendered copy | Mark not played | PlayedToggle(); review.key === key &amp;&amp; review.open &amp;&amp; eligible &amp;&amp; |
## src/components/ProgressFilter.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/ProgressFilter.tsx:20](../src/components/ProgressFilter.tsx#L20) | Label/help | Progress | ProgressFilter(); when its owning surface/operation is used |
| [src/components/ProgressFilter.tsx:26](../src/components/ProgressFilter.tsx#L26) | Rendered copy | ${progressLabels[option]} | ProgressFilter(); when its owning surface/operation is used |
| [src/components/ProgressFilter.tsx:30](../src/components/ProgressFilter.tsx#L30) | Rendered copy | Not completed (any played state) | ProgressFilter(); value === 'not-completed' &amp;&amp; |
## src/components/PwaControls.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/PwaControls.tsx:21](../src/components/PwaControls.tsx#L21) | Rendered copy | Install &amp; offline access | PwaControls(); when its owning surface/operation is used |
| [src/components/PwaControls.tsx:22](../src/components/PwaControls.tsx#L22) | Rendered copy | Keep The 100 and this device's library available offline. | PwaControls(); expanded "Install &amp; offline access" disclosure |
| [src/components/PwaControls.tsx:23](../src/components/PwaControls.tsx#L23) | Rendered copy | Account services and online game searches need a connection. Offline preparation downloads public files, not private or account data. | PwaControls(); expanded "Install &amp; offline access" disclosure |
| [src/components/PwaControls.tsx:28](../src/components/PwaControls.tsx#L28) | Live region | Running as an installed app. | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.installState === 'installed' is true |
| [src/components/PwaControls.tsx:30](../src/components/PwaControls.tsx#L30) | Rendered copy | ${PWA_IOS_INSTRUCTIONS} | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.installState === 'installed' is false; pwa.installState === 'ios-instructions' is true |
| [src/components/PwaControls.tsx:32](../src/components/PwaControls.tsx#L32) | Rendered copy | Install Play 100 | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.installState === 'installed' is false; pwa.installState === 'ios-instructions' is false; pwa.installState === 'prompt' is true |
| [src/components/PwaControls.tsx:41](../src/components/PwaControls.tsx#L41) | Rendered copy | No install prompt is available here. Look for Install or Add to Home Screen in your browser. | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.installState === 'installed' is false; pwa.installState === 'ios-instructions' is false; pwa.installState === 'prompt' is false |
| [src/components/PwaControls.tsx:46](../src/components/PwaControls.tsx#L46) | Rendered copy | ${pwa.offlineState === 'ready' ? 'Offline files ready' : pwa.offlineState === 'preparing' ? 'Preparing offline files…' : 'Enable offline access'} | PwaControls(); expanded "Install &amp; offline access" disclosure |
| [src/components/PwaControls.tsx:56](../src/components/PwaControls.tsx#L56) | Message/fragment | Offline files ready | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.offlineState === 'ready' is true |
| [src/components/PwaControls.tsx:58](../src/components/PwaControls.tsx#L58) | Message/fragment | Preparing offline files… | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.offlineState === 'ready' is false; pwa.offlineState === 'preparing' is true |
| [src/components/PwaControls.tsx:59](../src/components/PwaControls.tsx#L59) | Message/fragment | Enable offline access | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.offlineState === 'ready' is false; pwa.offlineState === 'preparing' is false |
| [src/components/PwaControls.tsx:62](../src/components/PwaControls.tsx#L62) | Rendered copy | ${pwa.checkingUpdate ? 'Checking for an update…' : 'Check for an app update'} | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.offlineState === 'ready' &amp;&amp; |
| [src/components/PwaControls.tsx:72](../src/components/PwaControls.tsx#L72) | Message/fragment | Check for an app update | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.offlineState === 'ready' &amp;&amp;; pwa.checkingUpdate is false |
| [src/components/PwaControls.tsx:72](../src/components/PwaControls.tsx#L72) | Message/fragment | Checking for an update… | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.offlineState === 'ready' &amp;&amp;; pwa.checkingUpdate is true |
| [src/components/PwaControls.tsx:76](../src/components/PwaControls.tsx#L76) | Rendered copy | Offline files are stored within your browser's storage limits. Workbooks, films and online-only pages are not downloaded for offline use. | PwaControls(); expanded "Install &amp; offline access" disclosure |
| [src/components/PwaControls.tsx:80](../src/components/PwaControls.tsx#L80) | Live region | ${pwa.message &amp;&amp; &lt;p&gt;{pwa.message}&lt;/p&gt;} | PwaControls(); expanded "Install &amp; offline access" disclosure |
| [src/components/PwaControls.tsx:80](../src/components/PwaControls.tsx#L80) | Rendered copy | ${pwa.message} | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.message &amp;&amp; |
| [src/components/PwaControls.tsx:82](../src/components/PwaControls.tsx#L82) | Live region | ${pwa.error} | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.error &amp;&amp; !pwa.moduleError &amp;&amp; |
| [src/components/PwaControls.tsx:87](../src/components/PwaControls.tsx#L87) | Live region | ${pwa.error} ${recovering ? 'Checking your connection…' : 'Reload this page'} | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.moduleError &amp;&amp; |
| [src/components/PwaControls.tsx:88](../src/components/PwaControls.tsx#L88) | Rendered copy | ${pwa.error} | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.moduleError &amp;&amp; |
| [src/components/PwaControls.tsx:89](../src/components/PwaControls.tsx#L89) | Rendered copy | ${recovering ? 'Checking your connection…' : 'Reload this page'} | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.moduleError &amp;&amp; |
| [src/components/PwaControls.tsx:98](../src/components/PwaControls.tsx#L98) | Message output | 'This page could not reload. Save your changes before reloading when connected.' | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.moduleError &amp;&amp;; onClick |
| [src/components/PwaControls.tsx:98](../src/components/PwaControls.tsx#L98) | Message/fragment | This page could not reload. Save your changes before reloading when connected. | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.moduleError &amp;&amp;; onClick |
| [src/components/PwaControls.tsx:103](../src/components/PwaControls.tsx#L103) | Message/fragment | Checking your connection… | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.moduleError &amp;&amp;; recovering is true |
| [src/components/PwaControls.tsx:103](../src/components/PwaControls.tsx#L103) | Message/fragment | Reload this page | PwaControls(); expanded "Install &amp; offline access" disclosure; pwa.moduleError &amp;&amp;; recovering is false |
| [src/components/PwaControls.tsx:108](../src/components/PwaControls.tsx#L108) | Live region | ${updateError} | PwaControls(); expanded "Install &amp; offline access" disclosure; updateError &amp;&amp; |
| [src/components/PwaControls.tsx:115](../src/components/PwaControls.tsx#L115) | Label/help | Confirm app update | PwaControls(); expanded "Install &amp; offline access" disclosure; !pwa.moduleError &amp;&amp; (pwa.updateState === 'waiting' &#124;&#124; pwa.updateState === 'reload-required') &amp;&amp;; confirm is true |
| [src/components/PwaControls.tsx:116](../src/components/PwaControls.tsx#L116) | Rendered copy | Updating reloads this page. Finish or clear unsubmitted forms first. It saves your ratings and notes before reloading, and stops if you edit, change page or have Play 100 open in another window. | PwaControls(); expanded "Install &amp; offline access" disclosure; !pwa.moduleError &amp;&amp; (pwa.updateState === 'waiting' &#124;&#124; pwa.updateState === 'reload-required') &amp;&amp;; confirm is true |
| [src/components/PwaControls.tsx:121](../src/components/PwaControls.tsx#L121) | Rendered copy | Keep this version open | PwaControls(); expanded "Install &amp; offline access" disclosure; !pwa.moduleError &amp;&amp; (pwa.updateState === 'waiting' &#124;&#124; pwa.updateState === 'reload-required') &amp;&amp;; confirm is true |
| [src/components/PwaControls.tsx:124](../src/components/PwaControls.tsx#L124) | Rendered copy | Save and update this page | PwaControls(); expanded "Install &amp; offline access" disclosure; !pwa.moduleError &amp;&amp; (pwa.updateState === 'waiting' &#124;&#124; pwa.updateState === 'reload-required') &amp;&amp;; confirm is true |
| [src/components/PwaControls.tsx:136](../src/components/PwaControls.tsx#L136) | Message output | 'The requested update could not finish. Your page was not reloaded.' | PwaControls(); expanded "Install &amp; offline access" disclosure; !pwa.moduleError &amp;&amp; (pwa.updateState === 'waiting' &#124;&#124; pwa.updateState === 'reload-required') &amp;&amp;; confirm is true; onClick |
| [src/components/PwaControls.tsx:136](../src/components/PwaControls.tsx#L136) | Message/fragment | The requested update could not finish. Your page was not reloaded. | PwaControls(); expanded "Install &amp; offline access" disclosure; !pwa.moduleError &amp;&amp; (pwa.updateState === 'waiting' &#124;&#124; pwa.updateState === 'reload-required') &amp;&amp;; confirm is true; onClick |
| [src/components/PwaControls.tsx:146](../src/components/PwaControls.tsx#L146) | Rendered copy | Review app update | PwaControls(); expanded "Install &amp; offline access" disclosure; !pwa.moduleError &amp;&amp; (pwa.updateState === 'waiting' &#124;&#124; pwa.updateState === 'reload-required') &amp;&amp;; confirm is false |
## src/components/RatingsTable.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/RatingsTable.tsx:102](../src/components/RatingsTable.tsx#L102) | Message/fragment | Your edit has not saved. Correct the highlighted rating or note before leaving. | openRanking(); saved is false |
| [src/components/RatingsTable.tsx:108](../src/components/RatingsTable.tsx#L108) | Message/fragment | Your edit could not be saved. Keep this page open and retry. | openRanking(); operation rejected or threw; isCurrent() is true |
| [src/components/RatingsTable.tsx:124](../src/components/RatingsTable.tsx#L124) | Label/help | {scale ? &#96;${label} ${scale}&#96; : label} | sortedHeader(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:138](../src/components/RatingsTable.tsx#L138) | Rendered copy | ${label} ${scale &amp;&amp; &lt;small&gt;{scale}&lt;/small&gt;} | sortedHeader(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:140](../src/components/RatingsTable.tsx#L140) | Rendered copy | ${scale} | sortedHeader(); scale &amp;&amp; |
| [src/components/RatingsTable.tsx:150](../src/components/RatingsTable.tsx#L150) | Rendered copy | ${author.shortName}'s rank-based workbook ratings are separate from critic scores. — means unavailable. Critic averages include both Metacritic columns. Edit your own ratings in My games → Ranking . | RatingsTable(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:153](../src/components/RatingsTable.tsx#L153) | Rendered copy | My games → Ranking | RatingsTable(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:170](../src/components/RatingsTable.tsx#L170) | Label/help | Rankings and ratings table; scroll horizontally for all scores | RatingsTable(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:190](../src/components/RatingsTable.tsx#L190) | Rendered copy | Select games | RatingsTable(); selecting &amp;&amp; |
| [src/components/RatingsTable.tsx:193](../src/components/RatingsTable.tsx#L193) | Message/fragment | Rank | RatingsTable(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:194](../src/components/RatingsTable.tsx#L194) | Message/fragment | Game | RatingsTable(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:195](../src/components/RatingsTable.tsx#L195) | Message/fragment | Year | RatingsTable(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:200](../src/components/RatingsTable.tsx#L200) | Label/help | {label} | RatingsTable(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:209](../src/components/RatingsTable.tsx#L209) | Message/fragment | Average | RatingsTable(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:225](../src/components/RatingsTable.tsx#L225) | Label/help | {&#96;Select ${game.title}&#96;} | RatingsTable(); selecting &amp;&amp; |
| [src/components/RatingsTable.tsx:225](../src/components/RatingsTable.tsx#L225) | Message/fragment | Select ${game.title} | RatingsTable(); selecting &amp;&amp; |
| [src/components/RatingsTable.tsx:233](../src/components/RatingsTable.tsx#L233) | Rendered copy | ${game.genre} · ${game.tier === 'core' ? 'Core 50' : 'Essential 50'} | RatingsTable(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:239](../src/components/RatingsTable.tsx#L239) | Label/help | {game.authorRating?.rawValue} | RatingsTable(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:245](../src/components/RatingsTable.tsx#L245) | Rendered copy | Original author rating unavailable | RatingsTable(); game.authorRating is false |
| [src/components/RatingsTable.tsx:254](../src/components/RatingsTable.tsx#L254) | Rendered copy | Unavailable | RatingsTable(); game.critics[key] === null is true |
| [src/components/RatingsTable.tsx:266](../src/components/RatingsTable.tsx#L266) | Label/help | {game.title} | RatingsTable(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:274](../src/components/RatingsTable.tsx#L274) | Label/help | {game.title} | RatingsTable(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:283](../src/components/RatingsTable.tsx#L283) | Label/help | {&#96;Play later: ${game.title}&#96;} | RatingsTable(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:283](../src/components/RatingsTable.tsx#L283) | Message/fragment | Play later: ${game.title} | RatingsTable(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:284](../src/components/RatingsTable.tsx#L284) | Label/help | Play later | RatingsTable(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:307](../src/components/RatingsTable.tsx#L307) | Live region | ${navigationError} | RatingsTable(); navigationError &amp;&amp; |
| [src/components/RatingsTable.tsx:341](../src/components/RatingsTable.tsx#L341) | Rendered copy | #${String(game.rank).padStart(2, '0')} | RatingsGameLink(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:344](../src/components/RatingsTable.tsx#L344) | Rendered copy | ${game.title} | RatingsGameLink(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:364](../src/components/RatingsTable.tsx#L364) | Label/help | {&#96;${label} / ${scale}&#96;} | TableHeading(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:365](../src/components/RatingsTable.tsx#L365) | Rendered copy | ${label} / ${scale} | TableHeading(); when its owning surface/operation is used |
| [src/components/RatingsTable.tsx:367](../src/components/RatingsTable.tsx#L367) | Rendered copy | / ${scale} | TableHeading(); when its owning surface/operation is used |
## src/components/scene/CollectionScene.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/scene/CollectionScene.tsx:60](../src/components/scene/CollectionScene.tsx#L60) | Error/validation | The collection artwork could not be drawn. | canvasSurface(); !context is true |
| [src/components/scene/CollectionScene.tsx:319](../src/components/scene/CollectionScene.tsx#L319) | Message/fragment | Illustrated view · 3D interrupted | onContextLost(); when its owning surface/operation is used |
| [src/components/scene/CollectionScene.tsx:332](../src/components/scene/CollectionScene.tsx#L332) | Error/validation | WebGL 2 is unavailable. | createCollectionScene(); !context is true |
| [src/components/scene/CollectionScene.tsx:577](../src/components/scene/CollectionScene.tsx#L577) | Message/fragment | Illustrated view · 3D interrupted | renderFrame(); engine.getContext().isContextLost() is true |
| [src/components/scene/CollectionScene.tsx:586](../src/components/scene/CollectionScene.tsx#L586) | Message/fragment | Illustrated view · 3D was too slow | renderFrame(); action === 'fallback' is true |
| [src/components/scene/CollectionScene.tsx:594](../src/components/scene/CollectionScene.tsx#L594) | Message/fragment | Illustrated view · 3D unavailable | renderFrame(); operation rejected or threw |
## src/components/scene/sceneFonts.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/scene/sceneFonts.ts:8](../src/components/scene/sceneFonts.ts#L8) | Message/fragment | "Hanken Grotesk Variable", sans-serif | SCENE_SANS(); when its owning surface/operation is used |
| [src/components/scene/sceneFonts.ts:9](../src/components/scene/sceneFonts.ts#L9) | Message/fragment | "Barlow Condensed", sans-serif | SCENE_DISPLAY(); when its owning surface/operation is used |
## src/components/SelectField.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/SelectField.tsx:24](../src/components/SelectField.tsx#L24) | Rendered copy | ${label} | SelectField(); when its owning surface/operation is used |
## src/components/SelectionBar.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/SelectionBar.tsx:43](../src/components/SelectionBar.tsx#L43) | Label/help | Bulk game actions | SelectionBar(); when its owning surface/operation is used |
| [src/components/SelectionBar.tsx:45](../src/components/SelectionBar.tsx#L45) | Live region | ${count} selected | SelectionBar(); when its owning surface/operation is used |
| [src/components/SelectionBar.tsx:46](../src/components/SelectionBar.tsx#L46) | Rendered copy | ${count === total ? 'Clear selection' : (selectAllLabel ?? &#96;Select all ${total} in this view&#96;)} | SelectionBar(); when its owning surface/operation is used |
| [src/components/SelectionBar.tsx:54](../src/components/SelectionBar.tsx#L54) | Message/fragment | Clear selection | SelectionBar(); count === total is true |
| [src/components/SelectionBar.tsx:54](../src/components/SelectionBar.tsx#L54) | Message/fragment | Select all ${total} in this view | SelectionBar(); count === total is false; selectAllLabel ?? |
| [src/components/SelectionBar.tsx:58](../src/components/SelectionBar.tsx#L58) | Rendered copy | Add to Play later | SelectionBar(); when its owning surface/operation is used |
| [src/components/SelectionBar.tsx:62](../src/components/SelectionBar.tsx#L62) | Rendered copy | Mark played | SelectionBar(); when its owning surface/operation is used |
| [src/components/SelectionBar.tsx:69](../src/components/SelectionBar.tsx#L69) | Rendered copy | Mark completed | SelectionBar(); when its owning surface/operation is used |
| [src/components/SelectionBar.tsx:77](../src/components/SelectionBar.tsx#L77) | Rendered copy | Add to my ranking | SelectionBar(); when its owning surface/operation is used |
| [src/components/SelectionBar.tsx:87](../src/components/SelectionBar.tsx#L87) | Rendered copy | Remove from Play later | SelectionBar(); context === 'library' &amp;&amp; |
| [src/components/SelectionBar.tsx:94](../src/components/SelectionBar.tsx#L94) | Rendered copy | Mark not completed | SelectionBar(); context === 'library' &amp;&amp; |
| [src/components/SelectionBar.tsx:102](../src/components/SelectionBar.tsx#L102) | Rendered copy | Remove from my library | SelectionBar(); context === 'library' &amp;&amp;; onRemove &amp;&amp; |
| [src/components/SelectionBar.tsx:116](../src/components/SelectionBar.tsx#L116) | Rendered copy | ${selectionHelp ?? 'Changing the page or filters clears this selection. Your original collection ranks never change.'} | SelectionBar(); when its owning surface/operation is used |
| [src/components/SelectionBar.tsx:118](../src/components/SelectionBar.tsx#L118) | Message/fragment | Changing the page or filters clears this selection. Your original collection ranks never change. | SelectionBar(); selectionHelp ?? |
## src/components/SettingsDialog.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/SettingsDialog.tsx:119](../src/components/SettingsDialog.tsx#L119) | Message output | null | changeMotion(); when its owning surface/operation is used |
| [src/components/SettingsDialog.tsx:124](../src/components/SettingsDialog.tsx#L124) | Message output | 'failed' | changeMotion(); !(await onMotion(next)) is true |
| [src/components/SettingsDialog.tsx:129](../src/components/SettingsDialog.tsx#L129) | Message output | 'saved' | changeMotion(); latest === null &#124;&#124; latest === next is true |
| [src/components/SettingsDialog.tsx:136](../src/components/SettingsDialog.tsx#L136) | Message output | 'failed' | changeMotion(); operation rejected or threw |
| [src/components/SettingsDialog.tsx:154](../src/components/SettingsDialog.tsx#L154) | Rendered copy | Settings &amp; backups | SettingsDialog(); when its owning surface/operation is used |
| [src/components/SettingsDialog.tsx:157](../src/components/SettingsDialog.tsx#L157) | Rendered copy | Backups, offline access and display settings for this device. | SettingsDialog(); when its owning surface/operation is used |
| [src/components/SettingsDialog.tsx:158](../src/components/SettingsDialog.tsx#L158) | Live region | ${status &amp;&amp; !recovery &amp;&amp; &lt;p className={status &amp;&amp; statusError ? 'inline-error' : undefined}&gt;{status}&lt;/p&gt;} ${motionFeedback &amp;&amp; ( &lt;p className={motionFeedback === 'failed' ? 'inline-error' : undefined}&gt; {motionFeedback === 'failed' ? 'Your visual experience could not be saved. The saved preference is still selected. Please try again.' : &#96;Visual preference saved.${persistent ? '' : ' This tab only: export a backup to keep it.'}&#96;} &lt;/p&gt; )} | SettingsDialog(); when its owning surface/operation is used |
| [src/components/SettingsDialog.tsx:159](../src/components/SettingsDialog.tsx#L159) | Rendered copy | ${status} | SettingsDialog(); status &amp;&amp; !recovery &amp;&amp; |
| [src/components/SettingsDialog.tsx:161](../src/components/SettingsDialog.tsx#L161) | Rendered copy | ${motionFeedback === 'failed' ? 'Your visual experience could not be saved. The saved preference is still selected. Please try again.' : &#96;Visual preference saved.${persistent ? '' : ' This tab only: export a backup to keep it.'}&#96;} | SettingsDialog(); motionFeedback &amp;&amp; |
| [src/components/SettingsDialog.tsx:163](../src/components/SettingsDialog.tsx#L163) | Message/fragment | Your visual experience could not be saved. The saved preference is still selected. Please try again. | SettingsDialog(); motionFeedback &amp;&amp;; motionFeedback === 'failed' is true |
| [src/components/SettingsDialog.tsx:164](../src/components/SettingsDialog.tsx#L164) | Message/fragment | Visual preference saved.${persistent ? '' : ' This tab only: export a backup to keep it.'} | SettingsDialog(); motionFeedback &amp;&amp;; motionFeedback === 'failed' is false |
| [src/components/SettingsDialog.tsx:171](../src/components/SettingsDialog.tsx#L171) | Rendered copy | ${mode.label} ${mode.scope === 'guest' ? ' — this guest library has not been uploaded.' : ' — you are using a separate account library.'} | SettingsDialog(); onAccount &amp;&amp; |
| [src/components/SettingsDialog.tsx:172](../src/components/SettingsDialog.tsx#L172) | Rendered copy | ${mode.label} | SettingsDialog(); onAccount &amp;&amp; |
| [src/components/SettingsDialog.tsx:174](../src/components/SettingsDialog.tsx#L174) | Message/fragment | — this guest library has not been uploaded. | SettingsDialog(); onAccount &amp;&amp;; mode.scope === 'guest' is true |
| [src/components/SettingsDialog.tsx:175](../src/components/SettingsDialog.tsx#L175) | Message/fragment | — you are using a separate account library. | SettingsDialog(); onAccount &amp;&amp;; mode.scope === 'guest' is false |
| [src/components/SettingsDialog.tsx:177](../src/components/SettingsDialog.tsx#L177) | Rendered copy | Account, saving &amp; privacy | SettingsDialog(); onAccount &amp;&amp; |
| [src/components/SettingsDialog.tsx:193](../src/components/SettingsDialog.tsx#L193) | Rendered copy | Visual experience | SettingsDialog(); when its owning surface/operation is used |
| [src/components/SettingsDialog.tsx:196](../src/components/SettingsDialog.tsx#L196) | Message/fragment | Auto | SettingsDialog(); when its owning surface/operation is used |
| [src/components/SettingsDialog.tsx:196](../src/components/SettingsDialog.tsx#L196) | Message/fragment | Touchscreens start 3D on demand. | SettingsDialog(); when its owning surface/operation is used |
| [src/components/SettingsDialog.tsx:197](../src/components/SettingsDialog.tsx#L197) | Message/fragment | Full | SettingsDialog(); when its owning surface/operation is used |
| [src/components/SettingsDialog.tsx:197](../src/components/SettingsDialog.tsx#L197) | Message/fragment | The interactive 3D collection. | SettingsDialog(); when its owning surface/operation is used |
| [src/components/SettingsDialog.tsx:198](../src/components/SettingsDialog.tsx#L198) | Message/fragment | Lite | SettingsDialog(); when its owning surface/operation is used |
| [src/components/SettingsDialog.tsx:198](../src/components/SettingsDialog.tsx#L198) | Message/fragment | Original static art. No effects. | SettingsDialog(); when its owning surface/operation is used |
| [src/components/SettingsDialog.tsx:215](../src/components/SettingsDialog.tsx#L215) | Rendered copy | ${label} | SettingsDialog(); when its owning surface/operation is used |
| [src/components/SettingsDialog.tsx:216](../src/components/SettingsDialog.tsx#L216) | Rendered copy | ${description} | SettingsDialog(); when its owning surface/operation is used |
| [src/components/SettingsDialog.tsx:222](../src/components/SettingsDialog.tsx#L222) | Rendered copy | Your system requests reduced motion. Static art is used in every mode, even Full. | SettingsDialog(); reducedMotion is true |
| [src/components/SettingsDialog.tsx:227](../src/components/SettingsDialog.tsx#L227) | Rendered copy | Auto is using static art because this browser reports limited device resources or data saving. | SettingsDialog(); reducedMotion is false; constrained &amp;&amp; motion === 'auto' is true |
| [src/components/SettingsDialog.tsx:232](../src/components/SettingsDialog.tsx#L232) | Rendered copy | Auto uses available device and connection hints. Offscreen and hidden-tab animation stops. Full still respects your system's reduced-motion setting. | SettingsDialog(); reducedMotion is false; constrained &amp;&amp; motion === 'auto' is false |
| [src/components/SettingsDialog.tsx:238](../src/components/SettingsDialog.tsx#L238) | Rendered copy | ${mode.scope === 'guest' ? 'Only on this device' : 'This account library'} | SettingsDialog(); when its owning surface/operation is used |
| [src/components/SettingsDialog.tsx:238](../src/components/SettingsDialog.tsx#L238) | Message/fragment | Only on this device | SettingsDialog(); mode.scope === 'guest' is true |
| [src/components/SettingsDialog.tsx:238](../src/components/SettingsDialog.tsx#L238) | Message/fragment | This account library | SettingsDialog(); mode.scope === 'guest' is false |
| [src/components/SettingsDialog.tsx:239](../src/components/SettingsDialog.tsx#L239) | Rendered copy | ${saved} in Play later · ${completed} completed. | SettingsDialog(); when its owning surface/operation is used |
| [src/components/SettingsDialog.tsx:242](../src/components/SettingsDialog.tsx#L242) | Rendered copy | ${mode.scope === 'guest' ? 'Online saving is optional and requires a separate sign-in and consent.' : 'Account edits save locally first and upload only while online saving is enabled. Sign out to return to the untouched guest library; manage cloud deletion from Account.'} Completed games can stay in Play later for a replay. | SettingsDialog(); when its owning surface/operation is used |
| [src/components/SettingsDialog.tsx:244](../src/components/SettingsDialog.tsx#L244) | Message/fragment | Online saving is optional and requires a separate sign-in and consent. | SettingsDialog(); mode.scope === 'guest' is true |
| [src/components/SettingsDialog.tsx:245](../src/components/SettingsDialog.tsx#L245) | Message/fragment | Account edits save locally first and upload only while online saving is enabled. Sign out to return to the untouched guest library; manage cloud deletion from Account. | SettingsDialog(); mode.scope === 'guest' is false |
| [src/components/SettingsDialog.tsx:249](../src/components/SettingsDialog.tsx#L249) | Live region | ${warning} | SettingsDialog(); warning &amp;&amp; !resetFailed &amp;&amp; |
| [src/components/SettingsDialog.tsx:255](../src/components/SettingsDialog.tsx#L255) | Rendered copy | Reset the active library, Play later, personal rankings, Compare pins and preferences? ${mode.scope !== 'guest' &amp;&amp; 'If online saving is enabled, this empty account library will sync online. The guest library stays untouched.'} This cannot be undone. Export a backup first if needed. The public collection is not affected. | SettingsDialog(); confirmReset is true |
| [src/components/SettingsDialog.tsx:256](../src/components/SettingsDialog.tsx#L256) | Rendered copy | Reset the active library, Play later, personal rankings, Compare pins and preferences? | SettingsDialog(); confirmReset is true |
| [src/components/SettingsDialog.tsx:258](../src/components/SettingsDialog.tsx#L258) | Message/fragment | If online saving is enabled, this empty account library will sync online. The guest library stays untouched. | SettingsDialog(); confirmReset is true; mode.scope !== 'guest' &amp;&amp; |
| [src/components/SettingsDialog.tsx:262](../src/components/SettingsDialog.tsx#L262) | Rendered copy | ${mode.scope === 'guest' ? 'Yes, reset device data' : 'Yes, reset this account library'} | SettingsDialog(); confirmReset is true |
| [src/components/SettingsDialog.tsx:271](../src/components/SettingsDialog.tsx#L271) | Rendered copy | Keep my data | SettingsDialog(); confirmReset is true |
| [src/components/SettingsDialog.tsx:284](../src/components/SettingsDialog.tsx#L284) | Rendered copy | ${mode.scope === 'guest' ? 'Reset device data' : 'Reset this account library'} | SettingsDialog(); confirmReset is false |
| [src/components/SettingsDialog.tsx:295](../src/components/SettingsDialog.tsx#L295) | Message/fragment | Reset device data | SettingsDialog(); confirmReset is false; mode.scope === 'guest' is true |
| [src/components/SettingsDialog.tsx:295](../src/components/SettingsDialog.tsx#L295) | Message/fragment | Reset this account library | SettingsDialog(); confirmReset is false; mode.scope === 'guest' is false |
| [src/components/SettingsDialog.tsx:299](../src/components/SettingsDialog.tsx#L299) | Live region | ${resetResult === 'saved' ? 'Your active library, Play later, ranking, Compare pins and preferences have been reset.' : resetResult === 'pins-retained' ? 'Your library and preferences were reset, but saved Compare pins could not be cleared. Allow storage and try Reset again.' : 'Reset failed. Your saved data has not been removed.'} ${resetFailed &amp;&amp; warning &amp;&amp; &lt;&gt; {warning}&lt;/&gt;} | SettingsDialog(); resetResult &amp;&amp; |
| [src/components/SettingsDialog.tsx:301](../src/components/SettingsDialog.tsx#L301) | Message/fragment | Your active library, Play later, ranking, Compare pins and preferences have been reset. | SettingsDialog(); resetResult &amp;&amp;; resetResult === 'saved' is true |
| [src/components/SettingsDialog.tsx:303](../src/components/SettingsDialog.tsx#L303) | Message/fragment | Your library and preferences were reset, but saved Compare pins could not be cleared. Allow storage and try Reset again. | SettingsDialog(); resetResult &amp;&amp;; resetResult === 'saved' is false; resetResult === 'pins-retained' is true |
| [src/components/SettingsDialog.tsx:304](../src/components/SettingsDialog.tsx#L304) | Message/fragment | Reset failed. Your saved data has not been removed. | SettingsDialog(); resetResult &amp;&amp;; resetResult === 'saved' is false; resetResult === 'pins-retained' is false |
| [src/components/SettingsDialog.tsx:309](../src/components/SettingsDialog.tsx#L309) | Rendered copy | About &amp; credits | SettingsDialog(); when its owning surface/operation is used |
## src/components/SiteFooter.tsx

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/components/SiteFooter.tsx:18](../src/components/SiteFooter.tsx#L18) | Label/help | Resources | SiteFooter(); when its owning surface/operation is used |
| [src/components/SiteFooter.tsx:19](../src/components/SiteFooter.tsx#L19) | Rendered copy | Source code | SiteFooter(); when its owning surface/operation is used |
| [src/components/SiteFooter.tsx:23](../src/components/SiteFooter.tsx#L23) | Rendered copy | Enhanced spreadsheet | SiteFooter(); when its owning surface/operation is used |
| [src/components/SiteFooter.tsx:26](../src/components/SiteFooter.tsx#L26) | Rendered copy | Original spreadsheet | SiteFooter(); when its owning surface/operation is used |
| [src/components/SiteFooter.tsx:30](../src/components/SiteFooter.tsx#L30) | Rendered copy | About &amp; credits | SiteFooter(); onAbout is true |
| [src/components/SiteFooter.tsx:32](../src/components/SiteFooter.tsx#L32) | Rendered copy | About &amp; credits | SiteFooter(); onAbout is false |
| [src/components/SiteFooter.tsx:36](../src/components/SiteFooter.tsx#L36) | Rendered copy | Effects: ${effects} | SiteFooter(); onEffects &amp;&amp; |
## src/first-paint/boot.js

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/first-paint/boot.js:25](../src/first-paint/boot.js#L25) | Message/fragment | 1px "Hanken Grotesk Variable" | webFonts(); when its owning surface/operation is used |
| [src/first-paint/boot.js:25](../src/first-paint/boot.js#L25) | Message/fragment | 700 1px "Barlow Condensed" | webFonts(); when its owning surface/operation is used |
| [src/first-paint/boot.js:25](../src/first-paint/boot.js#L25) | Message/fragment | 800 1px "Barlow Condensed" | webFonts(); when its owning surface/operation is used |
| [src/first-paint/boot.js:67](../src/first-paint/boot.js#L67) | Message/fragment | GREAT ESCAPES. | probes(); when its owning surface/operation is used |
| [src/first-paint/boot.js:68](../src/first-paint/boot.js#L68) | Message/fragment | Find your next world. | probes(); when its owning surface/operation is used |
| [src/first-paint/boot.js:69](../src/first-paint/boot.js#L69) | Message/fragment | GOOD THINGS, COLLECTED. | probes(); when its owning surface/operation is used |
| [src/first-paint/boot.js:130](../src/first-paint/boot.js#L130) | Message/fragment | DOMContentLoaded | fail(); document.readyState === 'loading' is true |
| [src/first-paint/boot.js:195](../src/first-paint/boot.js#L195) | Message/fragment | SCRIPT | start(); when its owning surface/operation is used |
| [src/first-paint/boot.js:211](../src/first-paint/boot.js#L211) | Message/fragment | DOMContentLoaded | start(); document.readyState === 'loading' is true |
| [src/first-paint/boot.js:228](../src/first-paint/boot.js#L228) | Message/fragment | DOMContentLoaded | afterPaint(); when its owning surface/operation is used |
## src/hooks/useAccountLibrary.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/hooks/useAccountLibrary.ts:28](../src/hooks/useAccountLibrary.ts#L28) | Error/validation | Open an account before saving its device copy. | read(); !this.scope is true |
| [src/hooks/useAccountLibrary.ts:43](../src/hooks/useAccountLibrary.ts#L43) | Error/validation | Reopen the signed-in account before saving its device copy. | unavailableAccount(); when its owning surface/operation is used |
| [src/hooks/useAccountLibrary.ts:79](../src/hooks/useAccountLibrary.ts#L79) | Message/fragment | Account device storage is unavailable. | retryOpen(); currentLifetime.current === lifetime is true; error instanceof Error is false |
| [src/hooks/useAccountLibrary.ts:121](../src/hooks/useAccountLibrary.ts#L121) | Message/fragment | Your account change could not be saved on this device. | task(); operation rejected or threw; currentLifetime.current === lifetime is true; error instanceof Error is false |
## src/hooks/useAppPanel.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/hooks/useAppPanel.ts:48](../src/hooks/useAppPanel.ts#L48) | Message output | { text: '', error: false } | dismissPanelMessage(); when its owning surface/operation is used |
| [src/hooks/useAppPanel.ts:57](../src/hooks/useAppPanel.ts#L57) | Message/fragment | Settings | title(); next === 'about' is false |
| [src/hooks/useAppPanel.ts:59](../src/hooks/useAppPanel.ts#L59) | Message output | { text: &#96;Opening ${title}…&#96;, error: false } | loadPanel(); alive.current &amp;&amp; generation.current === request is true |
| [src/hooks/useAppPanel.ts:59](../src/hooks/useAppPanel.ts#L59) | Message/fragment | Opening ${title}… | loadPanel(); alive.current &amp;&amp; generation.current === request is true |
| [src/hooks/useAppPanel.ts:65](../src/hooks/useAppPanel.ts#L65) | Message output | { text: '', error: false } | loadPanel(); when its owning surface/operation is used |
| [src/hooks/useAppPanel.ts:76](../src/hooks/useAppPanel.ts#L76) | Message output | { text: &#96;${title} didn't load.&#96;, error: true } | loadPanel(); alive.current &amp;&amp; generation.current === request is true |
| [src/hooks/useAppPanel.ts:85](../src/hooks/useAppPanel.ts#L85) | Message output | { text: '', error: false } | openPanel(); when its owning surface/operation is used |
| [src/hooks/useAppPanel.ts:110](../src/hooks/useAppPanel.ts#L110) | Message output | { text: '', error: false } | cancel(); when its owning surface/operation is used |
| [src/hooks/useAppPanel.ts:121](../src/hooks/useAppPanel.ts#L121) | Message/fragment | Escape | escape(); when its owning surface/operation is used |
## src/hooks/useCollection.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/hooks/useCollection.ts:22](../src/hooks/useCollection.ts#L22) | Error/validation | The collection request failed (${response.status}). | useCollection(); !response.ok is true |
| [src/hooks/useCollection.ts:38](../src/hooks/useCollection.ts#L38) | Message/fragment | The collection took too long to load. Check your connection and try again. | useCollection(); timedOut is true |
| [src/hooks/useCollection.ts:41](../src/hooks/useCollection.ts#L41) | Message/fragment | The collection could not be loaded. | useCollection(); timedOut is false; error instanceof Error is false |
## src/hooks/useCollectionView.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/hooks/useCollectionView.ts:151](../src/hooks/useCollectionView.ts#L151) | Message output | 'Select a matching game before applying a bulk action.' | bulk(); !records.length is true |
| [src/hooks/useCollectionView.ts:151](../src/hooks/useCollectionView.ts#L151) | Message/fragment | Select a matching game before applying a bulk action. | bulk(); !records.length is true |
| [src/hooks/useCollectionView.ts:163](../src/hooks/useCollectionView.ts#L163) | Message output | resultRecords.length ? 'You have completed every game in this view. Change a filter to discover more.' : 'No loaded games match this view. Reset filters for a fresh pick.' | pick(); chosen &amp;&amp; chosen.collectionRank !== null is false; chosen is false |
| [src/hooks/useCollectionView.ts:165](../src/hooks/useCollectionView.ts#L165) | Message/fragment | You have completed every game in this view. Change a filter to discover more. | pick(); chosen &amp;&amp; chosen.collectionRank !== null is false; chosen is false; resultRecords.length is true |
| [src/hooks/useCollectionView.ts:166](../src/hooks/useCollectionView.ts#L166) | Message/fragment | No loaded games match this view. Reset filters for a fresh pick. | pick(); chosen &amp;&amp; chosen.collectionRank !== null is false; chosen is false; resultRecords.length is false |
## src/hooks/useDetailSelection.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/hooks/useDetailSelection.ts:91](../src/hooks/useDetailSelection.ts#L91) | Message output | 'This shared game is no longer available.' | useDetailSelection(); !allRecords.has(revokedPreview.record.id) is true |
| [src/hooks/useDetailSelection.ts:91](../src/hooks/useDetailSelection.ts#L91) | Message/fragment | This shared game is no longer available. | useDetailSelection(); !allRecords.has(revokedPreview.record.id) is true |
| [src/hooks/useDetailSelection.ts:126](../src/hooks/useDetailSelection.ts#L126) | Message output | 'This shared game is no longer available.' | preparePreview(); authority &amp;&amp; (authority.scope !== libraryScope &#124;&#124; !authority.permits(record.id)) is true |
| [src/hooks/useDetailSelection.ts:126](../src/hooks/useDetailSelection.ts#L126) | Message/fragment | This shared game is no longer available. | preparePreview(); authority &amp;&amp; (authority.scope !== libraryScope &#124;&#124; !authority.permits(record.id)) is true |
| [src/hooks/useDetailSelection.ts:144](../src/hooks/useDetailSelection.ts#L144) | Message output | 'The shared game is no longer available. No library change was saved.' | performDetailAction(); transientPreview?.authority &amp;&amp; !allRecords.has(transientPreview.record.id) &amp;&amp; !transientPreview.authority.permits(transientPreview.record.id) is true |
| [src/hooks/useDetailSelection.ts:144](../src/hooks/useDetailSelection.ts#L144) | Message/fragment | The shared game is no longer available. No library change was saved. | performDetailAction(); transientPreview?.authority &amp;&amp; !allRecords.has(transientPreview.record.id) &amp;&amp; !transientPreview.authority.permits(transientPreview.record.id) is true |
## src/hooks/useDiscoveryCatalog.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/hooks/useDiscoveryCatalog.ts:37](../src/hooks/useDiscoveryCatalog.ts#L37) | Message/fragment | The local catalog could not be loaded. Choose Reload local catalog to try again. | useDiscoveryCatalog(); !controller.signal.aborted is true |
## src/hooks/useDiscoveryUrl.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/hooks/useDiscoveryUrl.ts:55](../src/hooks/useDiscoveryUrl.ts#L55) | Message output | 'Your rating has not saved. Correct the highlighted field or retry before changing results.' | update(); hasPendingEdits() is true; !saved is true |
| [src/hooks/useDiscoveryUrl.ts:55](../src/hooks/useDiscoveryUrl.ts#L55) | Message/fragment | Your rating has not saved. Correct the highlighted field or retry before changing results. | update(); hasPendingEdits() is true; !saved is true |
| [src/hooks/useDiscoveryUrl.ts:69](../src/hooks/useDiscoveryUrl.ts#L69) | Message output | 'Your edit could not be saved. Keep these results open and retry.' | update(); operation rejected or threw; isCurrent() is true |
| [src/hooks/useDiscoveryUrl.ts:69](../src/hooks/useDiscoveryUrl.ts#L69) | Message/fragment | Your edit could not be saved. Keep these results open and retry. | update(); operation rejected or threw; isCurrent() is true |
## src/hooks/useGuardedNavigation.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/hooks/useGuardedNavigation.ts:67](../src/hooks/useGuardedNavigation.ts#L67) | Message output | 'Finish or correct the open rating or note before leaving this page.' | guard(); saved is false |
| [src/hooks/useGuardedNavigation.ts:67](../src/hooks/useGuardedNavigation.ts#L67) | Message/fragment | Finish or correct the open rating or note before leaving this page. | guard(); saved is false |
| [src/hooks/useGuardedNavigation.ts:73](../src/hooks/useGuardedNavigation.ts#L73) | Message output | 'Your edit could not be saved. Keep this page open and retry.' | guard(); operation rejected or threw; isCurrent() is true |
| [src/hooks/useGuardedNavigation.ts:73](../src/hooks/useGuardedNavigation.ts#L73) | Message/fragment | Your edit could not be saved. Keep this page open and retry. | guard(); operation rejected or threw; isCurrent() is true |
## src/hooks/useLatest.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/hooks/useLatest.ts:59](../src/hooks/useLatest.ts#L59) | Error/validation | A bound handler ran before its first commit. | useBoundHandlers(); !current is true |
## src/hooks/useLibrary.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/hooks/useLibrary.ts:28](../src/hooks/useLibrary.ts#L28) | Message/fragment | The device library could not be saved. | describeError(); error instanceof Error is false |
| [src/hooks/useLibrary.ts:131](../src/hooks/useLibrary.ts#L131) | Message/fragment | Another-tab refresh failed. Your current view is retained. ${describeError(error)} | refresh(); !canceled &amp;&amp; sequence === loadSequence.current is true |
| [src/hooks/useLibrary.ts:177](../src/hooks/useLibrary.ts#L177) | Error/validation | Your device library is still opening. Please try again in a moment. | perform(); previous.status === 'loading' is true |
## src/hooks/useLibrarySave.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/hooks/useLibrarySave.ts:28](../src/hooks/useLibrarySave.ts#L28) | Message output | 'Wait for the account library to finish opening before changing saved data.' | useLibrarySave(); opening is true |
| [src/hooks/useLibrarySave.ts:28](../src/hooks/useLibrarySave.ts#L28) | Message/fragment | Wait for the account library to finish opening before changing saved data. | useLibrarySave(); opening is true |
| [src/hooks/useLibrarySave.ts:34](../src/hooks/useLibrarySave.ts#L34) | Message output | &#96;${feedback.message ?? actionMessage(action)}${status === 'temporary' ? ' This tab only: export a backup to keep it.' : ''}&#96; | useLibrarySave(); success &amp;&amp; activeScope.current === scope &amp;&amp; announce is true |
| [src/hooks/useLibrarySave.ts:35](../src/hooks/useLibrarySave.ts#L35) | Message/fragment | ${feedback.message ?? actionMessage(action)}${status === 'temporary' ? ' This tab only: export a backup to keep it.' : ''} | useLibrarySave(); success &amp;&amp; activeScope.current === scope &amp;&amp; announce is true |
## src/hooks/useOnlineState.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/hooks/useOnlineState.ts:41](../src/hooks/useOnlineState.ts#L41) | Message/fragment | The remembered account could not be checked. | reportHintError(); cause === null is false; cause instanceof Error is false |
| [src/hooks/useOnlineState.ts:54](../src/hooks/useOnlineState.ts#L54) | Message/fragment | Device only | libraryMode(); onlineOpening is false; online?.label ?? |
| [src/hooks/useOnlineState.ts:54](../src/hooks/useOnlineState.ts#L54) | Message/fragment | Opening account… | libraryMode(); onlineOpening is true |
## src/hooks/useShare.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/hooks/useShare.ts:10](../src/hooks/useShare.ts#L10) | Message/fragment | Private progress and list filters aren't included. | suffix(); privateFilter is true |
| [src/hooks/useShare.ts:15](../src/hooks/useShare.ts#L15) | Message output | &#96;Shared.${suffix}&#96; | share(); navigator.share is true |
| [src/hooks/useShare.ts:22](../src/hooks/useShare.ts#L22) | Error/validation | Clipboard unavailable | share(); !navigator.clipboard?.writeText is true |
| [src/hooks/useShare.ts:24](../src/hooks/useShare.ts#L24) | Message output | &#96;Link copied.${suffix}&#96; | share(); when its owning surface/operation is used |
| [src/hooks/useShare.ts:24](../src/hooks/useShare.ts#L24) | Message/fragment | Link copied.${suffix} | share(); when its owning surface/operation is used |
## src/hooks/useUrlState.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/hooks/useUrlState.ts:138](../src/hooks/useUrlState.ts#L138) | Error/validation | This profile handle is invalid. | openProfile(); !/^[a-z][a-z0-9_]{2,23}$/.test(handle) is true |
## src/lib/abort.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/abort.ts:2](../src/lib/abort.ts#L2) | Message/fragment | The operation was aborted. | abortReason(); signal.reason === undefined is true |
## src/lib/action-message.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/action-message.ts:25](../src/lib/action-message.ts#L25) | Message/fragment | ${value ? 'added to' : 'removed from'} Play later | change(); key === 'later' is true |
| [src/lib/action-message.ts:26](../src/lib/action-message.ts#L26) | Message/fragment | ${value ? 'marked' : 'no longer marked'} ${key} | change(); key === 'later' is false |
| [src/lib/action-message.ts:30](../src/lib/action-message.ts#L30) | Message/fragment | already there | unchanged(); key === 'later' is true; value is true |
| [src/lib/action-message.ts:31](../src/lib/action-message.ts#L31) | Message/fragment | already absent | unchanged(); key === 'later' is true; value is false |
| [src/lib/action-message.ts:33](../src/lib/action-message.ts#L33) | Message/fragment | already marked ${key} | unchanged(); key === 'later' is false; value is true |
| [src/lib/action-message.ts:34](../src/lib/action-message.ts#L34) | Message/fragment | not marked ${key} | unchanged(); key === 'later' is false; value is false |
| [src/lib/action-message.ts:37](../src/lib/action-message.ts#L37) | Message/fragment | ${title} is ${value ? 'already' : 'not'} in Play later. | progressMessage(); unique.length === 1 is true; !changed &amp;&amp; key === 'later' is true |
| [src/lib/action-message.ts:39](../src/lib/action-message.ts#L39) | Message/fragment | ${title} ${value ? 'marked' : 'is no longer marked'} ${key}. | progressMessage(); unique.length === 1 is true; key !== 'later' is true; changed is true |
| [src/lib/action-message.ts:39](../src/lib/action-message.ts#L39) | Message/fragment | ${title} is ${unchanged}. | progressMessage(); unique.length === 1 is true; key !== 'later' is true; changed is false |
| [src/lib/action-message.ts:53](../src/lib/action-message.ts#L53) | Message/fragment | ${title} ${before?.records[record.id] ? 'is already in' : 'added to'} My games. | actionMessage(); case 'add-records'; records.length === 1 is true |
| [src/lib/action-message.ts:55](../src/lib/action-message.ts#L55) | Message/fragment | My games updated. | actionMessage(); case 'add-records'; !before is true |
| [src/lib/action-message.ts:57](../src/lib/action-message.ts#L57) | Message/fragment | added to My games | actionMessage(); case 'add-records' |
| [src/lib/action-message.ts:57](../src/lib/action-message.ts#L57) | Message/fragment | already there | actionMessage(); case 'add-records' |
| [src/lib/action-message.ts:62](../src/lib/action-message.ts#L62) | Message/fragment | ${before.records[ids[0]!]!.title} removed from My games. | actionMessage(); case 'remove-records'; ids.length === 1 &amp;&amp; before?.records[ids[0]!] is true |
| [src/lib/action-message.ts:63](../src/lib/action-message.ts#L63) | Message/fragment | Selected games removed from your private library. The original 100 is unchanged. | actionMessage(); case 'remove-records' |
| [src/lib/action-message.ts:72](../src/lib/action-message.ts#L72) | Message/fragment | ${title} ${prior ? 'is already in' : 'added to'} your ranking${position ? &#96; at #${position}&#96; : ''}. | actionMessage(); case 'add-ranking'; records.length === 1 is true |
| [src/lib/action-message.ts:74](../src/lib/action-message.ts#L74) | Message/fragment | Ranking updated. | actionMessage(); case 'add-ranking'; !before is true |
| [src/lib/action-message.ts:79](../src/lib/action-message.ts#L79) | Message/fragment | added to your ranking | actionMessage(); case 'add-ranking' |
| [src/lib/action-message.ts:80](../src/lib/action-message.ts#L80) | Message/fragment | already there | actionMessage(); case 'add-ranking' |
| [src/lib/action-message.ts:86](../src/lib/action-message.ts#L86) | Message/fragment | ${before.records[ids[0]!]!.title} removed from your ranking. | actionMessage(); case 'remove-ranking'; ids.length === 1 &amp;&amp; before?.records[ids[0]!] is true |
| [src/lib/action-message.ts:87](../src/lib/action-message.ts#L87) | Message/fragment | Selected games removed from your ranking. | actionMessage(); case 'remove-ranking' |
| [src/lib/action-message.ts:91](../src/lib/action-message.ts#L91) | Message/fragment | ${title ? &#96;${title}: &#96; : ''}${action.list === 'queue' ? 'Play later' : 'Ranking'} order updated. | actionMessage(); case 'move-item' |
| [src/lib/action-message.ts:97](../src/lib/action-message.ts#L97) | Message/fragment | rating and note saved | saved(); case 'edit-ranking'; Object.hasOwn(action, 'note') is true; Object.hasOwn(action, 'score') is true |
| [src/lib/action-message.ts:98](../src/lib/action-message.ts#L98) | Message/fragment | note saved | saved(); case 'edit-ranking'; Object.hasOwn(action, 'note') is true; Object.hasOwn(action, 'score') is false |
| [src/lib/action-message.ts:99](../src/lib/action-message.ts#L99) | Message/fragment | rating saved | saved(); case 'edit-ranking'; Object.hasOwn(action, 'note') is false |
| [src/lib/action-message.ts:103](../src/lib/action-message.ts#L103) | Message/fragment | ${after?.records[action.record.id]?.title ?? action.record.title}: rating saved. | actionMessage(); case 'rate-game' |
| [src/lib/action-message.ts:106](../src/lib/action-message.ts#L106) | Message/fragment | ${after?.records[action.id]?.title ?? before?.records[action.id]?.title ?? 'This game'} now follows rating order. | actionMessage(); case 'use-rating-order'; action.id is true |
| [src/lib/action-message.ts:107](../src/lib/action-message.ts#L107) | Message/fragment | Ranking now follows your ratings. Fixed positions cleared. | actionMessage(); case 'use-rating-order'; action.id is false |
| [src/lib/action-message.ts:109](../src/lib/action-message.ts#L109) | Message/fragment | Visual preference saved. | actionMessage(); case 'set-motion' |
| [src/lib/action-message.ts:114](../src/lib/action-message.ts#L114) | Message/fragment | Play later updated. | actionMessage(); case 'set-progress'; before is false; action.key === 'later' is true |
| [src/lib/action-message.ts:115](../src/lib/action-message.ts#L115) | Message/fragment | Play history updated. | actionMessage(); case 'set-progress'; before is false; action.key === 'later' is false |
| [src/lib/action-message.ts:120](../src/lib/action-message.ts#L120) | Message/fragment | Play later updated. | actionMessage(); case 'toggle-progress'; before &amp;&amp; after is false; action.key === 'later' is true |
| [src/lib/action-message.ts:121](../src/lib/action-message.ts#L121) | Message/fragment | Play history updated. | actionMessage(); case 'toggle-progress'; before &amp;&amp; after is false; action.key === 'later' is false |
| [src/lib/action-message.ts:123](../src/lib/action-message.ts#L123) | Message/fragment | My games updated. | actionMessage(); when its owning surface/operation is used |
## src/lib/app-check-config.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/app-check-config.ts:21](../src/lib/app-check-config.ts#L21) | Message/fragment | App Check is enabled without a valid public reCAPTCHA v3 site key. | readAppCheckConfiguration(); !/^6L[A-Za-z0-9_-]{38}$/.test(siteKey) is true |
| [src/lib/app-check-config.ts:35](../src/lib/app-check-config.ts#L35) | Message/fragment | App Check needs ${source} in ${directive}. | appCheckCspProblems(); when its owning surface/operation is used |
## src/lib/app-commands.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/app-commands.ts:41](../src/lib/app-commands.ts#L41) | Message output | 'Finish or correct the open rating or note before changing accounts.' | enterAccount(); !saved is true |
| [src/lib/app-commands.ts:41](../src/lib/app-commands.ts#L41) | Message/fragment | Finish or correct the open rating or note before changing accounts. | enterAccount(); !saved is true |
| [src/lib/app-commands.ts:52](../src/lib/app-commands.ts#L52) | Message output | 'Your edit could not be saved. Keep this page open and retry.' | enterAccount(); operation rejected or threw; isCurrent() is true |
| [src/lib/app-commands.ts:52](../src/lib/app-commands.ts#L52) | Message/fragment | Your edit could not be saved. Keep this page open and retry. | enterAccount(); operation rejected or threw; isCurrent() is true |
| [src/lib/app-commands.ts:78](../src/lib/app-commands.ts#L78) | Message output | 'Wait for your account to finish opening before comparing.' | startComparison(); context.opening is true |
| [src/lib/app-commands.ts:78](../src/lib/app-commands.ts#L78) | Message/fragment | Wait for your account to finish opening before comparing. | startComparison(); context.opening is true |
| [src/lib/app-commands.ts:86](../src/lib/app-commands.ts#L86) | Message output | 'Verify your account before comparing with friends.' | startComparison(); !context.identity.verified is true |
| [src/lib/app-commands.ts:86](../src/lib/app-commands.ts#L86) | Message/fragment | Verify your account before comparing with friends. | startComparison(); !context.identity.verified is true |
| [src/lib/app-commands.ts:107](../src/lib/app-commands.ts#L107) | Message output | 'Correct the open edit before starting a comparison.' | startComparison(); !saved is true |
| [src/lib/app-commands.ts:107](../src/lib/app-commands.ts#L107) | Message/fragment | Correct the open edit before starting a comparison. | startComparison(); !saved is true |
| [src/lib/app-commands.ts:117](../src/lib/app-commands.ts#L117) | Message output | warning | startComparison(); warning is true |
| [src/lib/app-commands.ts:121](../src/lib/app-commands.ts#L121) | Message output | cause instanceof Error ? cause.message : 'The game comparison could not be opened.' | startComparison(); operation rejected or threw; isCurrent() is true; isModuleLoadFailure(cause) is false |
| [src/lib/app-commands.ts:121](../src/lib/app-commands.ts#L121) | Message/fragment | The game comparison could not be opened. | startComparison(); operation rejected or threw; isCurrent() is true; isModuleLoadFailure(cause) is false; cause instanceof Error is false |
| [src/lib/app-commands.ts:134](../src/lib/app-commands.ts#L134) | Message output | 'Correct the open edit before changing online lookup.' | enableOnlineDetails(); !(await flushPendingEdits()) is true |
| [src/lib/app-commands.ts:134](../src/lib/app-commands.ts#L134) | Message/fragment | Correct the open edit before changing online lookup. | enableOnlineDetails(); !(await flushPendingEdits()) is true |
| [src/lib/app-commands.ts:146](../src/lib/app-commands.ts#L146) | Message output | 'Your edit could not be saved. Keep this game open and retry.' | enableOnlineDetails(); operation rejected or threw; currentScopeAndNavigation() is true |
| [src/lib/app-commands.ts:146](../src/lib/app-commands.ts#L146) | Message/fragment | Your edit could not be saved. Keep this game open and retry. | enableOnlineDetails(); operation rejected or threw; currentScopeAndNavigation() is true |
## src/lib/author.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/author.ts:25](../src/lib/author.ts#L25) | Message/fragment | ${shortName} on GitHub (opens in a new tab) | authorLinks(); when its owning surface/operation is used |
| [src/lib/author.ts:26](../src/lib/author.ts#L26) | Message/fragment | ${shortName} on LinkedIn (opens in a new tab) | authorLinks(); when its owning surface/operation is used |
| [src/lib/author.ts:27](../src/lib/author.ts#L27) | Message/fragment | ${shortName} on Telegram, ${telegramHandle} (opens in a new tab) | authorLinks(); when its owning surface/operation is used |
| [src/lib/author.ts:28](../src/lib/author.ts#L28) | Message/fragment | Email ${shortName} at ${email} | authorLinks(); when its owning surface/operation is used |
| [src/lib/author.ts:32](../src/lib/author.ts#L32) | Message/fragment | Unavailable | authorRatingText(); !rating is true |
## src/lib/avatar.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/avatar.ts:14](../src/lib/avatar.ts#L14) | Message/fragment | Lime | AVATAR_PALETTES(); when its owning surface/operation is used |
| [src/lib/avatar.ts:15](../src/lib/avatar.ts#L15) | Message/fragment | Moss | AVATAR_PALETTES(); when its owning surface/operation is used |
| [src/lib/avatar.ts:16](../src/lib/avatar.ts#L16) | Message/fragment | Clay | AVATAR_PALETTES(); when its owning surface/operation is used |
| [src/lib/avatar.ts:17](../src/lib/avatar.ts#L17) | Message/fragment | Sky | AVATAR_PALETTES(); when its owning surface/operation is used |
| [src/lib/avatar.ts:18](../src/lib/avatar.ts#L18) | Message/fragment | Lilac | AVATAR_PALETTES(); when its owning surface/operation is used |
| [src/lib/avatar.ts:101](../src/lib/avatar.ts#L101) | Error/validation | Invalid avatar descriptor: expected only version 1, a 32-character lowercase hex seed, and a supported palette. | parseAvatarDescriptor(); !isAvatarDescriptor(value) is true |
| [src/lib/avatar.ts:109](../src/lib/avatar.ts#L109) | Error/validation | Unsupported avatar palette. | createAvatarDescriptor(); !isAvatarPalette(palette) is true |
| [src/lib/avatar.ts:111](../src/lib/avatar.ts#L111) | Error/validation | Secure randomness is unavailable. Open Play 100 in a secure browser context to create avatars. | createAvatarDescriptor(); !globalThis.crypto?.getRandomValues is true |
| [src/lib/avatar.ts:176](../src/lib/avatar.ts#L176) | Error/validation | Could not create six different avatar choices. Try Shuffle again. | createAvatarCandidates(); candidates.length !== candidateCount is true |
## src/lib/backup-restore.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/backup-restore.ts:20](../src/lib/backup-restore.ts#L20) | Message/fragment | This backup file exceeds the ${formatBackupLimit(cap)} import limit. No data was changed. | backupFileSizeError(); size &gt; cap is true |
| [src/lib/backup-restore.ts:30](../src/lib/backup-restore.ts#L30) | Message/fragment | This backup holds a library ${formatBackupBytes(bytes - budget)} over the ${formatBackupLimit(budget)} backup limit. No data was changed. | readLibraryBackup(); bytes &gt; budget is true |
| [src/lib/backup-restore.ts:39](../src/lib/backup-restore.ts#L39) | Message/fragment | ${games} ${games === 1 ? 'game' : 'games'}, ${state.queueOrder.length} in Play later, ${state.ranking.length} ranked. | describeLibraryBackup(); when its owning surface/operation is used |
| [src/lib/backup-restore.ts:43](../src/lib/backup-restore.ts#L43) | Message/fragment | The backup | input(); when its owning surface/operation is used |
| [src/lib/backup-restore.ts:45](../src/lib/backup-restore.ts#L45) | Message/fragment | this is not a supported Play 100 backup. | parseLibraryBackup(); input.app !== 'Play 100' &#124;&#124; (input.formatVersion !== 2 &amp;&amp; input.formatVersion !== 3) is true |
| [src/lib/backup-restore.ts:47](../src/lib/backup-restore.ts#L47) | Message/fragment | The backup library | library(); when its owning surface/operation is used |
| [src/lib/backup-restore.ts:48](../src/lib/backup-restore.ts#L48) | Message/fragment | the backup and library versions do not agree. | parseLibraryBackup(); library.version !== input.formatVersion is true |
| [src/lib/backup-restore.ts:56](../src/lib/backup-restore.ts#L56) | Message/fragment | the backup export date must be an ISO timestamp. | parseLibraryBackup(); typeof input.exportedAt !== 'string' &#124;&#124; !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z&#124;[+-]\d{2}:\d{2})$/.test(input.exportedAt) &#124;&#124; !Number.isFinite(Date.parse(input.exportedAt)) &#124;&#124; new Date(&#96;${input.exportedAt.slice(0, 10)}T00:00:00.000Z&#96;).toISOString().slice(0, 10) !== input.exportedAt.slice(0, 10) is true |
## src/lib/catalog-client.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/catalog-client.ts:20](../src/lib/catalog-client.ts#L20) | Error/validation | Use a search of up to 80 characters and a valid catalog page. | fetchCatalogPage(); !['wikidata', 'freetogame'].includes(source) &#124;&#124; query.length &gt; 80 &#124;&#124; [...query].some((character) =&gt; character.charCodeAt(0) &lt; 32 &#124;&#124; character.charCodeAt(0) === 127) &#124;&#124; !Number.isSafeInteger(offset) &#124;&#124; offset &lt; 0 &#124;&#124; offset &gt; 10_000 is true |
| [src/lib/catalog-client.ts:31](../src/lib/catalog-client.ts#L31) | Error/validation | The catalog returned results for a different search or page. Please try again. | fetchCatalogPage(); page.source !== source &#124;&#124; page.query !== query.trim() &#124;&#124; page.offset !== offset is true |
## src/lib/catalog-enrichment-session.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/catalog-enrichment-session.ts:29](../src/lib/catalog-enrichment-session.ts#L29) | Error/validation | This record does not support public detail lookup. | fetchCatalogEnrichment(); !enrichmentIdentity(id) is true |
| [src/lib/catalog-enrichment-session.ts:79](../src/lib/catalog-enrichment-session.ts#L79) | Message/fragment | A catalog source is receiving too many requests. Wait a moment before retrying. | peek(); this.cooldown &gt; this.now() is true |
| [src/lib/catalog-enrichment-session.ts:124](../src/lib/catalog-enrichment-session.ts#L124) | Message/fragment | Public game details could not be loaded. Existing details are unchanged. | start(); error instanceof Error is false |
## src/lib/catalog-enrichment.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/catalog-enrichment.ts:81](../src/lib/catalog-enrichment.ts#L81) | Error/validation | The public game details returned an invalid response. Please retry. | invalid(); when its owning surface/operation is used |
| [src/lib/catalog-enrichment.ts:226](../src/lib/catalog-enrichment.ts#L226) | Message/fragment | Public domain | expected(); cc is false; license === 'CC0' is false |
## src/lib/catalog-search-session.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/catalog-search-session.ts:74](../src/lib/catalog-search-session.ts#L74) | Message/fragment | This catalog is receiving too many requests. Wait a moment before retrying. | load(); (this.cooldowns.get(source) ?? 0) &gt; Date.now() is true |
| [src/lib/catalog-search-session.ts:112](../src/lib/catalog-search-session.ts#L112) | Message/fragment | The catalog could not be reached. | load(); operation rejected or threw; error instanceof Error is false |
## src/lib/catalog-transport.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/catalog-transport.ts:20](../src/lib/catalog-transport.ts#L20) | Message/fragment | the catalog | fetchCatalogJson(); when its owning surface/operation is used |
| [src/lib/catalog-transport.ts:32](../src/lib/catalog-transport.ts#L32) | Error/validation | The catalog took too long to reply. Try again. | timeout(); when its owning surface/operation is used |
| [src/lib/catalog-transport.ts:45](../src/lib/catalog-transport.ts#L45) | Error/validation | The public catalog is temporarily unavailable. | httpFailure(); response.ok is false |
| [src/lib/catalog-transport.ts:52](../src/lib/catalog-transport.ts#L52) | Error/validation | The catalog response is too large. Try a narrower search. | read(); Number(response.headers.get('content-length')) &gt; maxBytes is true |
| [src/lib/catalog-transport.ts:54](../src/lib/catalog-transport.ts#L54) | Error/validation | The catalog returned no readable data. | read(); !response.body is true |
| [src/lib/catalog-transport.ts:65](../src/lib/catalog-transport.ts#L65) | Error/validation | The catalog response is too large. Try a narrower search. | read(); size &gt; maxBytes is true |
| [src/lib/catalog-transport.ts:83](../src/lib/catalog-transport.ts#L83) | Error/validation | The catalog service returned an unreadable response. Please try again later. | read(); operation rejected or threw |
| [src/lib/catalog-transport.ts:113](../src/lib/catalog-transport.ts#L113) | Error/validation | Couldn't reach ${catalogName}. Check your connection and try again. | fetchCatalogJson(); operation rejected or threw |
## src/lib/catalog-types.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/catalog-types.ts:18](../src/lib/catalog-types.ts#L18) | Error/validation | The catalog returned an unreadable response. | parseCatalogPage(); typeof value !== 'object' &#124;&#124; value === null is true |
| [src/lib/catalog-types.ts:42](../src/lib/catalog-types.ts#L42) | Error/validation | The catalog returned invalid pagination or source information. | parseCatalogPage(); (row.source !== 'wikidata' &amp;&amp; row.source !== 'freetogame') &#124;&#124; typeof row.query !== 'string' &#124;&#124; row.query.length &gt; 80 &#124;&#124; !isUnknownArray(row.items) &#124;&#124; row.items.length &gt; 20 &#124;&#124; typeof row.total !== 'number' &#124;&#124; !Number.isSafeInteger(row.total) &#124;&#124; row.total &lt; 0 &#124;&#124; typeof row.offset !== 'number' &#124;&#124; !Number.isSafeInteger(row.offset) &#124;&#124; row.offset &lt; 0 &#124;&#124; row.offset &gt; 10_000 &#124;&#124; (row.nextOffset !== null &amp;&amp; (typeof row.nextOffset !== 'number' &#124;&#124; !Number.isSafeInteger(row.nextOffset) &#124;&#124; row.nextOffset &lt;= row.offset &#124;&#124; row.nextOffset &gt; 10_000)) &#124;&#124; !Array.isArray(row.notices) &#124;&#124; row.notices.length &gt; 10 &#124;&#124; !row.notices.every((notice): notice is string =&gt; typeof notice === 'string' &amp;&amp; notice.length &lt;= 1000) is true |
| [src/lib/catalog-types.ts:54](../src/lib/catalog-types.ts#L54) | Error/validation | The catalog returned invalid or duplicate games. | parseCatalogPage(); typeof item !== 'object' &#124;&#124; item === null &#124;&#124; !('id' in item) &#124;&#124; typeof item.id !== 'string' &#124;&#124; !('source' in item) &#124;&#124; item.source !== row.source &#124;&#124; Object.hasOwn(recordMap, item.id) is true |
## src/lib/chunk-recovery.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/chunk-recovery.ts:7](../src/lib/chunk-recovery.ts#L7) | Message/fragment | An app module did not load. | module-defined copy; when its owning surface/operation is used |
| [src/lib/chunk-recovery.ts:8](../src/lib/chunk-recovery.ts#L8) | Message/fragment | ModuleLoadFailure | module-defined copy; when its owning surface/operation is used |
| [src/lib/chunk-recovery.ts:16](../src/lib/chunk-recovery.ts#L16) | Message/fragment | You're offline. Reconnect, then try again. | offlineRecoveryMessage(); when its owning surface/operation is used |
| [src/lib/chunk-recovery.ts:17](../src/lib/chunk-recovery.ts#L17) | Message/fragment | Play 100 didn't respond. Try again in a moment. | unavailableRecoveryMessage(); when its owning surface/operation is used |
| [src/lib/chunk-recovery.ts:19](../src/lib/chunk-recovery.ts#L19) | Message/fragment | Finish or correct unsaved work and wait for saving to finish before reloading. Nothing was reloaded. | unsavedRecoveryMessage(); when its owning surface/operation is used |
## src/lib/client-error-reporter.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/client-error-reporter.ts:100](../src/lib/client-error-reporter.ts#L100) | Message output | name, area, pathname | reportClientErrorCount(); when its owning surface/operation is used |
## src/lib/client-error-schema.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/client-error-schema.ts:12](../src/lib/client-error-schema.ts#L12) | Message/fragment | ModuleLoadFailure | CLIENT_ERROR_CLASSES(); when its owning surface/operation is used |
| [src/lib/client-error-schema.ts:52](../src/lib/client-error-schema.ts#L52) | Error/validation | Invalid client error counts. | clientErrorCounts(); !body &#124;&#124; Object.keys(body).sort().join(',') !== 'buildVersion,counts' &#124;&#124; !isBuildFingerprint(body.buildVersion) &#124;&#124; !Array.isArray(body.counts) &#124;&#124; !body.counts.length &#124;&#124; body.counts.length &gt; MAX_CLIENT_ERRORS is true |
| [src/lib/client-error-schema.ts:71](../src/lib/client-error-schema.ts#L71) | Error/validation | Invalid client error count. | clientErrorCounts(); !row &#124;&#124; Object.keys(row).sort().join(',') !== 'area,count,errorClass,route' &#124;&#124; !errorClass &#124;&#124; !area &#124;&#124; !route &#124;&#124; typeof row.count !== 'number' &#124;&#124; !Number.isSafeInteger(row.count) &#124;&#124; row.count &lt; 1 &#124;&#124; (total += row.count) &gt; MAX_CLIENT_ERRORS is true |
## src/lib/cloud-types.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/cloud-types.ts:21](../src/lib/cloud-types.ts#L21) | Error/validation | This account has an unsupported identity. No local data was changed. | accountScope(); !/^[A-Za-z0-9_-]{1,128}$/.test(uid) is true |
| [src/lib/cloud-types.ts:23](../src/lib/cloud-types.ts#L23) | Error/validation | This Firebase project is not an approved Play 100 storage scope. | accountScope(); project !== CLOUD_PROJECT &amp;&amp; project !== 'demo-play100' is true |
| [src/lib/cloud-types.ts:28](../src/lib/cloud-types.ts#L28) | Error/validation | Device-only data does not have an account identity. | scopeUid(); scope === 'guest' is true |
| [src/lib/cloud-types.ts:31](../src/lib/cloud-types.ts#L31) | Error/validation | The account storage scope is invalid. | scopeUid(); !uid &#124;&#124; !project &#124;&#124; accountScope(uid, project) !== scope is true |
| [src/lib/cloud-types.ts:96](../src/lib/cloud-types.ts#L96) | Message/fragment | Device only | SYNC_LABELS(); when its owning surface/operation is used |
| [src/lib/cloud-types.ts:97](../src/lib/cloud-types.ts#L97) | Message/fragment | Opening online library… | SYNC_LABELS(); when its owning surface/operation is used |
| [src/lib/cloud-types.ts:98](../src/lib/cloud-types.ts#L98) | Message/fragment | Saving online… | SYNC_LABELS(); when its owning surface/operation is used |
| [src/lib/cloud-types.ts:99](../src/lib/cloud-types.ts#L99) | Message/fragment | Saved online | SYNC_LABELS(); when its owning surface/operation is used |
| [src/lib/cloud-types.ts:100](../src/lib/cloud-types.ts#L100) | Message/fragment | Offline · saved here | SYNC_LABELS(); when its owning surface/operation is used |
| [src/lib/cloud-types.ts:101](../src/lib/cloud-types.ts#L101) | Message/fragment | Needs a choice | SYNC_LABELS(); when its owning surface/operation is used |
| [src/lib/cloud-types.ts:102](../src/lib/cloud-types.ts#L102) | Message/fragment | Online saving paused | SYNC_LABELS(); when its owning surface/operation is used |
| [src/lib/cloud-types.ts:103](../src/lib/cloud-types.ts#L103) | Message/fragment | Online saving paused | SYNC_LABELS(); when its owning surface/operation is used |
| [src/lib/cloud-types.ts:104](../src/lib/cloud-types.ts#L104) | Message/fragment | Saved here · online pending | SYNC_LABELS(); when its owning surface/operation is used |
| [src/lib/cloud-types.ts:105](../src/lib/cloud-types.ts#L105) | Message/fragment | Retrying automatically… | SYNC_LABELS(); when its owning surface/operation is used |
| [src/lib/cloud-types.ts:106](../src/lib/cloud-types.ts#L106) | Message/fragment | Waiting for the online service… | SYNC_LABELS(); when its owning surface/operation is used |
| [src/lib/cloud-types.ts:119](../src/lib/cloud-types.ts#L119) | Error/validation | A ranked game is missing its metadata. Your online copy has not been changed. | creatorRanks(); !record is true |
## src/lib/collection.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/collection.ts:14](../src/lib/collection.ts#L14) | Message/fragment | Metacritic | criticColumns(); when its owning surface/operation is used |
| [src/lib/collection.ts:15](../src/lib/collection.ts#L15) | Message/fragment | Metacritic PC | criticColumns(); when its owning surface/operation is used |
| [src/lib/collection.ts:16](../src/lib/collection.ts#L16) | Message/fragment | IGN | criticColumns(); when its owning surface/operation is used |
| [src/lib/collection.ts:17](../src/lib/collection.ts#L17) | Message/fragment | GameSpot | criticColumns(); when its owning surface/operation is used |
| [src/lib/collection.ts:18](../src/lib/collection.ts#L18) | Message/fragment | PC Gamer | criticColumns(); when its owning surface/operation is used |
| [src/lib/collection.ts:46](../src/lib/collection.ts#L46) | Error/validation | The original author rating is invalid for entry ${rank}. | readAuthorRating(); !isRecord(value) &#124;&#124; typeof value.value !== 'number' &#124;&#124; !Number.isFinite(value.value) &#124;&#124; value.value &lt; 0 &#124;&#124; value.value &gt; 10 &#124;&#124; !hasText(value.rawValue) &#124;&#124; value.rawValue.length &gt; 150 &#124;&#124; !hasText(value.display) &#124;&#124; value.display.length &gt; 150 &#124;&#124; value.sourceCell !== &#96;L${rank &lt;= 50 ? rank + 4 : rank + 5}&#96; &#124;&#124; !hasText(value.numberFormat) &#124;&#124; value.numberFormat.length &gt; 100 &#124;&#124; (value.sourceType !== 'number' &amp;&amp; value.sourceType !== 'text') &#124;&#124; Number.parseFloat(value.rawValue) !== value.value is true |
| [src/lib/collection.ts:59](../src/lib/collection.ts#L59) | Error/validation | The collection file has an unsupported format. | parseCollection(); !isRecord(value) &#124;&#124; value.schemaVersion !== 1 &#124;&#124; !isRecord(value.collection) &#124;&#124; !Array.isArray(value.games) is true |
| [src/lib/collection.ts:69](../src/lib/collection.ts#L69) | Error/validation | The collection source information is incomplete. | parseCollection(); !hasText(metadata.title) &#124;&#124; !hasText(metadata.sourceFile) &#124;&#124; !hasText(metadata.scope) &#124;&#124; !hasText(metadata.rankingBasis) &#124;&#124; metadata.criticScoresAreSnapshot !== true is true |
| [src/lib/collection.ts:71](../src/lib/collection.ts#L71) | Error/validation | The collection must contain exactly 100 games. | parseCollection(); value.games.length !== 100 is true |
| [src/lib/collection.ts:75](../src/lib/collection.ts#L75) | Error/validation | Collection entry ${index + 1} is unreadable. | games(); !isRecord(row) is true |
| [src/lib/collection.ts:79](../src/lib/collection.ts#L79) | Error/validation | The original author rating is missing for entry ${index + 1}. | games(); metadata.authorRatingsAreOriginal === true &amp;&amp; !authorRating is true |
| [src/lib/collection.ts:100](../src/lib/collection.ts#L100) | Error/validation | Collection entry ${index + 1} has invalid or inconsistent information. | games(); row.rank !== index + 1 &#124;&#124; !hasText(row.slug) &#124;&#124; !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) &#124;&#124; slugs.has(row.slug) &#124;&#124; !hasText(row.title) &#124;&#124; !hasText(row.studio) &#124;&#124; !hasText(row.genre) &#124;&#124; !hasText(row.rationale) &#124;&#124; !Number.isInteger(row.year) &#124;&#124; typeof row.year !== 'number' &#124;&#124; row.year &lt; 1970 &#124;&#124; row.year &gt; 2100 &#124;&#124; !Array.isArray(row.genreTags) &#124;&#124; !row.genreTags.every(hasText) &#124;&#124; row.tier !== tier &#124;&#124; (row.sourceNote !== null &amp;&amp; !hasText(row.sourceNote)) &#124;&#124; typeof row.rankIndex !== 'number' &#124;&#124; Math.abs(row.rankIndex - (10 - (index * 3) / 99)) &gt; 0.0001 is true |
| [src/lib/collection.ts:102](../src/lib/collection.ts#L102) | Error/validation | Critic data is missing for entry ${index + 1}. | games(); !isRecord(row.critics) is true |
| [src/lib/collection.ts:110](../src/lib/collection.ts#L110) | Error/validation | The ${key} score is invalid for entry ${index + 1}. | readScore(); score !== null &amp;&amp; (typeof score !== 'number' &#124;&#124; !Number.isFinite(score) &#124;&#124; score &lt; 0 &#124;&#124; score &gt; SCORE_SCALES[key]) is true |
| [src/lib/collection.ts:126](../src/lib/collection.ts#L126) | Error/validation | The score average is inconsistent for entry ${index + 1}. | games(); (average === null &amp;&amp; row.criticAverage !== null) &#124;&#124; (average !== null &amp;&amp; (typeof row.criticAverage !== 'number' &#124;&#124; Math.abs(row.criticAverage - average) &gt; 0.001)) is true |
| [src/lib/collection.ts:132](../src/lib/collection.ts#L132) | Message/fragment | User-provided workbook | games(); row.artwork !== null is true; !isRecord(row.artwork) &#124;&#124; |
| [src/lib/collection.ts:136](../src/lib/collection.ts#L136) | Error/validation | The artwork reference is invalid for entry ${index + 1}. | games(); row.artwork !== null is true; !isRecord(row.artwork) &#124;&#124; row.artwork.source !== 'User-provided workbook' &#124;&#124; typeof row.artwork.file !== 'string' &#124;&#124; !/^assets\/[a-z0-9-]+\.(?:jpe?g&#124;png&#124;webp)$/i.test(row.artwork.file) is true |
| [src/lib/collection.ts:138](../src/lib/collection.ts#L138) | Message/fragment | User-provided workbook | games(); row.artwork !== null is true |
| [src/lib/collection.ts:237](../src/lib/collection.ts#L237) | Message/fragment | Unavailable | formatAverage(); score === null is true |
## src/lib/community.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/community.ts:84](../src/lib/community.ts#L84) | Error/validation | Reports require account IDs containing only letters, numbers or hyphens. No report was sent. | reportDocumentId(); ![targetUid, reporterUid].every((uid) =&gt; /^[A-Za-z0-9-]{1,128}$/.test(uid)) is true |
| [src/lib/community.ts:92](../src/lib/community.ts#L92) | Error/validation | System and creator handle prefixes are reserved. Choose another handle. | normalizeHandle(); RESERVED_HANDLE_PREFIX.test(handle) is true |
| [src/lib/community.ts:98](../src/lib/community.ts#L98) | Error/validation | Choose 3–24 letters, numbers or underscores, starting with a letter. | parseHandle(); !isValidHandle(handle) is true |
| [src/lib/community.ts:122](../src/lib/community.ts#L122) | Error/validation | A ranked game is missing its metadata. | projectOwnRanking(); !saved is true |
| [src/lib/community.ts:124](../src/lib/community.ts#L124) | Error/validation | This ranking references an unknown original game. | projectOwnRanking(); saved.source === 'collection' &amp;&amp; !trusted is true |
| [src/lib/community.ts:145](../src/lib/community.ts#L145) | Error/validation | Choose between 1 and 200 ranked games. Nothing is automatically left out. | projectPublicRanking(); !selected.size &#124;&#124; selected.size &gt; PUBLIC_LIMIT is true |
| [src/lib/community.ts:151](../src/lib/community.ts#L151) | Error/validation | A selected game is missing its metadata. | entries(); !saved is true |
| [src/lib/community.ts:155](../src/lib/community.ts#L155) | Error/validation | A selected entry claims an unknown original collection game. Correct that record before publishing. | entries(); saved.source === 'collection' &amp;&amp; !trusted is true |
| [src/lib/community.ts:170](../src/lib/community.ts#L170) | Error/validation | Your ranking changed while selecting games. Review the selection before publishing. | projectPublicRanking(); entries.length !== selected.size is true |
| [src/lib/community.ts:175](../src/lib/community.ts#L175) | Error/validation | A published game is unreadable. | parsePublicEntry(); !value &#124;&#124; typeof value !== 'object' &#124;&#124; Array.isArray(value) is true |
| [src/lib/community.ts:186](../src/lib/community.ts#L186) | Error/validation | A published game contains unsupported fields or a rating outside 0-10. | parsePublicEntry(); Object.keys(row).sort().join() !== 'id,position,score,source,sourceId,sourceUrl,title,year' &#124;&#124; typeof row.position !== 'number' &#124;&#124; !Number.isInteger(row.position) &#124;&#124; row.position &lt; 1 &#124;&#124; row.position &gt; PUBLIC_LIMIT &#124;&#124; (row.score !== null &amp;&amp; (typeof row.score !== 'number' &#124;&#124; !Number.isFinite(row.score) &#124;&#124; row.score &lt; 0 &#124;&#124; row.score &gt; 10)) is true |
| [src/lib/community.ts:208](../src/lib/community.ts#L208) | Error/validation | A published game has an unsupported identity or source link. | parsePublicEntry(); !record &#124;&#124; (record.source !== 'collection' &amp;&amp; record.id !== &#96;${record.source}:${record.sourceId}&#96;) &#124;&#124; (record.source === 'wikidata' &amp;&amp; !/^Q[1-9]\d*$/.test(record.sourceId)) &#124;&#124; ((record.source === 'freetogame' &#124;&#124; record.source === 'steam') &amp;&amp; !/^[1-9]\d*$/.test(record.sourceId)) &#124;&#124; record.sourceUrl !== sourceUrl(record) is true |
| [src/lib/community.ts:225](../src/lib/community.ts#L225) | Error/validation | A selected game has a source link longer than 2048 characters. Correct its link or leave it out before publishing or sharing. Your private library is unchanged. | parsePublicationEntry(); entry.sourceUrl &amp;&amp; entry.sourceUrl.length &gt; PUBLIC_SOURCE_URL_LIMIT is true |
| [src/lib/community.ts:230](../src/lib/community.ts#L230) | Message/fragment | A selected game title | game(); hasControlOrFormat(entry.title) is true; shown is false |
| [src/lib/community.ts:230](../src/lib/community.ts#L230) | Message/fragment | The title of "${shown}" | game(); hasControlOrFormat(entry.title) is true; shown is true |
| [src/lib/community.ts:232](../src/lib/community.ts#L232) | Error/validation | ${game} has invisible, control or text-direction characters, so it cannot be published or shared. Leave that game out of your selection. Your private library is unchanged. | parsePublicationEntry(); hasControlOrFormat(entry.title) is true |
| [src/lib/community.ts:243](../src/lib/community.ts#L243) | Error/validation | This list references an unknown original game. Reload the collection before saving it. | recordFromPublic(); entry.source === 'collection' is true |
## src/lib/compare-tray.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/compare-tray.ts:24](../src/lib/compare-tray.ts#L24) | Error/validation | The Compare tray account scope is invalid. | compareTrayStorageKey(); scope !== 'guest' &amp;&amp; !/^account:(?:play100-online-48823b32&#124;demo-play100):[A-Za-z0-9_-]{1,128}$/.test(scope) is true |
| [src/lib/compare-tray.ts:31](../src/lib/compare-tray.ts#L31) | Error/validation | Pin up to six games for comparison. | records(); !Array.isArray(value) &#124;&#124; value.length &gt; COMPARE_TRAY_LIMIT is true |
| [src/lib/compare-tray.ts:37](../src/lib/compare-tray.ts#L37) | Error/validation | Pinned games must contain plain data records. | records(); !slot &#124;&#124; !('value' in slot) is true |
| [src/lib/compare-tray.ts:39](../src/lib/compare-tray.ts#L39) | Error/validation | A pinned game is invalid. | records(); typeof item !== 'object' &#124;&#124; item === null is true |
| [src/lib/compare-tray.ts:41](../src/lib/compare-tray.ts#L41) | Error/validation | Pinned games must have unique game IDs. | records(); typeof id !== 'string' &#124;&#124; Object.hasOwn(input, id) is true |
| [src/lib/compare-tray.ts:53](../src/lib/compare-tray.ts#L53) | Error/validation | A pinned game does not match its exact source ID. | records(); !record &#124;&#124; record.id !== (record.source === 'collection' ? record.sourceId : &#96;${record.source}:${record.sourceId}&#96;) is true |
| [src/lib/compare-tray.ts:56](../src/lib/compare-tray.ts#L56) | Error/validation | The pinned game source link is too long. | records(); record.sourceUrl !== null &amp;&amp; record.sourceUrl.length &gt; 2_048 is true |
| [src/lib/compare-tray.ts:65](../src/lib/compare-tray.ts#L65) | Error/validation | These game references exceed the Compare tray storage limit. | serializeCompareTray(); encoder.encode(raw).byteLength &gt; COMPARE_TRAY_MAX_BYTES is true |
| [src/lib/compare-tray.ts:72](../src/lib/compare-tray.ts#L72) | Error/validation | The saved Compare tray exceeds its storage limit. | parseCompareTray(); raw.length &gt; COMPARE_TRAY_MAX_BYTES &#124;&#124; encoder.encode(raw).byteLength &gt; COMPARE_TRAY_MAX_BYTES is true |
| [src/lib/compare-tray.ts:76](../src/lib/compare-tray.ts#L76) | Error/validation | The saved Compare tray is invalid. | parseCompareTray(); typeof value !== 'object' &#124;&#124; value === null &#124;&#124; Array.isArray(value) is true |
| [src/lib/compare-tray.ts:84](../src/lib/compare-tray.ts#L84) | Error/validation | The saved Compare tray has an unsupported version or account scope. | parseCompareTray(); Object.keys(entry).length !== 3 &#124;&#124; entry.version !== 1 &#124;&#124; entry.scope !== scope &#124;&#124; !Object.hasOwn(entry, 'items') is true |
| [src/lib/compare-tray.ts:90](../src/lib/compare-tray.ts#L90) | Message/fragment | The game could not be pinned. | message(); error instanceof Error is false |
| [src/lib/compare-tray.ts:124](../src/lib/compare-tray.ts#L124) | Message/fragment | Compare tray storage is unavailable. Pins stay in this tab only; your saved tray has not been replaced. | reload(); operation rejected or threw |
| [src/lib/compare-tray.ts:138](../src/lib/compare-tray.ts#L138) | Message/fragment | The saved Compare tray could not be read. It has been left untouched. New pins are temporary; use Reset saved tray to replace it. | reload(); operation rejected or threw |
| [src/lib/compare-tray.ts:147](../src/lib/compare-tray.ts#L147) | Message output | error | save(); operation rejected or threw |
| [src/lib/compare-tray.ts:160](../src/lib/compare-tray.ts#L160) | Message/fragment | Compare tray storage is unavailable. These pins stay in this tab only; retry by pinning again or keep this tab open. | save(); !protectedStorage is true; operation rejected or threw |
| [src/lib/compare-tray.ts:191](../src/lib/compare-tray.ts#L191) | Error/validation | The game could not be pinned. | createCompareTrayStore(); !result is true |
| [src/lib/compare-tray.ts:194](../src/lib/compare-tray.ts#L194) | Message output | error | createCompareTrayStore(); operation rejected or threw |
| [src/lib/compare-tray.ts:198](../src/lib/compare-tray.ts#L198) | Message/fragment | ${valid.title} is already pinned. | createCompareTrayStore(); snapshot.items.some((item) =&gt; canonicalCatalogId(item.id) === canonicalCatalogId(valid.id)) is true; !snapshot.persistent &amp;&amp; !protectedStorage is true |
| [src/lib/compare-tray.ts:199](../src/lib/compare-tray.ts#L199) | Message/fragment | ${valid.title} is already pinned. | createCompareTrayStore(); snapshot.items.some((item) =&gt; canonicalCatalogId(item.id) === canonicalCatalogId(valid.id)) is true |
| [src/lib/compare-tray.ts:203](../src/lib/compare-tray.ts#L203) | Message/fragment | The Compare tray holds six games. Unpin one before adding another. | error(); snapshot.items.length &gt;= COMPARE_TRAY_LIMIT is true |
| [src/lib/compare-tray.ts:209](../src/lib/compare-tray.ts#L209) | Message/fragment | ${valid.title} pinned for comparison. ${snapshot.items.length + 1} of 6 games. | createCompareTrayStore(); when its owning surface/operation is used |
| [src/lib/compare-tray.ts:220](../src/lib/compare-tray.ts#L220) | Message/fragment | ${record.title} unpinned from comparison. | createCompareTrayStore(); when its owning surface/operation is used |
| [src/lib/compare-tray.ts:223](../src/lib/compare-tray.ts#L223) | Message/fragment | Compare tray cleared. Your library is unchanged. | createCompareTrayStore(); when its owning surface/operation is used |
| [src/lib/compare-tray.ts:233](../src/lib/compare-tray.ts#L233) | Message/fragment | The tray is empty in this tab, but its saved copy could not be cleared. It may return on reload. Allow storage and clear again. | createCompareTrayStore(); operation rejected or threw |
| [src/lib/compare-tray.ts:258](../src/lib/compare-tray.ts#L258) | Message/fragment | Compare pins cleared. | resetLibraryAndCompare(); when its owning surface/operation is used |
| [src/lib/compare-tray.ts:285](../src/lib/compare-tray.ts#L285) | Error/validation | A safe drag could not be started. Use Pin for comparison instead. | beginDrag(); !valid &#124;&#124; !/^[a-f0-9-]{36}$/i.test(token) is true |
| [src/lib/compare-tray.ts:291](../src/lib/compare-tray.ts#L291) | Message output | error | beginDrag(); operation rejected or threw |
| [src/lib/compare-tray.ts:304](../src/lib/compare-tray.ts#L304) | Message/fragment | This drag has expired or belongs to another tab. Use Pin for comparison instead. | dropGame(); !pending &#124;&#124; token.length !== 36 &#124;&#124; token !== pending.token is true |
## src/lib/comparison-game-filter.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/comparison-game-filter.ts:22](../src/lib/comparison-game-filter.ts#L22) | Error/validation | Choose between one and six games for comparison. | createComparisonGameFilter(); !isUnknownArray(records) &#124;&#124; records.length &lt; 1 &#124;&#124; records.length &gt; 6 is true |
| [src/lib/comparison-game-filter.ts:28](../src/lib/comparison-game-filter.ts#L28) | Error/validation | Choose distinct game identities for comparison. | createComparisonGameFilter(); !record &#124;&#124; typeof record.id !== 'string' &#124;&#124; Object.hasOwn(selected, record.id) is true |
| [src/lib/comparison-game-filter.ts:39](../src/lib/comparison-game-filter.ts#L39) | Error/validation | The saved comparison game filter is invalid. | parseComparisonGameFilter(); !value &#124;&#124; typeof value !== 'object' &#124;&#124; Array.isArray(value) is true |
| [src/lib/comparison-game-filter.ts:43](../src/lib/comparison-game-filter.ts#L43) | Error/validation | The saved comparison game filter is unsupported. | parseComparisonGameFilter(); Object.keys(row).sort().join() !== 'records,scope,version' &#124;&#124; row.version !== 1 &#124;&#124; !Array.isArray(row.records) is true |
| [src/lib/comparison-game-filter.ts:67](../src/lib/comparison-game-filter.ts#L67) | Error/validation | The saved comparison game filter is too large. | readComparisonGameFilter(); raw.length &gt; 12000 is true |
| [src/lib/comparison-game-filter.ts:73](../src/lib/comparison-game-filter.ts#L73) | Message/fragment | The comparison game filter could not be restored. Pin the games again; your library is unchanged. | readComparisonGameFilter(); operation rejected or threw |
| [src/lib/comparison-game-filter.ts:80](../src/lib/comparison-game-filter.ts#L80) | Error/validation | Open comparisons before applying its private game filter. | rememberComparisonGameFilter(); location.pathname !== '/compare' is true |
| [src/lib/comparison-game-filter.ts:87](../src/lib/comparison-game-filter.ts#L87) | Message/fragment | This game filter is remembered only in the current comparison history. | rememberComparisonGameFilter(); operation rejected or threw |
| [src/lib/comparison-game-filter.ts:112](../src/lib/comparison-game-filter.ts#L112) | Message/fragment | This comparison is no longer filtered. Its old game filter may return in a new visit because tab storage could not be cleared. | clearComparisonGameFilter(); operation rejected or threw |
## src/lib/discovery-catalog.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/discovery-catalog.ts:11](../src/lib/discovery-catalog.ts#L11) | Error/validation | Invalid discovery catalog: ${message} | invalid(); when its owning surface/operation is used |
| [src/lib/discovery-catalog.ts:15](../src/lib/discovery-catalog.ts#L15) | Message output | 'expected an object.' | result(); when its owning surface/operation is used |
| [src/lib/discovery-catalog.ts:15](../src/lib/discovery-catalog.ts#L15) | Message/fragment | expected an object. | result(); when its owning surface/operation is used |
| [src/lib/discovery-catalog.ts:17](../src/lib/discovery-catalog.ts#L17) | Message output | 'unsupported object type.' | shape(); prototype !== Object.prototype &amp;&amp; prototype !== null is true |
| [src/lib/discovery-catalog.ts:17](../src/lib/discovery-catalog.ts#L17) | Message/fragment | unsupported object type. | shape(); prototype !== Object.prototype &amp;&amp; prototype !== null is true |
| [src/lib/discovery-catalog.ts:20](../src/lib/discovery-catalog.ts#L20) | Message output | 'missing or unknown fields.' | shape(); keys.length !== fields.length &#124;&#124; !fields.every((key) =&gt; Object.hasOwn(result, key)) is true |
| [src/lib/discovery-catalog.ts:20](../src/lib/discovery-catalog.ts#L20) | Message/fragment | missing or unknown fields. | shape(); keys.length !== fields.length &#124;&#124; !fields.every((key) =&gt; Object.hasOwn(result, key)) is true |
| [src/lib/discovery-catalog.ts:25](../src/lib/discovery-catalog.ts#L25) | Message output | 'expected enumerable data fields.' | shape(); typeof key !== 'string' &#124;&#124; !fields.includes(key) &#124;&#124; !descriptor?.enumerable &#124;&#124; !('value' in descriptor) is true |
| [src/lib/discovery-catalog.ts:25](../src/lib/discovery-catalog.ts#L25) | Message/fragment | expected enumerable data fields. | shape(); typeof key !== 'string' &#124;&#124; !fields.includes(key) &#124;&#124; !descriptor?.enumerable &#124;&#124; !('value' in descriptor) is true |
| [src/lib/discovery-catalog.ts:32](../src/lib/discovery-catalog.ts#L32) | Message output | &#96;expected nonempty text of at most ${limit} characters.&#96; | reject(); when its owning surface/operation is used |
| [src/lib/discovery-catalog.ts:32](../src/lib/discovery-catalog.ts#L32) | Message/fragment | expected nonempty text of at most ${limit} characters. | reject(); when its owning surface/operation is used |
| [src/lib/discovery-catalog.ts:39](../src/lib/discovery-catalog.ts#L39) | Message output | &#96;expected an integer from 1 to ${max}.&#96; | integer(); typeof value !== 'number' &#124;&#124; !Number.isSafeInteger(value) &#124;&#124; value &lt; 1 &#124;&#124; value &gt; max is true |
| [src/lib/discovery-catalog.ts:39](../src/lib/discovery-catalog.ts#L39) | Message/fragment | expected an integer from 1 to ${max}. | integer(); typeof value !== 'number' &#124;&#124; !Number.isSafeInteger(value) &#124;&#124; value &lt; 1 &#124;&#124; value &gt; max is true |
| [src/lib/discovery-catalog.ts:51](../src/lib/discovery-catalog.ts#L51) | Message output | 'expected an ISO UTC timestamp.' | timestamp(); !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) &#124;&#124; !Number.isFinite(Date.parse(result)) &#124;&#124; new Date(result).toISOString() !== result is true |
| [src/lib/discovery-catalog.ts:51](../src/lib/discovery-catalog.ts#L51) | Message/fragment | expected an ISO UTC timestamp. | timestamp(); !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) &#124;&#124; !Number.isFinite(Date.parse(result)) &#124;&#124; new Date(result).toISOString() !== result is true |
| [src/lib/discovery-catalog.ts:62](../src/lib/discovery-catalog.ts#L62) | Message output | 'malformed URL.' | https(); operation rejected or threw |
| [src/lib/discovery-catalog.ts:62](../src/lib/discovery-catalog.ts#L62) | Message/fragment | malformed URL. | https(); operation rejected or threw |
| [src/lib/discovery-catalog.ts:72](../src/lib/discovery-catalog.ts#L72) | Message output | 'unsafe URL.' | https(); url.protocol !== 'https:' &#124;&#124; !hosts.includes(url.hostname) &#124;&#124; url.username &#124;&#124; url.password &#124;&#124; url.port &#124;&#124; /[\s\\]/.test(result) is true |
| [src/lib/discovery-catalog.ts:72](../src/lib/discovery-catalog.ts#L72) | Message/fragment | unsafe URL. | https(); url.protocol !== 'https:' &#124;&#124; !hosts.includes(url.hostname) &#124;&#124; url.username &#124;&#124; url.password &#124;&#124; url.port &#124;&#124; /[\s\\]/.test(result) is true |
| [src/lib/discovery-catalog.ts:96](../src/lib/discovery-catalog.ts#L96) | Message output | 'artwork must use its content-addressed local WebP path.' | parseCatalogArtwork(); !/^[a-f0-9]{64}$/.test(sha256) &#124;&#124; src !== &#96;/images/discovery/${sha256}.webp&#96; is true |
| [src/lib/discovery-catalog.ts:96](../src/lib/discovery-catalog.ts#L96) | Message/fragment | artwork must use its content-addressed local WebP path. | parseCatalogArtwork(); !/^[a-f0-9]{64}$/.test(sha256) &#124;&#124; src !== &#96;/images/discovery/${sha256}.webp&#96; is true |
| [src/lib/discovery-catalog.ts:99](../src/lib/discovery-catalog.ts#L99) | Message output | 'expected a Commons file page.' | parseCatalogArtwork(); !new URL(sourceUrl).pathname.startsWith('/wiki/File:') is true |
| [src/lib/discovery-catalog.ts:99](../src/lib/discovery-catalog.ts#L99) | Message/fragment | expected a Commons file page. | parseCatalogArtwork(); !new URL(sourceUrl).pathname.startsWith('/wiki/File:') is true |
| [src/lib/discovery-catalog.ts:101](../src/lib/discovery-catalog.ts#L101) | Message output | 'expected a Commons asset.' | parseCatalogArtwork(); !new URL(originalUrl).pathname.startsWith('/wikipedia/commons/') is true |
| [src/lib/discovery-catalog.ts:101](../src/lib/discovery-catalog.ts#L101) | Message/fragment | expected a Commons asset. | parseCatalogArtwork(); !new URL(originalUrl).pathname.startsWith('/wikipedia/commons/') is true |
| [src/lib/discovery-catalog.ts:107](../src/lib/discovery-catalog.ts#L107) | Message/fragment | CC ${expectedLicense[1]!.toUpperCase()} ${expectedLicense[2]} | matchesLicense(); expectedLicense is true |
| [src/lib/discovery-catalog.ts:110](../src/lib/discovery-catalog.ts#L110) | Message/fragment | Public domain | matchesLicense(); expectedLicense is false; licensePath === '/publicdomain/zero/1.0/' is false; licensePath === '/publicdomain/mark/1.0/' &amp;&amp; |
| [src/lib/discovery-catalog.ts:112](../src/lib/discovery-catalog.ts#L112) | Message output | 'unsupported or mismatched image license.' | parseCatalogArtwork(); !matchesLicense &#124;&#124; new URL(licenseUrl).search &#124;&#124; new URL(licenseUrl).hash is true |
| [src/lib/discovery-catalog.ts:112](../src/lib/discovery-catalog.ts#L112) | Message/fragment | unsupported or mismatched image license. | parseCatalogArtwork(); !matchesLicense &#124;&#124; new URL(licenseUrl).search &#124;&#124; new URL(licenseUrl).hash is true |
| [src/lib/discovery-catalog.ts:138](../src/lib/discovery-catalog.ts#L138) | Message output | 'unsupported version or item count.' | parseDiscoveryCatalog(); root.schemaVersion !== 1 &#124;&#124; !Array.isArray(root.items) &#124;&#124; !root.items.length &#124;&#124; root.items.length &gt; DISCOVERY_LIMITS.items is true |
| [src/lib/discovery-catalog.ts:138](../src/lib/discovery-catalog.ts#L138) | Message/fragment | unsupported version or item count. | parseDiscoveryCatalog(); root.schemaVersion !== 1 &#124;&#124; !Array.isArray(root.items) &#124;&#124; !root.items.length &#124;&#124; root.items.length &gt; DISCOVERY_LIMITS.items is true |
| [src/lib/discovery-catalog.ts:162](../src/lib/discovery-catalog.ts#L162) | Message output | 'unsupported, duplicate or mismatched record identity.' | pending(); (record.source !== 'wikidata' &amp;&amp; record.source !== 'freetogame') &#124;&#124; id !== &#96;${record.source}:${sourceId}&#96; &#124;&#124; Object.hasOwn(records, id) &#124;&#124; !(record.source === 'wikidata' ? /^Q[1-9]\d{0,14}$/ : /^[1-9]\d{0,14}$/).test(sourceId) is true |
| [src/lib/discovery-catalog.ts:169](../src/lib/discovery-catalog.ts#L169) | Message output | 'Wikidata source URL does not match its ID.' | pending(); record.source === 'wikidata' &amp;&amp; sourceUrl !== &#96;https://www.wikidata.org/wiki/${sourceId}&#96; is true |
| [src/lib/discovery-catalog.ts:169](../src/lib/discovery-catalog.ts#L169) | Message/fragment | Wikidata source URL does not match its ID. | pending(); record.source === 'wikidata' &amp;&amp; sourceUrl !== &#96;https://www.wikidata.org/wiki/${sourceId}&#96; is true |
| [src/lib/discovery-catalog.ts:172](../src/lib/discovery-catalog.ts#L172) | Message output | 'expected a FreeToGame profile URL.' | pending(); record.source === 'freetogame' &amp;&amp; !/^\/[a-z0-9-]+$/.test(new URL(sourceUrl).pathname) is true |
| [src/lib/discovery-catalog.ts:172](../src/lib/discovery-catalog.ts#L172) | Message/fragment | expected a FreeToGame profile URL. | pending(); record.source === 'freetogame' &amp;&amp; !/^\/[a-z0-9-]+$/.test(new URL(sourceUrl).pathname) is true |
| [src/lib/discovery-catalog.ts:174](../src/lib/discovery-catalog.ts#L174) | Message output | 'unexpected source URL parameters.' | pending(); new URL(sourceUrl).search &#124;&#124; new URL(sourceUrl).hash is true |
| [src/lib/discovery-catalog.ts:174](../src/lib/discovery-catalog.ts#L174) | Message/fragment | unexpected source URL parameters. | pending(); new URL(sourceUrl).search &#124;&#124; new URL(sourceUrl).hash is true |
| [src/lib/discovery-catalog.ts:177](../src/lib/discovery-catalog.ts#L177) | Message output | 'too many aliases.' | pending(); !Array.isArray(row.aliases) &#124;&#124; row.aliases.length &gt; DISCOVERY_LIMITS.aliases is true |
| [src/lib/discovery-catalog.ts:177](../src/lib/discovery-catalog.ts#L177) | Message/fragment | too many aliases. | pending(); !Array.isArray(row.aliases) &#124;&#124; row.aliases.length &gt; DISCOVERY_LIMITS.aliases is true |
| [src/lib/discovery-catalog.ts:179](../src/lib/discovery-catalog.ts#L179) | Message output | 'duplicate aliases.' | pending(); new Set(aliases).size !== aliases.length is true |
| [src/lib/discovery-catalog.ts:179](../src/lib/discovery-catalog.ts#L179) | Message/fragment | duplicate aliases. | pending(); new Set(aliases).size !== aliases.length is true |
| [src/lib/discovery-catalog.ts:187](../src/lib/discovery-catalog.ts#L187) | Message/fragment | FreeToGame API terms | metadataLicense(); record.source === 'wikidata' is false |
| [src/lib/discovery-catalog.ts:193](../src/lib/discovery-catalog.ts#L193) | Message output | 'mismatched metadata license.' | pending(); provenance.metadataLicense !== metadataLicense &#124;&#124; provenance.metadataLicenseUrl !== metadataLicenseUrl is true |
| [src/lib/discovery-catalog.ts:193](../src/lib/discovery-catalog.ts#L193) | Message/fragment | mismatched metadata license. | pending(); provenance.metadataLicense !== metadataLicense &#124;&#124; provenance.metadataLicenseUrl !== metadataLicenseUrl is true |
| [src/lib/discovery-catalog.ts:197](../src/lib/discovery-catalog.ts#L197) | Message output | 'artwork has a missing-art reason.' | pending(); artwork &amp;&amp; provenance.artworkMissingReason !== null is true |
| [src/lib/discovery-catalog.ts:197](../src/lib/discovery-catalog.ts#L197) | Message/fragment | artwork has a missing-art reason. | pending(); artwork &amp;&amp; provenance.artworkMissingReason !== null is true |
| [src/lib/discovery-catalog.ts:216](../src/lib/discovery-catalog.ts#L216) | Message output | 'retrieval happened after generation.' | parseDiscoveryCatalog(); provenance.retrievedAt &gt; generatedAt &#124;&#124; (artwork &amp;&amp; artwork.retrievedAt &gt; generatedAt) is true |
| [src/lib/discovery-catalog.ts:216](../src/lib/discovery-catalog.ts#L216) | Message/fragment | retrieval happened after generation. | parseDiscoveryCatalog(); provenance.retrievedAt &gt; generatedAt &#124;&#124; (artwork &amp;&amp; artwork.retrievedAt &gt; generatedAt) is true |
| [src/lib/discovery-catalog.ts:221](../src/lib/discovery-catalog.ts#L221) | Message output | 'inconsistent shared asset dimensions or bytes.' | parseDiscoveryCatalog(); prior &amp;&amp; (prior.bytes !== artwork.bytes &#124;&#124; prior.width !== artwork.width &#124;&#124; prior.height !== artwork.height) is true |
| [src/lib/discovery-catalog.ts:221](../src/lib/discovery-catalog.ts#L221) | Message/fragment | inconsistent shared asset dimensions or bytes. | parseDiscoveryCatalog(); prior &amp;&amp; (prior.bytes !== artwork.bytes &#124;&#124; prior.width !== artwork.width &#124;&#124; prior.height !== artwork.height) is true |
| [src/lib/discovery-catalog.ts:226](../src/lib/discovery-catalog.ts#L226) | Message output | 'local artwork exceeds 35 MiB.' | parseDiscoveryCatalog(); [...assets.values()].reduce((sum, asset) =&gt; sum + asset.bytes, 0) &gt; DISCOVERY_LIMITS.totalImageBytes is true |
| [src/lib/discovery-catalog.ts:226](../src/lib/discovery-catalog.ts#L226) | Message/fragment | local artwork exceeds 35 MiB. | parseDiscoveryCatalog(); [...assets.values()].reduce((sum, asset) =&gt; sum + asset.bytes, 0) &gt; DISCOVERY_LIMITS.totalImageBytes is true |
| [src/lib/discovery-catalog.ts:230](../src/lib/discovery-catalog.ts#L230) | Message output | 'metadata exceeds 3 MiB.' | parseDiscoveryCatalog(); new TextEncoder().encode(JSON.stringify(result)).byteLength &gt; DISCOVERY_LIMITS.metadataBytes is true |
| [src/lib/discovery-catalog.ts:230](../src/lib/discovery-catalog.ts#L230) | Message/fragment | metadata exceeds 3 MiB. | parseDiscoveryCatalog(); new TextEncoder().encode(JSON.stringify(result)).byteLength &gt; DISCOVERY_LIMITS.metadataBytes is true |
| [src/lib/discovery-catalog.ts:237](../src/lib/discovery-catalog.ts#L237) | Message output | 'metadata exceeds 3 MiB.' | parseDiscoveryCatalogJson(); new TextEncoder().encode(json).byteLength &gt; DISCOVERY_LIMITS.metadataBytes is true |
| [src/lib/discovery-catalog.ts:237](../src/lib/discovery-catalog.ts#L237) | Message/fragment | metadata exceeds 3 MiB. | parseDiscoveryCatalogJson(); new TextEncoder().encode(json).byteLength &gt; DISCOVERY_LIMITS.metadataBytes is true |
## src/lib/discovery-genres.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/discovery-genres.ts:6](../src/lib/discovery-genres.ts#L6) | Message/fragment | Shooters | DISCOVERY_GENRE_FAMILIES(); when its owning surface/operation is used |
| [src/lib/discovery-genres.ts:7](../src/lib/discovery-genres.ts#L7) | Message/fragment | Strategy | DISCOVERY_GENRE_FAMILIES(); when its owning surface/operation is used |
| [src/lib/discovery-genres.ts:9](../src/lib/discovery-genres.ts#L9) | Message/fragment | Platformers | DISCOVERY_GENRE_FAMILIES(); when its owning surface/operation is used |
| [src/lib/discovery-genres.ts:10](../src/lib/discovery-genres.ts#L10) | Message/fragment | Puzzles | DISCOVERY_GENRE_FAMILIES(); when its owning surface/operation is used |
| [src/lib/discovery-genres.ts:12](../src/lib/discovery-genres.ts#L12) | Message/fragment | Fighting | DISCOVERY_GENRE_FAMILIES(); when its owning surface/operation is used |
| [src/lib/discovery-genres.ts:14](../src/lib/discovery-genres.ts#L14) | Message/fragment | Cards | DISCOVERY_GENRE_FAMILIES(); when its owning surface/operation is used |
| [src/lib/discovery-genres.ts:16](../src/lib/discovery-genres.ts#L16) | Message/fragment | Rhythm | DISCOVERY_GENRE_FAMILIES(); when its owning surface/operation is used |
| [src/lib/discovery-genres.ts:17](../src/lib/discovery-genres.ts#L17) | Message/fragment | Other or unclassified | DISCOVERY_GENRE_FAMILIES(); when its owning surface/operation is used |
## src/lib/document-title.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/document-title.ts:8](../src/lib/document-title.ts#L8) | Message/fragment | My games | pageTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:9](../src/lib/document-title.ts#L9) | Message/fragment | My games · Library | pageTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:10](../src/lib/document-title.ts#L10) | Message/fragment | My games · Ranking | pageTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:11](../src/lib/document-title.ts#L11) | Message/fragment | Discover | pageTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:12](../src/lib/document-title.ts#L12) | Message/fragment | Account | pageTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:13](../src/lib/document-title.ts#L13) | Message/fragment | Community | pageTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:14](../src/lib/document-title.ts#L14) | Message/fragment | Publish ranking | pageTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:15](../src/lib/document-title.ts#L15) | Message/fragment | A shared ranking | pageTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:16](../src/lib/document-title.ts#L16) | Message/fragment | Creator desk | pageTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:17](../src/lib/document-title.ts#L17) | Message/fragment | Friends | pageTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:18](../src/lib/document-title.ts#L18) | Message/fragment | Friend | pageTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:19](../src/lib/document-title.ts#L19) | Message/fragment | Invitation | pageTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:20](../src/lib/document-title.ts#L20) | Message/fragment | Compare rankings | pageTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:21](../src/lib/document-title.ts#L21) | Message/fragment | Friend sharing | pageTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:22](../src/lib/document-title.ts#L22) | Message/fragment | Shared games | pageTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:25](../src/lib/document-title.ts#L25) | Message/fragment | My games · Library | workspaceTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:26](../src/lib/document-title.ts#L26) | Message/fragment | My games · Play later | workspaceTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:27](../src/lib/document-title.ts#L27) | Message/fragment | My games · Ranking | workspaceTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:32](../src/lib/document-title.ts#L32) | Message/fragment | Menu | panelTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:33](../src/lib/document-title.ts#L33) | Message/fragment | Sign in | panelTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:34](../src/lib/document-title.ts#L34) | Message/fragment | Compare tray | panelTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:35](../src/lib/document-title.ts#L35) | Message/fragment | Copy this link | panelTitles(); when its owning surface/operation is used |
| [src/lib/document-title.ts:52](../src/lib/document-title.ts#L52) | Message/fragment | Game not found | title(); (panel ? panelTitles[panel] : undefined) ??; game is false; record?.title ??; missingGame is true |
## src/lib/extended-search.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/extended-search.ts:11](../src/lib/extended-search.ts#L11) | Message/fragment | saved game | label(); searching is false; count === 1 is true |
| [src/lib/extended-search.ts:11](../src/lib/extended-search.ts#L11) | Message/fragment | saved games | label(); searching is false; count === 1 is false |
| [src/lib/extended-search.ts:12](../src/lib/extended-search.ts#L12) | Message/fragment | ${count} ${label}${loading ? ' so far' : ''} | extendedResultCount(); when its owning surface/operation is used |
## src/lib/films.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/films.ts:19](../src/lib/films.ts#L19) | Message/fragment | The original order, ratings and workbook. | collectionFilms(); when its owning surface/operation is used |
| [src/lib/films.ts:21](../src/lib/films.ts#L21) | Message/fragment | The shown order and Leul's ratings come from the original workbook. Critic scores are recorded snapshots, not live results. No play or completion state is implied. | collectionFilms(); when its owning surface/operation is used |
| [src/lib/films.ts:39](../src/lib/films.ts#L39) | Message/fragment | "100 games. One point of view." Numbered source jackets open into a stack. "The Core 50. And 50 more essentials." The foreground entry is #01, Red Dead Redemption 2 (2018, Core 50). Credit: Leul Tewodros Agonafer. | collectionFilms(); when its owning surface/operation is used |
| [src/lib/films.ts:43](../src/lib/films.ts#L43) | Message/fragment | The collection shows #01 Red Dead Redemption 2, #07 Grand Theft Auto IV and #51 DOOM Eternal. Genre, year and collection filters are available; public-catalog search is off. Searching "Grand Theft Auto IV" finds one game: 2008, Core 50, Leul's rating 9.8/10. Its original rank stays 07. "Original rank, unchanged." Reset filters, then switch to the ratings table. | collectionFilms(); when its owning surface/operation is used |
| [src/lib/films.ts:47](../src/lib/films.ts#L47) | Message/fragment | "His order. His ratings." Leul's original /10 ratings are separate from critic scores. #01 Red Dead Redemption 2: Leul 10.0, Metacritic 97/100, IGN 10/10. #07 Grand Theft Auto IV: Leul 9.8, Metacritic 98/100, IGN unavailable. #51 DOOM Eternal (2020, Essential 50): Leul 8.5, Metacritic 88/100, IGN 9/10. A dash means unavailable. These are workbook snapshots, not live scores; no play or completion state is implied. | collectionFilms(); when its owning surface/operation is used |
| [src/lib/films.ts:51](../src/lib/films.ts#L51) | Message/fragment | "Play 100. Take all 100 with you." A workbook shows the same selected source rows in their original positions. Both the enhanced workbook and untouched original Excel are available. play-100-collection.vercel.app. Curated by Leul Tewodros Agonafer. | collectionFilms(); when its owning surface/operation is used |
| [src/lib/films.ts:58](../src/lib/films.ts#L58) | Message/fragment | Find games, pin a shortlist and compare shared rankings. | collectionFilms(); when its owning surface/operation is used |
| [src/lib/films.ts:60](../src/lib/films.ts#L60) | Message/fragment | A product walkthrough, not gameplay footage. Friend names and personal ratings are explicitly labelled demo examples; no real accounts or private data are shown. | collectionFilms(); when its owning surface/operation is used |
| [src/lib/films.ts:78](../src/lib/films.ts#L78) | Message/fragment | "Your next game starts here. Less choosing. More playing." "Play 100. Bring your friends." Source-derived Hades and Hollow Knight cards. | collectionFilms(); when its owning surface/operation is used |
| [src/lib/films.ts:82](../src/lib/films.ts#L82) | Message/fragment | Discover displays Hades, Hollow Knight and Portal 2. Pin Hades, then Hollow Knight. The Compare tray changes from one to two games. "Pinning does not save, rate or share a game." Choose Compare. | collectionFilms(); when its owning surface/operation is used |
| [src/lib/films.ts:86](../src/lib/films.ts#L86) | Message/fragment | Compare the two pinned games with You, Alex and Sam selected. "Demo friends &amp; ratings" explicitly identifies the examples. Hades: You 9.0 (rank 2), Alex 8.0 (rank 3), Sam 9.5 (rank 1); mean 8.83, three raters, spread 1.50. Hollow Knight: You 9.5 (rank 1), Alex 9.0 (rank 2), Sam 9.0 (rank 2); mean 9.17, three raters, spread 0.50. Ratings are /10. "Friends choose what to share." | collectionFilms(); when its owning surface/operation is used |
| [src/lib/films.ts:90](../src/lib/films.ts#L90) | Message/fragment | "Less choosing. More playing. Play 100. Find. Pin. Compare." play-100-collection.vercel.app. Curated by Leul Tewodros Agonafer. | collectionFilms(); when its owning surface/operation is used |
## src/lib/friend-all-transport.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/friend-all-transport.ts:46](../src/lib/friend-all-transport.ts#L46) | Error/validation | Automatic sharing contains an unsupported format. Refresh before continuing. | invalid(); when its owning surface/operation is used |
## src/lib/friend-all-work.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/friend-all-work.ts:27](../src/lib/friend-all-work.ts#L27) | Error/validation | The sharing retry state is unreadable. Your library is unchanged. | parseFriendAllCooldown(); !value &#124;&#124; typeof value !== 'object' &#124;&#124; Array.isArray(value) &#124;&#124; Object.keys(value).sort().join() !== 'epoch,nextAttemptAt,version' &#124;&#124; !('version' in value) &#124;&#124; value.version !== 2 &#124;&#124; !('epoch' in value) &#124;&#124; typeof value.epoch !== 'number' &#124;&#124; !Number.isSafeInteger(value.epoch) &#124;&#124; value.epoch &lt; 1 &#124;&#124; !('nextAttemptAt' in value) &#124;&#124; typeof value.nextAttemptAt !== 'number' &#124;&#124; !Number.isSafeInteger(value.nextAttemptAt) &#124;&#124; value.nextAttemptAt &lt; 0 is true |
## src/lib/friend-all.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/friend-all.ts:73](../src/lib/friend-all.ts#L73) | Error/validation | This sharing policy belongs to another account. | friendAllEligibility(); policy &amp;&amp; policy.uid !== facts.uid is true |
| [src/lib/friend-all.ts:101](../src/lib/friend-all.ts#L101) | Message/fragment | The online service has reached a limit. Progress is kept, and sharing resumes automatically without starting over. | FRIEND_ALL_QUOTA_MESSAGE(); when its owning surface/operation is used |
| [src/lib/friend-all.ts:123](../src/lib/friend-all.ts#L123) | Error/validation | The shared ranking entry is unreadable. | parseFriendAllRankingEntry(); !value &#124;&#124; typeof value !== 'object' &#124;&#124; Array.isArray(value) is true |
| [src/lib/friend-all.ts:134](../src/lib/friend-all.ts#L134) | Error/validation | The shared ranking entry contains unsupported fields or values. | parseFriendAllRankingEntry(); Object.keys(row).sort().join() !== 'id,position,score,source,sourceId,sourceUrl,title,year' &#124;&#124; typeof row.position !== 'number' &#124;&#124; !Number.isSafeInteger(row.position) &#124;&#124; row.position &lt; 1 &#124;&#124; row.position &gt; FRIEND_ALL_LIMIT &#124;&#124; (row.score !== null &amp;&amp; (typeof row.score !== 'number' &#124;&#124; !Number.isFinite(row.score) &#124;&#124; row.score &lt; 0 &#124;&#124; row.score &gt; 10)) is true |
| [src/lib/friend-all.ts:150](../src/lib/friend-all.ts#L150) | Error/validation | Sharing supports up to 10,000 distinct account games; nothing is silently omitted. | bounded(); entries.length &gt; FRIEND_ALL_LIMIT &#124;&#124; new Set(entries.map((entry) =&gt; entry.id)).size !== entries.length is true |
| [src/lib/friend-all.ts:159](../src/lib/friend-all.ts#L159) | Error/validation | This account exceeds the 10,000-game sharing limit. | projectAllFriendGames(); records.length &gt; FRIEND_ALL_LIMIT is true |
| [src/lib/friend-all.ts:165](../src/lib/friend-all.ts#L165) | Error/validation | Reload the original collection before sharing its metadata. | projectAllFriendGames(); saved.source === 'collection' &amp;&amp; !original is true |
| [src/lib/friend-all.ts:181](../src/lib/friend-all.ts#L181) | Error/validation | This account exceeds the 10,000-game sharing limit. | projectAllFriendRankings(); state.ranking.length &gt; FRIEND_ALL_LIMIT &#124;&#124; Object.keys(state.records).length &gt; FRIEND_ALL_LIMIT is true |
## src/lib/friend-comparison-intent.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/friend-comparison-intent.ts:17](../src/lib/friend-comparison-intent.ts#L17) | Error/validation | The comparison account is invalid. | comparisonScope(); !/^[a-z0-9-]{1,100}$/.test(project) &#124;&#124; !/^[A-Za-z0-9_-]{1,128}$/.test(uid) is true |
| [src/lib/friend-comparison-intent.ts:31](../src/lib/friend-comparison-intent.ts#L31) | Error/validation | Choose up to five different friends. | initialComparison(); !parsed &#124;&#124; peers.includes(uid) is true |
| [src/lib/friend-comparison-intent.ts:72](../src/lib/friend-comparison-intent.ts#L72) | Error/validation | Comparison state is too large. | readComparisonView(); raw.length &gt; 2048 is true |
| [src/lib/friend-comparison-intent.ts:89](../src/lib/friend-comparison-intent.ts#L89) | Error/validation | The comparison selection is invalid. | rememberComparisonView(); !parseComparisonView(value, value.scope) is true |
## src/lib/friend-comparison.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/friend-comparison.ts:65](../src/lib/friend-comparison.ts#L65) | Message/fragment | Not in shared list | unrankedCellLabel(); case 'absent' |
| [src/lib/friend-comparison.ts:67](../src/lib/friend-comparison.ts#L67) | Message/fragment | Not loaded yet | unrankedCellLabel(); case 'unfetched' |
| [src/lib/friend-comparison.ts:69](../src/lib/friend-comparison.ts#L69) | Message/fragment | Loading… | unrankedCellLabel(); case 'loading' |
| [src/lib/friend-comparison.ts:71](../src/lib/friend-comparison.ts#L71) | Message/fragment | Not shared | unrankedCellLabel(); case 'unshared' |
| [src/lib/friend-comparison.ts:73](../src/lib/friend-comparison.ts#L73) | Message/fragment | Unavailable | unrankedCellLabel(); case 'unavailable' |
| [src/lib/friend-comparison.ts:75](../src/lib/friend-comparison.ts#L75) | Message/fragment | Could not load | unrankedCellLabel(); case 'error' |
| [src/lib/friend-comparison.ts:162](../src/lib/friend-comparison.ts#L162) | Message/fragment | Invalid friend comparison: ${message} | module-defined copy; when its owning surface/operation is used |
| [src/lib/friend-comparison.ts:178](../src/lib/friend-comparison.ts#L178) | Message output | &#96;${label} must be an object.&#96; | result(); when its owning surface/operation is used |
| [src/lib/friend-comparison.ts:178](../src/lib/friend-comparison.ts#L178) | Message/fragment | ${label} must be an object. | result(); when its owning surface/operation is used |
| [src/lib/friend-comparison.ts:181](../src/lib/friend-comparison.ts#L181) | Message output | &#96;${label} must contain plain data.&#96; | object(); prototype !== Object.prototype &amp;&amp; prototype !== null is true |
| [src/lib/friend-comparison.ts:181](../src/lib/friend-comparison.ts#L181) | Message/fragment | ${label} must contain plain data. | object(); prototype !== Object.prototype &amp;&amp; prototype !== null is true |
| [src/lib/friend-comparison.ts:186](../src/lib/friend-comparison.ts#L186) | Message output | &#96;${label} contains unsupported fields or accessors.&#96; | object(); typeof key !== 'string' &#124;&#124; forbiddenIds.has(key) &#124;&#124; !property?.enumerable &#124;&#124; !('value' in property) is true |
| [src/lib/friend-comparison.ts:186](../src/lib/friend-comparison.ts#L186) | Message/fragment | ${label} contains unsupported fields or accessors. | object(); typeof key !== 'string' &#124;&#124; forbiddenIds.has(key) &#124;&#124; !property?.enumerable &#124;&#124; !('value' in property) is true |
| [src/lib/friend-comparison.ts:198](../src/lib/friend-comparison.ts#L198) | Message output | &#96;${label} has missing or unsupported fields.&#96; | shape(); required.some((key) =&gt; !Object.hasOwn(row, key)) &#124;&#124; Object.keys(row).some((key) =&gt; !required.includes(key) &amp;&amp; !optional.includes(key)) is true |
| [src/lib/friend-comparison.ts:198](../src/lib/friend-comparison.ts#L198) | Message/fragment | ${label} has missing or unsupported fields. | shape(); required.some((key) =&gt; !Object.hasOwn(row, key)) &#124;&#124; Object.keys(row).some((key) =&gt; !required.includes(key) &amp;&amp; !optional.includes(key)) is true |
| [src/lib/friend-comparison.ts:209](../src/lib/friend-comparison.ts#L209) | Message output | &#96;${label} must be an integer from ${min} to ${max}.&#96; | integer(); typeof value !== 'number' &#124;&#124; !Number.isSafeInteger(value) &#124;&#124; value &lt; min &#124;&#124; value &gt; max is true |
| [src/lib/friend-comparison.ts:209](../src/lib/friend-comparison.ts#L209) | Message/fragment | ${label} must be an integer from ${min} to ${max}. | integer(); typeof value !== 'number' &#124;&#124; !Number.isSafeInteger(value) &#124;&#124; value &lt; min &#124;&#124; value &gt; max is true |
| [src/lib/friend-comparison.ts:216](../src/lib/friend-comparison.ts#L216) | Message output | 'A game identity has an unsupported ID.' | safeGameId(); typeof value !== 'string' &#124;&#124; !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/.test(value) &#124;&#124; forbiddenIds.has(value) is true |
| [src/lib/friend-comparison.ts:216](../src/lib/friend-comparison.ts#L216) | Message/fragment | A game identity has an unsupported ID. | safeGameId(); typeof value !== 'string' &#124;&#124; !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/.test(value) &#124;&#124; forbiddenIds.has(value) is true |
| [src/lib/friend-comparison.ts:223](../src/lib/friend-comparison.ts#L223) | Message output | 'A game identity has an unsupported source.' | identity(); !source is true |
| [src/lib/friend-comparison.ts:223](../src/lib/friend-comparison.ts#L223) | Message/fragment | A game identity has an unsupported source. | identity(); !source is true |
| [src/lib/friend-comparison.ts:228](../src/lib/friend-comparison.ts#L228) | Message output | 'A collection identity must use its exact collection slug.' | identity(); source === 'collection' is true; id !== sourceId &#124;&#124; !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourceId) is true |
| [src/lib/friend-comparison.ts:228](../src/lib/friend-comparison.ts#L228) | Message/fragment | A collection identity must use its exact collection slug. | identity(); source === 'collection' is true; id !== sourceId &#124;&#124; !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourceId) is true |
| [src/lib/friend-comparison.ts:235](../src/lib/friend-comparison.ts#L235) | Message output | 'A game identity has an unsupported or inconsistent source ID.' | identity(); source === 'collection' is false; id !== &#96;${source}:${sourceId}&#96; &#124;&#124; (source === 'wikidata' &amp;&amp; !/^Q[1-9]\d*$/.test(sourceId)) &#124;&#124; ((source === 'steam' &#124;&#124; source === 'freetogame') &amp;&amp; !/^[1-9]\d*$/.test(sourceId)) is true |
| [src/lib/friend-comparison.ts:235](../src/lib/friend-comparison.ts#L235) | Message/fragment | A game identity has an unsupported or inconsistent source ID. | identity(); source === 'collection' is false; id !== &#96;${source}:${sourceId}&#96; &#124;&#124; (source === 'wikidata' &amp;&amp; !/^Q[1-9]\d*$/.test(sourceId)) &#124;&#124; ((source === 'steam' &#124;&#124; source === 'freetogame') &amp;&amp; !/^[1-9]\d*$/.test(sourceId)) is true |
| [src/lib/friend-comparison.ts:242](../src/lib/friend-comparison.ts#L242) | Message/fragment | Game identity | comparisonGameKey(); when its owning surface/operation is used |
| [src/lib/friend-comparison.ts:248](../src/lib/friend-comparison.ts#L248) | Message output | 'A source URL must be null or an HTTPS URL without credentials.' | sourceUrl(); typeof value !== 'string' &#124;&#124; /\s/.test(value) &#124;&#124; !/^https:\/\//i.test(value) is true |
| [src/lib/friend-comparison.ts:248](../src/lib/friend-comparison.ts#L248) | Message/fragment | A source URL must be null or an HTTPS URL without credentials. | sourceUrl(); typeof value !== 'string' &#124;&#124; /\s/.test(value) &#124;&#124; !/^https:\/\//i.test(value) is true |
| [src/lib/friend-comparison.ts:253](../src/lib/friend-comparison.ts#L253) | Message output | 'A source URL must be an HTTPS URL without credentials.' | sourceUrl(); url.protocol !== 'https:' &#124;&#124; !url.hostname &#124;&#124; url.username &#124;&#124; url.password is true |
| [src/lib/friend-comparison.ts:253](../src/lib/friend-comparison.ts#L253) | Message/fragment | A source URL must be an HTTPS URL without credentials. | sourceUrl(); url.protocol !== 'https:' &#124;&#124; !url.hostname &#124;&#124; url.username &#124;&#124; url.password is true |
| [src/lib/friend-comparison.ts:256](../src/lib/friend-comparison.ts#L256) | Message output | 'A source URL must be an HTTPS URL without credentials.' | sourceUrl(); operation rejected or threw |
| [src/lib/friend-comparison.ts:256](../src/lib/friend-comparison.ts#L256) | Message/fragment | A source URL must be an HTTPS URL without credentials. | sourceUrl(); operation rejected or threw |
| [src/lib/friend-comparison.ts:262](../src/lib/friend-comparison.ts#L262) | Message/fragment | A ranked entry | row(); when its owning surface/operation is used |
| [src/lib/friend-comparison.ts:264](../src/lib/friend-comparison.ts#L264) | Message/fragment | A ranked position | position(); when its owning surface/operation is used |
| [src/lib/friend-comparison.ts:267](../src/lib/friend-comparison.ts#L267) | Message output | 'A score must be null or a finite number from 0 to 10.' | readEntry(); score !== null &amp;&amp; (typeof score !== 'number' &#124;&#124; !Number.isFinite(score) &#124;&#124; score &lt; 0 &#124;&#124; score &gt; 10) is true |
| [src/lib/friend-comparison.ts:267](../src/lib/friend-comparison.ts#L267) | Message/fragment | A score must be null or a finite number from 0 to 10. | readEntry(); score !== null &amp;&amp; (typeof score !== 'number' &#124;&#124; !Number.isFinite(score) &#124;&#124; score &lt; 0 &#124;&#124; score &gt; 10) is true |
| [src/lib/friend-comparison.ts:271](../src/lib/friend-comparison.ts#L271) | Message/fragment | A game title | entry(); when its owning surface/operation is used |
| [src/lib/friend-comparison.ts:272](../src/lib/friend-comparison.ts#L272) | Message/fragment | A game year | entry(); row.year === null is false |
| [src/lib/friend-comparison.ts:295](../src/lib/friend-comparison.ts#L295) | Message/fragment | A participant ID | id(); when its owning surface/operation is used |
| [src/lib/friend-comparison.ts:296](../src/lib/friend-comparison.ts#L296) | Message output | 'A participant ID must not have surrounding whitespace.' | readParticipant(); id !== id.trim() is true |
| [src/lib/friend-comparison.ts:296](../src/lib/friend-comparison.ts#L296) | Message/fragment | A participant ID must not have surrounding whitespace. | readParticipant(); id !== id.trim() is true |
| [src/lib/friend-comparison.ts:297](../src/lib/friend-comparison.ts#L297) | Message output | 'A participant kind must be self or friend.' | readParticipant(); row.kind !== 'self' &amp;&amp; row.kind !== 'friend' is true |
| [src/lib/friend-comparison.ts:297](../src/lib/friend-comparison.ts#L297) | Message/fragment | A participant kind must be self or friend. | readParticipant(); row.kind !== 'self' &amp;&amp; row.kind !== 'friend' is true |
| [src/lib/friend-comparison.ts:300](../src/lib/friend-comparison.ts#L300) | Message output | 'A participant has unsupported availability or freshness.' | readParticipant(); !availability &#124;&#124; !freshness is true |
| [src/lib/friend-comparison.ts:300](../src/lib/friend-comparison.ts#L300) | Message/fragment | A participant has unsupported availability or freshness. | readParticipant(); !availability &#124;&#124; !freshness is true |
| [src/lib/friend-comparison.ts:303](../src/lib/friend-comparison.ts#L303) | Message/fragment | A display name | info(); when its owning surface/operation is used |
| [src/lib/friend-comparison.ts:310](../src/lib/friend-comparison.ts#L310) | Message/fragment | A snapshot timestamp | info(); row.updatedAt === undefined &#124;&#124; row.updatedAt === null is false |
| [src/lib/friend-comparison.ts:315](../src/lib/friend-comparison.ts#L315) | Message/fragment | Coverage | coverage(); row.coverage !== undefined is true |
| [src/lib/friend-comparison.ts:316](../src/lib/friend-comparison.ts#L316) | Message output | 'Unsupported loaded coverage.' | readParticipant(); row.coverage !== undefined is true; !['complete', 'page', 'exact'].includes(String(coverage.kind)) is true |
| [src/lib/friend-comparison.ts:316](../src/lib/friend-comparison.ts#L316) | Message/fragment | Unsupported loaded coverage. | readParticipant(); row.coverage !== undefined is true; !['complete', 'page', 'exact'].includes(String(coverage.kind)) is true |
| [src/lib/friend-comparison.ts:317](../src/lib/friend-comparison.ts#L317) | Message/fragment | Shared total | total(); row.coverage !== undefined is true |
| [src/lib/friend-comparison.ts:319](../src/lib/friend-comparison.ts#L319) | Message/fragment | Exact coverage | readParticipant(); row.coverage !== undefined is true; coverage.kind === 'exact' is true |
| [src/lib/friend-comparison.ts:321](../src/lib/friend-comparison.ts#L321) | Message output | 'Exact coverage requires one to six IDs.' | readParticipant(); row.coverage !== undefined is true; coverage.kind === 'exact' is true; !Array.isArray(coverage.ids) &#124;&#124; !coverage.ids.length &#124;&#124; coverage.ids.length &gt; 6 is true |
| [src/lib/friend-comparison.ts:321](../src/lib/friend-comparison.ts#L321) | Message/fragment | Exact coverage requires one to six IDs. | readParticipant(); row.coverage !== undefined is true; coverage.kind === 'exact' is true; !Array.isArray(coverage.ids) &#124;&#124; !coverage.ids.length &#124;&#124; coverage.ids.length &gt; 6 is true |
| [src/lib/friend-comparison.ts:323](../src/lib/friend-comparison.ts#L323) | Message output | 'Exact coverage contains duplicate IDs.' | readParticipant(); row.coverage !== undefined is true; coverage.kind === 'exact' is true; resolvedIds.size !== coverage.ids.length is true |
| [src/lib/friend-comparison.ts:323](../src/lib/friend-comparison.ts#L323) | Message/fragment | Exact coverage contains duplicate IDs. | readParticipant(); row.coverage !== undefined is true; coverage.kind === 'exact' is true; resolvedIds.size !== coverage.ids.length is true |
| [src/lib/friend-comparison.ts:326](../src/lib/friend-comparison.ts#L326) | Message/fragment | Paged coverage | readParticipant(); row.coverage !== undefined is true; coverage.kind === 'exact' is false |
| [src/lib/friend-comparison.ts:332](../src/lib/friend-comparison.ts#L332) | Message output | 'A participant that is not ready must omit entries.' | readParticipant(); availability !== 'ready' is true; row.entries !== undefined is true |
| [src/lib/friend-comparison.ts:332](../src/lib/friend-comparison.ts#L332) | Message/fragment | A participant that is not ready must omit entries. | readParticipant(); availability !== 'ready' is true; row.entries !== undefined is true |
| [src/lib/friend-comparison.ts:340](../src/lib/friend-comparison.ts#L340) | Message output | &#96;A ${row.kind} snapshot must have an entries array of at most ${limit} rows.&#96; | readParticipant(); !Array.isArray(row.entries) &#124;&#124; row.entries.length &gt; limit is true |
| [src/lib/friend-comparison.ts:340](../src/lib/friend-comparison.ts#L340) | Message/fragment | A ${row.kind} snapshot must have an entries array of at most ${limit} rows. | readParticipant(); !Array.isArray(row.entries) &#124;&#124; row.entries.length &gt; limit is true |
| [src/lib/friend-comparison.ts:347](../src/lib/friend-comparison.ts#L347) | Message output | &#96;Participant ${id} has a duplicate game identity.&#96; | readParticipant(); entries.has(key) is true |
| [src/lib/friend-comparison.ts:347](../src/lib/friend-comparison.ts#L347) | Message/fragment | Participant ${id} has a duplicate game identity. | readParticipant(); entries.has(key) is true |
| [src/lib/friend-comparison.ts:348](../src/lib/friend-comparison.ts#L348) | Message output | &#96;Participant ${id} has a duplicate ranked position.&#96; | readParticipant(); positions.has(entry.position) is true |
| [src/lib/friend-comparison.ts:348](../src/lib/friend-comparison.ts#L348) | Message/fragment | Participant ${id} has a duplicate ranked position. | readParticipant(); positions.has(entry.position) is true |
| [src/lib/friend-comparison.ts:351](../src/lib/friend-comparison.ts#L351) | Message output | 'An exact lookup returned an unresolved game.' | readParticipant(); resolvedIds &amp;&amp; !resolvedIds.has(entry.id) is true |
| [src/lib/friend-comparison.ts:351](../src/lib/friend-comparison.ts#L351) | Message/fragment | An exact lookup returned an unresolved game. | readParticipant(); resolvedIds &amp;&amp; !resolvedIds.has(entry.id) is true |
| [src/lib/friend-comparison.ts:354](../src/lib/friend-comparison.ts#L354) | Message output | 'Loaded coverage disagrees with the shared total.' | readParticipant(); info.coverage &amp;&amp; (entries.size &gt; info.coverage.total &#124;&#124; (complete &amp;&amp; entries.size !== info.coverage.total)) is true |
| [src/lib/friend-comparison.ts:354](../src/lib/friend-comparison.ts#L354) | Message/fragment | Loaded coverage disagrees with the shared total. | readParticipant(); info.coverage &amp;&amp; (entries.size &gt; info.coverage.total &#124;&#124; (complete &amp;&amp; entries.size !== info.coverage.total)) is true |
| [src/lib/friend-comparison.ts:455](../src/lib/friend-comparison.ts#L455) | Message output | 'Choose between 2 and 6 distinct participants.' | compareFriendRankings(); !Array.isArray(input) &#124;&#124; input.length &lt; FRIEND_COMPARISON_LIMITS.minParticipants &#124;&#124; input.length &gt; FRIEND_COMPARISON_LIMITS.maxParticipants is true |
| [src/lib/friend-comparison.ts:455](../src/lib/friend-comparison.ts#L455) | Message/fragment | Choose between 2 and 6 distinct participants. | compareFriendRankings(); !Array.isArray(input) &#124;&#124; input.length &lt; FRIEND_COMPARISON_LIMITS.minParticipants &#124;&#124; input.length &gt; FRIEND_COMPARISON_LIMITS.maxParticipants is true |
| [src/lib/friend-comparison.ts:463](../src/lib/friend-comparison.ts#L463) | Message output | 'The cohort contains duplicate participants.' | compareFriendRankings(); new Set(participants.map(({ id }) =&gt; id)).size !== participants.length is true |
| [src/lib/friend-comparison.ts:463](../src/lib/friend-comparison.ts#L463) | Message/fragment | The cohort contains duplicate participants. | compareFriendRankings(); new Set(participants.map(({ id }) =&gt; id)).size !== participants.length is true |
| [src/lib/friend-comparison.ts:466](../src/lib/friend-comparison.ts#L466) | Message output | 'The cohort may contain at most one local self.' | compareFriendRankings(); participants.filter(({ kind }) =&gt; kind === 'self').length &gt; 1 is true |
| [src/lib/friend-comparison.ts:466](../src/lib/friend-comparison.ts#L466) | Message/fragment | The cohort may contain at most one local self. | compareFriendRankings(); participants.filter(({ kind }) =&gt; kind === 'self').length &gt; 1 is true |
| [src/lib/friend-comparison.ts:517](../src/lib/friend-comparison.ts#L517) | Message/fragment | A row sort | sort(); value === undefined is false |
| [src/lib/friend-comparison.ts:528](../src/lib/friend-comparison.ts#L528) | Message output | 'The row sort is unsupported.' | sortRows(); typeof sort.by !== 'string' &#124;&#124; !fields.includes(sort.by) is true |
| [src/lib/friend-comparison.ts:528](../src/lib/friend-comparison.ts#L528) | Message/fragment | The row sort is unsupported. | sortRows(); typeof sort.by !== 'string' &#124;&#124; !fields.includes(sort.by) is true |
| [src/lib/friend-comparison.ts:530](../src/lib/friend-comparison.ts#L530) | Message output | 'A sort direction must be asc or desc.' | sortRows(); direction !== 'asc' &amp;&amp; direction !== 'desc' is true |
| [src/lib/friend-comparison.ts:530](../src/lib/friend-comparison.ts#L530) | Message/fragment | A sort direction must be asc or desc. | sortRows(); direction !== 'asc' &amp;&amp; direction !== 'desc' is true |
| [src/lib/friend-comparison.ts:534](../src/lib/friend-comparison.ts#L534) | Message output | 'A position or score sort requires exactly one selected participant ID.' | sortRows(); perParticipant ? participantIndex &lt; 0 : Object.hasOwn(sort, 'participantId') is true |
| [src/lib/friend-comparison.ts:534](../src/lib/friend-comparison.ts#L534) | Message/fragment | A position or score sort requires exactly one selected participant ID. | sortRows(); perParticipant ? participantIndex &lt; 0 : Object.hasOwn(sort, 'participantId') is true |
| [src/lib/friend-comparison.ts:571](../src/lib/friend-comparison.ts#L571) | Message/fragment | Page options | input(); when its owning surface/operation is used |
| [src/lib/friend-comparison.ts:582](../src/lib/friend-comparison.ts#L582) | Message output | 'The comparison mode is unsupported.' | getComparisonPage(); mode !== 'common-ranked' &amp;&amp; mode !== 'all-shared' is true |
| [src/lib/friend-comparison.ts:582](../src/lib/friend-comparison.ts#L582) | Message/fragment | The comparison mode is unsupported. | getComparisonPage(); mode !== 'common-ranked' &amp;&amp; mode !== 'all-shared' is true |
| [src/lib/friend-comparison.ts:583](../src/lib/friend-comparison.ts#L583) | Message/fragment | A search query | query(); input.query === undefined is false |
| [src/lib/friend-comparison.ts:587](../src/lib/friend-comparison.ts#L587) | Message/fragment | Minimum coverage | minCoverage(); input.minCoverage === undefined is false |
| [src/lib/friend-comparison.ts:591](../src/lib/friend-comparison.ts#L591) | Message/fragment | Minimum raters | minRaters(); input.minRaters === undefined is false |
| [src/lib/friend-comparison.ts:592](../src/lib/friend-comparison.ts#L592) | Message/fragment | A page number | page(); input.page === undefined is false |
| [src/lib/friend-comparison.ts:596](../src/lib/friend-comparison.ts#L596) | Message/fragment | A page size | pageSize(); input.pageSize === undefined is false |
| [src/lib/friend-comparison.ts:600](../src/lib/friend-comparison.ts#L600) | Message output | 'Choose one to six comparison games.' | getComparisonPage(); input.games !== undefined is true; !Array.isArray(input.games) &#124;&#124; input.games.length &lt; 1 &#124;&#124; input.games.length &gt; 6 is true |
| [src/lib/friend-comparison.ts:600](../src/lib/friend-comparison.ts#L600) | Message/fragment | Choose one to six comparison games. | getComparisonPage(); input.games !== undefined is true; !Array.isArray(input.games) &#124;&#124; input.games.length &lt; 1 &#124;&#124; input.games.length &gt; 6 is true |
| [src/lib/friend-comparison.ts:603](../src/lib/friend-comparison.ts#L603) | Message/fragment | A comparison game | getComparisonPage(); input.games !== undefined is true |
| [src/lib/friend-comparison.ts:605](../src/lib/friend-comparison.ts#L605) | Message output | 'Comparison games must use distinct source identities.' | getComparisonPage(); input.games !== undefined is true; selectedGames.size !== input.games.length is true |
| [src/lib/friend-comparison.ts:605](../src/lib/friend-comparison.ts#L605) | Message/fragment | Comparison games must use distinct source identities. | getComparisonPage(); input.games !== undefined is true; selectedGames.size !== input.games.length is true |
## src/lib/friend-manager.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/friend-manager.ts:77](../src/lib/friend-manager.ts#L77) | Message/fragment | Used | invitationStatus(); invite.state === 'consumed' is true |
| [src/lib/friend-manager.ts:78](../src/lib/friend-manager.ts#L78) | Message/fragment | Revoked | invitationStatus(); invite.state === 'revoked' is true |
| [src/lib/friend-manager.ts:79](../src/lib/friend-manager.ts#L79) | Message/fragment | Active | invitationStatus(); invite.expiresAt &gt; now is true |
| [src/lib/friend-manager.ts:79](../src/lib/friend-manager.ts#L79) | Message/fragment | Expired | invitationStatus(); invite.expiresAt &gt; now is false |
| [src/lib/friend-manager.ts:83](../src/lib/friend-manager.ts#L83) | Message/fragment | Active | future(); when its owning surface/operation is used |
## src/lib/friend-selection-cache.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/friend-selection-cache.ts:20](../src/lib/friend-selection-cache.ts#L20) | Message output | 'The pending friends selection is unreadable.' | parse(); !value &#124;&#124; typeof value !== 'object' &#124;&#124; Array.isArray(value) is true |
| [src/lib/friend-selection-cache.ts:20](../src/lib/friend-selection-cache.ts#L20) | Message/fragment | The pending friends selection is unreadable. | parse(); !value &#124;&#124; typeof value !== 'object' &#124;&#124; Array.isArray(value) is true |
| [src/lib/friend-selection-cache.ts:47](../src/lib/friend-selection-cache.ts#L47) | Message output | 'The pending friends selection is invalid. Review the selection before sharing again.' | parse(); row.version !== 1 &#124;&#124; typeof row.revision !== 'number' &#124;&#124; !Number.isSafeInteger(row.revision) &#124;&#124; typeof row.observedStateRevision !== 'number' &#124;&#124; !Number.isSafeInteger(row.observedStateRevision) &#124;&#124; row.observedStateRevision &lt; 0 &#124;&#124; !Array.isArray(row.selected) &#124;&#124; row.selected.length &gt; 200 &#124;&#124; !row.selected.every( (id): id is string =&gt; typeof id === 'string' &amp;&amp; /^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/.test(id), ) &#124;&#124; !row.removed &#124;&#124; typeof row.removed !== 'object' &#124;&#124; Array.isArray(row.removed) &#124;&#124; Object.keys(row.removed).length &gt; 200 &#124;&#124; !Object.entries(row.removed).every( ([id, revision]) =&gt; Array.isArray(selected) &amp;&amp; selected.includes(id) &amp;&amp; typeof revision === 'number' &amp;&amp; Number.isSafeInteger(revision), ) is true |
| [src/lib/friend-selection-cache.ts:47](../src/lib/friend-selection-cache.ts#L47) | Message/fragment | The pending friends selection is invalid. Review the selection before sharing again. | parse(); row.version !== 1 &#124;&#124; typeof row.revision !== 'number' &#124;&#124; !Number.isSafeInteger(row.revision) &#124;&#124; typeof row.observedStateRevision !== 'number' &#124;&#124; !Number.isSafeInteger(row.observedStateRevision) &#124;&#124; row.observedStateRevision &lt; 0 &#124;&#124; !Array.isArray(row.selected) &#124;&#124; row.selected.length &gt; 200 &#124;&#124; !row.selected.every( (id): id is string =&gt; typeof id === 'string' &amp;&amp; /^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/.test(id), ) &#124;&#124; !row.removed &#124;&#124; typeof row.removed !== 'object' &#124;&#124; Array.isArray(row.removed) &#124;&#124; Object.keys(row.removed).length &gt; 200 &#124;&#124; !Object.entries(row.removed).every( ([id, revision]) =&gt; Array.isArray(selected) &amp;&amp; selected.includes(id) &amp;&amp; typeof revision === 'number' &amp;&amp; Number.isSafeInteger(revision), ) is true |
| [src/lib/friend-selection-cache.ts:73](../src/lib/friend-selection-cache.ts#L73) | Error/validation | The friends selection is invalid. | updateFriendSelectionCache(); selected.length &gt; 200 &#124;&#124; new Set(selected).size !== selected.length is true |
| [src/lib/friend-selection-cache.ts:102](../src/lib/friend-selection-cache.ts#L102) | Message output | 'This library changed in an older tab. Refresh that tab, then review Friend sharing before updating it. Private saving is unaffected.' | pendingFriendRemovals(); current &amp;&amp; currentStateRevision !== undefined &amp;&amp; current.observedStateRevision !== currentStateRevision is true |
| [src/lib/friend-selection-cache.ts:103](../src/lib/friend-selection-cache.ts#L103) | Message/fragment | This library changed in an older tab. Refresh that tab, then review Friend sharing before updating it. Private saving is unaffected. | pendingFriendRemovals(); current &amp;&amp; currentStateRevision !== undefined &amp;&amp; current.observedStateRevision !== currentStateRevision is true |
## src/lib/friend-shelf-selection-cache.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/friend-shelf-selection-cache.ts:15](../src/lib/friend-shelf-selection-cache.ts#L15) | Message/fragment | Shared games need a fresh selection review. | error(); operation rejected or threw; cause instanceof Error is false |
## src/lib/friend-shelf-selection.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/friend-shelf-selection.ts:40](../src/lib/friend-shelf-selection.ts#L40) | Error/validation | Shared games need a fresh selection review after a library change in an older tab. Private saving is unaffected. | invalid(); when its owning surface/operation is used |
## src/lib/friend-shelf-types.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/friend-shelf-types.ts:43](../src/lib/friend-shelf-types.ts#L43) | Message/fragment | Shared games were saved; refresh their details instead of repeating the change. | module-defined copy; when its owning surface/operation is used |
| [src/lib/friend-shelf-types.ts:50](../src/lib/friend-shelf-types.ts#L50) | Message/fragment | Account saving restarted. Preview shared games again before updating this shelf. | module-defined copy; when its owning surface/operation is used |
| [src/lib/friend-shelf-types.ts:72](../src/lib/friend-shelf-types.ts#L72) | Message/fragment | Shared games contain unsupported metadata. Review the selection before sharing. | invalid(); when its owning surface/operation is used |
| [src/lib/friend-shelf-types.ts:79](../src/lib/friend-shelf-types.ts#L79) | Message output | 'Choose up to 200 distinct saved games.' | shelfSelection(); operation rejected or threw |
| [src/lib/friend-shelf-types.ts:79](../src/lib/friend-shelf-types.ts#L79) | Message/fragment | Choose up to 200 distinct saved games. | shelfSelection(); operation rejected or threw |
| [src/lib/friend-shelf-types.ts:118](../src/lib/friend-shelf-types.ts#L118) | Message output | 'A shared game has an unsupported identity or source link.' | parseFriendShelfEntry(); !valid is true |
| [src/lib/friend-shelf-types.ts:118](../src/lib/friend-shelf-types.ts#L118) | Message/fragment | A shared game has an unsupported identity or source link. | parseFriendShelfEntry(); !valid is true |
| [src/lib/friend-shelf-types.ts:135](../src/lib/friend-shelf-types.ts#L135) | Message output | 'The saved selection changed. Preview it again.' | validateFriendShelfEntries(); entries.length !== ids.length &#124;&#124; entries.some((entry, index) =&gt; entry.id !== ids[index]) is true |
| [src/lib/friend-shelf-types.ts:135](../src/lib/friend-shelf-types.ts#L135) | Message/fragment | The saved selection changed. Preview it again. | validateFriendShelfEntries(); entries.length !== ids.length &#124;&#124; entries.some((entry, index) =&gt; entry.id !== ids[index]) is true |
| [src/lib/friend-shelf-types.ts:174](../src/lib/friend-shelf-types.ts#L174) | Message output | 'An original game is missing from the public catalog. Reload it before sharing.' | entries(); saved.source === 'collection' &amp;&amp; !trusted is true |
| [src/lib/friend-shelf-types.ts:174](../src/lib/friend-shelf-types.ts#L174) | Message/fragment | An original game is missing from the public catalog. Reload it before sharing. | entries(); saved.source === 'collection' &amp;&amp; !trusted is true |
| [src/lib/friend-shelf-types.ts:192](../src/lib/friend-shelf-types.ts#L192) | Message output | 'The shared original game does not match the public catalog.' | recordFromFriendShelf(); entry.source === 'collection' is true; !canonical &#124;&#124; entry.title !== canonical.title &#124;&#124; entry.year !== canonical.year is true |
| [src/lib/friend-shelf-types.ts:192](../src/lib/friend-shelf-types.ts#L192) | Message/fragment | The shared original game does not match the public catalog. | recordFromFriendShelf(); entry.source === 'collection' is true; !canonical &#124;&#124; entry.title !== canonical.title &#124;&#124; entry.year !== canonical.year is true |
| [src/lib/friend-shelf-types.ts:195](../src/lib/friend-shelf-types.ts#L195) | Message output | 'The shared game has a conflicting source identity.' | recordFromFriendShelf(); canonical is true |
| [src/lib/friend-shelf-types.ts:195](../src/lib/friend-shelf-types.ts#L195) | Message/fragment | The shared game has a conflicting source identity. | recordFromFriendShelf(); canonical is true |
## src/lib/friend-types.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/friend-types.ts:67](../src/lib/friend-types.ts#L67) | Message/fragment | The change was saved, but its latest details could not be refreshed. Refresh instead of repeating the action. | module-defined copy; when its owning surface/operation is used |
| [src/lib/friend-types.ts:193](../src/lib/friend-types.ts#L193) | Message/fragment | Friend data has an unsupported format. Reload before continuing. | invalid(); when its owning surface/operation is used |
| [src/lib/friend-types.ts:206](../src/lib/friend-types.ts#L206) | Message output | 'Friend data has an invalid server timestamp.' | time(); !(value instanceof Timestamp) is true |
| [src/lib/friend-types.ts:206](../src/lib/friend-types.ts#L206) | Message/fragment | Friend data has an invalid server timestamp. | time(); !(value instanceof Timestamp) is true |
| [src/lib/friend-types.ts:219](../src/lib/friend-types.ts#L219) | Message output | 'This account identity is unsupported.' | friendUid(); typeof value !== 'string' &#124;&#124; !/^[A-Za-z0-9_-]{1,128}$/.test(value) is true |
| [src/lib/friend-types.ts:219](../src/lib/friend-types.ts#L219) | Message/fragment | This account identity is unsupported. | friendUid(); typeof value !== 'string' &#124;&#124; !/^[A-Za-z0-9_-]{1,128}$/.test(value) is true |
| [src/lib/friend-types.ts:225](../src/lib/friend-types.ts#L225) | Message output | 'Choose another person, not your own account.' | friendPairId(); uid === otherUid is true |
| [src/lib/friend-types.ts:225](../src/lib/friend-types.ts#L225) | Message/fragment | Choose another person, not your own account. | friendPairId(); uid === otherUid is true |
| [src/lib/friend-types.ts:235](../src/lib/friend-types.ts#L235) | Message output | 'This invitation link is malformed. Ask for a new link.' | friendToken(); typeof value !== 'string' &#124;&#124; !/^[a-f0-9]{64}$/.test(value) is true |
| [src/lib/friend-types.ts:235](../src/lib/friend-types.ts#L235) | Message/fragment | This invitation link is malformed. Ask for a new link. | friendToken(); typeof value !== 'string' &#124;&#124; !/^[a-f0-9]{64}$/.test(value) is true |
| [src/lib/friend-types.ts:240](../src/lib/friend-types.ts#L240) | Message output | &#96;Choose a name between 1 and ${max} characters.&#96; | friendName(); typeof value !== 'string' &#124;&#124; !value.trim() &#124;&#124; value.trim().length &gt; max &#124;&#124; hasAsciiControl(value) is true |
| [src/lib/friend-types.ts:240](../src/lib/friend-types.ts#L240) | Message/fragment | Choose a name between 1 and ${max} characters. | friendName(); typeof value !== 'string' &#124;&#124; !value.trim() &#124;&#124; value.trim().length &gt; max &#124;&#124; hasAsciiControl(value) is true |
| [src/lib/friend-types.ts:250](../src/lib/friend-types.ts#L250) | Message output | 'Choose up to 200 distinct ranked game identities.' | friendSelection(); !isUnknownArray(value) &#124;&#124; value.length &gt; FRIEND_SELECTION_LIMIT &#124;&#124; !value.every((id): id is string =&gt; typeof id === 'string' &amp;&amp; /^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/.test(id)) &#124;&#124; new Set(value).size !== value.length is true |
| [src/lib/friend-types.ts:250](../src/lib/friend-types.ts#L250) | Message/fragment | Choose up to 200 distinct ranked game identities. | friendSelection(); !isUnknownArray(value) &#124;&#124; value.length &gt; FRIEND_SELECTION_LIMIT &#124;&#124; !value.every((id): id is string =&gt; typeof id === 'string' &amp;&amp; /^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/.test(id)) &#124;&#124; new Set(value).size !== value.length is true |
| [src/lib/friend-types.ts:255](../src/lib/friend-types.ts#L255) | Message output | 'Choose between two and six different people.' | friendParticipants(); !Array.isArray(value) &#124;&#124; value.length &lt; 2 &#124;&#124; value.length &gt; 6 &#124;&#124; new Set(value).size !== value.length is true |
| [src/lib/friend-types.ts:255](../src/lib/friend-types.ts#L255) | Message/fragment | Choose between two and six different people. | friendParticipants(); !Array.isArray(value) &#124;&#124; value.length &lt; 2 &#124;&#124; value.length &gt; 6 &#124;&#124; new Set(value).size !== value.length is true |
| [src/lib/friend-types.ts:456](../src/lib/friend-types.ts#L456) | Message output | 'The selected ranking changed. Review its games and order before sharing.' | validateFriendEntries(); entries.length &gt; 200 &#124;&#124; new Set(entries.map((entry) =&gt; entry.id)).size !== entries.length &#124;&#124; entries.some((entry, index) =&gt; entry.position !== index + 1 &#124;&#124; !selected.has(entry.id)) is true |
| [src/lib/friend-types.ts:456](../src/lib/friend-types.ts#L456) | Message/fragment | The selected ranking changed. Review its games and order before sharing. | validateFriendEntries(); entries.length &gt; 200 &#124;&#124; new Set(entries.map((entry) =&gt; entry.id)).size !== entries.length &#124;&#124; entries.some((entry, index) =&gt; entry.position !== index + 1 &#124;&#124; !selected.has(entry.id)) is true |
## src/lib/game-progress.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/game-progress.ts:14](../src/lib/game-progress.ts#L14) | Message/fragment | All progress | progressLabels(); when its owning surface/operation is used |
| [src/lib/game-progress.ts:15](../src/lib/game-progress.ts#L15) | Message/fragment | Not played | progressLabels(); when its owning surface/operation is used |
| [src/lib/game-progress.ts:16](../src/lib/game-progress.ts#L16) | Message/fragment | Played (not completed) | progressLabels(); when its owning surface/operation is used |
| [src/lib/game-progress.ts:17](../src/lib/game-progress.ts#L17) | Message/fragment | Completed | progressLabels(); when its owning surface/operation is used |
| [src/lib/game-progress.ts:19](../src/lib/game-progress.ts#L19) | Message/fragment | Not completed | progressLabels(); when its owning surface/operation is used |
## src/lib/google-intent.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/google-intent.ts:18](../src/lib/google-intent.ts#L18) | Message/fragment | Google needs temporary storage in this tab to return safely. Use email or keep using this device; no library data was changed. | storageError(); when its owning surface/operation is used |
| [src/lib/google-intent.ts:47](../src/lib/google-intent.ts#L47) | Error/validation | The Google return request is invalid. Start again from Account. | parseGoogleIntent(); raw.length &gt; 2048 is true |
| [src/lib/google-intent.ts:52](../src/lib/google-intent.ts#L52) | Error/validation | The Google return request is unreadable. Start again from Account. | parseGoogleIntent(); operation rejected or threw |
| [src/lib/google-intent.ts:55](../src/lib/google-intent.ts#L55) | Error/validation | The Google return request is invalid. Start again from Account. | parseGoogleIntent(); !value &#124;&#124; typeof value !== 'object' &#124;&#124; Array.isArray(value) is true |
| [src/lib/google-intent.ts:71](../src/lib/google-intent.ts#L71) | Error/validation | The Google return request expired or is invalid. Start again from Account. | parseGoogleIntent(); Object.keys(data).some((key) =&gt; !keys.includes(key)) &#124;&#124; data.version !== 1 &#124;&#124; typeof data.requestId !== 'string' &#124;&#124; !/^[a-f0-9]{32}$/.test(data.requestId) &#124;&#124; typeof data.createdAt !== 'number' &#124;&#124; !Number.isSafeInteger(data.createdAt) &#124;&#124; data.createdAt &gt; now + 5000 &#124;&#124; now - data.createdAt &gt; GOOGLE_INTENT_LIFETIME &#124;&#124; typeof data.returnPath !== 'string' &#124;&#124; googleReturnPath(data.returnPath) !== data.returnPath is true |
| [src/lib/google-intent.ts:81](../src/lib/google-intent.ts#L81) | Error/validation | The Google account request is invalid. Nothing was changed. | parseGoogleIntent(); typeof data.uid !== 'string' &#124;&#124; !/^[A-Za-z0-9_-]{1,128}$/.test(data.uid) is true |
| [src/lib/google-intent.ts:91](../src/lib/google-intent.ts#L91) | Error/validation | The Google account action is invalid. Nothing was changed. | parseGoogleIntent(); when its owning surface/operation is used |
| [src/lib/google-intent.ts:107](../src/lib/google-intent.ts#L107) | Message/fragment | The Google return request is invalid. | readGoogleIntent(); operation rejected or threw; cause instanceof Error is false |
| [src/lib/google-intent.ts:141](../src/lib/google-intent.ts#L141) | Error/validation | Google returned, but this tab could not clear its temporary request. Reload Account before starting another Google action. | clearGoogleIntent(); operation rejected or threw |
| [src/lib/google-intent.ts:159](../src/lib/google-intent.ts#L159) | Error/validation | Google did not confirm the requested account and action. Nothing was deleted or copied. Review Account before trying again. | validateGoogleReturn(); result.providerId !== 'google.com' &#124;&#124; result.operationType !== operation &#124;&#124; result.uid !== currentUid &#124;&#124; (intent.uid !== null &amp;&amp; intent.uid !== result.uid) is true |
## src/lib/guards.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/guards.ts:36](../src/lib/guards.ts#L36) | Error/validation | Expected a JSON object. | requireObject(); when its owning surface/operation is used |
| [src/lib/guards.ts:44](../src/lib/guards.ts#L44) | Error/validation | Invalid ${label}: expected an object. | labelledObject(); when its owning surface/operation is used |
| [src/lib/guards.ts:64](../src/lib/guards.ts#L64) | Error/validation | Expected a non-empty string. | requireText(); when its owning surface/operation is used |
| [src/lib/guards.ts:81](../src/lib/guards.ts#L81) | Message/fragment | ${label} must be ${nonempty ? 'nonempty ' : ''}text of at most ${limit} characters. | labelledText(); when its owning surface/operation is used |
## src/lib/invite-continuation.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/invite-continuation.ts:18](../src/lib/invite-continuation.ts#L18) | Error/validation | This invitation is invalid. | saveInviteContinuation(); !isInviteCapability(capability) is true |
| [src/lib/invite-continuation.ts:25](../src/lib/invite-continuation.ts#L25) | Error/validation | This tab cannot keep the invitation through sign-in. Keep the original link and reopen it after signing in. | saveInviteContinuation(); operation rejected or threw |
| [src/lib/invite-continuation.ts:87](../src/lib/invite-continuation.ts#L87) | Message/fragment | This tab cannot restore the invitation. Reopen the original link after signing in. | captureInviteContinuation(); !fragment is true; operation rejected or threw |
| [src/lib/invite-continuation.ts:92](../src/lib/invite-continuation.ts#L92) | Message/fragment | This invitation link is invalid. | captureInviteContinuation(); !isInviteCapability(fragment) is true |
| [src/lib/invite-continuation.ts:99](../src/lib/invite-continuation.ts#L99) | Message/fragment | Keep the original invitation before signing in. | captureInviteContinuation(); operation rejected or threw; cause instanceof Error is false |
| [src/lib/invite-continuation.ts:104](../src/lib/invite-continuation.ts#L104) | Error/validation | This invitation is invalid. | createInviteUrl(); !isInviteCapability(capability) is true |
## src/lib/library-mode.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/library-mode.ts:7](../src/lib/library-mode.ts#L7) | Message/fragment | Device only | LibraryModeContext(); when its owning surface/operation is used |
## src/lib/local-pagination.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/local-pagination.ts:18](../src/lib/local-pagination.ts#L18) | Error/validation | Local pagination requires a nonnegative total and offset, and a positive page size. | getLocalPage(); !Number.isSafeInteger(total) &#124;&#124; total &lt; 0 &#124;&#124; !Number.isSafeInteger(pageSize) &#124;&#124; pageSize &lt; 1 &#124;&#124; !Number.isSafeInteger(offset) &#124;&#124; offset &lt; 0 is true |
## src/lib/my-games-navigation.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/my-games-navigation.ts:23](../src/lib/my-games-navigation.ts#L23) | Error/validation | A Library page must be a positive integer below 10000. | libraryPageSearch(); !Number.isInteger(page) &#124;&#124; page &lt; 1 &#124;&#124; page &gt; 9999 is true |
## src/lib/online-config.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/online-config.ts:23](../src/lib/online-config.ts#L23) | Message/fragment | The old JSON online configuration is unsupported. Configure the four public Firebase fields before enabling online tools. | readFirebaseConfiguration(); !fields.some((field) =&gt; environment[field] !== undefined &amp;&amp; environment[field] !== '') is true; environment.VITE_FIREBASE_CONFIG is true |
| [src/lib/online-config.ts:41](../src/lib/online-config.ts#L41) | Message/fragment | Online tools are unavailable because their public configuration is incomplete or invalid. Your device library remains available. | readFirebaseConfiguration(); !apiKey &#124;&#124; !/^AIza[A-Za-z0-9_-]{35}$/.test(apiKey) &#124;&#124; authDomain !== 'play-100-collection.vercel.app' &#124;&#124; projectId !== CLOUD_PROJECT &#124;&#124; !appId &#124;&#124; !/^1:\d+:web:[a-f0-9]+$/.test(appId) is true |
## src/lib/personal-db.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/personal-db.ts:38](../src/lib/personal-db.ts#L38) | Message/fragment | PersonalLibrary | storageError(); cause instanceof Error &amp;&amp; |
| [src/lib/personal-db.ts:43](../src/lib/personal-db.ts#L43) | Message/fragment | Device storage is full. Your changes were not saved. Free some space and try again. | storageError(); name === 'QuotaExceededError' is true |
| [src/lib/personal-db.ts:53](../src/lib/personal-db.ts#L53) | Message/fragment | A newer version of Play 100 is using this device library. Reload your Play 100 tabs before trying again. Your data has not been overwritten. | storageError(); name === 'VersionError' is true |
| [src/lib/personal-db.ts:59](../src/lib/personal-db.ts#L59) | Message/fragment | Your device library could not be opened or saved. No pending changes were saved. Check storage permissions and retry. | storageError(); when its owning surface/operation is used |
| [src/lib/personal-db.ts:117](../src/lib/personal-db.ts#L117) | Message output | namedError('PersonalLibraryStorageError', 'The device library connection was closed. Retry to reconnect.') | pending(); when its owning surface/operation is used |
| [src/lib/personal-db.ts:117](../src/lib/personal-db.ts#L117) | Message/fragment | The device library connection was closed. Retry to reconnect. | pending(); when its owning surface/operation is used |
| [src/lib/personal-db.ts:119](../src/lib/personal-db.ts#L119) | Message output | namedError( 'PersonalLibraryBlockedError', 'The device library is blocked or is not responding. Close other Play 100 tabs, then retry. Your saved data has not been overwritten.', ) | timer(); when its owning surface/operation is used |
| [src/lib/personal-db.ts:122](../src/lib/personal-db.ts#L122) | Message/fragment | The device library is blocked or is not responding. Close other Play 100 tabs, then retry. Your saved data has not been overwritten. | timer(); when its owning surface/operation is used |
| [src/lib/personal-db.ts:131](../src/lib/personal-db.ts#L131) | Message/fragment | Device storage is unavailable. Enable storage for this site or use a supported browser to save your library. | pending(); typeof indexedDB === 'undefined' is true |
| [src/lib/personal-db.ts:136](../src/lib/personal-db.ts#L136) | Message output | storageError(cause) | pending(); operation rejected or threw |
| [src/lib/personal-db.ts:140](../src/lib/personal-db.ts#L140) | Message output | namedError( 'PersonalLibraryBlockedError', 'Close other Play 100 tabs to finish updating this device library, then retry. Your saved data has not been changed.', ) | pending(); when its owning surface/operation is used |
| [src/lib/personal-db.ts:143](../src/lib/personal-db.ts#L143) | Message/fragment | Close other Play 100 tabs to finish updating this device library, then retry. Your saved data has not been changed. | pending(); when its owning surface/operation is used |
| [src/lib/personal-db.ts:155](../src/lib/personal-db.ts#L155) | Message output | storageError(cause) | pending(); operation rejected or threw |
| [src/lib/personal-db.ts:158](../src/lib/personal-db.ts#L158) | Message output | storageError(request.error) | pending(); when its owning surface/operation is used |
| [src/lib/personal-db.ts:163](../src/lib/personal-db.ts#L163) | Message output | namedError('PersonalLibraryStorageError', 'The device library connection changed. Retry to reconnect.') | pending(); settled &#124;&#124; generation !== startedGeneration is true |
| [src/lib/personal-db.ts:163](../src/lib/personal-db.ts#L163) | Message/fragment | The device library connection changed. Retry to reconnect. | pending(); settled &#124;&#124; generation !== startedGeneration is true |
| [src/lib/personal-db.ts:210](../src/lib/personal-db.ts#L210) | Error/validation | The transaction completed without a result. | transaction(); outcome is false |
| [src/lib/personal-db.ts:259](../src/lib/personal-db.ts#L259) | Message/fragment | Your previous device library could not be accessed. Allow device storage and retry, or reset device data in Settings. The original data has not been changed. | readLegacy(); operation rejected or threw |
| [src/lib/personal-db.ts:268](../src/lib/personal-db.ts#L268) | Message/fragment | Your library is safely saved, but the previous device data changed during migration and was retained. Export your library before resetting device data. | removeLegacy(); expectedRaw !== undefined &amp;&amp; globalThis.localStorage.getItem(STORAGE_KEY) !== expectedRaw is true |
| [src/lib/personal-db.ts:273](../src/lib/personal-db.ts#L273) | Message/fragment | Your library is saved on this device, but the previous device data could not be removed. Allow device storage to finish cleanup; the old copy has been retained. | removeLegacy(); operation rejected or threw |
| [src/lib/personal-db.ts:332](../src/lib/personal-db.ts#L332) | Message/fragment | Load your device library before making changes, so previous saved data can be migrated safely. | state(); current === undefined is true |
| [src/lib/personal-db.ts:403](../src/lib/personal-db.ts#L403) | Message/fragment | The requested account storage scope is invalid. | accountStorageTransaction(); !/^account:(?:play100-online-48823b32&#124;demo-play100):[A-Za-z0-9_-]{1,128}$/.test(scope) is true |
| [src/lib/personal-db.ts:446](../src/lib/personal-db.ts#L446) | Error/validation | The transaction completed without a result. | accountJournalTransaction(); !result is true |
| [src/lib/personal-db.ts:460](../src/lib/personal-db.ts#L460) | Message/fragment | The friends selection scope is invalid. | friendSelectionStorageTransaction(); !/^account:(?:play100-online-48823b32&#124;demo-play100):[A-Za-z0-9_-]{1,128}$/.test(journal.scope) is true |
| [src/lib/personal-db.ts:469](../src/lib/personal-db.ts#L469) | Message/fragment | The shared games selection scope is invalid. | friendShelfSelectionStorageTransaction(); !/^account:(?:play100-online-48823b32&#124;demo-play100):[A-Za-z0-9_-]{1,128}$/.test(journal.scope) is true |
| [src/lib/personal-db.ts:480](../src/lib/personal-db.ts#L480) | Message/fragment | The automatic sharing scope is invalid. | friendAllWorkStorageTransaction(); !/^account:(?:play100-online-48823b32&#124;demo-play100):[A-Za-z0-9_-]{1,128}$/.test(journal.scope) is true |
| [src/lib/personal-db.ts:492](../src/lib/personal-db.ts#L492) | Message/fragment | Unknown online account project. | readOnlineLoadHint(); !/^(play100-online-48823b32&#124;demo-play100)$/.test(project) is true |
| [src/lib/personal-db.ts:525](../src/lib/personal-db.ts#L525) | Message/fragment | The remembered account marker is unreadable. Open Account to recover it. | readOnlineLoadHint(); value === undefined is false; value &amp;&amp; typeof value === 'object' &amp;&amp; 'version' in value &amp;&amp; value.version === 1 &amp;&amp; 'requested' in value &amp;&amp; typeof value.requested === 'boolean' is false |
## src/lib/personal-library.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/personal-library.ts:25](../src/lib/personal-library.ts#L25) | Error/validation | Your personal library could not be read: ${message} | error(); when its owning surface/operation is used |
| [src/lib/personal-library.ts:37](../src/lib/personal-library.ts#L37) | Message output | &#96;${label} must be an object.&#96; | result(); when its owning surface/operation is used |
| [src/lib/personal-library.ts:37](../src/lib/personal-library.ts#L37) | Message/fragment | ${label} must be an object. | result(); when its owning surface/operation is used |
| [src/lib/personal-library.ts:40](../src/lib/personal-library.ts#L40) | Message output | &#96;${label} has an unsupported object type.&#96; | object(); prototype !== Object.prototype &amp;&amp; prototype !== null is true |
| [src/lib/personal-library.ts:40](../src/lib/personal-library.ts#L40) | Message/fragment | ${label} has an unsupported object type. | object(); prototype !== Object.prototype &amp;&amp; prototype !== null is true |
| [src/lib/personal-library.ts:44](../src/lib/personal-library.ts#L44) | Message output | &#96;${label} contains an unsafe key.&#96; | object(); typeof key !== 'string' &#124;&#124; forbiddenKeys.has(key) is true |
| [src/lib/personal-library.ts:44](../src/lib/personal-library.ts#L44) | Message/fragment | ${label} contains an unsafe key. | object(); typeof key !== 'string' &#124;&#124; forbiddenKeys.has(key) is true |
| [src/lib/personal-library.ts:48](../src/lib/personal-library.ts#L48) | Message output | &#96;${label} must contain enumerable data, not accessors or hidden fields.&#96; | object(); !descriptor &#124;&#124; !('value' in descriptor) &#124;&#124; !descriptor.enumerable is true |
| [src/lib/personal-library.ts:48](../src/lib/personal-library.ts#L48) | Message/fragment | ${label} must contain enumerable data, not accessors or hidden fields. | object(); !descriptor &#124;&#124; !('value' in descriptor) &#124;&#124; !descriptor.enumerable is true |
| [src/lib/personal-library.ts:65](../src/lib/personal-library.ts#L65) | Message output | &#96;${label} has missing or unsupported fields.&#96; | shape(); required.some((key) =&gt; !Object.hasOwn(result, key)) &#124;&#124; Object.getOwnPropertyNames(result).some((key) =&gt; !required.includes(key) &amp;&amp; !optional.includes(key)) is true |
| [src/lib/personal-library.ts:65](../src/lib/personal-library.ts#L65) | Message/fragment | ${label} has missing or unsupported fields. | shape(); required.some((key) =&gt; !Object.hasOwn(result, key)) &#124;&#124; Object.getOwnPropertyNames(result).some((key) =&gt; !required.includes(key) &amp;&amp; !optional.includes(key)) is true |
| [src/lib/personal-library.ts:77](../src/lib/personal-library.ts#L77) | Message output | 'a game has an unsafe or missing ID.' | safeId(); typeof value !== 'string' &#124;&#124; value.length &gt; MAX_LIBRARY_ID_CHARACTERS &#124;&#124; !/^[A-Za-z0-9][A-Za-z0-9:_-]*$/.test(value) &#124;&#124; forbiddenKeys.has(value) is true |
| [src/lib/personal-library.ts:77](../src/lib/personal-library.ts#L77) | Message/fragment | a game has an unsafe or missing ID. | safeId(); typeof value !== 'string' &#124;&#124; value.length &gt; MAX_LIBRARY_ID_CHARACTERS &#124;&#124; !/^[A-Za-z0-9][A-Za-z0-9:_-]*$/.test(value) &#124;&#124; forbiddenKeys.has(value) is true |
| [src/lib/personal-library.ts:92](../src/lib/personal-library.ts#L92) | Message output | 'the motion preference is invalid.' | motion(); value !== 'auto' &amp;&amp; value !== 'full' &amp;&amp; value !== 'lite' is true |
| [src/lib/personal-library.ts:92](../src/lib/personal-library.ts#L92) | Message/fragment | the motion preference is invalid. | motion(); value !== 'auto' &amp;&amp; value !== 'full' &amp;&amp; value !== 'lite' is true |
| [src/lib/personal-library.ts:99](../src/lib/personal-library.ts#L99) | Message output | 'a rating must be null or a finite number from 0 to 10.' | score(); value !== null &amp;&amp; (typeof value !== 'number' &#124;&#124; !Number.isFinite(value) &#124;&#124; value &lt; 0 &#124;&#124; value &gt; 10) is true |
| [src/lib/personal-library.ts:99](../src/lib/personal-library.ts#L99) | Message/fragment | a rating must be null or a finite number from 0 to 10. | score(); value !== null &amp;&amp; (typeof value !== 'number' &#124;&#124; !Number.isFinite(value) &#124;&#124; value &lt; 0 &#124;&#124; value &gt; 10) is true |
| [src/lib/personal-library.ts:108](../src/lib/personal-library.ts#L108) | Message/fragment | A game record | input(); when its owning surface/operation is used |
| [src/lib/personal-library.ts:111](../src/lib/personal-library.ts#L111) | Message output | 'a game has an unsupported source.' | record(); !source is true |
| [src/lib/personal-library.ts:111](../src/lib/personal-library.ts#L111) | Message/fragment | a game has an unsupported source. | record(); !source is true |
| [src/lib/personal-library.ts:114](../src/lib/personal-library.ts#L114) | Message output | 'a game year must be null or an integer from 1900 to 2100.' | record(); year !== null &amp;&amp; (typeof year !== 'number' &#124;&#124; !Number.isInteger(year) &#124;&#124; year &lt; 1900 &#124;&#124; year &gt; 2100) is true |
| [src/lib/personal-library.ts:114](../src/lib/personal-library.ts#L114) | Message/fragment | a game year must be null or an integer from 1900 to 2100. | record(); year !== null &amp;&amp; (typeof year !== 'number' &#124;&#124; !Number.isInteger(year) &#124;&#124; year &lt; 1900 &#124;&#124; year &gt; 2100) is true |
| [src/lib/personal-library.ts:119](../src/lib/personal-library.ts#L119) | Message output | 'an author collection rank must be an integer from 1 to 100.' | record(); source === 'collection' is true; typeof rank !== 'number' &#124;&#124; !Number.isInteger(rank) &#124;&#124; rank &lt; 1 &#124;&#124; rank &gt; 100 is true |
| [src/lib/personal-library.ts:119](../src/lib/personal-library.ts#L119) | Message/fragment | an author collection rank must be an integer from 1 to 100. | record(); source === 'collection' is true; typeof rank !== 'number' &#124;&#124; !Number.isInteger(rank) &#124;&#124; rank &lt; 1 &#124;&#124; rank &gt; 100 is true |
| [src/lib/personal-library.ts:122](../src/lib/personal-library.ts#L122) | Message output | 'only author collection games may have an author rank.' | record(); source === 'collection' is false; rank !== null is true |
| [src/lib/personal-library.ts:122](../src/lib/personal-library.ts#L122) | Message/fragment | only author collection games may have an author rank. | record(); source === 'collection' is false; rank !== null is true |
| [src/lib/personal-library.ts:127](../src/lib/personal-library.ts#L127) | Message output | 'a source URL must be null or a valid HTTPS URL.' | record(); sourceUrl !== null is true; typeof sourceUrl !== 'string' &#124;&#124; /\s/.test(sourceUrl) &#124;&#124; !/^https:\/\//i.test(sourceUrl) is true |
| [src/lib/personal-library.ts:127](../src/lib/personal-library.ts#L127) | Message/fragment | a source URL must be null or a valid HTTPS URL. | record(); sourceUrl !== null is true; typeof sourceUrl !== 'string' &#124;&#124; /\s/.test(sourceUrl) &#124;&#124; !/^https:\/\//i.test(sourceUrl) is true |
| [src/lib/personal-library.ts:132](../src/lib/personal-library.ts#L132) | Message output | 'a source URL must be a valid HTTPS URL without credentials.' | record(); sourceUrl !== null is true; url.protocol !== 'https:' &#124;&#124; !url.hostname &#124;&#124; url.username &#124;&#124; url.password is true |
| [src/lib/personal-library.ts:132](../src/lib/personal-library.ts#L132) | Message/fragment | a source URL must be a valid HTTPS URL without credentials. | record(); sourceUrl !== null is true; url.protocol !== 'https:' &#124;&#124; !url.hostname &#124;&#124; url.username &#124;&#124; url.password is true |
| [src/lib/personal-library.ts:135](../src/lib/personal-library.ts#L135) | Message output | 'a source URL must be null or a valid HTTPS URL.' | record(); sourceUrl !== null is true; operation rejected or threw |
| [src/lib/personal-library.ts:135](../src/lib/personal-library.ts#L135) | Message/fragment | a source URL must be null or a valid HTTPS URL. | record(); sourceUrl !== null is true; operation rejected or threw |
| [src/lib/personal-library.ts:140](../src/lib/personal-library.ts#L140) | Message/fragment | A game title | record(); when its owning surface/operation is used |
| [src/lib/personal-library.ts:152](../src/lib/personal-library.ts#L152) | Message/fragment | Game progress | input(); when its owning surface/operation is used |
| [src/lib/personal-library.ts:159](../src/lib/personal-library.ts#L159) | Message output | 'game progress must use booleans, and completed games must also be played.' | progress(); typeof input.later !== 'boolean' &#124;&#124; typeof input.completed !== 'boolean' &#124;&#124; typeof input.played !== 'boolean' &#124;&#124; (input.completed &amp;&amp; !input.played) is true |
| [src/lib/personal-library.ts:159](../src/lib/personal-library.ts#L159) | Message/fragment | game progress must use booleans, and completed games must also be played. | progress(); typeof input.later !== 'boolean' &#124;&#124; typeof input.completed !== 'boolean' &#124;&#124; typeof input.played !== 'boolean' &#124;&#124; (input.completed &amp;&amp; !input.played) is true |
| [src/lib/personal-library.ts:168](../src/lib/personal-library.ts#L168) | Message/fragment | A personal ranking | input(); when its owning surface/operation is used |
| [src/lib/personal-library.ts:172](../src/lib/personal-library.ts#L172) | Message output | 'a manual rank must be null or a positive integer.' | ranking(); position !== null &amp;&amp; (typeof position !== 'number' &#124;&#124; !Number.isInteger(position) &#124;&#124; position &lt; 1) is true |
| [src/lib/personal-library.ts:172](../src/lib/personal-library.ts#L172) | Message/fragment | a manual rank must be null or a positive integer. | ranking(); position !== null &amp;&amp; (typeof position !== 'number' &#124;&#124; !Number.isInteger(position) &#124;&#124; position &lt; 1) is true |
| [src/lib/personal-library.ts:184](../src/lib/personal-library.ts#L184) | Message output | &#96;${label} must be a list of at most ${MAX_RECORDS} items.&#96; | list(); !Array.isArray(value) &#124;&#124; value.length &gt; MAX_RECORDS is true |
| [src/lib/personal-library.ts:184](../src/lib/personal-library.ts#L184) | Message/fragment | ${label} must be a list of at most ${MAX_RECORDS} items. | list(); !Array.isArray(value) &#124;&#124; value.length &gt; MAX_RECORDS is true |
| [src/lib/personal-library.ts:191](../src/lib/personal-library.ts#L191) | Message output | 'the revision limit has been reached. Export your library before resetting it.' | nextRevision(); revision &gt;= Number.MAX_SAFE_INTEGER is true |
| [src/lib/personal-library.ts:191](../src/lib/personal-library.ts#L191) | Message/fragment | the revision limit has been reached. Export your library before resetting it. | nextRevision(); revision &gt;= Number.MAX_SAFE_INTEGER is true |
| [src/lib/personal-library.ts:212](../src/lib/personal-library.ts#L212) | Message/fragment | The library | input(); when its owning surface/operation is used |
| [src/lib/personal-library.ts:220](../src/lib/personal-library.ts#L220) | Message output | 'the saved version or revision is unsupported.' | parsePersonalLibrary(); (input.version !== 2 &amp;&amp; input.version !== 3) &#124;&#124; typeof input.revision !== 'number' &#124;&#124; !Number.isSafeInteger(input.revision) &#124;&#124; input.revision &lt; 0 is true |
| [src/lib/personal-library.ts:220](../src/lib/personal-library.ts#L220) | Message/fragment | the saved version or revision is unsupported. | parsePersonalLibrary(); (input.version !== 2 &amp;&amp; input.version !== 3) &#124;&#124; typeof input.revision !== 'number' &#124;&#124; !Number.isSafeInteger(input.revision) &#124;&#124; input.revision &lt; 0 is true |
| [src/lib/personal-library.ts:225](../src/lib/personal-library.ts#L225) | Message/fragment | Game records | records(); when its owning surface/operation is used |
| [src/lib/personal-library.ts:226](../src/lib/personal-library.ts#L226) | Message output | &#96;a library cannot exceed ${MAX_RECORDS} games.&#96; | parsePersonalLibrary(); records.length &gt; MAX_RECORDS is true |
| [src/lib/personal-library.ts:226](../src/lib/personal-library.ts#L226) | Message/fragment | a library cannot exceed ${MAX_RECORDS} games. | parsePersonalLibrary(); records.length &gt; MAX_RECORDS is true |
| [src/lib/personal-library.ts:229](../src/lib/personal-library.ts#L229) | Message output | 'a game record does not match its ID.' | parsePersonalLibrary(); safeId(id) !== parsed.id is true |
| [src/lib/personal-library.ts:229](../src/lib/personal-library.ts#L229) | Message/fragment | a game record does not match its ID. | parsePersonalLibrary(); safeId(id) !== parsed.id is true |
| [src/lib/personal-library.ts:232](../src/lib/personal-library.ts#L232) | Message/fragment | Game progress | parsePersonalLibrary(); when its owning surface/operation is used |
| [src/lib/personal-library.ts:233](../src/lib/personal-library.ts#L233) | Message output | 'progress refers to a missing game.' | parsePersonalLibrary(); !result.records[safeId(id)] is true |
| [src/lib/personal-library.ts:233](../src/lib/personal-library.ts#L233) | Message/fragment | progress refers to a missing game. | parsePersonalLibrary(); !result.records[safeId(id)] is true |
| [src/lib/personal-library.ts:237](../src/lib/personal-library.ts#L237) | Message/fragment | Play later | parsePersonalLibrary(); when its owning surface/operation is used |
| [src/lib/personal-library.ts:240](../src/lib/personal-library.ts#L240) | Message output | 'Play later has a duplicate, missing, or unselected game.' | parsePersonalLibrary(); queued.has(id) &#124;&#124; !result.records[id] &#124;&#124; !result.progress[id]?.later is true |
| [src/lib/personal-library.ts:240](../src/lib/personal-library.ts#L240) | Message/fragment | Play later has a duplicate, missing, or unselected game. | parsePersonalLibrary(); queued.has(id) &#124;&#124; !result.records[id] &#124;&#124; !result.progress[id]?.later is true |
| [src/lib/personal-library.ts:246](../src/lib/personal-library.ts#L246) | Message output | 'Play later is missing a selected game.' | parsePersonalLibrary(); Object.entries(result.progress).some(([id, value]) =&gt; value.later &amp;&amp; !queued.has(id)) is true |
| [src/lib/personal-library.ts:246](../src/lib/personal-library.ts#L246) | Message/fragment | Play later is missing a selected game. | parsePersonalLibrary(); Object.entries(result.progress).some(([id, value]) =&gt; value.later &amp;&amp; !queued.has(id)) is true |
| [src/lib/personal-library.ts:250](../src/lib/personal-library.ts#L250) | Message/fragment | Personal rankings | entries(); when its owning surface/operation is used |
| [src/lib/personal-library.ts:254](../src/lib/personal-library.ts#L254) | Message output | 'personal rankings contain a duplicate or missing game.' | parsePersonalLibrary(); ranked.has(parsed.id) &#124;&#124; !result.records[parsed.id] is true |
| [src/lib/personal-library.ts:254](../src/lib/personal-library.ts#L254) | Message/fragment | personal rankings contain a duplicate or missing game. | parsePersonalLibrary(); ranked.has(parsed.id) &#124;&#124; !result.records[parsed.id] is true |
| [src/lib/personal-library.ts:258](../src/lib/personal-library.ts#L258) | Message output | 'manual ranking positions must be unique and inside the ranking.' | parsePersonalLibrary(); parsed.manualPosition !== null is true; parsed.manualPosition &gt; entries.length &#124;&#124; positions.has(parsed.manualPosition) is true |
| [src/lib/personal-library.ts:258](../src/lib/personal-library.ts#L258) | Message/fragment | manual ranking positions must be unique and inside the ranking. | parsePersonalLibrary(); parsed.manualPosition !== null is true; parsed.manualPosition &gt; entries.length &#124;&#124; positions.has(parsed.manualPosition) is true |
| [src/lib/personal-library.ts:270](../src/lib/personal-library.ts#L270) | Message/fragment | Games to add | records(); when its owning surface/operation is used |
| [src/lib/personal-library.ts:276](../src/lib/personal-library.ts#L276) | Message output | &#96;a library cannot exceed ${MAX_RECORDS} games.&#96; | addRecords(); Object.keys(state.records).length &gt; MAX_RECORDS is true |
| [src/lib/personal-library.ts:276](../src/lib/personal-library.ts#L276) | Message/fragment | a library cannot exceed ${MAX_RECORDS} games. | addRecords(); Object.keys(state.records).length &gt; MAX_RECORDS is true |
| [src/lib/personal-library.ts:283](../src/lib/personal-library.ts#L283) | Message output | 'the progress action is unsupported.' | progressKey(); value !== 'later' &amp;&amp; value !== 'completed' &amp;&amp; value !== 'played' is true |
| [src/lib/personal-library.ts:283](../src/lib/personal-library.ts#L283) | Message/fragment | the progress action is unsupported. | progressKey(); value !== 'later' &amp;&amp; value !== 'completed' &amp;&amp; value !== 'played' is true |
| [src/lib/personal-library.ts:311](../src/lib/personal-library.ts#L311) | Message output | 'a game being moved is no longer in this list. Refresh and try again.' | move(); from &lt; 0 &#124;&#124; to &lt; 0 is true |
| [src/lib/personal-library.ts:311](../src/lib/personal-library.ts#L311) | Message/fragment | a game being moved is no longer in this list. Refresh and try again. | move(); from &lt; 0 &#124;&#124; to &lt; 0 is true |
| [src/lib/personal-library.ts:313](../src/lib/personal-library.ts#L313) | Message output | 'the game being moved is missing.' | move(); item === undefined is true |
| [src/lib/personal-library.ts:313](../src/lib/personal-library.ts#L313) | Message/fragment | the game being moved is missing. | move(); item === undefined is true |
| [src/lib/personal-library.ts:372](../src/lib/personal-library.ts#L372) | Message/fragment | The library action | input(); when its owning surface/operation is used |
| [src/lib/personal-library.ts:376](../src/lib/personal-library.ts#L376) | Message/fragment | The add games action | applyPersonalActionWithin(); case 'add-records' |
| [src/lib/personal-library.ts:380](../src/lib/personal-library.ts#L380) | Message/fragment | The private library removal | applyPersonalActionWithin(); case 'remove-records' |
| [src/lib/personal-library.ts:381](../src/lib/personal-library.ts#L381) | Message/fragment | Games to remove | ids(); case 'remove-records' |
| [src/lib/personal-library.ts:392](../src/lib/personal-library.ts#L392) | Message/fragment | The progress action | applyPersonalActionWithin(); case 'set-progress' |
| [src/lib/personal-library.ts:394](../src/lib/personal-library.ts#L394) | Message output | 'a progress change must be a boolean.' | applyPersonalActionWithin(); case 'set-progress'; typeof input.value !== 'boolean' is true |
| [src/lib/personal-library.ts:394](../src/lib/personal-library.ts#L394) | Message/fragment | a progress change must be a boolean. | applyPersonalActionWithin(); case 'set-progress'; typeof input.value !== 'boolean' is true |
| [src/lib/personal-library.ts:401](../src/lib/personal-library.ts#L401) | Message/fragment | The progress action | applyPersonalActionWithin(); case 'toggle-progress' |
| [src/lib/personal-library.ts:404](../src/lib/personal-library.ts#L404) | Message output | 'the game to update is missing.' | applyPersonalActionWithin(); case 'toggle-progress'; !item is true |
| [src/lib/personal-library.ts:404](../src/lib/personal-library.ts#L404) | Message/fragment | the game to update is missing. | applyPersonalActionWithin(); case 'toggle-progress'; !item is true |
| [src/lib/personal-library.ts:409](../src/lib/personal-library.ts#L409) | Message/fragment | The ranking action | applyPersonalActionWithin(); case 'add-ranking' |
| [src/lib/personal-library.ts:420](../src/lib/personal-library.ts#L420) | Message/fragment | The ranking removal | applyPersonalActionWithin(); case 'remove-ranking' |
| [src/lib/personal-library.ts:421](../src/lib/personal-library.ts#L421) | Message/fragment | Games to remove | ids(); case 'remove-ranking' |
| [src/lib/personal-library.ts:427](../src/lib/personal-library.ts#L427) | Message/fragment | The ranking edit | applyPersonalActionWithin(); case 'edit-ranking' |
| [src/lib/personal-library.ts:430](../src/lib/personal-library.ts#L430) | Message output | 'the ranking being edited no longer exists.' | applyPersonalActionWithin(); case 'edit-ranking'; !item is true |
| [src/lib/personal-library.ts:430](../src/lib/personal-library.ts#L430) | Message/fragment | the ranking being edited no longer exists. | applyPersonalActionWithin(); case 'edit-ranking'; !item is true |
| [src/lib/personal-library.ts:436](../src/lib/personal-library.ts#L436) | Message/fragment | The save game rating action | applyPersonalActionWithin(); case 'rate-game' |
| [src/lib/personal-library.ts:439](../src/lib/personal-library.ts#L439) | Message output | 'the game being rated is missing.' | applyPersonalActionWithin(); case 'rate-game'; !game is true |
| [src/lib/personal-library.ts:439](../src/lib/personal-library.ts#L439) | Message/fragment | the game being rated is missing. | applyPersonalActionWithin(); case 'rate-game'; !game is true |
| [src/lib/personal-library.ts:450](../src/lib/personal-library.ts#L450) | Message/fragment | The absolute ranking move | applyPersonalActionWithin(); case 'move-item'; Object.hasOwn(input, 'position') is true |
| [src/lib/personal-library.ts:460](../src/lib/personal-library.ts#L460) | Message output | 'a ranking position must be an integer inside the current ranking.' | applyPersonalActionWithin(); case 'move-item'; Object.hasOwn(input, 'position') is true; input.list !== 'ranking' &#124;&#124; typeof position !== 'number' &#124;&#124; !Number.isInteger(position) &#124;&#124; position &lt; 1 &#124;&#124; position &gt; result.ranking.length is true |
| [src/lib/personal-library.ts:460](../src/lib/personal-library.ts#L460) | Message/fragment | a ranking position must be an integer inside the current ranking. | applyPersonalActionWithin(); case 'move-item'; Object.hasOwn(input, 'position') is true; input.list !== 'ranking' &#124;&#124; typeof position !== 'number' &#124;&#124; !Number.isInteger(position) &#124;&#124; position &lt; 1 &#124;&#124; position &gt; result.ranking.length is true |
| [src/lib/personal-library.ts:463](../src/lib/personal-library.ts#L463) | Message output | 'the requested ranking position no longer exists.' | applyPersonalActionWithin(); case 'move-item'; Object.hasOwn(input, 'position') is true; !target is true |
| [src/lib/personal-library.ts:463](../src/lib/personal-library.ts#L463) | Message/fragment | the requested ranking position no longer exists. | applyPersonalActionWithin(); case 'move-item'; Object.hasOwn(input, 'position') is true; !target is true |
| [src/lib/personal-library.ts:468](../src/lib/personal-library.ts#L468) | Message/fragment | The reorder action | applyPersonalActionWithin(); case 'move-item' |
| [src/lib/personal-library.ts:476](../src/lib/personal-library.ts#L476) | Message output | 'the game being moved is missing.' | applyPersonalActionWithin(); case 'move-item'; input.list === 'queue' is false; input.list === 'ranking' is true; id !== overId is false; !result.ranking.some((entry) =&gt; entry.id === id) is true |
| [src/lib/personal-library.ts:476](../src/lib/personal-library.ts#L476) | Message/fragment | the game being moved is missing. | applyPersonalActionWithin(); case 'move-item'; input.list === 'queue' is false; input.list === 'ranking' is true; id !== overId is false; !result.ranking.some((entry) =&gt; entry.id === id) is true |
| [src/lib/personal-library.ts:477](../src/lib/personal-library.ts#L477) | Message output | 'the list to reorder is unsupported.' | applyPersonalActionWithin(); case 'move-item'; input.list === 'queue' is false; input.list === 'ranking' is false |
| [src/lib/personal-library.ts:477](../src/lib/personal-library.ts#L477) | Message/fragment | the list to reorder is unsupported. | applyPersonalActionWithin(); case 'move-item'; input.list === 'queue' is false; input.list === 'ranking' is false |
| [src/lib/personal-library.ts:481](../src/lib/personal-library.ts#L481) | Message/fragment | The automatic ranking action | applyPersonalActionWithin(); case 'use-rating-order' |
| [src/lib/personal-library.ts:484](../src/lib/personal-library.ts#L484) | Message output | 'the ranking position being reset no longer exists.' | applyPersonalActionWithin(); case 'use-rating-order'; id !== null &amp;&amp; !result.ranking.some((entry) =&gt; entry.id === id) is true |
| [src/lib/personal-library.ts:484](../src/lib/personal-library.ts#L484) | Message/fragment | the ranking position being reset no longer exists. | applyPersonalActionWithin(); case 'use-rating-order'; id !== null &amp;&amp; !result.ranking.some((entry) =&gt; entry.id === id) is true |
| [src/lib/personal-library.ts:492](../src/lib/personal-library.ts#L492) | Message/fragment | The motion action | applyPersonalActionWithin(); case 'set-motion' |
| [src/lib/personal-library.ts:496](../src/lib/personal-library.ts#L496) | Message output | 'the requested library action is unsupported.' | applyPersonalActionWithin(); when its owning surface/operation is used |
| [src/lib/personal-library.ts:496](../src/lib/personal-library.ts#L496) | Message/fragment | the requested library action is unsupported. | applyPersonalActionWithin(); when its owning surface/operation is used |
| [src/lib/personal-library.ts:508](../src/lib/personal-library.ts#L508) | Message/fragment | This change would take your library past its ${formatBackupLimit(budget)} backup limit. Remove games or shorten notes, then try again. Nothing was changed. | applyPersonalActionWithin(); after &gt; budget is true; after - revisionDigits &gt; libraryBackupBytes(prior) is true |
| [src/lib/personal-library.ts:517](../src/lib/personal-library.ts#L517) | Message output | 'the previous library must be saved JSON text.' | migrateLegacyLibrary(); typeof raw !== 'string' is true |
| [src/lib/personal-library.ts:517](../src/lib/personal-library.ts#L517) | Message/fragment | the previous library must be saved JSON text. | migrateLegacyLibrary(); typeof raw !== 'string' is true |
| [src/lib/personal-library.ts:520](../src/lib/personal-library.ts#L520) | Message/fragment | The author collection | migrateLegacyLibrary(); when its owning surface/operation is used |
| [src/lib/personal-library.ts:522](../src/lib/personal-library.ts#L522) | Message output | 'the author collection contains an invalid or duplicate game.' | migrateLegacyLibrary(); item.source !== 'collection' &#124;&#124; canonical[item.id] is true |
| [src/lib/personal-library.ts:522](../src/lib/personal-library.ts#L522) | Message/fragment | the author collection contains an invalid or duplicate game. | migrateLegacyLibrary(); item.source !== 'collection' &#124;&#124; canonical[item.id] is true |
| [src/lib/personal-library.ts:530](../src/lib/personal-library.ts#L530) | Error/validation | The previous library contains an unknown game ID: ${id}. | migrateLegacyLibrary(); !item is true |
| [src/lib/personal-library.ts:541](../src/lib/personal-library.ts#L541) | Error/validation | Your previous device library could not be migrated.${detail} The original data has not been changed. | error(); operation rejected or threw |
| [src/lib/personal-library.ts:570](../src/lib/personal-library.ts#L570) | Message/fragment | This library is ${over} over its ${formatBackupLimit(budget)} backup limit, so no file was made. Remove games or shorten notes by at least ${over}, then export again. Nothing was changed. | exportLibraryBackup(); when its owning surface/operation is used |
## src/lib/personal-types.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/personal-types.ts:95](../src/lib/personal-types.ts#L95) | Message/fragment | Steam | SOURCE_LABELS(); when its owning surface/operation is used |
| [src/lib/personal-types.ts:96](../src/lib/personal-types.ts#L96) | Message/fragment | Wikidata | SOURCE_LABELS(); when its owning surface/operation is used |
| [src/lib/personal-types.ts:97](../src/lib/personal-types.ts#L97) | Message/fragment | FreeToGame | SOURCE_LABELS(); when its owning surface/operation is used |
| [src/lib/personal-types.ts:98](../src/lib/personal-types.ts#L98) | Message/fragment | Added by you | SOURCE_LABELS(); when its owning surface/operation is used |
## src/lib/ranking-order.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/ranking-order.ts:18](../src/lib/ranking-order.ts#L18) | Error/validation | The personal ranking contains inconsistent manual positions. | orderByRating(); !entry is true |
## src/lib/result-range.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/result-range.ts:9](../src/lib/result-range.ts#L9) | Error/validation | Result counts require a valid range within the nonnegative total. | formatResultRange(); ![total, start, end].every(Number.isSafeInteger) &#124;&#124; total &lt; 0 &#124;&#124; (total === 0 ? start !== 0 &#124;&#124; end !== 0 : start &lt; 1 &#124;&#124; end &lt; start &#124;&#124; end &gt; total) is true |
| [src/lib/result-range.ts:12](../src/lib/result-range.ts#L12) | Message/fragment | ${start}–${end} of ${total} ${item}s | formatResultRange(); when its owning surface/operation is used |
## src/lib/scoped-library.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/scoped-library.ts:37](../src/lib/scoped-library.ts#L37) | Error/validation | This account's device copy was removed in another tab. This older edit was not saved. Sign in again to open a new copy. | error(); when its owning surface/operation is used |
| [src/lib/scoped-library.ts:59](../src/lib/scoped-library.ts#L59) | Message output | 'The account writer marker is invalid. Its saved data has not been changed.' | writerStatus(); !value &#124;&#124; typeof value !== 'object' &#124;&#124; Array.isArray(value) &#124;&#124; Object.keys(value).sort().join(',') !== 'generation,retired,version' &#124;&#124; !('version' in value) &#124;&#124; value.version !== 1 &#124;&#124; !('generation' in value) &#124;&#124; typeof value.generation !== 'number' &#124;&#124; !Number.isSafeInteger(value.generation) &#124;&#124; value.generation &lt; 0 &#124;&#124; !('retired' in value) &#124;&#124; typeof value.retired !== 'boolean' is true |
| [src/lib/scoped-library.ts:59](../src/lib/scoped-library.ts#L59) | Message/fragment | The account writer marker is invalid. Its saved data has not been changed. | writerStatus(); !value &#124;&#124; typeof value !== 'object' &#124;&#124; Array.isArray(value) &#124;&#124; Object.keys(value).sort().join(',') !== 'generation,retired,version' &#124;&#124; !('version' in value) &#124;&#124; value.version !== 1 &#124;&#124; !('generation' in value) &#124;&#124; typeof value.generation !== 'number' &#124;&#124; !Number.isSafeInteger(value.generation) &#124;&#124; value.generation &lt; 0 &#124;&#124; !('retired' in value) &#124;&#124; typeof value.retired !== 'boolean' is true |
| [src/lib/scoped-library.ts:134](../src/lib/scoped-library.ts#L134) | Error/validation | Account sync metadata is invalid. Existing local data is retained. | parseSyncMetadata(); !value &#124;&#124; typeof value !== 'object' &#124;&#124; Array.isArray(value) is true |
| [src/lib/scoped-library.ts:156](../src/lib/scoped-library.ts#L156) | Error/validation | Account sync metadata is invalid. Existing local data is retained. | parseSyncMetadata(); Object.keys(meta).sort().join(',') !== 'baseRemoteRevision,dataRevision,dirty,displayName,enabled,epoch,lastSyncedAt,remoteGeneration' &#124;&#124; typeof meta.enabled !== 'boolean' &#124;&#124; typeof meta.dirty !== 'boolean' &#124;&#124; typeof meta.displayName !== 'string' &#124;&#124; meta.displayName.length &gt; 60 &#124;&#124; typeof meta.epoch !== 'number' &#124;&#124; !Number.isSafeInteger(meta.epoch) &#124;&#124; meta.epoch &lt; 0 &#124;&#124; typeof meta.baseRemoteRevision !== 'number' &#124;&#124; !Number.isSafeInteger(meta.baseRemoteRevision) &#124;&#124; meta.baseRemoteRevision &lt; 0 &#124;&#124; typeof meta.dataRevision !== 'number' &#124;&#124; !Number.isSafeInteger(meta.dataRevision) &#124;&#124; meta.dataRevision &lt; 0 &#124;&#124; (meta.remoteGeneration !== null &amp;&amp; (typeof meta.remoteGeneration !== 'string' &#124;&#124; !/^[a-f0-9-]{36}$/.test(meta.remoteGeneration))) &#124;&#124; (meta.lastSyncedAt !== null &amp;&amp; (typeof meta.lastSyncedAt !== 'number' &#124;&#124; !Number.isFinite(meta.lastSyncedAt))) is true |
| [src/lib/scoped-library.ts:172](../src/lib/scoped-library.ts#L172) | Error/validation | This account's copy on this device is unreadable. It has not been overwritten. | parseScopedEnvelope(); !value &#124;&#124; typeof value !== 'object' &#124;&#124; Array.isArray(value) is true |
| [src/lib/scoped-library.ts:187](../src/lib/scoped-library.ts#L187) | Error/validation | This device copy belongs to a different account or app version. Nothing was changed. | parseScopedEnvelope(); row.version !== 1 &#124;&#124; row.scope !== scope &#124;&#124; ![ 'recovery,scope,state,sync,version', 'profile,recovery,scope,state,sync,version', 'recovery,scope,state,sync,version,writerGeneration', 'profile,recovery,scope,state,sync,version,writerGeneration', ].includes(Object.keys(row).sort().join(',')) &#124;&#124; !row.sync &#124;&#124; typeof row.sync !== 'object' &#124;&#124; Array.isArray(row.sync) is true |
| [src/lib/scoped-library.ts:190](../src/lib/scoped-library.ts#L190) | Message output | 'The account writer generation is invalid. Its saved data has not been changed.' | parseScopedEnvelope(); typeof writerGeneration !== 'number' &#124;&#124; !Number.isSafeInteger(writerGeneration) &#124;&#124; writerGeneration &lt; 0 is true |
| [src/lib/scoped-library.ts:190](../src/lib/scoped-library.ts#L190) | Message/fragment | The account writer generation is invalid. Its saved data has not been changed. | parseScopedEnvelope(); typeof writerGeneration !== 'number' &#124;&#124; !Number.isSafeInteger(writerGeneration) &#124;&#124; writerGeneration &lt; 0 is true |
| [src/lib/scoped-library.ts:203](../src/lib/scoped-library.ts#L203) | Error/validation | This account profile could not be read from the device. | parseScopedEnvelope(); row.profile !== undefined &amp;&amp; row.profile !== null is true; !row.profile &#124;&#124; typeof row.profile !== 'object' &#124;&#124; !('displayName' in row.profile) &#124;&#124; typeof row.profile.displayName !== 'string' &#124;&#124; row.profile.displayName.length &gt; 60 &#124;&#124; !('avatar' in row.profile) is true |
| [src/lib/scoped-library.ts:216](../src/lib/scoped-library.ts#L216) | Error/validation | The account recovery copy is invalid. | parseScopedEnvelope(); row.recovery !== null is true; !row.recovery &#124;&#124; typeof row.recovery !== 'object' &#124;&#124; !('state' in row.recovery) &#124;&#124; !('savedAt' in row.recovery) &#124;&#124; typeof row.recovery.savedAt !== 'number' &#124;&#124; !('reason' in row.recovery) &#124;&#124; typeof row.recovery.reason !== 'string' is true |
| [src/lib/scoped-library.ts:341](../src/lib/scoped-library.ts#L341) | Message/fragment | Before replacing this account library | restoreScopedLibrary(); when its owning surface/operation is used |
| [src/lib/scoped-library.ts:367](../src/lib/scoped-library.ts#L367) | Message output | 'This account library or connection changed while the preview was open. Your current copy is intact; review the connection again.' | connectScopedLibrary(); current.state.revision !== expected.localRevision &#124;&#124; current.sync.epoch !== expected.epoch &#124;&#124; current.sync.enabled !== expected.enabled is true |
| [src/lib/scoped-library.ts:368](../src/lib/scoped-library.ts#L368) | Message/fragment | This account library or connection changed while the preview was open. Your current copy is intact; review the connection again. | connectScopedLibrary(); current.state.revision !== expected.localRevision &#124;&#124; current.sync.epoch !== expected.epoch &#124;&#124; current.sync.enabled !== expected.enabled is true |
| [src/lib/scoped-library.ts:384](../src/lib/scoped-library.ts#L384) | Message/fragment | Before connecting this account library | connectScopedLibrary(); when its owning surface/operation is used |
| [src/lib/scoped-library.ts:414](../src/lib/scoped-library.ts#L414) | Message output | 'An active, previously saved online copy is required before restoring this account.' | restoreConsentedAccount(); member.uid !== scopeUid(scope) &#124;&#124; member.consentVersion !== 1 &#124;&#124; !head.enabled &#124;&#124; head.deleted &#124;&#124; !head.current is true |
| [src/lib/scoped-library.ts:414](../src/lib/scoped-library.ts#L414) | Message/fragment | An active, previously saved online copy is required before restoring this account. | restoreConsentedAccount(); member.uid !== scopeUid(scope) &#124;&#124; member.consentVersion !== 1 &#124;&#124; !head.enabled &#124;&#124; head.deleted &#124;&#124; !head.current is true |
| [src/lib/scoped-library.ts:420](../src/lib/scoped-library.ts#L420) | Message output | 'This account copy changed or was previously connected. Its data and connection choice are retained.' | restoreConsentedAccount(); !isCurrent() &#124;&#124; !isInitialAccountCache(current) is true |
| [src/lib/scoped-library.ts:421](../src/lib/scoped-library.ts#L421) | Message/fragment | This account copy changed or was previously connected. Its data and connection choice are retained. | restoreConsentedAccount(); !isCurrent() &#124;&#124; !isInitialAccountCache(current) is true |
| [src/lib/scoped-library.ts:450](../src/lib/scoped-library.ts#L450) | Message output | 'The account session changed before acknowledging the upload. Its pending copy is retained.' | acknowledgeScopedUpload(); !isCurrent() is true |
| [src/lib/scoped-library.ts:450](../src/lib/scoped-library.ts#L450) | Message/fragment | The account session changed before acknowledging the upload. Its pending copy is retained. | acknowledgeScopedUpload(); !isCurrent() is true |
| [src/lib/scoped-library.ts:486](../src/lib/scoped-library.ts#L486) | Message output | 'Your local library or online permission changed while the online copy was loading. Both copies are safe; review them again.' | adoptScopedRemote(); !canAdopt() &#124;&#124; !current.sync.enabled &#124;&#124; current.sync.epoch !== head.epoch &#124;&#124; !head.enabled &#124;&#124; head.deleted &#124;&#124; current.state.revision !== expectedLocalRevision &#124;&#124; (!replace &amp;&amp; current.sync.dirty) &#124;&#124; head.revision &lt; current.sync.baseRemoteRevision is true |
| [src/lib/scoped-library.ts:487](../src/lib/scoped-library.ts#L487) | Message/fragment | Your local library or online permission changed while the online copy was loading. Both copies are safe; review them again. | adoptScopedRemote(); !canAdopt() &#124;&#124; !current.sync.enabled &#124;&#124; current.sync.epoch !== head.epoch &#124;&#124; !head.enabled &#124;&#124; head.deleted &#124;&#124; current.state.revision !== expectedLocalRevision &#124;&#124; (!replace &amp;&amp; current.sync.dirty) &#124;&#124; head.revision &lt; current.sync.baseRemoteRevision is true |
| [src/lib/scoped-library.ts:505](../src/lib/scoped-library.ts#L505) | Message/fragment | Before choosing the online conflict copy | adoptScopedRemote(); replace is true |
| [src/lib/scoped-library.ts:505](../src/lib/scoped-library.ts#L505) | Message/fragment | Previous online snapshot | adoptScopedRemote(); replace is false |
| [src/lib/scoped-library.ts:518](../src/lib/scoped-library.ts#L518) | Message output | 'The online session changed before it could be paused. Its current state is retained.' | pauseScopedLibrary(); !isCurrent() &#124;&#124; (expectedEpoch !== undefined &amp;&amp; current.sync.epoch !== expectedEpoch) is true |
| [src/lib/scoped-library.ts:518](../src/lib/scoped-library.ts#L518) | Message/fragment | The online session changed before it could be paused. Its current state is retained. | pauseScopedLibrary(); !isCurrent() &#124;&#124; (expectedEpoch !== undefined &amp;&amp; current.sync.epoch !== expectedEpoch) is true |
| [src/lib/scoped-library.ts:538](../src/lib/scoped-library.ts#L538) | Message output | 'Your device copy or online permission changed. Review the replacement again.' | rebaseScopedLibrary(); !isCurrent() &#124;&#124; !current.sync.enabled &#124;&#124; !head.enabled &#124;&#124; head.deleted &#124;&#124; current.sync.epoch !== head.epoch &#124;&#124; current.state.revision !== expectedLocalRevision is true |
| [src/lib/scoped-library.ts:538](../src/lib/scoped-library.ts#L538) | Message/fragment | Your device copy or online permission changed. Review the replacement again. | rebaseScopedLibrary(); !isCurrent() &#124;&#124; !current.sync.enabled &#124;&#124; !head.enabled &#124;&#124; head.deleted &#124;&#124; current.sync.epoch !== head.epoch &#124;&#124; current.state.revision !== expectedLocalRevision is true |
| [src/lib/scoped-library.ts:580](../src/lib/scoped-library.ts#L580) | Message output | 'The device-copy generation limit was reached. No data was removed.' | retireCopy(); status.generation &gt;= Number.MAX_SAFE_INTEGER is true |
| [src/lib/scoped-library.ts:580](../src/lib/scoped-library.ts#L580) | Message/fragment | The device-copy generation limit was reached. No data was removed. | retireCopy(); status.generation &gt;= Number.MAX_SAFE_INTEGER is true |
| [src/lib/scoped-library.ts:603](../src/lib/scoped-library.ts#L603) | Message output | 'Signed out, but this device copy changed or has unsynced edits. It was kept. Sign in to save or export it before removing it.' | deleteScopedLibrary(); expectedRevision !== undefined &amp;&amp; value !== undefined is true; current.sync.dirty &#124;&#124; current.state.revision !== expectedRevision is true |
| [src/lib/scoped-library.ts:604](../src/lib/scoped-library.ts#L604) | Message/fragment | Signed out, but this device copy changed or has unsynced edits. It was kept. Sign in to save or export it before removing it. | deleteScopedLibrary(); expectedRevision !== undefined &amp;&amp; value !== undefined is true; current.sync.dirty &#124;&#124; current.state.revision !== expectedRevision is true |
| [src/lib/scoped-library.ts:660](../src/lib/scoped-library.ts#L660) | Message output | 'A profile from another account cannot be cached here.' | cacheScopedProfile(); scopeUid(scope) !== member.uid is true |
| [src/lib/scoped-library.ts:660](../src/lib/scoped-library.ts#L660) | Message/fragment | A profile from another account cannot be cached here. | cacheScopedProfile(); scopeUid(scope) !== member.uid is true |
| [src/lib/scoped-library.ts:662](../src/lib/scoped-library.ts#L662) | Message output | 'The account changed before its profile could be cached.' | cacheScopedProfile(); !isCurrent() is true |
| [src/lib/scoped-library.ts:662](../src/lib/scoped-library.ts#L662) | Message/fragment | The account changed before its profile could be cached. | cacheScopedProfile(); !isCurrent() is true |
## src/lib/snapshot-transport.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/snapshot-transport.ts:16](../src/lib/snapshot-transport.ts#L16) | Error/validation | Unsupported snapshot value. | stable(); value === undefined &#124;&#124; typeof value === 'function' &#124;&#124; typeof value === 'symbol' is true |
| [src/lib/snapshot-transport.ts:35](../src/lib/snapshot-transport.ts#L35) | Error/validation | Part of the online copy could not be read. | decode(); !/^[A-Za-z0-9+/]*={0,2}$/.test(value) &#124;&#124; value.length % 4 !== 0 is true |
| [src/lib/snapshot-transport.ts:42](../src/lib/snapshot-transport.ts#L42) | Error/validation | The file list for this online copy could not be read. | parseManifest(); !value &#124;&#124; typeof value !== 'object' &#124;&#124; Array.isArray(value) is true |
| [src/lib/snapshot-transport.ts:60](../src/lib/snapshot-transport.ts#L60) | Error/validation | This online copy has an unsupported format, size or checksum. Your device data is unchanged. | parseManifest(); Object.keys(row).sort().join(',') !== 'bytes,chunks,digest,format,generation' &#124;&#124; row.format !== 1 &#124;&#124; typeof row.generation !== 'string' &#124;&#124; !/^[a-f0-9-]{36}$/.test(row.generation) &#124;&#124; typeof row.digest !== 'string' &#124;&#124; !/^[a-f0-9]{64}$/.test(row.digest) &#124;&#124; typeof row.bytes !== 'number' &#124;&#124; !Number.isSafeInteger(row.bytes) &#124;&#124; row.bytes &lt; 1 &#124;&#124; row.bytes &gt; MAX_SNAPSHOT_BYTES &#124;&#124; !Array.isArray(row.chunks) &#124;&#124; row.chunks.length !== Math.ceil(row.bytes / CHUNK_BYTES) &#124;&#124; row.chunks.length &gt; MAX_CHUNKS &#124;&#124; !row.chunks.every((part): part is string =&gt; typeof part === 'string' &amp;&amp; /^[a-f0-9]{64}$/.test(part)) is true |
| [src/lib/snapshot-transport.ts:67](../src/lib/snapshot-transport.ts#L67) | Error/validation | Part of the online copy is missing. | parseChunk(); !value &#124;&#124; typeof value !== 'object' &#124;&#124; Array.isArray(value) is true |
| [src/lib/snapshot-transport.ts:80](../src/lib/snapshot-transport.ts#L80) | Error/validation | Part of the online copy has an unsupported format or size. | parseChunk(); Object.keys(row).some((key) =&gt; !['digest', 'data', 'bytes', 'createdAt', 'holders', 'holder'].includes(key)) &#124;&#124; typeof row.digest !== 'string' &#124;&#124; !/^[a-f0-9]{64}$/.test(row.digest) &#124;&#124; typeof row.data !== 'string' &#124;&#124; row.data.length &gt; Math.ceil(CHUNK_BYTES / 3) * 4 &#124;&#124; typeof row.bytes !== 'number' &#124;&#124; !Number.isInteger(row.bytes) &#124;&#124; row.bytes &lt; 1 &#124;&#124; row.bytes &gt; CHUNK_BYTES is true |
| [src/lib/snapshot-transport.ts:89](../src/lib/snapshot-transport.ts#L89) | Error/validation | This library exceeds the 20 MiB online snapshot limit. All local data is retained; export a backup before reducing it. | packSnapshot(); bytes.length &gt; MAX_SNAPSHOT_BYTES is true |
| [src/lib/snapshot-transport.ts:91](../src/lib/snapshot-transport.ts#L91) | Error/validation | An empty snapshot cannot be uploaded. | packSnapshot(); !bytes.length is true |
| [src/lib/snapshot-transport.ts:118](../src/lib/snapshot-transport.ts#L118) | Error/validation | Part of the online copy does not match its file list. | unpackSnapshot(); chunk.digest !== digest is true |
| [src/lib/snapshot-transport.ts:125](../src/lib/snapshot-transport.ts#L125) | Error/validation | The online snapshot failed its integrity check. Local data has not been replaced. | unpackSnapshot(); bytes.length !== chunk.bytes &#124;&#124; offset + bytes.length &gt; joined.length &#124;&#124; (await digestBytes(bytes)) !== digest is true |
| [src/lib/snapshot-transport.ts:131](../src/lib/snapshot-transport.ts#L131) | Error/validation | The online snapshot is incomplete or damaged. Local data is unchanged. | unpackSnapshot(); offset !== joined.length &#124;&#124; (await digestBytes(joined)) !== manifest.digest is true |
| [src/lib/snapshot-transport.ts:135](../src/lib/snapshot-transport.ts#L135) | Error/validation | The online snapshot is not valid UTF-8 library data. Local data is unchanged. | unpackSnapshot(); operation rejected or threw |
| [src/lib/snapshot-transport.ts:153](../src/lib/snapshot-transport.ts#L153) | Error/validation | The online library envelope has unsupported fields. Local data is unchanged. | unpackLibrary(); !data &#124;&#124; typeof data !== 'object' &#124;&#124; !('library' in data) &#124;&#124; !('format' in data) &#124;&#124; data.format !== 1 &#124;&#124; Object.keys(data).sort().join() !== 'format,library' &#124;&#124; !data.library &#124;&#124; typeof data.library !== 'object' &#124;&#124; 'motion' in data.library &#124;&#124; 'revision' in data.library is true |
## src/lib/storage-notices.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/storage-notices.ts:2](../src/lib/storage-notices.ts#L2) | Message/fragment | Device storage is blocked. Allow this site to use device storage and try again. Your saved data has not been overwritten or cleared. | STORAGE_DENIED_MESSAGE(); when its owning surface/operation is used |
| [src/lib/storage-notices.ts:5](../src/lib/storage-notices.ts#L5) | Message/fragment | Your saved data has not been overwritten or cleared. | safetyNotices(); when its owning surface/operation is used |
| [src/lib/storage-notices.ts:6](../src/lib/storage-notices.ts#L6) | Message/fragment | Your saved library has not been overwritten. | safetyNotices(); when its owning surface/operation is used |
| [src/lib/storage-notices.ts:7](../src/lib/storage-notices.ts#L7) | Message/fragment | Your existing saved data has not been overwritten. | safetyNotices(); when its owning surface/operation is used |
| [src/lib/storage-notices.ts:8](../src/lib/storage-notices.ts#L8) | Message/fragment | Your saved data has not been overwritten. | safetyNotices(); when its owning surface/operation is used |
| [src/lib/storage-notices.ts:9](../src/lib/storage-notices.ts#L9) | Message/fragment | Your data has not been overwritten. | safetyNotices(); when its owning surface/operation is used |
| [src/lib/storage-notices.ts:10](../src/lib/storage-notices.ts#L10) | Message/fragment | The original data has not been changed. | safetyNotices(); when its owning surface/operation is used |
| [src/lib/storage-notices.ts:32](../src/lib/storage-notices.ts#L32) | Message/fragment | Your existing saved data has not been overwritten. | safety(); safetySeen is false |
| [src/lib/storage-notices.ts:33](../src/lib/storage-notices.ts#L33) | Message/fragment | , or reset device data in Settings | reset(); detail.includes('reset device data in Settings') is false |
| [src/lib/storage-notices.ts:33](../src/lib/storage-notices.ts#L33) | Message/fragment | reset device data in Settings | reset(); when its owning surface/operation is used |
| [src/lib/storage-notices.ts:34](../src/lib/storage-notices.ts#L34) | Message/fragment | ${detail}${safety} Changes now work in this tab only; download a backup before closing it${reset}. | temporaryLibraryWarning(); when its owning surface/operation is used |
## src/lib/storage-recovery-actions.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/storage-recovery-actions.ts:21](../src/lib/storage-recovery-actions.ts#L21) | Error/validation | This tab has unsaved changes. Export a backup in Settings first, then confirm if you want to discard only this tab's temporary changes and try again. Your saved library has not been changed. | retryDeviceLibrary(); temporaryEdits.current &amp;&amp; discardRevision !== current.current.state.revision is true |
| [src/lib/storage-recovery-actions.ts:25](../src/lib/storage-recovery-actions.ts#L25) | Message/fragment | The device library could not be saved. | detail(); error instanceof Error is false |
## src/lib/storage.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/storage.ts:21](../src/lib/storage.ts#L21) | Error/validation | Saved device data has an unsupported format. | parseLibrary(); typeof value !== 'object' &#124;&#124; value === null &#124;&#124; !('version' in value) &#124;&#124; value.version !== 1 &#124;&#124; !('progress' in value) &#124;&#124; typeof value.progress !== 'object' &#124;&#124; value.progress === null &#124;&#124; Array.isArray(value.progress) &#124;&#124; !('motion' in value) &#124;&#124; !['auto', 'full', 'lite'].includes(String(value.motion)) is true |
| [src/lib/storage.ts:35](../src/lib/storage.ts#L35) | Error/validation | Saved game progress could not be read. | parseLibrary(); !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &#124;&#124; slug === '__proto__' &#124;&#124; typeof state !== 'object' &#124;&#124; state === null &#124;&#124; !('later' in state) &#124;&#124; !('completed' in state) &#124;&#124; typeof state.later !== 'boolean' &#124;&#124; typeof state.completed !== 'boolean' is true |
| [src/lib/storage.ts:56](../src/lib/storage.ts#L56) | Message/fragment | Device storage is blocked. Your changes work in this tab but will not survive a reload. | readLibrary(); operation rejected or threw |
| [src/lib/storage.ts:66](../src/lib/storage.ts#L66) | Message/fragment | Your saved device data could not be read. It has not been overwritten. Reset device data in Settings to start fresh. | readLibrary(); operation rejected or threw |
## src/lib/text-controls.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/lib/text-controls.ts:40](../src/lib/text-controls.ts#L40) | Message/fragment | Enter a name from 1 to ${max} characters. | displayNameProblem(); !name &#124;&#124; name.length &gt; max is true |
| [src/lib/text-controls.ts:42](../src/lib/text-controls.ts#L42) | Message/fragment | Names cannot contain invisible, control or text-direction characters. Remove them and try again. | displayNameProblem(); hasControlOrFormat(value) is true |
| [src/lib/text-controls.ts:44](../src/lib/text-controls.ts#L44) | Message/fragment | Names need a visible letter, number or symbol and cannot contain blank filler characters. | displayNameProblem(); BLANK.test(name) &#124;&#124; NOTHING_VISIBLE.test(name) is true |
| [src/lib/text-controls.ts:51](../src/lib/text-controls.ts#L51) | Message/fragment | Ranking titles cannot contain invisible, control or text-direction characters. Remove them and try again. | rankingTitleProblem(); hasControlOrFormat(value) is true |
| [src/lib/text-controls.ts:73](../src/lib/text-controls.ts#L73) | Error/validation | Use 1-${REPORT_REASON_MAX} characters to describe a problem with another profile. | cleanReportReason(); !reason &#124;&#124; reason.length &gt; REPORT_REASON_MAX is true |
| [src/lib/text-controls.ts:76](../src/lib/text-controls.ts#L76) | Error/validation | Reports cannot contain invisible, control or text-direction characters. Remove them and try again. | cleanReportReason(); hasControlOrFormat(reason) is true |
## src/motion/runtime.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/motion/runtime.ts:226](../src/motion/runtime.ts#L226) | Message output | reason | interrupt(); reason === 'navigation' is true |
| [src/motion/runtime.ts:294](../src/motion/runtime.ts#L294) | Message output | 'navigation' | update(); prior.location.navigationGeneration !== next.location.navigationGeneration &#124;&#124; prior.location.viewKey !== next.location.viewKey &#124;&#124; prior.location.overlayKey !== next.location.overlayKey &#124;&#124; prior.location.requestedDetailKey !== next.location.requestedDetailKey &#124;&#124; prior.location.displayedDetailKey !== next.location.displayedDetailKey is true |
| [src/motion/runtime.ts:309](../src/motion/runtime.ts#L309) | Message output | reason | cancel(); when its owning surface/operation is used |
| [src/motion/runtime.ts:531](../src/motion/runtime.ts#L531) | Message output | 'modal' | openDialog(); when its owning surface/operation is used |
## src/pwa/apply-update.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/pwa/apply-update.ts:22](../src/pwa/apply-update.ts#L22) | Message/fragment | Your edit or page changed. Keep editing, or correct the failed save before updating. | executePwaUpdate(); !access.isCurrent() &#124;&#124; !guard.isCurrent() is true |
| [src/pwa/apply-update.ts:26](../src/pwa/apply-update.ts#L26) | Error/validation | The waiting update or current edit changed. Review it again. | executePwaUpdate(); reloadOnly ? navigator.serviceWorker.controller !== worker : access.waiting() !== worker is true |
| [src/pwa/apply-update.ts:29](../src/pwa/apply-update.ts#L29) | Message/fragment | Your edit or page changed. Keep editing, or correct the failed save before updating. | executePwaUpdate(); !(await preparePwaUpdate(guard)) &#124;&#124; !access.isCurrent() is true |
| [src/pwa/apply-update.ts:42](../src/pwa/apply-update.ts#L42) | Error/validation | The waiting update or current edit changed. Review it again. | executePwaUpdate(); !status.ready &#124;&#124; (reloadOnly ? status.version !== access.requestedVersion() &#124;&#124; navigator.serviceWorker.controller !== worker : access.waiting() !== worker) &#124;&#124; !guard.isCurrent() &#124;&#124; !guard.canReload() &#124;&#124; !access.isCurrent() is true |
| [src/pwa/apply-update.ts:50](../src/pwa/apply-update.ts#L50) | Error/validation | Reopen The 100 before applying an offline update. This page has not changed. | executePwaUpdate(); !priorController &#124;&#124; !trustedPwaWorker(priorController, location.origin) is true |
| [src/pwa/apply-update.ts:62](../src/pwa/apply-update.ts#L62) | Error/validation | This page version or edit could not be confirmed. Reopen The 100 after saving your work. | executePwaUpdate(); !prior.ready &#124;&#124; !prior.clientVersion &#124;&#124; navigator.serviceWorker.controller !== priorController &#124;&#124; access.waiting() !== worker &#124;&#124; !access.isCurrent() &#124;&#124; !guard.isCurrent() &#124;&#124; !guard.canReload() is true |
| [src/pwa/apply-update.ts:69](../src/pwa/apply-update.ts#L69) | Message/fragment | Applying the requested update… | executePwaUpdate(); when its owning surface/operation is used |
| [src/pwa/apply-update.ts:81](../src/pwa/apply-update.ts#L81) | Message/fragment | ACTIVATE | result(); when its owning surface/operation is used |
| [src/pwa/apply-update.ts:85](../src/pwa/apply-update.ts#L85) | Message/fragment | Close other Play 100 tabs or windows before updating. No tab was reloaded. | executePwaUpdate(); !result.accepted &#124;&#124; result.version !== status.version is true; result.reason === 'other-tabs' is true |
| [src/pwa/apply-update.ts:86](../src/pwa/apply-update.ts#L86) | Message/fragment | The update is not ready. The working version was kept. | executePwaUpdate(); !result.accepted &#124;&#124; result.version !== status.version is true; result.reason === 'other-tabs' is false |
| [src/pwa/apply-update.ts:90](../src/pwa/apply-update.ts#L90) | Error/validation | The app update did not start. Your page was not reloaded. Try again. | executePwaUpdate(); !(await changed) is true |
| [src/pwa/apply-update.ts:93](../src/pwa/apply-update.ts#L93) | Error/validation | This page could not verify the app update. Your page was not reloaded. Try again. | executePwaUpdate(); !active &#124;&#124; !trustedPwaWorker(active, location.origin) is true |
| [src/pwa/apply-update.ts:96](../src/pwa/apply-update.ts#L96) | Error/validation | This page received a different app update. Your page was not reloaded. Try again. | executePwaUpdate(); activated.version !== status.version &#124;&#124; !activated.ready is true |
| [src/pwa/apply-update.ts:100](../src/pwa/apply-update.ts#L100) | Message/fragment | The update is ready, but this page changed. Finish or save your edit before reloading. | executePwaUpdate(); !access.isCurrent() &#124;&#124; !guard.isCurrent() &#124;&#124; !guard.canReload() is true |
| [src/pwa/apply-update.ts:110](../src/pwa/apply-update.ts#L110) | Message output | cause instanceof Error ? cause.message : 'The requested update failed. Your page was not reloaded.', cause | executePwaUpdate(); operation rejected or threw |
| [src/pwa/apply-update.ts:111](../src/pwa/apply-update.ts#L111) | Message/fragment | The requested update failed. Your page was not reloaded. | executePwaUpdate(); operation rejected or threw; cause instanceof Error is false |
## src/pwa/client.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/pwa/client.ts:32](../src/pwa/client.ts#L32) | Error/validation | Offline access needs a newer version of this browser. | registerOfflineWorker(); operation rejected or threw; !moduleOptionRead &#124;&#124; (cause instanceof DOMException &amp;&amp; cause.name === 'NotSupportedError') is true |
| [src/pwa/client.ts:38](../src/pwa/client.ts#L38) | Message/fragment | In Safari, open Share, then Add to Home Screen. Turn on Open as Web App if offered, then choose Add. This website cannot open that system dialog for you. | PWA_IOS_INSTRUCTIONS(); when its owning surface/operation is used |
| [src/pwa/client.ts:94](../src/pwa/client.ts#L94) | Error/validation | Offline access did not respond. Try again. | timeout(); when its owning surface/operation is used |
| [src/pwa/client.ts:108](../src/pwa/client.ts#L108) | Error/validation | This page could not verify its offline files. Try again when connected. | sendPwaRequest(); !reply &#124;&#124; typeof reply !== 'object' &#124;&#124; !('channel' in reply) &#124;&#124; reply.channel !== channel &#124;&#124; !('version' in reply) &#124;&#124; typeof reply.version !== 'string' &#124;&#124; !versionPattern.test(reply.version) is true |
| [src/pwa/client.ts:170](../src/pwa/client.ts#L170) | Error/validation | Offline access is unavailable in this page or browser. | ensureAvailable(); !attached &#124;&#124; !window.isSecureContext &#124;&#124; !('serviceWorker' in navigator) &#124;&#124; !availablePage() is true |
| [src/pwa/client.ts:176](../src/pwa/client.ts#L176) | Error/validation | The current offline setup is not compatible with Play 100. It was left unchanged. | checkRegistration(); value.scope !== &#96;${location.origin}/&#96; &#124;&#124; !trustedPwaWorker(worker, location.origin) is true |
| [src/pwa/client.ts:199](../src/pwa/client.ts#L199) | Message/fragment | An update is active, but this page still uses its previous version. Save your edits before choosing to reload. | refresh(); worker &amp;&amp; trustedPwaWorker(worker, location.origin) is true; reply.ready &amp;&amp; retainedDocument is true |
| [src/pwa/client.ts:207](../src/pwa/client.ts#L207) | Message/fragment | Offline files are ready. Reopen The 100 or the installed app to use them offline. | refresh(); worker &amp;&amp; trustedPwaWorker(worker, location.origin) is true; reply.ready &amp;&amp; !navigator.serviceWorker.controller is true |
| [src/pwa/client.ts:216](../src/pwa/client.ts#L216) | Message/fragment | An update is ready. Your current page stays open until you choose to update. | refresh(); registration?.waiting &amp;&amp; navigator.serviceWorker.controller is true |
| [src/pwa/client.ts:233](../src/pwa/client.ts#L233) | Message/fragment | Offline preparation failed. The current version was not replaced. Retry when connected. | change(); worker.state === 'redundant' is true |
| [src/pwa/client.ts:237](../src/pwa/client.ts#L237) | Message/fragment | An update is ready when you choose to apply it. | change(); worker.state === 'redundant' is false; worker.state === 'installed' is true; value.waiting &amp;&amp; navigator.serviceWorker.controller is true |
| [src/pwa/client.ts:240](../src/pwa/client.ts#L240) | Message output | 'Offline readiness could not be confirmed. Retry from Settings.', cause | change(); worker.state === 'redundant' is false; worker.state === 'installed' is false; worker.state === 'activated' is true |
| [src/pwa/client.ts:240](../src/pwa/client.ts#L240) | Message/fragment | Offline readiness could not be confirmed. Retry from Settings. | change(); worker.state === 'redundant' is false; worker.state === 'installed' is false; worker.state === 'activated' is true |
| [src/pwa/client.ts:284](../src/pwa/client.ts#L284) | Message/fragment | Play 100 was added by this browser. | installed(); when its owning surface/operation is used |
| [src/pwa/client.ts:289](../src/pwa/client.ts#L289) | Message output | 'The active offline page version could not be checked. Your page was not reloaded.', cause | checkExisting(); registration &amp;&amp; current(start) is true |
| [src/pwa/client.ts:289](../src/pwa/client.ts#L289) | Message/fragment | The active offline page version could not be checked. Your page was not reloaded. | checkExisting(); registration &amp;&amp; current(start) is true |
| [src/pwa/client.ts:321](../src/pwa/client.ts#L321) | Message/fragment | Offline preparation or storage failed. Reconnect, free storage if needed, and retry. | message(); data.status === 'error' is true |
| [src/pwa/client.ts:324](../src/pwa/client.ts#L324) | Message/fragment | Some public artwork could not be saved offline. Your library is unchanged. | message(); data.status === 'warning' is true |
| [src/pwa/client.ts:342](../src/pwa/client.ts#L342) | Message output | 'Existing offline access could not be checked. Your library is unchanged.', cause | connect(); 'serviceWorker' in navigator is true |
| [src/pwa/client.ts:342](../src/pwa/client.ts#L342) | Message/fragment | Existing offline access could not be checked. Your library is unchanged. | connect(); 'serviceWorker' in navigator is true |
| [src/pwa/client.ts:381](../src/pwa/client.ts#L381) | Message/fragment | Installation accepted. The browser will finish adding Play 100. | install(); choice.outcome === 'accepted' &amp;&amp; attached is true |
| [src/pwa/client.ts:397](../src/pwa/client.ts#L397) | Message/fragment | Preparing offline app files… | task(); when its owning surface/operation is used |
| [src/pwa/client.ts:410](../src/pwa/client.ts#L410) | Message output | cause instanceof UnsupportedOfflineBrowserError ? 'Offline access needs a newer version of this browser.' : 'Offline preparation could not start. Check the connection or available storage, then retry.', cause | task(); operation rejected or threw; current(start) is true |
| [src/pwa/client.ts:412](../src/pwa/client.ts#L412) | Message/fragment | Offline access needs a newer version of this browser. | task(); operation rejected or threw; current(start) is true; cause instanceof UnsupportedOfflineBrowserError is true |
| [src/pwa/client.ts:413](../src/pwa/client.ts#L413) | Message/fragment | Offline preparation could not start. Check the connection or available storage, then retry. | task(); operation rejected or threw; current(start) is true; cause instanceof UnsupportedOfflineBrowserError is false |
| [src/pwa/client.ts:435](../src/pwa/client.ts#L435) | Message/fragment | Enable offline access before checking its updates. | checkForUpdate(); !target is true |
| [src/pwa/client.ts:438](../src/pwa/client.ts#L438) | Message/fragment | Checking for an update… | checkForUpdate(); when its owning surface/operation is used |
| [src/pwa/client.ts:443](../src/pwa/client.ts#L443) | Error/validation | Offline readiness could not be confirmed. | checkForUpdate(); state.error &#124;&#124; state.offlineState === 'error' is true |
| [src/pwa/client.ts:446](../src/pwa/client.ts#L446) | Message/fragment | An update is downloading. This page will stay open. | checkForUpdate(); !target.waiting &amp;&amp; state.updateState === 'none' &amp;&amp; !applying is true; target.installing is true |
| [src/pwa/client.ts:446](../src/pwa/client.ts#L446) | Message/fragment | You're up to date. | checkForUpdate(); !target.waiting &amp;&amp; state.updateState === 'none' &amp;&amp; !applying is true; target.installing is false |
| [src/pwa/client.ts:452](../src/pwa/client.ts#L452) | Message output | 'An update could not be checked. Your current page remains available.', cause | checkForUpdate(); operation rejected or threw; current(start) is true |
| [src/pwa/client.ts:452](../src/pwa/client.ts#L452) | Message/fragment | An update could not be checked. Your current page remains available. | checkForUpdate(); operation rejected or threw; current(start) is true |
| [src/pwa/client.ts:467](../src/pwa/client.ts#L467) | Message/fragment | No trusted update is waiting. Check again when connected. | applyUpdate(); !attached &#124;&#124; !waiting &#124;&#124; !trustedPwaWorker(waiting, location.origin) is true |
| [src/pwa/client.ts:474](../src/pwa/client.ts#L474) | Message/fragment | Your edit or page changed. Save or correct it before reloading. | applyUpdate(); state.moduleError is true; !(await preparePwaUpdate(guard)) &#124;&#124; !current(start) is true |
| [src/pwa/client.ts:483](../src/pwa/client.ts#L483) | Message/fragment | Your edit or page changed. Save or correct it before reloading. | applyUpdate(); state.moduleError is true; current(start) &amp;&amp; result === 'cancelled' is true |
| [src/pwa/client.ts:501](../src/pwa/client.ts#L501) | Message output | "The update controls didn't load.", cause | applyUpdate(); operation rejected or threw; isModuleLoadFailure(cause) is true |
| [src/pwa/client.ts:501](../src/pwa/client.ts#L501) | Message/fragment | The update controls didn't load. | applyUpdate(); operation rejected or threw; isModuleLoadFailure(cause) is true |
| [src/pwa/client.ts:503](../src/pwa/client.ts#L503) | Message output | cause instanceof Error ? cause.message : 'The requested update or reload could not finish.', cause | applyUpdate(); operation rejected or threw; isModuleLoadFailure(cause) is false |
| [src/pwa/client.ts:503](../src/pwa/client.ts#L503) | Message/fragment | The requested update or reload could not finish. | applyUpdate(); operation rejected or threw; isModuleLoadFailure(cause) is false; cause instanceof Error is false |
## src/pwa/deferred-controller.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/pwa/deferred-controller.ts:67](../src/pwa/deferred-controller.ts#L67) | Message/fragment | Play 100 was added by this browser. | captureInstalled(); when its owning surface/operation is used |
| [src/pwa/deferred-controller.ts:118](../src/pwa/deferred-controller.ts#L118) | Message/fragment | Offline controls didn't load. | operation(); active &amp;&amp; generation === request is true |
| [src/pwa/deferred-controller.ts:172](../src/pwa/deferred-controller.ts#L172) | Message/fragment | Install controls are loading. Choose Install again when your browser offers it. | install(); when its owning surface/operation is used |
| [src/pwa/deferred-controller.ts:193](../src/pwa/deferred-controller.ts#L193) | Message/fragment | This page could not reload. Save your changes before reloading when connected. | failureMessage(); !controller &amp;&amp; state.moduleError is true |
| [src/pwa/deferred-controller.ts:204](../src/pwa/deferred-controller.ts#L204) | Message/fragment | Your edit or page changed. Save or correct it before reloading. | applyUpdate(); !controller &amp;&amp; state.moduleError is true; !prepared &#124;&#124; !current() is true; active &amp;&amp; generation === request is true |
| [src/pwa/deferred-controller.ts:217](../src/pwa/deferred-controller.ts#L217) | Message/fragment | Your edit or page changed. Save or correct it before reloading. | applyUpdate(); !controller &amp;&amp; state.moduleError is true; active &amp;&amp; generation === request is true; result === 'offline' is false; result === 'unavailable' is false; result === 'cancelled' is true |
## src/pwa/update-guard.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/pwa/update-guard.ts:43](../src/pwa/update-guard.ts#L43) | Error/validation | Finish or clear unsubmitted forms, or return to The 100 before updating. Nothing was reloaded. | createPwaUpdateGuard(); hasUnsubmittedPwaForm() is true |
## src/pwa/worker.ts

| Source | Kind | Copy or expression | Showing condition / owner |
| --- | --- | --- | --- |
| [src/pwa/worker.ts:23](../src/pwa/worker.ts#L23) | Message/fragment | Offline download took too long. Check your connection and retry. | module-defined copy; when its owning surface/operation is used |
| [src/pwa/worker.ts:64](../src/pwa/worker.ts#L64) | Message/fragment | &lt;!doctype html&gt; &lt;html lang="en"&gt; &lt;head&gt; &lt;meta charset="utf-8"&gt; &lt;meta name="viewport" content="width=device-width, initial-scale=1"&gt; &lt;meta name="theme-color" content="#f3f3e9"&gt; &lt;meta name="robots" content="noindex"&gt; &lt;title&gt;Page not found &#124; Play 100&lt;/title&gt; &lt;link rel="icon" href="/favicon.svg" type="image/svg+xml"&gt; &lt;link rel="stylesheet" href="/pwa/fallback.css"&gt; &lt;/head&gt; &lt;body class="offline-page"&gt; &lt;header class="site-header"&gt; &lt;a class="wordmark" href="/"&gt;&lt;span class="logo-symbol" aria-hidden="true"&gt;&lt;span&gt;&lt;/span&gt;&lt;/span&gt;PLAY&lt;span&gt;100&lt;/span&gt;&lt;i aria-hidden="true"&gt;.&lt;/i&gt;&lt;span class="sr-only"&gt; Home&lt;/span&gt;&lt;/a&gt; &lt;/header&gt; &lt;main class="app-page"&gt; &lt;div class="page-heading"&gt; &lt;div&gt; &lt;h1&gt;This page doesn't exist.&lt;/h1&gt; &lt;p&gt;The link may be old or mistyped. All 100 games, Discover and your games are still here.&lt;/p&gt; &lt;/div&gt; &lt;/div&gt; &lt;p class="hero-actions"&gt;&lt;a class="button button-dark" href="/"&gt;Open The 100&lt;/a&gt;&lt;a class="button button-outline" href="/discover"&gt;Open Discover&lt;/a&gt;&lt;a class="button button-outline" href="/my-games"&gt;Open My games&lt;/a&gt;&lt;/p&gt; &lt;/main&gt; &lt;/body&gt; &lt;/html&gt; | PWA_NOT_FOUND_HTML(); when its owning surface/operation is used |
| [src/pwa/worker.ts:167](../src/pwa/worker.ts#L167) | Error/validation | The offline document security policy is invalid. | parsePwaDocumentPolicy(); !input &#124;&#124; typeof input !== 'object' &#124;&#124; !('headers' in input) &#124;&#124; !Array.isArray(input.headers) &#124;&#124; !('sha256' in input) &#124;&#124; typeof input.sha256 !== 'string' &#124;&#124; !/^[a-f0-9]{64}$/.test(input.sha256) &#124;&#124; input.headers.length &gt; PWA_DOCUMENT_HEADERS.length &#124;&#124; new TextEncoder().encode(JSON.stringify(input.headers)).length &gt; 8192 is true |
| [src/pwa/worker.ts:185](../src/pwa/worker.ts#L185) | Error/validation | The offline document security policy contains an unapproved header. | parsePwaDocumentPolicy(); !entry &#124;&#124; typeof entry !== 'object' &#124;&#124; !('name' in entry) &#124;&#124; typeof entry.name !== 'string' &#124;&#124; !PWA_DOCUMENT_HEADERS.some((name) =&gt; name === entry.name) &#124;&#124; names.has(entry.name) &#124;&#124; !('value' in entry) &#124;&#124; typeof entry.value !== 'string' &#124;&#124; !entry.value.trim() &#124;&#124; /[\r\n\0]/.test(entry.value) is true |
| [src/pwa/worker.ts:190](../src/pwa/worker.ts#L190) | Error/validation | The offline document security policy has no CSP. | parsePwaDocumentPolicy(); !names.has('content-security-policy') is true |
| [src/pwa/worker.ts:198](../src/pwa/worker.ts#L198) | Error/validation | The offline CSP report-to directive requires the first-party Reporting-Endpoints header. | parsePwaDocumentPolicy(); reportTo &amp;&amp; (reportTo[1]?.trim() !== 'csp' &#124;&#124; headers.find((header) =&gt; header.name === 'reporting-endpoints')?.value !== 'csp="/api/csp-report"') is true |
| [src/pwa/worker.ts:211](../src/pwa/worker.ts#L211) | Error/validation | The offline manifest is invalid or exceeds its entry budget. | validatePwaManifest(); manifest.format !== 1 &#124;&#124; !/^[a-f0-9]{64}$/.test(manifest.version) &#124;&#124; manifest.core.length + 2 &gt; PWA_BUDGET.coreFiles &#124;&#124; manifest.images.length &gt; 1024 is true |
| [src/pwa/worker.ts:229](../src/pwa/worker.ts#L229) | Error/validation | The offline manifest contains a disallowed or oversized asset. | validatePwaManifest(); !isPublicPwaFile(asset.url) &#124;&#124; asset.url.length &gt; 256 &#124;&#124; urls.has(asset.url) &#124;&#124; !/^[a-f0-9]{64}$/.test(asset.sha256) &#124;&#124; !Number.isSafeInteger(asset.bytes) &#124;&#124; asset.bytes &lt; 1 &#124;&#124; asset.bytes &gt; (kind === 'core' ? PWA_BUDGET.coreFileBytes : PWA_BUDGET.imageFileBytes) &#124;&#124; (kind === 'images' &amp;&amp; (asset.type !== 'image' &#124;&#124; !asset.url.endsWith('.webp'))) is true |
| [src/pwa/worker.ts:240](../src/pwa/worker.ts#L240) | Error/validation | The complete offline core is missing or exceeds its byte budget. | validatePwaManifest(); manifest.core.reduce((sum, asset) =&gt; sum + asset.bytes, 0) &gt; PWA_BUDGET.coreBytes - PWA_BUDGET.metadataBytes &#124;&#124; !['/index.html', '/pwa/offline.html', '/data/collection.json', '/data/discovery/catalog.v1.json'].every((url) =&gt; manifest.core.some((asset) =&gt; asset.url === url), ) is true |
| [src/pwa/worker.ts:271](../src/pwa/worker.ts#L271) | Message/fragment | The operation was aborted. | throwIfAborted(); signal?.aborted is true; signal.reason === undefined is true |
| [src/pwa/worker.ts:291](../src/pwa/worker.ts#L291) | Error/validation | An offline asset was not a public, non-redirected response of the expected type. | verifiedPwaResponse(); response.status !== 200 &#124;&#124; response.redirected &#124;&#124; !['basic', 'default'].includes(response.type) &#124;&#124; (response.url &amp;&amp; response.url !== expectedUrl) &#124;&#124; /(?:private&#124;no-store)/i.test(response.headers.get('cache-control') ?? '') &#124;&#124; !contentTypeMatches(asset, response.headers.get('content-type') ?? '') &#124;&#124; !response.body is true |
| [src/pwa/worker.ts:312](../src/pwa/worker.ts#L312) | Error/validation | An offline asset exceeded its declared byte budget. | verifiedPwaResponse(); offset + part.value.byteLength &gt; asset.bytes is true |
| [src/pwa/worker.ts:325](../src/pwa/worker.ts#L325) | Error/validation | An offline asset did not match this release. | verifiedPwaResponse(); offset !== asset.bytes &#124;&#124; hash !== asset.sha256 is true |
| [src/pwa/worker.ts:399](../src/pwa/worker.ts#L399) | Error/validation | The offline document policy digest does not match this version. | verifyPolicy(); hash !== policy.sha256 is true |
| [src/pwa/worker.ts:425](../src/pwa/worker.ts#L425) | Error/validation | Offline page-version ownership could not be confirmed. | clientBindings(); !input &#124;&#124; typeof input !== 'object' &#124;&#124; Array.isArray(input) &#124;&#124; Object.keys(input).length &gt; PWA_BUDGET.clients is true |
| [src/pwa/worker.ts:445](../src/pwa/worker.ts#L445) | Error/validation | Offline page-version ownership could not be confirmed. | clientBindings(); !/^[A-Za-z0-9-]{1,128}$/.test(id) &#124;&#124; !binding &#124;&#124; typeof binding !== 'object' &#124;&#124; !('version' in binding) &#124;&#124; typeof binding.version !== 'string' &#124;&#124; (binding.version !== 'network' &amp;&amp; !/^[a-f0-9]{64}$/.test(binding.version)) &#124;&#124; !('observed' in binding) &#124;&#124; typeof binding.observed !== 'boolean' &#124;&#124; !('reservedAt' in binding) &#124;&#124; typeof binding.reservedAt !== 'number' &#124;&#124; !Number.isSafeInteger(binding.reservedAt) &#124;&#124; binding.reservedAt &lt; 0 is true |
| [src/pwa/worker.ts:468](../src/pwa/worker.ts#L468) | Error/validation | Offline page identity is unavailable. | bindClients(); !ids.length &#124;&#124; ids.some((id) =&gt; !/^[A-Za-z0-9-]{1,128}$/.test(id)) is true |
| [src/pwa/worker.ts:492](../src/pwa/worker.ts#L492) | Error/validation | Close extra Play 100 windows before preparing offline pages. | bindClients(); Object.keys(current).length &gt; PWA_BUDGET.clients is true |
| [src/pwa/worker.ts:500](../src/pwa/worker.ts#L500) | Error/validation | The navigation version is no longer available. | renewNavigationGrace(); !binding is true |
| [src/pwa/worker.ts:506](../src/pwa/worker.ts#L506) | Error/validation | The navigation grace could not be saved in time. | renewNavigationGrace(); Date.now() - reservedAt &gt;= reservationLifetimeMs is true |
| [src/pwa/worker.ts:536](../src/pwa/worker.ts#L536) | Message/fragment | This page needs a connection. Offline access is not ready. | fallback(); html?.body ?? |
| [src/pwa/worker.ts:553](../src/pwa/worker.ts#L553) | Message output | 'error', 'Apply the waiting update or close other tabs before preparing another offline version.' | installPwaWorker(); keys.length &gt;= 3 is true |
| [src/pwa/worker.ts:553](../src/pwa/worker.ts#L553) | Message/fragment | Apply the waiting update or close other tabs before preparing another offline version. | installPwaWorker(); keys.length &gt;= 3 is true |
| [src/pwa/worker.ts:554](../src/pwa/worker.ts#L554) | Error/validation | Apply or close the pending offline update before preparing another. | installPwaWorker(); keys.length &gt;= 3 is true |
| [src/pwa/worker.ts:592](../src/pwa/worker.ts#L592) | Message output | 'ready', 'Offline public files are ready. Reopen the page or installed app to use them offline.' | installPwaWorker(); when its owning surface/operation is used |
| [src/pwa/worker.ts:592](../src/pwa/worker.ts#L592) | Message/fragment | Offline public files are ready. Reopen the page or installed app to use them offline. | installPwaWorker(); when its owning surface/operation is used |
| [src/pwa/worker.ts:599](../src/pwa/worker.ts#L599) | Message output | 'error', cause instanceof PwaAssetTimeoutError ? cause.message : 'Offline preparation failed. Check the connection or available storage, then retry.' | installPwaWorker(); operation rejected or threw |
| [src/pwa/worker.ts:603](../src/pwa/worker.ts#L603) | Message/fragment | Offline preparation failed. Check the connection or available storage, then retry. | installPwaWorker(); operation rejected or threw; cause instanceof PwaAssetTimeoutError is false |
| [src/pwa/worker.ts:614](../src/pwa/worker.ts#L614) | Error/validation | The offline core is incomplete; activation cannot continue. | installPwaWorker(); !(await ready()) is true |
| [src/pwa/worker.ts:677](../src/pwa/worker.ts#L677) | Message output | 'warning', 'Public artwork could not be saved offline. Your library is unchanged.' | imageResponse(); when its owning surface/operation is used |
| [src/pwa/worker.ts:677](../src/pwa/worker.ts#L677) | Message/fragment | Public artwork could not be saved offline. Your library is unchanged. | imageResponse(); when its owning surface/operation is used |
| [src/pwa/worker.ts:703](../src/pwa/worker.ts#L703) | Message output | 'error', 'This offline navigation could not be assigned a safe page identity. Retry after other pages finish opening.' | installPwaWorker(); input.mode === 'navigate' is true; !/^[A-Za-z0-9-]{1,128}$/.test(id) &#124;&#124; activeNavigations.has(id) &#124;&#124; activeNavigations.size &gt;= PWA_BUDGET.clients is true |
| [src/pwa/worker.ts:705](../src/pwa/worker.ts#L705) | Message/fragment | This offline navigation could not be assigned a safe page identity. Retry after other pages finish opening. | installPwaWorker(); input.mode === 'navigate' is true; !/^[A-Za-z0-9-]{1,128}$/.test(id) &#124;&#124; activeNavigations.has(id) &#124;&#124; activeNavigations.size &gt;= PWA_BUDGET.clients is true |
| [src/pwa/worker.ts:719](../src/pwa/worker.ts#L719) | Message output | 'error', 'This offline page could not be assigned a safe version. Reconnect or close extra windows, then retry.' | installPwaWorker(); input.mode === 'navigate' is true; isPwaShellNavigation(url, origin) is true; operation rejected or threw |
| [src/pwa/worker.ts:721](../src/pwa/worker.ts#L721) | Message/fragment | This offline page could not be assigned a safe version. Reconnect or close extra windows, then retry. | installPwaWorker(); input.mode === 'navigate' is true; isPwaShellNavigation(url, origin) is true; operation rejected or threw |
| [src/pwa/worker.ts:746](../src/pwa/worker.ts#L746) | Message output | 'error', 'This offline page could not retain its safe version while opening. Retry when storage is available.' | installPwaWorker(); input.mode === 'navigate' is true; ready.ok is true; operation rejected or threw |
| [src/pwa/worker.ts:748](../src/pwa/worker.ts#L748) | Message/fragment | This offline page could not retain its safe version while opening. Retry when storage is available. | installPwaWorker(); input.mode === 'navigate' is true; ready.ok is true; operation rejected or threw |
| [src/pwa/worker.ts:771](../src/pwa/worker.ts#L771) | Message output | 'error', 'Offline page ownership could not be confirmed. Your page was not assigned newer data.' | installPwaWorker(); asset is true; asset.type === 'json' &#124;&#124; asset.type === 'html' is true; operation rejected or threw |
| [src/pwa/worker.ts:773](../src/pwa/worker.ts#L773) | Message/fragment | Offline page ownership could not be confirmed. Your page was not assigned newer data. | installPwaWorker(); asset is true; asset.type === 'json' &#124;&#124; asset.type === 'html' is true; operation rejected or threw |
| [src/pwa/worker.ts:775](../src/pwa/worker.ts#L775) | Message/fragment | This page version could not be confirmed. | installPwaWorker(); asset is true; asset.type === 'json' &#124;&#124; asset.type === 'html' is true; operation rejected or threw |
| [src/pwa/worker.ts:777](../src/pwa/worker.ts#L777) | Message/fragment | Reopen Play 100 to establish this page version. | installPwaWorker(); asset is true; asset.type === 'json' &#124;&#124; asset.type === 'html' is true; !version is true |
| [src/pwa/worker.ts:782](../src/pwa/worker.ts#L782) | Message/fragment | The previous page version is unavailable. Save your work before reloading. | installPwaWorker(); asset is true; asset.type === 'json' &#124;&#124; asset.type === 'html' is true; version !== manifest.version is true; !(await scope.caches.keys()).includes(name) is true |
| [src/pwa/worker.ts:789](../src/pwa/worker.ts#L789) | Message/fragment | The previous page version is unavailable. Save your work before reloading. | installPwaWorker(); asset is true; asset.type === 'json' &#124;&#124; asset.type === 'html' is true; version !== manifest.version is true; !response is true |
| [src/pwa/worker.ts:803](../src/pwa/worker.ts#L803) | Error/validation | The previous document policy is not bound to this version. | installPwaWorker(); asset is true; asset.type === 'json' &#124;&#124; asset.type === 'html' is true; version !== manifest.version is true; !previous &#124;&#124; typeof previous !== 'object' &#124;&#124; !('version' in previous) &#124;&#124; previous.version !== version &#124;&#124; !('documentPolicy' in previous) is true |
| [src/pwa/worker.ts:808](../src/pwa/worker.ts#L808) | Message output | 'error', 'The previous offline document has no verified security policy. Save your work before reloading.' | installPwaWorker(); asset is true; asset.type === 'json' &#124;&#124; asset.type === 'html' is true; version !== manifest.version is true; operation rejected or threw |
| [src/pwa/worker.ts:810](../src/pwa/worker.ts#L810) | Message/fragment | The previous offline document has no verified security policy. Save your work before reloading. | installPwaWorker(); asset is true; asset.type === 'json' &#124;&#124; asset.type === 'html' is true; version !== manifest.version is true; operation rejected or threw |
| [src/pwa/worker.ts:824](../src/pwa/worker.ts#L824) | Message output | 'error', 'Offline storage is unavailable. The online page remains usable.' | installPwaWorker(); asset is true; operation rejected or threw |
| [src/pwa/worker.ts:824](../src/pwa/worker.ts#L824) | Message/fragment | Offline storage is unavailable. The online page remains usable. | installPwaWorker(); asset is true; operation rejected or threw |
| [src/pwa/worker.ts:828](../src/pwa/worker.ts#L828) | Message output | 'error', 'A file from this version is unavailable. Reconnect and check for an update.' | installPwaWorker(); asset is true; operation rejected or threw |
| [src/pwa/worker.ts:828](../src/pwa/worker.ts#L828) | Message/fragment | A file from this version is unavailable. Reconnect and check for an update. | installPwaWorker(); asset is true; operation rejected or threw |
| [src/pwa/worker.ts:829](../src/pwa/worker.ts#L829) | Message/fragment | This offline file is unavailable. | installPwaWorker(); asset is true; operation rejected or threw |
| [src/pwa/worker.ts:837](../src/pwa/worker.ts#L837) | Message output | 'warning', 'This public artwork is not available offline.' | result(); asset is false; images.has(url.pathname) is true; image is true |
| [src/pwa/worker.ts:837](../src/pwa/worker.ts#L837) | Message/fragment | This public artwork is not available offline. | result(); asset is false; images.has(url.pathname) is true; image is true |
| [src/pwa/worker.ts:875](../src/pwa/worker.ts#L875) | Message/fragment | ACTIVATE | installPwaWorker(); data.type === 'STATUS' is false |
