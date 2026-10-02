import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evidenceHash, parseEvidenceCommand, runEvidenceCommand, writeEvidenceIdentity } from './release-evidence';

vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));
const source = { commit: 'a'.repeat(40), tree: 'b'.repeat(40) };
const directories: string[] = [];
beforeEach(() => {
  vi.mocked(execFileSync).mockImplementation((_cmd, args) =>
    args?.includes('HEAD^{tree}') ? source.tree : args?.includes('HEAD') ? source.commit : '',
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'release-evidence-'));
  directories.push(root);
  return { root, report: path.join(root, 'report.json'), log: path.join(root, 'command.log') };
}
describe('creation-time evidence identity', () => {
  it('binds exact report bytes and the command without overwriting a sidecar', async () => {
    const { report } = await fixture();
    await writeFile(report, '{"passed":true}\n');
    await writeEvidenceIdentity(report, source, ['tool', '--json']);
    expect(JSON.parse(await readFile(`${report}.identity.json`, 'utf8'))).toEqual({
      schemaVersion: 1,
      ...source,
      command: ['tool', '--json'],
      sha256: evidenceHash(await readFile(report)),
    });
    await expect(writeEvidenceIdentity(report, source, ['tool'])).rejects.toThrow('EEXIST');
    await expect(writeEvidenceIdentity(report, { ...source, tree: 'short' }, ['tool'])).rejects.toThrow('full commit');
  });
  it.each(
    [
      [],
      ['--report'],
      ['--report', 'file'],
      ['--', 'tool'],
      ['--report', 'file', '--'],
      ['--log', 'a', '--log', 'b', '--', 'tool'],
    ].map((args) => ({ args })),
  )('rejects malformed execution arguments %j', ({ args }) => expect(() => parseEvidenceCommand(args)).toThrow());
  it.each([0, 1])('sets source from HEAD before execution and retains exit %s evidence', async (exit) => {
    const { root, report, log } = await fixture();
    const script = `require('node:fs').writeFileSync(process.argv[1], JSON.stringify({commit:process.env.PLAY100_SOURCE_COMMIT,tree:process.env.PLAY100_SOURCE_TREE}));console.log('native output');process.exitCode=${exit}`;
    const command = [process.execPath, '-e', script, report];
    expect(
      await runEvidenceCommand(root, ['--report', report, '--log', log, '--', ...command], {
        ...process.env,
        PLAY100_SOURCE_COMMIT: 'stale',
        PLAY100_SOURCE_TREE: 'stale',
      }),
    ).toBe(exit);
    expect(JSON.parse(await readFile(report, 'utf8'))).toEqual(source);
    for (const file of [report, log])
      expect(JSON.parse(await readFile(`${file}.identity.json`, 'utf8'))).toEqual({
        schemaVersion: 1,
        ...source,
        command,
        sha256: evidenceHash(await readFile(file)),
      });
    await expect(runEvidenceCommand(root, ['--report', report, '--', ...command])).rejects.toThrow('existing evidence');
  });
  it('fails missing successful reports, directories and overlapping output paths', async () => {
    const { root, report } = await fixture();
    await expect(runEvidenceCommand(root, ['--report', report, '--', process.execPath, '-e', ''])).rejects.toThrow(
      'did not create',
    );
    await mkdir(report);
    await expect(runEvidenceCommand(root, ['--report', report, '--', process.execPath, '-e', ''])).rejects.toThrow(
      'regular file',
    );
    await expect(
      runEvidenceCommand(root, ['--report', report, '--log', report, '--', process.execPath]),
    ).rejects.toThrow('distinct');
  });
  it('refuses to issue identities if source changes while the command runs', async () => {
    const { root, report } = await fixture();
    let reads = 0;
    vi.mocked(execFileSync).mockImplementation((_cmd, args) => {
      if (args?.includes('HEAD')) return ++reads > 1 ? 'c'.repeat(40) : source.commit;
      return args?.includes('HEAD^{tree}') ? source.tree : '';
    });
    await expect(
      runEvidenceCommand(root, [
        '--report',
        report,
        '--',
        process.execPath,
        '-e',
        `require('node:fs').writeFileSync(process.argv[1], '{}')`,
        report,
      ]),
    ).rejects.toThrow('Candidate changed');
    await expect(readFile(`${report}.identity.json`)).rejects.toThrow('ENOENT');
  });
});
