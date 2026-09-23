import { doc, getDocFromServer, runTransaction, writeBatch } from 'firebase/firestore';
import type { DocumentData, DocumentReference } from 'firebase/firestore';

export const PAYLOAD_RELEASE_BATCH = 4;

export async function runPayloadCleanup(
  maxSteps: number, step: () => Promise<number | null>, legacy: () => Promise<void>, afterStep?: () => Promise<void>,
): Promise<void> {
  let confirmed = false;
  for (let index = 0; index < maxSteps; index += 1) {
    let remaining: number | null;
    try { remaining = await step(); }
    catch (cause) {
      if (confirmed || !cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'permission-denied') throw cause;
      console.info('Payload release counters are not yet available; using the legacy cleanup order once.');
      await legacy();
      return;
    }
    confirmed = true;
    if (remaining !== null && afterStep) await afterStep();
    if (remaining === null || remaining === 0) return;
  }
  throw new Error('Payload cleanup did not reach its bounded release limit. Retry cleanup before removing this generation.');
}

export async function releaseIndexedPayload(
  ref: DocumentReference<DocumentData>, directory: 'entries' | 'chunks', firstIndex: 0 | 1,
  maximum: number, afterDeleteBatch?: () => Promise<void>,
): Promise<void> {
  // Missing legacy shelf chunks require an extra parent-existence rule read.
  const batchSize = directory === 'chunks' ? 3 : PAYLOAD_RELEASE_BATCH;
  const remaining = (data: DocumentData | undefined): number => {
    if (!data || data.status !== 'deleting' || !Number.isSafeInteger(data.uploaded) || data.uploaded < 0 || data.uploaded > maximum) {
      throw new Error('Payload cleanup metadata changed or is invalid. Nothing further was removed.');
    }
    return data.uploaded;
  };
  await runPayloadCleanup(Math.ceil(maximum / batchSize) + 1, () => runTransaction(ref.firestore, async tx => {
    const uploaded = remaining((await tx.get(ref)).data());
    if (uploaded === 0) return null;
    const next = Math.max(0, uploaded - batchSize);
    for (let index = next; index < uploaded; index += 1) tx.delete(doc(ref, directory, String(index + firstIndex)));
    tx.update(ref, { uploaded: next });
    return next;
  }), async () => {
    const uploaded = remaining((await getDocFromServer(ref)).data());
    for (let start = 0; start < uploaded; start += batchSize) {
      const batch = writeBatch(ref.firestore);
      for (let index = start; index < Math.min(start + batchSize, uploaded); index += 1) {
        batch.delete(doc(ref, directory, String(index + firstIndex)));
      }
      await batch.commit();
      if (afterDeleteBatch) await afterDeleteBatch();
    }
  }, afterDeleteBatch);
}
