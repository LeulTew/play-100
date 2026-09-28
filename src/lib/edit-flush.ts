import { flushPendingEdits } from '../hooks/useExitSave';

/** One save of the open rating or note editors, remembering the editor that blocked or broke it. */
export interface EditFlush {
  /** Resolves false when an open edit is invalid, and rejects when saving it failed. */
  run(): Promise<boolean>;
  readonly target: HTMLElement | null;
}

export function editFlush(): EditFlush {
  let target: HTMLElement | null = null;
  return {
    run: () =>
      flushPendingEdits((blocked) => {
        target = blocked;
      }),
    get target() {
      return target;
    },
  };
}
