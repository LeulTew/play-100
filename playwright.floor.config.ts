import { defineConfig, devices } from '@playwright/test';
import type { Project } from '@playwright/test';
import base, { floorSmokeSpec } from './playwright.config';

// READINESS-08: the browser-floor smoke (tests/floor-smoke.spec.ts) on engines other than current Chromium, which is
// all the default gate runs. Firefox and WebKit come from `npx playwright install firefox webkit`; the old Chromium is
// any build named by PLAY100_FLOOR_CHROMIUM, ideally one at the floor in README.md (Chrome 94 or close to it).
// docs/release-operations.md, section 3, says how to run it.
const floorChromium = process.env.PLAY100_FLOOR_CHROMIUM;
const viewport = { width: 1440, height: 1000 };

// The base config's launch arguments are Chromium flags that Firefox and WebKit refuse.
const projects: Project[] = [
  { name: 'floor-firefox', use: { ...devices['Desktop Firefox'], viewport, launchOptions: {} } },
  { name: 'floor-webkit', use: { ...devices['Desktop Safari'], viewport, launchOptions: {} } },
];
if (floorChromium)
  projects.push({
    name: 'floor-chromium',
    use: { ...devices['Desktop Chrome'], viewport, launchOptions: { executablePath: floorChromium } },
  });

export default defineConfig({
  ...base,
  testMatch: floorSmokeSpec,
  testIgnore: [],
  globalSetup: undefined,
  projects,
});
