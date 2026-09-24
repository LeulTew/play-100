// Adapted from React Bits Magnet, (c) 2026 David Haz. See third-party/react-bits/LICENSE.md.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export default function Magnet({ children, disabled = false }: { children: ReactNode; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const element = ref.current;
    if (disabled || !element) return;
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const { left, top, width, height } = element.getBoundingClientRect();
      setPosition({
        x: Math.max(-4, Math.min(4, (event.clientX - left - width / 2) / 12)),
        y: Math.max(-3, Math.min(3, (event.clientY - top - height / 2) / 12)),
      });
    };
    const reset = () => setPosition({ x: 0, y: 0 });
    element.addEventListener('pointermove', handlePointerMove);
    element.addEventListener('pointerleave', reset);
    element.addEventListener('focusin', reset);
    return () => {
      element.removeEventListener('pointermove', handlePointerMove);
      element.removeEventListener('pointerleave', reset);
      element.removeEventListener('focusin', reset);
    };
  }, [disabled]);
  return (
    <div ref={ref} className="magnet">
      <div
        style={{
          transform: disabled ? undefined : `translate3d(${position.x}px, ${position.y}px, 0)`,
          transition: 'transform 180ms cubic-bezier(.16,1,.3,1)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
