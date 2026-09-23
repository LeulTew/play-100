import { useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Filters, Game, SortOrder } from '../lib/types';
import type { LibraryRecord, PersonalProgress } from '../lib/personal-types';
import { criticColumns, formatAverage, sortDirection } from '../lib/collection';
import { createSearch } from '../lib/url';
import { Icon } from './Icon';
import { PlayedToggle } from './PlayedToggle';
import { CompletedToggle } from './CompletedToggle';
import { author, authorRatingText } from '../lib/author';
import { useCompareDragSource } from './compare-tray/useCompareDragSource';
import { ComparePinButton } from './compare-tray/ComparePinButton';

interface RatingsTableProps {
  games: Game[];
  filters: Filters;
  progress: Record<string, PersonalProgress>;
  selecting: boolean;
  selected: ReadonlySet<string>;
  busy: boolean;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onToggle: (id: string, key: 'later' | 'completed' | 'played', value?: boolean) => void;
  onSort: (patch: Partial<Filters>) => void;
  getCompareRecord?: (game: Game) => LibraryRecord;
  savedCopies?: (game: Game) => ReactNode;
}

export default function RatingsTable({ games, filters, progress, selecting, selected, busy, onSelect, onOpen, onToggle, onSort, getCompareRecord, savedCopies }: RatingsTableProps) {
  const direction = sortDirection(filters);
  const sortedHeader = (label: string, sort: SortOrder, scale?: string) => {
    const active = filters.sort === sort || (sort === 'newest' && filters.sort === 'oldest');
    return (
      <th scope="col" className={sort === 'rank' ? 'table-rank' : sort === 'title' ? 'table-game' : undefined} aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : undefined}>
        <button className="table-sort" aria-label={scale ? `${label} ${scale}` : label} onClick={() => {
          const nextDirection = active ? direction === 'asc' ? 'desc' : 'asc' : sortDirection({ sort, direction: 'auto' });
          onSort(sort === 'newest' ? { sort: nextDirection === 'asc' ? 'oldest' : 'newest', direction: 'auto' } : { sort, direction: nextDirection });
        }}>
          <span>{label}{scale && <small>{scale}</small>}</span><Icon name={active && direction === 'asc' ? 'up' : 'down'} width="13" height="13" />
        </button>
      </th>
    );
  };
  return (
    <div className="ratings-mode">
      <div className="ratings-explainer"><p>{author.shortName}'s original ratings are shown separately from the critic snapshots. His source rating column is based on his curated rank. <strong>—</strong> means unavailable.</p></div>
      <div className="ratings-scroll" role="region" aria-label="Rankings and ratings table; scroll horizontally for all scores" tabIndex={0} style={{ '--selection-width': selecting ? '44px' : '0px' } as CSSProperties}>
        <table className="ratings-table">
          <caption className="sr-only">Author's game rankings and original critic scores. Sort using the column headings. IGN and GameSpot use ten points; other critics use one hundred.</caption>
          <thead><tr>
            {selecting && <th className="selection-column" scope="col"><span className="sr-only">Select games</span></th>}
            {sortedHeader('Rank', 'rank')}
            {sortedHeader('Game', 'title')}
            {sortedHeader('Year', 'newest')}
            {sortedHeader(`${author.shortName}'s rating`, 'author-rating', '/ 10 · original')}
            {criticColumns.map(({ key, label, scale }) => <TableHeading key={key} label={label} scale={scale} active={filters.sort === key} direction={direction} onClick={() => onSort({ sort: key, direction: filters.sort === key && direction === 'desc' ? 'asc' : 'desc' })} />)}
            {sortedHeader('Average', 'score', '/ 100')}
            <th scope="col">Your list</th>
          </tr></thead>
          <tbody>{games.map((game) => {
            const compareRecord = getCompareRecord?.(game);
            return (
            <tr key={game.slug} data-game={game.slug} className={selected.has(game.slug) ? 'row-selected' : ''}>
              {selecting && <td className="selection-column"><label className="select-control"><input type="checkbox" checked={selected.has(game.slug)} onChange={() => onSelect(game.slug)} aria-label={`Select ${game.title}`} /></label></td>}
              <td className="table-rank">{String(game.rank).padStart(2, '0')}</td>
              <th scope="row" className="table-game"><RatingsGameLink game={game} filters={filters} onOpen={onOpen} compareRecord={compareRecord} /><span>{game.genre} · {game.tier === 'core' ? 'Core 50' : 'Essential 50'}</span>{savedCopies?.(game)}</th>
              <td>{game.year}</td>
              <td className="numeric-score table-author-rating" title={game.authorRating?.rawValue}>{game.authorRating ? authorRatingText(game.authorRating) : <span aria-label="Original author rating unavailable">—</span>}</td>
              {criticColumns.map(({ key }) => <td key={key} className="numeric-score">{game.critics[key] === null ? <span aria-label="Unavailable">—</span> : game.critics[key]}</td>)}
              <td className="numeric-score table-average">{formatAverage(game.criticAverage)}</td>
              <td><div className="table-progress"><PlayedToggle id={game.slug} title={game.title} played={Boolean(progress[game.slug]?.played)} completed={progress[game.slug]?.completed} busy={busy} compact onChange={value => onToggle(game.slug, 'played', value)} /><CompletedToggle title={game.title} completed={Boolean(progress[game.slug]?.completed)} busy={busy} onChange={value => onToggle(game.slug, 'completed', value)} /><button className="icon-button" disabled={busy} aria-pressed={Boolean(progress[game.slug]?.later)} aria-label={`Play later: ${game.title}`} title="Play later" onClick={() => onToggle(game.slug, 'later')}><Icon name="bookmark" width="18" height="18" fill={progress[game.slug]?.later ? 'currentColor' : 'none'} /></button>{compareRecord && <ComparePinButton record={compareRecord} compact disabled={busy} />}</div></td>
            </tr>
          ); })}</tbody>
        </table>
      </div>
      <p className="table-footnote">The critic average normalizes available entered columns, including both Metacritic columns. {author.shortName}'s original cached ratings and source notes are preserved, not recalculated. Your editable personal ratings live on My rankings and are separate from these source values.</p>
    </div>
  );
}

function RatingsGameLink({ game, filters, onOpen, compareRecord }: {
  game: Game; filters: Filters; onOpen: (id: string) => void; compareRecord?: LibraryRecord;
}) {
  const sourceRef = useRef<HTMLAnchorElement>(null);
  const compareDrag = useCompareDragSource({ record: compareRecord, sourceRef });
  return (
    <a ref={sourceRef} {...compareDrag.surfaceProps} {...compareDrag.titleProps} href={`/${createSearch(filters, game.slug)}`} onClick={(event) => {
      if (event.defaultPrevented || compareDrag.consumeClick(event)) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      onOpen(game.slug);
    }}>
      <span className="table-inline-rank" aria-hidden="true">#{String(game.rank).padStart(2, '0')}</span><span className="table-game-title">{game.title}</span>
    </a>
  );
}

function TableHeading({ label, scale, active, direction, onClick }: { label: string; scale: number; active: boolean; direction: 'asc' | 'desc'; onClick: () => void }) {
  return <th scope="col" aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : undefined}><button className="table-sort" aria-label={`${label} / ${scale}`} onClick={onClick}><span>{label}<small>/ {scale}</small></span><Icon name={active && direction === 'asc' ? 'up' : 'down'} width="13" height="13" /></button></th>;
}
