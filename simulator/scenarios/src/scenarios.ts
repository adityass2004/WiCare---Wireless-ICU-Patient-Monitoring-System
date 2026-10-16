import type { ScenarioType, VitalQuality, VitalType } from '@wicare/shared';

export interface RNG {
  next(): number;
  gaussian(mean?: number, std?: number): number;
}

export interface ScenarioContext {
  elapsedMs: number;
  rng: RNG;
}

export interface ScenarioEffect {
  deltas: Partial<Record<VitalType, number>>;
  quality: VitalQuality;
  ecgMultiplier: number;
}

const DEFAULT_EFFECT: ScenarioEffect = {
  deltas: {},
  quality: 'ok',
  ecgMultiplier: 1,
};

export type ScenarioFn = (ctx: ScenarioContext) => ScenarioEffect;

export const SCENARIOS: Record<ScenarioType, ScenarioFn> = {
  stable: () => ({ ...DEFAULT_EFFECT }),

  rising_hr: ({ elapsedMs }) => {
    const minutes = elapsedMs / 60000;
    const delta = Math.min(68, 32 + minutes * 3.6);
    return { deltas: { heart_rate: delta }, quality: 'ok', ecgMultiplier: 1 };
  },

  falling_spo2: ({ elapsedMs }) => {
    const minutes = elapsedMs / 60000;
    const delta = -Math.min(28, 6 + minutes * 2.2);
    return { deltas: { spo2: delta }, quality: 'ok', ecgMultiplier: 1 };
  },

  deterioration: ({ elapsedMs }) => {
    const minutes = elapsedMs / 60000;
    return {
      deltas: {
        heart_rate: Math.min(65, 32 + minutes * 3.3),
        spo2: -Math.min(22, 6 + minutes * 1.6),
        respiratory_rate: Math.min(18, 9 + minutes * 0.9),
        temperature: Math.min(3.0, 1.3 + minutes * 0.17),
      },
      quality: 'ok',
      ecgMultiplier: 1,
    };
  },

  sudden_change: ({ elapsedMs }) => {
    if (elapsedMs >= 30000) {
      return { deltas: { heart_rate: 80 }, quality: 'ok', ecgMultiplier: 1 };
    }
    return { ...DEFAULT_EFFECT };
  },

  sensor_malfunction: ({ elapsedMs }) => {
    const phase = Math.floor(elapsedMs / 10000) % 4;
    switch (phase) {
      case 0:
        return { deltas: {}, quality: 'ok', ecgMultiplier: 1 };
      case 1:
        return { deltas: {}, quality: 'noise', ecgMultiplier: 1 };
      case 2:
        return { deltas: {}, quality: 'flatline', ecgMultiplier: 0 };
      default:
        return { deltas: {}, quality: 'missing', ecgMultiplier: 0 };
    }
  },
};

export function applyScenario(type: ScenarioType, ctx: ScenarioContext): ScenarioEffect {
  return SCENARIOS[type](ctx);
}
