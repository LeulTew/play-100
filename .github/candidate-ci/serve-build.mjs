// Serves a candidate's dist/ through the candidate's own low-end-profile server: HTTPS with HTTP/2, Brotli
// and the vercel.json rewrites and headers, as production serves it. Run with tsx from the candidate checkout:
//   npx tsx <this file> <origin-file>
// It writes the origin to <origin-file> and stays up until the job ends.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const originFile = process.argv[2];
if (!originFile) throw new Error('Pass the file to write the server origin to.');
const candidate = process.cwd();
const { serve } = await import(pathToFileURL(path.join(candidate, 'scripts', 'low-end-profile.ts')).href);
const server = await serve(path.join(candidate, 'dist'));
writeFileSync(originFile, `${server.origin}\n`);
console.log(`Serving ${path.join(candidate, 'dist')} at ${server.origin}`);
