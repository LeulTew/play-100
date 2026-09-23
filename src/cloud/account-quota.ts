import { doc, getDocFromServer } from 'firebase/firestore';
import type { DocumentData, DocumentReference, Firestore, Transaction } from 'firebase/firestore';
import { friendUid, friendUuid } from '../lib/friend-types';

export const ACCOUNT_LIMITS = { groups: 50, blocks: 1000, reports: 100 } as const;
export type AccountQuotaKind = keyof typeof ACCOUNT_LIMITS;
export type SlotQuotaKind = 'groups' | 'blocks';
export interface QuotaSlots { ids: string[]; revision: number }

export class AccountQuotaFull extends Error {
  readonly code = 'limit';
  constructor(kind: AccountQuotaKind) {
    super({
      groups: "You've reached 50 groups. Remove one to add another.",
      blocks: "You've reached 1,000 blocked people. Unblock someone before adding another.",
      reports: "You've reached 100 reports. Wait for a review before sending another.",
    }[kind]);
    this.name = 'AccountQuotaFull';
  }
}

export function quotaRef(db: Firestore, uid: string, kind: AccountQuotaKind): DocumentReference<DocumentData> {
  return doc(db, 'accountQuotas', friendUid(uid), 'limits', kind);
}

export async function quotaSupported(ref: DocumentReference<DocumentData>): Promise<boolean> {
  try { await getDocFromServer(ref); return true; }
  catch (cause) {
    if (!cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'permission-denied') throw cause;
    console.info('Account count controls are not available yet; using the existing client-first write path once.');
    return false;
  }
}

export async function readQuotaSlots(tx: Transaction, ref: DocumentReference<DocumentData>, kind: SlotQuotaKind): Promise<QuotaSlots> {
  const snapshot = await tx.get(ref);
  if (!snapshot.exists()) return { ids: [], revision: 0 };
  const value = snapshot.data();
  if (Object.keys(value).sort().join() !== 'ids,revision' || !Array.isArray(value.ids) ||
    new Set(value.ids).size !== value.ids.length || !Number.isSafeInteger(value.revision) || value.revision < 1) {
    throw new Error('Account limits could not be read. Nothing was changed. Try again later.');
  }
  return { ids: value.ids.map(kind === 'groups' ? friendUuid : friendUid), revision: value.revision };
}

export function occupyQuotaSlot(tx: Transaction, ref: DocumentReference<DocumentData>, slots: QuotaSlots, id: string, kind: SlotQuotaKind) {
  if (slots.ids.includes(id)) throw new Error('This saved item is already counted. Refresh before trying again.');
  if (slots.ids.length >= ACCOUNT_LIMITS[kind]) throw new AccountQuotaFull(kind);
  tx.set(ref, { ids: [...slots.ids, id], revision: slots.revision + 1 });
}

export function releaseQuotaSlot(tx: Transaction, ref: DocumentReference<DocumentData>, slots: QuotaSlots, id: string) {
  if (slots.ids.includes(id)) tx.update(ref, { ids: slots.ids.filter(value => value !== id), revision: slots.revision + 1 });
}

export async function requireVisibleCapacity<Cursor>(
  kind: AccountQuotaKind, read: (cursor?: Cursor) => Promise<{ items: readonly unknown[]; cursor: Cursor | undefined }>,
) {
  let count = 0;
  let cursor: Cursor | undefined;
  do {
    const page = await read(cursor);
    count += page.items.length;
    if (count >= ACCOUNT_LIMITS[kind]) throw new AccountQuotaFull(kind);
    if (!page.items.length && page.cursor) throw new Error('The saved list could not be counted. Refresh before adding another item.');
    cursor = page.cursor;
  } while (cursor);
}
