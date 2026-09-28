import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export interface SourceText {
  file: string;
  text: string;
}

export interface UnusedRule {
  file: string;
  line: number;
  selector: string;
  missing: string[];
}

function outsideLiterals(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g, (value) =>
    value.replace(/[^\r\n]/g, ' '),
  );
}

function sourceUsage(sources: SourceText[]): { text: string; fragments: string[] } {
  const fragments = new Set<string>();
  const strings = sources.map((source) => source.text);
  for (const { file, text } of sources) {
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      // Keep every string fragment, not only strings in a className. This also
      // covers classList, joins, helpers and strings embedded in browser fixtures.
      const template = ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
      if (ts.isStringLiteralLike(node) || template) {
        strings.push(node.text);
        for (const fragment of node.text.match(/[-_a-zA-Z0-9]+/g) ?? []) {
          if (!/[a-zA-Z0-9]/.test(fragment)) continue;
          if (
            template ||
            fragment.startsWith('-') ||
            fragment.endsWith('-') ||
            fragment.startsWith('_') ||
            fragment.endsWith('_')
          ) {
            fragments.add(fragment);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  return { text: strings.join('\n'), fragments: [...fragments] };
}

/**
 * Review candidates only, never an automatic deletion pass. Escapes, attributes,
 * functional pseudos, nesting and shell/root rules are deliberately left alone.
 */
export function findUnusedRules(styles: SourceText[], sources: SourceText[]): UnusedRule[] {
  const usage = sourceUsage(sources);
  const used = (token: string) =>
    usage.text.includes(token) || usage.fragments.some((fragment) => token.includes(fragment));
  const results: UnusedRule[] = [];
  for (const { file, text } of styles) {
    if (file.replaceAll('\\', '/').includes('/first-paint/')) continue;
    const code = outsideLiterals(text);
    const blocks: { start: number; open: number; nested: boolean }[] = [];
    let start = 0;
    for (let index = 0; index < code.length; index++) {
      if (code[index] === '{') {
        if (blocks.length) blocks[blocks.length - 1]!.nested = true;
        blocks.push({ start, open: index, nested: false });
        start = index + 1;
      } else if (code[index] === ';') {
        start = index + 1;
      } else if (code[index] === '}') {
        const block = blocks.pop();
        if (!block) throw new Error(`Unbalanced CSS block in ${file}.`);
        start = index + 1;
        const prelude = code.slice(block.start, block.open).trim();
        if (
          block.nested ||
          prelude.startsWith('@') ||
          /[\\[(&]|(^|[^\w-])(?:html|body)(?=[^\w-]|$)|:root|#root(?![\w-])/i.test(prelude)
        ) {
          continue;
        }
        const selectors = prelude.split(',');
        const missing = selectors.map((selector) =>
          [...selector.matchAll(/[.#](-?[_a-zA-Z][\w-]*)/g)]
            .map((match) => match[1]!)
            .filter((token) => !used(token)),
        );
        // Every comma branch must require an absent positive token. A used
        // sibling prevents deleting the whole rule, even if another is absent.
        if (!missing.length || missing.some((tokens) => !tokens.length)) continue;
        const first = block.start + code.slice(block.start, block.open).search(/\S/);
        results.push({
          file,
          line: text.slice(0, first).split('\n').length,
          selector: text.slice(first, block.open).trim(),
          missing: [...new Set(missing.flat())],
        });
      }
    }
    if (blocks.length) throw new Error(`Unbalanced CSS block in ${file}.`);
  }
  return results.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export async function inspectUnusedCss(root: string): Promise<UnusedRule[]> {
  const styles: SourceText[] = [];
  const sources: SourceText[] = [{ file: 'index.html', text: await readFile(path.join(root, 'index.html'), 'utf8') }];
  const walk = async (directory: string) => {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && /\.(?:css|ts|tsx|js|html)$/.test(file)) {
        const source = { file, text: await readFile(path.join(root, file), 'utf8') };
        if (file.endsWith('.css')) styles.push(source);
        if (!file.endsWith('.css') || file.split(path.sep).includes('first-paint')) sources.push(source);
      }
    }
  };
  await walk('src');
  return findUnusedRules(styles, sources);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void inspectUnusedCss(fileURLToPath(new URL('../', import.meta.url)))
    .then((rules) => {
      for (const rule of rules) console.log(`${rule.file}:${rule.line}: ${rule.selector} [${rule.missing.join(', ')}]`);
      console.log(`${rules.length} unreferenced rule candidates; review dynamic and external usage before removal.`);
    })
    .catch((cause: unknown) => {
      console.error('CSS usage scan failed:', cause instanceof Error ? cause.message : 'Unknown failure.');
      process.exitCode = 1;
    });
}
