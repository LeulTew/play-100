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

export function appDocumentTitle(
  page: AppPage,
  game?: Pick<Game, 'title' | 'rank'>,
  record?: Pick<LibraryRecord, 'title'>,
  panel?: AppPanel,
  gamesView?: MyGamesTab,
): string {
  const workspaceTitle =
    page === 'games' || page === 'library' || page === 'rankings'
      ? workspaceTitles[gamesView ?? (page === 'rankings' ? 'ranking' : 'library')]
      : pageTitles[page];
  const title =
    panel === 'settings'
      ? 'Settings & backups'
      : panel === 'about'
        ? 'About & credits'
        : game
          ? `${game.title} · #${game.rank}`
          : (record?.title ?? workspaceTitle);
  return `${title} | Play 100`;
}
