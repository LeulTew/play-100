import { defineConfig, devices } from '@playwright/test';
import type { Project } from '@playwright/test';
import base, { floorOfflineSpec, floorSmokeSpec } from './playwright.config';
import { sourceMetadata } from './scripts/playwright-env';

// READINESS-08: the browser-floor smoke (tests/floor-smoke.spec.ts) on engines other than current Chromium, which is
// all the default gate runs. Firefox and WebKit come from `npx playwright install firefox webkit`; the old Chromium is
// any build named by PLAY100_FLOOR_CHROMIUM, ideally one at the floor in README.md (Chrome 94 or close to it).
// docs/release-operations.md, section 3, says how to run it.
const floorChromium = process.env.PLAY100_FLOOR_CHROMIUM;
const viewport = { width: 1440, height: 1000 };

// The base config's launch arguments are Chromium flags that Firefox and WebKit refuse.
// The release gate takes no skipped or expected-to-fail tests, so the one case Playwright's WebKit can't run is left out
// of its project: on an offline reload after preparation, WebKit 26.6 throws "WebKit encountered an internal error"
// (run 36984599664), though it prepares and activates the worker like the other engines (docs/pwa.md).
const projects: Project[] = [
  { name: 'floor-firefox', use: { ...devices['Desktop Firefox'], viewport, launchOptions: {} } },
  {
    name: 'floor-webkit',
    grepInvert: /@offline-reload/,
    use: { ...devices['Desktop Safari'], viewport, launchOptions: {} },
  },
];
if (floorChromium)
  projects.push({
    name: 'floor-chromium',
    use: { ...devices['Desktop Chrome'], viewport, launchOptions: { executablePath: floorChromium } },
  });

export default defineConfig({
  ...base,
  metadata: sourceMetadata(process.env),
  testMatch: [floorSmokeSpec, floorOfflineSpec],
  testIgnore: [],
  globalSetup: undefined,
  projects,
});
