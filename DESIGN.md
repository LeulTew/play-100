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
  control-border: "#7f8179"
  wash: "#e6e9dc"
  tint: "#e5ecd9"
  lime-tint: "#e4eccf"
  moss: "#516044"
  sage: "#697252"
  border: "#b8c2a8"
  focus: "#426515"
  accent: "#405e1c"
  edge: "#a5ac98"
  selected: "#6b8149"
  hover-icon: "#e1e6d4"
  hover-select: "#e9ecdf"
  hover-lime: "#c2e459"
  hover-ink: "#39422e"
  positive: "#405d21"
  danger: "#8c3026"
  danger-tint: "#f6e6dc"
  danger-edge: "#cfa89b"
  warning: "#744719"
  warning-tint: "#f5ead5"
  caution-tint: "#f8e3bc"
  caution-edge: "#cfb782"
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
    backgroundColor: "{colors.hover-ink}"
  button-lime:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px 22px"
  button-lime-hover:
    backgroundColor: "{colors.hover-lime}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px 22px"
  button-outline-hover:
    backgroundColor: "{colors.wash}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px"
  button-quiet-hover:
    backgroundColor: "{colors.wash}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.white}"
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

### CSS ownership and order

The entry stylesheet follows the module graph from `src\main.tsx`, which imports `App` before the global partials, so the build emits, in this order:
1. the web font faces (`@fontsource`);
2. the stylesheets of App's eager components, in the order the module graph reaches them (currently game artwork, compare tray, motion, artifact, browse filters, collection films, discover and route fallback);
3. `src\styles.css`: the `src\styles\` tokens, base, layout, components and utilities partials, in that order;
4. `src\shared-ui.css`: the shared-layout, shared-controls and shared-responsive partials for shell/navigation, Collection, cross-route controls and their overrides;
5. `src\render-containment.css`.

Lazy routes and features append their chunk stylesheets after it as they load: My games, the online controller, Settings, catalog detail, catalog enrichment and the local pager. So at equal specificity the partials beat eager component stylesheets, shared-* beats utilities, and a loaded lazy stylesheet beats everything eager. These are CSS-only source imports, not additional JavaScript entry points. Keep responsive and accessibility overrides in their existing sequence rather than regrouping selectors across sections.

My games-only rules live in the existing lazy `src\components\personal\my-games.css`; cloud-only catalog form rules live in `src\cloud\cloud-ui.css`. Shared tabs, inputs, card controls, route skeletons and first-paint shell rules remain eager. Before moving another rule, check every consumer and its import path, including constructed class names and the static Collection/DiscoveryCard path.

The ranking picker belongs to my-games.css, catalog facts/links to catalog-detail-motion.css, and Settings/backup layout to settings-controls.css (the existing offline-controls sheet, renamed). Settings typography that ties with generic dialog rules stays eager to preserve the winner even when legacy builds place entry CSS after lazy links. Personal rating styles stay shared because GameDetail is eager. Manual-add styles also stay shared: Discover and My games have no existing common lazy CSS owner, and splitting one out requires a separately budgeted asset decision.

Feature overrides must beat shared defaults by specificity, not by stylesheet arrival order: an eager feature stylesheet arrives before the shared partials, and a lazy one after them. Use existing co-occurring classes or a feature ancestor (for example, `.app-page.auth-page` and `.personal-tabs.my-games-motion-tabs`) and keep responsive/forced-colors variants at the same specificity. Check generic dialog and page-heading rules before moving or adding a feature override.

### Browser floor

Styles and scripts target the browser floor in [README "Browser support"](README.md#browser-support): Chrome and Edge 94, Firefox 98, Safari and iOS 16.4. A feature above the floor needs a fallback, or an entry there saying what older browsers get; a `dvh` height, for example, follows its `vh` fallback.

## Colors

### Primary
- **Flat acid lime** (`lime`): sleeves, selection and purposeful control emphasis, never a light source.

### Neutral
- **Warm chalk** (`paper`): the page and sticky header.
- **Soft white** (`white`): light contrast against dark actions.
- **Graphite ink** (`ink`): primary reading, outlines and dark actions.
- **Muted olive grey** (`muted`): secondary information.
- **Chalk divider** (`line`): quiet ruled separation.
- **Control edge** (`control-border`): the resting border of search fields, native selects, text inputs and text areas. Graphite ink at 55% over chalk, it keeps 3.54:1 against chalk, 3.87:1 against soft white and 3.30:1 against the select hover fill (`hover-select`). Decorative rules, keycaps and chips stay on `line`; focus, hover and disabled states keep their own treatments.

### Tints and quiet text
Quiet surfaces, secondary text and panel edges are tokens too, so near-identical values cannot drift apart:
- **Chalk wash** (`wash`): badges, table headers, notes, pickers, artwork placeholders and loading skeletons, and the hover fill of quiet and outline buttons, menus and the account control.
- **Pale tint** (`tint`): notices, previews, rating details and the selection bar, and the chosen option, avatar or bottom-navigation item.
- **Lime tint** (`lime-tint`): the workbook section, catalog art placeholders, place badges, share notices and selected table rows.
- **Moss** (`moss`): olive secondary text in dialogs, panels, tables and lists. It keeps at least 5.3:1 against chalk, the tints and the hover fills.
- **Sage** (`sage`): the lighter second line of display headings, and quiet icons.
- **Panel edge** (`border`): the borders of panels, option cards and pickers, and the bottom navigation's top edge.

### States
State colors are tokens in `src\styles\tokens.css`, so one role has one value everywhere:
- **Focus** (`focus`): focus outlines, the focused search field and Discover's selected card outline.
- **Selected** (`selected`): the selected Collection card's outline, the chosen motion option's edge and a dragged row's edge.
- **Accent** (`accent`): native checkbox and radio fills, and the hovered sort control in the ratings table.
- **Edge** (`edge`): the outline button's and avatar palette's resting border, and the ratings table's frame and header rule.
- **Hover** (`wash`, `hover-icon`, `hover-select`, `hover-lime`, `hover-ink`): quiet and outline buttons, menus and the account control hover to the chalk wash. Icon buttons hover to `hover-icon`, which also marks the active view; selects and table rows hover to `hover-select`, lime buttons to `hover-lime`, and dark buttons and the toast's icon buttons to `hover-ink`.
- **Positive** (`positive`): notices, completed markers and pressed states.
- **Danger** (`danger`, `danger-tint`, `danger-edge`): errors, danger text and destructive actions.
- **Warning and caution** (`warning`, `warning-tint`, `caution-tint`, `caution-edge`): emulator, sync and catalog warnings and catalog errors, and cautions about storage and about a cached collection without its original ratings.

The remaining literal colors are not interface roles. Google's sign-in button keeps the colors Google's branding guidelines set for it. The jacket palette and the workbook illustration are artwork, and the wordmark's full stop and the hero footnote's dot belong to the logo and the landing illustration. The card meta dot and the byline slash are separator marks, set lighter than the text they separate. The shadows, the dialog backdrop, the avatar swatch outline and the file badge's rule are ink or chalk at partial alpha, which CSS at the browser floor cannot derive from a token (`color-mix()` needs Chrome 111 and Firefox 113). Sidecar tonal ramps are generated swatch-preview metadata, not implemented CSS palette steps.

## Typography

Barlow Condensed supplies the compact, box-art display voice; Hanken Grotesk Variable carries body text and controls. The decorative artifact SVG uses non-text print marks, with readable captions outside the scaled illustration.

Use the extracted display roles rather than an oversized generic hero: desktop tops out at the documented display maximum, mobile uses `display-mobile`, and widths up to 380px use `display-compact`. Intermediate layouts also reduce the headline. The compact role changes size only; it retains the display weight, tracking and line height.

Barlow Condensed's glyphs are 1.2em tall, taller than the 0.93 hero and 0.98 workbook title lines. Those two titles pad their block edges by half the difference and cancel it with an equal negative margin, so their glyphs stay inside the heading's box, where clipping and text-spacing checks see them, without moving a line.

Informative text has a **12px computed minimum**, including metadata, counts,
credits and operational status. Body and action roles remain 13–17px; use
weight, spacing and line height rather than smaller type to distinguish utility
text. Only explicitly `aria-hidden` illustration lettering may use 11px.
Card identities and metadata can wrap without changing the numbered jackets or
native-size artwork. Increased text spacing must not clip controls or labels.
Discover title buttons top-align the first line across single-line and wrapped
names, retaining the full-width 44px target and aligned card actions.

In forced colors, system-color borders, outlines and underlines distinguish
focus and selected states without depending on lime fills. Native inputs and
currentColor icons retain the user's palette; do not force brand colors.
The shared tray observer measures the header, bottom navigation and notification
as well as the dock for scroll clearance. Ordinary mobile navigation stays
at least 66px high; labels and increased text spacing may grow it. The ratings
table alone retains its labelled horizontal scroll region.

**The Rank Rule.** Keep canonical rank visible; sorting changes presentation, never the displayed authored rank.

Cover thumbnails are the owner's workbook art at native resolution, never enlarged.
Higher-resolution replacements for mapped originals in `data/assets` flow through `npm run prepare:assets` without component changes.

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

Settings shows a motion choice immediately while saving it, without disabling
the focused radio during that save. The latest choice made while saving is saved next.
A failed save restores the saved choice and announces the failure in Settings.
Successful preference saves are announced inside Settings only after the latest
queued choice finishes; temporary storage is labelled, without a duplicate
page-level toast.

On touch/coarse-pointer devices, **Auto** starts the real 3D scene only when the
visitor requests the fan interaction; **Full** still starts it automatically.
The original illustration stays useful before activation. This is a device
performance policy, not a benchmark-specific or user-agent exception.

Automatic, unrequested scene loading and WebGL construction use separate
cancelable idle turns without a deadline. An explicit Fan out or Stack up
request bounds each pending idle turn to 150ms; it does not restart an already
loaded scene. Visibility, reduced-motion and resource-saving gates still apply.
The deadline bounds idle scheduling, not network or rendering completion time.

Lite, system reduced motion, resource-saving Auto and a failed WebGL scene show
the settled illustration without a Fan out control. Eligible touch Auto keeps
the explicit Fan out action that starts 3D; unavailable rendering never leaves
an interactive promise behind.

The initial WebGL resting covers match the still's projection, alternating
angles and layer spacing, with the same shallow printed ground guide. There is
no startup lift. A 180ms opacity handoff begins only after a rendered frame,
with allowed motion on a fine pointer; static and coarse-pointer modes retain
their immediate representation switch. Input and idle activation never wait.
A Fan out or Stack up made before the scene is on screen leaves the
illustration's pose as it is: the scene first renders that pose, then animates
to the request, so the first Fan out on touch Auto folds as a fine pointer's
does.

## Shapes

Controls have restrained corners: the standard control radius and the smaller artifact-control radius are recorded above. Preserve the original numbered jacket geometry instead of replacing it with large-radius generic cards.

The play mark's triangle is intentionally made from transparent top/bottom borders and an ink left border; these are logo geometry, not card decoration.

## Components

### Buttons

Direct and compact. Standard buttons have a **48px minimum height**, a 12px internal gap and the frontmatter padding. Text actions have a 44px minimum height; icon buttons are 44px square. Keep the overall 44px touch-target floor.

Dark, lime, outline, quiet and destructive variants use the extracted assignments. Outline buttons use a 1px `#a5ac98` border, changing to ink on hover. Disabled buttons use opacity `.45` and a `not-allowed` cursor. Button/link color, background-color and border-color transitions last 150ms.

### Search, filters and navigation

Keep search, original-data filters, sorting and device-list controls legible and directly operable. Do not imply that changing the view changes authored ranks. Desktop navigation is direct; mobile prioritizes reachable controls rather than decorative navigation chrome.

The Display layout switch draws its inactive icons in `muted` (5.4:1 at rest, 4.8:1 under the pointer's hover fill). The active view keeps its ink icon and pale fill, and adds a 2px ink underline, as the collection tabs mark theirs, so it stays distinct from a hovered neighbour.

The collection heading reads "The collection · 100 games": the count is a small muted phrase on the title's baseline, not a superscript token. Up to 760px it becomes the title's caption line, without the separator. Its accessible name stays "The collection, 100".

Discover's four primary filters share SelectField's existing progress-filter
treatment: 12px labels, 48px native selects, `control-border` edges and
soft-white fill. The mobile filter disclosure and optional exact-source-genre
control remain.

Keyboard Show more continues at the first appended game's title in Grid, List
and Table; pointer activation keeps its existing focus behavior.

Table view places the Compare tray in its own strip below the table scrollport,
not over the cells. With pins present, the table and strip fit the usable window;
the first pin reveals both the tray and the next row action. Other views use a
46px count chip with a 44px control: above 760px it sits beside Play later in the
sticky header; below that it occupies its own slot in the bottom-navigation band.
No pin-dependent gutter or content width changes. In the header, a spacer after
the wordmark as wide as the chip's slot keeps the centred navigation where it
stands without pins, so the chip arriving or leaving never moves it while the
header has room for both. Where it has less, the spacer gives way before
anything else does, so the navigation moves only as far as it must to stay 12px
from the actions.
Above 760px, header items keep 12px apart while the chip is there, and 10px at
761–763px, where the configured header would otherwise be up to 2.3px short of
room for the chip and its labels would wrap. The five
navigation targets
retain at least 44px each, with intrinsic word widths protected when pins need a
slot. One activation opens the existing native tray and its Choose friends action.
No scroll-driven hiding, resize loop or automatic expansion changes the resting
chip. During an explicit desktop drag, its target expands left and down from the
same header slot to 320px by 88px, retaining the original hit area and header height.
The header dock is fixed at that slot's static position, not absolutely positioned
inside the sticky header. Native target reveal must not scroll the source away
between press and drag. Its `46px - 100%` translation is zero at rest and preserves
the slot's right edge during expansion, without JavaScript positioning.
The touch drop target stays above navigation. Overlap during that explicit gesture
is not a resting browsing state. Pin refusals appear in the existing viewport
notification. The tray's polite status announces them once.
Chip-specific header spacing and stacking use the runtime-only
`data-compare-chip` attribute, not a `:has()` condition that the critical-CSS
extractor strips. The table strip is in normal flow with a flat border, not
the old floating dock's shadow and positioning.
On narrow windows, a visible toast reserves its measured height and entrance
clearance in the table's height limit, keeping the inline strip clear without
changing the desktop layout or moving it into the table scrollport.
Collection Grid, List and Table share the same inline comparison toggle:
Pin for comparison becomes Unpin from comparison while selected.
Result counts use a singular label for one match without a redundant range;
larger result sets keep their first–last range and plural label.

The secondary **Menu** is an Operate navigation surface, not an application
command menu or dashboard. A labelled desktop control replaces the Settings
icon; mobile replaces only the fifth Settings slot. Direct primary navigation
and the Account/status entry remain. Settings & backups stays a real dialog
action inside Menu. Its heading and accessible name are Settings & backups,
matching the document title.
Backup export and import precede visual preferences so both named actions are
visible in the initial desktop dialog viewport. Starting either action still
clears obsolete reset feedback through the existing backup callback.

Use the existing native Dialog with a quiet, ruled, two-column directory on
desktop and one scrollable column on mobile. Browse, My games, People & sharing,
Account & tools, and Workbooks provide short task-based groups. The title and
close control stay reachable while entries scroll. Preserve 44px targets,
safe-area clearance at 320px, ordinary Tab navigation, Escape and return focus.
Navigation uses real links, `aria-current="page"` and a visible Current label;
dialogs use buttons. There is no `role="menu"` or arrow-key command model.
Chalk, ink, flat lime, Barlow headings and Hanken labels remain unchanged, with
no new decorative art, shadow or animation. Menu uses a 36px desktop / 32px mobile
heading, 15px links, 14px group and feedback labels, and a 12px Current marker;
these are scoped utility roles, not a change to the site's display scale.
Pending-navigation and save-error
feedback belongs inside the dialog; the underlying editor stays mounted until
its valid edits commit. Escape cancels the transition without discarding work.

Native dialogs measure scrollbar compensation before `showModal`, then lock
the body and focus the existing heading or control once from JavaScript.
Nested locks retain the first body's styles until the final dialog closes.
Return-target visibility is resolved before close/unlock writes; native focus
and required editor scrolling do not wait for visual completion. Optional motion
measures destinations in a cancellable animation frame, while modal registration
remains immediate. Dialogs and their motion hosts retain their existing containment
and containing blocks. At every viewport size, long dialogs
keep their single 44px Close control in a sticky chalk rail with top safe-area
clearance and matching scroll padding. This includes portrait touch tablets,
desktop windows and short phone-landscape windows. Menu retains its non-scrolling
heading and close area. Public catalog enrichment renders its locally resolved
cache, offline, disabled, cooldown or loading snapshot immediately. Network work
starts in a cancellable task after a frame, not in the shell's opening effect;
closing or changing its scope cancels both queued work and existing requests.

Requested utility panels stay above game details even when the game resolves
later. Native top-layer reordering preserves the mounted panel, its draft,
scroll position and focused control rather than remounting the utility.
Closing a stacked dialog keeps focus inside the foreground dialog that remains:
its valid trigger or focused editor takes precedence over a page-level return
target, with its normal focus-in target as the fallback.
Escape dismisses only the foreground native dialog. Its keydown cancels the
browser's grouped close request before closing that layer, and a held key cannot
dismiss the next layer. Handled child-control keys retain their own behavior.
The global panel-intent cancellation handles Escape only when no native modal is open.
Committed Settings, About, Menu, Compare tray and Sign in dialogs use their
headings as tab titles, ahead of the underlying game and then the resolved route.
The tray reports its visible state back to the single App title arbiter; sign-in
uses its existing request and online bridge, including a returning sign-in sheet.
A cold sign-in dialog keeps the same title as its ready form; an online-tools
failure with no sheet restores the underlying title. Other pending/error states
retain the underlying title. Closing restores that title; URL and history
behavior are unchanged.
Personal-workspace document titles follow the resolved Library, Queue or Ranking
tab, including legacy `list=later` links and history navigation.
Starting a backup export, import or restore clears the superseded reset result
in Settings. Successful backup and reset outcomes retain their polite status
regions; a failed reset has an alert. Reset confirmation focuses **Keep my data**
and reveals the whole confirmation inside the sheet, without a motion delay.
Cancel or a finished reset returns focus to its trigger only while Settings is
still the foreground dialog. Pending reset controls stay focusable but ignore
repeat activation, and a failed reset never reports that data was removed.
Adjacent groups use one rule: Settings account context has no trailing border,
and My games rows own their leading divider, leaving the manual-add group's
existing top rule as the only separator below the final row.
Backups, Visual experience and the device-library section share a 28px leading
gap, one hairline and 25px top padding; the fieldset is not part of the backup actions.
Catalog-detail mutations keep their native action focused while saving, using
guarded `aria-disabled` and one in-flight action rather than disabling the
focused button. The saved **In My games** button remains focusable and ignores
repeat activation; ranking add becomes **Your rank** on the same button. Pending/success feedback
uses the modal's status region and failures use its alert region, without an
exterior toast while that catalog dialog is open. A fresh detail does not replay
another detail's result, and no completion handler moves the visitor's focus.
The saved-ranking shortcut still invokes the existing pending-editor guard, and
rating failures retain their field-owned alert rather than announcing twice.
Closing a catalog detail still flushes its pending rating through the captured
record and library action. The dialog's lifetime only gates its local feedback,
not that exit-save; a closed instance never updates or focuses a newer dialog.
Mutation feedback follows the public-detail controls, so a rating blur cannot
insert a new message above a pressed Enable action and move its pointer target
before the click completes. Online consent still waits for the registered save
and cancels if the route or scope changes.

Search and native selects use visible labels above 48px controls. A shared
select shell centers its noninteractive SVG chevron on the value row, with the
same width bounds as the actual select, not on the combined label/control
height. Search and result/view controls remain visible on mobile; the native
Filters & sort disclosure groups the existing private-view, genre/year/tier,
progress, sort and public-lookup controls. Genre and sort occupy full rows
inside it. Native menus, keyboard behavior and focus outlines stay intact.
Online search scope is explicit beneath the fields and is never reset by
opening the disclosure.

Discover keeps its heading and search while the catalog loads, with one polite
loading status instead of an incomplete count. Static, noninteractive placeholders
share the grid/list artwork, title, metadata and action anatomy; known collection
cards remain usable. Errors replace the loading state with the existing recovery.
Concurrent catalog consumers share one fetch and parse per loader. Aborting a
consumer cancels only its wait; even with no waiters, the shared fetch retains
its 8-second timeout and metadata byte limit. Success fills the public cache;
failure permits a fresh data request without masking parser-module failures.

Lazy-route fallbacks use destination headings with static card, ruled-list or
form anatomy from eager styles, never zero counts or guessed private content.
Discover's and My games' fallbacks also reserve the controls their pages settle
with, as inert placeholders at the settled heights (the search, filters and
results heading; the views, Progress and search rows), so results do not jump
when the page arrives. A fallback is at least one viewport tall, so the footer
stays out of the first view while it loads.
The cold sign-in placeholder remains a static native dialog with its original
close and return-focus contract; loading a route never enables an unfinished form.
Cancelling comparison sign-in can temporarily focus Account while readiness hides
the tray. Its current return intent survives until the Compare action or compact
tray opener is usable, unless navigation, identity/scope or the user's focus/input
changes. A late module must not override those later choices.

Unranked matches and saved additions use an open ruled list below the original
100, not fake numbered jackets or empty critic-score cells. Source attribution
and a restrained Unranked label distinguish public metadata from the visitor's
rating. Save, Played and rating controls stay together, reflowing into larger
touch-friendly rows on mobile. Loading/error controls belong to each source;
saved records remain usable independently.

Game details keep the creator's original score and **Your rating** visually and
semantically separate. The complete existing rationale and source note lead
the personal tracking controls; do not rewrite or truncate the curator's text.
At 1024px and wider, the canonical drawer is up to 1000px wide: the original
rating, complete rationale and source caveats, then tracking actions form one
reading column, with a 240px artwork-and-caption column beside it. The reading
measure is about 72ch; all 100 games' primary actions must fit the first view at
1440×900 and 1024×768 without scrolling past or abbreviating the rationale.
Below 1024px the reading order stays stacked, with a 192px sleeve that retains
the normal numbered-jacket geometry and native bitmap-size ceiling. Mobile
uses a 40px title and tighter section spacing, not smaller body text or clipped
source notes; unusually long caveats may still require a short scroll.
Long detail copy and previous/next navigation wrap without pushing controls
outside the native dialog. Private ratings and notes commit on editor exit as well
as their normal save triggers. Unordered library views omit disabled drag/move
chrome; actual play queues retain all existing ordering affordances.

On The 100, **Previous game** and **Next game** follow all matching canonical
results in the active filter and sort order, not just the loaded card page.
Their position reads **3 of 10**, separate from the game's permanent collection
rank. Original-genre, year, tier, search and private progress restrictions stay
in the URL during navigation. The collection's existing search shares its local
and online matches with the dialog; saved provider-copy progress uses the same
matching rules as the cards. Opening a detail starts no second online search.
A valid deep link outside those results still opens, but its
neighbors are disabled and its position says **Not in these results**.
Other routes keep their existing whole-collection navigation. Next/Previous
replace the open detail's history entry only after pending edits save; Back,
Forward, close and direct links retain their existing behavior.

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
The signed-out Compare route explains friends' rankings and the privacy of pins
before authentication choices. Its optional purpose copy does not change
ordinary Account sign-in, provider actions or the device-only exit.

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

Collection grid and list entries are native list items, with the existing title
link and independent progress/Compare controls. Played and Completed start the
action row as a pair, 16px apart in List view (4px up to 760px, as in the grid),
and the Compare controls end it. The Played label uses the same 14px semibold
text-action type as Completed, in the ratings table too, and as Add to my
ranking in the game details. Grid copy absorbs differing title and genre heights
so dividers and action rows align. A failed cover's 12px caption occupies its own
row above the canonical rank; the placeholder can grow to keep the full message
clear of the badge and overlaid controls. At narrow widths, redundant decorative
series/year print is hidden, while the real metadata, rank, successful sleeve
aspect ratio and native-size image limit are unchanged.
Failed list thumbnails use content-driven height without a preferred aspect ratio
or overlaid-control headroom; their unchanged full caption and rank set the height.

### Ratings tables and personal-library pages

The extension keeps the same visual world. Dense ratings data uses Hanken body
type, tabular numerals, explicit native score scales and unavailable-value
dashes. The author rank stays distinct from the optional personal score.
Table headings carry real sort state; horizontal scrolling is deliberate,
keyboard reachable, and limited to the table rather than the page. On mobile,
a compact sticky game cell includes its original rank while scores scroll.
It leaves room for a useful numeric column rather than pinning a wide desktop
identity block; sort buttons retain the 44px inline target floor.
Cells use 9px padding at every width, which brings the full table to about
1,296px: it fits a 1440px window when the page's scrollbar overlays the content,
and comes within a few pixels of fitting with a classic page scrollbar.
From 1024px, when the scores still need to scroll, the Your list column holds
the right edge as the rank and game columns hold the left: its progress, Play
later and Compare controls are never cut, and the scores pass beneath it.
Keyboard focus scrolls a control in a scrolling column clear of the frozen
columns beside it.
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
Local sets of zero or one page omit navigation instead of presenting disabled
controls. Library keeps a visible live count and its focusable results heading;
filtered-empty recovery, selection scope and manual drafts are not remounted.
A genuinely empty unfiltered Library leads with useful add/browse choices.
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
into the existing native detail, with the actual form stationary and with its
authored jacket colour, vector drawing and lower-left rank badge.
Only the allowlisted SVG geometry is copied; no workbook bitmap, source title,
editor or event handler enters the proxy. A uniform scale with a top/right crop
preserves the sleeve's proportions and badge corner; interrupted flights retain
their visible clipped bounds. Catalog bitmaps retain their native-size fit and
existing complementary-opacity handoff. Fine-pointer entry/return limits are
240/160ms; coarse-pointer limits are 220/160ms. Use the
original numbered geometry or an existing exact-ID licensed catalog image,
never an enlarged workbook bitmap, editor clone or private-content snapshot.
Missing or stale origins take the immediate path; an eligible no-origin catalog
artwork settle is at most 160ms fine / 140ms coarse.
The coarse adjustment makes the substantial artwork travel easier to follow;
it is not a global slowdown or a frame-rate claim. Keep the existing
`cubic-bezier(.16,1,.3,1)` easing, 300ms rejection cap and origin lifetime.
For provider artwork, the destination stays transparent until the travelling
image reaches its handoff, then fades in as that image fades out. Both effects
belong to one cancellable session; interruption, reduced motion or failed setup
restores the real illustration immediately. Text, credits, controls and focus
are never part of this opacity handoff.

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
Fine-mouse drags can scroll while armed or active without losing their token.
They still check the current source, scope, navigation, visibility and modal
state, and hit-test the current drop target; no stale coordinates authorize a drop.
Coarse layouts expose the separate 44px Pin action and hide the redundant
mouse-drag handle from layout, keyboard focus and assistive technology. On
mixed-pointer devices the visible handle remains Pin-only for touch and pen;
only fine-mouse input may start a drag from it. Keep native panning and keyboard
activation on the Pin action. This deliberate safety fallback
does not claim a root-cause fix for the retained post-grip native-click failure.
The existing capture-ownership guard remains scoped to its node and pointer;
touch and pen no longer enter that grip-capture path.

The six-game comparison tray keeps identities and actions ahead of long artwork
attribution. The tray and catalog detail use the native Artwork credits
disclosure; their full source credit and license/source links remain unchanged.
Limit feedback spans the list column with its prose capped at 42ch. Its dismissal
aligns with the row-removal column; the list's rule supplies the section boundary.
The resting chip shows the Pin action's stack symbol and exact pinned count; its
accessible name is **N games in Compare tray**, starting with its visible count,
and its tooltip is **Open Compare tray**. The table strip retains its direct
**Compare rankings with friends** action. Sheet actions may wrap without changing
their purpose or order. Root mobile focus scrolling reserves the
fixed bottom navigation and safe area, including on recovery controls.
Primary mobile navigation labels use 12px while retaining the existing
44px minimum target width, navigation height and safe-area padding.
Its five destinations share one box model (the Menu button adds no padding of
its own) in five equal columns without pins. With the pinned-count slot occupied,
columns retain each word's intrinsic width. Labels can wrap at spaces, not inside
Discover, games or Friends, including under the user's text spacing.
An active notification clears the measured navigation band instead of covering
Compare. Empty transient drag targets add no page spacer. The page-end reserve
and focus scroll padding include the real navigation height and clearance.
The reserve stays while a modal hides the chip, so underlying content never
reflows during native open/close. Ratings-table rows retain the same Pin path.
If limit feedback grows over its focused source, one immediate native scroll
reveals it without moving focus. Native focus scrolling uses the measured root
scroll padding. In wide windows at most 520px tall, grid jackets have an 80px
height cap so the full identity link can fit the short reading viewport; artwork
keeps its native contain behavior. This applies to the loaded grid, not the
first-paint loading jackets; no real game cover is resized at hydration.
Explicit Explore and same-page The 100 navigation use one
native scroll based on the current first identity and visible dock/nav/toast
bounds, ignoring the comparison control when it is inside the header. Never
correct a user's scrolling on later frames or resize artwork during scrolling.
Sign-in invoked by Compare returns to its current remounted action only while
the same view, navigation and scope still apply. Loading-to-ready handoff keeps
that logical origin; ordinary Account entry and invalidated origins cannot
reuse it.

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
