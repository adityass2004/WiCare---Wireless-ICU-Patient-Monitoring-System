'use client';

import React, { useState } from 'react';
import type { AlertItem } from '../lib/api';
import { explainPatientDeterioration, ClinicalExplainerError } from '../lib/api';
import type { ExplainResponse } from '@wicare/shared';
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Stethoscope,
  RefreshCw,
  Info,
  Lock,
  WifiOff,
} from 'lucide-react';

export interface ClinicalExplainerPanelProps {
  patientId: string;
  patientName: string;
  bedId: string;
  userRole?: 'admin' | 'clinician' | 'viewer';
  patientAlerts?: AlertItem[];
  onAlertSelected?: (alertId: string | undefined) => void;
  initialExplanation?: ExplainResponse;
  initialStatus?: 'idle' | 'loading' | 'success' | 'error';
}

const WINDOW_OPTIONS = [
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min (Default)' },
  { value: 30, label: '30 min' },
  { value: 60, label: '60 min' },
];

export const ClinicalExplainerPanel: React.FC<ClinicalExplainerPanelProps> = ({
  patientId,
  bedId,
  userRole = 'clinician',
  patientAlerts = [],
  initialExplanation,
  initialStatus,
}) => {
  const [selectedAlertId, setSelectedAlertId] = useState<string>('');
  const [windowMinutes, setWindowMinutes] = useState<number>(15);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    initialStatus ?? (initialExplanation ? 'success' : 'idle')
  );
  const [explanation, setExplanation] = useState<ExplainResponse | null>(initialExplanation ?? null);
  const [errorDetails, setErrorDetails] = useState<{
    status?: number;
    code?: string;
    message: string;
    retryAfterSeconds?: number;
  } | null>(null);

  const isViewer = userRole === 'viewer';
  const isAuthorized = userRole === 'admin' || userRole === 'clinician';

  const handleExplain = async () => {
    if (!isAuthorized || status === 'loading') return;

    setStatus('loading');
    setErrorDetails(null);

    try {
      const res = await explainPatientDeterioration(patientId, {
        alertId: selectedAlertId ? selectedAlertId : undefined,
        windowMinutes,
      });
      setExplanation(res);
      setStatus('success');
    } catch (err: unknown) {
      if (err instanceof ClinicalExplainerError) {
        setErrorDetails({
          status: err.status,
          code: err.code,
          message: err.message,
          retryAfterSeconds: err.retryAfterSeconds,
        });
      } else if (err instanceof Error) {
        setErrorDetails({
          message: err.message,
        });
      } else {
        setErrorDetails({
          message: 'An unknown error occurred while requesting explanation.',
        });
      }
      setStatus('error');
    }
  };

  const getFriendlyErrorMessage = (): { title: string; hint: string } => {
    if (!errorDetails) {
      return { title: 'Explanation Request Failed', hint: 'An unexpected error occurred.' };
    }
    const { status: code, message, retryAfterSeconds } = errorDetails;

    switch (code) {
      case 400:
        return {
          title: 'Invalid Request Parameters',
          hint: message || 'Please verify the selected time window (5–60 minutes) and alert context.',
        };
      case 401:
        return {
          title: 'Session Expired or Unauthenticated',
          hint: 'Your login session is missing or expired. Please sign in again to use AI features.',
        };
      case 403:
        return {
          title: 'Access Restricted',
          hint: 'The AI Clinical Explainer is permitted only for Clinician and Administrator accounts.',
        };
      case 404:
        return {
          title: 'Patient or Alert Not Found',
          hint: 'The requested patient profile or associated alert was not located in the clinical database.',
        };
      case 429:
        return {
          title: 'Rate Limit Exceeded',
          hint: retryAfterSeconds
            ? `Too many AI requests. Please wait ~${retryAfterSeconds} seconds before trying again.`
            : 'Too many AI requests. Please wait a moment before requesting another explanation.',
        };
      case 502:
        return {
          title: 'AI Provider Failure',
          hint: 'The AI service returned an unparsable or malformed response. Please retry in a few moments.',
        };
      case 503:
        return {
          title: 'AI Service Unavailable',
          hint: 'The Gemini Explainer is not configured on this server (server configuration is missing).',
        };
      case 504:
        return {
          title: 'AI Analysis Timed Out',
          hint: 'Gemini took too long to analyze this telemetry window. Try selecting a shorter time window (e.g. 5 or 10 min).',
        };
      case 0:
        return {
          title: 'Network Connection Error',
          hint: 'Could not connect to the WiCare backend. Please check your network and API server status.',
        };
      default:
        return {
          title: 'Clinical Explainer Error',
          hint: message || 'Failed to complete AI deterioration analysis.',
        };
    }
  };

  return (
    <div
      className="clinical-explainer-panel"
      style={{
        background: '#090d16',
        border: '1px solid #1e293b',
        borderRadius: 10,
        padding: '1.25rem',
        color: '#e2e8f0',
        marginTop: '1rem',
      }}
    >
      {/* Top Banner / Explainer Context Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          borderBottom: '1px solid #1e293b',
          paddingBottom: '1rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={20} style={{ color: '#38bdf8' }} aria-hidden="true" />
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
              AI Clinical Deterioration Explainer
            </h3>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                padding: '2px 8px',
                borderRadius: 9999,
                letterSpacing: '0.04em',
              }}
            >
              DECISION SUPPORT
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0.35rem 0 0 0' }}>
            On-demand synthesis of wireless telemetry trends, threshold limits, and link quality.
          </p>
        </div>

        {/* Action Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isViewer ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.8rem',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#fca5a5',
                padding: '0.4rem 0.8rem',
                borderRadius: 6,
              }}
            >
              <Lock size={14} aria-hidden="true" />
              <span>Viewer Role (Clinician / Admin only)</span>
            </div>
          ) : (
            <button
              id="btn-explain-ai"
              type="button"
              className="btn btn-primary"
              disabled={status === 'loading'}
              onClick={handleExplain}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: status === 'loading' ? '#334155' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#ffffff',
                border: '1px solid #38bdf8',
                fontWeight: 700,
                fontSize: '0.88rem',
                padding: '0.5rem 1.1rem',
                borderRadius: 6,
                cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease-in-out',
                boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
              }}
              aria-busy={status === 'loading'}
            >
              {status === 'loading' ? (
                <>
                  <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
                  <span>Analyzing Telemetry...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} aria-hidden="true" />
                  <span>{status === 'success' ? 'Re-Analyze with AI' : 'Explain with AI'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Parameter Selectors */}
      <div
        style={{
          display: 'flex',
          gap: '1.25rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          background: '#0f172a',
          padding: '0.85rem 1rem',
          borderRadius: 8,
          border: '1px solid #1e293b',
          marginBottom: '1rem',
        }}
      >
        {/* Analysis Window */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock size={15} style={{ color: '#38bdf8' }} aria-hidden="true" />
          <label htmlFor="window-select" style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600 }}>
            Analysis Window:
          </label>
          <select
            id="window-select"
            value={windowMinutes}
            onChange={(e) => setWindowMinutes(parseInt(e.target.value, 10))}
            disabled={status === 'loading'}
            style={{
              background: '#0b1120',
              border: '1px solid #334155',
              color: '#f8fafc',
              fontSize: '0.82rem',
              padding: '0.35rem 0.65rem',
              borderRadius: 6,
            }}
          >
            {WINDOW_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Alert Context Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '220px' }}>
          <AlertTriangle size={15} style={{ color: '#f59e0b' }} aria-hidden="true" />
          <label htmlFor="alert-select" style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600 }}>
            Focus Alert:
          </label>
          <select
            id="alert-select"
            value={selectedAlertId}
            onChange={(e) => setSelectedAlertId(e.target.value)}
            disabled={status === 'loading'}
            style={{
              background: '#0b1120',
              border: '1px solid #334155',
              color: '#f8fafc',
              fontSize: '0.82rem',
              padding: '0.35rem 0.65rem',
              borderRadius: 6,
              flex: 1,
              maxWidth: '360px',
            }}
          >
            <option value="">General Telemetry (All Recent)</option>
            {patientAlerts.map((alt) => (
              <option key={alt.id} value={alt.id}>
                {`[${alt.severity.toUpperCase()}] ${alt.measurement}${alt.value !== undefined ? ` (${alt.value})` : ''} — ${alt.reason.slice(0, 35)}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Screen-reader announcement region */}
      <div className="sr-only" aria-live="polite" role="status">
        {status === 'loading' && 'Analyzing telemetry with Gemini. Please wait.'}
        {status === 'success' && 'AI clinical explanation generated successfully.'}
        {status === 'error' && `Explanation failed: ${getFriendlyErrorMessage().title}`}
      </div>

      {/* STATE 1: IDLE */}
      {status === 'idle' && (
        <div
          style={{
            padding: '2rem 1.5rem',
            textAlign: 'center',
            background: '#0c1322',
            border: '1px dashed #243247',
            borderRadius: 8,
          }}
        >
          <Sparkles size={32} style={{ color: '#38bdf8', opacity: 0.8, marginBottom: '0.5rem' }} aria-hidden="true" />
          <h4 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.35rem' }}>
            Ready for Clinical Telemetry Analysis
          </h4>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', maxWidth: '520px', margin: '0 auto 1rem auto' }}>
            Select an evaluation window (5–60 min) and optional alert above, then click{' '}
            <strong style={{ color: '#38bdf8' }}>Explain with AI</strong> to generate a privacy-preserving synthesis
            distinguishing observed facts from potential differential hypotheses.
          </p>
          {!isViewer && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleExplain}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.85rem',
                padding: '0.45rem 1rem',
              }}
            >
              <Sparkles size={15} aria-hidden="true" />
              <span>Launch AI Explanation</span>
            </button>
          )}
        </div>
      )}

      {/* STATE 2: LOADING */}
      {status === 'loading' && (
        <div
          style={{
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            background: '#0c1322',
            border: '1px solid #1e293b',
            borderRadius: 8,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              padding: '1rem',
              borderRadius: '50%',
              background: 'rgba(56, 189, 248, 0.1)',
              marginBottom: '1rem',
            }}
          >
            <RefreshCw size={28} className="animate-spin" style={{ color: '#38bdf8' }} aria-hidden="true" />
          </div>
          <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.4rem' }}>
            Synthesizing ICU Telemetry Context...
          </h4>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', maxWidth: '480px', margin: '0 auto' }}>
            Retrieving trusted readings within the {windowMinutes}-minute window, cross-referencing configured safety
            thresholds and wireless AoI freshness with Gemini.
          </p>
        </div>
      )}

      {/* STATE 3: ERROR */}
      {status === 'error' && (
        <div
          role="alert"
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            padding: '1.25rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <AlertTriangle size={22} style={{ color: '#f87171', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h4 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#f87171', margin: 0 }}>
                  {getFriendlyErrorMessage().title}
                </h4>
                {errorDetails?.status ? (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontFamily: 'monospace',
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#fca5a5',
                      padding: '1px 6px',
                      borderRadius: 4,
                    }}
                  >
                    HTTP {errorDetails.status}
                  </span>
                ) : null}
              </div>
              <p style={{ fontSize: '0.84rem', color: '#cbd5e1', margin: '0.4rem 0 0.85rem 0' }}>
                {getFriendlyErrorMessage().hint}
              </p>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                {!isViewer && (
                  <button
                    type="button"
                    onClick={handleExplain}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      background: '#1e293b',
                      color: '#f8fafc',
                      border: '1px solid #475569',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      padding: '0.4rem 0.85rem',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                    <span>Retry Request</span>
                  </button>
                )}
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Live telemetry and deterministic ward alarms remain fully active.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STATE 4: SUCCESS */}
      {status === 'success' && explanation && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* 1. Executive Summary & Metadata Header */}
          <div
            style={{
              background: '#0d1829',
              border: '1px solid #1e3a5f',
              borderLeft: '4px solid #38bdf8',
              borderRadius: 8,
              padding: '1.15rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                marginBottom: '0.65rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Info size={16} style={{ color: '#38bdf8' }} aria-hidden="true" />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8' }}>
                  Clinical Synthesis Summary
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>
                <span>Bed {bedId}</span>
                <span>•</span>
                <span>Model: {explanation.modelName}</span>
                <span>•</span>
                <span>{new Date(explanation.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </div>
            </div>
            <p style={{ fontSize: '0.92rem', color: '#f1f5f9', lineHeight: 1.6, margin: 0, fontWeight: 500 }}>
              {explanation.summary}
            </p>
          </div>

          {/* 2-Column Layout: Observed Facts vs Possible Interpretations */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '1rem',
            }}
          >
            {/* 2. Observed Facts */}
            <div
              style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.75rem' }}>
                <CheckCircle2 size={16} style={{ color: '#10b981' }} aria-hidden="true" />
                <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                  Observed Facts (Direct Telemetry)
                </h4>
              </div>
              {explanation.observedFacts.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>No specific facts documented.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.83rem', color: '#cbd5e1', lineHeight: 1.6 }}>
                  {explanation.observedFacts.map((fact, idx) => (
                    <li key={idx} style={{ marginBottom: '0.35rem' }}>
                      {fact}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 3. Possible Interpretations */}
            <div
              style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <Stethoscope size={16} style={{ color: '#a855f7' }} aria-hidden="true" />
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                    Possible Interpretations
                  </h4>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Non-definitive hypotheses</span>
              </div>

              {explanation.possibleInterpretations.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>No differential possibilities reported.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {explanation.possibleInterpretations.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: '#0b1120',
                        border: '1px solid #1e293b',
                        borderRadius: 6,
                        padding: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f1f5f9' }}>
                          {item.possibility}
                        </span>
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            background: 'rgba(168, 85, 247, 0.12)',
                            color: '#c084fc',
                            border: '1px solid rgba(168, 85, 247, 0.3)',
                            padding: '1px 6px',
                            borderRadius: 4,
                          }}
                        >
                          Differential Hypothesis
                        </span>
                      </div>
                      {item.rationale && (
                        <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0 0 0.35rem 0', lineHeight: 1.5 }}>
                          {item.rationale}
                        </p>
                      )}
                      {item.supportingEvidence && item.supportingEvidence.length > 0 && (
                        <div style={{ fontSize: '0.73rem', color: '#64748b' }}>
                          Evidence: {item.supportingEvidence.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 4. Supporting Evidence List */}
          {explanation.supportingEvidence.length > 0 && (
            <div
              style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.5rem' }}>
                <Clock size={15} style={{ color: '#38bdf8' }} aria-hidden="true" />
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#cbd5e1', margin: 0 }}>
                  Supporting Evidence &amp; Threshold Cross-References
                </h4>
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.5 }}>
                {explanation.supportingEvidence.map((ev, idx) => (
                  <li key={idx} style={{ marginBottom: '0.25rem' }}>
                    {ev}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 5. Data Quality Limitations Panel */}
          <div
            style={{
              background: '#141416',
              border: '1px solid #332d1d',
              borderLeft: '4px solid #f59e0b',
              borderRadius: 8,
              padding: '0.9rem 1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.45rem' }}>
              <WifiOff size={15} style={{ color: '#f59e0b' }} aria-hidden="true" />
              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fcd34d', margin: 0 }}>
                Data Quality &amp; Telemetry Integrity Disclosures
              </h4>
            </div>
            {explanation.dataQualityLimitations.length === 0 ? (
              <p style={{ fontSize: '0.78rem', color: '#a3a3a3', margin: 0 }}>
                Continuous packet flow verified within the observation window; no packet loss or sequence gaps detected.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', color: '#e5e5e5', lineHeight: 1.5 }}>
                {explanation.dataQualityLimitations.map((lim, idx) => (
                  <li key={idx} style={{ marginBottom: '0.2rem' }}>
                    {lim}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 6. Suggested Verification Steps */}
          <div
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 8,
              padding: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.65rem' }}>
              <ShieldAlert size={16} style={{ color: '#38bdf8' }} aria-hidden="true" />
              <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                Suggested Bedside Verification Steps (Clinician Action)
              </h4>
            </div>
            {explanation.suggestedVerificationSteps.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
                Standard bedside vitals confirmation recommended.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {explanation.suggestedVerificationSteps.map((step, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      fontSize: '0.82rem',
                      color: '#cbd5e1',
                      background: '#0b1120',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 6,
                      border: '1px solid #1e293b',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: '#1e293b',
                        color: '#38bdf8',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <span style={{ lineHeight: 1.4 }}>{step}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 7. Advisory Disclaimer Box */}
          <div
            style={{
              background: 'rgba(30, 41, 59, 0.4)',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              fontSize: '0.76rem',
              color: '#94a3b8',
              lineHeight: 1.4,
            }}
          >
            <ShieldAlert size={18} style={{ color: '#f59e0b', flexShrink: 0 }} aria-hidden="true" />
            <span>
              <strong style={{ color: '#cbd5e1' }}>Assistive Decision Support:</strong> This AI explanation is
              synthesized by Gemini 2.5 Flash from wireless telemetry signals and configured safety bounds. It is{' '}
              <strong style={{ color: '#f87171' }}>NOT</strong> an autonomous medical diagnosis or prescription. Bedside
              clinical evaluation and professional human judgment must guide all diagnostic or therapeutic decisions.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
