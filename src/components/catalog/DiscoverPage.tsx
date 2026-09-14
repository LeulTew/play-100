import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { PersonalAction, PersonalLibraryState } from '../../lib/personal-types';
import type { CatalogPage, CatalogSource } from '../../lib/catalog-types';
import { parseCatalogPage } from '../../lib/catalog-types';
import { Icon } from '../Icon';
import { SelectionBar } from '../SelectionBar';
import type { SelectionAction } from '../SelectionBar';
import ManualGameForm from '../personal/ManualGameForm';
import { PlayedToggle } from '../PlayedToggle';

export default function DiscoverPage({ state, busy, onAction, onLibrary }: {
  state: PersonalLibraryState; busy: boolean; onAction: (action: PersonalAction) => Promise<boolean>; onLibrary: () => void;
}) {
  const [source, setSource] = useState<CatalogSource>('wikidata');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<CatalogPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const request = useRef<AbortController | null>(null);
  const cooldown = useRef(0);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!result) return;
    const heading = document.getElementById('catalog-results-title');
    heading?.scrollIntoView({ block: 'start', behavior: 'instant' });
    heading?.focus({ preventScroll: true });
  }, [result]);

  const search = async (offset = 0, searchQuery = query.trim(), searchSource = source) => {
    if (Date.now() - cooldown.current < 900) { setError('Give the catalog a moment before another request.'); return; }
    cooldown.current = Date.now();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError(''); setLoading(true); setSelected(new Set());
    const timeout = window.setTimeout(() => controller.abort('timeout'), 15000);
    try {
      const response = await fetch(`/api/catalog?${new URLSearchParams({ source: searchSource, q: searchQuery, offset: String(offset) })}`, { signal: controller.signal });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : 'The public catalog is temporarily unavailable.';
        throw new Error(message);
      }
      const parsed = parseCatalogPage(data);
      if (!controller.signal.aborted) setResult(parsed);
    } catch (cause: unknown) {
      if (controller.signal.aborted && controller.signal.reason !== 'timeout') return;
      setError(controller.signal.reason === 'timeout' ? 'The catalog took too long to respond. Try again or add a game manually.' : cause instanceof Error ? cause.message : 'The catalog could not be loaded.');
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) setLoading(false);
    }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void search(); };
  const changeSource = (next: CatalogSource) => {
    request.current?.abort();
    setLoading(false); setSource(next); setResult(null); setError(''); setSelected(new Set());
  };
  const toggleSelection = (id: string) => setSelected((prior) => {
    const next = new Set(prior); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const bulk = async (action: SelectionAction) => {
    const records = result?.items.filter((record) => selected.has(record.id)) ?? [];
    if (!records.length) return;
    if (await onAction(action === 'ranking' ? { type: 'add-ranking', records } : { type: 'set-progress', records, key: action === 'completed' ? 'completed' : 'later', value: true })) setSelected(new Set());
  };
  return (
    <section className="app-page" aria-labelledby="discover-title">
      <div className="page-heading"><div><h1 id="discover-title" tabIndex={-1} data-page-heading>BEYOND THE 100.<br /><span>MAKE ROOM FOR MORE.</span></h1><p>Browse public game catalogs, then bring your picks into your private library. Nothing here changes the author's original collection.</p></div><button className="button button-outline" onClick={onLibrary}>Open my library<Icon name="arrow" width="17" height="17" /></button></div>
      <form className="catalog-search-form" onSubmit={submit}>
        <div className="catalog-source-options" role="group" aria-label="Catalog source"><button type="button" aria-pressed={source === 'wikidata'} onClick={() => changeSource('wikidata')}>Wikidata<span>Broad, open game data</span></button><button type="button" aria-pressed={source === 'freetogame'} onClick={() => changeSource('freetogame')}>FreeToGame<span>Free-to-play catalog</span></button></div>
        <label htmlFor="catalog-search">Find a title, or leave blank to browse this source</label>
        <div className="catalog-query"><div className="search-field"><Icon name="search" /><input id="catalog-search" type="search" value={query} maxLength={80} onChange={(event) => setQuery(event.target.value)} placeholder={source === 'wikidata' ? 'Try Hades, Halo or Baldur’s Gate...' : 'Search the FreeToGame catalog'} /></div><button className="button button-dark" type="submit" disabled={loading}>{loading ? 'Searching...' : query.trim() ? 'Search catalog' : 'Browse catalog'}<Icon name="arrow" width="18" height="18" /></button></div>
        <p className="catalog-privacy">Online lookup sends only your catalog query to the selected source. Your library, notes and rankings stay on your device. Pages load on request; there is no background mass crawler.</p>
      </form>
      {error && <div className="catalog-error" role="alert"><Icon name="info" /><div><strong>That catalog request couldn't finish.</strong><p>{error}{result ? ' The last successful results are still shown below.' : ''}</p></div><button className="text-button" disabled={loading} onClick={() => { void search(); }}>Try again</button></div>}
      {loading && <p className="catalog-loading" role="status">Looking up public game records...</p>}
      {result && <>
        <div className="catalog-results-title"><h2 id="catalog-results-title" tabIndex={-1}>{result.query ? `Results for “${result.query}”` : `${result.source === 'wikidata' ? 'Wikidata' : 'FreeToGame'} catalog`}</h2><span>{result.total.toLocaleString()} source matches</span><button className="text-button" aria-pressed={selecting} onClick={() => { setSelecting((value) => !value); setSelected(new Set()); }}><Icon name="select" width="17" height="17" />{selecting ? 'Exit selection' : 'Select games'}</button></div>
        {selecting && <SelectionBar context="discover" count={selected.size} total={result.items.length} busy={busy || loading} onSelectAll={() => setSelected(new Set(result.items.map((record) => record.id)))} onClear={() => setSelected(new Set())} onDone={() => { setSelecting(false); setSelected(new Set()); }} onAction={(action) => { void bulk(action); }} />}
        {result.items.length ? <ul className="catalog-results">{result.items.map((record) => <li key={record.id} data-catalog-id={record.id}>
          {selecting && <label className="select-control"><input type="checkbox" checked={selected.has(record.id)} onChange={() => toggleSelection(record.id)} aria-label={`Select ${record.title}`} /></label>}
          <div className="catalog-record-copy"><h3>{record.title}</h3><p>{[record.year, record.studio, record.genre].filter((value) => value !== null).join(' · ') || 'No additional metadata imported.'}</p>{record.sourceUrl && <a href={record.sourceUrl} target="_blank" rel="noreferrer">View on {result.source === 'wikidata' ? 'Wikidata' : 'FreeToGame'}<Icon name="up-right" width="14" height="14" /></a>}</div>
          <div className="catalog-record-actions"><PlayedToggle id={record.id} title={record.title} played={Boolean(state.progress[record.id]?.played)} completed={state.progress[record.id]?.completed} busy={busy} compact onChange={() => { void onAction({ type: 'toggle-progress', record, key: 'played' }); }} /><button className="button button-outline" disabled={busy || Boolean(state.progress[record.id]?.later)} onClick={() => { void onAction({ type: 'set-progress', records: [record], key: 'later', value: true }); }}><Icon name="bookmark" width="17" height="17" />{state.progress[record.id]?.later ? 'In your queue' : 'Play later'}</button><button className="icon-button" disabled={busy || state.ranking.some((entry) => entry.id === record.id)} aria-label={`Add ${record.title} to my ranking`} onClick={() => { void onAction({ type: 'add-ranking', records: [record] }); }}><Icon name="rank" width="20" height="20" /></button><button className="icon-button" disabled={busy || Boolean(state.records[record.id])} aria-label={`Import ${record.title} to my library`} onClick={() => { void onAction({ type: 'add-records', records: [record] }); }}><Icon name={state.records[record.id] ? 'check' : 'plus'} width="20" height="20" /></button></div>
        </li>)}</ul> : <div className="empty-state"><h2>No matching games from this source.</h2><p>Try a shorter title, switch sources or add the game yourself. Catalog coverage varies.</p></div>}
        <div className="catalog-pagination"><button className="button button-outline" disabled={loading || result.offset === 0} onClick={() => { void search(Math.max(0, result.offset - (result.source === 'wikidata' ? 5 : 20)), result.query, result.source); }}><Icon name="back" width="17" height="17" />Previous page</button><span>Source results {result.offset + (result.items.length ? 1 : 0)}–{result.offset + result.items.length}</span><button className="button button-outline" disabled={loading || result.nextOffset === null} onClick={() => { if (result.nextOffset !== null) void search(result.nextOffset, result.query, result.source); }}>Next page<Icon name="arrow" width="17" height="17" /></button></div>
        <div className="catalog-provenance">{result.source === 'freetogame' && <p>Game data from <a href="https://www.freetogame.com/" target="_blank" rel="noreferrer">FreeToGame</a>.</p>}{result.notices.map((notice) => <p key={notice}>{notice}</p>)}<a href={result.source === 'wikidata' ? 'https://www.wikidata.org/wiki/Wikidata:Data_access' : 'https://www.freetogame.com/api-doc'} target="_blank" rel="noreferrer">{result.source === 'wikidata' ? 'Wikidata data access and CC0 notice' : 'FreeToGame API and attribution'}<Icon name="up-right" width="14" height="14" /></a></div>
      </>}
      {!result && !loading && !error && <div className="catalog-intro"><Icon name="stack" width="29" height="29" /><p>Choose a source and browse. Import just the games you want; your library stays lean and yours.</p></div>}
      <ManualGameForm busy={busy} onAdd={(record) => onAction({ type: 'add-records', records: [record] })} actionLabel="Add to my library" />
    </section>
  );
}
