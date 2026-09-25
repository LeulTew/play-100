import type { LibraryRecord } from './personal-types';
import type { AppPanel } from './secondary-dialogs';
import type { AppPage, Game } from './types';

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

export function appDocumentTitle(
  page: AppPage,
  game?: Pick<Game, 'title' | 'rank'>,
  record?: Pick<LibraryRecord, 'title'>,
  panel?: AppPanel,
): string {
  const title =
    panel === 'settings'
      ? 'Settings & backups'
      : panel === 'about'
        ? 'About & credits'
        : game
          ? `${game.title} · #${game.rank}`
          : (record?.title ?? pageTitles[page]);
  return `${title} | Play 100`;
}
