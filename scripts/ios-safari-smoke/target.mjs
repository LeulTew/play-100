import assert from 'node:assert/strict';

export const productionOrigin = 'https://play-100-collection.vercel.app';

export function targetOrigin(value = productionOrigin) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    if (error.code !== 'ERR_INVALID_URL') throw error;
    throw new Error('The target must be a valid HTTPS origin.', { cause: error });
  }
  assert.equal(url.protocol, 'https:', 'The target must use HTTPS.');
  assert.ok(!url.username && !url.password, 'The target must not contain credentials.');
  assert.ok(url.pathname === '/' && !url.search && !url.hash, 'Use an origin without a path, query or fragment.');
  return url.origin;
}
