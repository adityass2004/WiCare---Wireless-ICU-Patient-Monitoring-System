import type { FastifyInstance } from 'fastify';
import { HealthResponseSchema } from '@wicare/shared';

const API_VERSION = '0.1.0';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  const startedAt = Date.now();

  app.get('/health', async () => {
    const payload = {
      status: 'online' as const,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      version: API_VERSION,
    };
    return HealthResponseSchema.parse(payload);
  });
}
