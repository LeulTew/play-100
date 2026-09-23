import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ArtifactStill from './ArtifactStill';
import CollectionArtifact from '../CollectionArtifact';
import { FOLIO_DESIGNS, P100_GLYPHS, glyphPath } from './artifactDesign';

describe('decorative sleeve illustration', () => {
  it.each([false, true])('uses non-text print marks instead of scaled microcopy (fanned=%s)', fanned => {
    const html = renderToStaticMarkup(createElement(ArtifactStill, { fanned }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).not.toMatch(/<text\b/);
    expect(html).not.toContain('OPEN &amp; EXPLORE');
    expect(html).not.toContain('ROOM FOR PLAY.');
    expect(html.match(/class="artifact-still-sleeve"/g)).toHaveLength(FOLIO_DESIGNS.length);
    for (const glyph of P100_GLYPHS) expect(html).toContain(`d="${glyphPath(glyph)}"`);
  });

  it.each([
    { quality: 'lite', reducedMotion: false, constrained: false },
    { quality: 'full', reducedMotion: true, constrained: false },
    { quality: 'auto', reducedMotion: false, constrained: true },
  ] as const)('omits misleading controls from the first static $quality render', props => {
    const html = renderToStaticMarkup(createElement(CollectionArtifact, props));
    expect(html).toContain('data-activation="static"');
    expect(html).toContain('data-fanned="false"');
    expect(html).not.toContain('class="artifact-control"');
    expect(html).toContain('class="artifact-still"');
    expect(html).not.toMatch(/<text\b/);
  });
});
