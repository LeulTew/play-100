import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'vitest';
import { fetchTargetIdentity } from './identity.ts';

test('hash exact served HTML bytes and record normalized origin and UTC time', async () => {
  const html = '<!doctype html>\r\n<html><body>candidate</body></html>\r\n';
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, 'https://candidate.example.com/');
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.cache, 'no-store');
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  };
  assert.deepEqual(
    await fetchTargetIdentity('https://candidate.example.com/', request, () => new Date('2026-10-02T01:40:00Z')),
    {
      origin: 'https://candidate.example.com',
      fetchedAtUtc: '2026-10-02T01:40:00.000Z',
      indexHtmlSha256: createHash('sha256').update(Buffer.from(html)).digest('hex'),
      bytes: Buffer.byteLength(html),
    },
  );
});

test('fail HTTP errors, non-HTML and empty responses instead of publishing an identity', async () => {
  for (const response of [
    new Response('Unavailable', { status: 503 }),
    new Response('{}', { headers: { 'content-type': 'application/json' } }),
    new Response('', { headers: { 'content-type': 'text/html' } }),
  ]) {
    await assert.rejects(() => fetchTargetIdentity('https://candidate.example.com', async () => response));
  }
});

test('reject invalid origins before fetching and preserve network failures', async () => {
  let called = false;
  const failure = new Error('Network unavailable');
  const request: typeof fetch = async () => {
    called = true;
    throw failure;
  };
  await assert.rejects(() => fetchTargetIdentity('http://candidate.example.com', request), /HTTPS/);
  assert.equal(called, false);
  await assert.rejects(() => fetchTargetIdentity('https://candidate.example.com', request), failure);
});
