import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSecondaryDialog, loadSecondaryDialogs, secondaryDialogReady } from '../lib/secondary-dialogs';
import type { AppPanel } from '../lib/secondary-dialogs';
import { scheduleIdlePrefetch } from '../lib/idle-prefetch';

export function useAppPanel(captureScope: () => () => boolean, scope: string, opening: boolean) {
  const [panel, commit] = useState<AppPanel>(null);
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const alive = useRef(true);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prefetchStop = useRef<(() => void) | undefined>(undefined);
  const boundary = useRef({ scope, opening });
  if (boundary.current.scope !== scope || boundary.current.opening !== opening) {
    boundary.current = { scope, opening };
    generation.current += 1;
  }
  const dismissPanelMessage = useCallback(() => setMessage(''), []);
  const warm = useCallback(() => {
    prefetchStop.current?.();
    prefetchStop.current = scheduleIdlePrefetch(loadSecondaryDialogs, 150, 'intent');
  }, []);
  const setPanel = useCallback((next: AppPanel) => {
    const request = ++generation.current;
    const isCurrentScope = captureScope();
    clearTimeout(noticeTimer.current);
    setMessage('');
    if (secondaryDialogReady(next)) {
      commit(next);
      return;
    }
    if (next !== 'about' && next !== 'settings') return;
    const title = next === 'about' ? 'credits' : 'Settings';
    noticeTimer.current = setTimeout(() => {
      if (alive.current && generation.current === request && isCurrentScope()) setMessage(`Opening ${title}...`);
    }, 500);
    void loadSecondaryDialog(next).then(() => {
      if (!alive.current || generation.current !== request || !isCurrentScope()) return;
      clearTimeout(noticeTimer.current);
      setMessage('');
      commit(next);
    }).catch(error => {
      console.error('The requested dialog could not load.', error instanceof Error ? error.message : 'Unknown module error.');
      if (alive.current && generation.current === request && isCurrentScope()) {
        clearTimeout(noticeTimer.current);
        setMessage(`${title} could not load. Check your connection and choose it again to retry.`);
      }
    });
  }, [captureScope]);
  useEffect(() => {
    if (panel === 'menu') warm();
  }, [panel, warm]);
  useEffect(() => {
    alive.current = true;
    const cancel = () => { generation.current += 1; clearTimeout(noticeTimer.current); setMessage(''); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    const intent = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.menu-nav, .mobile-nav button[aria-haspopup="dialog"], .menu-dialog, .site-footer')) warm();
    };
    for (const name of ['pointerover', 'focusin', 'pointerdown']) document.addEventListener(name, intent, true);
    window.addEventListener('popstate', cancel);
    window.addEventListener('play100:navigate', cancel);
    window.addEventListener('keydown', escape);
    if (new URLSearchParams(location.search).get('info') === 'credits') setPanel('about');
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
  }, [setPanel, warm]);
  useEffect(() => { setMessage(''); }, [scope, opening]);
  return { panel, setPanel, panelMessage: message, dismissPanelMessage };
}
