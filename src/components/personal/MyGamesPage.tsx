import { useEffect, useRef, useState } from 'react';
import type { Filters } from '../../lib/types';
import { flushPendingEdits } from '../../hooks/useExitSave';
import { Icon } from '../Icon';
import LibraryPage from './LibraryPage';
import type { LibraryPageProps } from './LibraryPage';
import RankingsPage from './RankingsPage';
import type { RankingsPageProps } from './RankingsPage';
import './my-games.css';

export type MyGamesView = 'library' | 'queue' | 'ranking';

export interface MyGamesPageProps extends LibraryPageProps {
  scope: string;
  view: MyGamesView;
  onViewChange: (view: MyGamesView) => void;
  availableRecords: RankingsPageProps['availableRecords'];
  persistent: boolean;
  onPublish?: () => void;
}

export default function MyGamesPage(props: MyGamesPageProps) {
  const currentScope = useRef(props.scope);
  currentScope.current = props.scope;
  return <MyGamesWorkspace key={props.scope} {...props} isCurrent={() => currentScope.current === props.scope} />;
}

function MyGamesWorkspace({ view, onViewChange, isCurrent, ...props }: MyGamesPageProps & { isCurrent: () => boolean }) {
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const changing = useRef(false);
  const completedOnly = props.filters.list === 'completed';
  const lastLibraryView = useRef<'library' | 'queue'>(view === 'queue' ? 'queue' : 'library');
  if (view !== 'ranking') lastLibraryView.current = view;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const change = async (commit: () => void) => {
    if (changing.current || !isCurrent()) return;
    changing.current = true;
    setSwitching(true);
    setError('');
    try {
      const saved = await flushPendingEdits();
      if (!mounted.current || !isCurrent()) return;
      if (saved) commit();
      else setError('Your edit has not saved. Fix the highlighted field or retry before changing views.');
    } catch (cause) {
      console.error('My games could not save pending edits before changing views.', cause);
      if (mounted.current && isCurrent()) setError('Your edit could not be saved. Keep this view open and retry.');
    } finally {
      changing.current = false;
      if (mounted.current && isCurrent()) setSwitching(false);
    }
  };
  const counts = {
    library: Object.keys(props.state.records).length,
    queue: props.state.queueOrder.length,
    ranking: props.state.ranking.length,
  };
  const titles: Record<MyGamesView, string> = { library: 'Library', queue: 'Queue', ranking: 'Ranking' };
  const editorBusy = props.busy || switching;
  const onFilters = (patch: Partial<Filters>, method?: 'push' | 'replace') => { void change(() => props.onFilters(patch, method)); };
  return (
    <section className="app-page my-games-workspace" aria-labelledby="my-games-title">
      <div className="page-heading">
        <h1 id="my-games-title" tabIndex={-1} data-page-heading>My games</h1>
        <button className="button button-dark" onClick={props.onDiscover}><Icon name="plus" width="18" height="18" />Find games</button>
      </div>
      <div className="my-games-navigation">
        <nav className="personal-tabs" aria-label="My games views">
          {(['library', 'queue', 'ranking'] as const).map((value) => <button key={value} aria-current={view === value ? 'page' : undefined} aria-pressed={view === value} disabled={switching} onClick={() => { if (value !== view) void change(() => onViewChange(value)); }}>{titles[value]}<span>{counts[value]}</span></button>)}
        </nav>
        <label className="check-control"><input type="checkbox" checked={completedOnly} disabled={switching} onChange={(event) => onFilters({ list: event.target.checked ? 'completed' : view === 'queue' ? 'later' : 'all' })} />Completed only</label>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div hidden={view === 'ranking'}>
        <LibraryPage {...props} busy={editorBusy} embedded workspaceView={lastLibraryView.current} completedOnly={completedOnly} onFilters={onFilters} />
      </div>
      <div hidden={view !== 'ranking'}>
        <RankingsPage {...props} busy={editorBusy} embedded completedOnly={completedOnly} />
      </div>
      <span className="sr-only" role="status">{switching ? 'Saving your edit before changing view.' : ''}</span>
    </section>
  );
}
