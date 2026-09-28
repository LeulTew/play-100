import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { initialPeopleDisclosure, useCoverageDisclosure, usePeopleDisclosure } from './compare-disclosures';

// Compare's two disclosures on their own: the "Change people" chooser in a known view with two people chosen and the
// chooser closed, and the coverage details with no failed reads. The controls commit synchronously, in the calling
// task, so a test can commit before a queued toggle event is delivered.
export function Disclosures() {
  const [count, setCount] = useState(2);
  const [problems, setProblems] = useState('');
  const [, setRenders] = useState(0);
  const people = usePeopleDisclosure(true, count, () => initialPeopleDisclosure(true, false));
  const coverage = useCoverageDisclosure(problems);
  const { chooserRef } = people;
  const { coverageRef } = coverage;
  const reviewRef = useRef<HTMLButtonElement>(null);
  const sentinelRef = useRef<HTMLDetailsElement>(null);
  // Published once mounted, with the elements themselves.
  useLayoutEffect(() => {
    const chooser = chooserRef.current;
    const details = coverageRef.current;
    const reviewButton = reviewRef.current;
    const sentinel = sentinelRef.current;
    if (!chooser || !details || !reviewButton || !sentinel) throw new Error('The disclosure fixture did not mount.');
    const toggles: boolean[] = [];
    const record = () => toggles.push(chooser.open);
    chooser.addEventListener('toggle', record);
    window.compareDisclosureFixture = {
      chooser,
      coverage: details,
      toggles,
      choose: (next) => flushSync(() => setCount(next)),
      fail: (next) => flushSync(() => setProblems(next)),
      review: () => flushSync(() => reviewButton.click()),
      rerender: () => flushSync(() => setRenders((renders) => renders + 1)),
      // Every details element queues its toggle event on the same (DOM manipulation) task source, in order, so the
      // sentinel's arrives after any the others queued before it.
      afterQueuedToggles: () =>
        new Promise<void>((resolve) => {
          sentinel.addEventListener('toggle', () => resolve(), { once: true });
          sentinel.open = !sentinel.open;
        }),
    };
    return () => chooser.removeEventListener('toggle', record);
  }, [chooserRef, coverageRef]);
  return (
    <>
      <details id="chooser" ref={chooserRef} open={people.open} onToggle={people.onToggle}>
        <summary>Change people</summary>
        <p>{count === 1 ? '1 person chosen' : `${count} people chosen`}</p>
      </details>
      <output id="chooser-state" data-open={String(people.open)} />
      <button ref={reviewRef} type="button" onClick={coverage.review}>
        Review coverage and recovery
      </button>
      <details id="coverage" ref={coverageRef} open={coverage.open} onToggle={coverage.onToggle}>
        <summary>Coverage &amp; loading</summary>
        <p>{problems ? `Could not load: ${problems}` : 'Everything loaded.'}</p>
      </details>
      <output id="coverage-state" data-open={String(coverage.open)} />
      <details ref={sentinelRef} hidden>
        <summary>Sentinel</summary>
      </details>
    </>
  );
}

const mount = document.getElementById('mount');
if (!mount) throw new Error('The Compare disclosure fixture needs #mount.');
createRoot(mount).render(<Disclosures />);
