import { expect, it, vi } from 'vitest';
import { collectionExtrasModule, preloadCollectionExtras } from './collection-extras-preload';

const imports = vi.hoisted(() => vi.fn());
vi.mock('../components/CollectionExtras', () => {
  imports();
  return { default: () => null };
});

it('warms and shares one guarded entry for every conditional collection surface', async () => {
  expect(collectionExtrasModule.peek()).toBeNull();
  expect(collectionExtrasModule.started()).toBe(false);
  preloadCollectionExtras();
  const first = collectionExtrasModule.load();
  expect(collectionExtrasModule.load()).toBe(first);
  const module = await first;
  expect(collectionExtrasModule.peek()).toBe(module);
  expect(await collectionExtrasModule.load()).toBe(module);
  expect(imports).toHaveBeenCalledOnce();
});
