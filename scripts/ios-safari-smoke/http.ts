import assert from 'node:assert/strict';
import { request } from 'node:http';

export function webdriverResponse(method: string, url: string, body: unknown, timeoutMs: number) {
  return new Promise<{ ok: boolean; payload: unknown }>((resolve, reject) => {
    const pending = request(
      url,
      {
        method,
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          text += chunk;
        });
        response.on('error', reject);
        response.on('end', () => {
          try {
            assert.ok(response.statusCode, 'The automation server must return an HTTP status.');
            const payload: unknown = JSON.parse(text);
            resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, payload });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    pending.on('error', reject);
    if (body !== undefined) pending.write(JSON.stringify(body));
    pending.end();
  });
}
