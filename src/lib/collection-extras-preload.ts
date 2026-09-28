import { createMemoizedModule } from './memoized-module';

export const collectionExtrasModule = createMemoizedModule(() => import('../components/CollectionExtras'));

export function preloadCollectionExtras(): void {
  void collectionExtrasModule.load().catch(() => {
    console.warn('Collection tools could not be preloaded. Opening them will offer guarded reload recovery.');
  });
}
