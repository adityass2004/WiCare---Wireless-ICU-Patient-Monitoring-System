'use client';

import React, { useState } from 'react';
import type { SimulationConfig, PatientSummary } from '../lib/api';
import {
  updateSimulationConfig,
  startSimulation,
  stopSimulation,
  addSimBed,
  removeSimBed,
  updatePatientScenario,
  updatePatientOverride,
} from '../lib/api';
import type { VitalsMessage } from '@wicare/shared';
import {
  Cpu,
  Wifi,
  Zap,
  Play,
  Square,
  Plus,
  Minus,
  Activity,
  Heart,
  RotateCcw,
  Flame,
  Wind,
  CheckCircle2,
} from 'lucide-react';

interface ControlPanelProps {
  initialConfig: SimulationConfig;
  activePatients: PatientSummary[];
  liveVitalsMap?: Record<string, VitalsMessage['vitals']>;
  onConfigUpdated: (config: SimulationConfig) => void;
}

const CLINICAL_SCENARIOS = [
  { id: 'stable', label: 'Stable Baseline', color: '#10b981', desc: 'Physiologically normal vitals' },
  { id: 'rising_hr', label: 'Rising HR (Tachycardia)', color: '#f43f5e', desc: 'Accelerates HR > 130 bpm' },
  { id: 'falling_spo2', label: 'Falling SpO2 (Hypoxia)', color: '#06b6d4', desc: 'Oxygen drops < 90%' },
  { id: 'deterioration', label: 'Acute Deterioration', color: '#8b5cf6', desc: 'Multi-vital respiratory collapse' },
  { id: 'sudden_change', label: 'Sudden Cardiac Event', color: '#f59e0b', desc: 'Sudden erratic arrhythmia' },
  { id: 'sensor_malfunction', label: 'Sensor Malfunction', color: '#ef4444', desc: 'Signal noise & flatline artifacts' },
];

export const ControlPanel: React.FC<ControlPanelProps> = ({
  initialConfig,
  activePatients,
  liveVitalsMap = {},
  onConfigUpdated,
}) => {
  const [count, setCount] = useState(initialConfig.count);
  const [speed, setSpeed] = useState(initialConfig.speed);
  const [qos, setQos] = useState<0 | 1>(initialConfig.qos);
  const [lossPct, setLossPct] = useState(Math.round(initialConfig.lossRate * 100));
  const [delayMs, setDelayMs] = useState(initialConfig.fixedDelayMs);
  const [jitterMs, setJitterMs] = useState(initialConfig.jitterMs);
  const [saving, setSaving] = useState(false);

  // Selected target bed for clinical stimulus
  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    activePatients[0]?.id || 'P-001',
  );

  // Real-time user feedback notification banner
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'info' } | null>(
    null,
  );

  const showFeedback = (message: string, type: 'success' | 'info' = 'success') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  React.useEffect(() => {
    if (activePatients.length > 0) {
      const first = activePatients[0];
      if (first && (!selectedPatientId || !activePatients.some((p) => p.id === selectedPatientId))) {
        setSelectedPatientId(first.id);
      }
    }
  }, [activePatients, selectedPatientId]);

  const isSimActive = activePatients.length > 0 || count > 0 || initialConfig.count > 0;

  // 1. One-click Start / Stop / Add / Remove Bed
  const handleQuickStart = async (nodeCount = 5) => {
    setSaving(true);
    try {
      const res = await startSimulation(nodeCount);
      setCount(res.config.count);
      onConfigUpdated(res.config);
      showFeedback(`Simulation started with ${nodeCount} active wireless beds!`);
    } catch (err) {
      console.error(err);
      showFeedback(err instanceof Error ? err.message : 'Simulation start failed', 'info');
    } finally {
      setSaving(false);
    }
  };

  const handleStop = async () => {
    setSaving(true);
    try {
      const res = await stopSimulation();
      setCount(0);
      onConfigUpdated(res.config);
      showFeedback('Simulation stopped. All virtual medical devices taken offline.', 'info');
    } catch (err) {
      console.error(err);
      showFeedback(err instanceof Error ? err.message : 'Simulation stop failed', 'info');
    } finally {
      setSaving(false);
    }
  };

  const handleAddBed = async () => {
    setSaving(true);
    try {
      const res = await addSimBed();
      setCount(res.config.count);
      onConfigUpdated(res.config);
      showFeedback(`Added new bed to ward (Total: ${res.config.count} beds)`);
    } catch (err) {
      console.error(err);
      showFeedback(err instanceof Error ? err.message : 'Add bed failed', 'info');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveBed = async () => {
    setSaving(true);
    try {
      const res = await removeSimBed();
      setCount(res.config.count);
      onConfigUpdated(res.config);
      showFeedback(`Removed bed from ward (Remaining: ${res.config.count} beds)`);
    } catch (err) {
      console.error(err);
      showFeedback(err instanceof Error ? err.message : 'Remove bed failed', 'info');
    } finally {
      setSaving(false);
    }
  };

  // 2. Scenario injection on targeted bed
  const handleTriggerScenario = async (scId: string, label: string) => {
    try {
      await updatePatientScenario(selectedPatientId, scId);
      showFeedback(`Applied scenario "${label}" to ${selectedPatientId}`);
    } catch (err) {
      console.error(err);
      showFeedback(err instanceof Error ? err.message : 'Scenario update failed', 'info');
    }
  };

  // 3. Vital Stimulus / Nudge (+/- HR, SpO2, Temp, RR)
  const currentTargetPatient =
    activePatients.find((p) => p.id === selectedPatientId) || activePatients[0];
  const targetVitals = currentTargetPatient
    ? liveVitalsMap[currentTargetPatient.deviceId || ''] || liveVitalsMap[currentTargetPatient.id]
    : undefined;

  const handleVitalNudge = async (
    vital: 'heart_rate' | 'spo2' | 'temperature' | 'respiratory_rate',
    delta: number,
    unit: string,
  ) => {
    if (!currentTargetPatient) return;
    const currentVal = targetVitals?.[vital]?.value;
    const baseFallback =
      vital === 'heart_rate' ? 75 : vital === 'spo2' ? 98 : vital === 'temperature' ? 36.8 : 16;
    const base = typeof currentVal === 'number' ? currentVal : baseFallback;
    const newVal = Math.round((base + delta) * 10) / 10;

    try {
      await updatePatientOverride(currentTargetPatient.id, vital, newVal);
      showFeedback(
        `Stimulated ${currentTargetPatient.bedId}: ${vital.replace('_', ' ')} ${delta > 0 ? '+' : ''}${delta} -> ${newVal} ${unit}`,
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetBaseline = async () => {
    if (!currentTargetPatient) return;
    try {
      await updatePatientScenario(currentTargetPatient.id, 'stable');
      await updatePatientOverride(currentTargetPatient.id, 'heart_rate', null);
      await updatePatientOverride(currentTargetPatient.id, 'spo2', null);
      await updatePatientOverride(currentTargetPatient.id, 'temperature', null);
      await updatePatientOverride(currentTargetPatient.id, 'respiratory_rate', null);
      showFeedback(`Reset ${currentTargetPatient.bedId} (${currentTargetPatient.id}) to stable physiological baseline.`);
    } catch (err) {
      console.error(err);
    }
  };

  // 4. Save Network Settings
  const handleApplyNetwork = async () => {
    setSaving(true);
    try {
      const res = await updateSimulationConfig({
        count,
        speed,
        qos,
        lossRate: lossPct / 100,
        fixedDelayMs: delayMs,
        jitterMs,
      });
      if (res.success) {
        onConfigUpdated(res.config);
        showFeedback('Network emulator and QoS reconfigured successfully.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Feedback Banner */}
      {feedback && (
        <div
          className="glass-panel"
          style={{
            padding: '0.75rem 1.25rem',
            borderRadius: '10px',
            border: feedback.type === 'success' ? '1px solid #10b981' : '1px solid #3b82f6',
            background:
              feedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            animation: 'fadeIn 0.25s ease',
          }}
        >
          <CheckCircle2 size={18} color={feedback.type === 'success' ? '#10b981' : '#3b82f6'} />
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{feedback.message}</span>
        </div>
      )}

      {/* Simulator Master Power & Quick Controls */}
      <div
        className="glass-panel"
        style={{
          padding: '1.5rem',
          borderRadius: '14px',
          border: '1px solid var(--border-color)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: isSimActive ? '#10b981' : '#ef4444',
                  boxShadow: isSimActive ? '0 0 10px #10b981' : 'none',
                }}
              />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                Virtual Telemetry Simulation Engine
              </h3>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: isSimActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  color: isSimActive ? '#10b981' : '#ef4444',
                  fontWeight: 700,
                }}
              >
                {isSimActive ? `LIVE (${activePatients.length} Active Beds)` : 'STANDBY / OFFLINE'}
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  fontWeight: 600,
                }}
              >
                Decoupled Service (:4001)
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0.35rem 0 0' }}>
              Simulator runs independently from the main app. Run in separate terminal:{' '}
              <code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', color: '#38bdf8' }}>
                npm run simulator
              </code>{' '}
              or interactive CLI:{' '}
              <code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', color: '#38bdf8' }}>
                npm run simulator:cli
              </code>
            </p>
          </div>

          {/* Master Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {!isSimActive ? (
              <button
                id="btn-start-simulation"
                className="btn-submit"
                style={{
                  width: 'auto',
                  padding: '0.6rem 1.4rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                }}
                disabled={saving}
                onClick={() => handleQuickStart(5)}
              >
                <Play size={16} fill="#fff" /> Start Simulation (5 Beds)
              </button>
            ) : (
              <button
                id="btn-stop-simulation"
                className="btn-submit"
                style={{
                  width: 'auto',
                  padding: '0.6rem 1.4rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                }}
                disabled={saving}
                onClick={handleStop}
              >
                <Square size={16} fill="#fff" /> Stop Simulation
              </button>
            )}

            <button
              className="btn-toggle"
              style={{ padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              disabled={saving}
              onClick={handleAddBed}
            >
              <Plus size={16} color="#10b981" /> Add Bed
            </button>

            <button
              className="btn-toggle"
              style={{ padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              disabled={saving || activePatients.length <= 0}
              onClick={handleRemoveBed}
            >
              <Minus size={16} color="#ef4444" /> Remove Bed
            </button>
          </div>
        </div>

        {/* Quick Scale Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Quick Ward Scale:</span>
          {[1, 3, 5, 10, 20].map((n) => (
            <button
              key={n}
              className={`btn-toggle ${activePatients.length === n ? 'active' : ''}`}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
              disabled={saving}
              onClick={() => handleQuickStart(n)}
            >
              {n} {n === 1 ? 'Bed' : 'Beds'}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Clinical Stimulator & Scenario Deck */}
      <div
        className="glass-panel"
        style={{
          padding: '1.5rem',
          borderRadius: '14px',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={18} color="#f43f5e" /> Interactive Clinical Stimulator
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
            Select any live bed to stimulate patient vitals, inject scenarios, or test automated clinical alarms.
          </p>
        </div>

        {activePatients.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No simulated beds running. Click <strong>&quot;Start Simulation (5 Beds)&quot;</strong> above to enable live stimulator controls.
          </div>
        ) : (
          <div>
            {/* Target Bed Selector Tabs */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Target Bed Selection:
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {activePatients.map((p) => (
                  <button
                    key={p.id}
                    className={`btn-toggle ${selectedPatientId === p.id ? 'active' : ''}`}
                    style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}
                    onClick={() => setSelectedPatientId(p.id)}
                  >
                    {p.bedId} &bull; {p.id}
                  </button>
                ))}
              </div>
            </div>

            {/* Targeted Bed Live Telemetry Strip */}
            {currentTargetPatient && (
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  padding: '0.85rem 1.25rem',
                  borderRadius: '10px',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>
                    Bed {currentTargetPatient.bedId} &mdash; {currentTargetPatient.name}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Device: {currentTargetPatient.deviceId} &bull; Ward: {currentTargetPatient.ward}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1.25rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>HR</div>
                    <div className="mono" style={{ fontSize: '1rem', fontWeight: 700, color: '#f43f5e' }}>
                      {targetVitals?.heart_rate?.value ? targetVitals.heart_rate.value.toFixed(0) : '—'}
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '2px' }}>bpm</span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>SpO2</div>
                    <div className="mono" style={{ fontSize: '1rem', fontWeight: 700, color: '#06b6d4' }}>
                      {targetVitals?.spo2?.value ? targetVitals.spo2.value.toFixed(1) : '—'}
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '2px' }}>%</span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Temp</div>
                    <div className="mono" style={{ fontSize: '1rem', fontWeight: 700, color: '#f59e0b' }}>
                      {targetVitals?.temperature?.value ? targetVitals.temperature.value.toFixed(1) : '—'}
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '2px' }}>°C</span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>RR</div>
                    <div className="mono" style={{ fontSize: '1rem', fontWeight: 700, color: '#10b981' }}>
                      {targetVitals?.respiratory_rate?.value ? targetVitals.respiratory_rate.value.toFixed(0) : '—'}
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '2px' }}>brpm</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Clinical Scenario Injection Buttons */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.65rem' }}>
                Inject Clinical Scenario:
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '0.65rem',
                }}
              >
                {CLINICAL_SCENARIOS.map((sc) => (
                  <button
                    key={sc.id}
                    className="btn-toggle"
                    style={{
                      textAlign: 'left',
                      padding: '0.7rem 0.9rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.2rem',
                    }}
                    onClick={() => handleTriggerScenario(sc.id, sc.label)}
                  >
                    <div style={{ fontWeight: 700, color: sc.color, fontSize: '0.85rem' }}>
                      {sc.label}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{sc.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Vital Nudge Stimulation Controls */}
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.65rem' }}>
                Direct Vital Nudges (Stimulate Telemetry):
              </div>
              <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                <button
                  className="btn-toggle"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  onClick={() => handleVitalNudge('heart_rate', 10, 'bpm')}
                >
                  <Heart size={14} color="#f43f5e" /> HR +10 bpm
                </button>

                <button
                  className="btn-toggle"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  onClick={() => handleVitalNudge('heart_rate', -10, 'bpm')}
                >
                  <Heart size={14} color="#f43f5e" /> HR -10 bpm
                </button>

                <button
                  className="btn-toggle"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  onClick={() => handleVitalNudge('spo2', -3, '%')}
                >
                  <Activity size={14} color="#06b6d4" /> SpO2 -3% (Hypoxia)
                </button>

                <button
                  className="btn-toggle"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  onClick={() => handleVitalNudge('spo2', 3, '%')}
                >
                  <Activity size={14} color="#06b6d4" /> SpO2 +3%
                </button>

                <button
                  className="btn-toggle"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  onClick={() => handleVitalNudge('temperature', 0.5, '°C')}
                >
                  <Flame size={14} color="#f59e0b" /> Temp +0.5°C (Fever)
                </button>

                <button
                  className="btn-toggle"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  onClick={() => handleVitalNudge('temperature', -0.5, '°C')}
                >
                  <Flame size={14} color="#f59e0b" /> Temp -0.5°C
                </button>

                <button
                  className="btn-toggle"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  onClick={() => handleVitalNudge('respiratory_rate', 4, 'brpm')}
                >
                  <Wind size={14} color="#10b981" /> RR +4 brpm
                </button>

                <button
                  className="btn-toggle"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', borderColor: '#10b981' }}
                  onClick={handleResetBaseline}
                >
                  <RotateCcw size={14} color="#10b981" /> Reset Baseline Physiology
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Network Emulator & Protocol Reconfiguration */}
      <div className="control-grid">
        {/* Node Count & Speed */}
        <div className="glass-panel control-card">
          <h3 className="control-card-title">
            <Cpu size={18} color="#3b82f6" /> Nodes & Clock Speed
          </h3>

          <div className="form-group">
            <div className="form-label">
              <span>Simulated Patients / Devices</span>
              <span className="mono">{count} Nodes</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10) || 0)}
              className="range-slider"
            />
          </div>

          <div className="form-group">
            <div className="form-label">
              <span>Simulation Clock Speed</span>
              <span className="mono">{speed}x</span>
            </div>
            <div className="button-group">
              {[1, 2, 5, 10].map((s) => (
                <button
                  key={s}
                  className={`btn-toggle ${speed === s ? 'active' : ''}`}
                  onClick={() => setSpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Network Emulator Layer (Packet loss, delay, jitter) */}
        <div className="glass-panel control-card">
          <h3 className="control-card-title">
            <Wifi size={18} color="#8b5cf6" /> Network Emulator Layer
          </h3>

          <div className="form-group">
            <div className="form-label">
              <span>Packet Loss Rate</span>
              <span className="mono" style={{ color: lossPct > 0 ? '#f43f5e' : '#34d399' }}>
                {lossPct}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={lossPct}
              onChange={(e) => setLossPct(parseInt(e.target.value, 10))}
              className="range-slider"
            />
          </div>

          <div className="form-group">
            <div className="form-label">
              <span>Fixed Latency Delay</span>
              <span className="mono">{delayMs} ms</span>
            </div>
            <input
              type="range"
              min="0"
              max="500"
              step="10"
              value={delayMs}
              onChange={(e) => setDelayMs(parseInt(e.target.value, 10))}
              className="range-slider"
            />
          </div>

          <div className="form-group">
            <div className="form-label">
              <span>Delay Jitter</span>
              <span className="mono">{jitterMs} ms</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={jitterMs}
              onChange={(e) => setJitterMs(parseInt(e.target.value, 10))}
              className="range-slider"
            />
          </div>
        </div>

        {/* MQTT Protocol QoS Settings */}
        <div className="glass-panel control-card">
          <h3 className="control-card-title">
            <Zap size={18} color="#f59e0b" /> MQTT Protocol & Reconfiguration
          </h3>

          <div className="form-group">
            <div className="form-label">
              <span>Quality of Service (QoS)</span>
              <span className="mono">QoS {qos}</span>
            </div>
            <div className="button-group">
              <button
                className={`btn-toggle ${qos === 0 ? 'active' : ''}`}
                onClick={() => setQos(0)}
              >
                QoS 0 (At most once)
              </button>
              <button
                className={`btn-toggle ${qos === 1 ? 'active' : ''}`}
                onClick={() => setQos(1)}
              >
                QoS 1 (At least once)
              </button>
            </div>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <button
              className="btn-submit"
              onClick={handleApplyNetwork}
              disabled={saving}
            >
              {saving ? 'Reconfiguring Simulation...' : 'Apply Live Reconfiguration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
