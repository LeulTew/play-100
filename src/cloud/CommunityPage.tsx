import { useEffect, useRef, useState } from 'react';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { PublicProfile } from '../lib/community';
import { Avatar } from '../components/avatar/Avatar';
import { Icon } from '../components/Icon';
import { onlineError } from './errors';
import type { SocialStore } from './social-store';

export function CommunityPage({
  social,
  onOpen,
  onPublish,
}: {
  social: SocialStore;
  onOpen: (handle: string) => void;
  onPublish: () => void;
}) {
  const [initial] = useState(() => new URLSearchParams(location.search).get('q') ?? '');
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData>>();
  const [term, setTerm] = useState(initial);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const load = async (nextTerm: string, more = false) => {
    const current = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const page = await social.directory(nextTerm, more ? cursor : undefined);
      if (current !== generation.current) return;
      setResults((previous) =>
        more
          ? [...new Map([...previous, ...page.profiles].map((profile) => [profile.uid, profile])).values()]
          : page.profiles,
      );
      setCursor(page.cursor);
      setTerm(nextTerm);
    } catch (cause) {
      if (current === generation.current) setError(onlineError(cause));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  useEffect(() => {
    let disposed = false;
    const current = ++generation.current;
    void social
      .directory(initial)
      .then((page) => {
        if (!disposed && current === generation.current) {
          setResults(page.profiles);
          setCursor(page.cursor);
          setBusy(false);
        }
      })
      .catch((cause) => {
        if (!disposed) {
          setError(onlineError(cause));
          setBusy(false);
        }
      });
    return () => {
      disposed = true;
      generation.current += 1;
    };
  }, [social, initial]);
  return (
    <section className="app-page community-page" aria-labelledby="community-title">
      <div className="page-heading">
        <div>
          <h1 id="community-title" data-page-heading tabIndex={-1}>
            Community
          </h1>
        </div>
        <button className="button button-outline" onClick={onPublish}>
          Publish ranking
          <Icon name="share" width="18" height="18" />
        </button>
      </div>
      <form
        className="community-search"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = query.trim().toLowerCase();
          const url = new URL(location.href);
          if (trimmed) url.searchParams.set('q', trimmed);
          else url.searchParams.delete('q');
          history.replaceState(history.state, '', url);
          void load(trimmed);
        }}
      >
        <label htmlFor="community-handle">Handle prefix</label>
        <div className="catalog-query">
          <div className="search-field">
            <Icon name="search" />
            <input
              id="community-handle"
              name="handle-prefix"
              type="search"
              autoComplete="off"
              spellCheck={false}
              value={query}
              maxLength={24}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Start of a handle…"
            />
          </div>
          <button className="button button-dark" disabled={busy}>
            Find handles
          </button>
        </div>
        <p className="section-help">Search listed handles.</p>
      </form>
      {error && (
        <div className="catalog-error" role="alert">
          <p>{error}</p>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              void load(term);
            }}
          >
            Try again
          </button>
        </div>
      )}
      {busy && (
        <p className="catalog-loading" role="status">
          Opening shared rankings…
        </p>
      )}
      {results.length > 0 && (
        <ul className="community-profiles">
          {results.map((profile) => (
            <li key={profile.uid}>
              <Avatar descriptor={profile.avatar} size={64} />
              <div className="community-profile-copy">
                <a
                  href={`/u/${profile.handle}`}
                  onClick={(event) => {
                    if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
                      event.preventDefault();
                      onOpen(profile.handle);
                    }
                  }}
                >
                  <h2>{profile.displayName}</h2>
                  <span>
                    @{profile.handle}
                    {profile.creator ? ' · Collection creator' : ''}
                  </span>
                </a>
                <h3>{profile.title}</h3>
                <p>{profile.preview.join(' · ')}</p>
              </div>
              <a
                className="text-button"
                href={`/u/${profile.handle}`}
                onClick={(event) => {
                  if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
                    event.preventDefault();
                    onOpen(profile.handle);
                  }
                }}
              >
                {profile.count} ranked
                <Icon name="arrow" width="18" height="18" />
                <span className="sr-only">Open {profile.displayName}'s ranking</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {!busy && !error && !results.length && (
        <div className="empty-state">
          <Icon name="rank" width="40" height="40" />
          <h2>{term ? 'No matching handles' : 'No listed rankings'}</h2>
          {term && <p>Try a shorter prefix.</p>}
          <button
            className="button button-dark"
            onClick={
              term
                ? () => {
                    setQuery('');
                    void load('');
                  }
                : onPublish
            }
          >
            {term ? 'Show listed profiles' : 'Publish a ranking'}
          </button>
        </div>
      )}
      {cursor && (
        <div className="extended-more">
          <span>{results.length} listed profiles loaded</span>
          <button
            className="button button-outline"
            disabled={busy}
            onClick={() => {
              void load(term, true);
            }}
          >
            Load next 20
            <Icon name="down" width="17" height="17" />
          </button>
        </div>
      )}
    </section>
  );
}
