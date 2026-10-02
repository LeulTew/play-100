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
  /**
   * Sees each accepted report. A promise it returns, for a due alert post, is awaited before the 204, and its
   * outcome joins that report's one log line. It must settle within its own budget and must not reject.
   */
  alert?: ((value: T) => Promise<Record<string, unknown>> | null) | null;
};

// The shared skeleton of the report endpoints: method, query, media type, declared length, admission, bounded
// read, validation, then one log line. Only reports that parse are logged; the body itself never is. A due
// production alert post delays that one report's 204 by up to five seconds, at most once per instance per hour;
// the senders are browser beacons and CSP reports, which don't wait for the response. Its outcome joins the line.
export function createReportHandler<T>({
  contentTypes,
  maxBytes,
  rejectQuery = false,
  parse,
  entry,
  errorEvent,
  admission = createAdmission({ maxActive: 4, maxPerWindow: 30, windowMs: 60_000 }),
  log = console.log,
  alert = null,
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
      const line = entry(value);
      const pending = alert?.(value);
      const outcome = pending ? await pending.catch(() => null) : null;
      log(JSON.stringify(outcome ? { ...line, ...outcome } : line));
      response.writeHead(204).end();
    } catch (cause) {
      if (!(cause instanceof ReportFailure)) console.error(JSON.stringify({ event: errorEvent, count: 1 }));
      if (!response.destroyed) response.writeHead(cause instanceof ReportFailure ? cause.status : 500).end();
    } finally {
      release();
    }
  };
}
