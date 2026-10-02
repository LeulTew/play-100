import { clientErrorCounts, CLIENT_REPORT_BYTES } from '../src/lib/client-error-schema.js';
import type { Admission } from './_lib/admission.js';
import { createClientErrorAlert, productionAlertOptions } from './_lib/production-alert.js';
import type { ReportAlert } from './_lib/production-alert.js';
import { createReportHandler } from './_lib/report-handler.js';

export function createClientErrorHandler(
  admission?: Admission,
  log?: (line: string) => void,
  alert: ReportAlert<ReturnType<typeof clientErrorCounts>> | null = null,
) {
  return createReportHandler({
    contentTypes: ['application/json'],
    maxBytes: CLIENT_REPORT_BYTES,
    rejectQuery: true,
    parse: (body) => clientErrorCounts(body),
    entry: (report) => ({ event: 'client-error-count', ...report }),
    errorEvent: 'client-error-report-error',
    admission,
    log,
    alert,
  });
}

// Alerts only with a fine-grained PRODUCTION_ALERT_GITHUB_TOKEN (docs/release-operations.md, client report alerts).
export default createClientErrorHandler(
  undefined,
  undefined,
  createClientErrorAlert(productionAlertOptions(process.env)),
);
