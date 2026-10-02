/**
 * The low-end phone profile (docs/performance.md, "Low-end phones"). It replays the Firebase Test Lab visit of a Galaxy
 * A03s (2 GB, WebView Chrome 106) in Chromium: a 412×785 touch viewport at DPR 1.75, 6× CPU throttling, deviceMemory 2
 * and 8 cores, and DevTools' Slow 4G (562.5 ms per request, 1.44 Mbit/s down) through CDP network emulation. Each
 * target is a deployment's origin or a local build, served over HTTP/2 with Brotli and its checkout's vercel.json
 * rewrites and headers, as production serves it. Two of that phone's three fallback-font probes fail, so here they fail
 * too unless --shell is given: the first-paint shell stays hidden, and the first contentful paint is React's first paint.
 *
 *   npx tsx scripts/low-end-profile.ts --target before=../base/dist --target after=dist [--runs 5] [--out report.json]
 *     [--shell] [--cpuprofile prefix]
 *
 * Each run is a fresh context, a first visit, and follows the Test Lab harness: load, 6 s, the home metrics, a 5 s
 * scroll of the home page, Discover, a 4 s scroll there, The 100, the first game link's details, Back and My games.
 * Visits alternate between targets, run by run. --cpuprofile writes each visit's startup CPU profile instead, from
 * navigation to the paint after React's first commit, with its marks beside it (.marks.json), and skips the rest of the
 * visit.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createSecureServer } from 'node:http2';
import type { Http2ServerRequest, Http2ServerResponse } from 'node:http2';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { brotliCompressSync, constants } from 'node:zlib';
import { chromium } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { routePattern } from '../src/lib/vercel-routes.ts';

// DevTools' Slow 4G preset: 150 ms × 3.75 of latency per request, 1.6 Mbit/s × 0.9 down and 750 kbit/s × 0.9 up.
export const SLOW_4G = {
  offline: false,
  latency: 562.5,
  downloadThroughput: ((1.6 * 1000 * 1000) / 8) * 0.9,
  uploadThroughput: ((750 * 1000) / 8) * 0.9,
  connectionType: 'cellular4g',
} as const;
export const PHONE = {
  viewport: { width: 412, height: 785 },
  deviceScaleFactor: 1.75,
  cpuSlowdown: 6,
  deviceMemory: 2,
  hardwareConcurrency: 8,
  userAgent:
    'Mozilla/5.0 (Linux; Android 13; SM-A037U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
} as const;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};
const COMPRESSIBLE = /^(?:text\/|application\/(?:json|manifest\+json|xml)|image\/svg\+xml)/;

interface Deployment {
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

function certificate() {
  const key = path.join(tmpdir(), 'play100-low-end-profile.key');
  const cert = path.join(tmpdir(), 'play100-low-end-profile.crt');
  if (!existsSync(key) || !existsSync(cert)) {
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '7', '-subj', '/CN=127.0.0.1'].concat([
        '-addext',
        'subjectAltName=IP:127.0.0.1',
        '-keyout',
        key,
        '-out',
        cert,
      ]),
      { stdio: 'ignore' },
    );
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

/**
 * Serves a build as production does; the browser applies the network profile. Port 0 takes any free port; a session
 * on a shared host passes the port it was given.
 */
export async function serve(root: string, port = 0) {
  // The build's own checkout's deployment config, when it has one.
  const config = path.join(root, '..', 'vercel.json');
  const deployment = JSON.parse(readFileSync(existsSync(config) ? config : 'vercel.json', 'utf8')) as Deployment;
  const rewrites = deployment.rewrites
    .filter((rule) => rule.destination === '/index.html')
    .map((rule) => routePattern(rule.source));
  const rules = deployment.headers.map((rule) => ({ pattern: routePattern(rule.source), headers: rule.headers }));
  const files = new Map<string, { body: Buffer; brotli: Buffer | null; type: string }>();
  const read = (file: string) => {
    let entry = files.get(file);
    if (!entry) {
      const body = readFileSync(file);
      const type = CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream';
      const brotli = COMPRESSIBLE.test(type)
        ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
        : null;
      entry = { body, brotli, type };
      files.set(file, entry);
    }
    return entry;
  };
  const respond = (request: Http2ServerRequest, response: Http2ServerResponse) => {
    const pathname = decodeURIComponent(new URL(request.url, 'https://127.0.0.1').pathname);
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) {
      response.writeHead(400).end();
      return;
    }
    if (pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end('{}');
      return;
    }
    let file = path.join(root, pathname);
    let status = 200;
    if (!existsSync(file) || !statSync(file).isFile()) {
      if (pathname === '/' || rewrites.some((pattern) => pattern.test(pathname))) file = path.join(root, 'index.html');
      else {
        status = 404;
        file = path.join(root, '404.html');
      }
    }
    const entry = read(file);
    const headers: Record<string, string> = { 'content-type': entry.type, 'cache-control': 'public, max-age=0' };
    for (const rule of rules) {
      if (rule.pattern.test(pathname)) for (const { key, value } of rule.headers) headers[key.toLowerCase()] = value;
    }
    const encoded = entry.brotli && /\bbr\b/.test(String(request.headers['accept-encoding'] ?? ''));
    const body = encoded && entry.brotli ? entry.brotli : entry.body;
    if (encoded) {
      headers['content-encoding'] = 'br';
      headers.vary = 'Accept-Encoding';
    }
    headers['content-length'] = String(body.length);
    response.writeHead(status, headers);
    if (request.method === 'HEAD') response.end();
    else response.end(body);
  };
  const server = createSecureServer({ ...certificate(), allowHTTP1: true }, (request, response) => {
    try {
      respond(request, response);
    } catch {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The profile server has no address.');
  return { origin: `https://127.0.0.1:${address.port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** Runs before the page's own scripts: the phone's hints, the failing probes and the marks the driver reads. */
export const initScript = (failProbes: boolean) => `(() => {
  const hint = (name, value) => Object.defineProperty(Navigator.prototype, name, { configurable: true, get: () => value });
  hint('deviceMemory', ${PHONE.deviceMemory});
  hint('hardwareConcurrency', ${PHONE.hardwareConcurrency});
  const state = (window.__lowEnd = { errors: [], longTasks: [], marks: {}, resizeObserverErrors: 0 });
  addEventListener('error', (event) => {
    if (!(event instanceof ErrorEvent)) return;
    if (/ResizeObserver/.test(event.message)) state.resizeObserverErrors += 1;
    state.errors.push(String(event.message).slice(0, 160));
  }, true);
  addEventListener('unhandledrejection', (event) =>
    state.errors.push(String((event.reason && event.reason.message) || event.reason).slice(0, 160)));
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) state.longTasks.push([Math.round(entry.startTime), Math.round(entry.duration)]);
  }).observe({ type: 'longtask', buffered: true });
  if (${failProbes}) {
    const measure = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return this.classList.contains('p100-probe') ? new DOMRect(0, 0, 0, 0) : measure.call(this);
    };
    document.addEventListener('readystatechange', () => { Element.prototype.getBoundingClientRect = measure; }, { once: true });
  }
  const watch = new MutationObserver(() => {
    if (state.marks.appStarted === undefined && document.documentElement.hasAttribute('data-app-started'))
      state.marks.appStarted = Math.round(performance.now());
    const root = document.getElementById('root');
    if (root && root.firstElementChild && !root.querySelector('.first-paint-shell, #p100-boot-error')) {
      state.marks.commit = Math.round(performance.now());
      requestAnimationFrame(() => setTimeout(() => { state.marks.commitPaint = Math.round(performance.now()); }));
      watch.disconnect();
    }
  });
  watch.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-app-started'] });
})();`;

/** The Test Lab harness's visit (its DRIVER), returning its measurements instead of logging them. */
export const DRIVER = `(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const state = window.__lowEnd;
  const tasks = (until = Infinity) => {
    const list = state.longTasks.filter(([start]) => start < until);
    return {
      count: list.length,
      ms: list.reduce((sum, [, duration]) => sum + duration, 0),
      worstMs: list.reduce((worst, [, duration]) => Math.max(worst, duration), 0),
      blockingMs: list.reduce((sum, [, duration]) => sum + Math.max(0, duration - 50), 0),
    };
  };
  const heap = () => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
  let lcp = null;
  let cls = 0;
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    if (entries.length) lcp = Math.round(entries[entries.length - 1].startTime);
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) cls += entry.value;
  }).observe({ type: 'layout-shift', buffered: true });
  await sleep(1500);
  const fcp = Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? NaN);
  const result = {
    fcp,
    lcp,
    cls: Math.round(cls * 1000) / 1000,
    ...state.marks,
    beforeCommit: tasks(state.marks.commit ?? Infinity),
    home: tasks(),
    canvas: Boolean(document.querySelector('canvas')),
    art: document.querySelector('.collection-artifact')?.getAttribute('data-render-mode') ?? null,
    heapMb: heap(),
  };
  const frames = async (ms, act) => {
    let count = 0;
    let worst = 0;
    let last = performance.now();
    let running = true;
    const tick = (time) => {
      count += 1;
      worst = Math.max(worst, time - last);
      last = time;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const start = performance.now();
    await act();
    await sleep(Math.max(0, ms - (performance.now() - start)));
    running = false;
    return { fps: Math.round((count * 1000) / (performance.now() - start)), worstFrameMs: Math.round(worst) };
  };
  const scroll = (steps) => async () => {
    for (let index = 0; index < steps; index += 1) {
      scrollBy(0, Math.round(innerHeight * 0.4));
      await sleep(160);
    }
  };
  const byText = (text) =>
    [...document.querySelectorAll('a, button')].find((node) => (node.textContent || '').trim() === text && node.offsetParent !== null);
  const go = async (find, ready) => {
    const target = find();
    if (!target) return { ms: null, ok: false, error: 'not found' };
    const start = performance.now();
    target.click();
    let ok = false;
    for (let index = 0; index < 150 && !ok; index += 1) {
      await sleep(100);
      ok = Boolean(ready());
    }
    return { ms: Math.round(performance.now() - start), ok };
  };
  // When each part of the visit starts, so long tasks can be told apart by what the visit was doing. The marks put the
  // same boundaries in a DevTools trace of the visit.
  const steps = {};
  const step = (name) => {
    steps[name] = Math.round(performance.now());
    performance.mark('p100:' + name);
  };
  step('scrollHome');
  result.scrollHome = await frames(5000, scroll(25));
  scrollTo(0, 0);
  await sleep(1000);
  step('discover');
  result.discover = await go(() => byText('Discover'), () => location.pathname === '/discover' && /catalog games/.test(document.body.innerText));
  await sleep(3000);
  step('scrollDiscover');
  result.scrollDiscover = await frames(4000, scroll(20));
  scrollTo(0, 0);
  await sleep(1000);
  step('the100');
  result.the100 = await go(() => byText('The 100'), () => location.pathname === '/' && Boolean(document.querySelector('a[href*="game="]')));
  await sleep(2000);
  const link = document.querySelector('a[href*="game="]');
  result.detailTarget = link && { href: link.getAttribute('href'), shown: link.offsetParent !== null, className: link.className };
  step('detail');
  result.detail = await go(() => document.querySelector('a[href*="game="]'), () => Boolean(document.querySelector('[role=dialog], dialog[open]')));
  // The URL the click left: a detail opens by adding ?game= to it.
  result.detailUrl = location.pathname + location.search;
  await sleep(3000);
  step('back');
  history.back();
  await sleep(1500);
  step('myGames');
  result.myGames = await go(() => byText('My games'), () => location.pathname === '/my-games');
  await sleep(2000);
  step('end');
  result.steps = steps;
  result.longTaskList = state.longTasks.slice(0, 400);
  result.visit = tasks();
  result.resizeObserverErrors = state.resizeObserverErrors;
  result.errors = state.errors.slice(0, 12);
  result.heapEndMb = heap();
  return result;
})()`;

export type Measurement = Record<string, unknown>;

/** The parts of a visit, in order: startup runs from navigation to the home page's scroll. */
export const PHASES = [
  'startup',
  'scrollHome',
  'discover',
  'scrollDiscover',
  'the100',
  'detail',
  'back',
  'myGames',
] as const;

/** Long-task time in each part of a visit, from the driver's step marks and its [start, duration] long tasks. */
export function phaseTasks(steps: Record<string, number>, longTasks: readonly (readonly [number, number])[]) {
  const bounds = [0, ...PHASES.slice(1).map((name) => steps[name]), steps.end];
  return Object.fromEntries(
    PHASES.map((name, index) => {
      const from = bounds[index];
      const to = bounds[index + 1];
      if (from === undefined || to === undefined) return [name, { ms: NaN, count: NaN, worstMs: NaN }];
      const list = longTasks.filter(([start]) => start >= from && start < to);
      return [
        name,
        {
          ms: list.reduce((sum, [, duration]) => sum + duration, 0),
          count: list.length,
          worstMs: list.reduce((worst, [, duration]) => Math.max(worst, duration), 0),
        },
      ];
    }),
  );
}

export const median = (values: number[]) => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  const lower = sorted[middle - 1];
  if (upper === undefined) return null;
  return sorted.length % 2 || lower === undefined ? upper : (lower + upper) / 2;
};

export const pick = (record: Measurement, key: string): number => {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Measurement | undefined)?.[part], record);
  return typeof value === 'number' ? value : NaN;
};

export const SUMMARY_KEYS = [
  'fcp',
  'lcp',
  'appStarted',
  'commit',
  'commitPaint',
  'beforeCommit.ms',
  'beforeCommit.count',
  'beforeCommit.worstMs',
  'beforeCommit.blockingMs',
  'home.ms',
  'scrollHome.fps',
  'scrollHome.worstFrameMs',
  'discover.ms',
  'scrollDiscover.fps',
  'scrollDiscover.worstFrameMs',
  'the100.ms',
  'detail.ms',
  'myGames.ms',
  'visit.ms',
  'visit.count',
  'visit.worstMs',
  ...PHASES.map((phase) => `phases.${phase}.ms`),
  'resizeObserverErrors',
  'heapEndMb',
] as const;

interface Target {
  name: string;
  origin: string;
  close?: () => Promise<unknown>;
}

/** One first visit: the Test Lab harness's measurements, or with `profile` the startup CPU profile and marks. */
async function visit(browser: Browser, target: Target, options: { shell: boolean; profile?: string }) {
  const context = await browser.newContext({
    viewport: PHONE.viewport,
    deviceScaleFactor: PHONE.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    userAgent: PHONE.userAgent,
    ignoreHTTPSErrors: true,
    serviceWorkers: 'allow',
  });
  try {
    await context.addInitScript({ content: initScript(!options.shell) });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 160));
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: PHONE.cpuSlowdown });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
    if (options.profile) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
      await cdp.send('Profiler.start');
    }
    await page.goto(`${target.origin}/`, { waitUntil: 'load', timeout: 180_000 });
    if (options.profile) {
      // Polled from here: waitForFunction re-evaluates a string predicate inside the page at every poll, which a CSP
      // without 'unsafe-eval' (production's) blocks. Each evaluate call runs as DevTools code instead.
      const deadline = Date.now() + 120_000;
      while (!(await page.evaluate<boolean>("'commitPaint' in window.__lowEnd.marks"))) {
        if (Date.now() > deadline) throw new Error(`${target.name}: no React first paint within 120 s.`);
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(1000);
      // The profile ends at this reading, which places the page's marks on the profile's own clock.
      const stoppedAt = Math.round(await page.evaluate<number>('performance.now()'));
      const { profile } = await cdp.send('Profiler.stop');
      const marks = { ...(await page.evaluate<Measurement>('window.__lowEnd.marks')), stoppedAt };
      writeFileSync(`${options.profile}.cpuprofile`, JSON.stringify(profile));
      writeFileSync(`${options.profile}.marks.json`, JSON.stringify(marks));
      return { profile: `${options.profile}.cpuprofile`, ...marks };
    }
    await page.waitForTimeout(6000);
    const result = await page.evaluate<Measurement>(DRIVER);
    result.phases = phaseTasks(
      (result.steps ?? {}) as Record<string, number>,
      (result.longTaskList ?? []) as [number, number][],
    );
    result.consoleErrors = consoleErrors;
    result.serviceWorker = await page.evaluate(
      'Boolean(navigator.serviceWorker && navigator.serviceWorker.controller)',
    );
    return result;
  } finally {
    await context.close();
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      // name=dist directory or name=https origin; visits alternate between targets, run by run.
      target: { type: 'string', multiple: true, default: ['build=dist'] },
      runs: { type: 'string', default: '5' },
      out: { type: 'string' },
      shell: { type: 'boolean', default: false },
      cpuprofile: { type: 'string' },
    },
  });
  const targets: Target[] = [];
  for (const spec of values.target) {
    const [name, location] = spec.split(/=(.*)/s);
    if (!name || !location) throw new Error(`Expected name=dist or name=origin, not ${spec}.`);
    if (/^https?:\/\//.test(location)) targets.push({ name, origin: new URL(location).origin });
    else {
      const root = path.resolve(location);
      if (!existsSync(path.join(root, 'index.html'))) throw new Error(`No build at ${root}.`);
      targets.push({ name, ...(await serve(root)) });
    }
  }
  const browser = await chromium.launch({ args: ['--ignore-certificate-errors', '--enable-unsafe-swiftshader'] });
  const runs = new Map<string, Measurement[]>(targets.map((target) => [target.name, []]));
  try {
    for (let run = 1; run <= Number(values.runs); run += 1) {
      for (const target of run % 2 ? targets : [...targets].reverse()) {
        const profile = values.cpuprofile && `${values.cpuprofile}-${target.name}-${run}`;
        const result = await visit(browser, target, { shell: values.shell, profile: profile || undefined });
        runs.get(target.name)!.push(result);
        process.stdout.write(`${target.name} run ${run}: ${JSON.stringify(result)}\n`);
      }
    }
  } finally {
    await browser.close();
    for (const target of targets) await target.close?.();
  }
  const summary = Object.fromEntries(
    [...runs].map(([name, list]) => [
      name,
      Object.fromEntries(SUMMARY_KEYS.map((key) => [key, median(list.map((run) => pick(run, key)))])),
    ]),
  );
  process.stdout.write(`medians: ${JSON.stringify(summary, null, 1)}\n`);
  if (values.out)
    writeFileSync(
      values.out,
      JSON.stringify({ phone: PHONE, network: SLOW_4G, summary, runs: Object.fromEntries(runs) }, null, 1),
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await main();
}
