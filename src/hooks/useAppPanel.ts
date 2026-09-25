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

export function useAppPanel(scope: string, opening: boolean) {
  const [panel, commit] = useState<AppPanel>(null);
  const [message, setMessage] = useState({ text: '', error: false });
  const [panelFailure, setPanelFailure] = useState<'about' | 'settings' | null>(null);
  const generation = useRef(0);
  const alive = useRef(true);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prefetchStop = useRef<(() => void) | undefined>(undefined);
  const settledScope = useRef<string | null>(opening ? null : scope);
  const [panelFromMenu, setPanelFromMenu] = useState(false);
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
  const openPanel = useCallback((next: AppPanel) => {
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
    const title = next === 'about' ? 'credits' : 'Settings';
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
          setMessage({ text: `${next === 'about' ? 'Credits' : title} didn't load.`, error: true });
          setPanelFailure(next);
        }
      });
  }, []);
  const setPanel = useCallback(
    (next: AppPanel) => {
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
    const intent = (event: Event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('.menu-nav, .mobile-nav button[aria-haspopup="dialog"], .menu-dialog, .site-footer')
      )
        warm();
    };
    for (const name of ['pointerover', 'focusin', 'pointerdown']) document.addEventListener(name, intent, true);
    window.addEventListener('popstate', cancel);
    window.addEventListener('play100:navigate', cancel);
    window.addEventListener('keydown', escape);
    const info = new URLSearchParams(location.search).get('info');
    if (info === 'credits' || info === 'settings') {
      setPanelFromMenu(true);
      urlIntentActive.current = true;
      openPanel(info === 'credits' ? 'about' : 'settings');
    }
    return () => {
      alive.current = false;
      generation.current += 1;
      clearTimeout(noticeTimer.current);
      prefetchStop.current?.();
      for (const name of ['pointerover', 'focusin', 'pointerdown']) document.removeEventListener(name, intent, true);
      window.removeEventListener('popstate', cancel);
      window.removeEventListener('play100:navigate', cancel);
      window.removeEventListener('keydown', escape);
    };
  }, [cancel, openPanel, warm]);
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
    panelMessage: message.text,
    panelMessageError: message.error,
    panelFailure,
    dismissPanelMessage,
    panelFromMenu,
  };
}
