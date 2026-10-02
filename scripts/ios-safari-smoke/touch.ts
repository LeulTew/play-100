import assert from 'node:assert/strict';

export interface Point {
  x: number;
  y: number;
}

export interface TouchEvidence extends Point {
  type: string;
  trusted: boolean;
  atMs: number;
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
    move(from, 0),
    ...Array.from({ length: 8 }, (_, index) =>
      move(
        {
          x: from.x + ((to.x - from.x) * (index + 1)) / 8,
          y: from.y + ((to.y - from.y) * (index + 1)) / 8,
        },
        75,
      ),
    ),
    { type: 'pause', duration: 200 },
    move(to, 0),
    { type: 'pointerUp', button: 0 },
  ]);
}

export function assertTouchHold(events: TouchEvidence[]) {
  const start = events.find((event) => event.type === 'touchstart');
  assert.ok(start?.trusted, 'The hold must start with a trusted touch.');
  const movement = events.find(
    (event) => event.type === 'touchmove' && Math.hypot(event.x - start.x, event.y - start.y) > 2,
  );
  assert.ok(movement?.trusted, 'The held finger must produce trusted movement.');
  const holdMs = movement.atMs - start.atMs;
  assert.ok(holdMs >= 500, `The requested 600 ms hold was not delivered: movement began after ${holdMs} ms.`);
  assert.ok(
    events.some((event) => event.type === 'touchend' && event.trusted),
    'The held touch must be released.',
  );
  return holdMs;
}
