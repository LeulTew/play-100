import { useMemo } from 'react';
import type { ComponentProps, RefObject } from 'react';
import type { DiscoveryFilters } from '../../lib/discovery-search';
import { DISCOVERY_GENRE_FAMILIES, parseDiscoveryGenreFamily } from '../../lib/discovery-genres';
import type { useDiscoverSearch } from '../../hooks/useDiscoverSearch';
import { BrowseFilters } from '../BrowseFilters';
import { Icon } from '../Icon';
import { ProgressFilter } from '../ProgressFilter';
import { SelectField } from '../SelectField';
import { CatalogSourceStatus } from './CatalogSourceStatus';

type ChangeFilters = (patch: Partial<DiscoveryFilters>, method?: 'push' | 'replace', focusResults?: boolean) => void;
type ProgressView = NonNullable<DiscoveryFilters['progress']>;

export function DiscoverFilters({
  filters,
  filterId,
  editing,
  showCollection,
  progressView,
  items,
  change,
}: {
  filters: DiscoveryFilters;
  filterId: string;
  editing: RefObject<boolean>;
  showCollection: boolean;
  progressView: ProgressView;
  items: ReturnType<typeof useDiscoverSearch>['items'];
  change: ChangeFilters;
}) {
  const genres = useMemo(
    () => [...new Set(items.flatMap(({ record }) => (record.genre ? [record.genre] : [])))].sort(),
    [items],
  );
  const years = useMemo(
    () => [...new Set(items.flatMap(({ record }) => (record.year ? [record.year] : [])))].sort((a, b) => b - a),
    [items],
  );
  const activeFilters = [
    progressView !== 'all',
    Boolean(filters.genreFamily),
    Boolean(filters.genre),
    Boolean(filters.year),
    filters.source !== 'all',
  ].filter(Boolean).length;
  return (
    <>
      <form
        className="discovery-search"
        onSubmit={(event) => {
          event.preventDefault();
          editing.current = false;
        }}
      >
        <label htmlFor="catalog-search">Find a game</label>
        <div className="search-field">
          <Icon name="search" />
          <input
            id="catalog-search"
            type="search"
            value={filters.q}
            maxLength={80}
            placeholder="Search games, studios or aliases…"
            onFocus={() => {
              editing.current = false;
            }}
            onBlur={() => {
              editing.current = false;
            }}
            onChange={(event) => {
              change({ q: event.target.value, offset: 0, online: 'auto' }, editing.current ? 'replace' : 'push');
              editing.current = true;
            }}
          />
          {filters.q && (
            <button
              className="icon-button"
              type="button"
              aria-label="Clear search"
              onClick={() => change({ q: '', offset: 0, online: 'auto' })}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      </form>
      <p className="section-help">
        {showCollection
          ? 'Including original entries from The 100 once, alongside other games.'
          : 'Discover games beyond The 100. Matches already in the collection open their original entry.'}
      </p>
      <BrowseFilters activeCount={activeFilters} className="discovery-filters">
        <label className="check-control">
          <input
            type="checkbox"
            checked={showCollection}
            onChange={(event) =>
              change({
                include100: event.target.checked ? 'on' : 'off',
                source: !event.target.checked && filters.source === 'collection' ? 'all' : filters.source,
                offset: 0,
                online: 'auto',
              })
            }
          />
          Include The 100
        </label>
        <div className="discovery-toolbar">
          <ProgressFilter
            value={progressView}
            onChange={(progress) => change({ progress, offset: 0, online: 'auto' })}
          />
          <SelectField
            id={`${filterId}-genre-family`}
            className="progress-filter"
            label="Genre family"
            descriptionId="discovery-genre-help"
            value={filters.genreFamily ?? ''}
            onChange={(value) =>
              change({
                genreFamily: parseDiscoveryGenreFamily(value),
                genre: '',
                offset: 0,
                online: 'auto',
              })
            }
          >
            <option value="">All families</option>
            {DISCOVERY_GENRE_FAMILIES.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField
            id={`${filterId}-year`}
            className="progress-filter"
            label="Year"
            value={filters.year}
            onChange={(value) => change({ year: value, offset: 0, online: 'auto' })}
          >
            <option value="">Any year</option>
            {filters.year && !years.includes(Number(filters.year)) && <option>{filters.year}</option>}
            {years.map((year) => (
              <option key={year}>{year}</option>
            ))}
          </SelectField>
          <SelectField
            id={`${filterId}-source`}
            className="progress-filter"
            label="Source"
            value={filters.source}
            onChange={(value) =>
              change({
                source:
                  value === 'collection'
                    ? 'collection'
                    : value === 'wikidata'
                      ? 'wikidata'
                      : value === 'freetogame'
                        ? 'freetogame'
                        : 'all',
                offset: 0,
                online: 'auto',
              })
            }
          >
            <option value="all">All sources</option>
            <option value="collection">The 100</option>
            <option value="wikidata">Wikidata</option>
            <option value="freetogame">FreeToGame</option>
          </SelectField>
        </div>
        <p className="section-help" id="discovery-genre-help">
          Families group source labels and can overlap. Other includes unclear or missing genres. Changing family clears
          the exact source genre below.
        </p>
        <details className="discovery-help" open={Boolean(filters.genre)}>
          <summary>Exact source genre</summary>
          <div className="discovery-toolbar">
            <label>
              Exact source genre
              <select
                value={filters.genre}
                onChange={(event) => change({ genre: event.target.value, offset: 0, online: 'auto' })}
              >
                <option value="">Any source genre</option>
                {filters.genre && !genres.includes(filters.genre) && <option>{filters.genre}</option>}
                {genres.map((genre) => (
                  <option key={genre}>{genre}</option>
                ))}
              </select>
            </label>
          </div>
          <p>
            Original labels are unchanged. An exact genre narrows the selected family; choose All families to search
            every exact label.
          </p>
        </details>
        {activeFilters > 0 && (
          <button
            className="text-button"
            onClick={() =>
              change({
                progress: 'all',
                genreFamily: '',
                genre: '',
                year: '',
                source: 'all',
                offset: 0,
                online: 'auto',
              })
            }
          >
            Clear filters
          </button>
        )}
      </BrowseFilters>
    </>
  );
}

export function DiscoverSources({
  filters,
  progressView,
  remote,
  remoteEnabled,
  newMatches,
  change,
}: {
  filters: DiscoveryFilters;
  progressView: ProgressView;
  remote: ReturnType<typeof useDiscoverSearch>['remote'];
  remoteEnabled: boolean;
  newMatches: ComponentProps<typeof CatalogSourceStatus>['newMatches'];
  change: ChangeFilters;
}) {
  return (
    <div className="discovery-online">
      {filters.source === 'collection' ? (
        <p>Showing entries from The 100. Choose another source to look beyond the collection.</p>
      ) : progressView !== 'all' ? (
        <p>Online lookup is paused for this progress view. Your play history is not sent to providers.</p>
      ) : filters.catalogs === 'off' ? (
        <p>
          Online lookup is off.{' '}
          <button className="text-button" onClick={() => change({ catalogs: 'on', online: 'on', offset: 0 })}>
            Search online
          </button>
        </p>
      ) : (
        !remoteEnabled && (
          <button className="text-button" onClick={() => change({ online: 'on', offset: 0 })}>
            Search online
            <Icon name="arrow" width="17" height="17" />
          </button>
        )
      )}
      {filters.online === 'on' && progressView === 'all' && (
        <button className="text-button" onClick={() => change({ online: 'auto', offset: 0 })}>
          Back to catalog
        </button>
      )}
      <CatalogSourceStatus
        sources={remote.sources}
        newMatches={newMatches}
        onRetry={remote.retry}
        onMore={(source, offset) => change({ source, offset, online: 'on' }, 'push', true)}
        onPrevious={(source, offset) => change({ source, offset, online: 'on' }, 'push', true)}
      />
      <details className="discovery-help">
        <summary>Search options &amp; sources</summary>
        <label className="check-control">
          <input
            type="checkbox"
            checked={filters.catalogs === 'on'}
            disabled={progressView !== 'all'}
            onChange={(event) => change({ catalogs: event.target.checked ? 'on' : 'off' })}
          />
          Look online when local matches are limited
        </label>
        <p>
          Verified matches link to the original entry from The 100, including when found through Wikidata. Include The
          100 to browse those entries here once. Other editions stay separate; titles alone are never merged. Provider
          counts show new matches after local filters and duplicate matching.
        </p>
        <p>
          Only public search terms and exact public game IDs are sent to providers, not your saved progress, ratings or
          notes. Opening an eligible game can load separately labelled ratings and licensed artwork while online lookup
          is on. Metadata from Wikidata (CC0) and FreeToGame. Image credits are under each game's More actions or in its
          details.
        </p>
        <div className="button-row" role="group" aria-label="Public catalog sources">
          <a
            className="text-button"
            href="https://www.wikidata.org/wiki/Wikidata:Data_access"
            target="_blank"
            rel="noreferrer"
          >
            Wikidata (CC0)
            <Icon name="up-right" width="17" height="17" />
          </a>
          <a className="text-button" href="https://www.freetogame.com/" target="_blank" rel="noreferrer">
            FreeToGame
            <Icon name="up-right" width="17" height="17" />
          </a>
        </div>
      </details>
    </div>
  );
}
