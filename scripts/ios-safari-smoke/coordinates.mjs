import assert from 'node:assert/strict';

export function tapCoordinates({ target, anchor, nativeAnchor, viewport, label = 'control' }) {
  for (const rect of [target, anchor]) {
    for (const key of ['left', 'top', 'right', 'bottom']) assert.ok(Number.isFinite(rect[key]), `Invalid ${key}.`);
  }
  for (const key of ['x', 'y', 'width', 'height']) assert.ok(Number.isFinite(nativeAnchor[key]), `Invalid native ${key}.`);
  for (const key of ['offsetLeft', 'offsetTop', 'width', 'height', 'scale']) {
    assert.ok(Number.isFinite(viewport[key]), `Invalid viewport ${key}.`);
  }
  assert.ok(viewport.scale > 0 && viewport.width > 0 && viewport.height > 0, 'Viewport must have positive dimensions.');
  const left = Math.max(target.left, viewport.offsetLeft);
  const right = Math.min(target.right, viewport.offsetLeft + viewport.width);
  const top = Math.max(target.top, viewport.offsetTop);
  const bottom = Math.min(target.bottom, viewport.offsetTop + viewport.height);
  assert.ok(right > left && bottom > top, `The "${label}" control must intersect the visible viewport.`);
  return {
    x: nativeAnchor.x + nativeAnchor.width / 2 +
      ((left + right) / 2 - (anchor.left + anchor.right) / 2) * viewport.scale,
    y: nativeAnchor.y + nativeAnchor.height / 2 +
      ((top + bottom) / 2 - (anchor.top + anchor.bottom) / 2) * viewport.scale,
  };
}
