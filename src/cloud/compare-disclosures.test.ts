import { describe, expect, it } from 'vitest';
import { initialPeopleDisclosure, peopleDisclosureAfter, peopleDisclosureForGroup } from './compare-disclosures';

describe("Compare's people chooser", () => {
  it('settles once the view is known: open for fewer than two people, unless the user chose first', () => {
    const waiting = initialPeopleDisclosure(false, false);
    expect(peopleDisclosureAfter(waiting, 1)).toEqual({ initialized: true, touched: false, open: true, reopened: 1 });
    expect(peopleDisclosureAfter(waiting, 6)).toEqual({ initialized: true, touched: false, open: false, reopened: 0 });
    const opened = { ...waiting, touched: true, open: true };
    expect(peopleDisclosureAfter(opened, 6)).toEqual({ ...opened, initialized: true });
    const closed = { ...waiting, touched: true };
    expect(peopleDisclosureAfter(closed, 1)).toEqual({ ...closed, initialized: true });
  });

  it('opens its element again for fewer than two people, even when its state still says open', () => {
    const shown = initialPeopleDisclosure(true, true);
    expect(peopleDisclosureAfter(shown, 1)).toEqual({ ...shown, reopened: 1 });
    expect(peopleDisclosureAfter(shown, 0)).toEqual({ ...shown, reopened: 1 });
    const hidden = { ...shown, touched: true, open: false };
    expect(peopleDisclosureAfter(hidden, 1)).toEqual({ ...hidden, open: true, reopened: 1 });
  });

  it('keeps whatever the user chose while at least two people are chosen', () => {
    const shown = initialPeopleDisclosure(true, true);
    const hidden = { ...shown, touched: true, open: false };
    expect(peopleDisclosureAfter(shown, 2)).toBe(shown);
    expect(peopleDisclosureAfter(hidden, 6)).toBe(hidden);
  });

  it('starts a chosen group afresh, open only for fewer than two people', () => {
    const current = { initialized: false, touched: true, open: true, reopened: 3 };
    const fresh = { initialized: true, touched: false };
    expect(peopleDisclosureForGroup(current, 6)).toEqual({ ...fresh, open: false, reopened: 3 });
    expect(peopleDisclosureForGroup(current, 1)).toEqual({ ...fresh, open: true, reopened: 4 });
  });
});
