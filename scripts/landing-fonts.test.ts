import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { landingFontFiles } from './landing-fonts.ts';

const read = (url: URL) => readFileSync(url, 'utf8');

// The font files Vite emits for the @fontsource stylesheets src/main.tsx imports, as in a build.
const FONT_FILES = [...read(new URL('../src/main.tsx', import.meta.url)).matchAll(/^import '(@fontsource[\w/-]*\/[\w-]+\.css)';$/gm)]
  .flatMap(([, specifier]) => [...read(new URL(`../node_modules/${specifier}`, import.meta.url)).matchAll(/url\((['"]?)\.\/files\/([\w-]+)\.(woff2?)\1\)/g)])
  .map(([, , name, extension]) => `assets/${name}-Hash_1-2.${extension}`);
const EMITTED = [...new Set(FONT_FILES), 'assets/index-Co7EAvP7.js', 'assets/index-F6C_fDKP.css', 'assets/CatalogDetail-BC-82rWH.css'];

describe('landing font preloads', () => {
  it('reads the three font stylesheets src/main.tsx imports', () => {
    expect(FONT_FILES).toContain('assets/hanken-grotesk-latin-ext-wght-normal-Hash_1-2.woff2');
    expect(FONT_FILES).toContain('assets/barlow-condensed-latin-700-normal-Hash_1-2.woff');
  });

  it('preloads the latin files of the faces the landing page renders, the hero weight first', () => {
    expect(landingFontFiles(EMITTED)).toEqual([
      'assets/barlow-condensed-latin-800-normal-Hash_1-2.woff2',
      'assets/hanken-grotesk-latin-wght-normal-Hash_1-2.woff2',
      'assets/barlow-condensed-latin-700-normal-Hash_1-2.woff2',
    ]);
  });

  it('fails the build when a landing font file is missing or ambiguous', () => {
    expect(() => landingFontFiles(EMITTED.filter(name => !name.startsWith('assets/barlow-condensed-latin-700-normal-'))))
      .toThrow('exactly one landing font file matching /^assets\\/barlow-condensed-latin-700-normal-[\\w-]+\\.woff2$/, not 0.');
    expect(() => landingFontFiles([...EMITTED, 'assets/hanken-grotesk-latin-wght-normal-Other123.woff2'])).toThrow(', not 2.');
  });
});
