import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// Files that no tsconfig project covers are linted without type information (README, Quality checks).
const untypedFiles = ['**/*.{js,mjs,cjs}', 'tests-cloud/**/*.ts', 'vitest.cloud.config.ts'];

const testFiles = ['**/*.{test,spec}.{ts,tsx}', '**/*fixture*.{ts,tsx}', 'tests/**/*.ts', 'tests-cloud-ui/**/*.ts'];

const pendingTypedRules = [
  'no-unsafe-assignment',
  'require-await',
  'no-unsafe-member-access',
  'no-unsafe-return',
  'no-unsafe-argument',
  'no-unsafe-call',
];

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
    // Type-aware rules still being brought to zero (CODE-03); each is removed from this list once it is clean.
    rules: {
      // Forwarding an abort reason or a caught value keeps its identity; literal non-Error rejections are still refused.
      '@typescript-eslint/prefer-promise-reject-errors': ['error', { allowThrowingAny: true, allowThrowingUnknown: true }],
      ...Object.fromEntries(pendingTypedRules.map((rule) => [`@typescript-eslint/${rule}`, 'off'])),
    },
  },
  {
    // Tests pass methods to expect() and capture prototype methods to restore or call with .call(); neither loses this.
    files: testFiles,
    rules: { '@typescript-eslint/unbound-method': 'off' },
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
