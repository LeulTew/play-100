import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

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
const svg = await readFile(new URL('./social-card-source.svg', import.meta.url), 'utf8');
const destination = new URL('../public/social-card.png', import.meta.url);
const temporary = new URL(`../public/.social-card-${randomUUID()}.png`, import.meta.url);
const svgDestination = new URL('../public/social-card.svg', import.meta.url);
const svgTemporary = new URL(`../public/.social-card-${randomUUID()}.svg`, import.meta.url);
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
      const family = style.fontFamily
        .split(',')[0]
        ?.trim()
        .replace(/^['"]|['"]$/g, '');
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
  const usages = await page.evaluate(() =>
    [...document.querySelectorAll('svg text')].map((element) => {
      if (!(element instanceof SVGTextElement)) throw new Error('Expected SVG text.');
      const style = getComputedStyle(element);
      const content = element.textContent ?? '';
      return {
        family: style.fontFamily
          .split(',')[0]
          ?.trim()
          .replace(/^['"]|['"]$/g, ''),
        weight: Number(style.fontWeight),
        size: Number.parseFloat(style.fontSize),
        fill: element.getAttribute('fill'),
        content,
        characters: [...content].map((value, index) => {
          const { x, y } = element.getStartPositionOfChar(index);
          return { value, x, y };
        }),
      };
    }),
  );
  const payload = {
    svg,
    usages: usages.map((usage) => {
      const font = fontFiles.find(
        ({ family, weight }) => family === usage.family && (weight === '100 900' || Number(weight) === usage.weight),
      );
      if (!font) throw new Error(`No outline font for ${usage.family} ${usage.weight}.`);
      return { ...usage, file: fileURLToPath(new URL(`../node_modules/${font.file}`, import.meta.url)) };
    }),
  };
  const outlined = await new Promise<string>((resolve, reject) => {
    const process = spawn('python', [fileURLToPath(new URL('./outline-social-card.py', import.meta.url))]);
    let output = '';
    let error = '';
    process.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk;
    });
    process.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      error += chunk;
    });
    process.on('error', reject);
    process.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`Social-card outlining failed (${code}): ${error}`));
    });
    process.stdin.on('error', reject);
    process.stdin.end(JSON.stringify(payload));
  });
  if (Buffer.byteLength(outlined) > 80 * 1024) throw new Error('The outlined social SVG exceeds 80 KiB.');
  const standalone = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    colorScheme: 'light',
    serviceWorkers: 'block',
  });
  const requests: string[] = [];
  await standalone.route('**/*', async (route) => {
    const url = route.request().url();
    requests.push(url);
    if (url !== 'https://social-card.invalid/social-card.svg') return route.abort();
    return route.fulfill({
      contentType: 'image/svg+xml',
      headers: { 'Content-Security-Policy': "default-src 'none'; style-src 'none'; font-src 'none'" },
      body: outlined,
    });
  });
  await standalone.goto('https://social-card.invalid/social-card.svg');
  const portable = await standalone.evaluate(() => ({
    fonts: document.fonts.size,
    text: document.querySelectorAll('text, tspan').length,
  }));
  if (portable.fonts || portable.text || requests.length !== 1)
    throw new Error('The standalone social SVG must have no fonts, live text or dependent requests.');
  const svgPng = await standalone.screenshot({ type: 'png', scale: 'css', animations: 'disabled' });
  const baseline = await readFile(destination);
  const [expected, actual, shipped] = await Promise.all(
    [png, svgPng, baseline].map((bytes) => sharp(bytes).ensureAlpha().raw().toBuffer()),
  );
  let svgPixels = 0;
  let pngPixels = 0;
  for (let offset = 0; offset < expected!.length; offset += 4) {
    if (!expected!.subarray(offset, offset + 4).equals(actual!.subarray(offset, offset + 4))) svgPixels += 1;
    if (!expected!.subarray(offset, offset + 4).equals(shipped!.subarray(offset, offset + 4))) pngPixels += 1;
  }
  console.log(
    `Comparison: PNG byte-identical=${png.equals(baseline)}, PNG changed pixels=${pngPixels}; outlined SVG changed pixels=${svgPixels}/756000.`,
  );
  if (process.env.SOCIAL_CARD_EVIDENCE_DIR) {
    const path = await import('node:path');
    await writeFile(path.join(process.env.SOCIAL_CARD_EVIDENCE_DIR, 'standalone-social-card.png'), svgPng);
  }
  await writeFile(svgTemporary, outlined, { flag: 'wx' });
  await writeFile(temporary, png, { flag: 'wx' });
  await rename(svgTemporary, svgDestination);
  await rename(temporary, destination);
  console.log(`Rendered ${fileURLToPath(destination)} at 1200x630 (device scale 1). Verified: ${fonts.join(', ')}.`);
} finally {
  await browser.close();
  await rm(temporary, { force: true });
  await rm(svgTemporary, { force: true });
}
