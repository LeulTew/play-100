import { describe, expect, it } from 'vitest';
import {
  copyPublicMotionVisual,
  createCatalogMotionVisual,
  fitMotionVisual,
  jacketMotionClip,
  jacketMotionInsets,
  MOTION_TIMINGS,
  motionTransform,
  visibleMotionRect,
} from './public-visual';

const src = `/images/discovery/${'a'.repeat(64)}.webp`;

describe('public-only motion descriptors', () => {
  it('narrows an exact local image without carrying unrelated metadata into the visual', () => {
    const artwork = {
      src,
      width: 320,
      height: 240,
      credit: 'The real UI keeps its credits',
      privateNote: 'Not a visual field',
    };
    expect(createCatalogMotionVisual(artwork)).toEqual({ kind: 'catalog-art', src, width: 320, height: 240 });
    expect(createCatalogMotionVisual(null)).toBeNull();
    expect(createCatalogMotionVisual(undefined)).toBeNull();
  });

  it.each([
    '/covers/game.webp',
    'https://example.com/art.webp',
    '/images/discovery/not-a-hash.webp',
    `${src}?private=1`,
    src.replace('.webp', '.png'),
    src.replace('aaaa', 'AAAA'),
  ])('rejects unapproved image paths: %s', (invalid) => {
    expect(createCatalogMotionVisual({ src: invalid, width: 320, height: 240 })).toBeNull();
  });

  it.each([0, -1, 1.5, 641, Infinity, NaN])('rejects unbounded dimensions: %s', (value) => {
    expect(createCatalogMotionVisual({ src, width: value, height: 240 })).toBeNull();
    expect(createCatalogMotionVisual({ src, width: 320, height: value })).toBeNull();
  });

  it('keeps the canonical rank and bounded jacket variant, without unrelated metadata', () => {
    expect(copyPublicMotionVisual({ kind: 'jacket', rank: 7 })).toEqual({ kind: 'jacket', rank: 7, variant: 2 });
    for (let variant = 0; variant < 5; variant++)
      expect(copyPublicMotionVisual({ kind: 'jacket', rank: 7, variant })).toEqual({
        kind: 'jacket',
        rank: 7,
        variant,
      });
    for (const rank of [0, 101, 1.5, NaN]) expect(copyPublicMotionVisual({ kind: 'jacket', rank })).toBeNull();
    for (const variant of [-1, 5, 1.5, NaN])
      expect(copyPublicMotionVisual({ kind: 'jacket', rank: 7, variant })).toBeNull();
  });

  it('does not enlarge a catalog bitmap beyond its supplied native dimensions', () => {
    const visual = createCatalogMotionVisual({ src, width: 160, height: 100 });
    if (!visual) throw new Error('Fixture artwork must validate.');
    expect(fitMotionVisual(visual, { x: 0, y: 0, width: 320, height: 200 })).toEqual({
      x: 80,
      y: 50,
      width: 160,
      height: 100,
    });
    expect(fitMotionVisual(visual, { x: 10, y: 20, width: 80, height: 50 })).toEqual({
      x: 10,
      y: 20,
      width: 80,
      height: 50,
    });
  });

  it('requires finite visible geometry instead of inventing an offscreen origin', () => {
    expect(visibleMotionRect({ x: 10, y: 20, width: 80, height: 50 }, 320, 640)).toBe(true);
    for (const rect of [
      { x: -1, y: 20, width: 80, height: 50 },
      { x: 300, y: 20, width: 80, height: 50 },
      { x: 10, y: 20, width: 0, height: 50 },
      { x: 10, y: Infinity, width: 80, height: 50 },
    ])
      expect(visibleMotionRect(rect, 320, 640)).toBe(false);
  });

  it('shares the locked flight durations across both collection and catalog', () => {
    expect(MOTION_TIMINGS.artwork).toEqual({
      enter: { fine: 240, coarse: 220 },
      return: { fine: 160, coarse: 160 },
    });
    expect(MOTION_TIMINGS.menu).toBe(180);
    expect(MOTION_TIMINGS.dialog).toBe(160);
    expect(MOTION_TIMINGS.localArtwork.fine).toBeLessThanOrEqual(160);
    expect(MOTION_TIMINGS.localArtwork.coarse).toBeLessThanOrEqual(140);
  });

  it('encodes a bounded rectangle mapping without layout-property animation', () => {
    expect(motionTransform({ x: 20, y: 30, width: 100, height: 80 }, { x: 320, y: 130, width: 200, height: 160 })).toBe(
      'translate(-300px, -100px) scale(0.5, 0.5)',
    );
  });

  it('uses uniform sleeve scale and crops surplus above or right of the corner badge', () => {
    const from = { x: 20, y: 30, width: 100, height: 40 };
    const to = { x: 320, y: 130, width: 200, height: 160 };
    expect(motionTransform(from, to, true)).toBe('translate(-300px, -140px) scale(0.5, 0.5)');
    expect(jacketMotionClip(from, to)).toBe('inset(80px 0px 0px 0px)');
    expect(jacketMotionClip({ ...from, height: 80 }, { ...to, height: 100 })).toBe('inset(0px 75px 0px 0px)');
    expect(jacketMotionClip(to, to)).toBe('inset(0px 0px 0px 0px)');
  });

  it.each([
    ['none', [0, 0]],
    ['inset(0px)', [0, 0]],
    ['inset(12.5px 2.842170943040401e-14px 0px 0px)', [12.5, 2.842170943040401e-14]],
    ['inset(4E-7px 3.25px 0px 0px)', [4e-7, 3.25]],
  ] as const)('reads complete CSS pixel numbers from %s', (clip, expected) => {
    expect(jacketMotionInsets(clip)).toEqual(expected);
  });

  it('retains the recorded coarse return bounds despite a floating-point remainder', () => {
    const from = { x: 23, y: 439.4375, width: 347, height: 231.328125 };
    const to = { x: 22, y: 355.921875, width: 168, height: 135.46875 };
    const scale = Math.max(from.width / to.width, from.height / to.height);
    const [top, right] = jacketMotionInsets(jacketMotionClip(from, to));
    expect(right).toBeLessThan(1e-10);
    expect((to.width - right) * scale).toBeCloseTo(from.width, 10);
    expect((to.height - top) * scale).toBeCloseTo(from.height, 10);
  });
});
