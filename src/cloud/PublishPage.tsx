import { useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../lib/types';
import type { Member, PublicControl, PublicEntry, PublicProfile } from '../lib/community';
import { normalizeHandle, projectPublicRanking, PUBLIC_LIMIT } from '../lib/community';
import type { PersonalLibraryState } from '../lib/personal-types';
import type { AvatarDescriptor } from '../lib/avatar';
import type { AccountIdentity } from './ui-types';
import type { SocialStore } from './social-store';
import { onlineError } from './errors';
import { Avatar } from '../components/avatar/Avatar';
import { Icon } from '../components/Icon';
import { Dialog } from '../components/Dialog';

export interface PublishPageProps {
  social: Pick<SocialStore, 'control' | 'saveMember' | 'publish' | 'unpublish'>;
  identity: AccountIdentity;
  member: Member | null;
  avatar: AvatarDescriptor;
  state: PersonalLibraryState;
  games: Game[];
  existing: PublicProfile | null;
  isCreator: boolean;
  onAccount: () => void;
  onPublished: (profile: PublicProfile) => void;
}

export function PublishPage(props: PublishPageProps) {
  return <PublishDraft key={props.identity.uid} {...props} />;
}

function PublishDraft({
  social,
  identity,
  member: incomingMember,
  avatar,
  state,
  games,
  existing: incomingProfile,
  isCreator,
  onAccount,
  onPublished,
}: PublishPageProps) {
  const member = incomingMember?.uid === identity.uid ? incomingMember : null;
  const existing = incomingProfile?.uid === identity.uid ? incomingProfile : null;
  const publicIdentity = useRef(existing);
  const edited = useRef({ name: false, handle: false, title: false, listed: false });
  const [selected, setSelected] = useState<Set<string>>(() =>
    state.ranking.length <= PUBLIC_LIMIT ? new Set(state.ranking.map((entry) => entry.id)) : new Set(),
  );
  const [name, setName] = useState(existing?.displayName || member?.displayName || identity.displayName || '');
  const [handle, setHandle] = useState(existing?.handle ?? '');
  const [title, setTitle] = useState(existing?.title ?? 'My games, my order');
  const [listed, setListed] = useState(existing?.listed ?? false);
  const [consent, setConsent] = useState(false);
  const [control, setControl] = useState<PublicControl | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{
    displayName: string;
    handle: string;
    title: string;
    listed: boolean;
    avatar: AvatarDescriptor;
    entries: PublicEntry[];
    control: PublicControl;
  } | null>(null);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [limit, setLimit] = useState(30);
  let handleIssue = '';
  if (handle) {
    try {
      normalizeHandle(handle);
    } catch (cause) {
      handleIssue = onlineError(cause);
    }
  }
  useEffect(() => {
    if (existing) publicIdentity.current = existing;
    const published = publicIdentity.current;
    if (!edited.current.name) setName(published?.displayName || member?.displayName || identity.displayName || '');
    if (published) {
      if (!edited.current.handle) setHandle(published.handle);
      if (!edited.current.title) setTitle(published.title);
      if (!edited.current.listed) setListed(published.listed);
    }
  }, [existing, member?.displayName, identity.displayName]);
  useEffect(() => {
    let active = true;
    if (identity.verified)
      void social
        .control(identity.uid)
        .then((value) => {
          if (active) setControl(value);
        })
        .catch((cause) => {
          if (active) setError(onlineError(cause));
        });
    return () => {
      active = false;
    };
  }, [social, identity.uid, identity.verified]);
  const rows = useMemo(
    () =>
      state.ranking.flatMap((entry) => {
        const record = state.records[entry.id];
        return record ? [{ ...entry, title: record.title }] : [];
      }),
    [state.ranking, state.records],
  );
  const buildPreview = () => {
    try {
      if (!control) throw new Error('Wait for publication permissions before previewing.');
      if (!name.trim() || name.trim().length > 60 || !title.trim() || title.trim().length > 80)
        throw new Error('Choose a public name up to 60 characters and a ranking title up to 80 characters.');
      setPreview({
        displayName: name.trim(),
        handle: normalizeHandle(handle),
        title: title.trim(),
        listed,
        avatar,
        entries: projectPublicRanking(state, selected, games),
        control,
      });
      setConsent(false);
      setError('');
    } catch (cause) {
      setError(onlineError(cause));
    }
  };
  const publish = async () => {
    if (!preview || busy || !consent || !identity.verified) return;
    setBusy(true);
    setError('');
    try {
      await social.saveMember(
        identity.uid,
        member?.displayName || preview.displayName,
        member?.avatar ?? preview.avatar,
      );
      const result = await social.publish(identity.uid, { ...preview, creator: isCreator }, preview.control);
      onPublished(result);
    } catch (cause) {
      setError(onlineError(cause));
    } finally {
      setBusy(false);
    }
  };
  if (!identity.verified)
    return (
      <section className="app-page empty-state">
        <h1 data-page-heading tabIndex={-1}>
          Verify before publishing.
        </h1>
        <p>Your current ranking is still private. Verify your sign-in email before making a public profile.</p>
        <button className="button button-dark" onClick={onAccount}>
          Open Account
        </button>
      </section>
    );
  return (
    <section className="app-page publish-page" aria-labelledby="publish-title">
      <div className="page-heading">
        <div>
          <h1 id="publish-title" data-page-heading tabIndex={-1}>
            {existing?.published ? 'Update public ranking' : 'Publish ranking'}
          </h1>
        </div>
        <Avatar descriptor={avatar} size={80} />
      </div>
      {control?.hidden && (
        <div className="inline-error" role="alert">
          The creator has paused publishing for this profile. Deleting or renaming it will not remove that restriction.
        </div>
      )}
      {control?.deleted && (
        <div className="inline-error" role="alert">
          This account's online content was deleted. Reconnect from Account before publishing again.
        </div>
      )}
      {!rows.length ? (
        <div className="empty-state">
          <h2>A ranking comes first.</h2>
          <p>Add games and your optional scores on My rankings. Nothing has been published.</p>
          <a className="button button-dark" href="/my-rankings">
            Open My rankings
          </a>
        </div>
      ) : (
        <>
          <div className="publication-fields">
            <label>
              Public name
              <input
                name="public-name"
                autoComplete="nickname"
                required
                maxLength={60}
                value={name}
                onChange={(event) => {
                  edited.current.name = true;
                  setName(event.target.value);
                }}
                disabled={busy}
              />
            </label>
            <label>
              Unique handle<span>3-24 letters, numbers or underscores; starts with a letter.</span>
              <input
                name="public-handle"
                autoComplete="off"
                spellCheck={false}
                required
                maxLength={24}
                value={handle}
                aria-invalid={Boolean(handleIssue)}
                aria-describedby={handleIssue ? 'publication-handle-error' : undefined}
                onChange={(event) => {
                  edited.current.handle = true;
                  setHandle(event.target.value);
                }}
                disabled={busy}
                placeholder="your_handle"
              />
            </label>
            <label className="publication-title">
              Ranking title
              <input
                name="ranking-title"
                autoComplete="off"
                required
                maxLength={80}
                value={title}
                onChange={(event) => {
                  edited.current.title = true;
                  setTitle(event.target.value);
                }}
                disabled={busy}
              />
            </label>
          </div>
          {handleIssue && (
            <p id="publication-handle-error" className="inline-error" role="alert">
              {handleIssue}
            </p>
          )}
          <div className="publication-selection">
            <h2>
              {selected.size} of {PUBLIC_LIMIT} selected
            </h2>
            <div className="button-row">
              <button
                className="text-button"
                disabled={busy || rows.length > PUBLIC_LIMIT}
                onClick={() => setSelected(new Set(rows.map((entry) => entry.id)))}
              >
                Select all ranked games
              </button>
              <button className="text-button" disabled={busy} onClick={() => setSelected(new Set())}>
                Clear selection
              </button>
            </div>
          </div>
          <ol className="publish-selection-list">
            {rows.slice(0, limit).map((row, index) => (
              <li key={row.id}>
                <label className="check-control">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    disabled={busy || (!selected.has(row.id) && selected.size >= PUBLIC_LIMIT)}
                    onChange={() => {
                      setPreview(null);
                      setSelected((previous) => {
                        const next = new Set(previous);
                        if (next.has(row.id)) next.delete(row.id);
                        else next.add(row.id);
                        return next;
                      });
                    }}
                  />
                  <span>
                    <small>#{index + 1}</small>
                    {row.title}
                  </span>
                </label>
                <strong>
                  {row.score ?? '—'}
                  {row.score !== null && <small> / 10</small>}
                </strong>
              </li>
            ))}
          </ol>
          {limit < rows.length && (
            <button className="text-button" onClick={() => setLimit((value) => value + 30)}>
              Show next {Math.min(30, rows.length - limit)} ranked games
              <Icon name="down" width="17" height="17" />
            </button>
          )}
          <label className="check-control directory-consent">
            <input
              type="checkbox"
              checked={listed}
              onChange={(event) => {
                edited.current.listed = true;
                setListed(event.target.checked);
              }}
              disabled={busy}
            />
            Show in Community
          </label>
          <p className="section-help">Anyone with the link can view this, listed or not.</p>
          <button
            className="button button-dark"
            disabled={!selected.size || busy || Boolean(handleIssue) || !control || control.hidden || control.deleted}
            onClick={buildPreview}
          >
            Preview public snapshot
            <Icon name="arrow" width="18" height="18" />
          </button>
        </>
      )}
      {existing?.published && (
        <button
          className="text-button danger-text unpublish-button"
          disabled={busy}
          onClick={() => setConfirmUnpublish(true)}
        >
          Unpublish current ranking
        </button>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <Dialog
          open
          titleId="publication-preview-title"
          className="info-dialog publish-preview-dialog"
          onClose={() => {
            if (!busy) setPreview(null);
          }}
        >
          <h2 id="publication-preview-title" data-autofocus tabIndex={-1}>
            Public preview
          </h2>
          <div className="publication-identity">
            <Avatar descriptor={preview.avatar} size={64} />
            <div>
              <strong>{preview.displayName}</strong>
              <p>@{preview.handle}</p>
              <h3>{preview.title}</h3>
            </div>
          </div>
          <p>Anyone with the link can view or copy these games and scores.</p>
          <ol className="publication-preview-list">
            {preview.entries.map((row) => (
              <li key={row.id}>
                <span>
                  {row.position}. {row.title}
                  <small className="preview-source">
                    {row.year ?? 'Year not supplied'} · {row.source}
                    {row.sourceUrl && (
                      <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                        Source
                        <Icon name="up-right" width="13" height="13" />
                      </a>
                    )}
                  </small>
                </span>
                <strong>{row.score ?? '—'}</strong>
              </li>
            ))}
          </ol>
          <p className="section-help">
            {preview.listed
              ? 'This profile will also appear in Community.'
              : 'This is link-only and will not be listed in Community.'}{' '}
            This preview is frozen; later private edits are not added to it automatically.
          </p>
          <label className="check-control sync-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              disabled={busy}
            />
            <span>I want this selected snapshot to be public.</span>
          </label>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button className="button button-outline" disabled={busy} onClick={() => setPreview(null)}>
              Keep editing
            </button>
            <button
              className="button button-dark"
              disabled={!consent || busy}
              onClick={() => {
                void publish();
              }}
            >
              {busy
                ? 'Publishing snapshot…'
                : existing?.published
                  ? 'Update published ranking'
                  : 'Publish this ranking'}
            </button>
          </div>
        </Dialog>
      )}
      {confirmUnpublish && (
        <Dialog
          open
          titleId="unpublish-title"
          onClose={() => {
            if (!busy) setConfirmUnpublish(false);
          }}
          className="info-dialog"
        >
          <h2 id="unpublish-title">Unpublish this ranking?</h2>
          <p>
            New server reads stop, including the Community listing. This cannot recall screenshots or games others
            already saved.
          </p>
          <div className="button-row">
            <button
              data-autofocus
              className="button button-outline"
              disabled={busy}
              onClick={() => setConfirmUnpublish(false)}
            >
              Keep published
            </button>
            <button
              className="button button-danger"
              disabled={busy || !control}
              onClick={() => {
                if (!control) return;
                setBusy(true);
                void social
                  .unpublish(identity.uid, control)
                  .then(() => onAccount())
                  .catch((cause) => setError(onlineError(cause)))
                  .finally(() => setBusy(false));
              }}
            >
              Unpublish now
            </button>
          </div>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </Dialog>
      )}
    </section>
  );
}
