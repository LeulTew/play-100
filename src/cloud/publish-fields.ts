import { useCallback, useState } from 'react';
import type { PublicProfile } from '../lib/community';

export interface PublishFieldValues {
  name: string;
  handle: string;
  title: string;
  listed: boolean;
}
type Edited = Record<keyof PublishFieldValues, boolean>;
interface Inputs {
  existing: PublicProfile | null;
  memberName: string | undefined;
  identityName: string;
}

function followed(
  values: PublishFieldValues,
  edited: Edited,
  published: PublicProfile | null,
  { memberName, identityName }: Inputs,
): PublishFieldValues {
  return {
    name: edited.name ? values.name : published?.displayName || memberName || identityName || '',
    handle: edited.handle || !published ? values.handle : published.handle,
    title: edited.title || !published ? values.title : published.title,
    listed: edited.listed || !published ? values.listed : published.listed,
  };
}

/**
 * The publication form's name, handle, title and listing. Each follows the last published profile this draft has seen
 * and, for the name, the member and account names, until the user edits it. They follow during render as those change,
 * so no effect sets them and no frame shows the values they replace.
 */
export function usePublishFields(existing: PublicProfile | null, memberName: string | undefined, identityName: string) {
  const [draft, setDraft] = useState(() => {
    const inputs = { existing, memberName, identityName };
    const values = { name: '', handle: '', title: 'My games, my order', listed: false };
    const edited = { name: false, handle: false, title: false, listed: false };
    return { inputs, published: existing, edited, values: followed(values, edited, existing, inputs) };
  });
  if (
    draft.inputs.existing !== existing ||
    draft.inputs.memberName !== memberName ||
    draft.inputs.identityName !== identityName
  ) {
    const inputs = { existing, memberName, identityName };
    const published = existing ?? draft.published;
    setDraft({ ...draft, inputs, published, values: followed(draft.values, draft.edited, published, inputs) });
  }
  const edit = useCallback(<K extends keyof PublishFieldValues>(field: K, value: PublishFieldValues[K]) => {
    setDraft((old) => ({
      ...old,
      values: { ...old.values, [field]: value },
      edited: old.edited[field] ? old.edited : { ...old.edited, [field]: true },
    }));
  }, []);
  return { ...draft.values, edit };
}
