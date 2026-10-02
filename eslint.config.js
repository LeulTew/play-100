import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { play100Plugin } from './scripts/eslint/no-url-search-params-size.ts';

// Files that no tsconfig project covers are linted without type information (README, Quality checks).
const untypedFiles = ['**/*.{js,mjs,cjs}'];

const testFiles = ['**/*.{test,spec}.{ts,tsx}', '**/*fixture*.{ts,tsx}', 'tests/**/*.ts', 'tests-cloud/**/*.ts', 'tests-cloud-ui/**/*.ts'];

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'third-party', 'test-results', 'playwright-report', '.vercel', 'data'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },
  {
    // Type-aware: older supported engines read URLSearchParams#size as undefined (scripts/eslint/no-url-search-params-size.ts).
    // Only the browser code in src; api/, functions/ and scripts/ run on Node 24, where it is defined.
    files: ['src/**/*.{ts,tsx}'],
    plugins: { play100: play100Plugin },
    rules: { 'play100/no-url-search-params-size': 'error' },
  },
  {
    rules: {
      // Forwarding an abort reason or a caught value keeps its identity; literal non-Error rejections are still refused.
      '@typescript-eslint/prefer-promise-reject-errors': ['error', { allowThrowingAny: true, allowThrowingUnknown: true }],
    },
  },
  {
    // Tests pass methods to expect() and capture prototype methods to restore or call with .call(); neither loses this.
    // Async doubles stand in for promise-returning APIs, so a throw inside one rejects as the real call would.
    files: testFiles,
    rules: { '@typescript-eslint/unbound-method': 'off', '@typescript-eslint/require-await': 'off' },
  },
  {
    // Vitest asymmetric matchers (expect.any, expect.stringContaining, ...) are typed any, so placing one inside an
    // expected object literal is reported as an unsafe assignment; these files do that and nothing else unsafe.
    files: [
      'scripts/first-paint/plugin.test.ts',
      'scripts/release-manifest.test.ts',
      'src/cloud/friend-publication-race.test.ts',
      'src/hooks/useLibrary.test.ts',
      'src/lib/catalog-admission.test.ts',
      'src/lib/catalog-api.test.ts',
      'src/lib/catalog-client.test.ts',
      'src/lib/catalog-detail-api.test.ts',
      'src/lib/chunk-recovery.test.ts',
      'src/lib/compare-tray.test.ts',
      'src/lib/comparison-game-filter.test.ts',
      'src/lib/friend-all.test.ts',
      'src/lib/personal-db.test.ts',
      'src/lib/personal-library.test.ts',
      'src/pwa/client.test.ts',
      'src/pwa/worker.test.ts',
    ],
    rules: { '@typescript-eslint/no-unsafe-assignment': 'off' },
  },
  {
    // The first-paint tests run the generated inline boot script through new Function, which is untyped by design.
    files: ['scripts/first-paint/boot.test.ts', 'scripts/first-paint/plugin.test.ts'],
    rules: { '@typescript-eslint/no-unsafe-call': 'off' },
  },
  {
    files: untypedFiles,
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['*.js', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
);
