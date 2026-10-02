import { useCallback, useRef, useState } from 'react';
import type { CatalogExternalRating, ExternalCatalogArtwork as Artwork } from '../../lib/catalog-enrichment';
import type { PublicCatalogLookup, useCatalogEnrichment } from '../../hooks/useCatalogEnrichment';
import { GameArtworkCredit } from '../games/GameArtwork';
import { Icon } from '../Icon';
import { CatalogRetry } from './CatalogSourceStatus';
import { captureControlFocus } from '../../lib/control-focus';
import './catalog-enrichment.css';

export function ExternalCatalogArtwork({ artwork }: { artwork: Artwork }) {
  const [failed, setFailed] = useState('');
  return failed === artwork.src ? (
    <span className="catalog-external-art-error">Artwork could not load</span>
  ) : (
    <img
      className="catalog-external-art"
      src={artwork.src}
      width={artwork.width}
      height={artwork.height}
      alt={artwork.alt}
      decoding="async"
      onError={() => setFailed(artwork.src)}
    />
  );
}

export function ExternalCatalogArtworkCredit({ artwork }: { artwork: Artwork }) {
  return (
    <div className="catalog-detail-art-credits">
      <GameArtworkCredit artwork={artwork} disclosureLabel="Artwork credits for this public catalog image" httpsOnly />
      <p className="catalog-enrichment-note">
        <a href={artwork.originalUrl} target="_blank" rel="noreferrer">
          Original file
        </a>
        {' · '}Retrieved <time dateTime={artwork.retrievedAt}>{artwork.retrievedAt.slice(0, 10)}</time>. Reusable under
        the linked license; no publisher endorsement.
      </p>
    </div>
  );
}

function compactRatingContext(rating: CatalogExternalRating): string {
  const source = rating.source === 'steam' ? 'Steam' : 'Wikidata';
  const seen = new Set([source.toLowerCase()]);
  const platforms = rating.platforms.filter((platform) => {
    const key = platform.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [
    rating.kind === 'user-recommendations' ? 'User recommendations' : 'Reported review score',
    rating.source === 'steam' ? source : `via ${source}`,
    ...(platforms.length ? [platforms.join(' / ')] : []),
  ].join(' · ');
}

function formatExternalScore(text: string): string {
  const match = /^(\d+)\.(\d{3,})(\s*\/\s*(\d+(?:\.\d+)?))$/.exec(text);
  if (!match) return text;
  const value = Number(`${match[1]}.${match[2]}`);
  const scale = Number(match[4]);
  if (!Number.isFinite(value) || !Number.isFinite(scale) || scale <= 0 || scale > 1000 || value > scale) return text;
  const compact = new Intl.NumberFormat('en', { maximumFractionDigits: 2, useGrouping: false }).format(value);
  const rounded = /[1-9]/.test(match[2]!.slice(2));
  return `${rounded ? '≈' : ''}${compact}${match[3]}`;
}

export function CatalogEnrichment({
  enrichment,
  lookup,
}: {
  enrichment: ReturnType<typeof useCatalogEnrichment>;
  lookup?: PublicCatalogLookup;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const enableRef = useCallback((button: HTMLButtonElement | null) => {
    if (!button) return;
    return () => {
      const handoff = captureControlFocus(button);
      const target = heading.current;
      queueMicrotask(() => handoff.focus(target));
    };
  }, []);
  if (!lookup) return null;
  const { data, status, error, cached, connected, retry } = enrichment;
  const ratingSourceFailed = data?.sources.some(
    (source) => (source.source === 'wikidata' || source.source === 'steam') && source.status === 'error',
  );
  return (
    <section className="catalog-enrichment" aria-labelledby="catalog-enrichment-title">
      <h3 id="catalog-enrichment-title" ref={heading} tabIndex={-1}>
        Ratings from other sites
      </h3>
      <p className="catalog-enrichment-note">
        Source scores stay separate. They do not change the original collection or your rating.
      </p>
      {!lookup.online && (
        <p className="catalog-enrichment-note">
          Online lookup is off. Only bundled or previously loaded public details are shown.{' '}
          <button
            ref={enableRef}
            className="text-button"
            aria-disabled={!connected || undefined}
            onClick={() => {
              if (connected) lookup.onEnableOnline();
            }}
          >
            Enable online details
          </button>
        </p>
      )}
      {!connected && (
        <p className="catalog-enrichment-note" role="status">
          You appear to be offline. Previously loaded public details remain available.
        </p>
      )}
      {status === 'loading' && (
        <p className="catalog-enrichment-note" role="status">
          Loading public ratings and licensed artwork…
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <p className="catalog-enrichment-note">
            {cached ? 'Cached public details' : 'Public details'} retrieved{' '}
            <time dateTime={data.fetchedAt}>{data.fetchedAt.slice(0, 10)}</time>. Source dates may be older.
          </p>
          {data.ratings.length ? (
            <ul className="catalog-review-list" aria-label="Separate external game ratings">
              {data.ratings.map((rating) => (
                <li key={rating.id}>
                  <div className="catalog-review-heading">
                    <h4>{rating.publisher}</h4>
                    <strong>{formatExternalScore(rating.score.text)}</strong>
                  </div>
                  <p>{compactRatingContext(rating)}</p>
                  <details className="catalog-review-details">
                    <summary>Source details for {rating.publisher}</summary>
                    <p>Original score: {rating.score.text}</p>
                    <p>
                      {rating.platforms.length ? rating.platforms.join(' / ') : 'Platform not specified'}
                      {rating.method ? ` · ${rating.method}` : ' · Review method not specified'}
                    </p>
                    <p>
                      {rating.count === null
                        ? 'Review count not supplied'
                        : `${rating.count.toLocaleString()} ${rating.source === 'steam' ? 'Steam reviews' : 'source reviews/ratings'}`}
                      {' · '}
                      {rating.asOf ? (
                        <>
                          As of <time dateTime={rating.asOf}>{rating.asOf}</time>
                        </>
                      ) : (
                        'Score date not supplied'
                      )}
                    </p>
                    {rating.referenceDate && (
                      <p>
                        Source reference retrieved <time dateTime={rating.referenceDate}>{rating.referenceDate}</time>.
                      </p>
                    )}
                    <p>
                      Retrieved <time dateTime={rating.retrievedAt}>{rating.retrievedAt.slice(0, 10)}</time>.
                    </p>
                    <div className="catalog-review-links">
                      <a href={rating.sourceUrl} target="_blank" rel="noreferrer">
                        {rating.source === 'steam' ? 'View Steam reviews' : 'View Wikidata score claims'}
                        <Icon name="up-right" width="14" height="14" />
                      </a>
                      {rating.referenceUrl && (
                        <a href={rating.referenceUrl} target="_blank" rel="noreferrer">
                          Cited source
                          <Icon name="up-right" width="14" height="14" />
                        </a>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            status !== 'loading' && (
              <p className="catalog-enrichment-note">
                {ratingSourceFailed
                  ? "We couldn't check every rating source. Retry to check for scores."
                  : 'No supported external ratings are available for this exact game.'}{' '}
                Missing scores are not zero.
              </p>
            )
          )}
          <details className="catalog-enrichment-sources">
            <summary>Coverage and sources</summary>
            <p className="catalog-enrichment-note">
              Wikidata structured claims are{' '}
              <a href="https://www.wikidata.org/wiki/Wikidata:Licensing" target="_blank" rel="noreferrer">
                CC0
              </a>{' '}
              and may be incomplete. Steam user recommendations are not critic scores. No scores are averaged together.
            </p>
            {data.sources.map((source) => (
              <p key={source.source} className={source.status === 'error' ? 'inline-error' : 'catalog-enrichment-note'}>
                <strong>
                  {source.source === 'commons'
                    ? 'Wikimedia Commons'
                    : source.source === 'freetogame'
                      ? 'FreeToGame'
                      : source.source === 'steam'
                        ? 'Steam'
                        : 'Wikidata'}
                  :
                </strong>{' '}
                {source.message}
                {source.retryAfter > 0 ? ` Retry after at least ${source.retryAfter} seconds.` : ''}
              </p>
            ))}
          </details>
          {data.sources
            .filter((source) => source.status === 'error')
            .map((source) => (
              <p key={`error:${source.source}`} className="inline-error" role="alert">
                {source.source === 'steam' ? 'Steam' : source.source === 'commons' ? 'Artwork' : 'Review source'}:{' '}
                {source.message}
              </p>
            ))}
        </>
      )}
      <CatalogRetry
        needed={lookup.online && Boolean(error || data?.sources.some((source) => source.status === 'error'))}
        busy={status === 'loading'}
        disabled={!lookup.online || !connected}
        label="Retry public details"
        onRetry={retry}
        returnFocus={heading}
      />
    </section>
  );
}
