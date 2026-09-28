import { useState } from 'react';
import type { LibraryRecord } from '../../lib/personal-types';

export function useRetainedRecords(records: LibraryRecord[], hold: boolean) {
  const [retained, setRetained] = useState(records);
  const visible = hold && retained.length > 0 ? retained : records;
  if (visible !== retained) setRetained(visible);
  return visible;
}
