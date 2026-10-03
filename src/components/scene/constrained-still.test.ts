import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ArtifactStill from './ArtifactStill';
import { FOLIO_DESIGNS } from './artifactDesign';

// What a constrained device (useCapabilities, html[data-constrained]) leaves out of the collection still to raster less
// (docs/performance.md, "Low-end phones"), and what it must keep: every sleeve, its print and its numbering.
const css = readFileSync(new URL('./artifact.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector!.trim().replace(/\s+/g, ' '),
  declarations: body!
    .split(';')
    .map((declaration) => declaration.trim().replace(/\s+/g, ' '))
    .filter(Boolean),
}));
const LEFT_OUT = ['artifact-still-detail'];
// Paint only: the parts it leaves out are absolutely placed SVG shapes, so nothing else moves or changes size.
const PAINT_CUTS: Record<string, readonly string[]> = {
  'html[data-constrained] .artifact-still-detail': ['display: none'],
};

/** The opening tags of the still's markup that a constrained device still draws. */
function drawn(html: string) {
  const kept: string[] = [];
  const hidden: boolean[] = [];
  for (const [, closing, name, attributes = '', selfClosing] of html.matchAll(/<(\/?)([a-z]+)([^>]*?)(\/?)>/g)) {
    if (closing) {
      hidden.pop();
      continue;
    }
    const classes = /class="([^"]*)"/.exec(attributes)?.[1]?.split(' ') ?? [];
    const leftOut = (hidden.at(-1) ?? false) || classes.some((value) => LEFT_OUT.includes(value));
    if (!leftOut) kept.push(`<${name}${attributes}>`);
    if (!selfClosing) hidden.push(leftOut);
  }
  return kept;
}

describe('constrained still paint', () => {
  const constrained = rules.filter((rule) => rule.selector.startsWith('html[data-constrained]'));

  it('only drops paint from the still on a constrained device', () => {
    expect(constrained.length).toBeGreaterThan(0);
    for (const { selector, declarations } of constrained) {
      expect(Object.keys(PAINT_CUTS)).toContain(selector);
      for (const declaration of declarations) expect(PAINT_CUTS[selector], selector).toContain(declaration);
    }
  });

  it.each([false, true])('keeps every sleeve, print and number (fanned=%s)', (fanned) => {
    const html = renderToStaticMarkup(createElement(ArtifactStill, { fanned }));
    const kept = drawn(html);
    const count = (pattern: RegExp) => kept.filter((tag) => pattern.test(tag)).length;
    expect(kept.length).toBeLessThan(drawn(html.replaceAll('artifact-still-', 'artifact-kept-')).length);
    expect(count(/class="artifact-still-sleeve"/)).toBe(FOLIO_DESIGNS.length);
    expect(count(/^<rect width="220" height="150"/)).toBe(FOLIO_DESIGNS.length);
    expect(count(/d="M0 0h8l6 5v145H0Z"/)).toBe(FOLIO_DESIGNS.length);
    expect(count(/d="M\d+ 16v8"/)).toBe(FOLIO_DESIGNS.reduce((sum, design) => sum + Number(design.number), 0));
  });
});
