/**
 * The web font files the landing page renders, in the order index.html preloads them: the hero's
 * Barlow Condensed 800 first, then the body face and the section-heading weight. Only the latin
 * files: Hanken Grotesk's latin-ext face loads on demand.
 *
 * The shell paints in metric-matched local faces, and the web font faces arrive with the full
 * stylesheet after its first contentful paint. The first-paint template preloads these files at
 * that paint with the other startup requests, so they land before React's first commit instead of
 * after it, when every frame would lay new text out in the fallbacks first and again once each
 * font arrives (docs/first-paint-shell.md).
 */
export const LANDING_FONTS = [
  /^assets\/barlow-condensed-latin-800-normal-[\w-]+\.woff2$/,
  /^assets\/hanken-grotesk-latin-wght-normal-[\w-]+\.woff2$/,
  /^assets\/barlow-condensed-latin-700-normal-[\w-]+\.woff2$/,
] as const;

/** The emitted file of each landing font, in preload order. A missing or ambiguous one fails the build. */
export function landingFontFiles(fileNames: readonly string[]): string[] {
  return LANDING_FONTS.map(pattern => {
    const matches = fileNames.filter(name => pattern.test(name));
    const [file] = matches;
    if (matches.length !== 1 || file === undefined) {
      throw new Error(`The build must emit exactly one landing font file matching ${pattern}, not ${matches.length}.`);
    }
    return file;
  });
}
