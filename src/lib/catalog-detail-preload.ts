import { createMemoizedModule } from './memoized-module';

/** The catalog's game detail, and The 100's (GameDetail), which ships in the same chunk. */
export const { load: loadCatalogDetail, peek: peekCatalogDetail } = createMemoizedModule(
  () => import('../components/personal/CatalogDetail'),
);
