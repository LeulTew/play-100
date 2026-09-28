import type { ComponentProps } from 'react';
import RatingsTable from './RatingsTable';
import ExtendedResults from './catalog/ExtendedResults';
import CollectionFilms from './CollectionFilms';

export type CollectionExtrasProps =
  | { kind: 'table'; props: ComponentProps<typeof RatingsTable> }
  | { kind: 'extended'; props: ComponentProps<typeof ExtendedResults> }
  | { kind: 'films'; props: ComponentProps<typeof CollectionFilms> };

export default function CollectionExtras(input: CollectionExtrasProps) {
  if (input.kind === 'table') return <RatingsTable {...input.props} />;
  if (input.kind === 'extended') return <ExtendedResults {...input.props} />;
  return <CollectionFilms {...input.props} />;
}
