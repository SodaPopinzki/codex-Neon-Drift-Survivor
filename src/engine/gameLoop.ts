export type LoopHandlers = {
  update: (dt: number) => void;
  render: () => void;
};

const FIXED_STEP_SECONDS = 1 / 60;
const MAX_ACCUM_SECONDS = 0.25;

export class GameLoop {
  private animationFrameId: number | null = null;
  private lastTimestamp = 0;
  private accumulator = 0;
  private readonly handlers: LoopHandlers;

  constructor(handlers: LoopHandlers) {
    this.handlers = handlers;
  }

  start(): void {
    if (this.animationFrameId !== null) return;
    this.lastTimestamp = performance.now();
    this.animationFrameId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (this.animationFrameId === null) return;
    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }

  private frame = (timestamp: number): void => {
    const elapsedSeconds = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    this.accumulator += Math.min(elapsedSeconds, MAX_ACCUM_SECONDS);

    while (this.accumulator >= FIXED_STEP_SECONDS) {
      this.handlers.update(FIXED_STEP_SECONDS);
      this.accumulator -= FIXED_STEP_SECONDS;
    }

    this.handlers.render();
    this.animationFrameId = requestAnimationFrame(this.frame);
  };
}
