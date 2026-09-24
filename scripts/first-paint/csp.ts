import { createHash } from 'node:crypto';
import { Parser } from 'htmlparser2';

/**
 * Content-Security-Policy checks for inline blocks in built documents (docs/first-paint-shell.md,
 * docs/security.md). The committed vercel.json is the only policy source; the build and the
 * read-only check:csp gate both call cspProblems() on the final HTML.
 */

export interface InlineBlock {
  readonly kind: 'script' | 'style';
  readonly bytes: number;
  /** The CSP source expression that allows exactly this content, e.g. 'sha256-…'. */
  readonly source: string;
}

export interface CspDocument {
  readonly name: string;
  readonly html: string;
}

export const MAIN_DOCUMENT_RULE = '/((?!__/auth/).*)';

export function sha256Source(content: string): string {
  return `'sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}'`;
}

/**
 * What a browser with scripting enabled acts on, read with an HTML tokenizer: comments are skipped,
 * <script> and <style> contents are raw text up to their real end tag, and <noscript> content is
 * inactive. Returns every inline <script> (without src) and <style> body in document order and the
 * attributes of every active element.
 */
function activeDocument(html: string) {
  const blocks: { kind: 'script' | 'style'; content: string }[] = [];
  const attributes: { tag: string; name: string; value: string }[] = [];
  let noscript = 0;
  let open: { kind: 'script' | 'style'; content: string; inline: boolean } | null = null;
  new Parser({
    onopentag(name, attribs) {
      if (name === 'noscript') noscript += 1;
      if (noscript) return;
      for (const [key, value] of Object.entries(attribs)) attributes.push({ tag: name, name: key, value });
      if (name === 'script' || name === 'style') open = { kind: name, content: '', inline: name === 'style' || !Object.hasOwn(attribs, 'src') };
    },
    ontext(text) {
      if (open) open.content += text;
    },
    onclosetag(name) {
      if (name === 'noscript') noscript = Math.max(0, noscript - 1);
      else if (open && name === open.kind) {
        if (open.inline) blocks.push({ kind: open.kind, content: open.content });
        open = null;
      }
    },
  }).end(html);
  return { blocks, attributes };
}

/** Every inline <script> (without src) and <style> element, in document order. */
export function inlineBlocks(html: string): InlineBlock[] {
  return activeDocument(html).blocks.map(({ kind, content }) => ({ kind, bytes: Buffer.byteLength(content, 'utf8'), source: sha256Source(content) }));
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The Content-Security-Policy of the single main-document header rule in vercel.json. */
export function mainDocumentPolicy(configuration: unknown): string {
  const rules = record(configuration) && Array.isArray(configuration.headers)
    ? configuration.headers.filter((rule: unknown) => record(rule) && rule.source === MAIN_DOCUMENT_RULE)
    : [];
  const rule: unknown = rules[0];
  const policies = rules.length === 1 && record(rule) && Array.isArray(rule.headers)
    ? rule.headers.filter((header: unknown) => record(header) && typeof header.key === 'string' && header.key.toLowerCase() === 'content-security-policy')
    : [];
  const policy: unknown = policies[0];
  if (policies.length !== 1 || !record(policy) || typeof policy.value !== 'string' || !policy.value.trim()) {
    throw new Error(`vercel.json must have exactly one ${MAIN_DOCUMENT_RULE} rule with one Content-Security-Policy.`);
  }
  return policy.value;
}

/** Source expressions of a directive, or null when the policy does not declare it. */
export function directiveSources(policy: string, name: string): string[] | null {
  for (const part of policy.split(';')) {
    const [directive, ...sources] = part.trim().split(/\s+/);
    if (directive?.toLowerCase() === name) return sources;
  }
  return null;
}

const HASH_SOURCE = /^'sha(?:256|384|512)-/i;
const HASH_OR_NONCE = /^'(?:sha(?:256|384|512)-|nonce-)/i;

function describeAttribute({ tag, name, value }: { tag: string; name: string; value: string }): string {
  return `<${tag} ${name}="${value}"`.slice(0, 80);
}

/**
 * Everything in the documents a browser would refuse, or that would silently weaken, under the
 * policy: inline scripts need their exact hash in script-src, and a hash that matches no inline
 * script is stale. Under the committed strict style-src, each inline style must match a listed
 * hash, the hashes of both shell variants are required, style attributes are refused, and an unused
 * style hash is stale too. Mixing 'unsafe-inline' with a hash or nonce is refused because browsers
 * then ignore 'unsafe-inline'. Inline event-handler attributes are never allowed.
 */
export interface CspCheckOptions {
  /**
   * Style hashes of the other first-paint shell variant, which count as used. Only the build knows
   * them; check:csp, which sees one variant's output, passes 'unchecked' instead.
   */
  readonly otherVariantStyles?: readonly string[] | 'unchecked';
}

/** Whether inline styles are allowed without hashes (style-src, or default-src, has 'unsafe-inline'). */
export function allowsInlineStyles(policy: string): boolean {
  return (directiveSources(policy, 'style-src') ?? directiveSources(policy, 'default-src') ?? []).includes("'unsafe-inline'");
}

export function cspProblems(documents: readonly CspDocument[], policy: string, options: CspCheckOptions = {}): string[] {
  const problems: string[] = [];
  const fallback = directiveSources(policy, 'default-src') ?? [];
  const scriptSources = directiveSources(policy, 'script-src') ?? fallback;
  const styleSources = directiveSources(policy, 'style-src') ?? fallback;
  for (const [name, sources] of [['script-src', scriptSources], ['style-src', styleSources]] as const) {
    if (sources.includes("'unsafe-inline'") && sources.some(source => HASH_OR_NONCE.test(source))) {
      problems.push(`${name} mixes 'unsafe-inline' with a hash or nonce, so browsers ignore 'unsafe-inline'.`);
    }
  }
  const scriptHashes = scriptSources.filter(source => HASH_SOURCE.test(source));
  const styleHashes = styleSources.filter(source => HASH_SOURCE.test(source));
  const styleInline = styleSources.includes("'unsafe-inline'");
  const used = { script: new Set<string>(), style: new Set<string>() };
  for (const entry of documents) {
    const active = activeDocument(entry.html);
    for (const [index, { kind, content }] of active.blocks.entries()) {
      const block = { kind, bytes: Buffer.byteLength(content, 'utf8'), source: sha256Source(content) };
      const label = `${entry.name} inline ${block.kind} #${index} (${block.bytes} B, ${block.source})`;
      used[block.kind].add(block.source);
      if (block.kind === 'script') {
        if (!scriptHashes.includes(block.source)) problems.push(`${label} is not allowed: add ${block.source} to script-src in vercel.json.`);
      } else if (!styleInline && !styleSources.includes(block.source)) {
        problems.push(`${label} is not allowed: add ${block.source} to style-src in vercel.json.`);
      }
    }
    const handler = active.attributes.find(attribute => /^on[a-z]/.test(attribute.name));
    if (handler) problems.push(`${entry.name} has an inline event-handler attribute, which script-src blocks: ${describeAttribute(handler)}`);
    const styleAttribute = styleInline ? undefined : active.attributes.find(attribute => attribute.name === 'style');
    if (styleAttribute) problems.push(`${entry.name} has an inline style attribute, which strict style-src blocks: ${describeAttribute(styleAttribute)}`);
  }
  const otherStyles = options.otherVariantStyles ?? [];
  if (otherStyles === 'unchecked') used.style = new Set(styleHashes);
  else {
    for (const source of otherStyles) {
      used.style.add(source);
      if (!styleInline && !styleSources.includes(source)) problems.push(`The other shell variant's inline style ${source} is not allowed: add it to style-src in vercel.json.`);
    }
  }
  for (const [kind, hashes] of [['script', scriptHashes], ['style', styleHashes]] as const) {
    for (const hash of hashes) {
      if (!used[kind].has(hash)) problems.push(`${kind}-src in vercel.json allows ${hash}, which matches no inline ${kind} in the build (stale hash).`);
    }
  }
  return problems;
}
