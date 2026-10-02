import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUrlState } from './useUrlState';

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const location = new URL('https://play100.test/?catalogs=off');
  const history = {
    state: null as object | null,
    pushState: vi.fn(),
    replaceState: vi.fn(),
    back: vi.fn(),
  };
  const write = (state: object | null, _title: string, next: string) => {
    history.state = state;
    location.href = new URL(next, location).href;
  };
  history.pushState.mockImplementation(write);
  history.replaceState.mockImplementation(write);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { location, history }));
  const captured: ReturnType<typeof useUrlState>[] = [];
  function Probe() {
    captured.push(useUrlState());
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  const url = captured[0];
  if (!url) throw new Error('URL state did not render.');
  return { url, location, history };
}

describe('detail activation return target', () => {
  it('retains the explicit opener without focusing it or relying on document focus', () => {
    const { url, history } = fixture();
    const element: Pick<HTMLElement, 'focus'> = { focus: vi.fn() };
    const opener = element as HTMLElement;
    url.openGame('red-dead-redemption-2', opener);
    expect(url.getGameOpener()).toBe(opener);
    expect(opener.focus).not.toHaveBeenCalled();
    expect(history.pushState).toHaveBeenCalledOnce();
    url.openGame('mass-effect-2');
    expect(url.getGameOpener()).toBe(opener);
    expect(history.replaceState).toHaveBeenCalledOnce();
    url.closeGame();
    expect(history.back).toHaveBeenCalledOnce();
  });

  it('does not use an earlier opener for another page or an unrelated fresh opening', () => {
    const { url, location } = fixture();
    const element: Pick<HTMLElement, 'focus'> = { focus: vi.fn() };
    const opener = element as HTMLElement;
    url.openGame('red-dead-redemption-2', opener);
    location.pathname = '/discover';
    expect(url.getGameOpener()).toBeNull();
    location.search = '?catalogs=off';
    url.openGame('wikidata:Q15408545');
    expect(url.getGameOpener()).toBeNull();
  });

  it('preserves valid history fields without placing DOM elements in history state', () => {
    const { url, history } = fixture();
    history.state = { selectedTab: 'library' };
    const element: Pick<HTMLElement, 'focus'> = { focus: vi.fn() };
    url.openGame('red-dead-redemption-2', element as HTMLElement);
    expect(history.state).toEqual({ selectedTab: 'library', play100Dialog: true });
  });

  it('closes a direct link with replace instead of navigating back', () => {
    const { url, history, location } = fixture();
    location.search = '?catalogs=off&game=red-dead-redemption-2';
    expect(url.getGameOpener()).toBeNull();
    url.closeGame();
    expect(history.back).not.toHaveBeenCalled();
    expect(history.replaceState).toHaveBeenCalledOnce();
    expect(location.search).toBe('?catalogs=off');
  });
});
