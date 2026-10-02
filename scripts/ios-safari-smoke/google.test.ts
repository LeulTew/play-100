import assert from 'node:assert/strict';
import { test } from 'vitest';
import { googleOutboundEvidence, redactOAuthUrls } from './google.ts';

const client = '123456789-example.apps.googleusercontent.com';
const callback = 'https://candidate.example.com/__/auth/handler';
const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authorization.searchParams.set('client_id', client);
authorization.searchParams.set('redirect_uri', callback);
authorization.searchParams.set('state', 'private-state');

test('read direct and nested Google wiring without retaining state or nonce', () => {
  const login = new URL('https://accounts.google.com/ServiceLogin');
  login.searchParams.set('continue', authorization.href);
  const evidence = googleOutboundEvidence(login.href);
  assert.equal(evidence.clientId, client);
  assert.equal(evidence.redirectUri, callback);
  assert.deepEqual(evidence.chain, [
    'https://accounts.google.com/ServiceLogin',
    'https://accounts.google.com/o/oauth2/v2/auth',
  ]);
  assert.ok(!JSON.stringify(evidence).includes('private-state'));
  assert.equal(googleOutboundEvidence(authorization.href).redirectUri, callback);
});

test('reject foreign origins, missing clients, conflicting wiring and unsafe callbacks', () => {
  assert.throws(() =>
    googleOutboundEvidence(authorization.href.replace('accounts.google.com', 'accounts.example.com')),
  );
  assert.throws(() => googleOutboundEvidence('https://accounts.google.com/'));
  const unsafe = new URL(authorization);
  unsafe.searchParams.set('redirect_uri', `${callback}?state=private-state`);
  assert.throws(() => googleOutboundEvidence(unsafe.href));
  const conflicting = new URL('https://accounts.google.com/ServiceLogin');
  conflicting.searchParams.set('client_id', '987654321-other.apps.googleusercontent.com');
  conflicting.searchParams.set('continue', authorization.href);
  assert.throws(() => googleOutboundEvidence(conflicting.href));
});

test('remove OAuth query strings from JSON, XML and logs without changing target URLs', () => {
  const text = `{"url":"${authorization.href}"} <node value="${callback}?eventId=private-event"/> https://candidate.example.com/my-games?tab=queue`;
  const redacted = redactOAuthUrls(text);
  assert.ok(!redacted.includes('private-state'));
  assert.ok(!redacted.includes('private-event'));
  assert.ok(redacted.includes('https://accounts.google.com/o/oauth2/v2/auth'));
  assert.ok(redacted.includes('https://candidate.example.com/my-games?tab=queue'));
});
