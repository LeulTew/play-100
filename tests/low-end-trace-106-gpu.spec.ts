// Diagnostic only, never integrated: low-end-trace-106.spec.ts with GPU rasterization on SwiftShader (Skia's GPU backend,
// as the phone's WebView rasters), to see the raster work on the GPU thread. The low-end visit in Chromium 106, the Galaxy A03s's
// WebView engine, over raw CDP (Playwright needs a current Chromium), traced and attributed like low-end-trace.spec.ts:
// each main-thread task of 50 ms or more by what it ran and by what the page changed during it (p100x: marks).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { test } from '@playwright/test';
import { DRIVER, PHONE, SLOW_4G, initScript } from '../scripts/low-end-profile';

// Chromium 106.0.5249.0, M106's branch point, as the replay's Windows build.
const CHROMIUM_106 = 'https://commondatastorage.googleapis.com/chromium-browser-snapshots/Linux_x64/1036826/chrome-linux.zip';
const CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'v8.execute',
  'blink.user_timing',
  'toplevel',
  'loading',
  'cc',
  'gpu',
];

const MARKS = `(() => {
  const live = {
    cards: document.getElementsByClassName('game-card'),
    reserves: document.getElementsByClassName('game-card-reserve'),
    still: document.getElementsByClassName('artifact-still'),
    filmsSection: document.getElementsByClassName('collection-films'),
    posters: document.getElementsByClassName('film-poster'),
    posterImages: document.getElementsByClassName('film-poster-card'),
    workbook: document.getElementsByClassName('workbook-section'),
    loading: document.getElementsByClassName('collection-loading'),
    shell: document.getElementsByClassName('first-paint-shell'),
    discovery: document.getElementsByClassName('discovery-card'),
    dialogs: document.getElementsByTagName('dialog'),
    images: document.getElementsByTagName('img'),
    nodes: document.getElementsByTagName('*'),
  };
  const last = {};
  const state = (window.__trace = { marks: [], frames: [], recording: false });
  const mark = performance.mark.bind(performance);
  const note = (name) => {
    state.marks.push([Math.round(performance.now()), name]);
    mark(name);
  };
  const scan = () => {
    for (const key of Object.keys(live)) {
      let value = live[key].length;
      if (key === 'nodes') value = Math.round(value / 250) * 250;
      if (last[key] !== value) {
        last[key] = value;
        note('p100x:' + key + '=' + value);
      }
    }
    const started = Boolean(document.documentElement && document.documentElement.hasAttribute('data-app-started'));
    if (started !== Boolean(last.started)) {
      last.started = started;
      note('p100x:app-started=' + started);
    }
    const url = location.pathname + location.search;
    if (url !== last.url) {
      last.url = url;
      note('p100x:url=' + url);
    }
  };
  new MutationObserver(scan).observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-app-started', 'open'],
  });
  const tick = (time) => {
    if (!state.recording) return;
    state.frames.push(Math.round(time * 10) / 10);
    requestAnimationFrame(tick);
  };
  performance.mark = function (name, options) {
    const entry = mark(name, options);
    if (name === 'p100:scrollHome' && !state.recording) {
      state.recording = true;
      requestAnimationFrame(tick);
    }
    if (name === 'p100:discover') state.recording = false;
    return entry;
  };
})();`;

type Message = {
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: { message: string };
  sessionId?: string;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class Cdp {
  private next = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; method: string }>();
  private listeners = new Set<(message: Message) => void>();
  constructor(private socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as Message;
      if (message.id !== undefined) {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        this.pending.delete(message.id);
        if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
        else entry.resolve(message.result);
      } else for (const listener of this.listeners) listener(message);
    });
    socket.addEventListener('close', () => {
      for (const entry of this.pending.values()) entry.reject(new Error(`${entry.method}: the DevTools socket closed.`));
      this.pending.clear();
    });
  }
  send(method: string, params: object = {}, sessionId?: string): Promise<any> {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  on(listener: (message: Message) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  event(sessionId: string | undefined, method: string, timeoutMs: number) {
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`${method} did not arrive within ${timeoutMs} ms.`));
      }, timeoutMs);
      const off = this.on((message) => {
        if (message.sessionId === sessionId && message.method === method) {
          clearTimeout(timer);
          off();
          resolve(message.params);
        }
      });
    });
  }
}

async function chromium106() {
  const dir = path.join(tmpdir(), 'p100-chromium-106');
  const executable = path.join(dir, 'chrome-linux', 'chrome');
  if (existsSync(executable)) return executable;
  mkdirSync(dir, { recursive: true });
  const response = await fetch(CHROMIUM_106);
  if (!response.ok) throw new Error(`The Chromium 106 download failed: ${response.status}`);
  const zip = path.join(dir, 'chrome-linux.zip');
  writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
  execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);
  return executable;
}

async function launch(executable: string) {
  const profile = mkdtempSync(path.join(tmpdir(), 'p100-chrome106-'));
  const chrome = spawn(
    executable,
    [
      '--headless',
      '--no-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-gpu-rasterization',
      '--enable-oop-rasterization',
      '--ignore-gpu-blocklist',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--mute-audio',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const endpoint = await new Promise<string>((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error(`No DevTools endpoint: ${text.slice(-600)}`)), 30_000);
    chrome.stderr!.on('data', (chunk) => {
      text += String(chunk);
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(text);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]!);
      }
    });
    chrome.on('error', (error) => reject(error));
    chrome.on('exit', (code) => reject(new Error(`Chromium exited (${code}): ${text.slice(-600)}`)));
  });
  const socket = new WebSocket(endpoint);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('The DevTools socket failed to open.')), { once: true });
  });
  const cdp = new Cdp(socket);
  const version = await cdp.send('Browser.getVersion');
  return {
    cdp,
    product: String(version.product),
    close: async () => {
      await cdp.send('Browser.close').catch(() => undefined);
      socket.close();
      await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), sleep(5000)]);
      if (chrome.exitCode === null) chrome.kill('SIGKILL');
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}

async function readStream(cdp: Cdp, handle: string) {
  const parts: Buffer[] = [];
  for (;;) {
    const chunk = await cdp.send('IO.read', { handle, size: 8_000_000 });
    parts.push(Buffer.from(String(chunk.data ?? ''), chunk.base64Encoded ? 'base64' : 'utf8'));
    if (chunk.eof) break;
  }
  await cdp.send('IO.close', { handle }).catch(() => undefined);
  return Buffer.concat(parts);
}

async function visit(cdp: Cdp, origin: string) {
  const { browserContextId } = await cdp.send('Target.createBrowserContext');
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method: string, params: object = {}) => cdp.send(method, params, sessionId);
  let result: Record<string, unknown> = {};
  let extra: { marks: [number, string][]; frames: number[] } | null = null;
  let failure: unknown;
  let trace: Buffer | undefined;
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: PHONE.viewport.width,
      height: PHONE.viewport.height,
      deviceScaleFactor: PHONE.deviceScaleFactor,
      mobile: true,
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setUserAgentOverride', { userAgent: PHONE.userAgent });
    await send('Emulation.setCPUThrottlingRate', { rate: PHONE.cpuSlowdown });
    await send('Network.emulateNetworkConditions', SLOW_4G);
    await send('Page.addScriptToEvaluateOnNewDocument', { source: initScript(true) });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: MARKS });
    await cdp.send('Tracing.start', {
      transferMode: 'ReturnAsStream',
      streamFormat: 'json',
      streamCompression: 'none',
      traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: CATEGORIES },
    });
    try {
      const loaded = cdp.event(sessionId, 'Page.loadEventFired', 180_000);
      const navigation = await send('Page.navigate', { url: `${origin}/` });
      if (navigation.errorText) throw new Error(`Navigation failed: ${navigation.errorText}`);
      await loaded;
      await sleep(6000);
      const evaluation = await send('Runtime.evaluate', { expression: DRIVER, awaitPromise: true, returnByValue: true });
      if (evaluation.exceptionDetails)
        throw new Error(
          `The driver threw: ${evaluation.exceptionDetails.exception?.description ?? evaluation.exceptionDetails.text}`,
        );
      result = evaluation.result.value as Record<string, unknown>;
      const marks = await send('Runtime.evaluate', { expression: 'window.__trace', returnByValue: true });
      extra = marks.result.value;
    } catch (cause) {
      failure = cause;
    } finally {
      const complete = cdp.event(undefined, 'Tracing.tracingComplete', 120_000);
      await cdp.send('Tracing.end');
      const { stream } = await complete;
      trace = await readStream(cdp, stream);
    }
  } finally {
    await cdp.send('Target.disposeBrowserContext', { browserContextId }).catch(() => undefined);
  }
  return { result, extra, failure, trace };
}

interface TraceEvent {
  name: string;
  cat?: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: Record<string, unknown>;
}
interface Span {
  name: string;
  ts: number;
  dur: number;
  args?: Record<string, unknown>;
}
interface Node extends Span {
  child: number;
  script?: string;
}

const TASKS = new Set(['RunTask', 'ThreadControllerImpl::RunTask', 'ThreadPool_RunTask']);
const PHASE_NAMES = ['scrollHome', 'discover', 'scrollDiscover', 'the100', 'detail', 'back', 'myGames', 'end'];

function bucket(name: string) {
  if (
    /^(FunctionCall|EvaluateScript|v8\.|V8\.|RunMicrotasks|TimerFire|FireAnimationFrame|FireIdleCallback|EventDispatch|XHR|CompileScript|CompileModule|EvaluateModule|CacheScript|CacheModule|ScriptStreamer)/.test(
      name,
    )
  )
    return 'script';
  if (/^(UpdateLayoutTree|RecalculateStyles|ParseAuthorStyleSheet|StyleInvalidator|ScheduleStyleInvalidation)/.test(name))
    return 'style';
  if (/^(Layout|UpdateLayout|IntersectionObserver|ComputeIntersections|ResizeObserver)/.test(name)) return 'layout';
  if (/^(Paint|PrePaint|Layerize|UpdateLayer|CompositeLayers|Decode|Draw LazyPixelRef|PaintImage|UpdateLayerTree)/.test(name))
    return 'paint';
  if (/(Commit|ScheduledActionCommit|WaitForActivation|NotifyReadyToCommit)/.test(name)) return 'commit';
  if (/^ParseHTML/.test(name)) return 'parse';
  if (/GC/.test(name)) return 'gc';
  return 'other';
}

const file = (url: unknown) => String(url ?? '').replace(/^.*\//, '') || '(inline)';

function scriptOf(span: Span): string | undefined {
  const data = (span.args?.data ?? {}) as Record<string, unknown>;
  switch (span.name) {
    case 'FunctionCall':
      return `${file(data.url)}:${String(data.functionName || '(anonymous)')}@${String(data.lineNumber ?? '?')}:${String(data.columnNumber ?? '?')}`;
    case 'EvaluateScript':
      return `evaluate ${file(data.url)}`;
    case 'v8.compileModule':
    case 'v8.compile':
    case 'CompileScript':
    case 'CompileModule':
      return `compile ${file(data.url ?? span.args?.fileName)}`;
    case 'v8.evaluateModule':
    case 'EvaluateModule':
      return `evaluate module ${file(data.url ?? span.args?.fileName)}`;
    case 'EventDispatch':
      return `event ${String(data.type ?? '?')}`;
    case 'TimerFire':
      return 'timer';
    case 'FireAnimationFrame':
      return 'animation frame';
    case 'FireIdleCallback':
      return 'idle callback';
    default:
      return undefined;
  }
}

const round = (value: number) => Math.round(value);

function lowerBound(spans: Span[], ts: number) {
  let low = 0;
  let high = spans.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (spans[middle]!.ts < ts) low = middle + 1;
    else high = middle;
  }
  return low;
}

function analyze(events: TraceEvent[], steps: Record<string, number>) {
  events.sort((a, b) => a.ts - b.ts);
  const threadNames = new Map<string, string>();
  for (const event of events)
    if (event.ph === 'M' && event.name === 'thread_name') threadNames.set(`${event.pid}:${event.tid}`, String(event.args?.name));
  const score = new Map<string, number>();
  for (const event of events) {
    if (event.name !== 'FunctionCall' && event.name !== 'EvaluateScript' && event.name !== 'ParseHTML') continue;
    const key = `${event.pid}:${event.tid}`;
    if (threadNames.get(key) === 'CrRendererMain') score.set(key, (score.get(key) ?? 0) + 1);
  }
  const main = [...score].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!main) throw new Error('No renderer main thread in the trace.');
  const spans: Span[] = [];
  const open: TraceEvent[] = [];
  const marks: { name: string; ts: number }[] = [];
  for (const event of events) {
    if (String(event.cat ?? '').includes('blink.user_timing') && String(event.name).startsWith('p100'))
      marks.push({ name: event.name, ts: event.ts });
    if (`${event.pid}:${event.tid}` !== main) continue;
    if (event.ph === 'X' && typeof event.dur === 'number')
      spans.push({ name: event.name, ts: event.ts, dur: event.dur, args: event.args });
    else if (event.ph === 'B') open.push(event);
    else if (event.ph === 'E') {
      const begin = open.pop();
      if (begin) spans.push({ name: begin.name, ts: begin.ts, dur: event.ts - begin.ts, args: begin.args });
    }
  }
  if (!spans.length) throw new Error('No complete events on the main thread.');
  const anchor = marks.find((entry) => entry.name === 'p100:scrollHome');
  const origin = anchor && Number.isFinite(steps.scrollHome) ? anchor.ts - steps.scrollHome! * 1000 : spans[0]!.ts;
  const at = (ts: number) => (ts - origin) / 1000;
  spans.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const tasks: Span[] = [];
  let end = -Infinity;
  for (const span of spans) {
    if (!TASKS.has(span.name) || span.ts < end) continue;
    tasks.push(span);
    end = span.ts + span.dur;
  }
  const phaseOf = (ms: number) => {
    let phase = 'startup';
    for (const name of PHASE_NAMES) if (Number.isFinite(steps[name]) && ms >= steps[name]!) phase = name;
    return phase;
  };
  const markList = marks.map((entry) => ({ name: entry.name, ms: round(at(entry.ts)) }));
  const long = tasks
    .filter((task) => task.dur >= 50_000)
    .map((task) => {
      const inside: Span[] = [];
      for (let index = lowerBound(spans, task.ts); index < spans.length; index += 1) {
        const span = spans[index]!;
        if (span.ts >= task.ts + task.dur) break;
        if (span !== task && !TASKS.has(span.name) && span.ts + span.dur <= task.ts + task.dur + 1) inside.push(span);
      }
      const stack: Node[] = [];
      const nodes: Node[] = [];
      let topLevel = 0;
      for (const span of inside) {
        while (stack.length && span.ts >= stack[stack.length - 1]!.ts + stack[stack.length - 1]!.dur) stack.pop();
        const parent = stack[stack.length - 1];
        if (parent) parent.child += Math.min(span.dur, parent.ts + parent.dur - span.ts);
        else topLevel += span.dur;
        const node: Node = { ...span, child: 0, script: scriptOf(span) ?? parent?.script };
        stack.push(node);
        nodes.push(node);
      }
      const buckets: Record<string, number> = { script: 0, style: 0, layout: 0, paint: 0, commit: 0, parse: 0, gc: 0, other: 0 };
      const scripts = new Map<string, number>();
      const others = new Map<string, number>();
      for (const node of nodes) {
        const self = Math.max(0, node.dur - node.child);
        const kind = bucket(node.name);
        buckets[kind] = (buckets[kind] ?? 0) + self;
        if (kind === 'script' && node.script) scripts.set(node.script, (scripts.get(node.script) ?? 0) + self);
        if (kind === 'other' || kind === 'commit') others.set(node.name, (others.get(node.name) ?? 0) + self);
      }
      buckets.other = (buckets.other ?? 0) + Math.max(0, task.dur - topLevel);
      const start = at(task.ts);
      return {
        start: round(start),
        ms: round(task.dur / 1000),
        phase: phaseOf(start),
        marks: markList
          .filter((entry) => entry.ms >= start - 1 && entry.ms <= start + task.dur / 1000 + 1)
          .map((entry) => entry.name),
        buckets: Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, round(value / 1000)])),
        scripts: [...scripts]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([key, value]) => `${key} ${round(value / 1000)}`),
        others: [...others]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([key, value]) => `${key} ${round(value / 1000)}`),
      };
    });
  return { main, threadName: threadNames.get(main), long, marks: markList };
}

function frameStats(frames: number[], long: { start: number; ms: number }[]) {
  const intervals = frames.slice(1).map((time, index) => ({ from: frames[index]!, ms: time - frames[index]! }));
  const sorted = intervals.map((entry) => entry.ms).sort((a, b) => a - b);
  const percentile = (p: number) =>
    sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]! : NaN;
  return {
    count: sorted.length,
    p50: round(percentile(0.5)),
    p95: round(percentile(0.95)),
    p99: round(percentile(0.99)),
    max: round(sorted[sorted.length - 1] ?? NaN),
    over100: sorted.filter((ms) => ms > 100).length,
    over400: sorted.filter((ms) => ms > 400).length,
    slow: intervals
      .filter((entry) => entry.ms > 100)
      .map((entry) => ({
        from: round(entry.from),
        ms: round(entry.ms),
        tasks: long
          .filter((task) => task.start < entry.from + entry.ms && task.start + task.ms > entry.from)
          .map((task) => `${task.start}+${task.ms}`),
      })),
  };
}

test('low-end visit trace in Chromium 106 with GPU raster (diagnostic)', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'One project is enough.');
  test.setTimeout(600_000);
  const baseURL = String(testInfo.project.use.baseURL ?? 'http://127.0.0.1:4187');
  const executable = await chromium106();
  const browser = await launch(executable);
  const info = await browser.cdp.send('SystemInfo.getInfo').catch((error) => ({ error: String(error) }));
  const gpuStatus = { featureStatus: info.gpu?.featureStatus, devices: info.gpu?.devices?.map((device: any) => device.deviceString), error: info.error };
  console.log(`== GPU ${JSON.stringify(gpuStatus)}`);
  const label = `g106-repeat${testInfo.repeatEachIndex}`;
  let visited: Awaited<ReturnType<typeof visit>>;
  try {
    visited = await visit(browser.cdp, baseURL);
  } finally {
    await browser.close();
  }
  const { result, extra, failure, trace } = visited;
  if (trace) writeFileSync(testInfo.outputPath(`trace-${label}.json.gz`), gzipSync(trace));
  const steps = (result.steps ?? {}) as Record<string, number>;
  const summary: Record<string, unknown> = {
    label,
    browser: browser.product,
    gpu: gpuStatus,
    failure: failure ? String(failure instanceof Error ? failure.stack : failure) : undefined,
    steps,
    scrollHome: result.scrollHome,
    discover: result.discover,
    the100: result.the100,
    detail: result.detail,
    home: result.home,
    fcp: result.fcp,
    commit: result.commit,
    longTaskList: result.longTaskList,
  };
  try {
    if (!trace) throw new Error('No trace.');
    const parsed = JSON.parse(trace.toString('utf8')) as TraceEvent[] | { traceEvents: TraceEvent[] };
    const events = Array.isArray(parsed) ? parsed : parsed.traceEvents;
    const analysis = analyze(events, steps);
    const frames = (extra?.frames ?? []).filter((time) => time >= (steps.scrollHome ?? 0));
    const scrollFrames = frameStats(frames, analysis.long);
    summary.analysis = analysis;
    summary.scrollFrames = scrollFrames;
    summary.pageMarks = extra?.marks ?? [];
    const lines = [
      `== ${label} ${browser.product} main ${analysis.main}; steps ${JSON.stringify(steps)}`,
      `   scrollHome ${JSON.stringify(result.scrollHome)}; rAF ${JSON.stringify({ ...scrollFrames, slow: undefined })}`,
      ...analysis.long.map(
        (task) =>
          `   ${String(task.start).padStart(6)} +${String(task.ms).padStart(4)} ${task.phase.padEnd(14)} ${JSON.stringify(task.buckets)} ` +
          `| ${task.marks.filter((name) => !name.startsWith('p100x:nodes') && !name.startsWith('p100x:images')).join(' ')} ` +
          `| ${task.scripts.join('; ')} | ${task.others.join('; ')}`,
      ),
      `   slow frames: ${JSON.stringify(scrollFrames.slow)}`,
      `   page marks: ${JSON.stringify((extra?.marks ?? []).filter(([, name]) => !/nodes|images/.test(name)))}`,
    ];
    console.log(lines.join('\n'));
  } catch (cause) {
    summary.analysisError = String(cause instanceof Error ? cause.stack : cause);
    console.log(`== ${label} analysis failed: ${String(summary.analysisError)}`);
  }
  writeFileSync(testInfo.outputPath(`attribution-${label}.json`), JSON.stringify(summary, null, 1));
  if (failure) throw failure;
});
