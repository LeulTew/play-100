import { EmailAuthProvider } from 'firebase/auth';
import { hasProvider } from './account-providers';
import { Dialog } from '../components/Dialog';

import type { AccountPageProps } from './AccountPage';
import type { AccountPageModel } from './useAccountPage';

export function AccountConfirmation({ props, model }: { props: AccountPageProps; model: AccountPageModel }) {
  const { busy, identity, cancelledRegistration = false, error } = props;
  const { confirmation, closeConfirmation, password, setPassword, googleConfirmation, googleConfirmed, confirm } =
    model;
  return (
    confirmation && (
      <Dialog
        open
        titleId="account-confirm-title"
        onClose={() => {
          if (!busy) closeConfirmation();
        }}
        className="info-dialog"
      >
        <h2 id="account-confirm-title">
          {confirmation === 'signout-device'
            ? "Remove this device's account copy?"
            : confirmation === 'pause'
              ? 'Stop online saving?'
              : confirmation === 'remote'
                ? 'Use the online copy?'
                : confirmation === 'local'
                  ? 'Replace the online copy?'
                  : confirmation === 'delete-copy'
                    ? 'Delete your online copy?'
                    : cancelledRegistration
                      ? 'Remove cancelled sign-in?'
                      : identity.verified
                        ? 'Delete your account?'
                        : 'Cancel this registration?'}
        </h2>
        {cancelledRegistration && confirmation === 'delete-account' && (
          <p>
            This removes the cancelled sign-in and its account copy on this device. You can then register again with the
            same email. Your guest library stays here.
          </p>
        )}
        {identity.verified && !cancelledRegistration && confirmation.startsWith('delete') && (
          <p>If deletion is interrupted, your account stays and you can finish from this page later.</p>
        )}
        <p>
          {confirmation === 'signout-device'
            ? 'Sign out and remove only this account copy, its recovery data and sharing caches from this device. Your guest library and online copy are not deleted. Unsynced or newly changed data prevents removal.'
            : confirmation === 'pause'
              ? 'Uploads stop on all devices. Your saved copies remain available.'
              : confirmation === 'remote'
                ? "Replace this account's device library with the online copy. A recovery copy stays here."
                : confirmation === 'local'
                  ? 'Replace the online library with this device copy. A newer update will require another choice.'
                  : !identity.verified
                    ? 'Cancel only if this registration has no prior online activity. Your device-only library stays here.'
                    : 'Remove online profile and library data, unpublish its ranking and stop older sessions from restoring it. Export a backup first. Your guest library stays here.'}
        </p>
        {(confirmation === 'delete-copy' || confirmation === 'delete-account') &&
          hasProvider(identity, EmailAuthProvider.PROVIDER_ID) && (
            <>
              <label htmlFor="confirm-account-password">Confirm your password</label>
              <input
                id="confirm-account-password"
                name="current-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
            </>
          )}
        {googleConfirmation && (
          <p className="section-help">
            {googleConfirmed
              ? 'Google confirmed this account. Confirm below to delete.'
              : 'Confirm with Google in this tab, then return here. Returning does not delete anything.'}
          </p>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button data-autofocus className="button button-outline" disabled={busy} onClick={closeConfirmation}>
            Keep my data
          </button>
          <button
            className={`button ${confirmation.startsWith('delete') || confirmation === 'signout-device' ? 'button-danger' : 'button-dark'}`}
            disabled={busy}
            onClick={() => {
              void confirm();
            }}
          >
            {busy
              ? 'Working…'
              : confirmation === 'signout-device'
                ? 'Sign out and remove copy'
                : googleConfirmation && !googleConfirmed
                  ? 'Continue in this tab'
                  : confirmation.startsWith('delete')
                    ? 'Confirm deletion'
                    : 'Confirm this choice'}
          </button>
        </div>
      </Dialog>
    )
  );
}
