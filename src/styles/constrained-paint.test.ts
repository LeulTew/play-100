import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The card styles a constrained device (useCapabilities, html[data-constrained]) changes to paint less while The 100
// scrolls (docs/performance.md, "Low-end phones"), and the design every other device keeps.
const css = readFileSync(new URL('./components.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector!.trim().replace(/\s+/g, ' '),
  declarations: body!
    .split(';')
    .map((declaration) => declaration.trim().replace(/\s+/g, ' '))
    .filter(Boolean),
}));
const declarationsOf = (selector: string) =>
  rules.filter((rule) => rule.selector === selector).flatMap((rule) => rule.declarations);
// What a constrained device may drop from each part of a card: paint only, so nothing moves or changes size.
const PAINT_CUTS: Record<string, readonly string[]> = {
  'html[data-constrained] .game-cover img': ['box-shadow: none', 'transform: translate(-50%, -50%)'],
  'html[data-constrained] .has-cover .jacket-drawing': ['display: none'],
};

describe('constrained card paint', () => {
  const constrained = rules.filter((rule) => rule.selector.startsWith('html[data-constrained]'));

  it('only drops paint from the cover image and the drawing behind a cover', () => {
    expect(constrained.length).toBeGreaterThan(0);
    for (const { selector, declarations } of constrained) {
      expect(Object.keys(PAINT_CUTS)).toContain(selector);
      for (const declaration of declarations) expect(PAINT_CUTS[selector], selector).toContain(declaration);
    }
  });

  it('keeps the tilted, shadowed cover and its faint drawing on every other device', () => {
    expect(declarationsOf('.game-cover img')).toEqual(
      expect.arrayContaining(['transform: translate(-50%, -50%) rotate(-5deg)', 'box-shadow: 6px 8px 15px #16231530']),
    );
    expect(declarationsOf('.has-cover .jacket-drawing')).toEqual(['opacity: 0.25']);
  });
});
