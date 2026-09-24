import { useEffect, useRef, useState } from 'react';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Game } from '../lib/types';
import type { PublicEntry, PublicProfile } from '../lib/community';
import { recordFromPublic } from '../lib/community';
import type { LibraryController } from '../lib/library-controller';
import type { LibraryRecord } from '../lib/personal-types';
import type { AccountIdentity } from './ui-types';
import { Avatar } from '../components/avatar/Avatar';
import { Icon } from '../components/Icon';
import { Dialog } from '../components/Dialog';
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

// A generic span cannot carry an accessible name, so the visual score is hidden and spoken as a phrase instead.
export function PublicScore({ score }: { score: number | null }) {
  return (
    <span className="public-score">
      <span aria-hidden="true">
        {score ?? '—'}
        {score !== null && <small> / 10</small>}
      </span>
      <span className="sr-only">{score === null ? 'No personal score' : `Publisher rating ${score} out of 10`}</span>
    </span>
  );
}

export function PublicProfilePage({
  social,
  handle,
  games,
  library,
  identity,
  onOpenRecord,
  onShare,
  onAccount,
  onFriend,
}: {
  social: SocialStore;
  handle: string;
  games: Game[];
  library: LibraryController;
  identity: AccountIdentity | null;
  onOpenRecord: (record: LibraryRecord) => void;
  onShare: (title: string, url: string) => void;
  onAccount: () => void;
  onFriend: (uid: string) => void;
}) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [entries, setEntries] = useState<PublicEntry[]>([]);
  const [visible, setVisible] = useState(30);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let canceled = false;
    setBusy(true);
    setError('');
    setSelected(new Set());
    setVisible(30);
    setEntries([]);
    setProfile(null);
    void (async () => {
      const value = await social.profile(handle);
      const ranking = value ? await social.entries(value) : [];
      if (!canceled) {
        setProfile(value);
        setEntries(ranking);
      }
    })()
      .catch((cause) => {
        if (!canceled) setError(onlineError(cause));
      })
      .finally(() => {
        if (!canceled) setBusy(false);
      });
    return () => {
      canceled = true;
    };
  }, [social, handle, retry]);
  const save = async (values: PublicEntry[]) => {
    try {
      const records = values.map((entry) => recordFromPublic(entry, games));
      if (await library.perform({ type: 'set-progress', records, key: 'later', value: true })) {
        setMessage(
          `${records.length} ${records.length === 1 ? 'game added' : 'games added'} to your play queue. The publisher's scores were not copied.`,
        );
        setSelected(new Set());
      } else setError('These games could not be saved. Your previous library is unchanged; check the storage warning.');
    } catch (cause) {
      setError(onlineError(cause));
    }
  };
  if (busy && !profile)
    return (
      <section className="app-page page-loading" role="status">
        <h1>Opening this ranking…</h1>
        <p>Only explicitly published content is requested.</p>
      </section>
    );
  if (!profile)
    return (
      <section className="app-page empty-state">
        <h1 data-page-heading tabIndex={-1}>
          {error ? "This ranking couldn't load." : 'This ranking is not available.'}
        </h1>
        <p>
          {error ||
            'The link may be wrong, unpublished or hidden. Private libraries are never substituted for a missing public ranking.'}
        </p>
        {error && (
          <button className="button button-dark" onClick={() => setRetry((value) => value + 1)}>
            Try again
          </button>
        )}
        <a className="text-button" href="/community">
          Back to Community
          <Icon name="back" width="17" height="17" />
        </a>
      </section>
    );
  return (
    <section className="app-page public-profile-page" aria-labelledby="public-ranking-title">
      <div className="public-profile-heading">
        <Avatar descriptor={profile.avatar} size={80} />
        <div>
          <p>
            {profile.displayName} <span>@{profile.handle}</span>
            {profile.creator && <strong className="creator-badge">Collection creator</strong>}
          </p>
          <h1 id="public-ranking-title" data-page-heading tabIndex={-1}>
            {profile.title}
          </h1>
          <p className="section-help">
            Personal preferences, not an official ranking. Published{' '}
            {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(profile.updatedAt)}.
          </p>
        </div>
        <button
          className="button button-outline"
          onClick={() =>
            onShare(`${profile.title} by ${profile.displayName}`, `${location.origin}/u/${profile.handle}`)
          }
        >
          <Icon name="share" width="18" height="18" />
          Share
        </button>
      </div>
      <div className="public-ranking-tools">
        <p>
          {entries.length} games in this published snapshot. Saving adds games to your library, not their ratings or
          play history.
        </p>
        <div className="button-row">
          <button
            className="text-button"
            onClick={() =>
              setSelected(selected.size === entries.length ? new Set() : new Set(entries.map((entry) => entry.id)))
            }
          >
            {selected.size === entries.length ? 'Clear selection' : `Select all ${entries.length}`}
          </button>
          <button
            className="button button-dark"
            disabled={!selected.size || library.busy}
            onClick={() => {
              void save(entries.filter((entry) => selected.has(entry.id)));
            }}
          >
            Save {selected.size || 'selected'} for later
            <Icon name="bookmark" width="18" height="18" />
          </button>
        </div>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="account-notice" role="status">
          {message}
        </p>
      )}
      <ol className="public-ranking-list">
        {entries.slice(0, visible).map((entry) => (
          <li key={entry.id}>
            <label className="select-control">
              <input
                type="checkbox"
                aria-label={`Select ${entry.title}`}
                checked={selected.has(entry.id)}
                onChange={() =>
                  setSelected((previous) => {
                    const next = new Set(previous);
                    if (next.has(entry.id)) next.delete(entry.id);
                    else next.add(entry.id);
                    return next;
                  })
                }
              />
            </label>
            <span className="public-position">{String(entry.position).padStart(2, '0')}</span>
            <div className="public-game">
              <button
                className="record-title"
                onClick={() => {
                  try {
                    onOpenRecord(recordFromPublic(entry, games));
                  } catch (cause) {
                    setError(onlineError(cause));
                  }
                }}
              >
                {entry.title}
              </button>
              <p>
                {entry.year ?? 'Year not supplied'}
                {entry.source === 'collection'
                  ? ' · From the original 100'
                  : ` · ${entry.source === 'manual' ? 'Added by the publisher' : entry.source}`}
              </p>
              {entry.sourceUrl && (
                <a href={entry.sourceUrl} target="_blank" rel="noreferrer">
                  Source
                  <Icon name="up-right" width="13" height="13" />
                </a>
              )}
            </div>
            <PublicScore score={entry.score} />
            <button
              className="icon-button"
              disabled={library.busy || Boolean(library.state.progress[entry.id]?.later)}
              aria-label={`${library.state.progress[entry.id]?.later ? 'Already saved' : 'Save for later'}: ${entry.title}`}
              onClick={() => {
                void save([entry]);
              }}
            >
              <Icon name={library.state.progress[entry.id]?.later ? 'check' : 'bookmark'} width="20" height="20" />
            </button>
          </li>
        ))}
      </ol>
      {visible < entries.length && (
        <button className="button button-outline public-more" onClick={() => setVisible((value) => value + 30)}>
          Show {Math.min(30, entries.length - visible)} more games
          <Icon name="down" width="17" height="17" />
        </button>
      )}
      <div className="public-profile-footer">
        <p>Published snapshots update only when their owner chooses.</p>
        {identity?.uid !== profile.uid && (
          <div className="button-row">
            <button className="text-button" onClick={() => onFriend(profile.uid)}>
              Connect with this player
            </button>
            <button
              className="text-button"
              onClick={() => {
                if (identity?.verified) setReporting(true);
                else onAccount();
              }}
            >
              Report profile
            </button>
          </div>
        )}
      </div>
      {reporting && (
        <Dialog open titleId="report-profile-title" onClose={() => setReporting(false)} className="info-dialog">
          <h2 id="report-profile-title" data-autofocus tabIndex={-1}>
            Report this profile
          </h2>
          <p>The creator can review one report per account and profile. A report does not automatically hide anyone.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!identity?.verified) return;
              setBusy(true);
              void social
                .report(identity.uid, profile.uid, reason)
                .then(() => {
                  setReporting(false);
                  setMessage('Your report was submitted for the creator to review.');
                })
                .catch((cause) => setError(onlineError(cause)))
                .finally(() => setBusy(false));
            }}
          >
            <label htmlFor="profile-report-reason">What needs attention?</label>
            <textarea
              id="profile-report-reason"
              name="report-reason"
              autoComplete="off"
              rows={4}
              required
              maxLength={400}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <p className="section-help">Do not include private contact details or sensitive information.</p>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <button className="button button-dark" disabled={busy}>
              Submit report
            </button>
          </form>
        </Dialog>
      )}
    </section>
  );
}
