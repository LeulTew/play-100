import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { MotionBindings } from '../../AppMotionBindings';
import type { CatalogArtwork } from '../../lib/discovery-catalog';
import { ONLINE_AVAILABLE } from '../../lib/online-availability';
import type { LibraryRecord } from '../../lib/personal-types';
import type { AppModel } from './app-model';
import { RouteHost } from './RouteHost';
import type { RouteHostProps } from './RouteHost';

export interface AppRouteProps {
  app: AppModel;
  motion: MotionBindings;
  signInGames: number;
  onPin: (record: LibraryRecord) => boolean;
  onUnpin: (id: string) => void;
  pinnedIds: ReadonlySet<string>;
  artwork: ReadonlyMap<string, CatalogArtwork>;
  comparisonTray: ReactNode;
}

/**
 * The route's props, memoised on what each page reads, so the memoised RouteHost and its page skip the renders a
 * dialog, the tray or the Menu cause.
 */
export function AppRoute({
  app,
  motion,
  signInGames,
  onPin,
  onUnpin,
  pinnedIds,
  artwork,
  comparisonTray,
}: AppRouteProps) {
  const { page, panel, commands, libraryScope, games, library, libraryBusy, filters, capabilities, collection } = app;
  const { online, cloudPage, showOnline, privateLoading, personalPage, gamesView, renderDragHandle } = app;
  const { publicHandle, invitation, signInPurpose, guestLibrary, getSignInReturnFocus, allRecords } = app;
  const { openGame, openProfile, updateFilters, changeGamesView, effectiveMotion, motionPending } = app;
  const { openCollection, preview, previewFromDiscover } = motion;
  const friendSharing = online?.friendSharing;
  const persistent = library.status === 'ready';
  const availableRecords = useMemo(() => [...allRecords.values()], [allRecords]);
  const onlineRoute = useMemo<RouteHostProps['online']>(
    () =>
      showOnline
        ? {
            onDevice: commands.onDevice,
            onFailedChange: commands.onFailedChange,
            fallback: cloudPage
              ? { route: page, kind: 'cloud-page' }
              : panel === 'account'
                ? {
                    route: page,
                    kind: 'account-sheet',
                    onClose: commands.closeAccountSheet,
                    getReturnFocus: getSignInReturnFocus,
                  }
                : null,
            props: {
              page,
              publicHandle,
              invitation,
              showSheet: panel === 'account',
              signInPurpose,
              signInGames,
              onCompareSignIn: commands.onCompareSignIn,
              guest: guestLibrary,
              games: games ?? [],
              onBridge: commands.onBridge,
              onCloseSheet: commands.closeAccountSheet,
              getSignInReturnFocus,
              onNavigate: commands.navigate,
              onProfile: openProfile,
              onOpenRecord: preview,
              onShare: (title, url) => commands.share(title, url, false),
              onPinRecord: onPin,
              artwork,
            },
          }
        : null,
    [
      showOnline,
      cloudPage,
      page,
      panel,
      commands,
      getSignInReturnFocus,
      publicHandle,
      invitation,
      signInPurpose,
      signInGames,
      guestLibrary,
      games,
      openProfile,
      preview,
      onPin,
      artwork,
    ],
  );
  const content = useMemo<RouteHostProps['content']>(() => {
    if (cloudPage) return !ONLINE_AVAILABLE ? { kind: 'unconfigured' } : null;
    if (privateLoading) return { kind: 'private-library' };
    if (personalPage === 'library' || personalPage === 'rankings')
      return {
        kind: 'personal',
        props: {
          friendSharing: libraryScope !== 'guest' ? friendSharing : undefined,
          scope: libraryScope,
          view: gamesView,
          onViewChange: changeGamesView,
          state: library.state,
          filters,
          busy: libraryBusy,
          animate: capabilities.animate,
          onFilters: updateFilters,
          onAction: commands.perform,
          onOpen: openGame,
          onDiscover: () => commands.navigate('discover'),
          onBrowse: () => commands.navigate('collection'),
          availableRecords,
          persistent,
          onPublish: ONLINE_AVAILABLE ? () => commands.navigate('publish') : undefined,
          onPin,
          onUnpin,
          pinnedIds,
          renderDragHandle,
        },
      };
    if (page === 'discover')
      return {
        kind: 'discover',
        props: {
          collection,
          state: library.state,
          busy: libraryBusy,
          onAction: commands.perform,
          onLibrary: () => commands.navigate('games'),
          onCommunity: ONLINE_AVAILABLE ? () => commands.navigate('community') : undefined,
          onPreview: previewFromDiscover,
          onPin,
          pinnedIds,
          renderDragHandle,
        },
      };
    return {
      kind: 'collection',
      props: {
        collection,
        state: library.state,
        filters,
        busy: libraryBusy,
        motion: effectiveMotion,
        motionPending,
        animate: capabilities.animate,
        reducedMotion: capabilities.reducedMotion,
        coarsePointer: capabilities.coarsePointer,
        constrained: capabilities.constrained,
        onFilters: updateFilters,
        onAction: commands.perform,
        onOpen: openCollection,
        onPreview: previewFromDiscover,
        onShare: () => commands.shareView(),
        onFullLibrary: () =>
          commands.navigate('library', {
            list: filters.list === 'later' || filters.list === 'completed' ? filters.list : 'all',
          }),
        notify: app.notices.notify,
        onPin,
        pinnedIds,
        renderDragHandle,
        comparisonTray,
      },
    };
  }, [
    cloudPage,
    privateLoading,
    personalPage,
    page,
    libraryScope,
    friendSharing,
    gamesView,
    changeGamesView,
    library.state,
    filters,
    libraryBusy,
    capabilities.animate,
    capabilities.reducedMotion,
    capabilities.coarsePointer,
    capabilities.constrained,
    updateFilters,
    commands,
    openGame,
    availableRecords,
    persistent,
    onPin,
    onUnpin,
    pinnedIds,
    renderDragHandle,
    collection,
    previewFromDiscover,
    effectiveMotion,
    motionPending,
    openCollection,
    app.notices.notify,
    comparisonTray,
  ]);
  return <RouteHost route={page} scope={libraryScope} online={onlineRoute} content={content} />;
}
