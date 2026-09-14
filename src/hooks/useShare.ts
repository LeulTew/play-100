import { useCallback, useState } from 'react';

export function useShare(notify: (message: string) => void) {
  const [manualLink, setManualLink] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const share = useCallback(async (title: string, url: string, privateFilter: boolean) => {
    if (sharing) return;
    setSharing(true);
    const suffix = privateFilter ? ' Device-only list filters are not included.' : '';
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title, url });
          notify(`Shared.${suffix}`);
          return;
        } catch (error: unknown) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
        }
      }
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(url);
        notify(`Link copied.${suffix}`);
      } catch {
        setManualLink(url);
        notify(`Automatic sharing is unavailable. Select and copy the link below.${suffix}`);
      }
    } finally {
      setSharing(false);
    }
  }, [notify, sharing]);
  return { share, manualLink, closeManualLink: () => setManualLink(null), sharing };
}
