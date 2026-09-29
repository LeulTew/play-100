import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'firestore.rules'), 'utf8');

/**
 * The project's ceiling on the rules source (docs/security.md, "Rules size and structure"). Firebase refuses a source
 * over 256 KiB and a compiled ruleset over 250 KiB. The compiled size can't be measured locally, so the source stays
 * within three quarters of its own limit.
 */
export const RULES_SOURCE_CEILING = 192 * 1024;

// Firebase's compile-time limits (Firestore, "Structure security rules", Security rules limits).
const LIMITS = { functionArguments: 7, letBindings: 10, callDepth: 20, matchDepth: 10, captures: 20 };

/** The rules text with comments and string literals blanked, keeping every offset and line. */
function codeOnly(text: string): string {
  let out = '';
  for (let index = 0; index < text.length;) {
    const char = text[index]!;
    if (char === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') {
        out += ' ';
        index += 1;
      }
    } else if (char === "'" || char === '"') {
      out += char;
      index += 1;
      while (index < text.length && text[index] !== char) {
        const escaped = text[index] === '\\';
        out += text[index] === '\n' ? '\n' : ' ';
        index += escaped ? 2 : 1;
        if (escaped) out += ' ';
      }
      out += char;
      index += 1;
    } else {
      out += char;
      index += 1;
    }
  }
  return out;
}

function closingBrace(code: string, open: number): number {
  let depth = 0;
  for (let index = open; index < code.length; index += 1) {
    if (code[index] === '{') depth += 1;
    else if (code[index] === '}' && --depth === 0) return index;
  }
  throw new Error(`Unbalanced braces from offset ${open}.`);
}

interface RuleFunction {
  name: string;
  args: number;
  lets: number;
  calls: string[];
}

function ruleFunctions(code: string): RuleFunction[] {
  const found: Omit<RuleFunction, 'calls'>[] = [];
  const bodies: string[] = [];
  for (const match of code.matchAll(/\bfunction\s+(\w+)\s*\(([^)]*)\)\s*\{/g)) {
    const open = match.index + match[0].length - 1;
    const body = code.slice(open, closingBrace(code, open) + 1);
    const args = match[2]!.split(',').filter((arg) => arg.trim()).length;
    found.push({ name: match[1]!, args, lets: [...body.matchAll(/\blet\s+\w+\s*=/g)].length });
    bodies.push(body);
  }
  const names = new Set(found.map((entry) => entry.name));
  return found.map((entry, index) => ({
    ...entry,
    calls: [...new Set([...bodies[index]!.matchAll(/\b(\w+)\s*\(/g)].map((call) => call[1]!))].filter((name) =>
      names.has(name),
    ),
  }));
}

// The longest chain of rule-defined function calls starting at each function; a cycle fails.
function callDepths(functions: RuleFunction[]): Map<string, number> {
  const byName = new Map(functions.map((entry) => [entry.name, entry]));
  const depths = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (name: string): number => {
    const known = depths.get(name);
    if (known !== undefined) return known;
    if (visiting.has(name)) throw new Error(`The rules function ${name} calls itself, which Firebase refuses.`);
    visiting.add(name);
    const calls = byName.get(name)?.calls ?? [];
    const value = 1 + Math.max(0, ...calls.map(depth));
    visiting.delete(name);
    depths.set(name, value);
    return value;
  };
  for (const entry of functions) depth(entry.name);
  return depths;
}

// Each match block's nesting depth and the path captures of its chain of nested matches. A path runs from its leading
// slash through segments and `{capture}` groups; the block's own brace follows it after whitespace.
function matchBlocks(code: string): { depth: number; captures: number }[] {
  const blocks: { depth: number; captures: number }[] = [];
  const walk = (from: number, to: number, depth: number, captures: number) => {
    const pattern = /\bmatch\s+(\/(?:[^\s{]|\{[^}]*\})*)\s*\{/g;
    pattern.lastIndex = from;
    for (let match = pattern.exec(code); match && match.index < to; match = pattern.exec(code)) {
      const open = match.index + match[0].length - 1;
      const close = closingBrace(code, open);
      const own = [...match[1]!.matchAll(/\{[^}]*\}/g)].length;
      blocks.push({ depth: depth + 1, captures: captures + own });
      walk(open + 1, close, depth + 1, captures + own);
      pattern.lastIndex = close + 1;
    }
  };
  walk(0, code.length, 0, 0);
  return blocks;
}

const code = codeOnly(source);
const functions = ruleFunctions(code);

describe('firestore.rules size and structure', () => {
  it('keeps the source within its documented ceiling, with headroom below Firebase limits', () => {
    const bytes = Buffer.byteLength(source, 'utf8');
    expect(bytes).toBeLessThanOrEqual(RULES_SOURCE_CEILING);
    expect(RULES_SOURCE_CEILING).toBeLessThan(250 * 1024);
  });

  it('reads the rules it checks: the functions and match blocks the rest of the suite relies on', () => {
    expect(functions.length).toBeGreaterThan(50);
    expect(functions.find((entry) => entry.name === 'profileShape')).toMatchObject({ args: 2 });
    expect(functions.find((entry) => entry.name === 'canPublish')?.lets).toBe(1);
    expect(codeOnly("allow get: if a('{b}') // {c}\n;")).toBe("allow get: if a('   ')       \n;");
    const blocks = matchBlocks(code);
    expect(blocks.length).toBeGreaterThan(30);
    // Every rule sits inside /databases/{database}/documents, and the deepest paths carry their own captures.
    expect(blocks[0]).toEqual({ depth: 1, captures: 1 });
    expect(Math.min(...blocks.slice(1).map((block) => block.depth))).toBe(2);
    expect(Math.max(...blocks.map((block) => block.captures))).toBeGreaterThanOrEqual(4);
    expect(
      matchBlocks(codeOnly('match /a/{b} {\n  match /c/{d}/e/{f=**} { allow get: if true; }\n}\nmatch /g { }')),
    ).toEqual([
      { depth: 1, captures: 1 },
      { depth: 2, captures: 3 },
      { depth: 1, captures: 0 },
    ]);
  });

  it("stays within Firebase's compile-time function limits", () => {
    for (const entry of functions) {
      expect(entry.args, `${entry.name} arguments`).toBeLessThanOrEqual(LIMITS.functionArguments);
      expect(entry.lets, `${entry.name} let bindings`).toBeLessThanOrEqual(LIMITS.letBindings);
    }
    const deepest = Math.max(...callDepths(functions).values());
    // A rule's condition calls the first function, so the chain it can start is one deeper than its longest.
    expect(deepest + 1).toBeLessThanOrEqual(LIMITS.callDepth);
  });

  it("stays within Firebase's match nesting and path capture limits", () => {
    for (const block of matchBlocks(code)) {
      expect(block.depth).toBeLessThanOrEqual(LIMITS.matchDepth);
      expect(block.captures).toBeLessThanOrEqual(LIMITS.captures);
    }
  });
});
