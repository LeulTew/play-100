import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Candidate CI (docs/release-operations.md, "Candidate CI runs"): writes the run's identity, meaning what was tested,
 * with what and where. It runs with the candidate's tsx from the candidate checkout, from the workflow's own ref, so it
 * imports nothing but Node built-ins and loads the candidate's Playwright at run time.
 */

/** One Lighthouse font cell's fontconfig, as lighthouse.sh records it in fonts-<cell>.txt. */
export interface FontCell {
  cell: string;
  fontconfigFile: string;
  match: Record<string, string>;
  families: string[];
}

export interface BrowserFact {
  name?: string;
  version?: string;
  executable?: string;
  error?: string;
}

/** What main() reads from the machine; buildIdentity() turns it into the record, with the environment. */
export interface IdentityFacts {
  commit: string;
  tree: string;
  packageLockSha256: string | null;
  builtIndexHtmlSha256: string | null;
  os: string;
  kernel: string;
  node: string;
  npm: string;
  versions: {
    playwright: string | null;
    vitest: string | null;
    firebaseTools: string | null;
    lighthouse: string | null;
  };
  browser: BrowserFact;
  floorBrowsers: BrowserFact[];
  fonts: { system: Record<string, string | null>; cells: FontCell[] };
  files: EvidenceFile[];
  recordedAt: string;
}

/** One uploaded report or log: its path relative to the artifact root, its size and its SHA-256. */
export interface EvidenceFile {
  path: string;
  bytes: number;
  sha256: string;
}

const orNull = (value: string | undefined) => (value ? value : null);

export function buildIdentity(facts: IdentityFacts, env: NodeJS.ProcessEnv) {
  return {
    commit: facts.commit,
    tree: facts.tree,
    requestedSha: env.REQUESTED_SHA ?? null,
    requestId: orNull(env.REQUEST_ID),
    packageLockSha256: facts.packageLockSha256,
    builtIndexHtmlSha256: facts.builtIndexHtmlSha256,
    build: env.BUILD_PROFILE ?? 'none',
    suite: env.SUITE ?? null,
    specs: env.SPECS ?? '',
    project: env.PROJECT ?? null,
    repeat: env.REPEAT ?? null,
    workers: orNull(env.WORKERS),
    grep: orNull(env.GREP),
    browserEnv: orNull(env.BROWSER_ENV),
    outcome: env.SUITE_OUTCOME ?? null,
    runner: {
      imageOS: env.ImageOS ?? null,
      imageVersion: env.ImageVersion ?? null,
      os: facts.os,
      kernel: facts.kernel,
    },
    node: facts.node,
    npm: facts.npm,
    java: orNull(env.JAVA_VERSION_LINE),
    ...facts.versions,
    browser: facts.browser,
    floorBrowsers: facts.floorBrowsers,
    fonts: facts.fonts,
    files: facts.files,
    workflow: {
      run:
        env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
          ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
          : null,
      attempt: env.GITHUB_RUN_ATTEMPT ?? null,
      ref: env.GITHUB_REF ?? null,
      workflowSha: env.WORKFLOW_SHA ?? null,
    },
    recordedAt: facts.recordedAt,
  };
}

/** Parses fonts-<cell>.txt: `cell:`, `FONTCONFIG_FILE:` and `fc-match <family>:` lines, then the family list. */
export function parseFontCell(text: string): FontCell {
  const cell: FontCell = { cell: '', fontconfigFile: '', match: {}, families: [] };
  let inFamilies = false;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    if (inFamilies) {
      cell.families.push(line.trim());
      continue;
    }
    const [, family, resolved] = /^fc-match (.+?): (.*)$/.exec(line) ?? [];
    if (family !== undefined && resolved !== undefined) cell.match[family] = resolved;
    else if (line.startsWith('cell: ')) cell.cell = line.slice('cell: '.length);
    else if (line.startsWith('FONTCONFIG_FILE: ')) cell.fontconfigFile = line.slice('FONTCONFIG_FILE: '.length);
    else if (line === 'fc-list families:') inFamilies = true;
  }
  return cell;
}

const run = (command: string, ...args: string[]) => execFileSync(command, args, { encoding: 'utf8' }).trim();

function tryRun(command: string, ...args: string[]): string | null {
  try {
    return run(command, ...args);
  } catch {
    return null;
  }
}

const sha256 = (file: string) =>
  existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null;

function version(name: string, root = '.'): string | null {
  try {
    const manifest = JSON.parse(readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')) as {
      version?: string;
    };
    return manifest.version ?? null;
  } catch {
    return null;
  }
}

async function browserFact(name: 'chromium' | 'firefox' | 'webkit'): Promise<BrowserFact> {
  try {
    const require = createRequire(path.resolve('package.json'));
    const engine = (require('@playwright/test') as typeof import('@playwright/test'))[name];
    const instance = await engine.launch();
    const fact = { name, version: instance.version(), executable: engine.executablePath() };
    await instance.close();
    return fact;
  } catch (error) {
    return { name, error: String(error) };
  }
}

/** The floor suite's engines: Playwright's Firefox and WebKit, and the old Chromium named by PLAY100_FLOOR_CHROMIUM. */
async function floorBrowsers(env: NodeJS.ProcessEnv): Promise<BrowserFact[]> {
  const executable = env.PLAY100_FLOOR_CHROMIUM;
  const floorChromium: BrowserFact = executable
    ? { name: 'floor-chromium', version: tryRun(executable, '--version') ?? undefined, executable }
    : { name: 'floor-chromium', error: 'PLAY100_FLOOR_CHROMIUM is not set' };
  return [await browserFact('firefox'), await browserFact('webkit'), floorChromium];
}

/**
 * Digests every file under the artifact root except `skip` (identity.json itself, which is written after this list)
 * and hidden paths, which upload-artifact leaves out by default (Playwright's `test-results/.last-run.json`), sorted by
 * POSIX path, so a detached report can be checked against the run that made it.
 */
export function evidenceFiles(root: string, skip: string): EvidenceFile[] {
  if (!existsSync(root)) return [];
  const skipPath = path.resolve(skip);
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => path.resolve(file) !== skipPath)
    .filter(
      (file) =>
        !path
          .relative(root, file)
          .split(path.sep)
          .some((part) => part.startsWith('.')),
    )
    .map((file) => {
      const content = readFileSync(file);
      return {
        path: path.relative(root, file).split(path.sep).join('/'),
        bytes: content.length,
        sha256: createHash('sha256').update(content).digest('hex'),
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function fontCells(dir: string | undefined): FontCell[] {
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => /^fonts-.+\.txt$/.test(file))
    .sort()
    .map((file) => parseFontCell(readFileSync(path.join(dir, file), 'utf8')));
}

export async function main(out: string, env: NodeJS.ProcessEnv = process.env) {
  const lighthouseDir = env.LIGHTHOUSE_DIR;
  const facts: IdentityFacts = {
    commit: run('git', 'rev-parse', 'HEAD'),
    tree: run('git', 'rev-parse', 'HEAD^{tree}'),
    packageLockSha256: sha256('package-lock.json'),
    builtIndexHtmlSha256: sha256(path.join('dist', 'index.html')),
    os: run('sh', '-c', '. /etc/os-release && echo "$PRETTY_NAME"'),
    kernel: run('uname', '-r'),
    node: process.version,
    npm: run('npm', '--version'),
    versions: {
      playwright: version('@playwright/test'),
      vitest: version('vitest'),
      firebaseTools: version('firebase-tools'),
      lighthouse: lighthouseDir ? version('lighthouse', lighthouseDir) : null,
    },
    browser: await browserFact('chromium'),
    floorBrowsers: env.SUITE === 'floor' ? await floorBrowsers(env) : [],
    fonts: {
      system: { 'sans-serif': tryRun('fc-match', 'sans-serif'), serif: tryRun('fc-match', 'serif') },
      cells: fontCells(env.FONT_CELLS_DIR),
    },
    files: evidenceFiles(path.dirname(out), out),
    recordedAt: new Date().toISOString(),
  };
  const identity = buildIdentity(facts, env);
  const text = `${JSON.stringify(identity, null, 2)}\n`;
  writeFileSync(out, text);
  console.log(text);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) throw new Error('Pass the identity file to write.');
  await main(out);
}
