// Diagnostic only, never integrated: records a Chromium trace of the low-end visit (scripts/low-end-profile.ts, the
// Test Lab harness's visit on a 6x-throttled 412x785 phone with deviceMemory 2 and failing probes) and attributes each
// main-thread task of 50 ms or more by what it ran (script, style, layout, paint, parse, GC) and by what the page
// changed during it (p100x: marks). Prints a summary and writes attribution.json and the gzipped trace.
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { test } from '@playwright/test';
import { DRIVER, PHONE, SLOW_4G, initScript } from '../scripts/low-end-profile';

const CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'v8.execute',
  'blink.user_timing',
  'toplevel',
  'loading',
];

// Marks each change in the counts of the landing's parts, so a task can be tied to the commit it made, and records
// every animation frame's timestamp while the home page scrolls.
const MARKS = `(() => {
  const live = {
    cards: document.getElementsByClassName('game-card'),
    reserves: document.getElementsByClassName('game-card-reserve'),
    still: document.getElementsByClassName('artifact-still'),
    filmsSection: document.getElementsByClassName('collection-films'),
    posters: document.getElementsByClassName('film-poster'),
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
  if (/(Commit|BeginMainFrame|ScheduledActionCommit)/.test(name)) return 'commit';
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

function analyze(events: TraceEvent[], steps: Record<string, number>, harnessTasks: [number, number][]) {
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
  // performance.now() 0 on the trace's clock, from the driver's first step mark.
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
        if (kind === 'other') others.set(node.name, (others.get(node.name) ?? 0) + self);
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
          .slice(0, 3)
          .map(([key, value]) => `${key} ${round(value / 1000)}`),
      };
    });
  return { main, threadName: threadNames.get(main), long, marks: markList, harnessTasks };
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

test('low-end visit trace (diagnostic)', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'One project is enough.');
  test.setTimeout(480_000);
  const baseURL = String(testInfo.project.use.baseURL ?? 'http://127.0.0.1:4187');
  const context = await browser.newContext({
    viewport: PHONE.viewport,
    deviceScaleFactor: PHONE.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    userAgent: PHONE.userAgent,
    serviceWorkers: 'allow',
  });
  await context.addInitScript({ content: initScript(true) });
  await context.addInitScript({ content: MARKS });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: PHONE.cpuSlowdown });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
  await browser.startTracing(page, { categories: CATEGORIES });
  let result: Record<string, unknown> = {};
  let failure: unknown;
  let buffer: Buffer | undefined;
  try {
    await page.goto(`${baseURL}/`, { waitUntil: 'load', timeout: 180_000 });
    await page.waitForTimeout(6000);
    result = await page.evaluate<Record<string, unknown>>(DRIVER);
  } catch (cause) {
    failure = cause;
  } finally {
    buffer = await browser.stopTracing();
  }
  const extra = (await page.evaluate('window.__trace').catch(() => null)) as {
    marks: [number, string][];
    frames: number[];
  } | null;
  await context.close();
  const label = `repeat${testInfo.repeatEachIndex}`;
  if (buffer) writeFileSync(testInfo.outputPath(`trace-${label}.json.gz`), gzipSync(buffer));
  const steps = (result.steps ?? {}) as Record<string, number>;
  const summary: Record<string, unknown> = {
    label,
    failure: failure ? String(failure) : undefined,
    steps,
    scrollHome: result.scrollHome,
    discover: result.discover,
    the100: result.the100,
    detail: result.detail,
    home: result.home,
    fcp: result.fcp,
    commit: result.commit,
  };
  try {
    if (!buffer) throw new Error('No trace.');
    const events = (JSON.parse(buffer.toString('utf8')) as { traceEvents: TraceEvent[] }).traceEvents;
    const analysis = analyze(events, steps, (result.longTaskList ?? []) as [number, number][]);
    const frames = (extra?.frames ?? []).filter((time) => time >= (steps.scrollHome ?? 0));
    const scrollFrames = frameStats(frames, analysis.long);
    summary.analysis = analysis;
    summary.scrollFrames = scrollFrames;
    summary.pageMarks = extra?.marks ?? [];
    const lines = [
      `== ${label} main ${analysis.main} (${String(analysis.threadName)}); steps ${JSON.stringify(steps)}`,
      `   scrollHome ${JSON.stringify(result.scrollHome)}; rAF ${JSON.stringify({ ...scrollFrames, slow: undefined })}`,
      ...analysis.long.map(
        (task) =>
          `   ${String(task.start).padStart(6)} +${String(task.ms).padStart(4)} ${task.phase.padEnd(14)} ${JSON.stringify(task.buckets)} ` +
          `| ${task.marks.filter((name) => !name.startsWith('p100x:nodes') && !name.startsWith('p100x:images')).join(' ')} ` +
          `| ${task.scripts.join('; ')} | ${task.others.join('; ')}`,
      ),
      `   slow frames: ${JSON.stringify(scrollFrames.slow)}`,
    ];
    console.log(lines.join('\n'));
  } catch (cause) {
    summary.analysisError = String(cause instanceof Error ? cause.stack : cause);
    console.log(`== ${label} analysis failed: ${String(summary.analysisError)}`);
  }
  writeFileSync(testInfo.outputPath(`attribution-${label}.json`), JSON.stringify(summary, null, 1));
  if (failure) throw failure;
});
