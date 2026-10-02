import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { AppPage } from '../lib/types';
import type { LibraryController } from '../lib/library-controller';
import type { Member, PublicProfile } from '../lib/community';
import type { SyncHead } from '../lib/cloud-types';
import { accountScope } from '../lib/cloud-types';
import {
  cacheScopedProfile,
  isInitialAccountCache,
  loadScopedLibrary,
  restoreConsentedAccount,
  scopedWriter,
} from '../lib/scoped-library';
import { syncFailure } from '../lib/sync-retry';
import { useAccountLibrary } from '../hooks/useAccountLibrary';
import { hasPendingEdits } from '../hooks/useExitSave';
import { cloudAuth, cloudDb, firebaseApp } from './firebase-client';
import { creatorAccess } from './cloud-store';
import type { CloudStore } from './cloud-store';
import { SocialStore } from './social-store';
import { useCloudSync } from './useCloudSync';
import { onlineError } from './errors';
import { readAccountLifecycle } from './account-lifecycle';
import { useAccountDeletionState, useDeletionProbe } from './account-deletion';
import type { AccountIdentity } from './ui-types';

/**
 * The signed-in account's online state: its device copy and private online saving, the member record, public profile,
 * online head and creator access that Account previews, its registration state, and its deletion state.
 */
export function useOnlineAccount({
  page,
  identity,
  identityRef,
  authGeneration,
  guest,
  busy,
  setError,
  setMessage,
}: {
  page: AppPage;
  identity: AccountIdentity | null | undefined;
  identityRef: RefObject<AccountIdentity | null | undefined>;
  /** The auth session generation this render belongs to. */
  authGeneration: number;
  guest: LibraryController;
  busy: boolean;
  setError: (message: string) => void;
  setMessage: (message: string) => void;
}) {
  const uid = identity?.uid;
  const [memberSnapshot, setMember] = useState<Member | null>(null);
  const memberReadVersion = useRef(0);
  const [profileSnapshot, setProfile] = useState<PublicProfile | null>(null);
  const [headSnapshot, setHeadSnapshot] = useState<{ uid: string; value: SyncHead | null } | null>(null);
  const [creatorUid, setCreatorUid] = useState<string | null>(null);
  const [cancelledUid, setCancelledUid] = useState<string | null>(null);
  const deletion = useAccountDeletionState();
  const setDeletionApproval = deletion.setApproval;
  // Each account starts afresh: nothing the previous one loaded or was approved carries over, and its registration
  // state is unknown until it is read.
  const [recordsUid, setRecordsUid] = useState(uid);
  if (recordsUid !== uid) {
    setRecordsUid(uid);
    setMember(null);
    setProfile(null);
    setHeadSnapshot(null);
    setCreatorUid(null);
    setCancelledUid(null);
    setDeletionApproval(null);
  }
  const member = memberSnapshot?.uid === uid ? memberSnapshot : null;
  const profile = profileSnapshot?.uid === uid ? profileSnapshot : null;
  const head = headSnapshot?.uid === uid ? (headSnapshot?.value ?? null) : null;
  const isCreator = Boolean(identity?.verified && creatorUid === identity.uid);
  useEffect(() => {
    let current = true;
    if (uid)
      void readAccountLifecycle(cloudDb, uid)
        .then((state) => {
          if (current && cloudAuth.currentUser?.uid === uid) setCancelledUid(state === 'cancelled' ? uid : null);
        })
        .catch((cause) => {
          if (current && cloudAuth.currentUser?.uid === uid) setError(onlineError(cause));
        });
    return () => {
      current = false;
    };
  }, [uid, setError]);
  const scope = useMemo(() => (uid ? accountScope(uid, firebaseApp.options.projectId) : null), [uid]);
  const identityIsCurrent = useCallback(() => cloudAuth.currentUser?.uid === uid, [uid]);
  const account = useAccountLibrary(scope, guest.state.motion, identityIsCurrent, authGeneration);
  const writer = account.writer;
  const refreshAccount = account.refresh;
  const social = useMemo(() => new SocialStore(cloudDb), []);
  const restoreInitial = useCallback(
    async (store: CloudStore, isCurrent: () => boolean) => {
      if (!writer || !uid || !isCurrent()) return;
      const local = await loadScopedLibrary(writer);
      if (!isCurrent() || !isInitialAccountCache(local)) return;
      const [savedMember, savedHead] = await Promise.all([social.member(uid), store.head()]);
      if (!isCurrent()) return;
      setMember(savedMember);
      setHeadSnapshot({ uid, value: savedHead });
      if (
        !savedMember ||
        savedMember.consentVersion !== 1 ||
        !savedHead?.enabled ||
        savedHead.deleted ||
        !savedHead.current
      )
        return;
      const incoming = await store.download(savedHead, false, isCurrent);
      if (!incoming) throw new Error('The online copy is incomplete. Choose a copy or try again.');
      const fresh = await store.head();
      if (!isCurrent()) return;
      if (
        !fresh?.enabled ||
        fresh.deleted ||
        fresh.epoch !== savedHead.epoch ||
        fresh.revision !== savedHead.revision ||
        fresh.current?.digest !== savedHead.current.digest
      ) {
        setHeadSnapshot({ uid, value: fresh });
        if (!fresh?.enabled || fresh.deleted) return;
        throw Object.assign(new Error('The online copy changed during restoration. Checking again automatically.'), {
          code: 'aborted',
        });
      }
      await restoreConsentedAccount(writer, incoming, fresh, savedMember, () => isCurrent() && !hasPendingEdits());
      if (isCurrent()) {
        setMessage('Online library restored.');
        await refreshAccount();
      }
    },
    [writer, uid, social, refreshAccount, setMessage],
  );
  const sync = useCloudSync(scope, account.snapshot, Boolean(identity?.verified), restoreInitial, authGeneration);
  const reportProfileError = sync.reportProfileError;
  const active = Boolean(scope && account.snapshot && account.snapshot.sync.epoch > 0);
  const restoring =
    identity === undefined || Boolean(identity && !account.snapshot && !account.error) || sync.restoringInitial;
  const cacheUnavailable = Boolean(identity && account.error && !account.snapshot);
  const canCacheProfile = Boolean(account.snapshot && !account.error);
  const accountEpoch = account.snapshot?.sync.epoch ?? 0;
  // The committed device copy and whether its profile can be cached, which member reads compare with, and the committed
  // consent epoch, which an action checks is still current after each step.
  const cacheNow = useRef(account.snapshot);
  const cacheReady = useRef(canCacheProfile);
  const currentEpoch = useRef(accountEpoch);
  useLayoutEffect(() => {
    cacheNow.current = account.snapshot;
    cacheReady.current = canCacheProfile;
    currentEpoch.current = accountEpoch;
  }, [account.snapshot, canCacheProfile, accountEpoch]);
  const protectedController = useMemo(
    () => (cacheUnavailable ? { ...account.controller, busy: true } : active ? account.controller : null),
    [cacheUnavailable, active, account.controller],
  );
  const refresh = useCallback(
    async (includeMember = true) => {
      const user = identityRef.current;
      if (!user?.verified || !sync.store) return;
      const cache = cacheNow.current;
      const cacheWriter = cache ? scopedWriter(cache) : null;
      const version = memberReadVersion.current;
      const [nextMember, nextProfile, nextHead, allowed] = await Promise.all([
        includeMember ? social.member(user.uid) : Promise.resolve(undefined),
        social.ownProfile(user.uid),
        cacheNow.current?.sync.enabled || isInitialAccountCache(cacheNow.current)
          ? Promise.resolve(undefined)
          : sync.store.head(),
        creatorAccess(cloudDb),
      ]);
      if (identityRef.current?.uid !== user.uid) return;
      if (nextMember !== undefined && version === memberReadVersion.current) setMember(nextMember);
      setProfile(nextProfile);
      if (nextHead !== undefined) setHeadSnapshot({ uid: user.uid, value: nextHead });
      setCreatorUid(allowed ? user.uid : null);
      if (nextMember && cacheWriter && cacheReady.current && version === memberReadVersion.current) {
        try {
          await cacheScopedProfile(
            cacheWriter,
            nextMember,
            () => cloudAuth.currentUser?.uid === user.uid && version === memberReadVersion.current,
          );
        } catch (cause) {
          if (identityRef.current?.uid === user.uid)
            setError(`Online profile loaded, but its copy on this device could not update. ${onlineError(cause)}`);
        }
      }
    },
    [social, sync.store, identityRef, setError],
  );
  const accountReady = Boolean(account.snapshot || account.error);
  useEffect(() => {
    if (!identity?.verified || !accountReady || !sync.profileAvailable) return;
    let alive = true;
    const uid = identity.uid;
    void refresh(false).catch((cause) => {
      if (!alive || cloudAuth.currentUser?.uid !== uid) return;
      if (syncFailure(cause) !== 'blocked') reportProfileError(cause);
      else setError(onlineError(cause));
    });
    return () => {
      alive = false;
    };
  }, [
    identity?.uid,
    identity?.verified,
    accountReady,
    refresh,
    sync.profileAvailable,
    sync.profileConnection,
    reportProfileError,
    setError,
  ]);
  // Each head the sync session sees replaces the one Account previews, until a read or an action here replaces it.
  const [seenRemote, setSeenRemote] = useState<{ uid: string | undefined; head: SyncHead | null }>({
    uid: undefined,
    head: null,
  });
  if (seenRemote.head !== sync.remote || seenRemote.uid !== uid) {
    setSeenRemote({ uid, head: sync.remote });
    if (sync.remote && uid) setHeadSnapshot({ uid, value: sync.remote });
  }
  const deletionState = useDeletionProbe({
    page,
    identity,
    sessionEpoch: authGeneration,
    head,
    busy,
    store: sync.store,
    state: deletion,
  });
  useEffect(() => {
    if (!uid || !scope || !identity?.verified || !sync.profileAvailable) return;
    let alive = true;
    let caching = '';
    const unsubscribe = social.watchMember(
      uid,
      (next) => {
        if (!alive || cloudAuth.currentUser?.uid !== uid) return;
        memberReadVersion.current += 1;
        setMember((previous) =>
          previous?.uid === uid && next && previous.updatedAt > next.updatedAt ? previous : next,
        );
        if (!next || !cacheReady.current) return;
        const local = cacheNow.current;
        if (!local) return;
        const cached = local.profile;
        const fingerprint = `${next.displayName}:${next.avatar.version}:${next.avatar.seed}:${next.avatar.palette}`;
        if (
          caching === fingerprint ||
          (cached?.displayName === next.displayName &&
            cached.avatar.version === next.avatar.version &&
            cached.avatar.seed === next.avatar.seed &&
            cached.avatar.palette === next.avatar.palette)
        )
          return;
        caching = fingerprint;
        void cacheScopedProfile(scopedWriter(local), next, () => alive && cloudAuth.currentUser?.uid === uid).catch(
          (cause) => {
            if (alive && cloudAuth.currentUser?.uid === uid) {
              caching = '';
              setError(
                `Your online profile loaded, but its copy on this device could not update. ${onlineError(cause)}`,
              );
            }
          },
        );
      },
      (cause) => {
        if (alive && cloudAuth.currentUser?.uid === uid) reportProfileError(cause);
      },
    );
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [
    uid,
    scope,
    identity?.verified,
    sync.profileAvailable,
    sync.profileConnection,
    reportProfileError,
    social,
    setError,
  ]);
  // The verified account and its device copy an action runs against; it refuses until both are ready.
  const verifiedIdentity = () => {
    const user = cloudAuth.currentUser;
    if (
      !user ||
      !identityRef.current?.verified ||
      !scope ||
      !sync.store ||
      !account.snapshot ||
      user.uid !== identityRef.current?.uid
    )
      throw new Error('Verify this account and wait for its device copy to open before continuing.');
    return { user, scope, store: sync.store, local: account.snapshot };
  };

  return {
    uid,
    scope,
    account,
    social,
    sync,
    member,
    setMember,
    profile,
    setProfile,
    head,
    headSnapshot,
    setHeadSnapshot,
    isCreator,
    cancelledRegistration: Boolean(uid && cancelledUid === uid),
    deletion,
    deletionState,
    active,
    restoring,
    cacheUnavailable,
    accountEpoch,
    currentEpoch,
    protectedController,
    activeController: protectedController ?? guest,
    refresh,
    verifiedIdentity,
  };
}
export type OnlineAccount = ReturnType<typeof useOnlineAccount>;
