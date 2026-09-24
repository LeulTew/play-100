import { createContext, useContext } from 'react';
import type { ActiveLibraryMode } from './library-controller';

export const LibraryModeContext = createContext<ActiveLibraryMode>({
  scope: 'guest',
  onlineEnabled: false,
  label: 'Device only',
});
export function useLibraryMode(): ActiveLibraryMode {
  return useContext(LibraryModeContext);
}
