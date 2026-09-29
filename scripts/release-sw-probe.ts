import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Page } from '@playwright/test';
import { GATE_NODE, refuseBusyPorts } from './release-gate';
import { parseSwArguments, parseSwInput, verifySwBuild, type SwBuild } from './release-sw-inputs';
import { startSwServer } from './release-sw-server';
import { RELEASE6_COMMIT, runMixedVersionPhases } from './release-sw-mixed';
import {
  cacheInventory,
  documentInfo,
  failedSwChecks,
  launchOptions,
  launchProfile,
  openOfflineSettings,
  swProtocolChecks,
  track,
  waitShell,
  workers,
} from './release-sw-browser';

const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

export async function releaseSwProbe(inputFile: string) {
  assert.equal(process.version, GATE_NODE, `Use the gate runtime ${GATE_NODE}.`);
  const inputBytes = await readFile(inputFile);
  const options = parseSwInput(JSON.parse(inputBytes.toString()), path.dirname(inputFile));
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const git = (...args: string[]) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
  assert.equal(
    git('status', '--porcelain', '--untracked-files=no'),
    '',
    'Commit tracked runner changes before the campaign.',
  );
  const sourceFiles = [
    'release-sw-probe.ts',
    'release-sw-inputs.ts',
    'release-sw-server.ts',
    'release-sw-browser.ts',
    'release-sw-mixed.ts',
  ];
  git('ls-files', '--error-unmatch', '--', ...sourceFiles.map((file) => `scripts/${file}`));
  const sourceIdentity = async () =>
    Object.fromEntries(
      await Promise.all(
        sourceFiles.map(async (file) => [file, hash(await readFile(path.join(repository, 'scripts', file)))]),
      ),
    );
  const runner = {
    commit: git('rev-parse', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
    files: await sourceIdentity(),
  };
  const A = await verifySwBuild(options.baseline, false, repository);
  const B = await verifySwBuild(options.candidate, true, repository);
  assert.equal(A.commit, RELEASE6_COMMIT, 'The mixed-version campaign requires the exact Release 6 baseline.');
  assert.notEqual(A.pwaVersion, B.pwaVersion, 'Different worker versions are required.');
  assert.notEqual(A.entry, B.entry, 'Different module entries are required for document identity.');
  await refuseBusyPorts([options.port]);
  // mkdir is exclusive: a run never overwrites evidence or reuses a browser profile.
  await mkdir(options.evidence);
  const profile = path.join(options.evidence, 'updated-profile');
  const fresh = path.join(options.evidence, 'no-intent-profile');
  const origin = `http://127.0.0.1:${options.port}`;
  const receipt = {
    kind: 'LOCAL_SW_TWO_VERSION_PROBE',
    runner,
    inputSha256: hash(inputBytes),
    runtime: process.version,
    origin,
    launchOptions,
    versionA: A,
    versionB: B,
    startedAt: new Date().toISOString(),
    checks: {} as Record<string, boolean>,
    phases: {} as Record<string, unknown>,
    errors: [] as string[],
    requiredChecks: swProtocolChecks,
  };
  let context: BrowserContext | undefined;
  let failure: string | undefined;
  let server: Awaited<ReturnType<typeof startSwServer>> | undefined;
  const servers: Awaited<ReturnType<typeof startSwServer>>[] = [];
  const check = (name: string, value: boolean) => {
    receipt.checks[name] = value;
    assert.ok(value, `SW protocol check failed: ${name}`);
  };
  const clean = (events: ReturnType<typeof track>, documents: Awaited<ReturnType<typeof documentInfo>>[]) =>
    !events.cspConsole.length &&
    !events.pageErrors.length &&
    documents.every((document) => document.violations === 0 && !document.bootErrorShown);
  const controlled = (state: Awaited<ReturnType<typeof workers>>, build: SwBuild) =>
    state.controller?.reply?.version === build.pwaVersion &&
    state.controller.reply.clientVersion === build.pwaVersion &&
    state.controller.scriptURL === `${origin}/sw.js`;
  const cacheContract = (names: string[]) => {
    const newCore = `play100-pwa-v1-core-${B.pwaVersion}`,
      oldCore = `play100-pwa-v1-core-${A.pwaVersion}`;
    return (
      names.includes(newCore) &&
      names.includes(oldCore) &&
      names.every((name) => [newCore, oldCore, `play100-pwa-v1-images-${B.pwaVersion}`].includes(name))
    );
  };
  const stopServer = async () => {
    await server?.stop();
    server = undefined;
    await refuseBusyPorts([options.port]);
  };
  const serve = async (build: SwBuild, name: string) => {
    server = await startSwServer(build, options.port);
    servers.push(server);
    const rows = [];
    for (const [file, expected] of [
      ['/', build.indexSha256],
      ['/sw.js', build.swSha256],
      ['/pwa-assets.json', build.assetsSha256],
    ]) {
      const response = await fetch(`${origin}${file}`, { signal: AbortSignal.timeout(30000) });
      const bytes = Buffer.from(await response.arrayBuffer());
      rows.push({
        path: file,
        status: response.status,
        sha256: hash(bytes),
        csp: response.headers.get('content-security-policy'),
      });
      assert.equal(response.status, 200);
      assert.equal(hash(bytes), expected);
      if (file === '/') {
        assert.equal(response.headers.get('content-security-policy'), build.csp);
        assert.equal(response.headers.get('permissions-policy'), build.permissionsPolicy);
      }
    }
    receipt.phases[`served${name}`] = rows;
    check(`served${name}`, true);
  };
  const snapshot = async (page: Page) => ({
    document: await documentInfo(page),
    workers: await workers(page),
    caches: await cacheInventory(page),
  });
  const coldOffline = async (build: SwBuild, name: 'A' | 'B') => {
    await refuseBusyPorts([options.port]);
    context = await launchProfile(profile, true);
    const page = context.pages()[0] ?? (await context.newPage()),
      events = track(page);
    const rows = [];
    for (const [pathname, label] of [
      ['/', 'Root'],
      ['/my-games', 'MyGames'],
    ]) {
      const response = await page.goto(`${origin}${pathname}`, { waitUntil: 'load', timeout: 60000 });
      await waitShell(page, label === 'MyGames');
      await page.waitForTimeout(3000);
      const state = await snapshot(page);
      const networkFailed = await page.evaluate(async () => {
        try {
          await fetch('/api/catalog?q=zelda', { cache: 'no-store' });
          return false;
        } catch {
          return true;
        }
      });
      rows.push({
        pathname,
        status: response?.status(),
        fromServiceWorker: response?.fromServiceWorker(),
        networkFailed,
        ...state,
      });
      receipt.phases[`offline${name}`] = { rows, events };
      check(
        `offline${name}${label}`,
        response?.status() === 200 &&
          response.fromServiceWorker() &&
          response.headers()['content-security-policy'] === build.csp &&
          !state.document.onLine &&
          state.document.entry === build.entry &&
          controlled(state.workers, build) &&
          networkFailed &&
          clean(events, [state.document]) &&
          (name === 'A' || cacheContract(state.workers.caches)),
      );
    }
    await context.close();
    context = undefined;
  };
  try {
    await serve(A, 'A');
    context = await launchProfile(profile);
    let page = context.pages()[0] ?? (await context.newPage()),
      events = track(page);
    receipt.phases.browser = await (async () => {
      const cdp = await context!.newCDPSession(page);
      try {
        return await cdp.send('Browser.getVersion');
      } finally {
        await cdp.detach();
      }
    })();
    await page.goto(origin, { waitUntil: 'load', timeout: 60000 });
    await waitShell(page);
    const initial = await snapshot(page);
    receipt.phases.arm = { initial, events };
    check('freshA', initial.workers.registrations === 0 && initial.caches.length === 0);
    let settings = await openOfflineSettings(page);
    await settings.getByRole('button', { name: 'Enable offline access', exact: true }).click();
    const ready = settings.getByRole('button', { name: 'Offline files ready', exact: true });
    await ready.waitFor({ state: 'visible', timeout: 180000 });
    await page.waitForFunction(
      async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        return registrations.length === 1 && registrations[0].active?.state === 'activated';
      },
      undefined,
      { timeout: 60000 },
    );
    const prepared = await snapshot(page);
    check('readyA', await ready.isDisabled());
    check('firstInstallUncontrolled', prepared.workers.controller === null);
    const reopened = await page.goto(origin, { waitUntil: 'load', timeout: 60000 });
    await waitShell(page);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.waitForTimeout(3000);
    const armed = await snapshot(page);
    receipt.phases.arm = { initial, prepared, armed, events };
    check(
      'controlledA',
      controlled(armed.workers, A) &&
        armed.workers.active?.reply?.version === A.pwaVersion &&
        armed.workers.active.reply.ready === true &&
        reopened?.fromServiceWorker() === true &&
        armed.document.entry === A.entry,
    );
    check('cachedA', armed.workers.caches.includes(`play100-pwa-v1-core-${A.pwaVersion}`));
    check('cleanA', clean(events, [initial.document, prepared.document, armed.document]));
    await context.close();
    context = undefined;
    await stopServer();
    await coldOffline(A, 'A');
    await serve(B, 'B');
    check('sameOriginSwap', true);
    context = await launchProfile(profile);
    page = context.pages()[0] ?? (await context.newPage());
    events = track(page);
    const opened = await page.goto(origin, { waitUntil: 'load', timeout: 60000 });
    await waitShell(page);
    const navigationDocument = await documentInfo(page);
    check(
      'navigationStillA',
      opened?.fromServiceWorker() === true && navigationDocument.entry === A.entry && navigationDocument.controlled,
    );
    settings = await openOfflineSettings(page);
    // Preserve the automatic-update observation before exercising the app's explicit check.
    let automaticWaiting = true;
    try {
      await page.waitForFunction(
        async () => !!(await navigator.serviceWorker.getRegistration('/'))?.waiting,
        undefined,
        { timeout: 90000 },
      );
    } catch (error) {
      automaticWaiting = false;
      receipt.phases.automaticWait = String(error);
    }
    await settings.getByRole('button', { name: 'Check for an app update', exact: true }).click();
    await page.waitForFunction(
      () => {
        const block = document.querySelector('dialog[aria-labelledby="settings-title"] .pwa-settings');
        const button = [...(block?.querySelectorAll('button') ?? [])].find(
          (element) => element.textContent?.trim() === 'Check for an app update',
        );
        return !!block && !/Checking for an update/.test(block.textContent ?? '') && !!button && !button.disabled;
      },
      undefined,
      { timeout: 90000 },
    );
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration('/'))?.waiting, undefined, {
      timeout: 90000,
    });
    const review = settings.getByRole('button', { name: 'Review app update', exact: true });
    await review.waitFor({ state: 'visible', timeout: 30000 });
    const before = await snapshot(page),
      loads = events.loads;
    check(
      'activeAWaitingB',
      controlled(before.workers, A) &&
        before.workers.active?.reply?.version === A.pwaVersion &&
        before.workers.waiting?.reply?.version === B.pwaVersion,
    );
    check(
      'updateNotice',
      (await review.isEnabled()) && /update is ready/i.test(await settings.locator('.pwa-settings').innerText()),
    );
    await page.screenshot({ path: path.join(options.evidence, 'update-ready.png') });
    await review.click();
    const group = settings.locator('[role="group"][aria-label="Confirm app update"]');
    await group.waitFor({ state: 'visible' });
    const confirmText = await group.innerText();
    await page.screenshot({ path: path.join(options.evidence, 'update-confirm.png') });
    const nextNavigation = events.navigations.length;
    await Promise.all([
      page.waitForEvent('load', { timeout: 60000 }),
      group.getByRole('button', { name: 'Save and update this page', exact: true }).click(),
    ]);
    await waitShell(page);
    await page.waitForTimeout(5000);
    const after = await snapshot(page),
      names = after.caches.map((row) => row.name);
    receipt.phases.update = { automaticWaiting, before, after, confirmText, loadsDelta: events.loads - loads, events };
    check('oneGuardedReload', events.loads - loads === 1);
    check('controllerB', controlled(after.workers, B) && after.workers.waiting === null);
    check('documentB', after.document.controlled && after.document.entry === B.entry);
    check('cacheRetention', cacheContract(names));
    const oldImages = `play100-pwa-v1-images-${A.pwaVersion}`;
    check('oldImagesDeleted', before.caches.some((row) => row.name === oldImages) && !names.includes(oldImages));
    check('cleanUpdate', clean(events, [navigationDocument, before.document, after.document]));
    check(
      'updatedPolicyB',
      events.navigations.length > nextNavigation &&
        events.navigations.slice(nextNavigation).every((row) => row.csp === B.csp),
    );
    await page.screenshot({ path: path.join(options.evidence, 'updated.png') });
    await context.close();
    context = undefined;
    for (const relaunch of [false, true]) {
      context = await launchProfile(fresh);
      const preparationRequests: string[] = [];
      context.on('request', (request) => {
        if (request.serviceWorker() || ['/sw.js', '/pwa/offline.html'].includes(new URL(request.url()).pathname))
          preparationRequests.push(request.url());
      });
      page = context.pages()[0] ?? (await context.newPage());
      events = track(page);
      const documents = [];
      for (const pathname of relaunch ? ['/'] : ['/', '/my-games']) {
        const response = await page.goto(`${origin}${pathname}`, { waitUntil: 'load', timeout: 60000 });
        await waitShell(page, pathname === '/my-games');
        await page.waitForTimeout(pathname === '/' && !relaunch ? 10000 : 5000);
        const state = await snapshot(page);
        documents.push(state);
        assert.equal(response?.fromServiceWorker(), false);
        assert.equal(response?.headers()['content-security-policy'], B.csp);
      }
      let offered = true;
      if (!relaunch) {
        settings = await openOfflineSettings(page);
        offered = await settings.getByRole('button', { name: 'Enable offline access', exact: true }).isEnabled();
        await page.waitForTimeout(3000);
      }
      const final = await snapshot(page);
      const name = relaunch ? 'noIntentRelaunch' : 'noIntent';
      receipt.phases[name] = { documents, final, offered, preparationRequests, events };
      check(
        name,
        offered &&
          !preparationRequests.length &&
          !context.serviceWorkers().length &&
          [...documents, final].every(
            (row) => row.workers.registrations === 0 && !row.document.controlled && row.caches.length === 0,
          ) &&
          clean(
            events,
            [...documents, final].map((row) => row.document),
          ),
      );
      await context.close();
      context = undefined;
    }
    await stopServer();
    await coldOffline(B, 'B');
    await runMixedVersionPhases({
      A,
      B,
      port: options.port,
      evidence: options.evidence,
      phases: receipt.phases,
      check,
    });
  } catch (error) {
    receipt.errors.push(String(error));
  } finally {
    try {
      await context?.close();
    } catch (error) {
      receipt.errors.push(`Browser cleanup: ${error}`);
    }
    try {
      await stopServer();
      receipt.checks.serverStopped = true;
    } catch (error) {
      receipt.errors.push(`Server cleanup: ${error}`);
    }
    receipt.phases.servers = servers.map(({ requests, errors }) => ({ requests, errors }));
    for (const item of servers) receipt.errors.push(...item.errors);
    try {
      const endA = await verifySwBuild(options.baseline, false, repository),
        endB = await verifySwBuild(options.candidate, true, repository);
      receipt.checks.inputsUnchanged =
        endA.fingerprint === A.fingerprint &&
        endB.fingerprint === B.fingerprint &&
        hash(await readFile(inputFile)) === hash(inputBytes) &&
        JSON.stringify(await sourceIdentity()) === JSON.stringify(runner.files);
    } catch (error) {
      receipt.errors.push(`Evidence changed: ${error}`);
    }
    const failedChecks = failedSwChecks(receipt.checks);
    const result = {
      ...receipt,
      failedChecks,
      status: failedChecks.length || receipt.errors.length ? 'HOLD' : 'PASSED',
      finishedAt: new Date().toISOString(),
    };
    const output = path.join(options.evidence, 'sw-probe.json');
    await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ output, status: result.status, failedChecks, errors: result.errors }));
    if (result.status !== 'PASSED') failure = `SW probe held; retain ${output} and both profiles.`;
  }
  if (failure) throw new Error(failure);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  releaseSwProbe(parseSwArguments(process.argv.slice(2))).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
