import { z } from 'zod';

/**
 * Request schema for requesting an AI-powered clinical deterioration explanation.
 * Enforces strict typing and rejects unexpected or invalid fields.
 */
export const ExplainRequestSchema = z
  .object({
    alertId: z.string().min(1).optional(),
    windowMinutes: z.number().int().min(5).max(60).optional(),
  })
  .strict();

export type ExplainRequest = z.infer<typeof ExplainRequestSchema>;

/**
 * Likelihood tier for a differential possibility.
 * NOTE: These are uncalibrated generative model estimates, NOT calibrated clinical probabilities.
 */
export const InterpretationLikelihoodSchema = z.enum(['low', 'moderate', 'high']);
export type InterpretationLikelihood = z.infer<typeof InterpretationLikelihoodSchema>;

/**
 * Represents a single non-definitive clinical possibility or differential scenario.
 * Explicitly labeled as a possibility, never a confirmed medical diagnosis.
 */
export const PossibleInterpretationSchema = z
  .object({
    possibility: z
      .string()
      .min(1)
      .describe('A non-definitive clinical possibility or differential scenario under consideration'),
    rationale: z
      .string()
      .min(1)
      .optional()
      .describe('Clinical reasoning describing why this possibility was considered'),
    supportingEvidence: z
      .array(z.string())
      .optional()
      .describe('Specific vital signs, trends, or alert data supporting this possibility'),
    likelihood: InterpretationLikelihoodSchema.optional().describe(
      'Uncalibrated model heuristic likelihood; not a calibrated statistical probability',
    ),
  })
  .strict();

export type PossibleInterpretation = z.infer<typeof PossibleInterpretationSchema>;

/**
 * Validated response schema for the AI Clinical Deterioration Explainer.
 * Distinguishes observed facts, non-definitive possibilities, data quality limitations,
 * and bedside verification steps.
 */
export const ExplainResponseSchema = z
  .object({
    patientId: z.string().min(1),
    bedId: z.string().min(1),
    generatedAt: z.string().datetime({ offset: true }),
    modelName: z.string().min(1),
    summary: z.string().min(1),
    observedFacts: z.array(z.string()),
    possibleInterpretations: z.array(PossibleInterpretationSchema),
    supportingEvidence: z.array(z.string()),
    dataQualityLimitations: z.array(z.string()),
    suggestedVerificationSteps: z.array(z.string()),
    isAdvisoryOnly: z.literal(true),
  })
  .strict();

export type ExplainResponse = z.infer<typeof ExplainResponseSchema>;

/**
 * Alias for ExplainResponseSchema and ExplainResponse to match clinical terminology.
 */
export const AiClinicalExplanationSchema = ExplainResponseSchema;
export type AiClinicalExplanation = ExplainResponse;

/**
 * Sanitized context payload prepared for external model prompts.
 * Strictly strips patient names, UHIDs, doctor names, and internal database UUIDs.
 */
export const SanitizedPromptContextSchema = z
  .object({
    bedId: z.string().min(1),
    ward: z.string().min(1),
    age: z.number().int().positive(),
    gender: z.string().min(1),
    primaryDiagnosis: z.string().min(1),
    recentReadings: z.array(
      z.object({
        timestamp: z.string(),
        seq: z.number().int().nonnegative(),
        vitals: z.record(
          z.object({
            value: z.number(),
            unit: z.string(),
          }),
        ),
      }),
    ),
    activeAlerts: z.array(
      z.object({
        measurement: z.string(),
        severity: z.string(),
        value: z.number().nullable().optional(),
        reason: z.string(),
        timestamp: z.string(),
      }),
    ),
    thresholds: z.array(
      z.object({
        measurement: z.string(),
        minWarning: z.number().nullable().optional(),
        maxWarning: z.number().nullable().optional(),
        minCritical: z.number().nullable().optional(),
        maxCritical: z.number().nullable().optional(),
        unit: z.string(),
      }),
    ),
    telemetryFreshnessSeconds: z.number().nonnegative(),
    packetLossRate: z.number().min(0).max(100),
  })
  .strict();

export type SanitizedPromptContext = z.infer<typeof SanitizedPromptContextSchema>;
