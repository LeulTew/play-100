import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
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
import { author } from './lib/author';
import { ONLINE_AVAILABLE, onlineWasRequested, rememberOnlineRequest } from './lib/online-availability';
import type { OnlineBridge } from './cloud/ui-types';
import { LibraryModeContext } from './lib/library-mode';
import { flushPendingEdits } from './hooks/useExitSave';
import { OnlineBoundary } from './components/OnlineBoundary';

const LibraryPage = lazy(() => import('./components/personal/LibraryPage'));
const RankingsPage = lazy(() => import('./components/personal/RankingsPage'));
const CatalogDetail = lazy(() => import('./components/personal/CatalogDetail'));
const DiscoverPage = lazy(() => import('./components/catalog/DiscoverPage'));
const OnlineController = lazy(() => import('./cloud/OnlineController'));
const PAGE_TITLES: Record<AppPage, string> = { collection: 'Find your next game', library: 'My library', rankings: 'My rankings', discover: 'Discover more games', account: 'Account and online saving', community: 'Community rankings', publish: 'Publish a ranking', profile: 'A shared ranking', creator: 'Creator desk' };

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
  const collection = useCollection();
  const canonicalRecords = useMemo(() => collection.data?.games.map(recordFromGame) ?? [], [collection.data]);
  const guestLibrary = useLibrary(canonicalRecords, collection.status === 'loading');
  const { page, filters, game: selectedSlug, publicHandle, updateFilters, openGame, closeGame, goToPage, openProfile } = useUrlState();
  const cloudPage = ['account', 'publish', 'community', 'profile', 'creator'].includes(page);
  const [onlineRequested, setOnlineRequested] = useState(onlineWasRequested);
  const [online, setOnline] = useState<OnlineBridge | null>(null);
  const onlineOpening = ONLINE_AVAILABLE && ((onlineRequested && online === null) || Boolean(online?.loading));
  const library = online?.controller ?? guestLibrary;
  const libraryBusy = library.busy || onlineOpening;
  const libraryScope = online?.scope ?? 'guest';
  const activeScope = useRef(libraryScope);
  activeScope.current = libraryScope;
  const libraryMode = useMemo(() => ({ scope: libraryScope, onlineEnabled: online?.enabled ?? false, label: onlineOpening ? 'Opening account...' : online?.label ?? 'Device only' }), [libraryScope, onlineOpening, online?.enabled, online?.label]);
  const effectiveMotion = library.status === 'loading' ? 'lite' : library.state.motion;
  const capabilities = useCapabilities(effectiveMotion);
  const [panel, setPanel] = useState<'about' | 'settings' | 'account' | null>(null);
  const [previewedRecords, setPreviewedRecords] = useState<{ scope: string; records: Map<string, LibraryRecord> }>({ scope: 'guest', records: new Map() });
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
  const selectedRecord = selectedSlug ? allRecords.get(selectedSlug) ?? (previewedRecords.scope === libraryScope ? previewedRecords.records.get(selectedSlug) : undefined) : undefined;
  const savedCount = library.state.queueOrder.length;
  const completedCount = Object.values(library.state.progress).filter((value) => value.completed).length;
  const rankingPosition = selectedSlug ? library.state.ranking.findIndex((entry) => entry.id === selectedSlug) + 1 : 0;
  const saveAction = library.perform;
  const storageStatus = library.status;

  const perform = useCallback(async (action: PersonalAction) => {
    if (onlineOpening) { notify('Wait for the account scope to finish opening before changing saved data.'); return false; }
    const success = await saveAction(action);
    if (success && activeScope.current === libraryScope) notify(`${actionMessage(action)}${storageStatus === 'temporary' ? ' This tab only: export a backup to keep it.' : ''}`);
    return success;
  }, [saveAction, storageStatus, notify, libraryScope, onlineOpening]);
  const preview = useCallback((record: LibraryRecord) => {
    setPreviewedRecords((previous) => {
      const next = new Map([...(previous.scope === libraryScope ? previous.records : new Map()), [record.id, record]]);
      if (next.size > 64) {
        const oldest = next.keys().next().value;
        if (oldest !== undefined) next.delete(oldest);
      }
      return { scope: libraryScope, records: next };
    });
    openGame(record.id);
  }, [openGame, libraryScope]);

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
  const toggle = (id: string, key: 'later' | 'completed' | 'played') => {
    const record = allRecords.get(id);
    if (record) void perform({ type: 'toggle-progress', record, key });
  };
  const rankSelected = () => {
    if (!selectedRecord) return;
    if (rankingPosition) navigate('rankings');
    else void perform({ type: 'add-ranking', records: [selectedRecord] });
  };
  const warning = library.error ?? library.warning;
  const privateLoading = page !== 'collection' && (library.status === 'loading' || onlineOpening);

  return (
    <LibraryModeContext.Provider value={libraryMode}>
      <a className="skip-link" href={page === 'collection' ? '#collection' : '#page-main'}>Skip to {page === 'collection' ? 'the collection' : 'page content'}</a>
      <header className={`site-header ${ONLINE_AVAILABLE ? 'site-header-online' : ''}`}>
        <a className="wordmark" href="/" onClick={(event) => navigateLink(event, 'collection')}><span className="logo-symbol" aria-hidden="true"><span /></span>PLAY<span>100</span><i aria-hidden="true">.</i><span className="sr-only"> Home</span></a>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="/" aria-current={page === 'collection' ? 'page' : undefined} onClick={(event) => navigateLink(event, 'collection')}>The 100</a>
          <a href={PAGE_PATHS.discover} aria-current={page === 'discover' ? 'page' : undefined} onClick={(event) => navigateLink(event, 'discover')}>Discover</a>
          <a href={PAGE_PATHS.library} aria-current={page === 'library' ? 'page' : undefined} onClick={(event) => navigateLink(event, 'library')}>My library</a>
          <a href={PAGE_PATHS.rankings} aria-current={page === 'rankings' ? 'page' : undefined} onClick={(event) => navigateLink(event, 'rankings')}>My rankings</a>
        </nav>
        <div className="header-actions">
          <button className="saved-nav" onClick={() => navigate('library', { list: 'later' })}><Icon name="bookmark" width="19" height="19" /><span className="saved-nav-label">Play later</span><CountUp to={savedCount} animate={capabilities.animate} className="saved-count" /><span className="sr-only"> games in your queue</span></button>
          <a className="icon-button header-download" href="/downloads/Play-100-Collection.xlsx" download aria-label="Download enhanced Excel workbook" title="Download Excel"><Icon name="download" /></a>
          <button className="icon-button settings-nav" aria-label="Settings and visual experience" onClick={() => setPanel('settings')}><Icon name="sliders" /></button>
          {ONLINE_AVAILABLE && <a className={`account-nav sync-${online?.status ?? 'device'}`} href="/account" aria-label={`Account: ${libraryMode.label}`} onClick={(event) => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); void accountEntry(); } }}><Icon name="user" width="20" height="20" /><span className="account-nav-copy"><strong>Account:</strong>{' '}<small>{libraryMode.label}</small></span></a>}
        </div>
      </header>
      {warning && <div className="global-storage"><div className="storage-banner" role="alert"><Icon name="info" /><p>{warning}</p><button className="text-button" onClick={() => setPanel('settings')}>Settings<Icon name="arrow" width="18" height="18" /></button></div></div>}
      <main id="page-main">
        {ONLINE_AVAILABLE && (onlineRequested || cloudPage) && <OnlineBoundary onDevice={() => { rememberOnlineRequest(false); setOnlineRequested(false); setOnline(null); navigate('collection'); }}><Suspense fallback={cloudPage ? <div className="page-loading" role="status"><h1>Opening online tools...</h1><p>Your device library is not being uploaded.</p></div> : panel === 'account' ? <Dialog open titleId="loading-account-title" onClose={() => setPanel(null)} className="info-dialog"><h2 id="loading-account-title" data-autofocus tabIndex={-1}>Opening sign-in...</h2><p role="status">Your device library remains separate.</p></Dialog> : null}><OnlineController page={page} publicHandle={publicHandle} showSheet={panel === 'account'} guest={guestLibrary} games={games ?? []} onBridge={setOnline} onCloseSheet={() => setPanel(null)} onNavigate={navigate} onProfile={openProfile} onOpenRecord={preview} onShare={(title, url) => { void share(title, url, false); }} /></Suspense></OnlineBoundary>}
        {cloudPage && !ONLINE_AVAILABLE ? <section className="app-page empty-state"><h1>Online tools are not configured in this build.</h1><p>Your device library and the original collection remain available.</p><a className="button button-dark" href="/">Open the collection</a></section> : !cloudPage && <Suspense fallback={<div className="page-loading" role="status"><h2>Opening your page...</h2><p>Your games stay right where you left them.</p></div>}><div key={libraryScope}>
          {privateLoading ? <div className="page-loading" role="status"><h2>Opening your saved library...</h2><p>Waiting for the correct guest or account scope before allowing edits.</p></div> : page === 'library' ? <LibraryPage state={library.state} filters={filters} busy={libraryBusy} animate={capabilities.animate} onFilters={updateFilters} onAction={perform} onOpen={openGame} onDiscover={() => navigate('discover')} onBrowse={() => navigate('collection')} /> : page === 'rankings' ? <RankingsPage state={library.state} availableRecords={[...allRecords.values()]} busy={libraryBusy} persistent={library.status === 'ready'} animate={capabilities.animate} onAction={perform} onOpen={openGame} onDiscover={() => navigate('discover')} onPublish={ONLINE_AVAILABLE ? () => navigate('publish') : undefined} /> : page === 'discover' ? <DiscoverPage state={library.state} busy={libraryBusy} onAction={perform} onLibrary={() => navigate('library')} onCommunity={ONLINE_AVAILABLE ? () => navigate('community') : undefined} /> : <CollectionPage collection={collection} state={library.state} filters={filters} busy={libraryBusy} motion={effectiveMotion} animate={capabilities.animate} reducedMotion={capabilities.reducedMotion} coarsePointer={capabilities.coarsePointer} constrained={capabilities.constrained} onFilters={updateFilters} onAction={perform} onOpen={openGame} onPreview={preview} onShare={() => shareView()} onFullLibrary={() => navigate('library', { list: filters.list === 'later' || filters.list === 'completed' ? filters.list : 'all' })} notify={notify} />}
        </div></Suspense>}
      </main>
      {page !== 'collection' && <div className="compact-download"><a className="text-button" href="/downloads/Play-100-Collection.xlsx" download><Icon name="download" width="17" height="17" />Download the author's Excel collection</a><a className="original-download" href="/downloads/AAA_games_u_have_to_play_list_top_100.xlsx" download>Untouched original spreadsheet</a></div>}
      <footer className="site-footer">
        <div className="author-footer"><p>Curated by <strong>{author.fullName}</strong></p><nav aria-label="Creator links"><a href={author.githubUrl} target="_blank" rel="noreferrer">GitHub repository<Icon name="up-right" width="15" height="15" /></a><a href={author.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn<Icon name="up-right" width="15" height="15" /></a><a href={author.telegramUrl} target="_blank" rel="noreferrer">Telegram {author.telegramHandle}<Icon name="up-right" width="15" height="15" /></a></nav></div>
        <div className="footer-main"><a className="wordmark footer-wordmark" href="/" onClick={(event) => navigateLink(event, 'collection')}>PLAY<span>100</span><i aria-hidden="true">.</i></a><p>Less choosing. More playing.</p><button className="text-button" onClick={browse}>Back to the 100<Icon name="up-right" width="17" height="17" /></button></div>
        <div className="footer-bottom"><span>The author's 100 stays intact. Your collection can go further.</span><div><button onClick={() => setPanel('about')}>Source, methodology &amp; credits</button><button onClick={() => setPanel('settings')}>Experience: {library.state.motion}<Icon name="sliders" width="17" height="17" /></button></div></div>
      </footer>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button aria-pressed={page === 'collection'} onClick={browse}><Icon name="grid" width="20" height="20" /><span>The 100</span></button>
        <button aria-pressed={page === 'discover'} onClick={() => navigate('discover')}><Icon name="search" width="20" height="20" /><span>Discover</span></button>
        <button aria-pressed={page === 'library'} onClick={() => navigate('library', { list: 'later' })}><Icon name="bookmark" width="20" height="20" /><span>Play later{savedCount ? ` (${savedCount})` : ''}</span></button>
        <button aria-pressed={page === 'rankings'} onClick={() => navigate('rankings')}><Icon name="rank" width="20" height="20" /><span>My rankings</span></button>
        <button onClick={() => setPanel('settings')}><Icon name="sliders" width="20" height="20" /><span>Settings</span></button>
      </nav>
      {selectedGame && !onlineOpening && <GameDetail key={libraryScope} game={selectedGame} state={library.state.progress[selectedGame.slug]} previous={games?.[selectedGame.rank - 2]} next={games?.[selectedGame.rank]} onClose={closeGame} onOpen={openGame} onToggle={toggle} onShare={() => shareView(selectedGame.slug)} shareFeedback={notice || library.error || ''} busy={libraryBusy} played={library.state.progress[selectedGame.slug]?.played} onPlayed={() => toggle(selectedGame.slug, 'played')} rankingPosition={rankingPosition || null} onRank={rankSelected} personalRating={library.state.ranking.find((entry) => entry.id === selectedGame.slug)?.score ?? null} onRate={(score) => perform({ type: 'rate-game', record: recordFromGame(selectedGame), score })} />}
      {!selectedGame && selectedRecord && !onlineOpening && <Suspense fallback={null}><CatalogDetail key={`${libraryScope}:${selectedRecord.id}`} record={selectedRecord} saved={Boolean(library.state.records[selectedRecord.id])} progress={library.state.progress[selectedRecord.id]} rankingPosition={rankingPosition || null} rating={library.state.ranking.find((entry) => entry.id === selectedRecord.id)?.score ?? null} busy={libraryBusy} onClose={closeGame} onAction={perform} onRankings={() => navigate('rankings')} /></Suspense>}
      {selectedSlug && collection.status !== 'loading' && library.status !== 'loading' && !onlineOpening && !selectedRecord && <Dialog open titleId="missing-game-title" onClose={closeGame} className="info-dialog"><h2 id="missing-game-title" data-autofocus tabIndex={-1}>{page === 'collection' ? "That game isn't in this collection." : "That game isn't in the active library."}</h2><p>{page === 'collection' ? 'This link may be old or incomplete. All 100 games are still here.' : 'Guest and account libraries stay separate. Open the correct account, import your backup, or add this game from Discover.'}</p><button className="button button-dark" onClick={closeGame}>Back to the collection<Icon name="arrow" /></button></Dialog>}
      {panel === 'about' && <AboutDialog onClose={() => setPanel(null)} />}
      {panel === 'settings' && <SettingsDialog key={libraryScope} motion={library.state.motion} reducedMotion={capabilities.reducedMotion} constrained={capabilities.constrained} saved={savedCount} completed={completedCount} warning={warning} onMotion={(motion) => { void perform({ type: 'set-motion', motion }); }} onReset={library.reset} onRestore={library.restore} state={library.state} persistent={library.status === 'ready'} busy={libraryBusy} onAbout={() => setPanel('about')} onAccount={ONLINE_AVAILABLE ? () => { void accountEntry(); } : undefined} onClose={() => setPanel(null)} />}
      {manualLink && <Dialog open titleId="share-title" onClose={closeManualLink} className="info-dialog share-dialog"><h2 id="share-title" data-autofocus tabIndex={-1}>Good games are better shared.</h2><p>This browser couldn't share or copy automatically. Select this public link and copy it to send to a friend. Your private progress isn't included.</p><label htmlFor="share-link">Shareable link</label><input id="share-link" value={manualLink} readOnly onFocus={(event) => event.target.select()} /><button className="button button-dark" onClick={() => { const input = document.getElementById('share-link'); if (input instanceof HTMLInputElement) { input.focus(); input.select(); } }}><Icon name="copy" width="18" height="18" />Select link to copy</button></Dialog>}
      <div className={`toast ${notice ? 'toast-visible' : ''}`} role="status" aria-live="polite" aria-atomic="true">{notice && <><Icon name="info" width="19" height="19" /><span>{notice}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><Icon name="close" width="17" height="17" /></button></>}</div>
      {sharing && <span className="sr-only" role="status">Opening sharing options...</span>}
    </LibraryModeContext.Provider>
  );
}
