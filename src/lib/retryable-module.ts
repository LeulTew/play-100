import { ModuleLoadFailure } from './chunk-recovery';

export function createRetryableModule<T>(importModule: () => Promise<T>) {
  let value: T | null = null;
  let pending: Promise<T> | null = null;
  return {
    peek: () => value,
    started: () => value !== null || pending !== null,
    load(): Promise<T> {
      if (value !== null) return Promise.resolve(value);
      if (pending) return pending;
      pending = Promise.resolve()
        .then(importModule)
        .then(
          (module) => {
            value = module;
            pending = null;
            return module;
          },
          (error) => {
            throw new ModuleLoadFailure(error);
          },
        );
      return pending;
    },
  };
}
