import type { PatientIdentity } from '@wicare/shared';
import { SimulationClock } from './clock.js';
import { VirtualPatient } from './patient.js';

export interface SimulationManagerOptions {
  speed?: number;
  tickIntervalMs?: number;
  seed?: number;
}

const MAX_PATIENTS = 50;

export class SimulationManager {
  readonly clock: SimulationClock;
  private readonly patients = new Map<string, VirtualPatient>();
  private readonly baseSeed: number;
  private counter = 0;

  constructor(opts: SimulationManagerOptions = {}) {
    this.clock = new SimulationClock({
      speed: opts.speed,
      tickIntervalMs: opts.tickIntervalMs,
    });
    this.baseSeed = opts.seed ?? Math.floor(Math.random() * 1_000_000_000);
    this.clock.onTick((dt) => this.tickAll(dt));
  }

  get seedValue(): number {
    return this.baseSeed;
  }

  addPatient(identity: PatientIdentity, opts: { seed?: number } = {}): VirtualPatient {
    if (this.patients.size >= MAX_PATIENTS) {
      throw new Error(`Cannot add more than ${MAX_PATIENTS} patients`);
    }
    if (this.patients.has(identity.patientId)) {
      throw new Error(`Patient ${identity.patientId} already exists`);
    }
    const seed = opts.seed ?? this.baseSeed + this.counter++;
    const patient = new VirtualPatient(identity, { seed });
    patient.start();
    this.patients.set(identity.patientId, patient);
    return patient;
  }

  removePatient(patientId: string): boolean {
    return this.patients.delete(patientId);
  }

  getPatient(patientId: string): VirtualPatient | undefined {
    return this.patients.get(patientId);
  }

  listPatients(): VirtualPatient[] {
    return [...this.patients.values()];
  }

  get patientCount(): number {
    return this.patients.size;
  }

  setSpeed(speed: number): void {
    this.clock.setSpeed(speed);
  }

  get speed(): number {
    return this.clock.speed;
  }

  start(): void {
    this.clock.start();
  }

  stop(): void {
    this.clock.stop();
  }

  advance(ms: number): void {
    this.clock.advance(ms);
  }

  private tickAll(dt: number): void {
    for (const patient of this.patients.values()) {
      patient.tick(dt);
    }
  }
}
