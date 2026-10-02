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
      `${record.title} ${key === 'later' ? 'removed from Play later' : `is no longer marked ${key}`}.`,
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
      `${record.title} is already marked completed.`,
    );
    expect(actionMessage({ type: 'set-progress', records: [record], key: 'completed', value: false }, before)).toBe(
      `${record.title} is no longer marked completed.`,
    );
  });

  it('uses one phrasing for both order updates', () => {
    for (const list of ['queue', 'ranking'] as const) {
      expect(actionMessage({ type: 'move-item', list, id: 'a', overId: 'b' })).toBe(
        `${list === 'queue' ? 'Play later' : 'Ranking'} order updated.`,
      );
    }
  });

  it('names the committed game in either list order message', () => {
    const state = applyPersonalAction(empty, { type: 'add-records', records: [record] });
    for (const list of ['queue', 'ranking'] as const) {
      expect(actionMessage({ type: 'move-item', list, id: record.id, overId: 'b' }, state, state)).toBe(
        `${record.title}: ${list === 'queue' ? 'Play later' : 'Ranking'} order updated.`,
      );
    }
  });

  it('names one game added to or already in My games', () => {
    const action: PersonalAction = { type: 'add-records', records: [record, record] };
    const after = applyPersonalAction(empty, action);
    expect(actionMessage(action, empty, after)).toBe(`${record.title} added to My games.`);
    expect(actionMessage(action, after, after)).toBe(`${record.title} is already in My games.`);
  });

  it('names a ranking addition, position, and removal without an unrelated played disclaimer', () => {
    const action: PersonalAction = { type: 'add-ranking', records: [record] };
    const after = applyPersonalAction(empty, action);
    expect(actionMessage(action, empty, after)).toBe(`${record.title} added to your ranking at #1.`);
    expect(actionMessage(action, after, after)).toBe(`${record.title} is already in your ranking at #1.`);
    expect(actionMessage({ type: 'remove-ranking', ids: [record.id] }, after, empty)).toBe(
      `${record.title} removed from your ranking.`,
    );
    expect(actionMessage({ type: 'remove-records', ids: [record.id] }, after, empty)).toBe(
      `${record.title} removed from My games.`,
    );
  });

  it('identifies notes and ratings without repeating private fields', () => {
    const before = applyPersonalAction(empty, { type: 'add-ranking', records: [record] });
    expect(actionMessage({ type: 'edit-ranking', id: record.id, note: 'PRIVATE CONTENT' }, before, before)).toBe(
      `${record.title}: note saved.`,
    );
    expect(actionMessage({ type: 'edit-ranking', id: record.id, score: 7 }, before, before)).toBe(
      `${record.title}: rating saved.`,
    );
    expect(actionMessage({ type: 'edit-ranking', id: record.id, score: 7, note: 'PRIVATE' }, before, before)).toBe(
      `${record.title}: rating and note saved.`,
    );
    expect(actionMessage({ type: 'rate-game', record, score: null }, before, before)).toBe(
      `${record.title}: rating saved.`,
    );
  });

  it('counts bulk ranking additions and uses grammatical unchanged progress wording', () => {
    const before = applyPersonalAction(empty, { type: 'add-ranking', records: [record] });
    const action: PersonalAction = { type: 'add-ranking', records: [record, second] };
    expect(actionMessage(action, before, applyPersonalAction(before, action))).toBe(
      '1 game added to your ranking; 1 was already there.',
    );
    expect(
      actionMessage({ type: 'set-progress', records: [record, second], key: 'completed', value: false }, before),
    ).toBe('0 games no longer marked completed; 2 were not marked completed.');
    expect(actionMessage({ type: 'set-progress', records: [record], key: 'later', value: false }, before)).toBe(
      `${record.title} is not in Play later.`,
    );
  });
});
