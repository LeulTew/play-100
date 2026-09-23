export function afterFrame(work: () => void): () => void {
  let cancelled = false;
  let timer: number | undefined;
  const frame = requestAnimationFrame(() => {
    timer = window.setTimeout(() => {
      if (!cancelled) work();
    }, 0);
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
    if (timer !== undefined) window.clearTimeout(timer);
  };
}
