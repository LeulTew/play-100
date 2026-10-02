import assert from 'node:assert/strict';

export function googleOutboundEvidence(value: string) {
  const first = new URL(value);
  assert.equal(first.origin, 'https://accounts.google.com', 'Google must open on its genuine HTTPS origin.');
  assert.ok(!first.username && !first.password, 'The Google provider URL must not contain credentials.');
  const chain: string[] = [];
  const seen = new Set<string>();
  let current = first;
  let clientId: string | null = null;
  let redirectUri: string | null = null;
  for (let depth = 0; depth < 8; depth++) {
    assert.ok(!seen.has(current.href), 'The Google continuation chain must not cycle.');
    seen.add(current.href);
    chain.push(`${current.origin}${current.pathname}`);
    const client = current.searchParams.get('client_id');
    const redirect = current.searchParams.get('redirect_uri');
    if (client) {
      assert.ok(!clientId || clientId === client, 'The Google continuation chain must use one client.');
      clientId = client;
    }
    if (redirect) {
      const callback = new URL(redirect);
      assert.equal(callback.protocol, 'https:', 'The OAuth callback must use HTTPS.');
      assert.ok(!callback.username && !callback.password && !callback.search && !callback.hash, 'Invalid OAuth callback.');
      assert.ok(!redirectUri || redirectUri === callback.href, 'The continuation chain must use one OAuth callback.');
      redirectUri = callback.href;
    }
    const continuation = current.searchParams.get('continue');
    if (!continuation) break;
    assert.ok(depth < 7, 'The Google continuation chain exceeds the evidence limit.');
    current = new URL(continuation);
    assert.equal(current.origin, 'https://accounts.google.com', 'OAuth continuations must remain on Google.');
  }
  assert.ok(clientId, 'The provider URL must expose the registered Google client.');
  assert.match(clientId, /^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/, 'Expected a Google OAuth client.');
  assert.ok(redirectUri, 'The provider URL must expose the registered OAuth callback.');
  return { origin: first.origin, path: first.pathname, clientId, redirectUri, chain };
}

export function redactOAuthUrls(text: string) {
  return text.replace(/https?:\/\/[^\s"'<>\\]+/g, (value) => {
    if (!/^https?:\/\/accounts\.google\.com(?:[/:?]|$)/.test(value) && !value.includes('/__/auth/')) return value;
    const url = new URL(value);
    return url.hostname === 'accounts.google.com' || url.pathname.startsWith('/__/auth/')
      ? `${url.origin}${url.pathname}`
      : value;
  });
}
