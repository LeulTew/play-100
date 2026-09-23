import { collection, doc, documentId, getDocFromServer, getDocs, increment, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, startAfter, Timestamp, where, writeBatch } from 'firebase/firestore';
import type { DocumentData, Firestore, QueryDocumentSnapshot } from 'firebase/firestore';
import { normalizeHandle, parseHandle, parseAvatar, parsePublicationEntry, parsePublicEntry, reportDocumentId, PUBLIC_LIMIT } from '../lib/community';
import type { AvatarValue, Member, ProfileReport, PublicControl, PublicEntry, PublicProfile } from '../lib/community';
import { ensureAccountActivity } from './account-lifecycle';
import { releaseIndexedPayload } from './generation-cleanup';
import { ACCOUNT_LIMITS, AccountQuotaFull, quotaRef, quotaSupported, requireVisibleCapacity } from './account-quota';

function timestamp(value: unknown): number {
  if (!(value instanceof Timestamp)) throw new Error('An online profile has an invalid update time.');
  return value.toMillis();
}
export function parseMember(value: DocumentData): Member {
  if (Object.keys(value).sort().join() !== 'avatar,consentVersion,createdAt,displayName,gameCount,rankCount,uid,updatedAt' ||
    typeof value.uid !== 'string' || typeof value.displayName !== 'string' || value.displayName.length < 1 || value.displayName.length > 60 ||
    value.consentVersion !== 1 || !Number.isInteger(value.rankCount) || value.rankCount < 0 || value.rankCount > 10000 ||
    !Number.isInteger(value.gameCount) || value.gameCount < 0 || value.gameCount > 10000) throw new Error('This online member profile has an unsupported format.');
  return { uid: value.uid, displayName: value.displayName, avatar: parseAvatar(value.avatar), consentVersion: 1, rankCount: value.rankCount, gameCount: value.gameCount, createdAt: timestamp(value.createdAt), updatedAt: timestamp(value.updatedAt) };
}
export function parseProfile(value: DocumentData): PublicProfile {
  if (Object.keys(value).sort().join() !== 'avatar,count,creator,displayName,epoch,generation,handle,hidden,listed,preview,published,title,uid,updatedAt' ||
    typeof value.uid !== 'string' || typeof value.handle !== 'string' || parseHandle(value.handle) !== value.handle ||
    typeof value.displayName !== 'string' || value.displayName.length < 1 || value.displayName.length > 60 ||
    typeof value.title !== 'string' || value.title.length < 1 || value.title.length > 80 ||
    !Number.isInteger(value.count) || value.count < 1 || value.count > PUBLIC_LIMIT ||
    !Array.isArray(value.preview) || value.preview.length > 3 || !value.preview.every((title: unknown) => typeof title === 'string' && title.length <= 200) ||
    !Number.isSafeInteger(value.epoch) || value.epoch < 1 || typeof value.generation !== 'string' || !/^[a-f0-9-]{36}$/.test(value.generation) ||
    typeof value.published !== 'boolean' || typeof value.listed !== 'boolean' || typeof value.hidden !== 'boolean' || typeof value.creator !== 'boolean') throw new Error('This published profile contains unsupported fields.');
  return { uid: value.uid, handle: value.handle, displayName: value.displayName, avatar: parseAvatar(value.avatar), title: value.title, count: value.count, preview: value.preview, generation: value.generation, epoch: value.epoch, published: value.published, listed: value.listed, hidden: value.hidden, creator: value.creator, updatedAt: timestamp(value.updatedAt) };
}
function parseControl(value: DocumentData): PublicControl {
  if (Object.keys(value).sort().join() !== 'deleted,epoch,hidden' || !Number.isSafeInteger(value.epoch) || value.epoch < 0 ||
    typeof value.hidden !== 'boolean' || typeof value.deleted !== 'boolean') throw new Error('Publication permissions are unreadable.');
  return { epoch: value.epoch, hidden: value.hidden, deleted: value.deleted };
}
function denied(cause: unknown): boolean {
  return Boolean(cause && typeof cause === 'object' && 'code' in cause && cause.code === 'permission-denied');
}
function publicationRegistry(value: DocumentData): { ids: string[]; revision: number } {
  if (Object.keys(value).sort().join() !== 'ids,revision' || !Array.isArray(value.ids) ||
    !value.ids.every((id: unknown) => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id)) ||
    new Set(value.ids).size !== value.ids.length || !Number.isSafeInteger(value.revision) || value.revision < 1) {
    throw new Error('Publication cleanup metadata is invalid. Nothing was changed.');
  }
  return { ids: value.ids, revision: value.revision };
}

export class SocialStore {
  constructor(readonly db: Firestore) {}
  async member(uid: string): Promise<Member | null> {
    const value = await getDocFromServer(doc(this.db, 'members', uid));
    const member = value.exists() ? parseMember(value.data()) : null;
    if (member && member.uid !== uid) throw new Error('The online profile does not match this account.');
    return member;
  }
  watchMember(uid: string, onMember: (member: Member | null) => void, onError: (cause: Error) => void): () => void {
    return onSnapshot(doc(this.db, 'members', uid), { includeMetadataChanges: true }, (value) => {
      if (value.metadata.fromCache || value.metadata.hasPendingWrites) return;
      try {
        const member = value.exists() ? parseMember(value.data()) : null;
        if (member && member.uid !== uid) throw new Error('The online profile does not match this account.');
        onMember(member);
      } catch (cause) { onError(cause instanceof Error ? cause : new Error('This account profile is unreadable.')); }
    }, onError);
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
  private async changeMember(uid: string, name: string, avatar: AvatarValue, field: 'create' | 'name' | 'avatar'): Promise<void> {
    const displayName = name.trim();
    if (!displayName || displayName.length > 60) throw new Error('Choose a name between 1 and 60 characters. A nickname is welcome.');
    parseAvatar(avatar);
    await ensureAccountActivity(this.db, uid);
    await runTransaction(this.db, async (tx) => {
      const ref = doc(this.db, 'members', uid);
      const previous = await tx.get(ref);
      if (previous.exists()) {
        parseMember(previous.data());
        if (field === 'name') tx.update(ref, { displayName, updatedAt: serverTimestamp() });
        if (field === 'avatar') tx.update(ref, { avatar, updatedAt: serverTimestamp() });
      } else tx.set(ref, { uid, displayName, avatar, consentVersion: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), rankCount: 0, gameCount: 0 });
    });
  }
  async control(uid: string): Promise<PublicControl> {
    const value = await getDocFromServer(doc(this.db, 'publicControls', uid));
    return value.exists() ? parseControl(value.data()) : { epoch: 0, hidden: false, deleted: false };
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
  async profile(handleInput: string): Promise<PublicProfile | null> {
    const handle = parseHandle(handleInput);
    try {
      const link = await getDocFromServer(doc(this.db, 'handles', handle));
      if (!link.exists() || typeof link.data().uid !== 'string') return null;
      const profile = await getDocFromServer(doc(this.db, 'publicProfiles', link.data().uid));
      if (!profile.exists()) return null;
      const parsed = parseProfile(profile.data());
      return parsed.published && !parsed.hidden && parsed.handle === handle ? parsed : null;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied') return null;
      throw error;
    }
  }
  async entries(profile: PublicProfile): Promise<PublicEntry[]> {
    const result = await getDocs(query(collection(this.db, 'publicProfiles', profile.uid, 'generations', profile.generation, 'entries'), orderBy('position'), limit(PUBLIC_LIMIT)));
    const entries = result.docs.map((entry) => parsePublicEntry(entry.data()));
    if (entries.length !== profile.count || entries.some((entry, index) => entry.position !== index + 1) || new Set(entries.map((entry) => entry.id)).size !== entries.length) {
      throw new Error('This ranking changed or is incomplete. Reload it before saving games.');
    }
    return entries;
  }
  async directory(prefix: string, cursor?: QueryDocumentSnapshot<DocumentData>) {
    const normalized = prefix.trim().toLowerCase();
    if (normalized && !/^[a-z][a-z0-9_]{0,23}$/.test(normalized)) throw new Error('Search by the start of a handle, using letters, numbers or underscores.');
    const clauses = [where('listed', '==', true), where('published', '==', true), where('hidden', '==', false), orderBy('handle')];
    if (normalized) clauses.push(where('handle', '>=', normalized), where('handle', '<=', normalized + '\uf8ff'));
    const result = await getDocs(query(collection(this.db, 'publicProfiles'), ...clauses, ...(cursor ? [startAfter(cursor)] : []), limit(20)));
    return { profiles: result.docs.map((item) => parseProfile(item.data())), cursor: result.size === 20 ? result.docs.at(-1) : undefined };
  }
  async publish(uid: string, input: { handle: string; displayName: string; avatar: AvatarValue; title: string; listed: boolean; creator: boolean; entries: PublicEntry[] }, expected: PublicControl, beforeCommit?: () => Promise<void>): Promise<PublicProfile> {
    const handle = normalizeHandle(input.handle);
    const displayName = input.displayName.trim();
    const title = input.title.trim();
    if (!displayName || displayName.length > 60 || !title || title.length > 80) throw new Error('Use a name up to 60 characters and a ranking title up to 80.');
    if (!input.entries.length || input.entries.length > PUBLIC_LIMIT) throw new Error('Choose 1-200 games; no entries are automatically omitted.');
    const entries = input.entries.map(parsePublicationEntry);
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length || entries.some((entry, index) => entry.position !== index + 1)) throw new Error('Review the publication order and remove duplicate games.');
    const avatar = parseAvatar(input.avatar);
    await ensureAccountActivity(this.db, uid);
    await this.cleanup(uid);
    const registryRef = doc(this.db, 'publicProfiles', uid, 'metadata', 'registry');
    let quotaSupported = true;
    try { await getDocFromServer(registryRef); }
    catch (cause) {
      if (!denied(cause)) throw cause;
      quotaSupported = false;
      console.info('Publication quota controls are not yet available; using the legacy client-first publication path.');
    }
    const id = crypto.randomUUID();
    const controlRef = doc(this.db, 'publicControls', uid);
    const generationRef = doc(this.db, 'publicProfiles', uid, 'generations', id);
    await runTransaction(this.db, async (tx) => {
      const [snap, registry] = await Promise.all([tx.get(controlRef), quotaSupported ? tx.get(registryRef) : Promise.resolve(null)]);
      const current = snap.exists() ? parseControl(snap.data()) : { epoch: 0, hidden: false, deleted: false };
      if (current.epoch !== expected.epoch || current.hidden || current.deleted) throw new Error('Publication permission changed. Refresh the preview; hidden or deleted profiles cannot publish.');
      if (!snap.exists()) tx.set(controlRef, current);
      if (quotaSupported) {
        const value = registry?.exists() ? publicationRegistry(registry.data()) : { ids: [], revision: 0 };
        if (value.ids.length >= 4) throw new Error('Four publication snapshots are still retained. Wait for cleanup and retry; your published ranking is unchanged.');
        tx.set(registryRef, { ids: [...value.ids, id], revision: value.revision + 1 });
      }
      tx.set(generationRef, { epoch: current.epoch, count: entries.length, uploaded: 0, status: 'staging', createdAt: serverTimestamp() });
    });
    for (let index = 0; index < entries.length; index += 8) {
      const batch = writeBatch(this.db);
      const uploaded = Math.min(index + 8, entries.length);
      for (const entry of entries.slice(index, uploaded)) batch.set(doc(generationRef, 'entries', String(entry.position)), entry);
      batch.update(generationRef, { uploaded, status: uploaded === entries.length ? 'ready' : 'staging' });
      await batch.commit();
    }
    if (beforeCommit) await beforeCommit();
    return runTransaction(this.db, async (tx) => {
      const ref = doc(this.db, 'publicProfiles', uid);
      const handleRef = doc(this.db, 'handles', handle);
      const [control, oldProfile, claim, generation] = await Promise.all([tx.get(controlRef), tx.get(ref), tx.get(handleRef), tx.get(generationRef)]);
      const current = parseControl(control.data() ?? {});
      if (current.epoch !== expected.epoch || current.hidden || current.deleted || !generation.exists() || generation.data().epoch !== current.epoch || generation.data().status !== 'ready') throw new Error('The public ranking changed elsewhere. Your private ranking is safe; refresh the preview before replacing it.');
      if (claim.exists() && claim.data().uid !== uid) throw new Error('That handle is already taken. Choose another one.');
      const next: PublicProfile = {
        uid, handle, displayName, avatar, title, count: entries.length, preview: entries.slice(0, 3).map((entry) => entry.title),
        generation: id, epoch: current.epoch + 1, published: true, listed: input.listed, hidden: false, creator: input.creator, updatedAt: Date.now(),
      };
      if (oldProfile.exists() && oldProfile.data().handle !== handle) tx.delete(doc(this.db, 'handles', oldProfile.data().handle));
      tx.set(handleRef, { uid });
      tx.update(controlRef, { epoch: next.epoch });
      tx.set(ref, { ...next, updatedAt: serverTimestamp() });
      return next;
    });
  }
  async unpublish(uid: string, expected: PublicControl, deleting = false): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const controlRef = doc(this.db, 'publicControls', uid);
      const profileRef = doc(this.db, 'publicProfiles', uid);
      const [snap, profile] = await Promise.all([tx.get(controlRef), tx.get(profileRef)]);
      const current = snap.exists() ? parseControl(snap.data()) : { epoch: 0, hidden: false, deleted: false };
      if (current.epoch !== expected.epoch) throw new Error('This publication changed. Reload before unpublishing.');
      if (deleting && current.deleted && (!profile.exists() || !profile.data().published)) return;
      tx.set(controlRef, { ...current, epoch: current.epoch + 1, deleted: deleting });
      if (profile.exists()) tx.update(profileRef, { published: false, listed: false, epoch: current.epoch + 1, updatedAt: serverTimestamp() });
    });
  }
  async moderate(uid: string, hidden: boolean): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const controlRef = doc(this.db, 'publicControls', uid);
      const profileRef = doc(this.db, 'publicProfiles', uid);
      const [control, profile] = await Promise.all([tx.get(controlRef), tx.get(profileRef)]);
      const current = control.exists() ? parseControl(control.data()) : { epoch: 0, hidden: false, deleted: false };
      tx.set(controlRef, { ...current, hidden, epoch: current.epoch + 1 });
      if (profile.exists()) tx.update(profileRef, { hidden, published: false, listed: false, epoch: current.epoch + 1, updatedAt: serverTimestamp() });
    });
  }
  async report(reporterUid: string, targetUid: string, reason: string): Promise<void> {
    if (!reason.trim() || reason.trim().length > 400 || reporterUid === targetUid) throw new Error('Use 1-400 characters to describe a problem with another profile.');
    const reportId = reportDocumentId(targetUid, reporterUid);
    await ensureAccountActivity(this.db, reporterUid);
    const ref = doc(this.db, 'reports', reportId);
    const quota = quotaRef(this.db, reporterUid, 'reports');
    const counted = await quotaSupported(quota);
    await requireVisibleCapacity<QueryDocumentSnapshot<DocumentData>>('reports', async cursor => {
      const page = await getDocs(query(collection(this.db, 'reports'), where('reporterUid', '==', reporterUid), orderBy(documentId()),
        ...(cursor ? [startAfter(cursor)] : []), limit(20)));
      return { items: page.docs, cursor: page.size === 20 ? page.docs.at(-1) : undefined };
    });
    await runTransaction(this.db, async (tx) => {
      const [report, usage] = await Promise.all([tx.get(ref), counted ? tx.get(quota) : Promise.resolve(null)]);
      if (report.exists()) throw new Error('You already reported this profile. The creator can review your existing report.');
      if (counted) {
        const value = usage?.exists() ? usage.data() : { count: 0, revision: 0 };
        if (!Number.isSafeInteger(value.count) || value.count < 0 || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('Your report count could not be read. Nothing was sent.');
        if (value.count >= ACCOUNT_LIMITS.reports) throw new AccountQuotaFull('reports');
        tx.set(quota, { count: value.count + 1, revision: value.revision + 1, lastReport: reportId });
      }
      tx.set(ref, { reporterUid, targetUid, reason: reason.trim(), status: 'open', createdAt: serverTimestamp(), ...(counted ? { counted: true } : {}) });
    });
  }
  async members(cursor?: QueryDocumentSnapshot<DocumentData>) {
    const result = await getDocs(query(collection(this.db, 'members'), orderBy('updatedAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(20)));
    return { members: result.docs.map((item) => parseMember(item.data())), cursor: result.size === 20 ? result.docs.at(-1) : undefined };
  }
  async reports(cursor?: QueryDocumentSnapshot<DocumentData>) {
    const result = await getDocs(query(collection(this.db, 'reports'), orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(20)));
    const reports: ProfileReport[] = result.docs.map((row) => {
      const data = row.data();
      if (typeof data.reporterUid !== 'string' || typeof data.targetUid !== 'string' || typeof data.reason !== 'string' || data.reason.length > 400 || (data.status !== 'open' && data.status !== 'resolved')) throw new Error('A report has invalid fields.');
      return { id: row.id, reporterUid: data.reporterUid, targetUid: data.targetUid, reason: data.reason, status: data.status, createdAt: timestamp(data.createdAt) };
    });
    return { reports, cursor: result.size === 20 ? result.docs.at(-1) : undefined };
  }
  async withdrawReport(id: string): Promise<void> {
    await runTransaction(this.db, async tx => {
      const ref = doc(this.db, 'reports', id);
      const report = await tx.get(ref);
      if (!report.exists()) throw new Error('This report is no longer available.');
      const data = report.data();
      if (data.counted === true) tx.update(quotaRef(this.db, data.reporterUid, 'reports'), {
        count: increment(-1), revision: increment(1), lastReport: id,
      });
      tx.delete(ref);
    });
  }
  async resolveReport(id: string): Promise<boolean> {
    try { await this.withdrawReport(id); return true; }
    catch (cause) {
      if (!denied(cause)) throw cause;
      console.info('Report deletion is not available yet; resolving the legacy report once.');
      await runTransaction(this.db, async tx => {
        const ref = doc(this.db, 'reports', id);
        const report = await tx.get(ref);
        if (!report.exists() || report.data().counted === true || report.data().status !== 'open') throw cause;
        tx.update(ref, { status: 'resolved' });
      });
      return false;
    }
  }
  async restorePublicationPermission(uid: string): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const ref = doc(this.db, 'publicControls', uid);
      const current = await tx.get(ref);
      if (current.exists() && current.data().deleted) tx.update(ref, { deleted: false, epoch: current.data().epoch + 1 });
    });
  }
  async cleanup(uid: string, all = false, afterDeleteBatch?: () => Promise<void>): Promise<number> {
    const generations = await getDocs(query(collection(this.db, 'publicProfiles', uid, 'generations'), orderBy('createdAt'), limit(20)));
    let cleaned = 0;
    for (const item of generations.docs) {
      const count = await runTransaction(this.db, async (tx) => {
        const [current, profile] = await Promise.all([tx.get(item.ref), tx.get(doc(this.db, 'publicProfiles', uid))]);
        if (!current.exists()) return null;
        const data = current.data();
        if (!Number.isInteger(data.count) || data.count < 1 || data.count > PUBLIC_LIMIT || !(data.createdAt instanceof Timestamp)) throw new Error('Publication cleanup metadata is invalid.');
        if (profile.exists() && profile.data().generation === item.id && (profile.data().published || !all)) return null;
        if (!all && data.status !== 'deleting' && Date.now() - data.createdAt.toMillis() < 300000) return null;
        if (data.status !== 'deleting') tx.update(item.ref, { status: 'deleting' });
        return data.count as number;
      });
      if (count === null) continue;
      await releaseIndexedPayload(item.ref, 'entries', 1, count, afterDeleteBatch);
      const registryRef = doc(this.db, 'publicProfiles', uid, 'metadata', 'registry');
      let quotaSupported = true;
      try { await getDocFromServer(registryRef); }
      catch (cause) {
        if (!denied(cause)) throw cause;
        quotaSupported = false;
        console.info('Publication quota controls are not yet available; cleaning the legacy publication only.');
      }
      await runTransaction(this.db, async tx => {
        const registry = quotaSupported ? await tx.get(registryRef) : null;
        if (registry?.exists()) {
          const value = publicationRegistry(registry.data());
          if (value.ids.includes(item.id)) tx.update(registryRef, { ids: value.ids.filter(id => id !== item.id), revision: value.revision + 1 });
        }
        tx.delete(item.ref);
      });
      cleaned += 1;
    }
    return cleaned;
  }
  async deleteProfile(uid: string): Promise<void> {
    for (let pass = 0; pass < 20; pass += 1) {
      if (await this.cleanup(uid, true) < 20) break;
      if (pass === 19) throw new Error('Some older publication data still needs cleanup. Retry deletion to continue safely.');
    }
    const ownReports = await getDocs(query(collection(this.db, 'reports'), where('reporterUid', '==', uid), limit(20)));
    if (ownReports.size) {
      for (const report of ownReports.docs) await this.withdrawReport(report.id);
      if (ownReports.size === 20) throw new Error('Some reports still need removal. Retry deletion to finish the next batch.');
    }
    const quota = quotaRef(this.db, uid, 'reports');
    const counted = await quotaSupported(quota);
    await runTransaction(this.db, async (tx) => {
      const ref = doc(this.db, 'publicProfiles', uid);
      const [profile, usage] = await Promise.all([tx.get(ref), counted ? tx.get(quota) : Promise.resolve(null)]);
      if (usage?.exists()) {
        if (usage.data().count !== 0) throw new Error('Some reports could not be removed. Try again, or contact the site owner before deleting this account.');
        tx.delete(quota);
      }
      if (profile.exists()) {
        tx.delete(doc(this.db, 'handles', profile.data().handle));
        tx.delete(ref);
      }
    });
  }
}
