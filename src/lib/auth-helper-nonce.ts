export function helperNonce(headers: Headers): string | null {
  const csp = headers.get('content-security-policy') ?? '';
  const nonces = [...csp.matchAll(/'nonce-([A-Za-z0-9+/]{22}==|[A-Za-z0-9+/]{23}=|[A-Za-z0-9+/]{24})'/g)];
  if (csp.includes(',') || nonces.length !== 1 || !/(?:^|;)\s*frame-ancestors 'self'\s*(?:;|$)/.test(csp)) return null;
  return nonces[0]![1]!;
}

export function freshNonces(values: readonly (string | null)[]): boolean {
  return values.length >= 2 && values.every((value) => Boolean(value)) && new Set(values).size === values.length;
}
