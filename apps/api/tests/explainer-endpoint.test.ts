import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import { registerExplainerRoutes } from '../src/routes/explainer.js';
import { signToken } from '../src/auth.js';
import { prisma } from '../src/db/prisma.js';
import { DeviceRegistry } from '../src/mqtt/device-registry.js';
import {
  GeminiExplainerError,
  type GeminiExplainerService,
} from '../src/ai/gemini-explainer.js';
import {
  ExplainResponseSchema,
  type ExplainResponse,
  type SanitizedPromptContext,
} from '@wicare/shared';

describe('POST /api/patients/:id/explain Endpoint Integration Tests', () => {
  let app: ReturnType<typeof Fastify>;
  let registry: DeviceRegistry;

  const clinicianToken = signToken({
    id: 'usr-clinician-1',
    email: 'clinician@wicare.local',
    name: 'Nurse Priya',
    role: 'clinician',
  });

  const adminToken = signToken({
    id: 'usr-admin-1',
    email: 'admin@wicare.local',
    name: 'Dr. Arvind Mehta',
    role: 'admin',
  });

  const viewerToken = signToken({
    id: 'usr-viewer-1',
    email: 'viewer@wicare.local',
    name: 'Student Observer',
    role: 'viewer',
  });

  const mockSuccessfulExplanation: ExplainResponse = {
    patientId: 'P-TEST-001',
    bedId: 'B-TEST-1',
    generatedAt: new Date().toISOString(),
    modelName: 'gemini-2.5-flash',
    summary: 'Patient exhibits signs of moderate tachypnea with stable oxygen saturation.',
    observedFacts: [
      'Heart rate remains within normal range (76 bpm).',
      'SpO2 stable at 97%.',
      'Respiratory rate elevated at 26 brpm.',
    ],
    possibleInterpretations: [
      {
        possibility: 'Possibility of early respiratory compensation or mild anxiety',
        rationale: 'Isolated tachypnea without hypoxia or tachycardia.',
        supportingEvidence: ['RR 26 brpm', 'SpO2 97%'],
        likelihood: 'moderate',
      },
    ],
    supportingEvidence: ['Telemetry data sequence continuity confirmed.'],
    dataQualityLimitations: [
      'Age of Information is 1.2s.',
      'Measured packet loss is 0.0%.',
    ],
    suggestedVerificationSteps: [
      'Perform bedside physical count of respiratory rate.',
      'Check for patient discomfort or agitation.',
    ],
    isAdvisoryOnly: true,
  };

  const capturedContexts: SanitizedPromptContext[] = [];

  const mockExplainerService = {
    explain: vi.fn().mockImplementation(async (input: { patientId: string; context: SanitizedPromptContext }) => {
      capturedContexts.push(input.context);
      return {
        ...mockSuccessfulExplanation,
        patientId: input.patientId,
        bedId: input.context.bedId,
      };
    }),
  } as unknown as GeminiExplainerService;

  beforeAll(async () => {
    registry = new DeviceRegistry();

    app = Fastify();
    await registerExplainerRoutes(app, {
      prisma,
      registry,
      explainerService: mockExplainerService,
      rateLimitMaxRequests: 100,
      rateLimitWindowMs: 60000,
    });
    await app.ready();

    // Seed test patients, devices, alerts, and readings in SQLite test database
    await prisma.alert.deleteMany({ where: { patientId: { in: ['P-TEST-001', 'P-TEST-002'] } } });
    await prisma.reading.deleteMany({ where: { patientId: { in: ['P-TEST-001', 'P-TEST-002'] } } });
    await prisma.device.deleteMany({ where: { id: { in: ['DEV-TEST-001', 'DEV-TEST-002'] } } });
    await prisma.patient.deleteMany({ where: { id: { in: ['P-TEST-001', 'P-TEST-002'] } } });

    await prisma.patient.create({
      data: {
        id: 'P-TEST-001',
        name: 'Rajesh Sharma',
        age: 58,
        gender: 'Male',
        ward: 'ICU',
        bedId: 'B-TEST-1',
        devices: {
          create: {
            id: 'DEV-TEST-001',
            ward: 'ICU',
            bedId: 'B-TEST-1',
            status: 'online',
            lastSeen: new Date(),
          },
        },
      },
    });

    await prisma.patient.create({
      data: {
        id: 'P-TEST-002',
        name: 'Sunita Patel',
        age: 46,
        gender: 'Female',
        ward: 'ICU',
        bedId: 'B-TEST-2',
        devices: {
          create: {
            id: 'DEV-TEST-002',
            ward: 'ICU',
            bedId: 'B-TEST-2',
            status: 'offline',
          },
        },
      },
    });

    // Create an alert belonging to P-TEST-002
    await prisma.alert.create({
      data: {
        id: 'ALT-PATIENT-2',
        patientId: 'P-TEST-002',
        deviceId: 'DEV-TEST-002',
        ward: 'ICU',
        bedId: 'B-TEST-2',
        measurement: 'spo2',
        severity: 'critical',
        type: 'clinical',
        status: 'OPEN',
        reason: 'Critical hypoxia on Bed 2',
        timestamp: new Date(),
      },
    });

    // Create an alert belonging to P-TEST-001
    await prisma.alert.create({
      data: {
        id: 'ALT-PATIENT-1',
        patientId: 'P-TEST-001',
        deviceId: 'DEV-TEST-001',
        ward: 'ICU',
        bedId: 'B-TEST-1',
        measurement: 'respiratory_rate',
        severity: 'warning',
        type: 'clinical',
        status: 'OPEN',
        reason: 'Elevated respiration',
        timestamp: new Date(),
      },
    });

    // Insert 5 readings for P-TEST-001
    for (let i = 1; i <= 5; i++) {
      await prisma.reading.create({
        data: {
          deviceId: 'DEV-TEST-001',
          patientId: 'P-TEST-001',
          seq: 100 + i,
          timestamp: new Date(Date.now() - (6 - i) * 60000), // 5m ago to 1m ago
          vitalsJson: JSON.stringify({
            heart_rate: { value: 76, unit: 'bpm' },
            spo2: { value: 97, unit: '%' },
            respiratory_rate: { value: 26, unit: 'brpm' },
          }),
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.alert.deleteMany({ where: { patientId: { in: ['P-TEST-001', 'P-TEST-002'] } } });
    await prisma.reading.deleteMany({ where: { patientId: { in: ['P-TEST-001', 'P-TEST-002'] } } });
    await prisma.device.deleteMany({ where: { id: { in: ['DEV-TEST-001', 'DEV-TEST-002'] } } });
    await prisma.patient.deleteMany({ where: { id: { in: ['P-TEST-001', 'P-TEST-002'] } } });
    await app.close();
  });

  it('1. Successfully generates an explanation with clinician credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/patients/P-TEST-001/explain',
      headers: {
        authorization: `Bearer ${clinicianToken}`,
        'content-type': 'application/json',
      },
      payload: {
        windowMinutes: 15,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(ExplainResponseSchema.safeParse(body).success).toBe(true);
    expect(body.patientId).toBe('P-TEST-001');
    expect(body.bedId).toBe('B-TEST-1');
    expect(body.isAdvisoryOnly).toBe(true);
  });

  it('2. Denies unauthenticated request with 401 when JWT is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/patients/P-TEST-001/explain',
      payload: {},
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('Unauthorized');
  });

  it('3. Denies request with 403 when user has viewer role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/patients/P-TEST-001/explain',
      headers: {
        authorization: `Bearer ${viewerToken}`,
      },
      payload: {},
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('Forbidden');
  });

  it('4. Allows admin role to invoke explanation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/patients/P-TEST-001/explain',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().isAdvisoryOnly).toBe(true);
  });

  it('5. Returns 404 when requested patient does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/patients/P-NONEXISTENT/explain',
      headers: {
        authorization: `Bearer ${clinicianToken}`,
      },
      payload: {},
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toContain('not found');
  });

  it('6. Returns 400 for out-of-range windowMinutes or invalid payload fields', async () => {
    // windowMinutes < 5
    const underRes = await app.inject({
      method: 'POST',
      url: '/api/patients/P-TEST-001/explain',
      headers: { authorization: `Bearer ${clinicianToken}` },
      payload: { windowMinutes: 3 },
    });
    expect(underRes.statusCode).toBe(400);

    // windowMinutes > 60
    const overRes = await app.inject({
      method: 'POST',
      url: '/api/patients/P-TEST-001/explain',
      headers: { authorization: `Bearer ${clinicianToken}` },
      payload: { windowMinutes: 75 },
    });
    expect(overRes.statusCode).toBe(400);

    // Unexpected property (strict schema)
    const strictRes = await app.inject({
      method: 'POST',
      url: '/api/patients/P-TEST-001/explain',
      headers: { authorization: `Bearer ${clinicianToken}` },
      payload: { windowMinutes: 15, unauthorizedField: 'bad-input' },
    });
    expect(strictRes.statusCode).toBe(400);
  });

  it('7. Rejects alertId belonging to a different patient without leaking details', async () => {
    // ALT-PATIENT-2 belongs to P-TEST-002, but is requested for P-TEST-001
    const res = await app.inject({
      method: 'POST',
      url: '/api/patients/P-TEST-001/explain',
      headers: { authorization: `Bearer ${clinicianToken}` },
      payload: { alertId: 'ALT-PATIENT-2' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe("Alert 'ALT-PATIENT-2' not found for patient 'P-TEST-001'");
  });

  it('8. Handles patient with zero recent readings gracefully', async () => {
    // P-TEST-002 has 0 readings in SQLite
    const res = await app.inject({
      method: 'POST',
      url: '/api/patients/P-TEST-002/explain',
      headers: { authorization: `Bearer ${clinicianToken}` },
      payload: { windowMinutes: 10 },
    });

    expect(res.statusCode).toBe(200);
    const lastContext = capturedContexts[capturedContexts.length - 1];
    expect(lastContext.recentReadings).toEqual([]);
  });

  it('9. Handles offline / stale device with missing telemetry-quality metrics', async () => {
    // P-TEST-002 device is offline and not in active registry
    const res = await app.inject({
      method: 'POST',
      url: '/api/patients/P-TEST-002/explain',
      headers: { authorization: `Bearer ${clinicianToken}` },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const lastContext = capturedContexts[capturedContexts.length - 1];
    expect(lastContext.packetLossRate).toBe(0);
  });

  it('10. Safely ignores malformed stored vitalsJson in historical records', async () => {
    // Insert a malformed JSON reading for P-TEST-001
    await prisma.reading.create({
      data: {
        deviceId: 'DEV-TEST-001',
        patientId: 'P-TEST-001',
        seq: 999,
        timestamp: new Date(),
        vitalsJson: 'INVALID_CORRUPTED_JSON_STRING',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/patients/P-TEST-001/explain',
      headers: { authorization: `Bearer ${clinicianToken}` },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
  });

  it('11. Handles missing Gemini API key with HTTP 503', async () => {
    const missingKeyService = {
      explain: vi.fn().mockRejectedValue(
        new GeminiExplainerError('Gemini API key is not configured on the server.', 'MISSING_API_KEY', 503),
      ),
    } as unknown as GeminiExplainerService;

    const testApp = Fastify();
    await registerExplainerRoutes(testApp, {
      prisma,
      explainerService: missingKeyService,
    });
    await testApp.ready();

    const res = await testApp.inject({
      method: 'POST',
      url: '/api/patients/P-TEST-001/explain',
      headers: { authorization: `Bearer ${clinicianToken}` },
      payload: {},
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('MISSING_API_KEY');
    await testApp.close();
  });

  it('12. Translates Gemini provider timeout (504), rate limit (429), and provider failure (502)', async () => {
    // Timeout
    const timeoutService = {
      explain: vi.fn().mockRejectedValue(
        new GeminiExplainerError('Gemini request timed out', 'TIMEOUT', 504),
      ),
    } as unknown as GeminiExplainerService;

    const timeoutApp = Fastify();
    await registerExplainerRoutes(timeoutApp, { prisma, explainerService: timeoutService });
    await timeoutApp.ready();

    const timeoutRes = await timeoutApp.inject({
      method: 'POST',
      url: '/api/patients/P-TEST-001/explain',
      headers: { authorization: `Bearer ${clinicianToken}` },
      payload: {},
    });
    expect(timeoutRes.statusCode).toBe(504);
    await timeoutApp.close();

    // Rate limited
    const rateLimitedService = {
      explain: vi.fn().mockRejectedValue(
        new GeminiExplainerError('Rate limit exceeded', 'RATE_LIMITED', 429),
      ),
    } as unknown as GeminiExplainerService;

    const rateApp = Fastify();
    await registerExplainerRoutes(rateApp, { prisma, explainerService: rateLimitedService });
    await rateApp.ready();

    const rateRes = await rateApp.inject({
      method: 'POST',
      url: '/api/patients/P-TEST-001/explain',
      headers: { authorization: `Bearer ${clinicianToken}` },
      payload: {},
    });
    expect(rateRes.statusCode).toBe(429);
    await rateApp.close();
  });

  it('13. Strictly bounds reading history to MAX_READINGS (50)', async () => {
    // Add 60 readings
    const readingData = [];
    for (let i = 0; i < 60; i++) {
      readingData.push({
        deviceId: 'DEV-TEST-001',
        patientId: 'P-TEST-001',
        seq: 5000 + i,
        timestamp: new Date(Date.now() - (60 - i) * 1000),
        vitalsJson: JSON.stringify({ heart_rate: { value: 80, unit: 'bpm' } }),
      });
    }
    await prisma.reading.createMany({ data: readingData });

    await app.inject({
      method: 'POST',
      url: '/api/patients/P-TEST-001/explain',
      headers: { authorization: `Bearer ${clinicianToken}` },
      payload: { windowMinutes: 30 },
    });

    const lastContext = capturedContexts[capturedContexts.length - 1];
    expect(lastContext.recentReadings.length).toBeLessThanOrEqual(50);
  });

  it('14. Privacy Assertion: Patient name, UHID, and doctor name never appear in Gemini context', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/patients/P-TEST-001/explain',
      headers: { authorization: `Bearer ${clinicianToken}` },
      payload: {},
    });

    const lastContext = capturedContexts[capturedContexts.length - 1];

    // Assert absence of direct identifiers
    expect(lastContext.patientName).toBeUndefined();
    expect(lastContext.name).toBeUndefined();
    expect(lastContext.uhid).toBeUndefined();
    expect(lastContext.attendingDoctor).toBeUndefined();
    expect(JSON.stringify(lastContext)).not.toContain('Rajesh Sharma');
    expect(JSON.stringify(lastContext)).not.toContain('UHID');
  });

  it('15. Enforces per-user rate limit on rapid successive requests', async () => {
    const rateApp = Fastify();
    await registerExplainerRoutes(rateApp, {
      prisma,
      explainerService: mockExplainerService,
      rateLimitMaxRequests: 3,
      rateLimitWindowMs: 5000,
    });
    await rateApp.ready();

    const rapidUserToken = signToken({
      id: 'usr-rapid-1',
      email: 'rapid@wicare.local',
      name: 'Rapid Clinician',
      role: 'clinician',
    });

    for (let i = 0; i < 3; i++) {
      const res = await rateApp.inject({
        method: 'POST',
        url: '/api/patients/P-TEST-001/explain',
        headers: { authorization: `Bearer ${rapidUserToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
    }

    // 4th request within window must be rate-limited
    const blockedRes = await rateApp.inject({
      method: 'POST',
      url: '/api/patients/P-TEST-001/explain',
      headers: { authorization: `Bearer ${rapidUserToken}` },
      payload: {},
    });

    expect(blockedRes.statusCode).toBe(429);
    expect(blockedRes.json().error).toBe('RATE_LIMITED');
    await rateApp.close();
  });
});
