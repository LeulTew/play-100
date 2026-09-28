import type { ComponentProps, CSSProperties } from 'react';
import type RatingsTable from './RatingsTable';
import type ExtendedResults from './catalog/ExtendedResults';
import { author, authorRatingText } from '../lib/author';
import { criticColumns, formatAverage, sortDirection } from '../lib/collection';
import { catalogGenreLabel } from '../lib/discovery-genres';
import { Icon } from './Icon';

export function TableFallback({
  games,
  filters,
  selecting,
  comparisonTray,
  progress,
  getCompareRecord,
  savedCopies,
}: ComponentProps<typeof RatingsTable>) {
  const columns = [
    { label: 'Rank', key: 'rank', scale: null },
    { label: 'Game', key: 'title', scale: null },
    { label: 'Year', key: 'newest', scale: null },
    { label: `${author.shortName}'s rating`, key: 'author-rating', scale: '/ 10 · original' },
    ...criticColumns.map((column) => ({ ...column, scale: `/ ${column.scale}` })),
    { label: 'Average', key: 'score', scale: '/ 100' },
  ];
  return (
    <div className="ratings-mode" aria-busy="true">
      <p className="sr-only" role="status">
        Loading ratings table…
      </p>
      <div className="ratings-explainer" aria-hidden="true">
        <p>
          {author.shortName}'s original ratings are shown separately from the critic snapshots. His source rating column
          is based on his curated rank. <strong>—</strong> means unavailable.
        </p>
      </div>
      <div
        className="ratings-scroll"
        inert
        aria-hidden="true"
        style={{ '--selection-width': selecting ? '44px' : '0px' } as CSSProperties}
      >
        <table className="ratings-table">
          <thead>
            <tr>
              {selecting && <th className="selection-column" />}
              {columns.map(({ key, label, scale }) => (
                <th key={key} className={key === 'rank' ? 'table-rank' : key === 'title' ? 'table-game' : undefined}>
                  <button className="table-sort" disabled>
                    <span>
                      {label}
                      {scale && <small>{scale}</small>}
                    </span>
                    <Icon
                      name={filters.sort === key && sortDirection(filters) === 'asc' ? 'up' : 'down'}
                      width="13"
                      height="13"
                    />
                  </button>
                </th>
              ))}
              <th>Your list</th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => (
              <tr key={game.slug}>
                {selecting && (
                  <td className="selection-column">
                    <label className="select-control">
                      <input type="checkbox" disabled />
                    </label>
                  </td>
                )}
                <td className="table-rank">{String(game.rank).padStart(2, '0')}</td>
                <th className="table-game">
                  <a>
                    <span className="table-inline-rank">#{String(game.rank).padStart(2, '0')}</span>
                    <span className="table-game-title">{game.title}</span>
                  </a>
                  <span>
                    {game.genre} · {game.tier === 'core' ? 'Core 50' : 'Essential 50'}
                  </span>
                  {savedCopies?.(game)}
                </th>
                <td>{game.year}</td>
                <td className="numeric-score">{game.authorRating ? authorRatingText(game.authorRating) : '—'}</td>
                {criticColumns.map(({ key }) => (
                  <td key={key} className="numeric-score">
                    {game.critics[key] ?? '—'}
                  </td>
                ))}
                <td className="numeric-score">{formatAverage(game.criticAverage)}</td>
                <td>
                  <div className="table-progress">
                    <label className="check-control played-toggle">
                      <input type="checkbox" checked={Boolean(progress[game.slug]?.played)} readOnly disabled />
                      <span>Played</span>
                    </label>
                    <button className="text-button completed-toggle" disabled>
                      <Icon name={progress[game.slug]?.completed ? 'check' : 'plus'} width="17" height="17" />
                      Completed
                    </button>
                    <button className="icon-button" disabled>
                      <Icon name="bookmark" width="18" height="18" />
                    </button>
                    {getCompareRecord && (
                      <button className="icon-button" disabled>
                        <Icon name="stack" width="19" height="19" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {comparisonTray && <div className="ratings-tray-strip">{comparisonTray}</div>}
      <p className="table-footnote" aria-hidden="true">
        The critic average normalizes available entered columns, including both Metacritic columns. {author.shortName}'s
        original cached ratings and source notes are preserved, not recalculated. Your ratings are separate from these
        source values. Edit them in <span className="text-button">My games → Ranking</span>.
      </p>
    </div>
  );
}

export function ExtendedFallback({ records, online, state, onPin }: ComponentProps<typeof ExtendedResults>) {
  return (
    <>
      <p className="sr-only" role="status">
        Loading additional games…
      </p>
      <ul className="discovery-cards discovery-cards-list" aria-hidden="true" inert>
        {records.slice(0, 24).map((record) => (
          <li className="discovery-card" key={record.id}>
            <div className="discovery-card-art">
              {!online.artwork.has(record.id) && (
                <div className="discovery-no-art">
                  <span>{record.year ?? 'Game'}</span>
                  <span>Artwork unavailable</span>
                </div>
              )}
            </div>
            <div className="discovery-card-body">
              <h3>
                <button disabled>{record.title}</button>
              </h3>
              <p className="discovery-card-meta">
                {[record.year, catalogGenreLabel(record)].filter((value) => value !== null).join(' · ') || 'Game'}
              </p>
              <div className="discovery-card-primary">
                <button className={`button ${state.records[record.id] ? 'button-outline' : 'button-dark'}`} disabled>
                  <Icon name={state.records[record.id] ? 'check' : 'plus'} width="16" height="16" />
                  {state.records[record.id] ? 'In My games' : 'Add to My games'}
                </button>
                {onPin && (
                  <button className="button button-outline" disabled>
                    <Icon name="stack" width="16" height="16" />
                    Pin
                  </button>
                )}
              </div>
              <details className="discovery-card-details">
                <summary>Actions &amp; source</summary>
              </details>
            </div>
          </li>
        ))}
      </ul>
      {!records.length && <p className="extended-empty">Loading additional games…</p>}
    </>
  );
}

const filmSummaries = [
  { id: 'the-100', title: 'The 100', description: 'One point of view. The original order, ratings and workbook.' },
  {
    id: 'discover-compare',
    title: 'Discover & compare',
    description: 'Find games, pin a shortlist and compare shared rankings.',
  },
] as const;

export function FilmsFallback({ onWatch }: { onWatch: (id: 'the-100' | 'discover-compare') => void }) {
  return (
    <ul className="films-list">
      {filmSummaries.map((film) => (
        <li key={film.id}>
          <button
            className="film-watch"
            data-film-id={film.id}
            aria-haspopup="dialog"
            onClick={() => onWatch(film.id)}
          >
            <span className="film-poster">
              <span className="film-play-mark" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <path d="M6 3 17 10 6 17Z" fill="currentColor" />
                </svg>
              </span>
            </span>
            <span className="film-summary">
              <strong>{film.title}</strong>
              <span>{film.description}</span>
              <small>0:22 · Watch film</small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
