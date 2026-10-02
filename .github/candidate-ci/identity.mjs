// Writes the run's identity: what was tested, with what, where. Run from the candidate checkout.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const out = process.argv[2];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const sha256 = (file) => (existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null);
const require = createRequire(path.resolve('package.json'));
const version = (name, root = '.') => {
  try {
    return JSON.parse(readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
};

let browser = null;
try {
  const { chromium } = require('@playwright/test');
  const instance = await chromium.launch();
  browser = { name: 'chromium', version: instance.version(), executable: chromium.executablePath() };
  await instance.close();
} catch (error) {
  browser = { error: String(error) };
}
const lighthouseDir = process.env.LIGHTHOUSE_DIR;
const identity = {
  commit: git('rev-parse', 'HEAD'),
  tree: git('rev-parse', 'HEAD^{tree}'),
  requestedSha: process.env.REQUESTED_SHA ?? null,
  packageLockSha256: sha256('package-lock.json'),
  builtIndexHtmlSha256: sha256(path.join('dist', 'index.html')),
  build: process.env.BUILD_PROFILE ?? 'none',
  suite: process.env.SUITE ?? null,
  specs: process.env.SPECS ?? '',
  project: process.env.PROJECT ?? null,
  repeat: process.env.REPEAT ?? null,
  workers: process.env.WORKERS || null,
  grep: process.env.GREP || null,
  outcome: process.env.SUITE_OUTCOME ?? null,
  runner: {
    imageOS: process.env.ImageOS ?? null,
    imageVersion: process.env.ImageVersion ?? null,
    os: execFileSync('sh', ['-c', '. /etc/os-release && echo "$PRETTY_NAME"'], { encoding: 'utf8' }).trim(),
    kernel: execFileSync('uname', ['-r'], { encoding: 'utf8' }).trim(),
  },
  node: process.version,
  npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
  java: process.env.JAVA_VERSION_LINE || null,
  playwright: version('@playwright/test'),
  vitest: version('vitest'),
  firebaseTools: version('firebase-tools'),
  lighthouse: lighthouseDir ? version('lighthouse', lighthouseDir) : null,
  browser,
  workflow: {
    run: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    attempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    ref: process.env.GITHUB_REF ?? null,
    workflowSha: process.env.WORKFLOW_SHA ?? null,
  },
  recordedAt: new Date().toISOString(),
};
writeFileSync(out, `${JSON.stringify(identity, null, 2)}\n`);
console.log(JSON.stringify(identity, null, 2));
