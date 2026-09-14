import { defineConfig, devices } from '@playwright/test';

const deployedUrl = process.env.PLAY100_BASE_URL;
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 3,
  retries: 0,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list']],
  use: {
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    baseURL: deployedUrl ?? 'http://127.0.0.1:4187',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 393, height: 851 } } },
  ],
  webServer: deployedUrl ? undefined : {
    command: 'npm run preview -- --port 4187 --strictPort',
    url: 'http://127.0.0.1:4187',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
