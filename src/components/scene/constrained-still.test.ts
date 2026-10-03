import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ArtifactStill from './ArtifactStill';
import { FOLIO_DESIGNS, P100_GLYPHS, glyphPath, type FolioDesign } from './artifactDesign';

// What a constrained device (useCapabilities, through CollectionArtifact) leaves out of the collection still to raster
// less (docs/performance.md, "Low-end phones"), and what it must keep: every sleeve, its print and its numbering. The
// markup leaves the detail out, so no stylesheet rule hides it.
function tags(fanned: boolean, constrained: boolean) {
  const html = renderToStaticMarkup(createElement(ArtifactStill, { fanned, constrained }));
  return [...html.matchAll(/<[a-z][^>]*>/g)].map(([tag]) => tag);
}

/** Whether `part` is `whole` with some tags left out and every other tag unchanged, in its order. */
function leavesOut(part: readonly string[], whole: readonly string[]) {
  let next = 0;
  for (const tag of whole) if (tag === part[next]) next += 1;
  return next === part.length;
}

// One shape of each print motif.
const MOTIFS: Record<FolioDesign['motif'], RegExp> = {
  grid: /^<rect x="27" y="46" width="26" height="17"/,
  stripes: /^<path d="M24 121H201"/,
  arch: /^<path d="M37 119V91a74 51 0 0 1 148 0v28"/,
  mark: /^<rect x="22" y="119"/,
};
// The ground shadow and every faint rule are translucent; nothing the still keeps is.
const FAINT = / opacity="/;

describe('constrained still', () => {
  it.each([false, true])('leaves out only the ground shadow, faint rules and print motifs (fanned=%s)', (fanned) => {
    const full = tags(fanned, false);
    const lean = tags(fanned, true);
    expect(lean.length).toBeLessThan(full.length);
    expect(leavesOut(lean, full)).toBe(true);
    expect(full.filter((tag) => FAINT.test(tag)).length).toBeGreaterThan(0);
    expect(lean.filter((tag) => FAINT.test(tag))).toEqual([]);
    expect(full.filter((tag) => tag.startsWith('<ellipse')).length).toBeGreaterThan(0);
    expect(lean.filter((tag) => tag.startsWith('<ellipse'))).toEqual([]);
    for (const motif of new Set(FOLIO_DESIGNS.map((design) => design.motif))) {
      expect(full.some((tag) => MOTIFS[motif].test(tag)), motif).toBe(true);
      expect(lean.some((tag) => MOTIFS[motif].test(tag)), motif).toBe(false);
    }
    for (const glyph of P100_GLYPHS) {
      const shape = `d="${glyphPath(glyph)}"`;
      expect(full.some((tag) => tag.includes(shape))).toBe(true);
      expect(lean.some((tag) => tag.includes(shape))).toBe(false);
    }
  });

  it.each([false, true])('keeps every sleeve, print and number (fanned=%s)', (fanned) => {
    const lean = tags(fanned, true);
    const count = (pattern: RegExp) => lean.filter((tag) => pattern.test(tag)).length;
    expect(count(/class="artifact-still-sleeve"/)).toBe(FOLIO_DESIGNS.length);
    expect(count(/^<rect width="220" height="150"/)).toBe(FOLIO_DESIGNS.length);
    expect(count(/d="M0 0h8l6 5v145H0Z"/)).toBe(FOLIO_DESIGNS.length);
    expect(count(/d="M\d+ 16v8"/)).toBe(FOLIO_DESIGNS.reduce((sum, design) => sum + Number(design.number), 0));
  });

  it('draws the whole still unless a device is constrained', () => {
    const html = (props: { fanned: boolean; constrained?: boolean }) =>
      renderToStaticMarkup(createElement(ArtifactStill, props));
    expect(html({ fanned: false })).toBe(html({ fanned: false, constrained: false }));
    expect(html({ fanned: true })).toBe(html({ fanned: true, constrained: false }));
  });
});