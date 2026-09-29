import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { SourceSearchState } from '../../lib/catalog-search-session';
import type { CatalogSource } from '../../lib/catalog-types';
import { SOURCE_LABELS } from '../../lib/personal-types';
import { focusPendingEditor, visibleFocusTarget } from '../../lib/dialog-focus';
import { foregroundDialog } from '../dialog-layer';

export function CatalogRetry({
  needed,
  busy,
  disabled = false,
  label,
  onRetry,
  returnFocus,
}: {
  needed: boolean;
  busy: boolean;
  disabled?: boolean;
  label: string;
  onRetry: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const [retained, setRetained] = useState(false);
  const pending = useRef(false);
  if (retained && !needed && !busy) setRetained(false);
  useLayoutEffect(() => {
    pending.current = busy;
  });
  const retryRef = useCallback(
    (button: HTMLButtonElement | null) => {
      if (!button) return;
      return () => {
        if (document.activeElement !== button) return;
        const target = returnFocus.current;
        queueMicrotask(() => {
          // Only a removed, still-focused retry hands off to its surviving section.
          if (
            !button.isConnected &&
            (document.activeElement === document.body || document.activeElement === button) &&
            visibleFocusTarget(target) &&
            target.closest('dialog') === foregroundDialog()
          )
            focusPendingEditor(target);
        });
      };
    },
    [returnFocus],
  );
  if (!needed && !(retained && busy)) return null;
  return (
    <button
      ref={retryRef}
      type="button"
      className="text-button"
      aria-disabled={busy || disabled || undefined}
      aria-busy={busy}
      onClick={() => {
        if (busy || disabled || pending.current) return;
        pending.current = true;
        setRetained(true);
        onRetry();
      }}
    >
      {label}
    </button>
  );
}

interface CatalogSourceStatusProps {
  sources: SourceSearchState[];
  newMatches: Readonly<Record<CatalogSource, number>>;
  onRetry: (source: CatalogSource) => void;
  onMore: (source: CatalogSource, offset: number) => void;
  onPrevious?: (source: CatalogSource, offset: number) => void;
}

function SourceStatus({
  source,
  count,
  onRetry,
  onMore,
  onPrevious,
}: Omit<CatalogSourceStatusProps, 'sources' | 'newMatches'> & { source: SourceSearchState; count: number }) {
  const status = useRef<HTMLParagraphElement>(null);
  return (
    <div>
      <p role="status" ref={status} tabIndex={-1}>
        <a
          href={
            source.source === 'wikidata'
              ? 'https://www.wikidata.org/wiki/Wikidata:Data_access'
              : 'https://www.freetogame.com/'
          }
          target="_blank"
          rel="noreferrer"
        >
          {SOURCE_LABELS[source.source]}
        </a>
        <span>
          {source.status === 'loading'
            ? 'Loading…'
            : source.status === 'error'
              ? source.failure === 'timeout'
                ? 'Timed out'
                : source.failure === 'rate-limited'
                  ? 'Rate limited'
                  : source.failure === 'offline'
                    ? 'Offline'
                    : 'Provider unavailable'
              : count === 0
                ? 'No new online matches'
                : `${count} new online ${count === 1 ? 'match' : 'matches'}`}
        </span>
      </p>
      {source.error && (
        <p className="discovery-source-error" role="alert">
          {source.error}
        </p>
      )}
      {onPrevious && source.requestOffset > 0 && (
        <button
          className="text-button"
          disabled={source.status === 'loading'}
          onClick={() =>
            onPrevious(source.source, Math.max(0, source.requestOffset - (source.source === 'wikidata' ? 5 : 20)))
          }
        >
          Previous from {SOURCE_LABELS[source.source]}
        </button>
      )}
      <CatalogRetry
        needed={source.status === 'error'}
        busy={source.status === 'loading'}
        label={`Retry ${SOURCE_LABELS[source.source]}`}
        onRetry={() => onRetry(source.source)}
        returnFocus={status}
      />
      {source.status !== 'error' && source.nextOffset !== null && (
        <button
          className="text-button"
          disabled={source.status === 'loading'}
          onClick={() => {
            if (source.nextOffset !== null) onMore(source.source, source.nextOffset);
          }}
        >
          More from {SOURCE_LABELS[source.source]}
        </button>
      )}
      {source.notices.length > 0 && (
        <details>
          <summary aria-label={`Source details for ${SOURCE_LABELS[source.source]}`}>Source details</summary>
          {source.notices.map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
        </details>
      )}
    </div>
  );
}

export function CatalogSourceStatus({ sources, newMatches, onRetry, onMore, onPrevious }: CatalogSourceStatusProps) {
  return (
    <div className="discovery-source-status" role="group" aria-label="Online catalog status">
      {sources
        .filter((source) => source.status !== 'idle')
        .map((source) => (
          <SourceStatus
            key={source.source}
            source={source}
            count={newMatches[source.source]}
            onRetry={onRetry}
            onMore={onMore}
            onPrevious={onPrevious}
          />
        ))}
    </div>
  );
}
