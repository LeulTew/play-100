export type FrameBudgetAction = 'keep' | 'reduce' | 'fallback';

export const MIN_SCENE_DPR = 0.75;

export class FrameBudget {
  private warmupFrames = 12;
  private samples = 0;
  private frameTotal = 0;
  private renderTotal = 0;
  private slowWindows = 0;

  sample(frameMs: number, renderMs: number, pixelRatio: number): FrameBudgetAction {
    if (!Number.isFinite(frameMs) || !Number.isFinite(renderMs) || frameMs <= 0 || renderMs < 0) {
      return 'keep';
    }

    if (this.warmupFrames > 0) {
      this.warmupFrames -= 1;
      return 'keep';
    }

    this.samples += 1;
    this.frameTotal += frameMs;
    this.renderTotal += renderMs;

    if (this.samples < 12) return 'keep';

    const isSlow = this.frameTotal / this.samples > 38 || this.renderTotal / this.samples > 20;
    this.samples = 0;
    this.frameTotal = 0;
    this.renderTotal = 0;
    this.slowWindows = isSlow ? this.slowWindows + 1 : 0;

    if (!isSlow) return 'keep';
    if (pixelRatio > MIN_SCENE_DPR + 0.01) {
      this.slowWindows = 0;
      this.warmupFrames = 4;
      return 'reduce';
    }

    return this.slowWindows >= 2 ? 'fallback' : 'keep';
  }
}
