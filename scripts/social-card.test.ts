import { readFileSync } from 'node:fs';
import { Parser } from 'htmlparser2';
import { describe, expect, it } from 'vitest';

const svg = readFileSync(new URL('../public/social-card.svg', import.meta.url), 'utf8');
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
    const text = parseBrandText(svg);
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
    expect(() => parseBrandText(svg.replace("'Barlow Condensed', sans-serif", 'Arial, sans-serif'))).toThrow(
      /Unapproved social-card font-family/,
    );
  });
});
