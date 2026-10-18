import { connect, type MqttClient } from 'mqtt';
import {
  StatusMessageSchema,
  VitalsMessageSchema,
  VITALS_TOPIC_FILTER,
  VITALS_CRITICAL_TOPIC_FILTER,
  STATUS_TOPIC_FILTER,
  parseTopic,
  type VitalsMessage,
  type StatusMessage,
} from '@wicare/shared';
import type { Logger } from 'pino';
import type { DeviceRegistry } from './device-registry.js';
import type { ReadingBatcher } from '../db/reading-batcher.js';
import type { WsServer } from '../ws/socket-server.js';

import type { AlertEngine } from '../alerts/alert-engine.js';
import type { MqttDropRecorder } from './drop-recorder.js';

export interface SubscriberOptions {
  brokerUrl: string;
  username?: string;
  password?: string;
  registry: DeviceRegistry;
  batcher?: ReadingBatcher;
  wsServer?: WsServer;
  alertEngine?: AlertEngine;
  dropRecorder?: MqttDropRecorder;
  logger: Logger;
  onMessageReceived?: (
    message: VitalsMessage,
    topicKind: 'vitals' | 'vitals_critical',
    receivedAt: number,
    transportLatencyMs: number,
  ) => void;
}

export class MqttSubscriber {
  private client: MqttClient | null = null;
  private readonly registry: DeviceRegistry;
  private readonly logger: Logger;
  private readonly opts: SubscriberOptions;

  constructor(opts: SubscriberOptions) {
    this.opts = opts;
    this.registry = opts.registry;
    this.logger = opts.logger.child({ component: 'mqtt-subscriber' });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = connect(this.opts.brokerUrl, {
        clientId: `wicare-api-${Math.random().toString(36).slice(2, 8)}`,
        clean: true,
        username: this.opts.username,
        password: this.opts.password,
      });

      client.once('connect', () => {
        this.logger.info({ brokerUrl: this.opts.brokerUrl }, 'MQTT subscriber connected');
        const topics = [VITALS_TOPIC_FILTER, VITALS_CRITICAL_TOPIC_FILTER, STATUS_TOPIC_FILTER];
        client.subscribe(topics, { qos: 1 }, (err) => {
          if (err) {
            this.logger.error({ err }, 'Failed to subscribe');
            reject(err);
            return;
          }
          this.logger.info(
            { topics },
            'Subscribed to device topics',
          );
          this.client = client;
          resolve();
        });
      });

      client.once('error', (err) => {
        this.logger.error({ err }, 'MQTT subscriber error');
        reject(err);
      });

      client.on('reconnect', () => {
        this.logger.warn('MQTT subscriber reconnecting');
      });

      client.on('message', (topic, payload) => {
        this.handleMessage(topic, payload);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.client) return;
    await new Promise<void>((resolve) => {
      this.client!.end(true, () => {
        this.client = null;
        resolve();
      });
    });
  }

  private handleMessage(topic: string, payload: Buffer): void {
    const parsed = parseTopic(topic);
    if (!parsed) {
      this.logger.warn({ topic }, 'Ignoring message on unrecognized topic');
      return;
    }

    let json: unknown;
    try {
      json = JSON.parse(payload.toString());
    } catch {
      this.logger.warn({ topic, deviceId: parsed.deviceId }, 'Malformed JSON payload rejected');
      return;
    }

    if (parsed.kind === 'vitals' || parsed.kind === 'vitals_critical') {
      const result = VitalsMessageSchema.safeParse(json);
      if (!result.success) {
        this.logger.warn(
          { topic, deviceId: parsed.deviceId, issues: result.error.issues },
          'Malformed vitals message rejected',
        );
        return;
      }
      const message: VitalsMessage = result.data;
      if (message.deviceId !== parsed.deviceId) {
        this.logger.warn(
          { topicDeviceId: parsed.deviceId, messageDeviceId: message.deviceId },
          'Device ID mismatch between topic and payload',
        );
        return;
      }

      const receivedAt = Date.now();
      const sentAt = new Date(message.timestamp).getTime();
      const transportLatencyMs = isNaN(sentAt) ? 0 : Math.max(0, receivedAt - sentAt);

      if (this.opts.onMessageReceived) {
        this.opts.onMessageReceived(
          message,
          parsed.kind as 'vitals' | 'vitals_critical',
          receivedAt,
          transportLatencyMs,
        );
      }

      const devStateBefore = this.registry.get(message.deviceId);
      const lastSeqBefore = devStateBefore?.lastSeq ?? null;

      this.registry.ingest(message);

      if (lastSeqBefore !== null && message.seq > lastSeqBefore + 1) {
        const droppedCount = message.seq - lastSeqBefore - 1;
        const msgTime = new Date(message.timestamp).getTime();
        const aoiMs = isNaN(msgTime) ? 0 : Math.max(0, Date.now() - msgTime);

        const dropEvent = this.opts.dropRecorder?.recordDrop({
          timestamp: new Date().toISOString(),
          deviceId: message.deviceId,
          patientId: message.patientId,
          bedId: message.bedId,
          ward: message.ward,
          expectedSeq: lastSeqBefore + 1,
          receivedSeq: message.seq,
          droppedCount,
          aoiMs,
          qos: message.qos ?? 0,
        });

        if (dropEvent) {
          this.opts.wsServer?.broadcastDrop(dropEvent);
        }
      }

      this.opts.batcher?.enqueue(message);
      this.opts.alertEngine?.processReading(message).catch((err) => {
        this.logger.error({ err }, 'Error processing reading in AlertEngine');
      });
      this.opts.wsServer?.broadcastVitals(message);

      const devState = this.registry.get(message.deviceId);
      if (devState) {
        this.opts.wsServer?.broadcastStats({
          deviceId: message.deviceId,
          measuredLossRate: this.registry.getMeasuredLossRate(message.deviceId),
          totalReceived: devState.totalReceived,
          gapCount: devState.gapCount,
          totalGaps: devState.totalGaps,
        });
      }
      return;
    }

    const result = StatusMessageSchema.safeParse(json);
    if (!result.success) {
      this.logger.warn(
        { topic, deviceId: parsed.deviceId, issues: result.error.issues },
        'Malformed status message rejected',
      );
      return;
    }
    const message: StatusMessage = result.data;
    this.registry.setStatus(message.deviceId, message.status);
    this.opts.wsServer?.broadcastStatus({
      deviceId: message.deviceId,
      patientId: message.patientId,
      ward: message.ward,
      bedId: message.bedId,
      status: message.status,
      timestamp: message.timestamp,
    });
  }
}
