import { createSearch, PAGE_PATHS, parseUrl } from './url';

export const GOOGLE_REDIRECT_KEY = 'play100.google-redirect.v1';
export const GOOGLE_INTENT_LIFETIME = 15 * 60 * 1000;
export type GoogleRequest =
  | { kind: 'sign-in'; uid: null }
  | { kind: 'link'; uid: string }
  | { kind: 'reauthenticate'; uid: string; target: 'copy' | 'account'; epoch: number };
export type GoogleRedirectIntent = GoogleRequest & {
  version: 1; requestId: string; createdAt: number; returnPath: string;
};
const storageError = 'Google needs temporary storage in this tab to return safely. Use email or keep using this device; no library data was changed.';

export function googleReturnPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value) || value.length > 1024) return '/account';
  const url = new URL(value, 'https://play-100-collection.vercel.app');
  if (!Object.values(PAGE_PATHS).includes(url.pathname) && !/^\/u\/[a-z][a-z0-9_]{2,23}$/.test(url.pathname)) return '/account';
  const { filters, game } = parseUrl(url.search);
  return `${url.pathname}${createSearch(filters, game && /^[a-zA-Z0-9:_-]{1,240}$/.test(game) ? game : null)}`;
}

export function parseGoogleIntent(raw: string | null, now = Date.now()): GoogleRedirectIntent | null {
  if (raw === null) return null;
  if (raw.length > 2048) throw new Error('The Google return request is invalid. Start again from Account.');
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error('The Google return request is unreadable. Start again from Account.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The Google return request is invalid. Start again from Account.');
  const data = value as Record<string, unknown>;
  const common = ['version', 'requestId', 'createdAt', 'returnPath', 'kind', 'uid'];
  const keys = data.kind === 'reauthenticate' ? [...common, 'target', 'epoch'] : common;
  if (Object.keys(data).some((key) => !keys.includes(key)) || data.version !== 1 ||
    typeof data.requestId !== 'string' || !/^[a-f0-9]{32}$/.test(data.requestId) ||
    typeof data.createdAt !== 'number' || !Number.isSafeInteger(data.createdAt) || data.createdAt > now + 5000 || now - data.createdAt > GOOGLE_INTENT_LIFETIME ||
    typeof data.returnPath !== 'string' || googleReturnPath(data.returnPath) !== data.returnPath) {
    throw new Error('The Google return request expired or is invalid. Start again from Account.');
  }
  const commonIntent = { version: 1 as const, requestId: data.requestId, createdAt: data.createdAt, returnPath: data.returnPath };
  if (data.kind === 'sign-in' && data.uid === null) return { ...commonIntent, kind: 'sign-in', uid: null };
  if (typeof data.uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.uid)) throw new Error('The Google account request is invalid. Nothing was changed.');
  if (data.kind === 'link') return { ...commonIntent, kind: 'link', uid: data.uid };
  if (data.kind === 'reauthenticate' && (data.target === 'copy' || data.target === 'account') && typeof data.epoch === 'number' && Number.isSafeInteger(data.epoch) && data.epoch >= 0) return { ...commonIntent, kind: 'reauthenticate', uid: data.uid, target: data.target, epoch: data.epoch };
  throw new Error('The Google account action is invalid. Nothing was changed.');
}

export function readGoogleIntent(): { raw: string | null; intent: GoogleRedirectIntent | null; error: string } {
  let raw: string | null;
  try { raw = sessionStorage.getItem(GOOGLE_REDIRECT_KEY); }
  catch { return { raw: null, intent: null, error: storageError }; }
  try { return { raw, intent: parseGoogleIntent(raw), error: '' }; }
  catch (cause) { return { raw, intent: null, error: cause instanceof Error ? cause.message : 'The Google return request is invalid.' }; }
}

export function writeGoogleIntent(request: GoogleRequest, returnPath: string): { intent: GoogleRedirectIntent; raw: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const intent: GoogleRedirectIntent = {
    ...request, version: 1, requestId: [...bytes].map((value) => value.toString(16).padStart(2, '0')).join(''),
    createdAt: Date.now(), returnPath: googleReturnPath(returnPath),
  };
  const raw = JSON.stringify(intent);
  parseGoogleIntent(raw);
  try {
    sessionStorage.setItem(GOOGLE_REDIRECT_KEY, raw);
    if (sessionStorage.getItem(GOOGLE_REDIRECT_KEY) !== raw) throw new Error(storageError);
  } catch { throw new Error(storageError); }
  return { intent, raw };
}

export function clearGoogleIntent(raw: string | null): void {
  if (raw === null) return;
  try {
    if (sessionStorage.getItem(GOOGLE_REDIRECT_KEY) === raw) sessionStorage.removeItem(GOOGLE_REDIRECT_KEY);
  } catch { throw new Error('Google returned, but this tab could not clear its temporary request. Reload Account before starting another Google action.'); }
}

export function validateGoogleReturn(intent: GoogleRedirectIntent, result: { uid: string; providerId: string | null; operationType: string }, currentUid: string | null): void {
  const operation = { 'sign-in': 'signIn', link: 'link', reauthenticate: 'reauthenticate' }[intent.kind];
  if (result.providerId !== 'google.com' || result.operationType !== operation ||
    result.uid !== currentUid || (intent.uid !== null && intent.uid !== result.uid)) {
    throw new Error('Google did not confirm the requested account and action. Nothing was deleted or copied. Review Account before trying again.');
  }
}
