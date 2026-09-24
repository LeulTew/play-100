import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollCollectionIntoView } from './collection-landing';

afterEach(() => vi.unstubAllGlobals());

function fixture({
  titleTop = 900,
  titleBottom = 940,
  obstacleTop = 571.5,
  hidden = false,
  identity = true,
  nestedLink = false,
  headingTabIndex = true,
} = {}) {
  const scrollTo = vi.fn();
  const link = { focus: vi.fn() };
  const heading = {
    getBoundingClientRect: () => ({ top: 620, bottom: 650 }),
    focus: vi.fn(),
    hasAttribute: () => headingTabIndex,
    tabIndex: headingTabIndex ? -1 : 0,
  };
  const title = {
    getBoundingClientRect: () => ({ top: titleTop, bottom: titleBottom }),
    closest: () => (nestedLink ? null : link),
    querySelector: () => (nestedLink ? link : null),
  };
  const section = { getBoundingClientRect: () => ({ top: 600 }), querySelector: () => (identity ? title : null) };
  const obstacle = { getBoundingClientRect: () => ({ top: obstacleTop }), getClientRects: () => (hidden ? [] : [{}]) };
  vi.stubGlobal('window', { scrollY: 100, innerHeight: 740, scrollTo });
  vi.stubGlobal('document', {
    documentElement: {},
    getElementById: (id: string) => (id === 'collection-title' ? heading : section),
    querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 66 }) }),
    querySelectorAll: () => [obstacle],
  });
  vi.stubGlobal('getComputedStyle', () => ({ scrollPaddingTop: '85px', scrollMarginTop: '0px' }));
  return { scrollTo, heading, link };
}

describe('explicit collection landing', () => {
  it('preserves the ordinary heading landing when the first identity already fits', () => {
    const { scrollTo, heading, link } = fixture();
    scrollCollectionIntoView('instant');
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 615, behavior: 'instant' });
    expect(heading.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(link.focus).not.toHaveBeenCalled();
  });

  it.each([
    [1034, 1073, 571.5],
    [1070, 1109, 571.5],
    [1034, 1073, 702.25],
  ])('clears a wrapped current identity at %i..%i above dock %i', (titleTop, titleBottom, obstacleTop) => {
    const { scrollTo } = fixture({ titleTop, titleBottom, obstacleTop });
    scrollCollectionIntoView('smooth');
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: Math.max(615, 100 + titleBottom - obstacleTop + 12),
      behavior: 'smooth',
    });
  });

  it('uses the actual taller error or notification boundary rather than an assumed dock height', () => {
    const { scrollTo, heading, link } = fixture({ titleBottom: 1073, obstacleTop: 440 });
    scrollCollectionIntoView('instant');
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 745, behavior: 'instant' });
    expect(link.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(heading.focus).not.toHaveBeenCalled();
  });

  it('ignores hidden navigation and keeps an empty result on its heading', () => {
    const { scrollTo, heading, link } = fixture({ titleBottom: 1073, obstacleTop: 0, hidden: true });
    scrollCollectionIntoView('instant');
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 615, behavior: 'instant' });
    expect(heading.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(link.focus).not.toHaveBeenCalled();
    const empty = fixture({ identity: false, headingTabIndex: false });
    scrollCollectionIntoView('instant');
    expect(empty.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 615, behavior: 'instant' });
    expect(empty.heading.tabIndex).toBe(-1);
    expect(empty.heading.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(empty.link.focus).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'focuses the primary identity link when the heading would be obscured (nested: %s)',
    (nestedLink) => {
      const { scrollTo, heading, link } = fixture({ titleTop: 1101, titleBottom: 1140, nestedLink });
      scrollCollectionIntoView('smooth');
      expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 680.5, behavior: 'smooth' });
      expect(link.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
      expect(heading.focus).not.toHaveBeenCalled();
    },
  );

  it('keeps heading focus when a small identity-clearance adjustment still leaves it visible', () => {
    const { scrollTo, heading, link } = fixture({ titleTop: 1070, titleBottom: 1109 });
    scrollCollectionIntoView('instant');
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 649.5, behavior: 'instant' });
    expect(heading.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(link.focus).not.toHaveBeenCalled();
  });

  it('does not scroll a route with no collection', () => {
    const { scrollTo, heading, link } = fixture();
    vi.stubGlobal('document', { getElementById: () => null });
    scrollCollectionIntoView('instant');
    expect(scrollTo).not.toHaveBeenCalled();
    expect(heading.focus).not.toHaveBeenCalled();
    expect(link.focus).not.toHaveBeenCalled();
  });
});
