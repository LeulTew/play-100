import { useSyncExternalStore } from 'react';
import type { DeviceCopyRemoval } from '../lib/scoped-library';

/**
 * What the signed-out Account page reports after an account's sign-out and removal, or its deletion, left some of its
 * data on this device: deleteScopedLibrary removed its library, but localStorage refused the rest. The sign-out or
 * deletion itself stands. The retry stays bound to that account, and any sign-in withdraws the offer
 * (OnlineController): that account's next copy is not what the removal left behind.
 */
export interface DeviceLeftovers {
  readonly after: 'sign-out' | 'deletion';
  /** `left` until a retry, `still-left` after one that failed, `removed` once one removed the rest. */
  readonly state: 'left' | 'still-left' | 'removed';
}

let offer: { readonly view: DeviceLeftovers; readonly retry: () => DeviceCopyRemoval } | null = null;
const listeners = new Set<() => void>();

function publish(next: typeof offer): void {
  offer = next;
  for (const listener of listeners) listener();
}

export function reportDeviceLeftovers(after: DeviceLeftovers['after'], retry: () => DeviceCopyRemoval): void {
  publish({ view: { after, state: 'left' }, retry });
}

export function retryDeviceLeftovers(): void {
  const current = offer;
  if (!current || current.view.state === 'removed') return;
  const removed = current.retry().complete;
  publish({ view: { ...current.view, state: removed ? 'removed' : 'still-left' }, retry: current.retry });
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
