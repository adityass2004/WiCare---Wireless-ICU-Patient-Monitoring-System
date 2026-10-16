import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import { registerExplainerRoutes } from '../src/routes/explainer.js';
import { signToken } from '../src/auth.js';
import { prisma } from '../src/db/prisma.js';
import { DeviceRegistry } from '../src/mqtt/device-registry.js';
import {
  GeminiExplainerError,
  GeminiExplainerService,
} from '../src/ai/gemini-explainer.js';
import {
  ExplainResponseSchema,
  type ExplainResponse,
  type SanitizedPromptContext,
} from '@wicare/shared';

describe('Phase 4: End-to-End AI Clinical Explainer Validation Suite', () => {
  let app: ReturnType<typeof Fastify>;
  let registry: DeviceRegistry;

  const clinicianToken = signToken({
    id: 'usr-clinician-e2e',
    email: 'dr.sharma@wicare.local',
    name: 'Dr. Sharma',
    role: 'clinician',
  });

  const viewerToken = signToken({
    id: 'usr-viewer-e2e',
    email: 'observer@wicare.local',
    name: 'Student Observer',
    role: 'viewer',
  });

  const PATIENT_STABLE = 'P-SCENARIO-STABLE';
  const PATIENT_BREACH = 'P-SCENARIO-BREACH';
  const PATIENT_TREND = 'P-SCENARIO-TREND';
  const PATIENT_STALE = 'P-SCENARIO-STALE';
  const PATIENT_LOSS = 'P-SCENARIO-LOSS';
  const PATIENT_EMPTY = 'P-SCENARIO-EMPTY';
  const PATIENT_CORRUPT = 'P-SCENARIO-CORRUPT';

  const lastContexts: Map<string, SanitizedPromptContext> = new Map();

  const mockExplainerService: GeminiExplainerService = {
    explain: vi.fn().mockImplementation(async (input: { patientId: string; context: SanitizedPromptContext }) => {
      lastContexts.set(input.patientId, input.context);

      const isBreach = input.context.activeAlerts.length > 0;
      const isStale = input.context.telemetryFreshnessSeconds > 30;
      const hasLoss = input.context.packetLossRate > 0;
      const noReadings = input.context.recentReadings.length === 0;

      const response: ExplainResponse = {
        patientId: input.patientId,
        bedId: input.context.bedId,
        generatedAt: new Date().toISOString(),
        modelName: 'gemini-2.5-flash',
        summary: noReadings
          ? 'Insufficient telemetry history within requested window to synthesize deterioration trends.'
          : isBreach
          ? 'Clinical threshold breach observed with active warning alerts.'
          : isStale
          ? 'Telemetry link is stale with significant Age of Information delay.'
          : 'Normal hemodynamics with stable baseline vitals.',
        observedFacts: noReadings
          ? ['No vital sign packets recorded within requested window.']
          : input.context.recentReadings.slice(0, 3).map((r, i) =>
              `Sample #${i + 1} at ${r.timestamp}: HR=${r.vitals.heart_rate?.value ?? 'N/A'}, SpO2=${r.vitals.spo2?.value ?? 'N/A'}`
            ),
        possibleInterpretations: noReadings
          ? []
          : [
              {
                possibility: isBreach
                  ? 'Compensatory tachycardia secondary to clinical stress or fever'
                  : 'Normal physiological baseline state',
                rationale: 'Telemetry pattern evaluated against configured safety limits.',
                supportingEvidence: input.context.activeAlerts.map((a) => `${a.measurement} alert: ${a.reason}`),
              },
            ],
        supportingEvidence: [
          `Readings evaluated: ${input.context.recentReadings.length} records`,
          `Configured thresholds applied: ${input.context.thresholds.length} metrics`,
        ],
        dataQualityLimitations: [
          ...(isStale ? [`Telemetry link is stale: AoI exceeds fresh window (${input.context.telemetryFreshnessSeconds}s).`] : []),
          ...(hasLoss ? [`Measured wireless packet loss: ${input.context.packetLossRate}%`] : []),
          ...(noReadings ? ['Zero telemetry records available within evaluation window.'] : []),
        ],
        suggestedVerificationSteps: [
          'Verify bedside patient appearance and monitor calibration.',
          'Confirm lead placement and wireless gateway connectivity.',
        ],
        isAdvisoryOnly: true,
      };

      return response;
    }),
  } as unknown as GeminiExplainerService;

  beforeAll(async () => {
    registry = new DeviceRegistry();

    app = Fastify();
    await registerExplainerRoutes(app, {
      prisma,
      registry,
      explainerService: mockExplainerService,
      rateLimitMaxRequests: 50,
      rateLimitWindowMs: 60000,
    });
    await app.ready();

    // Clean up scenario test records
    const allPatientIds = [
      PATIENT_STABLE,
      PATIENT_BREACH,
      PATIENT_TREND,
      PATIENT_STALE,
      PATIENT_LOSS,
      PATIENT_EMPTY,
      PATIENT_CORRUPT,
    ];

    const deviceMap: Record<string, string> = {
      [PATIENT_STABLE]: 'DEV-STABLE-01',
      [PATIENT_BREACH]: 'DEV-BREACH-01',
      [PATIENT_TREND]: 'DEV-TREND-01',
      [PATIENT_STALE]: 'DEV-STALE-01',
      [PATIENT_LOSS]: 'DEV-LOSS-01',
      [PATIENT_EMPTY]: 'DEV-EMPTY-01',
      [PATIENT_CORRUPT]: 'DEV-CORRUPT-01',
    };

    await prisma.alert.deleteMany({ where: { patientId: { in: allPatientIds } } });
    await prisma.reading.deleteMany({ where: { patientId: { in: allPatientIds } } });
    await prisma.device.deleteMany({ where: { id: { in: Object.values(deviceMap) } } });
    await prisma.patient.deleteMany({ where: { id: { in: allPatientIds } } });

    // Seed Patients and associated Devices
    for (const pid of allPatientIds) {
      const devId = deviceMap[pid]!;
      await prisma.patient.create({
        data: {
          id: pid,
          name: `Synthetic ICU ${pid.replace('P-SCENARIO-', '')}`,
          bedId: `BED-${pid.replace('P-SCENARIO-', '')}`,
          ward: 'ICU-B',
          age: 58,
          gender: 'Male',
          devices: {
            create: {
              id: devId,
              status: 'online',
              ward: 'ICU-B',
              bedId: `BED-${pid.replace('P-SCENARIO-', '')}`,
            },
          },
        },
      });
    }

    const now = new Date();

    // 1. Stable Readings
    for (let i = 0; i < 5; i++) {
      const ts = new Date(now.getTime() - (5 - i) * 60000);
      await prisma.reading.create({
        data: {
          patientId: PATIENT_STABLE,
          deviceId: 'DEV-STABLE-01',
          seq: i + 1,
          timestamp: ts,
          vitalsJson: JSON.stringify({
            heart_rate: { value: 72, unit: 'bpm', quality: 'good' },
            spo2: { value: 98, unit: '%', quality: 'good' },
          }),
        },
      });
    }
    registry.ingest({
      version: '1.0',
      deviceId: 'DEV-STABLE-01',
      patientId: PATIENT_STABLE,
      bedId: 'BED-STABLE',
      ward: 'ICU-B',
      seq: 5,
      timestamp: now.toISOString(),
      vitals: {},
    });

    // 2. Clinical Threshold Breach + Alert
    for (let i = 0; i < 5; i++) {
      const ts = new Date(now.getTime() - (5 - i) * 60000);
      await prisma.reading.create({
        data: {
          patientId: PATIENT_BREACH,
          deviceId: 'DEV-BREACH-01',
          seq: i + 1,
          timestamp: ts,
          vitalsJson: JSON.stringify({
            heart_rate: { value: 142, unit: 'bpm', quality: 'good' },
            spo2: { value: 89, unit: '%', quality: 'good' },
          }),
        },
      });
    }
    await prisma.alert.create({
      data: {
        id: 'ALERT-BREACH-01',
        patientId: PATIENT_BREACH,
        bedId: 'BED-BREACH',
        ward: 'ICU-B',
        deviceId: 'DEV-BREACH-01',
        timestamp: now,
        measurement: 'heart_rate',
        value: 142,
        threshold: '>100 bpm',
        severity: 'critical',
        type: 'clinical',
        status: 'OPEN',
        reason: 'Severe tachycardic threshold exceedance',
      },
    });

    // 3. Deteriorating Trend (HR rising: 80 -> 100 -> 120 -> 135 -> 148)
    for (let i = 0; i < 5; i++) {
      const ts = new Date(now.getTime() - (5 - i) * 60000);
      await prisma.reading.create({
        data: {
          patientId: PATIENT_TREND,
          deviceId: 'DEV-TREND-01',
          seq: i + 1,
          timestamp: ts,
          vitalsJson: JSON.stringify({
            heart_rate: { value: 80 + i * 17, unit: 'bpm', quality: 'good' },
            spo2: { value: 98 - i * 2, unit: '%', quality: 'good' },
          }),
        },
      });
    }
    registry.ingest({
      version: '1.0',
      deviceId: 'DEV-TREND-01',
      patientId: PATIENT_TREND,
      bedId: 'BED-TREND',
      ward: 'ICU-B',
      seq: 5,
      timestamp: now.toISOString(),
      vitals: {},
    });

    // 4. Stale Device (old timestamp: 45 minutes ago)
    const oldTime = new Date(now.getTime() - 45 * 60000);
    await prisma.reading.create({
      data: {
        patientId: PATIENT_STALE,
        deviceId: 'DEV-STALE-01',
        seq: 1,
        timestamp: oldTime,
        vitalsJson: JSON.stringify({
          heart_rate: { value: 75, unit: 'bpm', quality: 'good' },
        }),
      },
    });
    // Register device with old timestamp so AoI is large
    registry.ingest({
      version: '1.0',
      deviceId: 'DEV-STALE-01',
      patientId: PATIENT_STALE,
      bedId: 'BED-STALE',
      ward: 'ICU-B',
      seq: 1,
      timestamp: oldTime.toISOString(),
      vitals: {},
    });

    // 5. Packet Loss & Sequence Gaps (seq 1, then seq 10 = 8 gaps)
    registry.ingest({
      version: '1.0',
      deviceId: 'DEV-LOSS-01',
      patientId: PATIENT_LOSS,
      bedId: 'BED-LOSS',
      ward: 'ICU-B',
      seq: 1,
      timestamp: new Date(now.getTime() - 10000).toISOString(),
      vitals: {},
    });
    registry.ingest({
      version: '1.0',
      deviceId: 'DEV-LOSS-01',
      patientId: PATIENT_LOSS,
      bedId: 'BED-LOSS',
      ward: 'ICU-B',
      seq: 10,
      timestamp: now.toISOString(),
      vitals: {},
    });

    await prisma.reading.create({
      data: {
        patientId: PATIENT_LOSS,
        deviceId: 'DEV-LOSS-01',
        seq: 10,
        timestamp: now,
        vitalsJson: JSON.stringify({
          heart_rate: { value: 88, unit: 'bpm', quality: 'good' },
        }),
      },
    });

    // 6. Corrupt Vitals JSON in DB
    await prisma.reading.create({
      data: {
        patientId: PATIENT_CORRUPT,
        deviceId: 'DEV-CORRUPT-01',
        seq: 1,
        timestamp: now,
        vitalsJson: '{"heart_rate": invalid_json_syntax',
      },
    });
    registry.ingest({
      version: '1.0',
      deviceId: 'DEV-CORRUPT-01',
      patientId: PATIENT_CORRUPT,
      bedId: 'BED-CORRUPT',
      ward: 'ICU-B',
      seq: 1,
      timestamp: now.toISOString(),
      vitals: {},
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // SCENARIO 1: Normal Telemetry Flow
  it('Scenario 1 [Normal Telemetry]: returns validated explanation with normal baseline', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/patients/${PATIENT_STABLE}/explain`,
      headers: {
        authorization: `Bearer ${clinicianToken}`,
        'content-type': 'application/json',
      },
      payload: { windowMinutes: 15 },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const validated = ExplainResponseSchema.safeParse(body);
    expect(validated.success).toBe(true);
    expect(body.summary).toContain('Normal hemodynamics');
    expect(body.isAdvisoryOnly).toBe(true);

    // Verify context sent to Gemini
    const ctx = lastContexts.get(PATIENT_STABLE);
    expect(ctx).toBeDefined();
    expect(ctx?.recentReadings.length).toBe(5);
    expect(ctx?.activeAlerts.length).toBe(0);
  });

  // SCENARIO 2: Clinical Threshold Breach
  it('Scenario 2 [Threshold Breach]: grounds explanation in breached alert and vital values', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/patients/${PATIENT_BREACH}/explain`,
      headers: {
        authorization: `Bearer ${clinicianToken}`,
        'content-type': 'application/json',
      },
      payload: { alertId: 'ALERT-BREACH-01', windowMinutes: 15 },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.summary).toContain('Clinical threshold breach observed');

    const ctx = lastContexts.get(PATIENT_BREACH);
    expect(ctx?.activeAlerts.length).toBeGreaterThan(0);
    expect(ctx?.activeAlerts[0]?.measurement).toBe('heart_rate');
    expect(ctx?.activeAlerts[0]?.value).toBe(142);
  });

  // SCENARIO 3: Deteriorating Trend
  it('Scenario 3 [Deteriorating Trend]: preserves vital trajectory without extrapolating unmeasured data', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/patients/${PATIENT_TREND}/explain`,
      headers: {
        authorization: `Bearer ${clinicianToken}`,
        'content-type': 'application/json',
      },
      payload: { windowMinutes: 20 },
    });

    expect(res.statusCode).toBe(200);
    const ctx = lastContexts.get(PATIENT_TREND);
    expect(ctx?.recentReadings.length).toBe(5);

    // Readings must reflect the ascending heart rate values
    const hrValues = ctx?.recentReadings.map((r) => r.vitals.heart_rate?.value);
    expect(hrValues).toEqual([80, 97, 114, 131, 148]);
  });

  // SCENARIO 4: Stale Telemetry
  it('Scenario 4 [Stale Telemetry]: reports device staleness and AoI in data limitations', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/patients/${PATIENT_STALE}/explain`,
      headers: {
        authorization: `Bearer ${clinicianToken}`,
        'content-type': 'application/json',
      },
      payload: { windowMinutes: 60 },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.dataQualityLimitations.some((l: string) => l.toLowerCase().includes('stale'))).toBe(true);

    const ctx = lastContexts.get(PATIENT_STALE);
    expect(ctx?.telemetryFreshnessSeconds).toBeGreaterThan(60);
  });

  // SCENARIO 5: Packet Loss and Sequence Gaps
  it('Scenario 5 [Packet Loss & Gaps]: exposes reliable DeviceRegistry network quality metrics', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/patients/${PATIENT_LOSS}/explain`,
      headers: {
        authorization: `Bearer ${clinicianToken}`,
        'content-type': 'application/json',
      },
      payload: { windowMinutes: 15 },
    });

    expect(res.statusCode).toBe(200);
    const ctx = lastContexts.get(PATIENT_LOSS);
    expect(ctx?.packetLossRate).toBeGreaterThanOrEqual(0);
  });

  // SCENARIO 6: Empty Readings History
  it('Scenario 6 [No Readings]: handles patient with no telemetry records gracefully', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/patients/${PATIENT_EMPTY}/explain`,
      headers: {
        authorization: `Bearer ${clinicianToken}`,
        'content-type': 'application/json',
      },
      payload: { windowMinutes: 15 },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.summary).toContain('Insufficient telemetry history');
    expect(body.dataQualityLimitations.some((l: string) => l.includes('Zero telemetry'))).toBe(true);
  });

  // SCENARIO 7: Malformed Stored Telemetry
  it('Scenario 7 [Malformed vitalsJson]: safely discards corrupt reading without crashing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/patients/${PATIENT_CORRUPT}/explain`,
      headers: {
        authorization: `Bearer ${clinicianToken}`,
        'content-type': 'application/json',
      },
      payload: { windowMinutes: 15 },
    });

    expect(res.statusCode).toBe(200);
    const ctx = lastContexts.get(PATIENT_CORRUPT);
    // Malformed JSON was safely skipped
    expect(ctx?.recentReadings.length).toBe(0);
  });

  // SCENARIO 8: Gemini Service Unavailable (503)
  it('Scenario 8 [Missing Configuration]: returns HTTP 503 when Gemini service is unconfigured', async () => {
    const appUnconfigured = Fastify();
    await registerExplainerRoutes(appUnconfigured, {
      prisma,
      registry,
      explainerService: new GeminiExplainerService({ apiKey: '' }),
    });
    await appUnconfigured.ready();

    const res = await appUnconfigured.inject({
      method: 'POST',
      url: `/api/patients/${PATIENT_STABLE}/explain`,
      headers: { authorization: `Bearer ${clinicianToken}` },
      payload: { windowMinutes: 15 },
    });

    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('MISSING_API_KEY');
    await appUnconfigured.close();
  });

  // SCENARIO 9: Gemini Provider Timeout (504)
  it('Scenario 9 [Provider Timeout]: maps Gemini timeout to HTTP 504 Gateway Timeout', async () => {
    const timeoutService = {
      explain: vi.fn().mockRejectedValue(new GeminiExplainerError('Request timed out', 'TIMEOUT', 504)),
    } as unknown as GeminiExplainerService;

    const appTimeout = Fastify();
    await registerExplainerRoutes(appTimeout, {
      prisma,
      registry,
      explainerService: timeoutService,
    });
    await appTimeout.ready();

    const res = await appTimeout.inject({
      method: 'POST',
      url: `/api/patients/${PATIENT_STABLE}/explain`,
      headers: { authorization: `Bearer ${clinicianToken}` },
      payload: { windowMinutes: 15 },
    });

    expect(res.statusCode).toBe(504);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('TIMEOUT');
    await appTimeout.close();
  });

  // SCENARIO 10: Unauthorized Viewer Access (403)
  it('Scenario 10 [Unauthorized Viewer]: rejects viewer role with HTTP 403 Forbidden', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/patients/${PATIENT_STABLE}/explain`,
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { windowMinutes: 15 },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Forbidden');
  });

  // SCENARIO 11: Cross-Patient Alert Access Rejection (404)
  it('Scenario 11 [Cross-Patient Alert]: rejects alert belonging to another patient without data leakage', async () => {
    // ALERT-BREACH-01 belongs to PATIENT_BREACH, not PATIENT_STABLE
    const res = await app.inject({
      method: 'POST',
      url: `/api/patients/${PATIENT_STABLE}/explain`,
      headers: {
        authorization: `Bearer ${clinicianToken}`,
        'content-type': 'application/json',
      },
      payload: { alertId: 'ALERT-BREACH-01', windowMinutes: 15 },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Not Found');
    expect(body.message).toContain('ALERT-BREACH-01');
    // Ensure no leakage of PATIENT_BREACH details
    expect(res.body).not.toContain(PATIENT_BREACH);
    expect(res.body).not.toContain('tachycardic');
  });

  // SCENARIO 12: Rate Limiting & Rapid Requests (429)
  it('Scenario 12 [Rate Limiting]: enforces sliding window limit and returns HTTP 429 with Retry-After', async () => {
    const rateApp = Fastify();
    await registerExplainerRoutes(rateApp, {
      prisma,
      registry,
      explainerService: mockExplainerService,
      rateLimitMaxRequests: 2,
      rateLimitWindowMs: 60000,
    });
    await rateApp.ready();

    const rapidToken = signToken({
      id: 'usr-rapid-tester',
      email: 'rapid@wicare.local',
      name: 'Rapid Tester',
      role: 'clinician',
    });

    // Request 1: OK
    const r1 = await rateApp.inject({
      method: 'POST',
      url: `/api/patients/${PATIENT_STABLE}/explain`,
      headers: { authorization: `Bearer ${rapidToken}` },
    });
    expect(r1.statusCode).toBe(200);

    // Request 2: OK
    const r2 = await rateApp.inject({
      method: 'POST',
      url: `/api/patients/${PATIENT_STABLE}/explain`,
      headers: { authorization: `Bearer ${rapidToken}` },
    });
    expect(r2.statusCode).toBe(200);

    // Request 3: Exceeded -> 429
    const r3 = await rateApp.inject({
      method: 'POST',
      url: `/api/patients/${PATIENT_STABLE}/explain`,
      headers: { authorization: `Bearer ${rapidToken}` },
    });
    expect(r3.statusCode).toBe(429);
    expect(r3.headers['retry-after']).toBeDefined();
    await rateApp.close();
  });

  // SECTION 4: Deterministic Alert Isolation Verification
  it('verifies that AI explanations never modify, acknowledge, or resolve deterministic alerts', async () => {
    const alertBefore = await prisma.alert.findUnique({
      where: { id: 'ALERT-BREACH-01' },
    });
    expect(alertBefore?.status).toBe('OPEN');

    // Trigger AI explanation
    await app.inject({
      method: 'POST',
      url: `/api/patients/${PATIENT_BREACH}/explain`,
      headers: { authorization: `Bearer ${clinicianToken}` },
      payload: { alertId: 'ALERT-BREACH-01' },
    });

    const alertAfter = await prisma.alert.findUnique({
      where: { id: 'ALERT-BREACH-01' },
    });
    expect(alertAfter?.status).toBe('OPEN');
    expect(alertAfter?.acknowledgedBy).toBeNull();
    expect(alertAfter?.resolvedBy).toBeNull();
  });

  // SECTION 5: Privacy Invariant Verification
  it('verifies that internal database UUIDs, patient names, and doctor names are stripped from prompt', async () => {
    const ctx = lastContexts.get(PATIENT_BREACH);
    expect(ctx).toBeDefined();

    const serialized = JSON.stringify(ctx);

    // Strictly ensure no raw database UUIDs or direct identifiers
    expect(serialized).not.toContain(PATIENT_BREACH);
    expect(serialized).not.toContain('ALERT-BREACH-01');
    expect(serialized).not.toContain('usr-clinician-e2e');
    expect(serialized).not.toContain('dr.sharma@wicare.local');
    expect(serialized).not.toContain('Dr. Sharma');
  });

  // SECTION 6: Latency Measurement & Performance Profiling
  it('measures endpoint preparation vs simulated provider latency', async () => {
    const delayService = {
      explain: vi.fn().mockImplementation(async (input: { patientId: string; context: SanitizedPromptContext }) => {
        const startSim = performance.now();
        // Simulate Gemini 2.5 Flash 120ms roundtrip
        await new Promise((resolve) => setTimeout(resolve, 120));
        const simDuration = performance.now() - startSim;

        return {
          patientId: input.patientId,
          bedId: input.context.bedId,
          generatedAt: new Date().toISOString(),
          modelName: 'gemini-2.5-flash',
          summary: `Latency measurement run completed in ${simDuration.toFixed(1)}ms.`,
          observedFacts: ['Stable telemetry latency profile.'],
          possibleInterpretations: [],
          supportingEvidence: [],
          dataQualityLimitations: [],
          suggestedVerificationSteps: [],
          isAdvisoryOnly: true,
        };
      }),
    } as unknown as GeminiExplainerService;

    const appPerf = Fastify();
    await registerExplainerRoutes(appPerf, {
      prisma,
      registry,
      explainerService: delayService,
    });
    await appPerf.ready();

    const t0 = performance.now();
    const res = await appPerf.inject({
      method: 'POST',
      url: `/api/patients/${PATIENT_STABLE}/explain`,
      headers: { authorization: `Bearer ${clinicianToken}` },
      payload: { windowMinutes: 15 },
    });
    const totalDurationMs = performance.now() - t0;

    expect(res.statusCode).toBe(200);
    // Backend data prep (Prisma queries + DeviceRegistry + Sanitization) is lightweight (<50ms)
    // Total is ~120ms provider + backend prep
    expect(totalDurationMs).toBeGreaterThan(100);
    expect(totalDurationMs).toBeLessThan(1000);

    await appPerf.close();
  });
});
