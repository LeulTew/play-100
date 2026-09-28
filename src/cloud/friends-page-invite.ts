import { useCallback, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { FriendInvitation, FriendSettings } from '../lib/friend-types';
import type { FriendsView } from '../lib/friend-manager';
import { invitationStatus } from '../lib/friend-manager';
import { createInviteUrl } from '../lib/invite-continuation';
import type { FriendStore } from './friend-store';
import { prepareFriendIdentity } from './friend-page-actions';
import type { OwnFriendIdentity } from './friend-page-actions';
import { committedFriendChange, committedFriendMessage, friendMutationError } from './friend-outcomes';

/**
 * The invite dialog: creating a one-use link, then showing, copying or sharing it. Closing the dialog or navigating
 * away keeps a late link from appearing; a link created after the dialog closed is reported in the page message.
 */
export function useInviteDialog({
  store,
  identity,
  onSettings,
  current,
  refreshRequired,
  runningRef,
  navigationVersionRef,
  currentViewRef,
  setWorking,
  setError,
  setMessage,
  setRefreshRequired,
}: {
  store: FriendStore;
  identity: OwnFriendIdentity;
  onSettings: (settings: FriendSettings) => void;
  current: () => boolean;
  refreshRequired: boolean;
  runningRef: RefObject<boolean>;
  navigationVersionRef: RefObject<number>;
  currentViewRef: RefObject<FriendsView>;
  setWorking: (value: boolean) => void;
  setError: (value: string) => void;
  setMessage: (value: string) => void;
  setRefreshRequired: (value: boolean) => void;
}) {
  const uid = identity.uid;
  const [link, setLink] = useState<FriendInvitation | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const inviteVisible = useRef(false);
  const [copyState, setCopyState] = useState('');
  const dismissInvite = useCallback(() => {
    if (inviteVisible.current) {
      inviteVisible.current = false;
      setInviteOpen(false);
      setLink(null);
    }
  }, []);
  const createInvitation = async (reloadInvites: () => Promise<boolean>) => {
    if (runningRef.current || refreshRequired || !current()) return;
    const navigation = navigationVersionRef.current;
    runningRef.current = true;
    inviteVisible.current = true;
    setInviteOpen(true);
    setCreatingInvite(true);
    setLink(null);
    setCopyState('');
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const settings = await prepareFriendIdentity(store, identity);
      if (!current() || navigationVersionRef.current !== navigation || !inviteVisible.current) return;
      onSettings(settings);
      const invite = await store.createInvite(uid);
      if (!current() || navigationVersionRef.current !== navigation) return;
      if (inviteVisible.current) setLink(invite);
      else setMessage('Invitation created. Find it in Invite links.');
      if (currentViewRef.current === 'invites') void reloadInvites();
    } catch (cause) {
      if (!current() || navigationVersionRef.current !== navigation) return;
      const committed = committedFriendChange(cause, uid);
      setError(committed ? committedFriendMessage(committed) : friendMutationError(cause));
      setRefreshRequired(true);
    } finally {
      runningRef.current = false;
      if (current()) {
        setWorking(false);
        setCreatingInvite(false);
      }
    }
  };
  const closeInvite = () => {
    inviteVisible.current = false;
    setInviteOpen(false);
    setLink(null);
    setCopyState('');
    if (creatingInvite) setMessage('Creation may still finish. Check Invite links before making another.');
  };
  const shareLink = async (invite: FriendInvitation, native: boolean) => {
    if (!current()) return;
    if (invitationStatus(invite, Date.now()) !== 'Active') {
      setError('This invitation is no longer active. Refresh the links.');
      return;
    }
    const url = createInviteUrl(invite.token);
    try {
      if (native && navigator.share) await navigator.share({ title: 'Play 100 invitation', url });
      else {
        await navigator.clipboard.writeText(url);
        if (current()) setCopyState('Link copied.');
      }
    } catch (cause) {
      if (!current() || (cause instanceof Error && cause.name === 'AbortError')) return;
      setLink(invite);
      setInviteOpen(true);
      inviteVisible.current = true;
      setCopyState('Copy the invitation from the field below.');
    }
  };
  return {
    link,
    setLink,
    inviteOpen,
    creatingInvite,
    copyState,
    setCopyState,
    dismissInvite,
    createInvitation,
    closeInvite,
    shareLink,
  };
}
