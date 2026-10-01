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

The inventory job selects the newest complete stable Xcode installed on the image,
then the newest and oldest available iOS runtimes at or above 16.4. Duplicate
runtimes are tested once. For each, it selects iPhone SE (3rd generation)
where supported, otherwise an iPhone mini or a supported non-Max/Plus phone,
plus the newest supported Pro Max. Missing runtime/device coverage fails
planning rather than quietly skipping it. `ios-simulator-inventory` contains
the exact inventory and matrix; each device artifact records Xcode, driver
version, runtime, UDID and returned WebDriver capabilities. The image's
Xcode 26.3 failed WebDriverAgent builds because its simulator XCTest support
was missing `lib_TestingInterop.dylib`. Installations at or above 26.3
missing that library are excluded; `xcodes.json` records the exact reason.
This excludes an incomplete toolchain, not an iOS runtime or phone.

The first runner trials used Apple's `safaridriver` with `platformName: iOS`
and `safari:useSimulator`. Navigation and screenshots worked, but element
clicks returned success without activating Discover on all four simulator
configurations. This workflow therefore uses XCUITest's `nativeWebTap: true`,
not JavaScript-generated clicks, to exercise bottom navigation and dialogs.

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
the pinned Appium and XCUITest versions above, start
`appium --address 127.0.0.1 --port 4444`, set `IOS_UDID`, `IOS_DEVICE_NAME` and
`IOS_VERSION`, then run `node scripts/ios-safari-smoke/smoke.mjs`.

This is simulator Safari coverage, **not physical iPhone certification**.
It does not certify Add to Home Screen, installed standalone behavior,
offline access, eviction, accounts, payments, every game, long sessions,
physical touch/keyboard behavior, thermals or GPU performance. Production
failures are recorded, not repaired by this workflow.
