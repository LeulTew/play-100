import { useSyncExternalStore } from 'react';

/** Removes what stayed of an account, as far as it can: complete once none of it is left on this device. */
type LeftoverRetry = () => { readonly complete: boolean } | Promise<{ readonly complete: boolean }>;

/**
 * What the signed-out Account page reports after an account's sign-out and removal, or its deletion, left some of its
 * data on this device: localStorage refused part of it, or, for a deletion, the device database refused the removal.
 * The sign-out or deletion itself stands. The retry stays bound to that account, and any sign-in withdraws the offer
 * (OnlineController): that account's next copy is not what the removal left behind.
 */
export interface DeviceLeftovers {
  readonly after: 'sign-out' | 'deletion';
  /** `left` until a retry, `still-left` after one that failed, `removed` once one removed the rest. */
  readonly state: 'left' | 'still-left' | 'removed';
}

let offer: { readonly view: DeviceLeftovers; readonly retry: LeftoverRetry } | null = null;
const listeners = new Set<() => void>();

function publish(next: typeof offer): void {
  offer = next;
  for (const listener of listeners) listener();
}

export function reportDeviceLeftovers(after: DeviceLeftovers['after'], retry: LeftoverRetry): void {
  publish({ view: { after, state: 'left' }, retry });
}

/**
 * Retries the removal. A retry that waits on the device database settles later: the returned promise resolves once the
 * offer shows its outcome. An outcome for an offer since withdrawn or replaced is dropped.
 */
export function retryDeviceLeftovers(): Promise<void> | undefined {
  const current = offer;
  if (!current || current.view.state === 'removed') return undefined;
  const settle = (removed: boolean) => {
    if (offer?.retry !== current.retry) return;
    publish({ view: { ...current.view, state: removed ? 'removed' : 'still-left' }, retry: current.retry });
  };
  const result = current.retry();
  if (!(result instanceof Promise)) {
    settle(result.complete);
    return undefined;
  }
  return result.then(
    (removal) => settle(removal.complete),
    () => settle(false),
  );
}

export function withdrawDeviceLeftovers(): void {
  if (offer) publish(null);
}

export function deviceLeftovers(): DeviceLeftovers | null {
  return offer?.view ?? null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDeviceLeftovers(): DeviceLeftovers | null {
  return useSyncExternalStore(subscribe, deviceLeftovers, deviceLeftovers);
}
