import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadSecondaryDialog,
  loadSecondaryDialogs,
  secondaryDialogReady,
  secondaryDialogsStarted,
} from '../lib/secondary-dialogs';
import type { AppPanel } from '../lib/secondary-dialogs';
import { scheduleIdlePrefetch } from '../lib/idle-prefetch';

function clearPanelIntent() {
  const url = new URL(location.href);
  if (!['credits', 'settings'].includes(url.searchParams.get('info') ?? '')) return;
  url.searchParams.delete('info');
  history.replaceState(history.state, '', url);
}

/** A Credits or Settings link opens its dialog as the Menu would, so closing it returns focus to the Menu button. */
function panelIntentFromUrl() {
  const info = new URLSearchParams(location.search).get('info');
  return info === 'credits' ? 'about' : info === 'settings' ? 'settings' : null;
}

/** A linked dialog whose module is already loaded opens with the first render. */
function readyPanelFromUrl(): AppPanel {
  const intent = panelIntentFromUrl();
  return intent && secondaryDialogReady(intent) ? intent : null;
}

export function useAppPanel(scope: string, opening: boolean) {
  const [panel, commit] = useState<AppPanel>(readyPanelFromUrl);
  const panelOpener = useRef<HTMLElement | null>(null);
  const accountOpener = useRef<HTMLElement | null>(null);
  const getPanelOpener = useCallback(() => panelOpener.current, []);
  const [message, setMessage] = useState({ text: '', error: false });
  const [panelFailure, setPanelFailure] = useState<'about' | 'settings' | null>(null);
  const generation = useRef(0);
  const alive = useRef(true);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prefetchStop = useRef<(() => void) | undefined>(undefined);
  const settledScope = useRef<string | null>(opening ? null : scope);
  const [panelFromMenu, setPanelFromMenu] = useState(() => panelIntentFromUrl() !== null);
  const urlIntentActive = useRef(false);
  const dismissPanelMessage = useCallback(() => {
    if (panelFailure) {
      urlIntentActive.current = false;
      clearPanelIntent();
    }
    setMessage({ text: '', error: false });
    setPanelFailure(null);
  }, [panelFailure]);
  const warm = useCallback(() => {
    if (secondaryDialogsStarted()) return;
    prefetchStop.current?.();
    prefetchStop.current = scheduleIdlePrefetch(loadSecondaryDialogs, 150, 'intent');
  }, []);
  const loadPanel = useCallback((next: 'about' | 'settings', request: number) => {
    const title = next === 'about' ? 'About & credits' : 'Settings';
    noticeTimer.current = setTimeout(() => {
      if (alive.current && generation.current === request) setMessage({ text: `Opening ${title}…`, error: false });
    }, 500);
    void loadSecondaryDialog(next)
      .then(() => {
        if (!alive.current || generation.current !== request) return;
        clearTimeout(noticeTimer.current);
        setMessage({ text: '', error: false });
        urlIntentActive.current = false;
        commit(next);
      })
      .catch((error) => {
        console.error(
          'The requested dialog could not load.',
          error instanceof Error ? error.message : 'Unknown module error.',
        );
        if (alive.current && generation.current === request) {
          clearTimeout(noticeTimer.current);
          setMessage({ text: `${title} didn't load.`, error: true });
          setPanelFailure(next);
        }
      });
  }, []);
  const openPanel = useCallback(
    (next: AppPanel) => {
      const request = ++generation.current;
      clearTimeout(noticeTimer.current);
      setMessage({ text: '', error: false });
      setPanelFailure(null);
      if (secondaryDialogReady(next)) {
        urlIntentActive.current = false;
        commit(next);
        return;
      }
      if (next !== 'about' && next !== 'settings') return;
      loadPanel(next, request);
    },
    [loadPanel],
  );
  const setPanel = useCallback(
    (next: AppPanel, opener?: HTMLElement) => {
      if (next && !panel) {
        const focused = document.activeElement;
        panelOpener.current =
          opener ??
          (next === 'account' ? accountOpener.current : null) ??
          (focused instanceof HTMLElement && focused !== document.body ? focused : null);
      }
      accountOpener.current = null;
      setPanelFromMenu(next === 'menu' || Boolean(next && panel && panelFromMenu));
      urlIntentActive.current = false;
      clearPanelIntent();
      openPanel(next);
    },
    [openPanel, panel, panelFromMenu],
  );
  const cancel = useCallback(() => {
    generation.current += 1;
    clearTimeout(noticeTimer.current);
    setMessage({ text: '', error: false });
    setPanelFailure(null);
    urlIntentActive.current = false;
    clearPanelIntent();
  }, []);
  useEffect(() => {
    if (panel === 'menu') warm();
  }, [panel, warm]);
  useEffect(() => {
    alive.current = true;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('dialog[open]')) cancel();
    };
    // Intent to open a dialog: the Menu buttons, the menu itself, or the footer's About and Effects buttons.
    const intent = (event: Event) => {
      const target = event.target;
      if (event.type === 'pointerdown' || event.type === 'focusin') {
        const account = target instanceof Element ? target.closest<HTMLElement>('.account-nav') : null;
        if (account) accountOpener.current = account;
      }
      if (
        target instanceof Element &&
        target.closest('.menu-nav, .mobile-nav button[aria-haspopup="dialog"], .menu-dialog, .site-footer button')
      )
        warm();
    };
    for (const name of ['pointerover', 'focusin', 'pointerdown']) document.addEventListener(name, intent, true);
    // Browser Back or Forward closes an open dialog rather than changing the page beneath it, as the Menu does (UX-027).
    // The app's own popstate events (a Google return path) are untrusted and leave the dialog open.
    const back = (event: Event) => {
      cancel();
      if (event.isTrusted) commit(null);
    };
    window.addEventListener('popstate', back);
    window.addEventListener('play100:navigate', cancel);
    window.addEventListener('keydown', escape);
    // panel and panelFromMenu start from this intent (readyPanelFromUrl, panelIntentFromUrl); a dialog that isn't loaded yet loads now.
    const linked = panelIntentFromUrl();
    if (linked && !secondaryDialogReady(linked)) {
      urlIntentActive.current = true;
      loadPanel(linked, ++generation.current);
    }
    return () => {
      alive.current = false;
      generation.current += 1;
      clearTimeout(noticeTimer.current);
      prefetchStop.current?.();
      for (const name of ['pointerover', 'focusin', 'pointerdown']) document.removeEventListener(name, intent, true);
      window.removeEventListener('popstate', back);
      window.removeEventListener('play100:navigate', cancel);
      window.removeEventListener('keydown', escape);
    };
  }, [cancel, loadPanel, warm]);
  useEffect(() => {
    if (opening || settledScope.current === scope) return;
    const previous = settledScope.current;
    settledScope.current = scope;
    if (previous === null) return;
    if (urlIntentActive.current) {
      cancel();
      commit(null);
    }
  }, [scope, opening, cancel]);
  return {
    panel,
    setPanel,
    getPanelOpener,
    panelMessage: message.text,
    panelMessageError: message.error,
    panelFailure,
    dismissPanelMessage,
    panelFromMenu,
  };
}
