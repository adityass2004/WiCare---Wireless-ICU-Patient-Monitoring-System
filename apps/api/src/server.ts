import Fastify from 'fastify';
import { env } from './env.js';
import { logger } from './logger.js';
import type { Logger } from 'pino';
import { registerHealthRoutes } from './routes/health.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerPatientRoutes } from './routes/patients.js';
import { registerSimulationRoutes } from './routes/simulation.js';
import { registerAlertRoutes } from './routes/alerts.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerExplainerRoutes } from './routes/explainer.js';
import { registerDropRoutes } from './routes/drops.js';
import { GeminiExplainerService } from './ai/gemini-explainer.js';
import { DeviceRegistry } from './mqtt/device-registry.js';
import { MqttDropRecorder } from './mqtt/drop-recorder.js';
import { MqttSubscriber } from './mqtt/subscriber.js';
import { ReadingBatcher } from './db/reading-batcher.js';
import { WsServer } from './ws/socket-server.js';
import type { SimulationService } from './simulation/simulation-service.js';
import { AlertEngine } from './alerts/alert-engine.js';
import { prisma } from './db/prisma.js';
import { AiEngineClient } from './alerts/ai-client.js';

import { Aedes } from 'aedes';
import { createServer as createNetServer, type Server as NetServer } from 'node:net';
import { detectLanIp } from '@wicare/shared';

export function getLanIp(): string {
  const result = detectLanIp();
  return result.isLocalOnly ? '127.0.0.1' : result.primaryIp;
}

export async function ensureMqttBroker(logger: Logger, port = 1883): Promise<{ broker: Aedes | null; tcpServer: NetServer | null }> {
  try {
    const aedes = await Aedes.createBroker();
    return new Promise((resolve) => {
      const server = createNetServer(aedes.handle);

      server.once('error', (err: Error & { code?: string }) => {
        if (err.code === 'EADDRINUSE') {
          logger.info({ port }, 'External MQTT broker (e.g. Mosquitto) detected; using existing broker');
          aedes.close();
          resolve({ broker: null, tcpServer: null });
        } else {
          logger.warn({ err }, 'Could not bind embedded MQTT broker');
          resolve({ broker: null, tcpServer: null });
        }
      });

      server.listen(port, '0.0.0.0', () => {
        logger.info({ port }, 'Started embedded Aedes MQTT broker on 0.0.0.0:1883');
        resolve({ broker: aedes, tcpServer: server });
      });
    });
  } catch (err) {
    logger.warn({ err }, 'Failed to initialize Aedes broker');
    return { broker: null, tcpServer: null };
  }
}

export interface BuildServerOptions {
  simulationService?: SimulationService;
  explainerService?: GeminiExplainerService;
}

export async function buildServer(options: BuildServerOptions = {}) {
  const { broker: embeddedBroker, tcpServer: embeddedTcpServer } = await ensureMqttBroker(logger);

  const app = Fastify({
    logger: true,
    disableRequestLogging: false,
  });

  try {
    await prisma.device.updateMany({
      data: { status: 'offline' },
    });
    await prisma.alert.updateMany({
      where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
      data: { status: 'RESOLVED', resolvedBy: 'System Startup', resolvedAt: new Date() },
    });
  } catch {
    // DB not yet populated or in-memory
  }

  const registry = new DeviceRegistry();
  const dropRecorder = new MqttDropRecorder();
  const batcher = new ReadingBatcher(logger);
  batcher.start();

  const wsServer = new WsServer(logger);
  const aiClient = new AiEngineClient(logger);
  const alertEngine = new AlertEngine(prisma, wsServer, aiClient, env.ENABLE_BACKGROUND_AI);
  await alertEngine.init();

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (request.method === 'OPTIONS') {
      reply.code(204).send();
    }
  });

  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerDeviceRoutes(app, registry);
  await registerPatientRoutes(app, registry, alertEngine);
  await registerSimulationRoutes(app, {
    simulationService: options.simulationService,
    simulatorUrl: env.SIMULATOR_URL,
    registry,
    wsServer,
  });
  await registerAlertRoutes(app, alertEngine, registry);

  const explainerService =
    options.explainerService ??
    new GeminiExplainerService({
      apiKey: env.GEMINI_API_KEY,
      modelName: env.GEMINI_MODEL,
      logger,
    });

  await registerExplainerRoutes(app, {
    prisma,
    registry,
    explainerService,
    allowDemoAuth: true,
  });
  await registerDropRoutes(app, {
    dropRecorder,
    registry,
    wsServer,
  });

  app.decorate('registry', registry);
  app.decorate('dropRecorder', dropRecorder);

  const subscriber = new MqttSubscriber({
    brokerUrl: env.MQTT_URL,
    username: env.MQTT_USERNAME || undefined,
    password: env.MQTT_PASSWORD || undefined,
    registry,
    batcher,
    wsServer,
    alertEngine,
    dropRecorder,
    logger,
  });

  subscriber.start().catch((err) => {
    logger.warn({ err }, 'MQTT subscriber failed to start; API running without device ingest');
  });

  // Attach Socket.IO when server starts listening
  app.addHook('onReady', async () => {
    wsServer.attach(app.server);
    logger.info('Attached Socket.IO server to HTTP engine');

    if (options.simulationService) {
      options.simulationService.start().catch((err) => {
        logger.warn({ err }, 'In-memory simulationService auto-start warning');
      });
    }
  });

  app.addHook('onClose', async () => {
    alertEngine.stop();
    await subscriber.stop();
    await batcher.stop();
    if (options.simulationService) {
      await options.simulationService.stop();
    }
    await wsServer.close();
    if (embeddedTcpServer) embeddedTcpServer.close();
    if (embeddedBroker) embeddedBroker.close();
  });

  return { app, registry, dropRecorder, subscriber, batcher, wsServer, alertEngine, simulationService: options.simulationService };
}

async function main() {
  const { app } = await buildServer();

  try {
    await app.listen({ port: env.API_PORT, host: env.API_HOST });
    const lanIp = getLanIp();
    console.log(`
===================================================================
  WiCare Wireless Patient Monitoring API Server Running!
  
  Local Access:       http://localhost:${env.API_PORT}
  LAN Phone Access:   http://${lanIp}:${env.API_PORT}
  Simulator Target:   ${env.SIMULATOR_URL} (Decoupled - run separately via 'npm run simulator')
===================================================================
`);
    logger.info({ port: env.API_PORT, host: env.API_HOST, lanIp }, 'WiCare API listening');
  } catch (err) {
    logger.error({ err }, 'Failed to start API server');
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start API server');
  process.exit(1);
});
