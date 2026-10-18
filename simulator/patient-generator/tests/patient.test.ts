import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../src/rng.js';
import { ecgSample } from '../src/ecg.js';
import { VITAL_CONFIGS } from '../src/vital-configs.js';
import { VirtualPatient } from '../src/patient.js';
import { SimulationManager } from '../src/manager.js';
import { FixedRateStrategy, AdaptiveRiskNetworkStrategy } from '../src/transmission-strategy.js';
import type { PatientIdentity } from '@wicare/shared';

function makeIdentity(n: number): PatientIdentity {
  const id = `P-${String(n).padStart(3, '0')}`;
  return {
    patientId: id,
    bedId: `B-${n}`,
    ward: 'ICU',
    deviceId: `DEV-${String(n).padStart(3, '0')}`,
  };
}

describe('SeededRNG', () => {
  it('produces identical sequences for the same seed', () => {
    const a = new SeededRNG(12345);
    const b = new SeededRNG(12345);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('gaussian returns values within a reasonable band', () => {
    const rng = new SeededRNG(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.gaussian(0, 1);
      expect(v).toBeGreaterThan(-5);
      expect(v).toBeLessThan(5);
    }
  });
});

describe('ecg waveform', () => {
  it('R-wave peak is the maximum near phase 0.2', () => {
    const peak = ecgSample(0.2);
    expect(peak).toBeGreaterThan(1.0);
  });

  it('is flat at zero between beats away from complexes', () => {
    expect(ecgSample(0.7)).toBeCloseTo(0, 1);
  });
});

describe('VirtualPatient ranges', () => {
  it('keeps all slow vitals within physiological ranges over many ticks', () => {
    const p = new VirtualPatient(makeIdentity(1), { seed: 111 });
    p.start();
    for (let i = 0; i < 500; i++) {
      const readings = p.tick(1000);
      for (const r of readings) {
        const cfg = VITAL_CONFIGS[r.type];
        expect(r.value).toBeGreaterThanOrEqual(cfg.min);
        expect(r.value).toBeLessThanOrEqual(cfg.max);
      }
    }
  });

  it('stable scenario keeps HR near baseline', () => {
    const p = new VirtualPatient(makeIdentity(1), { seed: 222 });
    p.start();
    let maxHr = 0;
    let minHr = 999;
    for (let i = 0; i < 100; i++) {
      const readings = p.tick(1000);
      const hr = readings.find((r) => r.type === 'heart_rate')!;
      maxHr = Math.max(maxHr, hr.value);
      minHr = Math.min(minHr, hr.value);
    }
    expect(maxHr).toBeLessThan(VITAL_CONFIGS.heart_rate.baseline + 15);
    expect(minHr).toBeGreaterThan(VITAL_CONFIGS.heart_rate.baseline - 15);
  });
});

describe('scenario transitions', () => {
  it('falling_spo2 drives SpO2 downward over time', () => {
    const p = new VirtualPatient(makeIdentity(1), { seed: 333 });
    p.start();
    p.setScenario('falling_spo2');
    const early = p.tick(1000).find((r) => r.type === 'spo2')!.value;
    for (let i = 0; i < 600; i++) p.tick(1000);
    const late = p.getLatest().spo2!.value;
    expect(late).toBeLessThan(early - 15);
  });

  it('rising_hr drives heart rate upward over time', () => {
    const p = new VirtualPatient(makeIdentity(1), { seed: 444 });
    p.start();
    p.setScenario('rising_hr');
    const early = p.tick(1000).find((r) => r.type === 'heart_rate')!.value;
    for (let i = 0; i < 600; i++) p.tick(1000);
    const late = p.getLatest().heart_rate!.value;
    expect(late).toBeGreaterThan(early + 25);
  });

  it('sudden_change jumps HR only after 30s', () => {
    const p = new VirtualPatient(makeIdentity(1), { seed: 555 });
    p.start();
    p.setScenario('sudden_change');
    const before = p.tick(29000).find((r) => r.type === 'heart_rate')!.value;
    const after = p.tick(2000).find((r) => r.type === 'heart_rate')!.value;
    expect(after).toBeGreaterThan(before + 40);
  });

  it('sensor_malfunction cycles through quality states', () => {
    const p = new VirtualPatient(makeIdentity(1), { seed: 666 });
    p.start();
    p.setScenario('sensor_malfunction');
    const qualities = new Set<string>();
    for (let i = 0; i < 45; i++) {
      const readings = p.tick(1000);
      for (const r of readings) qualities.add(r.quality);
    }
    expect(qualities.has('ok')).toBe(true);
    expect(qualities.has('noise')).toBe(true);
    expect(qualities.has('flatline')).toBe(true);
    expect(qualities.has('missing')).toBe(true);
  });

  it('deterioration worsens multiple vitals together', () => {
    const p = new VirtualPatient(makeIdentity(1), { seed: 777 });
    p.start();
    p.setScenario('deterioration');
    const hrEarly = p.tick(1000).find((r) => r.type === 'heart_rate')!.value;
    const spo2Early = p.getLatest().spo2!.value;
    for (let i = 0; i < 300; i++) p.tick(1000);
    const hrLate = p.getLatest().heart_rate!.value;
    const spo2Late = p.getLatest().spo2!.value;
    expect(hrLate).toBeGreaterThan(hrEarly);
    expect(spo2Late).toBeLessThan(spo2Early);
  });
});

describe('patient controls', () => {
  it('manual override fixes a vital regardless of scenario', () => {
    const p = new VirtualPatient(makeIdentity(1), { seed: 888 });
    p.start();
    p.setScenario('falling_spo2');
    p.setOverride('spo2', 99);
    for (let i = 0; i < 20; i++) p.tick(1000);
    expect(p.getLatest().spo2!.value).toBe(99);
    p.clearOverride('spo2');
    for (let i = 0; i < 20; i++) p.tick(1000);
    expect(p.getLatest().spo2!.value).not.toBe(99);
  });

  it('pause stops value changes; reset returns to baseline', () => {
    const p = new VirtualPatient(makeIdentity(1), { seed: 999 });
    p.start();
    p.setScenario('rising_hr');
    for (let i = 0; i < 100; i++) p.tick(1000);
    const elevated = p.getLatest().heart_rate!.value;
    expect(elevated).toBeGreaterThan(VITAL_CONFIGS.heart_rate.baseline + 5);
    p.pause();
    const frozen = p.getLatest().heart_rate!.value;
    p.tick(1000);
    expect(p.getLatest().heart_rate!.value).toBe(frozen);
    p.reset();
    p.start();
    const resetVal = p.tick(1000).find((r) => r.type === 'heart_rate')!.value;
    expect(Math.abs(resetVal - VITAL_CONFIGS.heart_rate.baseline)).toBeLessThan(5);
  });
});

describe('patient isolation', () => {
  it('changing one patient scenario does not affect others', () => {
    const mgr = new SimulationManager({ seed: 1000 });
    const p1 = mgr.addPatient(makeIdentity(1));
    const p2 = mgr.addPatient(makeIdentity(2));
    const p3 = mgr.addPatient(makeIdentity(3));

    p1.setScenario('falling_spo2');
    for (let i = 0; i < 600; i++) mgr.advance(1000);

    const p1Spo2 = p1.getLatest().spo2!.value;
    const p2Spo2 = p2.getLatest().spo2!.value;
    const p3Spo2 = p3.getLatest().spo2!.value;

    expect(p1Spo2).toBeLessThan(90);
    expect(p2Spo2).toBeGreaterThan(94);
    expect(p3Spo2).toBeGreaterThan(94);
  });

  it('manual override on one patient leaves others untouched', () => {
    const mgr = new SimulationManager({ seed: 2000 });
    const a = mgr.addPatient(makeIdentity(1));
    const b = mgr.addPatient(makeIdentity(2));
    a.setOverride('heart_rate', 180);
    for (let i = 0; i < 10; i++) mgr.advance(1000);
    expect(a.getLatest().heart_rate!.value).toBe(180);
    expect(b.getLatest().heart_rate!.value).not.toBe(180);
  });

  it('supports up to 50 patients', () => {
    const mgr = new SimulationManager({ seed: 3000 });
    for (let i = 1; i <= 50; i++) mgr.addPatient(makeIdentity(i));
    expect(mgr.patientCount).toBe(50);
    expect(() => mgr.addPatient(makeIdentity(51))).toThrow();
  });
});

describe('seeded repeatability', () => {
  it('identical seeds produce identical reading sequences', () => {
    const a = new VirtualPatient(makeIdentity(1), { seed: 4242 });
    const b = new VirtualPatient(makeIdentity(1), { seed: 4242 });
    a.start();
    b.start();
    for (let i = 0; i < 60; i++) {
      const ra = a.tick(1000);
      const rb = b.tick(1000);
      expect(ra.map((r) => r.value)).toEqual(rb.map((r) => r.value));
      expect(ra.map((r) => r.quality)).toEqual(rb.map((r) => r.quality));
    }
  });

  it('manager-derived patients are repeatable across manager instances', () => {
    const makeReadings = () => {
      const mgr = new SimulationManager({ seed: 5555 });
      mgr.addPatient(makeIdentity(1));
      mgr.addPatient(makeIdentity(2));
      for (let i = 0; i < 30; i++) mgr.advance(1000);
      return mgr
        .listPatients()
        .map((p) => p.getLatestReadings().map((r) => r.value));
    };
    expect(makeReadings()).toEqual(makeReadings());
  });
});

describe('clock & speed', () => {
  it('advance drives time deterministically for tests', () => {
    const mgr = new SimulationManager({ seed: 9000 });
    const p = mgr.addPatient(makeIdentity(1));
    expect(p.getLatest().heart_rate).toBeUndefined();
    mgr.advance(1000);
    expect(p.getLatest().heart_rate).toBeDefined();
  });

  it('setSpeed changes clock speed', () => {
    const mgr = new SimulationManager({ speed: 1, seed: 9001 });
    expect(mgr.speed).toBe(1);
    mgr.setSpeed(5);
    expect(mgr.speed).toBe(5);
  });
});

describe('transmission strategy & dispatch tracking', () => {
  it('tracks messagesDispatched correctly when publish interval elapses', () => {
    const p = new VirtualPatient(makeIdentity(1), { seed: 100 });
    p.start();
    expect(p.messagesDispatched).toBe(0);

    // 9 ticks of 100ms = 900ms (accumulator < 1000ms target)
    for (let i = 0; i < 9; i++) p.tick(100);
    expect(p.messagesDispatched).toBe(0);

    // 10th tick = 1000ms -> triggers publishMessage
    p.tick(100);
    expect(p.messagesDispatched).toBe(1);

    // 10 more ticks = 2000ms -> triggers 2nd publishMessage
    for (let i = 0; i < 10; i++) p.tick(100);
    expect(p.messagesDispatched).toBe(2);
  });

  it('FixedRateStrategy returns constant base interval', () => {
    const strat = new FixedRateStrategy();
    expect(strat.calculateInterval({
      scenario: 'stable',
      latestReadings: [],
      measuredLossRate: 0,
      baseIntervalMs: 1000,
    })).toBe(1000);

    expect(strat.calculateInterval({
      scenario: 'falling_spo2',
      latestReadings: [],
      measuredLossRate: 0.3,
      baseIntervalMs: 1000,
    })).toBe(1000);
  });

  it('AdaptiveRiskNetworkStrategy accelerates on clinical deterioration and backs off on congestion', () => {
    const strat = new AdaptiveRiskNetworkStrategy();
    const now = new Date().toISOString();

    // Normal stable condition with 0 loss -> base interval
    const normalInterval = strat.calculateInterval({
      scenario: 'stable',
      latestReadings: [{ type: 'spo2', value: 98, unit: '%', quality: 'ok', deviceId: 'DEV-001', sequence: 0, timestamp: now }],
      measuredLossRate: 0,
      baseIntervalMs: 1000,
    });
    expect(normalInterval).toBe(1000);

    // Acute deterioration (falling_spo2) -> accelerates to 300ms
    const acuteInterval = strat.calculateInterval({
      scenario: 'falling_spo2',
      latestReadings: [{ type: 'spo2', value: 85, unit: '%', quality: 'ok', deviceId: 'DEV-001', sequence: 1, timestamp: now }],
      measuredLossRate: 0,
      baseIntervalMs: 1000,
    });
    expect(acuteInterval).toBe(300);

    // Congestion (loss > 15%) causes backoff
    const congestedInterval = strat.calculateInterval({
      scenario: 'stable',
      latestReadings: [{ type: 'spo2', value: 98, unit: '%', quality: 'ok', deviceId: 'DEV-001', sequence: 2, timestamp: now }],
      measuredLossRate: 0.25, // 25% loss
      baseIntervalMs: 1000,
    });
    // multiplier = 1.0 + (0.25 - 0.15) * 3 = 1.30 -> 1300ms
    expect(congestedInterval).toBe(1300);
  });
});
