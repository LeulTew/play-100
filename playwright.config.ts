import { defineConfig, devices } from '@playwright/test';
import { localGateOptions } from './scripts/playwright-env';

const deployedUrl = process.env.PLAY100_BASE_URL;
const developmentFixtures = process.env.PLAY100_TEST_BUILD === 'development';
const gate = localGateOptions(process.env);
// These fixtures import the app's live /src modules; a built preview cannot serve them.
const sourceFixtureSpecs = [
  '**/library-pagination.spec.ts',
  '**/menu.spec.ts',
  '**/menu-account.spec.ts',
  '**/played-ranking.spec.ts',
  '**/private-compare-binding.spec.ts',
  '**/progress-semantics.spec.ts',
  '**/public-browsing.spec.ts',
  '**/publication-draft.spec.ts',
  '**/ranking-picker-identity.spec.ts',
  '**/ranking-removal.spec.ts',
  '**/route-list-motion.spec.ts',
];
export default defineConfig({
  testDir: './tests',
  testMatch: developmentFixtures ? sourceFixtureSpecs : '**/*.spec.ts',
  testIgnore: developmentFixtures ? [] : sourceFixtureSpecs,
  fullyParallel: true,
  forbidOnly: gate.forbidOnly,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  globalSetup: developmentFixtures ? './tests/dev-warmup.ts' : undefined,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
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
    command: developmentFixtures
      ? 'npm run dev -- --port 4187 --strictPort'
      : 'npm run preview -- --port 4187 --strictPort',
    url: developmentFixtures ? 'http://127.0.0.1:4187/src/main.tsx' : 'http://127.0.0.1:4187',
    reuseExistingServer: gate.reuseExistingServer,
    timeout: 120000,
  },
});
