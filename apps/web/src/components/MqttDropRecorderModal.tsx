'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Wifi,
  Radio,
  Play,
  Square,
  Download,
  Trash2,
  X,
  Zap,
  Filter,
} from 'lucide-react';
import type { MqttDropEvent, DropRecordingSession, MqttDropStats } from '@wicare/shared';
import {
  fetchDropOverview,
  startDropRecording,
  stopDropRecording,
  clearRecordedDrops,
  setSimulatorNetworkLoss,
} from '../lib/api';

interface MqttDropRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  liveDrops: MqttDropEvent[];
  activeRecordingSession: DropRecordingSession | null;
  onSessionChange: (session: DropRecordingSession | null) => void;
}

export const MqttDropRecorderModal: React.FC<MqttDropRecorderModalProps> = ({
  isOpen,
  onClose,
  liveDrops,
  activeRecordingSession,
  onSessionChange,
}) => {
  const [stats, setStats] = useState<MqttDropStats | null>(null);
  const [filterBed, setFilterBed] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sessionNameInput, setSessionNameInput] = useState<string>('');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [impairmentLevel, setImpairmentLevel] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Sync drop stats from backend
  const loadOverview = async () => {
    try {
      const data = await fetchDropOverview();
      setStats(data.stats);
      if (data.stats.activeSession) {
        onSessionChange(data.stats.activeSession);
      }
    } catch (err) {
      console.error('Failed to load drop stats:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadOverview();
      const interval = setInterval(loadOverview, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Elapsed recording timer
  useEffect(() => {
    if (!activeRecordingSession || !activeRecordingSession.isActive) {
      setElapsedSeconds(0);
      return;
    }
    const startTime = new Date(activeRecordingSession.startedAt).getTime();
    const updateTimer = () => {
      const now = Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((now - startTime) / 1000)));
    };
    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [activeRecordingSession]);

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleStartRecording = async () => {
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const res = await startDropRecording(sessionNameInput.trim() || undefined);
      onSessionChange(res.session);
      setStatusMessage(`Started recording session: ${res.session.name}`);
      setSessionNameInput('');
      await loadOverview();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start recording';
      setStatusMessage(`Error: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStopRecording = async () => {
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const res = await stopDropRecording();
      onSessionChange(res.session);
      setStatusMessage('Recording stopped and saved.');
      await loadOverview();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to stop recording';
      setStatusMessage(`Error: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm('Clear all recorded MQTT drop events?')) return;
    try {
      await clearRecordedDrops();
      setStatusMessage('Drop logs cleared.');
      await loadOverview();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to clear';
      setStatusMessage(`Error: ${msg}`);
    }
  };

  const handleSetImpairment = async (lossRate: number) => {
    setImpairmentLevel(lossRate);
    setStatusMessage(`Applying ${(lossRate * 100).toFixed(0)}% simulated packet loss...`);
    try {
      await setSimulatorNetworkLoss(lossRate);
      setStatusMessage(`Network impairment set to ${(lossRate * 100).toFixed(0)}% packet loss`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Impairment error: ${msg}`);
    }
  };

  // Export functions
  const handleExportCsv = () => {
    if (liveDrops.length === 0) {
      alert('No drop records to export.');
      return;
    }
    const headers = [
      'Timestamp',
      'Bed ID',
      'Device ID',
      'Patient ID',
      'Ward',
      'Expected Seq',
      'Received Seq',
      'Dropped Packets',
      'AoI Latency (ms)',
      'QoS',
      'Session ID',
    ];
    const rows = liveDrops.map((d) => [
      d.timestamp,
      d.bedId,
      d.deviceId,
      d.patientId,
      d.ward,
      d.expectedSeq,
      d.receivedSeq,
      d.droppedCount,
      d.aoiMs,
      d.qos,
      d.recordingSessionId || 'none',
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `mqtt_drops_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJson = () => {
    if (liveDrops.length === 0) {
      alert('No drop records to export.');
      return;
    }
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(liveDrops, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `mqtt_drops_log_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter drops
  const filteredDrops = useMemo(() => {
    return liveDrops.filter((d) => {
      const matchesBed = filterBed === 'all' || d.bedId === filterBed;
      const matchesSearch =
        searchQuery === '' ||
        d.bedId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.deviceId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.patientId.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesBed && matchesSearch;
    });
  }, [liveDrops, filterBed, searchQuery]);

  const uniqueBeds = useMemo(() => {
    const set = new Set<string>();
    liveDrops.forEach((d) => set.add(d.bedId));
    return Array.from(set).sort();
  }, [liveDrops]);

  if (!isOpen) return null;

  const isRecording = !!(activeRecordingSession && activeRecordingSession.isActive);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 7, 13, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: '#0d1322',
          border: '1px solid #1e293b',
          borderRadius: 16,
          width: '100%',
          maxWidth: 960,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          color: '#f8fafc',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, #131b2e 0%, #0d1322 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                display: 'grid',
                placeItems: 'center',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              <Radio size={22} className={isRecording ? 'pulse-rec' : ''} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                  MQTT Packet Drop Recorder & Network Health
                </h2>
                {isRecording && (
                  <span
                    style={{
                      background: '#ef4444',
                      color: '#fff',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      padding: '0.15rem 0.5rem',
                      borderRadius: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#fff',
                        display: 'inline-block',
                      }}
                    />
                    REC {formatTimer(elapsedSeconds)}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0.2rem 0 0' }}>
                Local broker: <code style={{ color: '#38bdf8' }}>mqtt://localhost:1883</code> &bull; Real-time loss gap analysis
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '0.4rem',
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
          {statusMessage && (
            <div
              style={{
                background: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                color: '#38bdf8',
                padding: '0.6rem 0.9rem',
                borderRadius: 8,
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}
            >
              {statusMessage}
            </div>
          )}

          {/* Metric Cards Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.85rem',
              marginBottom: '1.25rem',
            }}
          >
            <div
              style={{
                background: '#131b2e',
                border: '1px solid #1e293b',
                borderRadius: 10,
                padding: '0.85rem',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                Total Missing Packets
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f87171' }}>
                {stats?.totalPacketsLost ?? liveDrops.reduce((acc, d) => acc + d.droppedCount, 0)}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Sequence gap total</div>
            </div>

            <div
              style={{
                background: '#131b2e',
                border: '1px solid #1e293b',
                borderRadius: 10,
                padding: '0.85rem',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                Drop Incidents Logged
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fbbf24' }}>
                {liveDrops.length}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Recorded gap events</div>
            </div>

            <div
              style={{
                background: '#131b2e',
                border: '1px solid #1e293b',
                borderRadius: 10,
                padding: '0.85rem',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                Avg Network Loss Rate
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#38bdf8' }}>
                {stats?.averageLossRatePercent ?? 0}%
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Active beds average</div>
            </div>

            <div
              style={{
                background: '#131b2e',
                border: '1px solid #1e293b',
                borderRadius: 10,
                padding: '0.85rem',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                Active Monitored Beds
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4ade80' }}>
                {stats?.activeDevicesCount ?? uniqueBeds.length}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Broadcasting telemetry</div>
            </div>
          </div>

          {/* Recorder Controls Bar */}
          <div
            style={{
              background: '#131b2e',
              border: '1px solid #1e293b',
              borderRadius: 12,
              padding: '1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 260 }}>
              {!isRecording ? (
                <>
                  <input
                    type="text"
                    placeholder="Session label (e.g. Test Run #1)..."
                    value={sessionNameInput}
                    onChange={(e) => setSessionNameInput(e.target.value)}
                    style={{
                      background: '#0a0f1d',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      padding: '0.45rem 0.75rem',
                      fontSize: '0.85rem',
                      color: '#fff',
                      flex: 1,
                    }}
                  />
                  <button
                    onClick={handleStartRecording}
                    disabled={isSubmitting}
                    style={{
                      background: '#ef4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '0.45rem 1rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <Play size={15} />
                    <span>Start Recording</span>
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f87171' }}>
                      Recording in progress: {activeRecordingSession?.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      Elapsed: {formatTimer(elapsedSeconds)} &bull; Drops logged:{' '}
                      {activeRecordingSession?.dropsCount ?? 0}
                    </div>
                  </div>
                  <button
                    onClick={handleStopRecording}
                    disabled={isSubmitting}
                    style={{
                      background: '#334155',
                      color: '#f8fafc',
                      border: '1px solid #475569',
                      borderRadius: 8,
                      padding: '0.45rem 1rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <Square size={15} />
                    <span>Stop Recording</span>
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                onClick={handleExportCsv}
                title="Export as CSV"
                style={{
                  background: '#1e293b',
                  color: '#e2e8f0',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '0.45rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <Download size={14} />
                <span>Export CSV</span>
              </button>
              <button
                onClick={handleExportJson}
                title="Export as JSON"
                style={{
                  background: '#1e293b',
                  color: '#e2e8f0',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '0.45rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <Download size={14} />
                <span>JSON</span>
              </button>
              <button
                onClick={handleClear}
                title="Clear Logs"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 8,
                  padding: '0.45rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <Trash2 size={14} />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Network Impairment Controls ("A Little Bit Functionalities") */}
          <div
            style={{
              background: '#0d1322',
              border: '1px solid #1e293b',
              borderRadius: 10,
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Zap size={16} color="#fbbf24" />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>
                Simulate Network Drops (Interactive):
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {[
                { label: '0% (Clean)', val: 0 },
                { label: '5% Loss', val: 0.05 },
                { label: '15% Loss', val: 0.15 },
                { label: '30% Severe', val: 0.3 },
                { label: '50% Extreme', val: 0.5 },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => handleSetImpairment(item.val)}
                  style={{
                    background: impairmentLevel === item.val ? '#0284c7' : '#1e293b',
                    color: '#fff',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filter Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.75rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 200 }}>
              <Filter size={15} color="#94a3b8" />
              <input
                type="text"
                placeholder="Filter by Bed, Device, Patient ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: '#131b2e',
                  border: '1px solid #1e293b',
                  borderRadius: 6,
                  padding: '0.35rem 0.6rem',
                  fontSize: '0.8rem',
                  color: '#fff',
                  width: '100%',
                  maxWidth: 240,
                }}
              />
              {uniqueBeds.length > 0 && (
                <select
                  value={filterBed}
                  onChange={(e) => setFilterBed(e.target.value)}
                  style={{
                    background: '#131b2e',
                    border: '1px solid #1e293b',
                    borderRadius: 6,
                    padding: '0.35rem 0.6rem',
                    fontSize: '0.8rem',
                    color: '#fff',
                  }}
                >
                  <option value="all">All Beds</option>
                  {uniqueBeds.map((bed) => (
                    <option key={bed} value={bed}>
                      {bed}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Showing {filteredDrops.length} of {liveDrops.length} drops
            </div>
          </div>

          {/* Live Drops Table */}
          <div
            style={{
              background: '#131b2e',
              border: '1px solid #1e293b',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            {filteredDrops.length === 0 ? (
              <div
                style={{
                  padding: '3rem 1.5rem',
                  textAlign: 'center',
                  color: '#64748b',
                }}
              >
                <Wifi size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>No Packet Drops Detected</div>
                <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  The wireless MQTT telemetry stream is transmitting smoothly with 0 sequence gaps.
                </div>
              </div>
            ) : (
              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr
                      style={{
                        background: '#0a0f1d',
                        borderBottom: '1px solid #1e293b',
                        textAlign: 'left',
                        color: '#94a3b8',
                      }}
                    >
                      <th style={{ padding: '0.6rem 0.8rem' }}>Time</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Bed / Ward</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Device ID</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Seq Gap</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Missing Packets</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>AoI Latency</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Session</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDrops.map((drop) => {
                      const timeStr = new Date(drop.timestamp).toLocaleTimeString();
                      return (
                        <tr
                          key={drop.id}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          }}
                        >
                          <td style={{ padding: '0.55rem 0.8rem', fontFamily: 'monospace' }}>
                            {timeStr}
                          </td>
                          <td style={{ padding: '0.55rem 0.8rem', fontWeight: 600 }}>
                            <span
                              style={{
                                background: '#1e293b',
                                padding: '0.15rem 0.4rem',
                                borderRadius: 4,
                                color: '#38bdf8',
                              }}
                            >
                              {drop.bedId}
                            </span>{' '}
                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{drop.ward}</span>
                          </td>
                          <td style={{ padding: '0.55rem 0.8rem', fontFamily: 'monospace', color: '#94a3b8' }}>
                            {drop.deviceId}
                          </td>
                          <td style={{ padding: '0.55rem 0.8rem', fontFamily: 'monospace' }}>
                            {drop.expectedSeq} &rarr; <span style={{ color: '#f87171' }}>{drop.receivedSeq}</span>
                          </td>
                          <td style={{ padding: '0.55rem 0.8rem' }}>
                            <span
                              style={{
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#ef4444',
                                fontWeight: 700,
                                padding: '0.15rem 0.45rem',
                                borderRadius: 4,
                              }}
                            >
                              -{drop.droppedCount} pkts
                            </span>
                          </td>
                          <td style={{ padding: '0.55rem 0.8rem', color: '#94a3b8' }}>
                            {drop.aoiMs} ms
                          </td>
                          <td style={{ padding: '0.55rem 0.8rem' }}>
                            {drop.recordingSessionId ? (
                              <span
                                style={{
                                  background: 'rgba(56, 189, 248, 0.15)',
                                  color: '#38bdf8',
                                  fontSize: '0.7rem',
                                  padding: '0.1rem 0.35rem',
                                  borderRadius: 4,
                                }}
                              >
                                Tagged
                              </span>
                            ) : (
                              <span style={{ color: '#64748b', fontSize: '0.7rem' }}>Live</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
