'use client';

import React, { useEffect, useState } from 'react';
import type { PatientSummary, UserProfile, AlertItem } from '../lib/api';
import { fetchPatientReadings, updatePatientScenario, updatePatientOverride } from '../lib/api';
import type { VitalsMessage } from '@wicare/shared';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { X, Heart, Activity, Thermometer, Wind, FileText, ClipboardList, ShieldAlert, UserCheck, Sparkles } from 'lucide-react';
import { ClinicalExplainerPanel } from './ClinicalExplainerPanel';

interface PatientDetailModalProps {
  patient: PatientSummary;
  liveVitals?: VitalsMessage['vitals'];
  onClose?: () => void;
  currentUser?: UserProfile | null;
  patientAlerts?: AlertItem[];
  isEmbedded?: boolean;
}

const SCENARIOS = [
  { id: 'stable', label: 'Stable Baseline' },
  { id: 'rising_hr', label: 'Rising HR (Tachycardia)' },
  { id: 'falling_spo2', label: 'Falling SpO2 (Hypoxia)' },
  { id: 'deterioration', label: 'Multi-vital Deterioration' },
  { id: 'sudden_change', label: 'Sudden Onset Spike' },
  { id: 'sensor_malfunction', label: 'Sensor Malfunction' },
];

interface ChartPoint {
  time: string;
  hr?: number;
  spo2?: number;
  temp?: number;
  rr?: number;
  ecg?: number;
}

export const PatientDetailModal: React.FC<PatientDetailModalProps> = ({
  patient,
  liveVitals,
  onClose,
  currentUser,
  patientAlerts = [],
  isEmbedded = false,
}) => {
  const [activeTab, setActiveTab] = useState<'telemetry' | 'labs' | 'history' | 'notes' | 'ai-explainer'>('telemetry');
  const [readingsHistory, setReadingsHistory] = useState<ChartPoint[]>([]);
  const [selectedScenario, setSelectedScenario] = useState('stable');
  const [overrideVital, setOverrideVital] = useState('heart_rate');
  const [overrideValue, setOverrideValue] = useState('');
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetchPatientReadings(patient.id, 40)
      .then((res) => {
        if (!isMounted) return;
        const formatted = res.readings.map((r) => ({
          time: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          hr: r.vitals.heart_rate?.value,
          spo2: r.vitals.spo2?.value,
          temp: r.vitals.temperature?.value,
          rr: r.vitals.respiratory_rate?.value,
          ecg: r.vitals.ecg?.value,
        }));
        setReadingsHistory(formatted);
      })
      .catch((err) => console.error(err));

    return () => {
      isMounted = false;
    };
  }, [patient.id]);

  useEffect(() => {
    if (!liveVitals) return;
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newItem = {
      time: nowStr,
      hr: liveVitals.heart_rate?.value,
      spo2: liveVitals.spo2?.value,
      temp: liveVitals.temperature?.value,
      rr: liveVitals.respiratory_rate?.value,
      ecg: liveVitals.ecg?.value,
    };

    setReadingsHistory((prev) => [...prev.slice(-39), newItem]);
  }, [liveVitals]);

  const handleApplyScenario = async (scenario: string) => {
    setSelectedScenario(scenario);
    await updatePatientScenario(patient.id, scenario);
  };

  const handleApplyOverride = async (customVal?: number, customVit?: string) => {
    const vit = customVit || overrideVital;
    const val = customVal !== undefined ? customVal : parseFloat(overrideValue);
    if (!isNaN(val)) {
      await updatePatientOverride(patient.id, vit, val);
    }
  };

  const handleClearOverride = async () => {
    setOverrideValue('');
    for (const v of ['heart_rate', 'spo2', 'temperature', 'respiratory_rate']) {
      await updatePatientOverride(patient.id, v, null);
    }
  };

  const hrVal = liveVitals?.heart_rate?.value ?? readingsHistory[readingsHistory.length - 1]?.hr;
  const spo2Val = liveVitals?.spo2?.value ?? readingsHistory[readingsHistory.length - 1]?.spo2;
  const tempVal = liveVitals?.temperature?.value ?? readingsHistory[readingsHistory.length - 1]?.temp;
  const rrVal = liveVitals?.respiratory_rate?.value ?? readingsHistory[readingsHistory.length - 1]?.rr;

  const isHrCritical = typeof hrVal === 'number' && (hrVal >= 130 || hrVal <= 45);
  const isSpo2Critical = typeof spo2Val === 'number' && spo2Val < 90;
  const isTempCritical = typeof tempVal === 'number' && (tempVal >= 39.0 || tempVal < 35.0);
  const isRrCritical = typeof rrVal === 'number' && (rrVal >= 30 || rrVal <= 8);

  const hasCriticalAlarm = isHrCritical || isSpo2Critical || isTempCritical || isRrCritical;

  const innerContent = (
    <div
      className={`glass-panel ${isEmbedded ? 'embedded-patient-canvas' : 'modal-content'}`}
      style={{
        maxWidth: isEmbedded ? '100%' : '920px',
        width: isEmbedded ? '100%' : '95vw',
        maxHeight: isEmbedded ? 'none' : '90vh',
        overflowY: isEmbedded ? 'visible' : 'auto',
        padding: isEmbedded ? '1.5rem' : '1.75rem',
        background: '#0b1120',
        border: '1px solid #1e293b',
        borderRadius: '12px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {!isEmbedded && onClose && (
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>
      )}

      {/* Master Clinical Header */}
        <div style={{ borderBottom: '1px solid #1e293b', paddingBottom: '1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <span className="bed-badge" style={{ fontSize: '1.2rem', padding: '0.2rem 0.6rem' }}>
                  {patient.bedId}
                </span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>
                  {patient.name}
                </h2>
                {patient.bloodGroup && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '2px 8px', borderRadius: 4 }}>
                    {patient.bloodGroup}
                  </span>
                )}
                <span style={{ fontSize: '0.75rem', background: '#1e293b', color: '#94a3b8', padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace' }}>
                  {patient.uhid ?? patient.id}
                </span>
              </div>

              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.4rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <span>Age: <strong style={{ color: '#fff' }}>{patient.age} Yrs</strong></span>
                <span>Gender: <strong style={{ color: '#fff' }}>{patient.gender}</strong></span>
                <span>Ward: <strong style={{ color: '#fff' }}>{patient.ward}</strong></span>
                <span>Doctor: <strong style={{ color: '#38bdf8' }}>{patient.attendingDoctor ?? 'Dr. Arvind Mehta'}</strong></span>
              </div>

              <div style={{ marginTop: '0.45rem', fontSize: '0.85rem', color: '#cbd5e1' }}>
                Primary Diagnosis: <strong style={{ color: '#e2e8f0' }}>{patient.primaryDiagnosis ?? 'Acute ICU Telemetry Monitoring'}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
              {hasCriticalAlarm ? (
                <div className="clinical-badge-critical" style={{ fontSize: '0.85rem', padding: '0.35rem 0.8rem', textAlign: 'center' }}>
                  🚨 CRITICAL ALARM
                </div>
              ) : (
                <div className="clinical-badge-normal" style={{ fontSize: '0.85rem', padding: '0.35rem 0.8rem', textAlign: 'center' }}>
                  ● TELEMETRY ACTIVE
                </div>
              )}
              <button
                id="btn-header-explain-ai"
                type="button"
                className="btn btn-outline"
                onClick={() => setActiveTab('ai-explainer')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.65rem',
                  color: '#38bdf8',
                  borderColor: 'rgba(56, 189, 248, 0.4)',
                  background: 'rgba(56, 189, 248, 0.08)',
                  cursor: 'pointer',
                  borderRadius: 5,
                }}
              >
                <Sparkles size={13} aria-hidden="true" />
                <span>Explain with AI</span>
              </button>
              <div style={{ fontSize: '0.72rem', color: '#64748b', textAlign: 'right' }}>
                Admitted: {patient.admissionDate ?? '14 Oct 2026, 08:30 IST'}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <button
            className={`btn-toggle ${activeTab === 'telemetry' ? 'active' : ''}`}
            onClick={() => setActiveTab('telemetry')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Activity size={14} /> Live Telemetry &amp; Waveforms
          </button>
          <button
            className={`btn-toggle ${activeTab === 'ai-explainer' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai-explainer')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: activeTab === 'ai-explainer' ? '#38bdf8' : undefined,
              borderColor: activeTab === 'ai-explainer' ? '#38bdf8' : undefined,
            }}
          >
            <Sparkles size={14} style={{ color: '#38bdf8' }} /> AI Clinical Explainer
          </button>
          <button
            className={`btn-toggle ${activeTab === 'labs' ? 'active' : ''}`}
            onClick={() => setActiveTab('labs')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <ClipboardList size={14} /> Clinical Labs &amp; Data Collection
          </button>
          <button
            className={`btn-toggle ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <FileText size={14} /> Medical History &amp; Comorbidities
          </button>
          <button
            className={`btn-toggle ${activeTab === 'notes' ? 'active' : ''}`}
            onClick={() => setActiveTab('notes')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <UserCheck size={14} /> Clinical Round Notes
          </button>
        </div>

        {/* Tab 1: Live Telemetry */}
        {activeTab === 'telemetry' && (
          <div>
            {/* Live Vital 4-Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ background: '#0f172a', border: isHrCritical ? '2px solid #ef4444' : '1px solid #1e293b', padding: '0.85rem', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#f43f5e' }}><Heart size={14} /> Heart Rate</span>
                  <span className="mono" style={{ color: '#64748b' }}>55-100</span>
                </div>
                <div className="mono" style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f43f5e', marginTop: '0.2rem' }}>
                  {hrVal ? hrVal.toFixed(0) : '—'} <span style={{ fontSize: '0.75rem', color: '#64748b' }}>bpm</span>
                </div>
                {isHrCritical && <span style={{ fontSize: '0.68rem', fontWeight: 800, background: '#ef4444', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>CRITICAL HIGH</span>}
              </div>

              <div style={{ background: '#0f172a', border: isSpo2Critical ? '2px solid #ef4444' : '1px solid #1e293b', padding: '0.85rem', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#06b6d4' }}><Activity size={14} /> SpO2</span>
                  <span className="mono" style={{ color: '#64748b' }}>&ge;94%</span>
                </div>
                <div className="mono" style={{ fontSize: '1.75rem', fontWeight: 800, color: '#06b6d4', marginTop: '0.2rem' }}>
                  {spo2Val ? spo2Val.toFixed(1) : '—'} <span style={{ fontSize: '0.75rem', color: '#64748b' }}>%</span>
                </div>
                {isSpo2Critical && <span style={{ fontSize: '0.68rem', fontWeight: 800, background: '#ef4444', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>HYPOXIA ALARM</span>}
              </div>

              <div style={{ background: '#0f172a', border: isTempCritical ? '2px solid #ef4444' : '1px solid #1e293b', padding: '0.85rem', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#f59e0b' }}><Thermometer size={14} /> Temperature</span>
                  <span className="mono" style={{ color: '#64748b' }}>36.0-37.8</span>
                </div>
                <div className="mono" style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f59e0b', marginTop: '0.2rem' }}>
                  {tempVal ? tempVal.toFixed(1) : '—'} <span style={{ fontSize: '0.75rem', color: '#64748b' }}>°C</span>
                </div>
                {isTempCritical && <span style={{ fontSize: '0.68rem', fontWeight: 800, background: '#ef4444', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>FEVER ALARM</span>}
              </div>

              <div style={{ background: '#0f172a', border: isRrCritical ? '2px solid #ef4444' : '1px solid #1e293b', padding: '0.85rem', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#10b981' }}><Wind size={14} /> Resp Rate</span>
                  <span className="mono" style={{ color: '#64748b' }}>10-24</span>
                </div>
                <div className="mono" style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981', marginTop: '0.2rem' }}>
                  {rrVal ? rrVal.toFixed(0) : '—'} <span style={{ fontSize: '0.75rem', color: '#64748b' }}>brpm</span>
                </div>
                {isRrCritical && <span style={{ fontSize: '0.68rem', fontWeight: 800, background: '#ef4444', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>TACHYPNEA</span>}
              </div>
            </div>

            {/* Clinical Scenario Trigger & Overrides */}
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '1rem', borderRadius: 8, marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#cbd5e1' }}>Clinical Scenario Controls</span>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Direct Hospital Telemetry Injection</span>
              </div>
              <div className="button-group" style={{ marginBottom: '0.75rem' }}>
                {SCENARIOS.map((sc) => (
                  <button
                    key={sc.id}
                    className={`btn-toggle ${selectedScenario === sc.id ? 'active' : ''}`}
                    onClick={() => handleApplyScenario(sc.id)}
                  >
                    {sc.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => handleApplyOverride(145, 'heart_rate')}>
                  Trigger Tachycardia 145 bpm
                </button>
                <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => handleApplyOverride(42, 'heart_rate')}>
                  Trigger Bradycardia 42 bpm
                </button>
                <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => handleApplyOverride(82, 'spo2')}>
                  Trigger Hypoxia 82%
                </button>
                <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => handleApplyOverride(39.5, 'temperature')}>
                  Trigger High Fever 39.5°C
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={overrideVital}
                  onChange={(e) => setOverrideVital(e.target.value)}
                  style={{ background: '#0b1120', border: '1px solid #334155', padding: '0.4rem 0.6rem', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                >
                  <option value="heart_rate">Heart Rate (bpm)</option>
                  <option value="spo2">SpO2 (%)</option>
                  <option value="temperature">Temperature (°C)</option>
                  <option value="respiratory_rate">Resp Rate (brpm)</option>
                </select>
                <input
                  type="number"
                  placeholder="Custom value"
                  value={overrideValue}
                  onChange={(e) => setOverrideValue(e.target.value)}
                  style={{ background: '#0b1120', border: '1px solid #334155', padding: '0.4rem 0.8rem', borderRadius: '6px', color: '#fff', width: '130px' }}
                />
                <button className="btn-toggle active" onClick={() => handleApplyOverride()}>Set Vital</button>
                <button className="btn-toggle" onClick={handleClearOverride}>Reset Normal</button>
              </div>
            </div>

            {/* Real-time Trend Charts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '1rem', borderRadius: 8 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f43f5e', marginBottom: '0.5rem' }}>
                  Heart Rate Trend (bpm) &bull; Threshold Limit: 55 - 100
                </div>
                <div style={{ width: '100%', height: 160 }}>
                  {hasMounted ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={readingsHistory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                        <YAxis domain={['dataMin - 10', 'dataMax + 10']} stroke="#64748b" fontSize={11} />
                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', color: '#fff' }} />
                        <Line type="monotone" dataKey="hr" stroke="#f43f5e" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <div>Loading...</div>}
                </div>
              </div>

              <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '1rem', borderRadius: 8 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#06b6d4', marginBottom: '0.5rem' }}>
                  SpO2 Saturation Trend (%) &bull; Critical Limit: &lt; 90%
                </div>
                <div style={{ width: '100%', height: 160 }}>
                  {hasMounted ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={readingsHistory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                        <YAxis domain={[70, 100]} stroke="#64748b" fontSize={11} />
                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', color: '#fff' }} />
                        <Line type="monotone" dataKey="spo2" stroke="#06b6d4" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <div>Loading...</div>}
                </div>
              </div>
            </div>

            {/* Embedded AI Clinical Explainer on Telemetry Tab */}
            <ClinicalExplainerPanel
              patientId={patient.id}
              patientName={patient.name}
              bedId={patient.bedId}
              userRole={currentUser?.role ?? 'clinician'}
              patientAlerts={patientAlerts}
            />
          </div>
        )}

        {/* Tab 2: Clinical Labs & Data Collection */}
        {activeTab === 'labs' && (
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.85rem', color: '#f8fafc' }}>
              Diagnostic Laboratory Data Collection
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '0.85rem', borderRadius: 8 }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Blood Pressure (NIBP)</div>
                <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', marginTop: '0.2rem' }}>
                  {patient.baselineLabs?.bloodPressure ?? '124/78 mmHg'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Target: &lt; 130/80 mmHg</div>
              </div>

              <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '0.85rem', borderRadius: 8 }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Random Blood Glucose</div>
                <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', marginTop: '0.2rem' }}>
                  {patient.baselineLabs?.bloodGlucose ?? '138 mg/dL'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Postprandial target &lt; 180</div>
              </div>

              <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '0.85rem', borderRadius: 8 }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Hemoglobin (Hb)</div>
                <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', marginTop: '0.2rem' }}>
                  {patient.baselineLabs?.hemoglobin ?? '12.8 g/dL'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Ref: 12.0 - 15.5 g/dL</div>
              </div>

              <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '0.85rem', borderRadius: 8 }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Serum Creatinine</div>
                <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', marginTop: '0.2rem' }}>
                  {patient.baselineLabs?.serumCreatinine ?? '1.0 mg/dL'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Ref: 0.7 - 1.2 mg/dL</div>
              </div>

              <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '0.85rem', borderRadius: 8 }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Arterial Blood Gas (pH)</div>
                <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8', marginTop: '0.2rem' }}>
                  {patient.baselineLabs?.arterialPh ?? '7.38'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Normal: 7.35 - 7.45</div>
              </div>

              <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '0.85rem', borderRadius: 8 }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Serum Lactate</div>
                <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', marginTop: '0.2rem' }}>
                  {patient.baselineLabs?.serumLactate ?? '1.2 mmol/L'}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Normal: &lt; 2.0 mmol/L</div>
              </div>
            </div>

            <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '1rem', borderRadius: 8 }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem', color: '#f8fafc' }}>
                Electrolyte Panel
              </h4>
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                <div>Sodium (Na+): <strong className="mono" style={{ color: '#fff' }}>{patient.baselineLabs?.sodium ?? '138 mEq/L'}</strong> (135-145)</div>
                <div>Potassium (K+): <strong className="mono" style={{ color: '#fff' }}>{patient.baselineLabs?.potassium ?? '4.2 mEq/L'}</strong> (3.5-5.0)</div>
                <div>Chloride (Cl-): <strong className="mono" style={{ color: '#fff' }}>102 mEq/L</strong> (98-106)</div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Medical History & Comorbidities */}
        {activeTab === 'history' && (
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.85rem', color: '#f8fafc' }}>
              Patient History &amp; Comorbidity Profile
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '1rem', borderRadius: 8 }}>
                <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <ShieldAlert size={15} /> Known Drug &amp; Food Allergies
                </h4>
                <ul style={{ listStyle: 'none', paddingLeft: 0, fontSize: '0.85rem' }}>
                  {(patient.allergies && patient.allergies.length > 0 ? patient.allergies : ['None Known (NKDA)']).map((al, idx) => (
                    <li key={idx} style={{ padding: '0.3rem 0', borderBottom: '1px solid #1e293b', color: '#fca5a5' }}>
                      &bull; {al}
                    </li>
                  ))}
                </ul>
              </div>

              <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '1rem', borderRadius: 8 }}>
                <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#38bdf8', marginBottom: '0.5rem' }}>
                  Documented Comorbidities
                </h4>
                <ul style={{ listStyle: 'none', paddingLeft: 0, fontSize: '0.85rem' }}>
                  {(patient.comorbidities && patient.comorbidities.length > 0 ? patient.comorbidities : ['Essential Hypertension', 'Type 2 Diabetes']).map((cm, idx) => (
                    <li key={idx} style={{ padding: '0.3rem 0', borderBottom: '1px solid #1e293b', color: '#cbd5e1' }}>
                      &bull; {cm}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '1rem', borderRadius: 8, marginTop: '1rem' }}>
              <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
                Admission &amp; Attending Care Team
              </h4>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.8 }}>
                <div>Lead Intensivist: <strong style={{ color: '#fff' }}>{patient.attendingDoctor ?? 'Dr. Arvind Mehta (MD, DM Cardiology)'}</strong></div>
                <div>Assigned ICU Wing: <strong style={{ color: '#fff' }}>{patient.ward} &mdash; Bed {patient.bedId}</strong></div>
                <div>Universal Hospital ID: <strong style={{ color: '#fff' }} className="mono">{patient.uhid ?? patient.id}</strong></div>
                <div>Telemetry Device serial: <strong className="mono" style={{ color: '#38bdf8' }}>{patient.deviceId ?? 'DEV-ICU-001'}</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Clinical Notes & Rounds */}
        {activeTab === 'notes' && (
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.85rem', color: '#f8fafc' }}>
              ICU Clinical Progress &amp; Round Notes
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(patient.clinicalNotes && patient.clinicalNotes.length > 0 ? patient.clinicalNotes : [
                '14:00 - Routine multi-parameter wireless telemetry check. Signal strength excellent.',
                '11:30 - Patient hemodynamically assessed during rounds. Continuous ECG rhythm monitored.',
                '08:30 - Morning ICU consultant evaluation conducted by attending staff. Telemetry thresholds calibrated.',
              ]).map((note, idx) => (
                <div key={idx} style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '0.85rem 1rem', borderRadius: 8, fontSize: '0.85rem', color: '#cbd5e1' }}>
                  <div style={{ fontWeight: 600, color: '#38bdf8', marginBottom: '0.2rem' }}>Clinical Log #{idx + 1}</div>
                  <div>{note}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 5: Dedicated AI Clinical Explainer Tab */}
        {activeTab === 'ai-explainer' && (
          <div>
            <ClinicalExplainerPanel
              patientId={patient.id}
              patientName={patient.name}
              bedId={patient.bedId}
              userRole={currentUser?.role ?? 'clinician'}
              patientAlerts={patientAlerts}
            />
          </div>
        )}
      </div>
    );

    if (isEmbedded) {
      return innerContent;
    }

    return (
      <div className="modal-overlay" onClick={onClose}>
        {innerContent}
      </div>
    );
  };
