import { chromium, type Page } from '@playwright/test';

declare global {
  interface Window {
    __releaseSwCsp: { directive: string; blocked: string }[];
  }
}

export const launchOptions = {
  headless: true,
  viewport: { width: 1440, height: 1000 },
  serviceWorkers: 'allow' as const,
  args: ['--enable-unsafe-swiftshader', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
};

export async function launchProfile(dir: string, offline = false) {
  const context = await chromium.launchPersistentContext(dir, { ...launchOptions, offline });
  await context.addInitScript(() => {
    Object.defineProperty(window, '__releaseSwCsp', { value: [] });
    document.addEventListener(
      'securitypolicyviolation',
      (event) => {
        window.__releaseSwCsp.push({ directive: event.effectiveDirective, blocked: event.blockedURI.slice(0, 160) });
      },
      true,
    );
  });
  return context;
}

export function track(page: Page) {
  const events = {
    loads: 0,
    cspConsole: [] as string[],
    pageErrors: [] as string[],
    navigations: [] as { status: number; fromServiceWorker: boolean; csp: string | null }[],
  };
  page.on('load', () => events.loads++);
  page.on('console', (message) => {
    if (
      /Content[- ]Security[- ]Policy|Refused to (load|execute|apply|connect|frame|create|evaluate)/i.test(
        message.text(),
      )
    )
      events.cspConsole.push(message.text().slice(0, 300));
  });
  page.on('pageerror', (error) => events.pageErrors.push(error.message.slice(0, 300)));
  page.on('response', (response) => {
    const request = response.request();
    if (!request.isNavigationRequest() || request.serviceWorker() || request.frame() !== page.mainFrame()) return;
    events.navigations.push({
      status: response.status(),
      fromServiceWorker: response.fromServiceWorker(),
      csp: response.headers()['content-security-policy'] ?? null,
    });
  });
  return events;
}

export async function workers(page: Page) {
  return page.evaluate(async () => {
    type Status = { version?: string; clientVersion?: string; ready?: boolean };
    const ask = (
      worker: ServiceWorker | null | undefined,
    ): Promise<null | { scriptURL: string; state: string; reply: Status | null; timedOut: boolean }> => {
      if (!worker) return Promise.resolve(null);
      return new Promise((resolve, reject) => {
        const ports = new MessageChannel();
        const finish = (reply: Status | null, timedOut: boolean) => {
          clearTimeout(timer);
          ports.port1.close();
          resolve({ scriptURL: worker.scriptURL, state: worker.state, reply, timedOut });
        };
        const timer = setTimeout(() => finish(null, true), 5000);
        ports.port1.onmessage = (event: MessageEvent<Status>) => finish(event.data, false);
        try {
          worker.postMessage({ channel: 'play100-pwa-v1', type: 'STATUS' }, [ports.port2]);
        } catch (error) {
          clearTimeout(timer);
          ports.port1.close();
          reject(error);
        }
      });
    };
    const registration = await navigator.serviceWorker.getRegistration('/');
    return {
      registrations: (await navigator.serviceWorker.getRegistrations()).length,
      controller: await ask(navigator.serviceWorker.controller),
      active: await ask(registration?.active),
      waiting: await ask(registration?.waiting),
      caches: (await caches.keys()).filter((name) => name.startsWith('play100-pwa-v1-')),
    };
  });
}

export async function documentInfo(page: Page) {
  return page.evaluate(() => ({
    entry: document.querySelector('script[type="module"][src]')?.getAttribute('src') ?? null,
    onLine: navigator.onLine,
    controlled: !!navigator.serviceWorker.controller,
    violations: window.__releaseSwCsp.length,
    violationSample: window.__releaseSwCsp.slice(0, 5),
    bootErrorShown: !!document.getElementById('p100-boot-error') && !document.getElementById('p100-boot-error')!.hidden,
  }));
}

export async function cacheInventory(page: Page) {
  return page.evaluate(async () =>
    Promise.all(
      (await caches.keys()).map(async (name) => ({
        name,
        entries: (await (await caches.open(name)).keys()).length,
      })),
    ),
  );
}

export async function openOfflineSettings(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Menu', exact: true })
    .getByRole('button', { name: 'Install & offline access', exact: true })
    .click();
  const settings = page.locator('dialog[aria-labelledby="settings-title"]');
  await settings.locator('.pwa-settings[open]').waitFor({ state: 'visible', timeout: 30000 });
  return settings;
}

export async function waitShell(page: Page, myGames = false) {
  await (
    myGames ? page.getByRole('heading', { name: 'My games', exact: true }) : page.locator('#root > .site-header')
  ).waitFor({ state: 'visible', timeout: 60000 });
}

export const swProtocolChecks = [
  'servedA',
  'freshA',
  'firstInstallUncontrolled',
  'readyA',
  'controlledA',
  'cachedA',
  'cleanA',
  'offlineARoot',
  'offlineAMyGames',
  'servedB',
  'sameOriginSwap',
  'navigationStillA',
  'activeAWaitingB',
  'updateNotice',
  'oneGuardedReload',
  'controllerB',
  'documentB',
  'cacheRetention',
  'oldImagesDeleted',
  'cleanUpdate',
  'updatedPolicyB',
  'noIntent',
  'noIntentRelaunch',
  'offlineBRoot',
  'offlineBMyGames',
  'serverStopped',
  'inputsUnchanged',
] as const;

export function failedSwChecks(checks: Readonly<Record<string, boolean>>) {
  return swProtocolChecks.filter((name) => checks[name] !== true);
}
