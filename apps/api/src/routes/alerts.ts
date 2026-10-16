import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import type { AlertEngine } from '../alerts/alert-engine.js';
import { requireRoles } from '../auth.js';

import type { DeviceRegistry } from '../mqtt/device-registry.js';

export async function registerAlertRoutes(
  app: FastifyInstance,
  alertEngine: AlertEngine,
  registry?: DeviceRegistry,
): Promise<void> {
  app.get<{
    Querystring: { status?: string; severity?: string; patientId?: string; limit?: string; all?: string };
  }>('/alerts', async (request) => {
    const { status, severity, patientId, limit, all } = request.query;
    const take = limit ? parseInt(limit, 10) : 50;

    const where: any = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (patientId) where.patientId = patientId;

    const alerts = await prisma.alert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
    });

    const filtered =
      all === 'true' || !registry
        ? alerts
        : alerts.filter((a) => {
            const dev = registry.get(a.deviceId);
            return dev && dev.online;
          });

    return { success: true, count: filtered.length, alerts: filtered };
  });

  app.post<{
    Params: { id: string };
    Body: { acknowledgedBy?: string };
  }>('/alerts/:id/ack', {
    preHandler: [requireRoles(['admin', 'clinician'])],
  }, async (request, reply) => {
    const { id } = request.params;
    const acknowledgedBy = request.user ? request.user.name : (request.body?.acknowledgedBy || 'Staff');
    const updated = await alertEngine.acknowledgeAlert(id, acknowledgedBy);
    if (!updated) {
      reply.code(404);
      return { success: false, error: 'Alert not found' };
    }
    return { success: true, alert: updated };
  });

  app.post<{
    Params: { id: string };
    Body: { resolvedBy?: string };
  }>('/alerts/:id/resolve', {
    preHandler: [requireRoles(['admin', 'clinician'])],
  }, async (request, reply) => {
    const { id } = request.params;
    const resolvedBy = request.user ? request.user.name : (request.body?.resolvedBy || 'Staff');
    const resolved = await alertEngine.resolveAlert(id, resolvedBy);
    if (!resolved) {
      reply.code(404);
      return { success: false, error: 'Alert not found' };
    }
    return { success: true, alert: resolved };
  });

  app.get('/thresholds', async () => {
    const thresholds = await prisma.alertThreshold.findMany();
    return { success: true, thresholds };
  });

  app.put<{
    Params: { measurement: string };
    Body: { minWarning?: number; maxWarning?: number; minCritical?: number; maxCritical?: number; unit?: string };
  }>('/thresholds/:measurement', {
    preHandler: [requireRoles(['admin'])],
  }, async (request) => {
    const { measurement } = request.params;
    const { minWarning, maxWarning, minCritical, maxCritical, unit } = request.body ?? {};

    const threshold = await prisma.alertThreshold.upsert({
      where: { measurement },
      update: {
        minWarning: minWarning !== undefined ? minWarning : undefined,
        maxWarning: maxWarning !== undefined ? maxWarning : undefined,
        minCritical: minCritical !== undefined ? minCritical : undefined,
        maxCritical: maxCritical !== undefined ? maxCritical : undefined,
        unit: unit ?? undefined,
      },
      create: {
        measurement,
        minWarning,
        maxWarning,
        minCritical,
        maxCritical,
        unit: unit ?? '',
      },
    });

    await alertEngine.reloadThresholds();
    return { success: true, threshold };
  });
}
