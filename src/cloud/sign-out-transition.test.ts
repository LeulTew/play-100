import { describe, expect, it, vi } from 'vitest';
import type { ScopedLibrary } from '../lib/cloud-types';
import { emptyPersonalLibrary } from '../lib/personal-library';
import { CHANGED_ACCOUNT, signOutTransition, UNSYNCED_DEVICE_COPY } from './sign-out-transition';
import type { SignOutSteps } from './sign-out-transition';

function copy(dirty: boolean, revision = 7): ScopedLibrary {
  return {
    version: 1,
    scope: 'account:demo-play100:alpha',
    state: { ...emptyPersonalLibrary(), revision },
    recovery: null,
    profile: null,
    sync: {
      enabled: true,
      epoch: 1,
      baseRemoteRevision: 3,
      remoteGeneration: null,
      dirty,
      dataRevision: 4,
      displayName: 'Alpha',
      lastSyncedAt: null,
    },
  };
}

function harness(reads: Array<ScopedLibrary | Error>, patch: Partial<SignOutSteps> = {}) {
  const events: string[] = [];
  const resumes = ['sync', 'friends', 'shelf', 'all'].map((name) =>
    vi.fn(() => {
      events.push(`resume:${name}`);
    }),
  );
  const steps: SignOutSteps = {
    current: vi.fn(() => true),
    waitForWrites: vi.fn(async () => {
      events.push('drain');
    }),
    readDeviceCopy: vi.fn(async () => {
      const next = reads.shift();
      if (!next) throw new Error('Unexpected device-copy read.');
      events.push('read');
      if (next instanceof Error) throw next;
      return next;
    }),
    suspend: vi.fn(() => {
      events.push('suspend');
      return resumes;
    }),
    signOut: vi.fn(async () => {
      events.push('sign-out');
    }),
    removeDeviceCopy: vi.fn(async (revision: number) => {
      events.push(`remove:${revision}`);
    }),
    ...patch,
  };
  return { steps, events, resumes };
}

describe('sign-out transition', () => {
  it('refuses a copy dirtied during the confirmation before suspending any automatic writer', async () => {
    const { steps, events } = harness([copy(true)]);
    await expect(signOutTransition(true, steps)).rejects.toThrow(UNSYNCED_DEVICE_COPY);
    expect(events).toEqual(['drain', 'read']);
    expect(steps.suspend).not.toHaveBeenCalled();
    expect(steps.signOut).not.toHaveBeenCalled();
    expect(steps.removeDeviceCopy).not.toHaveBeenCalled();
  });

  it('refuses an unreadable copy before suspending any automatic writer', async () => {
    const { steps, events } = harness([new Error('Synthetic storage failure')]);
    await expect(signOutTransition(true, steps)).rejects.toThrow('Synthetic storage failure');
    expect(events).toEqual(['drain', 'read']);
    expect(steps.suspend).not.toHaveBeenCalled();
    expect(steps.removeDeviceCopy).not.toHaveBeenCalled();
  });

  async function expectRestoredRefusal(reads: Array<ScopedLibrary | Error>, message: string) {
    const { steps, events, resumes } = harness(reads);
    await expect(signOutTransition(true, steps)).rejects.toThrow(message);
    expect(events).toEqual([
      'drain',
      'read',
      'suspend',
      'drain',
      'read',
      'resume:sync',
      'resume:friends',
      'resume:shelf',
      'resume:all',
    ]);
    for (const resume of resumes) expect(resume).toHaveBeenCalledOnce();
    expect(steps.signOut).not.toHaveBeenCalled();
    expect(steps.removeDeviceCopy).not.toHaveBeenCalled();
  }

  it('restores every suspended lifetime when the copy changes after draining writes, and removes nothing', async () => {
    await expectRestoredRefusal([copy(false), copy(true)], UNSYNCED_DEVICE_COPY);
  });

  it('restores every suspended lifetime when the copy cannot be read after suspension, and removes nothing', async () => {
    await expectRestoredRefusal([copy(false), new Error('Synthetic storage failure')], 'Synthetic storage failure');
  });

  it('restores an ordinary sign-out whose write drain or provider sign-out fails in the same session', async () => {
    const drained = harness([], {
      waitForWrites: vi.fn(async () => {
        throw new Error('Synthetic drain failure');
      }),
    });
    await expect(signOutTransition(false, drained.steps)).rejects.toThrow('Synthetic drain failure');
    for (const resume of drained.resumes) expect(resume).toHaveBeenCalledOnce();
    expect(drained.steps.readDeviceCopy).not.toHaveBeenCalled();
    expect(drained.steps.signOut).not.toHaveBeenCalled();
    const provider = harness([], {
      signOut: vi.fn(async () => {
        throw new Error('Synthetic sign-out failure');
      }),
    });
    await expect(signOutTransition(false, provider.steps)).rejects.toThrow('Synthetic sign-out failure');
    for (const resume of provider.resumes) expect(resume).toHaveBeenCalledOnce();
  });

  it('never resumes after the identity or auth session changes', async () => {
    let current = true;
    const { steps, resumes } = harness([copy(false), copy(false)], {
      current: vi.fn(() => current),
      suspend: vi.fn(() => {
        current = false;
        return resumes;
      }),
    });
    await expect(signOutTransition(true, steps)).rejects.toThrow(CHANGED_ACCOUNT);
    for (const resume of resumes) expect(resume).not.toHaveBeenCalled();
    expect(steps.signOut).not.toHaveBeenCalled();
    expect(steps.removeDeviceCopy).not.toHaveBeenCalled();
    const signedOut = harness([copy(false), copy(false)]);
    signedOut.steps.signOut = vi.fn(async () => {
      current = false;
      throw new Error('Signed out before the provider reported failure');
    });
    signedOut.steps.current = vi.fn(() => current);
    current = true;
    await expect(signOutTransition(true, signedOut.steps)).rejects.toThrow(
      'Signed out before the provider reported failure',
    );
    for (const resume of signedOut.resumes) expect(resume).not.toHaveBeenCalled();
  });

  it('keeps the successful removal and ordinary sign-out paths', async () => {
    const removal = harness([copy(false, 9), copy(false, 9)]);
    await signOutTransition(true, removal.steps);
    expect(removal.events).toEqual(['drain', 'read', 'suspend', 'drain', 'read', 'sign-out', 'remove:9']);
    for (const resume of removal.resumes) expect(resume).not.toHaveBeenCalled();
    const ordinary = harness([]);
    await signOutTransition(false, ordinary.steps);
    expect(ordinary.events).toEqual(['suspend', 'drain', 'sign-out']);
    expect(ordinary.steps.readDeviceCopy).not.toHaveBeenCalled();
    expect(ordinary.steps.removeDeviceCopy).not.toHaveBeenCalled();
    for (const resume of ordinary.resumes) expect(resume).not.toHaveBeenCalled();
  });
});
