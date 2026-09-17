import { useCallback, useSyncExternalStore } from 'react';
import { createSearch, defaultFilters, PAGE_PATHS, pageFromPath, parseUrl } from '../lib/url';
import type { AppPage, Filters } from '../lib/types';

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
  const { filters, game } = parseUrl(search);

  const navigate = useCallback((nextSearch: string, method: 'push' | 'replace', state: object | null = null, nextPath = window.location.pathname) => {
    if (nextSearch === window.location.search && nextPath === window.location.pathname) return;
    window.history[method === 'push' ? 'pushState' : 'replaceState'](state, '', `${nextPath}${nextSearch}`);
    window.dispatchEvent(new Event(NAVIGATION_EVENT));
  }, []);

  const updateFilters = useCallback((patch: Partial<Filters>, method: 'push' | 'replace' = 'push') => {
    const current = parseUrl(window.location.search);
    navigate(createSearch({ ...current.filters, ...patch }, current.game), method);
  }, [navigate]);

  const openGame = useCallback((slug: string) => {
    const current = parseUrl(window.location.search);
    const params = new URLSearchParams(createSearch(current.filters, slug));
    const group = new URLSearchParams(window.location.search).get('group');
    if (window.location.pathname === '/compare' && group && /^[a-f0-9-]{36}$/.test(group)) params.set('group', group);
    navigate(`?${params}`, current.game ? 'replace' : 'push', {
      ...(window.location.pathname === '/compare' ? window.history.state : {}),
      play100Dialog: current.game ? window.history.state?.play100Dialog === true : true,
    });
  }, [navigate]);

  const closeGame = useCallback(() => {
    if (window.history.state?.play100Dialog === true) {
      window.history.back();
    } else {
      const current = parseUrl(window.location.search);
      const params = new URLSearchParams(createSearch(current.filters));
      const group = new URLSearchParams(window.location.search).get('group');
      if (window.location.pathname === '/compare' && group && /^[a-f0-9-]{36}$/.test(group)) params.set('group', group);
      navigate(params.size ? `?${params}` : '', 'replace', window.location.pathname === '/compare' ? window.history.state : null);
    }
  }, [navigate]);

  const goToPage = useCallback((nextPage: AppPage, patch: Partial<Filters> = {}) => {
    const { filters: current } = parseUrl(window.location.search);
    navigate(createSearch({ ...defaultFilters, catalogs: current.catalogs, ...patch }), 'push', null, PAGE_PATHS[nextPage]);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [navigate]);

  const openProfile = useCallback((handle: string) => {
    if (!/^[a-z][a-z0-9_]{2,23}$/.test(handle)) throw new Error('This profile handle is invalid.');
    navigate('', 'push', null, `/u/${handle}`);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [navigate]);

  return { page, filters, game, publicHandle: page === 'profile' ? path.split('/')[2] ?? '' : '', updateFilters, openGame, closeGame, goToPage, openProfile };
}
