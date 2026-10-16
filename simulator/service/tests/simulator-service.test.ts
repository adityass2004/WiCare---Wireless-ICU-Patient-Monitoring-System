import { describe, it, expect, afterEach } from 'vitest';
import pino from 'pino';
import { SimulationService } from '../src/simulation-service.js';

const logger = pino({ level: 'silent' });

describe('Standalone Simulator Service Unit Tests', () => {
  let service: SimulationService | null = null;

  afterEach(async () => {
    if (service) {
      await service.stop();
      service = null;
    }
  });

  it('should initialize with provided config and remain idle before start', () => {
    service = new SimulationService(logger, { count: 3, speed: 2 });
    expect(service.isRunning).toBe(false);
    expect(service.getConfig().count).toBe(3);
    expect(service.getConfig().speed).toBe(2);
  });

  it('should manage virtual beds when starting and updating', async () => {
    service = new SimulationService(logger, { count: 3, brokerUrl: 'mqtt://localhost:18835' });
    await service.startSimulation(3);
    expect(service.isRunning).toBe(true);
    expect(service.listPatients()).toHaveLength(3);

    await service.addBed();
    expect(service.listPatients()).toHaveLength(4);

    await service.removeBed();
    expect(service.listPatients()).toHaveLength(3);
  });

  it('should set scenario and override vitals on specific patient', async () => {
    service = new SimulationService(logger, { count: 2, brokerUrl: 'mqtt://localhost:18835' });
    await service.startSimulation(2);

    const okScenario = service.setPatientScenario('P-001', 'rising_hr');
    expect(okScenario).toBe(true);

    const okOverride = service.setPatientOverride('P-001', 'heart_rate', 140);
    expect(okOverride).toBe(true);

    const cleared = service.clearPatientOverride('P-001', 'heart_rate');
    expect(cleared).toBe(true);

    // Non-existent patient
    expect(service.setPatientScenario('P-999', 'stable')).toBe(false);
    expect(service.setPatientOverride('P-999', 'heart_rate', 80)).toBe(false);
  });

  it('should cleanly stop simulation and reset running state', async () => {
    service = new SimulationService(logger, { count: 2, brokerUrl: 'mqtt://localhost:18835' });
    await service.startSimulation(2);
    expect(service.isRunning).toBe(true);

    await service.stopSimulation();
    expect(service.isRunning).toBe(false);
  });
});
