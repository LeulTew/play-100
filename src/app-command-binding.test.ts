import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// REL-01b: App keeps its commands stable (useStableHandlers) except those that can write a library, which it binds
// to the library they were rendered with (useBoundHandlers). A new command that can reach a library writer but is
// left among the stable handlers would silently save into whichever library is current when it runs. This test
// type-checks App.tsx and follows each stable handler through App's local closures and hook results to prove it
// cannot reach one, so such a command fails here rather than in a cross-tab race.

const APP = path.resolve('src/App.tsx');
const WRITER_INPUTS = /\b(?:PersonalAction|PersonalLibraryState)\b/;

function program(source?: string) {
  const config = ts.getParsedCommandLineOfConfigFile(
    path.resolve('tsconfig.app.json'),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      },
    },
  );
  if (!config) throw new Error('tsconfig.app.json could not be read.');
  const host = ts.createCompilerHost(config.options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (file, language, ...rest) =>
    source !== undefined && path.resolve(file) === APP
      ? ts.createSourceFile(file, source, language, true, ts.ScriptKind.TSX)
      : read(file, language, ...rest);
  // App.tsx and the ambient declarations (vite/client, CSS modules) the app project includes.
  const ambient = config.fileNames.filter((name) => name.endsWith('.d.ts'));
  return ts.createProgram([APP, ...ambient], config.options, host);
}

function findCall(root: ts.Node, name: string): ts.CallExpression {
  let found: ts.CallExpression | undefined;
  root.forEachChild(function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) found = node;
    else node.forEachChild(visit);
  });
  if (!found) throw new Error(`App no longer calls ${name}.`);
  return found;
}

/** For each command in App's stable and bound handler objects, whether it can reach a library writer. */
function appCommandReach(source?: string) {
  const built = program(source);
  const checker = built.getTypeChecker();
  const file = built.getSourceFile(APP);
  if (!file) throw new Error('src/App.tsx is missing.');
  const errors = ts.getPreEmitDiagnostics(built, file).filter((item) => item.category === ts.DiagnosticCategory.Error);
  const app = file.statements.find(
    (statement): statement is ts.FunctionDeclaration & { body: ts.Block } =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'App' && Boolean(statement.body),
  );
  if (!app) throw new Error('App.tsx no longer declares App.');
  const local = (node: ts.Node) => node.pos >= app.body.pos && node.end <= app.body.end;

  // A function whose parameter is a library action or state, or an object holding one (a library, a controller).
  const writes = (type: ts.Type, depth = 1): boolean => {
    const target = checker.getNonNullableType(type);
    if (target.isUnion()) return target.types.some((member) => writes(member, depth));
    const direct = target
      .getCallSignatures()
      .some((signature) =>
        signature.parameters.some((parameter) =>
          WRITER_INPUTS.test(checker.typeToString(checker.getTypeOfSymbol(parameter))),
        ),
      );
    return (
      direct ||
      (depth > 0 && target.getProperties().some((property) => writes(checker.getTypeOfSymbol(property), depth - 1)))
    );
  };
  // Only functions, or objects that hold them, can carry a writer; data such as a status or a record cannot. The
  // methods of built-in types (arrays, strings, maps) are not App's, so a list of records is still data.
  const builtIn = (symbol: ts.Symbol) =>
    Boolean(symbol.declarations?.length) &&
    symbol.declarations!.every((declaration) => built.isSourceFileDefaultLibrary(declaration.getSourceFile()));
  const carries = (type: ts.Type, depth = 2): boolean => {
    const target = checker.getNonNullableType(type);
    if (target.isUnion()) return target.types.some((member) => carries(member, depth));
    if (target.getCallSignatures().length) return true;
    if (depth === 0 || !(target.flags & ts.TypeFlags.Object)) return false;
    if (checker.isArrayType(target) || checker.isTupleType(target))
      return checker.getTypeArguments(target as ts.TypeReference).some((item) => carries(item, depth - 1));
    return target
      .getProperties()
      .some((property) => !builtIn(property) && carries(checker.getTypeOfSymbol(property), depth - 1));
  };
  const origin = (declaration: ts.Declaration): ts.Node | undefined => {
    let node: ts.Node = declaration;
    while (ts.isBindingElement(node) || ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node))
      node = node.parent;
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) return node.initializer;
    if (ts.isFunctionDeclaration(node)) return node.body;
    return undefined;
  };

  const reaches = (root: ts.Node, seen: Set<ts.Node>): boolean => {
    let found = false;
    const visit = (node: ts.Node) => {
      if (found) return;
      if (ts.isIdentifier(node) && !isName(node)) {
        let chain: ts.Expression = node;
        const prefixes: ts.Expression[] = [node];
        while (
          (ts.isPropertyAccessExpression(chain.parent) || ts.isElementAccessExpression(chain.parent)) &&
          chain.parent.expression === chain
        ) {
          chain = chain.parent;
          prefixes.push(chain);
        }
        if (carries(checker.getTypeAtLocation(chain))) {
          if (prefixes.some((prefix) => writes(checker.getTypeAtLocation(prefix)))) {
            found = true;
            return;
          }
          const symbol = ts.isShorthandPropertyAssignment(node.parent)
            ? checker.getShorthandAssignmentValueSymbol(node.parent)
            : checker.getSymbolAtLocation(node);
          for (const declaration of symbol?.declarations ?? []) {
            if (!local(declaration) || seen.has(declaration)) continue;
            seen.add(declaration);
            const source = origin(declaration);
            if (source && reaches(source, seen)) {
              found = true;
              return;
            }
          }
        }
      }
      node.forEachChild(visit);
    };
    visit(root);
    return found;
  };

  const commands = (call: ts.CallExpression, argument: number) => {
    const object = call.arguments[argument];
    if (!object || !ts.isObjectLiteralExpression(object)) throw new Error('App passes its handlers inline.');
    return Object.fromEntries(
      object.properties.map((property) => {
        const name = property.name && ts.isIdentifier(property.name) ? property.name.text : property.getText();
        return [name, reaches(property, new Set())] as const;
      }),
    );
  };
  return {
    errors: errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')),
    stable: commands(findCall(app.body, 'useStableHandlers'), 0),
    bound: commands(findCall(app.body, 'useBoundHandlers'), 1),
  };
}

function isName(node: ts.Identifier) {
  const parent = node.parent;
  return (
    ((ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent)) && parent.name === node) ||
    ((ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isBindingElement(parent) ||
      ts.isFunctionDeclaration(parent)) &&
      parent.name === node) ||
    (ts.isBindingElement(parent) && parent.propertyName === node)
  );
}

describe('App command binding (REL-01b)', () => {
  it('keeps every command that can reach a library writer out of the stable handlers', () => {
    const { errors, stable, bound } = appCommandReach();
    expect(errors).toEqual([]);
    expect(Object.keys(stable).length).toBeGreaterThan(20);
    expect(Object.entries(stable).filter(([, reached]) => reached)).toEqual([]);
    // The analysis sees the writers App binds, so a clean stable list means something.
    expect(bound).toEqual({
      toggle: true,
      rankSelected: true,
      performDetailAction: true,
      resetLibrary: true,
      restoreLibrary: true,
    });
  }, 60_000);

  it('fails a writer moved to the stable handlers, directly or through a local closure', () => {
    const app = readFileSync(APP, 'utf8');
    const moved = app
      .replace('      performDetailAction: detail.performDetailAction,\n', '')
      .replace("type LibraryCommand = 'perform' | 'performDetailAction' |", "type LibraryCommand = 'perform' |")
      .replace(
        '    setCompareTrayVisible,\n',
        '    setCompareTrayVisible,\n    performDetailAction: detail.performDetailAction,\n',
      );
    expect(moved).not.toBe(app);
    const direct = appCommandReach(moved);
    expect(direct.errors).toEqual([]);
    expect(direct.stable.performDetailAction).toBe(true);

    const indirect = appCommandReach(
      app.replace('    signIn.reset();\n', '    signIn.reset();\n    void library.reset();\n'),
    );
    expect(indirect.errors).toEqual([]);
    expect(
      Object.entries(indirect.stable)
        .filter(([, reached]) => reached)
        .map(([name]) => name),
    ).toEqual(expect.arrayContaining(['navigate', 'accountEntry', 'browse', 'onDevice', 'compareGames']));
  }, 120_000);
});
