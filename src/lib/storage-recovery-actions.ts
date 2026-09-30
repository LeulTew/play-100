import type { RefObject } from 'react';
import type { OnlineBridge } from '../cloud/ui-types';
import type { LibrarySnapshot } from '../hooks/useLibrary';
import type { LibraryRecord } from './personal-types';
import { loadPersonalLibrary } from './personal-db';
import { temporaryLibraryWarning } from './storage-notices';

export async function retryDeviceLibrary(
  context: {
    temporaryEdits: RefObject<boolean>;
    current: RefObject<LibrarySnapshot>;
    records: RefObject<LibraryRecord[]>;
    publish: (snapshot: LibrarySnapshot) => void;
  },
  discardRevision?: number,
): Promise<void> {
  const { temporaryEdits, current, records, publish } = context;
  if (temporaryEdits.current && discardRevision !== current.current.state.revision) {
    publish({ ...current.current, discardRequired: true });
    throw new Error(
      "This tab has unsaved changes. Export a backup in Settings first, then confirm if you want to discard only this tab's temporary changes and try again. Your saved library has not been changed.",
    );
  }
  const result = await loadPersonalLibrary(records.current).catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : 'The device library could not be saved.';
    const message =
      error instanceof Error && error.name === 'PersonalLibraryBlockedError'
        ? (current.current.warning ?? temporaryLibraryWarning(detail))
        : temporaryLibraryWarning(detail);
    throw new Error(message, { cause: error });
  });
  temporaryEdits.current = false;
  publish({ state: result.state, status: 'ready', warning: result.notice, error: null, canRetry: false });
}

export type RecoveryStage = 'idle' | 'device' | 'account';
const accountRetries = new WeakMap<object, Promise<boolean>>();

export function retryAccountOpening(
  context: Parameters<typeof openAccount>[0],
  openDeviceLibrary: () => Promise<boolean>,
  origin: OnlineBridge | null,
): Promise<boolean> {
  // A retained command (including one waiting for this chunk) never adopts a new account-opening lifetime.
  if (!context.alive.current || !sameOpening(context.currentOnline.current, origin)) return Promise.resolve(false);
  const prior = accountRetries.get(context.hintSequence);
  if (prior) return prior;
  const task = openAccount(context, openDeviceLibrary, origin);
  accountRetries.set(context.hintSequence, task);
  void task.then(() => accountRetries.delete(context.hintSequence));
  return task;
}

function sameOpening(current: OnlineBridge | null, origin: OnlineBridge | null): boolean {
  return (
    current?.identity?.uid === origin?.identity?.uid &&
    current?.scope === origin?.scope &&
    current?.controller?.retryOpen === origin?.controller?.retryOpen
  );
}

async function openAccount(
  context: {
    currentOnline: RefObject<OnlineBridge | null>;
    hintSequence: RefObject<number>;
    alive: RefObject<boolean>;
    setStage: (value: RecoveryStage) => void;
    setChecking: (value: boolean) => void;
    setRequested: (value: boolean) => void;
    reportError: (cause: unknown) => void;
    resolveHint: () => Promise<boolean>;
  },
  openDeviceLibrary: () => Promise<boolean>,
  origin: OnlineBridge | null,
): Promise<boolean> {
  const { currentOnline, hintSequence, alive } = context;
  const sequence = ++hintSequence.current;
  const isCurrent = () =>
    alive.current && sequence === hintSequence.current && sameOpening(currentOnline.current, origin);
  context.setStage('device');
  let finishing = false;
  try {
    // Account discovery must not bypass refusal to replace unsaved temporary edits.
    if (!(await openDeviceLibrary()) || !isCurrent()) return false;
    const requested = await context.resolveHint();
    if (!isCurrent()) return false;
    const controller = origin?.controller;
    if (controller?.retryOpen && !(await controller.retryOpen())) return false;
    if (!isCurrent()) return false;
    if (requested) {
      context.setRequested(true);
      finishing = true;
      context.setStage('account');
    } else context.reportError(null);
    return true;
  } catch (cause: unknown) {
    if (isCurrent()) context.reportError(cause);
    return false;
  } finally {
    if (alive.current) {
      if (!finishing) context.setStage('idle');
      if (isCurrent()) context.setChecking(false);
    }
  }
}
