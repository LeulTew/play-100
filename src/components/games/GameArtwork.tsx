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

const conversionNotice = 'Resized and converted to WebP; original license retained.';
const trademarkNotice = 'Trademark rights are not granted by the copyright license.';
type CreditLine = { label: string; text: string };

function creditLines(credit: string): CreditLine[] | null {
  const parts = credit.split(' | ');
  const conversion = parts.indexOf(conversionNotice);
  if (
    parts.some((part) => !part.trim() || part.includes('|')) ||
    (conversion !== 1 && conversion !== 2) ||
    parts.filter((part) => part === conversionNotice).length !== 1 ||
    parts.length > conversion + 2 ||
    (parts.length === conversion + 2 && parts[conversion + 1] !== trademarkNotice)
  ) {
    return null;
  }
  const creator = parts[0]!;
  const vector = creator.split(' Vector: ');
  let lines: CreditLine[];
  if (vector.length === 2 && creator.startsWith('Original: ')) {
    const original = vector[0]!.slice('Original: '.length);
    if (!original.trim() || !vector[1]!.trim() || /Original:|Vector:/.test(`${original} ${vector[1]}`)) return null;
    lines = [
      { label: 'Original art', text: original },
      { label: 'Vector', text: vector[1]! },
    ];
  } else {
    if (/Original:|Vector:/.test(creator)) return null;
    lines = [{ label: 'Art', text: creator }];
  }
  if (conversion === 2) {
    const source = parts[1]!;
    if (source !== 'Own work' && !/^Own work based on: \S|^Source: \S/.test(source)) return null;
    lines.push({ label: 'Original source', text: source });
  }
  lines.push({ label: 'Conversion', text: conversionNotice });
  if (parts[conversion + 1] === trademarkNotice) lines.push({ label: 'Trademark', text: trademarkNotice });
  return lines;
}

function safeCreditLink(value: string, httpsOnly: boolean): boolean {
  if (/[\s\\\p{Cc}]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || (!httpsOnly && url.protocol === 'http:')) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function CreditText({ text, httpsOnly }: { text: string; httpsOnly: boolean }) {
  // The collector represents links as "label (URL)". Only an identical adjacent URL is redundant.
  const repeated = /^(.*?)(https?:\/\/[^\s()]+) \((https?:\/\/[^\s()]+)\)(.*)$/.exec(text);
  if (repeated && repeated[2] === repeated[3] && safeCreditLink(repeated[2]!, httpsOnly)) {
    const href = repeated[2]!;
    return (
      <>
        {repeated[1]}
        <a href={href} target="_blank" rel="noopener noreferrer">
          {new URL(href).hostname}
        </a>
        {repeated[4]}
      </>
    );
  }
  const named = /^([^():]+?) \((https?:\/\/[^\s()]+)\)$/.exec(text);
  if (named && safeCreditLink(named[2]!, httpsOnly)) {
    const host = new URL(named[2]!).hostname;
    const wikimedia = ['wikimedia.org', 'wikipedia.org', 'wikidata.org'].some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
    return (
      <a href={named[2]} target="_blank" rel="noopener noreferrer">
        {named[1]}
        {!wikimedia && ` (${host})`}
      </a>
    );
  }
  const single = /^(.*?)(https?:\/\/[^\s()]+)$/.exec(text);
  if (single && !/https?:\/\//.test(single[1]!) && safeCreditLink(single[2]!, httpsOnly)) {
    const href = single[2]!;
    return (
      <>
        {single[1]}
        <a href={href} target="_blank" rel="noopener noreferrer">
          {new URL(href).hostname}
        </a>
      </>
    );
  }
  return text;
}

export function GameArtworkCredit({
  artwork,
  disclosureLabel,
  httpsOnly = false,
}: Pick<GameArtworkProps, 'artwork'> & { disclosureLabel?: string; httpsOnly?: boolean }) {
  if (!artwork) return null;
  const lines = creditLines(artwork.credit);
  const credit = (
    <div className="game-artwork-credit">
      <dl className="game-artwork-credit-lines">
        {lines ? (
          lines.map(({ label, text }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <CreditText text={text} httpsOnly={httpsOnly} />
              </dd>
            </div>
          ))
        ) : (
          <div className="game-artwork-credit-unparsed">
            <dt>Art</dt>
            <dd className="game-artwork-credit-text">{artwork.credit}</dd>
          </div>
        )}
        <div>
          <dt>Image file</dt>
          <dd>
            {safeCreditLink(artwork.sourceUrl, httpsOnly) ? (
              <a href={artwork.sourceUrl} target="_blank" rel="noopener noreferrer">
                Source image
              </a>
            ) : (
              artwork.sourceUrl
            )}
          </dd>
        </div>
        <div>
          <dt>Licence</dt>
          <dd>
            {safeCreditLink(artwork.licenseUrl, httpsOnly) ? (
              <a href={artwork.licenseUrl} target="_blank" rel="noopener noreferrer">
                {artwork.license}
              </a>
            ) : (
              artwork.license
            )}
          </dd>
        </div>
      </dl>
      {lines && (
        <details className="game-artwork-credit-original">
          <summary>Full supplied credit</summary>
          <p className="game-artwork-credit-text">{artwork.credit}</p>
        </details>
      )}
    </div>
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
