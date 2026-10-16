import { describe, it, expect } from 'vitest';
import { applyScenario, SCENARIOS } from '../src/scenarios.js';
import type { RNG } from '../src/scenarios.js';

const rng: RNG = {
  next: () => 0.5,
  gaussian: () => 0,
};

describe('scenario catalog', () => {
  it('exposes all six scenario types', () => {
    expect(Object.keys(SCENARIOS).sort()).toEqual(
      ['stable', 'rising_hr', 'falling_spo2', 'deterioration', 'sudden_change', 'sensor_malfunction'].sort(),
    );
  });

  it('stable applies no deltas and ok quality', () => {
    const e = applyScenario('stable', { elapsedMs: 1000, rng });
    expect(e.deltas).toEqual({});
    expect(e.quality).toBe('ok');
  });

  it('falling_spo2 delta grows more negative over time', () => {
    const early = applyScenario('falling_spo2', { elapsedMs: 60000, rng }).deltas.spo2 ?? 0;
    const late = applyScenario('falling_spo2', { elapsedMs: 600000, rng }).deltas.spo2 ?? 0;
    expect(late).toBeLessThan(early);
  });

  it('sensor_malfunction returns missing in the 30-40s window', () => {
    const e = applyScenario('sensor_malfunction', { elapsedMs: 35000, rng });
    expect(e.quality).toBe('missing');
  });
});
