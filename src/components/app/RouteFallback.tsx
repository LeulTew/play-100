import type { ComponentProps } from 'react';
import type { AppPage } from '../../lib/types';
import { Dialog } from '../Dialog';
import './route-fallback.css';

export type RouteFallbackProps = { route: AppPage } & (
  | { kind: 'public-page' | 'cloud-page' | 'private-library' }
  | {
      kind: 'account-sheet';
      onClose: () => void;
      getReturnFocus: ComponentProps<typeof Dialog>['getReturnFocus'];
      getOpener?: ComponentProps<typeof Dialog>['getOpener'];
    }
);

const titles: Record<AppPage, string> = {
  collection: 'The 100',
  games: 'My games',
  library: 'My games',
  rankings: 'My games',
  discover: 'Discover',
  account: 'Account',
  publish: 'Publish ranking',
  community: 'Community',
  profile: 'A shared ranking',
  creator: 'Creator desk',
  friends: 'Friends',
  friend: 'Player',
  invite: 'Invitation',
  compare: 'Compare rankings',
  'friend-sharing': 'Friend sharing',
  'friend-shelf': 'Shared games',
};

// A no-break space gives a placeholder the line box of the text it stands in for.
const blank = '\u00a0';

/**
 * Discover's controls as they settle (DiscoverPage.tsx), drawn with the same eagerly loaded rules so its results start
 * where the page's will: the search, the filters (collapsed to one ruled row where BrowseFilters collapses them) and the
 * results heading.
 */
function DiscoverControls() {
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;
  // A 44px line, as tall as the page's checkbox row and disclosure summaries.
  const row = <span className="check-control">{blank}</span>;
  return (
    <div aria-hidden="true" inert>
      <div className="browse-filters discovery-filters">
        {narrow ? (
          row
        ) : (
          <div className="browse-filters-content">
            {row}
            <div className="discovery-toolbar">
              {Array.from({ length: 4 }, (_, index) => (
                <div className="filter-select progress-filter" key={index}>
                  <label>{blank}</label>
                  <span className="button button-outline" />
                </div>
              ))}
            </div>
            <p className="section-help">{blank}</p>
            <div className="discovery-help">{row}</div>
          </div>
        )}
      </div>
      <div className="discovery-results-heading">
        <div>
          <h2>{blank}</h2>
          <p>{blank}</p>
        </div>
        <div className="discovery-view">
          <span className="icon-button" />
          <span className="icon-button" />
        </div>
        <span className="discovery-skeleton-action" />
      </div>
    </div>
  );
}

export function RouteFallback(props: RouteFallbackProps) {
  const sheet = props.kind === 'account-sheet';
  const title = sheet ? 'sign-in' : titles[props.route];
  const cards = !sheet && props.route === 'discover';
  const games = !sheet && titles[props.route] === 'My games';
  const form = sheet || props.route === 'account' || props.route === 'publish';
  const line = <span className="discovery-skeleton-line" />;
  const content = form ? (
    line
  ) : cards ? (
    // Discover's own loading card, so the page's skeleton takes over without a change.
    <>
      <div className="discovery-card-art">
        <span className="discovery-skeleton-print" />
      </div>
      <div className="discovery-card-body">
        <h3>{line}</h3>
        <p className="discovery-card-meta">
          {line}
          {line}
        </p>
        <div className="discovery-card-primary">
          <span className="discovery-skeleton-action" />
          <span className="discovery-skeleton-action" />
        </div>
        <div className="discovery-skeleton-source">{line}</div>
      </div>
    </>
  ) : (
    <>
      <i className="discovery-card-art" />
      <div>
        <h3>{line}</h3>
        {line}
      </div>
    </>
  );
  const skeleton = (
    <div
      className={`route-skeleton ${form ? '' : `discovery-skeleton discovery-cards-${cards ? 'grid' : 'list'}`}`}
      aria-hidden="true"
      inert
    >
      {Array.from({ length: cards ? 10 : 3 }, (_, index) => (
        <div className={form ? 'search-field section-help' : 'discovery-card-skeleton'} key={index}>
          {content}
        </div>
      ))}
    </div>
  );
  const status = (
    <p className={games ? 'section-help route-fallback-results' : 'section-help'} role="status">
      {props.kind === 'private-library'
        ? 'Opening your guest or account library before allowing edits.'
        : `Loading ${title}…`}
    </p>
  );
  if (sheet)
    return (
      <Dialog
        open
        motion={false}
        titleId="loading-account-title"
        onClose={props.onClose}
        getReturnFocus={props.getReturnFocus}
        getOpener={props.getOpener}
        className="info-dialog"
      >
        <h2 id="loading-account-title" data-autofocus tabIndex={-1}>
          Sign in
        </h2>
        {status}
        {skeleton}
      </Dialog>
    );
  return (
    <section className={`app-page route-fallback${cards ? ' discovery-page' : ''}`} aria-busy="true">
      <div className={cards ? 'discovery-heading' : 'page-heading'}>
        <h1>{title}</h1>
      </div>
      {cards && (
        <div className="discovery-search" aria-hidden="true" inert>
          <label>{blank}</label>
          <div className="search-field" />
        </div>
      )}
      {games && (
        // My games' views and Progress, then its search: their rules load with the page, so their settled heights do.
        <div aria-hidden="true" inert>
          <div className="route-fallback-tabs">
            <div className="filter-select progress-filter">
              <label>{blank}</label>
              <span className="button button-outline" />
            </div>
          </div>
          <div className="search-field route-fallback-tools" />
        </div>
      )}
      {status}
      {cards && <DiscoverControls />}
      {skeleton}
    </section>
  );
}
