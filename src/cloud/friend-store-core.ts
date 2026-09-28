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
export function page<T>(
  rows: QueryDocumentSnapshot<DocumentData>[],
  parse: (row: QueryDocumentSnapshot<DocumentData>) => T,
): FriendPage<T> {
  return { items: rows.map(parse), cursor: rows.length === 20 ? rows.at(-1) : undefined };
}
export function errorValue(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error('Friend data could not be read. Try again.');
}
