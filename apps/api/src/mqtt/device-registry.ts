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
    }
    return state;
  }

  ingest(message: VitalsMessage): void {
    const state = this.ensure(message);
    state.lastSeen = message.timestamp;
    state.online = true;
    state.lastQos = message.qos ?? state.lastQos;
    state.totalReceived++;

    if (state.firstSeq === null) {
      state.firstSeq = message.seq;
      state.lastSeq = message.seq;
      return;
    }

    if (message.seq > state.lastSeq!) {
      const gap = message.seq - state.lastSeq! - 1;
      if (gap > 0) {
        state.gapCount++;
        state.totalGaps += gap;
      }
      state.lastSeq = message.seq;
    } else if (message.seq < state.lastSeq!) {
      state.gapCount++;
      state.totalGaps += 1;
    }
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
