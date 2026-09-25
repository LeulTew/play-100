import type { PopupRedirectResolver } from 'firebase/auth';
import { describe, expect, it } from 'vitest';
import { redirectOnlyResolver } from './redirect-resolver';

// Stands in for Firebase's browser resolver class: Auth creates one instance of it and reads these members.
class ProactiveResolver {
  readonly _redirectPersistence = 'session';
  get _shouldInitProactively(): boolean {
    return true;
  }
  _initialize(): string {
    return 'iframe';
  }
}

describe('redirect-only Firebase resolver', () => {
  it('keeps every resolver member except the start-up preload', () => {
    const input = ProactiveResolver as unknown as PopupRedirectResolver;
    const Resolver = redirectOnlyResolver(input) as unknown as typeof ProactiveResolver;
    const instance = new Resolver();
    expect(instance).toBeInstanceOf(ProactiveResolver);
    expect(instance._shouldInitProactively).toBe(false);
    expect(instance._redirectPersistence).toBe('session');
    expect(instance._initialize()).toBe('iframe');
    expect(new ProactiveResolver()._shouldInitProactively).toBe(true);
  });

  it('passes a non-class placeholder through unchanged', () => {
    const placeholder = { unavailable: true } as unknown as PopupRedirectResolver;
    expect(redirectOnlyResolver(placeholder)).toBe(placeholder);
  });
});
