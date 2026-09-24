export function normalizeCatalogQuery(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/['\u2019]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function matchesCatalogQuery(text: string, query: string): boolean {
  const searchable = normalizeCatalogQuery(text);
  const terms = normalizeCatalogQuery(query).split(' ').filter(Boolean);
  const words = searchable.split(' ');
  const compact = searchable.replaceAll(' ', '');
  return terms.every((term) => (/^\d+$/.test(term) ? words.includes(term) : compact.includes(term)));
}

export function catalogRelevance(title: string, aliases: readonly string[], query: string): number | null {
  const term = normalizeCatalogQuery(query).replaceAll(' ', '');
  if (!term) return 0;
  const names = [title, ...aliases];
  for (const [index, name] of names.entries()) {
    if (normalizeCatalogQuery(name).replaceAll(' ', '') === term) return index === 0 ? 0 : 1;
  }
  if (names.some((name) => matchesCatalogQuery(name, query))) {
    return names.some((name) => normalizeCatalogQuery(name).replaceAll(' ', '').startsWith(term)) ? 2 : 3;
  }
  return null;
}
