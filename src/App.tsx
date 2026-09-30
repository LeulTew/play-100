import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCollection } from './hooks/useCollection';
import { useLibrary } from './hooks/useLibrary';
import { useUrlState } from './hooks/useUrlState';
import { useShare } from './hooks/useShare';
import { createShareLink } from './lib/url';
import { pageDestination } from './lib/page-navigation';
import { appDocumentTitle } from './lib/document-title';
import type { AppPage, Filters } from './lib/types';
import type { LibraryRecord } from './lib/personal-types';
import { recordFromGame } from './lib/personal-types';
import { useAppPanel } from './hooks/useAppPanel';
import { usePwa } from './pwa/usePwa';
import { ReloadGuardContext } from './lib/reload-guard-context';
import { scrollCollectionIntoView } from './components/collection-landing';
import { ONLINE_AVAILABLE, rememberOnlineRequest } from './lib/online-availability';
import { LibraryModeContext } from './lib/library-mode';
import { useInvitation } from './hooks/useInvitation';
import { useSearchShortcut } from './hooks/useSearchShortcut';
import { useAppCapabilities } from './hooks/useAppCapabilities';
import { usePwaGuards } from './hooks/usePwaGuards';
import { CLOUD_PAGES } from './lib/cloud-pages';
import { useAppMotion } from './hooks/useAppMotion';
import { currentSignInPurpose, signInPurposeTicket } from './lib/sign-in-purpose';
import { CompareTrayProvider } from './components/compare-tray';
import { CompareTrayBindings } from './components/app/CompareTrayBindings';
import { enrichmentIdentity } from './lib/catalog-enrichment-identity';
import { catalogActionRecord } from './lib/catalog-identity';
import { AppMotionBindings } from './AppMotionBindings';
import { MotionProvider } from './motion';
import './motion/motion.css';
import { useNavigationScope } from './hooks/useNavigationScope';
import { useLibrarySave } from './hooks/useLibrarySave';
import { enableOnlineDetails, enterAccount, startComparison } from './lib/app-commands';
import type { AccountInvocation } from './lib/app-commands';
import { sameFields, useEquivalentValue } from './hooks/useEquivalentValue';
import { useBoundHandlers, useStableHandler, useStableHandlers } from './hooks/useLatest';
import { useNoticeStore } from './hooks/useNotice';
import { useGuardedNavigation } from './hooks/useGuardedNavigation';
import { useCompareContinuation, useCompareSignIn } from './hooks/useCompareSignIn';
import { useOnlineState } from './hooks/useOnlineState';
import { useDetailSelection } from './hooks/useDetailSelection';
import { AppShell } from './components/app/AppShell';
import type { AppCommands } from './components/app/app-model';

type CollectionState = ReturnType<typeof useCollection>;
// Both hooks rebuild these values every render; App holds one identity while they stay the same.
const sameCollection = (held: CollectionState, next: CollectionState) =>
  held.status === next.status && held.data === next.data && held.error === next.error;
const sameFilters = (held: Filters, next: Filters) => JSON.stringify(held) === JSON.stringify(next);

type LibraryCommand = 'perform' | 'performDetailAction' | 'toggle' | 'rankSelected' | 'resetLibrary' | 'restoreLibrary';

export default function App() {
  const invitation = useInvitation();
  const collection = useEquivalentValue(useCollection(), sameCollection);
  const canonicalRecords = useMemo(() => collection.data?.games.map(recordFromGame) ?? [], [collection.data]);
  const guestLibrary = useEquivalentValue(useLibrary(canonicalRecords, collection.status === 'loading'), sameFields);
  const url = useUrlState();
  const { page, game: selectedSlug, gamesView, closeGame, goToPage } = url;
  const filters = useEquivalentValue(url.filters, sameFilters);
  const personalPage = page === 'games' ? (gamesView === 'ranking' ? 'rankings' : 'library') : page;
  const cloudPage = CLOUD_PAGES.includes(page);
  const onlineState = useOnlineState();
  const { online, onlineOpening, currentOnline, libraryScope, libraryMode, headerLabel, headerIdentity } = onlineState;
  const library = online?.controller ?? guestLibrary;
  const libraryBusy = library.busy || library.status === 'loading' || onlineOpening;
  const { activeScope, scopeEpoch, navigationGeneration, navigationEpoch, captureFocusGuard } =
    useNavigationScope(libraryScope);
  const { effectiveMotion, motionPending, capabilities } = useAppCapabilities(
    libraryScope,
    library.status,
    library.state.motion,
  );
  const appPanel = useAppPanel(libraryScope, onlineOpening);
  const { panel, setPanel } = appPanel;
  const [compareTrayVisible, setCompareTrayVisible] = useState(false);
  const [offlineSettings, setOfflineSettings] = useState(false);
  const pwaEnabled = import.meta.env.PROD && window.isSecureContext;
  const pwa = usePwa({ enabled: pwaEnabled, wantControls: panel === 'menu' || panel === 'settings' });
  const { captureReloadGuard, captureSettingsUpdateGuard } = usePwaGuards({
    captureFocusGuard,
    busy: libraryBusy,
    panel,
  });
  const notices = useNoticeStore();
  const { notify } = notices;
  const guarded = useGuardedNavigation({ busy: libraryBusy, notify, captureFocusGuard });
  const signIn = useCompareSignIn({
    scope: libraryScope,
    panel,
    selectedSlug,
    opening: onlineOpening,
    signedIn: Boolean(online?.identity),
    navigationGeneration,
    captureHeld: guarded.captureHeld,
  });
  const [toolFailure, setToolFailure] = useState<{ scope: string; page: AppPage } | null>(null);
  const { share, manualLink, closeManualLink, sharing } = useShare(notify);
  const games = collection.data?.games;
  const perform = useLibrarySave({ library, opening: onlineOpening, notify, activeScope, scope: libraryScope });
  const detail = useDetailSelection({
    selectedSlug,
    page,
    libraryScope,
    games,
    collectionReady: collection.status === 'ready',
    records: library.state.records,
    canonicalRecords,
    closeGame,
    notify,
    clearNotice: notices.clear,
    perform,
  });
  const { selectedGame, selectedRecord, selectedPersonalRecord, allRecords, ownership, transientPreview } = detail;
  const preparePreview = useStableHandler(detail.preparePreview);
  const savedCount = library.state.queueOrder.length;
  const completedCount = Object.values(library.state.progress).filter((value) => value.completed).length;
  const rankingPosition = selectedPersonalRecord
    ? library.state.ranking.findIndex((entry) => entry.id === selectedPersonalRecord.id) + 1
    : 0;
  useEffect(() => {
    notices.clear();
  }, [libraryScope, notices]);
  const requestedTitlePanel =
    panel === 'account' && (!ONLINE_AVAILABLE || onlineState.onlineFailed || online?.identity) ? null : panel;
  const titlePanel = manualLink
    ? 'share'
    : (requestedTitlePanel ?? (online?.signInOpen ? 'account' : compareTrayVisible ? 'compare-tray' : null));
  const documentTitle = appDocumentTitle(page, selectedGame, selectedRecord, titlePanel, gamesView);
  useEffect(() => {
    document.title = documentTitle;
  }, [documentTitle]);
  useSearchShortcut();
  const navigate = (next: AppPage, patch: Partial<Filters> = {}) => {
    signIn.reset();
    setPanel(null);
    goToPage(next, patch);
  };
  const accountEntry = (invocation: AccountInvocation = 'account') =>
    enterAccount(
      {
        captureFocusGuard,
        notify,
        open: (opened, isCurrent) => {
          signIn.beginSignIn(opened === 'compare', isCurrent);
          onlineState.setHintError('');
          onlineState.setOnlineRequested(true);
          if (currentOnline.current?.identity || page === 'account') navigate('account');
          else {
            signIn.setSignInTicket(signInPurposeTicket(opened, isCurrent));
            if (opened === 'compare')
              notify('Sign in to compare with friends. Device pins stay separate from account pins.');
            setPanel('account');
          }
        },
      },
      invocation,
    );
  const handlers = useStableHandlers<Omit<AppCommands, LibraryCommand>>({
    navigate,
    navigateLink: (event, next, patch = {}, commit = () => navigate(next, patch)) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      return guarded.guard(commit);
    },
    guardedNavigation: guarded.guard,
    accountEntry,
    closeAccountSheet: () => {
      signIn.setSignInTicket(null);
      setPanel(null);
    },
    browse: () => {
      if (page !== 'collection') navigate('collection');
      else scrollCollectionIntoView(capabilities.animate ? 'smooth' : 'instant');
    },
    shareView: (slug: string | null = null) => {
      const title = slug && selectedGame ? `${selectedGame.title} | Play 100` : 'Play 100 — a collection worth playing';
      const { url: link, privateFilter } = createShareLink(window.location.origin, filters, slug);
      void share(title, link, privateFilter);
    },
    share: (title, link, privateFilter) => {
      void share(title, link, privateFilter);
    },
    compareGames: (records: LibraryRecord[]) =>
      startComparison(
        {
          captureFocusGuard,
          notify,
          opening: onlineOpening,
          identity: online?.identity,
          currentIdentity: () => currentOnline.current?.identity,
          libraryScope,
          page,
          captureIntent: guarded.captureIntent,
          recover: guarded.recover,
          clearRecovery: guarded.clearRecovery,
          signIn: () => accountEntry('compare'),
          navigate,
          toolFailure: setToolFailure,
        },
        records,
      ),
    enablePublicDetails: () => enableOnlineDetails({ captureFocusGuard, notify }),
    applyPwaUpdate: () => pwa.applyUpdate(captureSettingsUpdateGuard()),
    setPanel,
    openSettings: (offline = false) => {
      setOfflineSettings(offline);
      setPanel('settings');
    },
    dismissPanelMessage: appPanel.dismissPanelMessage,
    closeManualLink,
    onDevice: () => {
      void rememberOnlineRequest(false);
      onlineState.setOnlineRequested(false);
      onlineState.setOnline(null);
      navigate('collection');
    },
    onFailedChange: (failed) => {
      onlineState.setOnlineFailed(failed);
      // The failed controller has unmounted; its last bridge describes no account.
      if (failed) onlineState.setOnline(null);
    },
    onDeviceOnly: () => {
      onlineState.setHintError('');
      void rememberOnlineRequest(false);
    },
    onBridge: onlineState.setOnline,
    onCompareSignIn: signIn.holdComparison,
    setCompareTrayVisible,
    pinAllowed: () => !onlineOpening && activeScope.current === libraryScope,
    retryLibraryOpening: (discardRevision) => onlineState.retryOpening(() => guestLibrary.retry(discardRevision)),
  });
  // The commands that change a library are bound to it (useLibrarySave): an editor holding one saves where it began.
  const libraryHandlers = useBoundHandlers<typeof perform, Omit<Pick<AppCommands, LibraryCommand>, 'perform'>>(
    perform,
    {
      toggle: (id, key, value) => {
        const target = allRecords.get(id);
        const record = target && catalogActionRecord(target, ownership);
        if (record)
          void perform(
            value === undefined
              ? { type: 'toggle-progress', record, key }
              : { type: 'set-progress', records: [record], key, value },
          );
      },
      rankSelected: () => {
        if (!selectedPersonalRecord) return;
        if (rankingPosition) void guarded.guard(() => navigate('rankings'));
        else void perform({ type: 'add-ranking', records: [selectedPersonalRecord] });
      },
      performDetailAction: detail.performDetailAction,
      resetLibrary: () => library.reset(),
      restoreLibrary: (...args) => library.restore(...args),
    },
  );
  const commands = useMemo<AppCommands>(
    () => ({ ...handlers, ...libraryHandlers, perform }),
    [handlers, libraryHandlers, perform],
  );
  // Once that account has opened, the tray's own checks continue the comparison (useCompareContinuation).
  useCompareContinuation({
    compareSignIn: signIn.compareSignIn,
    panel,
    opening: onlineOpening,
    signedInUid: online?.identity?.uid,
    onContinue: (pins) => void commands.compareGames(pins),
  });
  const publicLookup =
    page === 'discover' &&
    selectedRecord &&
    !selectedGame &&
    !transientPreview?.authority &&
    !onlineOpening &&
    enrichmentIdentity(selectedRecord.id)
      ? {
          online: filters.catalogs === 'on',
          scopeKey: `${libraryScope}:${scopeEpoch}:${navigationEpoch}`,
          onEnableOnline: () => {
            void commands.enablePublicDetails();
          },
        }
      : undefined;
  const privateLoading =
    ['games', 'library', 'rankings'].includes(page) && (library.status === 'loading' || onlineOpening);
  const mainRef = useRef<HTMLElement>(null);
  const { motionBoundary, motionLocation } = useAppMotion({
    libraryScope,
    online,
    onlineOpening,
    libraryStatus: library.status,
    selectedSlug,
    displayedDetailKey: selectedGame?.slug ?? selectedRecord?.id ?? null,
    overlayKey: manualLink ? 'share' : panel,
  });
  const motionBlocked = privateLoading || Boolean(selectedSlug) || Boolean(panel) || Boolean(manualLink);
  const catalogs = filters.catalogs;
  const pageHref = useCallback(
    (next: AppPage, patch: Partial<Filters> = {}) => {
      const destination = pageDestination(next, { catalogs }, patch);
      return `${destination.path}${destination.search}`;
    },
    [catalogs],
  );
  return (
    <ReloadGuardContext value={captureReloadGuard}>
      <MotionProvider policy={capabilities} boundary={motionBoundary} location={motionLocation}>
        <AppMotionBindings
          mainRef={mainRef}
          page={page}
          boundary={motionBoundary}
          motionLocation={motionLocation}
          navigation={navigationGeneration}
          blocked={motionBlocked}
          onOpen={url.openGame}
          preparePreview={preparePreview}
        >
          {(motion) => (
            <CompareTrayProvider scope={libraryScope} interaction={motion.interaction}>
              <CompareTrayBindings
                needsArtwork={['friend', 'friend-shelf', 'compare'].includes(page)}
                previewId={transientPreview?.authority ? null : selectedSlug}
                resolvedRecordId={selectedRecord?.id ?? null}
                onResolvePreview={detail.rememberPreview}
              >
                {(tray, artwork, previewLoading, previewModuleError) => (
                  <LibraryModeContext.Provider value={libraryMode}>
                    <AppShell
                      app={{
                        page,
                        gamesView,
                        publicHandle: url.publicHandle,
                        openGame: url.openGame,
                        closeGame,
                        openProfile: url.openProfile,
                        updateFilters: url.updateFilters,
                        changeGamesView: url.changeGamesView,
                        filters,
                        selectedSlug,
                        personalPage,
                        invitation,
                        cloudPage,
                        privateLoading,
                        collection,
                        games,
                        guestLibrary,
                        library,
                        libraryBusy,
                        libraryScope,
                        libraryLabel: headerLabel,
                        online,
                        onlineOpening,
                        showOnline: ONLINE_AVAILABLE && (onlineState.onlineRequested || cloudPage),
                        hintError: onlineState.hintError,
                        hintBlocked: onlineState.hintBlocked,
                        retryingLibraryOpening: onlineState.retryingOpening,
                        headerIdentity,
                        savedCount,
                        completedCount,
                        warning: library.error ?? library.warning,
                        capabilities,
                        effectiveMotion,
                        motionPending,
                        ...appPanel,
                        offlineSettings,
                        pwaEnabled,
                        pwa,
                        ...detail,
                        rankingPosition,
                        publicLookup,
                        manualLink,
                        sharing,
                        toolFailure,
                        motionBlocked,
                        signInPurpose: currentSignInPurpose(signIn.signInTicket, panel === 'account'),
                        getSignInReturnFocus: signIn.getSignInReturnFocus,
                        captureFocusGuard,
                        notices,
                        pageHref,
                        commands,
                      }}
                      mainRef={mainRef}
                      motion={motion}
                      tray={tray}
                      artwork={artwork}
                      previewLoading={previewLoading}
                      previewModuleError={previewModuleError}
                    />
                  </LibraryModeContext.Provider>
                )}
              </CompareTrayBindings>
            </CompareTrayProvider>
          )}
        </AppMotionBindings>
      </MotionProvider>
    </ReloadGuardContext>
  );
}
