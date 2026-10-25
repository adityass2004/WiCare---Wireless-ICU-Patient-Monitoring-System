import type { PrismaClient } from '@prisma/client';
import type { VitalsMessage } from '@wicare/shared';
import type { SocketServer } from '../ws/socket-server';

export interface ThresholdConfig {
  measurement: string;
  minWarning: number | null;
  maxWarning: number | null;
  minCritical: number | null;
  maxCritical: number | null;
  unit: string;
}

export interface ActiveAlert {
  id: string;
  patientId: string;
  bedId: string;
  ward: string;
  deviceId: string;
  timestamp: string;
  measurement: string;
  value?: number | null;
  threshold?: string | null;
  severity: 'info' | 'warning' | 'critical';
  type: 'clinical' | 'malfunction' | 'stale' | 'ai';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  reason: string;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  lastSeenAt: string;
}

export interface EvaluatedReading {
  measurement: string;
  value: number;
  unit: string;
  severity: 'info' | 'warning' | 'critical';
  type: 'clinical' | 'malfunction';
  reason: string;
  thresholdStr: string;
  isBreached: boolean;
}

import type { AiEngineClient } from './ai-client.js';

export class AlertEngine {
  private thresholds = new Map<string, ThresholdConfig>();
  private activeAlerts = new Map<string, ActiveAlert>(); // Key: `${patientId}:${measurement}`
  private lastSeenDevices = new Map<string, { patientId: string; bedId: string; ward: string; lastSeen: number }>();
  private aiPatientScores = new Map<string, { riskScore: number; label: string; explanations: string[] }>();
  private staleTimer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaClient,
    private socketServer?: SocketServer,
    private aiClient?: AiEngineClient,
    private enableBackgroundAi: boolean = false,
  ) {}

  public async init() {
    await this.reloadThresholds();
    await this.loadActiveAlertsFromDb();
    this.startStaleDeviceCheck();
  }

  public stop() {
    if (this.staleTimer) {
      clearInterval(this.staleTimer);
      this.staleTimer = undefined;
    }
  }

  public async reloadThresholds() {
    let list = await this.prisma.alertThreshold.findMany();
    if (list.length === 0) {
      const defaultThresholds = [
        { measurement: 'heart_rate', minWarning: 55, maxWarning: 100, minCritical: 45, maxCritical: 130, unit: 'bpm' },
        { measurement: 'spo2', minWarning: 94, maxWarning: null, minCritical: 90, maxCritical: null, unit: '%' },
        { measurement: 'temperature', minWarning: 36.0, maxWarning: 37.8, minCritical: 35.0, maxCritical: 39.0, unit: '°C' },
        { measurement: 'respiratory_rate', minWarning: 12, maxWarning: 24, minCritical: 8, maxCritical: 30, unit: 'brpm' },
      ];
      for (const t of defaultThresholds) {
        await this.prisma.alertThreshold.upsert({
          where: { measurement: t.measurement },
          update: t,
          create: t,
        });
      }
      list = await this.prisma.alertThreshold.findMany();
    }

    this.thresholds.clear();
    for (const t of list) {
      this.thresholds.set(t.measurement, {
        measurement: t.measurement,
        minWarning: t.minWarning,
        maxWarning: t.maxWarning,
        minCritical: t.minCritical,
        maxCritical: t.maxCritical,
        unit: t.unit,
      });
    }
  }

  private async loadActiveAlertsFromDb() {
    const openAlerts = await this.prisma.alert.findMany({
      where: {
        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
      },
    });
    this.activeAlerts.clear();
    for (const a of openAlerts) {
      const key = `${a.patientId}:${a.measurement}`;
      this.activeAlerts.set(key, {
        id: a.id,
        patientId: a.patientId,
        bedId: a.bedId,
        ward: a.ward,
        deviceId: a.deviceId,
        timestamp: a.timestamp.toISOString(),
        measurement: a.measurement,
        value: a.value,
        threshold: a.threshold,
        severity: a.severity as ActiveAlert['severity'],
        type: a.type as ActiveAlert['type'],
        status: a.status as ActiveAlert['status'],
        reason: a.reason,
        acknowledgedBy: a.acknowledgedBy,
        acknowledgedAt: a.acknowledgedAt?.toISOString(),
        resolvedBy: a.resolvedBy,
        resolvedAt: a.resolvedAt?.toISOString(),
        lastSeenAt: a.lastSeenAt.toISOString(),
      });
    }
  }

  public static evaluateMeasurement(
    measurement: string,
    value: number,
    unit: string,
    quality: string | undefined,
    threshold: ThresholdConfig | undefined
  ): EvaluatedReading {
    // 1. Check Sensor Malfunction (flatline, noise, impossible values)
    if (quality === 'flatline' || quality === 'noise') {
      return {
        measurement,
        value,
        unit,
        severity: 'critical',
        type: 'malfunction',
        reason: `Sensor Malfunction: Signal ${quality} detected on ${measurement}`,
        thresholdStr: 'Quality check',
        isBreached: true,
      };
    }

    let isImpossible = false;
    if (measurement === 'heart_rate' && (value <= 0 || value > 250)) isImpossible = true;
    if (measurement === 'spo2' && (value < 30 || value > 100)) isImpossible = true;
    if (measurement === 'temperature' && (value < 25 || value > 45)) isImpossible = true;
    if (measurement === 'respiratory_rate' && (value < 0 || value > 60)) isImpossible = true;

    if (isImpossible) {
      return {
        measurement,
        value,
        unit,
        severity: 'critical',
        type: 'malfunction',
        reason: `Sensor Malfunction: Physically impossible ${measurement} value (${value} ${unit})`,
        thresholdStr: 'Range check',
        isBreached: true,
      };
    }

    if (!threshold) {
      return {
        measurement,
        value,
        unit,
        severity: 'info',
        type: 'clinical',
        reason: 'Normal',
        thresholdStr: 'None',
        isBreached: false,
      };
    }

    // 2. Critical Check
    if (threshold.minCritical !== null && value < threshold.minCritical) {
      return {
        measurement,
        value,
        unit,
        severity: 'critical',
        type: 'clinical',
        reason: `Critical Low ${measurement.replace('_', ' ')}: ${value} ${unit} (threshold: < ${threshold.minCritical} ${unit})`,
        thresholdStr: `< ${threshold.minCritical} ${unit}`,
        isBreached: true,
      };
    }
    if (threshold.maxCritical !== null && value > threshold.maxCritical) {
      return {
        measurement,
        value,
        unit,
        severity: 'critical',
        type: 'clinical',
        reason: `Critical High ${measurement.replace('_', ' ')}: ${value} ${unit} (threshold: > ${threshold.maxCritical} ${unit})`,
        thresholdStr: `> ${threshold.maxCritical} ${unit}`,
        isBreached: true,
      };
    }

    // 3. Warning Check
    if (threshold.minWarning !== null && value < threshold.minWarning) {
      return {
        measurement,
        value,
        unit,
        severity: 'warning',
        type: 'clinical',
        reason: `Warning Low ${measurement.replace('_', ' ')}: ${value} ${unit} (threshold: < ${threshold.minWarning} ${unit})`,
        thresholdStr: `< ${threshold.minWarning} ${unit}`,
        isBreached: true,
      };
    }
    if (threshold.maxWarning !== null && value > threshold.maxWarning) {
      return {
        measurement,
        value,
        unit,
        severity: 'warning',
        type: 'clinical',
        reason: `Warning High ${measurement.replace('_', ' ')}: ${value} ${unit} (threshold: > ${threshold.maxWarning} ${unit})`,
        thresholdStr: `> ${threshold.maxWarning} ${unit}`,
        isBreached: true,
      };
    }

    return {
      measurement,
      value,
      unit,
      severity: 'info',
      type: 'clinical',
      reason: 'Normal',
      thresholdStr: 'Normal range',
      isBreached: false,
    };
  }

  public async processReading(msg: VitalsMessage): Promise<ActiveAlert[]> {
    const { patientId, bedId, ward, deviceId, timestamp, vitals } = msg;

    // Track device last seen
    this.lastSeenDevices.set(deviceId, {
      patientId,
      bedId,
      ward,
      lastSeen: Date.now(),
    });

    // Auto-resolve any stale alert for this device
    await this.resolveStaleAlertIfAny(patientId);

    const affectedAlerts: ActiveAlert[] = [];

    const measurements: Array<{ name: string; valObj?: { value: number; unit: string; quality?: string } }> = [
      { name: 'heart_rate', valObj: vitals.heart_rate },
      { name: 'spo2', valObj: vitals.spo2 },
      { name: 'temperature', valObj: vitals.temperature },
      { name: 'respiratory_rate', valObj: vitals.respiratory_rate },
    ];

    for (const item of measurements) {
      if (!item.valObj) continue;

      const thresh = this.thresholds.get(item.name);
      const evalRes = AlertEngine.evaluateMeasurement(
        item.name,
        item.valObj.value,
        item.valObj.unit,
        item.valObj.quality,
        thresh
      );

      const key = `${patientId}:${item.name}`;
      const existing = this.activeAlerts.get(key);

      if (evalRes.isBreached) {
        if (!existing) {
          // Raise NEW alert
          const created = await this.createAlert({
            patientId,
            bedId,
            ward,
            deviceId,
            timestamp,
            measurement: item.name,
            value: evalRes.value,
            threshold: evalRes.thresholdStr,
            severity: evalRes.severity,
            type: evalRes.type,
            reason: evalRes.reason,
          });
          affectedAlerts.push(created);
        } else {
          // Deduplication: Update existing ongoing alert if severity escalated
          const needsUpdate = existing.severity !== evalRes.severity || existing.reason !== evalRes.reason;
          if (needsUpdate) {
            existing.severity = evalRes.severity;
            existing.reason = evalRes.reason;
            existing.value = evalRes.value;
            existing.threshold = evalRes.thresholdStr;
            existing.lastSeenAt = new Date().toISOString();

            await this.prisma.alert.update({
              where: { id: existing.id },
              data: {
                severity: existing.severity,
                reason: existing.reason,
                value: existing.value,
                threshold: existing.threshold,
                lastSeenAt: new Date(existing.lastSeenAt),
              },
            });

            this.socketServer?.emitAlertUpdated(existing, ward);
            affectedAlerts.push(existing);
          } else {
            existing.lastSeenAt = new Date().toISOString();
          }
        }
      } else {
        // Returned to normal -> Auto Resolve if open
        if (existing) {
          const resolved = await this.resolveAlert(existing.id, 'SYSTEM');
          if (resolved) {
            affectedAlerts.push(resolved);
          }
        }
      }
    }

    // Buffer reading for on-demand AI requests (in-memory buffer only, no network call)
    if (this.aiClient && vitals.heart_rate && vitals.spo2 && vitals.temperature && vitals.respiratory_rate) {
      this.aiClient.pushReading(patientId, {
        heart_rate: vitals.heart_rate.value,
        spo2: vitals.spo2.value,
        temperature: vitals.temperature.value,
        respiratory_rate: vitals.respiratory_rate.value,
      });

      // ONLY request AI predictive risk scores in background if explicitly enabled
      if (this.enableBackgroundAi) {
        const aiRes = await this.aiClient.getRiskScore(patientId);
      if (aiRes) {
        this.aiPatientScores.set(patientId, {
          riskScore: aiRes.riskScore,
          label: aiRes.label,
          explanations: aiRes.explanations,
        });

        const aiKey = `${patientId}:ai_predictive`;
        const existingAi = this.activeAlerts.get(aiKey);

        if (aiRes.riskScore >= 0.70) {
          const severity: 'warning' | 'critical' = aiRes.riskScore >= 0.85 ? 'critical' : 'warning';
          const topReason = aiRes.explanations[0] ?? 'Patient deterioration pattern detected';
          const reasonStr = `[AI PREDICTIVE] ${Math.round(aiRes.riskScore * 100)}% Risk (${aiRes.label.replace('_', ' ')}) - ${topReason}`;

          if (!existingAi) {
            const created = await this.createAlert({
              patientId,
              bedId,
              ward,
              deviceId,
              timestamp,
              measurement: 'ai_risk_score',
              value: aiRes.riskScore,
              threshold: '>= 0.70 Risk Score',
              severity,
              type: 'ai',
              reason: reasonStr,
            });
            affectedAlerts.push(created);
          } else {
            if (existingAi.severity !== severity || existingAi.reason !== reasonStr) {
              existingAi.severity = severity;
              existingAi.reason = reasonStr;
              existingAi.value = aiRes.riskScore;
              existingAi.lastSeenAt = new Date().toISOString();

              await this.prisma.alert.update({
                where: { id: existingAi.id },
                data: {
                  severity: existingAi.severity,
                  reason: existingAi.reason,
                  value: existingAi.value,
                  lastSeenAt: new Date(existingAi.lastSeenAt),
                },
              });

              this.socketServer?.emitAlertUpdated(existingAi, ward);
              affectedAlerts.push(existingAi);
            }
          }
        } else if (aiRes.riskScore < 0.60 && existingAi) {
          const resolved = await this.resolveAlert(existingAi.id, 'SYSTEM');
          if (resolved) affectedAlerts.push(resolved);
        }
      }
    }
  }

  return affectedAlerts;
}

  public getAiPatientScore(patientId: string) {
    return this.aiPatientScores.get(patientId);
  }

  public async evaluateOnDemandAiRiskScore(patientId: string) {
    if (!this.aiClient) return null;
    const aiRes = await this.aiClient.getRiskScore(patientId);
    if (aiRes) {
      this.aiPatientScores.set(patientId, {
        riskScore: aiRes.riskScore,
        label: aiRes.label,
        explanations: aiRes.explanations,
      });
    }
    return aiRes;
  }

  private async createAlert(params: {
    patientId: string;
    bedId: string;
    ward: string;
    deviceId: string;
    timestamp: string;
    measurement: string;
    value: number | null;
    threshold: string;
    severity: 'info' | 'warning' | 'critical';
    type: 'clinical' | 'malfunction' | 'stale' | 'ai';
    reason: string;
  }): Promise<ActiveAlert> {
    const dbAlert = await this.prisma.alert.create({
      data: {
        patientId: params.patientId,
        bedId: params.bedId,
        ward: params.ward,
        deviceId: params.deviceId,
        timestamp: new Date(params.timestamp),
        measurement: params.measurement,
        value: params.value,
        threshold: params.threshold,
        severity: params.severity,
        type: params.type,
        status: 'OPEN',
        reason: params.reason,
        lastSeenAt: new Date(),
      },
    });

    const active: ActiveAlert = {
      id: dbAlert.id,
      patientId: dbAlert.patientId,
      bedId: dbAlert.bedId,
      ward: dbAlert.ward,
      deviceId: dbAlert.deviceId,
      timestamp: dbAlert.timestamp.toISOString(),
      measurement: dbAlert.measurement,
      value: dbAlert.value,
      threshold: dbAlert.threshold,
      severity: dbAlert.severity as ActiveAlert['severity'],
      type: dbAlert.type as ActiveAlert['type'],
      status: 'OPEN',
      reason: dbAlert.reason,
      lastSeenAt: dbAlert.lastSeenAt.toISOString(),
    };

    const key = `${dbAlert.patientId}:${dbAlert.measurement}`;
    this.activeAlerts.set(key, active);

    this.socketServer?.emitAlertNew(active, params.ward);
    return active;
  }

  public async acknowledgeAlert(alertId: string, ackBy: string = 'User'): Promise<ActiveAlert | null> {
    const dbAlert = await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedBy: ackBy,
        acknowledgedAt: new Date(),
      },
    });

    const key = `${dbAlert.patientId}:${dbAlert.measurement}`;
    const cached = this.activeAlerts.get(key);
    const updated: ActiveAlert = {
      id: dbAlert.id,
      patientId: dbAlert.patientId,
      bedId: dbAlert.bedId,
      ward: dbAlert.ward,
      deviceId: dbAlert.deviceId,
      timestamp: dbAlert.timestamp.toISOString(),
      measurement: dbAlert.measurement,
      value: dbAlert.value,
      threshold: dbAlert.threshold,
      severity: dbAlert.severity as ActiveAlert['severity'],
      type: dbAlert.type as ActiveAlert['type'],
      status: 'ACKNOWLEDGED',
      reason: dbAlert.reason,
      acknowledgedBy: dbAlert.acknowledgedBy,
      acknowledgedAt: dbAlert.acknowledgedAt?.toISOString(),
      resolvedBy: dbAlert.resolvedBy,
      resolvedAt: dbAlert.resolvedAt?.toISOString(),
      lastSeenAt: dbAlert.lastSeenAt.toISOString(),
    };

    if (cached && cached.id === alertId) {
      this.activeAlerts.set(key, updated);
    }

    this.socketServer?.emitAlertUpdated(updated, dbAlert.ward);
    return updated;
  }

  public async resolveAlert(alertId: string, resolvedBy: string = 'User'): Promise<ActiveAlert | null> {
    const dbAlert = await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        status: 'RESOLVED',
        resolvedBy,
        resolvedAt: new Date(),
      },
    });

    const key = `${dbAlert.patientId}:${dbAlert.measurement}`;
    const cached = this.activeAlerts.get(key);
    if (cached && cached.id === alertId) {
      this.activeAlerts.delete(key);
    }

    const resolved: ActiveAlert = {
      id: dbAlert.id,
      patientId: dbAlert.patientId,
      bedId: dbAlert.bedId,
      ward: dbAlert.ward,
      deviceId: dbAlert.deviceId,
      timestamp: dbAlert.timestamp.toISOString(),
      measurement: dbAlert.measurement,
      value: dbAlert.value,
      threshold: dbAlert.threshold,
      severity: dbAlert.severity as ActiveAlert['severity'],
      type: dbAlert.type as ActiveAlert['type'],
      status: 'RESOLVED',
      reason: dbAlert.reason,
      acknowledgedBy: dbAlert.acknowledgedBy,
      acknowledgedAt: dbAlert.acknowledgedAt?.toISOString(),
      resolvedBy: dbAlert.resolvedBy,
      resolvedAt: dbAlert.resolvedAt?.toISOString(),
      lastSeenAt: dbAlert.lastSeenAt.toISOString(),
    };

    this.socketServer?.emitAlertResolved(resolved, dbAlert.ward);
    return resolved;
  }

  private async resolveStaleAlertIfAny(patientId: string) {
    const key = `${patientId}:device_stale`;
    const existing = this.activeAlerts.get(key);
    if (existing) {
      await this.resolveAlert(existing.id, 'SYSTEM');
    }
  }

  private startStaleDeviceCheck() {
    this.staleTimer = setInterval(async () => {
      const now = Date.now();
      const STALE_THRESHOLD_MS = 12000;

      for (const [deviceId, info] of this.lastSeenDevices.entries()) {
        if (now - info.lastSeen > STALE_THRESHOLD_MS) {
          const key = `${info.patientId}:device_stale`;
          if (!this.activeAlerts.has(key)) {
            await this.createAlert({
              patientId: info.patientId,
              bedId: info.bedId,
              ward: info.ward,
              deviceId,
              timestamp: new Date().toISOString(),
              measurement: 'device_stale',
              value: null,
              threshold: '> 12s no data',
              severity: 'warning',
              type: 'stale',
              reason: `Device ${deviceId} lost connection / no readings received for >12s`,
            });
          }
        }
      }
    }, 5000);
  }
}
