import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma as defaultPrisma } from '../db/prisma.js';
import type { DeviceRegistry } from '../mqtt/device-registry.js';
import { requireRoles } from '../auth.js';
import {
  ExplainRequestSchema,
  getIndianPatientProfile,
  type SanitizedPromptContext,
} from '@wicare/shared';
import {
  GeminiExplainerService,
  GeminiExplainerError,
} from '../ai/gemini-explainer.js';
import type { PrismaClient } from '@prisma/client';

export interface ExplainerRoutesOptions {
  prisma?: PrismaClient;
  registry?: DeviceRegistry;
  explainerService?: GeminiExplainerService;
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
}

export async function registerExplainerRoutes(
  app: FastifyInstance,
  options: ExplainerRoutesOptions = {},
): Promise<void> {
  const prisma = options.prisma ?? defaultPrisma;
  const registry = options.registry;
  const explainerService = options.explainerService ?? new GeminiExplainerService();
  const rateLimitWindowMs = options.rateLimitWindowMs ?? 60000;
  const rateLimitMaxRequests = options.rateLimitMaxRequests ?? 10;

  // In-memory per-user sliding window rate limiter
  const userRateLimits = new Map<string, { count: number; resetAt: number }>();

  function checkUserRateLimit(userId: string): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const record = userRateLimits.get(userId);
    if (!record || now > record.resetAt) {
      userRateLimits.set(userId, { count: 1, resetAt: now + rateLimitWindowMs });
      return { allowed: true };
    }
    if (record.count >= rateLimitMaxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
      return { allowed: false, retryAfterSeconds };
    }
    record.count++;
    return { allowed: true };
  }

  const handler = async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: unknown;
    }>,
    reply: FastifyReply,
  ) => {
    // 1. Enforce per-user rate limiting
    const userId = request.user?.id || 'anonymous';
    const rateCheck = checkUserRateLimit(userId);
    if (!rateCheck.allowed) {
      reply.header('Retry-After', String(rateCheck.retryAfterSeconds ?? 60));
      return reply.code(429).send({
        error: 'RATE_LIMITED',
        message: 'Rate limit exceeded for AI clinical explanations. Please wait before trying again.',
      });
    }

    // 2. Validate request parameters
    const parseResult = ExplainRequestSchema.safeParse(request.body ?? {});
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid explain request parameters',
        issues: parseResult.error.issues,
      });
    }

    const { alertId, windowMinutes = 15 } = parseResult.data;
    const { id: patientId } = request.params;

    // 3. Verify requested patient exists
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: { devices: true },
    });

    if (!patient) {
      return reply.code(404).send({
        error: 'Not Found',
        message: `Patient '${patientId}' not found`,
      });
    }

    // 4. Verify alertId belongs to this patient if supplied
    if (alertId) {
      const alert = await prisma.alert.findUnique({
        where: { id: alertId },
      });

      if (!alert || alert.patientId !== patientId) {
        return reply.code(404).send({
          error: 'Not Found',
          message: `Alert '${alertId}' not found for patient '${patientId}'`,
        });
      }
    }

    // 5. Query recent readings within bounded time window (strictly capped to 50 records)
    const windowMs = windowMinutes * 60 * 1000;
    const fromDate = new Date(Date.now() - windowMs);
    const MAX_READINGS = 50;

    const rawReadings = await prisma.reading.findMany({
      where: {
        patientId,
        timestamp: { gte: fromDate },
      },
      orderBy: { timestamp: 'desc' },
      take: MAX_READINGS,
    });

    // Safely parse stored vitalsJson
    const recentReadings: SanitizedPromptContext['recentReadings'] = [];
    for (const r of [...rawReadings].reverse()) {
      try {
        const parsedVitals = JSON.parse(r.vitalsJson);
        const validVitals: Record<string, { value: number; unit: string }> = {};

        if (typeof parsedVitals === 'object' && parsedVitals !== null) {
          for (const [k, v] of Object.entries(parsedVitals)) {
            if (typeof v === 'object' && v !== null) {
              const vObj = v as Record<string, unknown>;
              if (typeof vObj.value === 'number') {
                validVitals[k] = {
                  value: vObj.value,
                  unit: typeof vObj.unit === 'string' ? vObj.unit : '',
                };
              }
            }
          }
        }

        recentReadings.push({
          timestamp: r.timestamp.toISOString(),
          seq: r.seq,
          vitals: validVitals,
        });
      } catch {
        // Malformed or corrupt JSON in historical records is gracefully skipped
      }
    }

    // 6. Query relevant active alerts for this patient
    const activeAlertsFromDb = await prisma.alert.findMany({
      where: {
        patientId,
        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
      },
      orderBy: { timestamp: 'desc' },
      take: 10,
    });

    const activeAlerts = activeAlertsFromDb.map((a) => ({
      measurement: a.measurement,
      severity: a.severity,
      value: a.value ?? null,
      reason: a.reason,
      timestamp: a.timestamp.toISOString(),
    }));

    // 7. Query configured ward safety thresholds
    const allThresholds = await prisma.alertThreshold.findMany();
    const thresholds = allThresholds.map((t) => ({
      measurement: t.measurement,
      minWarning: t.minWarning ?? null,
      maxWarning: t.maxWarning ?? null,
      minCritical: t.minCritical ?? null,
      maxCritical: t.maxCritical ?? null,
      unit: t.unit,
    }));

    // 8. Retrieve device link freshness (AoI) and packet loss metrics
    const device = patient.devices[0];
    const liveState = device ? registry?.get(device.id) : undefined;
    let telemetryFreshnessSeconds = 0;
    let packetLossRate = 0;

    const latestReading = rawReadings[0];
    if (liveState?.lastSeen) {
      const diffMs = Date.now() - new Date(liveState.lastSeen).getTime();
      telemetryFreshnessSeconds = Math.max(0, Math.round(diffMs / 1000));
    } else if (latestReading) {
      const latestTs = latestReading.timestamp.getTime();
      telemetryFreshnessSeconds = Math.max(0, Math.round((Date.now() - latestTs) / 1000));
    }

    if (device && registry) {
      const rawLoss = registry.getMeasuredLossRate(device.id);
      packetLossRate = Math.min(100, Math.max(0, Math.round(rawLoss * 1000) / 10));
    }

    // 9. Derive clinical diagnosis without direct identity
    const match = patient.id.match(/\d+/);
    const num = match ? parseInt(match[0], 10) : 1;
    const profile = getIndianPatientProfile(num);
    const primaryDiagnosis = profile?.primaryDiagnosis ?? 'ICU Patient';

    // 10. Assemble sanitized context strictly excluding names, UHIDs, doctor names, or internal IDs
    const context: SanitizedPromptContext = {
      bedId: patient.bedId,
      ward: patient.ward,
      age: patient.age,
      gender: patient.gender,
      primaryDiagnosis,
      recentReadings,
      activeAlerts,
      thresholds,
      telemetryFreshnessSeconds,
      packetLossRate,
    };

    // 11. Request explanation from GeminiExplainerService
    try {
      const result = await explainerService.explain({
        patientId,
        context,
      });

      return reply.code(200).send(result);
    } catch (err: unknown) {
      if (err instanceof GeminiExplainerError) {
        return reply.code(err.statusCode).send({
          error: err.code,
          message: err.message,
        });
      }

      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while generating the clinical explanation.',
      });
    }
  };

  // Register on both /api/patients/:id/explain and /patients/:id/explain
  app.post<{
    Params: { id: string };
    Body: unknown;
  }>(
    '/api/patients/:id/explain',
    {
      preHandler: [requireRoles(['admin', 'clinician'])],
    },
    handler,
  );

  app.post<{
    Params: { id: string };
    Body: unknown;
  }>(
    '/patients/:id/explain',
    {
      preHandler: [requireRoles(['admin', 'clinician'])],
    },
    handler,
  );
}
