import React from 'react';
import { Activity, Sliders, Wifi, WifiOff, User, LogOut, Radio } from 'lucide-react';
import type { UserProfile } from '../lib/api';

interface NavbarProps {
  activeTab?: string;
  onTabChange?: (tab: 'dashboard') => void;
  isWsConnected: boolean;
  activePatientCount: number;
  onOpenThresholds: () => void;
  onOpenDrops?: () => void;
  dropCount?: number;
  isRecordingDrops?: boolean;
  currentUser: UserProfile | null;
  onOpenLogin: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onTabChange,
  isWsConnected,
  activePatientCount,
  onOpenThresholds,
  onOpenDrops,
  dropCount = 0,
  isRecordingDrops = false,
  currentUser,
  onOpenLogin,
  onLogout,
}) => {
  const roleColors: Record<string, string> = {
    admin: '#ef4444',
    clinician: '#3b82f6',
    viewer: '#10b981',
  };

  return (
    <header className="app-header">
      <div className="header-container" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <div className="brand-section">
          <div className="brand-logo">Wi</div>
          <div>
            <h1 className="brand-title" style={{ fontSize: '1.2rem' }}>WiCare Central Hub</h1>
            <div className="patient-info" style={{ fontSize: '0.75rem' }}>
              {activePatientCount} Monitored Beds &bull; Wireless MQTT
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="nav-tabs" style={{ flexWrap: 'wrap' }}>
            <button
              id="tab-live-beds"
              className="nav-tab active"
              onClick={() => onTabChange && onTabChange('dashboard')}
            >
              <Activity size={15} />
              <span>Live ICU Beds</span>
            </button>
            <button
              className="nav-tab"
              onClick={onOpenThresholds}
              title="Configure Alert Thresholds"
            >
              <Sliders size={15} />
              <span>Thresholds</span>
            </button>
            <button
              id="tab-mqtt-drops"
              className="nav-tab"
              onClick={onOpenDrops}
              title="MQTT Packet Drop Recorder & Network Health"
              style={{
                borderColor: isRecordingDrops ? 'rgba(239, 68, 68, 0.6)' : undefined,
                background: isRecordingDrops ? 'rgba(239, 68, 68, 0.15)' : undefined,
              }}
            >
              <Radio size={15} color={isRecordingDrops ? '#ef4444' : undefined} />
              <span>MQTT Drops</span>
              {isRecordingDrops ? (
                <span
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    padding: '0.1rem 0.35rem',
                    borderRadius: 10,
                  }}
                >
                  REC
                </span>
              ) : dropCount > 0 ? (
                <span
                  style={{
                    background: 'rgba(248, 113, 113, 0.2)',
                    color: '#f87171',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '0.1rem 0.35rem',
                    borderRadius: 10,
                  }}
                >
                  {dropCount}
                </span>
              ) : null}
            </button>
          </div>

          <div
            className={`status-indicator ${
              isWsConnected ? 'status-online' : 'status-offline'
            }`}
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
          >
            {isWsConnected ? <Wifi size={13} /> : <WifiOff size={13} />}
            <span>{isWsConnected ? 'Live WS' : 'Offline'}</span>
          </div>

          {currentUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.05)', padding: '0.3rem 0.6rem', borderRadius: 20, border: '1px solid var(--border-color)' }}>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '0.15rem 0.4rem',
                  borderRadius: 4,
                  background: roleColors[currentUser.role] || '#888',
                  color: '#fff',
                }}
              >
                {currentUser.role}
              </span>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser.name}
              </span>
              <button
                onClick={onLogout}
                title="Sign Out"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: '0.2rem' }}
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenLogin}
              className="btn btn-primary"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <User size={14} />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
