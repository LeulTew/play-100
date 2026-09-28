import { useMemo, useSyncExternalStore } from 'react';
import type { FriendsViewState } from '../lib/friend-manager';
import { friendsViewUrl, parseFriendsView } from '../lib/friend-manager';

export function subscribeUrl(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener('play100:navigate', listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener('play100:navigate', listener);
  };
}
const readUrl = () => location.search;

/** The Friends view, filter and order that the URL holds, and a way to change them. */
export function useFriendsView() {
  const search = useSyncExternalStore(subscribeUrl, readUrl, () => '');
  const view = useMemo(() => parseFriendsView(search), [search]);
  const relationView = view.view === 'friends' || view.view === 'incoming' || view.view === 'sent';
  const updateView = (patch: Partial<FriendsViewState>, replace = false) => {
    history[replace ? 'replaceState' : 'pushState'](null, '', friendsViewUrl({ ...view, ...patch }));
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  return { view, relationView, updateView };
}
