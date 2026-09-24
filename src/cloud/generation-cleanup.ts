import { doc, getDocFromServer, runTransaction, writeBatch } from 'firebase/firestore';
import type { DocumentData, DocumentReference } from 'firebase/firestore';

export const INDEXED_RELEASE_BATCH = 3;
export const PRIVATE_RELEASE_BATCH = 2;

export async function runPayloadCleanup(
  maxSteps: number,
  step: () => Promise<number | null>,
  legacy: () => Promise<void>,
  afterStep?: () => Promise<void>,
  allowLegacy = true,
): Promise<void> {
  let confirmed = false;
  for (let index = 0; index < maxSteps; index += 1) {
    let remaining: number | null;
    try {
      remaining = await step();
    } catch (cause) {
      if (
        confirmed ||
        !allowLegacy ||
        !cause ||
        typeof cause !== 'object' ||
        !('code' in cause) ||
        cause.code !== 'permission-denied'
      )
        throw cause;
      console.info('Payload release counters are not yet available; using the legacy cleanup order once.');
      await legacy();
      return;
    }
    confirmed = true;
    if (remaining !== null && afterStep) await afterStep();
    if (remaining === null || remaining === 0) return;
  }
  throw new Error('Some saved copies still need cleanup. Refresh the page, then try again.');
}

export async function releaseIndexedPayload(
  ref: DocumentReference<DocumentData>,
  directory: 'entries' | 'chunks',
  firstIndex: 0 | 1,
  maximum: number,
  afterDeleteBatch?: () => Promise<void>,
): Promise<void> {
  // Public profiles and missing legacy shelf chunks both need access-call headroom.
  const batchSize = INDEXED_RELEASE_BATCH;
  const remaining = (data: DocumentData | undefined): number => {
    if (
      !data ||
      data.status !== 'deleting' ||
      !Number.isSafeInteger(data.uploaded) ||
      data.uploaded < 0 ||
      data.uploaded > maximum
    ) {
      throw new Error('Some saved copies could not be checked. Refresh the page, then try again.');
    }
    return data.uploaded;
  };
  await runPayloadCleanup(
    Math.ceil(maximum / batchSize) + 1,
    () =>
      runTransaction(ref.firestore, async (tx) => {
        const uploaded = remaining((await tx.get(ref)).data());
        if (uploaded === 0) return null;
        const next = Math.max(0, uploaded - batchSize);
        for (let index = next; index < uploaded; index += 1) tx.delete(doc(ref, directory, String(index + firstIndex)));
        tx.update(ref, { uploaded: next });
        return next;
      }),
    async () => {
      const uploaded = remaining((await getDocFromServer(ref)).data());
      for (let start = 0; start < uploaded; start += batchSize) {
        const batch = writeBatch(ref.firestore);
        for (let index = start; index < Math.min(start + batchSize, uploaded); index += 1) {
          batch.delete(doc(ref, directory, String(index + firstIndex)));
        }
        await batch.commit();
        if (afterDeleteBatch) await afterDeleteBatch();
      }
    },
    afterDeleteBatch,
  );
}
