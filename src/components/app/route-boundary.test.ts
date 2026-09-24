import { describe, expect, it } from 'vitest';
import type { AppPage } from '../../lib/types';
import { routeBoundaryKey } from './route-boundary';

describe('routeBoundaryKey', () => {
  it('keeps one My games workspace across its legacy paths and tabs', () => {
    const personal = (['games', 'library', 'rankings'] as AppPage[]).map((route) =>
      routeBoundaryKey(route, 'personal', 'guest'),
    );
    expect(new Set(personal)).toEqual(new Set(['personal:guest']));
  });

  it('still resets across other routes and library scopes', () => {
    expect(routeBoundaryKey('discover', 'discover', 'guest')).toBe('discover:guest');
    expect(routeBoundaryKey('collection', 'collection', 'guest')).toBe('collection:guest');
    expect(routeBoundaryKey('library', 'private-library', 'guest')).toBe('library:guest');
    expect(routeBoundaryKey('library', 'personal', 'guest')).not.toBe(
      routeBoundaryKey('discover', 'discover', 'guest'),
    );
    expect(routeBoundaryKey('library', 'personal', 'guest')).not.toBe(
      routeBoundaryKey('library', 'personal', 'user-1'),
    );
  });
});
