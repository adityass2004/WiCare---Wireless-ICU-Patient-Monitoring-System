import { SeededRNG } from './rng.js';

export interface DisconnectWindow {
  startMs: number;
  durationMs: number;
}

export interface NetworkEmulatorConfig {
  lossRate: number;
  fixedDelayMs: number;
  jitterMs: number;
  disconnectWindows?: DisconnectWindow[];
  seed?: number;
}

export interface EmulatorStats {
  attempted: number;
  sent: number;
  dropped: number;
  inDisconnect: number;
  delayed: number;
}

export interface PublishOptions {
  qos: 0 | 1;
  retain?: boolean;
}

export type RawPublish = (
  topic: string,
  payload: Buffer,
  opts: PublishOptions,
) => void | Promise<void>;

export class NetworkEmulator {
  private readonly rng: SeededRNG;
  private readonly config: Required<NetworkEmulatorConfig>;
  private readonly startedAt: number;
  private stats: EmulatorStats = {
    attempted: 0,
    sent: 0,
    dropped: 0,
    inDisconnect: 0,
    delayed: 0,
  };
  private pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(config: NetworkEmulatorConfig) {
    if (config.lossRate < 0 || config.lossRate > 1) {
      throw new Error('lossRate must be between 0 and 1');
    }
    if (config.fixedDelayMs < 0) throw new Error('fixedDelayMs must be non-negative');
    if (config.jitterMs < 0) throw new Error('jitterMs must be non-negative');
    this.config = {
      lossRate: config.lossRate,
      fixedDelayMs: config.fixedDelayMs,
      jitterMs: config.jitterMs,
      disconnectWindows: config.disconnectWindows ?? [],
      seed: config.seed ?? Math.floor(Math.random() * 1_000_000_000),
    };
    this.rng = new SeededRNG(this.config.seed);
    this.startedAt = Date.now();
  }

  get lossRate(): number {
    return this.config.lossRate;
  }

  isDisconnected(now: number = Date.now()): boolean {
    const elapsed = now - this.startedAt;
    return this.config.disconnectWindows.some(
      (w) => elapsed >= w.startMs && elapsed < w.startMs + w.durationMs,
    );
  }

  publish(topic: string, payload: Buffer, opts: PublishOptions, raw: RawPublish): void {
    this.stats.attempted++;

    if (this.isDisconnected()) {
      this.stats.dropped++;
      this.stats.inDisconnect++;
      return;
    }

    if (this.rng.next() < this.config.lossRate) {
      this.stats.dropped++;
      return;
    }

    const jitter = this.config.jitterMs > 0 ? (this.rng.next() * 2 - 1) * this.config.jitterMs : 0;
    const delay = Math.max(0, this.config.fixedDelayMs + jitter);

    if (delay === 0) {
      this.stats.sent++;
      void raw(topic, payload, opts);
      return;
    }

    this.stats.delayed++;
    const timer = setTimeout(() => {
      this.pendingTimers.delete(timer);
      this.stats.sent++;
      void raw(topic, payload, opts);
    }, delay);
    this.pendingTimers.add(timer);
  }

  flush(): Promise<void> {
    return new Promise((resolve) => {
      if (this.pendingTimers.size === 0) {
        resolve();
        return;
      }
      const check = setInterval(() => {
        if (this.pendingTimers.size === 0) {
          clearInterval(check);
          resolve();
        }
      }, 5);
    });
  }

  getStats(): EmulatorStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = { attempted: 0, sent: 0, dropped: 0, inDisconnect: 0, delayed: 0 };
  }

  get measuredLossRate(): number {
    return this.stats.attempted > 0 ? this.stats.dropped / this.stats.attempted : 0;
  }
}
