/** The parts of the 3D scene's startup that can hold the page: its module, WebGL context, renderer and first frame. */
export type SceneSpan = 'module' | 'context' | 'renderer' | 'first-render';

/**
 * Marks a part of the 3D scene's startup with User Timing: `p100:scene:<span>-start` now, and `-end` with a
 * `p100:scene:<span>` measure when the returned function is called. A trace, the low-end harness or a stalled test then
 * names the call that held the page: a start with no end is the one still running.
 */
export function sceneSpan(span: SceneSpan): () => void {
  const start = `p100:scene:${span}-start`;
  performance.mark(start);
  return () => {
    const end = `p100:scene:${span}-end`;
    performance.mark(end);
    try {
      performance.measure(`p100:scene:${span}`, start, end);
    } catch {
      // Something cleared the start mark; the end mark still stands.
    }
  };
}
