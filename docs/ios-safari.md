# iPhone Safari smoke

The `iOS Safari smoke` workflow runs Apple's Mobile Safari with Appium 3.8.0
and XCUITest driver 12.13.3 inside real iOS Simulator runtimes on `macos-15`.
It does not use desktop
WebKit with an iPhone user-agent override. It needs no secrets, downloads no
app dependencies, and never deploys or changes production data. Its default
target is production; manual runs can use an HTTPS candidate origin instead.

## Coverage and evidence

Each fresh simulator cold-loads the selected origin (production by default) and
checks both hero phrases, the hidden boot-error panel and app-started state.
It uses the phone's bottom navigation to open Discover, types `portal` and
checks matching cards, opens a detail from The 100, checks its heading,
closes it and checks focus returned to the exact opening element. It opens
My games, reloads, and checks the app and heading again.

Every step produces a PNG. Each device's `results.json` includes step outcomes,
user agent, viewport, navigation timing, FCP/LCP when supported, boot attributes,
uncaught errors, and the collector's installation timing. Failed assertions
fail the job; screenshots, Safari diagnostics and partial results upload even
on failure. An additional simulator screenshot covers driver startup failures.
The uncaught-error allowlist starts empty; any future exception must be narrowly
matched, justified and linked to an issue.

The script requests `pageLoadStrategy: none` and injects `error` and
`unhandledrejection` listeners as soon as WebDriver can execute in each new
target document, including after reload. This WebDriver path has no
document-start script injection API. Errors before that installation are not
certified; `installedAtMs` and `readyStateAtInstall` make the observation gap
explicit. Buffered paint observers retrieve earlier FCP/LCP when the runtime
supports those entry types; unsupported metrics are `null`, not zero.

## First green candidate evidence

[Run 36933031367, attempt 2](https://github.com/LeulTew/play-100/actions/runs/36933031367)
is green across the inventory job and all four simulator jobs. It tested
harness commit `60231f583bedee01c5184048b46644d3714fd7e0` against
`https://mixing-copyright-conceptual-gamma.trycloudflare.com`, not production.
The three other devices passed on attempt 1; the SE on iOS 26.2 passed on its
rerun. These are candidate-build results, not evidence of a production deployment.

All 32 smoke steps passed: cold hero and boot state, Discover, Portal
search, The 100, game detail heading, close and exact-opener focus restoration,
My games, and reload. Each successful device artifact contains `results.json`,
eight WebDriver screenshots, eight native simulator screenshots, native
accessibility trees and driver diagnostics.

| Device | iOS | Steps | loadEventEnd (ms) | FCP (ms) | LCP (ms) | Artifact |
| --- | --- | --- | ---: | ---: | ---: | --- |
| iPhone SE (3rd generation) | 18.5 | 8/8 | 1703 | 2414 | Unsupported | `ios-safari-small-ios-18.5` |
| iPhone 16 Pro Max | 18.5 | 8/8 | 513 | 1792 | Unsupported | `ios-safari-large-ios-18.5` |
| iPhone SE (3rd generation) | 26.2 | 8/8 | 1983 | 3043 | 3043 | `ios-safari-small-ios-26.2` |
| iPhone 17 Pro Max | 26.2 | 8/8 | 1833 | 2908 | 2908 | `ios-safari-large-ios-26.2` |

For the SE on iOS 26.2, use the
[passing rerun artifact, ID 11197801550](https://github.com/LeulTew/play-100/actions/runs/36933031367/artifacts/11197801550).
The same run also retains a failed attempt-1 artifact with the identical name
(ID 11197162663); do not use that older artifact as the green evidence.
The inventory artifact is `ios-simulator-inventory`.

All four devices recorded a `16px` search input, visual viewport scale `1`,
successful exact-opener focus restoration, a real reload, zero observed
uncaught errors and an empty error allowlist. Cold-document collectors were
installed after 4.231-20.578 seconds; errors before installation remain
uncertified. Timings above are reported browser metrics, not driver startup or
screenshot durations, and are not physical-device performance benchmarks.

The initial SE failure was a harness/browser-UI interception: Safari's native
first-run help popover remained over Discover after a native Close command.
`02-discover-failure-simulator.png` and `native-target-2.xml` show the popover,
and `results.json` records no trusted app clicks. The initial attempt spent
314.410 seconds creating its automation session, then 32.772 seconds in the
cold-home step; the page reported loadEventEnd 1519 ms and FCP 2440 ms.
This was not a five-minute application cold load or a new product failure.
The rerun passed without changing the tested harness.

## Historical production evidence: blocked

[The 2026-10-01 production run](https://github.com/LeulTew/play-100/actions/runs/36927938078)
tested commit `a5d03ae4de76a264ccb2830463b1e335657626db` with Xcode 26.3
(17C529). All four devices passed cold home, Discover navigation and Portal
search using trusted native touches. All four then failed returning to
The 100 because its tab icon did not intersect the recorded visible viewport.
The toolbar hit-target harness issue is separated: tab-icon targeting passes
Discover on all four configurations.

| Device | iOS runtime | Reported loadEventEnd (ms) | FCP (ms) | LCP (ms) |
| --- | --- | ---: | ---: | ---: |
| iPhone SE (3rd generation) | 18.5 | 510 | 1393 | Unsupported |
| iPhone 16 Pro Max | 18.5 | 363 | 1469 | Unsupported |
| iPhone SE (3rd generation) | 26.2 | 305 | 2714 | 2714 |
| iPhone 17 Pro Max | 26.2 | 215 | 950 | 950 |

Reproduction: cold-load the target, open Discover, type `portal`, then tap
Safari's Done button. The input's measured font size is `14px`; Safari zooms
to approximately 1.143-1.144 and pans the page. After the keyboard is confirmed
closed, content remains clipped horizontally and bottom navigation is partially
cut off or hidden beneath browser chrome. The harness refuses an off-viewport
tap; it does not repair styles, synthesize navigation or pinch away the finding.
The page remains on `/discover?q=portal`.

Each `ios-safari-{small|large}-ios-{18.5|26.2}` artifact contains
`03-search-simulator.png`, `04-the-100-failure-simulator.png`,
`native-target-4.xml` and `results.json`. The JSON preserves input font size,
visual viewport, DOM and native target measurements, trusted clicks, and the
native browser actions, including keyboard dismissal.

No uncaught errors were observed after collector installation. Collectors were
installed 8.392-19.439 seconds into already-complete documents, so this does
not certify the earlier interval. Some iOS 18.5 network timing fields were
negative relative to `timeOrigin`; their raw values are retained, not converted
into inferred TTFB or network benchmarks.

**That production run did not close the waiver.** Detail opening, focus return,
My games and reload were not reached in that run. The green candidate evidence
above covers the corrected build, not the unchanged production site. No product
code was changed by the smoke runner.

## Devices and runtimes

The inventory job selects the newest stable Xcode installed on the image,
then the newest and oldest available iOS runtimes at or above 16.4. Duplicate
runtimes are tested once. For each, it selects iPhone SE (3rd generation)
where supported, otherwise an iPhone mini or a supported non-Max/Plus phone,
plus the newest supported Pro Max. Missing runtime/device coverage fails
planning rather than quietly skipping it. `ios-simulator-inventory` contains
the exact inventory and matrix; each device artifact records Xcode, driver
version, runtime, UDID and returned WebDriver capabilities.

WebDriverAgent 16.12.11 is downloaded from its official simulator release
asset with an architecture-specific SHA-256 check. iOS 17+ uses the
preinstalled-agent path, avoiding local XCTest builds. On the current image,
building this agent under Xcode 26.2/26.3 failed because its packaging expected
`lib_TestingInterop.dylib`, which those Xcodes do not ship. The upstream
[recommended prebuilt-agent workaround](https://github.com/appium/appium-xcuitest-driver/issues/2994)
avoids modifying the agent or Xcode. If an iOS 16.4-16.x runtime is present,
it uses the source-build path with the newest installed pre-26 Xcode instead,
because current preinstalled-agent startup requires iOS 17+.
`xcodes.json` and `wda.json` preserve toolchain and binary provenance.

The first runner trials used Apple's `safaridriver` with `platformName: iOS`
and `safari:useSimulator`. Navigation and screenshots worked, but element
clicks returned success without activating Discover on all four simulator
configurations. XCUITest native taps subsequently reached Discover and search,
but coordinate translation missed The 100 after Safari's input zoom, even
with explicit recalibration. A WebKit automation-session trial also stalled
on its first navigation. This workflow therefore taps the actual Safari
accessibility text/button in XCUITest's native context as a position reference.
It taps the tab icon for bottom navigation and the visible control centre for
other controls, not the text rectangle that can fall under Safari's
browser-toolbar shadow, then returns to
the web context for assertions. Zoom is accounted for explicitly. It requires
one accessibility anchor, a visible control and a trusted click;
it never substitutes JavaScript-generated clicks. Native accessibility trees
are uploaded alongside screenshots for diagnosing missing or ambiguous targets.
The search evidence records `visualViewport` scale and offsets rather than
hiding zoom. Appium's redundant Safari reset is skipped: every job already
creates a fresh simulator with no browsing history or production cache.
The harness dismisses Safari 26's known first-run browser help popover through
its native Close button and closes the search keyboard through Safari's Done
button before returning to The 100. These browser-only actions are recorded
separately; no application overlays, input styles or navigation state are
modified.

The image changes over time. The workflow therefore records its actual
runtime inventory instead of claiming a permanently fixed device matrix.
Testing the oldest installed runtime does not certify iOS 16.4 if the image
does not include it. Simulator CPU timings are evidence, not physical-phone
performance benchmarks.

## Running

The workflow runs only when dispatched: select **Actions -> iOS Safari smoke ->
Run workflow**, or use:

```text
gh workflow run ios-safari-smoke.yml --ref main
```

Use the `target_origin` dispatch input to test a publicly reachable candidate
tunnel before a release:

```text
gh workflow run ios-safari-smoke.yml --ref main -f target_origin=https://YOUR-PUBLIC-TUNNEL-HOST
```

The URL must be an HTTPS origin without credentials, a path, query or fragment.
The origin is passed through an environment variable, validated before Safari
starts, and recorded in `results.json`; invalid input fails instead of falling
back to production. Production is the default.
Set `IOS_TARGET_ORIGIN` for the same override when running the script on a Mac.
The candidate must remain reachable for the entire matrix run.

Inspect the device jobs and download the `ios-safari-*` artifacts. They are retained for
30 days. To reproduce on a Mac, select an installed Xcode with
`DEVELOPER_DIR`, create and boot a fresh simulator with `xcrun simctl`, install
the pinned Appium and XCUITest versions above, download the verified simulator
WebDriverAgent asset as in the workflow, set `WDA_APP` and `WDA_BUNDLE_ID`, start
`appium --address 127.0.0.1 --port 4444`, set `IOS_UDID`, `IOS_DEVICE_NAME` and
`IOS_VERSION`, then run `node scripts/ios-safari-smoke/smoke.mjs`.

This is simulator Safari coverage, **not physical iPhone certification**.
It does not certify Add to Home Screen, installed standalone behavior,
offline access, eviction, accounts, payments, every game, long sessions,
physical touch/keyboard behavior, thermals or GPU performance. Production
failures are recorded, not repaired by this workflow.
