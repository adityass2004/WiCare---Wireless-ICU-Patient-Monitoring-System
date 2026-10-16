import type { FastifyInstance } from 'fastify';
import type { DeviceRegistry } from '../mqtt/device-registry.js';

export async function registerDeviceRoutes(
  app: FastifyInstance,
  registry: DeviceRegistry,
): Promise<void> {
  app.get('/devices', async () => {
    return {
      count: registry.count,
      devices: registry.list().map((d) => ({
        ...d,
        measuredLossRate: registry.getMeasuredLossRate(d.deviceId),
      })),
    };
  });

  app.get<{ Params: { id: string } }>('/devices/:id', async (request, reply) => {
    const { id } = request.params;
    const device = registry.get(id);
    if (!device) {
      reply.code(404);
      return { error: 'Device not found', deviceId: id };
    }
    return {
      ...device,
      measuredLossRate: registry.getMeasuredLossRate(id),
    };
  });
}
