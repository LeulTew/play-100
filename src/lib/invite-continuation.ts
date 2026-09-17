const KEY = 'play100.invitation-return.v1';
const lifetime = 30 * 60_000;
export const isInviteCapability = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function saveInviteContinuation(capability: string): void {
  if (!isInviteCapability(capability)) throw new Error('This invitation is invalid.');
  const value = JSON.stringify({ version: 1, capability, expiresAt: Date.now() + lifetime });
  try {
    sessionStorage.setItem(KEY, value);
    if (sessionStorage.getItem(KEY) !== value) throw new Error();
  } catch { throw new Error('This tab cannot keep the invitation through sign-in. Keep the original link and reopen it after signing in.'); }
}
export function clearInviteContinuation(expectedCapability?: string): void {
  try {
    if (expectedCapability !== undefined) {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return;
      let stored: unknown;
      try { stored = JSON.parse(raw); } catch { return; }
      if (!stored || typeof stored !== 'object' || !('capability' in stored) || stored.capability !== expectedCapability) return;
    }
    sessionStorage.removeItem(KEY);
  }
  catch { console.warn('The invitation could not be cleared from this tab. Close it when finished.'); }
}
export function readInviteContinuation(): string | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Object.keys(data).sort().join() !== 'capability,expiresAt,version' ||
      !('version' in data) || data.version !== 1 || !('capability' in data) || !isInviteCapability(data.capability) ||
      !('expiresAt' in data) || typeof data.expiresAt !== 'number' || data.expiresAt < Date.now() || data.expiresAt > Date.now() + lifetime) throw new Error();
    return data.capability;
  } catch { clearInviteContinuation(); return null; }
}
export function captureInviteContinuation(): { capability: string | null; error: string } {
  if (location.pathname !== '/invite') return { capability: null, error: '' };
  const fragment = location.hash.slice(1);
  if (!fragment) {
    try { return { capability: readInviteContinuation(), error: '' }; }
    catch { return { capability: null, error: 'This tab cannot restore the invitation. Reopen the original link after signing in.' }; }
  }
  history.replaceState(null, '', '/invite');
  if (!isInviteCapability(fragment)) return { capability: null, error: 'This invitation link is invalid.' };
  try { saveInviteContinuation(fragment); return { capability: fragment, error: '' }; }
  catch (cause) { return { capability: fragment, error: cause instanceof Error ? cause.message : 'Keep the original invitation before signing in.' }; }
}
export function createInviteUrl(capability: string): string {
  if (!isInviteCapability(capability)) throw new Error('This invitation is invalid.');
  return `${location.origin}/invite#${capability}`;
}
