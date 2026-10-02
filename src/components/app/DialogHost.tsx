import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import type { AppPage, Filters, Game } from '../../lib/types';
import type { PersonalLibraryState } from '../../lib/personal-types';
import { catalogProgress } from '../../lib/catalog-identity';
import type { CatalogOwnership } from '../../lib/catalog-identity';
import { filterGames } from '../../lib/collection';
import { useExtendedSearchResults } from '../../hooks/useExtendedSearch';
import { focusPendingEditor, visibleMenuTrigger } from '../../lib/dialog-focus';
import { loadCatalogDetail, peekCatalogDetail } from '../../lib/catalog-detail-preload';
import type { DeviceHints } from '../../lib/device-capabilities';
import { scheduleIdlePrefetch } from '../../lib/idle-prefetch';
import { createMemoizedModule } from '../../lib/memoized-module';
import type { AboutDialog } from '../AboutDialog';
import { Dialog } from '../Dialog';
import { DialogLayerContext } from '../dialog-layer';
import type { GameDetail } from '../GameDetail';
import { Icon } from '../Icon';
import { MenuDialog } from '../MenuDialog';
import type { SettingsDialog } from '../SettingsDialog';
import type { SettingsPanelProps } from './SettingsPanel';
import { aboutDialogModule, settingsDialogModule } from '../../lib/secondary-dialogs';
import { ChunkBoundary } from '../ChunkBoundary';
import { ChunkRecovery } from '../ChunkRecovery';
import { DialogBoundary } from './DialogBoundary';

const CatalogDetail = lazy(loadCatalogDetail);
// The 100's game detail ships in the catalog detail's chunk (CatalogDetail.tsx). A page warms it when it is idle, when
// a game link is pointed at, focused or pressed, and when a linked game opens (DialogHost).
const LazyGameDetail = lazy(
  createMemoizedModule(() =>
    import('../personal/CatalogDetail').then((module) => ({ default: module.GameDetail })),
  ).load,
);
const DETAIL_INTENT_EVENTS = ['pointerover', 'focusin', 'pointerdown'] as const;
function warmGameDetail(event?: Event) {
  if (event && !(event.target instanceof Element && event.target.closest('a[href*="game="]'))) return;
  // A failed load is reported where the detail renders (DetailLoadFailure).
  void loadCatalogDetail().catch(() => undefined);
}
// Opening a game is the likeliest next step on any page, so constrained devices load the details at idle too, unless the
// reader saves data or is on 2G (the connection hints isConstrainedDevice reads).
function loadDetailAtIdle(): Promise<unknown> {
  const connection = (navigator as DeviceHints).connection;
  if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')) return Promise.resolve();
  return loadCatalogDetail();
}
type KeyedProps<T> = { key: string; props: T };
type GameDialogInput = KeyedProps<Omit<ComponentProps<typeof GameDetail>, 'previous' | 'next' | 'position'>> & {
  navigation: {
    scoped: boolean;
    filters: Filters;
    games: Game[];
    state: PersonalLibraryState;
    ownership: CatalogOwnership;
  };
};

function GameDialog({ input }: { input: GameDialogInput }) {
  // Settled once per dialog: one that opened before its module loaded stays on the lazy path, so it never remounts.
  const [Ready] = useState(() => peekCatalogDetail()?.GameDetail);
  const { navigation, props } = input;
  const { scoped, filters, games, state, ownership } = navigation;
  const records = useExtendedSearchResults(filters.q, scoped);
  const results = useMemo(
    () =>
      scoped
        ? filterGames(games, filters, catalogProgress(state, ownership), new Set(records.map((record) => record.id)))
        : games,
    [scoped, games, filters, state, ownership, records],
  );
  const index = results.findIndex((game) => game.slug === props.game.slug);
  const detail = {
    ...props,
    previous: index > 0 ? results[index - 1] : undefined,
    next: index >= 0 ? results[index + 1] : undefined,
    position: index >= 0 ? { current: index + 1, total: results.length } : null,
  };
  if (Ready) return <Ready {...detail} />;
  return (
    <ChunkBoundary fallback={<DetailLoadFailure onClose={props.onClose} getOpener={props.getOpener} />}>
      <Suspense fallback={<PendingCatalogDialog onClose={props.onClose} getOpener={props.getOpener} />}>
        <LazyGameDetail {...detail} />
      </Suspense>
    </ChunkBoundary>
  );
}

function DetailLoadFailure({ onClose, getOpener }: { onClose: () => void; getOpener?: () => HTMLElement | null }) {
  return (
    <Dialog open titleId="catalog-load-error-title" onClose={onClose} getOpener={getOpener} className="info-dialog">
      <h2 id="catalog-load-error-title" data-autofocus tabIndex={-1}>
        Game details
      </h2>
      <ChunkRecovery message="These game details didn't load." onKeepEditing={onClose} />
    </Dialog>
  );
}

function ReadyAbout(props: ComponentProps<typeof AboutDialog>) {
  const About = aboutDialogModule.peek()?.AboutDialog;
  if (!About) throw new Error('The credits must finish loading before they open.');
  return <About {...props} />;
}

function ReadySettings(props: SettingsPanelProps) {
  const Settings = settingsDialogModule.peek()?.SettingsPanel;
  if (!Settings) throw new Error('Settings must finish loading before they open.');
  return <Settings {...props} />;
}
// React.lazy suspends for at least one commit even when the module is ready. A native dialog opened in that commit
// would take the card-to-detail motion, so the loading dialog appears only once a load is actually slow.
const PENDING_DETAIL_DELAY_MS = 300;

function PendingCatalogDialog({ onClose, getOpener }: { onClose: () => void; getOpener?: () => HTMLElement | null }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), PENDING_DETAIL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  if (!slow) return null;
  return (
    <Dialog open titleId="loading-catalog-title" onClose={onClose} getOpener={getOpener} className="info-dialog">
      <h2 id="loading-catalog-title" data-autofocus tabIndex={-1}>
        Opening game…
      </h2>
      <p role="status">Loading its details.</p>
    </Dialog>
  );
}

export interface DialogHostProps {
  page: AppPage;
  scope: string;
  game: GameDialogInput | null;
  catalog: KeyedProps<ComponentProps<typeof CatalogDetail>> | null;
  loadingGame: boolean;
  canonicalError: { message: string | null; retry: () => void } | null;
  missingGame: boolean;
  metadataFailure?: boolean;
  onCloseGame: () => void;
  getGameOpener?: () => HTMLElement | null;
  menu: KeyedProps<ComponentProps<typeof MenuDialog>> | null;
  about: ComponentProps<typeof AboutDialog> | null;
  settings: KeyedProps<ComponentProps<typeof SettingsDialog>> | null;
  offlineSettings?: SettingsPanelProps['offline'];
  panelNotice?: { title: string; content: ReactNode; onClose: () => void } | null;
  manualShare: { link: string; onClose: () => void } | null;
}

export function DialogHost({
  page,
  scope,
  game,
  catalog,
  loadingGame,
  canonicalError,
  missingGame,
  metadataFailure,
  onCloseGame,
  getGameOpener,
  menu,
  about,
  settings,
  offlineSettings,
  panelNotice,
  manualShare,
}: DialogHostProps) {
  const [failure, setFailure] = useState<{ page: AppPage; scope: string; label: string } | null>(null);
  const failed = (label: string) => () => setFailure({ page, scope, label });
  const dismissFailure = () => {
    setFailure(null);
    focusPendingEditor(visibleMenuTrigger());
  };
  useEffect(() => {
    for (const name of DETAIL_INTENT_EVENTS) document.addEventListener(name, warmGameDetail, true);
    const stop = scheduleIdlePrefetch(loadDetailAtIdle, 1200, 'intent');
    return () => {
      stop();
      for (const name of DETAIL_INTENT_EVENTS) document.removeEventListener(name, warmGameDetail, true);
    };
  }, []);
  // A linked game's details load beside the collection it waits for.
  useEffect(() => {
    if (game || loadingGame) warmGameDetail();
  }, [game, loadingGame]);
  const detailOpen = game || catalog || metadataFailure || loadingGame || canonicalError || missingGame;
  return (
    <>
      {detailOpen && (
        <DialogBoundary
          key={game?.key ?? catalog?.key ?? `${scope}:detail`}
          onClose={onCloseGame}
          onFailure={failed('Game details')}
        >
          {game && <GameDialog input={game} />}
          {catalog && (
            <ChunkBoundary
              key={catalog.key}
              fallback={<DetailLoadFailure onClose={onCloseGame} getOpener={getGameOpener} />}
            >
              <Suspense fallback={<PendingCatalogDialog onClose={onCloseGame} getOpener={getGameOpener} />}>
                <CatalogDetail key={catalog.key} {...catalog.props} />
              </Suspense>
            </ChunkBoundary>
          )}
          {metadataFailure && (
            <Dialog
              open
              titleId="catalog-parser-error-title"
              onClose={onCloseGame}
              getOpener={getGameOpener}
              className="info-dialog"
            >
              <h2 id="catalog-parser-error-title" data-autofocus tabIndex={-1}>
                Game details
              </h2>
              <ChunkRecovery message="The catalog tools didn't load." onKeepEditing={onCloseGame} />
            </Dialog>
          )}
          {loadingGame && (
            <Dialog
              open
              titleId="loading-game-title"
              onClose={onCloseGame}
              getOpener={getGameOpener}
              className="info-dialog"
            >
              <h2 id="loading-game-title" data-autofocus tabIndex={-1}>
                Opening game…
              </h2>
              <p role="status">Looking up its public catalog metadata.</p>
            </Dialog>
          )}
          {canonicalError && (
            <Dialog
              open
              titleId="canonical-game-error-title"
              onClose={onCloseGame}
              getOpener={getGameOpener}
              className="info-dialog"
            >
              <h2 id="canonical-game-error-title" data-autofocus tabIndex={-1}>
                The original game could not load.
              </h2>
              <p>{canonicalError.message} Your saved records have not changed.</p>
              <button className="button button-dark" onClick={canonicalError.retry}>
                Reload The 100
              </button>
            </Dialog>
          )}
          {missingGame && (
            <Dialog
              open
              titleId="missing-game-title"
              onClose={onCloseGame}
              getOpener={getGameOpener}
              className="info-dialog"
            >
              <h2 id="missing-game-title" data-autofocus tabIndex={-1}>
                {page === 'collection'
                  ? "That game isn't in this collection."
                  : "That game isn't in the active library."}
              </h2>
              <p>
                {page === 'collection'
                  ? 'This link may be old or incomplete. All 100 games are still here.'
                  : 'Guest and account libraries stay separate. Open the correct account, import your backup, or add this game from Discover.'}
              </p>
              <button className="button button-dark" onClick={onCloseGame}>
                Back to the collection
                <Icon name="arrow" />
              </button>
            </Dialog>
          )}
        </DialogBoundary>
      )}
      <DialogLayerContext value={1}>
        {menu && (
          <DialogBoundary key={`menu:${menu.key}`} onClose={menu.props.onClose} onFailure={failed('Menu')}>
            <MenuDialog {...menu.props} />
          </DialogBoundary>
        )}
        {about && (
          <DialogBoundary
            key={`about:${scope}`}
            onClose={about.onClose}
            onFailure={failed('Credits')}
            getReturnFocus={about.getReturnFocus}
          >
            <ReadyAbout {...about} />
          </DialogBoundary>
        )}
        {settings && (
          <DialogBoundary
            key={`settings:${settings.key}`}
            onClose={settings.props.onClose}
            onFailure={failed('Settings')}
            getReturnFocus={settings.props.getReturnFocus}
          >
            <ReadySettings settings={settings.props} offline={offlineSettings} />
          </DialogBoundary>
        )}
        {panelNotice && (
          <DialogBoundary key={`notice:${scope}`} onClose={panelNotice.onClose} onFailure={failed('The notice')}>
            <Dialog open titleId="panel-notice-title" onClose={panelNotice.onClose} className="info-dialog">
              <h2 id="panel-notice-title" data-autofocus tabIndex={-1}>
                {panelNotice.title}
              </h2>
              {panelNotice.content}
            </Dialog>
          </DialogBoundary>
        )}
        {manualShare && (
          <DialogBoundary key={`share:${scope}`} onClose={manualShare.onClose} onFailure={failed('Sharing')}>
            <Dialog open titleId="share-title" onClose={manualShare.onClose} className="info-dialog share-dialog">
              <h2 id="share-title" data-autofocus tabIndex={-1}>
                Copy this link
              </h2>
              <p>
                This browser couldn't share or copy automatically. Select this public link and copy it to send to a
                friend. Your private progress isn't included.
              </p>
              <label htmlFor="share-link">Shareable link</label>
              <input id="share-link" value={manualShare.link} readOnly onFocus={(event) => event.target.select()} />
              <button
                className="button button-dark"
                onClick={() => {
                  const input = document.getElementById('share-link');
                  if (input instanceof HTMLInputElement) {
                    input.focus();
                    input.select();
                  }
                }}
              >
                <Icon name="copy" width="18" height="18" />
                Select link to copy
              </button>
            </Dialog>
          </DialogBoundary>
        )}
      </DialogLayerContext>
      {failure?.scope === scope && failure.page === page && (
        <section className="app-page data-error" aria-label="Dialog recovery">
          <ChunkRecovery
            message={`${failure.label} ran into a problem. The rest of Play 100 is still available.`}
            onKeepEditing={dismissFailure}
          />
          <button className="text-button" onClick={dismissFailure}>
            Dismiss
          </button>
        </section>
      )}
    </>
  );
}
