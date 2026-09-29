/** No-op until L-READINESS's report lands; it replaces this module with the same path and signature. */
export function reportClientError(error: unknown, area: 'app' | 'route' | 'online' | 'chunk'): void {
  void error;
  void area;
}
