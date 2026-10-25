import Fastify from 'fastify';
import pino from 'pino';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SimulationService, type SimulationConfig } from './simulation-service.js';
import { type ScenarioType, type VitalType, detectLanIp } from '@wicare/shared';

import { getSimulatorHtml } from './ui.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

function parseArgs(argv: string[]) {
  const options = {
    count: parseInt(process.env.SIMULATOR_COUNT || '5', 10),
    port: parseInt(process.env.SIMULATOR_PORT || '4001', 10),
    host: process.env.SIMULATOR_HOST || '0.0.0.0',
    brokerUrl: process.env.MQTT_URL || 'mqtt://localhost:1883',
    speed: parseFloat(process.env.SIMULATOR_SPEED || '1'),
    lossRate: parseFloat(process.env.SIMULATOR_LOSS || '0'),
    fixedDelayMs: parseFloat(process.env.SIMULATOR_DELAY || '0'),
    jitterMs: parseFloat(process.env.SIMULATOR_JITTER || '0'),
    qos: (parseInt(process.env.SIMULATOR_QOS || '0', 10) === 1 ? 1 : 0) as 0 | 1,
    autoStart: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--count') options.count = parseInt(argv[++i] ?? '5', 10) || 5;
    else if (a === '--port') options.port = parseInt(argv[++i] ?? '4001', 10) || 4001;
    else if (a === '--broker') options.brokerUrl = argv[++i] ?? options.brokerUrl;
    else if (a === '--speed') options.speed = parseFloat(argv[++i] ?? '1') || 1;
    else if (a === '--loss') options.lossRate = parseFloat(argv[++i] ?? '0') || 0;
    else if (a === '--delay') options.fixedDelayMs = parseFloat(argv[++i] ?? '0') || 0;
    else if (a === '--jitter') options.jitterMs = parseFloat(argv[++i] ?? '0') || 0;
    else if (a === '--qos') options.qos = (parseInt(argv[++i] ?? '0', 10) === 1 ? 1 : 0) as 0 | 1;
    else if (a === '--no-auto-start') options.autoStart = false;
  }
  return options;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  });

  const simConfig: Partial<SimulationConfig> = {
    count: args.count,
    speed: args.speed,
    brokerUrl: args.brokerUrl,
    lossRate: args.lossRate,
    fixedDelayMs: args.fixedDelayMs,
    jitterMs: args.jitterMs,
    qos: args.qos,
  };

  const simService = new SimulationService(logger, simConfig);

  const app = Fastify({
    logger: false,
    disableRequestLogging: true,
  });

  app.addContentTypeParser(
    ['application/json', 'text/plain', 'application/x-www-form-urlencoded'],
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        const trimmed = typeof body === 'string' ? body.trim() : '';
        const parsed = trimmed && (trimmed.startsWith('{') || trimmed.startsWith('[')) ? JSON.parse(trimmed) : {};
        done(null, parsed);
      } catch {
        done(null, {});
      }
    },
  );

  app.addHook('onRequest', async (_req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  });

  app.options('/*', async (_req, reply) => {
    reply.code(204).send();
  });

  app.get('/', async (_req, reply) => {
    reply.type('text/html').send(getSimulatorHtml());
  });

  app.get('/ui', async (_req, reply) => {
    reply.type('text/html').send(getSimulatorHtml());
  });

  app.get('/health', async () => {
    return {
      status: 'ok',
      component: 'simulator',
      running: simService.isRunning,
      patientCount: simService.listPatients().length,
    };
  });

  app.get('/status', async () => {
    return {
      status: simService.isRunning ? 'active' : 'idle',
      running: simService.isRunning,
      config: simService.getConfig(),
      patients: simService.listPatients(),
    };
  });

  app.post<{ Body: { count?: number } }>('/start', async (req) => {
    const count = req.body?.count ?? args.count;
    const updated = await simService.startSimulation(count);
    return { success: true, config: updated, patients: simService.listPatients() };
  });

  app.post('/stop', async () => {
    const updated = await simService.stopSimulation();
    return { success: true, config: updated, patients: [] };
  });

  app.post('/add-bed', async () => {
    const updated = await simService.addBed();
    return { success: true, config: updated, patients: simService.listPatients() };
  });

  app.post('/remove-bed', async () => {
    const updated = await simService.removeBed();
    return { success: true, config: updated, patients: simService.listPatients() };
  });

  app.post<{
    Body: Partial<SimulationConfig>;
  }>('/config', async (req) => {
    const updated = await simService.updateConfig(req.body);
    return { success: true, config: updated, patients: simService.listPatients() };
  });

  app.post<{
    Params: { id: string };
    Body: { scenario: ScenarioType };
  }>('/patients/:id/scenario', async (req, reply) => {
    const { id } = req.params;
    const { scenario } = req.body;
    const ok = simService.setPatientScenario(id, scenario);
    if (!ok) {
      reply.code(404);
      return { success: false, error: 'Patient not found', patientId: id };
    }
    return { success: true, patientId: id, scenario };
  });

  app.post<{
    Params: { id: string };
    Body: { vital: VitalType; value: number | null };
  }>('/patients/:id/override', async (req, reply) => {
    const { id } = req.params;
    const { vital, value } = req.body;
    if (value === null) {
      simService.clearPatientOverride(id, vital);
      return { success: true, patientId: id, vital, cleared: true };
    }
    const ok = simService.setPatientOverride(id, vital, value);
    if (!ok) {
      reply.code(404);
      return { success: false, error: 'Patient not found', patientId: id };
    }
    return { success: true, patientId: id, vital, value };
  });

  await app.listen({ port: args.port, host: args.host });

  if (args.autoStart && args.count > 0) {
    await simService.start().catch((err) => {
      logger.warn({ err }, 'Simulator failed to auto-connect to MQTT on start. Retrying on demand.');
    });
  }

  const lanResult = detectLanIp();
  const lanIp = lanResult.isLocalOnly ? 'localhost' : lanResult.primaryIp;

  console.log(`
===================================================================
  WiCare Standalone Patient Telemetry Simulator Running!
  
  Local Access:     http://localhost:${args.port}
  LAN Phone Access: http://${lanIp}:${args.port}
  Control API:      http://${lanIp}:${args.port}/status
  MQTT Broker:      ${args.brokerUrl}
  Active Beds:      ${args.count}
  Status:           ${simService.isRunning ? 'Active (Publishing Telemetry)' : 'Idle'}
===================================================================
`);

  const shutdown = async () => {
    console.log('\nShutting down simulator service...');
    await simService.stop();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error starting simulator:', err);
  process.exit(1);
});
