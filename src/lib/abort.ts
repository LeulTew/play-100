export function abortReason(signal: AbortSignal): unknown {
  return signal.reason === undefined ? new DOMException('The operation was aborted.', 'AbortError') : signal.reason;
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal);
}
