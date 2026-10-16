export type TickListener = (dtMs: number) => void;

export class SimulationClock {
  private listeners = new Set<TickListener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick: number | null = null;
  public speed: number;
  public readonly tickIntervalMs: number;

  constructor(opts: { speed?: number; tickIntervalMs?: number } = {}) {
    this.speed = opts.speed ?? 1;
    this.tickIntervalMs = opts.tickIntervalMs ?? 1000;
  }

  onTick(listener: TickListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setSpeed(speed: number): void {
    if (speed <= 0) throw new Error('speed must be positive');
    this.speed = speed;
  }

  start(): void {
    if (this.timer) return;
    this.lastTick = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      const wallDt = now - (this.lastTick ?? now);
      this.lastTick = now;
      this.emit(wallDt * this.speed);
    }, this.tickIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.lastTick = null;
  }

  advance(ms: number): void {
    if (ms < 0) throw new Error('advance amount must be non-negative');
    this.emit(ms);
  }

  private emit(dt: number): void {
    for (const listener of this.listeners) listener(dt);
  }
}
