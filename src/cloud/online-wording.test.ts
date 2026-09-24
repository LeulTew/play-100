import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { SYNC_LABELS } from '../lib/cloud-types';
import { parseHead } from './cloud-store';
import { onlineError } from './errors';
import { friendMutationError } from './friend-outcomes';

describe('online service and saved-copy wording', () => {
  it('names a reached service limit the same way in errors, friend outcomes and the saving status', () => {
    expect(onlineError({ code: 'resource-exhausted' })).toBe('The online service has reached a limit. Changes remain on this device; try again later. Billing is not enabled automatically.');
    expect(friendMutationError({ code: 'resource-exhausted' })).toBe('The online service has reached a limit. Wait, then refresh to check whether the change was saved.');
    expect(SYNC_LABELS.quota).toBe('Waiting for the online service…');
    for (const text of [onlineError({ code: 'resource-exhausted' }), friendMutationError({ code: 'resource-exhausted' }), SYNC_LABELS.quota]) {
      expect(text).not.toMatch(/free (online )?quota|quota is|exhausted/i);
    }
  });

  it('describes the account copy and the online copy without storage protocol nouns', () => {
    expect(onlineError({ code: 'auth/user-token-expired' })).toBe("Your sign-in expired. Sign in again; local changes remain in this account's copy on this device.");
    expect(() => parseHead({ format: 2, epoch: 1, revision: 0, enabled: true, deleted: false, current: null, previous: null, updatedAt: Timestamp.now() }))
      .toThrow('The online copy uses an unsupported format. Your local data has not been replaced.');
  });
});
