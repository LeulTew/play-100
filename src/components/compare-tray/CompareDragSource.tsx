import { useRef } from 'react';
import type { CompareDragSourceProps } from './compare-drag-types';
import { useCompareDragSource } from './useCompareDragSource';

export function CompareDragSource({ record, disabled, children }: CompareDragSourceProps) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const binding = useCompareDragSource({ record, disabled, sourceRef });
  return children({ ...binding, sourceRef });
}
