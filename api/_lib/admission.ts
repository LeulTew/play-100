export interface AdmissionLimits {
  maxActive: number;
  maxPerWindow: number;
  windowMs: number;
}

export interface Admission {
  /** Returns an idempotent release callback, or null when the caller must be refused. */
  acquire(): (() => void) | null;
}

// Per-instance bounded admission: at most `maxActive` concurrent and `maxPerWindow` admitted per fixed window.
// Serverless instances do not share it, so the Vercel WAF rate-limit rule remains the global control.
export function createAdmission(limits: AdmissionLimits, now: () => number = () => Date.now()): Admission {
  let windowStart = Number.NEGATIVE_INFINITY;
  let admitted = 0;
  let active = 0;
  return {
    acquire() {
      const time = now();
      // A clock that moved backwards also starts a new window instead of refusing until it catches up.
      if (time - windowStart >= limits.windowMs || time < windowStart) { windowStart = time; admitted = 0; }
      if (active >= limits.maxActive || admitted >= limits.maxPerWindow) return null;
      admitted += 1;
      active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active -= 1;
      };
    },
  };
}
