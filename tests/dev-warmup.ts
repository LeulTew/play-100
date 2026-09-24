import { chromium, expect } from '@playwright/test';
import type { BrowserServer, FullConfig } from '@playwright/test';

export default async function warmDevelopmentApp(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (
    process.env.PLAY100_TEST_BUILD !== 'development' ||
    typeof baseURL !== 'string' ||
    !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)
  ) {
    throw new Error('Development warm-up requires the owned local development server.');
  }
  const origin = new URL(baseURL).origin;
  const budget = 120_000;
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const blocked: string[] = [];
  let resourceCount = 0;
  let resourceDurationSumMs = 0;
  let resourceWallSpanMs: number | null = null;
  let navigation: { domContentLoadedEventEnd: number; loadEventEnd: number } | null = null;
  let resources: { path: string; durationMs: number; serverWaitMs: number; type: string }[] = [];
  let browserServer: BrowserServer | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let failure: unknown;
  const remaining = () => Math.max(1, budget - (performance.now() - started));
  console.info(JSON.stringify({ kind: 'DEV_WARMUP_START', startedAt, origin, budgetMs: budget }));
  const work = async () => {
    try {
      browserServer = await chromium.launchServer({
        headless: true,
        host: '127.0.0.1',
        timeout: remaining(),
        args: ['--enable-unsafe-swiftshader'],
      });
      const browser = await chromium.connect(browserServer.wsEndpoint());
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        serviceWorkers: 'block',
      });
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
        blocked.push(`${url.origin}${url.pathname}`);
        return route.abort('blockedbyclient');
      });
      await context.addInitScript(() => performance.setResourceTimingBufferSize(2000));
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}/?catalogs=off`, { waitUntil: 'load', timeout: remaining() });
      await expect(page.locator('.game-card')).toHaveCount(24, { timeout: remaining() });
      await expect(page.locator('#collection-title')).toBeVisible({ timeout: remaining() });
      await expect(page.locator('.game-card .save-game').first()).toBeEnabled({ timeout: remaining() });
      const timing = await page.evaluate(() => {
        const entries = performance
          .getEntriesByType('resource')
          .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming);
        const document = performance.getEntriesByType('navigation')[0];
        if (!entries.length || !(document instanceof PerformanceNavigationTiming)) {
          throw new Error('The warm-up did not expose its native resource and navigation timing.');
        }
        return {
          count: entries.length,
          durationSumMs: entries.reduce((sum, entry) => sum + entry.duration, 0),
          wallSpanMs:
            Math.max(...entries.map((entry) => entry.responseEnd)) -
            Math.min(...entries.map((entry) => entry.startTime)),
          navigation: {
            domContentLoadedEventEnd: document.domContentLoadedEventEnd,
            loadEventEnd: document.loadEventEnd,
          },
          slowest: entries
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 10)
            .map((entry) => ({
              path: new URL(entry.name).pathname,
              durationMs: entry.duration,
              serverWaitMs: entry.responseStart - entry.requestStart,
              type: entry.initiatorType,
            })),
        };
      });
      resourceCount = timing.count;
      resourceDurationSumMs = timing.durationSumMs;
      resourceWallSpanMs = timing.wallSpanMs;
      navigation = timing.navigation;
      resources = timing.slowest;
      if (errors.length || blocked.length) {
        throw new Error(
          `Development warm-up failed: ${errors.join('; ')}${blocked.length ? ` blocked unexpected requests: ${blocked.join(', ')}` : ''}`,
        );
      }
    } finally {
      await browserServer?.close();
    }
  };
  try {
    await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Development warm-up exceeded its 120-second budget.')), budget);
      }),
    ]);
  } catch (error) {
    failure = error instanceof Error ? error : new Error('Development warm-up failed.', { cause: error });
    if (browserServer) {
      try {
        await browserServer.kill();
      } catch (cleanupError) {
        failure = new AggregateError([error, cleanupError], 'Development warm-up and owned browser cleanup failed.');
      }
    }
  } finally {
    clearTimeout(timeout);
  }
  const elapsedMs = performance.now() - started;
  if (!failure && (errors.length || blocked.length))
    failure = new Error('Development warm-up reported a late page error or unexpected request.');
  if (!failure && elapsedMs > budget) failure = new Error('Development warm-up exceeded its 120-second budget.');
  console.info(
    JSON.stringify({
      kind: 'DEV_WARMUP_END',
      startedAt,
      finishedAt: new Date().toISOString(),
      elapsedMs,
      status: failure ? 'failed' : 'passed',
      pageErrors: errors,
      blockedRequests: blocked,
      resourceCount,
      resourceDurationSumMs,
      resourceWallSpanMs,
      navigation,
      resourceDurationMeaning:
        'Overlapping sum; wall span is min resource startTime to max responseEnd. Navigation times are relative to this document.',
      slowestResources: resources,
    }),
  );
  if (failure) throw failure;
}
