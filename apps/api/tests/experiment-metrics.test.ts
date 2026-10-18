import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:net';
import { Aedes } from 'aedes';
import { VirtualPatient, AdaptiveRiskNetworkStrategy } from '@wicare/patient-generator';
import { MqttSubscriber } from '../src/mqtt/subscriber.js';
import { DeviceRegistry } from '../src/mqtt/device-registry.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('Empirical Experiment Metrics & PDR Verification', { timeout: 25000 }, () => {
  let broker: InstanceType<typeof Aedes>;
  let tcpServer: ReturnType<typeof createServer>;
  const PORT = 18849;
  const BROKER_URL = `mqtt://127.0.0.1:${PORT}`;

  beforeAll(async () => {
    broker = new Aedes();
    await broker.listen();
    tcpServer = createServer((stream) => broker.handle(stream));
    await new Promise<void>((resolve) => tcpServer.listen(PORT, resolve));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (broker) {
        broker.close(() => {
          if (tcpServer) {
            tcpServer.close(() => resolve());
          } else {
            resolve();
          }
        });
      } else if (tcpServer) {
        tcpServer.close(() => resolve());
      } else {
        resolve();
      }
    });
  });

  it('calculates 100% PDR under 0% network loss using dispatched packets as denominator', async () => {
    const registry = new DeviceRegistry();
    let totalReceivedAtSubscriber = 0;

    const subscriber = new MqttSubscriber({
      brokerUrl: BROKER_URL,
      registry,
      logger,
      onMessageReceived: () => {
        totalReceivedAtSubscriber++;
      },
    });
    await subscriber.start();

    const patient = new VirtualPatient(
      { patientId: 'P-TEST-001', bedId: 'B-1', ward: 'ICU', deviceId: 'DEV-TEST-001' },
      { seed: 101 },
    );

    await patient.connectMqtt({
      brokerUrl: BROKER_URL,
      qos: 0,
      publishIntervalMs: 50,
      networkConfig: {
        lossRate: 0.0,
        fixedDelayMs: 5,
        jitterMs: 0,
        seed: 101,
      },
    });
    patient.start();

    // Advance 20 times at 50ms = 1000ms total -> should dispatch 20 packets
    for (let i = 0; i < 20; i++) {
      patient.tick(50);
      await new Promise((r) => setTimeout(r, 5));
    }

    // Wait for in-flight MQTT messages to settle
    await new Promise((r) => setTimeout(r, 400));

    const dispatched = patient.messagesDispatched;
    expect(dispatched).toBe(20);
    expect(totalReceivedAtSubscriber).toBe(20);

    const pdr = (totalReceivedAtSubscriber / dispatched) * 100;
    expect(pdr).toBe(100.0);

    await patient.disconnectMqtt();
    await subscriber.stop();
  });

  it('measures PDR approximately equal to (1 - lossRate) under 20% loss', async () => {
    const registry = new DeviceRegistry();
    let totalReceived = 0;

    const subscriber = new MqttSubscriber({
      brokerUrl: BROKER_URL,
      registry,
      logger,
      onMessageReceived: () => {
        totalReceived++;
      },
    });
    await subscriber.start();

    const patient = new VirtualPatient(
      { patientId: 'P-TEST-002', bedId: 'B-2', ward: 'ICU', deviceId: 'DEV-TEST-002' },
      { seed: 202 },
    );

    await patient.connectMqtt({
      brokerUrl: BROKER_URL,
      qos: 0,
      publishIntervalMs: 20,
      networkConfig: {
        lossRate: 0.20, // 20% packet loss
        fixedDelayMs: 2,
        jitterMs: 0,
        seed: 777,
      },
    });
    patient.start();

    // 50 dispatches
    for (let i = 0; i < 50; i++) {
      patient.tick(20);
      await new Promise((r) => setTimeout(r, 3));
    }

    await new Promise((r) => setTimeout(r, 400));

    const dispatched = patient.messagesDispatched;
    expect(dispatched).toBe(50);

    const pdr = (totalReceived / dispatched) * 100;
    // PDR should be around 80% (between 70% and 90%)
    expect(pdr).toBeGreaterThanOrEqual(70);
    expect(pdr).toBeLessThanOrEqual(90);

    await patient.disconnectMqtt();
    await subscriber.stop();
  });

  it('measures non-negative true transport latency and valid AoI', async () => {
    const registry = new DeviceRegistry();
    const measuredLatencies: number[] = [];

    const subscriber = new MqttSubscriber({
      brokerUrl: BROKER_URL,
      registry,
      logger,
      onMessageReceived: (_msg, _kind, _recvAt, latencyMs) => {
        measuredLatencies.push(latencyMs);
      },
    });
    await subscriber.start();

    const patient = new VirtualPatient(
      { patientId: 'P-TEST-003', bedId: 'B-3', ward: 'ICU', deviceId: 'DEV-TEST-003' },
      { seed: 303 },
    );

    await patient.connectMqtt({
      brokerUrl: BROKER_URL,
      qos: 0,
      publishIntervalMs: 30,
      networkConfig: {
        lossRate: 0.0,
        fixedDelayMs: 15,
        jitterMs: 5,
        seed: 888,
      },
    });
    patient.start();

    for (let i = 0; i < 10; i++) {
      patient.tick(30);
      await new Promise((r) => setTimeout(r, 10));
    }

    await new Promise((r) => setTimeout(r, 400));

    expect(measuredLatencies.length).toBeGreaterThan(0);
    for (const lat of measuredLatencies) {
      expect(lat).toBeGreaterThanOrEqual(0);
      // Fixed delay is 15ms so latency should reflect transit time
      expect(lat).toBeGreaterThanOrEqual(5);
    }

    await patient.disconnectMqtt();
    await subscriber.stop();
  });

  it('routes acute deterioration alerts to vitals/critical priority channel', async () => {
    const registry = new DeviceRegistry();
    const receivedTopics: string[] = [];

    const subscriber = new MqttSubscriber({
      brokerUrl: BROKER_URL,
      registry,
      logger,
      onMessageReceived: (_msg, kind) => {
        receivedTopics.push(kind);
      },
    });
    await subscriber.start();

    const patient = new VirtualPatient(
      { patientId: 'P-TEST-004', bedId: 'B-4', ward: 'ICU', deviceId: 'DEV-TEST-004' },
      { seed: 404 },
    );

    await patient.connectMqtt({
      brokerUrl: BROKER_URL,
      qos: 1,
      publishIntervalMs: 30,
      strategy: new AdaptiveRiskNetworkStrategy(),
    });
    patient.start();

    // Trigger hypoxia scenario
    patient.setScenario('falling_spo2');
    for (let i = 0; i < 15; i++) {
      patient.tick(30);
      await new Promise((r) => setTimeout(r, 5));
    }

    await new Promise((r) => setTimeout(r, 400));

    expect(receivedTopics).toContain('vitals_critical');

    await patient.disconnectMqtt();
    await subscriber.stop();
  });
});
