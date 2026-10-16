'use client';

import React, { useState, useEffect } from 'react';
import io, { type Socket } from 'socket.io-client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { MqttDropEvent, DropRecordingSession } from '@wicare/shared';
import { getWsBaseUrl, getAuthToken, fetchDropOverview } from '../../lib/api';
import { MqttDropRecorderModal } from '../../components/MqttDropRecorderModal';

export default function MqttDropsPage() {
  const [liveDrops, setLiveDrops] = useState<MqttDropEvent[]>([]);
  const [activeSession, setActiveSession] = useState<DropRecordingSession | null>(null);

  useEffect(() => {
    // Initial fetch of recent drops
    fetchDropOverview()
      .then((data) => {
        setLiveDrops(data.recentDrops);
        if (data.stats.activeSession) {
          setActiveSession(data.stats.activeSession);
        }
      })
      .catch((err) => console.error(err));

    // Connect to WebSocket for real-time drop events
    const wsUrl = getWsBaseUrl();
    const token = getAuthToken();
    const socket: Socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      auth: { token },
    });

    socket.on('network:drop', (drop: MqttDropEvent) => {
      setLiveDrops((prev) => [drop, ...prev.slice(0, 499)]);
      if (activeSession && activeSession.isActive) {
        setActiveSession((prev) =>
          prev
            ? {
                ...prev,
                dropsCount: prev.dropsCount + 1,
                totalPacketsLost: prev.totalPacketsLost + drop.droppedCount,
              }
            : null,
        );
      }
    });

    socket.on('recorder:status', (evt: { active: boolean; session: DropRecordingSession | null }) => {
      setActiveSession(evt.session);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#090d16', color: '#f8fafc', padding: '1.5rem' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', marginBottom: '1.5rem' }}>
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            color: '#38bdf8',
            fontSize: '0.9rem',
            textDecoration: 'none',
            marginBottom: '1rem',
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to ICU Dashboard</span>
        </Link>
      </div>

      <MqttDropRecorderModal
        isOpen={true}
        onClose={() => {
          if (typeof window !== 'undefined') window.location.href = '/';
        }}
        liveDrops={liveDrops}
        activeRecordingSession={activeSession}
        onSessionChange={(s) => setActiveSession(s)}
      />
    </div>
  );
}
