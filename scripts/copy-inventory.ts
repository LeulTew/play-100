import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export interface CopyEntry {
  file: string;
  line: number;
  kind: string;
  text: string;
  condition: string;
}

const compact = (text: string) => text.replace(/\s+/g, ' ').trim();
const messageCall =
  /^(?:notify|report|tell|invalid|conflict|message|fail|set(?:Message|Error|Warning|Status|Notice|Feedback|UpdateError|NameError|MotionFeedback))$/i;
const copyAttribute =
  /^(?:aria-label|aria-description|placeholder|title|alt|label|message|description|error|actionLabel|titleId)$/;
const textTags = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'button',
  'summary',
  'label',
  'legend',
  'option',
  'a',
  'small',
  'strong',
  'span',
  'output',
]);

function rendered(node: ts.Node, source: ts.SourceFile): string {
  if (ts.isJsxText(node)) return node.text;
  if (ts.isJsxExpression(node))
    return node.expression
      ? ts.isStringLiteral(node.expression)
        ? node.expression.text
        : `\${${compact(node.expression.getText(source))}}`
      : '';
  if (ts.isJsxElement(node) || ts.isJsxFragment(node))
    return node.children.map((child) => rendered(child, source)).join('');
  return '';
}

function ignored(node: ts.Node): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isTypeNode(parent)) return true;
    if (ts.isCallExpression(parent) && /^console\./.test(parent.expression.getText())) return true;
    if (
      ts.isJsxAttribute(parent) &&
      !copyAttribute.test(parent.name.getText()) &&
      !/^on[A-Z]/.test(parent.name.getText())
    )
      return true;
    if (ts.isVariableDeclaration(parent) && parent.name.getText() === 'familyTerms') return true;
  }
  return false;
}

function context(node: ts.Node, source: ts.SourceFile): string {
  const conditions: string[] = [];
  let owner = '';
  for (let child: ts.Node = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (ts.isConditionalExpression(parent) && child !== parent.condition) {
      conditions.push(
        `${compact(parent.condition.getText(source))} is ${child === parent.whenTrue ? 'true' : 'false'}`,
      );
    } else if (ts.isIfStatement(parent) && child !== parent.expression) {
      conditions.push(
        `${compact(parent.expression.getText(source))} is ${child === parent.thenStatement ? 'true' : 'false'}`,
      );
    } else if (
      ts.isBinaryExpression(parent) &&
      child === parent.right &&
      [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(
        parent.operatorToken.kind,
      )
    ) {
      conditions.push(`${compact(parent.left.getText(source))} ${parent.operatorToken.getText(source)}`);
    } else if (ts.isCaseClause(parent)) {
      conditions.push(`case ${parent.expression.getText(source)}`);
    } else if (ts.isCatchClause(parent)) {
      conditions.push('operation rejected or threw');
    } else if (ts.isJsxAttribute(parent) && /^on[A-Z]/.test(parent.name.getText(source))) {
      conditions.push(parent.name.getText(source));
    } else if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText(source) === 'details') {
      const summary = parent.children.find(
        (child) => ts.isJsxElement(child) && child.openingElement.tagName.getText(source) === 'summary',
      );
      if (summary && child !== summary) conditions.push(`expanded "${compact(rendered(summary, source))}" disclosure`);
    }
    if (!owner && (ts.isFunctionDeclaration(parent) || ts.isMethodDeclaration(parent)) && parent.name)
      owner = parent.name.getText(source);
    if (
      !owner &&
      ts.isVariableDeclaration(parent) &&
      parent.initializer &&
      (ts.isArrowFunction(parent.initializer) || ts.isFunctionExpression(parent.initializer))
    )
      owner = parent.name.getText(source);
    if (!owner && ts.isVariableDeclaration(parent)) owner = parent.name.getText(source);
  }
  const location = owner ? `${owner}()` : 'module-defined copy';
  return `${location}${conditions.length ? `; ${conditions.reverse().join('; ')}` : '; when its owning surface/operation is used'}`;
}

export function extractCopy(file: string, text: string): CopyEntry[] {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found = new Map<string, CopyEntry>();
  const add = (node: ts.Node, kind: string, value: string) => {
    const text = compact(value);
    if (!text || !/[A-Za-z]/.test(text)) return;
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    found.set(`${line}:${text}`, { file, line, kind, text, condition: context(node, source) });
  };
  const visit = (node: ts.Node) => {
    if (ignored(node)) return;
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText(source);
      const live = node.openingElement.attributes.properties.some(
        (prop) =>
          ts.isJsxAttribute(prop) &&
          (prop.name.getText(source) === 'aria-live' ||
            (prop.name.getText(source) === 'role' && /status|alert/.test(prop.initializer?.getText(source) ?? ''))),
      );
      const direct = node.children.some((child) => ts.isJsxText(child) && compact(child.getText(source)));
      if ((textTags.has(tag) && (direct || node.children.some(ts.isJsxExpression))) || live)
        add(node, live ? 'Live region' : 'Rendered copy', rendered(node, source));
    } else if (
      ts.isJsxAttribute(node) &&
      copyAttribute.test(node.name.getText(source)) &&
      node.name.getText(source) !== 'titleId' &&
      node.initializer
    ) {
      add(
        node,
        'Label/help',
        ts.isStringLiteral(node.initializer) ? node.initializer.text : node.initializer.getText(source),
      );
    } else if (ts.isCallExpression(node)) {
      const target = node.expression.getText(source);
      const name = target.split('.').at(-1) ?? target;
      if (messageCall.test(name) && node.arguments.length)
        add(node, 'Message output', node.arguments.map((arg) => arg.getText(source)).join(', '));
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      if (ts.isJsxAttribute(node.parent)) return;
      const value = ts.isTemplateExpression(node) ? node.getText(source).slice(1, -1) : node.text;
      const readable = /\b[A-Za-z]{2,}\s+[A-Za-z${]/.test(value) || /^[A-Z][A-Za-z]+(?:…|[.!?])?$/.test(value);
      if (
        !readable ||
        /(?:Error|Exception)$|^(?:GET|POST|HEAD|PUT|DELETE|PATCH|NFC|NFKC|NFD|NFKD|RIFF|WEBP|IHDR|ANIM|ANMF|STATUS)$/.test(
          value,
        ) ||
        /^(?:https?:|data:|mailto:|src\/|\/|\.|#|\[|application\/|image\/|text\/|font\/)/.test(value) ||
        /^(?:[a-z]+:|\$\{[^}]+\}\/)|\b(?:px|rem|vh)\b.*[;{}]|^\w+,/.test(value)
      )
        return;
      if (ts.isPropertyAssignment(node.parent) && node.parent.name === node) return;
      const parent = node.parent;
      const newError = ts.isNewExpression(parent) && /Error$/.test(parent.expression.getText(source));
      add(node, newError ? 'Error/validation' : 'Message/fragment', value);
      if (ts.isTemplateExpression(node)) {
        // The parent template is complete; nested branch literals are documented by it.
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...found.values()].sort((a, b) => a.line - b.line || a.text.localeCompare(b.text));
}

export function extractHtmlCopy(file: string, text: string): CopyEntry[] {
  return [...text.matchAll(/<(h[1-4]|p|button|a|summary|noscript)\b[^>]*>([\s\S]*?)<\/\1>/g)]
    .map((match) => ({
      file,
      line: text.slice(0, match.index).split('\n').length,
      kind: 'HTML fallback',
      text: compact(match[2]!.replace(/<[^>]+>/g, ' ')),
      condition:
        file === 'index.html'
          ? 'JavaScript unavailable (noscript)'
          : file === 'public/404.html'
            ? 'Unknown page static fallback'
            : 'Navigation unavailable while offline',
    }))
    .filter((entry) => entry.text && (file !== 'index.html' || entry.text.includes('JavaScript')));
}

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (folder: string) => {
    for (const entry of readdirSync(path.join(root, folder), { withFileTypes: true })) {
      const name = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (!/^(?:fixtures|generated|__snapshots__)$/.test(entry.name)) visit(name);
      } else if (
        /\.(?:ts|tsx|js)$/.test(name) &&
        !/(?:\.test\.|\.browser[-.]|fixture|test-fixtures|test-server-ports|\.d\.ts$)/.test(name)
      ) {
        files.push(name.replaceAll(path.sep, '/'));
      }
    }
  };
  visit('src');
  visit('api');
  return files.sort();
}

const cell = (text: string) =>
  text
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&', '&amp;')
    .replaceAll('|', '&#124;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('`', '&#96;');

export function renderInventory(entries: CopyEntry[], files: number): string {
  const lines = [
    '# User-facing copy inventory',
    '',
    'Source-derived read-through inventory for Play 100. Regenerate with',
    '`npx tsx scripts/copy-inventory.ts`; verify with `--check`.',
    'The unit-test gate regenerates this inventory and rejects stale content or source references.',
    '',
    '## Scope and reading convention',
    '',
    `Scanned ${files} production TS/TSX/JS files and standalone HTML fallbacks; ${entries.length} source entries.`,
    'This is a deliberately inclusive inventory of rendered text, accessible labels,',
    'message outputs, message constants and validation/error strings. It includes the',
    'Discover help/source notes, Settings/backups/PWA, empty states, confirmations,',
    'toasts and live regions. Console-only diagnostics, tests, fixtures, generated',
    'data, imports, CSS selectors and protocol/URL strings are excluded.',
    '',
    '`${expression}` is source interpolation, not literal visitor copy. Conditional',
    'templates retain both alternatives; fragments are also listed so assembled',
    'messages can be read with their output site. Conditions show the owning function',
    'and enclosing source branches; they are not claims that every branch was visited',
    'in a browser. Error/validation entries include lower-level failures passed to UI',
    'error handlers; internal format keys are not proposed wording changes.',
    '',
    'Preserved workbook rationales, source annotations, provider-returned game facts',
    'and user-entered text are data, not editorial UI copy, and are not rewritten.',
    'Policy-related wording must be updated with any documentation quoting it.',
    'Numeric rating scales (for example /10), URLs, source-supplied genre labels and',
    'the established all-caps hero/artwork are not slash-pair or sentence-case prose defects.',
    'Operational/admin-only validation errors are retained for traceability, not',
    'represented as visitor toasts. Third-party default announcements are not authored',
    'in this source tree; dynamic output sites identify where data-derived copy appears.',
    '',
    '## Read-through conventions',
    '',
    '- Name the game and direction in individual library/progress/ranking messages.',
    '- Use Play later and About & credits consistently.',
    '- Keep visitor messages free of worker/controller/provider/payload implementation terms.',
    '- Use sentence case, plain conjunctions rather than slash pairs, and one action name.',
    '- Keep sibling notices in the same tense; state the result and useful recovery.',
    '- Keep privacy, deletion and storage consequences explicit and unchanged in meaning.',
    '',
    'The review replaced visitor-facing provider/worker terms with catalog/source or',
    'offline-access language; rating/note and reviews/ratings became conjunctions.',
    'Ranking additions share Add to my ranking; completion reversal is Mark not',
    'completed. Empty-state headings and fallback success messages now use the same',
    'plain voice. Existing privacy exclusions, storage guarantees and original scores',
    'are preserved. Single-game messages retain the game name and authoritative',
    'transaction feedback; bulk actions retain accurate changed/unchanged counts.',
    '',
  ];
  let currentFile = '';
  for (const entry of entries) {
    if (currentFile !== entry.file) {
      currentFile = entry.file;
      lines.push(
        `## ${currentFile}`,
        '',
        '| Source | Kind | Copy or expression | Showing condition / owner |',
        '| --- | --- | --- | --- |',
      );
    }
    lines.push(
      `| [${entry.file}:${entry.line}](../${entry.file}#L${entry.line}) | ${entry.kind} | ${cell(entry.text)} | ${cell(entry.condition)} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

export function collectInventory(root: string): { entries: CopyEntry[]; fileCount: number } {
  const files = sourceFiles(root);
  const htmlFiles = ['index.html', 'public/404.html', 'public/pwa/offline.html'];
  const entries = [
    ...files.flatMap((file) => extractCopy(file, readFileSync(path.resolve(root, file), 'utf8'))),
    ...htmlFiles.flatMap((file) => extractHtmlCopy(file, readFileSync(path.resolve(root, file), 'utf8'))),
  ].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { entries, fileCount: files.length + htmlFiles.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { entries, fileCount } = collectInventory(process.cwd());
  const output = renderInventory(entries, fileCount);
  const target = path.resolve('docs', 'copy-inventory.md');
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== output) throw new Error('Copy inventory is stale. Regenerate it from source.');
  } else writeFileSync(target, output);
  const json = process.argv.indexOf('--json');
  if (json >= 0) {
    const destination = process.argv[json + 1];
    if (!destination) throw new Error('--json requires an output path.');
    writeFileSync(destination, JSON.stringify(entries, null, 2));
  }
  console.log(`Copy inventory: ${entries.length} entries across ${fileCount} production source files.`);
}
