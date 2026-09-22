import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollCollectionIntoView } from './collection-landing';

afterEach(() => vi.unstubAllGlobals());

function fixture({ titleTop = 900, titleBottom = 940, obstacleTop = 571.5, hidden = false, identity = true } = {}) {
  const scrollTo = vi.fn();
  const title = { getBoundingClientRect: () => ({ top: titleTop, bottom: titleBottom }) };
  const section = { getBoundingClientRect: () => ({ top: 600 }), querySelector: () => identity ? title : null };
  const obstacle = { getBoundingClientRect: () => ({ top: obstacleTop }), getClientRects: () => hidden ? [] : [{}] };
  vi.stubGlobal('window', { scrollY: 100, innerHeight: 740, scrollTo });
  vi.stubGlobal('document', {
    documentElement: {},
    getElementById: () => section,
    querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 66 }) }),
    querySelectorAll: () => [obstacle],
  });
  vi.stubGlobal('getComputedStyle', () => ({ scrollPaddingTop: '85px', scrollMarginTop: '0px' }));
  return scrollTo;
}

describe('explicit collection landing', () => {
  it('preserves the ordinary heading landing when the first identity already fits', () => {
    const scrollTo = fixture();
    scrollCollectionIntoView('instant');
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 615, behavior: 'instant' });
  });

  it.each([
    [1034, 1073, 571.5],
    [1070, 1109, 571.5],
    [1034, 1073, 702.25],
  ])('clears a wrapped current identity at %i..%i above dock %i', (titleTop, titleBottom, obstacleTop) => {
    const scrollTo = fixture({ titleTop, titleBottom, obstacleTop });
    scrollCollectionIntoView('smooth');
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: Math.max(615, 100 + titleBottom - obstacleTop + 12), behavior: 'smooth',
    });
  });

  it('uses the actual taller error or notification boundary rather than an assumed dock height', () => {
    const scrollTo = fixture({ titleBottom: 1073, obstacleTop: 440 });
    scrollCollectionIntoView('instant');
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 745, behavior: 'instant' });
  });

  it('ignores hidden navigation and keeps an empty result on its heading', () => {
    const scrollTo = fixture({ titleBottom: 1073, obstacleTop: 0, hidden: true });
    scrollCollectionIntoView('instant');
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 615, behavior: 'instant' });
    const emptyScroll = fixture({ identity: false });
    scrollCollectionIntoView('instant');
    expect(emptyScroll).toHaveBeenCalledExactlyOnceWith({ top: 615, behavior: 'instant' });
  });

  it('does not scroll a route with no collection', () => {
    const scrollTo = fixture();
    vi.stubGlobal('document', { getElementById: () => null });
    scrollCollectionIntoView('instant');
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
