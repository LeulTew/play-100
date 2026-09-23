import * as ts from 'typescript';

export type IndexMode = 'ASCENDING' | 'DESCENDING' | 'CONTAINS';
export type QueryScope = 'COLLECTION' | 'COLLECTION_GROUP';
export interface IndexField { fieldPath: string; order?: 'ASCENDING' | 'DESCENDING'; arrayConfig?: 'CONTAINS' }
export interface IndexDefinition { collectionGroup: string; queryScope: QueryScope; fields: IndexField[] }
export interface FieldOverride {
  collectionGroup: string; fieldPath: string;
  indexes: Array<{ queryScope: QueryScope; order?: 'ASCENDING' | 'DESCENDING'; arrayConfig?: 'CONTAINS' }>;
}
export interface IndexConfiguration { indexes: IndexDefinition[]; fieldOverrides: FieldOverride[] }
export interface Filter { field: string; operator: string }
export interface Ordering { field: string; direction: 'ASCENDING' | 'DESCENDING' }
export interface QueryShape {
  id: string; collectionGroup: string; scope: QueryScope; filters: Filter[]; orders: Ordering[];
}
export interface Exemption { collectionGroup: string; fieldPath: string }
type Clause = { kind: 'filter'; value: Filter } | { kind: 'order'; value: Ordering };
type Owner = ts.MethodDeclaration | ts.FunctionDeclaration | ts.SourceFile;

export const STORAGE_02_EXEMPTIONS: readonly Exemption[] = [
  { collectionGroup: 'entries', fieldPath: 'token' },
  { collectionGroup: 'entries', fieldPath: 'step' },
  { collectionGroup: 'chunks', fieldPath: 'digest' },
  { collectionGroup: 'chunks', fieldPath: 'bytes' },
  { collectionGroup: 'chunks', fieldPath: 'createdAt' },
  { collectionGroup: 'chunks', fieldPath: 'holder' },
  { collectionGroup: 'chunks', fieldPath: 'holders' },
  { collectionGroup: 'generations', fieldPath: 'private' },
  { collectionGroup: 'generations', fieldPath: 'ranking' },
  { collectionGroup: 'syncHeads', fieldPath: 'current' },
  { collectionGroup: 'syncHeads', fieldPath: 'previous' },
  { collectionGroup: 'creatorRanks', fieldPath: 'current' },
  { collectionGroup: 'creatorRanks', fieldPath: 'previous' },
];

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, child => walk(child, visit));
}
function combine(left: Clause[][], right: Clause[][]): Clause[][] {
  if (left.length * right.length > 128) throw new Error('Query variant count exceeds the audited limit.');
  return left.flatMap(a => right.map(b => [...a, ...b]));
}
function ownerOf(node: ts.Node): Owner {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isMethodDeclaration(current) || ts.isFunctionDeclaration(current)) return current;
    current = current.parent;
  }
  if (!current || !ts.isSourceFile(current)) throw new Error('A query has no source scope.');
  return current;
}
function ownerName(owner: Owner): string {
  if (ts.isSourceFile(owner)) return '<module>';
  const name = owner.name?.getText() ?? '<anonymous>';
  return ts.isMethodDeclaration(owner) && ts.isClassDeclaration(owner.parent)
    ? `${owner.parent.name?.text ?? '<anonymous>'}.${name}` : name;
}

/**
 * Enumerates supported Firestore query construction without executing app code.
 * Unsupported indirection fails closed instead of omitting a possible query.
 */
export function extractQueries(file: string, text: string): QueryShape[] {
  if (/\b(?:runQuery|structuredQuery)\b/.test(text)) {
    throw new Error(`${file}: runQuery/structuredQuery requires a reviewed extractor.`);
  }
  if (/\borderBy=|(['"`])orderBy\1/.test(text)) {
    throw new Error(`${file}: REST orderBy requires a reviewed extractor.`);
  }
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const bindings = new Map<string, string>();
  const namespaces = new Set<string>();
  const primitives = new Set(['query', 'collection', 'collectionGroup', 'where', 'orderBy']);
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) &&
      /^firebase\/firestore(?:\/lite)?$/.test(statement.moduleSpecifier.text)) {
      throw new Error(`${file}: Firestore re-exports need explicit query provenance; do not bypass this audit.`);
    }
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) ||
      !/^firebase\/firestore(?:\/lite)?$/.test(statement.moduleSpecifier.text)) continue;
    const imports = statement.importClause?.namedBindings;
    if (imports && ts.isNamedImports(imports)) imports.elements.forEach(item => bindings.set(item.name.text, item.propertyName?.text ?? item.name.text));
    if (imports && ts.isNamespaceImport(imports)) namespaces.add(imports.name.text);
  }
  const sdkName = (expression: ts.Expression): string | undefined => {
    if (ts.isIdentifier(expression)) return bindings.get(expression.text);
    if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) && namespaces.has(expression.expression.text)) return expression.name.text;
    if (ts.isElementAccessExpression(expression) && ts.isIdentifier(expression.expression) && namespaces.has(expression.expression.text) &&
      expression.argumentExpression && ts.isStringLiteral(expression.argumentExpression)) return expression.argumentExpression.text;
    return undefined;
  };
  const fail = (node: ts.Node, message: string): never => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    throw new Error(`${file}:${line}: ${message}`);
  };
  const variable = (name: string, owner: Owner): ts.Expression => {
    const found: ts.Expression[] = [];
    walk(owner, node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) found.push(node.initializer);
      if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left) && node.left.text === name &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        fail(node, `Mutable query binding ${name} needs an explicit reviewed extractor.`);
      }
    });
    if (found.length !== 1) return fail(owner, `Cannot uniquely resolve query binding ${name}.`);
    return found[0]!;
  };
  const strings = (expression: ts.Expression, owner: Owner, depth = 0): string[] => {
    if (depth > 12) return fail(expression, 'Query expression nesting exceeds the audited limit.');
    if (ts.isStringLiteralLike(expression)) return [expression.text];
    if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) return strings(expression.expression, owner, depth + 1);
    if (ts.isConditionalExpression(expression)) return [...new Set([...strings(expression.whenTrue, owner, depth + 1), ...strings(expression.whenFalse, owner, depth + 1)])];
    if (ts.isCallExpression(expression) && sdkName(expression.expression) === 'documentId') return ['__name__'];
    if (ts.isIdentifier(expression)) return strings(variable(expression.text, owner), owner, depth + 1);
    return fail(expression, 'Dynamic query field, operator or direction is not statically resolved.');
  };
  const consumed = new Set<ts.CallExpression>();
  const ignoredControls = new Set(['limit', 'startAt', 'startAfter', 'endAt', 'endBefore']);
  const operators = new Set(['==', '!=', '<', '<=', '>', '>=', 'in', 'not-in', 'array-contains', 'array-contains-any']);
  const clauses = (expression: ts.Expression, owner: Owner, depth = 0): Clause[][] => {
    if (depth > 12) return fail(expression, 'Query constraint nesting exceeds the audited limit.');
    if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) return clauses(expression.expression, owner, depth + 1);
    if (ts.isSpreadElement(expression)) return clauses(expression.expression, owner, depth + 1);
    if (ts.isArrayLiteralExpression(expression)) return expression.elements.reduce<Clause[][]>((result, item) => combine(result, clauses(item, owner, depth + 1)), [[]]);
    if (ts.isConditionalExpression(expression)) return [...clauses(expression.whenTrue, owner, depth + 1), ...clauses(expression.whenFalse, owner, depth + 1)];
    if (ts.isIdentifier(expression)) {
      let result = clauses(variable(expression.text, owner), owner, depth + 1);
      walk(owner, node => {
        if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression) ||
          !ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== expression.text) return;
        if (node.expression.name.text !== 'push') fail(node, 'Only audited push-based query construction is supported.');
        let additions: Clause[][] = [[]];
        for (const argument of node.arguments) additions = combine(additions, clauses(argument, owner, depth + 1));
        let ancestor: ts.Node | undefined = node.parent;
        let optional = false;
        while (ancestor && ancestor !== owner) {
          optional ||= ts.isIfStatement(ancestor) || ts.isConditionalExpression(ancestor);
          if (ts.isForStatement(ancestor) || ts.isForOfStatement(ancestor) || ts.isForInStatement(ancestor) ||
            ts.isWhileStatement(ancestor) || ts.isDoStatement(ancestor)) fail(ancestor, 'Loop-built query constraints require a reviewed extractor.');
          ancestor = ancestor.parent;
        }
        result = combine(result, optional ? [[], ...additions] : additions);
      });
      return result;
    }
    if (!ts.isCallExpression(expression)) return fail(expression, 'Unsupported query constraint expression.');
    const name = sdkName(expression.expression);
    if (name && ignoredControls.has(name)) return [[]];
    if (name !== 'where' && name !== 'orderBy') return fail(expression, 'Unknown query constraint factory; no index assumption was made.');
    const field = expression.arguments[0];
    if (!field) return fail(expression, 'Missing query field.');
    const fields = strings(field, owner);
    if (name === 'where') {
      const operator = expression.arguments[1];
      if (!operator) return fail(expression, 'Missing where operator.');
      const values = strings(operator, owner);
      if (values.some(value => !operators.has(value))) return fail(operator, 'Unsupported where operator.');
      consumed.add(expression);
      return fields.flatMap(value => values.map<Clause[]>(operation => [{ kind: 'filter', value: { field: value, operator: operation } }]));
    }
    if (name === 'orderBy') {
      const directions = expression.arguments[1] ? strings(expression.arguments[1], owner) : ['asc'];
      if (directions.some(value => value !== 'asc' && value !== 'desc')) return fail(expression, 'Invalid orderBy direction.');
      consumed.add(expression);
      return fields.flatMap(value => directions.map<Clause[]>(direction => [{ kind: 'order', value: { field: value, direction: direction === 'asc' ? 'ASCENDING' : 'DESCENDING' } }]));
    }
    return fail(expression, 'Unknown query constraint factory; no index assumption was made.');
  };
  const collectionOf = (expression: ts.Expression, owner: Owner, depth = 0): { group: string; scope: QueryScope } => {
    if (depth > 12) return fail(expression, 'Collection reference nesting exceeds the audited limit.');
    if (ts.isParenthesizedExpression(expression)) return collectionOf(expression.expression, owner, depth + 1);
    if (ts.isIdentifier(expression)) return collectionOf(variable(expression.text, owner), owner, depth + 1);
    if (!ts.isCallExpression(expression)) return fail(expression, 'Collection reference is not statically resolved.');
    const name = sdkName(expression.expression);
    if (name === 'collection' || name === 'collectionGroup') {
      const last = expression.arguments.at(-1);
      const groups = last ? strings(last, owner) : [];
      if (groups.length !== 1 || !groups[0]) return fail(expression, 'A dynamic collection group requires an explicit reviewed extractor.');
      if (groups[0].includes('/')) return fail(expression, 'A slash-joined collection path requires an explicit reviewed extractor.');
      return { group: groups[0], scope: name === 'collectionGroup' ? 'COLLECTION_GROUP' : 'COLLECTION' };
    }
    if (ts.isPropertyAccessExpression(expression.expression) && expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
      let parent: ts.Node | undefined = owner;
      while (parent && !ts.isClassDeclaration(parent)) parent = parent.parent;
      const methodName = expression.expression.name.text;
      const method = parent && ts.isClassDeclaration(parent)
        ? parent.members.find((member): member is ts.MethodDeclaration => ts.isMethodDeclaration(member) && member.name.getText(source) === methodName) : undefined;
      const returned = method?.body?.statements.filter(ts.isReturnStatement);
      if (!method || returned?.length !== 1 || !returned[0]?.expression) return fail(expression, 'Unresolved collection-reference method.');
      return collectionOf(returned[0].expression, method, depth + 1);
    }
    return fail(expression, 'Unsupported collection-reference factory.');
  };

  const queries: QueryShape[] = [];
  const primitiveCalls: ts.CallExpression[] = [];
  walk(source, node => {
    if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
      ts.isIdentifier(node.name) && node.name.text === 'orderBy') {
      fail(node, 'REST orderBy requires a reviewed extractor.');
    }
    if (ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'orderBy') {
      fail(node, 'REST orderBy requires a reviewed extractor.');
    }
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const referenced = sdkName(node);
      const memberName = ts.isIdentifier(node) && ts.isPropertyAccessExpression(node.parent) && node.parent.name === node;
      if (referenced && primitives.has(referenced) && !memberName && !ts.isImportSpecifier(node.parent) && !ts.isTypeQueryNode(node.parent) &&
        !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
        fail(node, 'A Firestore query primitive is aliased/passed rather than called; provenance must be explicit.');
      }
    }
    if (!ts.isCallExpression(node)) return;
    if (ts.isElementAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) &&
      namespaces.has(node.expression.expression.text) && !ts.isStringLiteral(node.expression.argumentExpression)) {
      fail(node, 'Computed Firestore method dispatch is not auditable.');
    }
    const name = sdkName(node.expression);
    if (name === 'where' || name === 'orderBy') primitiveCalls.push(node);
    const rawName = ts.isIdentifier(node.expression) ? node.expression.text
      : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : undefined;
    if (!name && rawName && ['where', 'orderBy', 'collectionGroup'].includes(rawName)) fail(node, 'Unbound query primitive requires review.');
    if (name !== 'query') return;
    const first = node.arguments[0];
    if (!first) return fail(node, 'Query has no collection reference.');
    const owner = ownerOf(node);
    const location = collectionOf(first, owner);
    let variants: Clause[][] = [[]];
    for (const argument of node.arguments.slice(1)) variants = combine(variants, clauses(argument, owner));
    for (const variant of variants) queries.push({
      id: `${file}#${ownerName(owner)}`, collectionGroup: location.group, scope: location.scope,
      filters: variant.flatMap(item => item.kind === 'filter' ? [item.value] : []),
      orders: variant.flatMap(item => item.kind === 'order' ? [item.value] : []),
    });
  });
  for (const call of primitiveCalls) if (!consumed.has(call)) fail(call, 'A where/orderBy call is not covered by a query construction.');
  const unique = new Map(queries.map(query => [JSON.stringify(query), query]));
  return [...unique.values()];
}

function singleAvailable(config: IndexConfiguration, query: QueryShape, field: string, mode: IndexMode): boolean {
  if (field === '__name__') return true;
  const override = config.fieldOverrides
    .filter(value => value.collectionGroup === query.collectionGroup && (field === value.fieldPath || field.startsWith(`${value.fieldPath}.`)))
    .sort((a, b) => b.fieldPath.length - a.fieldPath.length)[0];
  if (!override) return query.scope === 'COLLECTION';
  return override.indexes.some(index => index.queryScope === query.scope && (index.order ?? index.arrayConfig) === mode);
}

export function assertQueryIndexes(config: IndexConfiguration, queries: readonly QueryShape[], forbidden: readonly Exemption[] = STORAGE_02_EXEMPTIONS): void {
  const equality = new Set(['==', 'in']);
  const arrays = new Set(['array-contains', 'array-contains-any']);
  for (const query of queries) {
    const fields = [...query.filters.map(value => value.field), ...query.orders.map(value => value.field)];
    for (const field of fields) {
      if (forbidden.some(value => value.collectionGroup === query.collectionGroup && (field === value.fieldPath || field.startsWith(`${value.fieldPath}.`)))) {
        throw new Error(`${query.id}: proposed exemption is queried: ${query.collectionGroup}.${field}`);
      }
    }
    const filters = query.filters.filter(value => value.field !== '__name__');
    const orders = query.orders.filter(value => value.field !== '__name__');
    const arrayFields = new Set(filters.filter(value => arrays.has(value.operator)).map(value => value.field));
    const ranges = [...new Set(filters.filter(value => !equality.has(value.operator) && !arrays.has(value.operator)).map(value => value.field))];
    if (!orders.length && ranges.length > 1) {
      throw new Error(`${query.id}: implicit multi-inequality ordering needs an explicit reviewed index contract.`);
    }
    const namePosition = query.orders.findIndex(value => value.field === '__name__');
    if (namePosition !== -1 && namePosition !== query.orders.length - 1) {
      throw new Error(`${query.id}: explicit document-ID order must be the last explicit order.`);
    }
    const effectiveOrders = orders.length ? orders : ranges.map(field => ({ field, direction: 'ASCENDING' as const }));
    const nameOrder = query.orders.find(value => value.field === '__name__')?.direction;
    if (nameOrder && nameOrder !== (effectiveOrders.at(-1)?.direction ?? 'ASCENDING')) {
      throw new Error(`${query.id}: non-default document-ID ordering needs an explicit reviewed index contract.`);
    }
    if (query.orders.length && ranges.some(field => !orders.some(order => order.field === field))) {
      throw new Error(`${query.id}: implicit inequality ordering needs an explicit reviewed index contract.`);
    }
    const ordered = new Set(effectiveOrders.map(value => value.field));
    const equalFields = new Set(filters.filter(value => equality.has(value.operator) && !ordered.has(value.field)).map(value => value.field));
    const allFields = new Set([...filters.map(value => value.field), ...orders.map(value => value.field)]);
    const needsComposite = (arrayFields.size > 0 && allFields.size > 1) ||
      (effectiveOrders.length > 0 && [...equalFields].some(field => !ordered.has(field))) || effectiveOrders.length > 1;
    const matches = config.indexes.some(index => {
      if (index.collectionGroup !== query.collectionGroup || index.queryScope !== query.scope) return false;
      const prefix = new Map<string, IndexMode>([
        ...[...equalFields].map(field => [field, 'ASCENDING'] as const),
        ...[...arrayFields].map(field => [field, 'CONTAINS'] as const),
      ]);
      if (index.fields.length !== prefix.size + effectiveOrders.length) return false;
      if (new Set(index.fields.slice(0, prefix.size).map(field => field.fieldPath)).size !== prefix.size) return false;
      if (!index.fields.slice(0, prefix.size).every(field => prefix.get(field.fieldPath) === (field.order ?? field.arrayConfig))) return false;
      return effectiveOrders.every((order, offset) => {
        const field = index.fields[prefix.size + offset];
        return field?.fieldPath === order.field && field.order === order.direction;
      });
    });
    if (needsComposite) {
      if (!matches) throw new Error(`${query.id}: missing ${query.scope} composite for ${JSON.stringify({ filters, orders: effectiveOrders })}`);
      continue;
    }
    if (matches) continue;
    for (const filter of filters) {
      const mode = arrays.has(filter.operator) ? 'CONTAINS' : effectiveOrders.find(value => value.field === filter.field)?.direction ?? 'ASCENDING';
      if (!singleAvailable(config, query, filter.field, mode)) throw new Error(`${query.id}: missing ${mode} index for ${filter.field}`);
    }
    for (const order of effectiveOrders) {
      if (!singleAvailable(config, query, order.field, order.direction)) throw new Error(`${query.id}: missing ${order.direction} index for ${order.field}`);
    }
  }
}
