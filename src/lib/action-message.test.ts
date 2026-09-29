import { describe, expect, it } from 'vitest';
import { actionMessage } from './action-message';
import { discoveryFixture } from './discovery-test-fixtures';

describe('library action wording', () => {
  it.each([1, 2])('names My games when adding %i games', (count) => {
    expect(actionMessage({ type: 'add-records', records: Array(count).fill(discoveryFixture.record) })).toBe(
      `${count} ${count === 1 ? 'game' : 'games'} added to My games.`,
    );
  });
  it.each([true, false])('names the Play later membership change, selected=%s', (value) => {
    expect(actionMessage({ type: 'set-progress', records: [discoveryFixture.record], key: 'later', value })).toBe(
      `1 game ${value ? 'added to' : 'removed from'} Play later.`,
    );
  });
  it('never uses saving to mean queueing', () => {
    expect(actionMessage({ type: 'toggle-progress', record: discoveryFixture.record, key: 'later' })).toBe(
      'Play later updated.',
    );
    expect(actionMessage({ type: 'move-item', list: 'queue', id: 'a', overId: 'b' })).toBe('Play later order updated.');
  });
});
