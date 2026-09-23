import { lazy, Suspense } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import type { AppPage } from '../../lib/types';
import { loadCatalogDetail } from '../../lib/catalog-detail-preload';
import type { AboutDialog } from '../AboutDialog';
import { Dialog } from '../Dialog';
import { GameDetail } from '../GameDetail';
import { Icon } from '../Icon';
import { MenuDialog } from '../MenuDialog';
import type { SettingsDialog } from '../SettingsDialog';
import type { SettingsPanelProps } from './SettingsPanel';
import { aboutDialogModule, settingsDialogModule } from '../../lib/secondary-dialogs';
import { ChunkBoundary } from '../ChunkBoundary';
import { ChunkRecovery } from '../ChunkRecovery';

const CatalogDetail = lazy(loadCatalogDetail);
type KeyedProps<T> = { key: string; props: T };

export interface DialogHostProps {
  page: AppPage;
  game: KeyedProps<ComponentProps<typeof GameDetail>> | null;
  catalog: KeyedProps<ComponentProps<typeof CatalogDetail>> | null;
  loadingGame: boolean;
  canonicalError: { message: string | null; retry: () => void } | null;
  missingGame: boolean;
  metadataFailure?: boolean;
  onCloseGame: () => void;
  menu: KeyedProps<ComponentProps<typeof MenuDialog>> | null;
  about: ComponentProps<typeof AboutDialog> | null;
  settings: KeyedProps<ComponentProps<typeof SettingsDialog>> | null;
  offlineSettings?: SettingsPanelProps['offline'];
  panelNotice?: { title: string; content: ReactNode; onClose: () => void } | null;
  manualShare: { link: string; onClose: () => void } | null;
}

export function DialogHost({ page, game, catalog, loadingGame, canonicalError, missingGame, metadataFailure, onCloseGame, menu, about, settings, offlineSettings, panelNotice, manualShare }: DialogHostProps) {
  const About = aboutDialogModule.peek()?.AboutDialog;
  const Settings = settingsDialogModule.peek()?.SettingsPanel;
  // Reopen a URL-intent notice above any newly mounted native game dialog.
  const noticeKey = `${game?.key ?? catalog?.key ?? ''}:${loadingGame}:${missingGame}:${Boolean(canonicalError)}:${Boolean(metadataFailure)}`;
  if (about && !About || settings && !Settings) throw new Error('The dialog must finish loading before it opens.');
  return <>
    {game && <GameDetail key={game.key} {...game.props} />}
    {catalog && <ChunkBoundary key={catalog.key} fallback={<Dialog open titleId="catalog-load-error-title" onClose={onCloseGame} className="info-dialog"><h2 id="catalog-load-error-title" data-autofocus tabIndex={-1}>Game details</h2><ChunkRecovery message="These game details didn't load." /></Dialog>}><Suspense fallback={null}><CatalogDetail key={catalog.key} {...catalog.props} /></Suspense></ChunkBoundary>}
    {metadataFailure && <Dialog open titleId="catalog-parser-error-title" onClose={onCloseGame} className="info-dialog"><h2 id="catalog-parser-error-title" data-autofocus tabIndex={-1}>Game details</h2><ChunkRecovery message="The catalog tools didn't load." /></Dialog>}
    {loadingGame && <Dialog open titleId="loading-game-title" onClose={onCloseGame} className="info-dialog"><h2 id="loading-game-title" data-autofocus tabIndex={-1}>Opening game…</h2><p role="status">Looking up its public catalog metadata.</p></Dialog>}
    {canonicalError && <Dialog open titleId="canonical-game-error-title" onClose={onCloseGame} className="info-dialog"><h2 id="canonical-game-error-title" data-autofocus tabIndex={-1}>The original game could not load.</h2><p>{canonicalError.message} Your saved records have not changed.</p><button className="button button-dark" onClick={canonicalError.retry}>Reload The 100</button></Dialog>}
    {missingGame && <Dialog open titleId="missing-game-title" onClose={onCloseGame} className="info-dialog"><h2 id="missing-game-title" data-autofocus tabIndex={-1}>{page === 'collection' ? "That game isn't in this collection." : "That game isn't in the active library."}</h2><p>{page === 'collection' ? 'This link may be old or incomplete. All 100 games are still here.' : 'Guest and account libraries stay separate. Open the correct account, import your backup, or add this game from Discover.'}</p><button className="button button-dark" onClick={onCloseGame}>Back to the collection<Icon name="arrow" /></button></Dialog>}
    {menu && <MenuDialog key={menu.key} {...menu.props} />}
    {about && About && <About {...about} />}
    {settings && Settings && <Settings key={settings.key} settings={settings.props} offline={offlineSettings} />}
    {panelNotice && <Dialog key={noticeKey} open titleId="panel-notice-title" onClose={panelNotice.onClose} className="info-dialog"><h2 id="panel-notice-title" data-autofocus tabIndex={-1}>{panelNotice.title}</h2>{panelNotice.content}</Dialog>}
    {manualShare && <Dialog open titleId="share-title" onClose={manualShare.onClose} className="info-dialog share-dialog"><h2 id="share-title" data-autofocus tabIndex={-1}>Good games are better shared.</h2><p>This browser couldn't share or copy automatically. Select this public link and copy it to send to a friend. Your private progress isn't included.</p><label htmlFor="share-link">Shareable link</label><input id="share-link" value={manualShare.link} readOnly onFocus={event => event.target.select()} /><button className="button button-dark" onClick={() => { const input = document.getElementById('share-link'); if (input instanceof HTMLInputElement) { input.focus(); input.select(); } }}><Icon name="copy" width="18" height="18" />Select link to copy</button></Dialog>}
  </>;
}
