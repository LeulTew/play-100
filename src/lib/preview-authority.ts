import type { LibraryScope } from './cloud-types';

export interface PreviewAuthority {
  readonly kind: 'friend-shelf';
  readonly scope: LibraryScope;
  readonly ownerUid: string;
  readonly authGeneration: number;
  permits(id: string): boolean;
  subscribe(listener: () => void): () => void;
}

export function createShelfPreviewAuthority(scope: LibraryScope, ownerUid: string, authGeneration = 0) {
  let ids = new Set<string>();
  const listeners = new Set<() => void>();
  const authority: PreviewAuthority = {
    kind: 'friend-shelf',
    scope,
    ownerUid,
    authGeneration,
    permits: (id) => ids.has(id),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    authority,
    update(allowed: readonly string[]) {
      const next = new Set(allowed);
      if (next.size === ids.size && [...next].every((id) => ids.has(id))) return;
      ids = next;
      listeners.forEach((listener) => listener());
    },
  };
}
