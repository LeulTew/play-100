import type { PopupRedirectResolver } from 'firebase/auth';

type ResolverClass = new () => { readonly [member: string]: unknown };

/**
 * Firebase Auth preloads Google's gapi script and its hidden authDomain iframe while it starts on mobile browsers and
 * Safari, so that a later popup can open within the click's activation, and Auth is not ready until that preload
 * settles. Play 100 signs in only with full-page redirects, so the preload only made every Account start wait on
 * Google's network, and a stalled script load has no timeout. This resolver keeps the desktop behaviour everywhere:
 * the iframe loads only when a pending redirect result has to be read.
 */
export function redirectOnlyResolver(resolver: PopupRedirectResolver): PopupRedirectResolver {
  // Auth instantiates the resolver class itself. A non-class placeholder (the SDK's non-browser build) passes through.
  if (typeof resolver !== 'function') return resolver;
  const Resolver = resolver as unknown as ResolverClass;
  class RedirectOnlyResolver extends Resolver {
    get _shouldInitProactively(): boolean {
      return false;
    }
  }
  return RedirectOnlyResolver as unknown as PopupRedirectResolver;
}
