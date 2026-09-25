import { createContext } from 'react';
import type { PwaUpdateGuard } from '../pwa/types';

export const ReloadGuardContext = createContext<(() => PwaUpdateGuard) | null>(null);
