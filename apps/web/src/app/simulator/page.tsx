'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ControlPanel } from '../../components/ControlPanel';
import { fetchSimulationStatus, fetchPatients, type SimulationConfig, type PatientSummary } from '../../lib/api';
import { ArrowLeft, ExternalLink } from 'lucide-react';

export default function SimulatorPage() {
  const [config, setConfig] = useState<SimulationConfig>({
    count: 0,
    speed: 1,
    qos: 0,
    publishIntervalMs: 1000,
    lossRate: 0,
    fixedDelayMs: 0,
    jitterMs: 0,
    brokerUrl: 'mqtt://localhost:1883',
  });
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchSimulationStatus().then((res) => {
        if (res.config) setConfig(res.config);
      }).catch(() => {}),
      fetchPatients().then((res) => {
        if (res.patients) setPatients(res.patients);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: '100vh', padding: '1.5rem', background: '#090d16', color: '#fff' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            padding: '1rem 1.5rem',
            background: 'rgba(15, 23, 42, 0.7)',
            borderRadius: '14px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link
              href="/"
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 1rem',
                fontSize: '0.85rem',
                textDecoration: 'none',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#fff',
              }}
            >
              <ArrowLeft size={16} />
              <span>Back to Clinical Dashboard</span>
            </Link>
            <div>
              <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>WiCare Telemetry Simulator Console</h1>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Standalone Simulator Controller</span>
            </div>
          </div>

          <a
            href="http://localhost:4001"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              color: '#60a5fa',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            <span>Open Native Simulator Studio (Port 4001)</span>
            <ExternalLink size={14} />
          </a>
        </header>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading simulator status...</div>
        ) : (
          <ControlPanel
            initialConfig={config}
            activePatients={patients}
            onConfigUpdated={(newCfg) => setConfig(newCfg)}
          />
        )}
      </div>
    </div>
  );
}
