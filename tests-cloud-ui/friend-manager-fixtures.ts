import { randomBytes } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { firestoreOrigin } from './helpers';

const documentsRoot = 'projects/demo-play100/databases/(default)/documents';
export const inviteLifetime = 7 * 24 * 60 * 60 * 1000;
export function field(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(field) } };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isFinite(value))
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (value && typeof value === 'object')
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, field(item)])) } };
  throw new Error('Unsupported synthetic fixture value.');
}
export async function writeManagerDocuments(
  request: APIRequestContext,
  documents: Record<string, Record<string, unknown>>,
) {
  if (new URL(firestoreOrigin).hostname !== '127.0.0.1' || Object.keys(documents).length > 400)
    throw new Error('Only bounded local emulator fixtures may be written.');
  const response = await request.post(`${firestoreOrigin}/v1/${documentsRoot}:commit`, {
    headers: { Authorization: 'Bearer owner' },
    data: {
      writes: Object.entries(documents).map(([path, data]) => ({
        update: {
          name: `${documentsRoot}/${path}`,
          fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, field(value)])),
        },
      })),
    },
  });
  if (!response.ok()) throw new Error(`Synthetic manager fixture write failed: ${response.status()}.`);
}
export function managerPair(owner: string, peer: string, from: string, state: string, updatedAt: number, epoch = 1) {
  const a = owner < peer ? owner : peer;
  const b = a === owner ? peer : owner;
  return {
    format: 1,
    a,
    b,
    participants: [a, b],
    from,
    state,
    epoch,
    inviteSlot: null,
    createdAt: new Date(updatedAt - 100000),
    updatedAt: new Date(updatedAt),
  };
}
export function pairPath(owner: string, peer: string) {
  return `friendPairs/${[owner, peer].sort().join('~')}`;
}
export async function seedManager(request: APIRequestContext, uid: string) {
  const prefix = `qa-${uid.slice(0, 10)}`;
  const now = Date.now();
  const avatar = { version: 1, seed: 'c'.repeat(32), palette: 'sky' };
  const names = Array.from({ length: 45 }, (_, index) =>
    index === 0
      ? 'QA AlexandraTheExtraordinarilyLongSingleWordPlayerName000'
      : `QA Friend ${String(index).padStart(2, '0')}`,
  );
  const accepted = names.map((_, index) => `${prefix}-friend-${String(index).padStart(2, '0')}`);
  const sent = Array.from({ length: 20 }, (_, index) => `${prefix}-sent-${String(index).padStart(2, '0')}`);
  const incoming = Array.from({ length: 5 }, (_, index) => `${prefix}-incoming-${index}`);
  const blocked = `${prefix}-blocked`;
  const data: Record<string, Record<string, unknown>> = {
    [`friendSettings/${uid}`]: {
      format: 1,
      enabled: false,
      deleted: false,
      selection: '',
      epoch: 1,
      revision: 1,
      updatedAt: new Date(now),
    },
  };
  for (const [index, peer] of [...accepted, ...sent, ...incoming].entries()) {
    const isAccepted = index < accepted.length;
    const from = incoming.includes(peer) ? peer : uid;
    data[`accountLifecycle/${peer}`] = { state: 'active' };
    data[`friendSettings/${peer}`] = {
      format: 1,
      enabled: false,
      deleted: false,
      selection: '',
      epoch: 1,
      revision: 1,
      updatedAt: new Date(now),
    };
    if (peer !== accepted[2])
      data[`friendIdentities/${peer}`] = {
        format: 1,
        uid: peer,
        displayName: isAccepted ? names[index] : `${incoming.includes(peer) ? 'Incoming' : 'Sent'} ${peer.slice(-2)}`,
        avatar,
        revision: 1,
        updatedAt: new Date(now),
      };
    data[pairPath(uid, peer)] = managerPair(uid, peer, from, isAccepted ? 'accepted' : 'pending', now - index * 1000);
  }
  data[`friendBlocks/${uid}/items/${blocked}`] = { createdAt: new Date(now) };
  const tokens = Array.from({ length: 5 }, () => randomBytes(32).toString('hex'));
  const kinds = ['active', 'consumed', 'active', 'revoked', 'active'];
  const created = [now - 1000, now - 2000, now - inviteLifetime - 1000, now - 4000, now - inviteLifetime + 60000];
  for (const [slot, token] of tokens.entries()) {
    data[`friendInvites/${token}`] = {
      format: 1,
      ownerUid: uid,
      slot,
      displayName: 'QA Manager',
      avatar,
      state: kinds[slot],
      createdAt: new Date(created[slot]!),
      acceptedBy: kinds[slot] === 'consumed' ? accepted[1] : null,
    };
    data[`friendInviteSlots/${uid}/slots/${slot}`] = { token };
  }
  await writeManagerDocuments(request, data);
  return { uid, prefix, names, accepted, sent, incoming, blocked, tokens, now, avatar };
}
