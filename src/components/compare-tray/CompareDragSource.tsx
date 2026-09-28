import { useRef } from 'react';
import type { CompareDragSourceProps } from './compare-drag-types';
import { useCompareDragSource } from './useCompareDragSource';

export function CompareDragSource({ record, disabled, children }: CompareDragSourceProps) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const binding = useCompareDragSource({ record, disabled, sourceRef });
  // eslint-disable-next-line react-hooks/refs -- The render prop forwards this opaque ref to its host element; it never reads current.
  return children({ ...binding, sourceRef });
}
