import { isRecord, isSafeInteger } from './guards';

const POSITION = 'play100HistoryPosition';
type Position = { session: string; index: number };
type Dismissal = { current: () => boolean; close: () => void };
type HistoryHost = Pick<Window, 'addEventListener' | 'removeEventListener'> & {
  history: Pick<History, 'state' | 'pushState' | 'replaceState' | 'go'>;
  location: Pick<Location, 'href'>;
};

function position(state: unknown): Position | null {
  if (!isRecord(state)) return null;
  const value = state[POSITION];
  return isRecord(value) && typeof value.session === 'string' && isSafeInteger(value.index)
    ? { session: value.session, index: value.index }
    : null;
}

/** Restore a same-document traversal before dismissing its sheet, without inserting disposable history entries. */
export function installSheetHistory(host: HistoryHost, dismissal: () => Dismissal | null) {
  const history = host.history;
  const push = history.pushState;
  const replace = history.replaceState;
  let current = position(history.state) ?? { session: crypto.randomUUID(), index: 0 };
  let hrefBeforeTraversal = host.location.href;
  let returning: { position: Position; dismissal: Dismissal; href: string } | null = null;
  const stamp = (state: unknown, at: Position) => {
    if (state !== null && !isRecord(state)) return state;
    return { ...(state ?? {}), [POSITION]: at };
  };
  replace.call(history, stamp(history.state, current), '', host.location.href);
  history.pushState = (state: unknown, title: string, url?: string | URL | null) => {
    const next = { ...current, index: current.index + 1 };
    push.call(history, stamp(state, next), title, url);
    current = next;
    returning = null;
    hrefBeforeTraversal = host.location.href;
  };
  history.replaceState = (state: unknown, title: string, url?: string | URL | null) => {
    replace.call(history, stamp(state, current), title, url);
    hrefBeforeTraversal = host.location.href;
  };
  const traversed = (event: PopStateEvent) => {
    if (!event.isTrusted) return;
    const destination = position(history.state);
    if (!destination || destination.session !== current.session) {
      returning = null;
      if (destination) current = destination;
      return;
    }
    if (returning) {
      event.stopImmediatePropagation();
      if (destination.index !== returning.position.index) {
        history.go(returning.position.index - destination.index);
        return;
      }
      const pending = returning;
      returning = null;
      current = destination;
      if (host.location.href === pending.href && pending.dismissal.current()) pending.dismissal.close();
      return;
    }
    const sheet = dismissal();
    const delta = current.index - destination.index;
    if (sheet && delta) {
      event.stopImmediatePropagation();
      returning = { position: current, dismissal: sheet, href: hrefBeforeTraversal };
      history.go(delta);
      return;
    }
    current = destination;
    hrefBeforeTraversal = host.location.href;
  };
  host.addEventListener('popstate', traversed, true);
  return () => {
    host.removeEventListener('popstate', traversed, true);
    history.pushState = push;
    history.replaceState = replace;
  };
}

const sheets: Dismissal[] = [];
let installed: History | undefined;

export function prepareSheetHistory() {
  if (installed === window.history) return;
  installSheetHistory(window, () => {
    for (let index = sheets.length - 1; index >= 0; index--) {
      const sheet = sheets[index]!;
      if (sheet.current()) return sheet;
    }
    return null;
  });
  installed = window.history;
}

export function registerSheetBack(dismissal: Dismissal) {
  prepareSheetHistory();
  sheets.push(dismissal);
  return () => {
    const index = sheets.indexOf(dismissal);
    if (index !== -1) sheets.splice(index, 1);
  };
}
