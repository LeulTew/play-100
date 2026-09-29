import { clientErrorCounts, CLIENT_REPORT_BYTES } from '../src/lib/client-error-schema.js';
import type { Admission } from './_lib/admission.js';
import { createReportHandler } from './_lib/report-handler.js';

export function createClientErrorHandler(admission?: Admission, log?: (line: string) => void) {
  return createReportHandler({
    contentTypes: ['application/json'],
    maxBytes: CLIENT_REPORT_BYTES,
    rejectQuery: true,
    parse: (body) => clientErrorCounts(body),
    entry: (report) => ({ event: 'client-error-count', ...report }),
    errorEvent: 'client-error-report-error',
    admission,
    log,
  });
}

export default createClientErrorHandler();
