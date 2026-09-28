import type { Locator } from '@playwright/test';

/**
 * Counts, from now on, every change to the illustration's pose: a sleeve's transform or its shadow's width. The page
 * records each change as it happens, so a check that reads the count late cannot miss a snap.
 */
export async function countStillPoseChanges(artifact: Locator): Promise<() => Promise<number>> {
  const still = artifact.locator('.artifact-still');
  await still.evaluate((element) => {
    Reflect.set(element, 'p100PoseChanges', 0);
    new MutationObserver((records) => {
      Reflect.set(element, 'p100PoseChanges', (Reflect.get(element, 'p100PoseChanges') as number) + records.length);
    }).observe(element, { attributes: true, attributeFilter: ['style', 'rx'], subtree: true });
  });
  return () => still.evaluate((element) => Reflect.get(element, 'p100PoseChanges') as number);
}

/**
 * Counts, from now on, the frames the scene renders while it is on screen. A fold animates for 780ms and renders
 * many; a scene that starts in the requested pose renders only its few construction frames. The page counts each frame
 * as it renders, so a check that reads the count late cannot miss the fold.
 */
export async function countShownFrames(artifact: Locator): Promise<() => Promise<number>> {
  await artifact.evaluate((root) => {
    const frames = new Set<string>();
    new MutationObserver(() => {
      if (root.getAttribute('data-render-mode') === 'webgl') frames.add(root.getAttribute('data-frame-count') ?? '');
    }).observe(root, { attributes: true, attributeFilter: ['data-frame-count', 'data-render-mode'] });
    Reflect.set(root, 'p100ShownFrames', frames);
  });
  return () => artifact.evaluate((root) => (Reflect.get(root, 'p100ShownFrames') as Set<string>).size);
}
