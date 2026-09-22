import { describe, expect, it } from 'vitest';
import {
  copyPublicMotionVisual, createCatalogMotionVisual, fitMotionVisual,
  MOTION_TIMINGS, motionTransform, visibleMotionRect,
} from './public-visual';

const src = `/images/discovery/${'a'.repeat(64)}.webp`;

describe('public-only motion descriptors', () => {
  it('narrows an exact local image without carrying unrelated metadata into the visual', () => {
    const artwork = { src, width: 320, height: 240, credit: 'The real UI keeps its credits', privateNote: 'Not a visual field' };
    expect(createCatalogMotionVisual(artwork)).toEqual({ kind: 'catalog-art', src, width: 320, height: 240 });
    expect(createCatalogMotionVisual(null)).toBeNull();
    expect(createCatalogMotionVisual(undefined)).toBeNull();
  });

  it.each([
    '/covers/game.webp', 'https://example.com/art.webp', '/images/discovery/not-a-hash.webp',
    `${src}?private=1`, src.replace('.webp', '.png'), src.replace('aaaa', 'AAAA'),
  ])('rejects unapproved image paths: %s', invalid => {
    expect(createCatalogMotionVisual({ src: invalid, width: 320, height: 240 })).toBeNull();
  });

  it.each([0, -1, 1.5, 641, Infinity, NaN])('rejects unbounded dimensions: %s', value => {
    expect(createCatalogMotionVisual({ src, width: value, height: 240 })).toBeNull();
    expect(createCatalogMotionVisual({ src, width: 320, height: value })).toBeNull();
  });

  it('allows only a public canonical rank for the first-party sleeve', () => {
    expect(copyPublicMotionVisual({ kind: 'jacket', rank: 7 })).toEqual({ kind: 'jacket', rank: 7 });
    for (const rank of [0, 101, 1.5, NaN]) expect(copyPublicMotionVisual({ kind: 'jacket', rank })).toBeNull();
  });

  it('does not enlarge a catalog bitmap beyond its supplied native dimensions', () => {
    const visual = createCatalogMotionVisual({ src, width: 160, height: 100 });
    if (!visual) throw new Error('Fixture artwork must validate.');
    expect(fitMotionVisual(visual, { x: 0, y: 0, width: 320, height: 200 }))
      .toEqual({ x: 80, y: 50, width: 160, height: 100 });
    expect(fitMotionVisual(visual, { x: 10, y: 20, width: 80, height: 50 }))
      .toEqual({ x: 10, y: 20, width: 80, height: 50 });
  });

  it('requires finite visible geometry instead of inventing an offscreen origin', () => {
    expect(visibleMotionRect({ x: 10, y: 20, width: 80, height: 50 }, 320, 640)).toBe(true);
    for (const rect of [
      { x: -1, y: 20, width: 80, height: 50 },
      { x: 300, y: 20, width: 80, height: 50 },
      { x: 10, y: 20, width: 0, height: 50 },
      { x: 10, y: Infinity, width: 80, height: 50 },
    ]) expect(visibleMotionRect(rect, 320, 640)).toBe(false);
  });

  it('shares the locked flight durations across both collection and catalog', () => {
    expect(MOTION_TIMINGS.artwork).toEqual({
      enter: { fine: 240, coarse: 220 }, return: { fine: 160, coarse: 160 },
    });
    expect(MOTION_TIMINGS.menu).toBe(180);
    expect(MOTION_TIMINGS.dialog).toBe(160);
    expect(MOTION_TIMINGS.localArtwork.fine).toBeLessThanOrEqual(160);
    expect(MOTION_TIMINGS.localArtwork.coarse).toBeLessThanOrEqual(140);
  });

  it('encodes a bounded rectangle mapping without layout-property animation', () => {
    expect(motionTransform({ x: 20, y: 30, width: 100, height: 80 }, { x: 320, y: 130, width: 200, height: 160 }))
      .toBe('translate(-300px, -100px) scale(0.5, 0.5)');
  });
});
