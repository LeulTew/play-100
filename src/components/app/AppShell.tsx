import { memo, useCallback, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import type { CatalogArtwork } from '../../lib/discovery-catalog';
import type { LibraryRecord } from '../../lib/personal-types';
import { catalogPinnedIds } from '../../lib/catalog-identity';
import { ONLINE_AVAILABLE, ONLINE_CONFIG_ERROR } from '../../lib/online-availability';
import { prefetchAppTools } from '../../lib/app-tool-preload';
import type { MotionBindings } from '../../AppMotionBindings';
import { useStableHandler, useStableHandlers } from '../../hooks/useLatest';
import { ExtendedSearchResultsContext } from '../../hooks/useExtendedSearch';
import type { ExtendedSearchResults } from '../../hooks/useExtendedSearch';
import { createValueStore } from '../../lib/value-store';
import { ChunkRecovery } from '../ChunkRecovery';
import { SiteFooter } from '../SiteFooter';
import { AppDialogs } from './AppDialogs';
import { AppHeader } from './AppHeader';
import type { AppModel } from './app-model';
import { AppRoute } from './AppRoute';
import { AppToast } from './AppToast';
import type { CompareTray } from './CompareTrayBindings';
import { GlobalBanners } from './GlobalBanners';
import { MobileNav } from './MobileNav';
import { TrayHost } from './TrayHost';

const Header = memo(AppHeader);
const Footer = memo(SiteFooter);
const Navigation = memo(MobileNav);
const Banners = memo(GlobalBanners);

export interface AppShellProps {
  app: AppModel;
  mainRef: RefObject<HTMLElement | null>;
  motion: MotionBindings;
  tray: CompareTray;
  artwork: ReadonlyMap<string, CatalogArtwork>;
  previewLoading: boolean;
  previewModuleError: boolean;
}

/** The page App renders: header, banners, the route, footer, mobile navigation, dialogs and the toast. */
export function AppShell({ app, mainRef, motion, tray, artwork, previewLoading, previewModuleError }: AppShellProps) {
  const [searchResults] = useState(() => createValueStore<ExtendedSearchResults | null>(null));
  const { page, panel, manualLink, selectedSlug, onlineOpening, commands, notices } = app;
  const libraryRecovery = app.libraryScope === 'guest' && !onlineOpening && app.guestLibrary.canRetry;
  const pin = useStableHandler((record: LibraryRecord) => {
    if (!commands.pinAllowed()) {
      notices.notify('Wait for the correct account before pinning a game.');
      return false;
    }
    return tray.pin(record);
  });
  const pinnedIds = useMemo(() => catalogPinnedIds(tray.items), [tray.items]);
  const inlineTray = page === 'collection' && app.filters.view === 'table' && app.collection.status === 'ready';
  const trayHidden = onlineOpening || Boolean(selectedSlug) || Boolean(panel) || Boolean(manualLink);
  const trayHasContent = tray.items.length > 0 || Boolean(tray.warning) || Boolean(tray.error);
  // The table's inline strip shows its own error, so the toast doesn't repeat it (UX-007).
  const trayError = !app.motionBlocked && (!inlineTray || trayHidden) ? tray.error : null;
  const compare = useCallback(
    (records: LibraryRecord[]) => {
      void commands.compareGames(records);
    },
    [commands],
  );
  const resolveArtwork = useCallback((record: LibraryRecord) => artwork.get(record.id), [artwork]);
  const animate = app.capabilities.animate;
  const comparisonTray = useMemo(
    () => (
      <TrayHost
        page={page}
        tray={{
          layout: inlineTray ? 'inline' : 'dock',
          onCompare: compare,
          onPreview: motion.preview,
          onVisibilityChange: commands.setCompareTrayVisible,
          resolveArtwork,
          animate,
          hidden: trayHidden,
        }}
      />
    ),
    [page, inlineTray, compare, motion.preview, commands, resolveArtwork, animate, trayHidden],
  );
  const panelRecovery = app.panelFailure && (
    <ChunkRecovery
      key={app.panelFailure}
      message={app.panelFailure === 'about' ? "Credits didn't load." : "Settings didn't load."}
      intent={app.panelFailure === 'about' ? 'credits' : 'settings'}
      label={app.panelFailure === 'about' ? 'Reload and open credits' : 'Reload and open Settings'}
      onKeepEditing={() => commands.setPanel(null)}
    />
  );
  const chrome = useStableHandlers({
    onNavigateLink: (event: Parameters<AppModel['commands']['navigateLink']>[0], next: AppModel['page']) => {
      void commands.navigateLink(event, next);
    },
    onAccount: () => {
      void commands.accountEntry();
    },
    onQueue: () => {
      void commands.guardedNavigation(() => commands.navigate('library', { list: 'later' }));
    },
    onMenu: () => commands.setPanel('menu'),
    onSettings: () => commands.setPanel('settings'),
    onAbout: () => commands.setPanel('about'),
    onBrowseLink: (event: Parameters<AppModel['commands']['navigateLink']>[0]) => {
      void commands.navigateLink(event, 'collection', {}, commands.browse);
    },
  });
  return (
    <ExtendedSearchResultsContext.Provider value={searchResults}>
      <a className="skip-link" href={page === 'collection' ? '#collection' : '#page-main'}>
        Skip to {page === 'collection' ? 'the collection' : 'page content'}
      </a>
      <Header
        page={page}
        onlineAvailable={ONLINE_AVAILABLE}
        libraryScope={app.libraryScope}
        libraryLabel={app.libraryLabel}
        syncStatus={app.online?.status ?? 'device'}
        headerIdentity={app.headerIdentity}
        savedCount={app.savedCount}
        comparisonTray={!inlineTray && comparisonTray}
        compareChip={!inlineTray && !trayHidden && (trayHasContent || tray.dragging)}
        animate={animate}
        menuOpen={panel === 'menu'}
        pageHref={app.pageHref}
        onNavigateLink={chrome.onNavigateLink}
        onQueue={chrome.onQueue}
        onMenu={chrome.onMenu}
        onAccount={chrome.onAccount}
        onIntent={prefetchAppTools}
      />
      <Banners
        warning={app.warning}
        onlineConfigError={ONLINE_CONFIG_ERROR}
        offline={app.pwaEnabled && !app.pwa.online}
        offlineReady={app.pwa.offlineState === 'ready'}
        hintError={app.hintError}
        onSettings={chrome.onSettings}
        onAccount={chrome.onAccount}
        onDeviceOnly={commands.onDeviceOnly}
        onRetryLibrary={libraryRecovery ? app.guestLibrary.retry : undefined}
        retryBusy={libraryRecovery && app.guestLibrary.busy}
        captureRetryFocus={app.captureFocusGuard}
        onDiscardTemporary={libraryRecovery && app.guestLibrary.discardRequired ? app.guestLibrary.retry : undefined}
        temporaryRevision={
          libraryRecovery && app.guestLibrary.discardRequired ? app.guestLibrary.state.revision : undefined
        }
      />
      <main id="page-main" ref={mainRef}>
        {app.toolFailure?.scope === app.libraryScope && app.toolFailure.page === page && (
          <ChunkRecovery message="The comparison tools didn't load." />
        )}
        <AppRoute
          app={app}
          motion={motion}
          signInGames={tray.items.length}
          onPin={pin}
          onUnpin={tray.unpin}
          pinnedIds={pinnedIds}
          artwork={artwork}
          comparisonTray={inlineTray ? comparisonTray : undefined}
        />
      </main>
      <Footer onAbout={chrome.onAbout} onEffects={chrome.onSettings} effects={app.library.state.motion} />
      <Navigation
        page={page}
        personalPage={app.personalPage}
        gamesView={app.gamesView}
        onlineAvailable={ONLINE_AVAILABLE}
        menuOpen={panel === 'menu'}
        pageHref={app.pageHref}
        onNavigateLink={chrome.onNavigateLink}
        onBrowseLink={chrome.onBrowseLink}
        onMenu={chrome.onMenu}
        onIntent={prefetchAppTools}
      />
      {!inlineTray && trayHasContent && (
        <div className="compare-tray-reserve" data-error={Boolean(tray.error)} aria-hidden="true" />
      )}
      <AppDialogs
        app={app}
        clearComparePins={tray.clear}
        origin={motion.origin}
        artwork={artwork}
        previewLoading={previewLoading}
        previewModuleError={previewModuleError}
        panelRecovery={panelRecovery}
      />
      <AppToast app={app} trayError={trayError} onDismissTrayError={tray.dismissError} panelRecovery={panelRecovery} />
      {app.sharing && (
        <span className="sr-only" role="status">
          Opening sharing options…
        </span>
      )}
    </ExtendedSearchResultsContext.Provider>
  );
}
