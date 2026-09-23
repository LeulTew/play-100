import { createContext, useContext } from 'react';
import type { CompareTraySnapshot, CompareTrayStore } from '../../lib/compare-tray';

export interface CompareTrayContextValue extends CompareTraySnapshot {
  currentScope: string;
  pin: CompareTrayStore['pin'];
  unpin: CompareTrayStore['unpin'];
  clear: CompareTrayStore['clear'];
  dismissError: CompareTrayStore['dismissError'];
}

export const CompareTrayContext = createContext<CompareTrayContextValue | null>(null);

export function useCompareTray(): CompareTrayContextValue {
  const context = useContext(CompareTrayContext);
  if (!context) throw new Error('Compare tray controls must be inside CompareTrayProvider.');
  return context;
}
