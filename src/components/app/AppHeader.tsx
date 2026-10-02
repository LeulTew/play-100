import { useContext } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { StaticShellContext } from '../../first-paint/static-shell';
import type { AppPage } from '../../lib/types';
import { Icon } from '../Icon';
import CountUp from '../bits/CountUp';

export interface AppHeaderProps {
  page: AppPage;
  onlineAvailable: boolean;
  libraryScope: string;
  libraryLabel: string;
  syncStatus: string;
  headerIdentity: { name: string; avatarSrc: string } | null;
  savedCount: number;
  comparisonTray?: ReactNode;
  compareChip?: boolean;
  animate: boolean;
  menuOpen: boolean;
  pageHref: (page: AppPage) => string;
  onNavigateLink: (event: MouseEvent<HTMLAnchorElement>, page: AppPage) => void;
  onQueue: () => void;
  onMenu: (opener?: HTMLElement) => void;
  onAccount: () => void;
  onIntent?: (page: AppPage) => void;
}

export function AppHeader({
  page,
  onlineAvailable,
  libraryScope,
  libraryLabel,
  syncStatus,
  headerIdentity,
  savedCount,
  comparisonTray,
  compareChip,
  animate,
  menuOpen,
  pageHref,
  onNavigateLink,
  onQueue,
  onMenu,
  onAccount,
  onIntent,
}: AppHeaderProps) {
  // The static shell disables the buttons only the app can run.
  const staticShell = useContext(StaticShellContext);
  const intent = (destination: AppPage) => ({
    onPointerEnter: () => onIntent?.(destination),
    onFocus: () => onIntent?.(destination),
    onPointerDown: () => onIntent?.(destination),
  });
  return (
    <header
      className={`site-header ${onlineAvailable ? 'site-header-online' : ''}`}
      data-compare-chip={compareChip ? '' : undefined}
    >
      <a className="wordmark" href={pageHref('collection')} onClick={(event) => onNavigateLink(event, 'collection')}>
        <span className="logo-symbol" aria-hidden="true">
          <span />
        </span>
        PLAY<span>100</span>
        <i aria-hidden="true">.</i>
        <span className="sr-only"> Home</span>
      </a>
      <nav className="desktop-nav" aria-label="Main navigation">
        <a
          {...intent('collection')}
          href={pageHref('collection')}
          aria-current={page === 'collection' ? 'page' : undefined}
          onClick={(event) => onNavigateLink(event, 'collection')}
        >
          The 100
        </a>
        <a
          {...intent('discover')}
          href={pageHref('discover')}
          aria-current={page === 'discover' ? 'page' : undefined}
          onClick={(event) => onNavigateLink(event, 'discover')}
        >
          Discover
        </a>
        <a
          href={pageHref('games')}
          aria-current={['games', 'library', 'rankings'].includes(page) ? 'page' : undefined}
          onClick={(event) => onNavigateLink(event, 'games')}
        >
          My games
        </a>
        {onlineAvailable && (
          <a
            {...intent('friends')}
            href={pageHref('friends')}
            aria-current={
              ['friends', 'friend', 'compare', 'friend-sharing', 'friend-shelf'].includes(page) ? 'page' : undefined
            }
            onClick={(event) => onNavigateLink(event, 'friends')}
          >
            Friends
          </a>
        )}
      </nav>
      <div className="header-actions">
        <button
          className="saved-nav"
          aria-label={`Play later, ${savedCount} ${savedCount === 1 ? 'game' : 'games'}`}
          onClick={onQueue}
          disabled={staticShell || undefined}
        >
          <Icon name="bookmark" width="19" height="19" />
          <span className="saved-nav-label">Play later</span>{' '}
          <CountUp key={libraryScope} to={savedCount} animate={animate} className="saved-count" />
        </button>
        {comparisonTray}
        <a
          className="icon-button header-download"
          href="/downloads/Play-100-Collection.xlsx"
          download
          aria-label="Download the Excel workbook"
          title="Download the Excel workbook"
        >
          <Icon name="download" />
        </a>
        <button
          className="menu-nav"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={(event) => onMenu(event.currentTarget)}
          disabled={staticShell || undefined}
        >
          <Icon name="menu" width="20" height="20" />
          Menu
        </button>
        {onlineAvailable && (
          <a
            {...intent('account')}
            className={`account-nav sync-${syncStatus}`}
            href="/account"
            aria-label={`Account${headerIdentity ? ` for ${headerIdentity.name}` : ''}${libraryLabel ? ` ${libraryLabel}` : ''}`}
            onClick={(event) => {
              if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
                event.preventDefault();
                onAccount();
              }
            }}
          >
            <span className="account-nav-avatar" aria-hidden="true">
              {headerIdentity ? (
                <img src={headerIdentity.avatarSrc} width="32" height="32" alt="" draggable={false} />
              ) : (
                <Icon name="user" width="20" height="20" />
              )}
            </span>
            <span className="account-nav-copy">
              <strong>{headerIdentity?.name ?? 'Account'}</strong>
              {libraryLabel && (
                <>
                  {' '}
                  <small>{libraryLabel}</small>
                </>
              )}
            </span>
          </a>
        )}
      </div>
    </header>
  );
}
