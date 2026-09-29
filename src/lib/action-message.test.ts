import { describe, expect, it } from 'vitest';
import { actionMessage } from './action-message';
import { discoveryFixture } from './discovery-test-fixtures';
import { applyPersonalAction, emptyPersonalLibrary } from './personal-library';
import type { PersonalAction } from './personal-types';

const record = discoveryFixture.record;
const second = { ...record, id: 'manual:second', title: 'Second game' };
const empty = emptyPersonalLibrary();

describe('committed action wording', () => {
  it('counts only unique newly added records', () => {
    const before = applyPersonalAction(empty, { type: 'add-records', records: [record] });
    expect(actionMessage({ type: 'add-records', records: [record, second, second] }, before)).toBe(
      '1 game added to My games; 1 was already there.',
    );
  });

  it('counts 96 new Play later games and six unchanged memberships', () => {
    const records = Array.from({ length: 102 }, (_, index) => ({ ...record, id: `manual:${index}` }));
    const before = applyPersonalAction(empty, {
      type: 'set-progress',
      records: records.slice(0, 6),
      key: 'later',
      value: true,
    });
    const action: PersonalAction = { type: 'set-progress', records, key: 'later', value: true };
    expect(actionMessage(action, before)).toBe('96 games added to Play later; 6 were already there.');
    const after = applyPersonalAction(before, action);
    expect(actionMessage(action, after)).toBe('0 games added to Play later; 102 were already there.');
  });

  it.each(['later', 'played', 'completed'] as const)('names single %s toggles and their direction', (key) => {
    const action: PersonalAction = { type: 'toggle-progress', record, key };
    const after = applyPersonalAction(empty, action);
    expect(actionMessage(action, empty, after)).toBe(
      `${record.title} ${key === 'later' ? 'added to Play later' : `marked ${key}`}.`,
    );
    expect(actionMessage(action, after, applyPersonalAction(after, action))).toBe(
      `${record.title} ${key === 'later' ? 'removed from Play later' : `unmarked ${key}`}.`,
    );
  });

  it('reports single explicit progress changes without claiming an unchanged update', () => {
    const before = applyPersonalAction(empty, {
      type: 'set-progress',
      records: [record],
      key: 'completed',
      value: true,
    });
    expect(actionMessage({ type: 'set-progress', records: [record], key: 'completed', value: true }, before)).toBe(
      `${record.title} was already marked completed.`,
    );
    expect(actionMessage({ type: 'set-progress', records: [record], key: 'completed', value: false }, before)).toBe(
      `${record.title} unmarked completed.`,
    );
  });

  it('uses one phrasing for both order updates', () => {
    for (const list of ['queue', 'ranking'] as const) {
      expect(actionMessage({ type: 'move-item', list, id: 'a', overId: 'b' })).toBe(
        `${list === 'queue' ? 'Play later' : 'Ranking'} order updated.`,
      );
    }
  });
});
