import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { RequestListener } from 'node:http';
import { test } from 'vitest';
import { webdriverResponse } from './http.ts';

async function withServer(listener: RequestListener, action: (url: string) => Promise<void>) {
  const server = createServer(listener);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await action(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('send classic WebDriver JSON and preserve non-success response envelopes', async () => {
  await withServer(
    (incoming, response) => {
      let text = '';
      incoming.setEncoding('utf8');
      incoming.on('data', (chunk: string) => {
        text += chunk;
      });
      incoming.on('end', () => {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ value: { method: incoming.method, body: JSON.parse(text) } }));
      });
    },
    async (url) => {
      assert.deepEqual(await webdriverResponse('POST', `${url}/session`, { capabilities: {} }, 1000), {
        ok: false,
        payload: { value: { method: 'POST', body: { capabilities: {} } } },
      });
    },
  );
});

test('reject invalid JSON and enforce the explicit request deadline', async () => {
  await withServer(
    (incoming, response) => {
      if (incoming.url === '/invalid') response.end('not JSON');
    },
    async (url) => {
      await assert.rejects(() => webdriverResponse('GET', `${url}/invalid`, undefined, 1000), SyntaxError);
      await assert.rejects(() => webdriverResponse('GET', `${url}/stalled`, undefined, 25), { name: 'AbortError' });
    },
  );
});
