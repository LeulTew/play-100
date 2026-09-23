import { createRetryableModule } from './retryable-module';

export const loadCatalogDetail = createRetryableModule(() => import('../components/personal/CatalogDetail')).load;
