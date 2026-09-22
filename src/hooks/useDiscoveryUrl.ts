import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { parseDiscoverySearch, patchDiscoverySearch } from '../lib/discovery-search';
import type { DiscoveryFilters } from '../lib/discovery-search';
import { flushPendingEdits, hasPendingEdits } from './useExitSave';

function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener('play100:navigate', listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener('play100:navigate', listener);
  };
}

export function useDiscoveryUrl() {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => '');
  const filters = parseDiscoverySearch(search);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const intent = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribe(() => { intent.current += 1; setSaving(false); });
    return () => { mounted.current = false; intent.current += 1; unsubscribe(); };
  }, []);
  const update = useCallback(async (patch: Partial<DiscoveryFilters>, method: 'push' | 'replace' = 'push') => {
    const request = ++intent.current;
    const origin = `${window.location.pathname}${window.location.search}`;
    const next = patchDiscoverySearch(window.location.search, patch);
    const isCurrent = () => mounted.current && request === intent.current && origin === `${window.location.pathname}${window.location.search}`;
    setSaving(false);
    if (window.location.search === next) return false;
    setError('');
    try {
      if (hasPendingEdits()) {
        setSaving(true);
        const saved = await flushPendingEdits();
        if (!isCurrent()) return false;
        if (!saved) {
          setError('Your rating has not saved. Correct the highlighted field or retry before changing results.');
          return false;
        }
      }
      if (!isCurrent()) return false;
      window.history[method === 'push' ? 'pushState' : 'replaceState'](window.history.state, '', `${window.location.pathname}${next}`);
      window.dispatchEvent(new Event('play100:navigate'));
      return true;
    } catch (cause) {
      console.error('Discover could not save pending edits before changing results.', cause);
      if (isCurrent()) setError('Your edit could not be saved. Keep these results open and retry.');
      return false;
    } finally {
      if (mounted.current && request === intent.current) setSaving(false);
    }
  }, []);
  return { filters, update, error, saving, search };
}
