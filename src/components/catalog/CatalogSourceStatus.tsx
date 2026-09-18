import type { SourceSearchState } from '../../lib/catalog-search-session';
import type { CatalogSource } from '../../lib/catalog-types';
import { SOURCE_LABELS } from '../../lib/personal-types';

export function CatalogSourceStatus({ sources, onRetry, onMore, onPrevious }: {
  sources: SourceSearchState[];
  onRetry: (source: CatalogSource) => void;
  onMore: (source: CatalogSource, offset: number) => void;
  onPrevious?: (source: CatalogSource, offset: number) => void;
}) {
  return <div className="discovery-source-status" role="group" aria-label="Online catalog status">
    {sources.filter((source) => source.status !== 'idle').map((source) => <div key={source.source}>
      <p role="status"><a href={source.source === 'wikidata' ? 'https://www.wikidata.org/wiki/Wikidata:Data_access' : 'https://www.freetogame.com/'} target="_blank" rel="noreferrer">{SOURCE_LABELS[source.source]}</a>
        <span>{source.status === 'loading' ? 'Loading...' : source.status === 'error'
          ? source.failure === 'timeout' ? 'Timed out' : source.failure === 'rate-limited' ? 'Rate limited' : source.failure === 'offline' ? 'Offline' : 'Provider unavailable'
          : source.total === 0 ? 'No online matches' : `${source.records.length} loaded online`}</span></p>
      {source.error && <p className="discovery-source-error" role="alert">{source.error}</p>}
      {onPrevious && source.requestOffset > 0 && <button className="text-button" disabled={source.status === 'loading'} onClick={() => onPrevious(source.source, Math.max(0, source.requestOffset - (source.source === 'wikidata' ? 5 : 20)))}>Previous from {SOURCE_LABELS[source.source]}</button>}
      {source.status === 'error' ? <button className="text-button" onClick={() => onRetry(source.source)}>Retry {SOURCE_LABELS[source.source]}</button>
        : source.nextOffset !== null && <button className="text-button" disabled={source.status === 'loading'} onClick={() => { if (source.nextOffset !== null) onMore(source.source, source.nextOffset); }}>More from {SOURCE_LABELS[source.source]}</button>}
      {source.notices.length > 0 && <details><summary>Source details</summary>{source.notices.map((notice) => <p key={notice}>{notice}</p>)}</details>}
    </div>)}
  </div>;
}
