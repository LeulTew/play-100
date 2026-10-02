import { canonicalCatalogId, catalogActionRecord, catalogOwnership } from './catalog-identity.js';
import type { LibraryRecord } from './personal-types.js';

// The ranking picker's choices. Only My games loads them, unlike catalog-identity.ts.

export interface CatalogPickerChoice {
  record: LibraryRecord;
  titles: readonly string[];
}

export function catalogPickerChoices(
  available: readonly LibraryRecord[],
  owned: Record<string, LibraryRecord>,
): CatalogPickerChoice[] {
  const ownership = catalogOwnership(owned);
  const inputs = [...Object.values(owned), ...available];
  const known = new Map(inputs.map((record) => [record.id, record]));
  const titles = new Map<string, Set<string>>();
  for (const record of inputs) {
    const id = canonicalCatalogId(record.id);
    const names = titles.get(id) ?? new Set<string>();
    names.add(record.title);
    titles.set(id, names);
  }
  const choices = new Map<string, CatalogPickerChoice>();
  for (const record of known.values()) {
    const identity = canonicalCatalogId(record.id);
    const target = owned[record.id] ?? catalogActionRecord(known.get(identity) ?? record, ownership);
    if (!choices.has(target.id))
      choices.set(target.id, { record: target, titles: [...(titles.get(identity) ?? [target.title])] });
  }
  return [...choices.values()];
}
