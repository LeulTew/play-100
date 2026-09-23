import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
if (!head) throw new Error('The public document must have a head.');

function tags(name: 'meta' | 'link'): Record<string, string>[] {
  return Array.from(head.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi')), ([tag]) => {
    const attributes: Record<string, string> = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) {
      const key = match[1];
      const value = match[3];
      if (key === undefined || value === undefined) throw new Error('Invalid metadata attribute.');
      attributes[key] = value;
    }
    return attributes;
  });
}

function meta(key: string, attribute: 'property' | 'name' = 'property'): string {
  const matches = tags('meta').filter(tag => tag[attribute] === key);
  expect(matches, `${key} must occur exactly once`).toHaveLength(1);
  const value = matches[0]?.content;
  if (!value) throw new Error(`Missing ${key} content.`);
  return value;
}

describe('public social metadata', () => {
  it('has one absolute canonical URL and a deterministic production image before build transforms', () => {
    const canonical = tags('link').filter(tag => tag.rel === 'canonical');
    expect(canonical).toHaveLength(1);
    expect(canonical[0]?.href).toBe('https://play-100-collection.vercel.app/');
    expect(meta('og:url')).toBe(canonical[0]?.href);
    expect(meta('og:image')).toBe('https://play-100-collection.vercel.app/social-card.png');
    expect(new URL(meta('og:image')).origin).toBe(new URL(meta('og:url')).origin);
    expect(meta('og:type')).toBe('website');
    expect(meta('og:site_name')).toBe('Play 100');
  });

  it('defines explicit Twitter fields that match Open Graph without fallback', () => {
    expect(meta('twitter:card', 'name')).toBe('summary_large_image');
    for (const field of ['title', 'description', 'image', 'image:alt']) {
      expect(meta(`twitter:${field}`, 'name')).toBe(meta(`og:${field}`));
    }
    expect(meta('og:image:alt')).toBe('Play 100. Good games. Great escapes. One hundred games worth making time for.');
  });

  it('describes the actual public PNG rather than guessed dimensions or type', async () => {
    const image = await sharp(fileURLToPath(new URL('../public/social-card.png', import.meta.url))).metadata();
    expect(image).toMatchObject({ width: 1200, height: 630, format: 'png' });
    expect(meta('og:image:width')).toBe(String(image.width));
    expect(meta('og:image:height')).toBe(String(image.height));
    expect(meta('og:image:type')).toBe(`image/${image.format}`);
  });
});
