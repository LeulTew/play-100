import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { initialPeopleDisclosure, usePeopleDisclosure } from './compare-disclosures';

// Compare's "Change people" chooser on its own, in a known view with two people chosen and the chooser closed. Its
// controls commit synchronously, in the calling task, so a test can commit before a queued toggle event is delivered.
function PeopleChooser() {
  const [count, setCount] = useState(2);
  const [, setRenders] = useState(0);
  const { open, chooserRef, onToggle } = usePeopleDisclosure(true, count, () => initialPeopleDisclosure(true, false));
  const sentinelRef = useRef<HTMLDetailsElement>(null);
  // Published once mounted, with the elements themselves.
  useLayoutEffect(() => {
    const chooser = chooserRef.current;
    const sentinel = sentinelRef.current;
    if (!chooser || !sentinel) throw new Error('The people chooser fixture did not mount.');
    const toggles: boolean[] = [];
    const record = () => toggles.push(chooser.open);
    chooser.addEventListener('toggle', record);
    window.comparePeopleDisclosureFixture = {
      chooser,
      toggles,
      choose: (next) => flushSync(() => setCount(next)),
      rerender: () => flushSync(() => setRenders((renders) => renders + 1)),
      // Every details element queues its toggle event on the same (DOM manipulation) task source, in order, so the
      // sentinel's arrives after any the chooser queued before it.
      afterQueuedToggles: () =>
        new Promise<void>((resolve) => {
          sentinel.addEventListener('toggle', () => resolve(), { once: true });
          sentinel.open = !sentinel.open;
        }),
    };
    return () => chooser.removeEventListener('toggle', record);
  }, [chooserRef]);
  return (
    <>
      <details id="chooser" ref={chooserRef} open={open} onToggle={onToggle}>
        <summary>Change people</summary>
        <p>{count === 1 ? '1 person chosen' : `${count} people chosen`}</p>
      </details>
      <output id="chooser-state" data-open={String(open)} />
      <details ref={sentinelRef} hidden>
        <summary>Sentinel</summary>
      </details>
    </>
  );
}

const mount = document.getElementById('mount');
if (!mount) throw new Error('The people chooser fixture needs #mount.');
createRoot(mount).render(<PeopleChooser />);
