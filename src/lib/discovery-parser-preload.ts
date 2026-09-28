import { createMemoizedModule } from './memoized-module';

export const loadDiscoveryParser = createMemoizedModule(() => import('./discovery-catalog')).load;
