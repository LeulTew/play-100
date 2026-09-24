// Adapted from React Bits AnimatedContent, (c) 2026 David Haz. See third-party/react-bits/LICENSE.md.
// Native Web Animations replaces GSAP; content stays visible before enhancement.
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export default function AnimatedContent({
  children,
  animate,
  className = '',
}: {
  children: ReactNode;
  animate: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const didAnimate = useRef(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || !animate || didAnimate.current) return;
    let animation: Animation | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || document.hidden) return;
        didAnimate.current = true;
        animation = element.animate(
          [
            { clipPath: 'inset(0 0 3% 0)', transform: 'translateY(8px)' },
            { clipPath: 'inset(0)', transform: 'translateY(0)' },
          ],
          { duration: 450, easing: 'cubic-bezier(.16,1,.3,1)' },
        );
        observer.disconnect();
      },
      { threshold: 0.08 },
    );
    observer.observe(element);
    const onVisibility = () => {
      if (document.hidden) animation?.finish();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      animation?.cancel();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [animate]);
  return (
    <div className={className} ref={ref}>
      {children}
    </div>
  );
}
