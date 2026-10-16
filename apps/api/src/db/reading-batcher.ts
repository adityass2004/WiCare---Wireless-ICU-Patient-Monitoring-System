import type { VitalsMessage } from '@wicare/shared';
import { prisma } from './prisma.js';
import type { Logger } from 'pino';

export interface ReadingItem {
  deviceId: string;
  patientId: string;
  seq: number;
  timestamp: Date;
  vitalsJson: string;
  qos: number;
}

export class ReadingBatcher {
  private queue: ReadingItem[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly logger: Logger;

  constructor(logger: Logger, opts: { batchSize?: number; flushIntervalMs?: number } = {}) {
    this.logger = logger.child({ component: 'reading-batcher' });
    this.batchSize = opts.batchSize ?? 50;
    this.flushIntervalMs = opts.flushIntervalMs ?? 300;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.flush().catch((err) => {
        this.logger.error({ err }, 'Error flushing reading batch');
      });
    }, this.flushIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  enqueue(message: VitalsMessage): void {
    this.queue.push({
      deviceId: message.deviceId,
      patientId: message.patientId,
      seq: message.seq,
      timestamp: new Date(message.timestamp),
      vitalsJson: JSON.stringify(message.vitals),
      qos: message.qos ?? 0,
    });

    if (this.queue.length >= this.batchSize) {
      this.flush().catch((err) => {
        this.logger.error({ err }, 'Error flushing reading batch on threshold');
      });
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      await prisma.reading.createMany({
        data: batch,
      });

      const deviceIds = Array.from(new Set(batch.map((b) => b.deviceId)));
      for (const devId of deviceIds) {
        const last = batch.filter((b) => b.deviceId === devId).pop();
        if (last) {
          await prisma.device.update({
            where: { id: devId },
            data: { lastSeen: last.timestamp, status: 'online' },
          }).catch(() => {});
        }
      }
    } catch (err) {
      this.logger.error({ err, count: batch.length }, 'Failed to insert reading batch');
    }
  }
}
