import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type CDPSession, type Page } from '@playwright/test';
import { openOfflineSettings } from './release-sw-browser';

const production = 'https://play-100-collection.vercel.app/';
const windowsScript = fileURLToPath(new URL('./release-pwa-os-windows.ps1', import.meta.url));
export function parseOsArguments(args: string[]) {
  assert.deepEqual(args.slice(0, 1), ['--url'], 'Use release:pwa-os -- --url https://play-100-collection.vercel.app');
  assert.equal(args.length, 2, 'Only --url is supported; profiles are always temporary.');
  const url = new URL(args[1]!);
  assert.equal(url.href, production, 'Only the approved production root is supported.');
  return url.href;
}
export function chromeAppId(manifestId: string) {
  return createHash('sha256')
    .update(manifestId)
    .digest('hex')
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + parseInt(digit, 16)));
}
export function assertOsHost(value: { lockPresent: boolean; lockOwned?: boolean; freeBytes: number }, minimumGiB = 6) {
  assert.ok(
    minimumGiB === 4 || minimumGiB === 6,
    'Only the default or explicitly approved four-GiB burst is supported.',
  );
  assert.ok(!value.lockPresent || value.lockOwned === true, 'Host is reserved by Mizan.');
  assert.ok(
    Number.isFinite(value.freeBytes) && value.freeBytes >= minimumGiB * 1024 ** 3,
    `At least ${minimumGiB} GiB free RAM is required.`,
  );
}
export function assertAppWindow(
  value: { url: string; title: string; standalone: boolean; errorPage: boolean },
  url: string,
) {
  assert.equal(value.url, url, 'Incorrect app start URL.');
  assert.equal(value.title, 'The 100 | Play 100', 'Incorrect app title.');
  assert.equal(value.standalone, true, 'Not an installed standalone app window.');
  assert.equal(value.errorPage, false, 'Browser error page instead of app.');
}
type Shortcut = { path: string; arguments: string; target: string; startMenu: boolean };
function windows(action: 'guard' | 'shortcuts', appId = ''): unknown {
  return JSON.parse(
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-File', windowsScript, '-Action', action, ...(appId ? ['-AppId', appId] : [])],
      { encoding: 'utf8', timeout: 30000 },
    ),
  );
}
function guard() {
  const value = windows('guard') as { lockPresent: boolean; freeBytes: number; platform: string };
  const minimumGiB = Number(process.env.PLAY100_OS_MIN_FREE_GIB ?? 6);
  assertOsHost(value, minimumGiB);
  return { ...value, minimumGiB };
}
function shortcuts(appId: string) {
  const value = windows('shortcuts', appId);
  assert.ok(Array.isArray(value), 'Invalid shortcut inventory.');
  return value as Shortcut[];
}
async function waitFor<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeout = 30000) {
  const end = Date.now() + timeout;
  do {
    const value = await read();
    if (accept(value)) return value;
    await delay(250);
  } while (Date.now() < end);
  throw new Error('Timed out waiting for PWA lifecycle evidence.');
}
async function appPage(browser: Browser, session: CDPSession, manifestId: string) {
  const { targetId } = await session.send('PWA.launch', { manifestId });
  return waitFor(
    async () => {
      for (const context of browser.contexts()) {
        for (const page of context.pages()) {
          const cdp = await context.newCDPSession(page);
          try {
            if ((await cdp.send('Target.getTargetInfo')).targetInfo.targetId === targetId) return page;
          } finally {
            await cdp.detach();
          }
        }
      }
      return undefined;
    },
    (page) => !!page,
  ).then((page) => {
    assert.ok(page, 'Launched app target was not attached.');
    return page;
  });
}
async function windowState(page: Page) {
  await page.locator('#root > .site-header').waitFor({ timeout: 60000 });
  return page.evaluate(() => ({
    url: location.href,
    title: document.title,
    standalone: matchMedia('(display-mode: standalone)').matches,
    errorPage: location.protocol === 'chrome-error:' || !!document.querySelector('#main-frame-error'),
  }));
}

export async function releasePwaOs(url: string) {
  assert.equal(process.platform, 'win32', 'This is a real Windows OS integration check.');
  assert.equal(url, production);
  assert.equal(
    execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim(),
    '',
    'Commit tracked companion changes before capturing production evidence.',
  );
  const host = guard();
  const manifestResponse = await fetch(new URL('manifest.webmanifest', url), { signal: AbortSignal.timeout(30000) });
  assert.equal(manifestResponse.status, 200);
  const manifestText = await manifestResponse.text();
  const manifest = JSON.parse(manifestText) as { id: string; start_url: string; name: string };
  const manifestId = new URL(manifest.id, url).href;
  assert.equal(manifestId, production);
  assert.equal(new URL(manifest.start_url, url).href, url);
  assert.equal(manifest.name, 'Play 100');
  const appId = chromeAppId(manifestId);
  assert.equal(shortcuts(appId).length, 0, 'Existing app shortcut: refusing to affect a real installation.');
  const profile = await mkdtemp(path.join(tmpdir(), 'play100-os-profile-'));
  const evidence = await mkdtemp(path.join(tmpdir(), 'play100-os-evidence-'));
  const checks: Record<string, boolean> = {};
  const receipt: Record<string, unknown> = {
    kind: 'WINDOWS_PWA_OS',
    startedAt: new Date().toISOString(),
    url,
    manifestId,
    appId,
    manifestSha256: createHash('sha256').update(manifestText).digest('hex'),
    host,
    source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    checks,
    notes:
      'Temporary Chrome profile; no account sign-in. Offline relaunch is a new OS app window with CDP network emulation, not a machine-wide disconnect.',
  };
  let browser: Browser | undefined;
  let session: CDPSession | undefined;
  let installAttempted = false;
  let cleaned = false;
  let failure: unknown;
  const executable = path.join(
    process.env.ProgramFiles ?? 'C:\\Program Files',
    'Google',
    'Chrome',
    'Application',
    'chrome.exe',
  );
  // Keep enough time for uninstall and OS cleanup inside the fifteen-minute burst.
  let expired = false;
  const deadline = setTimeout(
    () => {
      expired = true;
      for (const context of browser?.contexts() ?? [])
        for (const page of context.pages())
          void page.close().catch((error: unknown) => {
            receipt.deadlineError = String(error);
          });
    },
    12 * 60 * 1000,
  );
  try {
    // Chrome exposes OS-mutating PWA commands only to its locally owned pipe client.
    const ownedContext = await chromium.launchPersistentContext(profile, {
      executablePath: executable,
      headless: false,
      args: ['--enable-unsafe-swiftshader'],
      timeout: 30000,
    });
    browser = ownedContext.browser()!;
    session = await browser.newBrowserCDPSession();
    receipt.chrome = await session.send('Browser.getVersion');
    guard();
    installAttempted = true;
    await session.send('PWA.install', { manifestId, installUrlOrBundleUrl: url });
    receipt.installedState = await session.send('PWA.getOsAppState', { manifestId });
    const installed = await waitFor(
      async () => shortcuts(appId),
      (rows) => rows.some((row) => row.startMenu),
    );
    assert.ok(
      installed.every((row) => row.arguments.includes(profile)),
      'Shortcut does not belong to the temporary profile.',
    );
    receipt.shortcuts = installed.map((row) => ({
      name: path.basename(row.path),
      startMenu: row.startMenu,
      ownedProfile: true,
    }));
    checks.osInstalled = true;
    let page = await appPage(browser, session, manifestId);
    const launched = await windowState(page);
    assertAppWindow(launched, url);
    receipt.launched = launched;
    checks.standaloneLaunch = true;
    const settings = await openOfflineSettings(page);
    await settings.getByRole('button', { name: 'Enable offline access', exact: true }).click();
    await settings.getByRole('button', { name: 'Offline files ready', exact: true }).waitFor({ timeout: 180000 });
    await page.waitForFunction(
      async () => (await navigator.serviceWorker.getRegistration('/'))?.active?.state === 'activated',
    );
    checks.offlinePrepared = true;
    await page.close();
    guard();
    const context = browser.contexts()[0]!;
    await context.setOffline(true);
    page = await appPage(browser, session, manifestId);
    const offline = await windowState(page);
    assertAppWindow(offline, url);
    const offlineState = await page.evaluate(async () => ({
      online: navigator.onLine,
      controlled: !!navigator.serviceWorker.controller,
      worker: navigator.serviceWorker.controller?.scriptURL,
      networkRefused: await fetch('/api/catalog?q=os-probe', { cache: 'no-store' }).then(
        () => false,
        () => true,
      ),
    }));
    assert.equal(offlineState.online, false);
    assert.equal(offlineState.controlled, true);
    assert.equal(offlineState.networkRefused, true);
    receipt.offline = { ...offline, ...offlineState };
    checks.offlineRelaunch = true;
    await context.setOffline(false);
  } catch (error) {
    failure = error;
  } finally {
    clearTimeout(deadline);
    try {
      if (installAttempted) {
        assert.ok(session, 'No CDP session available for uninstall.');
        await session.send('PWA.uninstall', { manifestId });
        await waitFor(
          async () => shortcuts(appId),
          (rows) => rows.length === 0,
        );
        let removedState = false;
        try {
          await session.send('PWA.getOsAppState', { manifestId });
        } catch (error) {
          receipt.uninstalledStateRefusal = String(error);
          removedState = String(error).includes(`Unknown web-app manifest id ${manifestId}`);
        }
        assert.equal(removedState, true, 'The uninstalled application remains registered or state is unknown.');
        let removed = false;
        try {
          await session.send('PWA.launch', { manifestId });
        } catch (error) {
          receipt.uninstalledLaunchRefusal = String(error).slice(0, 500);
          removed = String(error).includes(`Failed to launch ${manifestId}`);
        }
        assert.equal(removed, true, 'Uninstalled app still launches or removal could not be confirmed.');
        checks.osUninstalled = true;
        checks.noStartMenuEntry = true;
      }
      cleaned = true;
    } catch (error) {
      receipt.cleanupError = String(error);
      failure ??= error;
    }
    try {
      await browser?.close();
      if (cleaned) await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
      receipt.profileRemoved = cleaned;
    } catch (error) {
      receipt.profileCleanupError = String(error).replaceAll(profile, '[temporary-profile]');
      failure ??= error;
    }
    if (expired) failure ??= new Error('The twelve-minute work deadline elapsed.');
    receipt.finishedAt = new Date().toISOString();
    receipt.status = failure ? 'HOLD' : 'PASSED';
    if (failure) receipt.error = String(failure).replaceAll(profile, '[temporary-profile]');
    const output = path.join(evidence, 'receipt.json');
    const redacted = JSON.stringify(receipt, null, 2)
      .replaceAll(JSON.stringify(profile).slice(1, -1), '[temporary-profile]')
      .replaceAll(JSON.stringify(homedir()).slice(1, -1), '[user-home]');
    await writeFile(output, redacted);
    console.log(
      JSON.stringify({
        output,
        status: receipt.status,
        sha256: createHash('sha256')
          .update(await readFile(output))
          .digest('hex'),
      }),
    );
  }
  if (failure) throw failure;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  releasePwaOs(parseOsArguments(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
