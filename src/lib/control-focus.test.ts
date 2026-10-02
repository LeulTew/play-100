import { afterEach, describe, expect, it, vi } from 'vitest';
import { foregroundDialog } from '../components/dialog-layer';
import { focusPendingEditor } from './dialog-focus';
import { captureControlFocus } from './control-focus';

vi.mock('../components/dialog-layer', () => ({ foregroundDialog: vi.fn(() => null) }));
vi.mock('./dialog-focus', () => ({ focusPendingEditor: vi.fn(() => true) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(foregroundDialog).mockReset();
  vi.mocked(focusPendingEditor).mockClear();
});

function fixture() {
  const source = {
    isConnected: true,
    matches: vi.fn(() => false),
    closest: vi.fn(() => null),
  } as Pick<HTMLElement, 'isConnected' | 'matches' | 'closest'>;
  const target = { ...source } as HTMLElement;
  const body = {} as HTMLElement;
  const document = Object.assign(new EventTarget(), { activeElement: source, body });
  const window = Object.assign(new EventTarget(), { location: { href: 'http://localhost/my-games?tab=queue' } });
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  return {
    source,
    target,
    document,
    window,
    remove() {
      Object.assign(source, { isConnected: false });
      document.activeElement = body;
    },
    capture: () => captureControlFocus(source as HTMLElement),
  };
}

describe('removed or disabled action focus handoff', () => {
  it('hands off once after the focused control is removed and releases its listeners', () => {
    const state = fixture();
    const removed = vi.spyOn(state.document, 'removeEventListener');
    const handoff = state.capture();
    state.remove();
    expect(handoff.focus(state.target)).toBe(true);
    expect(focusPendingEditor).toHaveBeenCalledExactlyOnceWith(state.target);
    expect(removed).toHaveBeenCalledWith('focusin', expect.any(Function), true);
    expect(handoff.focus(state.target)).toBe(false);
  });

  it('hands off from a still-focused, disabled submit after the cleared draft renders', () => {
    const state = fixture();
    const handoff = state.capture();
    state.source.matches = () => true;
    expect(handoff.focus(state.target)).toBe(true);
  });

  it('leaves an available action focused on a refused write', () => {
    const state = fixture();
    const handoff = state.capture();
    expect(handoff.focus(state.target)).toBe(false);
    expect(focusPendingEditor).not.toHaveBeenCalled();
  });

  it('never invents ownership when the initiating control was not focused', () => {
    const state = fixture();
    state.document.activeElement = state.document.body;
    const handoff = state.capture();
    state.remove();
    expect(handoff.focus(state.target)).toBe(false);
  });

  it('does not steal newer focus even when that newer control later disappears', () => {
    const state = fixture();
    const handoff = state.capture();
    state.document.dispatchEvent(new Event('focusin'));
    state.remove();
    expect(handoff.focus(state.target)).toBe(false);
    expect(focusPendingEditor).not.toHaveBeenCalled();
  });

  it.each(['popstate', 'play100:navigate'])('invalidates on %s even if the URL returns to the same place', (event) => {
    const state = fixture();
    const handoff = state.capture();
    state.window.dispatchEvent(new Event(event));
    state.remove();
    expect(handoff.focus(state.target)).toBe(false);
  });

  it('checks the current URL in addition to navigation events', () => {
    const state = fixture();
    const handoff = state.capture();
    state.window.location.href = 'http://localhost/discover';
    state.remove();
    expect(handoff.focus(state.target)).toBe(false);
  });

  it('does not move background focus into a newer dialog', () => {
    const state = fixture();
    const handoff = state.capture();
    state.remove();
    vi.mocked(foregroundDialog).mockReturnValue({} as HTMLDialogElement);
    expect(handoff.focus(state.target)).toBe(false);
  });

  it('cannot survive an explicit owner-unmount cancellation', () => {
    const state = fixture();
    const handoff = state.capture();
    handoff.cancel();
    state.remove();
    expect(handoff.focus(state.target)).toBe(false);
  });
});
