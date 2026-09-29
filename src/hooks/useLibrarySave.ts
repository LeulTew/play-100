import { useCallback } from 'react';
import { actionMessage } from '../lib/action-message';
import type { LibraryController } from '../lib/library-controller';
import type { PersonalAction } from '../lib/personal-types';

/**
 * The app's save: runs a library action and announces it. Deliberately not a stable handler. An open editor keeps the
 * save it was given, so a draft it flushes after another tab changes the account, or starts opening one, still reaches
 * the library it was typed for; a stable handler would send it to whichever library the app shows by then.
 */
export function useLibrarySave({
  library: { perform, status },
  opening,
  notify,
  activeScope,
  scope,
}: {
  library: Pick<LibraryController, 'perform' | 'status'>;
  opening: boolean;
  notify: (message: string) => void;
  activeScope: Readonly<{ current: string }>;
  scope: string;
}) {
  return useCallback(
    async (action: PersonalAction, announce = true) => {
      if (opening) {
        notify('Wait for the account library to finish opening before changing saved data.');
        return false;
      }
      const success = await perform(action);
      if (success && activeScope.current === scope && announce)
        notify(
          `${actionMessage(action)}${status === 'temporary' ? ' This tab only: export a backup to keep it.' : ''}`,
        );
      return success;
    },
    [opening, notify, perform, activeScope, scope, status],
  );
}
