import { readFileSync } from 'node:fs';
import { Parser } from 'htmlparser2';
import { describe, expect, it } from 'vitest';

const svg = readFileSync(new URL('../public/social-card.svg', import.meta.url), 'utf8');
const source = readFileSync(new URL('./social-card-source.svg', import.meta.url), 'utf8');
const brandStacks = new Map([
  ["'Barlow Condensed', sans-serif", new Set(['700', '800', '900'])],
  ["'Hanken Grotesk Variable', sans-serif", new Set(['400', '600', '700'])],
]);

function parseBrandText(source: string): Record<string, string>[] {
  const text: Record<string, string>[] = [];
  new Parser(
    {
      onopentag(name, attributes) {
        if (name === 'style' || attributes.style) {
          throw new Error('Use explicit brand font attributes, not overriding SVG styles.');
        }
        const stack = attributes['font-family'];
        if (stack !== undefined && !brandStacks.has(stack)) {
          throw new Error(`Unapproved social-card font-family: ${stack}`);
        }
        if (name === 'text' || name === 'tspan') {
          if (!stack || !brandStacks.get(stack)?.has(attributes['font-weight'] ?? '')) {
            throw new Error('Every social-card text element needs an explicit approved family and weight.');
          }
          text.push(attributes);
        }
      },
    },
    { xmlMode: true },
  ).end(source);
  return text;
}

describe('social-card brand typography', () => {
  it('parses every text element and only permits the embedded brand stacks and weights', () => {
    const text = parseBrandText(source);
    expect(text).toHaveLength(7);
    expect(new Set(text.map((attributes) => attributes['font-family']))).toEqual(new Set(brandStacks.keys()));
    expect(
      new Set(
        text
          .filter((attributes) => attributes['font-family'] === "'Barlow Condensed', sans-serif")
          .map((attributes) => attributes['font-weight']),
      ),
    ).toEqual(new Set(['700', '800', '900']));
  });

  it('rejects an off-brand family rather than accepting a generic fallback', () => {
    expect(() => parseBrandText(source.replace("'Barlow Condensed', sans-serif", 'Arial, sans-serif'))).toThrow(
      /Unapproved social-card font-family/,
    );
  });

  it('ships only outlined lettering with local glyph references and accessible copy', () => {
    const ids = new Set<string>();
    const uses: string[] = [];
    const labels: string[] = [];
    new Parser(
      {
        onopentag(name, attributes) {
          expect(['svg', 'defs', 'g', 'path', 'rect', 'use']).toContain(name);
          expect(attributes.style).toBeUndefined();
          expect(attributes['font-family']).toBeUndefined();
          if (attributes.id) {
            expect(ids.has(attributes.id)).toBe(false);
            ids.add(attributes.id);
          }
          if (name === 'use') {
            expect(attributes.href).toMatch(/^#sc-\d+-[a-f0-9]+$/);
            uses.push(attributes.href!.slice(1));
          }
          if (attributes['aria-label']) {
            expect(attributes.role).toBe('img');
            labels.push(attributes['aria-label']);
          }
        },
      },
      { xmlMode: true },
    ).end(svg);
    expect(uses).toHaveLength(labels.join('').replace(/\s/g, '').length);
    expect(uses.every((id) => ids.has(id))).toBe(true);
    expect(labels).toEqual([
      'PLAY 100.',
      'GOOD GAMES.',
      'GREAT ESCAPES.',
      'One hundred games worth making time for.',
      'EXPLORE THE COLLECTION',
      '100',
      'WORLDS TO PLAY',
    ]);
    expect(Buffer.byteLength(svg)).toBeLessThanOrEqual(80 * 1024);
    expect(svg).not.toMatch(/@font-face|font-family|Barlow|Hanken|data:|<text\b|<image\b/);
  });
});
