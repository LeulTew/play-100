import type { PublicMotionVisual } from './types';

export const MOTION_TIMINGS = {
  artwork: { enter: { fine: 240, coarse: 220 }, return: { fine: 160, coarse: 160 } },
  localArtwork: { fine: 160, coarse: 140 },
  dialog: 160,
  menu: 180,
  sheet: 220,
} as const;

export const MOTION_EASING = 'cubic-bezier(.16,1,.3,1)';
export const MOTION_ORIGIN_TTL = 1500;

export function isCatalogMotionSource(src: string): src is `/images/discovery/${string}.webp` {
  return /^\/images\/discovery\/[a-f0-9]{64}\.webp$/.test(src);
}

export function createCatalogMotionVisual(
  artwork: Readonly<{ src: string; width: number; height: number }> | null | undefined,
): Extract<PublicMotionVisual, { kind: 'catalog-art' }> | null {
  if (!artwork) return null;
  const { src, width, height } = artwork;
  if (!isCatalogMotionSource(src) || !Number.isInteger(width) || width < 1 || width > 640 ||
    !Number.isInteger(height) || height < 1 || height > 640) return null;
  return { kind: 'catalog-art', src, width, height };
}

export function copyPublicMotionVisual(visual: PublicMotionVisual): PublicMotionVisual | null {
  if (visual.kind === 'catalog-art') return createCatalogMotionVisual(visual);
  return Number.isInteger(visual.rank) && visual.rank >= 1 && visual.rank <= 100
    ? { kind: 'jacket', rank: visual.rank } : null;
}

export interface MotionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function visibleMotionRect(rect: MotionRect, width: number, height: number): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 && rect.height > 0 && rect.x >= 0 && rect.y >= 0 &&
    rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1;
}

export function fitMotionVisual(visual: PublicMotionVisual, rect: MotionRect): MotionRect {
  if (visual.kind === 'jacket') return rect;
  const scale = Math.min(1, rect.width / visual.width, rect.height / visual.height);
  const width = visual.width * scale;
  const height = visual.height * scale;
  return { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
}

export function motionTransform(from: MotionRect, to: MotionRect): string {
  return `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.width / to.width}, ${from.height / to.height})`;
}

export function createPublicMotionElement(
  visual: PublicMotionVisual,
  rect: MotionRect,
  phase: 'enter' | 'return',
): HTMLElement {
  const element = document.createElement('div');
  element.className = 'motion-public-visual';
  element.dataset.motionVisual = visual.kind;
  element.dataset.motionPhase = phase;
  element.setAttribute('aria-hidden', 'true');
  element.inert = true;
  Object.assign(element.style, {
    left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px`,
  });
  if (visual.kind === 'jacket') {
    const rank = document.createElement('span');
    rank.className = 'motion-public-rank';
    rank.textContent = String(visual.rank).padStart(2, '0');
    rank.style.fontSize = `${Math.min(rect.width, rect.height) * .65}px`;
    element.append(rank);
  } else {
    const image = document.createElement('img');
    image.src = visual.src;
    image.width = visual.width;
    image.height = visual.height;
    image.alt = '';
    image.draggable = false;
    element.append(image);
  }
  return element;
}
