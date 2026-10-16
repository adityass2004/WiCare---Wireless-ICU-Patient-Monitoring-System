import type {
  PatientIdentity,
  ScenarioType,
  VitalQuality,
  VitalReading,
  VitalType,
} from '@wicare/shared';
import {
  MQTT_SCHEMA_VERSION,
  type StatusMessage,
  type VitalsMessage,
  statusTopic,
  vitalsTopic,
  vitalsCriticalTopic,
} from '@wicare/shared';
import { applyScenario, type RNG } from '@wicare/scenarios';
import { connect, type MqttClient } from 'mqtt';
import { NetworkEmulator, type NetworkEmulatorConfig, type PublishOptions } from '@wicare/network-emulator';
import { SeededRNG } from './rng.js';
import { ecgAdvance, ecgSample } from './ecg.js';
import { SLOW_VITALS, VITAL_CONFIGS, type VitalConfig } from './vital-configs.js';
import { FixedRateStrategy, type TransmissionStrategy } from './transmission-strategy.js';

interface VitalState {
  config: VitalConfig;
  walk: number;
  override: number | null;
  lastValue: number;
}

export type PatientStatus = 'stopped' | 'running' | 'paused';

export interface VirtualPatientOptions {
  seed?: number;
}

export interface MqttConnectionOptions {
  brokerUrl: string;
  publishIntervalMs?: number;
  qos?: 0 | 1;
  networkConfig?: NetworkEmulatorConfig;
  username?: string;
  password?: string;
  strategy?: TransmissionStrategy;
  maxBufferSize?: number;
}

export class VirtualPatient {
  readonly identity: PatientIdentity;
  private readonly rng: SeededRNG;
  private readonly seed: number;
  private vitals: Record<VitalType, VitalState>;
  private ecgPhase = 0;
  private scenario: ScenarioType = 'stable';
  private scenarioElapsed = 0;
  private status: PatientStatus = 'stopped';
  private sequence = 0;
  private messageSeq = 0;
  private lastReadings: VitalReading[] = [];
  private mqttClient: MqttClient | null = null;
  private mqttConnected = false;
  private mqttQos: 0 | 1 = 0;
  private publishIntervalMs = 1000;
  private publishAccumulatorMs = 0;
  private networkEmulator: NetworkEmulator | null = null;
  private strategy: TransmissionStrategy = new FixedRateStrategy();
  private offlineBuffer: Array<{ message: VitalsMessage; isCritical: boolean }> = [];
  private maxBufferSize = 100;
  private bufferOverflowCount = 0;

  constructor(identity: PatientIdentity, opts: VirtualPatientOptions = {}) {
    this.identity = identity;
    this.seed = opts.seed ?? Math.floor(Math.random() * 1_000_000_000);
    this.rng = new SeededRNG(this.seed);
    this.vitals = this.initVitals();
  }

  get seedValue(): number {
    return this.seed;
  }

  get currentStatus(): PatientStatus {
    return this.status;
  }

  get currentScenario(): ScenarioType {
    return this.scenario;
  }

  start(): void {
    this.status = 'running';
  }

  pause(): void {
    if (this.status === 'running') this.status = 'paused';
  }

  reset(): void {
    this.status = 'stopped';
    this.scenario = 'stable';
    this.scenarioElapsed = 0;
    this.ecgPhase = 0;
    this.sequence = 0;
    this.messageSeq = 0;
    this.publishAccumulatorMs = 0;
    this.rng.reset(this.seed);
    this.vitals = this.initVitals();
    this.lastReadings = [];
  }

  setScenario(scenario: ScenarioType): void {
    this.scenario = scenario;
    this.scenarioElapsed = 0;
  }

  setOverride(vital: VitalType, value: number): void {
    const state = this.vitals[vital];
    if (!state) throw new Error(`Unknown vital: ${vital}`);
    state.override = value;
  }

  clearOverride(vital: VitalType): void {
    const state = this.vitals[vital];
    if (!state) throw new Error(`Unknown vital: ${vital}`);
    state.override = null;
  }

  async connectMqtt(opts: MqttConnectionOptions): Promise<void> {
    if (this.mqttClient) return;
    this.publishIntervalMs = opts.publishIntervalMs ?? 1000;
    this.mqttQos = opts.qos ?? 0;
    if (opts.strategy) this.strategy = opts.strategy;
    if (opts.maxBufferSize) this.maxBufferSize = opts.maxBufferSize;
    this.networkEmulator = opts.networkConfig ? new NetworkEmulator(opts.networkConfig) : null;

    const willPayload: StatusMessage = {
      schemaVersion: MQTT_SCHEMA_VERSION,
      deviceId: this.identity.deviceId,
      patientId: this.identity.patientId,
      bedId: this.identity.bedId,
      ward: this.identity.ward,
      status: 'offline',
      timestamp: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      let resolved = false;
      const client = connect(opts.brokerUrl, {
        clientId: `wicare-${this.identity.deviceId}-${Math.random().toString(36).slice(2, 8)}`,
        clean: true,
        reconnectPeriod: 1000,
        username: opts.username,
        password: opts.password,
        will: {
          topic: statusTopic(this.identity.ward, this.identity.bedId, this.identity.deviceId),
          payload: JSON.stringify(willPayload),
          qos: 1,
          retain: true,
        },
      });

      client.on('connect', () => {
        this.mqttConnected = true;
        this.mqttClient = client;
        this.flushOfflineBuffer();
        const onlinePayload: StatusMessage = {
          schemaVersion: MQTT_SCHEMA_VERSION,
          deviceId: this.identity.deviceId,
          patientId: this.identity.patientId,
          bedId: this.identity.bedId,
          ward: this.identity.ward,
          status: 'online',
          timestamp: new Date().toISOString(),
        };
        client.publish(
          statusTopic(this.identity.ward, this.identity.bedId, this.identity.deviceId),
          JSON.stringify(onlinePayload),
          { qos: 1, retain: true },
        );
        if (!resolved) {
          resolved = true;
          resolve();
        }
      });

      client.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      client.on('close', () => {
        this.mqttConnected = false;
      });

      client.on('offline', () => {
        this.mqttConnected = false;
      });
    });
  }

  async disconnectMqtt(): Promise<void> {
    if (!this.mqttClient) return;
    const offlinePayload: StatusMessage = {
      schemaVersion: MQTT_SCHEMA_VERSION,
      deviceId: this.identity.deviceId,
      patientId: this.identity.patientId,
      bedId: this.identity.bedId,
      ward: this.identity.ward,
      status: 'offline',
      timestamp: new Date().toISOString(),
    };
    await new Promise<void>((resolve) => {
      this.mqttClient!.publish(
        statusTopic(this.identity.ward, this.identity.bedId, this.identity.deviceId),
        JSON.stringify(offlinePayload),
        { qos: 1, retain: true },
        () => {
          this.mqttClient!.end(true, () => {
            this.mqttClient = null;
            this.mqttConnected = false;
            resolve();
          });
        },
      );
    });
  }

  get isMqttConnected(): boolean {
    return this.mqttConnected;
  }

  get networkStats() {
    return this.networkEmulator?.getStats() ?? null;
  }

  get bufferOverflows(): number {
    return this.bufferOverflowCount;
  }

  get bufferCount(): number {
    return this.offlineBuffer.length;
  }

  setStrategy(strategy: TransmissionStrategy): void {
    this.strategy = strategy;
  }

  getLatest(): Record<VitalType, VitalReading | undefined> {
    const map = {} as Record<VitalType, VitalReading | undefined>;
    for (const r of this.lastReadings) map[r.type] = r;
    return map;
  }

  getLatestReadings(): VitalReading[] {
    return this.lastReadings;
  }

  tick(dtMs: number): VitalReading[] {
    if (this.status !== 'running') return [];
    if (dtMs <= 0) return [];

    this.scenarioElapsed += dtMs;
    const dt = dtMs / 1000;

    const rngAdapter: RNG = {
      next: () => this.rng.next(),
      gaussian: (mean = 0, std = 1) => this.rng.gaussian(mean, std),
    };
    const effect = applyScenario(this.scenario, { elapsedMs: this.scenarioElapsed, rng: rngAdapter });

    const readings: VitalReading[] = [];
    const now = new Date().toISOString();

    for (const vital of SLOW_VITALS) {
      const reading = this.computeVital(vital, effect, dt, now);
      readings.push(reading);
    }

    const hrReading = readings.find((r) => r.type === 'heart_rate')!;
    const ecgReading = this.computeEcg(effect, dt, now, hrReading.value);
    readings.push(ecgReading);

    this.lastReadings = readings;

    const stats = this.networkEmulator?.getStats();
    const lossRateVal = stats && stats.attempted > 0 ? stats.dropped / stats.attempted : 0;

    const targetInterval = this.strategy.calculateInterval({
      scenario: this.scenario,
      latestReadings: this.lastReadings,
      measuredLossRate: lossRateVal,
      baseIntervalMs: this.publishIntervalMs,
    });

    this.publishAccumulatorMs += dtMs;
    while (this.publishAccumulatorMs >= targetInterval) {
      this.publishMessage();
      this.publishAccumulatorMs -= targetInterval;
    }

    return readings;
  }

  private publishMessage(): void {
    const vitals: VitalsMessage['vitals'] = {};
    for (const r of this.lastReadings) {
      vitals[r.type] = { value: r.value, unit: r.unit, quality: r.quality };
    }

    const isCritical: boolean = Boolean(
      this.scenario !== 'stable' ||
      (vitals.spo2 && vitals.spo2.value < 90) ||
      (vitals.heart_rate && vitals.heart_rate.value > 130)
    );

    const message: VitalsMessage = {
      schemaVersion: MQTT_SCHEMA_VERSION,
      deviceId: this.identity.deviceId,
      patientId: this.identity.patientId,
      bedId: this.identity.bedId,
      ward: this.identity.ward,
      seq: this.messageSeq++,
      timestamp: new Date().toISOString(),
      vitals,
      qos: isCritical ? 1 : this.mqttQos,
    };

    if (!this.mqttClient || !this.mqttConnected) {
      // Save to disconnected buffer
      this.offlineBuffer.push({ message, isCritical });
      if (this.offlineBuffer.length > this.maxBufferSize) {
        this.offlineBuffer.shift(); // Drop-oldest policy
        this.bufferOverflowCount++;
      }
      return;
    }

    // Connected -> Send message
    const topic = isCritical
      ? vitalsCriticalTopic(this.identity.ward, this.identity.bedId, this.identity.deviceId)
      : vitalsTopic(this.identity.ward, this.identity.bedId, this.identity.deviceId);

    const payload = Buffer.from(JSON.stringify(message));
    const opts: PublishOptions = { qos: isCritical ? 1 : this.mqttQos };

    const rawPublish = (t: string, p: Buffer, o: PublishOptions) => {
      if (this.mqttClient) {
        this.mqttClient.publish(t, p, { qos: o.qos, retain: o.retain });
      }
    };

    if (this.networkEmulator) {
      this.networkEmulator.publish(topic, payload, opts, rawPublish);
    } else {
      rawPublish(topic, payload, opts);
    }
  }

  private flushOfflineBuffer(): void {
    if (!this.mqttClient || !this.mqttConnected || this.offlineBuffer.length === 0) return;

    // Sort buffer prioritizing critical messages and latest timestamps first
    this.offlineBuffer.sort((a, b) => {
      if (a.isCritical && !b.isCritical) return -1;
      if (!a.isCritical && b.isCritical) return 1;
      return new Date(b.message.timestamp).getTime() - new Date(a.message.timestamp).getTime();
    });

    const toFlush = [...this.offlineBuffer];
    this.offlineBuffer = [];

    for (const item of toFlush) {
      const topic = item.isCritical
        ? vitalsCriticalTopic(this.identity.ward, this.identity.bedId, this.identity.deviceId)
        : vitalsTopic(this.identity.ward, this.identity.bedId, this.identity.deviceId);

      const payload = Buffer.from(JSON.stringify(item.message));
      const opts: PublishOptions = { qos: item.isCritical ? 1 : this.mqttQos };

      const rawPublish = (t: string, p: Buffer, o: PublishOptions) => {
        if (this.mqttClient) {
          this.mqttClient.publish(t, p, { qos: o.qos, retain: o.retain });
        }
      };

      if (this.networkEmulator) {
        this.networkEmulator.publish(topic, payload, opts, rawPublish);
      } else {
        rawPublish(topic, payload, opts);
      }
    }
  }

  private initVitals(): Record<VitalType, VitalState> {
    const out = {} as Record<VitalType, VitalState>;
    for (const vital of Object.keys(VITAL_CONFIGS) as VitalType[]) {
      const config = VITAL_CONFIGS[vital];
      out[vital] = {
        config,
        walk: 0,
        override: null,
        lastValue: config.baseline,
      };
    }
    return out;
  }

  private computeVital(
    vital: VitalType,
    effect: ReturnType<typeof applyScenario>,
    dt: number,
    timestamp: string,
  ): VitalReading {
    const state = this.vitals[vital]!;
    const cfg = state.config;

    if (state.override !== null) {
      state.lastValue = state.override;
      return this.makeReading(vital, state.override, 'ok', timestamp);
    }

    state.walk = state.walk * Math.pow(cfg.walkDecay, dt * 10) + this.rng.gaussian(0, cfg.walkStep * Math.sqrt(dt));

    const scenarioDelta = effect.deltas[vital] ?? 0;
    const noise = this.rng.gaussian(0, cfg.noiseStd);
    let value = cfg.baseline + scenarioDelta + state.walk + noise;

    let quality: VitalQuality = effect.quality;
    if (quality === 'noise') {
      value += this.rng.gaussian(0, cfg.noiseStd * 6);
    } else if (quality === 'flatline') {
      value = 0;
    } else if (quality === 'missing') {
      value = 0;
    }

    value = Math.max(cfg.min, Math.min(cfg.max, value));
    state.lastValue = value;

    return this.makeReading(vital, value, quality, timestamp);
  }

  private computeEcg(
    effect: ReturnType<typeof applyScenario>,
    dt: number,
    timestamp: string,
    heartRate: number,
  ): VitalReading {
    const state = this.vitals.ecg!;
    const cfg = state.config;

    if (state.override !== null) {
      return this.makeReading('ecg', state.override, 'ok', timestamp);
    }

    this.ecgPhase = ecgAdvance(this.ecgPhase, dt, heartRate);
    let value = ecgSample(this.ecgPhase) * effect.ecgMultiplier;
    value += this.rng.gaussian(0, cfg.noiseStd);

    let quality: VitalQuality = effect.quality;
    if (quality === 'flatline' || quality === 'missing') {
      value = 0;
    } else if (quality === 'noise') {
      value += this.rng.gaussian(0, 0.3);
    }

    value = Math.max(cfg.min, Math.min(cfg.max, value));
    state.lastValue = value;

    return this.makeReading('ecg', value, quality, timestamp);
  }

  private makeReading(
    type: VitalType,
    value: number,
    quality: VitalQuality,
    timestamp: string,
  ): VitalReading {
    return {
      deviceId: this.identity.deviceId,
      type,
      value: Number(value.toFixed(3)),
      unit: VITAL_CONFIGS[type].unit,
      timestamp,
      sequence: this.sequence++,
      quality,
    };
  }
}
