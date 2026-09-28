import { useState } from 'react';

/**
 * The first of a run of equivalent values. A hook that rebuilds an equal value every render (parsed URL filters, a
 * spread result) then keeps one identity, so memoised children and dependency lists see a change only when there is one.
 */
export function useEquivalentValue<T>(value: T, equivalent: (held: T, next: T) => boolean): T {
  const [held, setHeld] = useState(value);
  if (held === value || equivalent(held, value)) return held;
  setHeld(value);
  return value;
}
