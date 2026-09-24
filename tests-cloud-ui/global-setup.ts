import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Rules validate collection-source titles against catalog/author, so publication and
// automatic sharing of The 100 games are denied until the local demo emulator is seeded.
export default function globalSetup() {
  execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/seed-cloud-emulators.mjs', import.meta.url))], { stdio: 'inherit' });
}
