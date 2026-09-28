import { useMemo, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Member, PublicProfile } from '../lib/community';
import type { ScopedLibrary } from '../lib/cloud-types';
import { createAvatarDescriptor, generateAvatarDataUri } from '../lib/avatar';
import type { AvatarDescriptor } from '../lib/avatar';
import { cloudAuth } from './firebase-client';
import { onlineError } from './errors';
import type { SocialStore } from './social-store';
import type { AccountIdentity } from './ui-types';

const loadingAvatar: AvatarDescriptor = { version: 1, seed: '00000000000000000000000000000000', palette: 'moss' };

/**
 * The publication controller: the account's creature and name, the public identity the header and friends show, and
 * what publishing a ranking opens.
 */
export function useOnlinePublication({
  identity,
  identityRef,
  authSessionEpochRef,
  currentEpoch,
  member,
  cachedProfile,
  social,
  setMember,
  setProfile,
  refresh,
  verifiedIdentity,
  run,
  setMessage,
  onProfile,
}: {
  identity: AccountIdentity | null | undefined;
  identityRef: RefObject<AccountIdentity | null | undefined>;
  authSessionEpochRef: RefObject<number>;
  currentEpoch: RefObject<number>;
  member: Member | null;
  /** The profile the account's device copy holds, shown until the member record is read. */
  cachedProfile: ScopedLibrary['profile'] | undefined;
  social: SocialStore;
  setMember: Dispatch<SetStateAction<Member | null>>;
  setProfile: (profile: PublicProfile) => void;
  refresh: () => Promise<void>;
  verifiedIdentity: () => { user: { uid: string } };
  run: (operation: () => Promise<void>) => Promise<boolean>;
  setMessage: (message: string) => void;
  onProfile: (handle: string) => void;
}) {
  const uid = identity?.uid;
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [defaultAvatar, setDefaultAvatar] = useState(() => createAvatarDescriptor());
  // Each account has a new default creature until its member has one of its own, and never the previous one's picker.
  const [creatureUid, setCreatureUid] = useState(uid);
  if (creatureUid !== uid) {
    setCreatureUid(uid);
    setAvatarOpen(false);
    setDefaultAvatar(createAvatarDescriptor());
  }
  const avatar = member?.avatar ?? cachedProfile?.avatar ?? (uid ? defaultAvatar : loadingAvatar);
  const headerIdentity = useMemo(
    () =>
      identity
        ? {
            uid: identity.uid,
            name: member?.displayName || cachedProfile?.displayName || identity.displayName || 'Player',
            avatarSrc: generateAvatarDataUri(avatar),
          }
        : null,
    [identity, member?.displayName, cachedProfile?.displayName, avatar],
  );
  const saveName = (name: string) =>
    run(async () => {
      const { user } = verifiedIdentity();
      await social.saveMemberName(user.uid, name, avatar);
      if (cloudAuth.currentUser?.uid !== user.uid) return;
      setMember((current) => (current?.uid === user.uid ? { ...current, displayName: name } : current));
      setMessage('Name saved.');
      try {
        await refresh();
      } catch (cause) {
        if (cloudAuth.currentUser?.uid === user.uid)
          setMessage(`Name saved. Reconnect to refresh the profile. ${onlineError(cause)}`);
      }
    });
  // Saves the creature the picker chose for this account; the picker stays open, unchanged, if it cannot.
  const saveAvatar = async (owner: AccountIdentity, next: AvatarDescriptor) => {
    const uid = owner.uid;
    const epoch = currentEpoch.current;
    const sessionEpoch = authSessionEpochRef.current;
    const saved = await run(async () => {
      if (
        cloudAuth.currentUser?.uid !== uid ||
        !identityRef.current?.verified ||
        currentEpoch.current !== epoch ||
        authSessionEpochRef.current !== sessionEpoch
      )
        throw new Error('The account changed. Your new account was not modified.');
      await social.saveMemberAvatar(uid, next, member?.displayName || owner.displayName || 'Player');
      if (
        identityRef.current?.uid === uid &&
        currentEpoch.current === epoch &&
        authSessionEpochRef.current === sessionEpoch
      ) {
        setDefaultAvatar(next);
        setMember((current) => (current?.uid === uid ? { ...current, avatar: next } : current));
        try {
          await refresh();
        } catch (cause) {
          if (cloudAuth.currentUser?.uid === uid)
            setMessage(`Icon saved. Reconnect to refresh the profile. ${onlineError(cause)}`);
        }
      }
    });
    if (!saved) throw new Error('The creature could not be saved. Your previous choice is unchanged.');
    if (
      identityRef.current?.uid === uid &&
      currentEpoch.current === epoch &&
      authSessionEpochRef.current === sessionEpoch
    )
      setAvatarOpen(false);
  };
  // A ranking published by the account still signed in opens as its public profile.
  const published = (next: PublicProfile) => {
    if (cloudAuth.currentUser?.uid === next.uid) {
      setProfile(next);
      onProfile(next.handle);
    }
  };

  return { avatar, defaultAvatar, headerIdentity, avatarOpen, setAvatarOpen, saveName, saveAvatar, published };
}
export type OnlinePublication = ReturnType<typeof useOnlinePublication>;
