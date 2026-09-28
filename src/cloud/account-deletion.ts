import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AppPage } from '../lib/types';
import type { SyncHead } from '../lib/cloud-types';
import type { CloudStore, DeletionCopyState } from './cloud-store';
import type { AccountIdentity } from './ui-types';

export interface GoogleDeletionApproval {
  requestId: string;
  uid: string;
  target: 'copy' | 'account';
  epoch: number;
  sessionEpoch: number;
  startedAt: number;
  expiresAt: number;
}
export interface DeletionNotice {
  key: string;
  state: DeletionCopyState;
}
export interface DeletionProbe {
  key: string;
  result: Promise<DeletionCopyState>;
}
export function currentDeletionApproval(
  approval: GoogleDeletionApproval | null,
  uid: string | undefined,
  sessionEpoch: number,
  epoch: number,
): GoogleDeletionApproval | null {
  return approval?.uid === uid && approval?.sessionEpoch === sessionEpoch && approval.epoch === epoch ? approval : null;
}
export function deletionApprovalMatches(
  approval: GoogleDeletionApproval | null,
  uid: string,
  target: 'copy' | 'account',
  sessionEpoch: number,
  epoch: number,
  now: number,
): approval is GoogleDeletionApproval {
  return Boolean(
    currentDeletionApproval(approval, uid, sessionEpoch, epoch) &&
    approval?.target === target &&
    approval.expiresAt > now,
  );
}
export function expireDeletionApproval(approval: GoogleDeletionApproval | null, requestId: string) {
  return approval?.requestId === requestId ? null : approval;
}
export function deletionOwnerMatches(
  uid: string,
  authUid: string | undefined,
  identityUid: string | undefined,
  sessionEpoch: number,
  currentSessionEpoch: number,
): boolean {
  return authUid === uid && identityUid === uid && currentSessionEpoch === sessionEpoch;
}
export function deletionProbeKey(uid: string, sessionEpoch: number, head: Pick<SyncHead, 'epoch' | 'revision'>) {
  return `${uid}:${sessionEpoch}:${head.epoch}:${head.revision}`;
}
export function deletionCopyState(
  head: SyncHead | null,
  notice: DeletionNotice | null,
  key: string | null,
): DeletionCopyState | 'checking' {
  return head?.deleted && head.cleanupEpoch === head.epoch
    ? 'complete'
    : notice && notice.key === key
      ? notice.state
      : 'checking';
}
export function deletionProbeFor(
  cached: DeletionProbe | null,
  key: string,
  read: () => Promise<DeletionCopyState>,
): DeletionProbe {
  return cached?.key === key ? cached : { key, result: read() };
}
export function useAccountDeletionState() {
  const [approval, setApproval] = useState<GoogleDeletionApproval | null>(null);
  const [notice, setNotice] = useState<DeletionNotice | null>(null);
  const probe = useRef<DeletionProbe | null>(null);
  return { approval, setApproval, notice, setNotice, probe };
}
export function useDeletionApprovalExpiry(
  page: AppPage,
  approval: GoogleDeletionApproval | null,
  setApproval: Dispatch<SetStateAction<GoogleDeletionApproval | null>>,
) {
  useEffect(() => {
    if (page !== 'account') setApproval(null);
  }, [page, setApproval]);
  useEffect(() => {
    if (!approval) return;
    const requestId = approval.requestId;
    const timeout = window.setTimeout(
      () => setApproval((current) => expireDeletionApproval(current, requestId)),
      Math.max(0, approval.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [approval, setApproval]);
}
export function useDeletionProbe({
  page,
  identity,
  sessionEpoch,
  head,
  busy,
  store,
  state: { probe: deletionProbeRef, notice, setNotice },
}: {
  page: AppPage;
  identity: AccountIdentity | null | undefined;
  sessionEpoch: number;
  head: SyncHead | null;
  busy: boolean;
  store: Pick<CloudStore, 'probeDeletedCopy'> | null;
  state: ReturnType<typeof useAccountDeletionState>;
}) {
  const key =
    page === 'account' && identity?.verified && head?.deleted
      ? deletionProbeKey(identity.uid, sessionEpoch, head)
      : null;
  useEffect(() => {
    if (!key) {
      deletionProbeRef.current = null;
      setNotice(null);
      return;
    }
    if (busy || !store || (head?.deleted && head.cleanupEpoch === head.epoch)) return;
    let alive = true;
    const probe = deletionProbeFor(deletionProbeRef.current, key, () => store.probeDeletedCopy());
    deletionProbeRef.current = probe;
    void probe.result.then((state) => {
      if (alive && deletionProbeRef.current === probe) setNotice({ key, state });
    });
    return () => {
      alive = false;
    };
  }, [key, busy, store, head?.cleanupEpoch, head?.epoch, head?.deleted, deletionProbeRef, setNotice]);
  return deletionCopyState(head, notice, key);
}
