export interface CountState {
  value: number;
  velocity: number;
}

const damping = 45;
const stiffness = 240;
const separation = Math.sqrt(damping * damping - 4 * stiffness);
const slow = (-damping + separation) / 2;
const fast = (-damping - separation) / 2;

export function stepCount(from: Readonly<CountState>, to: number, elapsedMs: number): CountState & { done: boolean } {
  if (elapsedMs >= 3000) return { value: to, velocity: 0, done: true };
  if (elapsedMs <= 0) return { ...from, done: from.value === to && from.velocity === 0 };
  // Closed-form overdamping preserves the original 45/240 spring without a shared animation engine.
  const offset = from.value - to;
  const a = (from.velocity - fast * offset) / separation;
  const b = offset - a;
  const elapsed = elapsedMs / 1000;
  const slowPart = a * Math.exp(slow * elapsed);
  const fastPart = b * Math.exp(fast * elapsed);
  const value = to + slowPart + fastPart;
  const velocity = slow * slowPart + fast * fastPart;
  const done = Math.abs(value - to) < 0.005 && Math.abs(velocity) < 0.01;
  return done ? { value: to, velocity: 0, done } : { value, velocity, done };
}
