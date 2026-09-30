import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

function recoveryBinding(text: string) {
  const file = ts.createSourceFile('App.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const bindings: { hook: string; binding: string; record: string }[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const hook = node.expression.text;
      if (hook === 'useStableHandlers' || hook === 'useBoundHandlers') {
        const object = node.arguments[hook === 'useBoundHandlers' ? 1 : 0];
        if (
          object &&
          ts.isObjectLiteralExpression(object) &&
          object.properties.some((property) => property.name?.getText(file) === 'retryLibraryOpening')
        ) {
          bindings.push({
            hook,
            binding: hook === 'useBoundHandlers' ? node.arguments[0]!.getText(file) : '',
            record: ts.isVariableDeclaration(node.parent) ? node.parent.name.getText(file) : '',
          });
        }
      }
    }
    node.forEachChild(visit);
  }
  visit(file);
  return bindings;
}

describe('App recovery command binding', () => {
  it('binds the retry record to the originating perform rather than the stable record', () => {
    expect(recoveryBinding(source)).toEqual([
      { hook: 'useBoundHandlers', binding: 'perform', record: 'recoveryHandlers' },
    ]);
    expect(source).toContain('...recoveryHandlers, ...libraryHandlers, perform');
  });

  it('detects moving retry back to the stable record', () => {
    const handler =
      '    retryLibraryOpening: (discardRevision) => onlineState.retryOpening(() => guestLibrary.retry(discardRevision)),\n';
    const moved = source
      .replace(handler, '')
      .replace('    setCompareTrayVisible,\n', `    setCompareTrayVisible,\n${handler}`);
    expect(moved).not.toBe(source);
    expect(recoveryBinding(moved)).toEqual([{ hook: 'useStableHandlers', binding: '', record: 'handlers' }]);
  });
});
