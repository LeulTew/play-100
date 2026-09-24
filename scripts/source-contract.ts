import * as ts from 'typescript';

export function sourceNodes<T extends ts.Node>(root: ts.Node, matches: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node): void => {
    if (matches(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

// Parse first so regexes, templates and strings remain tokens rather than losing
// significant whitespace to a source-wide whitespace/comment replacement.
function tokenTexts(text: string, kind: ts.ScriptKind): string[] {
  const source = ts.createSourceFile('contract.ts', text, ts.ScriptTarget.Latest, true, kind);
  const tokens: Array<{ kind: ts.SyntaxKind; text: string }> = [];
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.EndOfFileToken || ts.isJSDoc(node)) return;
    const children = node.getChildren(source);
    if (children.length) children.forEach(visit);
    else if (node.getWidth(source)) {
      tokens.push({ kind: node.kind, text: ts.isStringLiteral(node) ? JSON.stringify(node.text) : node.getText(source) });
    }
  };
  visit(source);
  return tokens.filter((token, index) => token.kind !== ts.SyntaxKind.CommaToken ||
    tokens[index - 1]?.kind === ts.SyntaxKind.CommaToken || tokens[index - 1]?.kind === ts.SyntaxKind.OpenBracketToken ||
    ![ts.SyntaxKind.CloseParenToken, ts.SyntaxKind.CloseBracketToken, ts.SyntaxKind.CloseBraceToken].includes(tokens[index + 1]?.kind ?? ts.SyntaxKind.Unknown))
    .map(token => token.text);
}

export function sourceTokens(text: string, kind = ts.ScriptKind.TS): string {
  return tokenTexts(text, kind).map(token => JSON.stringify(token)).join('\n');
}

export function sourceTokenBytes(text: string): number {
  return Buffer.byteLength(tokenTexts(text, ts.ScriptKind.TS).join(' '), 'utf8');
}
