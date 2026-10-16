import type { ScenarioType, VitalReading } from '@wicare/shared';

export interface TransmissionContext {
  scenario: ScenarioType;
  latestReadings: VitalReading[];
  measuredLossRate: number;
  baseIntervalMs: number;
}

export interface TransmissionStrategy {
  readonly name: string;
  calculateInterval(ctx: TransmissionContext): number;
}

export class FixedRateStrategy implements TransmissionStrategy {
  readonly name = 'fixed';

  calculateInterval(ctx: TransmissionContext): number {
    return ctx.baseIntervalMs;
  }
}

export class AdaptiveRiskNetworkStrategy implements TransmissionStrategy {
  readonly name = 'adaptive';

  calculateInterval(ctx: TransmissionContext): number {
    let interval = ctx.baseIntervalMs;

    // 1. Clinical Risk Adaptation
    const isUrgentScenario =
      ctx.scenario === 'falling_spo2' ||
      ctx.scenario === 'rising_hr' ||
      ctx.scenario === 'deterioration' ||
      ctx.scenario === 'sudden_change';

    const spo2Reading = ctx.latestReadings.find((r) => r.type === 'spo2');
    const hrReading = ctx.latestReadings.find((r) => r.type === 'heart_rate');

    const isAbnormalVitals =
      (spo2Reading && spo2Reading.value < 94) ||
      (hrReading && (hrReading.value > 110 || hrReading.value < 55));

    if (isUrgentScenario || isAbnormalVitals) {
      // High clinical risk -> transmit much more frequently (300ms)
      interval = Math.min(interval, 300);
    }

    // 2. Network Congestion Adaptation
    // High loss rate (> 15%) indicates channel congestion -> back off interval to reduce contention
    if (ctx.measuredLossRate > 0.15) {
      const congestionMultiplier = 1.0 + (ctx.measuredLossRate - 0.15) * 3.0;
      interval = Math.round(interval * congestionMultiplier);
    }

    // Bounds [200ms, 3000ms]
    return Math.max(200, Math.min(3000, interval));
  }
}
