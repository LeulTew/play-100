import { createContext, useContext } from 'react';

// False while the active library is still loading (or an account library is opening), so a toggle's
// stored state is not known yet. Defaults to known for renders outside the app shell.
export const LibraryStateKnownContext = createContext(true);

export function useLibraryStateKnown(): boolean {
  return useContext(LibraryStateKnownContext);
}

/**
 * ARIA for a library toggle (APG toggle button). While the state is unknown it omits `aria-pressed`
 * rather than announcing a possibly wrong "not pressed", and marks the button busy instead.
 */
export function pressedState(known: boolean, pressed: boolean): { 'aria-pressed'?: boolean; 'aria-busy'?: true } {
  return known ? { 'aria-pressed': pressed } : { 'aria-busy': true };
}

export function useLibraryPressedState(pressed: boolean) {
  return pressedState(useLibraryStateKnown(), pressed);
}
