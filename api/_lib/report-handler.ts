import type { IncomingMessage, ServerResponse } from 'node:http';
import { createAdmission } from './admission.js';
import type { Admission } from './admission.js';
import { readReport, ReportFailure } from './report-body.js';

export type ReportHandlerOptions<T> = {
  /** Accepted media types, lower case and without parameters. */
  contentTypes: readonly string[];
  maxBytes: number;
  /** Answer 400 to a request URL with a query string. */
  rejectQuery?: boolean;
  /** Validates the parsed JSON body; any throw answers 400. */
  parse: (body: unknown, contentType: string) => T;
  /** The one log line written for an accepted report. */
  entry: (value: T) => Record<string, unknown>;
  /** Logged (with count 1) when handling fails for a reason other than the request. */
  errorEvent: string;
  admission?: Admission;
  log?: (line: string) => void;
};

// The shared skeleton of the report endpoints: method, query, media type, declared length, admission, bounded
// read, validation, then one log line. Only reports that parse are logged; the body itself never is.
export function createReportHandler<T>({
  contentTypes,
  maxBytes,
  rejectQuery = false,
  parse,
  entry,
  errorEvent,
  admission = createAdmission({ maxActive: 4, maxPerWindow: 30, windowMs: 60_000 }),
  log = console.log,
}: ReportHandlerOptions<T>) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      response.writeHead(405).end();
      return;
    }
    if (rejectQuery && request.url?.includes('?')) {
      response.writeHead(400).end();
      return;
    }
    const contentType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!contentTypes.includes(contentType)) {
      response.writeHead(415).end();
      return;
    }
    if (Number(request.headers['content-length']) > maxBytes || request.headers['content-encoding']) {
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
      const raw = await readReport(request, maxBytes);
      let value: T;
      try {
        value = parse(JSON.parse(raw.toString('utf8')), contentType);
      } catch {
        throw new ReportFailure(400);
      }
      log(JSON.stringify(entry(value)));
      response.writeHead(204).end();
    } catch (cause) {
      if (!(cause instanceof ReportFailure)) console.error(JSON.stringify({ event: errorEvent, count: 1 }));
      if (!response.destroyed) response.writeHead(cause instanceof ReportFailure ? cause.status : 500).end();
    } finally {
      release();
    }
  };
}
