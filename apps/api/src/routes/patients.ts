import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import type { DeviceRegistry } from '../mqtt/device-registry.js';
import type { AlertEngine } from '../alerts/alert-engine.js';
import { getIndianPatientProfile } from '@wicare/shared';

export async function registerPatientRoutes(
  app: FastifyInstance,
  registry: DeviceRegistry,
  alertEngine?: AlertEngine,
): Promise<void> {
  app.get<{ Querystring: { all?: string } }>('/patients', async (request) => {
    const showAll = request.query.all === 'true';

    const patients = await prisma.patient.findMany({
      include: {
        devices: true,
      },
      orderBy: { id: 'asc' },
    });

    const results = patients
      .map((p) => {
        const device = p.devices[0];
        const liveState = device ? registry.get(device.id) : undefined;

        let status: 'online' | 'stale' | 'offline' = 'offline';
        if (liveState && liveState.online) {
          if (liveState.lastSeen) {
            const diffMs = Date.now() - new Date(liveState.lastSeen).getTime();
            status = diffMs > 15000 ? 'stale' : 'online';
          } else {
            status = 'online';
          }
        }

        const aiData = alertEngine?.getAiPatientScore(p.id);

        const match = p.id.match(/\d+/);
        const num = match ? parseInt(match[0], 10) : 1;
        const profile = getIndianPatientProfile(num);

        return {
          id: p.id,
          name: p.name || profile.name,
          age: p.age || profile.age,
          gender: p.gender || profile.gender,
          bloodGroup: profile.bloodGroup,
          uhid: profile.uhid,
          primaryDiagnosis: profile.primaryDiagnosis,
          attendingDoctor: profile.attendingDoctor,
          admissionDate: profile.admissionDate,
          allergies: profile.allergies,
          comorbidities: profile.comorbidities,
          baselineLabs: profile.baselineLabs,
          clinicalNotes: profile.clinicalNotes,
          ward: p.ward || profile.ward,
          bedId: p.bedId || profile.bedId,
          deviceId: device?.id ?? profile.deviceId,
          status,
          lastSeen: liveState?.lastSeen ?? null,
          lastSeq: liveState?.lastSeq ?? null,
          totalReceived: liveState?.totalReceived ?? 0,
          measuredLossRate: device ? registry.getMeasuredLossRate(device.id) : 0,
          aiRiskScore: aiData?.riskScore ?? null,
          aiLabel: aiData?.label ?? null,
          aiExplanations: aiData?.explanations ?? [],
          isLive: Boolean(liveState && liveState.online && status === 'online'),
        };
      })
      .filter((p) => (showAll ? true : p.isLive));

    return {
      count: results.length,
      patients: results,
    };
  });

  app.get<{ Params: { id: string } }>('/patients/:id', async (request, reply) => {
    const { id } = request.params;
    const patient = await prisma.patient.findUnique({
      where: { id },
      include: { devices: true },
    });

    if (!patient) {
      reply.code(404);
      return { error: 'Patient not found', patientId: id };
    }

    const device = patient.devices[0];
    const liveState = device ? registry.get(device.id) : undefined;
    const isOnline = liveState ? liveState.online : device?.status === 'online';

    let status: 'online' | 'stale' | 'offline' = isOnline ? 'online' : 'offline';
    if (isOnline && liveState?.lastSeen) {
      const diffMs = Date.now() - new Date(liveState.lastSeen).getTime();
      if (diffMs > 15000) status = 'stale';
    }

    return {
      ...patient,
      deviceId: device?.id ?? null,
      status,
      lastSeen: liveState?.lastSeen ?? device?.lastSeen?.toISOString() ?? null,
      measuredLossRate: device ? registry.getMeasuredLossRate(device.id) : 0,
    };
  });

  app.get<{
    Params: { id: string };
    Querystring: { from?: string; to?: string; limit?: string };
  }>('/patients/:id/readings', async (request, reply) => {
    const { id } = request.params;
    const { from, to, limit: limitStr } = request.query;

    const patient = await prisma.patient.findUnique({
      where: { id },
    });

    if (!patient) {
      reply.code(404);
      return { error: 'Patient not found', patientId: id };
    }

    const limit = Math.min(1000, Math.max(1, parseInt(limitStr ?? '100', 10) || 100));

    const whereClause: {
      patientId: string;
      timestamp?: { gte?: Date; lte?: Date };
    } = { patientId: id };

    if (from || to) {
      whereClause.timestamp = {};
      if (from) whereClause.timestamp.gte = new Date(from);
      if (to) whereClause.timestamp.lte = new Date(to);
    }

    const readings = await prisma.reading.findMany({
      where: whereClause,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    const parsedReadings = readings.reverse().map((r) => {
      let vitals = {};
      try {
        vitals = JSON.parse(r.vitalsJson);
      } catch {
        // fallback
      }
      return {
        id: r.id,
        deviceId: r.deviceId,
        patientId: r.patientId,
        seq: r.seq,
        timestamp: r.timestamp.toISOString(),
        vitals,
        qos: r.qos,
      };
    });

    return {
      patientId: id,
      count: parsedReadings.length,
      readings: parsedReadings,
    };
  });

  app.post<{ Params: { id: string } }>('/patients/:id/ai-score', async (request, reply) => {
    const { id } = request.params;
    if (!alertEngine) {
      return reply.status(503).send({ success: false, message: 'Alert engine not initialized' });
    }
    const score = await alertEngine.evaluateOnDemandAiRiskScore(id);
    if (!score) {
      return reply.status(503).send({
        success: false,
        message: 'AI engine service (http://127.0.0.1:8000) is offline or insufficient vitals in window.',
      });
    }
    return {
      success: true,
      ...score,
    };
  });

  app.post<{ Params: { id: string } }>('/api/patients/:id/ai-score', async (request, reply) => {
    const { id } = request.params;
    if (!alertEngine) {
      return reply.status(503).send({ success: false, message: 'Alert engine not initialized' });
    }
    const score = await alertEngine.evaluateOnDemandAiRiskScore(id);
    if (!score) {
      return reply.status(503).send({
        success: false,
        message: 'AI engine service (http://127.0.0.1:8000) is offline or insufficient vitals in window.',
      });
    }
    return {
      success: true,
      ...score,
    };
  });
}
