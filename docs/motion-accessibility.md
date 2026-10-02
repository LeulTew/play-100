# Motion and accessibility

## Adaptive graphics and accessibility

The complete collection is independent of the sculpture. The static original
SVG is visible before WebGL is loaded and remains the fallback. The Three.js
module is a separate chunk, loaded after visibility/idle checks and once scrolling
has paused for 300 ms, so its start-up never lands mid-scroll. Auto considers
available device/connection hints; Full requests the enhancement; Lite removes
effects. The operating system's reduced-motion preference takes priority and
is observed while the page is open.
On touch/coarse-pointer devices, Auto keeps the original illustration until the
visitor presses Fan out; only then is the real WebGL module fetched. Full still
loads the scene automatically. This keeps optional shader/texture initialization
off the mobile startup path without removing the interaction.

Only one canvas is used. Pixel ratio and geometry are bounded, there is no
postprocessing, animation settles instead of looping indefinitely, offscreen
and hidden-tab work pauses, and measured frame pressure can lower quality.
All essential controls work without dragging, fine pointers or WebGL.

Native dialogs trap focus, close with Escape, restore the initiating focus and
support deep-linked entry. Buttons/touch controls are at least 44px. The UI keeps
normal page scrolling, visible focus and mobile safe areas. Asset dimensions are
reserved; covers load lazily and results are paginated in groups of 24.

Detail opening focuses its heading directly, with native autofocus prepared
before `showModal`; it does not first focus Close or the dialog container.
The accessible dialog has no click action: backdrop dismissal is a complete
pointer gesture handled at the document, separate from the named Close button
and Escape. Its description is deliberately short (the collection position,
or the catalog source summary), not the complete dialog text. The rationale,
source notes and tracking controls remain available in ordinary reading order.
DOM focus/description assertions and native screen-reader speech are separate
checks; neither substitutes for the other.
NVDA 2026.2 with Chrome 154 can announce the dialog and heading twice even on
a minimal native `showModal` page with one DOM focus move. The speech gate
compares these counts with that native control; it still requires the name,
role and heading, no automatic body read, no dialog click action, and return
focus on Escape. This is a reader/browser limitation, not an extra app focus
step or a waiver of those other checks.

Eligible collection and Discover previews connect the existing public artwork
to the native detail using one temporary numbered sleeve or licensed catalog
image. The real fields stay in place and are usable immediately. A same-view
close may return that public visual to its still-visible source; deep links,
removed sources and interrupted navigation use the immediate fallback. No
interactive editor, private note, manual title or password is cloned or retained.
Canonical details present the complete workbook rationale and source note
before saved copies, progress controls and personal rating fields.
Public-artwork enter/return timing is 240/160ms for fine pointers and 220/160ms
for coarse pointers. Only coarse artwork travel was softened after a focused
perceptual assessment; easing, utility transitions, hero motion, the 300ms
rejection cap and gesture thresholds are unchanged. This is not a latency or
frame-rate improvement claim.

Menu, ready utility dialogs and committed route/tab/page changes have short,
targeted cues rather than page-wide reveals. The existing Auto/Full/Lite policy
also governs these effects. Reduced motion, hidden documents, unsafe account
readiness and changed permissions cancel optional work without replaying it
when the condition clears. Native opening, closing, focus and saves never wait
for an animation. Drag-to-Compare remains separate from private Queue/Ranking
reordering, and an empty drop target does not reflow the collection controls.

The 44px **Pin / Pinned** control supports native touch, pen and keyboard activation.
Touch and pen do not start a held drag or explicit pointer capture; native panning
from the button remains available. That same control supports fine-mouse dragging
without adding a duplicate stack icon, keyboard stop or screen-reader control.
Card/title touch-hold dragging is a separate interaction, not enabled by the
Pin button. This is an intentional capability fallback after a retained
post-touch-grip click failure, not a claim to have diagnosed or fixed its
underlying browser cause. It does not relax the performance qualification below.

These are bounded behavior and cleanup contracts, not a promise of zero cost,
physical-device certification or universal frame-rate improvement. Development
StrictMode rehearsals, production payload checks and paired performance evidence
must be reported separately.

The React Bits-derived queue badge uses a bounded native numeric spring rather
than the Motion scheduler the upstream uses; Motion is not a dependency. Its accessible count is exact
immediately; initial, disabled and scope-reset values do not count up from zero.
Visible updates can retarget, while cancellation and unmount leave no idle frame
loop. Only the badge is scope-keyed, not the page or its editors.
The counter's native-visibility fixture is explicitly opt-in through
`PLAY100_COUNTER_HEADED=true`; a browser that remains visibly reported after
minimization does not establish hidden-window behavior.

### Qualified motion release: performance limitation

The user approved publication **after final release checks, with the performance
limitation documented**. Scoped motion functional/production checks and static
and observed-cold code-size budgets passed, but the paired interaction comparison
stopped early on a late detail-open observation. Numerical interaction
performance remains **inconclusive**; this is not a zero-added-lag, FPS,
physical-device, Safari or native-hidden-window certification.

<details>
<summary>Measured scope and retained limitation</summary>

- On the retained `94c6fe9` measurement build, complete eager JavaScript plus CSS
  grew from 163,283 to 165,322 gzip bytes:
  +2,039 bytes (+1.25%), within the unchanged 8,164.15-byte limit. All four
  declared observed-cold route/profile cells met their own limits, with three
  consistent request sets per build/cell. The only observed non-code raw-byte
  difference was four favicon line-ending bytes; no new resource path was added.
- The paired interaction run stopped after 90 of 720 planned observations.
  In pair `p044`, the candidate's 500-game Library at coarse 393px with configured
  4x CPU throttling opened the correct native detail, but sampled readiness
  arrived at 1,253.9 ms, beyond the fixed 1,200 ms window. The single paired
  baseline observation was 171.1 ms; this is not a regression confidence interval.
- One separately instrumented diagnostic did not reproduce that delay
  (approximately 202.3 ms candidate / 186.9 ms baseline). Its tracing overhead
  and invalid native CPU timing deltas prevent a stronger conclusion; it neither
  erases the original finding nor establishes a cause.
- The retained-prefix analysis applied no numerical gates or confidence
  intervals: at most one of eight required pairs was available per cell.
  All 648 metric/action records and all five overall profiles remain
  inconclusive. No failure was discarded as environmental noise, and no
  threshold was relaxed to support publication.

</details>

### Added functional-feature code allowance

The later PWA and on-demand enrichment request has a separate **10,240-byte
gzip-9 eager JavaScript/CSS increment allowance** above the current `cc2d82f`
local baseline of 165,302 bytes (limit 175,542). This was an explicit
scope-change acceptance **after** observing the new feature sizes, not the
original preregistered motion gate. The 173,978-byte intermediate feature build
still failed that older 8,192-byte gate by 484 bytes; that result is retained.
The selected simpler Settings variant measured 174,453 locally. Any deployed
build is measured separately. Moving optional update execution/detail parsing
out of the eager graph is not a claim that total code or first-use downloads
became smaller.

The offline core remains limited to 2 MiB/51 files, including the online split's
shared chunks, with an independent 4 MiB/48-entry runtime artwork cache.
Historical cold, timing, noise-envelope
and incomplete paired results remain unchanged; no new FPS or zero-lag
certification follows from the feature allowance.
