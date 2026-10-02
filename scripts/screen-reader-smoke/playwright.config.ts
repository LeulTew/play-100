import { defineConfig } from '@playwright/test';
import { validateOrigin } from './src/speech.ts';

// Screen readers own the whole desktop, so one headed browser runs one journey at a time.
export default defineConfig({
  testDir: './tests',
  outputDir: './artifacts/test-results',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 5 * 60 * 1000,
  expect: { timeout: 15_000 },
  reportSlowTests: null,
  reporter: [['list'], ['html', { open: 'never', outputFolder: './artifacts/report' }]],
  use: {
    baseURL: validateOrigin(process.env.TARGET_ORIGIN),
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'nvda', testMatch: /nvda\.spec\.ts$/ },
    { name: 'voiceover', testMatch: /voiceover\.spec\.ts$/ },
  ],
});
