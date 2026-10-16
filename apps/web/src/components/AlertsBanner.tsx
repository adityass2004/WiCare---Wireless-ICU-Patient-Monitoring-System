'use client';

import React, { useEffect, useRef } from 'react';
import type { AlertItem } from '../lib/api';
import { acknowledgeAlert, resolveAlert } from '../lib/api';
import { AlertTriangle, ShieldAlert, CheckCircle2, Volume2, VolumeX, AlertCircle } from 'lucide-react';

interface AlertsBannerProps {
  alerts: AlertItem[];
  onAlertUpdated: (alert: AlertItem) => void;
  onAlertResolved: (alertId: string) => void;
}

export const AlertsBanner: React.FC<AlertsBannerProps> = ({
  alerts,
  onAlertUpdated,
  onAlertResolved,
}) => {
  const [soundEnabled, setSoundEnabled] = React.useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const activeAlerts = alerts.filter((a) => a.status === 'OPEN' || a.status === 'ACKNOWLEDGED');
  const hasCritical = activeAlerts.some((a) => a.severity === 'critical' && a.status === 'OPEN');

  const playBeep = () => {
    if (!soundEnabled) return;
    try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // Audio autoplay policy fallback
    }
  };

  useEffect(() => {
    if (hasCritical) {
      playBeep();
    }
  }, [hasCritical, alerts.length]);

  const handleAck = async (id: string) => {
    try {
      const res = await acknowledgeAlert(id);
      if (res.success) {
        onAlertUpdated(res.alert);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolve = async (id: string) => {
    try {
      const res = await resolveAlert(id);
      if (res.success) {
        onAlertResolved(id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (activeAlerts.length === 0) {
    return (
      <div className="glass-panel alerts-banner-clean">
        <div className="clean-status">
          <CheckCircle2 size={20} color="#10b981" />
          <span>All Ward Systems Normal — No Active Clinical or Sensor Alerts</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`glass-panel alerts-banner ${hasCritical ? 'has-critical' : ''}`}>
      <div className="alerts-header">
        <div className="alerts-header-title">
          <ShieldAlert size={22} className={hasCritical ? 'pulse-icon' : ''} color={hasCritical ? '#f43f5e' : '#f59e0b'} />
          <h3>
            Active Ward Alerts ({activeAlerts.length})
          </h3>
        </div>
        <button
          className="btn-sound-toggle"
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? 'Mute Alert Sound' : 'Enable Alert Sound'}
        >
          {soundEnabled ? <Volume2 size={18} color="#10b981" /> : <VolumeX size={18} color="#9ca3af" />}
          <span>{soundEnabled ? 'Sound On' : 'Muted'}</span>
        </button>
      </div>

      <div className="alerts-list">
        {activeAlerts.map((alert) => {
          const isCrit = alert.severity === 'critical';
          const isAck = alert.status === 'ACKNOWLEDGED';

          return (
            <div
              key={alert.id}
              className={`alert-card severity-${alert.severity} status-${alert.status.toLowerCase()}`}
            >
              <div className="alert-main">
                <div className="alert-badge-wrap">
                  <span className={`severity-badge severity-${alert.severity}`}>
                    {isCrit ? <AlertTriangle size={14} /> : <AlertCircle size={14} />}
                    {alert.severity.toUpperCase()}
                  </span>
                  <span className="type-badge">{alert.type.toUpperCase()}</span>
                  <span className="patient-bed-badge">
                    {alert.patientId} &bull; Bed {alert.bedId} ({alert.ward})
                  </span>
                </div>

                <div className="alert-reason">{alert.reason}</div>
                <div className="alert-time">
                  Opened: {new Date(alert.timestamp).toLocaleTimeString()}
                  {alert.acknowledgedBy && ` • Ack by ${alert.acknowledgedBy}`}
                </div>
              </div>

              <div className="alert-actions">
                {!isAck && (
                  <button className="btn-ack" onClick={() => handleAck(alert.id)}>
                    Ack
                  </button>
                )}
                <button className="btn-resolve" onClick={() => handleResolve(alert.id)}>
                  Resolve
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
