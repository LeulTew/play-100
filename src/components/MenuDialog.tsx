import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { flushPendingEdits } from '../hooks/useExitSave';
import type { AppPage, Filters } from '../lib/types';
import type { MyGamesTab } from '../lib/my-games-navigation';
import { pageDestination } from '../lib/page-navigation';
import { visibleFocusTarget } from '../lib/dialog-focus';
import { DataUseLink } from './DataUseLink';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

interface MenuDialogProps {
  page: AppPage;
  gamesView: MyGamesTab;
  filters: Filters;
  onlineAvailable: boolean;
  creator: boolean;
  onNavigate: (page: AppPage, patch?: Partial<Filters>) => void;
  onSettings: () => void;
  onOffline?: () => void;
  onAbout: () => void;
  onClose: () => void;
  captureFocusGuard: () => () => boolean;
  status?: string;
  statusError?: boolean;
  recovery?: ReactNode;
}

export function MenuDialog({ page, gamesView, filters, onlineAvailable, creator, onNavigate, onSettings, onOffline, onAbout, onClose, captureFocusGuard, status = '', statusError = false, recovery: moduleRecovery }: MenuDialogProps) {
  const active = useRef(true);
  const changing = useRef(false);
  const recovery = useRef<{ target: HTMLElement | null; isCurrent: () => boolean } | null>(null);
  const returnToEditor = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const close = useCallback(() => { returnToEditor.current = false; active.current = false; onClose(); }, [onClose]);
  useEffect(() => {
    active.current = true;
    window.addEventListener('popstate', close);
    window.addEventListener('play100:navigate', close);
    return () => {
      active.current = false;
      window.removeEventListener('popstate', close);
      window.removeEventListener('play100:navigate', close);
    };
  }, [close]);

  const activate = async (commit: () => void) => {
    if (changing.current || !active.current) return;
    changing.current = true;
    setSaving(true);
    setError('');
    recovery.current = null;
    const isCurrent = captureFocusGuard();
    let blockedTarget: HTMLElement | null = null;
    try {
      const saved = await flushPendingEdits(target => { blockedTarget = target; recovery.current = { target, isCurrent }; });
      if (!active.current || !isCurrent()) return;
      if (saved) commit();
      else setError(visibleFocusTarget(blockedTarget)
        ? 'Your edit has not saved. Return to the highlighted rating or note to correct it or retry.'
        : 'Your edit has not saved. Its editor is not visible in this view. Return to the original editor to correct it or retry.');
    } catch (cause) {
      console.error('Menu could not save pending edits before navigation.', cause);
      if (active.current && isCurrent()) {
        recovery.current ??= { target: null, isCurrent };
        setError('Your edit could not be saved. Return to your edit and retry before leaving this page.');
      }
    } finally {
      changing.current = false;
      if (active.current) setSaving(false);
    }
  };
  const getReturnFocus = () => {
    const failed = recovery.current;
    if (!returnToEditor.current || !failed?.isCurrent()) return null;
    if (visibleFocusTarget(failed.target)) return failed.target;
    return [...document.querySelectorAll<HTMLElement>('[data-page-heading], #collection-title')].find(visibleFocusTarget) ?? null;
  };
  const personalPage = ['games', 'library', 'rankings'].includes(page);
  const link = (label: string, next: AppPage, patch: Partial<Filters> = {}, current = page === next) => {
    const destination = pageDestination(next, filters, patch);
    return <li><a href={`${destination.path}${destination.search}`} aria-current={current ? 'page' : undefined} aria-disabled={saving || undefined} onClick={(event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      void activate(() => onNavigate(next, patch));
    }}><span>{label}</span>{current && <small aria-hidden="true">Current</small>}</a></li>;
  };

  return <Dialog open titleId="menu-title" onClose={close} className="menu-dialog" getReturnFocus={getReturnFocus} motion={{ preset: 'dialog', enterMs: 180 }}>
    <h2 id="menu-title" data-autofocus tabIndex={-1}>Menu</h2>
    <div className="menu-feedback">
      <p role="status" className={!saving && status && statusError && !moduleRecovery ? 'inline-error' : undefined}>{saving ? 'Saving your open edit...' : moduleRecovery ? '' : status}</p>
      {moduleRecovery}
      {error && <div role="alert"><p>{error}</p><button className="text-button" onClick={() => {
        returnToEditor.current = true;
        active.current = false;
        onClose();
      }}>Return to edit<Icon name="back" width="17" height="17" /></button></div>}
    </div>
    <nav className="menu-scroll" aria-label="All navigation" aria-busy={saving}>
      <div className="menu-groups">
        <section aria-labelledby="menu-browse">
          <h3 id="menu-browse">Browse</h3>
          <ul className="menu-links">{link('The 100', 'collection')}{link('Discover', 'discover')}</ul>
        </section>
        <section aria-labelledby="menu-games">
          <h3 id="menu-games">My games</h3>
          <ul className="menu-links">
            {link('Library', 'games', {}, personalPage && gamesView === 'library')}
            {link('Queue', 'games', { list: 'later' }, personalPage && gamesView === 'queue')}
            {link('Ranking', 'rankings', {}, personalPage && gamesView === 'ranking')}
          </ul>
        </section>
        {onlineAvailable && <section aria-labelledby="menu-people">
          <h3 id="menu-people">Online sharing</h3>
          <p className="section-help">An account is needed to share or compare with friends.</p>
          <ul className="menu-links">
            {link('Friends', 'friends')}
            {link('Compare', 'compare')}
            {link('Community', 'community')}
            {link('Public ranking', 'publish')}
            {link('Friends sharing', 'friend-sharing')}
            {link('Shared games', 'friend-shelf')}
          </ul>
        </section>}
        <section aria-labelledby="menu-tools">
          <h3 id="menu-tools">Account &amp; tools</h3>
          <ul className="menu-links">
            {onlineAvailable && link('Account', 'account')}
            {onlineAvailable && creator && link('Creator desk', 'creator')}
            <li><button disabled={saving} onClick={() => { void activate(onSettings); }}>Settings &amp; backups</button></li>
            {onOffline && <li><button disabled={saving} onClick={() => { void activate(onOffline); }}>Install &amp; offline access</button></li>}
            <li><DataUseLink /></li>
            <li><button disabled={saving} onClick={() => { void activate(onAbout); }}>About &amp; credits</button></li>
          </ul>
        </section>
        <section aria-labelledby="menu-workbooks">
          <h3 id="menu-workbooks">Workbooks</h3>
          <ul className="menu-links">
            <li><a href="/downloads/Play-100-Collection.xlsx" download>Enhanced spreadsheet<Icon name="download" width="17" height="17" /></a></li>
            <li><a href="/downloads/AAA_games_u_have_to_play_list_top_100.xlsx" download>Original spreadsheet<Icon name="download" width="17" height="17" /></a></li>
          </ul>
        </section>
      </div>
    </nav>
  </Dialog>;
}
