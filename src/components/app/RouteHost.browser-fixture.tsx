import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fixtureElement } from '../../lib/browser-fixture';
import type { LibraryRecord } from '../../lib/personal-types';
import type { AppPage, Filters } from '../../lib/types';
import type { MyGamesPageProps, MyGamesView } from '../personal/MyGamesPage';
import { RouteHost } from './RouteHost.tsx';
import { emptyPersonalLibrary } from '../../lib/personal-library.ts';
import '../../styles.css';
import '../../shared-ui.css';
const record = (id: string, title: string, collectionRank: number): LibraryRecord => ({
  id,
  source: 'collection',
  sourceId: id,
  title,
  year: 2020,
  collectionRank,
  sourceUrl: null,
  studio: null,
  genre: null,
});
const alpha = record('alpha', 'Alpha game', 1);
const state = {
  ...emptyPersonalLibrary(),
  records: { alpha },
  ranking: [{ id: 'alpha', note: '', score: null, manualPosition: null }],
};
const filters: Filters = {
  q: '',
  genre: 'all',
  year: 'all',
  tier: 'all',
  list: 'all',
  sort: 'rank',
  view: 'grid',
  direction: 'auto',
  catalogs: 'on',
};
const routes: string[] = [];
export function App() {
  const [route, setRoute] = useState<AppPage>('library');
  const [view, setView] = useState<MyGamesView>('library');
  routes.push(route);
  const props: MyGamesPageProps = {
    scope: 'guest',
    view,
    onViewChange(next) {
      setView(next);
      setRoute('games');
    },
    state,
    filters,
    busy: false,
    animate: false,
    persistent: true,
    availableRecords: [alpha],
    onOpen() {},
    onFilters() {},
    onDiscover() {},
    onBrowse() {},
    async onAction() {
      return true;
    },
  };
  return h(RouteHost, { route, scope: 'guest', online: null, content: { kind: 'personal', props } });
}
window.routeHostFixture = { routes };
createRoot(fixtureElement('mount')).render(h(App));
