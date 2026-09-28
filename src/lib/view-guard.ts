/** The address a pending command started from: its path and query. */
export function currentView(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/** True while the address still is the one this call captured, so a command never lands on another view. */
export function captureView(): () => boolean {
  const view = currentView();
  return () => view === currentView();
}
