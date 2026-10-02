import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint, Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { play100Plugin } from './no-url-search-params-size.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fileName = path.join(root, 'url-search-params-size.fixture.ts');

function lint(code: string): number[] {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2023,
    lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    strict: true,
    noEmit: true,
  };
  const host = ts.createCompilerHost(options, true);
  const isFixture = (name: string) => path.resolve(name) === fileName;
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  host.getSourceFile = (name, version, ...rest) =>
    isFixture(name) ? ts.createSourceFile(name, code, version, true) : getSourceFile(name, version, ...rest);
  host.fileExists = (name) => isFixture(name) || fileExists(name);
  host.readFile = (name) => (isFixture(name) ? code : readFile(name));
  const program = ts.createProgram([fileName], options, host);
  const messages = new Linter({ cwd: root }).verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program] } },
        plugins: { play100: play100Plugin },
        rules: { 'play100/no-url-search-params-size': 'error' },
      },
    ],
    fileName,
  );
  expect(messages.filter((message) => message.ruleId !== 'play100/no-url-search-params-size')).toEqual([]);
  return messages.map((message) => message.line);
}

describe('play100/no-url-search-params-size', () => {
  it('reports every read of URLSearchParams#size, including truthiness tests', () => {
    const lines = lint(
      [
        "const params = new URLSearchParams('a=1');",
        'export const read = params.size;',
        "if (params.size) console.log('has query');",
        'export const optional = (params as URLSearchParams | undefined)?.size;',
        "export const element = params['size'];",
        'const { size } = params;',
        'export const destructured = size;',
        'export class Query extends URLSearchParams {}',
        'export const inherited = new Query().size;',
        'export const count = (query?: URLSearchParams) => query?.size ?? 0;',
      ].join('\n'),
    );
    expect(lines).toEqual([2, 3, 4, 5, 6, 9, 10]);
  });

  it('allows other size properties and the portable ways to count a query', () => {
    expect(
      lint(
        [
          "const params = new URLSearchParams('a=1');",
          'export const keys = [...params.keys()].length;',
          "export const empty = params.toString() === '';",
          'export const set = new Set([1]).size;',
          'export const map = new Map<string, number>().size;',
          'export const literal = { size: 3 }.size;',
          'const { size } = new Blob([]);',
          'export const blob = size;',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('is enabled as an error for the browser sources by the repository config, and not for Node code', async () => {
    const eslint = new ESLint({ cwd: root });
    const rule = async (file: string) =>
      ((await eslint.calculateConfigForFile(path.join(root, file))) as { rules: Record<string, unknown> }).rules[
        'play100/no-url-search-params-size'
      ];
    expect(await rule('src/App.tsx')).toEqual([2]);
    expect(await rule('api/catalog-detail.ts')).toBeUndefined();
  });
});
