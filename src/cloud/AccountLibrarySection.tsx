import { Icon } from '../components/Icon';
import { DataUseLink } from '../components/DataUseLink';
import { SYNC_LABELS } from '../lib/cloud-types';

import type { AccountPageProps } from './AccountPage';
import type { AccountPageModel } from './useAccountPage';

export function AccountLibrarySection({ props, model }: { props: AccountPageProps; model: AccountPageModel }) {
  const {
    identity,
    status,
    busy,
    onRefreshIdentity,
    resendIn,
    onVerify,
    remoteReady,
    head,
    deletionState = 'checking',
    cache,
    onConnect,
    cancelledRegistration = false,
    error,
    message,
    onRetry,
    onDownload,
    cleanupWarning,
    onCleanup,
  } = props;
  const {
    active,
    validName,
    validChoice,
    selected,
    name,
    choices,
    replacing,
    localGames,
    setChoice,
    setConfirmation,
    setConflictVersion,
  } = model;
  return (
    <div className="account-primary">
      <section className="sync-panel" aria-labelledby="sync-title">
        <div className="section-title-line">
          <h2 id="sync-title">Online saving</h2>
          <span className={`sync-state sync-${status}`} role="status">
            {identity.verified
              ? SYNC_LABELS[status]
              : identity.verificationPending
                ? 'Sign-in needs attention'
                : 'Verify your email'}
          </span>
        </div>
        {identity.verificationPending ? (
          <button
            className="button button-outline"
            disabled={busy}
            onClick={() => {
              void onRefreshIdentity();
            }}
          >
            Retry sign-in check
          </button>
        ) : !identity.verified ? (
          <div className="button-row">
            <button
              className="button button-dark"
              disabled={busy || resendIn > 0}
              onClick={() => {
                void onVerify();
              }}
            >
              {resendIn ? `Resend in ${resendIn}s` : 'Send verification email'}
            </button>
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => {
                void onRefreshIdentity();
              }}
            >
              I verified my email
            </button>
          </div>
        ) : !active ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (validName() && validChoice && remoteReady && cache && !busy) void onConnect(selected, name.trim());
            }}
          >
            {head && (!head.enabled || head.deleted) && (
              <p className="account-notice">
                {head.deleted ? (
                  <>
                    Online saving is off because you deleted your online copy. Turning it on starts a new online copy.
                    {deletionState !== 'complete' && " It doesn't finish the earlier deletion."}
                  </>
                ) : (
                  'Online saving is stopped. Turn it on below when you want to save online again.'
                )}
              </p>
            )}
            {!remoteReady ? (
              <p role="status">Checking saved copies…</p>
            ) : choices.length === 1 ? (
              <p className="connection-source">
                <strong>{choices[0]?.label}</strong>
                <span>{choices[0]?.detail}</span>
              </p>
            ) : (
              <fieldset className="connect-choices" disabled={busy}>
                <legend>Start with</legend>
                {choices.map((item) => (
                  <label key={item.value}>
                    <input
                      type="radio"
                      name="connection-copy"
                      value={item.value}
                      checked={selected === item.value}
                      onChange={() => setChoice(item.value)}
                    />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {!validChoice && remoteReady && (
              <p className="inline-error" role="alert">
                That source changed. Choose a copy again.
              </p>
            )}
            {replacing && (
              <p className="section-help">This replaces your online library. The device original stays here.</p>
            )}
            <p className="consent-summary">
              The creator can see your profile and ranking summary. <DataUseLink />
            </p>
            <p className="section-help">
              New setups share saved games and rankings with accepted friends. Existing sharing choices stay unchanged;
              notes, Play later and history stay private.
            </p>
            <button
              className="button button-dark"
              disabled={busy || cancelledRegistration || !cache || !remoteReady || !validChoice}
              type="submit"
            >
              {busy ? 'Connecting…' : replacing ? 'Agree & replace online' : 'Agree & enable'}
              <Icon name="arrow" width="18" height="18" />
            </button>
          </form>
        ) : (
          <>
            <p className="account-counts">
              {localGames} {localGames === 1 ? 'game' : 'games'} · {cache?.state.queueOrder.length ?? 0} in Play later ·{' '}
              {cache?.state.ranking.length ?? 0} ranked
            </p>
            {cache?.sync.lastSyncedAt && (
              <p className="account-smallprint">
                Last saved:{' '}
                {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
                  cache.sync.lastSyncedAt,
                )}
              </p>
            )}
            <div className="button-row">
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() => {
                  void onRetry();
                }}
              >
                Sync now
                <Icon name="arrow" width="17" height="17" />
              </button>
              <button className="text-button" disabled={busy} onClick={() => setConfirmation('pause')}>
                Stop online saving
              </button>
            </div>
          </>
        )}
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
        {error && !active && identity.verified && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              void onRetry();
            }}
          >
            Retry account check
          </button>
        )}
        {status === 'conflict' && (
          <div className="conflict-choices">
            <h3>Choose a copy</h3>
            <p>Both copies are kept until you choose. Download them before replacing either.</p>
            <div className="button-row">
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() => {
                  void onDownload('local');
                }}
              >
                Download device copy
              </button>
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() => {
                  void onDownload('online');
                }}
              >
                Download online copy
              </button>
            </div>
            <div className="button-row">
              <button
                className="text-button"
                disabled={busy || !head || !cache}
                onClick={() => {
                  if (head && cache) {
                    setConflictVersion({ head, localRevision: cache.state.revision });
                    setConfirmation('remote');
                  }
                }}
              >
                Use online copy
              </button>
              <button
                className="text-button"
                disabled={busy || !head || !cache}
                onClick={() => {
                  if (head && cache) {
                    setConflictVersion({ head, localRevision: cache.state.revision });
                    setConfirmation('local');
                  }
                }}
              >
                Use device copy online
              </button>
            </div>
          </div>
        )}
        {cleanupWarning && (
          <div className="cleanup-note">
            <p role="status">{cleanupWarning}</p>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                void onCleanup();
              }}
            >
              Retry cleanup
            </button>
          </div>
        )}
      </section>
      <details className="account-section account-backups" open={Boolean(error || status === 'conflict')}>
        <summary>Backups</summary>
        <div className="button-row">
          <button
            className="button button-outline"
            disabled={busy}
            onClick={() => {
              void onDownload('all');
            }}
          >
            <Icon name="download" width="18" height="18" />
            Export account data
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              void onDownload('guest');
            }}
          >
            Export device-only library
          </button>
        </div>
      </details>
    </div>
  );
}
