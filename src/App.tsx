import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { useCollection } from './hooks/useCollection';
import { useLibrary } from './hooks/useLibrary';
import { useUrlState } from './hooks/useUrlState';
import { useCapabilities } from './hooks/useCapabilities';
import { useShare } from './hooks/useShare';
import { createShareUrl, PAGE_PATHS } from './lib/url';
import type { AppPage, Filters } from './lib/types';
import type { LibraryRecord, PersonalAction } from './lib/personal-types';
import { recordFromGame } from './lib/personal-types';
import { Icon } from './components/Icon';
import CollectionPage from './components/CollectionPage';
import { GameDetail } from './components/GameDetail';
import { AboutDialog } from './components/AboutDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { Dialog } from './components/Dialog';
import CountUp from './components/bits/CountUp';
import { SiteFooter } from './components/SiteFooter';
import { ONLINE_AVAILABLE, ONLINE_CONFIG_ERROR, onlineWasRequested, rememberOnlineRequest, resolveOnlineRequest } from './lib/online-availability';
import type { OnlineBridge } from './cloud/ui-types';
import { LibraryModeContext } from './lib/library-mode';
import { flushPendingEdits } from './hooks/useExitSave';
import { OnlineBoundary } from './components/OnlineBoundary';
import { captureInviteContinuation } from './lib/invite-continuation';
import { CompareDragHandle, CompareTray, CompareTrayProvider, useCompareTray } from './components/compare-tray';
import { useDiscoveryCatalog } from './hooks/useDiscoveryCatalog';
import { indexDiscoveryArtwork } from './lib/discovery-catalog';
import type { CatalogArtwork } from './lib/discovery-catalog';
import { createComparisonGameFilter, rememberComparisonGameFilter } from './lib/comparison-game-filter';
import { comparisonScope, initialComparison, readComparisonView, rememberComparisonView } from './lib/friend-comparison-intent';
import type { PreviewAuthority } from './lib/preview-authority';

const MyGamesPage = lazy(() => import('./components/personal/MyGamesPage'));
const CatalogDetail = lazy(() => import('./components/personal/CatalogDetail'));
const DiscoverPage = lazy(() => import('./components/catalog/DiscoverPage'));
const OnlineController = lazy(() => import('./cloud/OnlineController'));
const PAGE_TITLES: Record<AppPage, string> = { collection: 'Find your next game', games: 'My games', library: 'My games - Library', rankings: 'My games - Ranking', discover: 'Discover more games', account: 'Account', community: 'Community', publish: 'Publish ranking', profile: 'A shared ranking', creator: 'Creator desk', friends: 'Friends', friend: 'Friend', invite: 'Invitation', compare: 'Compare rankings', 'friend-sharing': 'Friends sharing', 'friend-shelf': 'Shared games' };
const noPreviewSubscription = () => () => {};
interface PreviewedRecord { record: LibraryRecord; authority?: PreviewAuthority }

function CompareTrayBindings({ needsArtwork, previewId, onResolvePreview, children }: {
  needsArtwork: boolean;
  previewId: string | null; onResolvePreview: (record: LibraryRecord) => void;
  children: (tray: ReturnType<typeof useCompareTray>, artwork: ReadonlyMap<string, CatalogArtwork>, previewLoading: boolean) => ReactNode;
}) {
  const tray = useCompareTray();
  const publicPreview = Boolean(previewId && /^(wikidata:Q[1-9]\d*|freetogame:[1-9]\d*)$/.test(previewId));
  const catalog = useDiscoveryCatalog(needsArtwork || publicPreview || tray.items.some((record) => record.source !== 'collection'));
  const artwork = useMemo(() => catalog.catalog ? indexDiscoveryArtwork(catalog.catalog) : new Map<string, CatalogArtwork>(), [catalog.catalog]);
  const record = tray.items.find((item) => item.id === previewId) ?? catalog.catalog?.items.find((item) => item.record.id === previewId)?.record;
  useEffect(() => { if (record) onResolvePreview(record); }, [record, onResolvePreview]);
  return children(tray, artwork, publicPreview && !record && (catalog.status === 'idle' || catalog.status === 'loading'));
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
  const libraryBusy = library.busy || onlineOpening;
  const libraryScope = online?.scope ?? 'guest';
  const headerIdentity = online?.identity && online.headerIdentity?.uid === online.identity.uid ? online.headerIdentity : null;
  const activeScope = useRef(libraryScope);
  const scopeGeneration = useRef(0);
  if (activeScope.current !== libraryScope) { activeScope.current = libraryScope; scopeGeneration.current += 1; }
  const navigationGeneration = useRef(0);
  useEffect(() => {
    const changed = () => { navigationGeneration.current += 1; };
    window.addEventListener('popstate', changed); window.addEventListener('play100:navigate', changed);
    return () => { window.removeEventListener('popstate', changed); window.removeEventListener('play100:navigate', changed); };
  }, []);
  const libraryMode = useMemo(() => ({ scope: libraryScope, onlineEnabled: online?.enabled ?? false, label: onlineOpening ? 'Opening account...' : online?.label ?? 'Device only' }), [libraryScope, onlineOpening, online?.enabled, online?.label]);
  const effectiveMotion = library.status === 'loading' ? 'lite' : library.state.motion;
  const capabilities = useCapabilities(effectiveMotion);
  const [panel, setPanel] = useState<'about' | 'settings' | 'account' | null>(() => new URLSearchParams(location.search).get('info') === 'credits' ? 'about' : null);
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
  const selectedGame = games?.find((game) => game.slug === selectedSlug);
  const transientPreview = selectedSlug && previewedRecords.scope === libraryScope ? previewedRecords.records.get(selectedSlug) : undefined;
  const previewPermitted = useSyncExternalStore(transientPreview?.authority?.subscribe ?? noPreviewSubscription,
    () => !transientPreview?.authority || transientPreview.authority.scope === libraryScope && transientPreview.authority.permits(transientPreview.record.id),
    () => false);
  const selectedRecord = selectedSlug ? allRecords.get(selectedSlug) ?? (previewPermitted ? transientPreview?.record : undefined) : undefined;
  const savedCount = library.state.queueOrder.length;
  const completedCount = Object.values(library.state.progress).filter((value) => value.completed).length;
  const rankingPosition = selectedSlug ? library.state.ranking.findIndex((entry) => entry.id === selectedSlug) + 1 : 0;
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
  }, [saveAction, storageStatus, notify, libraryScope, onlineOpening]);
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
  const preview = useCallback((record: LibraryRecord, authority?: PreviewAuthority) => {
    if (authority && (authority.scope !== libraryScope || !authority.permits(record.id))) { notify('This shared game is no longer available.'); return; }
    rememberPreview(record, authority);
    openGame(record.id);
  }, [openGame, rememberPreview, libraryScope, notify]);
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

  const navigate = (next: AppPage, patch: Partial<Filters> = {}) => { setPanel(null); goToPage(next, patch); };
  const accountEntry = async () => {
    if (!await flushPendingEdits()) { notify('Finish or correct the open rating or note before changing accounts.'); return; }
    setHintError('');
    setOnlineRequested(true);
    if (online?.identity || page === 'account') navigate('account');
    else setPanel('account');
  };
  const navigateLink = (event: MouseEvent<HTMLAnchorElement>, next: AppPage, patch: Partial<Filters> = {}) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    navigate(next, patch);
  };
  const browse = () => {
    if (page !== 'collection') navigate('collection');
    else document.getElementById('collection')?.scrollIntoView({ behavior: capabilities.animate ? 'smooth' : 'instant' });
  };
  const shareView = (slug: string | null = null) => {
    const title = slug && selectedGame ? `${selectedGame.title} | Play 100` : 'Play 100 - a collection worth playing';
    void share(title, createShareUrl(window.location.origin, filters, slug), filters.list !== 'all');
  };
  const toggle = (id: string, key: 'later' | 'completed' | 'played', value?: boolean) => {
    const record = allRecords.get(id);
    if (record) void perform(value === undefined ? { type: 'toggle-progress', record, key } : { type: 'set-progress', records: [record], key, value });
  };
  const rankSelected = () => {
    if (!selectedRecord) return;
    if (rankingPosition) navigate('rankings');
    else void perform({ type: 'add-ranking', records: [selectedRecord] });
  };
  const compareGames = async (records: LibraryRecord[]) => {
    const startedScope = scopeGeneration.current;
    const startedNavigation = navigationGeneration.current;
    if (onlineOpening) { notify('Wait for your account to finish opening before comparing.'); return; }
    if (!online?.identity || libraryScope === 'guest') {
      notify('Sign in to compare with friends. Device pins stay separate from account pins.');
      await accountEntry();
      return;
    }
    if (!online.identity.verified) { notify('Verify your account before comparing with friends.'); navigate('account'); return; }
    try {
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
    } catch (cause) { notify(cause instanceof Error ? cause.message : 'The game comparison could not be opened.'); }
  };
  const warning = library.error ?? library.warning;
  const privateLoading = ['games', 'library', 'rankings'].includes(page) && (library.status === 'loading' || onlineOpening);

  return (
    <CompareTrayProvider scope={libraryScope}><CompareTrayBindings needsArtwork={['friend', 'friend-shelf', 'compare'].includes(page)} previewId={selectedSlug} onResolvePreview={rememberPreview}>{(tray, artwork, previewLoading) => {
      const pinnedIds = new Set(tray.items.map((record) => record.id));
      const pin = (record: LibraryRecord) => {
        if (onlineOpening || activeScope.current !== libraryScope) { notify('Wait for the correct account before pinning a game.'); return false; }
        return tray.pin(record);
      };
      const dragHandle = (record: LibraryRecord) => !onlineOpening && <CompareDragHandle record={record} compact />;
      return (
    <LibraryModeContext.Provider value={libraryMode}>
      <a className="skip-link" href={page === 'collection' ? '#collection' : '#page-main'}>Skip to {page === 'collection' ? 'the collection' : 'page content'}</a>
      <header className={`site-header ${ONLINE_AVAILABLE ? 'site-header-online' : ''}`}>
        <a className="wordmark" href="/" onClick={(event) => navigateLink(event, 'collection')}><span className="logo-symbol" aria-hidden="true"><span /></span>PLAY<span>100</span><i aria-hidden="true">.</i><span className="sr-only"> Home</span></a>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="/" aria-current={page === 'collection' ? 'page' : undefined} onClick={(event) => navigateLink(event, 'collection')}>The 100</a>
          <a href={PAGE_PATHS.discover} aria-current={page === 'discover' ? 'page' : undefined} onClick={(event) => navigateLink(event, 'discover')}>Discover</a>
          <a href={PAGE_PATHS.games} aria-current={['games', 'library', 'rankings'].includes(page) ? 'page' : undefined} onClick={(event) => navigateLink(event, 'games')}>My games</a>
          {ONLINE_AVAILABLE && <a href={PAGE_PATHS.friends} aria-current={['friends', 'friend', 'compare', 'friend-sharing', 'friend-shelf'].includes(page) ? 'page' : undefined} onClick={(event) => navigateLink(event, 'friends')}>Friends</a>}
        </nav>
        <div className="header-actions">
          <button className="saved-nav" onClick={() => navigate('library', { list: 'later' })}><Icon name="bookmark" width="19" height="19" /><span className="saved-nav-label">Play later</span><CountUp to={savedCount} animate={capabilities.animate} className="saved-count" /><span className="sr-only"> games in your queue</span></button>
          <a className="icon-button header-download" href="/downloads/Play-100-Collection.xlsx" download aria-label="Download enhanced Excel workbook" title="Download Excel"><Icon name="download" /></a>
          <button className="icon-button settings-nav" aria-label="Settings and visual experience" onClick={() => setPanel('settings')}><Icon name="sliders" /></button>
          {ONLINE_AVAILABLE && <a className={`account-nav sync-${online?.status ?? 'device'}`} href="/account" aria-label={`Account${headerIdentity ? ` for ${headerIdentity.name}` : ''} ${libraryMode.label}`} title={libraryMode.label} onClick={(event) => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); void accountEntry(); } }}><span className="account-nav-avatar" aria-hidden="true">{headerIdentity ? <img src={headerIdentity.avatarSrc} width="32" height="32" alt="" draggable={false} /> : <Icon name="user" width="20" height="20" />}</span><span className="account-nav-copy"><strong>{headerIdentity?.name ?? 'Account'}</strong>{' '}<small>{libraryMode.label}</small></span></a>}
        </div>
      </header>
      {warning && <div className="global-storage"><div className="storage-banner" role="alert"><Icon name="info" /><p>{warning}</p><button className="text-button" onClick={() => setPanel('settings')}>Settings<Icon name="arrow" width="18" height="18" /></button></div></div>}
      {ONLINE_CONFIG_ERROR && <div className="global-storage"><div className="storage-banner" role="alert"><Icon name="info" /><p>{ONLINE_CONFIG_ERROR}</p></div></div>}
      {hintError && <div className="global-storage"><div className="storage-banner" role="alert"><Icon name="info" /><p>{hintError} Your libraries have not been cleared. Choose an account check or continue with this device explicitly.</p><button className="text-button" onClick={() => { void accountEntry(); }}>Open Account</button><button className="text-button" onClick={() => { setHintError(''); void rememberOnlineRequest(false); }}>Use this device only</button></div></div>}
      <main id="page-main">
        {ONLINE_AVAILABLE && (onlineRequested || cloudPage) && <OnlineBoundary onDevice={() => { void rememberOnlineRequest(false); setOnlineRequested(false); setOnline(null); navigate('collection'); }}><Suspense fallback={cloudPage ? <div className="page-loading" role="status"><h1>Loading...</h1></div> : panel === 'account' ? <Dialog open titleId="loading-account-title" onClose={() => setPanel(null)} className="info-dialog"><h2 id="loading-account-title" data-autofocus tabIndex={-1}>Opening sign-in...</h2></Dialog> : null}><OnlineController page={page} publicHandle={publicHandle} invitation={invitation} showSheet={panel === 'account'} guest={guestLibrary} games={games ?? []} onBridge={setOnline} onCloseSheet={() => setPanel(null)} onNavigate={navigate} onProfile={openProfile} onOpenRecord={preview} onShare={(title, url) => { void share(title, url, false); }} onPinRecord={pin} artwork={artwork} /></Suspense></OnlineBoundary>}
        {cloudPage && !ONLINE_AVAILABLE ? <section className="app-page empty-state"><h1>Online tools are not configured in this build.</h1><p>Your device library and the original collection remain available.</p><a className="button button-dark" href="/">Open the collection</a></section> : !cloudPage && <Suspense fallback={<div className="page-loading" role="status"><h2>Opening your page...</h2><p>Your games stay right where you left them.</p></div>}><div key={libraryScope}>
          {privateLoading ? <div className="page-loading" role="status"><h2>Opening your saved library...</h2><p>Waiting for the correct guest or account scope before allowing edits.</p></div> : personalPage === 'library' || personalPage === 'rankings' ? <MyGamesPage friendSharing={libraryScope !== 'guest' ? online?.friendSharing : undefined} scope={libraryScope} view={gamesView} onViewChange={changeGamesView} state={library.state} filters={filters} busy={libraryBusy} animate={capabilities.animate} onFilters={updateFilters} onAction={perform} onOpen={openGame} onDiscover={() => navigate('discover')} onBrowse={() => navigate('collection')} availableRecords={[...allRecords.values()]} persistent={library.status === 'ready'} onPublish={ONLINE_AVAILABLE ? () => navigate('publish') : undefined} onPin={pin} onUnpin={tray.unpin} pinnedIds={pinnedIds} renderDragHandle={dragHandle} /> : page === 'discover' ? <DiscoverPage state={library.state} busy={libraryBusy} onAction={perform} onLibrary={() => navigate('games')} onCommunity={ONLINE_AVAILABLE ? () => navigate('community') : undefined} onPreview={preview} onPin={pin} pinnedIds={pinnedIds} renderDragHandle={dragHandle} /> : <CollectionPage collection={collection} state={library.state} filters={filters} busy={libraryBusy} motion={effectiveMotion} animate={capabilities.animate} reducedMotion={capabilities.reducedMotion} coarsePointer={capabilities.coarsePointer} constrained={capabilities.constrained} onFilters={updateFilters} onAction={perform} onOpen={openGame} onPreview={preview} onShare={() => shareView()} onFullLibrary={() => navigate('library', { list: filters.list === 'later' || filters.list === 'completed' ? filters.list : 'all' })} notify={notify} onPin={pin} pinnedIds={pinnedIds} renderDragHandle={dragHandle} />}
        </div></Suspense>}
      </main>
      <SiteFooter onAbout={() => setPanel('about')} onEffects={() => setPanel('settings')} effects={library.state.motion} />
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button aria-pressed={page === 'collection'} onClick={browse}><Icon name="grid" width="20" height="20" /><span>The 100</span></button>
        <button aria-pressed={page === 'discover'} onClick={() => navigate('discover')}><Icon name="search" width="20" height="20" /><span>Discover</span></button>
        <button aria-pressed={['games', 'library', 'rankings'].includes(page)} onClick={() => navigate('games')}><Icon name="bookmark" width="20" height="20" /><span>My games</span></button>
        {ONLINE_AVAILABLE ? <button aria-pressed={['friends', 'friend', 'compare', 'friend-sharing', 'friend-shelf'].includes(page)} onClick={() => navigate('friends')}><Icon name="user" width="20" height="20" /><span>Friends</span></button> : <button aria-pressed={personalPage === 'rankings'} onClick={() => navigate('rankings')}><Icon name="rank" width="20" height="20" /><span>Ranking</span></button>}
        <button onClick={() => setPanel('settings')}><Icon name="sliders" width="20" height="20" /><span>Settings</span></button>
      </nav>
      <CompareTray onCompare={(records) => { void compareGames(records); }} onPreview={preview} resolveArtwork={(record) => artwork.get(record.id)} animate={capabilities.animate} hidden={onlineOpening || Boolean(selectedSlug) || Boolean(panel) || Boolean(manualLink)} />
      {selectedGame && !onlineOpening && <GameDetail key={libraryScope} game={selectedGame} state={library.state.progress[selectedGame.slug]} previous={games?.[selectedGame.rank - 2]} next={games?.[selectedGame.rank]} onClose={closeGame} onOpen={openGame} onToggle={toggle} onShare={() => shareView(selectedGame.slug)} shareFeedback={notice || library.error || ''} busy={libraryBusy} played={library.state.progress[selectedGame.slug]?.played}       onPlayed={value => toggle(selectedGame.slug, 'played', value)} rankingPosition={rankingPosition || null} onRank={rankSelected} personalRating={library.state.ranking.find((entry) => entry.id === selectedGame.slug)?.score ?? null} onRate={(score) => perform({ type: 'rate-game', record: recordFromGame(selectedGame), score })} />}
      {!selectedGame && selectedRecord && !onlineOpening && <Suspense fallback={null}><CatalogDetail key={`${libraryScope}:${selectedRecord.id}`} record={selectedRecord} saved={Boolean(library.state.records[selectedRecord.id])} progress={library.state.progress[selectedRecord.id]} rankingPosition={rankingPosition || null} rating={library.state.ranking.find((entry) => entry.id === selectedRecord.id)?.score ?? null} busy={libraryBusy} onClose={closeGame} onAction={performDetailAction} onRankings={() => navigate('rankings')} /></Suspense>}
      {selectedSlug && previewLoading && !selectedRecord && !onlineOpening && <Dialog open titleId="loading-game-title" onClose={closeGame} className="info-dialog"><h2 id="loading-game-title" data-autofocus tabIndex={-1}>Opening game...</h2><p role="status">Looking up its public catalog metadata.</p></Dialog>}
      {selectedSlug && !previewLoading && collection.status !== 'loading' && library.status !== 'loading' && !onlineOpening && !selectedRecord && <Dialog open titleId="missing-game-title" onClose={closeGame} className="info-dialog"><h2 id="missing-game-title" data-autofocus tabIndex={-1}>{page === 'collection' ? "That game isn't in this collection." : "That game isn't in the active library."}</h2><p>{page === 'collection' ? 'This link may be old or incomplete. All 100 games are still here.' : 'Guest and account libraries stay separate. Open the correct account, import your backup, or add this game from Discover.'}</p><button className="button button-dark" onClick={closeGame}>Back to the collection<Icon name="arrow" /></button></Dialog>}
      {panel === 'about' && <AboutDialog onClose={() => {
        setPanel(null);
        const params = new URLSearchParams(location.search);
        if (params.has('info')) { params.delete('info'); history.replaceState(history.state, '', `${location.pathname}${params.size ? `?${params}` : ''}`); }
      }} />}
      {panel === 'settings' && <SettingsDialog key={libraryScope} motion={library.state.motion} reducedMotion={capabilities.reducedMotion} constrained={capabilities.constrained} saved={savedCount} completed={completedCount} warning={warning} onMotion={(motion) => { void perform({ type: 'set-motion', motion }); }} onReset={library.reset} onRestore={library.restore} state={library.state} persistent={library.status === 'ready'} busy={libraryBusy} onAbout={() => setPanel('about')} onAccount={ONLINE_AVAILABLE ? () => { void accountEntry(); } : undefined} onClose={() => setPanel(null)} />}
      {manualLink && <Dialog open titleId="share-title" onClose={closeManualLink} className="info-dialog share-dialog"><h2 id="share-title" data-autofocus tabIndex={-1}>Good games are better shared.</h2><p>This browser couldn't share or copy automatically. Select this public link and copy it to send to a friend. Your private progress isn't included.</p><label htmlFor="share-link">Shareable link</label><input id="share-link" value={manualLink} readOnly onFocus={(event) => event.target.select()} /><button className="button button-dark" onClick={() => { const input = document.getElementById('share-link'); if (input instanceof HTMLInputElement) { input.focus(); input.select(); } }}><Icon name="copy" width="18" height="18" />Select link to copy</button></Dialog>}
      <div className={`toast ${notice ? 'toast-visible' : ''}`} role="status" aria-live="polite" aria-atomic="true">{notice && <><Icon name="info" width="19" height="19" /><span>{notice}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><Icon name="close" width="17" height="17" /></button></>}</div>
      {sharing && <span className="sr-only" role="status">Opening sharing options...</span>}
    </LibraryModeContext.Provider>
      );
    }}</CompareTrayBindings></CompareTrayProvider>
  );
}
