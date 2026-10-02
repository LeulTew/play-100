// How vercel.json's route sources match a path, shared by the build, the release tooling, the local emulations
// of the deployment and their tests. vercel-routes.test.ts checks this against vercel.json and refuses copies.

/** The source of the one header rule that carries the main document's security headers and CSP. */
export const MAIN_DOCUMENT_RULE = '/((?!__/auth/(?:handler|iframe|handler[.]js|iframe[.]js|experiments[.]js)$).*)';

/**
 * vercel.json's sources are anchored regular expressions, apart from their named parameters: :name matches one
 * segment, :name+ one or more and :name* any number. A (?: group's colon is not a parameter.
 */
export function routePattern(source: string): RegExp {
  const pattern = source.replace(/(?<!\?):\w+([*+]?)/g, (_, modifier: string) =>
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
