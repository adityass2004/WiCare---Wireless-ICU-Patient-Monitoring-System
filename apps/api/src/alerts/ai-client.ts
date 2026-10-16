import type { Logger } from 'pino';

export interface VitalWindowSample {
  heart_rate: number;
  spo2: number;
  temperature: number;
  respiratory_rate: number;
}

export interface AiScoreResponse {
  patientId: string;
  riskScore: number;
  label: string;
  confidence: number;
  isoRiskScore: number;
  rfRiskScore: number;
  explanations: string[];
}

export class AiEngineClient {
  private aiServiceUrl: string;
  private logger: Logger;
  private recentWindows = new Map<string, VitalWindowSample[]>();
  private maxWindowSize = 15;

  constructor(logger: Logger, aiServiceUrl = 'http://127.0.0.1:8000') {
    this.logger = logger.child({ component: 'ai-engine-client' });
    this.aiServiceUrl = aiServiceUrl;
  }

  public pushReading(patientId: string, sample: VitalWindowSample): VitalWindowSample[] {
    const window = this.recentWindows.get(patientId) ?? [];
    window.push(sample);
    if (window.length > this.maxWindowSize) {
      window.shift();
    }
    this.recentWindows.set(patientId, window);
    return window;
  }

  public async getRiskScore(patientId: string): Promise<AiScoreResponse | null> {
    const window = this.recentWindows.get(patientId);
    if (!window || window.length < 3) {
      return null;
    }

    try {
      const response = await fetch(`${this.aiServiceUrl}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          window,
        }),
      });

      if (!response.ok) {
        this.logger.warn(
          { status: response.status, patientId },
          'AI service returned non-200 response; falling back to rule-based engine',
        );
        return null;
      }

      const data = (await response.json()) as AiScoreResponse;
      return data;
    } catch (err: any) {
      // Graceful fallback: catch offline/connection errors silently and log warning
      this.logger.warn(
        { err: err.message, patientId },
        'AI engine service offline or unreachable; continuing cleanly with Phase 4 rule-based alerts',
      );
      return null;
    }
  }
}
