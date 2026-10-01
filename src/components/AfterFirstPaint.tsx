import { createContext, startTransition, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { afterNextPaint } from '../lib/after-paint';

const FirstPaintContext = createContext(true);
let painted = false;

/**
 * Holds what waits for the app's first paint (AfterFirstPaint) until that paint is out, then renders it in a
 * transition: on a 2 GB phone the first frame then styles, lays out and paints only the first screen. Later mounts
 * never wait, and a hidden or prerendered document, which has no paint to wait for, waits only for a task.
 */
export function FirstPaintGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(painted);
  useEffect(() => {
    if (ready) return;
    return afterNextPaint(() => {
      painted = true;
      startTransition(() => setReady(true));
    });
  }, [ready]);
  return <FirstPaintContext value={ready}>{children}</FirstPaintContext>;
}

/**
 * Its children once the app's first commit has painted (FirstPaintGate), and `reserve` until then; with `now`, or
 * outside a gate, as in a test's static render, its children at once.
 */
export function AfterFirstPaint({
  children,
  reserve = null,
  now = false,
}: {
  children: ReactNode;
  reserve?: ReactNode;
  now?: boolean;
}) {
  const painted = useContext(FirstPaintContext);
  return now || painted ? children : reserve;
}
