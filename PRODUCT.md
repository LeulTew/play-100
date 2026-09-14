# Play 100

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Gamers choosing their next game, browsing a personal curated collection on mobile
or desktop, and sharing an interesting game or a filtered shortlist with friends.

## Product Purpose

Make a real 100-game spreadsheet useful as a readable, shareable website and an
improved downloadable workbook. The original main-sheet order is authoritative.

## Positioning

A finite, authored collection, not an algorithmic recommendation service or an
official best-games ranking. Every game retains its place, source rationale,
original genre and entered critic-score snapshot.

## Operating Context

Public, no account, no analytics and no Supabase. A read-only, stateless Vercel
function looks up public catalog metadata; there is no server-side personal
database. Private library records, play order, played/completed states, personal
rankings, scores, notes and preferences live in IndexedDB on this device.
Export/import backups support deliberate transfer between browsers, not cloud
sync. Shareable collection URLs never contain private progress or opinions.

## Capabilities and Constraints

- Exactly 100 canonical games: core ranks 1-50, essential ranks 51-100.
- Search, original-genre/year/tier filters, sortable native-scale ratings table,
  card/list views, selection mode and atomic bulk list/ranking actions.
- A separate private play queue with mouse/touch dragging, keyboard sorting and
  move buttons. Completed games may remain queued for replay.
- A separate personal-ranking page with optional scores and notes. Ranking a
  game does not imply playing or completing it; unplayed entries are allowed.
- Original and enhanced XLSX downloads, clearly distinguished from private data.
- Broader, user-triggered catalog browsing/search/import from Wikidata and the
  documented FreeToGame API. Manual game entry is available. Coverage follows
  provider classifications and limits, not an exhaustive scrape of all sites.
- Existing localStorage lists migrate only after IndexedDB commits. Corrupt data
  is preserved with an explicit recovery path. Failed writes are not reported as
  durable success. Backups are validated before atomic replacement.
- Missing scores remain unavailable, never zero. IGN and GameSpot use /10;
  Metacritic, Metacritic PC and PC Gamer use /100.
- The normalized average uses all available entered columns, including both
  Metacritic columns. It is not an official or independent-publications rating.
- Leul's original cached ratings belong to the public creator and are visible
  by default. Their original rank-based provenance, rounded values and notes
  must not be replaced by a reconstructed curve or confused with visitor ratings.
- Explicit AI/not-played source notes are preserved. No title starts completed.
- Visitor ratings reorder unpinned personal entries automatically. A manually
  moved game retains a persisted position until explicitly returned to automatic
  order. Existing orders are preserved during schema upgrades.
- One Played value is shared by every view; author notes never set visitor state.
- No invented platforms, playtimes, trailers, current reviews or cover art.
- One real, lazy-loaded Three.js enhancement with a useful original static
  fallback; all essential functionality is independent of WebGL.
- Respect reduced motion, document visibility, touch devices, data-saving
  preferences and constrained hardware, with a manual quality control.

## Brand Commitments

Working name: Play 100. A futuristic, thoughtfully animated, focused collection
without visual clutter, generic neon SaaS styling, fake features or performance
claims. Use actual customized React Bits source components with attribution.

## Evidence on Hand

The supplied `AAA_games_u_have_to_play_list_top_100.xlsx` main tab is authoritative.
The separate data workstream provides canonical JSON, 100 mapped cover images,
an enhanced workbook and reproducible generation material. Critic scores are
carried-over snapshots, not live or independently verified.

## Product Principles

- Browsing is the first action, not the reward for finishing an animation.
- Preserve authorship and distinguish collection facts from visitor state.
- Make sharing public and personal tracking explicitly private.
- Graceful enhancement, readable content and truthful controls beat spectacle.

## Accessibility & Inclusion

Keyboard operation, visible focus, semantic controls, 44px touch targets, readable
contrast, focus-managed dialogs, ordinary scrolling, responsive layouts and
mobile safe areas are required.

## Authorized Implementation Decisions

The user explicitly delegated remaining decisions and requested autonomous
execution after an approval round. Vite, React and TypeScript are implementation
choices. A separate public Vercel project is authorized; unrelated projects and
the original workbook must not be modified.

## Public Creator and Repository

The user authorized public source publication under `LeulTew/play-100` and
visible site/enhanced-workbook attribution to Leul Tewodros Agonafer, with the
verified GitHub repository, LinkedIn and Telegram `@fabbin` links in `author.json`.
This does not authorize publishing private browser libraries, credentials, CI
workflows or an automatic Vercel Git integration. The original archive stays
byte-identical.
