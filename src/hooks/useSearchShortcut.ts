import { useEffect } from 'react';

/** "/" focuses the page's search field unless a dialog is open or the user is typing. */
export function useSearchShortcut() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]'))
        return;
      if (
        event.target instanceof HTMLElement &&
        (event.target.matches('input, textarea, select') || event.target.isContentEditable)
      )
        return;
      event.preventDefault();
      document.querySelector<HTMLElement>('#game-search, #library-search, #ranking-search, #catalog-search')?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
