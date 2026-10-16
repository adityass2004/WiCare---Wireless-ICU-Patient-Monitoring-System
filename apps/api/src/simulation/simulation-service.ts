import { SimulationManager } from '@wicare/patient-generator';
import type { ScenarioType, VitalType } from '@wicare/shared';
import type { NetworkEmulatorConfig } from '@wicare/network-emulator';
import type { Logger } from 'pino';

export interface SimulationConfig {
  count: number;
  speed: number;
  qos: 0 | 1;
  publishIntervalMs: number;
  lossRate: number;
  fixedDelayMs: number;
  jitterMs: number;
  brokerUrl: string;
}

export class SimulationService {
  private manager: SimulationManager;
  private readonly logger: Logger;
  private config: SimulationConfig;

  constructor(logger: Logger, initialConfig: Partial<SimulationConfig> = {}) {
    this.logger = logger.child({ component: 'simulation-service' });
    this.config = {
      count: initialConfig.count ?? 0,
      speed: initialConfig.speed ?? 1,
      qos: initialConfig.qos ?? 0,
      publishIntervalMs: initialConfig.publishIntervalMs ?? 1000,
      lossRate: initialConfig.lossRate ?? 0,
      fixedDelayMs: initialConfig.fixedDelayMs ?? 0,
      jitterMs: initialConfig.jitterMs ?? 0,
      brokerUrl: initialConfig.brokerUrl ?? 'mqtt://localhost:1883',
    };

    this.manager = new SimulationManager({
      speed: this.config.speed,
      tickIntervalMs: 1000,
      seed: 42,
    });
  }

  async start(): Promise<void> {
    await this.applyConfig(this.config);
    this.manager.start();
    this.logger.info({ config: this.config }, 'SimulationService started');
  }

  async stop(): Promise<void> {
    this.manager.stop();
    await Promise.all(this.manager.listPatients().map((p) => p.disconnectMqtt()));
    this.logger.info('SimulationService stopped');
  }

  get isRunning(): boolean {
    return this.config.count > 0;
  }

  getConfig(): SimulationConfig {
    return { ...this.config };
  }

  async updateConfig(newConfig: Partial<SimulationConfig>): Promise<SimulationConfig> {
    this.config = { ...this.config, ...newConfig };
    await this.applyConfig(this.config);
    return this.config;
  }

  setPatientScenario(patientId: string, scenario: ScenarioType): boolean {
    const patient = this.manager.getPatient(patientId);
    if (!patient) return false;
    patient.setScenario(scenario);
    this.logger.info({ patientId, scenario }, 'Set patient scenario');
    return true;
  }

  setPatientOverride(patientId: string, vital: VitalType, value: number): boolean {
    const patient = this.manager.getPatient(patientId);
    if (!patient) return false;
    patient.setOverride(vital, value);
    this.logger.info({ patientId, vital, value }, 'Set patient override');
    return true;
  }

  clearPatientOverride(patientId: string, vital: VitalType): boolean {
    const patient = this.manager.getPatient(patientId);
    if (!patient) return false;
    patient.clearOverride(vital);
    return true;
  }

  listPatients() {
    return this.manager.listPatients().map((p) => ({
      patientId: p.identity.patientId,
      bedId: p.identity.bedId,
      ward: p.identity.ward,
      deviceId: p.identity.deviceId,
      scenario: p.currentScenario,
      isMqttConnected: p.isMqttConnected,
    }));
  }

  async addBed(): Promise<SimulationConfig> {
    const next = Math.min(50, this.config.count + 1);
    return this.updateConfig({ count: next });
  }

  async removeBed(): Promise<SimulationConfig> {
    const next = Math.max(0, this.config.count - 1);
    return this.updateConfig({ count: next });
  }

  async startSimulation(count = 5): Promise<SimulationConfig> {
    const target = count > 0 ? count : (this.config.count > 0 ? this.config.count : 5);
    return this.updateConfig({ count: target });
  }

  async stopSimulation(): Promise<SimulationConfig> {
    return this.updateConfig({ count: 0 });
  }

  private async applyConfig(cfg: SimulationConfig): Promise<void> {
    this.manager.setSpeed(cfg.speed);

    const currentCount = this.manager.patientCount;
    const targetCount = Math.min(50, Math.max(0, cfg.count));

    const networkConfig: NetworkEmulatorConfig | undefined =
      cfg.lossRate > 0 || cfg.fixedDelayMs > 0 || cfg.jitterMs > 0
        ? {
            lossRate: cfg.lossRate,
            fixedDelayMs: cfg.fixedDelayMs,
            jitterMs: cfg.jitterMs,
          }
        : undefined;

    if (targetCount > currentCount) {
      for (let i = currentCount + 1; i <= targetCount; i++) {
        const id = `P-${String(i).padStart(3, '0')}`;
        const patient = this.manager.addPatient({
          patientId: id,
          bedId: `B-${i}`,
          ward: 'ICU',
          deviceId: `DEV-${String(i).padStart(3, '0')}`,
        });
        patient.start();
      }
    } else if (targetCount < currentCount) {
      const all = this.manager.listPatients();
      for (let i = targetCount; i < all.length; i++) {
        const p = all[i];
        if (p) {
          await p.disconnectMqtt();
          this.manager.removePatient(p.identity.patientId);
        }
      }
    }

    for (const p of this.manager.listPatients()) {
      if (p.isMqttConnected) {
        await p.disconnectMqtt();
      }
      await p
        .connectMqtt({
          brokerUrl: cfg.brokerUrl,
          qos: cfg.qos,
          publishIntervalMs: cfg.publishIntervalMs,
          networkConfig,
        })
        .catch((err) => {
          this.logger.warn({ err, patientId: p.identity.patientId }, 'Failed to reconnect patient MQTT');
        });
    }
  }
}
