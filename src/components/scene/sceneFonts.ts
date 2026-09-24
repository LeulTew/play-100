/**
 * Canvas text in the 3D scene must name the families the app registers (main.tsx imports
 * @fontsource-variable/hanken-grotesk, whose face is "Hanken Grotesk Variable", and
 * @fontsource/barlow-condensed). A canvas does not wait for web fonts, so textures are redrawn
 * once these faces load, within a bounded wait; until then the generic fallback is drawn.
 */

export const SCENE_SANS = '"Hanken Grotesk Variable", sans-serif';
export const SCENE_DISPLAY = '"Barlow Condensed", sans-serif';
export const SCENE_FONT_TIMEOUT_MS = 3000;

export function sceneFont(weight: 600 | 700 | 800, size: number, family: string = SCENE_SANS): string {
  return `${weight} ${size}px ${family}`;
}

/** One representative font string per face the textures use. */
export const SCENE_FONT_FACES: readonly string[] = [
  sceneFont(600, 16),
  sceneFont(700, 16),
  sceneFont(800, 16),
  sceneFont(800, 16, SCENE_DISPLAY),
];

type SceneFontSet = Pick<FontFaceSet, 'check' | 'load'>;

export function sceneFontSet(): SceneFontSet | null {
  return typeof document !== 'undefined' && 'fonts' in document ? document.fonts : null;
}

/** Whether every scene face is already usable, so the first textures can be final. */
export function sceneFontsReady(fonts: SceneFontSet | null): boolean {
  if (!fonts) return false;
  try {
    return SCENE_FONT_FACES.every(font => fonts.check(font));
  } catch {
    return false;
  }
}

/**
 * Resolves true once every scene face has loaded, or false on a load failure or after the
 * timeout; it never rejects, so the fallback textures simply stay.
 */
export function whenSceneFontsReady(fonts: SceneFontSet | null, timeoutMs = SCENE_FONT_TIMEOUT_MS): Promise<boolean> {
  if (!fonts) return Promise.resolve(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); });
  const loaded = Promise.all(SCENE_FONT_FACES.map(font => fonts.load(font)))
    .then(faces => faces.every(face => face.length > 0) && sceneFontsReady(fonts), () => false);
  return Promise.race([loaded, timeout]).finally(() => clearTimeout(timer));
}
