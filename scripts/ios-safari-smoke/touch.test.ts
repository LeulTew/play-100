import assert from 'node:assert/strict';
import { test } from 'vitest';
import { assertTouchHold, touchDrag, touchTap } from './touch.ts';

test('tap uses one W3C touch pointer with integer viewport coordinates and a real press', () => {
  assert.deepEqual(touchTap({ x: 116.5, y: 525 }), {
    actions: [
      {
        type: 'pointer',
        id: 'finger',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', origin: 'viewport', duration: 0, x: 117, y: 525 },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 100 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ],
  });
});

test('drag holds the same touch for 600 ms before moving and releasing it', () => {
  assert.deepEqual(touchDrag({ x: 30, y: 100 }, { x: 30, y: 160 }).actions[0]?.actions, [
    { type: 'pointerMove', origin: 'viewport', duration: 0, x: 30, y: 100 },
    { type: 'pointerDown', button: 0 },
    { type: 'pause', duration: 600 },
    { type: 'pointerMove', origin: 'viewport', duration: 0, x: 30, y: 100 },
    ...[108, 115, 123, 130, 138, 145, 153, 160].map((y) => ({
      type: 'pointerMove',
      origin: 'viewport',
      duration: 75,
      x: 30,
      y,
    })),
    { type: 'pause', duration: 200 },
    { type: 'pointerMove', origin: 'viewport', duration: 0, x: 30, y: 160 },
    { type: 'pointerUp', button: 0 },
  ]);
});

test('observed touch timestamps must prove a stationary hold and release', () => {
  const events = [
    { type: 'touchstart', trusted: true, atMs: 100, x: 30, y: 100 },
    { type: 'touchmove', trusted: true, atMs: 730, x: 30, y: 108 },
    { type: 'touchend', trusted: true, atMs: 1500, x: 30, y: 160 },
  ];
  assert.equal(assertTouchHold(events), 630);
  assert.throws(
    () => assertTouchHold(events.map((event) => (event.type === 'touchmove' ? { ...event, atMs: 122 } : event))),
    /movement began after 22 ms/,
  );
  assert.throws(() => assertTouchHold(events.slice(0, 2)), /must be released/);
});

test('invalid or off-screen touch coordinates cannot reach the driver', () => {
  for (const point of [
    { x: NaN, y: 1 },
    { x: 1, y: Infinity },
    { x: -1, y: 1 },
  ]) {
    assert.throws(() => touchTap(point));
    assert.throws(() => touchDrag({ x: 1, y: 1 }, point));
  }
});
