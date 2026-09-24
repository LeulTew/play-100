import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PublicScore } from './CommunityPages';

const render = (score: number | null) => renderToStaticMarkup(createElement(PublicScore, { score }));

describe('public ranking score', () => {
  it('keeps the visible score but hides it from assistive technology behind one spoken phrase', () => {
    expect(render(8.2)).toBe('<span class="public-score"><span aria-hidden="true">8.2<small> / 10</small></span><span class="sr-only">Publisher rating 8.2 out of 10</span></span>');
  });
  it('speaks a missing score instead of the visible dash', () => {
    expect(render(null)).toBe('<span class="public-score"><span aria-hidden="true">—</span><span class="sr-only">No personal score</span></span>');
  });
  it('treats zero as a real rating', () => {
    expect(render(0)).toBe('<span class="public-score"><span aria-hidden="true">0<small> / 10</small></span><span class="sr-only">Publisher rating 0 out of 10</span></span>');
  });
  it('never names the generic score wrapper', () => {
    for (const score of [null, 0, 7, 8.2, 10]) expect(render(score)).not.toContain('aria-label');
  });
});
