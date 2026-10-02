import { afterEach, describe, expect, it } from 'vitest';
import { sceneSpan } from './scene-timing';

afterEach(() => {
  performance.clearMarks();
  performance.clearMeasures();
});

describe('scene startup timing', () => {
  it('marks a span start and end and measures between them', () => {
    const done = sceneSpan('module');
    expect(performance.getEntriesByName('p100:scene:module-start', 'mark')).toHaveLength(1);
    expect(performance.getEntriesByName('p100:scene:module-end', 'mark')).toHaveLength(0);
    done();
    expect(performance.getEntriesByName('p100:scene:module-end', 'mark')).toHaveLength(1);
    expect(performance.getEntriesByName('p100:scene:module', 'measure')).toHaveLength(1);
  });

  it('keeps the end mark, without throwing, when the start mark was cleared', () => {
    const done = sceneSpan('first-render');
    performance.clearMarks('p100:scene:first-render-start');
    expect(done).not.toThrow();
    expect(performance.getEntriesByName('p100:scene:first-render-end', 'mark')).toHaveLength(1);
    expect(performance.getEntriesByName('p100:scene:first-render', 'measure')).toHaveLength(0);
  });
});
