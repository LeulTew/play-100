import { afterEach, describe, expect, it, vi } from 'vitest';
import { onlineLocation, readOnlineLocation, subscribeOnlineLocation } from './online-location';

describe('the URL the online pages are keyed by', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the Compare group and the friend a URL opens', () => {
    expect(onlineLocation('/compare?group=six&catalogs=off')).toEqual({ pathname: '/compare', group: 'six', peer: '' });
    expect(onlineLocation('/compare?catalogs=off')).toEqual({ pathname: '/compare', group: '', peer: '' });
    expect(onlineLocation('/friends/alpha')).toEqual({ pathname: '/friends/alpha', group: '', peer: 'alpha' });
    expect(onlineLocation('/friends/alpha?catalogs=off')).toMatchObject({ pathname: '/friends/alpha', peer: 'alpha' });
    expect(onlineLocation('/friends')).toEqual({ pathname: '/friends', group: '', peer: '' });
  });

  it("is read again at App's navigations and at Back and Forward, until it is unsubscribed", () => {
    const place = { pathname: '/compare', search: '?group=a' };
    vi.stubGlobal('window', Object.assign(new EventTarget(), { location: place }));
    const seen: string[] = [];
    const unsubscribe = subscribeOnlineLocation(() => seen.push(readOnlineLocation()));
    expect(readOnlineLocation()).toBe('/compare?group=a');
    place.search = '?catalogs=off';
    window.dispatchEvent(new Event('play100:navigate'));
    place.search = '?group=a';
    window.dispatchEvent(new Event('popstate'));
    unsubscribe();
    place.pathname = '/friends/b';
    place.search = '';
    window.dispatchEvent(new Event('popstate'));
    window.dispatchEvent(new Event('play100:navigate'));
    expect(seen).toEqual(['/compare?catalogs=off', '/compare?group=a']);
    expect(readOnlineLocation()).toBe('/friends/b');
  });
});
