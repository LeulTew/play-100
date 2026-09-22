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
- Keep mobile search and the compact result/view row primary. Secondary filters
  and sorting live in a labelled native disclosure with an active count; the
  same labelled fields stay expanded on desktop, without duplicate controls.
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

The secondary **Menu** is an Operate navigation surface, not an application
command menu or dashboard. A labelled desktop control replaces the Settings
icon; mobile replaces only the fifth Settings slot. Direct primary navigation
and the Account/status entry remain. Settings & backups stays a real dialog
action inside Menu.

Use the existing native Dialog with a quiet, ruled, two-column directory on
desktop and one scrollable column on mobile. Browse, My games, People & sharing,
Account & tools, and Workbooks provide short task-based groups. The title and
close control stay reachable while entries scroll. Preserve 44px targets,
safe-area clearance at 320px, ordinary Tab navigation, Escape and return focus.
Navigation uses real links, `aria-current="page"` and a visible Current label;
dialogs use buttons. There is no `role="menu"` or arrow-key command model.
Chalk, ink, flat lime, Barlow headings and Hanken labels remain unchanged, with
no new decorative art, shadow or animation. Menu uses a 36px desktop / 32px mobile
heading, 15px links, 14px group and feedback labels, and an 11px Current marker;
these are scoped utility roles, not a change to the site's display scale.
Pending-navigation and save-error
feedback belongs inside the dialog; the underlying editor stays mounted until
its valid edits commit. Escape cancels the transition without discarding work.

Search and native selects use visible labels above 48px controls. A shared
select shell centers its noninteractive SVG chevron on the value row, with the
same width bounds as the actual select, not on the combined label/control
height. Search and result/view controls remain visible on mobile; the native
Filters & sort disclosure groups the existing private-view, genre/year/tier,
progress, sort and public-lookup controls. Genre and sort occupy full rows
inside it. Native menus, keyboard behavior and focus outlines stay intact.
Online search scope is explicit beneath the fields and is never reset by
opening the disclosure.

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

Compare starts with a compact heading and readable chosen names, then the
native Change people disclosure. Once a saved cohort resolves, its editor
starts collapsed; deliberate editing is never interrupted by checking the
second person. Search/mode controls and a truthful coverage statement lead
into the existing single matrix. Coverage & loading holds detailed counts
and actions without unmounting readers; named errors and revocations remain
visible outside it. The bounded, keyboard-focusable table scrolls on both
axes with an opaque sticky participant header row and sticky Game corner.
Private-group naming remains a separate explicit editor below the table.
At 380px and below the Compare heading uses the existing 32px compact display
scale so the labelled Friends return action stays on its heading row. Body and
matrix text are not reduced to fit participants; the native horizontal region
keeps their complete names and separate score columns.

Buttons, links, inputs, selects and summaries use a visible **3px `#426515` outline with 4px offset**. Preserve semantic controls, the skip link and keyboard access; do not substitute hover-only affordances.

### Numbered jackets and collection rows

Use the supplied cover files at native resolution: mostly about 96 × 120px, with nine 150px-wide images. Keep them inside the original numbered SVG jackets where used; they are not material for oversized cinematic backgrounds. Rank, title and collection facts stay readable independently of imagery or WebGL.

### Ratings tables and personal-library pages

The extension keeps the same visual world. Dense ratings data uses Hanken body
type, tabular numerals, explicit native score scales and unavailable-value
dashes. The author rank stays distinct from the optional personal score.
Table headings carry real sort state; horizontal scrolling is deliberate,
keyboard reachable, and limited to the table rather than the page. On mobile,
a compact sticky game cell includes its original rank while scores scroll.
It leaves room for a useful numeric column rather than pinning a wide desktop
identity block; sort buttons retain the 44px inline target floor.
Table mode omits the decorative introduction so the spreadsheet-like working
surface leads. The default grid/list browsing introduction remains unchanged.

Private-library and ranking pages use compact fixed-size Barlow headings
(52px desktop, 41px mobile, 37px narrow mobile), ordinary ruled rows and quiet
olive-neutral control states. The 10-14px supporting data labels extend the
existing dense utility scale; they are not additional display faces or a new
palette. Active tab underlines indicate navigation, not decorative card edges.
Mobile omits the redundant second headline line on private/catalog pages and
groups ranking controls more densely without reducing their touch targets.
An explicit catalog page change brings its new results heading into
view and focuses it; typing alone never moves the page. Known local Discover
pages use the existing 24-item slice with First/Previous, one native direct-page
choice, Next/Last and a truthful range. Provider pagination remains separate.
Late catalog loading does not clamp a valid URL to a temporary count; pending
rating edits are saved or visibly retained before results can change.

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

CountUp's single queue badge keeps damping45/stiffness240 with bounded native
frames, not an eager general-purpose animation engine. The accessible number is
always exact; the initial display is already correct. Retarget without flashing
the final value before rewinding, and snap on disabled motion or scope change.
Never interpolate between account scopes or remount a sibling editor for a count.

Keep drawer focus management and mobile safe areas intact. The narrow-screen detail actions share available width; supplementary details must not push the primary controls out of reach.

The signature interaction is one public game sleeve moving from its source
into the existing native detail, with the actual form stationary. Fine-pointer
entry/return limits are 240/160ms; coarse-pointer limits are 180/120ms. Use the
original numbered geometry or an existing exact-ID licensed catalog image,
never an enlarged workbook bitmap, editor clone or private-content snapshot.
Missing or stale origins take the immediate path; an eligible no-origin catalog
artwork settle is at most 160ms fine / 140ms coarse.

Menu enters in 180ms; ready Settings, About and sign-in utilities use 160ms.
Cold or unsafe account readiness stays static. Native close, unlock and exact
focus restoration are independent of every visual handle. Utility forms have
no retained exit tail. Route headings use 160/120ms and accepted tab/range cues
120/100ms; persistent editors, rows and exact selection counts do not animate
or remount. These are authored duration limits, not measured input latency.

Card/title Compare input keeps its generic public drag indicator separate from
the source and from private reorder grips. Only a newly accepted pin receives
the optional 150ms settle. Temporary empty drop targets must not compact the
collection toolbar or change the source layout; real pins and storage messages
retain their existing mobile clearance, including while another drag is active.
Normal scrolling and selection win before broad card/title touch ownership.
The visible 44px Compare handle is Pin-only for touch and pen, including on
mixed-pointer devices; only fine-mouse input may start a drag from it. Coarse
layouts use the stack icon and Pin wording, not a drag affordance. Keep native
panning and keyboard activation on this button. This deliberate safety fallback
does not claim a root-cause fix for the retained post-grip native-click failure.
The existing capture-ownership guard remains scoped to its node and pointer;
touch and pen no longer enter that grip-capture path.

The six-game comparison tray keeps identities and actions ahead of long artwork
attribution. The tray and catalog detail use the native Artwork credits
disclosure; their full source credit and license/source links remain unchanged. Compare is
labelled as rankings with friends. Root mobile focus scrolling reserves the
fixed bottom navigation and safe area, including on recovery controls.

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
