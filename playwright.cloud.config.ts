import { defineConfig, devices } from '@playwright/test';
import { localGateOptions } from './scripts/playwright-env';

export default defineConfig({
  testDir: './tests-cloud-ui',
  globalSetup: './tests-cloud-ui/global-setup.ts',
  fullyParallel: false,
  forbidOnly: localGateOptions(process.env).forbidOnly,
  workers: 1,
  retries: 0,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4187',
    launchOptions: { args: ['--enable-unsafe-swiftshader'], ignoreDefaultArgs: ['--disable-popup-blocking'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 393, height: 851 } } },
  ],
});
