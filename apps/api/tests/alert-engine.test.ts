import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AlertEngine, type ThresholdConfig } from '../src/alerts/alert-engine';
import { PrismaClient } from '@prisma/client';
import type { VitalsMessage } from '@wicare/shared';
import { env } from '../src/env';

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('file:')) {
  process.env.DATABASE_URL = env.DATABASE_URL;
}

describe('AlertEngine Unit & Integration Tests', () => {
  let prisma: PrismaClient;
  let alertEngine: AlertEngine;

  const mockThresholds = new Map<string, ThresholdConfig>([
    [
      'heart_rate',
      { measurement: 'heart_rate', minWarning: 55, maxWarning: 100, minCritical: 45, maxCritical: 130, unit: 'bpm' },
    ],
    [
      'spo2',
      { measurement: 'spo2', minWarning: 94, maxWarning: null, minCritical: 90, maxCritical: null, unit: '%' },
    ],
  ]);

  beforeEach(async () => {
    prisma = new PrismaClient();
    // Clean alerts for testing
    await prisma.alert.deleteMany();
    await prisma.alertThreshold.deleteMany();

    // Insert standard test thresholds
    for (const [, t] of mockThresholds) {
      await prisma.alertThreshold.create({ data: t });
    }

    alertEngine = new AlertEngine(prisma);
    await alertEngine.init();
  });

  afterEach(async () => {
    if (alertEngine) alertEngine.stop();
    if (prisma) {
      await prisma.alert.deleteMany();
      await prisma.alertThreshold.deleteMany();
      await prisma.$disconnect();
    }
  });

  it('evaluates measurement thresholds correctly (pure evaluation)', () => {
    // SpO2 warning breach (92% < 94%)
    const spo2Warn = AlertEngine.evaluateMeasurement('spo2', 92, '%', 'ok', mockThresholds.get('spo2'));
    expect(spo2Warn.isBreached).toBe(true);
    expect(spo2Warn.severity).toBe('warning');
    expect(spo2Warn.type).toBe('clinical');

    // SpO2 critical breach (88% < 90%)
    const spo2Crit = AlertEngine.evaluateMeasurement('spo2', 88, '%', 'ok', mockThresholds.get('spo2'));
    expect(spo2Crit.isBreached).toBe(true);
    expect(spo2Crit.severity).toBe('critical');
    expect(spo2Crit.type).toBe('clinical');
    expect(spo2Crit.reason).toContain('Critical Low spo2: 88 %');

    // Heart rate normal (75 bpm)
    const hrNormal = AlertEngine.evaluateMeasurement('heart_rate', 75, 'bpm', 'ok', mockThresholds.get('heart_rate'));
    expect(hrNormal.isBreached).toBe(false);
  });

  it('classifies sensor malfunction flatline and impossible values separately from clinical alerts', () => {
    // Flatline quality
    const flatlineRes = AlertEngine.evaluateMeasurement('spo2', 98, '%', 'flatline', mockThresholds.get('spo2'));
    expect(flatlineRes.isBreached).toBe(true);
    expect(flatlineRes.type).toBe('malfunction');
    expect(flatlineRes.reason).toContain('Sensor Malfunction: Signal flatline');

    // Impossible SpO2 value (15%)
    const impossibleSpo2 = AlertEngine.evaluateMeasurement('spo2', 15, '%', 'ok', mockThresholds.get('spo2'));
    expect(impossibleSpo2.isBreached).toBe(true);
    expect(impossibleSpo2.type).toBe('malfunction');
    expect(impossibleSpo2.reason).toContain('Physically impossible spo2 value');
  });

  it('creates exactly ONE open alert for consecutive breaching samples (deduplication)', async () => {
    const msg: VitalsMessage = {
      schemaVersion: 1,
      deviceId: 'DEV-TEST-01',
      patientId: 'P-TEST-01',
      bedId: 'B-01',
      ward: 'ICU',
      seq: 1,
      timestamp: new Date().toISOString(),
      vitals: {
        spo2: { value: 88, unit: '%', quality: 'ok' },
      },
    };

    // First sample -> creates alert
    const alerts1 = await alertEngine.processReading(msg);
    expect(alerts1.length).toBe(1);
    expect(alerts1[0].status).toBe('OPEN');
    expect(alerts1[0].severity).toBe('critical');

    // Second sample -> deduplicated, does NOT create a second DB alert
    msg.seq = 2;
    msg.timestamp = new Date().toISOString();
    const alerts2 = await alertEngine.processReading(msg);
    expect(alerts2.length).toBe(0); // 0 new/updated alerts

    const allInDb = await prisma.alert.findMany({ where: { patientId: 'P-TEST-01' } });
    expect(allInDb.length).toBe(1);
  });

  it('automatically resolves open alert when vitals return to normal', async () => {
    const msgBreaching: VitalsMessage = {
      schemaVersion: 1,
      deviceId: 'DEV-TEST-02',
      patientId: 'P-TEST-02',
      bedId: 'B-02',
      ward: 'ICU',
      seq: 1,
      timestamp: new Date().toISOString(),
      vitals: {
        spo2: { value: 85, unit: '%', quality: 'ok' },
      },
    };

    await alertEngine.processReading(msgBreaching);

    const openDb = await prisma.alert.findMany({ where: { patientId: 'P-TEST-02', status: 'OPEN' } });
    expect(openDb.length).toBe(1);

    // Vitals recover to 98%
    const msgNormal: VitalsMessage = {
      ...msgBreaching,
      seq: 2,
      vitals: {
        spo2: { value: 98, unit: '%', quality: 'ok' },
      },
    };

    const resolvedAlerts = await alertEngine.processReading(msgNormal);
    expect(resolvedAlerts.length).toBe(1);
    expect(resolvedAlerts[0].status).toBe('RESOLVED');
    expect(resolvedAlerts[0].resolvedBy).toBe('SYSTEM');

    const checkDb = await prisma.alert.findUnique({ where: { id: openDb[0].id } });
    expect(checkDb?.status).toBe('RESOLVED');
  });

  it('supports acknowledgment and manual resolution lifecycle', async () => {
    const msg: VitalsMessage = {
      schemaVersion: 1,
      deviceId: 'DEV-TEST-03',
      patientId: 'P-TEST-03',
      bedId: 'B-03',
      ward: 'ICU',
      seq: 1,
      timestamp: new Date().toISOString(),
      vitals: {
        heart_rate: { value: 145, unit: 'bpm', quality: 'ok' },
      },
    };

    const created = await alertEngine.processReading(msg);
    const alertId = created[0].id;

    // Acknowledge
    const acked = await alertEngine.acknowledgeAlert(alertId, 'Dr. Alice');
    expect(acked?.status).toBe('ACKNOWLEDGED');
    expect(acked?.acknowledgedBy).toBe('Dr. Alice');

    // Resolve
    const resolved = await alertEngine.resolveAlert(alertId, 'Nurse Bob');
    expect(resolved?.status).toBe('RESOLVED');
    expect(resolved?.resolvedBy).toBe('Nurse Bob');
  });
});
