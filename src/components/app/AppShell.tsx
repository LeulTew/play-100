import { useCallback, useMemo } from 'react';
import type { RefObject } from 'react';
import type { CatalogArtwork } from '../../lib/discovery-catalog';
import type { LibraryRecord } from '../../lib/personal-types';
import { catalogPinnedIds } from '../../lib/catalog-identity';
import { ONLINE_AVAILABLE, ONLINE_CONFIG_ERROR } from '../../lib/online-availability';
import { prefetchAppTools } from '../../lib/app-tool-preload';
import type { MotionBindings } from '../../AppMotionBindings';
import { useStableHandler } from '../../hooks/useLatest';
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
  const { page, panel, manualLink, selectedSlug, onlineOpening, commands, notices } = app;
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
  const trayError = !app.motionBlocked ? tray.error : null;
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
  const onNavigateLink = (event: Parameters<AppModel['commands']['navigateLink']>[0], next: AppModel['page']) => {
    void commands.navigateLink(event, next);
  };
  const onAccount = () => {
    void commands.accountEntry();
  };
  return (
    <>
      <a className="skip-link" href={page === 'collection' ? '#collection' : '#page-main'}>
        Skip to {page === 'collection' ? 'the collection' : 'page content'}
      </a>
      <AppHeader
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
        onNavigateLink={onNavigateLink}
        onQueue={() => {
          void commands.guardedNavigation(() => commands.navigate('library', { list: 'later' }));
        }}
        onMenu={() => commands.setPanel('menu')}
        onAccount={onAccount}
        onIntent={prefetchAppTools}
      />
      <GlobalBanners
        warning={app.warning}
        onlineConfigError={ONLINE_CONFIG_ERROR}
        offline={app.pwaEnabled && !app.pwa.online}
        offlineReady={app.pwa.offlineState === 'ready'}
        hintError={app.hintError}
        onSettings={() => commands.setPanel('settings')}
        onAccount={onAccount}
        onDeviceOnly={commands.onDeviceOnly}
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
      <SiteFooter
        onAbout={() => commands.setPanel('about')}
        onEffects={() => commands.setPanel('settings')}
        effects={app.library.state.motion}
      />
      <MobileNav
        page={page}
        personalPage={app.personalPage}
        gamesView={app.gamesView}
        onlineAvailable={ONLINE_AVAILABLE}
        menuOpen={panel === 'menu'}
        pageHref={app.pageHref}
        onNavigateLink={onNavigateLink}
        onBrowseLink={(event) => {
          void commands.navigateLink(event, 'collection', {}, commands.browse);
        }}
        onMenu={() => commands.setPanel('menu')}
        onIntent={prefetchAppTools}
      />
      {!inlineTray && trayHasContent && (
        <div className="compare-tray-reserve" data-error={Boolean(tray.error)} aria-hidden="true" />
      )}
      <AppDialogs
        app={app}
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
    </>
  );
}
