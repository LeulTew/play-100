import { createContext } from 'react';
import type { CompareDragController } from './compare-drag-controller';

export const CompareDragSourceContext = createContext<CompareDragController | null>(null);
