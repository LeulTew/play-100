import { useCallback, useSyncExternalStore } from 'react';
import { createSearch, PAGE_PATHS, pageFromPath, parseUrl } from '../lib/url';
import type { AppPage, Filters } from '../lib/types';
import { gameDetailSearch, myGamesSearch, myGamesTab } from '../lib/my-games-navigation';
import type { MyGamesTab } from '../lib/my-games-navigation';
import { pageDestination } from '../lib/page-navigation';

const NAVIGATION_EVENT = 'play100:navigate';

function subscribe(listener: () => void): () => void {
  window.addEventListener('popstate', listener);
  window.addEventListener(NAVIGATION_EVENT, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(NAVIGATION_EVENT, listener);
  };
}

function getSnapshot(): string {
  return `${window.location.pathname}${window.location.search}`;
}

export function useUrlState() {
  const location = useSyncExternalStore(subscribe, getSnapshot, () => '/');
  const queryAt = location.indexOf('?');
  const path = queryAt < 0 ? location : location.slice(0, queryAt);
  const search = queryAt < 0 ? '' : location.slice(queryAt);
  const page = pageFromPath(path);
  const parsed = parseUrl(search);
  const gamesView = myGamesTab(path, search);
  const filters = page === 'games' && gamesView === 'queue' && parsed.filters.list === 'all' ? { ...parsed.filters, list: 'later' as const } : parsed.filters;
  const game = parsed.game;

  const navigate = useCallback((nextSearch: string, method: 'push' | 'replace', state: object | null = null, nextPath = window.location.pathname) => {
    if (nextSearch === window.location.search && nextPath === window.location.pathname) return;
    window.history[method === 'push' ? 'pushState' : 'replaceState'](state, '', `${nextPath}${nextSearch}`);
    window.dispatchEvent(new Event(NAVIGATION_EVENT));
  }, []);

  const updateFilters = useCallback((patch: Partial<Filters>, method: 'push' | 'replace' = 'push') => {
    const current = parseUrl(window.location.search);
    if (['games', 'library', 'rankings'].includes(pageFromPath(window.location.pathname))) {
      const tab = patch.list === 'later' ? 'queue' : myGamesTab(window.location.pathname, window.location.search);
      navigate(myGamesSearch({ ...current.filters, ...patch }, tab, current.game), method, window.history.state, PAGE_PATHS.games);
    } else navigate(createSearch({ ...current.filters, ...patch }, current.game), method);
  }, [navigate]);

  const openGame = useCallback((slug: string) => {
    const current = parseUrl(window.location.search);
    navigate(gameDetailSearch(window.location.search, slug), current.game ? 'replace' : 'push', {
      ...window.history.state,
      play100Dialog: current.game ? window.history.state?.play100Dialog === true : true,
    });
  }, [navigate]);

  const closeGame = useCallback(() => {
    if (window.history.state?.play100Dialog === true) {
      window.history.back();
    } else {
      navigate(gameDetailSearch(window.location.search, null), 'replace', window.history.state);
    }
  }, [navigate]);

  const goToPage = useCallback((nextPage: AppPage, patch: Partial<Filters> = {}) => {
    const { filters: current } = parseUrl(window.location.search);
    const destination = pageDestination(nextPage, current, patch);
    navigate(destination.search, 'push', null, destination.path);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [navigate]);

  const changeGamesView = useCallback((tab: MyGamesTab) => {
    const current = parseUrl(window.location.search);
    navigate(myGamesSearch(current.filters, tab, current.game), 'push', null, PAGE_PATHS.games);
  }, [navigate]);

  const openProfile = useCallback((handle: string) => {
    if (!/^[a-z][a-z0-9_]{2,23}$/.test(handle)) throw new Error('This profile handle is invalid.');
    navigate('', 'push', null, `/u/${handle}`);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [navigate]);

  return { page, filters, game, gamesView, changeGamesView, publicHandle: page === 'profile' ? path.split('/')[2] ?? '' : '', updateFilters, openGame, closeGame, goToPage, openProfile };
}
