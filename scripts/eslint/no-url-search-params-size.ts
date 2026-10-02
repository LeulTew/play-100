/**
 * URLSearchParams#size shipped in Chromium 113, Firefox 112 and Safari 17; on older engines it reads as undefined,
 * so `if (params.size)` silently takes the empty branch (G12 READINESS-08). Count entries with
 * `[...params.keys()].length` or test `params.toString() !== ''` instead.
 *
 * The rule asks the type checker which declaration a `size` read resolves to, so it catches member reads, optional
 * chains, element access with a literal key and destructuring, whatever the variable is called.
 */
import type { Rule } from 'eslint';
import ts from 'typescript';

interface TypedParserServices {
  program: ts.Program;
  esTreeNodeToTSNodeMap: { get(node: unknown): ts.Node };
}

function typedServices(context: Rule.RuleContext): TypedParserServices | undefined {
  const services = context.sourceCode.parserServices as Partial<TypedParserServices> | undefined;
  return services?.program && services.esTreeNodeToTSNodeMap ? (services as TypedParserServices) : undefined;
}

function declaredOnUrlSearchParams(symbol: ts.Symbol | undefined): boolean {
  return (symbol?.declarations ?? []).some((declaration) => {
    const owner = declaration.parent;
    return (ts.isInterfaceDeclaration(owner) || ts.isClassDeclaration(owner)) && owner.name?.text === 'URLSearchParams';
  });
}

function sizeSymbol(checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined {
  if (ts.isPropertyAccessExpression(node)) return checker.getSymbolAtLocation(node.name);
  if (ts.isElementAccessExpression(node)) return checker.getSymbolAtLocation(node.argumentExpression);
  if (ts.isBindingElement(node)) {
    const name = node.propertyName ?? node.name;
    if (!ts.isIdentifier(name) && !ts.isStringLiteral(name)) return undefined;
    return checker.getTypeAtLocation(node.parent).getProperty(name.text);
  }
  return undefined;
}

function isSizeKey(key: { type: string; name?: unknown; value?: unknown }, computed: boolean): boolean {
  if (key.type === 'Literal') return key.value === 'size';
  return !computed && key.type === 'Identifier' && key.name === 'size';
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow URLSearchParams#size, which older supported engines do not implement.' },
    messages: {
      size: 'URLSearchParams#size is undefined before Chromium 113, Firefox 112 and Safari 17. Count [...params.keys()] instead.',
    },
    schema: [],
  },
  create(context) {
    const services = typedServices(context);
    if (!services) return {};
    const checker = services.program.getTypeChecker();
    const report = (node: Rule.Node) => {
      if (declaredOnUrlSearchParams(sizeSymbol(checker, services.esTreeNodeToTSNodeMap.get(node)))) {
        context.report({ node, messageId: 'size' });
      }
    };
    return {
      MemberExpression(node) {
        if (isSizeKey(node.property, node.computed)) report(node);
      },
      Property(node) {
        if (node.parent.type === 'ObjectPattern' && isSizeKey(node.key, node.computed)) report(node);
      },
    };
  },
};

export const play100Plugin = { meta: { name: 'play100' }, rules: { 'no-url-search-params-size': rule } };
