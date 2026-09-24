import { createHash } from 'node:crypto';

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

/** Markup a browser with scripting enabled acts on: no comments, no noscript content. */
function activeMarkup(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, '');
}

/** Every inline <script> (without src) and <style> element, in document order. */
export function inlineBlocks(html: string): InlineBlock[] {
  const blocks: InlineBlock[] = [];
  for (const match of activeMarkup(html).matchAll(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)) {
    const kind = (match[1] ?? '').toLowerCase() === 'script' ? 'script' : 'style';
    const content = match[3] ?? '';
    if (kind === 'script' && /\ssrc\s*=/i.test(match[2] ?? '')) continue;
    blocks.push({ kind, bytes: Buffer.byteLength(content, 'utf8'), source: sha256Source(content) });
  }
  return blocks;
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

function withoutBlockContents(html: string): string {
  return activeMarkup(html).replace(/(<(script|style)\b[^>]*>)[\s\S]*?<\/\2\s*>/gi, '$1');
}

/**
 * Everything in the documents a browser would refuse, or that would silently weaken, under the
 * policy: inline scripts need their exact hash in script-src, and a hash that matches no inline
 * script is stale. Inline styles rely on style-src 'unsafe-inline' until strict style-src lands;
 * after that they need their exact hashes, style attributes are refused, and an unused style hash is
 * stale too. Mixing 'unsafe-inline' with a hash or nonce is refused because browsers then ignore
 * 'unsafe-inline'. Inline event-handler attributes are never allowed.
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
    for (const [index, block] of inlineBlocks(entry.html).entries()) {
      const label = `${entry.name} inline ${block.kind} #${index} (${block.bytes} B, ${block.source})`;
      used[block.kind].add(block.source);
      if (block.kind === 'script') {
        if (!scriptHashes.includes(block.source)) problems.push(`${label} is not allowed: add ${block.source} to script-src in vercel.json.`);
      } else if (!styleInline && !styleSources.includes(block.source)) {
        problems.push(`${label} is not allowed: add ${block.source} to style-src in vercel.json.`);
      }
    }
    const markup = withoutBlockContents(entry.html);
    const handler = /<[a-z][^>]*?\son[a-z]+\s*=/i.exec(markup);
    if (handler) problems.push(`${entry.name} has an inline event-handler attribute, which script-src blocks: ${handler[0].slice(0, 80)}`);
    const styleAttribute = styleInline ? null : /<[a-z][^>]*?\sstyle\s*=/i.exec(markup);
    if (styleAttribute) problems.push(`${entry.name} has an inline style attribute, which strict style-src blocks: ${styleAttribute[0].slice(0, 80)}`);
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
