interface PaintObserver {
  observe(target: Element): void;
  disconnect(): void;
}

/** The parts of the page afterNextPaint uses; `window` by default. */
export interface PaintPage {
  readonly document: { readonly visibilityState: DocumentVisibilityState; readonly documentElement: Element };
  readonly IntersectionObserver?: new (callback: () => void) => PaintObserver;
  setTimeout(callback: () => void): number;
  clearTimeout(handle: number): void;
}

/**
 * Runs `run` once the browser has rendered the page as it is now, and returns a cancel function. An
 * IntersectionObserver's first notification is queued by the rendering update that lays out and paints the page, so
 * it comes after that paint whatever the page's timers do: a frame callback and a timer would wait for a test's paused
 * clock as well. A hidden document renders nothing, so it runs after a task instead.
 */
export function afterNextPaint(run: () => void, page: PaintPage = window): () => void {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    run();
  };
  if (page.document.visibilityState !== 'visible' || typeof page.IntersectionObserver !== 'function') {
    const timer = page.setTimeout(once);
    return () => {
      done = true;
      page.clearTimeout(timer);
    };
  }
  const observer = new page.IntersectionObserver(() => {
    observer.disconnect();
    once();
  });
  observer.observe(page.document.documentElement);
  return () => {
    done = true;
    observer.disconnect();
  };
}
