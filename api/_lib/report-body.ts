import type { IncomingMessage } from 'node:http';

export class ReportFailure extends Error {
  constructor(readonly status: number) {
    super('Operational report rejected.');
  }
}

export function readReport(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const finish = (error?: ReportFailure) => {
      clearTimeout(timer);
      request.off('data', data);
      request.off('end', end);
      request.off('error', failed);
      request.off('close', closed);
      if (error) {
        request.resume();
        reject(error);
      } else resolve(Buffer.concat(chunks));
    };
    const data = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) finish(new ReportFailure(413));
      else chunks.push(chunk);
    };
    const end = () => finish();
    const failed = () => finish(new ReportFailure(400));
    const closed = () => {
      if (!request.complete) failed();
    };
    const timer = setTimeout(() => finish(new ReportFailure(408)), 3_000);
    request.on('data', data).once('end', end).once('error', failed).once('close', closed);
  });
}
