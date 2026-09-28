import { getLocalPage } from '../../lib/local-pagination';

export interface LibraryPageCursor {
  definition: string;
  query: string;
  input: number;
  target: number;
}

export function resolveLibraryPageCursor(
  prior: LibraryPageCursor,
  view: Omit<LibraryPageCursor, 'target'> & { usesUrlPage: boolean; total: number; pageSize: number },
) {
  const reset = prior.query !== view.query || (!view.usesUrlPage && prior.definition !== view.definition);
  const requested = reset ? 1 : prior.input !== view.input ? view.input : prior.target;
  const page = getLocalPage(view.total, view.pageSize, (requested - 1) * view.pageSize);
  const cursor: LibraryPageCursor = {
    definition: view.definition,
    query: view.query,
    input: view.input,
    target: Math.max(1, page.page),
  };
  return { page, cursor };
}
