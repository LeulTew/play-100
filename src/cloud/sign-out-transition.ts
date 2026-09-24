import type { ScopedLibrary } from '../lib/cloud-types';

export const UNSYNCED_DEVICE_COPY = 'This device has unsynced changes. Save or export them before removing its copy. Ordinary Sign out keeps them.';
export const CHANGED_ACCOUNT = 'The signed-in account changed. Nothing was removed.';

export interface SignOutSteps {
  /** The user and auth session that started this sign-out are still signed in. */
  current: () => boolean;
  waitForWrites: () => Promise<unknown>;
  readDeviceCopy: () => Promise<ScopedLibrary>;
  /** Stops every automatic writer and returns how to restore each still-owned lifetime. */
  suspend: () => ReadonlyArray<() => void>;
  signOut: () => Promise<void>;
  removeDeviceCopy: (revision: number) => Promise<void>;
}

export async function signOutTransition(removeCopy: boolean, steps: SignOutSteps): Promise<void> {
  const removable = async () => {
    const local = await steps.readDeviceCopy();
    if (local.sync.dirty) throw new Error(UNSYNCED_DEVICE_COPY);
    return local;
  };
  if (removeCopy) {
    // Refuse a dirty or unreadable copy while sync and sharing are still live.
    await steps.waitForWrites();
    await removable();
    if (!steps.current()) throw new Error(CHANGED_ACCOUNT);
  }
  const restore = steps.suspend();
  let local: ScopedLibrary | null = null;
  try {
    await steps.waitForWrites();
    if (removeCopy) local = await removable();
    if (!steps.current()) throw new Error(CHANGED_ACCOUNT);
    await steps.signOut();
  } catch (cause) {
    // A refusal restores the same signed-in lifetimes; an identity change never resumes them.
    if (steps.current()) for (const resume of restore) resume();
    throw cause;
  }
  if (local) await steps.removeDeviceCopy(local.state.revision);
}
