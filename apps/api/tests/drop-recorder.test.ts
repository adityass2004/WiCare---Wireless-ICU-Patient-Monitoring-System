import { describe, it, expect, beforeEach } from 'vitest';
import { MqttDropRecorder } from '../src/mqtt/drop-recorder.js';
import Fastify from 'fastify';
import { registerDropRoutes } from '../src/routes/drops.js';
import { DeviceRegistry } from '../src/mqtt/device-registry.js';

describe('MqttDropRecorder Unit & Route Tests', () => {
  let recorder: MqttDropRecorder;
  let registry: DeviceRegistry;

  beforeEach(() => {
    recorder = new MqttDropRecorder();
    registry = new DeviceRegistry();
  });

  it('records drop events and updates total packets lost', () => {
    const drop = recorder.recordDrop({
      timestamp: new Date().toISOString(),
      deviceId: 'DEV-001',
      patientId: 'P-001',
      bedId: 'B-1',
      ward: 'ICU',
      expectedSeq: 10,
      receivedSeq: 15,
      droppedCount: 4,
      aoiMs: 120,
      qos: 1,
    });

    expect(drop.id).toBeDefined();
    expect(drop.droppedCount).toBe(4);
    expect(drop.recordingSessionId).toBeNull();

    const stats = recorder.getStats(1, 0.05);
    expect(stats.totalDropsDetected).toBe(1);
    expect(stats.totalPacketsLost).toBe(4);
    expect(stats.averageLossRatePercent).toBe(5);
    expect(stats.isRecording).toBe(false);

    const recent = recorder.getRecentDrops();
    expect(recent).toHaveLength(1);
    expect(recent[0].bedId).toBe('B-1');
  });

  it('manages recording sessions and tags incoming drops', () => {
    const session = recorder.startRecording('Stress Test Alpha');
    expect(session.name).toBe('Stress Test Alpha');
    expect(session.isActive).toBe(true);

    recorder.recordDrop({
      timestamp: new Date().toISOString(),
      deviceId: 'DEV-002',
      patientId: 'P-002',
      bedId: 'B-2',
      ward: 'ICU',
      expectedSeq: 100,
      receivedSeq: 103,
      droppedCount: 2,
      aoiMs: 80,
      qos: 0,
    });

    const recorded = recorder.getRecordedDrops(session.id);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].recordingSessionId).toBe(session.id);
    expect(session.dropsCount).toBe(1);
    expect(session.totalPacketsLost).toBe(2);

    const stopped = recorder.stopRecording();
    expect(stopped).not.toBeNull();
    expect(stopped?.isActive).toBe(false);
    expect(stopped?.stoppedAt).toBeDefined();
  });

  it('integrates with Fastify route endpoints', async () => {
    const app = Fastify();
    await registerDropRoutes(app, {
      dropRecorder: recorder,
      registry,
    });

    // 1. Initial drops endpoint
    const res1 = await app.inject({
      method: 'GET',
      url: '/api/network/drops',
    });
    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.payload);
    expect(body1.status).toBe('ok');
    expect(body1.stats.totalDropsDetected).toBe(0);

    // 2. Start session
    const resStart = await app.inject({
      method: 'POST',
      url: '/api/network/recorder/start',
      payload: { name: 'ICU Ward Morning Run' },
    });
    expect(resStart.statusCode).toBe(200);
    const bodyStart = JSON.parse(resStart.payload);
    expect(bodyStart.success).toBe(true);
    expect(bodyStart.session.name).toBe('ICU Ward Morning Run');

    // Simulate drop during recording
    recorder.recordDrop({
      timestamp: new Date().toISOString(),
      deviceId: 'DEV-001',
      patientId: 'P-001',
      bedId: 'B-1',
      ward: 'ICU',
      expectedSeq: 50,
      receivedSeq: 55,
      droppedCount: 4,
      aoiMs: 65,
      qos: 0,
    });

    // 3. Query recorded events
    const resEvents = await app.inject({
      method: 'GET',
      url: '/api/network/recorder/events?bedId=B-1',
    });
    expect(resEvents.statusCode).toBe(200);
    const bodyEvents = JSON.parse(resEvents.payload);
    expect(bodyEvents.count).toBe(1);
    expect(bodyEvents.events[0].droppedCount).toBe(4);

    // 4. Stop session
    const resStop = await app.inject({
      method: 'POST',
      url: '/api/network/recorder/stop',
    });
    expect(resStop.statusCode).toBe(200);
    const bodyStop = JSON.parse(resStop.payload);
    expect(bodyStop.session.isActive).toBe(false);

    // 5. Clear events
    const resClear = await app.inject({
      method: 'DELETE',
      url: '/api/network/recorder/events',
    });
    expect(resClear.statusCode).toBe(200);
    expect(recorder.getRecentDrops()).toHaveLength(0);
  });
});
