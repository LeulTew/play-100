import { createMemoizedModule } from './memoized-module';

/** The catalog's game detail, and The 100's (GameDetail), which ships in the same chunk. */
export const catalogDetailModule = createMemoizedModule(() => import('../components/personal/CatalogDetail'));
export const loadCatalogDetail = catalogDetailModule.load;
