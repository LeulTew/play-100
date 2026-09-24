import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stripBootScript } from './plugin.ts';

const bootScript = stripBootScript(readFileSync(new URL('../../src/first-paint/boot.js', import.meta.url), 'utf8'));
const HINT_KEY = 'play100.motion-hint.v1:guest';
const ACCEPTED_PROBES: Readonly<Record<string, { width: number; height: number }>> = {
  'p100-probe-display': { width: 609, height: 120 },
  'p100-probe-sans': { width: 932, height: 130 },
  'p100-probe-sans-bold': { width: 939, height: 130 },
};

interface BootEnvironment {
  url?: string;
  hint?: string | null;
  storageThrows?: boolean;
  reducedMotion?: boolean;
  coarsePointer?: boolean;
  navigator?: Record<string, unknown>;
  probes?: Readonly<Record<string, { width: number; height: number }>>;
  measureThrows?: boolean;
}

interface FakeSpan {
  className: string;
  textContent: string;
  getBoundingClientRect(): { width: number; height: number };
}

/** Runs the shipped boot script against a minimal window/document and returns the <html> attributes it set. */
function boot(environment: BootEnvironment = {}): Record<string, string> {
  const attributes: Record<string, string> = {};
  const probes = environment.probes ?? ACCEPTED_PROBES;
  const children: unknown[] = [];
  const root = {
    setAttribute: (name: string, value: string) => { attributes[name] = value; },
    appendChild: (child: unknown) => { children.push(child); return child; },
    removeChild: (child: unknown) => { children.splice(children.indexOf(child), 1); },
  };
  const document = {
    documentElement: root,
    createElement: (): FakeSpan => {
      const span: FakeSpan = {
        className: '', textContent: '',
        getBoundingClientRect: () => {
          if (environment.measureThrows) throw new Error('Layout is unavailable.');
          const size = probes[span.className.split(' ')[1] ?? ''];
          if (!size) throw new Error(`Unexpected probe ${span.className}.`);
          return size;
        },
      };
      return span;
    },
  };
  const window = {
    location: new URL(environment.url ?? 'https://play-100.test/'),
    URLSearchParams,
    navigator: environment.navigator ?? {},
    localStorage: {
      getItem: (key: string) => {
        if (environment.storageThrows) throw new Error('Storage is blocked.');
        return key === HINT_KEY ? environment.hint ?? null : null;
      },
    },
    matchMedia: (query: string) => ({
      matches: (query === '(prefers-reduced-motion: reduce)' && Boolean(environment.reducedMotion)) ||
        (query === '(pointer: coarse)' && Boolean(environment.coarsePointer)),
    }),
  };
  new Function('window', 'document', bootScript)(window, document);
  if (!environment.measureThrows) expect(children, 'the probes are removed again').toEqual([]);
  return attributes;
}

describe('first-paint boot gate', () => {
  it('accepts the landing page and names the artifact caption of the first commit', () => {
    expect(boot()).toEqual({ 'data-boot-art': 'lite', 'data-boot': 'landing' });
  });

  it.each([
    ['https://play-100.test/discover', 'another route'],
    ['https://play-100.test/my-games?tab=ranking', 'another route'],
    ['https://play-100.test/?view=table', 'the table view, which hides the hero'],
    ['https://play-100.test/?game=red-dead-redemption-2', 'a game dialog'],
    ['https://play-100.test/?catalogs=off', 'different navigation links'],
  ])('keeps the shell hidden for %s (%s)', url => {
    expect(boot({ url })).toEqual({});
  });

  it.each([
    'https://play-100.test/?view=list',
    'https://play-100.test/?q=mass&genre=RPG',
    'https://play-100.test/?info=credits',
    'https://play-100.test/?info=settings',
    'https://play-100.test/?game=',
  ])('accepts landing URLs whose first commit is unchanged: %s', url => {
    expect(boot({ url })['data-boot']).toBe('landing');
  });

  it.each([
    [{}, 'lite'],
    [{ hint: 'lite' }, 'lite'],
    [{ hint: '"full"' }, 'lite'],
    [{ hint: 'full', storageThrows: true }, 'lite'],
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
    ['sans width', { ...ACCEPTED_PROBES, 'p100-probe-sans': { width: 900, height: 130 } }],
    ['bold height', { ...ACCEPTED_PROBES, 'p100-probe-sans-bold': { width: 939, height: 133 } }],
  ])('keeps the shell hidden when the fallback faces do not measure right (%s)', (_, probes) => {
    expect(boot({ probes })).toEqual({});
  });

  it('fails closed on any error', () => {
    expect(boot({ measureThrows: true })).toEqual({});
  });
});
