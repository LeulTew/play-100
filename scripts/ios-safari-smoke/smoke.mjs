import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const site = 'https://play-100-collection.vercel.app';
const endpoint = 'http://127.0.0.1:4444';
const output = 'ios-safari-artifacts';
// Add only narrowly matched, justified exceptions with an issue reference.
const errorAllowlist = [];
const results = {
  site,
  device: process.env.IOS_DEVICE_NAME,
  runtime: process.env.IOS_VERSION,
  udid: process.env.IOS_UDID,
  startedAt: new Date().toISOString(),
  steps: [],
  documents: [],
  pageErrors: [],
  errorAllowlist,
  passed: false,
};
let session;

async function command(method, path, body) {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(path === '/session' ? 300_000 : 90_000),
  });
  const payload = await response.json();
  if (!response.ok || payload.value?.error) {
    throw new Error(`${method} ${path}: ${JSON.stringify(payload.value)}`);
  }
  return payload.value;
}

const wd = (method, path, body) => command(method, `/session/${session}${path}`, body);
const execute = (script, ...args) => wd('POST', '/execute/sync', { script, args });

async function waitFor(script, message, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await execute(script);
    if (value) return value;
    await delay(200);
  }
  throw new Error(`Timed out: ${message}`);
}

async function save() {
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
}

async function capture(name) {
  const image = await wd('GET', '/screenshot');
  await writeFile(`${output}/${name}.png`, Buffer.from(image, 'base64'));
  execFileSync('xcrun', ['simctl', 'io', results.udid, 'screenshot', `${output}/${name}-simulator.png`]);
}

async function collectErrors() {
  const errors = await execute('return window.__iosSmoke ? window.__iosSmoke.errors.splice(0) : [];');
  results.pageErrors.push(...errors);
  const unexpected = results.pageErrors.filter(
    (error) => !errorAllowlist.some((allowed) => new RegExp(allowed.pattern).test(error.message)),
  );
  assert.equal(unexpected.length, 0, `Uncaught page errors: ${JSON.stringify(unexpected)}`);
}

async function step(name, action) {
  const record = { name, startedAt: new Date().toISOString() };
  results.steps.push(record);
  const start = performance.now();
  try {
    record.evidence = await action();
    await capture(name);
    await collectErrors();
    record.passed = true;
  } catch (error) {
    record.passed = false;
    record.error = error.stack;
    try {
      record.failureMetrics = await metrics();
    } catch (metricsError) {
      record.metricsError = metricsError.message;
    }
    try {
      await capture(`${name}-failure`);
    } catch (captureError) {
      record.screenshotError = captureError.message;
    }
    throw error;
  } finally {
    record.durationMs = Math.round(performance.now() - start);
    await save();
  }
}

async function installCollector(previousTimeOrigin) {
  const document = await waitFor(`
    if (location.origin !== ${JSON.stringify(site)} ||
        performance.timeOrigin === ${JSON.stringify(previousTimeOrigin ?? null)}) return null;
    if (!window.__iosSmoke) {
      const state = window.__iosSmoke = {
        errors: [], clicks: [], installedAtMs: performance.now(), readyState: document.readyState,
        fcp: null, lcp: null, supportedEntryTypes: PerformanceObserver.supportedEntryTypes || []
      };
      addEventListener('error', event => {
        if (!(event instanceof ErrorEvent)) return;
        state.errors.push({ type: 'error', message: event.message, stack: event.error?.stack,
          filename: event.filename, line: event.lineno, column: event.colno, url: location.href });
      });
      addEventListener('unhandledrejection', event => state.errors.push({
        type: 'unhandledrejection', message: String(event.reason?.message || event.reason),
        stack: event.reason?.stack, url: location.href
      }));
      addEventListener('click', event => state.clicks.push({
        trusted: event.isTrusted, text: event.target.closest('a,button')?.textContent.trim(),
        tag: event.target.tagName, url: location.href, atMs: performance.now()
      }), true);
      if (state.supportedEntryTypes.includes('paint')) {
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (entry.name === 'first-contentful-paint') state.fcp = entry.startTime;
          }
        }).observe({ type: 'paint', buffered: true });
      }
      if (state.supportedEntryTypes.includes('largest-contentful-paint')) {
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) state.lcp = entry.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      }
    }
    return { timeOrigin: performance.timeOrigin, installedAtMs: window.__iosSmoke.installedAtMs,
      readyStateAtInstall: window.__iosSmoke.readyState };
  `, 'install error collector in the new production document');
  results.documents.push(document);
  return document;
}

async function metrics() {
  return execute(`
    const root = document.documentElement;
    const state = window.__iosSmoke;
    return {
      url: location.href, userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      navigation: performance.getEntriesByType('navigation')[0]?.toJSON() || null,
      fcpMs: state.fcp, lcpMs: state.lcp, supportedEntryTypes: state.supportedEntryTypes,
      boot: { 'data-boot': root.getAttribute('data-boot'),
        'data-boot-art': root.getAttribute('data-boot-art'),
        'data-app-started': root.getAttribute('data-app-started') },
      collector: { installedAtMs: state.installedAtMs, readyStateAtInstall: state.readyState },
      clicks: state.clicks
    };
  `);
}

const visible = `
  const visible = element => !!element && element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none';
`;

async function assertLoaded() {
  await waitFor(`${visible}
    const bootError = document.querySelector('#p100-boot-error');
    return document.documentElement.hasAttribute('data-app-started') &&
      !visible(bootError);
  `, 'app started and boot error hidden');
}

async function click(selector) {
  const element = await waitFor(`${visible}
    const element = document.querySelector(${JSON.stringify(selector)});
    return visible(element) ? element : null;
  `, `visible ${selector}`);
  const id = element['element-6066-11e4-a52e-4f735466cecf'];
  assert.ok(id, `No WebDriver element for ${selector}`);
  await wd('POST', `/element/${id}/click`, {});
  return element;
}

async function navigation(label) {
  const element = await waitFor(`${visible}
    return [...document.querySelectorAll('.mobile-nav a')]
      .find(element => visible(element) && element.textContent.trim() === ${JSON.stringify(label)}) || null;
  `, `bottom navigation ${label}`);
  await wd('POST', `/element/${element['element-6066-11e4-a52e-4f735466cecf']}/click`, {});
}

await mkdir(output, { recursive: true });
await save();
try {
  assert.ok(results.udid && results.runtime && results.device, 'Simulator identity is required.');
  const deadline = Date.now() + 360_000;
  while (!session && Date.now() < deadline) {
    try {
      const created = await command('POST', '/session', {
        capabilities: { alwaysMatch: {
          browserName: 'Safari',
          platformName: 'iOS',
          pageLoadStrategy: 'none',
          'appium:automationName': 'XCUITest',
          'appium:udid': results.udid,
          'appium:deviceName': results.device,
          'appium:platformVersion': results.runtime,
          'appium:nativeWebTap': true,
          'appium:newCommandTimeout': 120,
          'appium:wdaLaunchTimeout': 180_000,
          'appium:wdaStartupRetries': 1,
          'appium:showXcodeLog': true,
        } },
      });
      session = created.sessionId;
      results.capabilities = created.capabilities;
    } catch (error) {
      results.sessionStartupError = error.message;
      await delay(2000);
    }
  }
  assert.ok(session, `Could not create iOS Safari session: ${results.sessionStartupError}`);
  delete results.sessionStartupError;
  await wd('POST', '/timeouts', { implicit: 0, script: 30_000, pageLoad: 60_000 });
  await step('01-cold-home', async () => {
    await wd('POST', '/url', { url: `${site}/` });
    await installCollector();
    await assertLoaded();
    await waitFor(`${visible}
      const hero = document.querySelector('.hero');
      return visible(hero) && hero.innerText.includes('GOOD GAMES.') && hero.innerText.includes('GREAT ESCAPES.');
    `, 'both hero phrases');
    const evidence = await metrics();
    assert.match(evidence.userAgent, /iPhone/);
    assert.match(evidence.userAgent, /AppleWebKit/);
    return evidence;
  });
  await step('02-discover', async () => {
    await navigation('Discover');
    await waitFor(`${visible} return visible(document.querySelector('#catalog-search'));`, 'Discover search');
    return { url: await wd('GET', '/url') };
  });
  await step('03-search', async () => {
    const element = await wd('POST', '/element', { using: 'css selector', value: '#catalog-search' });
    const id = element['element-6066-11e4-a52e-4f735466cecf'];
    await wd('POST', `/element/${id}/value`, { text: 'portal' });
    const titles = await waitFor(`
      const input = document.querySelector('#catalog-search');
      const cards = [...document.querySelectorAll('.discovery-cards > li')];
      return input?.value === 'portal' && cards.length && cards.some(card => /portal/i.test(card.innerText))
        ? cards.map(card => card.innerText) : null;
    `, 'Portal result cards');
    return { query: 'portal', resultCards: titles };
  });
  await step('04-the-100', async () => {
    await navigation('The 100');
    await waitFor(`${visible} return visible(document.querySelector('.game-card .game-link'));`, 'collection card');
    return { url: await wd('GET', '/url') };
  });
  let opener;
  let title;
  await step('05-game-detail', async () => {
    title = await execute('return document.querySelector(".game-card .game-link h3").textContent.trim();');
    opener = await click('.game-card .game-link');
    const heading = await waitFor(`${visible}
      const dialog = document.querySelector('.game-dialog[open]');
      const heading = dialog?.querySelector('#game-title');
      return visible(dialog) && visible(heading) ? heading.textContent.trim() : null;
    `, 'game dialog and heading');
    assert.equal(heading, title);
    return { title, heading };
  });
  await step('06-close-focus', async () => {
    await click('.game-dialog[open] button[aria-label="Close dialog"]');
    await waitFor(`
      return !document.querySelector('.game-dialog[open]');
    `, 'game dialog closed');
    const openerId = opener['element-6066-11e4-a52e-4f735466cecf'];
    const restored = await waitFor(`
      const element = document.querySelector('.game-card .game-link');
      return document.activeElement === element;
    `, 'focus returned to the game opener');
    assert.equal(await execute('return document.activeElement === arguments[0];', {
      'element-6066-11e4-a52e-4f735466cecf': openerId,
    }), true, 'Focus must return to the original DOM element, not a replacement.');
    assert.equal(restored, true, 'Closing the detail must restore focus to its exact opener.');
    return { focusRestored: restored, openerTitle: title };
  });
  await step('07-my-games', async () => {
    await navigation('My games');
    const heading = await waitFor(`${visible}
      const heading = document.querySelector('#my-games-title');
      return visible(heading) ? heading.textContent.trim() : null;
    `, 'My games heading');
    assert.equal(heading, 'My games');
    return { heading };
  });
  await step('08-reload', async () => {
    const before = await execute('return performance.timeOrigin;');
    await collectErrors();
    await wd('POST', '/refresh', {});
    await installCollector(before);
    await assertLoaded();
    await waitFor(`${visible}
      const heading = document.querySelector('#my-games-title');
      return visible(heading) && heading.textContent.trim() === 'My games';
    `, 'My games after reload');
    return metrics();
  });
  await delay(1000);
  await collectErrors();
  results.passed = true;
} catch (error) {
  results.error = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  if (session) {
    try {
      await collectErrors();
    } catch (error) {
      results.passed = false;
      results.finalError = error.stack;
      process.exitCode = 1;
    }
    try {
      await wd('DELETE', '');
    } catch (error) {
      results.passed = false;
      results.cleanupError = error.message;
      process.exitCode = 1;
    }
  }
  results.finishedAt = new Date().toISOString();
  await save();
}
