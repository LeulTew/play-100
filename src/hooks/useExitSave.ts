import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';

interface PendingEditor {
  pending: () => boolean;
  flush: () => Promise<boolean>;
  focusTarget?: () => HTMLElement | null;
}
const editors = new Set<PendingEditor>();
const observers = new Set<() => void>();
function changed() { for (const observer of observers) observer(); }
function subscribe(observer: () => void) { observers.add(observer); return () => { observers.delete(observer); }; }
export function usePendingEdits(): boolean { return useSyncExternalStore(subscribe, hasPendingEdits, () => false); }

export function hasPendingEdits(): boolean {
  return [...editors].some((editor) => editor.pending());
}

export async function flushPendingEdits(onBlocked?: (target: HTMLElement | null) => void): Promise<boolean> {
  for (const editor of [...editors]) {
    if (!editor.pending()) continue;
    let saved: boolean;
    try { saved = await editor.flush(); }
    catch (cause) {
      onBlocked?.(editor.focusTarget?.() ?? null);
      throw cause;
    }
    if (!saved) {
      onBlocked?.(editor.focusTarget?.() ?? null);
      return false;
    }
  }
  return true;
}

export function registerPendingEditor(editor: PendingEditor): () => Promise<boolean> {
  let closing = false;
  let finishing: Promise<boolean> | null = null;
  const registered = { pending: () => closing || editor.pending(), flush: () => finishing ?? editor.flush(), focusTarget: editor.focusTarget };
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

export function useExitSave(flush: () => Promise<boolean>, pending: boolean, focusTarget?: RefObject<HTMLElement | null>) {
  const latest = useRef(flush);
  const dirty = useRef(pending);
  const target = useRef(focusTarget);
  latest.current = flush;
  dirty.current = pending;
  target.current = focusTarget;
  useEffect(() => {
    const current = latest;
    const status = dirty;
    const release = registerPendingEditor({ pending: () => status.current, flush: () => current.current(), focusTarget: () => target.current?.current ?? null });
    // A cancelled debounce must not discard an edit when its field disappears.
    return () => { void release(); };
  }, []);
  useEffect(() => { changed(); }, [pending]);
}
