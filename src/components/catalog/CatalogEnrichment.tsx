import { useState } from 'react';
import type { ExternalCatalogArtwork as Artwork } from '../../lib/catalog-enrichment';
import type { PublicCatalogLookup, useCatalogEnrichment } from '../../hooks/useCatalogEnrichment';
import { GameArtworkCredit } from '../games/GameArtwork';
import { Icon } from '../Icon';
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
      <GameArtworkCredit artwork={artwork} disclosureLabel="Artwork credits for this public catalog image" />
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

export function CatalogEnrichment({
  enrichment,
  lookup,
}: {
  enrichment: ReturnType<typeof useCatalogEnrichment>;
  lookup?: PublicCatalogLookup;
}) {
  if (!lookup) return null;
  const { data, status, error, cached, connected, retry } = enrichment;
  const canRetry = lookup.online && connected && status !== 'loading';
  const ratingSourceFailed = data?.sources.some(
    (source) => (source.source === 'wikidata' || source.source === 'steam') && source.status === 'error',
  );
  return (
    <section className="catalog-enrichment" aria-labelledby="catalog-enrichment-title">
      <h3 id="catalog-enrichment-title">Ratings from other sites</h3>
      <p className="catalog-enrichment-note">
        Source scores stay separate. They do not change the original collection or your rating.
      </p>
      {!lookup.online && (
        <p className="catalog-enrichment-note">
          Online lookup is off. Only bundled or previously loaded public details are shown.{' '}
          <button className="text-button" disabled={!connected} onClick={lookup.onEnableOnline}>
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
                    <strong>{rating.score.text}</strong>
                  </div>
                  <p>
                    {rating.kind === 'user-recommendations'
                      ? 'User recommendations · Steam'
                      : 'Reported review score · via Wikidata'}
                  </p>
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
      {canRetry && (error || data?.sources.some((source) => source.status === 'error')) && (
        <button className="text-button" onClick={retry}>
          Retry public details
        </button>
      )}
    </section>
  );
}
