import { describe, it, expect } from 'vitest';
import { DeviceRegistry } from '../src/mqtt/device-registry.js';
import type { VitalsMessage } from '@wicare/shared';

function makeMsg(deviceId: string, seq: number): VitalsMessage {
  return {
    schemaVersion: 1,
    deviceId,
    patientId: 'P-001',
    bedId: 'B-1',
    ward: 'ICU',
    seq,
    timestamp: new Date().toISOString(),
    vitals: {
      heart_rate: { value: 72, unit: 'bpm', quality: 'ok' },
    },
  };
}

describe('DeviceRegistry sequence gap detection', () => {
  it('records no gaps for a contiguous sequence', () => {
    const reg = new DeviceRegistry();
    for (let i = 0; i < 10; i++) reg.ingest(makeMsg('DEV-001', i));
    const state = reg.get('DEV-001')!;
    expect(state.firstSeq).toBe(0);
    expect(state.lastSeq).toBe(9);
    expect(state.totalGaps).toBe(0);
    expect(state.gapCount).toBe(0);
    expect(reg.getMeasuredLossRate('DEV-001')).toBe(0);
  });

  it('detects gaps when sequence numbers are skipped', () => {
    const reg = new DeviceRegistry();
    reg.ingest(makeMsg('DEV-001', 0));
    reg.ingest(makeMsg('DEV-001', 5));
    reg.ingest(makeMsg('DEV-001', 6));
    const state = reg.get('DEV-001')!;
    expect(state.totalGaps).toBe(4);
    expect(state.gapCount).toBe(1);
    expect(state.totalReceived).toBe(3);
  });

  it('measures loss rate approximately equal to dropped fraction', () => {
    const reg = new DeviceRegistry();
    for (let i = 0; i < 100; i++) {
      if (i % 5 !== 0) reg.ingest(makeMsg('DEV-001', i));
    }
    const lossRate = reg.getMeasuredLossRate('DEV-001');
    expect(lossRate).toBeGreaterThan(0.18);
    expect(lossRate).toBeLessThan(0.22);
  });

  it('tracks multiple devices independently', () => {
    const reg = new DeviceRegistry();
    for (let i = 0; i < 10; i++) reg.ingest(makeMsg('DEV-001', i));
    for (let i = 0; i < 5; i++) reg.ingest(makeMsg('DEV-002', i * 2));
    expect(reg.get('DEV-001')!.totalGaps).toBe(0);
    expect(reg.get('DEV-002')!.totalGaps).toBe(4);
    expect(reg.count).toBe(2);
  });

  it('updates online status via setStatus', () => {
    const reg = new DeviceRegistry();
    reg.ingest(makeMsg('DEV-001', 0));
    expect(reg.get('DEV-001')!.online).toBe(true);
    reg.setStatus('DEV-001', 'offline');
    expect(reg.get('DEV-001')!.online).toBe(false);
  });

  it('handles out-of-order packets by filling gaps without inflating totalGaps', () => {
    const reg = new DeviceRegistry();
    reg.ingest(makeMsg('DEV-001', 0));
    reg.ingest(makeMsg('DEV-001', 5));
    reg.ingest(makeMsg('DEV-001', 6));
    expect(reg.get('DEV-001')!.totalGaps).toBe(4);
    expect(reg.get('DEV-001')!.totalReceived).toBe(3);

    // Delayed packet seq 2 arrives
    reg.ingest(makeMsg('DEV-001', 2));
    expect(reg.get('DEV-001')!.totalGaps).toBe(3);
    expect(reg.get('DEV-001')!.totalReceived).toBe(4);

    // Delayed packet seq 1 arrives
    reg.ingest(makeMsg('DEV-001', 1));
    expect(reg.get('DEV-001')!.totalGaps).toBe(2);
    expect(reg.get('DEV-001')!.totalReceived).toBe(5);
  });

  it('gracefully handles duplicate sequence numbers without double-counting', () => {
    const reg = new DeviceRegistry();
    reg.ingest(makeMsg('DEV-001', 0));
    reg.ingest(makeMsg('DEV-001', 1));
    reg.ingest(makeMsg('DEV-001', 2));
    expect(reg.get('DEV-001')!.totalReceived).toBe(3);
    expect(reg.get('DEV-001')!.totalGaps).toBe(0);

    // Duplicate arrival of seq 1
    reg.ingest(makeMsg('DEV-001', 1));
    expect(reg.get('DEV-001')!.totalReceived).toBe(3);
    expect(reg.get('DEV-001')!.totalGaps).toBe(0);
    expect(reg.getMeasuredLossRate('DEV-001')).toBe(0);
  });
});
