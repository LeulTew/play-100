# Play 100

A public, responsive collection of 100 games with an authored order, a sortable
ratings table, private libraries and personal rankings. Built with React,
TypeScript, Vite, native IndexedDB, dnd kit and one lazy Three.js sculpture.
A stateless Vercel function looks up public catalogs. Guest data stays in
IndexedDB; optional verified Firebase accounts add consented cross-device
saving, automatic or legacy selected friends-only sharing, private comparison groups and
deliberately published public snapshots. No analytics or Supabase is used.

**Live:** https://play-100-collection.vercel.app  
**Curated by:** Leul Tewodros Agonafer  
**Public source:** https://github.com/LeulTew/play-100  
**LinkedIn:** https://www.linkedin.com/in/leul-t-agonafer-861bb3336/  
**Telegram:** https://t.me/fabbin (@fabbin)
**Workbook:** https://play-100-collection.vercel.app/downloads/Play-100-Collection.xlsx
**Original Excel:** https://play-100-collection.vercel.app/downloads/AAA_games_u_have_to_play_list_top_100.xlsx  
**My games:** https://play-100-collection.vercel.app/my-games <br />
**Personal rankings:** https://play-100-collection.vercel.app/my-games?tab=ranking <br />
**Discover:** https://play-100-collection.vercel.app/discover
**Account:** https://play-100-collection.vercel.app/account
**Friends:** https://play-100-collection.vercel.app/friends  
**Compare:** https://play-100-collection.vercel.app/compare  
**Data use:** https://play-100-collection.vercel.app/data-use

**Films:** https://play-100-collection.vercel.app/#collection-films

**Community:** https://play-100-collection.vercel.app/community

**Creator desk:** https://play-100-collection.vercel.app/creator (authorized owner only)

## Documentation

| Topic | Authoritative guide |
| --- | --- |
| My games, Discover, private data and comparison | [Product behavior](docs/product-guide.md) |
| Runtime structure and boundaries | [Architecture](docs/architecture.md) |
| Account saving, consent and recovery | [Online saving](docs/online-saving.md) |
| Friends, sharing and groups | [Friendships](docs/friendships-plan.md) and [data contract](docs/friendships-data-contract.md) |
| Catalog provenance and licensing | [Discovery sources](docs/discovery-sources.md) |
| Installation, offline access and updates | [PWA](docs/pwa.md) |
| Films and media credits | [Films](docs/films.md) |
| Data reproduction and code locations | [Source data and development](docs/source-development.md) |
| Motion, accessibility and measured limitations | [Motion and accessibility](docs/motion-accessibility.md) |
| Byte limits and performance evidence | [Performance](docs/performance.md) |
| Release gates, lean mode, promotion and rollback | [Release operations](docs/release-operations.md) |
| Production deployment commands | [Deployment procedure](docs/deployment.md) |
| Historical outcomes and open intermittents | [Release ledger](docs/releases.md) and [intermittent register](docs/intermittents.md) |
| Security and owner-operated controls | [Security](docs/security.md) and [security runbook](docs/security-release-runbook.md) |

## Browser support

The floor is the oldest browser that renders and runs the whole app:

| Browser | Floor | Why |
| --- | --- | --- |
| Chrome/Edge | 94 | The ES2022 build (`build.target`), whose syntax Chromium runs from 94. |
| Opera | 80 | Chromium 94. |
| Firefox | 98 | Native modal `<dialog>` (`showModal()`), which every dialog and sheet uses. |
| Safari/iOS | 16.4 | The ES2022 build (`build.target`), whose syntax Safari runs from 16.4. |

`vite.config.ts` gives Lightning CSS exactly these browsers as `build.cssTarget`, so the stylesheets
are minified for the floor; the JavaScript target stays `es2022`.

Below the floor the app cannot run. When the engine fails to parse the app's modules (a `SyntaxError`)
or lacks `Object.hasOwn`, the startup notice says what to update instead of its generic copy: Chrome and
Android System WebView on Android, iOS on an iPhone or iPad, and the browser elsewhere, with a Reload
button and the workbook download (see [First-paint shell](docs/first-paint-shell.md)).
That notice has its own lower syntax floor: **Chrome 66, Firefox 58 and Safari
11.1**. The classic boot script needs ES2019 optional catch bindings, and its
minifier can emit template literals. Older engines cannot parse the boot script
and get a blank page, not the startup notice; the notice is not a universal
fallback for every browser below the application floor.

Above the floor, these are progressive enhancements. Each browser below its version gets the result
described:

- **Dynamic viewport units** (`dvh`: Chrome 108, Firefox 101, Safari 15.4). Every `dvh` height
  follows a `vh` fallback, so the game drawer, dialogs, sheets and scrollers keep their bounds,
  measured against the large viewport.
- **`inert`** (Chrome 102, Firefox 112). Only placeholders and motion hosts use it, and they are
  `aria-hidden` and hold no controls, so nothing changes.
- **`:has()`** (Chrome 105, Firefox 121). Its 36 rules are dropped. Most adjust spacing, scroll
  padding or a state, but these carry layout or focus: the bottom navigation does not reserve the
  Compare chip's slot, so with pins the chip covers Menu on narrow screens; list-view selection
  boxes overlap titles; a jacket whose artwork failed keeps its fixed shape around the fallback
  note; My games' ranking move buttons stay in flow; Discover's genre filter keeps a single grid
  column; and the avatar picker draws no focus ring.
- **The Popover API** (Chrome 114, Firefox 125, Safari 17). It is feature-detected. Without it, a
  friend's More actions menu opens in place, on its own line below the row's actions, instead of
  floating below its button. It has the same keys and closes on Escape, Tab, a choice or a click
  outside it.
- **`text-wrap: balance` and `pretty`** (Chrome 114 and 117, Firefox 121, Safari 17.5). Typography
  only: headings and titles wrap greedily instead.
- **`content-visibility`** (Firefox 125, Safari 18). Long card lists render in full: slower, with
  the same result.
- **`scrollbar-gutter`** (Safari 18.2). The ratings table does not reserve its scrollbar's width.
- **`AbortSignal.timeout()`** and **`requestIdleCallback()`** are feature-detected and fall back to
  timers.
- **Abort checks** use `signal.aborted`, not `throwIfAborted()` (Chrome 100+); cancellation preserves
  the signal's reason when available, or throws an `AbortError` on older browsers.
- **Offline access** needs module service workers (Firefox 147+). Browsing remains
  supported at the stated floor; a browser that ignores or rejects module-worker
  registration gets "Offline access needs a newer version of this browser."

[DESIGN.md](DESIGN.md) takes this policy as given: a new feature above the floor needs a fallback, or
an entry here saying what the older browsers get.

## Run locally

Use Node.js 24 LTS, the major pinned in `package.json` `engines` and used by Vercel.

```powershell
npm ci
npm run dev
```

For the production build and the dedicated preview port:

```powershell
npm run build
npm run preview -- --port 4187 --strictPort
```

The preview is at `http://127.0.0.1:4187`. A strict port avoids accidentally
replacing another project's server. Ordinary `npm run dev` prints its own URL.

## Quality checks

[Testing and evidence](docs/testing.md) documents the lint/type policy, local
commands, suite coverage, audit requirements and native reports.
The full `npm run release:gate` remains the default; the
[release operations runbook](docs/release-operations.md) defines the supported
lean path and the evidence required before promotion.
[iPhone Safari smoke](docs/ios-safari.md) records real Mobile Safari simulator
coverage and its physical-device limits.

### Portable local release evidence

See [manifest collection](docs/testing.md#portable-local-release-evidence) for
native-report manifests and [lean manifests](docs/release-operations.md#lean-release-mode)
for separately scheduled, same-tree release evidence.

### Coverage and limitations

See [coverage and limitations](docs/testing.md#coverage-and-limitations).
Tests and source definitions are not proof that a release ran those checks.

## Data, images and source truth

See [Data, images and source truth](docs/source-development.md#data-images-and-source-truth).

## Rebuild or update the source

See [Rebuild or update the source](docs/source-development.md#rebuild-or-update-the-source).

## Implementation map

See [Implementation map](docs/source-development.md#implementation-map).

## Private library durability

See [Private library durability](docs/product-guide.md#private-library-durability).

## Public catalog integration

See [Public catalog integration](docs/product-guide.md#public-catalog-integration).

## Adaptive graphics and accessibility

See [Adaptive graphics and accessibility](docs/motion-accessibility.md#adaptive-graphics-and-accessibility).

## Deploy to Vercel

See [Deploy to Vercel](docs/deployment.md#deploy-to-vercel).

## Credits and design

`PRODUCT.md` records product truth; `DESIGN.md` records the implemented visual
system. Original numbered jacket drawings, icons, social card and folding
collection sculpture belong to this implementation. Supplied game artwork
remains with its rights holders.

React Bits sources are pinned to
`3a1c7f2f9f94ed833934ab5c2635760b9e644583` and retained in
`third-party\react-bits`, including the complete MIT + Commons Clause license.
CountUp, Magnet and AnimatedContent are actual customized derivatives.
The application does not sell or redistribute a component library.
`public\credits.txt` and `public\licenses` provide public notices, including
React, Three.js and the SIL-licensed Barlow Condensed / Hanken Grotesk
fonts, which are self-hosted.
