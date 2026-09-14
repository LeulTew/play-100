// Adapted from React Bits CountUp, (c) 2026 David Haz. See third-party/react-bits/LICENSE.md.
import { useMotionValue, useSpring } from 'motion/react';
import { useEffect, useRef } from 'react';

export default function CountUp({ to, animate, className = '' }: { to: number; animate: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(to);
  const springValue = useSpring(motionValue, { damping: 45, stiffness: 240 });

  useEffect(() => {
    if (!animate) {
      motionValue.jump(to);
      springValue.jump(to);
      if (ref.current) ref.current.textContent = String(to);
      return;
    }
    motionValue.set(to);
    return springValue.on('change', (latest) => {
      if (ref.current) ref.current.textContent = String(Math.round(latest));
    });
  }, [to, animate, motionValue, springValue]);

  return <span className={className}><span className="sr-only">{to}</span><span aria-hidden="true" ref={ref}>{to}</span></span>;
}
