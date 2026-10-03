import type { ReactNode } from 'react';
import { useNotice } from '../../hooks/useNotice';
import { visibleMenuTrigger } from '../../lib/dialog-focus';
import { ROOT_FLAGS, useRootFlag } from '../../lib/root-flag';
import { Icon } from '../Icon';
import type { AppModel } from './app-model';

export interface AppToastProps {
  app: AppModel;
  trayError: string | null;
  onDismissTrayError: () => void;
  panelRecovery: ReactNode;
}

/** The page toast. It subscribes to the notice store itself, so a notice re-renders only the toast. */
export function AppToast({ app, trayError, onDismissTrayError, panelRecovery }: AppToastProps) {
  const { panel, manualLink, selectedSlug, panelMessage, selectedGame, selectedRecord, onlineOpening, commands } = app;
  const notice = useNotice(app.notices, true);
  const visibleNotice = (!panel && !manualLink && !selectedSlug ? panelMessage : '') || notice;
  // Tray errors use the existing polite provider status; the toast supplies their visible copy.
  const currentNotice = trayError || (!selectedGame && selectedRecord && !onlineOpening ? '' : visibleNotice);
  const toastRecovery = !panel && !manualLink && !selectedSlug && panelRecovery;
  const visible = Boolean(currentNotice || toastRecovery);
  // The visible toast marks <html> for the scroll padding and the tray beside it (root-flag.ts).
  useRootFlag('html', ROOT_FLAGS.toast, visible);
  return (
    <div
      className={`toast ${visible ? 'toast-visible' : ''}`}
      role={toastRecovery || trayError ? undefined : 'status'}
      aria-live={toastRecovery || trayError ? undefined : 'polite'}
      aria-atomic="true"
    >
      {toastRecovery ? (
        <>
          {toastRecovery}
          <button
            className="icon-button"
            aria-label="Dismiss loading error"
            onClick={() => {
              commands.dismissPanelMessage();
              visibleMenuTrigger()?.focus({ preventScroll: true });
            }}
          >
            <Icon name="close" width="17" height="17" />
          </button>
        </>
      ) : (
        currentNotice && (
          <>
            <Icon name="info" width="19" height="19" />
            <span>{currentNotice}</span>
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => {
                if (trayError) onDismissTrayError();
                else {
                  app.notices.clear();
                  if (!panelRecovery) commands.dismissPanelMessage();
                }
              }}
            >
              <Icon name="close" width="17" height="17" />
            </button>
          </>
        )
      )}
    </div>
  );
}
