import type { DeviceStatus, VitalsMessage } from '@wicare/shared';

export interface DeviceState {
  deviceId: string;
  patientId: string;
  bedId: string;
  ward: string;
  online: boolean;
  lastSeen: string | null;
  firstSeq: number | null;
  lastSeq: number | null;
  totalReceived: number;
  gapCount: number;
  totalGaps: number;
  lastQos: number | null;
}

export class DeviceRegistry {
  private readonly devices = new Map<string, DeviceState>();
  private readonly receivedSeqs = new Map<string, Set<number>>();

  private ensure(message: VitalsMessage): DeviceState {
    let state = this.devices.get(message.deviceId);
    if (!state) {
      state = {
        deviceId: message.deviceId,
        patientId: message.patientId,
        bedId: message.bedId,
        ward: message.ward,
        online: true,
        lastSeen: null,
        firstSeq: null,
        lastSeq: null,
        totalReceived: 0,
        gapCount: 0,
        totalGaps: 0,
        lastQos: message.qos ?? null,
      };
      this.devices.set(message.deviceId, state);
      this.receivedSeqs.set(message.deviceId, new Set<number>());
    }
    return state;
  }

  ingest(message: VitalsMessage): void {
    const state = this.ensure(message);
    state.lastSeen = message.timestamp;
    state.online = true;
    state.lastQos = message.qos ?? state.lastQos;

    const seqSet = this.receivedSeqs.get(message.deviceId) ?? new Set<number>();
    this.receivedSeqs.set(message.deviceId, seqSet);

    // If duplicate packet, update lastSeen but do not double count
    if (seqSet.has(message.seq)) {
      return;
    }

    seqSet.add(message.seq);
    state.totalReceived++;

    if (state.firstSeq === null) {
      state.firstSeq = message.seq;
      state.lastSeq = message.seq;
      state.totalGaps = 0;
      return;
    }

    if (message.seq > state.lastSeq!) {
      const jump = message.seq - state.lastSeq! - 1;
      if (jump > 0) {
        state.gapCount++;
      }
      state.lastSeq = message.seq;
    }

    // Expected sequence range spans from firstSeq to maxSeq
    const expected = state.lastSeq! - state.firstSeq + 1;
    state.totalGaps = Math.max(0, expected - seqSet.size);
  }

  setStatus(deviceId: string, status: DeviceStatus): void {
    const state = this.devices.get(deviceId);
    if (state) {
      state.online = status === 'online';
      if (status === 'online') state.lastSeen = new Date().toISOString();
    }
  }

  get(deviceId: string): DeviceState | undefined {
    return this.devices.get(deviceId);
  }

  list(): DeviceState[] {
    return [...this.devices.values()];
  }

  get count(): number {
    return this.devices.size;
  }

  get deviceIds(): string[] {
    return [...this.devices.keys()];
  }

  /**
   * Measured loss rate for a device: total missing sequence numbers
   * divided by the expected count (lastSeq - firstSeq + 1).
   */
  getMeasuredLossRate(deviceId: string): number {
    const state = this.devices.get(deviceId);
    if (!state || state.firstSeq === null || state.lastSeq === null) return 0;
    const expected = state.lastSeq - state.firstSeq + 1;
    if (expected <= 0) return 0;
    return state.totalGaps / expected;
  }

  clear(): void {
    this.devices.clear();
  }
}
