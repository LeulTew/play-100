import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { FullConfig } from '@playwright/test';
import { CLOUD_UI_PROBE_PATH, cloudUiServerProblem } from '../scripts/playwright-env';

// The suite never starts or reuses a server itself: refuse to test whatever else holds the port.
async function assertCloudTestServer(baseURL: string) {
  const url = new URL(CLOUD_UI_PROBE_PATH, baseURL).href;
  let status: number | null;
  let body = '';
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    status = response.status;
    body = await response.text();
  } catch {
    status = null;
  }
  const problem = cloudUiServerProblem(url, status, body);
  if (problem) throw new Error(problem);
}

// Rules validate collection-source titles against catalog/author, so publication and
// automatic sharing of The 100 games are denied until the local demo emulator is seeded.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (typeof baseURL !== 'string') throw new Error('playwright.cloud.config.ts must set use.baseURL.');
  await assertCloudTestServer(baseURL);
  execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/seed-cloud-emulators.mjs', import.meta.url))], { stdio: 'inherit' });
}
