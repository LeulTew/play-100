import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const fontFiles = [
  {
    family: 'Barlow Condensed',
    weight: '700',
    file: '@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2',
  },
  {
    family: 'Barlow Condensed',
    weight: '800',
    file: '@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2',
  },
  {
    family: 'Barlow Condensed',
    weight: '900',
    file: '@fontsource/barlow-condensed/files/barlow-condensed-latin-900-normal.woff2',
  },
  {
    family: 'Hanken Grotesk Variable',
    weight: '100 900',
    file: '@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2',
  },
];
const fontRules = await Promise.all(
  fontFiles.map(async ({ family, weight, file }) => {
    const bytes = await readFile(new URL(`../node_modules/${file}`, import.meta.url));
    return `@font-face {
      font-family: '${family}';
      font-style: normal;
      font-weight: ${weight};
      font-display: block;
      src: url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');
    }`;
  }),
);
const svg = await readFile(new URL('../public/social-card.svg', import.meta.url), 'utf8');
const destination = new URL('../public/social-card.png', import.meta.url);
const temporary = new URL(`../public/.social-card-${randomUUID()}.png`, import.meta.url);
const browser = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb'] });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  page.setDefaultTimeout(30_000);
  await page.route('**/*', (route) => route.abort());
  await page.setContent(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
      ${fontRules.join('\n')}
      html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
      svg { display: block; width: 1200px; height: 630px; font-synthesis: none; }
    </style></head><body>${svg}</body></html>`,
    { waitUntil: 'load' },
  );
  const fonts = await page.evaluate(async () => {
    const image = document.querySelector('svg');
    if (
      !image ||
      image.getAttribute('width') !== '1200' ||
      image.getAttribute('height') !== '630' ||
      image.getAttribute('viewBox') !== '0 0 1200 630'
    ) {
      throw new Error('The social SVG must retain its 1200 by 630 size and viewBox.');
    }
    const text = [...image.querySelectorAll('text, tspan')];
    if (!text.length) throw new Error('The social SVG has no text to verify.');
    const usages = text.map((element) => {
      const style = getComputedStyle(element);
      const family = style.fontFamily.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '');
      const weight = Number(style.fontWeight);
      if (
        (family !== 'Barlow Condensed' && family !== 'Hanken Grotesk Variable') ||
        (family === 'Barlow Condensed' && ![700, 800, 900].includes(weight)) ||
        !Number.isInteger(weight) ||
        weight < 100 ||
        weight > 900 ||
        style.fontStyle !== 'normal'
      ) {
        throw new Error(`Unsupported social-card font: ${style.fontStyle} ${style.fontWeight} ${style.fontFamily}`);
      }
      return { family, weight, font: `${weight} ${style.fontSize} "${family}"`, content: element.textContent ?? '' };
    });
    for (const { font, content } of usages) {
      const faces = await document.fonts.load(font, content);
      if (!faces.length || faces.some((face) => face.status !== 'loaded')) {
        throw new Error(`The embedded font did not load: ${font}`);
      }
    }
    await document.fonts.ready;
    for (const { font, content } of usages) {
      if (!document.fonts.check(font, content)) throw new Error(`Font fallback refused: ${font}`);
    }
    return [...new Set(usages.map(({ family, weight }) => `${family} ${weight}`))];
  });
  const png = await page.screenshot({
    type: 'png',
    fullPage: false,
    scale: 'css',
    animations: 'disabled',
    caret: 'hide',
  });
  await writeFile(temporary, png, { flag: 'wx' });
  await rename(temporary, destination);
  console.log(`Rendered ${fileURLToPath(destination)} at 1200x630 (device scale 1). Verified: ${fonts.join(', ')}.`);
} finally {
  await browser.close();
  await rm(temporary, { force: true });
}
