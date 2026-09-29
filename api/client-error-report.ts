import type { IncomingMessage, ServerResponse } from 'node:http';
import { clientErrorCounts, CLIENT_REPORT_BYTES } from '../src/lib/client-error-schema.js';
import { createAdmission } from './_lib/admission.js';
import type { Admission } from './_lib/admission.js';
import { readReport, ReportFailure } from './_lib/report-body.js';

export function createClientErrorHandler(
  admission: Admission = createAdmission({ maxActive: 4, maxPerWindow: 30, windowMs: 60_000 }),
  log: (line: string) => void = console.log,
) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      response.writeHead(405).end();
      return;
    }
    if (request.url?.includes('?')) {
      response.writeHead(400).end();
      return;
    }
    if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
      response.writeHead(415).end();
      return;
    }
    if (Number(request.headers['content-length']) > CLIENT_REPORT_BYTES || request.headers['content-encoding']) {
      response.writeHead(413).end();
      return;
    }
    const release = admission.acquire();
    if (!release) {
      response.setHeader('Retry-After', '60');
      response.writeHead(429).end();
      return;
    }
    try {
      const raw = await readReport(request, CLIENT_REPORT_BYTES);
      let report: ReturnType<typeof clientErrorCounts>;
      try {
        report = clientErrorCounts(JSON.parse(raw.toString('utf8')));
      } catch {
        throw new ReportFailure(400);
      }
      log(JSON.stringify({ event: 'client-error-count', ...report }));
      response.writeHead(204).end();
    } catch (cause) {
      if (!(cause instanceof ReportFailure))
        console.error(JSON.stringify({ event: 'client-error-report-error', count: 1 }));
      if (!response.destroyed) response.writeHead(cause instanceof ReportFailure ? cause.status : 500).end();
    } finally {
      release();
    }
  };
}

export default createClientErrorHandler();
