import type { FastifyInstance } from 'fastify';
import type { SimulationService, SimulationConfig } from '../simulation/simulation-service.js';
import type { ScenarioType, VitalType } from '@wicare/shared';
import type { DeviceRegistry } from '../mqtt/device-registry.js';
import type { WsServer } from '../ws/socket-server.js';

export interface SimulationRouteOptions {
  simulationService?: SimulationService;
  simulatorUrl?: string;
  registry?: DeviceRegistry;
  wsServer?: WsServer;
}

const defaultSimConfig = {
  count: 0,
  speed: 1,
  qos: 0 as const,
  publishIntervalMs: 1000,
  lossRate: 0,
  fixedDelayMs: 0,
  jitterMs: 0,
  brokerUrl: 'mqtt://localhost:1883',
};

async function callSimulator<T = unknown>(
  simulatorUrl: string,
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${simulatorUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: data as T };
  } catch {
    return {
      ok: false,
      status: 503,
      data: {
        error: 'Simulator service is offline',
        message: 'The standalone simulator is not running. Start it in a separate terminal with: npm run simulator',
      } as T,
    };
  }
}

export async function registerSimulationRoutes(
  app: FastifyInstance,
  optionsOrService: SimulationService | SimulationRouteOptions,
  registryArg?: DeviceRegistry,
  wsServerArg?: WsServer,
): Promise<void> {
  let simulationService: SimulationService | undefined;
  let simulatorUrl: string | undefined;
  let registry: DeviceRegistry | undefined;
  let wsServer: WsServer | undefined;

  if (
    optionsOrService &&
    typeof (optionsOrService as SimulationService).getConfig === 'function'
  ) {
    simulationService = optionsOrService as SimulationService;
    registry = registryArg;
    wsServer = wsServerArg;
  } else {
    const opts = (optionsOrService as SimulationRouteOptions) || {};
    simulationService = opts.simulationService;
    simulatorUrl = opts.simulatorUrl || 'http://127.0.0.1:4001';
    registry = opts.registry || registryArg;
    wsServer = opts.wsServer || wsServerArg;
  }

  // GET /simulation/status
  app.get('/simulation/status', async () => {
    if (simulationService) {
      return {
        status: simulationService.isRunning ? 'active' : 'idle',
        running: simulationService.isRunning,
        config: simulationService.getConfig(),
        patients: simulationService.listPatients(),
      };
    }

    if (simulatorUrl) {
      const res = await callSimulator<{
        status: string;
        running: boolean;
        config: typeof defaultSimConfig;
        patients: Array<Record<string, unknown>>;
      }>(simulatorUrl, '/status');

      if (res.ok) {
        return {
          status: res.data.running ? 'active' : 'idle',
          running: res.data.running,
          config: res.data.config || defaultSimConfig,
          patients: res.data.patients || [],
          mode: 'standalone',
        };
      }
    }

    return {
      status: 'offline',
      running: false,
      config: defaultSimConfig,
      patients: [],
      mode: 'standalone',
      message: 'Simulator service is offline. Start it via "npm run simulator" in another terminal.',
    };
  });

  // POST /simulation/start
  app.post<{
    Body: { count?: number };
  }>('/simulation/start', async (request, reply) => {
    const count = request.body?.count ?? 5;

    if (simulationService) {
      const config = await simulationService.startSimulation(count);
      return { success: true, config, patients: simulationService.listPatients() };
    }

    if (simulatorUrl) {
      const res = await callSimulator(simulatorUrl, '/start', 'POST', { count });
      if (res.ok) return res.data;
      reply.code(res.status);
      return res.data;
    }

    reply.code(503);
    return { success: false, error: 'No simulator service available' };
  });

  // POST /simulation/stop
  app.post('/simulation/stop', async (_request, reply) => {
    let resultConfig: SimulationConfig | Record<string, unknown> = defaultSimConfig;

    if (simulationService) {
      resultConfig = await simulationService.stopSimulation();
    } else if (simulatorUrl) {
      const res = await callSimulator<{ config?: Record<string, unknown> }>(simulatorUrl, '/stop', 'POST');
      if (res.ok) {
        resultConfig = res.data.config || defaultSimConfig;
      } else {
        reply.code(res.status);
        return res.data;
      }
    }

    if (registry) {
      registry.clear();
    }
    if (wsServer) {
      for (let i = 1; i <= 50; i++) {
        const id = `P-${String(i).padStart(3, '0')}`;
        const devId = `DEV-${String(i).padStart(3, '0')}`;
        wsServer.broadcastStatus({
          deviceId: devId,
          patientId: id,
          ward: 'ICU',
          bedId: `B-${i}`,
          status: 'offline',
          timestamp: new Date().toISOString(),
        });
      }
    }

    return { success: true, config: resultConfig, patients: [] };
  });

  // POST /simulation/add-bed
  app.post('/simulation/add-bed', async (_request, reply) => {
    if (simulationService) {
      const config = await simulationService.addBed();
      return { success: true, config, patients: simulationService.listPatients() };
    }

    if (simulatorUrl) {
      const res = await callSimulator(simulatorUrl, '/add-bed', 'POST');
      if (res.ok) return res.data;
      reply.code(res.status);
      return res.data;
    }

    reply.code(503);
    return { success: false, error: 'No simulator service available' };
  });

  // POST /simulation/remove-bed
  app.post('/simulation/remove-bed', async (_request, reply) => {
    let resultConfig: { count: number } | undefined;
    let patients: unknown[] = [];

    if (simulationService) {
      resultConfig = await simulationService.removeBed();
      patients = simulationService.listPatients();
    } else if (simulatorUrl) {
      const res = await callSimulator<{ config?: { count: number }; patients?: unknown[] }>(simulatorUrl, '/remove-bed', 'POST');
      if (res.ok) {
        resultConfig = res.data.config;
        patients = res.data.patients || [];
      } else {
        reply.code(res.status);
        return res.data;
      }
    }

    if (resultConfig) {
      const removedBedIndex = resultConfig.count + 1;
      const id = `P-${String(removedBedIndex).padStart(3, '0')}`;
      const devId = `DEV-${String(removedBedIndex).padStart(3, '0')}`;
      if (registry) {
        registry.setStatus(devId, 'offline');
      }
      if (wsServer) {
        wsServer.broadcastStatus({
          deviceId: devId,
          patientId: id,
          ward: 'ICU',
          bedId: `B-${removedBedIndex}`,
          status: 'offline',
          timestamp: new Date().toISOString(),
        });
      }
    }

    return { success: true, config: resultConfig, patients };
  });

  // POST /simulation/config
  app.post<{
    Body: {
      count?: number;
      speed?: number;
      qos?: 0 | 1;
      lossRate?: number;
      fixedDelayMs?: number;
      jitterMs?: number;
    };
  }>('/simulation/config', async (request, reply) => {
    if (simulationService) {
      const updated = await simulationService.updateConfig(request.body);
      return {
        success: true,
        config: updated,
        patients: simulationService.listPatients(),
      };
    }

    if (simulatorUrl) {
      const res = await callSimulator(simulatorUrl, '/config', 'POST', request.body);
      if (res.ok) return res.data;
      reply.code(res.status);
      return res.data;
    }

    reply.code(503);
    return { success: false, error: 'No simulator service available' };
  });

  // POST /simulation/patients/:id/scenario
  app.post<{
    Params: { id: string };
    Body: { scenario: ScenarioType };
  }>('/simulation/patients/:id/scenario', async (request, reply) => {
    const { id } = request.params;
    const { scenario } = request.body;

    if (simulationService) {
      const ok = simulationService.setPatientScenario(id, scenario);
      if (!ok) {
        reply.code(404);
        return { error: 'Patient not found in active simulation', patientId: id };
      }
      return { success: true, patientId: id, scenario };
    }

    if (simulatorUrl) {
      const res = await callSimulator(
        simulatorUrl,
        `/patients/${encodeURIComponent(id)}/scenario`,
        'POST',
        { scenario },
      );
      if (res.ok) return res.data;
      reply.code(res.status);
      return res.data;
    }

    reply.code(503);
    return { success: false, error: 'No simulator service available' };
  });

  // POST /simulation/patients/:id/override
  app.post<{
    Params: { id: string };
    Body: { vital: VitalType; value: number | null };
  }>('/simulation/patients/:id/override', async (request, reply) => {
    const { id } = request.params;
    const { vital, value } = request.body;

    if (simulationService) {
      if (value === null) {
        simulationService.clearPatientOverride(id, vital);
        return { success: true, patientId: id, vital, cleared: true };
      }
      const ok = simulationService.setPatientOverride(id, vital, value);
      if (!ok) {
        reply.code(404);
        return { error: 'Patient not found in active simulation', patientId: id };
      }
      return { success: true, patientId: id, vital, value };
    }

    if (simulatorUrl) {
      const res = await callSimulator(
        simulatorUrl,
        `/patients/${encodeURIComponent(id)}/override`,
        'POST',
        { vital, value },
      );
      if (res.ok) return res.data;
      reply.code(res.status);
      return res.data;
    }

    reply.code(503);
    return { success: false, error: 'No simulator service available' };
  });
}
