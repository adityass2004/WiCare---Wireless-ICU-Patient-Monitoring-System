import { describe, it, expect } from 'vitest';
import {
  VitalsMessageSchema,
  StatusMessageSchema,
  parseTopic,
  vitalsTopic,
  statusTopic,
} from '@wicare/shared';

describe('MQTT schema validation', () => {
  it('accepts a well-formed vitals message', () => {
    const msg = {
      schemaVersion: 1,
      deviceId: 'DEV-001',
      patientId: 'P-001',
      bedId: 'B-1',
      ward: 'ICU',
      seq: 0,
      timestamp: new Date().toISOString(),
      vitals: {
        heart_rate: { value: 72, unit: 'bpm', quality: 'ok' },
        spo2: { value: 98, unit: '%', quality: 'ok' },
      },
      qos: 0,
    };
    expect(VitalsMessageSchema.safeParse(msg).success).toBe(true);
  });

  it('rejects a message with wrong schema version', () => {
    const msg = {
      schemaVersion: 99,
      deviceId: 'DEV-001',
      patientId: 'P-001',
      bedId: 'B-1',
      ward: 'ICU',
      seq: 0,
      timestamp: new Date().toISOString(),
      vitals: {},
    };
    expect(VitalsMessageSchema.safeParse(msg).success).toBe(false);
  });

  it('rejects a message missing required fields', () => {
    const msg = { schemaVersion: 1, deviceId: 'DEV-001' };
    expect(VitalsMessageSchema.safeParse(msg).success).toBe(false);
  });

  it('rejects negative sequence numbers', () => {
    const msg = {
      schemaVersion: 1,
      deviceId: 'DEV-001',
      patientId: 'P-001',
      bedId: 'B-1',
      ward: 'ICU',
      seq: -1,
      timestamp: new Date().toISOString(),
      vitals: {},
    };
    expect(VitalsMessageSchema.safeParse(msg).success).toBe(false);
  });

  it('accepts a well-formed status message', () => {
    const msg = {
      schemaVersion: 1,
      deviceId: 'DEV-001',
      patientId: 'P-001',
      bedId: 'B-1',
      ward: 'ICU',
      status: 'online',
      timestamp: new Date().toISOString(),
    };
    expect(StatusMessageSchema.safeParse(msg).success).toBe(true);
  });
});

describe('topic scheme', () => {
  it('builds and parses vitals topics', () => {
    const topic = vitalsTopic('ICU', 'B-1', 'DEV-001');
    expect(topic).toBe('wicare/ICU/B-1/DEV-001/vitals');
    const parsed = parseTopic(topic);
    expect(parsed).toEqual({ ward: 'ICU', bed: 'B-1', deviceId: 'DEV-001', kind: 'vitals' });
  });

  it('builds and parses status topics', () => {
    const topic = statusTopic('ICU', 'B-1', 'DEV-001');
    expect(topic).toBe('wicare/ICU/B-1/DEV-001/status');
    expect(parseTopic(topic)?.kind).toBe('status');
  });

  it('returns null for malformed topics', () => {
    expect(parseTopic('other/ICU/B-1/DEV-001/vitals')).toBeNull();
    expect(parseTopic('wicare/ICU/B-1')).toBeNull();
  });
});
