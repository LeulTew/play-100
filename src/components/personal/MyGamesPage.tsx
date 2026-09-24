import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Filters } from '../../lib/types';
import { flushPendingEdits } from '../../hooks/useExitSave';
import { useCommittedCue } from '../../hooks/useCommittedCue';
import type { CommittedCue } from '../../lib/route-continuity';
import { Icon } from '../Icon';
import { ProgressFilter } from '../ProgressFilter';
import { effectiveProgressFilter, progressFilterPatch } from '../../lib/game-progress';
import LibraryPage from './LibraryPage';
import type { LibraryPageProps } from './LibraryPage';
import RankingsPage from './RankingsPage';
import type { RankingsPageProps } from './RankingsPage';
import './my-games.css';
import './continuity.css';

export type MyGamesView = 'library' | 'queue' | 'ranking';

export interface MyGamesPageProps extends Omit<LibraryPageProps, 'onPresentationChange'> {
  scope: string;
  view: MyGamesView;
  onViewChange: (view: MyGamesView) => void;
  availableRecords: RankingsPageProps['availableRecords'];
  persistent: boolean;
  onPublish?: () => void;
  friendSharing?: ReactNode;
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
  const changing = useRef<number | null>(null);
  const generation = useRef(0);
  const marker = useRef<HTMLSpanElement>(null);
  const tabHistory = useRef({ view, serial: 0 });
  const [tabCue, setTabCue] = useState<(CommittedCue & { generation: number }) | null>(null);
  const progressView = effectiveProgressFilter(props.filters);
  const presentation = `${view}:${progressView}`;
  const previousPresentation = useRef(presentation);
  if (previousPresentation.current !== presentation) {
    previousPresentation.current = presentation;
    generation.current += 1;
  }
  const completedOnly = progressView === 'completed';
  const lastLibraryView = useRef<'library' | 'queue'>(view === 'queue' ? 'queue' : 'library');
  if (view !== 'ranking') lastLibraryView.current = view;
  useEffect(() => {
    mounted.current = true;
    const invalidate = () => {
      generation.current += 1;
      changing.current = null;
      setSwitching(false);
      setError('');
    };
    window.addEventListener('popstate', invalidate);
    window.addEventListener('play100:navigate', invalidate);
    return () => {
      mounted.current = false;
      generation.current += 1;
      window.removeEventListener('popstate', invalidate);
      window.removeEventListener('play100:navigate', invalidate);
    };
  }, []);
  useEffect(() => {
    const prior = tabHistory.current;
    if (prior.view === view) return;
    const order: MyGamesView[] = ['library', 'queue', 'ranking'];
    const serial = prior.serial + 1;
    tabHistory.current = { view, serial };
    setTabCue({ serial, kind: 'tab', generation: generation.current, direction: order.indexOf(view) > order.indexOf(prior.view) ? 1 : -1 });
  }, [view]);
  useCommittedCue(marker, tabCue, !switching, () =>
    mounted.current && isCurrent() && generation.current === tabCue?.generation);
  const change = async (commit: () => void): Promise<boolean> => {
    if (changing.current !== null || !mounted.current || !isCurrent()) return false;
    const request = ++generation.current;
    changing.current = request;
    const ownsRequest = () => mounted.current && isCurrent() && generation.current === request;
    setSwitching(true);
    setError('');
    try {
      const saved = await flushPendingEdits();
      if (!ownsRequest()) return false;
      if (!saved) {
        setError('Your edit has not saved. Fix the highlighted field or retry before changing views.');
        return false;
      }
      commit();
      return true;
    } catch (cause) {
      console.error('My games could not save pending edits before changing views.', cause);
      if (ownsRequest()) setError('Your edit could not be saved. Keep this view open and retry.');
      return false;
    } finally {
      if (changing.current === request) {
        changing.current = null;
        if (mounted.current && isCurrent()) setSwitching(false);
      }
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
  // Leaving My games unmounts both editors, so it passes the same save guard as a view change.
  const guarded = (leave: () => void) => () => { void change(leave); };
  const onDiscover = guarded(props.onDiscover);
  const onBrowse = guarded(props.onBrowse);
  const onPublish = props.onPublish && guarded(props.onPublish);
  return (
    <section className="app-page my-games-workspace" aria-labelledby="my-games-title">
      <div className="page-heading">
        <h1 id="my-games-title" tabIndex={-1} data-page-heading>My games</h1>
        <button className="button button-dark" onClick={onDiscover}><Icon name="plus" width="18" height="18" />Find games</button>
      </div>
      {props.friendSharing}
      <div className="my-games-navigation">
        <nav className="personal-tabs my-games-motion-tabs" aria-label="My games views">
          {(['library', 'queue', 'ranking'] as const).map((value) => <button key={value} aria-label={`${titles[value]}, ${counts[value]}`} aria-current={view === value ? 'page' : undefined} aria-pressed={view === value} disabled={switching} onClick={() => { if (value !== view) void change(() => onViewChange(value)); }}>{titles[value]}{' '}<span>{counts[value]}</span><span className="my-games-tab-marker" ref={view === value ? marker : undefined} hidden={view !== value} aria-hidden="true" /></button>)}
        </nav>
        <ProgressFilter value={progressView} disabled={switching} onChange={value => onFilters(progressFilterPatch(value, props.filters))} />
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div hidden={view === 'ranking'}>
        <LibraryPage {...props} busy={editorBusy} embedded active={view !== 'ranking'} workspaceView={lastLibraryView.current} progressFilter={progressView} completedOnly={completedOnly} onFilters={onFilters} onDiscover={onDiscover} onBrowse={onBrowse} onPresentationChange={change} />
      </div>
      <div hidden={view !== 'ranking'}>
        <RankingsPage {...props} busy={editorBusy} embedded active={view === 'ranking'} progressFilter={progressView} onDiscover={onDiscover} onPublish={onPublish} onClearProgress={() => onFilters(progressFilterPatch('all', props.filters))} />
      </div>
      <span className="sr-only" role="status">{switching ? 'Saving your edit before changing view…' : ''}</span>
    </section>
  );
}
