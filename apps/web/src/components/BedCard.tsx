'use client';

import React from 'react';
import type { PatientSummary } from '../lib/api';
import type { VitalsMessage } from '@wicare/shared';
import { Heart, Activity, Thermometer, Wind } from 'lucide-react';

interface BedCardProps {
  patient: PatientSummary;
  vitals?: VitalsMessage['vitals'];
  onClick: () => void;
}

interface ThresholdCheck {
  isCritical: boolean;
  isWarning: boolean;
  tag: string | null;
}

function getHrStatus(val?: number): ThresholdCheck {
  if (val === undefined || val === null) return { isCritical: false, isWarning: false, tag: null };
  if (val >= 130) return { isCritical: true, isWarning: true, tag: 'CRITICAL HIGH (>130)' };
  if (val <= 45) return { isCritical: true, isWarning: true, tag: 'CRITICAL LOW (<45)' };
  if (val > 100) return { isCritical: false, isWarning: true, tag: 'HIGH (>100)' };
  if (val < 55) return { isCritical: false, isWarning: true, tag: 'LOW (<55)' };
  return { isCritical: false, isWarning: false, tag: null };
}

function getSpo2Status(val?: number): ThresholdCheck {
  if (val === undefined || val === null) return { isCritical: false, isWarning: false, tag: null };
  if (val < 90) return { isCritical: true, isWarning: true, tag: 'CRITICAL LOW (<90)' };
  if (val < 94) return { isCritical: false, isWarning: true, tag: 'LOW (<94)' };
  return { isCritical: false, isWarning: false, tag: null };
}

function getTempStatus(val?: number): ThresholdCheck {
  if (val === undefined || val === null) return { isCritical: false, isWarning: false, tag: null };
  if (val >= 39.0) return { isCritical: true, isWarning: true, tag: 'CRITICAL HIGH (>39.0)' };
  if (val > 37.8) return { isCritical: false, isWarning: true, tag: 'FEVER (>37.8)' };
  if (val < 35.0) return { isCritical: true, isWarning: true, tag: 'HYPOTHERMIA (<35.0)' };
  return { isCritical: false, isWarning: false, tag: null };
}

function getRrStatus(val?: number): ThresholdCheck {
  if (val === undefined || val === null) return { isCritical: false, isWarning: false, tag: null };
  if (val >= 30) return { isCritical: true, isWarning: true, tag: 'CRITICAL HIGH (>30)' };
  if (val <= 8) return { isCritical: true, isWarning: true, tag: 'CRITICAL LOW (<8)' };
  if (val > 24) return { isCritical: false, isWarning: true, tag: 'HIGH (>24)' };
  if (val < 10) return { isCritical: false, isWarning: true, tag: 'LOW (<10)' };
  return { isCritical: false, isWarning: false, tag: null };
}

export const BedCard: React.FC<BedCardProps> = ({ patient, vitals, onClick }) => {
  const hr = vitals?.heart_rate;
  const spo2 = vitals?.spo2;
  const temp = vitals?.temperature;
  const rr = vitals?.respiratory_rate;

  const hrStatus = getHrStatus(hr?.value);
  const spo2Status = getSpo2Status(spo2?.value);
  const tempStatus = getTempStatus(temp?.value);
  const rrStatus = getRrStatus(rr?.value);

  const hasCritical = hrStatus.isCritical || spo2Status.isCritical || tempStatus.isCritical || rrStatus.isCritical;
  const hasWarning = hrStatus.isWarning || spo2Status.isWarning || tempStatus.isWarning || rrStatus.isWarning;

  const cardBorderClass = hasCritical
    ? 'bed-card-critical'
    : hasWarning
    ? 'bed-card-warning'
    : '';

  const lossPct = (patient.measuredLossRate * 100).toFixed(1);

  return (
    <div className={`glass-panel bed-card ${cardBorderClass}`} onClick={onClick}>
      <div className="bed-card-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="bed-badge">{patient.bedId}</span>
            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#f8fafc' }}>
              {patient.name}
            </span>
            {patient.bloodGroup && (
              <span style={{ fontSize: '0.68rem', fontWeight: 700, background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', padding: '1px 5px', borderRadius: 4 }}>
                {patient.bloodGroup}
              </span>
            )}
          </div>
          <div className="patient-info" style={{ marginTop: '0.2rem' }}>
            <span>{patient.uhid ?? patient.id}</span> &bull; <span>{patient.age}y {patient.gender ? patient.gender.charAt(0) : ''}</span> &bull; <span>{patient.ward}</span>
          </div>
          {patient.primaryDiagnosis && (
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
              Dx: <strong style={{ color: '#cbd5e1' }}>{patient.primaryDiagnosis}</strong>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {hasCritical ? (
            <span className="clinical-badge-critical">ALARM</span>
          ) : hasWarning ? (
            <span className="clinical-badge-warning">WARNING</span>
          ) : (
            <span className="clinical-badge-normal">NORMAL</span>
          )}
        </div>
      </div>

      <div className="vitals-grid">
        {/* Heart Rate Tile */}
        <div className={`vital-tile ${hrStatus.isCritical ? 'tile-breached-critical' : hrStatus.isWarning ? 'tile-breached-warning' : 'vital-hr'}`}>
          <div className="vital-label">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Heart size={13} color="#f43f5e" /> HR
            </span>
            <span className="vital-limit">55-100</span>
          </div>
          <div className="vital-value mono">
            {hr ? hr.value.toFixed(0) : '—'}
            <span className="vital-unit">bpm</span>
          </div>
          {hrStatus.tag && <div className="vital-breach-tag">{hrStatus.tag}</div>}
        </div>

        {/* SpO2 Tile */}
        <div className={`vital-tile ${spo2Status.isCritical ? 'tile-breached-critical' : spo2Status.isWarning ? 'tile-breached-warning' : 'vital-spo2'}`}>
          <div className="vital-label">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Activity size={13} color="#06b6d4" /> SpO2
            </span>
            <span className="vital-limit">&ge;94%</span>
          </div>
          <div className="vital-value mono">
            {spo2 ? spo2.value.toFixed(1) : '—'}
            <span className="vital-unit">%</span>
          </div>
          {spo2Status.tag && <div className="vital-breach-tag">{spo2Status.tag}</div>}
        </div>

        {/* Temperature Tile */}
        <div className={`vital-tile ${tempStatus.isCritical ? 'tile-breached-critical' : tempStatus.isWarning ? 'tile-breached-warning' : 'vital-temp'}`}>
          <div className="vital-label">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Thermometer size={13} color="#f59e0b" /> Temp
            </span>
            <span className="vital-limit">36.0-37.8</span>
          </div>
          <div className="vital-value mono">
            {temp ? temp.value.toFixed(1) : '—'}
            <span className="vital-unit">°C</span>
          </div>
          {tempStatus.tag && <div className="vital-breach-tag">{tempStatus.tag}</div>}
        </div>

        {/* Resp Rate Tile */}
        <div className={`vital-tile ${rrStatus.isCritical ? 'tile-breached-critical' : rrStatus.isWarning ? 'tile-breached-warning' : 'vital-rr'}`}>
          <div className="vital-label">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Wind size={13} color="#10b981" /> Resp
            </span>
            <span className="vital-limit">10-24</span>
          </div>
          <div className="vital-value mono">
            {rr ? rr.value.toFixed(0) : '—'}
            <span className="vital-unit">brpm</span>
          </div>
          {rrStatus.tag && <div className="vital-breach-tag">{rrStatus.tag}</div>}
        </div>
      </div>

      <div className="card-footer" style={{ flexWrap: 'wrap', gap: '0.3rem' }}>
        <span>Doctor: <strong style={{ color: '#cbd5e1' }}>{patient.attendingDoctor ? patient.attendingDoctor.split(' (')[0] : 'Dr. Arvind Mehta'}</strong></span>
        <span>Loss: <strong className="mono">{lossPct}%</strong> &bull; {patient.deviceId ?? 'Unassigned'}</span>
      </div>
    </div>
  );
};
