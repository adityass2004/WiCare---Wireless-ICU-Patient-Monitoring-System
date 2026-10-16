import { GoogleGenAI, Type } from '@google/genai';
import {
  ExplainResponseSchema,
  SanitizedPromptContextSchema,
  type ExplainResponse,
  type SanitizedPromptContext,
} from '@wicare/shared';
import type { Logger } from 'pino';

export type GeminiErrorCode =
  | 'MISSING_API_KEY'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'VALIDATION_FAILED'
  | 'NETWORK_ERROR';

export class GeminiExplainerError extends Error {
  constructor(
    message: string,
    public readonly code: GeminiErrorCode,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'GeminiExplainerError';
  }
}

export interface ExplainerServiceOptions {
  apiKey?: string;
  modelName?: string;
  timeoutMs?: number;
  logger?: Logger;
  client?: GoogleGenAI; // Injected for unit testing
}

export interface ExplainerExecutionInput {
  patientId: string;
  context: SanitizedPromptContext;
}

const SYSTEM_INSTRUCTION = `You are an AI Clinical Deterioration Explainer integrated into the WiCare ICU telemetry platform.
Your purpose is to assist ICU clinicians by providing objective, structured interpretations of telemetry anomalies.

CRITICAL INSTRUCTIONS & GUARDRAILS:
1. Distinguish observed physical measurements from clinical interpretations.
2. Never invent readings, timestamps, or thresholds. Base observations strictly on the provided telemetry and alert data.
3. Explicitly report data-quality limitations, including packet loss rates, sequence gaps, or stale telemetry (AoI).
4. Never state a definitive clinical diagnosis. Frame all clinical interpretations strictly as non-definitive possibilities or differential hypotheses.
5. Provide practical bedside verification steps (e.g. sensor probe repositioning, arterial blood gas confirmation) instead of autonomous medical treatment orders.
6. Output strictly in JSON format matching this structure:
{
  "summary": "1-2 sentence clinical summary",
  "observedFacts": ["fact 1", "fact 2"],
  "possibleInterpretations": [
    {
      "possibility": "clinical possibility",
      "rationale": "clinical reasoning",
      "supportingEvidence": ["evidence 1"]
    }
  ],
  "supportingEvidence": ["overall evidence"],
  "dataQualityLimitations": ["notes on data quality"],
  "suggestedVerificationSteps": ["verification step"]
}`;

export const STRUCTURED_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: 'A concise 1-2 sentence clinical summary of the patient status.',
    },
    observedFacts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Directly measured vitals, sequence trends, active alert triggers, and threshold breaches.',
    },
    possibleInterpretations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          possibility: {
            type: Type.STRING,
            description:
              'A non-definitive clinical possibility or differential scenario under consideration.',
          },
          rationale: {
            type: Type.STRING,
            description: 'Clinical reasoning describing why this possibility was considered.',
          },
          supportingEvidence: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Specific telemetry trends or alarm data supporting this possibility.',
          },
          likelihood: {
            type: Type.STRING,
            enum: ['low', 'moderate', 'high'],
            description:
              'Uncalibrated model heuristic likelihood; NOT a calibrated statistical probability.',
          },
        },
        required: ['possibility'],
      },
      description:
        'Potential differential possibilities, explicitly labeled as non-confirmed possibilities.',
    },
    supportingEvidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Overall measured evidence from telemetry supporting the observations.',
    },
    dataQualityLimitations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Notes on data freshness (AoI), packet loss, gaps, or sensor artifact risks.',
    },
    suggestedVerificationSteps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Recommended bedside verification actions for clinical/nursing staff.',
    },
  },
  required: [
    'summary',
    'observedFacts',
    'possibleInterpretations',
    'supportingEvidence',
    'dataQualityLimitations',
    'suggestedVerificationSteps',
  ],
};

export class GeminiExplainerService {
  private readonly client: GoogleGenAI | null;
  private readonly modelName: string;
  private readonly timeoutMs: number;
  private readonly logger?: Logger;

  constructor(options: ExplainerServiceOptions = {}) {
    const apiKey = options.apiKey !== undefined ? options.apiKey : process.env.GEMINI_API_KEY;
    this.modelName = options.modelName || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    this.timeoutMs = options.timeoutMs ?? 25000;
    this.logger = options.logger?.child({ component: 'gemini-explainer' });

    if (options.client) {
      this.client = options.client;
    } else if (apiKey && apiKey.trim().length > 0) {
      this.client = new GoogleGenAI({ apiKey: apiKey.trim() });
    } else {
      this.client = null;
    }
  }

  /**
   * Generates a structured clinical explanation from a sanitized telemetry context.
   * On-demand only; does not run in background telemetry streams.
   */
  public async explain(input: ExplainerExecutionInput): Promise<ExplainResponse> {
    if (!this.client) {
      throw new GeminiExplainerError(
        'The Gemini Explainer is not configured on this server (server configuration is missing).',
        'MISSING_API_KEY',
        503,
      );
    }

    // Validate sanitized context at runtime
    const contextValidation = SanitizedPromptContextSchema.safeParse(input.context);
    if (!contextValidation.success) {
      throw new GeminiExplainerError(
        `Invalid sanitized prompt context: ${contextValidation.error.message}`,
        'VALIDATION_FAILED',
        400,
      );
    }

    const promptText = this.buildPrompt(contextValidation.data);

    this.logger?.info(
      { bedId: input.context.bedId, ward: input.context.ward, model: this.modelName },
      'Requesting AI clinical deterioration explanation from Gemini',
    );

    // Prepare candidate models for resilient fallback if Google experiences temporary 503 spikes
    const candidateModels = Array.from(new Set([
      this.modelName,
      'gemini-3.5-flash',
      'gemini-3.6-flash',
      'gemini-3.8-flash',
    ]));

    let rawResponseText = '';
    let actualModelUsed = this.modelName;
    let lastError: unknown = null;

    for (const modelToTry of candidateModels) {
      try {
        rawResponseText = await this.executeWithTimeout(async () => {
          const response = await this.client!.models.generateContent({
            model: modelToTry,
            contents: promptText,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          });

          if (!response.text) {
            throw new Error('Gemini returned an empty text response');
          }
          return response.text;
        });

        actualModelUsed = modelToTry;
        break; // Successfully received response
      } catch (err: unknown) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err || '');
        const isTemporary =
          msg.includes('503') ||
          msg.includes('high demand') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('429');

        if (isTemporary && candidateModels.indexOf(modelToTry) < candidateModels.length - 1) {
          this.logger?.warn(
            { failedModel: modelToTry, nextModel: candidateModels[candidateModels.indexOf(modelToTry) + 1] },
            'Gemini model experienced temporary provider demand spike, trying fallback model',
          );
          continue;
        }

        this.handleProviderError(err);
      }
    }

    if (!rawResponseText) {
      this.handleProviderError(lastError);
    }

    let parsedJson: unknown;
    try {
      let cleaned = rawResponseText.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      }
      parsedJson = JSON.parse(cleaned);
    } catch {
      this.logger?.error('Failed to parse Gemini structured JSON response');
      throw new GeminiExplainerError(
        'Gemini returned malformed non-JSON output',
        'VALIDATION_FAILED',
        502,
      );
    }

    // Assemble the complete internal application contract
    const explanationCandidate = {
      ...(typeof parsedJson === 'object' && parsedJson !== null ? parsedJson : {}),
      patientId: input.patientId,
      bedId: input.context.bedId,
      generatedAt: new Date().toISOString(),
      modelName: actualModelUsed,
      isAdvisoryOnly: true,
    };

    // Strict schema contract verification
    const validation = ExplainResponseSchema.safeParse(explanationCandidate);
    if (!validation.success) {
      this.logger?.error(
        { issues: validation.error.issues },
        'Gemini response failed clinical contract schema validation',
      );
      throw new GeminiExplainerError(
        'Gemini response failed clinical schema contract validation',
        'VALIDATION_FAILED',
        502,
      );
    }

    this.logger?.info(
      { bedId: input.context.bedId, model: this.modelName },
      'Successfully validated AI clinical explanation',
    );

    return validation.data;
  }

  /**
   * Constructs the prompt strictly excluding patient names, UHIDs, doctor names, or internal IDs.
   */
  private buildPrompt(context: SanitizedPromptContext): string {
    const readingsSummary = context.recentReadings.slice(-30).map((r) => {
      const vitalPairs = Object.entries(r.vitals)
        .map(([k, v]) => `${k}: ${v.value} ${v.unit}`)
        .join(', ');
      return `[Seq ${r.seq} @ ${r.timestamp}] ${vitalPairs}`;
    });

    const alertsSummary =
      context.activeAlerts.length > 0
        ? context.activeAlerts
            .map(
              (a) =>
                `• [${a.severity.toUpperCase()}] ${a.measurement}: ${a.reason} (value: ${a.value ?? 'N/A'}) at ${a.timestamp}`,
            )
            .join('\n')
        : 'None active.';

    const thresholdsSummary = context.thresholds
      .map((t) => {
        const parts = [];
        if (t.minCritical !== null && t.minCritical !== undefined) parts.push(`minCrit: ${t.minCritical}`);
        if (t.minWarning !== null && t.minWarning !== undefined) parts.push(`minWarn: ${t.minWarning}`);
        if (t.maxWarning !== null && t.maxWarning !== undefined) parts.push(`maxWarn: ${t.maxWarning}`);
        if (t.maxCritical !== null && t.maxCritical !== undefined) parts.push(`maxCrit: ${t.maxCritical}`);
        return `• ${t.measurement} (${t.unit}): ${parts.join(', ')}`;
      })
      .join('\n');

    return `ANONYMIZED ICU PATIENT TELEMETRY CONTEXT:
- Bed Tag: ${context.bedId}
- Ward: ${context.ward}
- Age: ${context.age}
- Gender: ${context.gender}
- Primary ICU Diagnosis: ${context.primaryDiagnosis}

CONFIGURED ICU WARD SAFETY THRESHOLDS:
${thresholdsSummary || 'Default standard clinical limits apply.'}

ACTIVE CLINICAL ALARMS:
${alertsSummary}

WIRELESS TELEMETRY QUALITY & FRESHNESS:
- Telemetry Freshness (Age of Information): ${context.telemetryFreshnessSeconds.toFixed(1)} seconds
- Measured Wireless Packet Loss Rate: ${context.packetLossRate.toFixed(1)}%

RECENT TELEMETRY READINGS TIME-SERIES (Oldest to Most Recent):
${readingsSummary.join('\n') || 'No telemetry readings available in window.'}

TASK:
Provide a structured clinical explanation analyzing the physiological trajectory.
Remember:
- State direct observations as facts.
- Treat hypotheses strictly as possibilities.
- Note any packet loss or latency constraints.
- Suggest bedside verification steps.`;
  }

  /**
   * Executes an asynchronous task with a bounded timeout.
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    let timerId: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => {
        reject(
          new GeminiExplainerError(
            `Gemini request timed out after ${this.timeoutMs}ms`,
            'TIMEOUT',
            504,
          ),
        );
      }, this.timeoutMs);
    });

    try {
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      if (timerId) clearTimeout(timerId);
    }
  }

  /**
   * Normalizes provider and network errors into clean GeminiExplainerError instances
   * without leaking stack traces or credentials.
   */
  private handleProviderError(err: unknown): never {
    if (err instanceof GeminiExplainerError) {
      throw err;
    }

    const msg = err instanceof Error ? err.message : String(err || '');
    const lower = msg.toLowerCase();

    if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota') || lower.includes('rate limit')) {
      this.logger?.warn({ code: 'RATE_LIMITED' }, 'Gemini API rate limit exceeded');
      throw new GeminiExplainerError(
        'Gemini API rate limit exceeded. Please retry in a few moments.',
        'RATE_LIMITED',
        429,
      );
    }

    if (
      lower.includes('fetch failed') ||
      lower.includes('econnrefused') ||
      lower.includes('enotfound') ||
      lower.includes('network')
    ) {
      this.logger?.error({ code: 'NETWORK_ERROR' }, 'Network connectivity failure connecting to Gemini API');
      throw new GeminiExplainerError(
        'Network error communicating with Google Gemini service.',
        'NETWORK_ERROR',
        502,
      );
    }

    this.logger?.error({ err, msg, code: 'PROVIDER_ERROR' }, `Gemini API provider execution failed: ${msg}`);
    throw new GeminiExplainerError(
      'Gemini AI service encountered an error processing the clinical explanation.',
      'PROVIDER_ERROR',
      502,
    );
  }
}
