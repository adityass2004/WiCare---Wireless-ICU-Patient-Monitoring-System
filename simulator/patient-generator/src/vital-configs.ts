import type { VitalType } from '@wicare/shared';

export interface VitalConfig {
  baseline: number;
  min: number;
  max: number;
  unit: string;
  noiseStd: number;
  walkStep: number;
  walkDecay: number;
}

export const VITAL_CONFIGS: Record<VitalType, VitalConfig> = {
  heart_rate: {
    baseline: 72,
    min: 30,
    max: 200,
    unit: 'bpm',
    noiseStd: 1.2,
    walkStep: 0.6,
    walkDecay: 0.985,
  },
  spo2: {
    baseline: 98,
    min: 60,
    max: 100,
    unit: '%',
    noiseStd: 0.3,
    walkStep: 0.15,
    walkDecay: 0.99,
  },
  temperature: {
    baseline: 36.8,
    min: 34,
    max: 42,
    unit: 'C',
    noiseStd: 0.08,
    walkStep: 0.05,
    walkDecay: 0.99,
  },
  respiratory_rate: {
    baseline: 16,
    min: 4,
    max: 45,
    unit: 'brpm',
    noiseStd: 0.6,
    walkStep: 0.3,
    walkDecay: 0.985,
  },
  ecg: {
    baseline: 0,
    min: -2,
    max: 2,
    unit: 'mV',
    noiseStd: 0.02,
    walkStep: 0,
    walkDecay: 1,
  },
};

export const SLOW_VITALS: VitalType[] = [
  'heart_rate',
  'spo2',
  'temperature',
  'respiratory_rate',
];
