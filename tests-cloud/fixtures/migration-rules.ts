import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const LIVE_RULES_COMMIT = '270f4c743d3a9a89d5a64fe612e471ea045ebb47';
export const LIVE_RULES_BLOB = '6e97647cb01106e2035edfd97a725e2b3e9538f7';
export const LIVE_RULES_SHA256 = '971b0fe6c7ec654bb21e72b70f7a431f71deff00612a9934ba02e851ae99243a';

export function live270fRules(): string {
  const bytes = readFileSync(new URL('./live-270f4c7/firestore.rules', import.meta.url));
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (blob !== LIVE_RULES_BLOB || createHash('sha256').update(bytes).digest('hex') !== LIVE_RULES_SHA256) {
    throw new Error(
      `The frozen rules fixture no longer matches ${LIVE_RULES_COMMIT}. Do not substitute candidate rules.`,
    );
  }
  return bytes.toString('utf8');
}

export function candidateRules(): string {
  return readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
}

export function migrationEmulators() {
  const firestoreAddress = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8188';
  const authAddress = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9199';
  for (const address of [firestoreAddress, authAddress]) {
    if (
      !/^(127[.]0[.]0[.]1|localhost):[0-9]+$/.test(address) ||
      Number(address.split(':')[1]) < 1 ||
      Number(address.split(':')[1]) > 65535
    ) {
      throw new Error('Migration fixtures require loopback Auth and Firestore emulators, never production.');
    }
  }
  const [host, port] = firestoreAddress.split(':');
  return { projectId: 'demo-play100', host: host!, port: Number(port), authOrigin: `http://${authAddress}` };
}
