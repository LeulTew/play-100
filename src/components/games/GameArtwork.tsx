import { useState } from 'react';
import type { LibraryRecord } from '../../lib/personal-types';
import { Icon } from '../Icon';
import './game-artwork.css';

export interface GameArtworkProps {
  record: LibraryRecord;
  // A presentation-only subset of CatalogArtwork; provenance is never copied into LibraryRecord.
  artwork?: {
    src: string;
    width: number;
    height: number;
    alt: string;
    sourceUrl: string;
    credit: string;
    license: string;
    licenseUrl: string;
  } | null;
  className?: string;
}

export function GameArtwork({ record, artwork, className = '' }: GameArtworkProps) {
  const validArtwork =
    artwork &&
    /^\/images\/discovery\/[a-f0-9]{64}\.webp$/.test(artwork.src) &&
    Number.isInteger(artwork.width) &&
    artwork.width > 0 &&
    artwork.width <= 640 &&
    Number.isInteger(artwork.height) &&
    artwork.height > 0 &&
    artwork.height <= 640
      ? artwork
      : null;
  const src =
    validArtwork?.src ??
    (record.source === 'collection' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(record.id)
      ? `/covers/${record.id}.webp`
      : null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <span className={`game-artwork ${className}`} aria-hidden="true">
      {src && src !== failedSrc ? (
        <img
          src={src}
          width={validArtwork?.width ?? 48}
          height={validArtwork?.height ?? 60}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span className="game-artwork-fallback" title="No artwork available">
          <Icon name="stack" width="22" height="22" />
        </span>
      )}
    </span>
  );
}

export function GameArtworkCredit({
  artwork,
  disclosureLabel,
}: Pick<GameArtworkProps, 'artwork'> & { disclosureLabel?: string }) {
  if (!artwork) return null;
  const safeLink = (value: string) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  };
  const credit = (
    <span className="game-artwork-credit">
      Art:{' '}
      {safeLink(artwork.sourceUrl) ? (
        <a href={artwork.sourceUrl} target="_blank" rel="noreferrer">
          {artwork.credit}
        </a>
      ) : (
        artwork.credit
      )}
      {' / '}
      {safeLink(artwork.licenseUrl) ? (
        <a href={artwork.licenseUrl} target="_blank" rel="noreferrer">
          {artwork.license}
        </a>
      ) : (
        artwork.license
      )}
    </span>
  );
  return disclosureLabel ? (
    <details className="game-artwork-disclosure">
      <summary aria-label={disclosureLabel}>Artwork credits</summary>
      {credit}
    </details>
  ) : (
    credit
  );
}
