import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompareRoute, onlineLocation, readOnlineLocation, subscribeOnlineLocation } from './online-location';

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

describe("Compare's route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  function at(search: string, pathname = '/compare') {
    const place = { pathname, search };
    vi.stubGlobal('window', Object.assign(new EventTarget(), { location: place }));
    const navigate = (nextSearch: string, event: 'popstate' | 'play100:navigate' = 'play100:navigate') => {
      place.search = nextSearch;
      window.dispatchEvent(new Event(event));
    };
    return { place, navigate };
  }

  it('opens afresh at each navigation that changes the group the URL names', () => {
    const { navigate } = at('?group=six');
    const route = new CompareRoute();
    const changes = vi.fn();
    expect(route.getSnapshot()).toBe(0);
    const unsubscribe = route.subscribe(changes);
    navigate('?group=six&game=alpha');
    expect(route.getSnapshot()).toBe(0);
    navigate('?catalogs=off');
    expect(route.getSnapshot()).toBe(1);
    navigate('?group=six', 'popstate');
    expect(route.getSnapshot()).toBe(2);
    expect(changes).toHaveBeenCalledTimes(2);
    unsubscribe();
    navigate('?group=two');
    expect(route.getSnapshot()).toBe(2);
  });

  it("does not take Compare's own ?group= change for a navigation, before or after any later one", () => {
    const { place, navigate } = at('?group=two');
    const route = new CompareRoute();
    const changes = vi.fn();
    route.subscribe(changes);
    // Compare replaces ?group= in place, which fires no event, and reports it.
    place.search = '?group=six';
    route.keep('six');
    expect(route.getSnapshot()).toBe(0);
    navigate('?group=six');
    navigate('?group=six&game=alpha', 'popstate');
    expect(route.getSnapshot()).toBe(0);
    place.search = '';
    route.keep('');
    navigate('');
    expect(route.getSnapshot()).toBe(0);
    navigate('?group=two', 'popstate');
    expect(route.getSnapshot()).toBe(1);
    expect(changes).toHaveBeenCalledOnce();
  });

  it('follows a navigation made after it was first read but before it was subscribed', () => {
    const { place } = at('?group=six');
    const route = new CompareRoute();
    expect(route.getSnapshot()).toBe(0);
    place.search = '?group=two';
    const changes = vi.fn();
    route.subscribe(changes);
    expect(route.getSnapshot()).toBe(1);
    expect(changes).toHaveBeenCalledOnce();
  });
});
