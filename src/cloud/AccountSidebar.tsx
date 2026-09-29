import { GoogleAuthProvider } from 'firebase/auth';
import { hasProvider } from './account-providers';
import { Icon } from '../components/Icon';

import type { AccountPageProps } from './AccountPage';
import type { AccountPageModel } from './useAccountPage';

export function AccountSidebar({ props, model }: { props: AccountPageProps; model: AccountPageModel }) {
  const {
    busy,
    identity,
    cache,
    onName,
    onLinkGoogle,
    sharedGames,
    friendsSharing,
    onFriends,
    onCompare,
    onPublish,
    onCommunity,
    isCreator,
    onCreator,
    head,
  } = props;
  const {
    nameEdited,
    validName,
    name,
    setNameEdited,
    nameInput,
    nameError,
    setDraftName,
    setNameError,
    setConfirmation,
  } = model;
  return (
    <aside className="account-secondary">
      <section className="account-section">
        <h2>Profile</h2>
        <form
          className="account-name-form"
          data-unsaved={nameEdited ? 'true' : 'false'}
          onSubmit={(event) => {
            event.preventDefault();
            if (validName())
              void onName(name.trim()).then((saved) => {
                if (saved) setNameEdited(false);
              });
          }}
        >
          <label htmlFor="account-name">Name</label>
          <input
            ref={nameInput}
            id="account-name"
            name="nickname"
            autoComplete="nickname"
            maxLength={60}
            required
            value={name}
            disabled={busy || !identity.verified}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? 'account-name-error' : undefined}
            onChange={(event) => {
              setNameEdited(true);
              setDraftName(event.target.value);
              setNameError('');
            }}
          />
          {nameError && (
            <p id="account-name-error" className="inline-error" role="alert">
              {nameError}
            </p>
          )}
          <button className="text-button" disabled={busy || !identity.verified || !cache}>
            Save name
          </button>
        </form>
        {!hasProvider(identity, GoogleAuthProvider.PROVIDER_ID) && (
          <button
            className="text-button"
            disabled={busy || !identity.verified}
            onClick={() => {
              void onLinkGoogle();
            }}
          >
            Link Google
          </button>
        )}
      </section>
      <section className="account-section">
        <h2>Sharing</h2>
        {sharedGames}
        {friendsSharing}
        {onFriends && (
          <button className="text-button" onClick={onFriends}>
            Friends
            <Icon name="arrow" width="17" height="17" />
          </button>
        )}
        {onCompare && (
          <button className="text-button" onClick={onCompare}>
            Compare rankings
            <Icon name="arrow" width="17" height="17" />
          </button>
        )}
        <button className="text-button" onClick={onPublish}>
          Publish ranking
          <Icon name="share" width="17" height="17" />
        </button>
        <button className="text-button" onClick={onCommunity}>
          Community
          <Icon name="arrow" width="17" height="17" />
        </button>
        {isCreator && (
          <button className="text-button" onClick={onCreator}>
            Creator desk
            <Icon name="arrow" width="17" height="17" />
          </button>
        )}
      </section>
      {!head?.deleted && (
        <details className="account-danger">
          <summary>{identity.verified ? 'Delete data or account' : 'Cancel registration'}</summary>
          {identity.verified && (
            <button className="text-button danger-text" disabled={busy} onClick={() => setConfirmation('delete-copy')}>
              Delete online copy
            </button>
          )}
          <button className="text-button danger-text" disabled={busy} onClick={() => setConfirmation('delete-account')}>
            {identity.verified ? 'Delete account' : 'Delete unused registration'}
          </button>
        </details>
      )}
    </aside>
  );
}
