import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LibraryRecord } from '../../lib/personal-types';
import { discoveryFixture } from '../../lib/discovery-test-fixtures';
import { useRetainedRecords } from './useRetainedRecords';

const alpha = [discoveryFixture.record];
const beta = [{ ...discoveryFixture.record, id: 'wikidata:Q1' }];

function Sequence({ steps }: { steps: { records: LibraryRecord[]; hold: boolean }[] }) {
  const [turn, setTurn] = useState<{ index: number; seen: string[] }>({ index: 0, seen: [] });
  const step = steps[turn.index]!;
  const visible = useRetainedRecords(step.records, step.hold);
  const seen = [...turn.seen, visible.map((record) => record.id).join(',')];
  if (turn.index + 1 < steps.length) setTurn({ index: turn.index + 1, seen });
  return createElement('output', null, seen.join('|'));
}

describe('retained personal editor pages', () => {
  it('holds the previous bounded page during an edit and releases it when the edit settles', () => {
    const html = renderToStaticMarkup(
      createElement(Sequence, {
        steps: [
          { records: alpha, hold: false },
          { records: beta, hold: true },
          { records: beta, hold: false },
        ],
      }),
    );
    expect(html).toBe(`<output>${alpha[0]!.id}|${alpha[0]!.id}|${beta[0]!.id}</output>`);
  });

  it('does not hold an empty initial page while records arrive', () => {
    const html = renderToStaticMarkup(
      createElement(Sequence, {
        steps: [
          { records: [], hold: true },
          { records: alpha, hold: true },
          { records: beta, hold: true },
        ],
      }),
    );
    expect(html).toBe(`<output>|${alpha[0]!.id}|${alpha[0]!.id}</output>`);
  });

  it('replaces clean rows immediately, including removal of every record', () => {
    const html = renderToStaticMarkup(
      createElement(Sequence, {
        steps: [
          { records: alpha, hold: false },
          { records: beta, hold: false },
          { records: [], hold: false },
        ],
      }),
    );
    expect(html).toBe(`<output>${alpha[0]!.id}|${beta[0]!.id}|</output>`);
  });
});
