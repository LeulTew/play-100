import assert from 'node:assert/strict';
import test from 'node:test';
import { tapCoordinates } from './coordinates.mjs';

test('tap the whole navigation control rather than its text under Safari chrome', () => {
  assert.deepEqual(tapCoordinates({
    target: { left: 82, right: 150, top: 487, bottom: 541 },
    anchor: { left: 92, right: 141, top: 518, bottom: 534 },
    nativeAnchor: { x: 92, y: 538, width: 49, height: 16 },
    viewport: { offsetLeft: 0, offsetTop: 0, width: 375, height: 547, scale: 1 },
  }), { x: 116, y: 534 });
});

test('tap the tab icon above the browser toolbar shadow on a large phone', () => {
  assert.deepEqual(tapCoordinates({
    target: { left: 126, right: 146, top: 708, bottom: 728 },
    anchor: { left: 112, right: 160, top: 731, bottom: 747 },
    nativeAnchor: { x: 112, y: 793, width: 48, height: 16 },
    viewport: { offsetLeft: 0, offsetTop: 0, width: 440, height: 760, scale: 1 },
  }), { x: 136, y: 780 });
});

test('use the visible part of a control after Safari zoom and horizontal pan', () => {
  const point = tapCoordinates({
    target: { left: 10, right: 80, top: 460, bottom: 510 },
    anchor: { left: 23, right: 68, top: 480, bottom: 496 },
    nativeAnchor: { x: -28.8, y: 542, width: 54, height: 19.2 },
    viewport: { offsetLeft: 47, offsetTop: 45, width: 328, height: 478, scale: 1.2 },
  });
  assert.ok(Math.abs(point.x - 19.8) < 0.001);
  assert.ok(Math.abs(point.y - 548) < 0.001);
});

test('reject invisible controls and invalid measurements', () => {
  const measurements = {
    target: { left: 10, right: 80, top: 460, bottom: 510 },
    anchor: { left: 23, right: 68, top: 480, bottom: 496 },
    nativeAnchor: { x: 23, y: 500, width: 45, height: 16 },
    viewport: { offsetLeft: 100, offsetTop: 0, width: 375, height: 547, scale: 1 },
  };
  assert.throws(() => tapCoordinates(measurements), /intersect/);
  assert.throws(() => tapCoordinates({ ...measurements, viewport: { ...measurements.viewport, scale: NaN } }), /Invalid/);
});
