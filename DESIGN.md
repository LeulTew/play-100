---
name: Play 100
description: A listening-counter collection index, expressed through chalk, ink and numbered record jackets.
colors:
  paper: "#f3f3e9"
  white: "#fdfdf6"
  ink: "#20231e"
  muted: "#606457"
  lime: "#d3f36b"
  line: "#d1d4c6"
typography:
  display:
    fontFamily: "Barlow Condensed, Impact, Arial Narrow, sans-serif"
    fontSize: "clamp(64px, 6.75vw, 96px)"
    fontWeight: 800
    lineHeight: 0.93
    letterSpacing: "-.024em"
  display-mobile:
    fontFamily: "Barlow Condensed, Impact, Arial Narrow, sans-serif"
    fontSize: "clamp(44px, 13vw, 60px)"
    fontWeight: 800
    lineHeight: 0.93
    letterSpacing: "-.024em"
  display-compact:
    fontSize: "clamp(42px, 13vw, 49px)"
  body:
    fontFamily: "Hanken Grotesk Variable, Segoe UI, sans-serif"
  button:
    fontFamily: "Hanken Grotesk Variable, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.25
  artifact-control:
    fontFamily: "Hanken Grotesk Variable, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.2
rounded:
  control: "4px"
  artifact-control: "2px"
spacing:
  gutter: "clamp(24px, 4vw, 72px)"
  control-gap: "12px"
components:
  button-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px 22px"
  button-dark-hover:
    backgroundColor: "#39422e"
  button-lime:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px 22px"
  button-lime-hover:
    backgroundColor: "#c2e459"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px 22px"
  button-outline-hover:
    backgroundColor: "#e6e9dc"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px"
  button-quiet-hover:
    backgroundColor: "#e6e9dc"
  button-danger:
    backgroundColor: "#8c3026"
    textColor: "#fff"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px 22px"
  artifact-control:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.artifact-control}"
    rounded: "{rounded.artifact-control}"
    padding: "10px 14px"
---

# Design System: Play 100

## Overview

**Creative North Star: "The listening-counter collection index"**

Warm chalk, graphite ink and flat acid-lime sleeves make a finite collection feel like a handled record-store crate. Condensed box-art typography, numbered jackets and open ruled lists carry the identity; controls remain direct and unornamented.

The implemented collection is an Operate surface: finding, filtering and opening a game takes priority over spectacle. Ordinary scrolling and optional dimensional motion keep the catalogue usable without completing an introduction. This describes the existing collection, not a mode requirement for every future surface.

**Key Characteristics:**
- Chalk-and-ink clarity with flat lime emphasis.
- Canonical rank numbers and authored jacket imagery.
- Compact controls, responsive density and optional motion.

Extracted from `src\styles.css`, `src\components\scene\artifact.css`, the visual contract in `index.html`, and the confirmed constraints in `PRODUCT.md`. The frontmatter is normative for extracted primitives; `.impeccable\design.json` extends it with states, motion and preview metadata.

## Colors

### Primary
- **Flat acid lime** (`lime`): sleeves, selection and purposeful control emphasis, never a light source.

### Neutral
- **Warm chalk** (`paper`): the page and sticky header.
- **Soft white** (`white`): light contrast against dark actions.
- **Graphite ink** (`ink`): primary reading, outlines and dark actions.
- **Muted olive grey** (`muted`): secondary information.
- **Chalk divider** (`line`): quiet ruled separation.

Control-specific hover and destructive colors remain component variants, not an expanded brand palette. Sidecar tonal ramps are generated swatch-preview metadata, not implemented CSS palette steps.

## Typography

Barlow Condensed supplies the compact, box-art display voice; Hanken Grotesk Variable carries body text and controls. The original artifact SVG still declares `"Hanken Grotesk", sans-serif`; do not mistake that local fallback for the root body stack.

Use the extracted display roles rather than an oversized generic hero: desktop tops out at the documented display maximum, mobile uses `display-mobile`, and widths up to 380px use `display-compact`. Intermediate layouts also reduce the headline. The compact role changes size only; it retains the display weight, tracking and line height.

**The Rank Rule.** Keep canonical rank visible; sorting changes presentation, never the displayed authored rank.

## Layout

- Desktop pairs the left-aligned introduction with the numbered dimensional stack. The sticky, ruled header has an 80px minimum height; search and actual games follow in ordinary document flow.
- Use the extracted fluid gutter; at the narrowest breakpoint (380px and below), the implemented gutter is 17px.
- Preserve the compact mobile introduction: its contextual artifact stage is 185px high and its artifact root minimum is 236px. Retain the tightened gaps and the **Explore all 100** CTA.
- Those contextual values override the reusable artifact's standalone mobile defaults: a 220px stage and 274px root minimum at 640px and below. The standalone desktop stage is `clamp(245px, 27vw, 320px)` with a 245px minimum and a 292px root minimum.
- Keep mobile search, filters and sorting thumb-friendly. At 380px and below, the result summary and view controls each occupy a full row; the sort label remains visible.
- Collection focus mode prioritizes the working index without introducing another visual theme. The game-detail drawer stays in the same chalk-and-ink system, with focus management, readable actions and mobile safe-area clearance.

## Elevation & Depth

Depth belongs to the overlapping numbered jackets and the optional sculptural archive, not glowing interface chrome. Ruled lists preserve the reading order. This extraction introduces no general-purpose shadow token.

The real Three.js canvas is a lazy enhancement with the original SVG still as its useful fallback. Explicit **Auto / Full / Lite** choices remain available. Do not keep animation loops running offscreen, in hidden documents or against system reduced-motion preferences. A quality choice never gates search, filtering, details or private tracking.

On touch/coarse-pointer devices, **Auto** starts the real 3D scene only when the
visitor requests the fan interaction; **Full** still starts it automatically.
The original illustration stays useful before activation. This is a device
performance policy, not a benchmark-specific or user-agent exception.

## Shapes

Controls have restrained corners: the standard control radius and the smaller artifact-control radius are recorded above. Preserve the original numbered jacket geometry instead of replacing it with large-radius generic cards.

The play mark's triangle is intentionally made from transparent top/bottom borders and an ink left border; these are logo geometry, not card decoration.

## Components

### Buttons

Direct and compact. Standard buttons have a **48px minimum height**, a 12px internal gap and the frontmatter padding. Text actions have a 44px minimum height; icon buttons are 44px square. Keep the overall 44px touch-target floor.

Dark, lime, outline, quiet and destructive variants use the extracted assignments. Outline buttons use a 1px `#a5ac98` border, changing to ink on hover. Disabled buttons use opacity `.45` and a `not-allowed` cursor. Button/link color, background-color and border-color transitions last 150ms.

### Search, filters and navigation

Keep search, original-data filters, sorting and device-list controls legible and directly operable. Do not imply that changing the view changes authored ranks. Desktop navigation is direct; mobile prioritizes reachable controls rather than decorative navigation chrome.

Search and native selects use visible labels above 48px controls. A shared
select shell centers its noninteractive SVG chevron on the value row, not on
the combined label/control height. On mobile, search and genre occupy full
rows, followed by year/collection columns; sort and layout controls align along
their control bottoms. Native menus, keyboard behavior and focus outlines stay
intact. Online search scope is explicit beneath the fields.

Unranked matches and saved additions use an open ruled list below the original
100, not fake numbered jackets or empty critic-score cells. Source attribution
and a restrained Unranked label distinguish public metadata from the visitor's
rating. Save, Played and rating controls stay together, reflowing into larger
touch-friendly rows on mobile. Loading/error controls belong to each source;
saved records remain usable independently.

Game details keep the creator's original score and **Your rating** visually and
semantically separate. Private ratings and notes commit on editor exit as well
as their normal save triggers. Unordered library views omit disabled drag/move
chrome; actual play queues retain all existing ordering affordances.

Private-library removal is a deliberate destructive action, not a bookmark
toggle. A restrained trash control opens a confirmation naming affected games
and private data; **Keep games** receives initial focus. Failed removal remains
in the dialog with a recovery message. No visitor action removes the public
100 or changes its authored ratings.

### Account and community surfaces

Account, publication, Community and the creator desk extend the existing
Operate layout: short display headings, Hanken Grotesk body copy, native
48px fields, open ruled lists and clear state-specific actions. Account uses
a primary sync/recovery column and a smaller identity/sharing column; these
collapse to one column on mobile. Public rankings lead with the chosen
identity and useful game rows, not another animated hero.

The Google sign-in control is a deliberate provider-brand exception:
the official Google mark, white background, neutral border and a familiar
sans-serif label follow Google's button guidance. It is not a new site-wide
typeface or palette. All remaining interface typography stays in the existing
system.

The compact header Account entry exposes saving status without adding a sixth
mobile navigation item. Community is reachable through Discover and Account.
Public sharing is secondary to editing, with an exact frozen preview and
independent directory consent. Routine sync does not generate toast spam.

Creature avatars use a pinned, static Critters recipe with rounded silhouettes
and selected flat palettes. Six choices, Shuffle, palette and Save are enough;
there is no upload control, remote photo dependency or perpetual animation.
Rendered avatar images have fixed dimensions. A published profile keeps its
snapshot identity until explicitly updated.

Buttons, links, inputs, selects and summaries use a visible **3px `#426515` outline with 4px offset**. Preserve semantic controls, the skip link and keyboard access; do not substitute hover-only affordances.

### Numbered jackets and collection rows

Use the supplied cover files at native resolution: mostly about 96 × 120px, with nine 150px-wide images. Keep them inside the original numbered SVG jackets where used; they are not material for oversized cinematic backgrounds. Rank, title and collection facts stay readable independently of imagery or WebGL.

### Ratings tables and personal-library pages

The extension keeps the same visual world. Dense ratings data uses Hanken body
type, tabular numerals, explicit native score scales and unavailable-value
dashes. The author rank stays distinct from the optional personal score.
Table headings carry real sort state; horizontal scrolling is deliberate,
keyboard reachable, and limited to the table rather than the page.
Table mode omits the decorative introduction so the spreadsheet-like working
surface leads. The default grid/list browsing introduction remains unchanged.

Private-library and ranking pages use compact fixed-size Barlow headings
(52px desktop, 41px mobile, 37px narrow mobile), ordinary ruled rows and quiet
olive-neutral control states. The 10-14px supporting data labels extend the
existing dense utility scale; they are not additional display faces or a new
palette. Active tab underlines indicate navigation, not decorative card edges.
Mobile omits the redundant second headline line on private/catalog pages and
groups ranking controls more densely without reducing their touch targets.
An explicit catalog search or page change brings its new results heading into
view and focuses it; typing alone never moves the page.

Drag handles are 44px, touch scrolling remains normal outside them, and up/down
buttons are equivalent controls. Disabled reordering explains the active
search/selection constraint. Bulk actions have explicit scope and counts.
Own scores and notes never masquerade as the source critic snapshot.
The visible public creator value is **Leul's original rating /10**, read from
the original workbook cache. Keep it distinct from the visitor's **Your rating**
editor. Do not hide the creator's value behind a derived-index toggle.
Shared footer credits use `author.json` on every route. Personal rating changes
sort only unpinned entries; a fixed-position indicator explains manual overrides.

Catalog source switches, loading/errors and provenance are part of the working
surface. No external artwork or invented rating tiles fill missing metadata.
Backup/restore and persistence messages distinguish committed IndexedDB data
from temporary tab state; no cloud-sync treatment is implied.

### Scene fold control

The outlined **Fan out / Stack up** control has a 112px minimum width and 44px minimum height, a 1px ink border, and lime hover/active feedback. Its local focus treatment is a **2px ink outline with 4px offset**. Preserve its forced-colors treatment and truthful rendering-status copy. Rendering quality is a separate **Auto / Full / Lite** radio group in Settings.

### Motion and detail drawer

Retain the actual customized React Bits **CountUp**, **Magnet** and **AnimatedContent** implementations; attribution is maintained elsewhere in the project. Their role is feedback and restrained arrival, not a prerequisite to browsing.

Keep drawer focus management and mobile safe areas intact. The narrow-screen detail actions share available width; supplementary details must not push the primary controls out of reach.

## Do's and Don'ts

### Do:
- **Do** preserve canonical rank and recognizable supplied artwork.
- **Do** keep keyboard focus visible and interactive targets at least 44px.
- **Do** retain the compact mobile introduction and Explore all 100 CTA.
- **Do** keep essential controls usable in Auto, Full and Lite.

### Don't:
- **Don't** use neon, glow, generic floating cards or decorative clutter.
- **Don't** enlarge tiny cover files or substitute invented artwork.
- **Don't** run animation loops offscreen or against system reduced-motion preferences.
- **Don't** present private device state as a change to the public collection.
