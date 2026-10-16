'use client';

import React, { useEffect, useState } from 'react';
import io, { type Socket } from 'socket.io-client';
import { Navbar } from './Navbar';
import { BedCard } from './BedCard';
import { PatientDetailModal } from './PatientDetailModal';
import { AlertsBanner } from './AlertsBanner';
import { ThresholdsModal } from './ThresholdsModal';
import { LoginModal } from './LoginModal';
import { MqttDropRecorderModal } from './MqttDropRecorderModal';
import type { PatientSummary, AlertItem, UserProfile } from '../lib/api';
import {
  fetchPatients,
  fetchAlerts,
  getWsBaseUrl,
  getAuthToken,
  setAuthToken,
  fetchCurrentUser,
  fetchDropOverview,
} from '../lib/api';
import { getIndianPatientProfile, type VitalsMessage, type MqttDropEvent, type DropRecordingSession } from '@wicare/shared';

export const DashboardClient: React.FC = () => {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [liveVitalsMap, setLiveVitalsMap] = useState<Record<string, VitalsMessage['vitals']>>({});
  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [showThresholdsModal, setShowThresholdsModal] = useState(false);
  const [showDropsModal, setShowDropsModal] = useState(false);
  const [liveDrops, setLiveDrops] = useState<MqttDropEvent[]>([]);
  const [activeRecordingSession, setActiveRecordingSession] = useState<DropRecordingSession | null>(null);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Load user session on mount
  useEffect(() => {
    fetchCurrentUser().then((user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        // Default viewer user if not logged in
        setCurrentUser({
          id: 'default-viewer',
          email: 'viewer@wicare.local',
          name: 'Staff Clinician',
          role: 'clinician',
        });
      }
    });
  }, []);

  // Initial fetch of patients & alerts & drops
  useEffect(() => {
    fetchPatients()
      .then((res) => setPatients(res.patients))
      .catch((err) => console.error(err));

    fetchAlerts()
      .then((res) => setAlerts(res.alerts))
      .catch((err) => console.error(err));

    fetchDropOverview()
      .then((res) => {
        setLiveDrops(res.recentDrops);
        if (res.stats.activeSession) {
          setActiveRecordingSession(res.stats.activeSession);
        }
      })
      .catch((err) => console.error(err));
  }, []);

  const socketRef = React.useRef<Socket | null>(null);

  // Socket.IO real-time connection
  useEffect(() => {
    const wsUrl = getWsBaseUrl();
    const token = getAuthToken();

    const socket: Socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      auth: { token },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsWsConnected(true);
      socket.emit('subscribe:all');
      fetchPatients(true).then((res) => setPatients(res.patients)).catch((err) => console.error(err));
      fetchAlerts().then((res) => setAlerts(res.alerts)).catch((err) => console.error(err));
    });

    socket.on('disconnect', () => {
      setIsWsConnected(false);
    });

    socket.on('vitals:update', (msg: VitalsMessage) => {
      setLiveVitalsMap((prev) => ({
        ...prev,
        [msg.deviceId]: msg.vitals,
        [msg.patientId]: msg.vitals,
      }));

      setPatients((prev) => {
        const idx = prev.findIndex((p) => p.deviceId === msg.deviceId || p.id === msg.patientId);
        if (idx >= 0) {
          const updated = [...prev];
          const existing = updated[idx];
          if (existing) {
            updated[idx] = {
              ...existing,
              status: 'online',
              lastSeen: msg.timestamp,
            };
          }
          return updated;
        } else {
          const match = msg.patientId ? msg.patientId.match(/\d+/) : null;
          const num = match ? parseInt(match[0], 10) : 1;
          const profile = getIndianPatientProfile(num);
          return [
            ...prev,
            {
              id: msg.patientId,
              name: profile.name,
              age: profile.age,
              gender: profile.gender,
              bloodGroup: profile.bloodGroup,
              uhid: profile.uhid,
              primaryDiagnosis: profile.primaryDiagnosis,
              attendingDoctor: profile.attendingDoctor,
              admissionDate: profile.admissionDate,
              allergies: profile.allergies,
              comorbidities: profile.comorbidities,
              baselineLabs: profile.baselineLabs,
              clinicalNotes: profile.clinicalNotes,
              bedId: msg.bedId,
              ward: msg.ward,
              status: 'online',
              deviceId: msg.deviceId,
              lastSeen: msg.timestamp,
              firstSeq: msg.seq,
              lastSeq: msg.seq,
              totalReceived: 1,
              gapCount: 0,
              totalGaps: 0,
              measuredLossRate: 0,
            },
          ];
        }
      });
    });

    socket.on('device:status', (evt: { deviceId: string; status: 'online' | 'offline'; timestamp: string }) => {
      if (evt.status === 'offline') {
        setPatients((prev) => prev.filter((p) => p.deviceId !== evt.deviceId));
        setLiveVitalsMap((prev) => {
          const next = { ...prev };
          delete next[evt.deviceId];
          return next;
        });
        setAlerts((prev) => prev.filter((a) => a.deviceId !== evt.deviceId));
      } else {
        setPatients((prev) =>
          prev.map((p) => {
            if (p.deviceId === evt.deviceId) {
              return { ...p, status: evt.status, lastSeen: evt.timestamp };
            }
            return p;
          }),
        );
      }
    });

    socket.on('device:stats', (evt: { deviceId: string; measuredLossRate: number; totalReceived: number }) => {
      setPatients((prev) =>
        prev.map((p) => {
          if (p.deviceId === evt.deviceId) {
            return {
              ...p,
              measuredLossRate: evt.measuredLossRate,
              totalReceived: evt.totalReceived,
            };
          }
          return p;
        }),
      );
    });

    socket.on('alert:new', (alert: AlertItem) => {
      setAlerts((prev) => [alert, ...prev.filter((a) => a.id !== alert.id)]);
    });

    socket.on('alert:updated', (alert: AlertItem) => {
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? alert : a)));
    });

    socket.on('alert:resolved', (alert: AlertItem) => {
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    });

    socket.on('network:drop', (drop: MqttDropEvent) => {
      setLiveDrops((prev) => [drop, ...prev.slice(0, 499)]);
      setActiveRecordingSession((prev) => {
        if (prev && prev.isActive) {
          return {
            ...prev,
            dropsCount: prev.dropsCount + 1,
            totalPacketsLost: prev.totalPacketsLost + drop.droppedCount,
          };
        }
        return prev;
      });
    });

    socket.on('recorder:status', (evt: { active: boolean; session: DropRecordingSession | null }) => {
      setActiveRecordingSession(evt.session);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (socketRef.current && currentUser) {
      const token = getAuthToken();
      socketRef.current.auth = { token };
    }
  }, [currentUser]);

  const handleLogout = () => {
    setAuthToken(null);
    setCurrentUser(null);
    setShowLoginModal(true);
  };

  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'workstation' | 'grid'>('workstation');
  const [bedSearchTerm, setBedSearchTerm] = useState('');
  const [bedFilter, setBedFilter] = useState<'active' | 'all' | 'alarm'>('active');

  // Display patients currently transmitting live vitals or marked online
  const activePatients = patients.filter((p) => {
    const hasLiveVitals = Boolean(
      (p.deviceId && liveVitalsMap[p.deviceId]) || liveVitalsMap[p.id],
    );
    return hasLiveVitals || p.status === 'online';
  });

  // Alarming patients
  const alarmingPatients = patients.filter((p) =>
    alerts.some(
      (a) =>
        (a.status === 'OPEN' || a.status === 'ACKNOWLEDGED') &&
        (a.patientId === p.id || a.deviceId === p.deviceId),
    ),
  );

  // Selected bed filter pool
  const basePool =
    bedFilter === 'alarm'
      ? alarmingPatients
      : bedFilter === 'all'
      ? patients
      : activePatients.length > 0
      ? activePatients
      : patients;

  const filteredSidebarBeds = basePool.filter((p) => {
    if (!bedSearchTerm.trim()) return true;
    const q = bedSearchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.bedId.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    );
  });

  const displayedPatients = activePatients.length > 0 ? activePatients : patients;

  // Authoritative selected patient for the Right Canvas:
  const currentSelectedPatient =
    patients.find((p) => p.id === selectedPatientId) ||
    filteredSidebarBeds[0] ||
    activePatients[0] ||
    patients[0] ||
    null;

  // Filter alerts to only active ones for currently monitored patients
  const displayedAlerts = alerts.filter(
    (a) =>
      (a.status === 'OPEN' || a.status === 'ACKNOWLEDGED') &&
      displayedPatients.some((p) => p.id === a.patientId || p.deviceId === a.deviceId),
  );

  return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar
        isWsConnected={isWsConnected}
        activePatientCount={displayedPatients.length}
        onOpenThresholds={() => setShowThresholdsModal(true)}
        onOpenDrops={() => setShowDropsModal(true)}
        dropCount={liveDrops.length}
        isRecordingDrops={!!(activeRecordingSession && activeRecordingSession.isActive)}
        currentUser={currentUser}
        onOpenLogin={() => setShowLoginModal(true)}
        onLogout={handleLogout}
      />

      <main className="main-content" style={{ maxWidth: '1600px', padding: '1.25rem 1.5rem 3rem' }}>
        {/* Top Controls: Hospital Alerts Bar & Workstation Switcher */}
        <div style={{ marginBottom: '1.25rem' }}>
          <AlertsBanner
            alerts={displayedAlerts}
            onAlertUpdated={(updated) =>
              setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
            }
            onAlertResolved={(resolvedId) =>
              setAlerts((prev) => prev.filter((a) => a.id !== resolvedId))
            }
          />
        </div>

        {/* View Mode & Header Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>ICU Clinical Workstation</span>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                }}
              >
                {activePatients.length} Active Streams
              </span>
            </h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Live telemetry stream • Sequence gap monitoring • On-demand AI Deterioration Explainer
            </p>
          </div>

          {/* Workstation vs Grid Mode Switcher */}
          <div style={{ display: 'flex', gap: '0.4rem', background: '#0f172a', padding: '0.25rem', borderRadius: 8, border: '1px solid #1e293b' }}>
            <button
              type="button"
              onClick={() => setViewMode('workstation')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                padding: '0.4rem 0.75rem',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: viewMode === 'workstation' ? '#2563eb' : 'transparent',
                color: viewMode === 'workstation' ? '#ffffff' : '#94a3b8',
                transition: 'all 0.15s',
              }}
            >
              <span>☷ Workstation (Split Canvas)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                padding: '0.4rem 0.75rem',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: viewMode === 'grid' ? '#2563eb' : 'transparent',
                color: viewMode === 'grid' ? '#ffffff' : '#94a3b8',
                transition: 'all 0.15s',
              }}
            >
              <span>⊞ Ward Overview (Grid)</span>
            </button>
          </div>
        </div>

        {/* WORKSTATION VIEW: Left Beds Bar + Right Selected Canvas */}
        {viewMode === 'workstation' ? (
          <div className="workstation-container">
            {/* LEFT BEDS ROSTER BAR */}
            <aside className="beds-sidebar glass-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc' }}>
                  Ward Beds Roster
                </span>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  {filteredSidebarBeds.length} of {patients.length} beds
                </span>
              </div>

              {/* Search Bar */}
              <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  className="search-input"
                  style={{ width: '100%', fontSize: '0.8rem', padding: '0.45rem 0.75rem' }}
                  placeholder="Search bed or patient..."
                  value={bedSearchTerm}
                  onChange={(e) => setBedSearchTerm(e.target.value)}
                />
              </div>

              {/* Filter Pills */}
              <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setBedFilter('active')}
                  style={{
                    flex: 1,
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '0.3rem 0.4rem',
                    borderRadius: 5,
                    border: '1px solid',
                    borderColor: bedFilter === 'active' ? '#38bdf8' : '#1e293b',
                    background: bedFilter === 'active' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                    color: bedFilter === 'active' ? '#38bdf8' : '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  Active ({activePatients.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBedFilter('all')}
                  style={{
                    flex: 1,
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '0.3rem 0.4rem',
                    borderRadius: 5,
                    border: '1px solid',
                    borderColor: bedFilter === 'all' ? '#38bdf8' : '#1e293b',
                    background: bedFilter === 'all' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                    color: bedFilter === 'all' ? '#38bdf8' : '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  All ({patients.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBedFilter('alarm')}
                  style={{
                    flex: 1,
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '0.3rem 0.4rem',
                    borderRadius: 5,
                    border: '1px solid',
                    borderColor: bedFilter === 'alarm' ? '#ef4444' : '#1e293b',
                    background: bedFilter === 'alarm' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                    color: bedFilter === 'alarm' ? '#f87171' : '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  Alarms ({alarmingPatients.length})
                </button>
              </div>

              {/* Scrollable Bed List */}
              <div className="beds-sidebar-list">
                {filteredSidebarBeds.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b', fontSize: '0.8rem' }}>
                    No beds match filter.
                  </div>
                ) : (
                  filteredSidebarBeds.map((patient) => {
                    const patientVitals =
                      liveVitalsMap[patient.deviceId || ''] || liveVitalsMap[patient.id];
                    const isSelected = currentSelectedPatient?.id === patient.id;
                    const patientAlertList = alerts.filter(
                      (a) =>
                        (a.status === 'OPEN' || a.status === 'ACKNOWLEDGED') &&
                        (a.patientId === patient.id || a.deviceId === patient.deviceId),
                    );
                    const hasCriticalAlarm = patientAlertList.some((a) => a.severity === 'critical');
                    const hasWarningAlarm = patientAlertList.some((a) => a.severity === 'warning');

                    return (
                      <div
                        key={patient.id}
                        className={`bed-list-item ${isSelected ? 'selected' : ''} ${
                          hasCriticalAlarm ? 'alarm' : ''
                        }`}
                        onClick={() => setSelectedPatientId(patient.id)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <span
                              className="bed-badge"
                              style={{
                                fontSize: '0.82rem',
                                padding: '0.15rem 0.45rem',
                                background: hasCriticalAlarm ? '#ef4444' : isSelected ? '#0284c7' : '#1e293b',
                                color: '#fff',
                              }}
                            >
                              {patient.bedId}
                            </span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>
                              {patient.name}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              {patient.age}{patient.gender?.charAt(0)}
                            </span>
                          </div>
                          {hasCriticalAlarm ? (
                            <span className="clinical-badge-critical" style={{ fontSize: '0.62rem', padding: '1px 5px' }}>
                              CRITICAL
                            </span>
                          ) : hasWarningAlarm ? (
                            <span className="clinical-badge-warning" style={{ fontSize: '0.62rem', padding: '1px 5px' }}>
                              ALERT
                            </span>
                          ) : patient.status === 'online' ? (
                            <span
                              style={{
                                display: 'inline-block',
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: '#10b981',
                                boxShadow: '0 0 6px #10b981',
                              }}
                            />
                          ) : (
                            <span style={{ fontSize: '0.65rem', color: '#64748b' }}>OFFLINE</span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.1rem' }}>
                          <span style={{ color: hasCriticalAlarm ? '#f87171' : '#f43f5e', fontWeight: 600 }}>
                            HR {patientVitals?.heart_rate?.value ? patientVitals.heart_rate.value.toFixed(0) : '—'}
                          </span>
                          <span style={{ color: '#06b6d4', fontWeight: 600 }}>
                            SpO₂ {patientVitals?.spo2?.value ? `${patientVitals.spo2.value.toFixed(0)}%` : '—'}
                          </span>
                          <span style={{ color: '#10b981', fontWeight: 600 }}>
                            RR {patientVitals?.respiratory_rate?.value ? patientVitals.respiratory_rate.value.toFixed(0) : '—'}
                          </span>
                          <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                            {patientVitals?.temperature?.value ? `${patientVitals.temperature.value.toFixed(1)}°` : '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>

            {/* RIGHT MAIN SELECTED BED CANVAS */}
            <section className="right-canvas-area">
              {currentSelectedPatient ? (
                <PatientDetailModal
                  patient={currentSelectedPatient}
                  liveVitals={
                    liveVitalsMap[currentSelectedPatient.deviceId || ''] ||
                    liveVitalsMap[currentSelectedPatient.id]
                  }
                  isEmbedded={true}
                  currentUser={currentUser}
                  patientAlerts={alerts.filter((a) => a.patientId === currentSelectedPatient.id)}
                />
              ) : (
                <div
                  className="glass-panel"
                  style={{
                    padding: '3rem 2rem',
                    textAlign: 'center',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.4rem', color: '#fff' }}>
                    No ICU Bed Selected
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Please select an ICU bed from the left roster to view live waveforms, clinical notes, and AI deterioration analysis.
                  </p>
                </div>
              )}
            </section>
          </div>
        ) : (
          /* TRADITIONAL WARD GRID VIEW */
          <div className="bed-grid">
            {displayedPatients.map((patient) => (
              <BedCard
                key={patient.id}
                patient={patient}
                vitals={liveVitalsMap[patient.deviceId || ''] || liveVitalsMap[patient.id]}
                onClick={() => {
                  setSelectedPatientId(patient.id);
                  setViewMode('workstation');
                }}
              />
            ))}
          </div>
        )}
      </main>

      {selectedPatient && (
        <PatientDetailModal
          patient={selectedPatient}
          liveVitals={liveVitalsMap[selectedPatient.deviceId || ''] || liveVitalsMap[selectedPatient.id]}
          onClose={() => setSelectedPatient(null)}
          currentUser={currentUser}
          patientAlerts={alerts.filter((a) => a.patientId === selectedPatient.id)}
        />
      )}

      {showThresholdsModal && (
        <ThresholdsModal onClose={() => setShowThresholdsModal(false)} />
      )}

      {showLoginModal && (
        <LoginModal
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            setShowLoginModal(false);
          }}
          onClose={() => setShowLoginModal(false)}
        />
      )}

      {showDropsModal && (
        <MqttDropRecorderModal
          isOpen={showDropsModal}
          onClose={() => setShowDropsModal(false)}
          liveDrops={liveDrops}
          activeRecordingSession={activeRecordingSession}
          onSessionChange={(s) => setActiveRecordingSession(s)}
        />
      )}
    </div>
  );
};
