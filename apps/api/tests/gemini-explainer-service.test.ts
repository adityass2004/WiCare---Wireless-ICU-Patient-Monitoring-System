import { describe, it, expect, vi } from 'vitest';
import {
  GeminiExplainerService,
  GeminiExplainerError,
} from '../src/ai/gemini-explainer.js';
import type { SanitizedPromptContext } from '@wicare/shared';
import type { GoogleGenAI } from '@google/genai';

describe('GeminiExplainerService', () => {
  const sampleContext: SanitizedPromptContext = {
    bedId: 'B-1',
    ward: 'ICU',
    age: 52,
    gender: 'Male',
    primaryDiagnosis: 'Acute Anterior Wall STEMI - Post Primary PCI',
    recentReadings: [
      {
        timestamp: '2026-10-16T15:00:00.000Z',
        seq: 101,
        vitals: {
          heart_rate: { value: 122, unit: 'bpm' },
          spo2: { value: 89, unit: '%' },
        },
      },
    ],
    activeAlerts: [
      {
        measurement: 'spo2',
        severity: 'critical',
        value: 89,
        reason: 'SpO2 critical hypoxia (< 90%)',
        timestamp: '2026-10-16T15:00:05.000Z',
      },
    ],
    thresholds: [
      {
        measurement: 'spo2',
        minCritical: 90,
        minWarning: 92,
        maxWarning: null,
        maxCritical: null,
        unit: '%',
      },
    ],
    telemetryFreshnessSeconds: 1.5,
    packetLossRate: 0.8,
  };

  const validModelResponseJson = {
    summary: 'The patient shows sudden oxygen desaturation accompanied by sinus tachycardia.',
    observedFacts: [
      'Heart rate measured at 122 bpm at 15:00:00 UTC.',
      'SpO2 measured at 89%, breaching critical threshold of 90%.',
      'Active critical hypoxia alert confirmed.',
    ],
    possibleInterpretations: [
      {
        possibility: 'Possibility of acute pulmonary congestion secondary to post-infarct left ventricular dysfunction',
        rationale: 'Recent anterior STEMI combined with acute hypoxia and tachycardia suggests possible cardiogenic pulmonary edema.',
        supportingEvidence: ['HR 122 bpm', 'SpO2 89%'],
        likelihood: 'high',
      },
    ],
    supportingEvidence: ['Sustained vital drop confirmed in telemetry sequence 101.'],
    dataQualityLimitations: [
      'Telemetry Age of Information is 1.5s.',
      'Wireless packet loss is 0.8%, indicating intact packet stream.',
    ],
    suggestedVerificationSteps: [
      'Perform urgent bedside chest auscultation for pulmonary crackles.',
      'Verify pulse oximeter probe placement on right index finger.',
      'Obtain stat Arterial Blood Gas (ABG) and 12-lead ECG.',
    ],
  };

  it('throws MISSING_API_KEY when no API key or client is configured', async () => {
    const originalEnv = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      const service = new GeminiExplainerService({ apiKey: '' });
      await expect(
        service.explain({ patientId: 'P-001', context: sampleContext }),
      ).rejects.toThrowError(GeminiExplainerError);

      try {
        await service.explain({ patientId: 'P-001', context: sampleContext });
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(GeminiExplainerError);
        const explainerErr = err as GeminiExplainerError;
        expect(explainerErr.code).toBe('MISSING_API_KEY');
        expect(explainerErr.statusCode).toBe(503);
      }
    } finally {
      process.env.GEMINI_API_KEY = originalEnv;
    }
  });

  it('generates a valid, validated explanation on successful model response', async () => {
    const mockGenerateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(validModelResponseJson),
    });

    const mockClient = {
      models: {
        generateContent: mockGenerateContent,
      },
    } as unknown as GoogleGenAI;

    const service = new GeminiExplainerService({ client: mockClient, modelName: 'gemini-2.5-flash' });

    const result = await service.explain({
      patientId: 'P-001',
      context: sampleContext,
    });

    expect(result.patientId).toBe('P-001');
    expect(result.bedId).toBe('B-1');
    expect(result.modelName).toBe('gemini-2.5-flash');
    expect(result.isAdvisoryOnly).toBe(true);
    expect(result.summary).toBe(validModelResponseJson.summary);
    expect(result.observedFacts).toHaveLength(3);
    expect(result.possibleInterpretations[0].possibility).toContain('pulmonary');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);

    // Verify system instruction and contents were passed
    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.model).toBe('gemini-2.5-flash');
    expect(callArgs.config.responseMimeType).toBe('application/json');
    expect(callArgs.contents).toContain('Bed Tag: B-1');
    expect(callArgs.contents).toContain('Acute Anterior Wall STEMI');
    expect(callArgs.contents).not.toContain('P-001'); // Patient ID stripped from external prompt
  });

  it('throws VALIDATION_FAILED when model returns non-JSON or malformed text', async () => {
    const mockClient = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: 'This is plain text and not valid JSON at all.',
        }),
      },
    } as unknown as GoogleGenAI;

    const service = new GeminiExplainerService({ client: mockClient });

    await expect(
      service.explain({ patientId: 'P-001', context: sampleContext }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      statusCode: 502,
    });
  });

  it('throws VALIDATION_FAILED when model returns JSON missing required clinical fields', async () => {
    const incompleteJson = {
      summary: 'Patient is getting worse.',
      // Missing observedFacts, possibleInterpretations, supportingEvidence, etc.
    };

    const mockClient = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify(incompleteJson),
        }),
      },
    } as unknown as GoogleGenAI;

    const service = new GeminiExplainerService({ client: mockClient });

    await expect(
      service.explain({ patientId: 'P-001', context: sampleContext }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      statusCode: 502,
    });
  });

  it('enforces bounded request timeout when model hangs', async () => {
    const mockClient = {
      models: {
        generateContent: vi.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(resolve, 500); // Exceeds 50ms timeout
          });
        }),
      },
    } as unknown as GoogleGenAI;

    const service = new GeminiExplainerService({
      client: mockClient,
      timeoutMs: 50,
    });

    await expect(
      service.explain({ patientId: 'P-001', context: sampleContext }),
    ).rejects.toMatchObject({
      code: 'TIMEOUT',
      statusCode: 504,
    });
  });

  it('handles provider rate-limiting (429 / RESOURCE_EXHAUSTED)', async () => {
    const mockClient = {
      models: {
        generateContent: vi.fn().mockRejectedValue(
          new Error('429 Resource has been exhausted (e.g. check quota).'),
        ),
      },
    } as unknown as GoogleGenAI;

    const service = new GeminiExplainerService({ client: mockClient });

    await expect(
      service.explain({ patientId: 'P-001', context: sampleContext }),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      statusCode: 429,
    });
  });

  it('handles network / connectivity failures', async () => {
    const mockClient = {
      models: {
        generateContent: vi.fn().mockRejectedValue(new Error('fetch failed: connect ECONNREFUSED')),
      },
    } as unknown as GoogleGenAI;

    const service = new GeminiExplainerService({ client: mockClient });

    await expect(
      service.explain({ patientId: 'P-001', context: sampleContext }),
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      statusCode: 502,
    });
  });

  it('handles generic provider failures without leaking internal stack traces', async () => {
    const mockClient = {
      models: {
        generateContent: vi.fn().mockRejectedValue(new Error('500 Internal error encountered.')),
      },
    } as unknown as GoogleGenAI;

    const service = new GeminiExplainerService({ client: mockClient });

    try {
      await service.explain({ patientId: 'P-001', context: sampleContext });
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(GeminiExplainerError);
      const explainerErr = err as GeminiExplainerError;
      expect(explainerErr.code).toBe('PROVIDER_ERROR');
      expect(explainerErr.statusCode).toBe(502);
      expect(explainerErr.message).toBe('Gemini AI service encountered an error processing the clinical explanation.');
    }
  });
});
