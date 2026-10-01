# iPhone Safari production smoke

The `iOS Safari smoke` workflow runs Apple's Mobile Safari with Appium 3.8.0
and XCUITest driver 12.13.3 inside real iOS Simulator runtimes on `macos-15`.
It does not use desktop
WebKit with an iPhone user-agent override. It needs no secrets, downloads no
app dependencies, and never deploys or changes production data.

## Coverage and evidence

Each fresh simulator cold-loads https://play-100-collection.vercel.app/ and
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
production document, including after reload. This WebDriver path has no
document-start script injection API. Errors before that installation are not
certified; `installedAtMs` and `readyStateAtInstall` make the observation gap
explicit. Buffered paint observers retrieve earlier FCP/LCP when the runtime
supports those entry types; unsupported metrics are `null`, not zero.

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
It taps the centre of the full DOM control's visible portion, not just the text
rectangle that can fall under Safari's browser-toolbar shadow, then returns to
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

While the iteration branch exists, pushes affecting the workflow or its
scripts on `leultew-r24-ios-smoke` start a run. That push trigger is restricted
to this branch and never applies to `main`. After merge, select **Actions ->
iOS Safari smoke -> Run workflow**, or use:

```text
gh workflow run ios-safari-smoke.yml --ref main
```

The scheduled run is Monday at 08:00 UTC on the default branch. Inspect the
device jobs and download the `ios-safari-*` artifacts. They are retained for
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
