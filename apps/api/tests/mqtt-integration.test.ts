import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'net';
import { Aedes } from 'aedes';
import { SimulationManager } from '@wicare/patient-generator';
import { MqttSubscriber } from '../src/mqtt/subscriber.js';
import { DeviceRegistry } from '../src/mqtt/device-registry.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('Phase 2 MQTT Wireless Network Simulation Integration', { timeout: 20000 }, () => {
  let broker: InstanceType<typeof Aedes>;
  let tcpServer: ReturnType<typeof createServer>;
  const PORT = 18837;
  const BROKER_URL = `mqtt://127.0.0.1:${PORT}`;

  beforeAll(async () => {
    broker = new Aedes();
    await broker.listen();
    tcpServer = createServer((stream) => broker.handle(stream));
    await new Promise<void>((resolve) => tcpServer.listen(PORT, resolve));
  });

  afterAll(async () => {
    if (tcpServer) {
      await new Promise<void>((resolve) => tcpServer.close(() => resolve()));
    }
    if (broker) {
      await new Promise<void>((resolve) => broker.close(() => resolve()));
    }
  });

  it('Milestone: 3 virtual patients publish to MQTT and backend identifies all 3', async () => {
    const registry = new DeviceRegistry();
    const subscriber = new MqttSubscriber({
      brokerUrl: BROKER_URL,
      registry,
      logger,
    });
    await subscriber.start();

    const manager = new SimulationManager({ speed: 1, tickIntervalMs: 10, seed: 42 });
    for (let i = 1; i <= 3; i++) {
      manager.addPatient({
        patientId: `P-00${i}`,
        bedId: `B-${i}`,
        ward: 'ICU',
        deviceId: `DEV-00${i}`,
      });
    }

    await Promise.all(
      manager.listPatients().map((p) =>
        p.connectMqtt({
          brokerUrl: BROKER_URL,
          qos: 0,
          publishIntervalMs: 10,
        }),
      ),
    );

    // Tick the simulation 20 times manually via manager.advance
    for (let i = 0; i < 20; i++) {
      manager.advance(10);
    }

    // Give subscriber a brief moment to process incoming MQTT messages
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(registry.count).toBe(3);
    expect(registry.deviceIds.sort()).toEqual(['DEV-001', 'DEV-002', 'DEV-003']);

    for (let i = 1; i <= 3; i++) {
      const dev = registry.get(`DEV-00${i}`);
      expect(dev).toBeDefined();
      expect(dev?.patientId).toBe(`P-00${i}`);
      expect(dev?.online).toBe(true);
      expect(dev?.totalReceived).toBeGreaterThan(0);
    }

    await Promise.all(manager.listPatients().map((p) => p.disconnectMqtt()));
    await subscriber.stop();
  });

  it('Completion Test: Backend receives readings with 20% packet loss, measured loss is approx 20%', async () => {
    const registry = new DeviceRegistry();
    const subscriber = new MqttSubscriber({
      brokerUrl: BROKER_URL,
      registry,
      logger,
    });
    await subscriber.start();

    const manager = new SimulationManager({ speed: 1, tickIntervalMs: 5, seed: 123 });
    const count = 3;
    for (let i = 1; i <= count; i++) {
      manager.addPatient({
        patientId: `P-00${i}`,
        bedId: `B-${i}`,
        ward: 'ICU',
        deviceId: `DEV-00${i}`,
      });
    }

    await Promise.all(
      manager.listPatients().map((p) =>
        p.connectMqtt({
          brokerUrl: BROKER_URL,
          qos: 0,
          publishIntervalMs: 5,
          networkConfig: {
            lossRate: 0.2, // 20% packet loss
            fixedDelayMs: 0,
            jitterMs: 0,
            seed: 42 + p.seedValue,
          },
        }),
      ),
    );

    // Tick simulation 300 times to generate sequence of messages per patient
    for (let i = 0; i < 300; i++) {
      manager.advance(5);
    }

    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(registry.count).toBe(count);

    for (let i = 1; i <= count; i++) {
      const deviceId = `DEV-00${i}`;
      const state = registry.get(deviceId)!;
      expect(state).toBeDefined();
      expect(state.deviceId).toBe(deviceId);
      expect(state.patientId).toBe(`P-00${i}`);
      expect(state.totalReceived).toBeGreaterThan(150);

      const measuredLoss = registry.getMeasuredLossRate(deviceId);
      // Measured loss from sequence gaps should be approximately 20%
      expect(measuredLoss).toBeGreaterThan(0.14);
      expect(measuredLoss).toBeLessThan(0.26);
    }

    await Promise.all(manager.listPatients().map((p) => p.disconnectMqtt()));
    await subscriber.stop();
  });
});
