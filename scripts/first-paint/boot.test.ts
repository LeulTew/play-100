import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { minifyBootScript } from './plugin.ts';
import { NOTICE_OPEN, bootNotice, shellMarkup } from './shell-html.ts';

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const bootScript = minifyBootScript(read('src/first-paint/boot.js'));
const indexHtml = read('index.html');
const HINT_KEY = 'play100.motion-hint.v1:guest';
/** The failure notice's watchdog, from the loader's start. */
const WATCHDOG = 60000;
const ACCEPTED_PROBES: Readonly<Record<string, { width: number; height: number }>> = {
  'p100-probe-display': { width: 609, height: 120 },
  'p100-probe-sans': { width: 932, height: 130 },
  'p100-probe-sans-bold': { width: 1303, height: 130 },
};

type TagSpec = readonly [tagName: string, attributes: Readonly<Record<string, string>>];

// The startup tags as the build moves them into <template id="p100-deferred"> (scripts/first-paint/plugin.ts).
const TEMPLATE: readonly TagSpec[] = [
  ['SCRIPT', { type: 'module', crossorigin: '', src: '/assets/index-A.js' }],
  ['LINK', { rel: 'modulepreload', crossorigin: '', href: '/assets/vendor-C.js' }],
  ['LINK', { rel: 'stylesheet', crossorigin: '', href: '/assets/index-B.css' }],
  [
    'LINK',
    { rel: 'preload', href: '/assets/barlow-800.woff2', as: 'font', type: 'font/woff2', crossorigin: 'anonymous' },
  ],
  [
    'LINK',
    { rel: 'preload', href: '/data/collection.json', as: 'fetch', type: 'application/json', crossorigin: 'anonymous' },
  ],
];
// What start() appends to <head>, in order, and the module script it appends once the stylesheets settled and the document is parsed.
const STARTUP = [
  'link rel=modulepreload crossorigin= href=/assets/index-A.js',
  'link rel=modulepreload crossorigin= href=/assets/vendor-C.js',
  'link rel=stylesheet crossorigin= href=/assets/index-B.css',
  'link rel=preload href=/assets/barlow-800.woff2 as=font type=font/woff2 crossorigin=anonymous',
  'link rel=preload href=/data/collection.json as=fetch type=application/json crossorigin=anonymous',
];
const ENTRY = 'script type=module crossorigin= src=/assets/index-A.js';

interface BootEnvironment {
  url?: string;
  hint?: string | null;
  storageThrows?: boolean;
  reducedMotion?: boolean;
  coarsePointer?: boolean;
  navigator?: Record<string, unknown>;
  probes?: Readonly<Record<string, { width: number; height: number }>>;
  measureThrows?: boolean;
  template?: readonly TagSpec[];
  readyState?: 'loading' | 'interactive' | 'complete';
  visibilityState?: 'visible' | 'hidden';
  prerendering?: boolean;
  observer?: 'supported' | 'missing' | 'constructor throws' | 'observe throws';
  /** Whether #root holds the failure notice, as the shipped index.html does until React's first commit. */
  notice?: boolean;
  /** The probe boxes in the web fonts (.p100-probe-web), once they have loaded. */
  webProbes?: Readonly<Record<string, { width: number; height: number }>>;
  /** Gives the document document.fonts, whose loads the test settles with fontsLoaded(). */
  fonts?: boolean;
  /** What document.fonts.check() reports once the loads have settled: by default whether they loaded. */
  fontsChecked?: boolean;
  /** Object.hasOwn is missing, as in engines below Chromium 93. */
  withoutHasOwn?: boolean;
}

interface FakeSpan {
  className: string;
  textContent: string;
  getBoundingClientRect(): { width: number; height: number };
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly listeners: { type: string; listener: () => void }[] = [];

  constructor(
    readonly tagName: string,
    attributes: Readonly<Record<string, string>> = {},
  ) {
    for (const [name, value] of Object.entries(attributes)) this.attributes.set(name, value);
  }

  setAttribute(name: string, value: unknown) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name: string) {
    return this.attributes.has(name);
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.push({ type, listener });
  }
  dispatch(type: 'load' | 'error' | 'click') {
    for (const entry of this.listeners.filter((item) => item.type === type)) entry.listener();
  }
  describe() {
    return [this.tagName.toLowerCase(), ...[...this.attributes].map(([name, value]) => `${name}=${value}`)].join(' ');
  }
}

interface FakeObserver {
  readonly options: unknown[];
  disconnected: boolean;
  deliver(...names: string[]): void;
}

/** Runs the shipped boot script against a minimal window/document and exposes what it did. */
function run(environment: BootEnvironment = {}) {
  const attributes: Record<string, string> = {};
  const probes = environment.probes ?? ACCEPTED_PROBES;
  const children: unknown[] = [];
  const appended: FakeElement[] = [];
  const timers: { id: number; callback: () => void; delay: number }[] = [];
  const cleared: number[] = [];
  let lastTimer = 0;
  const observers: FakeObserver[] = [];
  const listeners: { type: string; listener: () => void }[] = [];
  const template = (environment.template ?? TEMPLATE).map(([tagName, values]) => new FakeElement(tagName, values));
  const root = {
    setAttribute: (name: string, value: string) => {
      attributes[name] = value;
    },
    hasAttribute: (name: string) => Object.hasOwn(attributes, name),
    appendChild: (child: unknown) => {
      children.push(child);
      return child;
    },
    removeChild: (child: unknown) => {
      children.splice(children.indexOf(child), 1);
    },
  };
  // #root holds the shell, then the failure notice with its Reload button (index.html).
  const reload = new FakeElement('BUTTON', { type: 'button' });
  // Its first alert is the generic copy, its second the outdated-browser copy with one paragraph per platform.
  const alerts = [{ hidden: false }, { hidden: true }];
  const copies = ['android', 'ios', 'other'].map((os) => ({ os, hidden: false, getAttribute: () => os }));
  const notice = {
    hidden: true,
    querySelector: (selector: string) => (selector === 'button' ? reload : null),
    querySelectorAll: (selector: string): unknown[] =>
      selector === '[role=alert]' ? alerts : selector === '[data-os]' ? copies : [],
  };
  const errorListeners: ((event: unknown) => void)[] = [];
  const frames: (() => void)[] = [];
  const fontLoads: string[] = [];
  const fontChecks: string[] = [];
  let fontsInUse = false;
  let settleFonts: (loaded: boolean) => void = () => undefined;
  const fontsReady = new Promise<void>((resolve, reject) => {
    settleFonts = (loaded) => {
      fontsInUse = environment.fontsChecked ?? loaded;
      if (loaded) resolve();
      else reject(new Error('A font failed to load.'));
    };
  });
  fontsReady.catch(() => undefined);
  const fonts = {
    check: (font: string) => {
      fontChecks.push(font);
      return fontsInUse;
    },
    load: (font: string) => {
      fontLoads.push(font);
      return fontsReady;
    },
  };
  let shellRemoved = false;
  let reloads = 0;
  const shell = {
    parentNode: {
      removeChild: (child: unknown) => {
        expect(child, 'the loader removes the shell from #root').toBe(shell);
        shellRemoved = true;
      },
    },
  };
  const document = {
    documentElement: root,
    fonts: environment.fonts ? fonts : undefined,
    // An inline <head> script runs while the document is still being parsed.
    readyState: environment.readyState ?? 'loading',
    visibilityState: environment.visibilityState ?? 'visible',
    prerendering: environment.prerendering,
    head: {
      appendChild: (node: FakeElement) => {
        appended.push(node);
        return node;
      },
    },
    addEventListener: (type: string, listener: () => void) => {
      listeners.push({ type, listener });
    },
    getElementById: (id: string): unknown => {
      if (id === 'p100-deferred') return { content: { children: template } };
      // The parser reaches #root, and the notice in it, only after <head>, where the loader starts.
      return id === 'p100-boot-error' && environment.notice !== false && document.readyState !== 'loading'
        ? notice
        : null;
    },
    querySelector: (selector: string) => (selector === '.first-paint-shell' && !shellRemoved ? shell : null),
    importNode: (node: FakeElement, deep: boolean) => {
      expect(deep).toBe(true);
      return new FakeElement(node.tagName, Object.fromEntries(node.attributes));
    },
    createElement: (name: string): FakeSpan | FakeElement => {
      if (name !== 'span') return new FakeElement(name.toUpperCase());
      const span: FakeSpan = {
        className: '',
        textContent: '',
        getBoundingClientRect: () => {
          if (environment.measureThrows) throw new Error('Layout is unavailable.');
          const [, name = '', web] = span.className.split(' ');
          const size = (web === 'p100-probe-web' ? (environment.webProbes ?? ACCEPTED_PROBES) : probes)[name];
          if (!size) throw new Error(`Unexpected probe ${span.className}.`);
          return size;
        },
      };
      return span;
    },
  };
  const mode = environment.observer ?? 'supported';
  class PerformanceObserver implements FakeObserver {
    readonly options: unknown[] = [];
    disconnected = false;
    constructor(private readonly callback: (list: { getEntriesByName(name: string): { name: string }[] }) => void) {
      if (mode === 'constructor throws') throw new TypeError('Unsupported.');
      observers.push(this);
    }
    observe(options: unknown) {
      if (mode === 'observe throws') throw new TypeError('Unsupported entry type.');
      this.options.push(options);
    }
    disconnect() {
      this.disconnected = true;
    }
    deliver(...names: string[]) {
      this.callback({
        getEntriesByName: (name) => names.filter((entry) => entry === name).map((entry) => ({ name: entry })),
      });
    }
  }
  const window = {
    location: Object.assign(new URL(environment.url ?? 'https://play-100.test/'), {
      reload: () => {
        reloads += 1;
      },
    }),
    URLSearchParams,
    navigator: environment.navigator ?? {},
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      if (type === 'error') errorListeners.push(listener);
    },
    requestAnimationFrame: (callback: () => void) => frames.push(callback),
    localStorage: {
      getItem: (key: string) => {
        if (environment.storageThrows) throw new Error('Storage is blocked.');
        return key === HINT_KEY ? (environment.hint ?? null) : null;
      },
    },
    matchMedia: (query: string) => ({
      matches:
        (query === '(prefers-reduced-motion: reduce)' && Boolean(environment.reducedMotion)) ||
        (query === '(pointer: coarse)' && Boolean(environment.coarsePointer)),
    }),
    PerformanceObserver: mode === 'missing' ? undefined : PerformanceObserver,
    setTimeout: (callback: () => void, delay: number) => {
      lastTimer += 1;
      timers.push({ id: lastTimer, callback, delay });
      return lastTimer;
    },
    clearTimeout: (id: number) => {
      cleared.push(id);
      const index = timers.findIndex((timer) => timer.id === id);
      if (index !== -1) timers.splice(index, 1);
    },
  };
  const hasOwn = Object.hasOwn;
  if (environment.withoutHasOwn) Reflect.deleteProperty(Object, 'hasOwn');
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the test runs the built classic script text itself.
    new Function('window', 'document', bootScript)(window, document);
  } finally {
    Object.hasOwn = hasOwn;
  }
  if (!environment.measureThrows) expect(children, 'the probes are removed again').toEqual([]);
  const stylesheets = () => appended.filter((node) => node.getAttribute('rel') === 'stylesheet');
  return {
    attributes,
    template,
    appended,
    observers,
    timers,
    cleared,
    notice,
    reload,
    alerts,
    copies,
    fontLoads,
    fontChecks,
    /** The web font loads settle, and the boot script's callbacks run. */
    fontsLoaded: async (loaded = true) => {
      settleFonts(loaded);
      await new Promise((resolve) => setTimeout(resolve));
    },
    /** The next frame renders: its callbacks run. */
    frame: () => {
      for (const callback of frames.splice(0)) callback();
    },
    /** The window reports an uncaught error in a script, by default the entry, as engines do for one they cannot parse. */
    uncaught: (
      error: unknown,
      filename = 'https://play-100.test/assets/index-A.js',
      message = `Uncaught ${String(error)}`,
    ) => {
      for (const listener of errorListeners) listener({ error, filename, message });
    },
    reloads: () => reloads,
    shellRemoved: () => shellRemoved,
    /** src/main.tsx ran to its end, which marks <html> before React's first commit. */
    appStarted: () => {
      attributes['data-app-started'] = '';
    },
    /** The module entry, which the loader adds once the stylesheets settled and the document is parsed. */
    entry: () => appended.find((node) => node.tagName === 'SCRIPT'),
    modulepreload: (href: string) =>
      appended.find((node) => node.getAttribute('rel') === 'modulepreload' && node.getAttribute('href') === href),
    inserted: () => appended.map((node) => node.describe()),
    paint: (...names: string[]) => {
      for (const observer of observers) observer.deliver(...names);
    },
    /** The parser reaches the end of the document: DOMContentLoaded fires once. */
    parsed: () => {
      if (document.readyState !== 'loading') return;
      document.readyState = 'interactive';
      for (const entry of listeners.filter((item) => item.type === 'DOMContentLoaded')) entry.listener();
    },
    runTimers: () => {
      for (const timer of timers.splice(0)) timer.callback();
    },
    settle: (event: 'load' | 'error' = 'load') => {
      for (const sheet of stylesheets()) sheet.dispatch(event);
    },
    /** Vite's preload helper for a lazy chunk's stylesheet: nothing if the document links it already, else a link appended to <head>. */
    chunkStylesheet: (href: string) => {
      if (stylesheets().some((sheet) => sheet.getAttribute('href') === href)) return;
      document.head.appendChild(new FakeElement('LINK', { rel: 'stylesheet', crossorigin: '', href }));
    },
  };
}

/** The <html> attributes the boot script set. */
function boot(environment: BootEnvironment = {}): Record<string, string> {
  return run(environment).attributes;
}

/** Fires every trigger the loader could have registered, then lets the stylesheets load. */
function everything(result: ReturnType<typeof run>): string[] {
  result.paint('first-paint', 'first-contentful-paint');
  result.parsed();
  result.runTimers();
  result.paint('first-contentful-paint');
  result.settle('load');
  result.settle('error');
  return result.inserted();
}

describe('first-paint boot gate', () => {
  it('accepts the landing page and names the artifact caption of the first commit', () => {
    expect(boot()).toEqual({ 'data-boot-art': 'pending', 'data-boot': 'landing' });
  });

  it.each([
    ['https://play-100.test/discover', 'another route'],
    ['https://play-100.test/my-games?tab=ranking', 'another route'],
    ['https://play-100.test/?view=table', 'the table view, which hides the hero'],
    ['https://play-100.test/?game=red-dead-redemption-2', 'a game dialog'],
    ['https://play-100.test/?catalogs=off', 'different navigation links'],
  ])('keeps the shell hidden for %s (%s)', (url) => {
    expect(boot({ url })).toEqual({});
  });

  it.each([
    'https://play-100.test/?view=list',
    'https://play-100.test/?q=mass&genre=RPG',
    'https://play-100.test/?info=credits',
    'https://play-100.test/?info=settings',
    'https://play-100.test/?game=',
  ])('accepts landing URLs whose first commit is unchanged: %s', (url) => {
    expect(boot({ url })['data-boot']).toBe('landing');
  });

  it.each([
    // Without a valid stored hint, React's first commit has no visual preference to name (its provisional 'lite').
    [{}, 'pending'],
    [{ hint: '"full"' }, 'pending'],
    [{ hint: 'LITE' }, 'pending'],
    [{ hint: 'full', storageThrows: true }, 'pending'],
    [{ coarsePointer: true, navigator: { deviceMemory: 2 } }, 'pending'],
    [{ reducedMotion: true }, 'reduced'],
    [{ hint: 'lite' }, 'lite'],
    [{ hint: 'lite', coarsePointer: true }, 'lite'],
    [{ hint: 'full' }, 'ready'],
    [{ hint: 'full', coarsePointer: true }, 'ready'],
    [{ hint: 'auto' }, 'ready'],
    [{ hint: 'auto', coarsePointer: true }, 'tap'],
    [{ hint: 'auto', navigator: { connection: { saveData: true } } }, 'saving'],
    [{ hint: 'auto', navigator: { connection: { effectiveType: '2g' } } }, 'saving'],
    [{ hint: 'auto', navigator: { deviceMemory: 4 } }, 'saving'],
    [{ hint: 'auto', navigator: { hardwareConcurrency: 2 } }, 'saving'],
    [{ hint: 'auto', navigator: { deviceMemory: 8, hardwareConcurrency: 8 } }, 'ready'],
    [{ hint: 'full', navigator: { deviceMemory: 2 } }, 'ready'],
    [{ hint: 'full', reducedMotion: true }, 'reduced'],
    [{ hint: 'auto', coarsePointer: true, reducedMotion: true }, 'reduced'],
  ] as const)('matches CollectionArtifact for %j', (environment, art) => {
    expect(boot(environment)).toEqual({ 'data-boot-art': art, 'data-boot': 'landing' });
  });

  it.each([
    ['display width', { ...ACCEPTED_PROBES, 'p100-probe-display': { width: 700, height: 120 } }],
    ['display width above the range', { ...ACCEPTED_PROBES, 'p100-probe-display': { width: 617.5, height: 120 } }],
    ['display width below the range', { ...ACCEPTED_PROBES, 'p100-probe-display': { width: 601.5, height: 120 } }],
    ['sans width above the range', { ...ACCEPTED_PROBES, 'p100-probe-sans': { width: 942, height: 130 } }],
    ['sans width', { ...ACCEPTED_PROBES, 'p100-probe-sans': { width: 900, height: 130 } }],
    ['bold height', { ...ACCEPTED_PROBES, 'p100-probe-sans-bold': { width: 1303, height: 133 } }],
    // A Roboto variable font rendered at its default instance (engines that do not apply the face's
    // weight to a local() font) measures 1287.7 for the bold probe string.
    ['bold Roboto without wght', { ...ACCEPTED_PROBES, 'p100-probe-sans-bold': { width: 1287.7, height: 130 } }],
    ['bold width above the range', { ...ACCEPTED_PROBES, 'p100-probe-sans-bold': { width: 1320, height: 130 } }],
  ])('keeps the shell hidden when the fallback faces do not measure right (%s)', (_, probes) => {
    expect(boot({ probes })).toEqual({});
  });

  // Boxes of the Roboto faces measured in Chromium: the Android 11 static files and the Android 12+
  // variable font (shell.css), the latter as rendered at 2.625 and 1.75 device pixel ratios.
  it.each([
    [
      'static',
      {
        'p100-probe-display': { width: 608.05, height: 120 },
        'p100-probe-sans': { width: 934.12, height: 130 },
        'p100-probe-sans-bold': { width: 1300.83, height: 130 },
      },
    ],
    [
      'variable',
      {
        'p100-probe-display': { width: 613.33, height: 120 },
        'p100-probe-sans': { width: 934.86, height: 130.3 },
        'p100-probe-sans-bold': { width: 1301.33, height: 130.3 },
      },
    ],
    [
      'variable, snapped',
      {
        'p100-probe-display': { width: 612.57, height: 120 },
        'p100-probe-sans': { width: 933.71, height: 130.3 },
        'p100-probe-sans-bold': { width: 1293.71, height: 130.3 },
      },
    ],
  ])('shows the shell with the Roboto fallback faces (%s)', (_, probes) => {
    expect(boot({ probes })).toEqual({ 'data-boot-art': 'pending', 'data-boot': 'landing' });
  });

  // Chromium on Linux (ubuntu-latest, no Impact) lays glyphs out on whole CSS pixels at any device pixel ratio,
  // so Liberation Sans Bold measures the display string at 616.00, above the ±1% the other faces keep.
  it.each([
    [
      'Liberation, as measured on Linux CI',
      {
        'p100-probe-display': { width: 616, height: 120 },
        'p100-probe-sans': { width: 931, height: 130 },
        'p100-probe-sans-bold': { width: 1306, height: 130 },
      },
    ],
    [
      'the lower whole-pixel bound',
      { ...ACCEPTED_PROBES, 'p100-probe-display': { width: 602.6, height: 120 } },
    ],
    ['the upper whole-pixel bound', { ...ACCEPTED_PROBES, 'p100-probe-display': { width: 616.6, height: 120 } }],
  ])('shows the shell with the Arial faces laid out on whole pixels (%s)', (_, probes) => {
    expect(boot({ probes })).toEqual({ 'data-boot-art': 'pending', 'data-boot': 'landing' });
  });

  it('fails closed on any error', () => {
    expect(boot({ measureThrows: true })).toEqual({});
  });
});

describe('first-paint app loader', () => {
  it("waits for the shell's first contentful paint, then inserts every startup tag once", () => {
    const result = run();
    expect(result.attributes['data-boot']).toBe('landing');
    expect(result.inserted(), 'nothing starts before the shell has painted').toEqual([]);
    expect(result.observers).toHaveLength(1);
    expect(result.observers[0]?.options).toEqual([{ type: 'paint', buffered: true }]);
    expect(result.timers, 'the safety net waits for the parsed document').toEqual([]);
    result.paint('first-paint');
    expect(result.inserted(), 'a first paint without content is not enough').toEqual([]);
    result.paint('first-contentful-paint');
    expect(result.inserted()).toEqual(STARTUP);
    expect(result.observers[0]?.disconnected).toBe(true);
    expect(
      result.appended.filter((node) => result.template.includes(node)),
      'the template keeps its own inert nodes',
    ).toEqual([]);
    result.settle('load');
    expect(result.inserted(), 'the module entry also waits for the parsed document').toEqual(STARTUP);
    result.parsed();
    expect(result.inserted()).toEqual([...STARTUP, ENTRY]);
    expect(
      result.timers.map((timer) => timer.delay),
      "the failure notice's watchdog runs from the start, and a safety net starts the app a second after parsing",
    ).toEqual([WATCHDOG, 1000]);
    result.runTimers();
    result.paint('first-contentful-paint');
    result.settle('error');
    result.settle('load');
    result.parsed();
    expect(result.inserted(), 'later triggers insert nothing again, and the module entry exactly once').toEqual([
      ...STARTUP,
      ENTRY,
    ]);
  });

  it('starts at once where it keeps the shell hidden, and runs the entry once the stylesheet loaded and the document is parsed', () => {
    for (const url of [
      'https://play-100.test/discover',
      'https://play-100.test/?catalogs=off',
      'https://play-100.test/?view=table',
    ]) {
      const result = run({ url });
      expect(result.attributes).toEqual({});
      expect(result.inserted(), url).toEqual(STARTUP);
      expect(result.observers, url).toEqual([]);
      result.settle('load');
      expect(result.inserted(), `${url}: #root may not exist before the document is parsed`).toEqual(STARTUP);
      result.parsed();
      expect(result.inserted(), url).toEqual([...STARTUP, ENTRY]);
      expect(
        result.timers.map((timer) => timer.delay),
        `${url}: the watchdog`,
      ).toEqual([WATCHDOG]);
    }
  });

  it('leaves the collection preload out of the Data use page, which reads no collection data', () => {
    const withoutData = STARTUP.filter((tag) => !tag.includes('as=fetch'));
    expect(withoutData).toHaveLength(STARTUP.length - 1);
    for (const url of ['https://play-100.test/data-use', 'https://play-100.test/data-use/']) {
      const result = run({ url });
      expect(result.attributes, url).toEqual({});
      expect(result.inserted(), url).toEqual(withoutData);
      result.settle('load');
      result.parsed();
      expect(result.inserted(), `${url}: the app still starts`).toEqual([...withoutData, ENTRY]);
    }
    expect(run({ url: 'https://play-100.test/data-use-later' }).inserted()).toEqual(STARTUP);
  });

  it('runs the module entry only after both the stylesheet and the parsed document, whichever comes last', () => {
    const parsedLast = run({ url: 'https://play-100.test/discover' });
    parsedLast.settle('load');
    expect(parsedLast.inserted()).toEqual(STARTUP);
    parsedLast.parsed();
    expect(parsedLast.inserted()).toEqual([...STARTUP, ENTRY]);
    const stylesheetLast = run({ url: 'https://play-100.test/discover' });
    stylesheetLast.parsed();
    expect(stylesheetLast.inserted()).toEqual(STARTUP);
    stylesheetLast.settle('load');
    expect(stylesheetLast.inserted()).toEqual([...STARTUP, ENTRY]);
    const alreadyParsed = run({ url: 'https://play-100.test/discover', readyState: 'interactive' });
    alreadyParsed.settle('load');
    expect(alreadyParsed.inserted()).toEqual([...STARTUP, ENTRY]);
  });

  it('waits for every stylesheet before it runs the module entry', () => {
    const result = run({
      url: 'https://play-100.test/discover',
      template: [...TEMPLATE, ['LINK', { rel: 'stylesheet', crossorigin: '', href: '/assets/extra-D.css' }]],
    });
    result.parsed();
    const [first, second] = result.appended.filter((node) => node.getAttribute('rel') === 'stylesheet');
    first?.dispatch('load');
    expect(result.inserted().at(-1)).toBe('link rel=stylesheet crossorigin= href=/assets/extra-D.css');
    second?.dispatch('load');
    expect(result.inserted().at(-1)).toBe(ENTRY);
    expect(result.inserted().filter((tag) => tag === ENTRY)).toHaveLength(1);
  });

  it("copies the entry's crossorigin setting only when it has one", () => {
    const result = run({
      url: 'https://play-100.test/discover',
      template: [['SCRIPT', { type: 'module', src: '/assets/index-A.js' }], ...TEMPLATE.slice(1)],
    });
    result.parsed();
    result.settle('load');
    expect(result.inserted()[0]).toBe('link rel=modulepreload href=/assets/index-A.js');
    expect(result.inserted().at(-1)).toBe('script type=module src=/assets/index-A.js');
  });

  it.each([
    ['a hidden document', { visibilityState: 'hidden' }],
    ['a prerendering document', { prerendering: true }],
  ] as const)('starts at once for %s, which does not paint yet', (_, environment) => {
    const result = run(environment);
    expect(result.attributes['data-boot']).toBe('landing');
    expect(result.inserted()).toEqual(STARTUP);
    expect(result.observers).toEqual([]);
    expect(everything(result)).toEqual([...STARTUP, ENTRY]);
  });

  it.each([
    ['the boot gate throws', { measureThrows: true }, {}],
    ['PerformanceObserver is missing', { observer: 'missing' }, { 'data-boot-art': 'pending', 'data-boot': 'landing' }],
    [
      'the paint observer cannot be created',
      { observer: 'constructor throws' },
      { 'data-boot-art': 'pending', 'data-boot': 'landing' },
    ],
    [
      'the paint observer refuses the paint type',
      { observer: 'observe throws' },
      { 'data-boot-art': 'pending', 'data-boot': 'landing' },
    ],
  ] as const)('starts at once, exactly once, when %s', (_, environment, attributes) => {
    const result = run(environment);
    expect(result.attributes).toEqual(attributes);
    expect(result.inserted()).toEqual(STARTUP);
    expect(everything(result)).toEqual([...STARTUP, ENTRY]);
  });

  it("starts a second after parsing when the shell's first contentful paint is never reported", () => {
    const result = run();
    result.paint('first-paint');
    result.parsed();
    expect(result.inserted(), 'parsing alone does not start the app').toEqual([]);
    expect(result.timers.map((timer) => timer.delay)).toEqual([1000]);
    result.runTimers();
    expect(result.inserted()).toEqual(STARTUP);
    expect(everything(result)).toEqual([...STARTUP, ENTRY]);
  });

  it('keeps the entry stylesheet in <head> ahead of every stylesheet a lazy chunk adds, however the app starts', () => {
    // Only code the module entry runs can import a lazy chunk, and Vite's preload helper then appends the
    // chunk's stylesheets to <head>. So they follow the entry stylesheet as long as the loader links it in
    // <head> before it adds the module entry, whichever way the app starts.
    const entryStylesheet = 'link rel=stylesheet crossorigin= href=/assets/index-B.css';
    const chunkStylesheet = 'link rel=stylesheet crossorigin= href=/assets/MyGamesPage-D.css';
    expect(STARTUP).toContain(entryStylesheet);
    const starts: readonly (readonly [string, BootEnvironment, (result: ReturnType<typeof run>) => void])[] = [
      ["at the landing page's first contentful paint", {}, (result) => result.paint('first-contentful-paint')],
      [
        'from the safety net',
        {},
        (result) => {
          result.parsed();
          result.runTimers();
        },
      ],
      ['at once on another route', { url: 'https://play-100.test/my-games' }, () => undefined],
      ['at once in a hidden document', { visibilityState: 'hidden' }, () => undefined],
      ['at once when the boot gate throws', { measureThrows: true }, () => undefined],
    ];
    for (const [when, environment, begin] of starts) {
      const result = run(environment);
      begin(result);
      result.settle('load');
      result.parsed();
      expect(result.inserted(), when).toEqual([...STARTUP, ENTRY]);
      // A chunk imported from another lazy chunk lists the entry stylesheet among its dependencies too.
      result.chunkStylesheet('/assets/index-B.css');
      result.chunkStylesheet('/assets/MyGamesPage-D.css');
      const inserted = result.inserted();
      expect(inserted.indexOf(entryStylesheet), when).toBeLessThan(inserted.indexOf(chunkStylesheet));
      expect(
        inserted.filter((tag) => tag.startsWith('link rel=stylesheet')),
        `${when}: the entry stylesheet is linked once, first`,
      ).toEqual([entryStylesheet, chunkStylesheet]);
    }
  });
});

describe('first-paint failure notice', () => {
  const OTHER_ROUTE = 'https://play-100.test/discover';

  /** Runs the boot script until the loader adds the module entry: the stylesheet loaded, the document parsed. */
  function entered(environment: BootEnvironment = { url: OTHER_ROUTE }) {
    const result = run(environment);
    result.paint('first-contentful-paint');
    result.settle('load');
    result.parsed();
    expect(result.entry(), 'the loader added the module entry').toBeDefined();
    return result;
  }

  it.each([
    ['the landing page', {}],
    ['another route', { url: OTHER_ROUTE }],
  ] as const)('stays hidden through a normal start on %s, which clears its watchdog', (_, environment) => {
    const result = entered(environment);
    const watchdog = result.timers.find((timer) => timer.delay === WATCHDOG);
    expect(watchdog, 'the watchdog runs from the start').toBeDefined();
    result.appStarted();
    result.entry()?.dispatch('load');
    expect(result.cleared).toEqual([watchdog?.id]);
    result.runTimers();
    expect(result.notice.hidden).toBe(true);
    expect(result.shellRemoved()).toBe(false);
    expect(result.reload.listeners, 'the loader wires Reload only when it shows the notice').toEqual([]);
  });

  it('replaces the landing shell when the module entry does not load, and its Reload reloads the page', () => {
    const result = entered({});
    expect(result.notice.hidden).toBe(true);
    result.entry()?.dispatch('error');
    expect(result.notice.hidden).toBe(false);
    expect(result.shellRemoved()).toBe(true);
    expect(result.attributes['data-boot'], 'the shell font stacks stay').toBe('landing');
    expect(result.reloads()).toBe(0);
    result.reload.dispatch('click');
    expect(result.reloads()).toBe(1);
  });

  it.each(['/assets/index-A.js', '/assets/vendor-C.js'])('shows when the modulepreload of %s fails', (href) => {
    const result = run({ url: OTHER_ROUTE });
    const preload = result.modulepreload(href);
    expect(preload).toBeDefined();
    preload?.dispatch('error');
    expect(result.notice.hidden, 'the parser has not reached #root yet').toBe(true);
    result.parsed();
    expect(result.notice.hidden).toBe(false);
    expect(result.shellRemoved()).toBe(true);
  });

  it('shows when the module entry has run without the mark src/main.tsx sets last, because it threw', () => {
    const result = entered();
    result.entry()?.dispatch('load');
    expect(result.notice.hidden).toBe(false);
    expect(result.shellRemoved()).toBe(true);
  });

  it('shows from the watchdog only while the app has not started', () => {
    // The stylesheet never settles, so the module entry never runs.
    const stalled = run({ url: OTHER_ROUTE });
    stalled.parsed();
    expect(stalled.timers.map((timer) => timer.delay)).toEqual([WATCHDOG]);
    stalled.runTimers();
    expect(stalled.notice.hidden).toBe(false);
    // Due before the parser has reached the notice, it shows the notice once the document is parsed.
    const early = run({ url: OTHER_ROUTE });
    early.runTimers();
    expect(early.notice.hidden).toBe(true);
    early.parsed();
    expect(early.notice.hidden).toBe(false);
    // Once src/main.tsx has run, React's first commit follows, however late the start.
    const slow = entered();
    slow.appStarted();
    slow.runTimers();
    expect(slow.notice.hidden).toBe(true);
    expect(slow.shellRemoved()).toBe(false);
  });

  it('shows once, with one Reload listener, however many failures follow', () => {
    const result = entered();
    result.modulepreload('/assets/index-A.js')?.dispatch('error');
    result.modulepreload('/assets/vendor-C.js')?.dispatch('error');
    result.entry()?.dispatch('error');
    result.entry()?.dispatch('load');
    result.runTimers();
    expect(result.notice.hidden).toBe(false);
    expect(result.reload.listeners.map((listener) => listener.type)).toEqual(['click']);
    result.reload.dispatch('click');
    expect(result.reloads()).toBe(1);
  });

  it.each([
    ['on the landing page', {}, true],
    ['on another route', { url: OTHER_ROUTE }, true],
    ['after the document is parsed', { url: OTHER_ROUTE, readyState: 'interactive' }, false],
  ] as const)('shows instead of starting the app when the entry stylesheet fails %s', (_, environment, waits) => {
    const result = run(environment);
    result.paint('first-contentful-paint');
    const stylesheet = result.appended.find((node) => node.getAttribute('rel') === 'stylesheet');
    expect(stylesheet, 'the loader linked the entry stylesheet').toBeDefined();
    stylesheet?.dispatch('error');
    expect(result.notice.hidden, 'a failure before the parser reaches #root waits for it').toBe(waits);
    result.parsed();
    expect(result.notice.hidden).toBe(false);
    expect(result.shellRemoved()).toBe(true);
    result.runTimers();
    expect(result.entry(), 'the app never runs without the entry stylesheet').toBeUndefined();
    expect(result.reload.listeners.map((listener) => listener.type)).toEqual(['click']);
    result.reload.dispatch('click');
    expect(result.reloads()).toBe(1);
  });

  it('stays hidden when only a font or data preload fails, which does not stop the app', () => {
    const result = run({ url: OTHER_ROUTE });
    const preloads = result.appended.filter((node) => node.getAttribute('rel') === 'preload');
    expect(preloads.map((node) => node.getAttribute('as'))).toEqual(['font', 'fetch']);
    for (const node of preloads) node.dispatch('error');
    result.parsed();
    result.settle('load');
    expect(result.inserted(), 'the app starts').toEqual([...STARTUP, ENTRY]);
    expect(result.notice.hidden).toBe(true);
  });

  it('leaves #root alone once it no longer holds the notice', () => {
    const result = entered({ url: OTHER_ROUTE, notice: false });
    result.entry()?.dispatch('error');
    result.runTimers();
    expect(result.shellRemoved()).toBe(false);
  });

  it.each(['offline', 'online'] as const)('waits hidden after the %s shell in #root', (variant) => {
    const notice = bootNotice(shellMarkup(indexHtml, variant));
    expect(NOTICE_OPEN).toContain(' id="p100-boot-error" hidden>');
    expect(bootScript).toMatch(/document\.getElementById\((['"`])p100-boot-error\1\)/);
    expect(bootScript).toMatch(/document\.querySelector\((['"`])\.first-paint-shell\1\)/);
    expect(notice).toContain(`<div role="alert"><h1>The collection couldn't finish loading.</h1><p>`);
    // The outdated-browser copy follows, hidden, with one paragraph per platform for the loader to pick.
    expect(notice).toContain('<div role="alert" hidden><h1>This browser needs an update to open the collection.</h1>');
    expect([...notice.matchAll(/<p data-os="([a-z]+)">/g)].map(([, os]) => os)).toEqual(['android', 'ios', 'other']);
    expect(notice).toContain('Android System WebView');
    expect([...notice.matchAll(/<div role="alert"/g)]).toHaveLength(2);
    // One Reload button for the loader to wire, and the workbook link, which needs no script.
    expect([...notice.matchAll(/<button\b[^>]*>/g)].map(([tag]) => tag)).toEqual([
      '<button type="button" class="button button-dark">',
    ]);
    expect([...notice.matchAll(/<a\b[^>]*>/g)].map(([tag]) => tag)).toEqual([
      '<a href="/downloads/Play-100-Collection.xlsx" download="">',
    ]);
    // The production policy refuses inline event handlers and style attributes.
    expect(notice).not.toMatch(/\s(?:on[a-z]+|style)=/i);
  });

  it('is kept hidden by src/main.tsx, whose last statement marks the app started', () => {
    const mark = "document.documentElement.setAttribute('data-app-started', '');";
    expect(read('src/main.tsx').trimEnd().endsWith(`\n${mark}`)).toBe(true);
    expect(bootScript.match(/hasAttribute\((['"`])data-app-started\1\)/g)).toHaveLength(2);
  });
});

describe('first-paint web-font retry', () => {
  // The Galaxy A03s's local Roboto (Android 13, WebView 106) fails the display and bold probes.
  const FAILING = {
    ...ACCEPTED_PROBES,
    'p100-probe-display': { width: 677.3, height: 120 },
    'p100-probe-sans-bold': { width: 1287.6, height: 130.3 },
  };

  /** Runs the boot script with failing fallback faces until the stylesheet loaded and the document is parsed. */
  function waiting(environment: BootEnvironment = {}) {
    const result = run({ probes: FAILING, fonts: true, ...environment });
    expect(result.attributes, 'the fallback faces fail, so the shell stays hidden').toEqual({});
    expect(result.inserted(), 'the app starts at once').toEqual(STARTUP);
    result.settle('load');
    result.parsed();
    return result;
  }
  /** Runs the timers set for delay, leaving the watchdog. */
  const fire = (result: ReturnType<typeof run>, delay: number | undefined) => {
    for (const timer of result.timers.filter((item) => item.delay === delay)) {
      result.timers.splice(result.timers.indexOf(timer), 1);
      timer.callback();
    }
  };

  it('shows the shell once the web fonts have loaded and measure right, then adds the entry after the next frame', async () => {
    const result = waiting();
    expect(result.fontLoads).toEqual([
      '800 1px "Barlow Condensed"',
      '700 1px "Barlow Condensed"',
      '1px "Hanken Grotesk Variable"',
    ]);
    expect(result.entry(), 'the entry waits for the web fonts').toBeUndefined();
    expect(result.timers.map((timer) => timer.delay)).toEqual([WATCHDOG, 1500]);
    await result.fontsLoaded();
    expect(result.attributes).toEqual({ 'data-boot-art': 'pending', 'data-boot': 'landing' });
    expect(result.entry(), 'the shell paints before the entry runs').toBeUndefined();
    result.frame();
    expect(result.entry()).toBeUndefined();
    fire(result, undefined);
    expect(result.inserted()).toEqual([...STARTUP, ENTRY]);
    expect(
      result.timers.map((timer) => timer.delay),
      'the wait is over',
    ).toEqual([WATCHDOG]);
    expect(result.notice.hidden).toBe(true);
  });

  it('adds the entry when the wait ends, and never shows the shell after that', async () => {
    const result = waiting();
    fire(result, 1500);
    expect(result.inserted()).toEqual([...STARTUP, ENTRY]);
    await result.fontsLoaded();
    result.frame();
    fire(result, undefined);
    expect(result.attributes, 'the app may already have committed').toEqual({});
    expect(result.inserted()).toEqual([...STARTUP, ENTRY]);
  });

  // The Galaxy A03s's web fonts after loading (Test Lab, WebView 106 at DPR 1.75): whole-pixel advances leave the
  // display string 0.5% short of the fallback range and the sans string 0.8% over it.
  const A03S_WEB = {
    'p100-probe-display': { width: 600.6, height: 120 },
    'p100-probe-sans': { width: 948.9, height: 130.3 },
    'p100-probe-sans-bold': { width: 1302.3, height: 130.3 },
  };

  it('accepts the web fonts the Galaxy A03s measures, which the fallback ranges reject', async () => {
    expect(run({ probes: A03S_WEB }).attributes, 'the fallback ranges are strict').toEqual({});
    const result = waiting({ webProbes: A03S_WEB });
    await result.fontsLoaded();
    expect(result.fontChecks).toEqual(result.fontLoads);
    expect(result.attributes).toEqual({ 'data-boot-art': 'pending', 'data-boot': 'landing' });
  });

  it.each([
    ['display', 594.3, true],
    ['display', 594.4, false],
    ['display', 624.8, false],
    ['display', 624.9, true],
    ['sans', 909, true],
    ['sans', 955.8, true],
    ['sans-bold', 1269.5, true],
    ['sans-bold', 1334.8, true],
  ] as const)(
    'holds the web %s width %d to 2.5% of the expected width (rejected: %s)',
    async (probe, width, rejected) => {
      const webProbes = { ...A03S_WEB, [`p100-probe-${probe}`]: { ...A03S_WEB[`p100-probe-${probe}`], width } };
      const result = waiting({ webProbes });
      await result.fontsLoaded();
      expect(result.attributes).toEqual(rejected ? {} : { 'data-boot-art': 'pending', 'data-boot': 'landing' });
    },
  );

  it.each([
    ['the web fonts measure wrong too', { webProbes: FAILING }, true],
    ["the A03s's fallback faces measure in place of the web fonts", { webProbes: FAILING, fontsChecked: true }, true],
    ['the web fonts are not in use', { webProbes: A03S_WEB, fontsChecked: false }, true],
    [
      'a web height is 2 px off',
      { webProbes: { ...A03S_WEB, 'p100-probe-sans': { width: 948.9, height: 132.4 } } },
      true,
    ],
    ['the web fonts fail to load', {}, false],
  ] as const)('keeps the shell hidden and adds the entry at once when %s', async (_, environment, loaded) => {
    const result = waiting(environment);
    await result.fontsLoaded(loaded);
    expect(result.attributes).toEqual({});
    expect(result.inserted()).toEqual([...STARTUP, ENTRY]);
    expect(
      result.timers.map((timer) => timer.delay),
      'the wait is over',
    ).toEqual([WATCHDOG]);
  });

  it('never shows the shell over the failure notice', async () => {
    const result = waiting();
    result.runTimers();
    expect(result.notice.hidden, 'the watchdog ran first').toBe(false);
    await result.fontsLoaded();
    expect(result.attributes).toEqual({});
  });

  it('adds the entry at once without document.fonts', () => {
    const result = waiting({ fonts: false });
    expect(result.inserted()).toEqual([...STARTUP, ENTRY]);
    expect(result.attributes).toEqual({});
  });

  it.each([
    ['another route', { url: 'https://play-100.test/discover' }],
    ['an engine below the floor', { withoutHasOwn: true }],
  ] as const)('does not wait on %s', (_, environment) => {
    const result = run({ probes: FAILING, fonts: true, ...environment });
    result.settle('load');
    result.parsed();
    expect(result.fontLoads).toEqual([]);
    expect(result.inserted()).toEqual([...STARTUP, ENTRY]);
  });

  it('measures the web fonts in their own probe class (shell.css)', () => {
    const css = read('src/first-paint/shell.css');
    expect(bootScript).toContain('p100-probe-web');
    expect(css).toContain(".p100-probe-web { font-family: 'Hanken Grotesk Variable', monospace; }");
    expect(css).toContain(".p100-probe-web.p100-probe-display { font-family: 'Barlow Condensed', monospace; }");
  });
});

describe('first-paint outdated-browser notice', () => {
  const OTHER_ROUTE = 'https://play-100.test/discover';
  const ANDROID =
    'Mozilla/5.0 (Linux; Android 10; SM-A105FN) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 Mobile Safari/537.36';
  const IPAD =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15';

  /** The entry fails to parse: the engine reports a SyntaxError, then the script's load event fires. */
  function unparsed(environment: BootEnvironment) {
    const result = run({ url: OTHER_ROUTE, ...environment });
    result.settle('load');
    result.parsed();
    result.uncaught(new SyntaxError("Unexpected token '='"));
    result.entry()?.dispatch('load');
    expect(result.notice.hidden).toBe(false);
    return result;
  }
  const shown = (result: ReturnType<typeof run>) => ({
    alerts: result.alerts.map((alert) => alert.hidden),
    copy: result.copies.filter((copy) => !copy.hidden).map((copy) => copy.os),
  });

  it.each([
    ['Android', { userAgent: ANDROID }, 'android'],
    ['iPhone', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)' }, 'ios'],
    ['iPad with a desktop user agent', { userAgent: IPAD, maxTouchPoints: 5 }, 'ios'],
    ['a Mac', { userAgent: IPAD, maxTouchPoints: 0 }, 'other'],
    ['another browser', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0' }, 'other'],
  ] as const)('tells %s what to update when the entry cannot be parsed', (_, navigator, os) => {
    expect(shown(unparsed({ navigator }))).toEqual({ alerts: [true, false], copy: [os] });
  });

  it('shows the outdated copy without Object.hasOwn, whatever failed', () => {
    const result = run({ url: OTHER_ROUTE, withoutHasOwn: true, navigator: { userAgent: ANDROID } });
    result.modulepreload('/assets/index-A.js')?.dispatch('error');
    result.parsed();
    expect(shown(result)).toEqual({ alerts: [true, false], copy: ['android'] });
  });

  it('takes a parse error the engine reports without an error object', () => {
    const result = run({ url: OTHER_ROUTE, navigator: { userAgent: ANDROID } });
    result.settle('load');
    result.parsed();
    result.uncaught(null, undefined, "Uncaught SyntaxError: Unexpected token '='");
    result.entry()?.dispatch('load');
    expect(shown(result).alerts).toEqual([true, false]);
  });

  /** A SyntaxError our code threw at runtime: its stack has a frame in the chunk that threw it. */
  const thrown = (message: string, file: string) =>
    Object.assign(new SyntaxError(message), { stack: `SyntaxError: ${message}\n    at parse (${file}:1:2048)` });
  const CHUNK = 'https://play-100.test/assets/DiscoverPage-D.js';

  it.each([
    ['a JSON.parse error at runtime', thrown('Unexpected token < in JSON at position 0', CHUNK), CHUNK],
    ['an invalid RegExp at runtime', thrown('Invalid regular expression: /(/: Unterminated group', CHUNK), CHUNK],
    [
      'an invalid URL at runtime, Firefox style',
      Object.assign(new SyntaxError('URL is not valid'), { stack: `go@${CHUNK}:1:9\n` }),
      CHUNK,
    ],
    ['a SyntaxError in another origin', new SyntaxError("Unexpected token '='"), 'https://cdn.example/assets/x.js'],
    ['a SyntaxError outside /assets/', new SyntaxError("Unexpected token '='"), 'https://play-100.test/sw.js'],
    ['another error', new TypeError('x is not a function'), 'https://play-100.test/assets/index-A.js'],
  ])('keeps the generic copy for %s', (_, error, filename) => {
    const result = run({ url: OTHER_ROUTE, navigator: { userAgent: ANDROID } });
    result.settle('load');
    result.parsed();
    result.uncaught(error, filename);
    result.entry()?.dispatch('load');
    expect(result.notice.hidden).toBe(false);
    expect(shown(result).alerts).toEqual([false, true]);
  });

  it('changes nothing once the app has started', () => {
    const result = run({ url: OTHER_ROUTE });
    result.settle('load');
    result.parsed();
    result.appStarted();
    result.uncaught(new SyntaxError("Unexpected token '='"));
    result.entry()?.dispatch('load');
    result.runTimers();
    expect(result.notice.hidden).toBe(true);
    expect(shown(result).alerts).toEqual([false, true]);
  });
});
