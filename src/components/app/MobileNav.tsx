import type { MouseEvent } from 'react';
import type { AppPage } from '../../lib/types';
import type { MyGamesTab } from '../../lib/my-games-navigation';
import { Icon } from '../Icon';

export interface MobileNavProps {
  page: AppPage;
  personalPage: AppPage;
  gamesView: MyGamesTab;
  onlineAvailable: boolean;
  menuOpen: boolean;
  pageHref: (page: AppPage) => string;
  onNavigateLink: (event: MouseEvent<HTMLAnchorElement>, page: AppPage) => void;
  onBrowseLink: (event: MouseEvent<HTMLAnchorElement>) => void;
  onMenu: () => void;
  onIntent?: (page: AppPage) => void;
}

export function MobileNav({ page, personalPage, gamesView, onlineAvailable, menuOpen, pageHref, onNavigateLink, onBrowseLink, onMenu, onIntent }: MobileNavProps) {
  const intent = (destination: AppPage) => ({
    onPointerEnter: () => onIntent?.(destination), onFocus: () => onIntent?.(destination), onPointerDown: () => onIntent?.(destination),
  });
  return <nav className="mobile-nav" aria-label="Mobile navigation">
    <a {...intent('collection')} href={pageHref('collection')} aria-current={page === 'collection' ? 'page' : undefined} onClick={onBrowseLink}><Icon name="grid" width="20" height="20" /><span>The 100</span></a>
    <a {...intent('discover')} href={pageHref('discover')} aria-current={page === 'discover' ? 'page' : undefined} onClick={event => onNavigateLink(event, 'discover')}><Icon name="search" width="20" height="20" /><span>Discover</span></a>
    <a href={pageHref('games')} aria-current={['games', 'library', 'rankings'].includes(page) && (onlineAvailable || gamesView !== 'ranking') ? 'page' : undefined} onClick={event => onNavigateLink(event, 'games')}><Icon name="bookmark" width="20" height="20" /><span>My games</span></a>
    {onlineAvailable ? <a {...intent('friends')} href={pageHref('friends')} aria-current={['friends', 'friend', 'compare', 'friend-sharing', 'friend-shelf'].includes(page) ? 'page' : undefined} onClick={event => onNavigateLink(event, 'friends')}><Icon name="user" width="20" height="20" /><span>Friends</span></a> : <a href={pageHref('rankings')} aria-current={personalPage === 'rankings' ? 'page' : undefined} onClick={event => onNavigateLink(event, 'rankings')}><Icon name="rank" width="20" height="20" /><span>Ranking</span></a>}
    <button aria-haspopup="dialog" aria-expanded={menuOpen} onClick={onMenu}><Icon name="menu" width="20" height="20" /><span>Menu</span></button>
  </nav>;
}
