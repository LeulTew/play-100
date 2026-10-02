import { useCallback } from 'react';
import type { ReactNode } from 'react';
import type { CatalogArtwork } from '../../lib/discovery-catalog';
import { resetLibraryAndCompare } from '../../lib/compare-tray';
import type { CompareTrayStore } from '../../lib/compare-tray';
import { visibleMenuTrigger } from '../../lib/dialog-focus';
import { ONLINE_AVAILABLE } from '../../lib/online-availability';
import type { MotionOriginLease } from '../../motion';
import { useNotice } from '../../hooks/useNotice';
import { SavedCatalogCopies } from '../catalog/SavedCatalogCopies';
import type { AppModel } from './app-model';
import { DialogHost } from './DialogHost';

export interface AppDialogsProps {
  app: AppModel;
  clearComparePins: CompareTrayStore['clear'];
  origin: MotionOriginLease | undefined;
  artwork: ReadonlyMap<string, CatalogArtwork>;
  previewLoading: boolean;
  previewModuleError: boolean;
  panelRecovery: ReactNode;
}

/** The detail dialogs, Menu, credits, Settings and share fallback. Only an open detail reads the notice. */
export function AppDialogs({
  app,
  clearComparePins,
  origin,
  artwork,
  previewLoading,
  previewModuleError,
  panelRecovery,
}: AppDialogsProps) {
  const { page, panel, manualLink, selectedSlug, onlineOpening, commands, libraryScope, library, games } = app;
  const { selectedGame, selectedRecord, selectedPersonalRecord, collection, awaitingCanonicalPreview } = app;
  const { panelMessage, panelMessageError, panelFailure, panelFromMenu, pwaEnabled, capabilities } = app;
  const { openGame, closeGame, rankingPosition, libraryBusy } = app;
  // Stable, so the open Menu's navigation listener stays subscribed across the commits its other props cause.
  const closePanel = useCallback(() => commands.setPanel(null), [commands]);
  const gameOpen = Boolean(selectedGame && selectedPersonalRecord && !onlineOpening);
  const catalogOpen = Boolean(!selectedGame && selectedRecord && !onlineOpening);
  const notice = useNotice(app.notices, gameOpen || catalogOpen);
  return (
    <DialogHost
      page={page}
      scope={libraryScope}
      getGameOpener={app.getGameOpener}
      game={
        selectedGame && selectedPersonalRecord && !onlineOpening
          ? {
              key: `${libraryScope}:${selectedPersonalRecord.id}`,
              navigation: {
                scoped: page === 'collection',
                filters: app.filters,
                games: games ?? [],
                state: library.state,
                ownership: app.ownership,
              },
              props: {
                game: selectedGame,
                motionOrigin: origin,
                state: library.state.progress[selectedPersonalRecord.id],
                onClose: closeGame,
                getOpener: app.getGameOpener,
                onOpen: openGame,
                onToggle: commands.toggle,
                onShare: () => commands.shareView(selectedGame.slug),
                shareFeedback: notice || library.error || '',
                busy: libraryBusy,
                played: library.state.progress[selectedPersonalRecord.id]?.played,
                onPlayed: (value) => commands.toggle(selectedGame.slug, 'played', value),
                rankingPosition: rankingPosition || null,
                onRank: commands.rankSelected,
                personalRating:
                  library.state.ranking.find((entry) => entry.id === selectedPersonalRecord.id)?.score ?? null,
                onRate: (score) => commands.perform({ type: 'rate-game', record: selectedPersonalRecord, score }),
                savedCopies: (
                  <SavedCatalogCopies
                    canonicalId={selectedGame.slug}
                    copies={app.ownership.get(selectedGame.slug)}
                    onOpen={(record, _origin, opener) => openGame(record.id, opener)}
                  />
                ),
              },
            }
          : null
      }
      catalog={
        !selectedGame && selectedRecord && !onlineOpening
          ? {
              key: `${libraryScope}:${selectedRecord.id}`,
              props: {
                record: selectedRecord,
                artwork: artwork.get(selectedRecord.id),
                motionOrigin: origin,
                publicLookup: app.publicLookup,
                saved: Boolean(library.state.records[selectedRecord.id]),
                feedback: notice,
                error: library.error ?? '',
                progress: library.state.progress[selectedRecord.id],
                rankingPosition: rankingPosition || null,
                rating: library.state.ranking.find((entry) => entry.id === selectedRecord.id)?.score ?? null,
                busy: libraryBusy,
                onClose: closeGame,
                getOpener: app.getGameOpener,
                onAction: commands.performDetailAction,
                onRankings: () => void commands.guardedNavigation(() => commands.navigate('rankings')),
              },
            }
          : null
      }
      loadingGame={Boolean(
        selectedSlug &&
        (previewLoading || (awaitingCanonicalPreview && collection.status === 'loading')) &&
        !selectedRecord &&
        !onlineOpening,
      )}
      canonicalError={
        awaitingCanonicalPreview && collection.status === 'error' && !onlineOpening
          ? { message: collection.error, retry: collection.retry }
          : null
      }
      metadataFailure={previewModuleError}
      missingGame={Boolean(
        selectedSlug &&
        !awaitingCanonicalPreview &&
        !previewLoading &&
        !previewModuleError &&
        collection.status !== 'loading' &&
        library.status !== 'loading' &&
        !onlineOpening &&
        !selectedRecord,
      )}
      onCloseGame={closeGame}
      menu={
        panel === 'menu'
          ? {
              key: libraryScope,
              props: {
                page,
                gamesView: app.gamesView,
                filters: app.filters,
                onlineAvailable: ONLINE_AVAILABLE,
                creator: Boolean(!onlineOpening && app.online?.identity?.verified && app.online.creator),
                onNavigate: commands.navigate,
                onSettings: () => commands.openSettings(false),
                onOffline: pwaEnabled ? () => commands.openSettings(true) : undefined,
                onAbout: () => commands.setPanel('about'),
                onClose: closePanel,
                getOpener: app.getPanelOpener,
                captureFocusGuard: app.captureFocusGuard,
                status: panelMessage,
                statusError: panelMessageError,
                recovery: panelRecovery,
              },
            }
          : null
      }
      about={
        panel === 'about'
          ? {
              onClose: closePanel,
              getOpener: app.getPanelOpener,
              getReturnFocus: panelFromMenu ? visibleMenuTrigger : undefined,
            }
          : null
      }
      settings={
        panel === 'settings'
          ? {
              key: libraryScope,
              props: {
                motion: library.state.motion,
                reducedMotion: capabilities.reducedMotion,
                constrained: capabilities.constrained,
                saved: app.savedCount,
                completed: app.completedCount,
                warning: app.warning,
                onMotion: (motion) => commands.perform({ type: 'set-motion', motion }, false),
                onReset: () => resetLibraryAndCompare(commands.resetLibrary, clearComparePins),
                onRestore: commands.restoreLibrary,
                state: library.state,
                persistent: library.status === 'ready',
                busy: libraryBusy,
                onAbout: () => commands.setPanel('about'),
                onAccount: ONLINE_AVAILABLE
                  ? () => {
                      void commands.accountEntry();
                    }
                  : undefined,
                onClose: closePanel,
                getOpener: app.getPanelOpener,
                status: panelMessage,
                statusError: panelMessageError,
                recovery: panelRecovery,
                getReturnFocus: panelFromMenu ? visibleMenuTrigger : undefined,
              },
            }
          : null
      }
      offlineSettings={
        pwaEnabled ? { pwa: app.pwa, open: app.offlineSettings, onUpdate: commands.applyPwaUpdate } : undefined
      }
      panelNotice={
        !panel && !manualLink && selectedSlug && (panelMessage || panelRecovery)
          ? {
              title: panelFailure ? 'Dialog unavailable' : panelMessage,
              content: panelRecovery || <p role="status">{panelMessage}</p>,
              onClose: closePanel,
            }
          : null
      }
      manualShare={manualLink ? { link: manualLink, onClose: commands.closeManualLink } : null}
    />
  );
}
