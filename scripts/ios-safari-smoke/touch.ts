import assert from 'node:assert/strict';

export interface Point {
  x: number;
  y: number;
}

type PointerAction =
  | { type: 'pointerMove'; origin: 'viewport'; duration: number; x: number; y: number }
  | { type: 'pointerDown' | 'pointerUp'; button: 0 }
  | { type: 'pause'; duration: number };

function move(point: Point, duration: number): PointerAction {
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), 'Touch coordinates must be finite.');
  assert.ok(point.x >= 0 && point.y >= 0, 'Touch coordinates must be on screen.');
  return { type: 'pointerMove', origin: 'viewport', duration, x: Math.round(point.x), y: Math.round(point.y) };
}

function payload(actions: PointerAction[]) {
  return {
    actions: [{ type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' }, actions }],
  };
}

export function touchTap(point: Point) {
  return payload([
    move(point, 0),
    { type: 'pointerDown', button: 0 },
    { type: 'pause', duration: 100 },
    { type: 'pointerUp', button: 0 },
  ]);
}

export function touchDrag(from: Point, to: Point) {
  return payload([
    move(from, 0),
    { type: 'pointerDown', button: 0 },
    { type: 'pause', duration: 600 },
    move(to, 600),
    { type: 'pointerUp', button: 0 },
  ]);
}
