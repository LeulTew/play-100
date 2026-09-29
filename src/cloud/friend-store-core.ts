import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { FriendStoreError } from '../lib/friend-types';
import type { FriendPage, FriendSettings } from '../lib/friend-types';

// Checks and page shaping shared by FriendStore's operations.

export function conflict(message = 'This changed elsewhere. Reload before trying again.'): never {
  throw new FriendStoreError('conflict', message);
}
export function online(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw new FriendStoreError('offline', 'Reconnect before changing friendships or sharing.');
}
export function activeSettings(value: FriendSettings | null): FriendSettings {
  if (!value) throw new FriendStoreError('unavailable', 'Open Friends to prepare your friend profile first.');
  if (value.deleted)
    throw new FriendStoreError('deleted', 'This account is being deleted. Friendship changes are disabled.');
  return value;
}
export function expectedSettings(current: FriendSettings, expected: FriendSettings): void {
  activeSettings(current);
  if (current.epoch !== expected.epoch || current.revision !== expected.revision)
    conflict('Sharing settings changed. Reload the selection before publishing.');
}
export function permissionDenied(cause: unknown): boolean {
  return Boolean(cause && typeof cause === 'object' && 'code' in cause && cause.code === 'permission-denied');
}
/**
 * One write of a publication that another device of the account can be making at the same time. When the write is
 * refused (permission-denied), `settle` reads the publication's inputs again. It returns the head the other device
 * published with the same content, which ends this publication; throws a conflict when the inputs changed; or returns
 * null, and the write is tried once more. A second refusal is reported as it came.
 */
export async function contendedWrite<H>(
  write: () => Promise<H | null | void>,
  settle: () => Promise<H | null>,
): Promise<H | null> {
  for (let retried = false; ; retried = true) {
    try {
      return (await write()) ?? null;
    } catch (cause) {
      if (!permissionDenied(cause)) throw cause;
      const settled = await settle();
      if (settled) return settled;
      if (retried) throw cause;
    }
  }
}
export function page<T>(
  rows: QueryDocumentSnapshot<DocumentData>[],
  parse: (row: QueryDocumentSnapshot<DocumentData>) => T,
): FriendPage<T> {
  return { items: rows.map(parse), cursor: rows.length === 20 ? rows.at(-1) : undefined };
}
export function errorValue(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error('Friend data could not be read. Try again.');
}
