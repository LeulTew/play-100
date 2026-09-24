import { describe, expect, it } from 'vitest';
import { applyPersonalAction, emptyPersonalLibrary, exportLibraryBackup, readLibraryBackup } from '../lib/personal-library';
import { libraryBackupText } from './backup-download';

const state = applyPersonalAction(emptyPersonalLibrary(), { type: 'set-motion', motion: 'lite' });

describe('account library backup downloads', () => {
  it('writes the compact backup that the Backup import accepts', () => {
    const text = libraryBackupText(state);
    expect(text).not.toContain('\n');
    expect(text).toBe(JSON.stringify(JSON.parse(text)));
    expect(JSON.parse(text)).toMatchObject({ app: 'Play 100', formatVersion: 3 });
    expect(readLibraryBackup(text)).toEqual(state);
  });

  it('refuses a library over the backup budget with how much to remove, instead of writing a file', () => {
    const exported = exportLibraryBackup(state);
    if (!exported.ok) throw new Error('Expected the fixture to fit the backup budget.');
    const refused = exportLibraryBackup(state, exported.bytes - 1);
    if (refused.ok) throw new Error('Expected a refusal one byte under the fixture size.');
    expect(refused.message).toMatch(/over its .+ backup limit, so no file was made\. Remove games or shorten notes by at least/);
    expect(() => libraryBackupText(state, exported.bytes - 1)).toThrow(refused.message);
    expect(readLibraryBackup(libraryBackupText(state, exported.bytes), exported.bytes)).toEqual(state);
  });
});
