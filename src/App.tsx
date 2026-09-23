import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { useCollection } from './hooks/useCollection';
import { useLibrary } from './hooks/useLibrary';
import { useUrlState } from './hooks/useUrlState';
import { useCapabilities } from './hooks/useCapabilities';
import { useShare } from './hooks/useShare';
import { createShareUrl } from './lib/url';
import { pageDestination } from './lib/page-navigation';
import type { AppPage, Filters } from './lib/types';
import type { LibraryRecord, PersonalAction } from './lib/personal-types';
import { recordFromGame } from './lib/personal-types';
import { Icon } from './components/Icon';
import { SiteFooter } from './components/SiteFooter';
import { useAppPanel } from './hooks/useAppPanel';
import { ChunkRecovery } from './components/ChunkRecovery';
import { usePwa } from './pwa';
import { hasUnsubmittedPwaForm } from './lib/pwa-update-guard';
import { scrollCollectionIntoView } from './components/collection-landing';
import { ONLINE_AVAILABLE, ONLINE_CONFIG_ERROR, onlineWasRequested, rememberOnlineRequest, resolveOnlineRequest } from './lib/online-availability';
import type { OnlineBridge } from './cloud/ui-types';
import { LibraryModeContext } from './lib/library-mode';
import { flushPendingEdits, hasPendingEdits } from './hooks/useExitSave';
import { captureInviteContinuation } from './lib/invite-continuation';
import { CompareDragHandle, CompareTrayProvider, useCompareTray } from './components/compare-tray';
import { useDiscoveryCatalog } from './hooks/useDiscoveryCatalog';
import { indexDiscoveryArtwork } from './lib/discovery-catalog-shared';
import type { CatalogArtwork } from './lib/discovery-catalog';
import { EMPTY_DISCOVERY_ARTWORK, hasKnownDiscoveryArtwork } from './lib/discovery-artwork-presence';
import { enrichmentIdentity } from './lib/catalog-enrichment-identity';
import { patchDiscoverySearch } from './lib/discovery-search';
import type { PreviewAuthority } from './lib/preview-authority';
import { canonicalCatalogId, catalogActionRecord, catalogOwnership, catalogPinnedIds, collectionGameForId, resolveCatalogRecord } from './lib/catalog-identity';
import { SavedCatalogCopies } from './components/catalog/SavedCatalogCopies';
import { AppMotionBindings } from './AppMotionBindings';
import type { PreparedPreview } from './AppMotionBindings';
import { MotionProvider } from './motion';
import type { MotionBoundary, MotionLocation } from './motion';
import './motion/motion.css';
import { loadAppTools, loadComparisonTools, prefetchAppTools } from './lib/app-tool-preload';
import { scheduleIdlePrefetch } from './lib/idle-prefetch';
import { effectiveMotionPreference, readMotionHint } from './lib/motion-hint';
import { GlobalBanners } from './components/app/GlobalBanners';
import { useNavigationScope } from './hooks/useNavigationScope';
import { AppHeader } from './components/app/AppHeader';
import { MobileNav } from './components/app/MobileNav';
import { TrayHost } from './components/app/TrayHost';
import { RouteHost } from './components/app/RouteHost';
import { DialogHost } from './components/app/DialogHost';

const PAGE_TITLES: Record<AppPage, string> = { collection: 'Find your next game', games: 'My games', library: 'My games - Library', rankings: 'My games - Ranking', discover: 'Discover more games', account: 'Account', community: 'Community', publish: 'Publish ranking', profile: 'A shared ranking', creator: 'Creator desk', friends: 'Friends', friend: 'Friend', invite: 'Invitation', compare: 'Compare rankings', 'friend-sharing': 'Friends sharing', 'friend-shelf': 'Shared games' };
const noPreviewSubscription = () => () => {};
interface PreviewedRecord { record: LibraryRecord; authority?: PreviewAuthority }

function usableReturnFocusTarget(target: HTMLElement | null): target is HTMLElement {
  return Boolean(target?.isConnected && !target.matches(':disabled') && !target.closest('[hidden], [inert], dialog:not([open])') &&
    target.getClientRects().length > 0 && getComputedStyle(target).visibility === 'visible');
}

function CompareTrayBindings({ needsArtwork, previewId, resolvedRecordId, onResolvePreview, children }: {
  needsArtwork: boolean;
  resolvedRecordId: string | null;
  previewId: string | null; onResolvePreview: (record: LibraryRecord) => void;
  children: (tray: ReturnType<typeof useCompareTray>, artwork: ReadonlyMap<string, CatalogArtwork>, previewLoading: boolean) => ReactNode;
}) {
  const tray = useCompareTray();
  const publicPreview = Boolean(previewId && /^(wikidata:Q[1-9]\d*|freetogame:[1-9]\d*)$/.test(previewId));
  const trayRecord = tray.items.find((item) => item.id === previewId);
  const knownRecordId = resolvedRecordId ?? trayRecord?.id;
  const catalog = useDiscoveryCatalog(needsArtwork || publicPreview && !knownRecordId ||
    Boolean(knownRecordId && hasKnownDiscoveryArtwork(knownRecordId)) || tray.items.some(record => hasKnownDiscoveryArtwork(record.id)));
  const artwork = useMemo(() => catalog.catalog ? indexDiscoveryArtwork(catalog.catalog) : EMPTY_DISCOVERY_ARTWORK, [catalog.catalog]);
  // Resolved identity controls loading, never replacement preview metadata.
  const record = resolvedRecordId ? undefined : trayRecord ?? catalog.catalog?.items.find((item) => item.record.id === previewId)?.record;
  useEffect(() => { if (record) onResolvePreview(record); }, [record, onResolvePreview]);
  return children(tray, artwork, publicPreview && !knownRecordId && !record && (catalog.status === 'idle' || catalog.status === 'loading'));
}

function actionMessage(action: PersonalAction): string {
  switch (action.type) {
    case 'add-records': return `${action.records.length} ${action.records.length === 1 ? 'game' : 'games'} added to your library.`;
    case 'remove-records': return 'Selected games removed from your private library. The original 100 is unchanged.';
    case 'add-ranking': return 'Your ranking has been updated. Games are not automatically marked played.';
    case 'remove-ranking': return 'Removed from your personal ranking.';
    case 'move-item': return `Your ${action.list === 'queue' ? 'play order' : 'ranking order'} is saved.`;
    case 'edit-ranking': return 'Your opinion is saved.';
    case 'rate-game': return 'Your rating is saved. This game is in your private library.';
    case 'use-rating-order': return action.id ? 'This game now follows rating order.' : 'Automatic rating order restored. Manual positions have been cleared.';
    case 'set-motion': return 'Visual preference saved.';
    case 'set-progress': return `${action.records.length} ${action.records.length === 1 ? 'game' : 'games'} updated in your ${action.key === 'later' ? 'play queue' : 'play history'}.`;
    default: return 'Your library is updated.';
  }
}

export default function App() {
  const [invitation, setInvitation] = useState(captureInviteContinuation);
  useEffect(() => {
    const update = () => {
      if (location.pathname === '/invite') setInvitation(captureInviteContinuation());
    };
    window.addEventListener('hashchange', update); window.addEventListener('popstate', update);
    return () => { window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update); };
  }, []);
  const collection = useCollection();
  const canonicalRecords = useMemo(() => collection.data?.games.map(recordFromGame) ?? [], [collection.data]);
  const guestLibrary = useLibrary(canonicalRecords, collection.status === 'loading');
  const { page, filters, game: selectedSlug, gamesView, changeGamesView, publicHandle, updateFilters, openGame, closeGame, goToPage, openProfile } = useUrlState();
  const personalPage = page === 'games' ? gamesView === 'ranking' ? 'rankings' : 'library' : page;
  const cloudPage = ['account', 'publish', 'community', 'profile', 'creator', 'friends', 'friend', 'invite', 'compare', 'friend-sharing', 'friend-shelf'].includes(page);
  const [onlineRequested, setOnlineRequested] = useState(onlineWasRequested);
  const [hintChecking, setHintChecking] = useState(ONLINE_AVAILABLE && !onlineRequested);
  const [hintError, setHintError] = useState('');
  const [online, setOnline] = useState<OnlineBridge | null>(null);
  const currentOnline = useRef(online); currentOnline.current = online;
  const onlineOpening = ONLINE_AVAILABLE && (hintChecking || Boolean(hintError) || (onlineRequested && online === null) || Boolean(online?.loading));
  const library = online?.controller ?? guestLibrary;
  const libraryBusy = library.busy || library.status === 'loading' || onlineOpening;
  const libraryScope = online?.scope ?? 'guest';
  const headerIdentity = online?.identity && online.headerIdentity?.uid === online.identity.uid ? online.headerIdentity : null;
  const { activeScope, scopeGeneration, navigationGeneration, captureFocusGuard: captureMenuFocusGuard } = useNavigationScope(libraryScope);
  const libraryMode = useMemo(() => ({ scope: libraryScope, onlineEnabled: online?.enabled ?? false, label: onlineOpening ? 'Opening account...' : online?.label ?? 'Device only' }), [libraryScope, onlineOpening, online?.enabled, online?.label]);
  const motionHint = useMemo(() => readMotionHint(libraryScope), [libraryScope]);
  const effectiveMotion = effectiveMotionPreference(library.status, library.state.motion, motionHint);
  const capabilities = useCapabilities(effectiveMotion);
  useEffect(() => {
    if (!capabilities.animate || capabilities.constrained || capabilities.hidden) return;
    return scheduleIdlePrefetch(loadAppTools, 1200);
  }, [capabilities.animate, capabilities.constrained, capabilities.hidden]);
  const { panel, setPanel, panelMessage, panelMessageError, panelFailure, dismissPanelMessage } = useAppPanel(libraryScope);
  const [offlineSettings, setOfflineSettings] = useState(false);
  const pwaEnabled = import.meta.env.PROD && window.isSecureContext;
  const pwa = usePwa({ enabled: pwaEnabled });
  const updateState = useRef({ busy: libraryBusy, panel });
  updateState.current = { busy: libraryBusy, panel };
  const inputGeneration = useRef(0);
  useEffect(() => {
    const edited = () => { inputGeneration.current += 1; };
    document.addEventListener('input', edited, true);
    document.addEventListener('change', edited, true);
    return () => {
      document.removeEventListener('input', edited, true);
      document.removeEventListener('change', edited, true);
    };
  }, []);
  const accountPanelOpen = useRef(panel === 'account');
  accountPanelOpen.current = panel === 'account';
  const compareSignInOrigin = useRef<{ isCurrent: () => boolean } | null>(null);
  const getSignInReturnFocus = useCallback((authenticated = false) => {
    const origin = compareSignInOrigin.current;
    if (!origin) return null;
    const current = !authenticated && origin.isCurrent();
    // A loading sheet can unmount while the same sign-in invocation is still open.
    if (current && accountPanelOpen.current) return null;
    compareSignInOrigin.current = null;
    const action = current ? ['.compare-tray-action', '.compare-tray-expand']
      .map(selector => document.querySelector<HTMLElement>(selector)).find(usableReturnFocusTarget) : null;
    if (action) return action;
    return [...document.querySelectorAll<HTMLElement>('.account-nav, [data-page-heading], #collection-title')]
      .find(usableReturnFocusTarget) ?? null;
  }, []);
  const closePanel = useCallback(() => setPanel(null), [setPanel]);
  const [previewedRecords, setPreviewedRecords] = useState<{ scope: string; records: Map<string, PreviewedRecord> }>({ scope: 'guest', records: new Map() });
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(''), 6500);
  }, []);
  const { share, manualLink, closeManualLink, sharing } = useShare(notify);
  const games = collection.data?.games;
  const allRecords = useMemo(() => new Map([...Object.values(library.state.records), ...canonicalRecords].map((record) => [record.id, record])), [library.state.records, canonicalRecords]);
  const ownership = useMemo(() => catalogOwnership(library.state.records), [library.state.records]);
  const transientPreview = selectedSlug && previewedRecords.scope === libraryScope ? previewedRecords.records.get(selectedSlug) : undefined;
  const publicCatalogAlias = Boolean(selectedSlug && ['collection', 'discover'].includes(page) && !library.state.records[selectedSlug] && !transientPreview?.authority);
  const selectedGame = games?.find((game) => game.slug === selectedSlug) ??
    (selectedSlug && publicCatalogAlias ? collectionGameForId(games ?? [], selectedSlug) : undefined);
  const previewPermitted = useSyncExternalStore(transientPreview?.authority?.subscribe ?? noPreviewSubscription,
    () => !transientPreview?.authority || transientPreview.authority.scope === libraryScope && transientPreview.authority.permits(transientPreview.record.id),
    () => false);
  const awaitingCanonicalPreview = Boolean(publicCatalogAlias && selectedSlug && canonicalCatalogId(selectedSlug) !== selectedSlug && collection.status !== 'ready');
  const selectedRecord = selectedGame ? recordFromGame(selectedGame) : !awaitingCanonicalPreview && selectedSlug ? allRecords.get(selectedSlug) ?? (previewPermitted ? transientPreview?.record : undefined) : undefined;
  const selectedPersonalRecord = selectedGame && selectedRecord ? catalogActionRecord(selectedRecord, ownership) : selectedRecord;
  const savedCount = library.state.queueOrder.length;
  const completedCount = Object.values(library.state.progress).filter((value) => value.completed).length;
  const rankingPosition = selectedPersonalRecord ? library.state.ranking.findIndex((entry) => entry.id === selectedPersonalRecord.id) + 1 : 0;
  const saveAction = library.perform;
  const storageStatus = library.status;
  useEffect(() => {
    if (!ONLINE_AVAILABLE) return;
    let alive = true;
    void resolveOnlineRequest().then((requested) => {
      if (alive && requested) setOnlineRequested(true);
    }).catch((cause) => {
      if (alive) setHintError(cause instanceof Error ? cause.message : 'The remembered account could not be checked.');
    }).finally(() => { if (alive) setHintChecking(false); });
    return () => { alive = false; };
  }, []);

  const perform = useCallback(async (action: PersonalAction) => {
    if (onlineOpening) { notify('Wait for the account scope to finish opening before changing saved data.'); return false; }
    const success = await saveAction(action);
    if (success && activeScope.current === libraryScope) notify(`${actionMessage(action)}${storageStatus === 'temporary' ? ' This tab only: export a backup to keep it.' : ''}`);
    return success;
  }, [saveAction, storageStatus, notify, libraryScope, onlineOpening, activeScope]);
  const rememberPreview = useCallback((record: LibraryRecord, authority?: PreviewAuthority) => {
    setPreviewedRecords((previous) => {
      const known = previous.records.get(record.id);
      if (previous.scope === libraryScope && known?.record === record && known.authority === authority) return previous;
      const next = new Map([...(previous.scope === libraryScope ? previous.records : new Map()), [record.id, { record, authority }]]);
      if (next.size > 64) {
        const oldest = next.keys().next().value;
        if (oldest !== undefined) next.delete(oldest);
      }
      return { scope: libraryScope, records: next };
    });
  }, [libraryScope]);
  const preparePreview = useCallback((record: LibraryRecord, authority?: PreviewAuthority): PreparedPreview | null => {
    if (authority && (authority.scope !== libraryScope || !authority.permits(record.id))) { notify('This shared game is no longer available.'); return null; }
    const resolved = !authority && !library.state.records[record.id] ? resolveCatalogRecord(record, games ?? []) : record;
    rememberPreview(resolved, authority);
    const publicAlias = !authority && !library.state.records[resolved.id] && ['collection', 'discover'].includes(page);
    const displayed = games?.find(game => game.slug === resolved.id) ??
      (publicAlias ? collectionGameForId(games ?? [], resolved.id) : undefined);
    return { requestedDetailKey: resolved.id, displayedDetailKey: displayed?.slug ?? resolved.id };
  }, [rememberPreview, libraryScope, notify, games, library.state.records, page]);
  useEffect(() => {
    if (!transientPreview?.authority || previewPermitted) return;
    setPreviewedRecords((previous) => {
      if (previous.records.get(transientPreview.record.id) !== transientPreview) return previous;
      const next = new Map(previous.records); next.delete(transientPreview.record.id);
      return { ...previous, records: next };
    });
    if (!allRecords.has(transientPreview.record.id)) { closeGame(); notify('This shared game is no longer available.'); }
  }, [transientPreview, previewPermitted, allRecords, closeGame, notify]);
  const performDetailAction = useCallback((action: PersonalAction) => {
    if (transientPreview?.authority && !allRecords.has(transientPreview.record.id) && !transientPreview.authority.permits(transientPreview.record.id)) {
      notify('The shared game is no longer available. No library change was saved.');
      return Promise.resolve(false);
    }
    return perform(action);
  }, [transientPreview, allRecords, perform, notify]);

  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);
  useEffect(() => { setNotice(''); }, [libraryScope]);
  useEffect(() => {
    document.title = selectedGame ? `${selectedGame.title} - #${selectedGame.rank} | Play 100` : selectedRecord ? `${selectedRecord.title} | Play 100` : `Play 100 - ${PAGE_TITLES[page]}`;
  }, [selectedGame, selectedRecord, page]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
      if (event.target instanceof HTMLElement && (event.target.matches('input, textarea, select') || event.target.isContentEditable)) return;
      event.preventDefault();
      document.querySelector<HTMLElement>('#game-search, #library-search, #ranking-search, #catalog-search')?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const navigate = (next: AppPage, patch: Partial<Filters> = {}) => { compareSignInOrigin.current = null; setPanel(null); goToPage(next, patch); };
  const accountEntry = async (invocation: 'account' | 'compare' = 'account') => {
    const currentScopeAndNavigation = captureMenuFocusGuard();
    const view = `${window.location.pathname}${window.location.search}`;
    const isCurrent = () => currentScopeAndNavigation() && view === `${window.location.pathname}${window.location.search}`;
    const blocked: { target: HTMLElement | null } = { target: null };
    const returnToEdit = () => {
      if (usableReturnFocusTarget(blocked.target)) {
        blocked.target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        blocked.target.focus({ preventScroll: true });
      }
    };
    try {
      const saved = await flushPendingEdits(target => { blocked.target = target; });
      if (!isCurrent()) return;
      if (!saved) {
        notify('Finish or correct the open rating or note before changing accounts.');
        returnToEdit();
        return;
      }
      compareSignInOrigin.current = invocation === 'compare' ? { isCurrent } : null;
      setHintError('');
      setOnlineRequested(true);
      if (currentOnline.current?.identity || page === 'account') navigate('account');
      else {
        if (invocation === 'compare') notify('Sign in to compare with friends. Device pins stay separate from account pins.');
        setPanel('account');
      }
    } catch (cause) {
      console.error('Account could not save pending edits.', cause instanceof Error ? cause.message : 'Unknown editor failure.');
      if (isCurrent()) {
        notify('Your edit could not be saved. Keep this page open and retry.');
        returnToEdit();
      }
    }
  };
  const pageHref = (next: AppPage, patch: Partial<Filters> = {}) => {
    const destination = pageDestination(next, filters, patch);
    return `${destination.path}${destination.search}`;
  };
  const navigateLink = async (event: MouseEvent<HTMLAnchorElement>, next: AppPage, patch: Partial<Filters> = {}, commit = () => navigate(next, patch)) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    const startedScope = scopeGeneration.current;
    const startedNavigation = navigationGeneration.current;
    try {
      const saved = await flushPendingEdits();
      if (scopeGeneration.current !== startedScope || navigationGeneration.current !== startedNavigation) return;
      if (saved) commit();
      else notify('Finish or correct the open rating or note before leaving this page.');
    } catch (cause) {
      console.error('Navigation could not save pending edits.', cause);
      if (scopeGeneration.current === startedScope && navigationGeneration.current === startedNavigation) notify('Your edit could not be saved. Keep this page open and retry.');
    }
  };
  const browse = () => {
    if (page !== 'collection') navigate('collection');
    else {
      scrollCollectionIntoView(capabilities.animate ? 'smooth' : 'instant');
      document.getElementById('collection-title')?.focus({ preventScroll: true });
    }
  };
  const shareView = (slug: string | null = null) => {
    const title = slug && selectedGame ? `${selectedGame.title} | Play 100` : 'Play 100 - a collection worth playing';
    void share(title, createShareUrl(window.location.origin, filters, slug), filters.list !== 'all');
  };
  const toggle = (id: string, key: 'later' | 'completed' | 'played', value?: boolean) => {
    const target = allRecords.get(id);
    const record = target && catalogActionRecord(target, ownership);
    if (record) void perform(value === undefined ? { type: 'toggle-progress', record, key } : { type: 'set-progress', records: [record], key, value });
  };
  const rankSelected = () => {
    if (!selectedPersonalRecord) return;
    if (rankingPosition) navigate('rankings');
    else void perform({ type: 'add-ranking', records: [selectedPersonalRecord] });
  };
  const compareGames = async (records: LibraryRecord[]) => {
    const startedScope = scopeGeneration.current;
    const startedNavigation = navigationGeneration.current;
    if (onlineOpening) { notify('Wait for your account to finish opening before comparing.'); return; }
    if (!online?.identity || libraryScope === 'guest') {
      await accountEntry('compare');
      return;
    }
    if (!online.identity.verified) { notify('Verify your account before comparing with friends.'); navigate('account'); return; }
    try {
      const [{ createComparisonGameFilter, rememberComparisonGameFilter }, { comparisonScope, initialComparison, readComparisonView, rememberComparisonView }] = await loadComparisonTools();
      if (scopeGeneration.current !== startedScope || navigationGeneration.current !== startedNavigation ||
        currentOnline.current?.identity?.uid !== online.identity.uid || !currentOnline.current.identity.verified) return;
      const filter = createComparisonGameFilter(libraryScope, records);
      if (!await flushPendingEdits()) { notify('Correct the open edit before starting a comparison.'); return; }
      if (scopeGeneration.current !== startedScope || navigationGeneration.current !== startedNavigation ||
        currentOnline.current?.identity?.uid !== online.identity.uid || !currentOnline.current.identity.verified) return;
      const project = libraryScope.split(':')[1] ?? '';
      const scope = comparisonScope(project, online.identity.uid);
      const prior = readComparisonView(scope) ?? initialComparison(scope, online.identity.uid);
      navigate('compare');
      rememberComparisonView({ ...prior, mode: 'all-shared', query: '', page: 1 }, true);
      const warning = rememberComparisonGameFilter(filter);
      if (warning) notify(warning);
    } catch (cause) {
      if (scopeGeneration.current === startedScope && navigationGeneration.current === startedNavigation) {
        notify(cause instanceof Error ? cause.message : 'The game comparison could not be opened.');
      } else console.warn('A comparison operation failed after its page or account changed. No stale navigation was applied.');
    }
  };
  const enablePublicDetails = async () => {
    const currentScopeAndNavigation = captureMenuFocusGuard();
    const view = `${window.location.pathname}${window.location.search}`;
    try {
      if (!await flushPendingEdits()) { notify('Correct the open edit before changing online lookup.'); return; }
      if (!currentScopeAndNavigation() || view !== `${window.location.pathname}${window.location.search}`) return;
      const search = patchDiscoverySearch(window.location.search, { catalogs: 'on' });
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`);
      window.dispatchEvent(new Event('play100:navigate'));
    } catch (cause) {
      console.error('Online details could not save the pending edit.', cause instanceof Error ? cause.message : 'Unknown editor failure.');
      if (currentScopeAndNavigation()) notify('Your edit could not be saved. Keep this game open and retry.');
    }
  };
  const applyPwaUpdate = () => {
    const currentScopeAndNavigation = captureMenuFocusGuard();
    const view = `${window.location.pathname}${window.location.search}`;
    const edits = inputGeneration.current;
    const isCurrent = () => currentScopeAndNavigation() && updateState.current.panel === 'settings' &&
      view === `${window.location.pathname}${window.location.search}`;
    return pwa.applyUpdate({
      isCurrent,
      prepare: async () => {
        if (!await flushPendingEdits()) return false;
        if (hasUnsubmittedPwaForm()) throw new Error('Finish or clear unsubmitted forms, or return to The 100 before updating. Nothing was reloaded.');
        return isCurrent();
      },
      canReload: () => isCurrent() && !updateState.current.busy && inputGeneration.current === edits &&
        !hasPendingEdits() && !hasUnsubmittedPwaForm(),
    });
  };
  const publicLookup = page === 'discover' && selectedRecord && !selectedGame && !transientPreview?.authority &&
    !onlineOpening && enrichmentIdentity(selectedRecord.id) ? {
      online: filters.catalogs === 'on',
      scopeKey: `${libraryScope}:${scopeGeneration.current}:${navigationGeneration.current}`,
      onEnableOnline: () => { void enablePublicDetails(); },
    } : undefined;
  const warning = library.error ?? library.warning;
  const privateLoading = ['games', 'library', 'rankings'].includes(page) && (library.status === 'loading' || onlineOpening);
  const mainRef = useRef<HTMLElement>(null);
  const boundaryStamp = [
    libraryScope, online?.identity?.uid ?? null, online?.identity?.verified ?? false,
    online?.enabled ?? false, onlineOpening, library.status, Boolean(online?.controller),
  ] as const;
  const motionEpoch = useRef({ value: boundaryStamp, generation: 0 });
  if (boundaryStamp.some((value, index) => value !== motionEpoch.current.value[index])) {
    motionEpoch.current = { value: boundaryStamp, generation: motionEpoch.current.generation + 1 };
  }
  const motionBoundary: MotionBoundary = {
    scopeKey: libraryScope,
    generation: motionEpoch.current.generation,
    blocked: onlineOpening || library.status === 'loading',
  };
  const viewParams = new URLSearchParams(window.location.search);
  viewParams.delete('game');
  const viewQuery = viewParams.toString();
  const locationKey = `${window.location.pathname}${window.location.search}`;
  const motionNavigation = useRef({ key: locationKey, generation: 0 });
  // Motion observes the committed URL; native Back notifications can arrive later.
  if (motionNavigation.current.key !== locationKey) {
    motionNavigation.current = { key: locationKey, generation: motionNavigation.current.generation + 1 };
  }
  const motionLocation: MotionLocation = {
    viewKey: `${window.location.pathname}${viewQuery ? `?${viewQuery}` : ''}`,
    requestedDetailKey: selectedSlug,
    displayedDetailKey: selectedGame?.slug ?? selectedRecord?.id ?? null,
    navigationGeneration: motionNavigation.current.generation,
    overlayKey: manualLink ? 'share' : panel,
  };
  const motionBlocked = privateLoading || Boolean(selectedSlug) || Boolean(panel) || Boolean(manualLink);
  const visibleNotice = (!panel && !manualLink && !selectedSlug ? panelMessage : '') || notice;
  const panelRecovery = panelFailure && <ChunkRecovery key={panelFailure} message={panelMessage}
    intent={panelFailure === 'about' ? 'credits' : 'settings'}
    label={panelFailure === 'about' ? 'Reload and open credits' : 'Reload and open Settings'} />;

  return (
    <MotionProvider policy={capabilities} boundary={motionBoundary} location={motionLocation}>
    <AppMotionBindings mainRef={mainRef} page={page} boundary={motionBoundary} motionLocation={motionLocation} navigation={navigationGeneration} blocked={motionBlocked} onOpen={openGame} preparePreview={preparePreview}>
    {({ openCollection, preview, previewFromDiscover, origin, interaction }) => (
    <CompareTrayProvider scope={libraryScope} interaction={interaction}><CompareTrayBindings needsArtwork={['friend', 'friend-shelf', 'compare'].includes(page)} previewId={transientPreview?.authority ? null : selectedSlug} resolvedRecordId={selectedRecord?.id ?? null} onResolvePreview={rememberPreview}>{(tray, artwork, previewLoading) => {
      const pinnedIds = catalogPinnedIds(tray.items);
      const pin = (record: LibraryRecord) => {
        if (onlineOpening || activeScope.current !== libraryScope) { notify('Wait for the correct account before pinning a game.'); return false; }
        return tray.pin(record);
      };
      const dragHandle = (record: LibraryRecord) => !onlineOpening && <CompareDragHandle record={record} compact />;
      return (
    <LibraryModeContext.Provider value={libraryMode}>
      <a className="skip-link" href={page === 'collection' ? '#collection' : '#page-main'}>Skip to {page === 'collection' ? 'the collection' : 'page content'}</a>
      <AppHeader page={page} onlineAvailable={ONLINE_AVAILABLE} libraryScope={libraryScope} libraryLabel={libraryMode.label} syncStatus={online?.status ?? 'device'} headerIdentity={headerIdentity} savedCount={savedCount} animate={capabilities.animate} menuOpen={panel === 'menu'} pageHref={pageHref} onNavigateLink={(event, next) => { void navigateLink(event, next); }} onQueue={() => navigate('library', { list: 'later' })} onMenu={() => setPanel('menu')} onAccount={() => { void accountEntry(); }} onIntent={prefetchAppTools} />
      <GlobalBanners warning={warning} onlineConfigError={ONLINE_CONFIG_ERROR} offline={pwaEnabled && !pwa.online} offlineReady={pwa.offlineState === 'ready'} hintError={hintError} onSettings={() => setPanel('settings')} onAccount={() => { void accountEntry(); }} onDeviceOnly={() => { setHintError(''); void rememberOnlineRequest(false); }} />
      <main id="page-main" ref={mainRef}>
        <RouteHost route={page} scope={libraryScope}
          online={ONLINE_AVAILABLE && (onlineRequested || cloudPage) ? {
            onDevice: () => { void rememberOnlineRequest(false); setOnlineRequested(false); setOnline(null); navigate('collection'); },
            fallback: cloudPage ? { route: page, kind: 'cloud-page' } : panel === 'account' ? { route: page, kind: 'account-sheet', onClose: () => setPanel(null), getReturnFocus: getSignInReturnFocus } : null,
            props: {
              page, publicHandle, invitation, showSheet: panel === 'account', guest: guestLibrary, games: games ?? [], onBridge: setOnline,
              onCloseSheet: () => setPanel(null), getSignInReturnFocus, onNavigate: navigate, onProfile: openProfile, onOpenRecord: preview,
              onShare: (title, url) => { void share(title, url, false); }, onPinRecord: pin, artwork,
            },
          } : null}
          content={cloudPage ? !ONLINE_AVAILABLE ? { kind: 'unconfigured' } : null : privateLoading ? { kind: 'private-library' } :
            personalPage === 'library' || personalPage === 'rankings' ? { kind: 'personal', props: {
              friendSharing: libraryScope !== 'guest' ? online?.friendSharing : undefined, scope: libraryScope, view: gamesView,
              onViewChange: changeGamesView, state: library.state, filters, busy: libraryBusy, animate: capabilities.animate,
              onFilters: updateFilters, onAction: perform, onOpen: openGame, onDiscover: () => navigate('discover'),
              onBrowse: () => navigate('collection'), availableRecords: [...allRecords.values()], persistent: library.status === 'ready',
              onPublish: ONLINE_AVAILABLE ? () => navigate('publish') : undefined, onPin: pin, onUnpin: tray.unpin, pinnedIds, renderDragHandle: dragHandle,
            } } : page === 'discover' ? { kind: 'discover', props: {
              collection, state: library.state, busy: libraryBusy, onAction: perform, onLibrary: () => navigate('games'),
              onCommunity: ONLINE_AVAILABLE ? () => navigate('community') : undefined, onPreview: previewFromDiscover, onPin: pin, pinnedIds, renderDragHandle: dragHandle,
            } } : { kind: 'collection', props: {
              collection, state: library.state, filters, busy: libraryBusy, motion: effectiveMotion, animate: capabilities.animate,
              reducedMotion: capabilities.reducedMotion, coarsePointer: capabilities.coarsePointer, constrained: capabilities.constrained,
              onFilters: updateFilters, onAction: perform, onOpen: openCollection, onPreview: previewFromDiscover, onShare: () => shareView(),
              onFullLibrary: () => navigate('library', { list: filters.list === 'later' || filters.list === 'completed' ? filters.list : 'all' }),
              notify, onPin: pin, pinnedIds, renderDragHandle: dragHandle,
            } }} />
      </main>
      <SiteFooter onAbout={() => setPanel('about')} onEffects={() => setPanel('settings')} effects={library.state.motion} />
      <MobileNav page={page} personalPage={personalPage} gamesView={gamesView} onlineAvailable={ONLINE_AVAILABLE} menuOpen={panel === 'menu'} pageHref={pageHref} onNavigateLink={(event, next) => { void navigateLink(event, next); }} onBrowseLink={event => { void navigateLink(event, 'collection', {}, browse); }} onMenu={() => setPanel('menu')} onIntent={prefetchAppTools} />
      <TrayHost page={page} tray={{ onCompare: records => { void compareGames(records); }, onPreview: preview, resolveArtwork: record => artwork.get(record.id), animate: capabilities.animate, hidden: onlineOpening || Boolean(selectedSlug) || Boolean(panel) || Boolean(manualLink) }} />
      <DialogHost page={page}
        game={selectedGame && selectedPersonalRecord && !onlineOpening ? { key: `${libraryScope}:${selectedPersonalRecord.id}`, props: {
          game: selectedGame, motionOrigin: origin, state: library.state.progress[selectedPersonalRecord.id],
          previous: games?.[selectedGame.rank - 2], next: games?.[selectedGame.rank], onClose: closeGame, onOpen: openGame, onToggle: toggle,
          onShare: () => shareView(selectedGame.slug), shareFeedback: notice || library.error || '', busy: libraryBusy,
          played: library.state.progress[selectedPersonalRecord.id]?.played, onPlayed: value => toggle(selectedGame.slug, 'played', value),
          rankingPosition: rankingPosition || null, onRank: rankSelected,
          personalRating: library.state.ranking.find(entry => entry.id === selectedPersonalRecord.id)?.score ?? null,
          onRate: score => perform({ type: 'rate-game', record: selectedPersonalRecord, score }),
          savedCopies: <SavedCatalogCopies canonicalId={selectedGame.slug} copies={ownership.get(selectedGame.slug)} onOpen={record => openGame(record.id)} />,
        } } : null}
        catalog={!selectedGame && selectedRecord && !onlineOpening ? { key: `${libraryScope}:${selectedRecord.id}`, props: {
          record: selectedRecord, artwork: artwork.get(selectedRecord.id), motionOrigin: origin, publicLookup,
          saved: Boolean(library.state.records[selectedRecord.id]), progress: library.state.progress[selectedRecord.id],
          rankingPosition: rankingPosition || null, rating: library.state.ranking.find(entry => entry.id === selectedRecord.id)?.score ?? null,
          busy: libraryBusy, onClose: closeGame, onAction: performDetailAction, onRankings: () => navigate('rankings'),
        } } : null}
        loadingGame={Boolean(selectedSlug && (previewLoading || awaitingCanonicalPreview && collection.status === 'loading') && !selectedRecord && !onlineOpening)}
        canonicalError={awaitingCanonicalPreview && collection.status === 'error' && !onlineOpening ? { message: collection.error, retry: collection.retry } : null}
        missingGame={Boolean(selectedSlug && !awaitingCanonicalPreview && !previewLoading && collection.status !== 'loading' && library.status !== 'loading' && !onlineOpening && !selectedRecord)}
        onCloseGame={closeGame}
        menu={panel === 'menu' ? { key: libraryScope, props: {
          page, gamesView, filters, onlineAvailable: ONLINE_AVAILABLE, creator: Boolean(!onlineOpening && online?.identity?.verified && online.creator),
          onNavigate: navigate, onSettings: () => { setOfflineSettings(false); setPanel('settings'); },
          onOffline: pwaEnabled ? () => { setOfflineSettings(true); setPanel('settings'); } : undefined,
          onAbout: () => setPanel('about'), onClose: closePanel, captureFocusGuard: captureMenuFocusGuard,
          status: panelMessage, statusError: panelMessageError, recovery: panelRecovery,
        } } : null}
        about={panel === 'about' ? { onClose: () => {
          setPanel(null);
          const params = new URLSearchParams(location.search);
          if (params.has('info')) { params.delete('info'); history.replaceState(history.state, '', `${location.pathname}${params.size ? `?${params}` : ''}`); }
        } } : null}
        settings={panel === 'settings' ? { key: libraryScope, props: {
          motion: library.state.motion, reducedMotion: capabilities.reducedMotion, constrained: capabilities.constrained,
          saved: savedCount, completed: completedCount, warning, onMotion: motion => { void perform({ type: 'set-motion', motion }); },
          onReset: library.reset, onRestore: library.restore, state: library.state, persistent: library.status === 'ready', busy: libraryBusy,
          onAbout: () => setPanel('about'), onAccount: ONLINE_AVAILABLE ? () => { void accountEntry(); } : undefined,
          onClose: () => setPanel(null),
          status: panelMessage, statusError: panelMessageError, recovery: panelRecovery,
        } } : null}
        offlineSettings={pwaEnabled ? { pwa, open: offlineSettings, onUpdate: applyPwaUpdate } : undefined}
        manualShare={manualLink ? { link: manualLink, onClose: closeManualLink } : null} />
      <div className={`toast ${visibleNotice ? 'toast-visible' : ''}`} role={panelRecovery ? undefined : 'status'} aria-live={panelRecovery ? undefined : 'polite'} aria-atomic="true">{!panel && !manualLink && !selectedSlug && panelRecovery ? panelRecovery : visibleNotice && <><Icon name="info" width="19" height="19" /><span>{visibleNotice}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => { setNotice(''); dismissPanelMessage(); }}><Icon name="close" width="17" height="17" /></button></>}</div>
      {sharing && <span className="sr-only" role="status">Opening sharing options...</span>}
    </LibraryModeContext.Provider>
      );
    }}</CompareTrayBindings></CompareTrayProvider>
    )}</AppMotionBindings>
    </MotionProvider>
  );
}
