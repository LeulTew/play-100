import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { FriendInvitePreview, FriendSettings } from '../lib/friend-types';
import { clearInviteContinuation, saveInviteContinuation } from '../lib/invite-continuation';
import type { FriendStore } from './friend-store';
import { cloudAuth } from './firebase-client';
import { onlineError } from './errors';
import { syncFailure } from '../lib/sync-retry';
import { committedFriendChange, committedFriendMessage, friendMutationError } from './friend-outcomes';
import { Avatar } from '../components/avatar/Avatar';
import { DataUseLink } from '../components/DataUseLink';
import { prepareFriendIdentity } from './friend-page-actions';
import type { OwnFriendIdentity } from './friend-page-actions';

export function InvitationPage({
  store,
  invitation,
  identity,
  authPanel,
  onAccount,
  onFriends,
  onSettings,
}: {
  store: FriendStore;
  invitation: { capability: string | null; error: string };
  identity: OwnFriendIdentity | null;
  authPanel: ReactNode;
  onAccount: () => void;
  onFriends: () => void;
  onSettings: (settings: FriendSettings) => void;
}) {
  const [preview, setPreview] = useState<FriendInvitePreview | null>(null);
  const [error, setError] = useState(invitation.error);
  const [busy, setBusy] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(false);
  const [retry, setRetry] = useState(0);
  const activeUid = useRef(identity?.uid);
  activeUid.current = identity?.uid;
  const activeCapability = useRef(invitation.capability);
  activeCapability.current = invitation.capability;
  const acceptanceLease = useRef<symbol | null>(null);
  useEffect(() => {
    acceptanceLease.current = null;
    activeUid.current = identity?.uid;
    activeCapability.current = invitation.capability;
    setAccepting(false);
    setDone(false);
    return () => {
      acceptanceLease.current = null;
      activeUid.current = undefined;
      activeCapability.current = null;
    };
  }, [identity?.uid, invitation.capability]);
  useEffect(() => {
    let alive = true;
    setPreview(null);
    setBusy(true);
    setDone(false);
    setError(invitation.error);
    if (!invitation.capability) {
      setBusy(false);
      return;
    }
    void store
      .previewInvite(invitation.capability)
      .then((value) => {
        if (alive) setPreview(value);
      })
      .catch((cause) => {
        if (!alive) return;
        setError(onlineError(cause));
        const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : '';
        if (syncFailure(cause) === 'blocked' && code !== 'offline')
          clearInviteContinuation(invitation.capability ?? undefined);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [store, invitation.capability, invitation.error, identity?.uid, retry]);
  const accept = async () => {
    if (!identity || !preview || !invitation.capability || accepting || acceptanceLease.current) return;
    const uid = identity.uid;
    const capability = invitation.capability;
    const lease = Symbol('invite-acceptance');
    acceptanceLease.current = lease;
    setAccepting(true);
    setError('');
    try {
      const settings = await prepareFriendIdentity(store, identity);
      if (
        activeUid.current !== uid ||
        cloudAuth.currentUser?.uid !== uid ||
        activeCapability.current !== capability ||
        acceptanceLease.current !== lease
      )
        throw new Error('The account or invitation changed. Review it again.');
      onSettings(settings);
      await store.acceptInvite(uid, capability);
      if (activeUid.current === uid && activeCapability.current === capability && acceptanceLease.current === lease) {
        clearInviteContinuation(capability);
        setDone(true);
        setPreview(null);
      }
    } catch (cause) {
      if (activeUid.current !== uid || activeCapability.current !== capability || acceptanceLease.current !== lease)
        return;
      const committed = committedFriendChange(cause, uid);
      if (committed?.receipt.operation === 'accept-invite') {
        clearInviteContinuation(capability);
        setDone(true);
        setPreview(null);
      } else setError(committed ? committedFriendMessage(committed) : friendMutationError(cause));
    } finally {
      if (acceptanceLease.current === lease) {
        acceptanceLease.current = null;
        setAccepting(false);
      }
    }
  };
  return (
    <section className="app-page invitation-page">
      <h1 data-page-heading tabIndex={-1}>
        Invitation
      </h1>
      {busy ? (
        <p role="status">Opening invitation…</p>
      ) : done ? (
        <>
          <h2>You're connected</h2>
          <button className="button button-dark" onClick={onFriends}>
            Open Friends
          </button>
        </>
      ) : preview ? (
        <>
          <div className="friend-identity">
            <Avatar descriptor={preview.avatar} size={80} />
            <div>
              <h2>{preview.displayName}</h2>
              <p>Invites you to connect.</p>
            </div>
          </div>
          <p className="section-help">
            One use. Expires {new Date(preview.expiresAt).toLocaleString()}. Accepted friends see games and rankings
            allowed by your sharing mode; notes and play history stay private.
          </p>
          {identity ? (
            <div className="invite-acceptance">
              <div className="friend-identity">
                <Avatar descriptor={identity.avatar} size={48} />
                <span>Accept as {identity.displayName}</span>
              </div>
              {identity.uid === preview.ownerUid ? (
                <p>This is your own invitation.</p>
              ) : identity.verified ? (
                <button
                  className="button button-dark"
                  disabled={accepting}
                  onClick={() => {
                    void accept();
                  }}
                >
                  {accepting ? 'Accepting…' : 'Accept invitation'}
                </button>
              ) : (
                <button className="button button-dark" onClick={onAccount}>
                  Verify your account
                </button>
              )}
            </div>
          ) : (
            <>
              <p>Sign in, then choose whether to accept.</p>
              {invitation.capability && invitation.error && (
                <button
                  className="text-button"
                  onClick={() => {
                    try {
                      saveInviteContinuation(invitation.capability!);
                      setError('');
                    } catch (cause) {
                      setError(onlineError(cause));
                    }
                  }}
                >
                  Retry invitation storage
                </button>
              )}
              {authPanel}
            </>
          )}
        </>
      ) : (
        <>
          <h2>Invitation unavailable</h2>
          <p>It may have expired, been used or been revoked. Ask for a new link.</p>
          <button className="text-button" onClick={() => setRetry((value) => value + 1)}>
            Try again
          </button>
        </>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <DataUseLink />
    </section>
  );
}
