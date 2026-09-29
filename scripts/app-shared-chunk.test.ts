import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_SHARED_MODULES, isAppSharedModule } from './app-shared-chunk.ts';

const root = fileURLToPath(new URL('../', import.meta.url));

describe('app-shared chunk modules', () => {
  it('names only modules that exist, once each', () => {
    for (const file of APP_SHARED_MODULES) expect(existsSync(path.join(root, file)), file).toBe(true);
    expect(new Set(APP_SHARED_MODULES).size).toBe(APP_SHARED_MODULES.length);
  });

  it('matches the listed modules by their whole path, with either separator', () => {
    expect(isAppSharedModule(`${root}src/components/Dialog.tsx`)).toBe(true);
    expect(isAppSharedModule('C:\\repo\\src\\motion\\runtime.ts')).toBe(true);
    expect(isAppSharedModule('/repo/src/components/Dialog.tsx?used')).toBe(false);
    expect(isAppSharedModule('/repo/src/components/SettingsDialog.tsx')).toBe(false);
    expect(isAppSharedModule('/repo/src/components/IconButton.tsx')).toBe(false);
    expect(isAppSharedModule('/repo/node_modules/react/index.js')).toBe(false);
  });
});
