// Adapted from React Bits CountUp, (c) 2026 David Haz. See third-party/react-bits/LICENSE.md.
// Native frames replace the Motion scheduler; the original spring parameters and accessible values remain.
import { useLayoutEffect, useRef } from 'react';
import { stepCount } from './count-up';
import type { CountState } from './count-up';

export default function CountUp({ to, animate, className = '' }: { to: number; animate: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const initial = useRef(to);
  const current = useRef<CountState>({ value: to, velocity: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame: number | null = null;
    const finish = () => {
      current.current = { value: to, velocity: 0 };
      if (element.isConnected) element.textContent = String(to);
    };
    if (!animate || document.hidden || current.current.value === to && current.current.velocity === 0) {
      finish();
      return;
    }
    const from = current.current;
    const start = performance.now();
    element.textContent = String(Math.round(from.value));
    const update = (now: number) => {
      frame = null;
      if (document.hidden || !element.isConnected) { finish(); return; }
      const next = stepCount(from, to, now - start);
      current.current = next;
      const text = next.done ? String(to) : String(Math.round(next.value));
      if (element.textContent !== text) element.textContent = text;
      if (!next.done) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => { if (frame !== null) cancelAnimationFrame(frame); };
  }, [to, animate]);

  return <span className={className}><span className="sr-only">{to}</span><span aria-hidden="true" ref={ref}>{initial.current}</span></span>;
}
