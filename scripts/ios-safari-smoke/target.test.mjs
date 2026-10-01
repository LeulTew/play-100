import assert from 'node:assert/strict';
import test from 'node:test';
import { productionOrigin, targetOrigin } from './target.mjs';

test('default to production and normalize a public HTTPS tunnel origin', () => {
  assert.equal(targetOrigin(), productionOrigin);
  assert.equal(targetOrigin('https://candidate.example.com/'), 'https://candidate.example.com');
  assert.equal(targetOrigin('https://candidate.example.com:8443'), 'https://candidate.example.com:8443');
});

test('reject non-HTTPS targets and credentials', () => {
  assert.throws(() => targetOrigin('http://candidate.example.com'), /HTTPS/);
  assert.throws(() => targetOrigin('https://user:password@candidate.example.com'), /credentials/);
  assert.throws(() => targetOrigin('not a URL'), /valid HTTPS origin/);
});

test('reject routes, queries, fragments and empty overrides', () => {
  for (const value of [
    'https://candidate.example.com/discover',
    'https://candidate.example.com/?q=portal',
    'https://candidate.example.com/#games',
    '',
  ]) {
    assert.throws(() => targetOrigin(value));
  }
});
