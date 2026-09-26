import { defineConfig, devices } from '@playwright/test';
import { localGateOptions } from './scripts/playwright-env';

// Allocates the six-person comparison fixture for tests-cloud-ui/compare-orientation.spec.ts in the running cloud-UI
// emulators through the cloud-test app on 4187 (docs/release-operations.md §3). It writes only the manifest that
// PLAY100_COMPARE_FIXTURE names; the same global setup verifies the server and seeds the emulator metadata first.
export default defineConfig({
  testDir: './tests-cloud-ui',
  testMatch: /compare-fixture\.setup\.ts$/,
  globalSetup: './tests-cloud-ui/global-setup.ts',
  outputDir: './test-results/compare-fixture',
  fullyParallel: false,
  forbidOnly: localGateOptions(process.env).forbidOnly,
  workers: 1,
  retries: 0,
  timeout: 20 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4187',
    launchOptions: { args: ['--enable-unsafe-swiftshader'], ignoreDefaultArgs: ['--disable-popup-blocking'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'compare-fixture', use: { ...devices['Desktop Chrome'] } }],
});
