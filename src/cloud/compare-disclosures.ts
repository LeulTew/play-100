import { useLayoutEffect, useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';

// Compare's "Change people" chooser and its coverage details are <details> elements that open themselves as well as at
// the user's hand. The element is the truth. A user's close changes it at once, but reaches React state only through
// its toggle event, which the browser delivers in a later task. If the page opened a disclosure by state alone in
// between, the state would still say open, nothing would change, and the late event would then record the close. So
// when the page opens one, it opens the element too: the late event then reports it open and cannot close it again,
// while a close after that sticks.

/** The chooser: whether it is open, and why. */
export interface PeopleDisclosure {
  /** Whether it has settled on its first state, which waits until the view it belongs to is known. */
  initialized: boolean;
  /** Whether the user opened or closed it before then, which its first state keeps. */
  touched: boolean;
  open: boolean;
  /** How many times the page opened it itself, which the element is then brought in line with. */
  reopened: number;
}

export function initialPeopleDisclosure(initialized: boolean, open: boolean): PeopleDisclosure {
  return { initialized, touched: false, open, reopened: 0 };
}

/**
 * The chooser once `count` people are chosen in a known view. It settles on its first state, the user's own choice or
 * open for fewer than two people, and it opens whenever fewer than two are chosen, even when its state already says
 * open: a close may be on its way.
 */
export function peopleDisclosureAfter(current: PeopleDisclosure, count: number): PeopleDisclosure {
  if (!current.initialized) {
    if (current.touched) return { ...current, initialized: true };
    return count < 2
      ? { ...current, initialized: true, open: true, reopened: current.reopened + 1 }
      : { ...current, initialized: true, open: false };
  }
  return count < 2 ? { ...current, open: true, reopened: current.reopened + 1 } : current;
}

/** The chooser for a group just chosen with `count` people: afresh, and open only for fewer than two. */
export function peopleDisclosureForGroup(current: PeopleDisclosure, count: number): PeopleDisclosure {
  const open = count < 2;
  return { initialized: true, touched: false, open, reopened: open ? current.reopened + 1 : current.reopened };
}

// The disclosure's element, which is opened each time the page opens the disclosure itself (each new `reopened`). A
// layout effect runs in the task that commits, before the browser can deliver a toggle event still queued.
function useReopenedElement(reopened: number) {
  const elementRef = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (reopened && element && !element.open) element.open = true;
  }, [reopened]);
  return elementRef;
}

/**
 * The "Change people" chooser: its state, the ref for its <details> element and that element's toggle handler. It
 * follows the view as it becomes known (`viewReady`) and the number of people chosen (`count`).
 */
export function usePeopleDisclosure(viewReady: boolean, count: number, initial: () => PeopleDisclosure) {
  const [disclosure, setDisclosure] = useState(initial);
  const [seen, setSeen] = useState<{ viewReady: boolean; count: number } | null>(null);
  if (seen?.viewReady !== viewReady || seen.count !== count) {
    setSeen({ viewReady, count });
    if (viewReady) setDisclosure((current) => peopleDisclosureAfter(current, count));
  }
  const chooserRef = useReopenedElement(disclosure.reopened);
  return {
    open: disclosure.open,
    chooserRef,
    onToggle: (event: SyntheticEvent<HTMLDetailsElement>) => {
      const open = event.currentTarget.open;
      setDisclosure((current) => (current.open === open ? current : { ...current, open, touched: true }));
    },
    chooseGroup: (groupCount: number) => setDisclosure((current) => peopleDisclosureForGroup(current, groupCount)),
  };
}

/** The coverage details: whether they are open, and how many times the page opened them itself. */
interface CoverageDisclosure {
  open: boolean;
  reopened: number;
}
const openCoverage = (current: CoverageDisclosure): CoverageDisclosure => ({
  open: true,
  reopened: current.reopened + 1,
});

/**
 * The coverage details: their state, the ref for their <details> element and that element's toggle handler. They open
 * for each new set of people whose rankings could not be read (`problems`, empty when there are none), and when the
 * user asks to review them (`review`).
 */
export function useCoverageDisclosure(problems: string) {
  const [coverage, setCoverage] = useState<CoverageDisclosure>({ open: false, reopened: 0 });
  const [problemsSeen, setProblemsSeen] = useState<string | null>(null);
  if (problemsSeen !== problems) {
    setProblemsSeen(problems);
    if (problems) setCoverage(openCoverage);
  }
  const coverageRef = useReopenedElement(coverage.reopened);
  return {
    open: coverage.open,
    coverageRef,
    onToggle: (event: SyntheticEvent<HTMLDetailsElement>) => {
      const open = event.currentTarget.open;
      setCoverage((current) => (current.open === open ? current : { ...current, open }));
    },
    review: () => setCoverage(openCoverage),
  };
}
