import type { HTMLAttributes, MouseEvent, ReactNode, RefObject } from 'react';
import type { LibraryRecord } from '../../lib/personal-types';
import type { MotionGuard } from '../../motion';

export interface CompareTitleProps {
  'data-compare-drag-title'?: '';
}

export type CompareSurfaceProps<T extends HTMLElement> = Pick<
  HTMLAttributes<T>,
  | 'onPointerDownCapture'
  | 'onTouchStartCapture'
  | 'onDragStartCapture'
  | 'onDragEndCapture'
  | 'onClickCapture'
  | 'onContextMenuCapture'
> & { 'data-compare-drag-source'?: '' };

export interface CompareSourceBinding<T extends HTMLElement> {
  surfaceProps: CompareSurfaceProps<T>;
  titleProps: CompareTitleProps;
  consumeClick(event: MouseEvent<HTMLElement>): boolean;
}

export type CompareTitleBinding = Pick<CompareSourceBinding<HTMLElement>, 'titleProps' | 'consumeClick'>;

export interface CompareSourceOptions<T extends HTMLElement> {
  record: LibraryRecord | undefined;
  sourceRef: RefObject<T | null>;
  disabled?: boolean;
}

export interface CompareDragSourceProps {
  record: LibraryRecord | undefined;
  disabled?: boolean;
  children(
    binding: CompareSourceBinding<HTMLDivElement> & {
      sourceRef: RefObject<HTMLDivElement | null>;
    },
  ): ReactNode;
}

export interface CompareInteractionGate {
  readonly enabled: boolean;
  captureCurrent(): MotionGuard;
}

export interface CompareTrayProviderProps {
  scope: string;
  children: ReactNode;
  interaction?: CompareInteractionGate;
}
