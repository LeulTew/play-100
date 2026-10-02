import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CollectionExtrasProps } from './CollectionExtras';
import { TableFallback, ExtendedFallback, FilmsFallback } from './CollectionExtrasFallback';
import { collectionExtrasModule } from '../lib/collection-extras-preload';
import { ChunkRecovery } from './ChunkRecovery';
import { ChunkBoundary } from './ChunkBoundary';
import { extendedResultCount } from '../lib/extended-search';

/**
 * When a deferred section asks for its module: at once; once it nears the viewport; or only once it is used (focus
 * inside it, a film to watch), never because a scroll passes it.
 */
export type LoadTrigger = 'now' | 'near' | 'use';

export function DeferredCollection({
  input,
  load = 'now',
  onReady,
}: {
  input: CollectionExtrasProps;
  load?: LoadTrigger;
  onReady?: () => void;
}) {
  const [module, setModule] = useState(collectionExtrasModule.peek);
  const [requested, setRequested] = useState(load === 'now');
  const [failed, setFailed] = useState(false);
  const [film, setFilm] = useState<'the-100' | 'discover-compare'>();
  const root = useRef<HTMLDivElement>(null);
  const focusedFilm = useRef<string | null>(null);
  const pendingSearch = useRef<{ queryKey: string; trigger: HTMLButtonElement; activate: boolean } | null>(null);
  const ready = input.kind !== 'films' || input.props.postersReady;
  // Without IntersectionObserver a nearby section cannot wait to be near, so it asks for its tools once it is ready.
  if (load === 'near' && ready && !requested && !module && typeof IntersectionObserver === 'undefined')
    setRequested(true);
  useEffect(() => {
    if (load !== 'near' || !ready || requested || module || !root.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRequested(true);
          observer.disconnect();
        }
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [ready, requested, module, load]);
  useEffect(() => {
    if (!requested || module) return;
    let current = true;
    void collectionExtrasModule.load().then(
      (loaded) => {
        if (current) setModule(loaded);
      },
      (cause) => {
        console.error('The requested collection tools did not load.', cause);
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [requested, module]);
  useLayoutEffect(() => {
    if (module && focusedFilm.current && document.activeElement === document.body) {
      const selector =
        focusedFilm.current === 'heading' ? '#collection-films-title' : `button[data-film-id="${focusedFilm.current}"]`;
      root.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    }
  }, [module]);
  useLayoutEffect(() => {
    const pending = pendingSearch.current;
    if (!pending) return;
    if (input.kind !== 'extended' || pending.queryKey !== input.props.queryKey) {
      pendingSearch.current = null;
      return;
    }
    if (!module) return;
    pendingSearch.current = null;
    const retainFocus = document.activeElement === pending.trigger || document.activeElement === document.body;
    if (pending.activate) {
      if (retainFocus) {
        root.current?.querySelector<HTMLElement>('#extended-results-title')?.focus({ preventScroll: true });
      }
      if (input.props.online.eligible && !input.props.online.remoteEnabled) input.props.online.searchOnline();
    } else if (retainFocus) {
      const target =
        root.current?.querySelector<HTMLButtonElement>('[data-extended-search]') ??
        root.current?.querySelector<HTMLElement>('#extended-results-title');
      target?.focus({ preventScroll: true });
    }
  }, [input, module]);
  const Loaded = module?.default;
  // The loaded tools are committed by now, so a keyboard append made while the placeholder showed can land.
  useLayoutEffect(() => {
    if (Loaded) onReady?.();
  }, [Loaded, onReady]);
  const fallback =
    input.kind === 'table' ? (
      <TableFallback {...input.props} />
    ) : input.kind === 'extended' ? (
      <ExtendedFallback
        {...input.props}
        onSearchIntent={(trigger, activate) => {
          const prior = pendingSearch.current;
          pendingSearch.current = {
            queryKey: input.props.queryKey,
            trigger,
            activate: activate || (prior?.queryKey === input.props.queryKey && prior.activate),
          };
          setRequested(true);
        }}
      />
    ) : (
      <FilmsFallback
        onWatch={(id) => {
          setFilm(id);
          setRequested(true);
        }}
      />
    );
  const failureMessage = input.kind === 'films' ? "The films didn't load." : "These collection tools didn't load.";
  const body = failed ? (
    <div className="data-error">
      <ChunkRecovery message={failureMessage} />
    </div>
  ) : Loaded ? (
    <ChunkBoundary fallback={<ChunkRecovery message={failureMessage} />}>
      {input.kind === 'films' ? (
        <Loaded kind="films" props={{ ...input.props, initialFilmId: film, embedded: true }} />
      ) : input.kind === 'extended' ? (
        <Loaded kind="extended" props={{ ...input.props, embedded: true }} />
      ) : (
        <Loaded {...input} />
      )}
    </ChunkBoundary>
  ) : (
    fallback
  );
  return (
    <div
      ref={root}
      data-collection-extras={input.kind}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLElement) {
          focusedFilm.current =
            event.target.id === 'collection-films-title' ? 'heading' : (event.target.dataset.filmId ?? null);
        }
        setRequested(true);
      }}
    >
      {input.kind === 'films' ? (
        <section
          id="collection-films"
          className="collection-films"
          aria-labelledby="collection-films-title"
          aria-busy={requested && !Loaded && !failed}
        >
          <div className="films-heading">
            <h2 id="collection-films-title" tabIndex={-1}>
              Watch films
            </h2>
            <p>Short tours. Play only when you choose.</p>
          </div>
          {body}
        </section>
      ) : input.kind === 'extended' ? (
        <section
          className="extended-results discovery-extended"
          aria-labelledby="extended-results-title"
          aria-busy={requested && !Loaded && !failed}
        >
          <div className="extended-heading">
            <h2 id="extended-results-title" tabIndex={-1}>
              Beyond The 100
            </h2>
            <span>
              {extendedResultCount(input.props.records.length, input.props.queryKey, input.props.online.loading)}
            </span>
          </div>
          {body}
        </section>
      ) : (
        body
      )}
    </div>
  );
}
