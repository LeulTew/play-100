import { useState } from 'react';

export interface HeldGeneration<T extends readonly unknown[]> {
  readonly values: T;
  readonly generation: number;
}

/** The held generation, or the next one when any value changed. */
export function advanceGeneration<T extends readonly unknown[]>(held: HeldGeneration<T>, values: T): HeldGeneration<T> {
  return held.values.length === values.length && held.values.every((value, index) => Object.is(value, values[index]))
    ? held
    : { values, generation: held.generation + 1 };
}

/**
 * Counts the changes of `values` as React state, so the count is part of the render that commits it: a render React
 * discards never advances it, and a later render cannot see a count its own values did not produce.
 */
export function useCommittedGeneration<T extends readonly unknown[]>(values: T): number {
  const [held, setHeld] = useState<HeldGeneration<T>>(() => ({ values, generation: 0 }));
  const next = advanceGeneration(held, values);
  if (next !== held) setHeld(next);
  return next.generation;
}
