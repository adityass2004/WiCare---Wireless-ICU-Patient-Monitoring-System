import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import Fastify from 'fastify';
import { registerSimulationRoutes } from '../src/routes/simulation.js';

describe('Decoupled Simulation API Routes', () => {
  let offlineApp: ReturnType<typeof Fastify>;
  let onlineApp: ReturnType<typeof Fastify>;
  let mockSimulator: ReturnType<typeof Fastify>;
  const MOCK_PORT = 40998;

  beforeAll(async () => {
    // 1. App pointing to offline simulator
    offlineApp = Fastify();
    await registerSimulationRoutes(offlineApp, {
      simulatorUrl: 'http://127.0.0.1:40999',
    });
    await offlineApp.ready();

    // 2. Mock Simulator Server
    mockSimulator = Fastify();
    mockSimulator.get('/status', async () => ({
      status: 'active',
      running: true,
      config: { count: 3, speed: 1, brokerUrl: 'mqtt://localhost:1883' },
      patients: [{ patientId: 'P-001', bedId: 'B-1' }],
    }));
    mockSimulator.post('/start', async (req: { body?: unknown }) => {
      const b = req.body as { count?: number } | undefined;
      return {
        success: true,
        config: { count: b?.count || 5 },
        patients: [],
      };
    });
    mockSimulator.post('/add-bed', async () => ({
      success: true,
      config: { count: 4 },
      patients: [],
    }));
    mockSimulator.post('/remove-bed', async () => ({
      success: true,
      config: { count: 2 },
      patients: [],
    }));
    await mockSimulator.listen({ port: MOCK_PORT, host: '127.0.0.1' });

    // 3. App pointing to online mock simulator
    onlineApp = Fastify();
    await registerSimulationRoutes(onlineApp, {
      simulatorUrl: `http://127.0.0.1:${MOCK_PORT}`,
    });
    await onlineApp.ready();
  });

  afterAll(async () => {
    await offlineApp.close();
    await onlineApp.close();
    await mockSimulator.close();
  });

  it('GET /simulation/status returns offline status gracefully when simulator service is not running', async () => {
    const res = await offlineApp.inject({
      method: 'GET',
      url: '/simulation/status',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('offline');
    expect(body.running).toBe(false);
    expect(body.mode).toBe('standalone');
    expect(body.patients).toEqual([]);
    expect(body.message).toContain('Simulator service is offline');
  });

  it('POST /simulation/start returns 503 with helpful message when simulator is offline', async () => {
    const res = await offlineApp.inject({
      method: 'POST',
      url: '/simulation/start',
      payload: { count: 5 },
    });

    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('offline');
    expect(body.message).toContain('npm run simulator');
  });

  it('GET /simulation/status proxies live status when simulator is online', async () => {
    const res = await onlineApp.inject({
      method: 'GET',
      url: '/simulation/status',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('active');
    expect(body.running).toBe(true);
    expect(body.config.count).toBe(3);
    expect(body.patients).toHaveLength(1);
  });

  it('POST /simulation/add-bed successfully forwards without payload body', async () => {
    const res = await onlineApp.inject({
      method: 'POST',
      url: '/simulation/add-bed',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.config.count).toBe(4);
  });
});
