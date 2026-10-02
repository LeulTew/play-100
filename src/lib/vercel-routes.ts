// How vercel.json's route sources match a path, shared by the build, the release tooling, the local emulations
// of the deployment and their tests. vercel-routes.test.ts checks this against vercel.json and refuses copies.

/** The source of the one header rule that carries the main document's security headers and CSP. */
export const MAIN_DOCUMENT_RULE = '/((?!__/auth/(?:handler|iframe|handler[.]js|iframe[.]js|experiments[.]js)$).*)';

/**
 * vercel.json's sources are anchored regular expressions, apart from their named parameters: :name matches one
 * segment, :name+ one or more and :name* any number. A (?: group's colon is not a parameter. As in path-to-regexp,
 * a `.` outside groups and character classes is literal, so /social-card.png does not match /social-cardXpng.
 */
export function routePattern(source: string): RegExp {
  let literalDots = '';
  let depth = 0;
  let inClass = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (char === '\\') {
      literalDots += source.slice(index, index + 2);
      index++;
      continue;
    }
    if (inClass) inClass = char !== ']';
    else if (char === '[') inClass = true;
    else if (char === '(') depth++;
    else if (char === ')') depth--;
    literalDots += char === '.' && depth === 0 && !inClass ? '\\.' : char;
  }
  const pattern = literalDots.replace(/(?<!\?):\w+([*+]?)/g, (_, modifier: string) =>
    modifier === '*' ? '.*' : modifier === '+' ? '.+' : '[^/]+',
  );
  return new RegExp(`^${pattern}$`);
}

/** The rules whose source matches the path, in their order in vercel.json. */
export function matchingRules<Rule extends { readonly source: string }>(
  rules: readonly Rule[],
  pathname: string,
): Rule[] {
  return rules.filter((rule) => routePattern(rule.source).test(pathname));
}

/** Whether a vercel.json header rule is the main-document rule. */
export function isMainDocumentRule(rule: unknown): boolean {
  return !!rule && typeof rule === 'object' && 'source' in rule && rule.source === MAIN_DOCUMENT_RULE;
}
