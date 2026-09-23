import { describe, expect, it } from 'vitest';
import { captureScopeNavigation } from './useNavigationScope';

describe('navigation and library scope guard', () => {
  it('retains same-scope, same-navigation work across unrelated rerenders', () => {
    const scope = { current: 2 };
    const navigation = { current: 4 };
    const current = captureScopeNavigation(scope, navigation);
    expect(current()).toBe(true);
    expect(captureScopeNavigation(scope, navigation)()).toBe(true);
    expect(current()).toBe(true);
  });

  it.each(['scope', 'navigation'] as const)('invalidates pending work when %s changes', kind => {
    const scope = { current: 2 };
    const navigation = { current: 4 };
    const current = captureScopeNavigation(scope, navigation);
    (kind === 'scope' ? scope : navigation).current += 1;
    expect(current()).toBe(false);
    expect(captureScopeNavigation(scope, navigation)()).toBe(true);
  });

  it('does not revive old work after an account roundtrip or navigation Back', () => {
    const scope = { current: 0 };
    const navigation = { current: 0 };
    const before = captureScopeNavigation(scope, navigation);
    scope.current += 1;
    const account = captureScopeNavigation(scope, navigation);
    scope.current += 1;
    navigation.current += 2;
    expect(before()).toBe(false);
    expect(account()).toBe(false);
    expect(captureScopeNavigation(scope, navigation)()).toBe(true);
  });
});
