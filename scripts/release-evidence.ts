import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface EvidenceSource {
  commit: string;
  tree: string;
}
export const evidenceHash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export const fullGitId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

export function evidenceEnvironment(source: EvidenceSource) {
  if (!fullGitId(source.commit) || !fullGitId(source.tree))
    throw new Error('Evidence requires a full commit and tree.');
  return { PLAY100_SOURCE_COMMIT: source.commit, PLAY100_SOURCE_TREE: source.tree };
}

export async function evidenceFileExists(file: string) {
  try {
    if (!(await lstat(file)).isFile()) throw new Error('Evidence must be a regular file.');
    return true;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false;
    throw cause;
  }
}

export async function reserveEvidenceNames(files: string[]) {
  for (const file of files)
    for (const name of [file, `${file}.identity.json`])
      if (await evidenceFileExists(name)) throw new Error(`Refusing existing evidence: ${name}`);
}

export async function writeEvidenceIdentity(file: string, source: EvidenceSource, command: string[]) {
  evidenceEnvironment(source);
  if (!command.length || command.some((arg) => typeof arg !== 'string') || !command[0])
    throw new Error('Evidence requires the creation command.');
  if (!(await evidenceFileExists(file))) throw new Error(`Missing evidence report: ${file}`);
  const bytes = await readFile(file);
  await writeFile(
    `${file}.identity.json`,
    `${JSON.stringify({ schemaVersion: 1, ...source, sha256: evidenceHash(bytes), command }, null, 2)}\n`,
    { flag: 'wx' },
  );
}

export function readEvidenceSource(root: string): EvidenceSource {
  const git = (...args: string[]) =>
    execFileSync('git', ['--no-optional-locks', '-c', 'gc.auto=0', ...args], { cwd: root, encoding: 'utf8' }).trim();
  const source = { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}') };
  evidenceEnvironment(source);
  if (git('status', '--porcelain', '--untracked-files=all'))
    throw new Error('Evidence needs a clean committed candidate.');
  return source;
}

export function parseEvidenceCommand(args: string[]) {
  const reports: string[] = [];
  let log: string | undefined;
  let index = 0;
  while (args[index] !== '--') {
    const option = args[index++];
    const file = args[index++];
    if ((option !== '--report' && option !== '--log') || !file || file.startsWith('--'))
      throw new Error('Usage: release-evidence [--report FILE]... [--log FILE] -- COMMAND [ARG]...');
    if (option === '--report') reports.push(file);
    else {
      if (log) throw new Error('Only one command log is allowed.');
      log = file;
    }
  }
  const command = args.slice(index + 1);
  if ((!reports.length && !log) || !command[0]) throw new Error('Name evidence outputs and their creation command.');
  return { reports, log, command };
}

export async function runEvidenceCommand(root: string, args: string[], environment = process.env) {
  const options = parseEvidenceCommand(args);
  const source = readEvidenceSource(root);
  const reports = options.reports.map((file) => path.resolve(root, file));
  const log = options.log ? path.resolve(root, options.log) : undefined;
  const files = [...reports, ...(log ? [log] : [])];
  if (new Set(files).size !== files.length) throw new Error('Evidence output paths must be distinct.');
  await reserveEvidenceNames(files);
  let [executable, ...commandArgs] = options.command;
  if (executable === 'npm') {
    if (!environment.npm_execpath) throw new Error('Run this wrapper through npm exec to resolve the bundled npm.');
    executable = process.execPath;
    commandArgs = [environment.npm_execpath, ...commandArgs];
  }
  const command = [executable!, ...commandArgs];
  const output = log ? createWriteStream(log, { flags: 'wx' }) : undefined;
  let exitCode: number;
  try {
    exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(executable!, commandArgs, {
        cwd: root,
        env: { ...environment, ...evidenceEnvironment(source) },
        stdio: ['ignore', output ? 'pipe' : 'inherit', output ? 'pipe' : 'inherit'],
      });
      if (output) {
        child.stdout!.pipe(output, { end: false });
        child.stderr!.pipe(output, { end: false });
        output.once('error', (cause) => {
          child.kill();
          reject(cause);
        });
      }
      child.once('error', reject);
      child.once('close', (code) => resolve(code ?? 1));
    });
  } finally {
    if (output)
      await new Promise<void>((resolve, reject) =>
        output.end((error?: Error | null) => (error ? reject(error) : resolve())),
      );
  }
  if (JSON.stringify(readEvidenceSource(root)) !== JSON.stringify(source))
    throw new Error('Candidate changed during evidence creation; no identity sidecars were issued.');
  for (const file of files) {
    if (await evidenceFileExists(file)) await writeEvidenceIdentity(file, source, command);
    else if (exitCode === 0) throw new Error(`Successful command did not create ${file}`);
  }
  return exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runEvidenceCommand(process.cwd(), process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((cause: unknown) => {
      console.error(cause instanceof Error ? cause.message : 'Evidence command failed.');
      process.exitCode = 1;
    });
}
