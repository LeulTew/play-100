import { createRetryableModule } from './retryable-module';

export const collectionExtrasModule = createRetryableModule(() => import('../components/CollectionExtras'));

export function preloadCollectionExtras(): void {
  void collectionExtrasModule.load().catch(() => {
    console.warn('Collection tools could not be preloaded. Opening them will offer guarded reload recovery.');
  });
}
