export type SyncFailure = 'transient' | 'quota' | 'blocked';

export function syncFailure(cause: unknown): SyncFailure {
  const code = cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string' ? cause.code.replace(/^firestore\//, '') : '';
  if (code === 'resource-exhausted' || code === 'auth/too-many-requests') return 'quota';
  if (['unavailable', 'deadline-exceeded', 'aborted', 'cancelled', 'auth/network-request-failed'].includes(code)) return 'transient';
  if (cause instanceof Error && (cause.name === 'NetworkError' || (cause.name === 'TypeError' && /failed to fetch|networkerror|load failed/i.test(cause.message)))) return 'transient';
  return 'blocked';
}

export function retryDelay(kind: Exclude<SyncFailure, 'blocked'>, failures: number, random = Math.random()): number {
  const base = kind === 'quota' ? 60_000 : 2_000;
  const cap = kind === 'quota' ? 30 * 60_000 : 60_000;
  return Math.min(cap, Math.max(base, Math.round(base * 2 ** Math.min(Math.max(failures - 1, 0), 12) * (0.8 + Math.max(0, Math.min(1, random)) * 0.4))));
}

/** One clock and one operation per scope. Edits cannot shorten a failure cooldown. */
export class SyncWorkQueue {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private due: number | null = null;
  private running = false;
  private disposed = false;
  private available = true;
  private failure: SyncFailure | null = null;
  private failures = 0;
  private retryAt = 0;
  private waiters: Array<() => void> = [];
  constructor(private readonly work: () => Promise<void>, private readonly onError: (cause: unknown) => void) {}

  get busy(): boolean { return this.running; }
  get reason(): SyncFailure | null { return this.failure; }
  get nextAttemptAt(): number | null { return this.due; }

  request(delay = 0, debounce = false): void {
    if (this.disposed || this.failure === 'blocked') return;
    const at = this.failure ? Math.max(Date.now(), this.retryAt) : Date.now() + delay;
    this.due = this.due === null || (debounce && !this.failure) ? at : Math.min(this.due, at);
    this.arm();
  }
  failed(kind: SyncFailure): void {
    if (this.disposed) return;
    this.failures = this.failure === kind ? this.failures + 1 : 1;
    this.failure = kind;
    this.clearTimer();
    this.settle();
    if (kind === 'blocked') { this.due = null; return; }
    this.retryAt = Date.now() + retryDelay(kind, this.failures);
    this.due = this.retryAt;
    this.arm();
  }
  succeeded(cancelQueued = false): void {
    this.failure = null; this.failures = 0; this.retryAt = 0;
    if (cancelQueued) { this.due = null; this.clearTimer(); }
  }
  setAvailable(available: boolean): void {
    this.available = available;
    if (!available) { this.clearTimer(); this.settle(); }
    else this.arm();
  }
  wake(): void {
    if (this.disposed || this.failure === 'blocked') return;
    if (this.failure === 'transient') this.retryAt = 0;
    this.request(200);
  }
  retry(): Promise<void> {
    if (this.disposed || !this.available || (this.failure === 'quota' && Date.now() < this.retryAt)) return Promise.resolve();
    if (this.failure === 'blocked') this.succeeded();
    const done = new Promise<void>((resolve) => { this.waiters.push(resolve); });
    if (!this.running) this.wake();
    return done;
  }
  dispose(): void {
    this.disposed = true; this.due = null; this.clearTimer(); this.settle();
  }
  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  private settle(): void { for (const resolve of this.waiters.splice(0)) resolve(); }
  private arm(): void {
    this.clearTimer();
    if (this.disposed || !this.available || this.running || this.due === null || this.failure === 'blocked') return;
    this.timer = setTimeout(() => { void this.execute(); }, Math.max(0, this.due - Date.now()));
  }
  private async execute(): Promise<void> {
    this.timer = null;
    if (this.disposed || !this.available || this.running) return;
    this.due = null; this.running = true;
    try { await this.work(); }
    catch (cause) { if (!this.disposed) this.onError(cause); }
    finally { this.running = false; this.settle(); this.arm(); }
  }
}
