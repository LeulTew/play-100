import { useEffect, useRef, useSyncExternalStore } from 'react';

const editors = new Set<{ pending: () => boolean; flush: () => Promise<boolean> }>();
const observers = new Set<() => void>();
function changed() { for (const observer of observers) observer(); }
function subscribe(observer: () => void) { observers.add(observer); return () => { observers.delete(observer); }; }
export function usePendingEdits(): boolean { return useSyncExternalStore(subscribe, hasPendingEdits, () => false); }

export function hasPendingEdits(): boolean {
  return [...editors].some((editor) => editor.pending());
}

export async function flushPendingEdits(): Promise<boolean> {
  for (const editor of [...editors]) {
    if (editor.pending() && !await editor.flush()) return false;
  }
  return true;
}

export function registerPendingEditor(editor: { pending: () => boolean; flush: () => Promise<boolean> }): () => Promise<boolean> {
  let closing = false;
  let finishing: Promise<boolean> | null = null;
  const registered = { pending: () => closing || editor.pending(), flush: () => finishing ?? editor.flush() };
  editors.add(registered);
  changed();
  return () => {
    if (finishing) return finishing;
    if (!editor.pending()) { editors.delete(registered); changed(); return Promise.resolve(true); }
    closing = true;
    changed();
    finishing = editor.flush().then((saved) => {
      editors.delete(registered); changed(); return saved;
    }, (error: unknown) => {
      editors.delete(registered); changed();
      console.error('An exiting editor could not finish saving.', error instanceof Error ? error.message : 'Unknown storage failure.');
      return false;
    });
    return finishing;
  };
}

export function useExitSave(flush: () => Promise<boolean>, pending: boolean) {
  const latest = useRef(flush);
  const dirty = useRef(pending);
  latest.current = flush;
  dirty.current = pending;
  useEffect(() => {
    const current = latest;
    const status = dirty;
    const release = registerPendingEditor({ pending: () => status.current, flush: () => current.current() });
    // A cancelled debounce must not discard an edit when its field disappears.
    return () => { void release(); };
  }, []);
  useEffect(() => { changed(); }, [pending]);
}
