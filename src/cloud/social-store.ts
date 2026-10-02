import { doc, getDocFromServer, onSnapshot, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import type { DocumentData, Firestore, QueryDocumentSnapshot } from 'firebase/firestore';
import { parseHandle, parseAvatar, PUBLIC_LIMIT } from '../lib/community';
import type { AvatarValue, Member, PublicControl, PublicEntry, PublicProfile } from '../lib/community';
import { displayNameProblem } from '../lib/text-controls';
import { createMemoizedModule } from '../lib/memoized-module';
import { isInteger, isSafeInteger, isStringArray } from '../lib/guards';
import type { JsonObject } from '../lib/guards';
import { ensureAccountActivity } from './account-lifecycle';
import type { SocialPublication } from './social-publication';

export function timestamp(value: unknown): number {
  if (!(value instanceof Timestamp)) throw new Error('An online profile has an invalid update time.');
  return value.toMillis();
}
export function parseMember(value: JsonObject): Member {
  if (
    Object.keys(value).sort().join() !==
      'avatar,consentVersion,createdAt,displayName,gameCount,rankCount,uid,updatedAt' ||
    typeof value.uid !== 'string' ||
    typeof value.displayName !== 'string' ||
    value.displayName.length < 1 ||
    value.displayName.length > 60 ||
    value.consentVersion !== 1 ||
    !isInteger(value.rankCount) ||
    value.rankCount < 0 ||
    value.rankCount > 10000 ||
    !isInteger(value.gameCount) ||
    value.gameCount < 0 ||
    value.gameCount > 10000
  )
    throw new Error('This online member profile has an unsupported format.');
  return {
    uid: value.uid,
    displayName: value.displayName,
    avatar: parseAvatar(value.avatar),
    consentVersion: 1,
    rankCount: value.rankCount,
    gameCount: value.gameCount,
    createdAt: timestamp(value.createdAt),
    updatedAt: timestamp(value.updatedAt),
  };
}
export function parseProfile(value: JsonObject): PublicProfile {
  if (
    Object.keys(value).sort().join() !==
      'avatar,count,creator,displayName,epoch,generation,handle,hidden,listed,preview,published,title,uid,updatedAt' ||
    typeof value.uid !== 'string' ||
    typeof value.handle !== 'string' ||
    parseHandle(value.handle) !== value.handle ||
    typeof value.displayName !== 'string' ||
    value.displayName.length < 1 ||
    value.displayName.length > 60 ||
    typeof value.title !== 'string' ||
    value.title.length < 1 ||
    value.title.length > 80 ||
    !isInteger(value.count) ||
    value.count < 1 ||
    value.count > PUBLIC_LIMIT ||
    !isStringArray(value.preview) ||
    value.preview.length > 3 ||
    !value.preview.every((title) => title.length <= 200) ||
    !isSafeInteger(value.epoch) ||
    value.epoch < 1 ||
    typeof value.generation !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(value.generation) ||
    typeof value.published !== 'boolean' ||
    typeof value.listed !== 'boolean' ||
    typeof value.hidden !== 'boolean' ||
    typeof value.creator !== 'boolean'
  )
    throw new Error('This published profile contains unsupported fields.');
  return {
    uid: value.uid,
    handle: value.handle,
    displayName: value.displayName,
    avatar: parseAvatar(value.avatar),
    title: value.title,
    count: value.count,
    preview: value.preview,
    generation: value.generation,
    epoch: value.epoch,
    published: value.published,
    listed: value.listed,
    hidden: value.hidden,
    creator: value.creator,
    updatedAt: timestamp(value.updatedAt),
  };
}
export function denied(cause: unknown): boolean {
  return Boolean(cause && typeof cause === 'object' && 'code' in cause && cause.code === 'permission-denied');
}
// Publishing, moderation, reports and public-copy cleanup live in social-publication.ts, which registers itself here.
// The pages that use them and Account import it, so it loads with them; any other caller loads it on first use.
let registeredPublication: typeof SocialPublication | null = null;
export function registerSocialPublication(implementation: typeof SocialPublication): void {
  registeredPublication = implementation;
}
const publicationModule = createMemoizedModule(() => import('./social-publication'));

export class SocialStore {
  constructor(readonly db: Firestore) {}
  async member(uid: string): Promise<Member | null> {
    const value = await getDocFromServer(doc(this.db, 'members', uid));
    const member = value.exists() ? parseMember(value.data()) : null;
    if (member && member.uid !== uid) throw new Error('The online profile does not match this account.');
    return member;
  }
  watchMember(uid: string, onMember: (member: Member | null) => void, onError: (cause: Error) => void): () => void {
    return onSnapshot(
      doc(this.db, 'members', uid),
      { includeMetadataChanges: true },
      (value) => {
        if (value.metadata.fromCache || value.metadata.hasPendingWrites) return;
        try {
          const member = value.exists() ? parseMember(value.data()) : null;
          if (member && member.uid !== uid) throw new Error('The online profile does not match this account.');
          onMember(member);
        } catch (cause) {
          onError(cause instanceof Error ? cause : new Error('This account profile is unreadable.'));
        }
      },
      onError,
    );
  }
  async saveMember(uid: string, name: string, avatar: AvatarValue): Promise<void> {
    return this.changeMember(uid, name, avatar, 'create');
  }
  async saveMemberName(uid: string, name: string, fallbackAvatar: AvatarValue): Promise<void> {
    return this.changeMember(uid, name, fallbackAvatar, 'name');
  }
  async saveMemberAvatar(uid: string, avatar: AvatarValue, fallbackName: string): Promise<void> {
    return this.changeMember(uid, fallbackName, avatar, 'avatar');
  }
  private async changeMember(
    uid: string,
    name: string,
    avatar: AvatarValue,
    field: 'create' | 'name' | 'avatar',
  ): Promise<void> {
    const displayName = name.trim();
    if (!displayName || displayName.length > 60)
      throw new Error('Choose a name between 1 and 60 characters. A nickname is welcome.');
    // Only a written name must be clean: an avatar-only update, or a publication's check of an existing member,
    // keeps the stored name, which rules accept as an unchanged legacy name. A new member document still needs one.
    const nameProblem = displayNameProblem(name);
    if (nameProblem && field === 'name') throw new Error(nameProblem);
    parseAvatar(avatar);
    await ensureAccountActivity(this.db, uid);
    await runTransaction(this.db, async (tx) => {
      const ref = doc(this.db, 'members', uid);
      const previous = await tx.get(ref);
      if (previous.exists()) {
        parseMember(previous.data());
        if (field === 'name') tx.update(ref, { displayName, updatedAt: serverTimestamp() });
        if (field === 'avatar') tx.update(ref, { avatar, updatedAt: serverTimestamp() });
      } else {
        if (nameProblem) throw new Error(nameProblem);
        tx.set(ref, {
          uid,
          displayName,
          avatar,
          consentVersion: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          rankCount: 0,
          gameCount: 0,
        });
      }
    });
  }
  async ownProfile(uid: string): Promise<PublicProfile | null> {
    try {
      const value = await getDocFromServer(doc(this.db, 'publicProfiles', uid));
      return value.exists() ? parseProfile(value.data()) : null;
    } catch (cause) {
      if (denied(cause)) return null;
      throw cause;
    }
  }
  control(uid: string): Promise<PublicControl> {
    return this.publishing().then((publishing) => publishing.control(uid));
  }
  profile(handleInput: string): Promise<PublicProfile | null> {
    return this.publishing().then((publishing) => publishing.profile(handleInput));
  }
  entries(profile: PublicProfile): Promise<PublicEntry[]> {
    return this.publishing().then((publishing) => publishing.entries(profile));
  }
  directory(prefix: string, cursor?: QueryDocumentSnapshot<DocumentData>): ReturnType<SocialPublication['directory']> {
    return this.publishing().then((publishing) => publishing.directory(prefix, cursor));
  }
  publish(
    uid: string,
    input: Parameters<SocialPublication['publish']>[1],
    expected: PublicControl,
    beforeCommit?: () => Promise<void>,
  ): Promise<PublicProfile> {
    return this.publishing().then((publishing) => publishing.publish(uid, input, expected, beforeCommit));
  }
  unpublish(uid: string, expected: PublicControl, deleting = false): Promise<void> {
    return this.publishing().then((publishing) => publishing.unpublish(uid, expected, deleting));
  }
  moderate(uid: string, hidden: boolean): Promise<void> {
    return this.publishing().then((publishing) => publishing.moderate(uid, hidden));
  }
  report(reporterUid: string, targetUid: string, reason: string): Promise<void> {
    return this.publishing().then((publishing) => publishing.report(reporterUid, targetUid, reason));
  }
  members(cursor?: QueryDocumentSnapshot<DocumentData>): ReturnType<SocialPublication['members']> {
    return this.publishing().then((publishing) => publishing.members(cursor));
  }
  reports(cursor?: QueryDocumentSnapshot<DocumentData>): ReturnType<SocialPublication['reports']> {
    return this.publishing().then((publishing) => publishing.reports(cursor));
  }
  withdrawReport(id: string): Promise<void> {
    return this.publishing().then((publishing) => publishing.withdrawReport(id));
  }
  resolveReport(id: string): Promise<boolean> {
    return this.publishing().then((publishing) => publishing.resolveReport(id));
  }
  async restorePublicationPermission(uid: string): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const ref = doc(this.db, 'publicControls', uid);
      const current = await tx.get(ref);
      if (current.exists() && current.data().deleted)
        tx.update(ref, { deleted: false, epoch: current.data().epoch + 1 });
    });
  }
  cleanup(uid: string, all = false, afterDeleteBatch?: () => Promise<void>): Promise<number> {
    return this.publishing().then((publishing) => publishing.cleanup(uid, all, afterDeleteBatch));
  }
  deleteProfile(uid: string): Promise<void> {
    return this.publishing().then((publishing) => publishing.deleteProfile(uid));
  }
  private async publishing(): Promise<SocialPublication> {
    const Publication = registeredPublication ?? (await publicationModule.load()).SocialPublication;
    return new Publication(this.db, this);
  }
}
