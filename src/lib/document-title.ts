import type { LibraryRecord } from './personal-types';
import type { AppPanel } from './secondary-dialogs';
import type { AppPage, Game } from './types';
import type { MyGamesTab } from './my-games-navigation';

const pageTitles: Record<AppPage, string> = {
  collection: 'Find your next game',
  games: 'My games',
  library: 'My games · Library',
  rankings: 'My games · Ranking',
  discover: 'Discover more games',
  account: 'Account',
  community: 'Community',
  publish: 'Publish ranking',
  profile: 'A shared ranking',
  creator: 'Creator desk',
  friends: 'Friends',
  friend: 'Friend',
  invite: 'Invitation',
  compare: 'Compare rankings',
  'friend-sharing': 'Friends sharing',
  'friend-shelf': 'Shared games',
};
const workspaceTitles: Record<MyGamesTab, string> = {
  library: 'My games · Library',
  queue: 'My games · Queue',
  ranking: 'My games · Ranking',
};
const panelTitles: Record<Exclude<AppPanel, null> | 'compare-tray', string> = {
  settings: 'Settings & backups',
  about: 'About & credits',
  menu: 'Menu',
  account: 'Sign in',
  'compare-tray': 'Compare tray',
};

export function appDocumentTitle(
  page: AppPage,
  game?: Pick<Game, 'title' | 'rank'>,
  record?: Pick<LibraryRecord, 'title'>,
  panel?: AppPanel | 'compare-tray',
  gamesView?: MyGamesTab,
): string {
  const workspaceTitle =
    page === 'games' || page === 'library' || page === 'rankings'
      ? workspaceTitles[gamesView ?? (page === 'rankings' ? 'ranking' : 'library')]
      : pageTitles[page];
  const title =
    (panel ? panelTitles[panel] : undefined) ??
    (game ? `${game.title} · #${game.rank}` : (record?.title ?? workspaceTitle));
  return `${title} | Play 100`;
}
