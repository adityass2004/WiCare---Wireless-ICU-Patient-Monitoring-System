import { describe, it, expect } from 'vitest';
import {
  ExplainRequestSchema,
  ExplainResponseSchema,
  AiClinicalExplanationSchema,
  PossibleInterpretationSchema,
  SanitizedPromptContextSchema,
} from '@wicare/shared';

describe('AI Clinical Explainer Schema Contracts', () => {
  const validInterpretation = {
    possibility: 'Possibility of Acute Exacerbation of COPD with Type 2 Respiratory Deterioration',
    rationale: 'Observed SpO2 falling under 88% concurrent with tachypnea (>28 brpm).',
    supportingEvidence: ['SpO2: 86%', 'Respiratory Rate: 30 brpm', 'Recent Alert: ALT-001'],
    likelihood: 'high' as const,
  };

  const validExplanationPayload = {
    patientId: 'P-001',
    bedId: 'B-1',
    generatedAt: new Date().toISOString(),
    modelName: 'gemini-2.5-flash',
    summary: 'Patient demonstrates acute oxygen desaturation with compensatory tachypnea over the last 15 minutes.',
    observedFacts: [
      'Heart Rate increased from 74 bpm to 118 bpm over 12 minutes.',
      'SpO2 dropped below critical threshold (88% vs minCritical 90%).',
      'Active alarm: SpO2 critical hypoxia triggered 4 minutes ago.',
    ],
    possibleInterpretations: [validInterpretation],
    supportingEvidence: [
      'Baseline SpO2 in prior 60 minutes was stable at 97%.',
      'Consecutive 5 readings confirm sustained drop, ruling out transient motion artifact.',
    ],
    dataQualityLimitations: [
      'Wireless link measured packet loss is 1.2%; sequence continuity is preserved.',
      'Age of Information is 1.4s (well within 15s freshness window).',
    ],
    suggestedVerificationSteps: [
      'Check pulse oximeter probe placement and peripheral perfusion at Bed B-1.',
      'Assess respiratory effort, work of breathing, and auscultate lung fields.',
      'Correlate with urgent Arterial Blood Gas (ABG) analysis.',
    ],
    isAdvisoryOnly: true as const,
  };

  describe('ExplainRequestSchema', () => {
    it('accepts a valid request with alertId and bounded windowMinutes', () => {
      const parsed = ExplainRequestSchema.safeParse({
        alertId: 'ALT-1234',
        windowMinutes: 15,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.alertId).toBe('ALT-1234');
        expect(parsed.data.windowMinutes).toBe(15);
      }
    });

    it('accepts an empty object with all optional parameters omitted', () => {
      const parsed = ExplainRequestSchema.safeParse({});
      expect(parsed.success).toBe(true);
    });

    it('accepts boundary windowMinutes values (5 and 60 minutes)', () => {
      expect(ExplainRequestSchema.safeParse({ windowMinutes: 5 }).success).toBe(true);
      expect(ExplainRequestSchema.safeParse({ windowMinutes: 60 }).success).toBe(true);
    });

    it('rejects windowMinutes below minimum bound (< 5)', () => {
      const parsed = ExplainRequestSchema.safeParse({ windowMinutes: 4 });
      expect(parsed.success).toBe(false);
    });

    it('rejects windowMinutes above maximum bound (> 60)', () => {
      const parsed = ExplainRequestSchema.safeParse({ windowMinutes: 61 });
      expect(parsed.success).toBe(false);
    });

    it('rejects non-integer or float windowMinutes', () => {
      const parsed = ExplainRequestSchema.safeParse({ windowMinutes: 12.5 });
      expect(parsed.success).toBe(false);
    });

    it('rejects non-numeric windowMinutes', () => {
      const parsed = ExplainRequestSchema.safeParse({ windowMinutes: '15' });
      expect(parsed.success).toBe(false);
    });

    it('rejects unexpected / extra fields according to strict schema conventions', () => {
      const parsed = ExplainRequestSchema.safeParse({
        alertId: 'ALT-1234',
        windowMinutes: 15,
        unexpectedProperty: 'malicious-or-unknown-input',
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('PossibleInterpretationSchema', () => {
    it('accepts a valid possibility interpretation with uncalibrated likelihood', () => {
      const parsed = PossibleInterpretationSchema.safeParse(validInterpretation);
      expect(parsed.success).toBe(true);
    });

    it('accepts interpretation with only required possibility field', () => {
      const parsed = PossibleInterpretationSchema.safeParse({
        possibility: 'Possibility of Acute Bronchospasm',
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects malformed interpretation missing possibility field', () => {
      const parsed = PossibleInterpretationSchema.safeParse({
        rationale: 'Missing possibility title',
        likelihood: 'moderate',
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects empty string possibility', () => {
      const parsed = PossibleInterpretationSchema.safeParse({
        possibility: '',
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects invalid uncalibrated likelihood tiers (e.g. "definite" or "proven")', () => {
      const parsed = PossibleInterpretationSchema.safeParse({
        possibility: 'Possibility of Pulmonary Embolism',
        likelihood: 'definite', // Not permitted; models cannot declare definite clinical diagnoses
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects unexpected fields in interpretation object', () => {
      const parsed = PossibleInterpretationSchema.safeParse({
        possibility: 'Possibility of Sepsis',
        extraField: 123,
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('ExplainResponseSchema & AiClinicalExplanationSchema', () => {
    it('accepts a well-formed explanation payload', () => {
      const parsed = ExplainResponseSchema.safeParse(validExplanationPayload);
      expect(parsed.success).toBe(true);
    });

    it('AiClinicalExplanationSchema is an identical alias of ExplainResponseSchema', () => {
      const parsed = AiClinicalExplanationSchema.safeParse(validExplanationPayload);
      expect(parsed.success).toBe(true);
    });

    it('rejects missing required top-level fields', () => {
      const requiredKeys = [
        'patientId',
        'bedId',
        'generatedAt',
        'modelName',
        'summary',
        'observedFacts',
        'possibleInterpretations',
        'supportingEvidence',
        'dataQualityLimitations',
        'suggestedVerificationSteps',
        'isAdvisoryOnly',
      ] as const;

      for (const key of requiredKeys) {
        const payload: Record<string, unknown> = { ...validExplanationPayload };
        delete payload[key];
        const parsed = ExplainResponseSchema.safeParse(payload);
        expect(parsed.success).toBe(false);
      }
    });

    it('rejects invalid timestamps', () => {
      const invalidTimestamps = [
        'invalid-date',
        '2026-99-99',
        '',
        'yesterday',
        1729080000000,
      ];

      for (const ts of invalidTimestamps) {
        const payload = { ...validExplanationPayload, generatedAt: ts };
        const parsed = ExplainResponseSchema.safeParse(payload);
        expect(parsed.success).toBe(false);
      }
    });

    it('accepts valid ISO-8601 UTC and offset timestamps', () => {
      const validUtc = { ...validExplanationPayload, generatedAt: '2026-10-16T15:00:00.000Z' };
      const validOffset = { ...validExplanationPayload, generatedAt: '2026-10-16T20:30:00+05:30' };

      expect(ExplainResponseSchema.safeParse(validUtc).success).toBe(true);
      expect(ExplainResponseSchema.safeParse(validOffset).success).toBe(true);
    });

    it('rejects malformed interpretation items inside possibleInterpretations', () => {
      const payload = {
        ...validExplanationPayload,
        possibleInterpretations: [
          { malformedField: 'no possibility provided' },
        ],
      };
      const parsed = ExplainResponseSchema.safeParse(payload);
      expect(parsed.success).toBe(false);
    });

    it('strictly enforces the isAdvisoryOnly: true constraint', () => {
      // Fails when false
      const falseAdvisory = { ...validExplanationPayload, isAdvisoryOnly: false };
      expect(ExplainResponseSchema.safeParse(falseAdvisory).success).toBe(false);

      // Fails when string "true"
      const stringAdvisory = { ...validExplanationPayload, isAdvisoryOnly: 'true' };
      expect(ExplainResponseSchema.safeParse(stringAdvisory).success).toBe(false);

      // Fails when null or undefined
      const nullAdvisory = { ...validExplanationPayload, isAdvisoryOnly: null };
      expect(ExplainResponseSchema.safeParse(nullAdvisory).success).toBe(false);
    });

    it('rejects unexpected properties at top-level', () => {
      const payload = {
        ...validExplanationPayload,
        unauthorizedPatientName: 'Patient Name Should Not Exist Here',
      };
      const parsed = ExplainResponseSchema.safeParse(payload);
      expect(parsed.success).toBe(false);
    });
  });

  describe('SanitizedPromptContextSchema', () => {
    it('validates a sanitized context payload without patient identity fields', () => {
      const sanitizedContext = {
        bedId: 'B-1',
        ward: 'ICU',
        age: 46,
        gender: 'Female',
        primaryDiagnosis: 'Severe Pneumonia with Acute Respiratory Failure',
        recentReadings: [
          {
            timestamp: new Date().toISOString(),
            seq: 1042,
            vitals: {
              heart_rate: { value: 92, unit: 'bpm' },
              spo2: { value: 91, unit: '%' },
            },
          },
        ],
        activeAlerts: [
          {
            measurement: 'spo2',
            severity: 'warning',
            value: 91,
            reason: 'SpO2 warning threshold breached (< 92%)',
            timestamp: new Date().toISOString(),
          },
        ],
        thresholds: [
          {
            measurement: 'spo2',
            minWarning: 92,
            minCritical: 88,
            maxWarning: null,
            maxCritical: null,
            unit: '%',
          },
        ],
        telemetryFreshnessSeconds: 1.2,
        packetLossRate: 0.5,
      };

      const parsed = SanitizedPromptContextSchema.safeParse(sanitizedContext);
      expect(parsed.success).toBe(true);
    });

    it('rejects sanitized context with unexpected sensitive fields (strict validation)', () => {
      const taintedContext = {
        bedId: 'B-1',
        ward: 'ICU',
        age: 46,
        gender: 'Female',
        primaryDiagnosis: 'Pneumonia',
        patientName: 'Sunita Patel', // Should NEVER be present in prompt context
        recentReadings: [],
        activeAlerts: [],
        thresholds: [],
        telemetryFreshnessSeconds: 1.0,
        packetLossRate: 0,
      };

      const parsed = SanitizedPromptContextSchema.safeParse(taintedContext);
      expect(parsed.success).toBe(false);
    });
  });
});
