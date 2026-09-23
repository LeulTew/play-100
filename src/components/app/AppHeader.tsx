import type { MouseEvent } from 'react';
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
  animate: boolean;
  menuOpen: boolean;
  pageHref: (page: AppPage) => string;
  onNavigateLink: (event: MouseEvent<HTMLAnchorElement>, page: AppPage) => void;
  onQueue: () => void;
  onMenu: () => void;
  onAccount: () => void;
  onIntent?: (page: AppPage) => void;
}

export function AppHeader({ page, onlineAvailable, libraryScope, libraryLabel, syncStatus, headerIdentity, savedCount, animate, menuOpen, pageHref, onNavigateLink, onQueue, onMenu, onAccount, onIntent }: AppHeaderProps) {
  const intent = (destination: AppPage) => ({
    onPointerEnter: () => onIntent?.(destination), onFocus: () => onIntent?.(destination), onPointerDown: () => onIntent?.(destination),
  });
  return <header className={`site-header ${onlineAvailable ? 'site-header-online' : ''}`}>
    <a className="wordmark" href={pageHref('collection')} onClick={event => onNavigateLink(event, 'collection')}><span className="logo-symbol" aria-hidden="true"><span /></span>PLAY<span>100</span><i aria-hidden="true">.</i><span className="sr-only"> Home</span></a>
    <nav className="desktop-nav" aria-label="Main navigation">
      <a {...intent('collection')} href={pageHref('collection')} aria-current={page === 'collection' ? 'page' : undefined} onClick={event => onNavigateLink(event, 'collection')}>The 100</a>
      <a {...intent('discover')} href={pageHref('discover')} aria-current={page === 'discover' ? 'page' : undefined} onClick={event => onNavigateLink(event, 'discover')}>Discover</a>
      <a href={pageHref('games')} aria-current={['games', 'library', 'rankings'].includes(page) ? 'page' : undefined} onClick={event => onNavigateLink(event, 'games')}>My games</a>
      {onlineAvailable && <a {...intent('friends')} href={pageHref('friends')} aria-current={['friends', 'friend', 'compare', 'friend-sharing', 'friend-shelf'].includes(page) ? 'page' : undefined} onClick={event => onNavigateLink(event, 'friends')}>Friends</a>}
    </nav>
    <div className="header-actions">
      <button className="saved-nav" aria-label={`Play later, ${savedCount} ${savedCount === 1 ? 'game' : 'games'}`} onClick={onQueue}><Icon name="bookmark" width="19" height="19" /><span className="saved-nav-label">Play later</span><CountUp key={libraryScope} to={savedCount} animate={animate} className="saved-count" /></button>
      <a className="icon-button header-download" href="/downloads/Play-100-Collection.xlsx" download aria-label="Download enhanced Excel workbook"><Icon name="download" /></a>
      <button className="menu-nav" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={onMenu}><Icon name="menu" width="20" height="20" />Menu</button>
      {onlineAvailable && <a {...intent('account')} className={`account-nav sync-${syncStatus}`} href="/account" aria-label={`Account${headerIdentity ? ` for ${headerIdentity.name}` : ''} ${libraryLabel}`} onClick={event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onAccount(); } }}><span className="account-nav-avatar" aria-hidden="true">{headerIdentity ? <img src={headerIdentity.avatarSrc} width="32" height="32" alt="" draggable={false} /> : <Icon name="user" width="20" height="20" />}</span><span className="account-nav-copy"><strong>{headerIdentity?.name ?? 'Account'}</strong>{' '}<small>{libraryLabel}</small></span></a>}
    </div>
  </header>;
}
