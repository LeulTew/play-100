import { createRetryableModule } from './retryable-module';

export const loadDiscoveryParser = createRetryableModule(() => import('./discovery-catalog')).load;
