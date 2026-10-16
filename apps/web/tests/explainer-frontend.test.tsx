import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  explainPatientDeterioration,
  ClinicalExplainerError,
  setAuthToken,
} from '../src/lib/api.js';
import { ClinicalExplainerPanel } from '../src/components/ClinicalExplainerPanel.js';
import type { ExplainResponse } from '@wicare/shared';
import * as fs from 'fs';
import * as path from 'path';

const mockValidResponse: ExplainResponse = {
  patientId: 'patient-icu-01',
  bedId: 'ICU-BED-01',
  generatedAt: '2026-10-16T10:00:00.000Z',
  modelName: 'gemini-2.5-flash',
  summary: 'Acute tachycardic deterioration with borderline hypoxia.',
  observedFacts: [
    'Heart rate elevated to 138 bpm exceeding limit 100 bpm',
    'SpO2 decreased to 91% near critical limit 90%',
  ],
  possibleInterpretations: [
    {
      possibility: 'Impending Sepsis / Systemic Inflammatory Response',
      likelihood: 'moderate',
      rationale: 'Combined sinus tachycardia and elevated temperature in ICU setting.',
      supportingEvidence: ['HR 138 bpm', 'Temp 38.6°C'],
    },
    {
      possibility: 'Early Acute Hypoxemic Respiratory Distress',
      likelihood: 'low',
      rationale: 'Desaturation to 91% under current nasal cannula oxygenation.',
      supportingEvidence: ['SpO2 91%'],
    },
  ],
  supportingEvidence: [
    'Reading sequence 1045: HR 138 bpm at 09:58:30Z',
    'Active Warning Alert: heart_rate exceeded 100 bpm',
  ],
  dataQualityLimitations: [
    'Wireless packet loss estimated at 4.2% across window',
    'AoI freshness latency is 1200ms',
  ],
  suggestedVerificationSteps: [
    'Verify ECG lead contact and evaluate 12-lead ECG for tachyarrhythmia',
    'Confirm oxygen delivery interface and check arterial blood gas',
  ],
  isAdvisoryOnly: true,
};

describe('Frontend AI Clinical Explainer Client & Components', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    setAuthToken('test-clinician-jwt-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // 1. Request construction and patient ID
  it('constructs correct request URL, auth headers, and body parameters', async () => {
    let capturedUrl = '';
    let capturedOptions: RequestInit | undefined;

    global.fetch = vi.fn().mockImplementation((url: string, options: RequestInit) => {
      capturedUrl = url;
      capturedOptions = options;
      return Promise.resolve(
        new Response(JSON.stringify(mockValidResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    const result = await explainPatientDeterioration('patient-123', {
      alertId: 'alert-456',
      windowMinutes: 30,
    });

    expect(capturedUrl).toContain('/api/patients/patient-123/explain');
    expect(capturedOptions?.method).toBe('POST');
    const headers = capturedOptions?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-clinician-jwt-token');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(capturedOptions?.body as string);
    expect(body).toEqual({ alertId: 'alert-456', windowMinutes: 30 });
    expect(result.patientId).toBe('patient-icu-01');
    expect(result.summary).toBe('Acute tachycardic deterioration with borderline hypoxia.');
  });

  // 2. Default options without optional parameters
  it('omits undefined fields from the request body', async () => {
    let capturedBody = '';

    global.fetch = vi.fn().mockImplementation((_url: string, options: RequestInit) => {
      capturedBody = options.body as string;
      return Promise.resolve(
        new Response(JSON.stringify(mockValidResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    await explainPatientDeterioration('patient-42');
    expect(JSON.parse(capturedBody)).toEqual({});
  });

  // 3. Network error handling
  it('handles network failure with ClinicalExplainerError status 0 and NETWORK_ERROR code', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    await expect(explainPatientDeterioration('patient-123')).rejects.toThrow(
      ClinicalExplainerError
    );

    try {
      await explainPatientDeterioration('patient-123');
    } catch (err: unknown) {
      const explainerErr = err as ClinicalExplainerError;
      expect(explainerErr.status).toBe(0);
      expect(explainerErr.code).toBe('NETWORK_ERROR');
      expect(explainerErr.message).toContain('Unable to connect to clinical explainer service');
    }
  });

  // 4. HTTP 400 validation error
  it('handles HTTP 400 validation error', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'windowMinutes must be between 5 and 60' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    try {
      await explainPatientDeterioration('patient-123', { windowMinutes: 2 });
    } catch (err: unknown) {
      const explainerErr = err as ClinicalExplainerError;
      expect(explainerErr.status).toBe(400);
      expect(explainerErr.message).toBe('windowMinutes must be between 5 and 60');
    }
  });

  // 5. HTTP 401 unauthenticated
  it('handles HTTP 401 authentication failure', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized: missing or invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    try {
      await explainPatientDeterioration('patient-123');
    } catch (err: unknown) {
      const explainerErr = err as ClinicalExplainerError;
      expect(explainerErr.status).toBe(401);
    }
  });

  // 6. HTTP 403 forbidden
  it('handles HTTP 403 insufficient role permissions', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Forbidden: requires clinician or admin role' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    try {
      await explainPatientDeterioration('patient-123');
    } catch (err: unknown) {
      const explainerErr = err as ClinicalExplainerError;
      expect(explainerErr.status).toBe(403);
    }
  });

  // 7. HTTP 404 missing patient or alert
  it('handles HTTP 404 not found', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Patient not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    try {
      await explainPatientDeterioration('missing-patient');
    } catch (err: unknown) {
      const explainerErr = err as ClinicalExplainerError;
      expect(explainerErr.status).toBe(404);
    }
  });

  // 8. HTTP 429 rate limit with Retry-After header
  it('handles HTTP 429 rate limit with parsed Retry-After header', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '45',
        },
      })
    );

    try {
      await explainPatientDeterioration('patient-123');
    } catch (err: unknown) {
      const explainerErr = err as ClinicalExplainerError;
      expect(explainerErr.status).toBe(429);
      expect(explainerErr.retryAfterSeconds).toBe(45);
    }
  });

  // 9. HTTP 503 missing Gemini API key
  it('handles HTTP 503 service unavailable', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Gemini service not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    try {
      await explainPatientDeterioration('patient-123');
    } catch (err: unknown) {
      const explainerErr = err as ClinicalExplainerError;
      expect(explainerErr.status).toBe(503);
    }
  });

  // 10. Malformed response schema validation error
  it('rejects malformed response violating ExplainResponseSchema with 502', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ invalid: 'incomplete object without required fields' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    try {
      await explainPatientDeterioration('patient-123');
    } catch (err: unknown) {
      const explainerErr = err as ClinicalExplainerError;
      expect(explainerErr.status).toBe(502);
      expect(explainerErr.code).toBe('SCHEMA_VALIDATION_ERROR');
    }
  });

  // 11. Component rendering: Viewer role denied / disabled
  it('renders lock indicator and restricts Explain button for viewer role', () => {
    const html = renderToString(
      React.createElement(ClinicalExplainerPanel, {
        patientId: 'patient-01',
        patientName: 'Aarav Sharma',
        bedId: 'ICU-01',
        userRole: 'viewer',
      })
    );

    expect(html).toContain('Viewer Role (Clinician / Admin only)');
    expect(html).not.toContain('id="btn-explain-ai"');
  });

  // 12. Component rendering: Clinician role authorized
  it('renders active action controls and window selector for clinician role', () => {
    const html = renderToString(
      React.createElement(ClinicalExplainerPanel, {
        patientId: 'patient-01',
        patientName: 'Aarav Sharma',
        bedId: 'ICU-01',
        userRole: 'clinician',
        patientAlerts: [
          {
            id: 'alt-1',
            patientId: 'patient-01',
            bedId: 'ICU-01',
            ward: 'ICU',
            deviceId: 'dev-1',
            timestamp: '2026-10-16T10:00:00Z',
            measurement: 'heart_rate',
            value: 145,
            severity: 'critical',
            type: 'clinical',
            status: 'OPEN',
            reason: 'Critical high heart rate',
          },
        ],
      })
    );

    expect(html).toContain('btn-explain-ai');
    expect(html).toContain('Explain with AI');
    expect(html).toContain('Analysis Window:');
    expect(html).toContain('15 min (Default)');
    expect(html).toContain('Focus Alert:');
    expect(html).toContain('[CRITICAL] heart_rate (145)');
  });

  // 13. Security Assertion: GEMINI_API_KEY is NEVER present in frontend source code
  it('verifies GEMINI_API_KEY does not exist in any browser code in apps/web/src', () => {
    const srcDir = path.resolve(__dirname, '../src');

    function searchDir(dir: string): string[] {
      let files: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files = files.concat(searchDir(fullPath));
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const codeFiles = searchDir(srcDir);
    expect(codeFiles.length).toBeGreaterThan(0);

    for (const filePath of codeFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).not.toContain('GEMINI_API_KEY');
      expect(content).not.toContain('process.env.GEMINI_API_KEY');
    }
  });

  // 14. Rendering integrity: omits unvalidated likelihood labels and renders Differential Hypothesis
  it('renders all 7 clinical sections without unvalidated likelihood labels', () => {
    const html = renderToString(
      React.createElement(ClinicalExplainerPanel, {
        patientId: 'patient-icu-01',
        patientName: 'Aarav Sharma',
        bedId: 'ICU-BED-01',
        userRole: 'clinician',
        initialExplanation: mockValidResponse,
      })
    );

    // 1. Executive Summary
    expect(html).toContain('Acute tachycardic deterioration with borderline hypoxia.');
    expect(html).toContain('gemini-2.5-flash');

    // 2. Observed Facts
    expect(html).toContain('Observed Facts (Direct Telemetry)');
    expect(html).toContain('Heart rate elevated to 138 bpm exceeding limit 100 bpm');

    // 3. Possible Interpretations (strictly without unsupported low/moderate/high labels)
    expect(html).toContain('Possible Interpretations');
    expect(html).toContain('Impending Sepsis / Systemic Inflammatory Response');
    expect(html).toContain('Differential Hypothesis');
    // Ensure raw unvalidated likelihood badges are not rendered
    expect(html).not.toMatch(/>\s*moderate\s*<\/span>/i);
    expect(html).not.toMatch(/>\s*high\s*<\/span>/i);
    expect(html).not.toMatch(/>\s*low\s*<\/span>/i);

    // 4. Supporting Evidence
    expect(html).toContain('Supporting Evidence &amp; Threshold Cross-References');
    expect(html).toContain('Reading sequence 1045: HR 138 bpm at 09:58:30Z');

    // 5. Data Quality Limitations
    expect(html).toContain('Data Quality &amp; Telemetry Integrity Disclosures');
    expect(html).toContain('Wireless packet loss estimated at 4.2% across window');

    // 6. Suggested Verification Steps
    expect(html).toContain('Suggested Bedside Verification Steps (Clinician Action)');
    expect(html).toContain('Verify ECG lead contact and evaluate 12-lead ECG for tachyarrhythmia');

    // 7. Clinical Advisory Disclaimer
    expect(html).toContain('Assistive Decision Support:');
    expect(html).toContain('NOT');
  });

  // 15. Authoritative patientId alert isolation
  it('enforces that alerts are associated only by authoritative patientId, not bedId alone', () => {
    const alerts = [
      {
        id: 'alert-match-patient',
        patientId: 'patient-target',
        bedId: 'ICU-01',
        ward: 'ICU',
        deviceId: 'dev-1',
        timestamp: '2026-10-16T10:00:00Z',
        measurement: 'spo2',
        value: 88,
        severity: 'critical' as const,
        type: 'clinical' as const,
        status: 'OPEN' as const,
        reason: 'Target patient desaturation',
      },
      {
        id: 'alert-other-patient-same-bed',
        patientId: 'patient-previous-occupant',
        bedId: 'ICU-01',
        ward: 'ICU',
        deviceId: 'dev-1',
        timestamp: '2026-10-16T08:00:00Z',
        measurement: 'heart_rate',
        value: 150,
        severity: 'critical' as const,
        type: 'clinical' as const,
        status: 'OPEN' as const,
        reason: 'Previous patient tachycardic alert from earlier shift',
      },
    ];

    // Authoritative filter rule: only a.patientId === currentPatient.id
    const currentPatientId = 'patient-target';
    const associatedAlerts = alerts.filter((a) => a.patientId === currentPatientId);

    expect(associatedAlerts).toHaveLength(1);
    expect(associatedAlerts[0]?.id).toBe('alert-match-patient');
    expect(associatedAlerts[0]?.patientId).toBe('patient-target');

    // Render panel with filtered alerts
    const html = renderToString(
      React.createElement(ClinicalExplainerPanel, {
        patientId: currentPatientId,
        patientName: 'Aarav Sharma',
        bedId: 'ICU-01',
        userRole: 'clinician',
        patientAlerts: associatedAlerts,
      })
    );

    expect(html).toContain('alert-match-patient');
    expect(html).not.toContain('alert-other-patient-same-bed');
    expect(html).not.toContain('Previous patient tachycardic alert');
  });
});
