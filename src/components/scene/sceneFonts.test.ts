import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SCENE_DISPLAY,
  SCENE_FONT_FACES,
  SCENE_SANS,
  sceneFont,
  sceneFontsReady,
  whenSceneFontsReady,
} from './sceneFonts';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

function fakeFonts(options: { ready?: boolean; load?: (font: string) => Promise<FontFace[]> } = {}) {
  const loaded: string[] = [];
  return {
    loaded,
    check: vi.fn(() => options.ready ?? false),
    load: vi.fn((font: string) => {
      loaded.push(font);
      return options.load ? options.load(font) : Promise.resolve([{} as FontFace]);
    }),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('scene canvas fonts', () => {
  it('names the families main.tsx actually registers', () => {
    expect(SCENE_SANS).toBe('"Hanken Grotesk Variable", sans-serif');
    expect(SCENE_DISPLAY).toBe('"Barlow Condensed", sans-serif');
    expect(read('src/main.tsx')).toContain("import '@fontsource-variable/hanken-grotesk/wght.css';");
    expect(read('node_modules/@fontsource-variable/hanken-grotesk/wght.css')).toContain(
      "font-family: 'Hanken Grotesk Variable'",
    );
    expect(read('node_modules/@fontsource/barlow-condensed/latin-800.css')).toContain(
      "font-family: 'Barlow Condensed'",
    );
    expect(read('src/styles/tokens.css')).toContain("'Hanken Grotesk Variable'");
  });

  it('builds canvas font strings for every weight the textures draw', () => {
    expect(sceneFont(600, 12)).toBe('600 12px "Hanken Grotesk Variable", sans-serif');
    expect(sceneFont(800, 43, SCENE_DISPLAY)).toBe('800 43px "Barlow Condensed", sans-serif');
    expect(SCENE_FONT_FACES).toEqual([
      '600 16px "Hanken Grotesk Variable", sans-serif',
      '700 16px "Hanken Grotesk Variable", sans-serif',
      '800 16px "Hanken Grotesk Variable", sans-serif',
      '800 16px "Barlow Condensed", sans-serif',
    ]);
  });

  it('leaves no canvas text on the unregistered "Hanken Grotesk" family', () => {
    const scene = read('src/components/scene/CollectionScene.tsx');
    expect(scene).not.toMatch(/"Hanken Grotesk"/);
    expect(scene).not.toMatch(/context\.font\s*=\s*['"`]/);
  });

  it('reports readiness only when every face checks out', () => {
    expect(sceneFontsReady(null)).toBe(false);
    expect(sceneFontsReady(fakeFonts({ ready: true }))).toBe(true);
    expect(sceneFontsReady(fakeFonts({ ready: false }))).toBe(false);
    const throwing = {
      check: () => {
        throw new Error('bad font');
      },
      load: () => Promise.resolve([]),
    };
    expect(sceneFontsReady(throwing)).toBe(false);
  });

  it('waits for every face to load before reporting ready', async () => {
    const fonts = fakeFonts({ ready: true });
    await expect(whenSceneFontsReady(fonts, 1000)).resolves.toBe(true);
    expect(fonts.loaded).toEqual([...SCENE_FONT_FACES]);
  });

  it('keeps the fallback when a face does not match or fails to load', async () => {
    await expect(whenSceneFontsReady(fakeFonts({ ready: true, load: () => Promise.resolve([]) }), 1000)).resolves.toBe(
      false,
    );
    await expect(
      whenSceneFontsReady(fakeFonts({ ready: true, load: () => Promise.reject(new Error('network')) }), 1000),
    ).resolves.toBe(false);
    await expect(whenSceneFontsReady(null)).resolves.toBe(false);
  });

  it('gives up after the bounded timeout instead of hanging', async () => {
    vi.useFakeTimers();
    const fonts = fakeFonts({ ready: true, load: () => new Promise<FontFace[]>(() => {}) });
    let result: boolean | undefined;
    void whenSceneFontsReady(fonts, 250).then((value) => {
      result = value;
    });
    await vi.advanceTimersByTimeAsync(249);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
