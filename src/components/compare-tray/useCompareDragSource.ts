import { useContext, useEffect, useMemo, useRef } from 'react';
import type { MouseEvent } from 'react';
import type { CompareSourceBinding, CompareSourceOptions, CompareSurfaceProps } from './compare-drag-types';
import type { CompareSource } from './compare-drag-controller';
import { CompareDragSourceContext } from './compare-drag-source-context';

export function useCompareDragSource<T extends HTMLElement>(options: CompareSourceOptions<T>): CompareSourceBinding<T> {
  const controller = useContext(CompareDragSourceContext);
  const latest = useRef(options);
  latest.current = options;
  const source = useMemo<CompareSource>(() => ({
    read: () => ({
      node: latest.current.sourceRef.current,
      record: latest.current.record,
      disabled: Boolean(latest.current.disabled),
    }),
  }), []);
  const enabled = Boolean(controller && options.record && !options.disabled);
  useEffect(() => {
    controller?.refreshSource(source);
    return () => controller?.cancelSource(source);
  }, [controller, source, options.record?.id, options.disabled]);
  return useMemo<CompareSourceBinding<T>>(() => {
    if (!enabled || !controller) return { surfaceProps: {}, titleProps: {}, consumeClick: () => false };
    const consumeClick = (event: MouseEvent<HTMLElement>): boolean => {
      if (!controller.consumeClick(event.nativeEvent)) return false;
      event.preventDefault();
      event.stopPropagation();
      return true;
    };
    const surfaceProps: CompareSurfaceProps<T> = {
      'data-compare-drag-source': '',
      onPointerDownCapture: (event) => {
        if (!event.defaultPrevented) controller.pointerDown(source, event.nativeEvent);
      },
      onTouchStartCapture: (event) => {
        if (!event.defaultPrevented) controller.touchStart(source, event.nativeEvent);
      },
      onDragStartCapture: (event) => controller.nativeStart(source, event.nativeEvent),
      onDragEndCapture: (event) => controller.nativeEnd(source, event.nativeEvent),
      onClickCapture: consumeClick,
      onContextMenuCapture: () => controller.cancelSource(source),
    };
    return { surfaceProps, titleProps: { 'data-compare-drag-title': '' }, consumeClick };
  }, [controller, enabled, source]);
}
