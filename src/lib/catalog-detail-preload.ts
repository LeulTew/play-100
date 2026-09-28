import { createMemoizedModule } from './memoized-module';

export const loadCatalogDetail = createMemoizedModule(() => import('../components/personal/CatalogDetail')).load;
