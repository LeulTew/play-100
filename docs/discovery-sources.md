# Discovery snapshot: sources, rights and collection

Discovery's public snapshot is separate from the author's 100 and from private
libraries, cloud records, rankings, scores and notes. Its browser contract is
`src/lib/discovery-catalog.ts`; the manifest is served at
`/data/discovery/catalog.v1.json`. It does not replace the existing online search
fallback. No private data, account credentials or API keys are collected.

## Source and image rights

Reviewed on 2026-09-17:

| Source | Permission and implementation |
| --- | --- |
| [FreeToGame API documentation](https://www.freetogame.com/api-doc) | Explicitly permits personal and commercial API use with an **active FreeToGame attribution hyperlink**. No authentication; the provider asks for fewer than 10 requests/second. We use only `/api/games` facts: ID, title, developer, genre, release year and profile URL. No reviews, descriptions, scores or screenshots are copied. |
| [FreeToGame site terms](https://www.freetogame.com/terms-of-use) | Generic site terms restrict copying/displaying site content except where expressly permitted. The API's metadata grant does not clearly settle thumbnail copyright/display/redistribution scope. **FreeToGame thumbnails are excluded**, including hotlinks. An API-returned image URL is not treated as a license. |
| [Wikidata licensing](https://www.wikidata.org/wiki/Wikidata:Licensing) | Structured metadata is CC0. English/multilingual labels and aliases, video-game classification, developer/genre entities and release-date claims are collected through the documented Action API. **CC0 metadata does not license referenced artwork.** |
| [Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia) | Every included image is separately checked using that file's `imageinfo.extmetadata`: creator, credit, attribution, license short name, license URL, copyright status and restrictions. Only the enumerated CC BY, CC BY-SA, CC0 or declared public-domain licenses below are accepted. |

Image allowlist: CC BY / CC BY-SA 2.0, 2.5, 3.0 or 4.0 with matching
creativecommons.org license URLs; CC0 with its matching waiver URL; or a Commons
file explicitly marked `Public domain` and `Copyrighted=False`, labelled
**Public domain**, not CC0. The public-domain mark identifies the status, not a
new copyright grant. Unknown, attribution-only, noncommercial, fair-use,
missing-license, missing-creator and additional non-trademark restrictions are
excluded for manual review, not silently relicensed.

Commons logos may have trademark restrictions even when their copyright status
permits reuse. That restriction is retained in the credit. Imagery illustrates
the game; it is not a claim of publisher endorsement or exclusively box art.
SVG originals are **not downloaded, executed or served**. Where Commons supplies
an approved PNG raster thumbnail of a licensed SVG, only that raster is fetched.
The original file URL remains provenance, not an image source.

Every local artwork entry retains its file page, original URL, creator/source/
attribution text (including supplied links), precise license and link, retrieval
time, transformation notice, intrinsic output dimensions, output SHA-256 and
byte count. CC BY-SA derivatives retain their original license. Consumers must
make those source/credit/license details accessible and keep required source
hyperlinks active. The supplied author's 100 images remain untouched and
separate; no original is enlarged.

## Consumer contract

- `DiscoveryCatalog`: `{ schemaVersion: 1, generatedAt, items }`.
- Each item has the existing strict image-free `LibraryRecord`, bounded provider
  `aliases`, `artwork | null` and `provenance` (metadata license/link, retrieval
  time, and an explicit reason when artwork is absent).
- `parseDiscoveryCatalogJson` rejects JSON over 3 MiB before parsing;
  `parseDiscoveryCatalog` rejects unknown fields, duplicate/mismatched IDs,
  unsupported records, malformed URLs, licenses and bounds.
- `indexDiscoveryArtwork(catalog)` returns a map keyed **only by exact
  `record.id`** (`wikidata:Q…` or `freetogame:…`). No title similarity may transfer
  an image, alias or saved identity to another record.
- Image `src` is always `/images/discovery/<SHA-256>.webp`. No remote image
  origins, proxy, CSP wildcard or arbitrary user image URL is needed. Credits
  are plain text, not HTML to inject. Most licensed assets are logos: use
  `object-fit: contain` and a light/paper image surface so transparent black
  logos remain legible instead of cropping or inverting them.
- Load the manifest lazily in discovery/search. Serve visible/nearby images
  lazily with the supplied intrinsic dimensions; missing or failed art needs an
  honest fallback. Artwork and provenance never enter personal/cloud records.

## Canonical-first browsing contract

User request (2026-09-20): searching Discover for a game in The 100 should bring
the entry from The 100, not another saveable provider copy. This is an identity
correction, not a new collection or a private-library migration.

- `src/lib/collection-identities.ts` separately lists reviewed Wikidata
  game-entity IDs and canonical slugs. `catalog-identity.ts` resolves public
  catalog records before filtering, local pagination, counts, selection and
  remote append. It does not rewrite the provider wire format or seed manifest.
- Discover searches all 100 canonical records, including titles absent from
  the seed. Provider titles/aliases continue to find verified canonical entries.
  The canonical record supplies its title, year, original genre/studio, rank,
  original author rating, workbook cover and full GameDetail. Source filtering
  identifies where a match was found, not permission to replace authored facts.
- One result per resolved identity. New Save, Played, Completed, Play later,
  rating, ranking, bulk selection, Pin/drag and Preview use the same canonical
  ID as The 100. Provider page offsets/status still describe the provider
  response; deduplication is not a fabricated exhaustive remote count.
- Cards use the existing responsive discovery grid/list and original GameCover,
  a short "From The 100" rank/rating line, and existing labelled actions.
  Unknown games retain provider artwork/credits and explicit missing-art state.
  No new modal stack, gesture requirement, animation or full-size art preload.
- Existing saved provider records are never rekeyed, deleted, merged, or given
  copied scores/progress. They remain in My games/backups under their original
  IDs; a saved-copy link distinguishes an old private copy from the public
  canonical result. Old saved-record links continue to open that record.
  Unsaved verified provider preview links can open canonical details.
  When only a verified provider copy is owned, the canonical presentation says
  Saved and its personal controls/bulk actions bind to that existing record.
  This applies to canonical details and main cards/table too: no implicit
  second private record from Played, Queue, rating or ranking. If both copies
  exist, canonical controls use the canonical record, with a separate explicit
  saved-copy link for the old opinion. This is a derived view, not value merging.
  Pin/drag recognizes either known identity already in the scoped tray and does
  not spend another slot; persisted pins are not silently rekeyed or deleted.
- Unknown IDs and distinct originals/remakes/editions/sequels remain separate.
  Friends/public projections, authorization, comparison exact-ID semantics,
  private schema3, backup/import formats, All rules and invitations are unchanged.
  Canonical resolution must not turn a revoked friend-shelf preview into a
  public or writable record.
- Canonical loading/error and seed/provider loading/offline/retry states remain
  explicit. Public discovery never guesses a match while the canonical data is
  unavailable. A source failure must not replace authored metadata or mutate a
  saved library. Query, filters, paging, Back and reload keep their URL contract.

### Reviewed identity evidence and deliberate exclusions

On 2026-09-20, bounded public Wikidata `wbgetentities` requests verified the
English game article, entity classification, description and release claims for
99 canonical entries. Each row's source is
`https://www.wikidata.org/wiki/<Q-id>`; the registry is the complete enumeration.
Raw API receipts are retained with the release evidence, not deployed.
English article lookup alone is insufficient: The Last of Us, Mass Effect,
Control and Knights of the Old Republic initially returned franchises or
disambiguation pages and were replaced with the verified **game** entities.
Null/multiple provider release years do not replace the author's original year.

Explicit examples: Resident Evil 4 (2023) `Q112231148`, not original `Q275950`;
Tomb Raider (2013) `Q1757876`, not 1996 `Q317620`; Battlefront II (2017)
`Q29154231`, not 2005 `Q54865`; Overwatch (2016) `Q18515944`, **not**
FreeToGame540's 2022 game. The sheet's Hitman World of Assassination (2016)
has no asserted provider mapping because its title/year do not unambiguously
identify a single edition. It remains directly searchable as an original100
entry. No FreeToGame equivalence is asserted without reviewed evidence.

The 65 verified seed overlaps yield **845 public identities** (100+810-65), not
910 cards and not a claim of exhaustive provider coverage. The classic RE4
entity's English article/description and 2005 release claims were checked
separately; its "2005 original" card/detail hint distinguishes it from the
curated 2023 remake. This is presentation-only: its source year remains null
because the provider has multiple release years, and no saved metadata changes.

| Requirement | Code boundary | Actual evidence |
| --- | --- | --- |
| Verified identity, editions preserved | Separate registry and pure resolver | 99 actual Q7889/article matches, 65 seed overlaps; pure all-100 findability and exact edition exclusions |
| Canonical facts/actions, deduped paging | Public search hooks/cards | 16 desktop/mobile compiled-client journeys: canonical facts/actions/bulks, source aliases, paging, late replies, cold loading, error/retry and seed outage |
| Private copies and restricted previews preserved | Public-only resolution, existing private paths | Legacy-only and conflicting-copy runtime mutations preserve old IDs/notes; nested confirmation/focus and equivalent Pin/Unpin; 226 focused pure cases including unchanged shelf/preview contracts |

TypeScript and all touched-file lint pass. The first cold-owned-copy browser
case exposed sibling React keys reused for Played/rating; distinct stable keys
fixed the duplicate control. Fixture selectors were scoped to the actual bulk,
combobox and modal controls without weakening final state assertions. The
existing font/cover system is preserved; stale design-sidecar font-ramp warnings
do not justify an unrelated visual redesign. No new SDK/rules rollout is needed.

## Explicit commands

Run from the isolated checkout with the existing `tsx`, `sharp` and TypeScript
dependencies available:

```text
npx tsx scripts/collect-discovery-catalog.ts
npx tsx scripts/collect-discovery-catalog.ts --verify
npx tsx scripts/collect-discovery-catalog.ts --dry-run
npx vitest run src/lib/discovery-catalog.test.ts scripts/collect-discovery-catalog.test.ts
```

`--verify` is offline: strict manifest parsing, **full raster decoding** of every
referenced file, SHA-256, dimensions, byte counts and total directory budget.
`--dry-run` contacts the real APIs and validates a prospective snapshot but
publishes nothing. The collector test suite also runs a fully offline dry
provider fixture through collection, conversion and isolated publication.
Commands print measured counts/checksums; capture stdout for a rerun report.
The integrator owns optional package-script aliases. No cron, CI crawler,
background service, paid database or automatic scheduled refresh is introduced.

## Bounds, identity and repeatability

The explicit source selection combines FreeToGame's complete live response with
119 named mainstream English Wikipedia title lookups and a bounded
350-result Wikidata video-game search. The exact title inputs are checked in
`FEATURED_WIKI_TITLES`, **not manufactured output records**. Every imported
Wikidata entity must assert nondeprecated `P31=Q7889`. Missing pages, series and
items without that classification are excluded; edition/translation (`P629`)
entities are not used to pad the selection. Provider English/multilingual
aliases are retained (at most 30), never invented. Preferred release claims take
precedence; multiple distinct years produce `null`, not a guessed release year.

IDs deduplicate repeated API results. To avoid counting obvious cross-source
collisions, a Wikidata candidate whose title or alias exactly equals a
FreeToGame title after NFKC/case/outer-space normalization is omitted from the
**selection**. This is not an identity merge: nothing is copied between those
records and no cross-source artwork association is fabricated. The report
lists those omitted Wikidata IDs. There is no universal provider crosswalk;
this snapshot is a bounded selection, not an exhaustive distinct-game census.
Homonymous but separately identified games (such as the original and remade
Resident Evil 4, or the 1993 and 2016 Doom games) remain separate records.

At most 240 referenced Commons files are reviewed, prioritizing featured games
and each entity's logo before its image, with at most two file candidates per
game. Missing, unclear-license, disappeared (404/410), or review-budget-excluded
art is recorded as a per-item reason. The collector never retains a disappeared
file as current art. At least 500 and at most 1,000 records are required for this
release; it also requires the verified Kingdom Come: Deliverance entity
`wikidata:Q15408545`. A provider shortage fails instead of padding the catalog.

Networking uses an identifiable `Play100Discovery/1.0` user agent, HTTPS
allowlisted hosts/endpoints, **one concurrent request**, at least 550 ms between
request starts, 30-second per-request timeouts, a 20-minute run deadline, 700
requests maximum and 250 MiB maximum cumulative transfer. API responses are
limited to 8 MiB and image responses to 6 MiB; content type and raster decoding
are mandatory. Redirects, credentials, nonstandard ports, SVG downloads and
arbitrary endpoints are refused. HTTP 429/502/503/504 receive at most two retries
with bounded exponential backoff and `Retry-After`; a request to wait over one
minute fails for a later explicit retry. Wikidata `maxlag` receives two bounded
5/10-second pauses. Ctrl+C/SIGTERM cancels the run.

Metadata is capped at **3 MiB**. All new and retained local hash-named raster
assets together must fit **35 MiB**. Each output must fit **80 KiB**; images are
resized inside 480×480 (contract maximum 640), without enlargement and never
beyond source dimensions, then encoded to WebP quality 76. Decoding is limited
to 25 million input pixels and a single frame. Oversize or malformed data fails
with an actionable error; it is not silently truncated into a success report.

Same inputs, timestamps and encoder version produce stable sorted records,
asset names and bytes. Live sources and retrieval timestamps naturally change
on a new collection; this is reproducible collection, not a promise that mutable
upstream APIs never change. Metadata refreshes as a complete new snapshot.
Per-file rights are checked again on every run; old rights are not blindly
cached or inherited.

All data and assets are validated before publication. Content-addressed images
are written through temporary files first; **one final atomic manifest rename**
publishes the new reference set. Upstream failures and validation/budget failures
leave the last good manifest intact. A disk failure can leave unreferenced
hash-named assets, but never make the old manifest point at missing new files.
Older immutable assets are intentionally retained for cached older manifests
and counted toward the directory budget. No automatic broad prune occurs.
After old manifest caches expire, an operator may review and remove specific
unreferenced hash files; `--verify` reports referenced and all-local bytes.

## Release collection report

Generated **2026-09-17T18:30:28.786Z** by the explicit live collection. The
checked-in manifest is the authoritative per-record/per-asset provenance.

| Measurement | Actual |
| --- | ---: |
| Records | 810 |
| Wikidata / FreeToGame records | 393 / 417 |
| Illustrated records | 220 (27.2% overall; 56.0% of Wikidata records) |
| Missing artwork | 590 |
| Unique local raster assets | 215 |
| Metadata bytes | 656,211 (limit 3,145,728) |
| Referenced / all local image bytes | 3,068,448 / 3,068,448 (limit 36,700,160) |
| Largest individual raster | 53,290 bytes (limit 81,920) |
| Largest output edge | 480 px (contract limit 640) |
| HTTP requests in successful collection | 481 |
| Source transfer bytes in successful collection | 75,511,313 |
| Commons files individually reviewed | 234 (limit 240) |
| Conservative cross-source title collisions omitted | 19 |

Manifest SHA-256:
`7f7ceb8e69b6105f8c6f63c8588d12eec4dc8ff95650328da3a24c783be1cd88`.
Every image's own checksum is in its artwork entry and filename.

Unique asset copyright labels: **197 Public domain**, 1 CC BY 2.0, 2 CC BY 3.0,
3 CC BY-SA 2.0, 4 CC BY-SA 3.0, and 8 CC BY-SA 4.0. **No game artwork is claimed
CC0 in this run.** The metadata's CC0 label is independent.

The mainstream illustrated subset includes Kingdom Come: Deliverance I/II,
Elden Ring, Baldur's Gate 3, The Witcher 3, Cyberpunk 2077, Red Dead Redemption
I/II, Hades and Hollow Knight, among others. These are real provider records and
Commons source images, mostly logos, not a fabricated box-cover collection.
Kingdom Come: Deliverance is `wikidata:Q15408545` with real provider aliases
`KCD`, `KCD1`, `Kingdom Come Deliverance`, and
`Kingdom Come Deliverance: Royal Edition`. Its year is `null` because preferred
source release claims do not provide a single unambiguous year; the collector
does not replace them with an assumed date.

Missing-art breakdown: 417 FreeToGame records with unestablished thumbnail
rights; 158 Wikidata records without a referenced reusable image/logo; and
15 records excluded by the stricter license/creator/restriction/raster checks.
No image was omitted due to the 240-file review cap in this run. The online
provider search remains the integration lane's fallback for games outside this
bounded snapshot.

Validation: 61 focused pure/collector tests passed, including complete offline
fixture collection, malformed/unknown fields, exact record identity, URL
allowlists, retry/cancellation/concurrency/request limits, content types,
streaming byte bounds, per-file rights, no-upscale conversion, deterministic
reruns, corrupt/missing asset rejection, aggregate budgets and last-good
manifest preservation. Strict standalone TypeScript compilation passed for the
four new source/test files. The real `--verify` command independently fully
decoded all 215 WebPs, checked every reference, dimension, byte count and SHA-256,
and reproduced the report above.

One earlier attempt was stopped by Wikidata `maxlag` before publishing any
manifest; bounded maxlag backoff was then implemented and verified. No full app
install, browser/emulator, CI or deployment was run by this lane. A small
isolated tool cache supplied tsx 4.21.0, sharp 0.34.5, TypeScript 5.9.3 and Vitest
3.2.4 after local tools were absent; repository manifests/lockfiles were not
changed. The integrator owns validation against the combined app toolchain.
